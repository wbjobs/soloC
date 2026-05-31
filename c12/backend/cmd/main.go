package main

import (
	"context"
	"fmt"
	"net"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/sirupsen/logrus"
	"google.golang.org/grpc"
	"google.golang.org/grpc/reflection"

	pb "blockchain-monitor/api/gen/monitor"
	"blockchain-monitor/config"
	"blockchain-monitor/manager"
	"blockchain-monitor/server"
	"blockchain-monitor/service"
	"blockchain-monitor/storage"
)

func main() {
	logrus.SetFormatter(&logrus.TextFormatter{
		FullTimestamp: true,
	})
	logrus.SetLevel(logrus.InfoLevel)

	logrus.Info("Starting Blockchain Node Monitor...")

	cfg := config.Load()

	nodeManager := manager.NewNodeManager()

	influxDB := storage.NewInfluxDBStorage(cfg)
	defer influxDB.Close()

	alertService := service.NewAlertService(cfg)
	predictionService := service.NewPredictionService(influxDB)

	collector := service.NewDataCollector(nodeManager, influxDB, alertService, cfg)
	collector.Start()
	defer collector.Stop()

	grpcServer := grpc.NewServer()
	monitorServer := server.NewMonitorServer(nodeManager)
	pb.RegisterMonitorServiceServer(grpcServer, monitorServer)
	reflection.Register(grpcServer)

	grpcListener, err := net.Listen("tcp", ":"+cfg.GRPCPort)
	if err != nil {
		logrus.WithError(err).Fatal("Failed to listen for gRPC")
	}

	go func() {
		logrus.WithField("port", cfg.GRPCPort).Info("gRPC server starting")
		if err := grpcServer.Serve(grpcListener); err != nil {
			logrus.WithError(err).Error("gRPC server error")
		}
	}()

	httpServer := server.NewHTTPServer(nodeManager, predictionService, cfg.HTTPPort)

	go func() {
		if err := httpServer.Start(); err != nil {
			logrus.WithError(err).Error("HTTP server error")
		}
	}()

	logrus.Info("Blockchain Node Monitor started successfully")

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	<-sigChan
	logrus.Info("Shutting down...")

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()

	grpcServer.GracefulStop()
	httpServer.Stop(shutdownCtx)

	logrus.Info("Shutdown complete")
}
