package game

import (
	"encoding/json"
	"math"
	"math/rand"
	"sync"
	"time"

	"github.com/google/uuid"
)

const (
	MapSize        = 1000
	MaxDailyTime   = 15 * 60
	FuelConsumption = 0.1
)

type GameManager struct {
	state          *GameState
	mu             sync.RWMutex
	ticker         *time.Ticker
	reservationMgr *ReservationManager
	gravityBodies  []*GravityBody
}

func NewGameManager() *GameManager {
	gm := &GameManager{
		state: &GameState{
			Players:    make(map[string]*Player),
			Drones:     make(map[string]*Drone),
			DebrisList: make([]*Debris, 0),
			Obstacles:  make([]*Obstacle, 0),
			TimeSlot:   0,
			History:    make([]GameStateSnapshot, 0),
			Conflicts:  make([]*ConflictInfo, 0),
		},
		ticker:         time.NewTicker(100 * time.Millisecond),
		reservationMgr: NewReservationManager(),
		gravityBodies:  make([]*GravityBody, 0),
	}
	gm.generateMap()
	gm.generateGravityBodies()
	go gm.gameLoop()
	return gm
}

func (gm *GameManager) generateGravityBodies() {
	planet1 := &GravityBody{
		ID:       "planet_1",
		Position: Vector3{150, 50, 100},
		Radius:   40,
		Mass:     50000,
		Type:     "planet",
		Name:     "阿尔法星",
	}
	
	planet2 := &GravityBody{
		ID:       "planet_2",
		Position: Vector3{-120, 30, -80},
		Radius:   35,
		Mass:     40000,
		Type:     "planet",
		Name:     "贝塔星",
	}
	
	station1 := &GravityBody{
		ID:       "station_1",
		Position: Vector3{80, 20, -50},
		Radius:   20,
		Mass:     15000,
		Type:     "station",
		Name:     "欧米茄空间站",
	}
	
	station2 := &GravityBody{
		ID:       "station_2",
		Position: Vector3{-60, 15, 120},
		Radius:   18,
		Mass:     12000,
		Type:     "station",
		Name:     "西格玛空间站",
	}
	
	gm.gravityBodies = append(gm.gravityBodies, planet1, planet2, station1, station2)
	
	for _, body := range gm.gravityBodies {
		gm.state.Obstacles = append(gm.state.Obstacles, &Obstacle{
			ID:       body.ID,
			Position: body.Position,
			Radius:   body.Radius,
		})
	}
}

func (gm *GameManager) generateMap() {
	rand.Seed(time.Now().UnixNano())

	for i := 0; i < 50; i++ {
		debris := &Debris{
			ID: uuid.New().String(),
			Position: Vector3{
				X: rand.Float64()*MapSize - MapSize/2,
				Y: rand.Float64()*MapSize - MapSize/2,
				Z: rand.Float64()*MapSize - MapSize/2,
			},
			Weight:    rand.Float64()*20 + 5,
			Value:     rand.Intn(100) + 10,
			Collected: false,
		}
		gm.state.DebrisList = append(gm.state.DebrisList, debris)
	}

	for i := 0; i < 20; i++ {
		obstacle := &Obstacle{
			ID: uuid.New().String(),
			Position: Vector3{
				X: rand.Float64()*MapSize - MapSize/2,
				Y: rand.Float64()*MapSize - MapSize/2,
				Z: rand.Float64()*MapSize - MapSize/2,
			},
			Radius: rand.Float64()*30 + 10,
		}
		gm.state.Obstacles = append(gm.state.Obstacles, obstacle)
	}
}

