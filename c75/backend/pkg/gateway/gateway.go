package gateway

import (
	"database/sql"
	"fmt"
	"plc-gateway/pkg/database"
	"plc-gateway/pkg/modbus"
	"plc-gateway/pkg/opcua"
	"sync"
	"sync/atomic"
	"time"
)

const (
	batchSize      = 20
	maxLogQueue    = 1000
	syncInterval   = 200 * time.Millisecond
)

type Gateway struct {
	modbusServer *modbus.Server
	opcuaServer  *opcua.Server
	db           *sql.DB
	running      int32
	logChan      chan *database.ConversionLog
	logWg        sync.WaitGroup
}

func NewGateway(modbusServer *modbus.Server, opcuaServer *opcua.Server, db *sql.DB) *Gateway {
	return &Gateway{
		modbusServer: modbusServer,
		opcuaServer:  opcuaServer,
		db:           db,
		running:      0,
		logChan:      make(chan *database.ConversionLog, maxLogQueue),
	}
}

func (g *Gateway) Start() {
	atomic.StoreInt32(&g.running, 1)
	
	g.logWg.Add(1)
	go g.logWriter()

	ticker := time.NewTicker(syncInterval)
	defer ticker.Stop()

	lastValues := make([]uint16, 100)
	currentValues, _ := g.modbusServer.BatchReadRegisters(0, 100)
	copy(lastValues, currentValues)

	for atomic.LoadInt32(&g.running) == 1 {
		<-ticker.C

		currentValues, err := g.modbusServer.BatchReadRegisters(0, 100)
		if err != nil {
			continue
		}

		var changedRegisters []int
		var changedValues []uint16
		var oldValues []uint16

		for i := 0; i < 100; i++ {
			if currentValues[i] != lastValues[i] {
				changedRegisters = append(changedRegisters, i)
				changedValues = append(changedValues, currentValues[i])
				oldValues = append(oldValues, lastValues[i])
				lastValues[i] = currentValues[i]
			}
		}

		if len(changedRegisters) > 0 {
			g.batchUpdateOPCUA(changedRegisters, changedValues)
			g.batchLogConversion("Modbus->OPCUA", changedRegisters, oldValues, changedValues)
		}

		opcuaValues := g.opcuaServer.GetAllRegisters()
		
		var opcuaChangedRegisters []int
		var opcuaChangedValues []uint16
		var opcuaOldValues []uint16

		for i := 0; i < 100; i++ {
			if opcuaValues[i] != currentValues[i] {
				opcuaChangedRegisters = append(opcuaChangedRegisters, i)
				opcuaChangedValues = append(opcuaChangedValues, opcuaValues[i])
				opcuaOldValues = append(opcuaOldValues, currentValues[i])
			}
		}

		if len(opcuaChangedRegisters) > 0 {
			g.batchWriteModbus(opcuaChangedRegisters, opcuaChangedValues)
			g.batchLogConversion("OPCUA->Modbus", opcuaChangedRegisters, opcuaOldValues, opcuaChangedValues)
		}
	}
}

func (g *Gateway) batchUpdateOPCUA(registers []int, values []uint16) {
	if len(registers) == 0 {
		return
	}

	start := registers[0]
	end := registers[len(registers)-1]
	consecutive := true

	for i := 1; i < len(registers); i++ {
		if registers[i] != registers[i-1]+1 {
			consecutive = false
			break
		}
	}

	if consecutive && end-start+1 == len(values) {
		g.opcuaServer.BatchUpdateRegisters(start, values)
	} else {
		for i := 0; i < len(registers); i += batchSize {
			end := i + batchSize
			if end > len(registers) {
				end = len(registers)
			}

			for j := i; j < end; j++ {
				g.opcuaServer.UpdateRegister(registers[j], values[j])
			}
		}
	}
}

func (g *Gateway) batchWriteModbus(registers []int, values []uint16) {
	if len(registers) == 0 {
		return
	}

	start := registers[0]
	end := registers[len(registers)-1]
	consecutive := true

	for i := 1; i < len(registers); i++ {
		if registers[i] != registers[i-1]+1 {
			consecutive = false
			break
		}
	}

	if consecutive && end-start+1 == len(values) {
		g.modbusServer.BatchWriteRegisters(start, values)
	} else {
		for i := 0; i < len(registers); i++ {
			g.modbusServer.SetRegister(registers[i], values[i])
		}
	}
}

func (g *Gateway) batchLogConversion(direction string, registers []int, oldValues, newValues []uint16) {
	for i := range registers {
		log := &database.ConversionLog{
			Timestamp:  time.Now(),
			Direction:  direction,
			Register:   registers[i],
			OldValue:   uint64(oldValues[i]),
			NewValue:   uint64(newValues[i]),
			Successful: true,
		}

		select {
		case g.logChan <- log:
		default:
		}
	}
}

func (g *Gateway) logWriter() {
	defer g.logWg.Done()

	ticker := time.NewTicker(100 * time.Millisecond)
	defer ticker.Stop()

	var logs []*database.ConversionLog

	for {
		select {
		case log := <-g.logChan:
			logs = append(logs, log)
			if len(logs) >= 50 {
				g.flushLogs(logs)
				logs = logs[:0]
			}
		case <-ticker.C:
			if len(logs) > 0 {
				g.flushLogs(logs)
				logs = logs[:0]
			}
		case <-time.After(1 * time.Second):
			if atomic.LoadInt32(&g.running) == 0 {
				if len(logs) > 0 {
					g.flushLogs(logs)
				}
				return
			}
		}
	}
}

func (g *Gateway) flushLogs(logs []*database.ConversionLog) {
	tx, err := g.db.Begin()
	if err != nil {
		return
	}
	defer tx.Rollback()

	stmt, err := tx.Prepare(`
		INSERT INTO conversion_logs (timestamp, direction, register, old_value, new_value, successful)
		VALUES (?, ?, ?, ?, ?, ?)
	`)
	if err != nil {
		return
	}
	defer stmt.Close()

	for _, log := range logs {
		_, err := stmt.Exec(
			log.Timestamp,
			log.Direction,
			log.Register,
			log.OldValue,
			log.NewValue,
			log.Successful,
		)
		if err != nil {
			return
		}
	}

	tx.Commit()
}

func (g *Gateway) Stop() {
	atomic.StoreInt32(&g.running, 0)
	g.logWg.Wait()
}

func (g *Gateway) ManualWrite(register int, value uint16) error {
	if register < 0 || register >= 100 {
		return fmt.Errorf("register index out of range")
	}

	oldValue := g.modbusServer.GetRegister(register)
	g.modbusServer.SetRegister(register, value)
	g.opcuaServer.UpdateRegister(register, value)

	log := &database.ConversionLog{
		Timestamp:  time.Now(),
		Direction:  "Manual",
		Register:   register,
		OldValue:   uint64(oldValue),
		NewValue:   uint64(value),
		Successful: true,
	}

	select {
	case g.logChan <- log:
	default:
	}

	return nil
}

func (g *Gateway) GetRegisterValue(register int) (uint16, error) {
	if register < 0 || register >= 100 {
		return 0, fmt.Errorf("register index out of range")
	}
	return g.modbusServer.GetRegister(register), nil
}

func (g *Gateway) GetAllRegisterValues() []uint16 {
	values, _ := g.modbusServer.BatchReadRegisters(0, 100)
	return values
}
