package topology

import (
	"fmt"
	"math"
	"sync"
	"time"
)

type AnomalyType string

const (
	AnomalyDiamond     AnomalyType = "DIAMOND"
	AnomalyCycle       AnomalyType = "CYCLE"
	AnomalyHighLatency AnomalyType = "HIGH_LATENCY"
	AnomalyHighFanout  AnomalyType = "HIGH_FANOUT"
)

type Anomaly struct {
	Type        AnomalyType `json:"type"`
	Severity    string      `json:"severity"`
	Message     string      `json:"message"`
	Suggestion  string      `json:"suggestion"`
	Nodes       []string    `json:"nodes"`
	Edges       []string    `json:"edges"`
	DetectedAt  int64       `json:"detectedAt"`
}

type AnomalyDetector struct {
	topology  *Topology
	anomalies []*Anomaly
	mu        sync.RWMutex
}

func NewAnomalyDetector(topo *Topology) *AnomalyDetector {
	return &AnomalyDetector{
		topology: topo,
	}
}

func (d *AnomalyDetector) DetectAll() []*Anomaly {
	d.mu.Lock()
	defer d.mu.Unlock()

	d.anomalies = []*Anomaly{}

	d.detectDiamondPatterns()
	d.detectCyclicDependencies()
	d.detectHighLatencyEdges()
	d.detectHighFanoutServices()

	return d.anomalies
}

type NodeInfo struct {
	Name     string
	InEdges  []string
	OutEdges []string
}

func (d *AnomalyDetector) buildGraph() (map[string]*NodeInfo, map[string]*ServiceEdge) {
	nodes := d.topology.GetNodes()
	edges := d.topology.GetEdges()

	nodeMap := make(map[string]*NodeInfo)
	for _, node := range nodes {
		nodeMap[node.Name] = &NodeInfo{
			Name:     node.Name,
			InEdges:  []string{},
			OutEdges: []string{},
		}
	}

	edgeMap := make(map[string]*ServiceEdge)
	for _, edge := range edges {
		edgeKey := fmt.Sprintf("%s->%s", edge.Source, edge.Destination)
		edgeMap[edgeKey] = edge

		if srcNode, exists := nodeMap[edge.Source]; exists {
			srcNode.OutEdges = append(srcNode.OutEdges, edge.Destination)
		}
		if dstNode, exists := nodeMap[edge.Destination]; exists {
			dstNode.InEdges = append(dstNode.InEdges, edge.Source)
		}
	}

	return nodeMap, edgeMap
}

func (d *AnomalyDetector) detectDiamondPatterns() {
	nodeMap, edgeMap := d.buildGraph()

	detectedDiamonds := make(map[string]bool)

	for _, startNode := range nodeMap {
		if len(startNode.OutEdges) < 2 {
			continue
		}

		for _, mid1 := range startNode.OutEdges {
			for _, mid2 := range startNode.OutEdges {
				if mid1 >= mid2 {
					continue
				}

				mid1Node := nodeMap[mid1]
				mid2Node := nodeMap[mid2]
				if mid1Node == nil || mid2Node == nil {
					continue
				}

				commonEnds := findCommonOutEdges(mid1Node.OutEdges, mid2Node.OutEdges)
				for _, endNode := range commonEnds {
					diamondKey := fmt.Sprintf("%s-%s-%s-%s", startNode.Name, mid1, mid2, endNode)
					if detectedDiamonds[diamondKey] {
						continue
					}
					detectedDiamonds[diamondKey] = true

					edge1 := fmt.Sprintf("%s->%s", startNode.Name, mid1)
					edge2 := fmt.Sprintf("%s->%s", startNode.Name, mid2)
					edge3 := fmt.Sprintf("%s->%s", mid1, endNode)
					edge4 := fmt.Sprintf("%s->%s", mid2, endNode)

					totalCalls := int64(0)
					if e, ok := edgeMap[edge1]; ok {
						totalCalls += e.CallCount
					}
					if e, ok := edgeMap[edge2]; ok {
						totalCalls += e.CallCount
					}

					severity := "INFO"
					if totalCalls > 10000 {
						severity = "CRITICAL"
					} else if totalCalls > 1000 {
						severity = "WARNING"
					}

					d.anomalies = append(d.anomalies, &Anomaly{
						Type:       AnomalyDiamond,
						Severity:   severity,
						Message:    fmt.Sprintf("检测到钻石型调用模式：%s -> [%s, %s] -> %s", startNode.Name, mid1, mid2, endNode),
						Suggestion: fmt.Sprintf("建议引入消息队列（如 Kafka/RabbitMQ）解耦服务 %s 与 %s/%s 的同步调用，提高系统弹性", startNode.Name, mid1, mid2),
						Nodes:      []string{startNode.Name, mid1, mid2, endNode},
						Edges:      []string{edge1, edge2, edge3, edge4},
						DetectedAt: time.Now().Unix(),
					})
				}
			}
		}
	}
}

func findCommonOutEdges(edges1, edges2 []string) []string {
	edgeSet := make(map[string]bool)
	for _, e := range edges1 {
		edgeSet[e] = true
	}

	common := []string{}
	for _, e := range edges2 {
		if edgeSet[e] {
			common = append(common, e)
		}
	}
	return common
}