func (rm *ReservationManager) TryReserve(gridKey GridKey, droneID string) bool {
	rm.mu.Lock()
	defer rm.mu.Unlock()

	existing, exists := rm.reservations[gridKey]
	if !exists {
		rm.reservations[gridKey] = &GridReservation{
			DroneID:    droneID,
			ReservedAt: time.Now(),
			ExpiresAt:  time.Now().Add(ReservationTime),
		}
		return true
	}

	if existing.DroneID == droneID {
		existing.ExpiresAt = time.Now().Add(ReservationTime)
		return true
	}

	if time.Now().After(existing.ExpiresAt) {
		rm.reservations[gridKey] = &GridReservation{
			DroneID:    droneID,
			ReservedAt: time.Now(),
			ExpiresAt:  time.Now().Add(ReservationTime),
		}
		return true
	}

	return false
}

func (rm *ReservationManager) ReleaseReservation(gridKey GridKey, droneID string) {
	rm.mu.Lock()
	defer rm.mu.Unlock()

	if existing, exists := rm.reservations[gridKey]; exists && existing.DroneID == droneID {
		delete(rm.reservations, gridKey)
	}
}

func (rm *ReservationManager) CleanupExpired() {
	rm.mu.Lock()
	defer rm.mu.Unlock()

	now := time.Now()
	for key, res := range rm.reservations {
		if now.After(res.ExpiresAt) {
			delete(rm.reservations, key)
		}
	}
}

func (gm *GameManager) gameLoop() {
	for range gm.ticker.C {
		gm.mu.Lock()
		gm.reservationMgr.CleanupExpired()
		gm.detectConflicts()
		gm.updateGame()
		gm.mu.Unlock()
	}
}

func (gm *GameManager) detectConflicts() {
	droneIDs := make([]string, 0, len(gm.state.Drones))
	for id := range gm.state.Drones {
		droneIDs = append(droneIDs, id)
	}

	for i := 0; i < len(droneIDs); i++ {
		for j := i + 1; j < len(droneIDs); j++ {
			droneA := gm.state.Drones[droneIDs[i]]
			droneB := gm.state.Drones[droneIDs[j]]

			if droneA.State == StateIdle && droneB.State == StateIdle {
				continue
			}

			dist := droneA.Position.Distance(droneB.Position)
			if dist < ConflictCheckDist {
				gm.handleConflict(droneA, droneB)
			}
		}
	}
}

func (gm *GameManager) handleConflict(droneA, droneB *Drone) {
	conflict := &ConflictInfo{
		ConflictID: uuid.New().String(),
		DroneA:     droneA.ID,
		DroneB:     droneB.ID,
		Position: Vector3{
			X: (droneA.Position.X + droneB.Position.X) / 2,
			Y: (droneA.Position.Y + droneB.Position.Y) / 2,
			Z: (droneA.Position.Z + droneB.Position.Z) / 2,
		},
		DetectedAt: time.Now(),
		Resolved:   false,
	}

	gm.state.Conflicts = append(gm.state.Conflicts, conflict)

	droneA.LastConflict = conflict
	droneB.LastConflict = conflict

	if droneA.State == StateMoving && droneB.State == StateMoving {
		gm.resolveTwoMoving(droneA, droneB)
	} else if droneA.State == StateMoving {
		droneA.State = StateWaiting
		droneA.WaitStartedAt = time.Now()
	} else if droneB.State == StateMoving {
		droneB.State = StateWaiting
		droneB.WaitStartedAt = time.Now()
	}
}

func (gm *GameManager) resolveTwoMoving(droneA, droneB *Drone) {
	priorityA := float64(len(droneA.Path) - droneA.PathIndex)
	priorityB := float64(len(droneB.Path) - droneB.PathIndex)

	if priorityA < priorityB {
		droneB.State = StateWaiting
		droneB.WaitStartedAt = time.Now()
	} else if priorityB < priorityA {
		droneA.State = StateWaiting
		droneA.WaitStartedAt = time.Now()
	} else {
		if droneA.Position.Distance(droneA.TargetPos) < droneB.Position.Distance(droneB.TargetPos) {
			droneB.State = StateWaiting
			droneB.WaitStartedAt = time.Now()
		} else {
			droneA.State = StateWaiting
			droneA.WaitStartedAt = time.Now()
		}
	}
}

