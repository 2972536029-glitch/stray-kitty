package advisor

import (
	"encoding/json"
	"math"
	"regexp"
	"strconv"
	"strings"
)

var homeDiceClaim = regexp.MustCompile(`([0-9]{1,2})(?:\s*[-–—~～至到]\s*([0-9]{1,2}))?\s*点\s*(?:的概率)?\s*(?:约为|大约|约|为|是)?\s*([0-9]+(?:\.[0-9]+)?)\s*[%％]`)

// Catch a miscopied complete four-tier base table, not arbitrary probability
// discussion. An individual sum (e.g. rolling exactly 2) can legitimately have
// the same probability as another tier and must not be mistaken for a tier.
func validHomeDiceTable(context, answer string) bool {
	var data struct {
		Progress struct {
			Phase     string `json:"phase"`
			Knowledge struct {
				Rules struct {
					Ranges map[string]struct {
						Min         int    `json:"min"`
						Max         int    `json:"max"`
						Probability string `json:"probability"`
					} `json:"pointRanges"`
				} `json:"eventRules"`
			} `json:"homeKnowledge"`
		} `json:"serverProgress"`
	}
	if json.Unmarshal([]byte(context), &data) != nil || data.Progress.Phase != "home" || len(data.Progress.Knowledge.Rules.Ranges) != 4 {
		return true
	}
	claims := homeDiceClaim.FindAllStringSubmatch(answer, -1)
	if len(claims) != 4 {
		return true
	}
	seen, correct := map[string]bool{}, true
	for _, claim := range claims {
		min, _ := strconv.Atoi(claim[1])
		max := min
		if claim[2] != "" {
			max, _ = strconv.Atoi(claim[2])
		}
		percent, _ := strconv.ParseFloat(claim[3], 64)
		found := false
		for tier, expected := range data.Progress.Knowledge.Rules.Ranges {
			value, err := strconv.ParseFloat(strings.TrimSuffix(expected.Probability, "%"), 64)
			if err == nil && math.Abs(percent-value) < 0.005 {
				if seen[tier] {
					return true
				}
				seen[tier], found = true, true
				correct = correct && min == expected.Min && max == expected.Max
				break
			}
		}
		if !found {
			return true
		}
	}
	return correct
}
