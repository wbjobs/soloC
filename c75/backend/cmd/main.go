package main

import (
	"fmt"
	"log"
	"os"
	"os/signal"
	"plc-gateway/pkg/api"
	"plc-gateway/pkg/database"
	"plc-gateway/pkg/gateway"
	"plc-gateway/pkg/modbus"
	"plc-gateway/pkg/opcua"
	"syscall"
)

func main() {
	fmt.Println("=== PLC Gateway ===")
	fmt.Println("Starting Modbus TCP Slave, OPC UA Server, and Web UI...")

	db, err := database.InitDB("plc_gateway.db")
	if err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}
	defer db.Close()

	modbusServer := modbus.NewServer(502)
	opcuaServer := opcua.NewServer("opc.tcp://0.0.0.0:4840")

	protocolGateway := gateway.NewGateway(modbusServer, opcuaServer, db)

	apiServer := api.NewServer(":8080", modbusServer, db, protocolGateway)

	go func() {
		if err := modbusServer.Start(); err != nil {
			log.Printf("Modbus server error: %v", err)
		}
	}()
	fmt.Println("Modbus TCP Slave started on port 502")

	go func() {
		if err := opcuaServer.Start(); err != nil {
			log.Printf("OPC UA server error: %v", err)
		}
	}()
	fmt.Println("OPC UA Server started on opc.tcp://0.0.0.0:4840")

	go protocolGateway.Start()
	fmt.Println("Protocol Gateway started")

	go func() {
		if err := apiServer.Start(); err != nil {
			log.Printf("API server error: %v", err)
		}
	}()
	fmt.Println("Web UI & API started on http://localhost:8080")

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	<-sigChan

	fmt.Println("\nShutting down...")
	modbusServer.Stop()
	opcuaServer.Stop()
	protocolGateway.Stop()
	fmt.Println("Stopped successfully")
}
