package main

import (
	"log"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	clientv3 "go.etcd.io/etcd/client/v3"
)

func main() {
	config := LoadConfig()

	_, err := InitDB()
	if err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}

	etcdClient, err := clientv3.New(clientv3.Config{
		Endpoints: config.EtcdEndpoints,
	})
	if err != nil {
		log.Fatalf("Failed to connect to etcd: %v", err)
	}
	defer etcdClient.Close()

	handler := NewHandler(etcdClient, config)
	synchronizer := NewSynchronizer(etcdClient, config)
	synchronizer.Start()

	r := gin.Default()

	r.Use(cors.New(cors.Config{
		AllowOrigins:     []string{"*"},
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"*"},
		AllowCredentials: true,
	}))

	api := r.Group("/api/v1")
	{
		tasks := api.Group("/tasks")
		{
			tasks.POST("", handler.CreateTask)
			tasks.GET("", handler.ListTasks)
			tasks.GET("/:id", handler.GetTask)
			tasks.PUT("/:id", handler.UpdateTask)
			tasks.DELETE("/:id", handler.DeleteTask)
			tasks.GET("/:id/logs", handler.GetTaskLogs)
		}

		nodes := api.Group("/nodes")
		{
			nodes.GET("", handler.ListNodes)
			nodes.GET("/:id", handler.GetNode)
		}

		dashboard := api.Group("/dashboard")
		{
			dashboard.GET("", handler.GetDashboard)
			dashboard.GET("/task-stats", handler.GetTaskStats)
			dashboard.GET("/node-stats", handler.GetNodeStats)
		}

		api.POST("/sync", handler.SyncTasksFromEtcd)
	}

	log.Printf("API server starting on %s", config.APIAddress)
	if err := r.Run(config.APIAddress); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
