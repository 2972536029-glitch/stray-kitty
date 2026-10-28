// paymentd:独立部署的模拟支付服务。持有权威流水账本(payments.json),
// 仅供游戏服务经集群内部调用(POST /internal/charge);金枪鱼入账由游戏侧完成,
// 本服务不读写游戏存档——两边数据所有权彻底分离。
package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"stray-kitty/server/internal/integrations/payment"
	"stray-kitty/server/internal/platform"
)

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, nil)))
	catalog, err := platform.LoadCatalog()
	if err != nil {
		slog.Error("invalid catalog")
		os.Exit(1)
	}
	ledger, err := payment.OpenLedger(env("PAYMENT_DATA_FILE", "../data/payments.json"))
	if err != nil {
		slog.Error("cannot open payment ledger", "error", err.Error())
		os.Exit(1)
	}
	gateway := payment.NewDecider(catalog)
	server := &http.Server{
		Addr:              env("PAYMENT_ADDR", "127.0.0.1:8082"),
		Handler:           payment.NewServiceHTTP(gateway, ledger),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      15 * time.Second,
		IdleTimeout:       60 * time.Second,
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	go func() {
		<-ctx.Done()
		shutdown, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		server.Shutdown(shutdown)
	}()
	slog.Info("payment service ready", "address", server.Addr, "storage", "payment-ledger")
	if err = server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		slog.Error("payment service stopped", "error", err.Error())
		os.Exit(1)
	}
}
