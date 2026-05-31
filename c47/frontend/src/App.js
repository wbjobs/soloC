import React, { useState, useEffect, useCallback, useRef } from 'react';
import ReactECharts from 'echarts-for-react';

const WEBSOCKET_URL = 'ws://localhost:8765';
const MAX_HISTORY_RECORDS = 60;

const FUNNEL_STAGES = [
  '浏览首页',
  '浏览商品',
  '点击商品',
  '加入购物车',
  '结算',
  '下单'
];

function App() {
  const [isConnected, setIsConnected] = useState(false);
  const [historyData, setHistoryData] = useState([]);
  const [latestStats, setLatestStats] = useState({
    pv: 0,
    uv: 0,
    conversion_rate: 0,
    order_count: 0
  });
  const [funnelData, setFunnelData] = useState([]);
  const [startEvent, setStartEvent] = useState('浏览首页');
  const [endEvent, setEndEvent] = useState('下单');
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);

  const mergeHistoricalData = useCallback((existingData, newHistoricalData) => {
    const timestampMap = new Map();

    existingData.forEach(item => {
      timestampMap.set(item.timestamp, item);
    });

    newHistoricalData.forEach(item => {
      timestampMap.set(item.timestamp, item);
    });

    const mergedData = Array.from(timestampMap.values())
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
      .slice(-MAX_HISTORY_RECORDS);

    return mergedData;
  }, []);

  const requestFunnelData = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      const request = {
        type: 'funnel_request',
        start_event: startEvent,
        end_event: endEvent
      };
      wsRef.current.send(JSON.stringify(request));
    }
  }, [startEvent, endEvent]);

  const handleMessage = useCallback((event) => {
    try {
      const data = JSON.parse(event.data);

      if (data.type === 'historical') {
        if (data.data && data.data.length > 0) {
          setHistoryData(prev => mergeHistoricalData(prev, data.data));
          setLatestStats(data.data[data.data.length - 1]);
          console.log(`恢复了 ${data.data.length} 条历史数据`);
        }
      } else if (data.type === 'funnel_data') {
        if (data.data) {
          setFunnelData(data.data);
          console.log('收到漏斗数据:', data.data);
        }
      } else {
        setHistoryData(prev => {
          const newData = prev.filter(item => item.timestamp !== data.timestamp);
          newData.push(data);
          return newData
            .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
            .slice(-MAX_HISTORY_RECORDS);
        });
        setLatestStats(data);
      }
    } catch (error) {
      console.error('处理WebSocket消息错误:', error, event.data);
    }
  }, [mergeHistoricalData]);

  const connectWebSocket = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      return;
    }

    try {
      const ws = new WebSocket(WEBSOCKET_URL);

      ws.onopen = () => {
        console.log('WebSocket已连接');
        setIsConnected(true);
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = null;
        }
      };

      ws.onmessage = handleMessage;

      ws.onclose = (event) => {
        console.log(`WebSocket已断开 (code: ${event.code}), 3秒后重连...`);
        setIsConnected(false);
        reconnectTimeoutRef.current = setTimeout(connectWebSocket, 3000);
      };

      ws.onerror = (error) => {
        console.error('WebSocket错误:', error);
      };

      wsRef.current = ws;
    } catch (error) {
      console.error('创建WebSocket连接失败:', error);
      reconnectTimeoutRef.current = setTimeout(connectWebSocket, 3000);
    }
  }, [handleMessage]);

  useEffect(() => {
    connectWebSocket();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connectWebSocket]);

  const getLineChartOption = () => {
    const timestamps = historyData.map(item => {
      const date = new Date(item.timestamp);
      return `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
    });
    
    return {
      tooltip: {
        trigger: 'axis'
      },
      legend: {
        data: ['PV', 'UV']
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '3%',
        containLabel: true
      },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: timestamps
      },
      yAxis: {
        type: 'value'
      },
      series: [
        {
          name: 'PV',
          type: 'line',
          smooth: true,
          data: historyData.map(item => item.pv),
          itemStyle: { color: '#667eea' },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(102, 126, 234, 0.5)' },
                { offset: 1, color: 'rgba(102, 126, 234, 0.1)' }
              ]
            }
          }
        },
        {
          name: 'UV',
          type: 'line',
          smooth: true,
          data: historyData.map(item => item.uv),
          itemStyle: { color: '#764ba2' },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(118, 75, 162, 0.5)' },
                { offset: 1, color: 'rgba(118, 75, 162, 0.1)' }
              ]
            }
          }
        }
      ]
    };
  };

  const getBarChartOption = () => {
    const timestamps = historyData.map(item => {
      const date = new Date(item.timestamp);
      return `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
    });
    
    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'shadow'
        }
      },
      legend: {
        data: ['点击', '浏览', '下单']
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '3%',
        containLabel: true
      },
      xAxis: {
        type: 'category',
        data: timestamps
      },
      yAxis: {
        type: 'value'
      },
      series: [
        {
          name: '点击',
          type: 'bar',
          data: historyData.map(item => item.click_count),
          itemStyle: { color: '#667eea' }
        },
        {
          name: '浏览',
          type: 'bar',
          data: historyData.map(item => item.view_count),
          itemStyle: { color: '#764ba2' }
        },
        {
          name: '下单',
          type: 'bar',
          data: historyData.map(item => item.order_count),
          itemStyle: { color: '#f093fb' }
        }
      ]
    };
  };

  const getPieChartOption = () => {
    if (!latestStats.page_distribution) {
      return {
        title: { text: '等待数据...' },
        series: []
      };
    }
    
    const data = Object.entries(latestStats.page_distribution).map(([name, value]) => ({
      name: {
        'home': '首页',
        'product': '商品页',
        'cart': '购物车',
        'checkout': '结算页',
        'profile': '个人中心'
      }[name] || name,
      value
    }));
    
    return {
      tooltip: {
        trigger: 'item'
      },
      legend: {
        orient: 'vertical',
        left: 'left'
      },
      series: [
        {
          name: '页面分布',
          type: 'pie',
          radius: ['40%', '70%'],
          avoidLabelOverlap: false,
          itemStyle: {
            borderRadius: 10,
            borderColor: '#fff',
            borderWidth: 2
          },
          label: {
            show: false,
            position: 'center'
          },
          emphasis: {
            label: {
              show: true,
              fontSize: 20,
              fontWeight: 'bold'
            }
          },
          labelLine: {
            show: false
          },
          data: data,
          color: ['#667eea', '#764ba2', '#f093fb', '#4facfe', '#00f2fe']
        }
      ]
    };
  };

  const getActionPieChartOption = () => {
    if (!latestStats.action_distribution) {
      return {
        title: { text: '等待数据...' },
        series: []
      };
    }
    
    const data = Object.entries(latestStats.action_distribution).map(([name, value]) => ({
      name: {
        'view': '浏览',
        'click': '点击',
        'order': '下单'
      }[name] || name,
      value
    }));
    
    return {
      tooltip: {
        trigger: 'item'
      },
      legend: {
        orient: 'vertical',
        left: 'left'
      },
      series: [
        {
          name: '行为分布',
          type: 'pie',
          radius: '70%',
          data: data,
          emphasis: {
            itemStyle: {
              shadowBlur: 10,
              shadowOffsetX: 0,
              shadowColor: 'rgba(0, 0, 0, 0.5)'
            }
          },
          color: ['#667eea', '#764ba2', '#f093fb']
        }
      ]
    };
  };

  const getFunnelChartOption = () => {
    if (!funnelData || funnelData.length === 0) {
      return {
        title: { text: '等待数据...', left: 'center' },
        series: []
      };
    }

    const data = funnelData.map((item, index) => ({
      name: item.name,
      value: item.value,
      conversionRate: item.conversion_rate
    }));

    return {
      tooltip: {
        trigger: 'item',
        formatter: (params) => {
          const rate = params.data.conversionRate;
          const totalRate = params.value / (data[0]?.value || 1);
          return `${params.name}<br/>
            用户数: ${params.value}<br/>
            步骤转化率: ${(rate * 100).toFixed(1)}%<br/>
            整体转化率: ${(totalRate * 100).toFixed(1)}%`;
        }
      },
      legend: {
        data: data.map(item => item.name),
        top: 'bottom'
      },
      series: [
        {
          name: '转化漏斗',
          type: 'funnel',
          left: '10%',
          top: 60,
          bottom: 60,
          width: '80%',
          min: 0,
          max: data[0]?.value || 100,
          minSize: '30%',
          maxSize: '100%',
          sort: 'descending',
          gap: 2,
          label: {
            show: true,
            position: 'inside',
            formatter: (params) => {
              return `${params.name}\n${params.value}人\n(${(params.data.conversionRate * 100).toFixed(1)}%)`;
            },
            fontSize: 12,
            color: '#fff'
          },
          labelLine: {
            length: 10,
            lineStyle: {
              width: 1,
              type: 'solid'
            }
          },
          itemStyle: {
            borderColor: '#fff',
            borderWidth: 2
          },
          emphasis: {
            label: {
              fontSize: 14
            }
          },
          data: data,
          color: ['#667eea', '#764ba2', '#f093fb', '#4facfe', '#00f2fe', '#43e97b']
        }
      ]
    };
  };

  return (
    <div className="App">
      <div className="header">
        <h1>📊 实时用户行为分析看板</h1>
        <p>实时监控用户行为数据，包括PV、UV、转化率等关键指标</p>
        <span className={`connection-status ${isConnected ? 'status-connected' : 'status-disconnected'}`}>
          {isConnected ? '✓ 实时连接中' : '✗ 连接断开'}
        </span>
      </div>

      <div className="stats-grid">
        <div className="stat-card pv">
          <h3>页面浏览量 (PV)</h3>
          <div className="value">{latestStats.pv.toLocaleString()}</div>
        </div>
        <div className="stat-card uv">
          <h3>独立访客数 (UV)</h3>
          <div className="value">{latestStats.uv.toLocaleString()}</div>
        </div>
        <div className="stat-card conversion">
          <h3>转化率</h3>
          <div className="value">{(latestStats.conversion_rate * 100).toFixed(2)}%</div>
        </div>
        <div className="stat-card orders">
          <h3>订单数</h3>
          <div className="value">{latestStats.order_count.toLocaleString()}</div>
        </div>
      </div>

      <div className="charts-grid">
        <div className="chart-card full-width">
          <h3>📈 PV/UV 趋势图</h3>
          <ReactECharts 
            option={getLineChartOption()} 
            style={{ height: '400px' }}
            notMerge={true}
          />
        </div>

        <div className="chart-card">
          <h3>📊 用户行为分布</h3>
          <ReactECharts 
            option={getBarChartOption()} 
            style={{ height: '350px' }}
            notMerge={true}
          />
        </div>

        <div className="chart-card">
          <h3>🖥️ 页面访问分布</h3>
          <ReactECharts 
            option={getPieChartOption()} 
            style={{ height: '350px' }}
            notMerge={true}
          />
        </div>

        <div className="chart-card">
          <h3>🎯 行为类型分布</h3>
          <ReactECharts 
            option={getActionPieChartOption()} 
            style={{ height: '350px' }}
            notMerge={true}
          />
        </div>

        <div className="chart-card full-width">
          <h3>🔄 用户转化漏斗分析</h3>
          <div className="funnel-controls">
            <div className="control-group">
              <label>起始事件:</label>
              <select 
                value={startEvent} 
                onChange={(e) => setStartEvent(e.target.value)}
                disabled={!isConnected}
              >
                {FUNNEL_STAGES.map(stage => (
                  <option key={stage} value={stage}>{stage}</option>
                ))}
              </select>
            </div>
            <div className="control-group">
              <label>结束事件:</label>
              <select 
                value={endEvent} 
                onChange={(e) => setEndEvent(e.target.value)}
                disabled={!isConnected}
              >
                {FUNNEL_STAGES.map(stage => (
                  <option key={stage} value={stage}>{stage}</option>
                ))}
              </select>
            </div>
            <button 
              onClick={requestFunnelData}
              disabled={!isConnected || startEvent === endEvent}
              className="funnel-button"
            >
              🔍 分析转化漏斗
            </button>
          </div>
          <ReactECharts 
            option={getFunnelChartOption()} 
            style={{ height: '450px' }}
            notMerge={true}
          />
        </div>
      </div>
    </div>
  );
}

export default App;
