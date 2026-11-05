package service

import "testing"

// 经济埋点分支:分桶边界必须无缝隙无重叠;货币键映射走白名单,枚举外 unknown。
func TestEconomyBucket(t *testing.T) {
	cases := map[int]string{
		1: "1", 2: "2-5", 5: "2-5", 6: "6-20", 20: "6-20",
		21: "21-100", 100: "21-100", 101: "100+", 1000: "100+",
	}
	for amount, want := range cases {
		if got := economyBucket(amount); got != want {
			t.Errorf("economyBucket(%d) = %q, want %q", amount, got, want)
		}
	}
}

func TestEconomyCurrencyTag(t *testing.T) {
	cases := map[string]string{
		"stamp": "stamps", "tuna": "tuna", "food": "unknown", "": "unknown",
	}
	for key, want := range cases {
		if got := economyCurrencyTag(key); got != want {
			t.Errorf("economyCurrencyTag(%q) = %q, want %q", key, got, want)
		}
	}
}

// amount<=0 不产生经济事件:economyDelta 直接返回,不发指标。
func TestEconomyDeltaSkipsZero(t *testing.T) {
	economyDelta("tuna", "gain", 0)
	economyDelta("tuna", "gain", -3)
}
