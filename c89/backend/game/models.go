package game

import (
	"math"
	"sync"
	"time"

	"github.com/google/uuid"
)

const (
	GridCellSize      = 20.0
	ReservationTime   = 2000 * time.Millisecond
	MaxWaitTime       = 3000 * time.Millisecond
	ConflictCheckDist = 30.0
)

type Vector3 struct {
	X, Y, Z float64
}

func (v Vector3) Distance(to Vector3) float64 {
	dx := v.X - to.X
	dy := v.Y - to.Y
	dz := v.Z - to.Z
	return math.Sqrt(dx*dx + dy*dy + dz*dz)
}

func (v Vector3) Add(other Vector3) Vector3 {
	return Vector3{v.X + other.X, v.Y + other.Y, v.Z + other.Z}
}

func (v Vector3) Mul(scalar float64) Vector3 {
	return Vector3{v.X * scalar, v.Y * scalar, v.Z * scalar}
}

func (v Vector3) ToGridKey() GridKey {
	return GridKey{
		X: int(math.Floor(v.X / GridCellSize)),
		Y: int(math.Floor(v.Y / GridCellSize)),
		Z: int(math.Floor(v.Z / GridCellSize)),
	}
}

type GridKey struct {
	X, Y, Z int
}

type GridReservation struct {
	DroneID    string
	ReservedAt time.Time
	ExpiresAt  time.Time
}

type ReservationManager struct {
	reservations map[GridKey]*GridReservation
	mu           sync.RWMutex
}

func NewReservationManager() *ReservationManager {
	return &ReservationManager{
		reservations: make(map[GridKey]*GridReservation),
	}
}

type ConflictInfo struct {
	ConflictID  string
	DroneA      string
	DroneB      string
	Position    Vector3
	DetectedAt  time.Time
	Resolved    bool
}

type DroneState string

const (
	StateIdle     DroneState = "idle"
	StateMoving   DroneState = "moving"
	StateWaiting  DroneState = "waiting"
	StateReplanning DroneState = "replanning"
)

type Player struct {
	ID           string
	Name         string
	DailyTime    int
	LastActive   time.Time
	Drone        *Drone
	Score        int
	Connected    bool
}

type Drone struct {
	ID                string
	Position          Vector3
	TargetPos         Vector3
	Fuel              float64
	MaxFuel           float64
	Cargo             float64
	MaxCargo          float64
	Speed             float64
	Path              []Vector3
	PathIndex         int
	State             DroneState
	WaitStartedAt     time.Time
	LastConflict      *ConflictInfo
	LastGravityBoost  string
	GravityInfluence  *GravityInfluence
}

type Debris struct {
	ID       string
	Position Vector3
	Weight   float64
	Value    int
	Collected bool
}

type Obstacle struct {
	ID       string
	Position Vector3
	Radius   float64
}

type GameState struct {
	Players     map[string]*Player
	Drones      map[string]*Drone
	DebrisList  []*Debris
	Obstacles   []*Obstacle
	TimeSlot    int
	History   []GameStateSnapshot
	Conflicts   []*ConflictInfo
}

type GameStateSnapshot struct {
	Timestamp  time.Time
	State    string
}

type HeatMapCell struct {
	Position Vector3
	Density  float64
}

type GravityBody struct {
	ID       string
	Position Vector3
	Radius   float64
	Mass     float64
	Type     string // "planet", "station"
	Name     string
}

type GravityInfluence struct {
	BodyID       string
	Acceleration Vector3
	Strength     float64
	InSlingshotZone bool
	FuelBonus    float64
}
