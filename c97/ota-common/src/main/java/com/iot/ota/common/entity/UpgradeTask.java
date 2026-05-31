package com.iot.ota.common.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;
import java.util.Date;

@Data
@TableName("t_upgrade_task")
public class UpgradeTask implements Serializable {
    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long id;
    private String taskId;
    private String taskName;
    private Long firmwareId;
    private String productKey;
    private Integer targetType;
    private String targetIds;
    private Integer deviceCount;
    private Integer successCount;
    private Integer failedCount;
    private Integer upgradingCount;
    private Integer status;
    private Integer upgradeStrategy;
    private Date scheduleTime;
    private Integer maxRetryTimes;
    private Date createTime;
    private Date updateTime;
}
