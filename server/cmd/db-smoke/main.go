// db-smoke verifies a synthetic account across a storage migration. Prepare and
// verify write PRIVATE state (credentials included) to stdout for a file/Secret;
// never send that output to deployment logs. Errors and recheck/audit are safe.
package main

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"reflect"
	"strings"
	"time"

	"stray-kitty/server/internal/domain"
	"stray-kitty/server/internal/repository"
)

type config struct {
	Phase, BaseURL, PaymentURL, StateFile, GameFile, PaymentsFile, ExpectedStorage string
	Summary                                                                        bool
	InternalToken                                                                  string
}
type saved struct {
	Version    int                    `json:"version"`
	Username   string                 `json:"username"`
	Password   string                 `json:"password"`
	PlayerID   string                 `json:"playerId"`
	Token      string                 `json:"token"`
	LoginToken string                 `json:"loginToken"`
	State      domain.GameState       `json:"state"`
	Key        string                 `json:"key"`
	Command    domain.CommandRequest  `json:"command"`
	Receipt    domain.CommandResponse `json:"receipt"`
	Txn        *domain.Txn            `json:"txn,omitempty"`
	Pack       *domain.RechargePack   `json:"pack,omitempty"`
}
type client struct {
	base     string
	http     *http.Client
	internal string
}

