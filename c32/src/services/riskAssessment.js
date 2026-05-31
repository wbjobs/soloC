function calculateRisk(affectedObject) {
  const riskScores = {
    DROP_TABLE: 100,
    ALTER_TABLE_DROP_COLUMN: 80,
    ALTER_TABLE_RENAME_COLUMN: 60,
    ALTER_TABLE_ADD_COLUMN: 20,
    CREATE_TABLE: 10
  };
  
  const objectTypeWeights = {
    VIEW: 1.0,
    MATERIALIZED_VIEW: 1.2,
    STORED_PROCEDURE: 1.5,
    TRIGGER: 1.3,
    TABLE: 1.0,
    INDEX: 0.5,
    SEQUENCE: 0.3,
    TYPE: 0.8
  };
  
  const baseScore = riskScores[affectedObject.changeType] || 50;
  const typeWeight = objectTypeWeights[affectedObject.objectType] || 1.0;
  
  const totalScore = baseScore * typeWeight;
  
  if (totalScore >= 70) {
    return 'high';
  } else if (totalScore >= 30) {
    return 'medium';
  } else {
    return 'low';
  }
}

function getRiskDescription(riskLevel, objectType, changeType) {
  const descriptions = {
    high: {
      VIEW: '视图依赖于被修改的表，可能导致查询失败或数据不一致',
      MATERIALIZED_VIEW: '物化视图依赖于被修改的表，刷新可能失败',
      STORED_PROCEDURE: '存储过程引用了被修改的表，执行可能出错',
      TRIGGER: '触发器绑定到被修改的表，可能导致操作失败',
      TABLE: '表有其他依赖对象，可能级联影响',
      default: '该对象存在高风险，变更可能导致运行时错误'
    },
    medium: {
      VIEW: '视图可能需要更新以反映表结构变化',
      MATERIALIZED_VIEW: '物化视图可能需要刷新',
      STORED_PROCEDURE: '存储过程逻辑可能受影响',
      TRIGGER: '触发器行为可能改变',
      default: '该对象存在中等风险，建议进行兼容性测试'
    },
    low: {
      VIEW: '视图受影响较小，通常无需修改',
      MATERIALIZED_VIEW: '物化视图影响较小',
      STORED_PROCEDURE: '存储过程受影响较小',
      TRIGGER: '触发器影响较小',
      default: '该对象风险较低，影响有限'
    }
  };
  
  const levelDescriptions = descriptions[riskLevel] || descriptions.low;
  return levelDescriptions[objectType] || levelDescriptions.default;
}

module.exports = {
  calculateRisk,
  getRiskDescription
};
