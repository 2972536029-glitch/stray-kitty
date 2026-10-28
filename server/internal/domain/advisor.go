package domain

// Advisor data is transient and never becomes a game command or saved progress.
type AdvisorMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type AdvisorRequest struct {
	AttemptID string           `json:"attemptId"`
	StageID   string           `json:"stageId"`
	Question  string           `json:"question"`
	Context   string           `json:"context"`
	History   []AdvisorMessage `json:"history"`
}

type AdvisorResponse struct {
	Source string `json:"source"`
	Title  string `json:"title"`
	Text   string `json:"text"`
	Reason string `json:"reason,omitempty"`
}
