// payment_remote.go:拆分部署形态下的支付客户端。充值判定与权威账本在独立的
// payment 服务里;本客户端调它的内部接口,成功后在游戏侧入账并落展示流水。
package transport

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"stray-kitty/server/internal/domain"
	"stray-kitty/server/internal/integrations/payment"
	"stray-kitty/server/internal/service"
)

// RemotePayment 经 HTTP 调用独立支付服务,并把入账落回游戏存档。
type RemotePayment struct {
	base   string
	game   *service.Game
	client *http.Client
}

// NewRemotePayment baseURL 形如 http://stray-kitty-payment:8082(集群内 Service DNS)。
func NewRemotePayment(baseURL string, game *service.Game) *RemotePayment {
	return &RemotePayment{
		base:   baseURL,
		game:   game,
		client: &http.Client{Timeout: 10 * time.Second},
	}
}

// chargeResponse 支付服务 /internal/charge 的成功响应。
type chargeResponse struct {
	Txn  domain.Txn          `json:"txn"`
	Pack domain.RechargePack `json:"pack"`
}

func (p *RemotePayment) Charge(playerID, packID, cardNumber string) (payment.ChargeResult, error) {
	body, err := json.Marshal(map[string]string{"playerId": playerID, "packId": packID, "cardNumber": cardNumber})
	if err != nil {
		return payment.ChargeResult{}, err
	}
	req, err := http.NewRequest(http.MethodPost, p.base+"/internal/charge", bytes.NewReader(body))
	if err != nil {
		return payment.ChargeResult{}, err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := p.client.Do(req)
	if err != nil {
		return payment.ChargeResult{}, domain.Fail("PAYMENT_UNAVAILABLE", "支付服务暂时联系不上，请稍后再试", 503)
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode != http.StatusOK {
		var errBody struct {
			Error struct {
				Code    string `json:"code"`
				Message string `json:"message"`
			} `json:"error"`
		}
		if json.Unmarshal(raw, &errBody) == nil && errBody.Error.Code != "" {
			return payment.ChargeResult{}, domain.Fail(errBody.Error.Code, errBody.Error.Message, resp.StatusCode)
		}
		return payment.ChargeResult{}, domain.Fail("PAYMENT_UNAVAILABLE", fmt.Sprintf("支付服务返回 %d", resp.StatusCode), 502)
	}
	var out chargeResponse
	if err := json.Unmarshal(raw, &out); err != nil {
		return payment.ChargeResult{}, domain.Fail("PAYMENT_UNAVAILABLE", "支付服务响应格式异常", 502)
	}
	// 支付侧已记账;这里在游戏事务里入账并落展示副本。
	balance, err := p.game.ApplyCharge(playerID, out.Txn, out.Pack)
	if err != nil {
		return payment.ChargeResult{}, err
	}
	return payment.ChargeResult{Txn: out.Txn, Pack: out.Pack, TunaBalance: balance}, nil
}

// History 展示流水读游戏存档(充值+消费的展示副本都在这里);权威充值账本在支付服务。
func (p *RemotePayment) History(playerID string) ([]domain.Txn, error) {
	player, err := p.game.Store.GetByPlayerID(playerID)
	if err != nil {
		return nil, err
	}
	out := make([]domain.Txn, len(player.State.Txns))
	for i, t := range player.State.Txns {
		if t.PlayerID == "" {
			t.PlayerID = playerID
		}
		out[len(player.State.Txns)-1-i] = t
	}
	return out, nil
}

func (p *RemotePayment) HealingMessage() string { return payment.PickHealingMessage() }

// 编译期确认两种形态都满足网关接口。
var _ PaymentGateway = (*RemotePayment)(nil)
var _ PaymentGateway = (*payment.Gateway)(nil)
