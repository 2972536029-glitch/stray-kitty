// Package payment 实现演示用模拟支付网关:金枪鱼充值目录、双路径判定(4242 必成功/0000 必失败)
// 与流水账本。成功与失败都是正常业务(HTTP 200),失败带猫咪风格的治愈文案。
// 设计参考 travel-niuniu 的 payment-service,流水直接落在玩家存档里,与命令事务共用同一把锁。
package payment

import (
	"crypto/rand"
	"encoding/hex"
	"math/big"
	"strings"
	"time"

	"stray-kitty/server/internal/domain"
	"stray-kitty/server/internal/repository"
)

// Gateway 模拟支付网关。
type Gateway struct {
	store *repository.Store
	packs []domain.RechargePack
}

func New(store *repository.Store, catalog domain.Catalog) *Gateway {
	return &Gateway{store: store, packs: catalog.RechargePacks}
}

// NewDecider 构造只做判定(不落游戏存档)的网关,供独立支付服务使用。
func NewDecider(catalog domain.Catalog) *Gateway {
	return &Gateway{packs: catalog.RechargePacks}
}

// Catalog 充值目录(按配置顺序)。
func (g *Gateway) Catalog() []domain.RechargePack { return g.packs }

// FindPack 按 ID 查找充值档位。
func (g *Gateway) FindPack(id string) (domain.RechargePack, bool) {
	for _, p := range g.packs {
		if p.ID == id {
			return p, true
		}
	}
	return domain.RechargePack{}, false
}

// ChargeResult 一笔充值的结果;TunaBalance 为到账后的最新余额(declined 时仍返回当前余额)。
type ChargeResult struct {
	Txn         domain.Txn
	Pack        domain.RechargePack
	TunaBalance int
}

// healingMsgs 失败路径的治愈文案(随机一条随流水返回)。
var healingMsgs = []string{
	"喵喵用小鼻子蹭了蹭你的手背：“唔……虽然没买到，但本咪肚子现在也不饿啦，我们一起晒太阳吧，喵～”",
	"团子拍拍罐头肚皮：“差一罐就差一罐嘛！今晚先挤一个纸箱睡，明天又是元气满满的一天！”",
	"点点轻轻舔了舔你的指尖：“没关系的……比起罐头，点点更开心你愿意陪我们走到这里。”",
}

// Decision 一笔充值的判定结果:只做决策与构造流水,不落任何存储。
// 进程内模式由 Gateway.Charge 继续落游戏存档;拆分模式由支付服务落独立账本,
// 游戏侧再经 Game.ApplyCharge 入账——两种模式共用这一份判定逻辑。
type Decision struct {
	Txn  domain.Txn
	Pack domain.RechargePack
}

// Decide 校验档位与卡号并给出支付判定,构造流水(不含入账)。纯函数,可安全跨服务复用。
func (g *Gateway) Decide(playerID, packID, cardNumber string) (Decision, error) {
	pack, ok := g.FindPack(packID)
	if !ok {
		return Decision{}, domain.Fail("PACK_NOT_FOUND", "补给小站没有这档罐头", 404)
	}
	card := strings.ReplaceAll(strings.ReplaceAll(cardNumber, " ", ""), "-", "")
	if !validCardNumber(card) {
		return Decision{}, domain.Fail("INVALID_CARD", "卡号要 12~19 位数字哦。演示卡：4242 开头必成功，0000 开头必失败。", 400)
	}
	status, reason := decide(card)
	txn := domain.Txn{
		ID:        newTxnID(),
		PlayerID:  playerID,
		PackID:    pack.ID,
		Amount:    pack.PriceCents,
		Status:    status,
		Reason:    reason,
		CreatedAt: time.Now(),
	}
	if len(card) >= 4 {
		txn.CardSuffix = card[len(card)-4:]
	}
	return Decision{Txn: txn, Pack: pack}, nil
}

// Charge 执行一笔模拟支付:4242 开头必成功、0000 开头必失败、其余卡一律温和拒绝(便于演示)。
// 成功时在同一事务里入账金枪鱼并落流水;失败只落流水,不动余额。
func (g *Gateway) Charge(playerID, packID, cardNumber string) (ChargeResult, error) {
	d, err := g.Decide(playerID, packID, cardNumber)
	if err != nil {
		return ChargeResult{}, err
	}
	result := ChargeResult{Txn: d.Txn, Pack: d.Pack}
	err = g.store.TransactByPlayer(playerID, func(p *repository.Player) error {
		if d.Txn.Status == "confirmed" {
			p.State.Currencies["tuna"] += d.Pack.TunaGranted
		}
		domain.AppendTxn(&p.State, d.Txn)
		result.TunaBalance = p.State.Currencies["tuna"]
		return nil
	})
	return result, err
}

// PickHealingMessage 随机挑一条失败治愈文案;进程内网关与远程客户端共用。
func PickHealingMessage() string {
	n, err := rand.Int(rand.Reader, big.NewInt(int64(len(healingMsgs))))
	if err != nil {
		return healingMsgs[0]
	}
	return healingMsgs[n.Int64()]
}

// HealingMessage 随机挑一条失败治愈文案;由网关层选出后随响应返回。
func (g *Gateway) HealingMessage() string {
	return PickHealingMessage()
}

// History 玩家的充值与消费流水(最新在前)。消费流水落账时不带 playerId,这里统一补齐。
func (g *Gateway) History(playerID string) ([]domain.Txn, error) {
	p, err := g.store.GetByPlayerID(playerID)
	if err != nil {
		return nil, err
	}
	out := make([]domain.Txn, len(p.State.Txns))
	for i, t := range p.State.Txns {
		if t.PlayerID == "" {
			t.PlayerID = playerID
		}
		out[len(p.State.Txns)-1-i] = t
	}
	return out, nil
}

// validCardNumber 演示网关的卡号格式:清洗空格/横线后 12~19 位纯数字。
func validCardNumber(card string) bool {
	if len(card) < 12 || len(card) > 19 {
		return false
	}
	for _, r := range card {
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
}

// decide 模拟支付网关判定。demo 必成败双路径之外的卡统一温和拒绝,保证演示结果可预期。
func decide(card string) (status, reason string) {
	switch {
	case strings.HasPrefix(card, "4242"):
		return "confirmed", ""
	case strings.HasPrefix(card, "0000"):
		return "declined", "罐头补给站打了个小盹（0000 演示必失败卡）"
	default:
		return "declined", "这张卡不在演示名单里（试试 4242 或 0000 开头）"
	}
}

func newTxnID() string {
	b := make([]byte, 12)
	if _, err := rand.Read(b); err != nil {
		return "txn-" + hex.EncodeToString([]byte(time.Now().Format("150405.000000000")))
	}
	return "txn-" + hex.EncodeToString(b)
}
