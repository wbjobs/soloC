package topology

import (
	"fmt"
	"sync"
	"sync/atomic"
	"time"
)

type ServiceNode struct {
	IP        string `json:"ip"`
	Port      uint16 `json:"port"`
	Name      string `json:"name"`
	Type      string `json:"type"`
	LastSeen  int64  `json:"lastSeen"`
	CallCount int64  `json:"callCount"`
}

type ServiceEdge struct {
	Source       string `json:"source"`
	Destination  string `json:"destination"`
	Protocol     string `json:"protocol"`
	CallCount    int64  `json:"callCount"`
	TotalLatency int64  `json:"totalLatency"`
	MinLatency   int64  `json:"minLatency"`
	MaxLatency   int64  `json:"maxLatency"`
	LastSeen     int64  `json:"lastSeen"`
}

type Topology struct {
	nodes sync.Map
	edges sync.Map
}

type CallRecord struct {
	SourceIP   string
	SourcePort uint16
	DestIP     string
	DestPort   uint16
	Protocol   string
	Timestamp  int64
	Latency    int64
}

type nodeKey struct {
	ip   string
	port uint16
}

func NewTopology() *Topology {
	return &Topology{}
}

func (t *Topology) RecordCall(call *CallRecord) {
	srcKey := fmt.Sprintf("%s:%d", call.SourceIP, call.SourcePort)
	dstKey := fmt.Sprintf("%s:%d", call.DestIP, call.DestPort)

	now := call.Timestamp

	srcNode, _ := t.nodes.LoadOrStore(srcKey, &ServiceNode{
		IP:        call.SourceIP,
		Port:      call.SourcePort,
		Name:      srcKey,
		Type:      "service",
		LastSeen:  now,
		CallCount: 0,
	})
	if n, ok := srcNode.(*ServiceNode); ok {
		atomic.StoreInt64(&n.LastSeen, now)
		atomic.AddInt64(&n.CallCount, 1)
	}

	dstNode, _ := t.nodes.LoadOrStore(dstKey, &ServiceNode{
		IP:        call.DestIP,
		Port:      call.DestPort,
		Name:      dstKey,
		Type:      "service",
		LastSeen:  now,
		CallCount: 0,
	})
	if n, ok := dstNode.(*ServiceNode); ok {
		atomic.StoreInt64(&n.LastSeen, now)
	}

	edgeKey := fmt.Sprintf("%s->%s", srcKey, dstKey)
	edge, _ := t.edges.LoadOrStore(edgeKey, &ServiceEdge{
		Source:       srcKey,
		Destination:  dstKey,
		Protocol:     call.Protocol,
		CallCount:    0,
		TotalLatency: 0,
		MinLatency:   1<<63 - 1,
		MaxLatency:   0,
		LastSeen:     now,
	})

	if e, ok := edge.(*ServiceEdge); ok {
		atomic.AddInt64(&e.CallCount, 1)
		atomic.StoreInt64(&e.LastSeen, now)
		if call.Latency > 0 {
			atomic.AddInt64(&e.TotalLatency, call.Latency)
			for {
				currentMin := atomic.LoadInt64(&e.MinLatency)
				if call.Latency >= currentMin {
					break
				}
				if atomic.CompareAndSwapInt64(&e.MinLatency, currentMin, call.Latency) {
					break
				}
			}
			for {
				currentMax := atomic.LoadInt64(&e.MaxLatency)
				if call.Latency <= currentMax {
					break
				}
				if atomic.CompareAndSwapInt64(&e.MaxLatency, currentMax, call.Latency) {
					break
				}
			}
		}
	}
}

func (t *Topology) GetNodes() []*ServiceNode {
	nodes := []*ServiceNode{}
	t.nodes.Range(func(key, value interface{}) bool {
		if node, ok := value.(*ServiceNode); ok {
			nodes = append(nodes, node)
		}
		return true
	})
	return nodes
}

func (t *Topology) GetEdges() []*ServiceEdge {
	edges := []*ServiceEdge{}
	t.edges.Range(func(key, value interface{}) bool {
		if edge, ok := value.(*ServiceEdge); ok {
			edges = append(edges, edge)
		}
		return true
	})
	return edges
}

func (e *ServiceEdge) AvgLatency() int64 {
	count := atomic.LoadInt64(&e.CallCount)
	if count == 0 {
		return 0
	}
	total := atomic.LoadInt64(&e.TotalLatency)
	return total / count
}

func (t *Topology) Reset() {
	t.nodes = sync.Map{}
	t.edges = sync.Map{}
}