func (gm *GameManager) updateGame() {
	for _, drone := range gm.state.Drones {
		gm.updateSingleDrone(drone)
	}
	
	gm.state.TimeSlot++
	gm.cleanupConflicts()
	gm.saveSnapshot()
}

func (gm *GameManager) cleanupConflicts() {
	if len(gm.state.Conflicts) > 100 {
		active := make([]*ConflictInfo, 0)
		for _, c := range gm.state.Conflicts {
			if !c.Resolved {
				active = append(active, c)
			}
		}
		gm.state.Conflicts = active
	}
}

func (gm *GameManager) updateSingleDrone(drone *Drone) {
	switch drone.State {
	case StateMoving:
		gm.handleMovingState(drone)
	case StateWaiting:
		gm.handleWaitingState(drone)
	case StateReplanning:
		gm.handleReplanningState(drone)
	}
	
	if drone.State == StateMoving {
		drone.GravityInfluence = gm.calculateGravityInfluence(drone)
	} else {
		drone.GravityInfluence = nil
	}
}

func (gm *GameManager) GetGravityBodies() []*GravityBody {
	gm.mu.RLock()
	defer gm.mu.RUnlock()
	return gm.gravityBodies
}

func (gm *GameManager) calculateGravityInfluence(drone *Drone) *GravityInfluence {
	var maxInfluence *GravityInfluence
	maxStrength := 0.0
	
	for _, body := range gm.gravityBodies {
		dist := drone.Position.Distance(body.Position)
		
		if dist < body.Radius {
			dist = body.Radius
		}
		
		G := 0.1
		strength := G * body.Mass / (dist * dist)
		
		direction := Vector3{
			X: body.Position.X - drone.Position.X,
			Y: body.Position.Y - drone.Position.Y,
			Z: body.Position.Z - drone.Position.Z,
		}
		length := math.Sqrt(direction.X*direction.X + direction.Y*direction.Y + direction.Z*direction.Z)
		if length > 0 {
			direction.X /= length
			direction.Y /= length
			direction.Z /= length
		}
		
		acceleration := Vector3{
			X: direction.X * strength,
			Y: direction.Y * strength,
			Z: direction.Z * strength,
		}
		
		slingshotRadius := body.Radius * 3
		inSlingshotZone := dist < slingshotRadius && dist > body.Radius*1.5
		
		fuelBonus := 0.0
		if inSlingshotZone {
			centerFactor := 1.0 - math.Abs(dist - body.Radius*2) / body.Radius
			fuelBonus = strength * centerFactor * 0.5
		}
		
		if strength > maxStrength {
			maxStrength = strength
			maxInfluence = &GravityInfluence{
				BodyID:          body.ID,
				Acceleration:    acceleration,
				Strength:        strength,
				InSlingshotZone: inSlingshotZone,
				FuelBonus:       fuelBonus,
			}
		}
	}
	
	return maxInfluence
}

