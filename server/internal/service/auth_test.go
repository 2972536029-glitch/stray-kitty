package service_test

import (
	"errors"
	"path/filepath"
	"testing"

	"stray-kitty/server/internal/domain"
	"stray-kitty/server/internal/platform"
	"stray-kitty/server/internal/repository"
	"stray-kitty/server/internal/service"
)

func authSetup(t *testing.T) (*service.Game, string, string) {
	t.Helper()
	store, err := repository.Open(filepath.Join(t.TempDir(), "save.json"))
	if err != nil {
		t.Fatal(err)
	}
	catalog, err := platform.LoadCatalog()
	if err != nil {
		t.Fatal(err)
	}
	g := service.New(store, catalog)
	playerID, token, err := g.CreateSession()
	if err != nil {
		t.Fatal(err)
	}
	return g, playerID, token
}

func faultCode(t *testing.T, err error) string {
	t.Helper()
	var fault *domain.Fault
	if !errors.As(err, &fault) {
		t.Fatalf("expected domain fault, got %v", err)
	}
	return fault.Code
}

func TestRegisterBindsCurrentProgress(t *testing.T) {
	g, playerID, token := authSetup(t)
	// 推进一点进度,注册后登录应取回同一份。
	if _, err := g.Execute(token, "auth-test-key-0001", domain.CommandRequest{Command: domain.Command{Type: "ADVANCE_STORY"}}); err == nil {
		t.Log("advance accepted or rejected, either way state exists")
	}
	name, err := g.Register(token, "CatLover_01", "hunter2hunter2")
	if err != nil {
		t.Fatal(err)
	}
	if name != "catlover_01" {
		t.Fatalf("username not normalized to lower: %s", name)
	}
	// 登录签发新令牌,指向同一玩家。
	gotID, newToken, err := g.Login("CATLOVER_01", "hunter2hunter2") // 大小写不敏感
	if err != nil {
		t.Fatal(err)
	}
	if gotID != playerID {
		t.Fatalf("login returned different player: %s vs %s", gotID, playerID)
	}
	// 新令牌能读状态(别名会话生效)。
	state, err := g.State(newToken)
	if err != nil {
		t.Fatal(err)
	}
	if state.Revision == 0 && state.Phase != "dialogue" {
		t.Fatalf("unexpected fresh state: %+v", state)
	}
	// 原匿名令牌仍然有效。
	if _, err := g.State(token); err != nil {
		t.Fatalf("original anonymous session must survive registration: %v", err)
	}
}

func TestRegisterRejectsDuplicatesAndBadInput(t *testing.T) {
	g, _, token := authSetup(t)
	if _, err := g.Register(token, "catlover", "hunter2hunter2"); err != nil {
		t.Fatal(err)
	}
	// 同名注册(另一个匿名玩家)被拒。
	_, token2, _ := g.CreateSession()
	if _, err := g.Register(token2, "CatLover", "other-password-1"); err == nil {
		t.Fatal("duplicate username accepted")
	} else if faultCode(t, err) != "USERNAME_TAKEN" {
		t.Fatalf("expected USERNAME_TAKEN, got %s", faultCode(t, err))
	}
	// 格式校验。
	_, err := g.Register(token, "ab", "hunter2hunter2")
	if faultCode(t, err) != "INVALID_ACCOUNT" {
		t.Fatalf("short username: %v", err)
	}
	_, err = g.Register(token, "catlover2", "short")
	if faultCode(t, err) != "INVALID_ACCOUNT" {
		t.Fatalf("short password: %v", err)
	}
	// 无效会话。
	if _, err := g.Register("not-a-real-token-xx", "catlover3", "hunter2hunter2"); err == nil {
		t.Fatal("invalid session accepted")
	}
}

func TestLoginWrongPassword(t *testing.T) {
	g, _, token := authSetup(t)
	if _, err := g.Register(token, "catlover", "hunter2hunter2"); err != nil {
		t.Fatal(err)
	}
	if _, _, err := g.Login("catlover", "wrong-password-1"); err == nil {
		t.Fatal("wrong password accepted")
	} else if faultCode(t, err) != "AUTH_FAILED" {
		t.Fatalf("expected AUTH_FAILED, got %s", faultCode(t, err))
	}
	if _, _, err := g.Login("ghost", "hunter2hunter2"); err == nil {
		t.Fatal("unknown user accepted")
	}
}

func TestAliasSessionsTransactAndPersist(t *testing.T) {
	g, _, token := authSetup(t)
	if _, err := g.Register(token, "catlover", "hunter2hunter2"); err != nil {
		t.Fatal(err)
	}
	_, newToken, err := g.Login("catlover", "hunter2hunter2")
	if err != nil {
		t.Fatal(err)
	}
	// 别名会话执行事务(写路径走主键)。
	s0, _ := g.State(newToken)
	rev := s0.Revision
	_, err = g.Execute(newToken, "alias-txn-key-0001", domain.CommandRequest{ExpectedRevision: &rev, Command: domain.Command{Type: "ADVANCE_STORY", NodeID: "prologue_1"}})
	if err != nil {
		t.Fatal(err)
	}
	// 两个会话看到同一份最新状态。
	s1, _ := g.State(token)
	s2, _ := g.State(newToken)
	if s1.Revision != s2.Revision {
		t.Fatalf("sessions diverged: %d vs %d", s1.Revision, s2.Revision)
	}
}

func TestAccountPersistsAcrossReopen(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "save.json")
	store, _ := repository.Open(path)
	catalog, _ := platform.LoadCatalog()
	g := service.New(store, catalog)
	_, token, _ := g.CreateSession()
	if _, err := g.Register(token, "catlover", "hunter2hunter2"); err != nil {
		t.Fatal(err)
	}
	// 重新打开同一文件(模拟进程重启)。
	store2, err := repository.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	g2 := service.New(store2, catalog)
	playerID, newToken, err := g2.Login("catlover", "hunter2hunter2")
	if err != nil {
		t.Fatal(err)
	}
	if playerID == "" || newToken == "" {
		t.Fatal("empty login result after reopen")
	}
}
