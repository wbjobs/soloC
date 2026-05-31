package routes

import (
	"clipboard-sync/controllers"
	"clipboard-sync/middleware"

	"github.com/gin-gonic/gin"
)

func SetupRoutes(r *gin.Engine) {
	api := r.Group("/api")
	{
		auth := api.Group("/auth")
		{
			auth.POST("/register", controllers.Register)
			auth.POST("/login", controllers.Login)
			auth.GET("/profile", middleware.AuthMiddleware(), controllers.GetProfile)
		}

		devices := api.Group("/devices")
		devices.Use(middleware.AuthMiddleware())
		{
			devices.POST("/", controllers.RegisterDevice)
			devices.GET("/", controllers.GetDevices)
			devices.PUT("/:uuid", controllers.UpdateDevice)
			devices.DELETE("/:uuid", controllers.DeleteDevice)
		}

		clipboard := api.Group("/clipboard")
		clipboard.Use(middleware.AuthMiddleware())
		{
			clipboard.POST("/", controllers.CreateClipboardData)
			clipboard.GET("/", controllers.GetClipboardData)
			clipboard.GET("/tags", controllers.GetAllTags)
			clipboard.PUT("/:data_id/tags", controllers.UpdateClipboardTags)
			clipboard.POST("/sync", controllers.SyncClipboardData)
			clipboard.DELETE("/:data_id", controllers.DeleteClipboardData)
		}
	}
}
