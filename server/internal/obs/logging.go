package obs

import (
	"context"
	"log/slog"
	"strconv"

	"github.com/DataDog/dd-trace-go/v2/ddtrace/tracer"
)

// LogInfo / LogWarn / LogError 输出结构化日志并自动注入当前 span 的
// dd.trace_id / dd.span_id —— Trace↔Logs 关联的关键。
// 注意 Datadog 日志关联要求十进制的低 64 位 trace id：TraceID() 是 128 位 hex，
// 直接塞会导致关联永远失败（旅行牛牛项目验证过的坑，这里用 TraceIDLower 转十进制）。
// ctx 里没有 span 时照常输出（启动、后台任务等场景），不上报也不报错。
func LogInfo(ctx context.Context, msg string, args ...any) {
	logWithTrace(ctx, slog.LevelInfo, msg, args)
}
func LogWarn(ctx context.Context, msg string, args ...any) {
	logWithTrace(ctx, slog.LevelWarn, msg, args)
}
func LogError(ctx context.Context, msg string, args ...any) {
	logWithTrace(ctx, slog.LevelError, msg, args)
}

func logWithTrace(ctx context.Context, level slog.Level, msg string, args []any) {
	if ctx == nil {
		ctx = context.Background()
	}
	if identity, ok := ctx.Value(identityKey{}).(logIdentity); ok {
		if identity.playerID != "" {
			args = append(args, "player_id", identity.playerID)
		}
		if identity.sessionID != "" {
			args = append(args, "session_id", identity.sessionID)
		}
	}
	if qa, ok := ctx.Value(qaKey{}).(bool); ok {
		args = append(args, "qa", qa)
	}
	traceID, spanID := traceIDs(ctx)
	if traceID != "" {
		args = append(args, "dd.trace_id", traceID, "dd.span_id", spanID)
	}
	slog.Default().Log(ctx, level, msg, args...)
	if len(args) >= 2 && len(args)%2 == 0 {
		kv := mapFromArgs(args)
		ShipLog(level.String(), defaultService, msg, kv)
	}
}

// traceIDs 返回 Datadog Logs 关联所需的十进制 id；无 span 或 no-op 时返回空。
func traceIDs(ctx context.Context) (traceID, spanID string) {
	span, ok := tracer.SpanFromContext(ctx)
	if !ok {
		return "", ""
	}
	lower := span.Context().TraceIDLower()
	if lower == 0 {
		return "", ""
	}
	return strconv.FormatUint(lower, 10), strconv.FormatUint(span.Context().SpanID(), 10)
}

func mapFromArgs(args []any) map[string]any {
	kv := make(map[string]any, len(args)/2)
	for i := 0; i+1 < len(args); i += 2 {
		if key, ok := args[i].(string); ok {
			kv[key] = args[i+1]
		}
	}
	return kv
}
