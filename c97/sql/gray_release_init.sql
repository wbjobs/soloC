-- 灰度发布相关表
USE iot_ota;

-- 灰度发布策略表
CREATE TABLE IF NOT EXISTS t_gray_strategy (
    id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    strategy_name VARCHAR(100) NOT NULL COMMENT '策略名称',
    firmware_id BIGINT NOT NULL COMMENT '固件ID',
    firmware_version VARCHAR(50) NOT NULL COMMENT '固件版本',
    product_key VARCHAR(50) NOT NULL COMMENT '产品标识',
    status TINYINT DEFAULT 0 COMMENT '状态 0-草稿 1-启用 2-暂停 3-完成',
    strategy_type TINYINT NOT NULL COMMENT '策略类型 1-按分组 2-按地区 3-按比例 4-按设备列表',
    target_value TEXT COMMENT '目标值(JSON格式)',
    gray_percent INT COMMENT '灰度百分比(0-100)',
    batch_count INT DEFAULT 1 COMMENT '分批数量',
    current_batch INT DEFAULT 0 COMMENT '当前批次',
    batch_interval_hours INT DEFAULT 24 COMMENT '批次间隔(小时)',
    success_rate_threshold DECIMAL(5,2) DEFAULT 95.00 COMMENT '继续下一批次的成功率阈值(%)',
    enable_auto_rollback TINYINT DEFAULT 1 COMMENT '是否启用自动回滚 0-否 1-是',
    rollback_threshold DECIMAL(5,2) DEFAULT 30.00 COMMENT '自动回滚失败率阈值(%)',
    start_time DATETIME COMMENT '开始时间',
    end_time DATETIME COMMENT '结束时间',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    INDEX idx_product_key (product_key),
    INDEX idx_status (status),
    INDEX idx_firmware_id (firmware_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='灰度发布策略表';

-- 灰度发布批次表
CREATE TABLE IF NOT EXISTS t_gray_batch (
    id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    strategy_id BIGINT NOT NULL COMMENT '策略ID',
    batch_no INT NOT NULL COMMENT '批次号',
    batch_name VARCHAR(100) COMMENT '批次名称',
    device_count INT DEFAULT 0 COMMENT '设备数量',
    status TINYINT DEFAULT 0 COMMENT '状态 0-待执行 1-执行中 2-完成 3-失败 4-已回滚',
    target_condition TEXT COMMENT '目标条件(JSON)',
    start_time DATETIME COMMENT '开始时间',
    end_time DATETIME COMMENT '结束时间',
    success_count INT DEFAULT 0 COMMENT '成功数量',
    failed_count INT DEFAULT 0 COMMENT '失败数量',
    success_rate DECIMAL(5,2) COMMENT '成功率(%)',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    INDEX idx_strategy_id (strategy_id),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='灰度发布批次表';

-- 灰度设备关联表
CREATE TABLE IF NOT EXISTS t_gray_device (
    id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    strategy_id BIGINT NOT NULL COMMENT '策略ID',
    batch_id BIGINT NOT NULL COMMENT '批次ID',
    device_key VARCHAR(64) NOT NULL COMMENT '设备标识',
    status TINYINT DEFAULT 0 COMMENT '状态 0-待升级 1-升级中 2-成功 3-失败 4-已回滚',
    progress INT DEFAULT 0 COMMENT '升级进度',
    error_code VARCHAR(50) COMMENT '错误码',
    error_msg VARCHAR(500) COMMENT '错误信息',
    upgrade_time DATETIME COMMENT '升级时间',
    complete_time DATETIME COMMENT '完成时间',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    UNIQUE KEY uk_strategy_device (strategy_id, device_key),
    INDEX idx_device_key (device_key),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='灰度发布设备关联表';

-- CDN节点配置表
CREATE TABLE IF NOT EXISTS t_cdn_node (
    id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    node_name VARCHAR(100) NOT NULL COMMENT '节点名称',
    node_code VARCHAR(50) NOT NULL UNIQUE COMMENT '节点编码',
    region VARCHAR(100) COMMENT '所属地区',
    node_type TINYINT DEFAULT 1 COMMENT '节点类型 1-边缘节点 2-中心节点',
    base_url VARCHAR(255) NOT NULL COMMENT '节点基础URL',
    status TINYINT DEFAULT 1 COMMENT '状态 0-禁用 1-启用',
    capacity_gb INT COMMENT '存储容量(GB)',
    bandwidth_mbps INT COMMENT '带宽(Mbps)',
    priority INT DEFAULT 100 COMMENT '优先级(数字越小优先级越高)',
    health_check_url VARCHAR(255) COMMENT '健康检查URL',
    last_health_check DATETIME COMMENT '最后健康检查时间',
    health_status TINYINT DEFAULT 1 COMMENT '健康状态 0-不健康 1-健康',
    cache_hit_rate DECIMAL(5,2) COMMENT '缓存命中率(%)',
    total_traffic_gb DECIMAL(12,2) DEFAULT 0 COMMENT '总流量(GB)',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    INDEX idx_region (region),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='CDN节点配置表';

-- 固件CDN缓存表
CREATE TABLE IF NOT EXISTS t_firmware_cdn_cache (
    id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    firmware_id BIGINT NOT NULL COMMENT '固件ID',
    firmware_version VARCHAR(50) NOT NULL COMMENT '固件版本',
    node_id BIGINT NOT NULL COMMENT 'CDN节点ID',
    node_code VARCHAR(50) NOT NULL COMMENT '节点编码',
    cache_url VARCHAR(255) NOT NULL COMMENT '缓存URL',
    file_size BIGINT COMMENT '文件大小',
    md5_hash VARCHAR(32) COMMENT 'MD5哈希',
    status TINYINT DEFAULT 1 COMMENT '状态 0-已失效 1-有效 2-预热中',
    hit_count BIGINT DEFAULT 0 COMMENT '命中次数',
    last_access_time DATETIME COMMENT '最后访问时间',
    expire_time DATETIME COMMENT '过期时间',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    UNIQUE KEY uk_firmware_node (firmware_id, node_id),
    INDEX idx_node_id (node_id),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='固件CDN缓存表';

-- 升级分析报表表
CREATE TABLE IF NOT EXISTS t_upgrade_analysis_report (
    id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    report_type TINYINT NOT NULL COMMENT '报表类型 1-日报 2-周报 3-月报 4-任务报表',
    report_date DATE NOT NULL COMMENT '报表日期',
    product_key VARCHAR(50) COMMENT '产品标识',
    task_id VARCHAR(64) COMMENT '任务ID(任务报表专用)',
    strategy_id BIGINT COMMENT '灰度策略ID(灰度报表专用)',
    total_devices INT DEFAULT 0 COMMENT '总设备数',
    attempted_devices INT DEFAULT 0 COMMENT '尝试升级设备数',
    success_devices INT DEFAULT 0 COMMENT '成功设备数',
    failed_devices INT DEFAULT 0 COMMENT '失败设备数',
    success_rate DECIMAL(5,2) COMMENT '成功率(%)',
    avg_download_speed_kbps DECIMAL(10,2) COMMENT '平均下载速度(kbps)',
    avg_upgrade_duration_sec INT COMMENT '平均升级时长(秒)',
    total_traffic_gb DECIMAL(12,2) COMMENT '总流量(GB)',
    failure_analysis TEXT COMMENT '失败原因分析(JSON)',
    top_error_codes TEXT COMMENT 'Top错误码统计(JSON)',
    region_analysis TEXT COMMENT '地区维度分析(JSON)',
    version_analysis TEXT COMMENT '版本维度分析(JSON)',
    recommendations TEXT COMMENT '优化建议',
    status TINYINT DEFAULT 1 COMMENT '状态 0-草稿 1-已生成',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    UNIQUE KEY uk_report_date_type (report_date, report_type, product_key),
    INDEX idx_task_id (task_id),
    INDEX idx_strategy_id (strategy_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='升级分析报表表';

-- 升级错误码字典表
CREATE TABLE IF NOT EXISTS t_upgrade_error_code (
    id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    error_code VARCHAR(50) NOT NULL UNIQUE COMMENT '错误码',
    error_name VARCHAR(100) NOT NULL COMMENT '错误名称',
    error_category VARCHAR(50) NOT NULL COMMENT '错误分类 NETWORK-网络 DEVICE-设备 SERVER-服务端 FIRMWARE-固件',
    description VARCHAR(500) COMMENT '错误描述',
    solution VARCHAR(1000) COMMENT '解决方案',
    is_auto_retry TINYINT DEFAULT 1 COMMENT '是否可自动重试 0-否 1-是',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='升级错误码字典表';

-- 初始化错误码数据
INSERT INTO t_upgrade_error_code (error_code, error_name, error_category, description, solution, is_auto_retry) VALUES
('NETWORK_DISCONNECTED', '网络连接断开', 'NETWORK', '设备在升级过程中WiFi连接断开', '检查网络信号强度，增加重试机制', 1),
('NETWORK_TIMEOUT', '网络超时', 'NETWORK', '下载固件时连接超时或读取超时', '检查网络带宽，增加超时时间，使用断点续传', 1),
('DOWNLOAD_FAILED', '下载失败', 'NETWORK', '固件文件下载失败', '检查CDN节点状态，验证固件文件完整性', 1),
('MD5_MISMATCH', 'MD5校验失败', 'FIRMWARE', '下载的固件MD5与预期不符', '重新下载，检查固件文件是否损坏', 1),
('INSUFFICIENT_STORAGE', '存储空间不足', 'DEVICE', '设备Flash存储空间不足', '清理设备存储空间，检查固件大小', 0),
('BATTERY_LOW', '电量不足', 'DEVICE', '设备电池电量过低无法完成升级', '提示用户充电后再升级', 0),
('INVALID_FIRMWARE', '无效固件', 'FIRMWARE', '固件格式错误或不兼容该设备', '检查固件版本与设备兼容性', 0),
('UPDATE_FAILED', '升级执行失败', 'DEVICE', 'OTA升级过程中写入Flash失败', '重启设备后重试，检查Flash健康状态', 1),
('REBOOT_FAILED', '重启失败', 'DEVICE', '升级完成后设备重启失败', '需要人工干预检查设备状态', 0),
('SERVER_ERROR', '服务端错误', 'SERVER', '服务端返回500错误', '检查服务端日志，联系运维人员', 1),
('MAX_RETRY_REACHED', '达到最大重试次数', 'SERVER', '设备升级失败次数超过限制', '需要人工干预或重新发起升级任务', 0),
('CDN_MISS', 'CDN缓存未命中', 'NETWORK', 'CDN节点无该固件缓存，回源获取', '优化缓存预热策略', 1);
