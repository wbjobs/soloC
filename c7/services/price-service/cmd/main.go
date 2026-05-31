package main

import (
	"log"
	"net"
	"net/http"
	"sync"

	inventorypb "e-commerce-inventory-price/proto/inventory"
	pb "e-commerce-inventory-price/proto/price"
	"e-commerce-inventory-price/services/price-service/internal/federation"
	"e-commerce-inventory-price/services/price-service/internal/service"

	"github.com/graphql-go/handler"
	"google.golang.org/grpc"
)

const (
	grpcPort          = ":50051"
	graphqlPort       = ":4001"
	inventoryService  = "localhost:50052"
)

func main() {
	inventoryConn, err := grpc.Dial(inventoryService, grpc.WithInsecure())
	if err != nil {
		log.Fatalf("failed to connect to inventory service: %v", err)
	}
	defer inventoryConn.Close()

	inventoryClient := inventorypb.NewInventoryServiceClient(inventoryConn)

	var wg sync.WaitGroup

	wg.Add(1)
	go func() {
		defer wg.Done()
		startGRPCServer(inventoryClient)
	}()

	wg.Add(1)
	go func() {
		defer wg.Done()
		startGraphQLServer()
	}()

	wg.Wait()
}

func startGRPCServer(inventoryClient inventorypb.InventoryServiceClient) {
	lis, err := net.Listen("tcp", grpcPort)
	if err != nil {
		log.Fatalf("failed to listen for gRPC: %v", err)
	}

	priceService := service.NewPriceServiceImpl(inventoryClient)
	s := grpc.NewServer()
	pb.RegisterPriceServiceServer(s, priceService)

	log.Printf("Price gRPC Service starting on port %s", grpcPort)
	if err := s.Serve(lis); err != nil {
		log.Fatalf("failed to serve gRPC: %v", err)
	}
}

func startGraphQLServer() {
	conn, err := grpc.Dial("localhost"+grpcPort, grpc.WithInsecure())
	if err != nil {
		log.Fatalf("failed to connect to price gRPC: %v", err)
	}
	defer conn.Close()

	priceClient := pb.NewPriceServiceClient(conn)
	priceFederation := federation.NewPriceService(priceClient)

	graphqlSchema, err := priceFederation.BuildSchema()
	if err != nil {
		log.Fatalf("failed to build price federation schema: %v", err)
	}

	h := handler.New(&handler.Config{
		Schema:   &graphqlSchema,
		Pretty:   true,
		GraphiQL: true,
	})

	mux := http.NewServeMux()
	mux.Handle("/graphql", h)

	log.Printf("Price GraphQL Federation Service starting on port %s", graphqlPort)
	if err := http.ListenAndServe(graphqlPort, mux); err != nil {
		log.Fatalf("failed to serve GraphQL: %v", err)
	}
}
