package ebpf

import (
	"encoding/binary"
	"errors"
	"fmt"
	"math/rand"
	"os"
	"sync"
	"time"

	"github.com/cilium/ebpf"
	"github.com/cilium/ebpf/ringbuf"
	"github.com/cilium/ebpf/rlimit"
)

type SyscallEvent struct {
	PID        uint32
	TID        uint32
	SyscallNr  int32
	DurationNS uint64
	Timestamp  uint64
	Args       [6]uint64
	Ret        int64
}

type Tracer struct {
	objs       *syscallTraceObjects
	spec       *ebpf.CollectionSpec
	ringbuf    *ringbuf.Reader
	eventChan  chan *SyscallEvent
	stopChan   chan struct{}
	wg         sync.WaitGroup
	running    bool
	mu         sync.Mutex
	simMode    bool
	targetPIDs []uint32
	monitorAll bool
}

type syscallTraceObjects struct {
	HandleSysEnter *ebpf.Program `ebpf:"handle_sys_enter"`
	HandleSysExit  *ebpf.Program `ebpf:"handle_sys_exit"`
	EntryMap       *ebpf.Map     `ebpf:"entry_map"`
	TargetPidsMap  *ebpf.Map     `ebpf:"target_pids"`
	RbMap          *ebpf.Map     `ebpf:"rb"`
}

func init() {
	if err := rlimit.RemoveMemlock(); err != nil {
		fmt.Fprintf(os.Stderr, "Warning: failed to remove rlimit: %v\n", err)
	}
}

func NewTracer() (*Tracer, error) {
	return &Tracer{
		eventChan:  make(chan *SyscallEvent, 1024),
		stopChan:   make(chan struct{}),
		simMode:    false,
		targetPIDs: make([]uint32, 0),
		monitorAll: false,
	}, nil
}

func NewSimulatedTracer() *Tracer {
	return &Tracer{
		eventChan:  make(chan *SyscallEvent, 1024),
		stopChan:   make(chan struct{}),
		simMode:    true,
		targetPIDs: make([]uint32, 0),
		monitorAll: false,
	}
}

func (t *Tracer) Load() error {
	t.mu.Lock()
	defer t.mu.Unlock()

	if t.running {
		return errors.New("tracer already running")
	}

	if t.simMode {
		return nil
	}

	spec, err := loadEbpfSpec()
	if err != nil {
		t.simMode = true
		fmt.Fprintf(os.Stderr, "Warning: failed to load eBPF spec, falling back to simulation mode: %v\n", err)
		return nil
	}
	t.spec = spec

	var objs syscallTraceObjects
	if err := spec.LoadAndAssign(&objs, &ebpf.CollectionOptions{}); err != nil {
		t.simMode = true
		fmt.Fprintf(os.Stderr, "Warning: failed to load eBPF objects, falling back to simulation mode: %v\n", err)
		return nil
	}
	t.objs = &objs

	rb, err := ringbuf.NewReader(objs.RbMap)
	if err != nil {
		t.simMode = true
		t.Close()
		fmt.Fprintf(os.Stderr, "Warning: failed to create ringbuf reader, falling back to simulation mode: %v\n", err)
		return nil
	}
	t.ringbuf = rb

	return nil
}

func (t *Tracer) AddTargetPID(pid uint32) error {
	t.mu.Lock()
	defer t.mu.Unlock()

	if t.simMode {
		t.targetPIDs = append(t.targetPIDs, pid)
		return nil
	}

	if t.objs == nil || t.objs.TargetPidsMap == nil {
		return errors.New("tracer not loaded")
	}

	val := uint32(1)
	return t.objs.TargetPidsMap.Put(&pid, &val)
}

func (t *Tracer) MonitorAll() error {
	t.mu.Lock()
	defer t.mu.Unlock()

	if t.simMode {
		t.monitorAll = true
		return nil
	}

	pid := uint32(0)
	val := uint32(1)
	if t.objs == nil || t.objs.TargetPidsMap == nil {
		return errors.New("tracer not loaded")
	}
	return t.objs.TargetPidsMap.Put(&pid, &val)
}

