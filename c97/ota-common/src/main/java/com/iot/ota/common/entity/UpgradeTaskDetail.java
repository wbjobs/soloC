package com.iot.ota.common.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;
import java.util.Date;

@Data
@TableName("t_upgrade_task_detail")
public class UpgradeTaskDetail implements Serializable {
    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long id;
    private String taskId;
    private String deviceKey;
    private Long firmwareId;
    private String firmwareVersion;
    private Integer status;
    private Integer progress;
    private Integer retryTimes;
    private String errorCode;
    private String errorMsg;
    private Date startTime;
    private Date endTime;
    private Date createTime;
    private Date updateTime;
}
