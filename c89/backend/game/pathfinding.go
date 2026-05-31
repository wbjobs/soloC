package game

import (
	"container/heap"
	"math"
)

type Node struct {
	Position Vector3
	Cost     float64
	Priority float64
	Parent   *Node
	Index    int
}

type PriorityQueue []*Node

func (pq PriorityQueue) Len() int { return len(pq) }

func (pq PriorityQueue) Less(i, j int) bool {
	return pq[i].Priority < pq[j].Priority
}

func (pq PriorityQueue) Swap(i, j int) {
	pq[i], pq[j] = pq[j], pq[i]
	pq[i].Index = i
	pq[j].Index = j
}

func (pq *PriorityQueue) Push(x interface{}) {
	n := len(*pq)
	node := x.(*Node)
	node.Index = n
	*pq = append(*pq, node)
}

func (pq *PriorityQueue) Pop() interface{} {
	old := *pq
	n := len(old)
	node := old[n-1]
	old[n-1] = nil
	node.Index = -1
	*pq = old[0 : n-1]
	return node
}

func FindPath(start, target Vector3, obstacles []*Obstacle) []Vector3 {
	stepSize := 20.0
	maxIterations := 500
	
	openList := &PriorityQueue{}
	heap.Init(openList)
	
	closedSet := make(map[Vector3]bool)
	cameFrom := make(map[Vector3]Vector3)
	gScore := make(map[Vector3]float64)
	fScore := make(map[Vector3]float64)
	
	startNode := &Node{
		Position: start,
		Cost:     0,
		Priority: start.Distance(target),
	}
	heap.Push(openList, startNode)
	gScore[start] = 0
	fScore[start] = start.Distance(target)
	
	iterations := 0
	
	for openList.Len() > 0 && iterations < maxIterations {
		iterations++
		
		current := heap.Pop(openList).(*Node)
		currentPos := current.Position
		
		if currentPos.Distance(target) < stepSize {
			return reconstructPath(cameFrom, currentPos, target)
		}
		
		closedSet[currentPos] = true
		
		neighbors := getNeighbors(currentPos, stepSize)
		
		for _, neighbor := range neighbors {
			if closedSet[neighbor] {
				continue
			}
			
			if isCollides(neighbor, obstacles) {
				continue
			}
			
			tentativeG := gScore[currentPos] + currentPos.Distance(neighbor)
			
			if _, exists := gScore[neighbor]; !exists || tentativeG < gScore[neighbor] {
				cameFrom[neighbor] = currentPos
				gScore[neighbor] = tentativeG
				fScore[neighbor] = tentativeG + neighbor.Distance(target)
				
				neighborNode := &Node{
					Position: neighbor,
					Cost:     tentativeG,
					Priority: fScore[neighbor],
				}
				heap.Push(openList, neighborNode)
			}
		}
	}
	
	return nil
}

func getNeighbors(pos Vector3, stepSize float64) []Vector3 {
	neighbors := make([]Vector3, 0, 26)
	
	for dx := -1.0; dx <= 1.0; dx++ {
		for dy := -1.0; dy <= 1.0; dy++ {
			for dz := -1.0; dz <= 1.0; dz++ {
				if dx == 0 && dy == 0 && dz == 0 {
					continue
				}
				neighbor := Vector3{
					X: pos.X + dx*stepSize,
					Y: pos.Y + dy*stepSize,
					Z: pos.Z + dz*stepSize,
				}
				neighbors = append(neighbors, neighbor)
			}
		}
	}
	
	return neighbors
}

func isCollides(pos Vector3, obstacles []*Obstacle) bool {
	for _, obstacle := range obstacles {
		if pos.Distance(obstacle.Position) < obstacle.Radius {
			return true
		}
	}
	return false
}

func reconstructPath(cameFrom map[Vector3]Vector3, current, target Vector3) []Vector3 {
	path := []Vector3{target}
	
	for {
		prev, exists := cameFrom[current]
		if !exists {
			break
		}
		path = append([]Vector3{current}, path...)
		current = prev
	}
	
	return path
}
