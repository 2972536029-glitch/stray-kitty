package repository

import (
	"encoding/json"
	"os"
	"path/filepath"
	"stray-kitty/server/internal/domain"
	"sync"
	"time"
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
	// SessionAliases 登录会话的 token 哈希别名:同一存档可被匿名主会话与多个登录会话访问。
	SessionAliases []string `json:"sessionAliases,omitempty"`
}

// Account 账号凭证:用户名(小写)指向其绑定的玩家存档。密码以 PBKDF2 加盐哈希存储。
type Account struct {
	Username     string    `json:"username"`
	PlayerID     string    `json:"playerId"`
	PasswordHash string    `json:"passwordHash"`
	PasswordSalt string    `json:"passwordSalt"`
	CreatedAt    time.Time `json:"createdAt"`
}

type Database struct {
	SchemaVersion int                `json:"schemaVersion"`
	Players       map[string]*Player `json:"players"`
	// Accounts 可选字段:旧档没有时按空表处理,写入时惰性初始化。
	Accounts map[string]*Account `json:"accounts,omitempty"`
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
	if s.db.Accounts == nil {
		s.db.Accounts = map[string]*Account{}
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

// lookupSession 解析会话哈希:先精确命中主键,再扫各存档的登录别名。
func (s *Store) lookupSession(hash string) (string, *Player) {
	if p, ok := s.db.Players[hash]; ok {
		return hash, p
	}
	for key, p := range s.db.Players {
		for _, alias := range p.SessionAliases {
			if alias == hash {
				return key, p
			}
		}
	}
	return "", nil
}
func (s *Store) Get(hash string) (*Player, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	_, p := s.lookupSession(hash)
	if p == nil {
		return nil, domain.Fail("UNAUTHORIZED", "会话不存在，请开始新的旅程", 401)
	}
	return clone(p)
}

// findByID 按玩家 ID 定位存档;返回其在 Players 表里的键(token 哈希)以便写回。
func (s *Store) findByID(playerID string) (string, *Player) {
	for hash, p := range s.db.Players {
		if p.ID == playerID {
			return hash, p
		}
	}
	return "", nil
}
func (s *Store) GetByPlayerID(playerID string) (*Player, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	_, p := s.findByID(playerID)
	if p == nil {
		return nil, domain.Fail("PLAYER_NOT_FOUND", "玩家不存在，请先开始新的旅程", 404)
	}
	return clone(p)
}

// TransactByPlayer 以玩家 ID 为准的原子变更(支付入账走这里,与命令事务同一把锁)。
func (s *Store) TransactByPlayer(playerID string, fn func(*Player) error) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	hash, old := s.findByID(playerID)
	if old == nil {
		return domain.Fail("PLAYER_NOT_FOUND", "玩家不存在，请先开始新的旅程", 404)
	}
	p, err := clone(old)
	if err != nil {
		return err
	}
	if err = fn(p); err != nil {
		return err
	}
	s.db.Players[hash] = p
	if err = s.persist(); err != nil {
		s.db.Players[hash] = old
		return err
	}
	return nil
}
func (s *Store) Transact(hash string, fn func(*Player) (domain.CommandResponse, error)) (domain.CommandResponse, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	key, old := s.lookupSession(hash)
	if old == nil {
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
	s.db.Players[key] = p
	if err = s.persist(); err != nil {
		s.db.Players[key] = old
		return domain.CommandResponse{}, err
	}
	return response, nil
}

// AttachAlias 给玩家存档挂一个登录会话哈希;写失败回滚。
func (s *Store) AttachAlias(playerID, alias string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	key, p := s.findByID(playerID)
	if p == nil {
		return domain.Fail("PLAYER_NOT_FOUND", "玩家不存在，请先开始新的旅程", 404)
	}
	for _, existing := range p.SessionAliases {
		if existing == alias {
			return nil // 幂等:同一别名重复挂载直接成功
		}
	}
	old := *p
	p.SessionAliases = append(append([]string{}, p.SessionAliases...), alias)
	s.db.Players[key] = p
	if err := s.persist(); err != nil {
		*p = old
		return err
	}
	return nil
}

// SaveAccount 新建账号;用户名已存在时 409。写失败回滚。
func (s *Store) SaveAccount(account *Account) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	key := account.Username
	if _, ok := s.db.Accounts[key]; ok {
		return domain.Fail("USERNAME_TAKEN", "这个名字已经有小猫主人用了，换一个吧", 409)
	}
	if s.db.Accounts == nil {
		s.db.Accounts = map[string]*Account{}
	}
	s.db.Accounts[key] = account
	if err := s.persist(); err != nil {
		delete(s.db.Accounts, key)
		return err
	}
	return nil
}

// FindAccount 按用户名(小写)查账号;不存在返回 nil。
func (s *Store) FindAccount(username string) *Account {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.db.Accounts == nil {
		return nil
	}
	return s.db.Accounts[username]
}

// TrimAliases 控制存档的登录别名数量:超过 limit 时移除最旧的。
func (s *Store) TrimAliases(playerID string, limit int) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	_, p := s.findByID(playerID)
	if p == nil {
		return domain.Fail("PLAYER_NOT_FOUND", "玩家不存在，请先开始新的旅程", 404)
	}
	if len(p.SessionAliases) <= limit {
		return nil
	}
	old := append([]string{}, p.SessionAliases...)
	trimmed := append([]string{}, p.SessionAliases[len(p.SessionAliases)-limit:]...)
	p.SessionAliases = trimmed
	if err := s.persist(); err != nil {
		p.SessionAliases = old
		return err
	}
	return nil
}
