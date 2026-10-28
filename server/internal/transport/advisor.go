package transport

import (
	"bytes"
	"encoding/json"
	"io"
	"mime"
	"net/http"
	"stray-kitty/server/internal/domain"
)

func (a *API) advise(w http.ResponseWriter, r *http.Request) {
	token, err := a.token(r)
	if err != nil {
		a.fail(w, r, err)
		return
	}
	mediaType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || mediaType != "application/json" {
		a.fail(w, r, domain.Fail("INVALID_CONTENT_TYPE", "需要 application/json", 415))
		return
	}
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 128<<10))
	if err != nil {
		a.fail(w, r, domain.Fail("BODY_TOO_LARGE", "军师请求超过 128 KiB", 413))
		return
	}
	var input domain.AdvisorRequest
	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.DisallowUnknownFields()
	if decoder.Decode(&input) != nil || decoder.Decode(new(any)) != io.EOF {
		a.fail(w, r, domain.Fail("INVALID_ADVISOR_REQUEST", "军师请求格式或字段无效", 400))
		return
	}
	var fields map[string]json.RawMessage
	if json.Unmarshal(body, &fields) != nil || fields == nil {
		a.fail(w, r, domain.Fail("INVALID_ADVISOR_REQUEST", "军师请求必须为对象", 400))
		return
	}
	for _, field := range []string{"attemptId", "stageId", "question", "context"} {
		value, exists := fields[field]
		if !exists || bytes.Equal(bytes.TrimSpace(value), []byte("null")) {
			a.fail(w, r, domain.Fail("INVALID_ADVISOR_REQUEST", "军师请求缺少必要字段", 400))
			return
		}
	}
	if history, exists := fields["history"]; exists && bytes.Equal(bytes.TrimSpace(history), []byte("null")) {
		a.fail(w, r, domain.Fail("INVALID_ADVISOR_REQUEST", "军师历史消息必须为数组", 400))
		return
	}
	result, err := a.game.Advise(r.Context(), token, input)
	if err != nil {
		a.fail(w, r, err)
		return
	}
	a.json(w, http.StatusOK, result)
}
