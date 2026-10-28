package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"stray-kitty/server/internal/advisor"
	"stray-kitty/server/internal/integrations/payment"
	"stray-kitty/server/internal/platform"
	"stray-kitty/server/internal/repository"
	"stray-kitty/server/internal/service"
	"stray-kitty/server/internal/transport"
	"syscall"
	"time"
)

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, nil)))
	store, err := repository.Open(env("GAME_DATA_FILE", "../data/game.json"))
	if err != nil {
		slog.Error("cannot open progress storage", "error", err.Error())
		os.Exit(1)
	}
	catalog, err := platform.LoadCatalog()
	if err != nil {
		slog.Error("invalid catalog")
		os.Exit(1)
	}
	game := service.New(store, catalog)
	game.QAVictoryEnabled = os.Getenv("GAME_QA_ENABLED") == "true"
	game.Advisor = advisor.NewFromEnv()
	webDir := env("GAME_WEB_DIR", "../web/dist")
	if webDir == "disabled" { // 拆分部署:静态文件由独立前端容器托管,游戏不挂文件服务
		webDir = ""
	}
	// PAYMENT_URL 指向独立支付服务(拆分部署)时走远程网关;未设置则进程内模拟支付(本地/CI 形态)。
	var pay transport.PaymentGateway = payment.New(store, catalog)
	if url := os.Getenv("PAYMENT_URL"); url != "" {
		slog.Info("payment service enabled", "url", url)
		pay = transport.NewRemotePayment(url, game)
	}
	server := &http.Server{Addr: env("GAME_ADDR", "127.0.0.1:8017"), Handler: transport.New(game, pay, webDir), ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 10 * time.Second, WriteTimeout: 15 * time.Second, IdleTimeout: 60 * time.Second}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	go func() {
		<-ctx.Done()
		shutdown, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		server.Shutdown(shutdown)
	}()
	slog.Info("stray-kitty ready", "address", server.Addr, "storage", "single-process-file")
	if err = server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		slog.Error("server stopped", "error", err.Error())
		os.Exit(1)
	}
}
