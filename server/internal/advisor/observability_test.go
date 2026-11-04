package advisor

import (
	"net"
	"strings"
	"testing"
	"time"

	"stray-kitty/server/internal/domain"
	"stray-kitty/server/internal/obs"
)

func TestReplyMetricsUseBoundedScopeAndSource(t *testing.T) {
	listener, err := net.ListenPacket("udp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	t.Setenv("DD_DOGSTATSD_PORT_8125_ADDR", listener.LocalAddr().String())
	t.Setenv("DD_TRACE_ENABLED", "false")
	t.Setenv("DD_INSTRUMENTATION_TELEMETRY_ENABLED", "false")
	obs.Init("kitty-advisor-test")
	var client *Client
	for _, scope := range []string{"", "journey", "explore_hint", "home", "untrusted-scope-value"} {
		result := client.Reply(t.Context(), "private-session-do-not-tag", domain.AdvisorRequest{Scope: scope})
		if result.Source != "local" || result.Reason != "not_configured" {
			t.Fatalf("unexpected no-op fallback: %+v", result)
		}
	}
	client.Reply(obs.WithQA(t.Context(), true), "private-qa-session", domain.AdvisorRequest{Scope: "journey"})
	obs.Shutdown() // flushes DogStatsD before assertions
	var lines string
	buffer := make([]byte, 65535)
	listener.SetReadDeadline(time.Now().Add(250 * time.Millisecond))
	for {
		n, _, err := listener.ReadFrom(buffer)
		if err != nil {
			break
		}
		lines += string(buffer[:n]) + "\n"
	}
	for _, scope := range []string{"battle", "journey", "explore_hint", "home", "unknown"} {
		for _, metric := range []string{"kitty.advisor.call:", "kitty.advisor.duration_ms:"} {
			found := false
			for _, line := range strings.Split(lines, "\n") {
				if strings.HasPrefix(line, metric) && strings.Contains(line, "scope:"+scope) && strings.Contains(line, "source:local") && strings.Contains(line, "result:fallback") && strings.Contains(line, "qa:false") {
					found = true
				}
			}
			if !found {
				t.Errorf("missing %s for scope %s: %s", metric, scope, lines)
			}
		}
	}
	for _, metric := range []string{"kitty.advisor.call:", "kitty.advisor.duration_ms:"} {
		found := false
		for _, line := range strings.Split(lines, "\n") {
			if strings.HasPrefix(line, metric) && strings.Contains(line, "scope:journey") && strings.Contains(line, "qa:true") {
				found = true
			}
		}
		if !found {
			t.Errorf("QA advisor request missing bounded isolation tag for %s: %s", metric, lines)
		}
	}
	if strings.Contains(lines, "private-session") || strings.Contains(lines, "untrusted-scope-value") {
		t.Fatal("high-cardinality input leaked into metric tags")
	}
}