func (gm *GameManager) handleMovingState(drone *Drone) {
	if len(drone.Path) <= drone.PathIndex {
		drone.State = StateIdle
		gm.checkCollection(drone)
		return
	}

	target := drone.Path[drone.PathIndex]
	gridKey := target.ToGridKey()

	if !gm.reservationMgr.TryReserve(gridKey, drone.ID) {
		drone.State = StateWaiting
		drone.WaitStartedAt = time.Now()
		return
	}

	currentGridKey := drone.Position.ToGridKey()
	if currentGridKey != gridKey {
		gm.reservationMgr.ReleaseReservation(currentGridKey, drone.ID)
	}

	direction := Vector3{
		X: target.X - drone.Position.X,
		Y: target.Y - drone.Position.Y,
		Z: target.Z - drone.Position.Z,
	}
	length := math.Sqrt(direction.X*direction.X + direction.Y*direction.Y + direction.Z*direction.Z)
	if length > 0 {
		direction.X /= length
		direction.Y /= length
		direction.Z /= length
	}

	gravity := gm.calculateGravityInfluence(drone)
	effectiveSpeed := drone.Speed
	fuelConsumption := FuelConsumption

	if gravity != nil {
		direction.X += gravity.Acceleration.X * 0.5
		direction.Y += gravity.Acceleration.Y * 0.5
		direction.Z += gravity.Acceleration.Z * 0.5
		
		newLength := math.Sqrt(direction.X*direction.X + direction.Y*direction.Y + direction.Z*direction.Z)
		if newLength > 0 {
			direction.X /= newLength
			direction.Y /= newLength
			direction.Z /= newLength
		}
		
		effectiveSpeed = drone.Speed * (1.0 + gravity.Strength*0.3)
		
		if gravity.InSlingshotZone {
			fuelConsumption *= (1.0 - gravity.FuelBonus)
			if drone.LastGravityBoost != gravity.BodyID {
				drone.LastGravityBoost = gravity.BodyID
			}
		}
	}

	dist := drone.Position.Distance(target)
	
	if dist < effectiveSpeed {
		drone.Position = target
		drone.PathIndex++
		if drone.PathIndex >= len(drone.Path) {
			drone.State = StateIdle
			gm.checkCollection(drone)
		}
	} else {
		drone.Position.X += direction.X * effectiveSpeed
		drone.Position.Y += direction.Y * effectiveSpeed
		drone.Position.Z += direction.Z * effectiveSpeed
		drone.Fuel -= fuelConsumption * drone.Speed
	}
}

func (gm *GameManager) handleWaitingState(drone *Drone) {
	if time.Since(drone.WaitStartedAt) > MaxWaitTime {
		drone.State = StateReplanning
		return
	}

	if len(drone.Path) > drone.PathIndex {
		nextTarget := drone.Path[drone.PathIndex]
		gridKey := nextTarget.ToGridKey()
		if gm.reservationMgr.TryReserve(gridKey, drone.ID) {
			drone.State = StateMoving
			if drone.LastConflict != nil {
				drone.LastConflict.Resolved = true
			}
		}
	}
}

func (gm *GameManager) handleReplanningState(drone *Drone) {
	obstacles := make([]*Obstacle, len(gm.state.Obstacles))
	copy(obstacles, gm.state.Obstacles)

	for _, otherDrone := range gm.state.Drones {
		if otherDrone.ID != drone.ID && otherDrone.State == StateMoving {
			obstacles = append(obstacles, &Obstacle{
				ID:       "drone_" + otherDrone.ID,
				Position: otherDrone.Position,
				Radius:   ConflictCheckDist,
			})
		}
	}

	newPath := FindPath(drone.Position, drone.TargetPos, obstacles)
	if newPath != nil && len(newPath) > 0 {
		drone.Path = newPath
		drone.PathIndex = 0
		drone.State = StateMoving
		if drone.LastConflict != nil {
			drone.LastConflict.Resolved = true
		}
	} else {
		drone.State = StateWaiting
		drone.WaitStartedAt = time.Now()
	}
}

func (gm *GameManager) checkCollection(drone *Drone) {
	for _, debris := range gm.state.DebrisList {
		if !debris.Collected && drone.Position.Distance(debris.Position) < 20 {
			if drone.Cargo+debris.Weight <= drone.MaxCargo {
				debris.Collected = true
				drone.Cargo += debris.Weight
				for _, player := range gm.state.Players {
					if player.Drone != nil && player.Drone.ID == drone.ID {
						player.Score += debris.Value
						break
					}
				}
			}
		}
	}
}

