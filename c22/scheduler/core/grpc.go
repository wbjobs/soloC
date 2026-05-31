package core

import (
	"sync"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

var (
	connPool = make(map[string]*grpc.ClientConn)
	poolMu   sync.RWMutex
)

func getExecutorClient(address string) (*grpc.ClientConn, error) {
	poolMu.RLock()
	if conn, exists := connPool[address]; exists {
		poolMu.RUnlock()
		return conn, nil
	}
	poolMu.RUnlock()

	conn, err := grpc.Dial(address, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		return nil, err
	}

	poolMu.Lock()
	connPool[address] = conn
	poolMu.Unlock()

	return conn, nil
}

func closeAllConnections() {
	poolMu.Lock()
	defer poolMu.Unlock()

	for addr, conn := range connPool {
		conn.Close()
		delete(connPool, addr)
	}
}
