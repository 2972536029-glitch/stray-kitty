package repository

import "stray-kitty/server/internal/obs"

// The save transaction is the common commit boundary for event/battle rewards,
// shop/parcel/renovation spending and all three payment credit paths. Observe the
// committed net change per currency, never speculative mutations or replayed
// receipts. A ten-draw transaction is one change with its full monetary amount.
func observeCommittedEconomy(before, after *Player, qa bool) {
	qaTag := observationQATag(before, after, qa)
	for _, currency := range []struct {
		tag           string
		before, after int
	}{
		{"fish", before.State.Inventory["food"], after.State.Inventory["food"]},
		{"stamps", before.State.Currencies["stamp"], after.State.Currencies["stamp"]},
		{"tuna", before.State.Currencies["tuna"], after.State.Currencies["tuna"]},
	} {
		delta := int64(currency.after) - int64(currency.before)
		if delta == 0 {
			continue
		}
		direction := "gain"
		if delta < 0 {
			direction = "spend"
			delta = -delta
		}
		tags := []string{"currency:" + currency.tag, "direction:" + direction, qaTag}
		obs.Incr("kitty.economy.delta", append(tags, "bucket:"+economyBucket(delta))...)
		// Counts of changes cannot answer the economic balance question: this
		// companion counter preserves quantities without high-cardinality tags.
		obs.Count("kitty.economy.amount", delta, tags...)
	}
}

func economyBucket(amount int64) string {
	switch {
	case amount <= 1:
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

func observationQATag(before, after *Player, qa bool) string {
	if qa || before.QARestore != nil || after.QARestore != nil ||
		before.State.QACheckpointID != "" || after.State.QACheckpointID != "" ||
		before.State.ActiveBattle != nil && before.State.ActiveBattle.QA ||
		after.State.ActiveBattle != nil && after.State.ActiveBattle.QA {
		return "qa:true"
	}
	return "qa:false"
}

// Payment terminals are emitted at the game credit commit, not the upstream
// HTTP response: retrying an already applied webhook must not inflate the funnel.
// Parcel spending has Currency/Spent set and is not a payment conversion.
func observeCommittedPayment(before, after *Player) {
	seen := make(map[string]bool, len(before.State.Txns))
	for _, txn := range before.State.Txns {
		seen[txn.ID] = true
	}
	for _, txn := range after.State.Txns {
		if txn.ID == "" || seen[txn.ID] || txn.Spent != 0 || txn.Currency != "" {
			continue
		}
		seen[txn.ID] = true
		step := ""
		switch txn.Status {
		case "confirmed":
			step = "charge_success"
		case "declined":
			step = "charge_declined"
		default:
			continue
		}
		obs.Incr("kitty.payment.funnel", "step:"+step, observationQATag(before, after, false))
	}
}
