package modbus

import (
	"encoding/binary"
	"fmt"
	"math"
	"math/rand"
	"net"
	"sync"
	"sync/atomic"
	"time"
)

const (
	maxConnections    = 100
	readTimeout       = 5 * time.Second
	writeTimeout      = 5 * time.Second
	batchUpdateSize   = 10
	maxConcurrentReqs = 50
)

type registerBank struct {
	values []uint16
	mu     sync.RWMutex
}

type Server struct {
	port         int
	banks        []*registerBank
	bankCount    int
	listener     net.Listener
	running      int32
	connCount    int32
	connSem      chan struct{}
	responsePool sync.Pool
}

func NewServer(port int) *Server {
	bankCount := 10
	banks := make([]*registerBank, bankCount)
	for i := range banks {
		registers := make([]uint16, 10)
		for j := range registers {
			registers[j] = uint16(rand.Intn(1000))
		}
		banks[i] = &registerBank{
			values: registers,
		}
	}

	return &Server{
		port:      port,
		banks:     banks,
		bankCount: bankCount,
		running:   0,
		connSem:   make(chan struct{}, maxConnections),
		responsePool: sync.Pool{
			New: func() interface{} {
				return make([]byte, 256)
			},
		},
	}
}

func (s *Server) Start() error {
	atomic.StoreInt32(&s.running, 1)
	addr := fmt.Sprintf(":%d", s.port)
	listener, err := net.Listen("tcp", addr)
	if err != nil {
		return err
	}
	s.listener = listener

	go s.simulateDataChanges()

	for atomic.LoadInt32(&s.running) == 1 {
		select {
		case s.connSem <- struct{}{}:
		default:
			time.Sleep(10 * time.Millisecond)
			continue
		}

		conn, err := listener.Accept()
		if err != nil {
			<-s.connSem
			if atomic.LoadInt32(&s.running) == 0 {
				return nil
			}
			continue
		}

		atomic.AddInt32(&s.connCount, 1)
		go s.handleConnection(conn)
	}
	return nil
}

func (s *Server) simulateDataChanges() {
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	for atomic.LoadInt32(&s.running) == 1 {
		<-ticker.C

		var wg sync.WaitGroup
		for i := range s.banks {
			wg.Add(1)
			go func(bankIdx int) {
				defer wg.Done()
				s.banks[bankIdx].mu.Lock()
				for j := range s.banks[bankIdx].values {
					change := int16(rand.Intn(21) - 10)
					newVal := int32(s.banks[bankIdx].values[j]) + int32(change)
					if newVal < 0 {
						newVal = 0
					} else if newVal > math.MaxUint16 {
						newVal = math.MaxUint16
					}
					s.banks[bankIdx].values[j] = uint16(newVal)
				}
				s.banks[bankIdx].mu.Unlock()
			}(i)
		}
		wg.Wait()
	}
}

func (s *Server) handleConnection(conn net.Conn) {
	defer func() {
		conn.Close()
		atomic.AddInt32(&s.connCount, -1)
		<-s.connSem
	}()

	buf := make([]byte, 256)

	for atomic.LoadInt32(&s.running) == 1 {
		conn.SetReadDeadline(time.Now().Add(readTimeout))
		n, err := conn.Read(buf)
		if err != nil {
			return
		}
		if n < 8 {
			continue
		}

		response := s.processModbusRequest(buf[:n])
		if response != nil {
			conn.SetWriteDeadline(time.Now().Add(writeTimeout))
			conn.Write(response)
		}
	}
}

func (s *Server) processModbusRequest(req []byte) []byte {
	functionCode := req[7]

	switch functionCode {
	case 3:
		return s.handleReadHoldingRegisters(req)
	case 6:
		return s.handleWriteSingleRegister(req)
	case 16:
		return s.handleWriteMultipleRegisters(req)
	default:
		return buildErrorResponse(req[0:2], req[2:4], req[6], functionCode, 0x01)
	}
}

func (s *Server) handleReadHoldingRegisters(req []byte) []byte {
	transactionID := req[0:2]
	protocolID := req[2:4]
	unitID := req[6]
	functionCode := req[7]

	startAddr := int(uint16(req[8])<<8 | uint16(req[9]))
	quantity := int(uint16(req[10])<<8 | uint16(req[11]))

	if startAddr < 0 || startAddr+quantity > 100 {
		return buildErrorResponse(transactionID, protocolID, unitID, functionCode, 0x02)
	}

	resp := s.responsePool.Get().([]byte)
	if cap(resp) < 9+quantity*2 {
		resp = make([]byte, 9+quantity*2)
	}
	resp = resp[:9+quantity*2]

	copy(resp[0:2], transactionID)
	copy(resp[2:4], protocolID)
	resp[4] = byte((2 + quantity*2) >> 8)
	resp[5] = byte((2 + quantity*2) & 0xFF)
	resp[6] = 0x01
	resp[7] = unitID
	resp[8] = functionCode
	resp[9] = byte(quantity * 2)

	startBank := startAddr / 10
	startOffset := startAddr % 10
	remaining := quantity
	respIdx := 10

	for remaining > 0 {
		bank := s.banks[startBank]
		bank.mu.RLock()

		bankRemaining := 10 - startOffset
		readCount := remaining
		if readCount > bankRemaining {
			readCount = bankRemaining
		}

		for i := 0; i < readCount; i++ {
			val := bank.values[startOffset+i]
			binary.BigEndian.PutUint16(resp[respIdx:], val)
			respIdx += 2
		}

		bank.mu.RUnlock()

		remaining -= readCount
		startBank++
		startOffset = 0
	}

	return resp
}

