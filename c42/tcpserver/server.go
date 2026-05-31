package tcpserver

import (
	"bufio"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"sync"

	"log-cleaner/config"
	"log-cleaner/engine"
)

type Server struct {
	listener   net.Listener
	quit       chan struct{}
	wg         sync.WaitGroup
	processors []Processor
}

type Processor interface {
	Process(data []byte) error
}

func NewServer() *Server {
	return &Server{
		quit: make(chan struct{}),
	}
}

func (s *Server) AddProcessor(p Processor) {
	s.processors = append(s.processors, p)
}

func (s *Server) Start(port int) error {
	ln, err := net.Listen("tcp", fmt.Sprintf(":%d", port))
	if err != nil {
		return err
	}
	s.listener = ln

	log.Printf("TCP server listening on port %d", port)

	go s.acceptLoop()

	return nil
}

func (s *Server) acceptLoop() {
	for {
		select {
		case <-s.quit:
			return
		default:
			conn, err := s.listener.Accept()
			if err != nil {
				select {
				case <-s.quit:
					return
				default:
					log.Printf("Accept error: %v", err)
					continue
				}
			}

			s.wg.Add(1)
			go s.handleConn(conn)
		}
	}
}

func (s *Server) handleConn(conn net.Conn) {
	defer s.wg.Done()
	defer conn.Close()

	clientAddr := conn.RemoteAddr().String()
	log.Printf("New client connected: %s", clientAddr)

	scanner := bufio.NewScanner(conn)
	scanner.Buffer(make([]byte, 1024*1024), 1024*1024)

	ruleEngine := engine.GetRuleEngine()

	for scanner.Scan() {
		data := scanner.Bytes()
		if len(data) == 0 {
			continue
		}

		processedData, ok, _ := ruleEngine.ProcessJSON(data)
		if !ok {
			continue
		}

		for _, p := range s.processors {
			if err := p.Process(processedData); err != nil {
				log.Printf("Processor error: %v", err)
			}
		}
	}

	if err := scanner.Err(); err != nil {
		log.Printf("Scanner error for %s: %v", clientAddr, err)
	}

	log.Printf("Client disconnected: %s", clientAddr)
}

func (s *Server) Stop() {
	close(s.quit)
	if s.listener != nil {
		s.listener.Close()
	}
	s.wg.Wait()
}

func SendLogExample(host string, port int, logData map[string]interface{}) error {
	conn, err := net.Dial("tcp", fmt.Sprintf("%s:%d", host, port))
	if err != nil {
		return err
	}
	defer conn.Close()

	data, err := json.Marshal(logData)
	if err != nil {
		return err
	}

	_, err = conn.Write(append(data, '\n'))
	return err
}