func main() {
	c := config{}
	flag.StringVar(&c.Phase, "phase", "", "prepare, verify, recheck or audit")
	flag.StringVar(&c.BaseURL, "base-url", "http://127.0.0.1:8080", "game API base URL")
	flag.StringVar(&c.PaymentURL, "payment-url", os.Getenv("PAYMENT_URL"), "independent payment service URL")
	flag.StringVar(&c.StateFile, "state-file", "", "private saved smoke state")
	flag.StringVar(&c.GameFile, "game-file", "", "stopped game JSON snapshot for audit")
	flag.StringVar(&c.PaymentsFile, "payments-file", "", "stopped payment JSON snapshot for audit")
	flag.StringVar(&c.ExpectedStorage, "expect-storage", "", "expected backend (default file before migration, mysql afterwards)")
	flag.BoolVar(&c.Summary, "summary", false, "sanitized recheck summary (always enabled for recheck)")
	flag.Parse()
	c.InternalToken = os.Getenv("INTERNAL_TOKEN")
	if c.ExpectedStorage == "" {
		c.ExpectedStorage = "mysql"
		if c.Phase == "prepare" {
			c.ExpectedStorage = "single-process-file"
		}
	}
	if err := run(c, os.Stdout); err != nil {
		fmt.Fprintln(os.Stderr, "db-smoke:", err)
		os.Exit(1)
	}
}
func randomHex(n int) (string, error) {
	b := make([]byte, n)
	_, err := rand.Read(b)
	return hex.EncodeToString(b), err
}
func newClient(base, token string) (*client, error) {
	u, err := url.Parse(base)
	if err != nil || u.Host == "" || (u.Scheme != "http" && u.Scheme != "https") || u.User != nil || u.RawQuery != "" || u.Fragment != "" {
		return nil, errors.New("invalid API base URL")
	}
	return &client{strings.TrimRight(base, "/"), &http.Client{Timeout: 15 * time.Second}, token}, nil
}
func (c *client) request(method, path, token, key string, body, out any) error {
	var raw []byte
	var err error
	if body != nil {
		raw, err = json.Marshal(body)
		if err != nil {
			return errors.New("cannot encode smoke request")
		}
	}
	req, err := http.NewRequestWithContext(context.Background(), method, c.base+path, bytes.NewReader(raw))
	if err != nil {
		return errors.New("cannot create smoke request")
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	if key != "" {
		req.Header.Set("Idempotency-Key", key)
	}
	if path == "/internal/credit" {
		req.Header.Set("X-Internal-Token", c.internal)
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("%s %s unavailable", method, strings.Split(path, "?")[0])
	}
	defer resp.Body.Close()
	raw, err = io.ReadAll(io.LimitReader(resp.Body, 8<<20))
	if err != nil {
		return errors.New("cannot read smoke response")
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("%s %s returned HTTP %d", method, strings.Split(path, "?")[0], resp.StatusCode)
	}
	if out != nil && json.Unmarshal(raw, out) != nil {
		return fmt.Errorf("%s response is not valid JSON", strings.Split(path, "?")[0])
	}
	return nil
}
func (c *client) ready(storage string) error {
	var r struct{ Status, Storage string }
	if err := c.request("GET", "/readyz", "", "", nil, &r); err != nil {
		return err
	}
	if r.Status != "ready" || r.Storage != storage {
		return errors.New("unexpected readiness backend")
	}
	return nil
}
func (c *client) state(token string) (domain.GameState, error) {
	var state domain.GameState
	err := c.request("GET", "/api/v1/state", token, "", nil, &state)
	return state, err
}
func equalState(got, want domain.GameState) error {
	return equalStateAt(got, want, time.Now())
}

func equalStateAt(got, want domain.GameState, now time.Time) error {
	// GET /state derives the current Beijing lottery day and clears only its
	// daily claims when the saved day expires. A maintenance window can cross
	// midnight without changing any persisted progress. Normalize that exact
	// forward rollover, while still comparing every other field and same-day
	// claims. Copy the pointed-to value so the private expected state stays intact.
	if got.Lottery != nil && want.Lottery != nil && got.Lottery.Day != want.Lottery.Day {
		day := now.In(time.FixedZone("Asia/Shanghai", 8*60*60)).Format("2006-01-02")
		previous, err := time.Parse("2006-01-02", want.Lottery.Day)
		if err == nil && previous.Format("2006-01-02") == want.Lottery.Day &&
			want.Lottery.Day < day && got.Lottery.Day == day && len(got.Lottery.DailyClaims) == 0 {
			expectedLottery := *want.Lottery
			expectedLottery.Day = day
			expectedLottery.DailyClaims = []string{}
			want.Lottery = &expectedLottery
		}
	}
	if !reflect.DeepEqual(got, want) {
		return errors.New("persisted synthetic state differs")
	}
	return nil
}
func requireQA(state domain.GameState) error {
	if state.QACheckpointID != "prologue.story" {
		return errors.New("synthetic player is not in the expected QA checkpoint")
	}
	return nil
}
func (c *client) login(s *saved) error {
	var r struct{ PlayerID, Token string }
	if err := c.request("POST", "/api/auth/login", "", "", map[string]string{"username": s.Username, "password": s.Password}, &r); err != nil {
		return err
	}
	if r.PlayerID != s.PlayerID || r.Token == "" {
		return errors.New("login resolved a different player")
	}
	s.LoginToken = r.Token
	return nil
}
func (c *client) advance(s *saved) error {
	if s.State.Phase != "dialogue" || s.State.StoryNodeID == "" {
		return errors.New("synthetic state is not a story node")
	}
	key, err := randomHex(16)
	if err != nil {
		return errors.New("cannot generate idempotency key")
	}
	revision := s.State.Revision
	command := domain.CommandRequest{ExpectedRevision: &revision, Command: domain.Command{Type: "ADVANCE_STORY", NodeID: s.State.StoryNodeID}}
	var response domain.CommandResponse
	if err = c.request("POST", "/api/v1/commands", s.Token, key, command, &response); err != nil {
		return err
	}
	if response.Replayed || response.State.Revision != revision+1 {
		return errors.New("new command did not advance exactly once")
	}
	s.Key, s.Command, s.Receipt, s.State = key, command, response, response.State
	return c.replay(s)
}
func (c *client) replay(s *saved) error {
	var r domain.CommandResponse
	if err := c.request("POST", "/api/v1/commands", s.Token, s.Key, s.Command, &r); err != nil {
		return err
	}
	if !r.Replayed || !reflect.DeepEqual(r.State, s.Receipt.State) {
		return errors.New("command receipt replay differs")
	}
	current, err := c.state(s.Token)
	if err != nil {
		return err
	}
	return equalState(current, s.State)
}
func readSaved(path string) (*saved, error) {
	var raw []byte
	var err error
	if path == "-" {
		raw, err = io.ReadAll(io.LimitReader(os.Stdin, 8<<20))
	} else {
		raw, err = os.ReadFile(path)
	}
	if err != nil {
		return nil, errors.New("cannot read private smoke state")
	}
	var s saved
	if json.Unmarshal(raw, &s) != nil || s.Version != 1 || s.Token == "" || s.PlayerID == "" || !strings.HasPrefix(s.Username, "dbqa_") {
		return nil, errors.New("invalid private smoke state")
	}
	return &s, nil
}
func run(cfg config, out io.Writer) error {
	if cfg.Phase == "audit" {
		return audit(cfg, out)
	}
	c, err := newClient(cfg.BaseURL, cfg.InternalToken)
	if err != nil {
		return err
	}
	if err = c.ready(cfg.ExpectedStorage); err != nil {
		return err
	}
	var s *saved
	switch cfg.Phase {
	case "prepare":
		if cfg.Summary {
			return errors.New("prepare requires private JSON output capture")
		}
		suffix, err := randomHex(8)
		if err != nil {
			return errors.New("cannot generate account identity")
		}
		password, err := randomHex(24)
		if err != nil {
			return errors.New("cannot generate account password")
		}
		s = &saved{Version: 1, Username: "dbqa_" + suffix, Password: password}
		var session struct{ PlayerID, Token string }
		if err = c.request("POST", "/api/v1/sessions", "", "", nil, &session); err != nil {
			return err
		}
		s.PlayerID, s.Token = session.PlayerID, session.Token
		var qa struct{ Enabled bool }
		if err = c.request("GET", "/api/v1/qa", s.Token, "", nil, &qa); err != nil {
			return err
		}
		if !qa.Enabled {
			return errors.New("QA tools must be enabled for isolated migration smoke")
		}
		initial, err := c.state(s.Token)
		if err != nil {
			return err
		}
		revision := initial.Revision
		key, err := randomHex(16)
		if err != nil {
			return errors.New("cannot generate checkpoint key")
		}
		var checkpoint domain.CommandResponse
		if err = c.request("POST", "/api/v1/commands", s.Token, key, domain.CommandRequest{ExpectedRevision: &revision, Command: domain.Command{Type: "QA_CHECKPOINT", CheckpointID: "prologue.story"}}, &checkpoint); err != nil {
			return err
		}
		s.State = checkpoint.State
		if err = requireQA(s.State); err != nil {
			return err
		}
		if err = c.request("POST", "/api/auth/register", s.Token, "", map[string]string{"username": s.Username, "password": s.Password}, nil); err != nil {
			return err
		}
		if err = c.login(s); err != nil {
			return err
		}
		if err = c.advance(s); err != nil {
			return err
		}
	case "verify", "recheck":
		s, err = readSaved(cfg.StateFile)
		if err != nil {
			return err
		}
		if err = requireQA(s.State); err != nil {
			return err
		}
		for _, token := range []string{s.Token, s.LoginToken} {
			if token == "" {
				return errors.New("missing migrated login session")
			}
			got, err := c.state(token)
			if err != nil {
				return err
			}
			if err = equalState(got, s.State); err != nil {
				return err
			}
		}
		if cfg.Phase == "recheck" {
			if s.Txn == nil || s.Pack == nil {
				return errors.New("payment verification has not completed")
			}
			if err = verifyPaymentHistory(c, cfg, s); err != nil {
				return err
			}
			return json.NewEncoder(out).Encode(map[string]any{"status": "passed", "storage": cfg.ExpectedStorage, "oldSessionsValid": true, "savedStatePreserved": true, "paymentHistoryPreserved": true, "revision": s.State.Revision})
		}
		if cfg.Summary {
			return errors.New("verify requires private JSON output capture")
		}
		if cfg.InternalToken == "" {
			return errors.New("INTERNAL_TOKEN is required for credit replay")
		}
		if err = c.login(s); err != nil {
			return err
		}
		if err = c.replay(s); err != nil {
			return err
		}
		if err = c.advance(s); err != nil {
			return err
		}
		if err = mockPayment(c, cfg, s); err != nil {
			return err
		}
	default:
		return errors.New("phase must be prepare, verify, recheck or audit")
	}
	return json.NewEncoder(out).Encode(s)
}
func paymentClient(cfg config) (*client, error) {
	if cfg.PaymentURL == "" {
		return nil, errors.New("independent payment service URL is required")
	}
	p, err := newClient(cfg.PaymentURL, "")
	if err != nil {
		return nil, err
	}
	if err = p.ready("mysql"); err != nil {
		return nil, err
	}
	var provider struct {
		Provider string
		Sandbox  bool
	}
	if err = p.request("GET", "/internal/provider", "", "", nil, &provider); err != nil {
		return nil, err
	}
	if provider.Provider != "mock" && (provider.Provider != "xsolla" || !provider.Sandbox) {
		return nil, errors.New("payment provider is not mock or sandbox")
	}
	return p, nil
}
func mockPayment(c *client, cfg config, s *saved) error {
	p, err := paymentClient(cfg)
	if err != nil {
		return err
	}
	var catalog struct {
		RechargePacks []domain.RechargePack `json:"rechargePacks"`
	}
	if err = c.request("GET", "/api/v1/content", "", "", nil, &catalog); err != nil {
		return err
	}
	if len(catalog.RechargePacks) == 0 {
		return errors.New("no recharge packs available")
	}
	pack := catalog.RechargePacks[0]
	// This route always invokes the local deterministic Gateway.Decide, including
	// when paymentd additionally serves Xsolla. It never calls the merchant API.
	var response struct {
		TxnID, Status            string
		TunaBalance, TunaGranted int
	}
	if err = c.request("POST", "/api/payment/charge", s.Token, "", map[string]string{"playerId": s.PlayerID, "packId": pack.ID, "cardNumber": "4242424242424242"}, &response); err != nil {
		return err
	}
	if response.Status != "confirmed" || response.TunaBalance != s.State.Currencies["tuna"]+pack.TunaGranted {
		return errors.New("mock payment did not credit the exact catalog amount")
	}
	var history struct{ Txns []domain.Txn }
	if err = p.request("GET", "/internal/history?playerId="+url.QueryEscape(s.PlayerID), "", "", nil, &history); err != nil {
		return err
	}
	var found *domain.Txn
	count := 0
	for _, txn := range history.Txns {
		if txn.ID == response.TxnID {
			copy := txn
			found = &copy
			count++
		}
	}
	if count != 1 || found == nil || found.CardSuffix != "4242" || strings.HasPrefix(found.ID, "xs-") {
		return errors.New("deterministic mock ledger entry was not found exactly once")
	}
	s.Txn, s.Pack = found, &pack
	current, err := c.state(s.Token)
	if err != nil {
		return err
	}
	if current.Currencies["tuna"] != response.TunaBalance {
		return errors.New("game balance disagrees with payment response")
	}
	s.State = current
	var credit struct{ TunaBalance int }
	for i := 0; i < 2; i++ {
		if err = c.request("POST", "/internal/credit", "", "", map[string]any{"playerId": s.PlayerID, "txn": s.Txn, "pack": s.Pack}, &credit); err != nil {
			return err
		}
		if credit.TunaBalance != s.State.Currencies["tuna"] {
			return errors.New("replayed payment changed balance")
		}
	}
	current, err = c.state(s.Token)
	if err != nil {
		return err
	}
	if err = equalState(current, s.State); err != nil {
		return err
	}
	return verifyPaymentHistory(c, cfg, s)
}
func verifyPaymentHistory(c *client, cfg config, s *saved) error {
	p, err := paymentClient(cfg)
	if err != nil {
		return err
	}
	for _, target := range []struct {
		c    *client
		path string
	}{{c, "/api/payment/history"}, {p, "/internal/history"}} {
		var history struct{ Txns []domain.Txn }
		if err = target.c.request("GET", target.path+"?playerId="+url.QueryEscape(s.PlayerID), s.Token, "", nil, &history); err != nil {
			return err
		}
		count := 0
		for _, txn := range history.Txns {
			if txn.ID == s.Txn.ID {
				count++
				if txn.PlayerID != s.PlayerID || txn.Status != "confirmed" || txn.PackID != s.Pack.ID {
					return errors.New("persisted payment history differs")
				}
			}
		}
		if count != 1 {
			return errors.New("payment history is missing or duplicated")
		}
	}
	return nil
}
func audit(cfg config, out io.Writer) error {
	gameRaw, err := os.ReadFile(cfg.GameFile)
	if err != nil {
		return errors.New("cannot read stopped game snapshot")
	}
	payRaw, err := os.ReadFile(cfg.PaymentsFile)
	if err != nil {
		return errors.New("cannot read stopped payment snapshot")
	}
	var game repository.Database
	var ledger struct {
		Players map[string][]domain.Txn `json:"players"`
	}
	if json.Unmarshal(gameRaw, &game) != nil || game.SchemaVersion != 1 || game.Players == nil || json.Unmarshal(payRaw, &ledger) != nil || ledger.Players == nil {
		return errors.New("invalid stopped snapshots")
	}
	players := map[string]*repository.Player{}
	for _, p := range game.Players {
		if p == nil || players[p.ID] != nil {
			return errors.New("invalid player identities in snapshot")
		}
		players[p.ID] = p
	}
	counts := map[string]int{"players": len(players), "accounts": len(game.Accounts), "confirmedTransactions": 0, "xsollaTransactions": 0, "knownApplied": 0, "ambiguousXsolla": 0, "ambiguousMock": 0, "missingPlayers": 0, "fullDisplayHistories": 0}
	for _, p := range players {
		if len(p.State.Txns) >= domain.MaxTxns {
			counts["fullDisplayHistories"]++
		}
	}
	for id, txns := range ledger.Players {
		for _, txn := range txns {
			if txn.Status != "confirmed" {
				continue
			}
			counts["confirmedTransactions"]++
			xsolla := strings.HasPrefix(txn.ID, "xs-") || strings.Contains(txn.Reason, "Xsolla")
			if xsolla {
				counts["xsollaTransactions"]++
			}
			p := players[id]
			if p == nil {
				counts["missingPlayers"]++
				continue
			}
			known := p.AppliedPayments[txn.ID]
			for _, existing := range p.State.Txns {
				if existing.ID == txn.ID {
					known = true
					break
				}
			}
			if known {
				counts["knownApplied"]++
			} else if xsolla {
				counts["ambiguousXsolla"]++
			} else {
				counts["ambiguousMock"]++
			}
		}
	}
	passed := counts["ambiguousXsolla"] == 0 && counts["missingPlayers"] == 0
	if err = json.NewEncoder(out).Encode(map[string]any{"status": map[bool]string{true: "passed", false: "blocked"}[passed], "counts": counts, "providerPendingCallbacksVerified": false}); err != nil {
		return err
	}
	if !passed {
		return errors.New("unresolved Xsolla credits or missing players require reconciliation before activation")
	}
	return nil
}
