package main

import (
	"log"
	"os"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

var db *gorm.DB
var minioClient *MinIOClient

func main() {
	if err := godotenv.Load(); err != nil {
		log.Println("警告: 未找到 .env 文件，使用默认配置")
	}

	initDB()
	initMinIO()

	r := gin.Default()

	r.MaxMultipartMemory = 1024 * 1024 * 1024
	r.Use(CORS())

	api := r.Group("/api")
	{
		api.POST("/upload", uploadRecording)
		api.GET("/download/:id", downloadRecording)
		api.GET("/download-stream/:id", downloadRecordingStream)
		api.GET("/header/:id", getRecordingHeader)
		api.GET("/recordings", listRecordings)
		api.GET("/recordings/:id", getRecording)
		api.DELETE("/recordings/:id", deleteRecording)
		api.POST("/share/:id", createShareLink)
		api.GET("/share/:token", accessShareLink)
		api.GET("/search", searchRecordings)

		api.POST("/recordings/:id/permissions", setRecordingPermissions)
		api.POST("/recordings/:id/annotations", addAnnotation)
		api.GET("/recordings/:id/annotations", getAnnotations)
		api.DELETE("/recordings/:id/annotations/:annotation_id", deleteAnnotation)
		api.POST("/recordings/:id/trim", trimRecording)
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("服务器启动在端口 %s", port)
	log.Fatal(r.Run(":" + port))
}

func initDB() {
	var err error
	db, err = gorm.Open(sqlite.Open("termrec.db"), &gorm.Config{})
	if err != nil {
		log.Fatal("数据库连接失败:", err)
	}

	db.AutoMigrate(&Recording{}, &ShareToken{})
}

func CORS() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}

		c.Next()
	}
}
