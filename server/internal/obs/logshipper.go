package obs

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"sync"
	"time"
)

// 直接推送到 Datadog HTTP Logs Intake 的轻量 shipper。
//
// 为什么存在：kind + containerd 环境下，Agent 依赖的 /var/log/pods 文件采集
// 在受限网络/挂载形态上不可靠（旅行牛牛项目在 kind 上的实测结论）。stdout 日志
// 始终保留，本 shipper 作为旁路把同一条日志直接 POST 到 intake，保证 Logs 支柱可用。
//
// 纪律：观测旁路绝不影响业务——channel 满即丢弃；发送失败以 30 秒限频打一条
// stdout WARN，不留"静默成功"的假象；未配置 DD_LOGS_INTAKE_KEY 时整体 no-op
// （与无 Agent 时 tracer/statsd 的降级策略一致）。

const (
	intakeEnvKey  = "DD_LOGS_INTAKE_KEY"
	intakeEnvSite = "DD_SITE"
)

type logShipper struct {
	client        *http.Client
	url           string
	apiKey        string
	ch            chan map[string]any
	once          sync.Once
	enabled       bool
	mu            sync.Mutex
	lastErrLogged time.Time
}

var shipper = &logShipper{
	client: &http.Client{Timeout: 5 * time.Second},
	ch:     make(chan map[string]any, 256),
}

// initShipper 按 env 初始化（每个进程只做一次）。
func initShipper() {
	key := os.Getenv(intakeEnvKey)
	if key == "" {
		return
	}
	site := os.Getenv(intakeEnvSite)
	if site == "" {
		site = "datadoghq.com"
	}
	shipper.apiKey = key
	shipper.url = "https://http-intake.logs." + site + "/api/v2/logs"
	shipper.enabled = true
	go shipper.loop()
}

// ShipLog 把一条完整日志（含 level/service/msg 与全部业务字段）送入异步队列。
func ShipLog(level, service, msg string, kv map[string]any) {
	shipper.once.Do(initShipper)
	if !shipper.enabled {
		return
	}
	full := map[string]any{"level": level, "service": service, "msg": msg}
	for k, v := range kv {
		full[k] = v
	}
	select {
	case shipper.ch <- full:
	default: // 队列满即丢弃：观测旁路不能拖慢业务
	}
}

// loop 批量聚合后 POST。batch 上限 32 条或 2 秒先到者触发。
func (s *logShipper) loop() {
	batch := make([]map[string]any, 0, 32)
	tick := time.NewTicker(2 * time.Second)
	defer tick.Stop()
	for {
		select {
		case kv, ok := <-s.ch:
			if !ok {
				s.flush(batch)
				return
			}
			batch = append(batch, kv)
			if len(batch) >= 32 {
				s.flush(batch)
				batch = batch[:0]
			}
		case <-tick.C:
			if len(batch) > 0 {
				s.flush(batch)
				batch = batch[:0]
			}
		}
	}
}

// flush 组装 intake 载荷并 POST；失败以 30 秒限频落一条 WARN。
func (s *logShipper) flush(batch []map[string]any) {
	if len(batch) == 0 {
		return
	}
	payload := make([]map[string]any, 0, len(batch))
	for _, kv := range batch {
		line, err := json.Marshal(kv)
		if err != nil {
			continue
		}
		payload = append(payload, map[string]any{
			// message 为合法 JSON 时 Datadog 会自动解析出其中的属性,
			// dd.trace_id / dd.span_id 由此与 trace 关联
			"message":  string(line),
			"status":   levelOf(kv),
			"service":  kv["service"],
			"ddsource": "go",
			"ddtags":   "env:" + envOr("DD_ENV", "dev") + ",team:" + envOr("DD_TEAM", "stray-kitty") + ",version:" + envOr("DD_VERSION", "0.1.0"),
		})
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return
	}
	req, err := http.NewRequest(http.MethodPost, s.url, bytes.NewReader(body))
	if err != nil {
		return
	}
	req.Header.Set("DD-API-KEY", s.apiKey)
	req.Header.Set("Content-Type", "application/json")
	resp, err := s.client.Do(req)
	if err != nil {
		s.warnLimited("log intake unreachable: " + err.Error())
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		s.warnLimited(fmt.Sprintf("log intake responded %d", resp.StatusCode))
	}
}

func (s *logShipper) warnLimited(msg string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if time.Since(s.lastErrLogged) < 30*time.Second {
		return
	}
	s.lastErrLogged = time.Now()
	fmt.Println(fmt.Sprintf(`{"level":"warn","service":%q,"msg":"log shipper delivery failed","detail":%q}`, "obs", msg))
}

func levelOf(kv map[string]any) string {
	if kv["level"] == "warn" || kv["level"] == "error" {
		return kv["level"].(string)
	}
	return "info"
}
