package obs

import "context"

// 会话底座:player_id/session_id 只进日志,绝不进指标 tag(低基数纪律)。
// player_id 是服务端生成的玩家 ID,数量随玩家增长;session_id 由会话令牌派生
// (同一令牌恒定)。二者一旦进 metric tag 就是无限时间序列,监控与账单都会被拖垮;
// 日志字段不受低基数限制,这正是按玩家排查/统计的地基(验收 #6)。
//
// 用法:token 解析处 obs.WithSession(ctx, playerID, sessionID),之后该请求经过的
// obs.LogInfo/Warn/Error 自动携带 player_id/session_id 字段;无标识时行为不变。

// sessionKey 是 ctx 里会话标识的私有 key 类型,obs 包外不可构造、不可读取——
// 身份标识只能进日志,不暴露给指标路径,从类型上堵死"顺手塞进 tag"的可能。
type sessionKey struct{}

// SessionIdentity 请求级玩家/会话标识;字段名即日志字段名(验收 #6 告知整合人)。
type SessionIdentity struct {
	PlayerID  string
	SessionID string
}

// WithSession 把玩家/会话标识放入 ctx;之后该请求的 obs 日志自动携带这两个字段。
// 观测旁路 no-op 纪律:两个值都为空时原样返回原 ctx(不产生额外 ctx 分配)。
func WithSession(ctx context.Context, playerID, sessionID string) context.Context {
	if playerID == "" && sessionID == "" {
		return ctx
	}
	return context.WithValue(ctx, sessionKey{}, SessionIdentity{PlayerID: playerID, SessionID: sessionID})
}

// sessionFrom 提取 ctx 中的会话标识;无标识时返回零值(日志注入处按空跳过)。
func sessionFrom(ctx context.Context) SessionIdentity {
	if ctx == nil {
		return SessionIdentity{}
	}
	ident, _ := ctx.Value(sessionKey{}).(SessionIdentity)
	return ident
}
