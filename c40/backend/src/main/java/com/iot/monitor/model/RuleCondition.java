package com.iot.monitor.model;

import lombok.Data;

@Data
public class RuleCondition {
    private String metric;
    private String operator;
    private double value;
    private String aggregation;
    private String changeType;
}
