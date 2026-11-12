// Package migrations contains the schema shipped with the server binary.
package migrations

import "embed"

// Files are applied in filename order. A migration must be safe to retry after
// partial DDL completion because MySQL DDL commits implicitly.
//
//go:embed *.sql
var Files embed.FS
