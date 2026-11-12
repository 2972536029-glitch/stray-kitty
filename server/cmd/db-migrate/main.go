// db-migrate imports a legacy JSON snapshot into an empty MySQL store.
// Stop all writers and retain a backup before running; the source is never modified.
package main

import (
	"flag"
	"fmt"
	"os"

	"stray-kitty/server/internal/integrations/payment"
	"stray-kitty/server/internal/repository"
)

func run(source, file string) error {
	if file == "" {
		return fmt.Errorf("-file is required; stop writers and back up the source first")
	}
	// Validate the source path before connecting or initializing a database.
	info, err := os.Stat(file)
	if err != nil {
		return fmt.Errorf("read migration source: %w", err)
	}
	if !info.Mode().IsRegular() {
		return fmt.Errorf("migration source must be a regular file")
	}
	switch source {
	case "game":
		dsn := os.Getenv("GAME_MYSQL_DSN")
		if dsn == "" {
			return fmt.Errorf("GAME_MYSQL_DSN is required")
		}
		store, err := repository.OpenMySQL(dsn)
		if err != nil {
			return err
		}
		defer store.Close()
		return store.ImportJSON(file)
	case "payments":
		dsn := os.Getenv("PAYMENT_MYSQL_DSN")
		if dsn == "" {
			return fmt.Errorf("PAYMENT_MYSQL_DSN is required")
		}
		ledger, err := payment.OpenMySQLLedger(dsn)
		if err != nil {
			return err
		}
		importer, ok := ledger.(interface {
			ImportJSON(string) error
			Close() error
		})
		if !ok {
			return fmt.Errorf("payment store does not support migration")
		}
		defer importer.Close()
		return importer.ImportJSON(file)
	default:
		return fmt.Errorf("-source must be game or payments")
	}
}

func main() {
	source := flag.String("source", "", "legacy source: game or payments")
	file := flag.String("file", "", "path to a stopped-writer JSON snapshot")
	flag.Parse()
	if err := run(*source, *file); err != nil {
		fmt.Fprintln(os.Stderr, "migration failed:", err)
		os.Exit(1)
	}
	fmt.Printf("%s import committed; source file preserved\n", *source)
}
