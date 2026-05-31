-- 创建数据库
CREATE DATABASE IF NOT EXISTS iot_ota DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE iot_ota;

-- 固件表
CREATE TABLE IF NOT EXISTS t_firmware (
    id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    firmware_name VARCHAR(100) NOT NULL COMMENT '固件名称',
    firmware_version VARCHAR(50) NOT NULL COMMENT '固件版本',
    product_key VARCHAR(50) NOT NULL COMMENT '产品标识',
    firmware_size BIGINT NOT NULL COMMENT '固件大小(字节)',
    firmware_md5 VARCHAR(32) NOT NULL COMMENT '固件MD5',
    firmware_sha256 VARCHAR(64) NOT NULL COMMENT '固件SHA256',
    download_url VARCHAR(255) NOT NULL COMMENT '下载地址',
    file_path VARCHAR(255) NOT NULL COMMENT '文件存储路径',
    status TINYINT DEFAULT 1 COMMENT '状态 0-禁用 1-启用',
    description VARCHAR(500) COMMENT '固件描述',
    release_time DATETIME COMMENT '发布时间',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    UNIQUE KEY uk_product_version (product_key, firmware_version),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='固件信息表';

-- 设备表
CREATE TABLE IF NOT EXISTS t_device (
    id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    device_key VARCHAR(64) NOT NULL UNIQUE COMMENT '设备唯一标识',
    device_name VARCHAR(100) COMMENT '设备名称',
    product_key VARCHAR(50) NOT NULL COMMENT '产品标识',
    current_version VARCHAR(50) COMMENT '当前固件版本',
    target_version VARCHAR(50) COMMENT '目标固件版本',
    group_id BIGINT COMMENT '设备分组ID',
    status TINYINT DEFAULT 1 COMMENT '设备状态 0-离线 1-在线 2-升级中',
    upgrade_status TINYINT DEFAULT 0 COMMENT '升级状态 0-无 1-待升级 2-升级中 3-成功 4-失败',
    last_online_time DATETIME COMMENT '最后在线时间',
    ip_address VARCHAR(50) COMMENT 'IP地址',
    mac_address VARCHAR(50) COMMENT 'MAC地址',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    INDEX idx_device_key (device_key),
    INDEX idx_product_key (product_key),
    INDEX idx_group_id (group_id),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='设备表';

-- 设备分组表
CREATE TABLE IF NOT EXISTS t_device_group (
    id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    group_name VARCHAR(100) NOT NULL COMMENT '分组名称',
    group_desc VARCHAR(500) COMMENT '分组描述',
    product_key VARCHAR(50) NOT NULL COMMENT '产品标识',
    device_count INT DEFAULT 0 COMMENT '设备数量',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    INDEX idx_product_key (product_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='设备分组表';

-- 升级任务表
CREATE TABLE IF NOT EXISTS t_upgrade_task (
    id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    task_id VARCHAR(64) NOT NULL UNIQUE COMMENT '任务ID',
    task_name VARCHAR(100) NOT NULL COMMENT '任务名称',
    firmware_id BIGINT NOT NULL COMMENT '固件ID',
    product_key VARCHAR(50) NOT NULL COMMENT '产品标识',
    target_type TINYINT NOT NULL COMMENT '目标类型 1-全部设备 2-指定分组 3-指定设备',
    target_ids TEXT COMMENT '目标ID列表(JSON)',
    device_count INT DEFAULT 0 COMMENT '设备总数',
    success_count INT DEFAULT 0 COMMENT '成功数量',
    failed_count INT DEFAULT 0 COMMENT '失败数量',
    upgrading_count INT DEFAULT 0 COMMENT '升级中数量',
    status TINYINT DEFAULT 0 COMMENT '任务状态 0-待执行 1-执行中 2-已完成 3-已取消',
    upgrade_strategy TINYINT DEFAULT 1 COMMENT '升级策略 1-立即升级 2-定时升级',
    schedule_time DATETIME COMMENT '定时升级时间',
    max_retry_times INT DEFAULT 3 COMMENT '最大重试次数',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    INDEX idx_task_id (task_id),
    INDEX idx_status (status),
    INDEX idx_product_key (product_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='升级任务表';

-- 升级任务明细表
CREATE TABLE IF NOT EXISTS t_upgrade_task_detail (
    id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    task_id VARCHAR(64) NOT NULL COMMENT '任务ID',
    device_key VARCHAR(64) NOT NULL COMMENT '设备标识',
    firmware_id BIGINT NOT NULL COMMENT '固件ID',
    firmware_version VARCHAR(50) NOT NULL COMMENT '固件版本',
    status TINYINT DEFAULT 0 COMMENT '升级状态 0-待升级 1-升级中 2-成功 3-失败',
    progress INT DEFAULT 0 COMMENT '升级进度 0-100',
    retry_times INT DEFAULT 0 COMMENT '重试次数',
    error_code VARCHAR(50) COMMENT '错误码',
    error_msg VARCHAR(500) COMMENT '错误信息',
    start_time DATETIME COMMENT '开始时间',
    end_time DATETIME COMMENT '结束时间',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    UNIQUE KEY uk_task_device (task_id, device_key),
    INDEX idx_device_key (device_key),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='升级任务明细表';

-- 升级日志表
CREATE TABLE IF NOT EXISTS t_upgrade_log (
    id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    device_key VARCHAR(64) NOT NULL COMMENT '设备标识',
    task_id VARCHAR(64) COMMENT '任务ID',
    firmware_id BIGINT COMMENT '固件ID',
    firmware_version VARCHAR(50) COMMENT '固件版本',
    log_type TINYINT NOT NULL COMMENT '日志类型 1-进度上报 2-状态变更 3-错误日志',
    log_content TEXT COMMENT '日志内容',
    progress INT COMMENT '进度',
    status TINYINT COMMENT '状态',
    client_ip VARCHAR(50) COMMENT '客户端IP',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    INDEX idx_device_key (device_key),
    INDEX idx_task_id (task_id),
    INDEX idx_create_time (create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='升级日志表';