func (s *Server) handleWriteSingleRegister(req []byte) []byte {
	addr := int(uint16(req[8])<<8 | uint16(req[9]))
	value := uint16(req[10])<<8 | uint16(req[11])

	if addr < 0 || addr >= 100 {
		return buildErrorResponse(req[0:2], req[2:4], req[6], req[7], 0x02)
	}

	bankIdx := addr / 10
	offset := addr % 10

	s.banks[bankIdx].mu.Lock()
	s.banks[bankIdx].values[offset] = value
	s.banks[bankIdx].mu.Unlock()

	return req[:12]
}

func (s *Server) handleWriteMultipleRegisters(req []byte) []byte {
	startAddr := int(uint16(req[8])<<8 | uint16(req[9]))
	quantity := int(uint16(req[10])<<8 | uint16(req[11]))

	if startAddr < 0 || startAddr+quantity > 100 {
		return buildErrorResponse(req[0:2], req[2:4], req[6], req[7], 0x02)
	}

	startBank := startAddr / 10
	startOffset := startAddr % 10
	remaining := quantity
	reqIdx := 13

	for remaining > 0 {
		bank := s.banks[startBank]
		bank.mu.Lock()

		bankRemaining := 10 - startOffset
		writeCount := remaining
		if writeCount > bankRemaining {
			writeCount = bankRemaining
		}

		for i := 0; i < writeCount; i++ {
			val := uint16(req[reqIdx])<<8 | uint16(req[reqIdx+1])
			bank.values[startOffset+i] = val
			reqIdx += 2
		}

		bank.mu.Unlock()

		remaining -= writeCount
		startBank++
		startOffset = 0
	}

	return req[:12]
}

func buildErrorResponse(transactionID, protocolID []byte, unitID, functionCode, errorCode byte) []byte {
	resp := make([]byte, 9)
	copy(resp[0:2], transactionID)
	copy(resp[2:4], protocolID)
	resp[4] = 0x00
	resp[5] = 0x03
	resp[6] = 0x01
	resp[7] = functionCode | 0x80
	resp[8] = errorCode
	return resp
}

func (s *Server) Stop() {
	atomic.StoreInt32(&s.running, 0)
	if s.listener != nil {
		s.listener.Close()
	}
}

func (s *Server) GetRegisters() []uint16 {
	result := make([]uint16, 100)
	idx := 0

	for _, bank := range s.banks {
		bank.mu.RLock()
		copy(result[idx:], bank.values)
		bank.mu.RUnlock()
		idx += 10
	}

	return result
}

func (s *Server) GetRegister(index int) uint16 {
	if index < 0 || index >= 100 {
		return 0
	}

	bankIdx := index / 10
	offset := index % 10

	s.banks[bankIdx].mu.RLock()
	val := s.banks[bankIdx].values[offset]
	s.banks[bankIdx].mu.RUnlock()

	return val
}

func (s *Server) SetRegister(index int, value uint16) {
	if index < 0 || index >= 100 {
		return
	}

	bankIdx := index / 10
	offset := index % 10

	s.banks[bankIdx].mu.Lock()
	s.banks[bankIdx].values[offset] = value
	s.banks[bankIdx].mu.Unlock()
}

func (s *Server) BatchReadRegisters(start, count int) ([]uint16, error) {
	if start < 0 || start+count > 100 {
		return nil, fmt.Errorf("invalid register range")
	}

	result := make([]uint16, count)
	idx := 0

	for i := 0; i < count; {
		addr := start + i
		bankIdx := addr / 10
		offset := addr % 10

		s.banks[bankIdx].mu.RLock()
		remainingInBank := 10 - offset
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

func (s *Server) BatchWriteRegisters(start int, values []uint16) error {
	if start < 0 || start+len(values) > 100 {
		return fmt.Errorf("invalid register range")
	}

	idx := 0
	count := len(values)

	for i := 0; i < count; {
		addr := start + i
		bankIdx := addr / 10
		offset := addr % 10

		s.banks[bankIdx].mu.Lock()
		remainingInBank := 10 - offset
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

func (s *Server) ConnectionCount() int32 {
	return atomic.LoadInt32(&s.connCount)
}
