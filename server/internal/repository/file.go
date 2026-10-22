package repository

import (
	"encoding/json"
	"os"
	"path/filepath"
	"stray-kitty/server/internal/domain"
	"sync"
)

type Receipt struct {
	Fingerprint string                 `json:"fingerprint"`
	Response    domain.CommandResponse `json:"response"`
}
type Player struct {
	ID           string             `json:"id"`
	State        domain.GameState   `json:"state"`
	Receipts     map[string]Receipt `json:"receipts"`
	ReceiptOrder []string           `json:"receiptOrder"`
}
type Database struct {
	SchemaVersion int                `json:"schemaVersion"`
	Players       map[string]*Player `json:"players"`
}

// Store 的事务在单进程内串行执行；生产多实例必须替换为数据库事务。
type Store struct {
	mu   sync.Mutex
	path string
	db   Database
}

func Open(path string) (*Store, error) {
	s := &Store{path: path, db: Database{SchemaVersion: 1, Players: map[string]*Player{}}}
	data, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return s, nil
	}
	if err != nil {
		return nil, err
	}
	if err = json.Unmarshal(data, &s.db); err != nil {
		return nil, err
	}
	if s.db.SchemaVersion != 1 || s.db.Players == nil {
		return nil, domain.Fail("UNSUPPORTED_SAVE", "存档结构不兼容", 500)
	}
	return s, nil
}
func (s *Store) persist() error {
	if err := os.MkdirAll(filepath.Dir(s.path), 0700); err != nil {
		return err
	}
	data, err := json.Marshal(s.db)
	if err != nil {
		return err
	}
	f, err := os.CreateTemp(filepath.Dir(s.path), "game-*.tmp")
	if err != nil {
		return err
	}
	name := f.Name()
	defer os.Remove(name)
	if err = f.Chmod(0600); err == nil {
		_, err = f.Write(data)
	}
	if err == nil {
		err = f.Sync()
	}
	closeErr := f.Close()
	if err == nil {
		err = closeErr
	}
	if err != nil {
		return err
	}
	return os.Rename(name, s.path)
}
func clone(p *Player) (*Player, error) {
	data, err := json.Marshal(p)
	if err != nil {
		return nil, err
	}
	var out Player
	err = json.Unmarshal(data, &out)
	return &out, err
}
func (s *Store) Create(hash string, p *Player) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.db.Players[hash]; ok {
		return domain.Fail("SESSION_CONFLICT", "会话冲突", 409)
	}
	s.db.Players[hash] = p
	if err := s.persist(); err != nil {
		delete(s.db.Players, hash)
		return err
	}
	return nil
}
func (s *Store) Get(hash string) (*Player, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	p, ok := s.db.Players[hash]
	if !ok {
		return nil, domain.Fail("UNAUTHORIZED", "会话不存在，请开始新的旅程", 401)
	}
	return clone(p)
}
func (s *Store) Transact(hash string, fn func(*Player) (domain.CommandResponse, error)) (domain.CommandResponse, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	old, ok := s.db.Players[hash]
	if !ok {
		return domain.CommandResponse{}, domain.Fail("UNAUTHORIZED", "会话不存在", 401)
	}
	p, err := clone(old)
	if err != nil {
		return domain.CommandResponse{}, err
	}
	response, err := fn(p)
	if err != nil {
		return domain.CommandResponse{}, err
	}
	if response.Replayed {
		return response, nil
	}
	s.db.Players[hash] = p
	if err = s.persist(); err != nil {
		s.db.Players[hash] = old
		return domain.CommandResponse{}, err
	}
	return response, nil
}
