package opcua

import (
	"fmt"
	"sync"
	"sync/atomic"
	"time"
)

const (
	bankSize = 10
)

type registerBank struct {
	values []uint16
	mu     sync.RWMutex
}

type Server struct {
	endpoint  string
	banks     []*registerBank
	bankCount int
	running   int32
}

func NewServer(endpoint string) *Server {
	bankCount := 10
	banks := make([]*registerBank, bankCount)
	for i := range banks {
		banks[i] = &registerBank{
			values: make([]uint16, bankSize),
		}
	}
	return &Server{
		endpoint:  endpoint,
		banks:     banks,
		bankCount: bankCount,
		running:   0,
	}
}

func (s *Server) Start() error {
	atomic.StoreInt32(&s.running, 1)
	fmt.Printf("OPC UA Server simulation started at %s\n", s.endpoint)
	return nil
}

func (s *Server) Stop() {
	atomic.StoreInt32(&s.running, 0)
	fmt.Println("OPC UA Server stopped")
}

func (s *Server) UpdateRegister(index int, value uint16) error {
	if index < 0 || index >= 100 {
		return fmt.Errorf("index out of range")
	}

	bankIdx := index / bankSize
	offset := index % bankSize

	s.banks[bankIdx].mu.Lock()
	s.banks[bankIdx].values[offset] = value
	s.banks[bankIdx].mu.Unlock()

	return nil
}

func (s *Server) BatchUpdateRegisters(start int, values []uint16) error {
	if start < 0 || start+len(values) > 100 {
		return fmt.Errorf("invalid register range")
	}

	idx := 0
	count := len(values)

	for i := 0; i < count; {
		addr := start + i
		bankIdx := addr / bankSize
		offset := addr % bankSize

		s.banks[bankIdx].mu.Lock()
		remainingInBank := bankSize - offset
		writeCount := count - i
		if writeCount > remainingInBank {
			writeCount = remainingInBank
		}

		copy(s.banks[bankIdx].values[offset:], values[idx:idx+writeCount])
		s.banks[bankIdx].mu.Unlock()

		i += writeCount
		idx += writeCount
	}

	return nil
}

func (s *Server) GetRegister(index int) (uint16, error) {
	if index < 0 || index >= 100 {
		return 0, fmt.Errorf("index out of range")
	}

	bankIdx := index / bankSize
	offset := index % bankSize

	s.banks[bankIdx].mu.RLock()
	val := s.banks[bankIdx].values[offset]
	s.banks[bankIdx].mu.RUnlock()

	return val, nil
}

func (s *Server) GetAllRegisters() []uint16 {
	result := make([]uint16, 100)
	idx := 0

	for _, bank := range s.banks {
		bank.mu.RLock()
		copy(result[idx:], bank.values)
		bank.mu.RUnlock()
		idx += bankSize
	}

	return result
}

func (s *Server) BatchReadRegisters(start, count int) ([]uint16, error) {
	if start < 0 || start+count > 100 {
		return nil, fmt.Errorf("invalid register range")
	}

	result := make([]uint16, count)
	idx := 0

	for i := 0; i < count; {
		addr := start + i
		bankIdx := addr / bankSize
		offset := addr % bankSize

		s.banks[bankIdx].mu.RLock()
		remainingInBank := bankSize - offset
		readCount := count - i
		if readCount > remainingInBank {
			readCount = remainingInBank
		}

		copy(result[idx:], s.banks[bankIdx].values[offset:offset+readCount])
		s.banks[bankIdx].mu.RUnlock()

		i += readCount
		idx += readCount
	}

	return result, nil
}

func (s *Server) WatchRegisterChanges(callback func(index int, value uint16)) {
	ticker := time.NewTicker(500 * time.Millisecond)
	defer ticker.Stop()

	lastValues := make([]uint16, 100)
	copy(lastValues, s.GetAllRegisters())

	for atomic.LoadInt32(&s.running) == 1 {
		<-ticker.C
		currentValues := s.GetAllRegisters()

		for i := 0; i < 100; i++ {
			if currentValues[i] != lastValues[i] {
				callback(i, currentValues[i])
				lastValues[i] = currentValues[i]
			}
		}
	}
}

func (s *Server) GetNamespaceID() uint16 {
	return 1
}
