// auth.go:轻量账号体系。游客匿名会话照常游玩;注册把当前存档绑到用户名+密码,
// 登录可在任意设备为同一存档换取新会话令牌(别名机制),进度跨设备取回。
// 密码用 PBKDF2-HMAC-SHA256(标准库)加盐哈希,不存明文。
package service

import (
	"crypto/pbkdf2"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"stray-kitty/server/internal/domain"
	"stray-kitty/server/internal/repository"
)

const (
	passwordIterations = 120_000
	passwordKeyLen     = 32
	saltLen            = 16
	maxAliases         = 8
)

// invalidAccount 注册输入不合法(400)。
func invalidAccount(message string) error {
	return domain.Fail("INVALID_ACCOUNT", message, 400)
}

// authFailed 登录凭证不匹配(401)。
func authFailed() error {
	return domain.Fail("AUTH_FAILED", "用户名或密码不对。", 401)
}

// hashPassword 以 PBKDF2-HMAC-SHA256 计算密码哈希,返回 hex。
func hashPassword(password, saltHex string) string {
	salt, _ := hex.DecodeString(saltHex)
	key, err := pbkdf2.Key(sha256.New, password, salt, passwordIterations, passwordKeyLen)
	if err != nil {
		// 标准库 SHA-256 不会失败;保守起见失败时哈希为空,登录恒不匹配。
		return ""
	}
	return hex.EncodeToString(key)
}

func newSaltHex() (string, error) {
	salt := make([]byte, saltLen)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}
	return hex.EncodeToString(salt), nil
}

// validUsername 3-24 个字符,可含中文/字母/数字/下划线/连字符,不含空白。
func validUsername(name string) bool {
	if utf8.RuneCountInString(name) < 3 || utf8.RuneCountInString(name) > 24 {
		return false
	}
	for _, r := range name {
		if unicode.IsSpace(r) {
			return false
		}
	}
	return true
}

func validPassword(password string) bool {
	return len(password) >= 8 && len(password) <= 64
}

// Register 用当前匿名会话的存档注册账号:进度原样保留,绑定后可用用户名密码在任何设备取回。
// 返回账号用户名。username 归一化为小写存储。
func (g *Game) Register(token, username, password string) (string, error) {
	if !validUsername(username) {
		return "", invalidAccount("用户名要 3~24 个字符，且不含空格。")
	}
	if !validPassword(password) {
		return "", invalidAccount("密码要 8~64 个字符。")
	}
	player, err := g.Store.Get(Hash(token))
	if err != nil {
		return "", err // 会话无效:401
	}
	name := strings.ToLower(username)
	salt, err := newSaltHex()
	if err != nil {
		return "", err
	}
	account := &repository.Account{
		Username:     name,
		PlayerID:     player.ID,
		PasswordHash: hashPassword(password, salt),
		PasswordSalt: salt,
		CreatedAt:    time.Now().UTC(),
	}
	if err := g.Store.SaveAccount(account); err != nil {
		return "", err
	}
	return name, nil
}

// Login 校验用户名密码,为账号绑定的存档签发新的会话令牌。
// 返回 (playerID, token)。同一存档的旧会话(匿名主会话与历史登录)继续有效。
func (g *Game) Login(username, password string) (string, string, error) {
	account := g.Store.FindAccount(strings.ToLower(username))
	if account == nil {
		return "", "", authFailed()
	}
	if hashPassword(password, account.PasswordSalt) != account.PasswordHash {
		return "", "", authFailed()
	}
	token, err := ID()
	if err != nil {
		return "", "", err
	}
	// 控制别名数量:超过上限时丢弃最旧的登录别名,避免无限膨胀。
	if err := g.Store.TrimAliases(account.PlayerID, maxAliases); err != nil {
		return "", "", err
	}
	if err := g.Store.AttachAlias(account.PlayerID, Hash(token)); err != nil {
		return "", "", err
	}
	return account.PlayerID, token, nil
}