func (t *Tracer) Start() error {
	t.mu.Lock()
	defer t.mu.Unlock()

	if t.running {
		return nil
	}

	if !t.simMode && t.ringbuf == nil {
		return errors.New("tracer not loaded")
	}

	t.running = true
	t.wg.Add(1)

	if t.simMode {
		go t.simulatedEventLoop()
	} else {
		go t.eventLoop()
	}

	return nil
}

func (t *Tracer) eventLoop() {
	defer t.wg.Done()

	for {
		select {
		case <-t.stopChan:
			return
		default:
		}

		record, err := t.ringbuf.Read()
		if err != nil {
			select {
			case <-t.stopChan:
				return
			default:
			}
			continue
		}

		if len(record.RawSample) < 88 {
			continue
		}

		event := &SyscallEvent{
			PID:        binary.LittleEndian.Uint32(record.RawSample[0:4]),
			TID:        binary.LittleEndian.Uint32(record.RawSample[4:8]),
			SyscallNr:  int32(binary.LittleEndian.Uint32(record.RawSample[8:12])),
			DurationNS: binary.LittleEndian.Uint64(record.RawSample[16:24]),
			Timestamp:  binary.LittleEndian.Uint64(record.RawSample[24:32]),
		}

		for i := 0; i < 6; i++ {
			event.Args[i] = binary.LittleEndian.Uint64(record.RawSample[32+i*8 : 40+i*8])
		}

		event.Ret = int64(binary.LittleEndian.Uint64(record.RawSample[80:88]))

		select {
		case t.eventChan <- event:
		default:
		}
	}
}

func (t *Tracer) simulatedEventLoop() {
	defer t.wg.Done()

	syscallNrs := []int32{0, 1, 2, 3, 7, 8, 9, 12, 16, 21, 22, 41, 42, 56, 59, 60, 220, 231, 257, 265, 307}

	ticker := time.NewTicker(10 * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-t.stopChan:
			return
		case <-ticker.C:
			if !t.running {
				return
			}

			pid := uint32(1)
			if len(t.targetPIDs) > 0 {
				pid = t.targetPIDs[rand.Intn(len(t.targetPIDs))]
			} else if t.monitorAll {
				pid = uint32(rand.Intn(10000) + 1)
			}

			event := &SyscallEvent{
				PID:        pid,
				TID:        pid,
				SyscallNr:  syscallNrs[rand.Intn(len(syscallNrs))],
				DurationNS: uint64(rand.Int63n(1000000) + 1000),
				Timestamp:  uint64(time.Now().UnixNano()),
				Args:       generateSimulatedArgs(syscallNrs[rand.Intn(len(syscallNrs))]),
				Ret:        rand.Int63n(10),
			}

			select {
			case t.eventChan <- event:
			default:
			}
		}
	}
}

func generateSimulatedArgs(syscallNr int32) [6]uint64 {
	var args [6]uint64
	args[0] = uint64(rand.Int63n(100))
	args[1] = uint64(rand.Int63n(4096))
	args[2] = uint64(rand.Int63n(4096))
	return args
}

func (t *Tracer) Events() <-chan *SyscallEvent {
	return t.eventChan
}

func (t *Tracer) Stop() {
	t.mu.Lock()
	if !t.running {
		t.mu.Unlock()
		return
	}
	t.running = false
	t.mu.Unlock()

	close(t.stopChan)
	if t.ringbuf != nil {
		t.ringbuf.Close()
	}
	t.wg.Wait()
}

func (t *Tracer) Close() {
	t.Stop()

	if t.ringbuf != nil {
		t.ringbuf.Close()
		t.ringbuf = nil
	}

	if t.objs != nil {
		if t.objs.HandleSysEnter != nil {
			t.objs.HandleSysEnter.Close()
		}
		if t.objs.HandleSysExit != nil {
			t.objs.HandleSysExit.Close()
		}
		if t.objs.EntryMap != nil {
			t.objs.EntryMap.Close()
		}
		if t.objs.TargetPidsMap != nil {
			t.objs.TargetPidsMap.Close()
		}
		if t.objs.RbMap != nil {
			t.objs.RbMap.Close()
		}
		t.objs = nil
	}
}

func (t *Tracer) IsSimulated() bool {
	return t.simMode
}

func loadEbpfSpec() (*ebpf.CollectionSpec, error) {
	return nil, errors.New("eBPF compilation required - see README for build instructions")
}
