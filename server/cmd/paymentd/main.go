// paymentd:独立部署的支付服务。持有权威流水账本(payments.json),
// 仅供游戏服务经集群内部调用(POST /internal/charge);金枪鱼入账由游戏侧完成,
// 本服务不读写游戏存档——两边数据所有权彻底分离。
// 配置 Xsolla 凭据(XSOLLA_MERCHANT_ID/PROJECT_ID/API_KEY)后叠加沙盒直付:
// POST /internal/session 创建跳转会话,POST /webhook/xsolla 接收异步通知并回调游戏入账;
// 未配置时维持 mock(4242/0000 演示卡)形态,行为与历史版本完全一致。
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
	xsollaCfg := payment.XsollaConfig{
		MerchantID:    env("XSOLLA_MERCHANT_ID", ""),
		ProjectID:     env("XSOLLA_PROJECT_ID", ""),
		APIKey:        env("XSOLLA_API_KEY", ""),
		WebhookSecret: env("XSOLLA_WEBHOOK_SECRET", ""),
		Sandbox:       env("XSOLLA_SANDBOX", "true") != "false",
		APIBaseURL:    env("XSOLLA_API_BASE_URL", ""),
		PaystationURL: env("XSOLLA_PAYSTATION_BASE_URL", ""),
		ReturnURL:     env("XSOLLA_RETURN_URL", ""),
	}
	// 团队阶段铁律:所有环境只允许沙盒支付。XSOLLA_SANDBOX=false 直接拒绝启动,
	// 把"误配真实支付"从运行时事故变成部署失败——签署正式协议前不得移除此闸。
	if !xsollaCfg.Sandbox {
		slog.Error("XSOLLA_SANDBOX=false is forbidden in this project stage; sandbox-only policy is in effect")
		os.Exit(1)
	}
	var handler http.Handler
	if xsollaCfg.Enabled() {
		client := payment.NewXsollaClient(xsollaCfg)
		var credit payment.CreditCaller
		if gameURL := env("GAME_INTERNAL_URL", ""); gameURL != "" {
			credit = payment.NewGameCreditCaller(gameURL, env("INTERNAL_TOKEN", ""))
		}
		handler = payment.NewXsollaServiceHTTP(gateway, ledger, client, credit)
		slog.Info("xsolla provider enabled", "sandbox", xsollaCfg.Sandbox, "credit_callback", credit != nil, "webhook_configured", xsollaCfg.WebhookSecret != "")
	} else {
		handler = payment.NewServiceHTTP(gateway, ledger)
		slog.Info("mock payment provider enabled (set XSOLLA_MERCHANT_ID/PROJECT_ID/API_KEY for xsolla sandbox)")
	}
	server := &http.Server{
		Addr:              env("PAYMENT_ADDR", "127.0.0.1:8082"),
		Handler:           handler,
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
