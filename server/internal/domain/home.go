package domain

type HomePlacement struct {
	X      float64 `json:"x"`
	Y      float64 `json:"y"`
	Stored bool    `json:"stored"`
}
type HomeLayoutChange struct {
	Key string `json:"key"`
	HomePlacement
}
type HomeDecor struct {
	ID    string  `json:"id"`
	Stage int     `json:"stage"`
	Width float64 `json:"width"`
	Wall  bool    `json:"wall,omitempty"`
}
