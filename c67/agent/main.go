package main

import (
	"container/list"
	"log"
	"runtime"
	"sync/atomic"
	"time"

	"network-monitor/pkg/ebpf"
	"network-monitor/pkg/parser"
	"network-monitor/pkg/server"
	"network-monitor/pkg/topology"
)

const (
	maxPendingRequests = 65536
	sampleRateHigh    = 10
	sampleRateLow     = 1
	highLoadThreshold = 10000
	batchSize         = 1024
)

type PendingRequest struct {
	Timestamp int64
	SourceIP  string
	DestIP    string
	SrcPort   uint16
	DstPort   uint16
	Protocol  string
}

type LRUCache struct {
	capacity int
	items    map[string]*list.Element
	order    *list.List
}

func NewLRUCache(capacity int) *LRUCache {
	return &LRUCache{
		capacity: capacity,
		items:    make(map[string]*list.Element),
		order:    list.New(),
	}
}

func (c *LRUCache) Get(key string) (*PendingRequest, bool) {
	if elem, exists := c.items[key]; exists {
		c.order.MoveToFront(elem)
		return elem.Value.(*cacheItem).value, true
	}
	return nil, false
}

type cacheItem struct {
	key   string
	value *PendingRequest
}

func (c *LRUCache) Set(key string, value *PendingRequest) {
	if elem, exists := c.items[key]; exists {
		c.order.MoveToFront(elem)
		elem.Value.(*cacheItem).value = value
		return
	}

	if len(c.items) >= c.capacity {
		back := c.order.Back()
		if back != nil {
			item := back.Value.(*cacheItem)
			delete(c.items, item.key)
			c.order.Remove(back)
		}
	}

	item := &cacheItem{key: key, value: value}
	elem := c.order.PushFront(item)
	c.items[key] = elem
}

func main() {
	log.Println("Starting network monitor agent...")

	monitor, err := ebpf.NewMonitor()
	if err != nil {
		log.Fatalf("Failed to create eBPF monitor: %v", err)
	}
	defer monitor.Close()

	topo := topology.NewTopology()
	wsServer := server.NewWebSocketServer(topo)
	wsServer.StartBroadcaster()
	wsServer.StartPeriodicUpdate(1000 * time.Millisecond)

	pendingRequests := NewLRUCache(maxPendingRequests)
	var sampleRate uint32 = sampleRateLow
	var counter uint32 = 0
	var processedCount uint32 = 0

	monitor.Start()

	numWorkers := runtime.NumCPU()
	if numWorkers > 4 {
		numWorkers = 4
	}

	for i := 0; i < numWorkers; i++ {
		go func(workerID int) {
			batch := make([]ebpf.TcpEvent, 0, batchSize)
			ticker := time.NewTicker(100 * time.Millisecond)
			defer ticker.Stop()

			for {
				select {
				case event := <-monitor.EventChan:
					batch = append(batch, event)
					if len(batch) >= batchSize {
						processBatch(batch, pendingRequests, topo, &sampleRate, &counter, &processedCount)
						batch = batch[:0]
					}
				case <-ticker.C:
					if len(batch) > 0 {
						processBatch(batch, pendingRequests, topo, &sampleRate, &counter, &processedCount)
						batch = batch[:0]
					}
				}
			}
		}(i)
	}

	go func() {
		ticker := time.NewTicker(5 * time.Second)
		defer ticker.Stop()
		for range ticker.C {
			processed := atomic.SwapUint32(&processedCount, 0)
			rate := atomic.LoadUint32(&sampleRate)
			qps := processed / 5
			
			if qps > highLoadThreshold {
				atomic.StoreUint32(&sampleRate, sampleRateHigh)
				if rate != sampleRateHigh {
					log.Printf("High load detected (%d qps), adjusting sample rate to 1/%d", qps, sampleRateHigh)
				}
			} else if qps < highLoadThreshold/2 {
				atomic.StoreUint32(&sampleRate, sampleRateLow)
				if rate != sampleRateLow {
					log.Printf("Load normalized (%d qps), adjusting sample rate to 1/%d", qps, sampleRateLow)
				}
			}
		}
	}()

	go func() {
		if err := wsServer.Start(":8080"); err != nil {
			log.Fatalf("Server error: %v", err)
		}
	}()

	log.Println("Network monitor started successfully!")
	log.Println("Web interface available at http://localhost:8080")
	monitor.WaitForSignal()
	log.Println("Shutting down...")
}

func processBatch(
	events []ebpf.TcpEvent,
	pendingRequests *LRUCache,
	topo *topology.Topology,
	sampleRate *uint32,
	counter *uint32,
	processedCount *uint32,
) {
	now := time.Now().UnixMilli()
	rate := atomic.LoadUint32(sampleRate)

	for _, event := range events {
		if atomic.AddUint32(counter, 1)%rate != 0 {
			continue
		}

		payload := event.PayloadStr()
		protocol := parser.DetectProtocol(payload)

		if protocol == "UNKNOWN" {
			continue
		}

		atomic.AddUint32(processedCount, 1)

		srcIP := event.SrcIP()
		dstIP := event.DstIP()
		srcPort := event.SrcPort()
		dstPort := event.DstPort()

		var reqKey string
		if srcIP < dstIP {
			reqKey = srcIP + ":" + string(rune(srcPort)) + "->" + dstIP + ":" + string(rune(dstPort))
		} else {
			reqKey = dstIP + ":" + string(rune(dstPort)) + "->" + srcIP + ":" + string(rune(srcPort))
		}

		if event.IsSend == 1 {
			pendingRequests.Set(reqKey, &PendingRequest{
				Timestamp: now,
				SourceIP:  srcIP,
				DestIP:    dstIP,
				SrcPort:   srcPort,
				DstPort:   dstPort,
				Protocol:  protocol,
			})
		} else {
			if req, exists := pendingRequests.Get(reqKey); exists {
				latency := now - req.Timestamp

				call := &topology.CallRecord{
					SourceIP:   req.SourceIP,
					SourcePort: req.SrcPort,
					DestIP:     req.DestIP,
					DestPort:   req.DstPort,
					Protocol:   req.Protocol,
					Timestamp:  now,
					Latency:    latency,
				}
				topo.RecordCall(call)
			} else {
				call := &topology.CallRecord{
					SourceIP:   dstIP,
					SourcePort: dstPort,
					DestIP:     srcIP,
					DestPort:   srcPort,
					Protocol:   protocol,
					Timestamp:  now,
					Latency:    0,
				}
				topo.RecordCall(call)
			}
		}
	}
}
