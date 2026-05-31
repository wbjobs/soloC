CREATE DATABASE IF NOT EXISTS scheduler DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE scheduler;

CREATE TABLE IF NOT EXISTS tasks (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  type INT NOT NULL,
  cron_expression VARCHAR(255),
  delay_seconds BIGINT,
  payload TEXT,
  max_retry_count INT DEFAULT 0,
  retry_interval_seconds INT DEFAULT 10,
  status INT DEFAULT 1,
  retry_count INT DEFAULT 0,
  scheduled_at DATETIME,
  executor_id VARCHAR(64),
  created_at DATETIME,
  updated_at DATETIME,
  deleted_at DATETIME,
  INDEX idx_status (status),
  INDEX idx_type (type),
  INDEX idx_scheduled_at (scheduled_at),
  INDEX idx_created_at (created_at),
  INDEX idx_deleted_at (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS task_logs (
  id VARCHAR(64) PRIMARY KEY,
  task_id VARCHAR(64) NOT NULL,
  executor_id VARCHAR(64),
  status INT NOT NULL,
  message TEXT,
  started_at DATETIME,
  finished_at DATETIME,
  retry_count INT DEFAULT 0,
  created_at DATETIME,
  updated_at DATETIME,
  deleted_at DATETIME,
  INDEX idx_task_id (task_id),
  INDEX idx_executor_id (executor_id),
  INDEX idx_status (status),
  INDEX idx_created_at (created_at),
  INDEX idx_deleted_at (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS executors (
  id VARCHAR(64) PRIMARY KEY,
  address VARCHAR(255) NOT NULL,
  status INT DEFAULT 1,
  max_concurrent_tasks INT DEFAULT 10,
  current_tasks INT DEFAULT 0,
  supported_task_types VARCHAR(512),
  last_heartbeat_at DATETIME,
  created_at DATETIME,
  updated_at DATETIME,
  deleted_at DATETIME,
  INDEX idx_status (status),
  INDEX idx_last_heartbeat_at (last_heartbeat_at),
  INDEX idx_deleted_at (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
