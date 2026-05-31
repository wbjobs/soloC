package models

import (
	"time"
)

type Snippet struct {
	ID          int       `json:"id"`
	Title       string    `json:"title"`
	Language    string    `json:"language"`
	Code        string    `json:"code"`
	Description string    `json:"description"`
	Tags        []string  `json:"tags"`
	IsPublic    bool      `json:"is_public"`
	CreatedAt   string    `json:"created_at"`
	UpdatedAt   string    `json:"updated_at"`
	SyncVersion int       `json:"sync_version"`
	IsDeleted   bool      `json:"is_deleted"`
	IsSynced    bool      `json:"-"`
}

type User struct {
	ID       int    `json:"id"`
	Username string `json:"username"`
	Email    string `json:"email"`
}

type AuthResponse struct {
	AccessToken string `json:"access_token"`
	User        User   `json:"user"`
}

type SyncRequest struct {
	Snippets  []Snippet `json:"snippets"`
	LastSync  string    `json:"last_sync"`
	DeviceID  string    `json:"device_id"`
}

type SyncResponse struct {
	ServerSnippets  []Snippet `json:"server_snippets"`
	CurrentSyncTime string    `json:"current_sync_time"`
}

type Config struct {
	ServerURL   string
	AccessToken string
	UserID      int
	LastSync    string
	DeviceID    string
}

func (s *Snippet) TagsToString() string {
	if len(s.Tags) == 0 {
		return ""
	}
	res := ""
	for i, tag := range s.Tags {
		if i > 0 {
			res += ","
		}
		res += tag
	}
	return res
}

func ParseTags(tagsStr string) []string {
	if tagsStr == "" {
		return []string{}
	}
	var tags []string
	current := ""
	for _, c := range tagsStr {
		if c == ',' {
			if current != "" {
				tags = append(tags, current)
				current = ""
			}
		} else {
			current += string(c)
		}
	}
	if current != "" {
		tags = append(tags, current)
	}
	return tags
}

func FormatTime(t time.Time) string {
	return t.Format(time.RFC3339)
}

func ParseTime(s string) (time.Time, error) {
	return time.Parse(time.RFC3339, s)
}
