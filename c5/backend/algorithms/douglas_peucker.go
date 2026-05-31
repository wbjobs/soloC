package algorithms

import (
	"math"
	"sort"
)

type Point struct {
	Lon float64
	Lat float64
}

type StackItem struct {
	Start int
	End   int
}

func DouglasPeucker(points []Point, epsilon float64) []int {
	n := len(points)
	if n < 3 {
		result := make([]int, n)
		for i := range points {
			result[i] = i
		}
		return result
	}

	keep := make([]bool, n)
	keep[0] = true
	keep[n-1] = true

	stack := []StackItem{{Start: 0, End: n - 1}}

	for len(stack) > 0 {
		item := stack[len(stack)-1]
		stack = stack[:len(stack)-1]

		startIdx := item.Start
		endIdx := item.End

		maxDist := 0.0
		maxIndex := startIdx

		for i := startIdx + 1; i < endIdx; i++ {
			dist := PerpendicularDistanceHaversine(
				points[i],
				points[startIdx],
				points[endIdx],
			)
			if dist > maxDist {
				maxDist = dist
				maxIndex = i
			}
		}

		if maxDist > epsilon {
			keep[maxIndex] = true
			stack = append(stack, StackItem{Start: maxIndex, End: endIdx})
			stack = append(stack, StackItem{Start: startIdx, End: maxIndex})
		}
	}

	result := make([]int, 0)
	for i, isKept := range keep {
		if isKept {
			result = append(result, i)
		}
	}
	sort.Ints(result)

	return result
}

func HaversineDistance(p1, p2 Point) float64 {
	const R = 6371000.0

	lat1Rad := p1.Lat * math.Pi / 180.0
	lat2Rad := p2.Lat * math.Pi / 180.0
	deltaLat := (p2.Lat - p1.Lat) * math.Pi / 180.0
	deltaLon := (p2.Lon - p1.Lon) * math.Pi / 180.0

	a := math.Sin(deltaLat/2)*math.Sin(deltaLat/2) +
		math.Cos(lat1Rad)*math.Cos(lat2Rad)*
			math.Sin(deltaLon/2)*math.Sin(deltaLon/2)
	c := 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))

	return R * c
}

func PerpendicularDistanceHaversine(point, lineStart, lineEnd Point) float64 {
	if lineStart.Lon == lineEnd.Lon && lineStart.Lat == lineEnd.Lat {
		return HaversineDistance(point, lineStart)
	}

	lat1 := lineStart.Lat * math.Pi / 180.0
	lon1 := lineStart.Lon * math.Pi / 180.0
	lat2 := lineEnd.Lat * math.Pi / 180.0
	lon2 := lineEnd.Lon * math.Pi / 180.0
	latP := point.Lat * math.Pi / 180.0
	lonP := point.Lon * math.Pi / 180.0

	a12 := math.Atan2(
		math.Cos(lat2)*math.Sin(lon2-lon1),
		math.Cos(lat1)*math.Sin(lat2)-math.Sin(lat1)*math.Cos(lat2)*math.Cos(lon2-lon1),
	)

	a1p := math.Atan2(
		math.Cos(latP)*math.Sin(lonP-lon1),
		math.Cos(lat1)*math.Sin(latP)-math.Sin(lat1)*math.Cos(latP)*math.Cos(lonP-lon1),
	)

	deltaAngle := math.Abs(a12 - a1p)
	if deltaAngle > math.Pi {
		deltaAngle = 2*math.Pi - deltaAngle
	}

	d1p := HaversineDistance(lineStart, point)

	crossTrackDistance := math.Abs(math.Asin(math.Sin(d1p/6371000.0)*math.Sin(deltaAngle))) * 6371000.0

	alongTrackDistance := math.Acos(math.Cos(d1p/6371000.0)/math.Cos(crossTrackDistance/6371000.0)) * 6371000.0

	d12 := HaversineDistance(lineStart, lineEnd)

	if alongTrackDistance <= d12 {
		return crossTrackDistance
	}

	d2p := HaversineDistance(lineEnd, point)
	if d1p < d2p {
		return d1p
	}
	return d2p
}

func CalculateAverageDeviation(original []Point, compressedIndices []int) float64 {
	if len(original) < 3 || len(compressedIndices) < 2 {
		return 0.0
	}

	totalDeviation := 0.0
	count := 0

	for i := 0; i < len(compressedIndices)-1; i++ {
		startIdx := compressedIndices[i]
		endIdx := compressedIndices[i+1]

		for j := startIdx + 1; j < endIdx; j++ {
			dist := PerpendicularDistanceHaversine(
				original[j],
				original[startIdx],
				original[endIdx],
			)
			totalDeviation += dist
			count++
		}
	}

	if count == 0 {
		return 0.0
	}

	return totalDeviation / float64(count)
}

func OptimizeEpsilon(points []Point, targetPoints int) float64 {
	if len(points) <= targetPoints {
		return 1.0
	}

	minEps := 1.0
	maxEps := 10000.0

	for i := 0; i < 50; i++ {
		midEps := (minEps + maxEps) / 2
		indices := DouglasPeucker(points, midEps)

		if len(indices) > targetPoints {
			minEps = midEps
		} else {
			maxEps = midEps
		}
	}

	return maxEps
}
