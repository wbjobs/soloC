package main

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type Recording struct {
	ID          string    `json:"id" gorm:"primaryKey"`
	Filename    string    `json:"filename"`
	Size        int64     `json:"size"`
	Shell       string    `json:"shell"`
	Duration    float64   `json:"duration"`
	EventCount  int       `json:"event_count"`
	Cols        int       `json:"cols"`
	Rows        int       `json:"rows"`
	Encrypted   bool      `json:"encrypted"`
	CreatedAt   time.Time `json:"created_at"`
	Description string    `json:"description"`
	Tags        string    `json:"tags"`
	IsPublic    bool      `json:"is_public" gorm:"default:false"`
	OwnerID     string    `json:"owner_id" gorm:"default:''"`
	Annotations string    `json:"annotations" gorm:"type:text"`
}

type ShareToken struct {
	ID          string    `json:"id" gorm:"primaryKey"`
	RecordingID string    `json:"recording_id"`
	Token       string    `json:"token" gorm:"uniqueIndex"`
	ExpiresAt   time.Time `json:"expires_at"`
	CreatedAt   time.Time `json:"created_at"`
	Views       int       `json:"views"`
	MaxViews    int       `json:"max_views"`
}

type Annotation struct {
	ID        string  `json:"id"`
	Timestamp float64 `json:"timestamp"`
	Text      string  `json:"text"`
	CreatedAt string  `json:"created_at"`
}

func (r *Recording) BeforeCreate(tx *gorm.DB) error {
	if r.ID == "" {
		r.ID = uuid.New().String()
	}
	r.CreatedAt = time.Now()
	return nil
}

func (s *ShareToken) BeforeCreate(tx *gorm.DB) error {
	if s.ID == "" {
		s.ID = uuid.New().String()
	}
	if s.Token == "" {
		s.Token = uuid.New().String()[:8]
	}
	s.CreatedAt = time.Now()
	return nil
}

func (r *Recording) GetAnnotations() ([]Annotation, error) {
	if r.Annotations == "" {
		return []Annotation{}, nil
	}
	var annotations []Annotation
	err := json.Unmarshal([]byte(r.Annotations), &annotations)
	return annotations, err
}

func (r *Recording) SetAnnotations(annotations []Annotation) error {
	data, err := json.Marshal(annotations)
	if err != nil {
		return err
	}
	r.Annotations = string(data)
	return nil
}
