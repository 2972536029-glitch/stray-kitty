// ledger.go:支付服务的独立流水账本——与游戏存档分离,由 payment-service 独占持有。
// 文件结构 {players:{playerId:[txn...]}},互斥锁串行化 + 临时文件原子写,与 repository 同风格。
package payment

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
	"time"

	"stray-kitty/server/internal/domain"
	"stray-kitty/server/internal/obs"
)

// Ledger 支付权威账本:由支付服务独占写入,游戏侧只经它查询。
type Ledger interface {
	// Record 追加一笔流水(权威账本,不裁剪)。
	Record(txn domain.Txn) error
	// RecordIfNew 幂等落账:同 ID 流水只落一次(Xsolla webhook 会重试),返回本次是否新落。
	RecordIfNew(txn domain.Txn) (bool, error)
	// History 玩家充值流水,最新在前。
	History(playerID string) ([]domain.Txn, error)
}

type fileLedger struct {
	mu   sync.Mutex
	path string
	data ledgerData
}

type ledgerData struct {
	Players map[string][]domain.Txn `json:"players"`
}

// OpenLedger 打开(或初始化)位于 path 的账本文件。
func OpenLedger(path string) (Ledger, error) {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return nil, err
	}
	l := &fileLedger{path: path, data: ledgerData{Players: map[string][]domain.Txn{}}}
	raw, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return l, l.save()
		}
		return nil, err
	}
	if err := json.Unmarshal(raw, &l.data); err != nil {
		return nil, err
	}
	if l.data.Players == nil {
		l.data.Players = map[string][]domain.Txn{}
	}
	return l, nil
}

func (l *fileLedger) Record(txn domain.Txn) error {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.data.Players[txn.PlayerID] = append(l.data.Players[txn.PlayerID], txn)
	return l.save()
}

func (l *fileLedger) RecordIfNew(txn domain.Txn) (bool, error) {
	l.mu.Lock()
	defer l.mu.Unlock()
	for _, existing := range l.data.Players[txn.PlayerID] {
		if existing.ID == txn.ID {
			return false, nil
		}
	}
	l.data.Players[txn.PlayerID] = append(l.data.Players[txn.PlayerID], txn)
	return true, l.save()
}

func (l *fileLedger) History(playerID string) ([]domain.Txn, error) {
	l.mu.Lock()
	defer l.mu.Unlock()
	txns := l.data.Players[playerID]
	out := make([]domain.Txn, len(txns))
	for i, t := range txns {
		out[len(txns)-1-i] = t // 最新在前
	}
	return out, nil
}

// save 原子写:先写临时文件再替换,进程中断不会留下半截账本。
func (l *fileLedger) save() error {
	start := time.Now()
	raw, err := json.MarshalIndent(l.data, "", "  ")
	if err != nil {
		return err
	}
	tmp := l.path + ".tmp"
	if err := os.WriteFile(tmp, raw, 0o644); err != nil {
		return err
	}
	if err := os.Rename(tmp, l.path); err != nil {
		return err
	}
	obs.Histogram("kitty.payment.ledger_save_duration_ms", float64(time.Since(start).Microseconds())/1000)
	return nil
}