func (gm *GameManager) saveSnapshot() {
	data, _ := json.Marshal(gm.state)
	snapshot := GameStateSnapshot{
		Timestamp: time.Now(),
		State:     string(data),
	}
	gm.state.History = append(gm.state.History, snapshot)
	if len(gm.state.History) > 1000 {
		gm.state.History = gm.state.History[1:]
	}
}

func (gm *GameManager) AddPlayer(name string) *Player {
	gm.mu.Lock()
	defer gm.mu.Unlock()

	playerID := uuid.New().String()
	drone := &Drone{
		ID:           uuid.New().String(),
		Position:       Vector3{0, 0, 0},
		TargetPos:      Vector3{0, 0, 0},
		Fuel:           100,
		MaxFuel:        100,
		Cargo:          0,
		MaxCargo:       50,
		Speed:          5,
		Path:           make([]Vector3, 0),
		PathIndex:      0,
		State:          StateIdle,
		WaitStartedAt:  time.Time{},
		LastConflict:   nil,
	}
	
	player := &Player{
		ID:         playerID,
		Name:       name,
		DailyTime:  MaxDailyTime,
		LastActive: time.Now(),
		Drone:      drone,
		Score:      0,
		Connected:  true,
	}
	
	gm.state.Players[playerID] = player
	gm.state.Drones[drone.ID] = drone
	
	return player
}

func (gm *GameManager) MoveDrone(playerID string, target Vector3) {
	gm.mu.Lock()
	defer gm.mu.Unlock()

	player, exists := gm.state.Players[playerID]
	if !exists || player.Drone == nil {
		return
	}
	
	if time.Since(player.LastActive).Hours() >= 24 {
		player.DailyTime = MaxDailyTime
	}
	if player.DailyTime <= 0 {
		return
	}
	
	path := FindPath(player.Drone.Position, target, gm.state.Obstacles)
	if path != nil {
		player.Drone.Path = path
		player.Drone.PathIndex = 0
		player.Drone.State = StateMoving
		player.Drone.TargetPos = target
	}
}

func (gm *GameManager) AddTestDrone() {
	gm.mu.Lock()
	defer gm.mu.Unlock()

	id := "test_" + uuid.New().String()
	testDrone := &Drone{
		ID:           id,
		Position:     Vector3{rand.Float64()*40 - 20, rand.Float64()*10, rand.Float64()*40 - 20},
		TargetPos:    Vector3{50, 0, 50},
		Fuel:         100,
		MaxFuel:      100,
		Cargo:        0,
		MaxCargo:     50,
		Speed:        3,
		Path:         make([]Vector3, 0),
		PathIndex:    0,
		State:        StateMoving,
		WaitStartedAt: time.Time{},
		LastConflict: nil,
	}
	
	path := FindPath(testDrone.Position, Vector3{50, 0, 50}, gm.state.Obstacles)
	if path != nil {
		testDrone.Path = path
	}
	
	gm.state.Drones[id] = testDrone
}

func (gm *GameManager) GetState() *GameState {
	gm.mu.RLock()
	defer gm.mu.RUnlock()
	return gm.state
}

func (gm *GameManager) GetHeatMap() []HeatMapCell {
	gm.mu.RLock()
	defer gm.mu.RUnlock()
	
	cells := make([]HeatMapCell, 0)
	gridSize := 100.0
	
	for x := -MapSize/2; x < MapSize/2; x += gridSize {
		for y := -MapSize/2; y < MapSize/2; y += gridSize {
			for z := -MapSize/2; z < MapSize/2; z += gridSize {
				cellPos := Vector3{x, y, z}
				density := 0.0
				
				for _, debris := range gm.state.DebrisList {
					if !debris.Collected {
						dist := cellPos.Distance(debris.Position)
						if dist < gridSize {
							density += 1.0 / (dist + 1)
						}
					}
				}
				
				if density > 0 {
					cells = append(cells, HeatMapCell{Position: cellPos, Density: density})
				}
			}
		}
	}
	
	return cells
}
