package main

import (
	"log"
	"net"
	"net/http"
	"os"
	"sync"

	pb "e-commerce-inventory-price/proto/inventory"
	"e-commerce-inventory-price/services/inventory-service/internal/federation"
	"e-commerce-inventory-price/services/inventory-service/internal/handler"
	"e-commerce-inventory-price/services/inventory-service/internal/service"

	"github.com/graphql-go/handler"
	"google.golang.org/grpc"
)

const (
	grpcPort = ":50052"
	httpPort = ":8080"
	graphqlPort = ":4002"
)

func getRedisAddrs() []string {
	addrs := os.Getenv("REDIS_ADDRESSES")
	if addrs == "" {
		return []string{"localhost:6379"}
	}
	return []string{addrs}
}

func main() {
	redisAddrs := getRedisAddrs()

	inventoryService := service.NewInventoryServiceImpl(redisAddrs)

	var wg sync.WaitGroup

	wg.Add(1)
	go func() {
		defer wg.Done()
		startGRPCServer(inventoryService)
	}()

	wg.Add(1)
	go func() {
		defer wg.Done()
		startHTTPServer(redisAddrs)
	}()

	wg.Add(1)
	go func() {
		defer wg.Done()
		startGraphQLServer()
	}()

	wg.Wait()
}

func startGRPCServer(svc pb.InventoryServiceServer) {
	lis, err := net.Listen("tcp", grpcPort)
	if err != nil {
		log.Fatalf("failed to listen for gRPC: %v", err)
	}

	s := grpc.NewServer()
	pb.RegisterInventoryServiceServer(s, svc)

	log.Printf("Inventory gRPC Service starting on port %s", grpcPort)
	if err := s.Serve(lis); err != nil {
		log.Fatalf("failed to serve gRPC: %v", err)
	}
}

func startHTTPServer(redisAddrs []string) {
	conn, err := grpc.Dial("localhost"+grpcPort, grpc.WithInsecure())
	if err != nil {
		log.Fatalf("did not connect: %v", err)
	}
	defer conn.Close()

	client := pb.NewInventoryServiceClient(conn)
	httpHandler := handler.NewHTTPHandler(client)

	mux := http.NewServeMux()
	mux.HandleFunc("/reserve", httpHandler.Reserve)

	log.Printf("Inventory HTTP Service starting on port %s", httpPort)
	if err := http.ListenAndServe(httpPort, mux); err != nil {
		log.Fatalf("failed to serve HTTP: %v", err)
	}
}

func startGraphQLServer() {
	conn, err := grpc.Dial("localhost"+grpcPort, grpc.WithInsecure())
	if err != nil {
		log.Fatalf("failed to connect to inventory gRPC: %v", err)
	}
	defer conn.Close()

	inventoryClient := pb.NewInventoryServiceClient(conn)
	inventoryFederation := federation.NewInventoryService(inventoryClient)

	graphqlSchema, err := inventoryFederation.BuildSchema()
	if err != nil {
		log.Fatalf("failed to build inventory federation schema: %v", err)
	}

	h := handler.New(&handler.Config{
		Schema:   &graphqlSchema,
		Pretty:   true,
		GraphiQL: true,
	})

	http.Handle("/graphql", h)

	log.Printf("Inventory GraphQL Federation Service starting on port %s", graphqlPort)
	if err := http.ListenAndServe(graphqlPort, nil); err != nil {
		log.Fatalf("failed to serve GraphQL: %v", err)
	}
}
