package service

import "stray-kitty/server/internal/obs"

// economyDelta 在货币数量变动应用后发 kitty.economy.delta。currency 用指标枚举名:
// fish=鱼干(food)、stamps=猫爪邮票(stamp)、tuna=金枪鱼罐头(tuna)——与游戏内
// 键名不同,映射只在此处。direction: gain/spend;bucket 金额档位防高基数
// (1 / 2-5 / 6-20 / 21-100 / 100+),枚举冻结于 docs/biz-obs-module3-plan.md §1。
func economyDelta(currency, direction string, amount int) {
	if amount <= 0 {
		return
	}
	obs.Incr("kitty.economy.delta", "currency:"+currency, "direction:"+direction, "bucket:"+economyBucket(amount))
}

// economyCurrencyTag 把游戏内货币键映射为指标枚举名(stamp→stamps,tuna 同名)。
// 白名单映射:枚举外一律 unknown,不把任意字符串放进 tag(低基数纪律)。
func economyCurrencyTag(key string) string {
	switch key {
	case "stamp":
		return "stamps"
	case "tuna":
		return "tuna"
	default:
		return "unknown"
	}
}

// economyBucket 金额分桶:档位间无缝隙无重叠,amount<=1 时不会走到(上游已拦)。
func economyBucket(amount int) string {
	switch {
	case amount == 1:
		return "1"
	case amount <= 5:
		return "2-5"
	case amount <= 20:
		return "6-20"
	case amount <= 100:
		return "21-100"
	default:
		return "100+"
	}
}
