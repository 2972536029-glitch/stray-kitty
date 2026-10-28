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
	game.Advisor = advisor.NewFromEnv()
	server := &http.Server{Addr: env("GAME_ADDR", "127.0.0.1:8017"), Handler: transport.New(game, payment.New(store, catalog), env("GAME_WEB_DIR", "../web/dist")), ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 10 * time.Second, WriteTimeout: 15 * time.Second, IdleTimeout: 60 * time.Second}
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
