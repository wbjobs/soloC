package ebpf

import (
	"context"
	"encoding/binary"
	"fmt"
	"log"
	"net"
	"os"
	"os/signal"
	"runtime"
	"sync/atomic"
	"syscall"
	"time"

	"github.com/cilium/ebpf/link"
	"github.com/cilium/ebpf/perf"
)

//go:generate go run github.com/cilium/ebpf/cmd/bpf2go -cc clang tcphook tcphook.c

type TcpEvent struct {
	Pid       uint32
	Tid       uint32
	Timestamp uint64
	Comm      [16]byte
	Sport     uint16
	Dport     uint16
	Saddr     uint32
	Daddr     uint32
	IsSend    uint8
	Protocol  uint8
	_         [2]byte
	Len       uint32
	Payload   [256]byte
}

type Monitor struct {
	objs        tcphookObjects
	links       []link.Link
	perfReader  *perf.Reader
	EventChan   chan TcpEvent
	dropCount   uint64
	eventCount  uint64
	ctx         context.Context
	cancel      context.CancelFunc
}

func NewMonitor() (*Monitor, error) {
	var objs tcphookObjects
	if err := loadTcphookObjects(&objs, nil); err != nil {
		return nil, fmt.Errorf("loading objects: %v", err)
	}

	perfReader, err := perf.NewReader(objs.Events, 128*1024*1024)
	if err != nil {
		objs.Close()
		return nil, fmt.Errorf("creating perf reader: %v", err)
	}

	links := []link.Link{}

	tcpSend, err := link.Kprobe("tcp_sendmsg", objs.TcpSendmsgEntry, nil)
	if err != nil {
		log.Printf("Warning: tcp_sendmsg kprobe failed: %v, trying udp only", err)
	} else {
		links = append(links, tcpSend)
	}

	tcpRecv, err := link.Kprobe("tcp_recvmsg", objs.TcpRecvmsgEntry, nil)
	if err != nil {
		log.Printf("Warning: tcp_recvmsg kprobe failed: %v", err)
	} else {
		links = append(links, tcpRecv)
	}

	udpSend, err := link.Kprobe("udp_sendmsg", objs.UdpSendmsgEntry, nil)
	if err != nil {
		log.Printf("Warning: udp_sendmsg kprobe failed: %v", err)
	} else {
		links = append(links, udpSend)
	}

	udpRecv, err := link.Kprobe("udp_recvmsg", objs.UdpRecvmsgEntry, nil)
	if err != nil {
		log.Printf("Warning: udp_recvmsg kprobe failed: %v", err)
	} else {
		links = append(links, udpRecv)
	}

	if len(links) == 0 {
		perfReader.Close()
		objs.Close()
		return nil, fmt.Errorf("no kprobes attached successfully")
	}

	ctx, cancel := context.WithCancel(context.Background())

	return &Monitor{
		objs:       objs,
		links:      links,
		perfReader: perfReader,
		EventChan:  make(chan TcpEvent, 65536),
		ctx:        ctx,
		cancel:     cancel,
	}, nil
}

func (m *Monitor) Start() {
	numWorkers := runtime.NumCPU()
	if numWorkers > 4 {
		numWorkers = 4
	}

	for i := 0; i < numWorkers; i++ {
		go m.worker(i)
	}

	go m.statsReporter()
}

func (m *Monitor) worker(id int) {
	for {
		select {
		case <-m.ctx.Done():
			return
		default:
		}

		record, err := m.perfReader.Read()
		if err != nil {
			if err == perf.ErrClosed {
				return
			}
			atomic.AddUint64(&m.dropCount, 1)
			continue
		}

		if record.LostSamples > 0 {
			atomic.AddUint64(&m.dropCount, record.LostSamples)
			continue
		}

		var event TcpEvent
		if err := binary.Read(record.RawSample, binary.LittleEndian, &event); err != nil {
			continue
		}

		select {
		case m.EventChan <- event:
			atomic.AddUint64(&m.eventCount, 1)
		default:
			atomic.AddUint64(&m.dropCount, 1)
		}
	}
}

func (m *Monitor) statsReporter() {
	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-m.ctx.Done():
			return
		case <-ticker.C:
			events := atomic.SwapUint64(&m.eventCount, 0)
			drops := atomic.SwapUint64(&m.dropCount, 0)
			if events > 0 || drops > 0 {
				log.Printf("Monitor stats: events=%d, drops=%d, channel_len=%d",
					events, drops, len(m.EventChan))
			}
		}
	}
}

func (m *Monitor) Close() {
	m.cancel()
	for _, l := range m.links {
		l.Close()
	}
	m.perfReader.Close()
	m.objs.Close()
	close(m.EventChan)
}

func (m *Monitor) WaitForSignal() {
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	<-stop
}

func intToIP(ip uint32) net.IP {
	return net.IPv4(
		byte(ip),
		byte(ip>>8),
		byte(ip>>16),
		byte(ip>>24),
	)
}

func (e *TcpEvent) SrcIP() string {
	return intToIP(e.Saddr).String()
}

func (e *TcpEvent) DstIP() string {
	return intToIP(e.Daddr).String()
}

func (e *TcpEvent) SrcPort() uint16 {
	return e.Sport
}

func (e *TcpEvent) DstPort() uint16 {
	return e.Dport
}

func (e *TcpEvent) CommStr() string {
	return string(e.Comm[:])
}

func (e *TcpEvent) PayloadStr() string {
	n := e.Len
	if n > 256 {
		n = 256
	}
	return string(e.Payload[:n])
}

func (e *TcpEvent) ProtocolStr() string {
	if e.Protocol == 6 {
		return "TCP"
	} else if e.Protocol == 17 {
		return "UDP"
	}
	return "UNKNOWN"
}
