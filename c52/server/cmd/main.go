package main

import (
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"edge-server/internal/api"
	"edge-server/internal/database"
	grpcsrv "edge-server/internal/grpc"
	pb "edge-server/proto"
	"github.com/gin-gonic/gin"
	"github.com/spf13/viper"
	"google.golang.org/grpc"
	"google.golang.org/grpc/reflection"
)

func main() {
	viper.SetConfigName("config")
	viper.SetConfigType("yaml")
	viper.AddConfigPath("./configs")
	viper.AddConfigPath(".")

	viper.SetDefault("grpc_port", 50051)
	viper.SetDefault("http_port", 8080)
	viper.SetDefault("heartbeat_interval", 30)
	viper.SetDefault("db_host", "localhost")
	viper.SetDefault("db_port", 5432)
	viper.SetDefault("db_user", "postgres")
	viper.SetDefault("db_password", "postgres")
	viper.SetDefault("db_name", "edge_server")
	viper.SetDefault("db_sslmode", "disable")

	if err := viper.ReadInConfig(); err != nil {
		log.Printf("Warning: Config file not found, using defaults: %v", err)
	}

	dbConfig := database.Config{
		Host:     viper.GetString("db_host"),
		Port:     viper.GetInt("db_port"),
		User:     viper.GetString("db_user"),
		Password: viper.GetString("db_password"),
		DBName:   viper.GetString("db_name"),
		SSLMode:  viper.GetString("db_sslmode"),
	}

	if err := database.Init(dbConfig); err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}

	grpcServer := grpcsrv.NewServer(viper.GetInt64("heartbeat_interval"))

	lis, err := net.Listen("tcp", ":"+viper.GetString("grpc_port"))
	if err != nil {
		log.Fatalf("Failed to listen: %v", err)
	}

	s := grpc.NewServer()
	pb.RegisterEdgeServiceServer(s, grpcServer)
	reflection.Register(s)

	go func() {
		log.Printf("gRPC server listening on port %s", viper.GetString("grpc_port"))
		if err := s.Serve(lis); err != nil {
			log.Fatalf("Failed to serve gRPC: %v", err)
		}
	}()

	r := gin.Default()
	handler := api.NewHandler(grpcServer)

	apiGroup := r.Group("/api/v1")
	{
		apiGroup.GET("/nodes", handler.GetNodes)
		apiGroup.GET("/nodes/:node_id", handler.GetNode)
		apiGroup.GET("/nodes/:node_id/config", handler.GetNodeConfig)
		apiGroup.PUT("/nodes/:node_id/config", handler.UpdateNodeConfig)
		apiGroup.GET("/nodes/:node_id/config/history", handler.GetNodeConfigHistory)
		apiGroup.GET("/nodes/:node_id/config/versions/:version", handler.GetConfigVersionDetail)
		apiGroup.POST("/nodes/:node_id/config/rollback", handler.RollbackConfig)
		apiGroup.POST("/nodes/:node_id/config/diff", handler.CompareConfigs)
		apiGroup.GET("/nodes/:node_id/heartbeats", handler.GetNodeHeartbeats)
	}

	go func() {
		log.Printf("HTTP server listening on port %s", viper.GetString("http_port"))
		if err := http.ListenAndServe(":"+viper.GetString("http_port"), r); err != nil {
			log.Fatalf("Failed to serve HTTP: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down servers...")
	s.GracefulStop()
	log.Println("Servers stopped")
}
