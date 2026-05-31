package com.iot.ota.common.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;
import java.math.BigDecimal;
import java.util.Date;

@Data
@TableName("t_cdn_node")
public class CdnNode implements Serializable {
    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long id;
    private String nodeName;
    private String nodeCode;
    private String region;
    private Integer nodeType;
    private String baseUrl;
    private Integer status;
    private Integer capacityGb;
    private Integer bandwidthMbps;
    private Integer priority;
    private String healthCheckUrl;
    private Date lastHealthCheck;
    private Integer healthStatus;
    private BigDecimal cacheHitRate;
    private BigDecimal totalTrafficGb;
    private Date createTime;
    private Date updateTime;
}
