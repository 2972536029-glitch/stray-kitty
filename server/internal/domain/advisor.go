package domain

// Advisor data is transient and never becomes a game command or saved progress.
type AdvisorMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type AdvisorRequest struct {
	// An omitted scope preserves battle-only requests. explore_hint is an opt-in
	// map-authored sentence rewrite, separate from manual journey conversation.
	Scope            string           `json:"scope,omitempty"`
	SceneKey         string           `json:"sceneKey,omitempty"`
	ExpectedRevision *int             `json:"expectedRevision,omitempty"`
	AttemptID        string           `json:"attemptId,omitempty"`
	StageID          string           `json:"stageId,omitempty"`
	Question         string           `json:"question,omitempty"`
	Context          string           `json:"context"`
	History          []AdvisorMessage `json:"history,omitempty"`
}

type AdvisorResponse struct {
	Source string `json:"source"`
	Title  string `json:"title"`
	Text   string `json:"text"`
	Reason string `json:"reason,omitempty"`
}
