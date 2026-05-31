package main

import (
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

var DB *gorm.DB

func InitDB() (*gorm.DB, error) {
	dsn := os.Getenv("MYSQL_DSN")
	if dsn == "" {
		dsn = "root:password@tcp(127.0.0.1:3306)/task_scheduler?charset=utf8mb4&parseTime=True&loc=Local"
	}

	db, err := gorm.Open(mysql.Open(dsn), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Info),
	})
	if err != nil {
		return nil, fmt.Errorf("failed to connect to database: %v", err)
	}

	sqlDB, err := db.DB()
	if err != nil {
		return nil, err
	}

	sqlDB.SetMaxIdleConns(10)
	sqlDB.SetMaxOpenConns(100)
	sqlDB.SetConnMaxLifetime(time.Hour)

	err = db.AutoMigrate(&Task{}, &TaskLog{}, &Node{})
	if err != nil {
		return nil, fmt.Errorf("failed to migrate database: %v", err)
	}

	DB = db
	log.Println("Database connected and migrated successfully")
	return db, nil
}

func CreateTask(task *Task) error {
	if len(task.Deps) > 0 {
		task.Dependencies = strings.Join(task.Deps, ",")
	}
	return DB.Create(task).Error
}

func GetTask(id string) (*Task, error) {
	var task Task
	if err := DB.First(&task, "id = ?", id).Error; err != nil {
		return nil, err
	}
	if task.Dependencies != "" {
		task.Deps = strings.Split(task.Dependencies, ",")
	}
	return &task, nil
}

func ListTasks(page, pageSize int) ([]Task, int64, error) {
	var tasks []Task
	var total int64

	DB.Model(&Task{}).Count(&total)
	offset := (page - 1) * pageSize
	err := DB.Order("created_at DESC").Offset(offset).Limit(pageSize).Find(&tasks).Error
	if err != nil {
		return nil, 0, err
	}

	for i := range tasks {
		if tasks[i].Dependencies != "" {
			tasks[i].Deps = strings.Split(tasks[i].Dependencies, ",")
		}
	}

	return tasks, total, nil
}

func UpdateTask(task *Task) error {
	if len(task.Deps) > 0 {
		task.Dependencies = strings.Join(task.Deps, ",")
	}
	return DB.Save(task).Error
}

func DeleteTask(id string) error {
	return DB.Delete(&Task{}, "id = ?", id).Error
}

func GetTaskLogs(taskID string, page, pageSize int, lastID uint) ([]TaskLog, int64, error) {
	var logs []TaskLog
	var total int64

	DB.Model(&TaskLog{}).Where("task_id = ?", taskID).Count(&total)
	
	query := DB.Where("task_id = ?", taskID)
	
	if lastID > 0 {
		query = query.Where("id < ?", lastID)
	} else if page > 1 {
		offset := (page - 1) * pageSize
		query = query.Offset(offset)
	}
	
	err := query.Order("id DESC").Limit(pageSize).Find(&logs).Error

	return logs, total, err
}

func CreateTaskLog(log *TaskLog) error {
	return DB.Create(log).Error
}

func CreateNode(node *Node) error {
	return DB.Create(node).Error
}

func UpdateNode(node *Node) error {
	return DB.Save(node).Error
}

func GetNode(id string) (*Node, error) {
	var node Node
	err := DB.First(&node, "id = ?", id).Error
	if err != nil {
		return nil, err
	}
	return &node, nil
}

func ListNodes() ([]Node, error) {
	var nodes []Node
	err := DB.Find(&nodes).Error
	return nodes, err
}