func (d *AnomalyDetector) detectCyclicDependencies() {
	nodeMap, _ := d.buildGraph()

	visited := make(map[string]bool)
	recStack := make(map[string]bool)
	path := []string{}

	var dfs func(string) bool
	dfs = func(node string) bool {
		visited[node] = true
		recStack[node] = true
		path = append(path, node)

		nodeInfo := nodeMap[node]
		if nodeInfo == nil {
			recStack[node] = false
			path = path[:len(path)-1]
			return false
		}

		for _, neighbor := range nodeInfo.OutEdges {
			if !visited[neighbor] {
				if dfs(neighbor) {
					return true
				}
			} else if recStack[neighbor] {
				cycleStart := -1
				for i, n := range path {
					if n == neighbor {
						cycleStart = i
						break
					}
				}
				if cycleStart >= 0 {
					cycle := append(path[cycleStart:], neighbor)
					d.reportCycle(cycle)
				}
			}
		}

		recStack[node] = false
		path = path[:len(path)-1]
		return false
	}

	for nodeName := range nodeMap {
		if !visited[nodeName] {
			dfs(nodeName)
		}
	}
}

func (d *AnomalyDetector) reportCycle(cycle []string) {
	cycleStr := ""
	cycleEdges := []string{}
	for i := 0; i < len(cycle)-1; i++ {
		if i > 0 {
			cycleStr += " -> "
		}
		cycleStr += cycle[i]
		cycleEdges = append(cycleEdges, fmt.Sprintf("%s->%s", cycle[i], cycle[i+1]))
	}

	severity := "CRITICAL"
	if len(cycle) > 3 {
		severity = "CRITICAL"
	} else {
		severity = "WARNING"
	}

	d.anomalies = append(d.anomalies, &Anomaly{
		Type:       AnomalyCycle,
		Severity:   severity,
		Message:    fmt.Sprintf("检测到循环依赖：%s -> %s (形成 %d 跳循环)", cycleStr, cycle[len(cycle)-1], len(cycle)-1),
		Suggestion: fmt.Sprintf("建议重构服务 %s 的调用链，打破循环依赖。可考虑：1) 提取公共模块 2) 使用事件驱动架构 3) 引入中间层解耦", cycle[0]),
		Nodes:      cycle,
		Edges:      cycleEdges,
		DetectedAt: time.Now().Unix(),
	})
}

func (d *AnomalyDetector) detectHighLatencyEdges() {
	edges := d.topology.GetEdges()

	latencyThreshold := int64(500)
	extremeThreshold := int64(2000)

	for _, edge := range edges {
		avgLatency := edge.AvgLatency()
		if avgLatency > latencyThreshold {
			severity := "WARNING"
			if avgLatency > extremeThreshold {
				severity = "CRITICAL"
			}

			edgeKey := fmt.Sprintf("%s->%s", edge.Source, edge.Destination)
			d.anomalies = append(d.anomalies, &Anomaly{
				Type:       AnomalyHighLatency,
				Severity:   severity,
				Message:    fmt.Sprintf("服务调用延迟过高：%s -> %s，平均延迟 %d ms (min=%d, max=%d)", edge.Source, edge.Destination, avgLatency, edge.MinLatency, edge.MaxLatency),
				Suggestion: fmt.Sprintf("建议排查 %s 到 %s 的网络状况或服务性能：1) 检查数据库查询优化 2) 考虑添加缓存层 3) 检查网络带宽和丢包率", edge.Source, edge.Destination),
				Nodes:      []string{edge.Source, edge.Destination},
				Edges:      []string{edgeKey},
				DetectedAt: time.Now().Unix(),
			})
		}
	}
}

func (d *AnomalyDetector) detectHighFanoutServices() {
	nodeMap, edgeMap := d.buildGraph()

	fanoutThreshold := 10
	extremeThreshold := 30

	for nodeName, nodeInfo := range nodeMap {
		fanout := len(nodeInfo.OutEdges)
		if fanout > fanoutThreshold {
			severity := "INFO"
			if fanout > extremeThreshold {
				severity = "WARNING"
			}

			totalCalls := int64(0)
			affectedEdges := []string{}
			for _, out := range nodeInfo.OutEdges {
				edgeKey := fmt.Sprintf("%s->%s", nodeName, out)
				if e, ok := edgeMap[edgeKey]; ok {
					totalCalls += e.CallCount
				}
				affectedEdges = append(affectedEdges, edgeKey)
			}

			d.anomalies = append(d.anomalies, &Anomaly{
				Type:       AnomalyHighFanout,
				Severity:   severity,
				Message:    fmt.Sprintf("服务扇出过高：%s 同时调用 %d 个下游服务，总调用量 %d", nodeName, fanout, totalCalls),
				Suggestion: fmt.Sprintf("建议对 %s 的下游调用进行聚合：1) 引入 BFF 层聚合请求 2) 使用批量接口 3) 考虑服务编排模式", nodeName),
				Nodes:      append([]string{nodeName}, nodeInfo.OutEdges...),
				Edges:      affectedEdges,
				DetectedAt: time.Now().Unix(),
			})
		}
	}
}

func (d *AnomalyDetector) GetAnomalyScore() float64 {
	d.mu.RLock()
	defer d.mu.RUnlock()

	score := 0.0
	for _, a := range d.anomalies {
		switch a.Severity {
		case "CRITICAL":
			score += 100
		case "WARNING":
			score += 30
		case "INFO":
			score += 10
		}
	}
	return math.Min(100, score)
}

func (d *AnomalyDetector) GetAnomalyStats() map[string]int {
	d.mu.RLock()
	defer d.mu.RUnlock()

	stats := map[string]int{
		"CRITICAL": 0,
		"WARNING":  0,
		"INFO":     0,
		"TOTAL":    len(d.anomalies),
	}

	for _, a := range d.anomalies {
		stats[a.Severity]++
	}

	typeStats := map[string]int{}
	for _, a := range d.anomalies {
		typeStats[string(a.Type)]++
	}

	for k, v := range typeStats {
		stats[k] = v
	}

	return stats
}
