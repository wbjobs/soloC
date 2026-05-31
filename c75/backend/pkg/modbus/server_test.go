package modbus

import (
	"net"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func BenchmarkModbusConcurrentRead(b *testing.B) {
	server := NewServer(1502)
	defer server.Stop()

	go server.Start()
	time.Sleep(100 * time.Millisecond)

	var wg sync.WaitGroup
	var successCount int32
	var timeoutCount int32

	concurrentClients := 50
	requestsPerClient := b.N / concurrentClients

	b.ResetTimer()

	for i := 0; i < concurrentClients; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()

			conn, err := net.Dial("tcp", "localhost:1502")
			if err != nil {
				atomic.AddInt32(&timeoutCount, int32(requestsPerClient))
				return
			}
			defer conn.Close()

			req := makeReadRequest(0, 50)

			for j := 0; j < requestsPerClient; j++ {
				conn.SetWriteDeadline(time.Now().Add(100 * time.Millisecond))
				_, err := conn.Write(req)
				if err != nil {
					atomic.AddInt32(&timeoutCount, 1)
					continue
				}

				resp := make([]byte, 256)
				conn.SetReadDeadline(time.Now().Add(100 * time.Millisecond))
				_, err = conn.Read(resp)
				if err != nil {
					atomic.AddInt32(&timeoutCount, 1)
					continue
				}

				atomic.AddInt32(&successCount, 1)
			}
		}()
	}

	wg.Wait()

	total := successCount + timeoutCount
	timeoutRate := float64(timeoutCount) / float64(total) * 100

	b.Logf("Total requests: %d", total)
	b.Logf("Success: %d", successCount)
	b.Logf("Timeout: %d", timeoutCount)
	b.Logf("Timeout rate: %.2f%%", timeoutRate)

	if timeoutRate > 5 {
		b.Errorf("Timeout rate too high: %.2f%% (expected < 5%%)", timeoutRate)
	}
}

func BenchmarkModbusBatchRead(b *testing.B) {
	server := NewServer(1503)
	defer server.Stop()

	go server.Start()
	time.Sleep(100 * time.Millisecond)

	b.ResetTimer()

	for i := 0; i < b.N; i++ {
		_, err := server.BatchReadRegisters(0, 100)
		if err != nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkModbusSingleRead(b *testing.B) {
	server := NewServer(1504)
	defer server.Stop()

	go server.Start()
	time.Sleep(100 * time.Millisecond)

	b.ResetTimer()

	for i := 0; i < b.N; i++ {
		for j := 0; j < 100; j++ {
			server.GetRegister(j)
		}
	}
}

func makeReadRequest(startAddr, quantity int) []byte {
	req := make([]byte, 12)
	req[0] = 0x00
	req[1] = 0x01
	req[2] = 0x00
	req[3] = 0x00
	req[4] = 0x00
	req[5] = 0x06
	req[6] = 0x01
	req[7] = 0x03
	req[8] = byte(startAddr >> 8)
	req[9] = byte(startAddr & 0xFF)
	req[10] = byte(quantity >> 8)
	req[11] = byte(quantity & 0xFF)
	return req
}
