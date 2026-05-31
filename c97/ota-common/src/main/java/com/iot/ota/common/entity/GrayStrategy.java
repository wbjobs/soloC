package com.iot.ota.common.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;
import java.math.BigDecimal;
import java.util.Date;

@Data
@TableName("t_gray_strategy")
public class GrayStrategy implements Serializable {
    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long id;
    private String strategyName;
    private Long firmwareId;
    private String firmwareVersion;
    private String productKey;
    private Integer status;
    private Integer strategyType;
    private String targetValue;
    private Integer grayPercent;
    private Integer batchCount;
    private Integer currentBatch;
    private Integer batchIntervalHours;
    private BigDecimal successRateThreshold;
    private Integer enableAutoRollback;
    private BigDecimal rollbackThreshold;
    private Date startTime;
    private Date endTime;
    private Date createTime;
    private Date updateTime;
}
