import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import CytoscapeComponent from 'react-cytoscapejs';

const App = () => {
  const [elements, setElements] = useState([]);
  const [stats, setStats] = useState({ nodes: 0, edges: 0, totalCalls: 0 });
  const [anomalies, setAnomalies] = useState([]);
  const [anomalyStats, setAnomalyStats] = useState({});
  const [anomalyScore, setAnomalyScore] = useState(0);
  const [selectedAnomaly, setSelectedAnomaly] = useState(null);
  const [showPanel, setShowPanel] = useState(true);
  const wsRef = useRef(null);
  const cyRef = useRef(null);

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    wsRef.current = new WebSocket(wsUrl);

    wsRef.current.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'topology') {
        updateTopology(data);
      }
    };

    wsRef.current.onclose = () => {
      console.log('WebSocket closed, attempting to reconnect...');
      setTimeout(() => {
        window.location.reload();
      }, 3000);
    };

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  const updateTopology = (data) => {
    const nodes = data.nodes || [];
    const edges = data.edges || [];

    setAnomalies(data.anomalies || []);
    setAnomalyStats(data.anomalyStats || {});
    setAnomalyScore(data.anomalyScore || 0);

    const anomalousNodes = new Set();
    const anomalousEdges = new Set();

    (data.anomalies || []).forEach((a) => {
      (a.nodes || []).forEach((n) => anomalousNodes.add(n));
      (a.edges || []).forEach((e) => anomalousEdges.add(e));
    });

    const cyNodes = nodes.map((node) => ({
      data: {
        id: node.name,
        label: node.name,
        ip: node.ip,
        port: node.port,
        callCount: node.callCount,
        isAnomalous: anomalousNodes.has(node.name),
      },
    }));

    const cyEdges = edges.map((edge) => ({
      data: {
        id: `${edge.source}-${edge.destination}`,
        source: edge.source,
        target: edge.destination,
        label: `${edge.callCount}`,
        protocol: edge.protocol,
        callCount: edge.callCount,
        avgLatency: edge.avgLatency || 0,
        minLatency: edge.minLatency,
        maxLatency: edge.maxLatency,
        isAnomalous: anomalousEdges.has(`${edge.source}->${edge.destination}`),
      },
    }));

    setElements([...cyNodes, ...cyEdges]);

    const totalCalls = edges.reduce((sum, edge) => sum + edge.callCount, 0);
    setStats({
      nodes: nodes.length,
      edges: edges.length,
      totalCalls,
    });
  };

  const layout = useMemo(() => {
    const nodeCount = elements.filter((e) => e.data.id && !e.data.source).length;

    if (nodeCount > 50) {
      return {
        name: 'grid',
        fit: true,
        padding: 30,
        rows: Math.ceil(Math.sqrt(nodeCount)),
      };
    } else {
      return {
        name: 'cose',
        animate: false,
        fit: true,
        padding: 50,
        nodeRepulsion: 2000,
        idealEdgeLength: 150,
      };
    }
  }, [elements.length]);

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'CRITICAL': return '#ef4444';
      case 'WARNING': return '#f59e0b';
      case 'INFO': return '#3b82f6';
      default: return '#6b7280';
    }
  };

  const getAnomalyTypeLabel = (type) => {
    switch (type) {
      case 'DIAMOND': return '💎 钻石型调用';
      case 'CYCLE': return '🔄 循环依赖';
      case 'HIGH_LATENCY': return '⏱️ 高延迟';
      case 'HIGH_FANOUT': return '🔀 高扇出';
      default: return type;
    }
  };

  const stylesheet = useMemo(() => [
    {
      selector: 'node',
      style: {
        'background-color': '#667eea',
        'label': 'data(label)',
        'color': '#333',
        'text-valign': 'center',
        'text-halign': 'center',
        'font-size': '10px',
        'width': '40px',
        'height': '40px',
        'border-width': 2,
        'border-color': '#5a67d8',
      },
    },
    {
      selector: 'node[isAnomalous = true]',
      style: {
        'background-color': '#ef4444',
        'border-color': '#dc2626',
        'border-width': 4,
        'border-style': 'solid',
      },
    },
    {
      selector: 'node:selected',
      style: {
        'background-color': '#f6ad55',
        'border-color': '#ed8936',
      },
    },
    {
      selector: 'edge',
      style: {
        'width': 2,
        'line-color': '#cbd5e0',
        'target-arrow-color': '#a0aec0',
        'target-arrow-shape': 'triangle',
        'curve-style': 'bezier',
        'label': 'data(label)',
        'font-size': '8px',
        'text-rotation': 'autorotate',
        'text-margin-y': -8,
      },
    },
    {
      selector: 'edge[isAnomalous = true]',
      style: {
        'line-color': '#ef4444',
        'target-arrow-color': '#dc2626',
        'width': 4,
        'line-style': 'dashed',
      },
    },
    {
      selector: 'edge[protocol = "HTTP"]',
      style: {
        'line-color': '#48bb78',
        'target-arrow-color': '#38a169',
      },
    },
    {
      selector: 'edge[protocol = "HTTP"][isAnomalous = true]',
      style: {
        'line-color': '#ef4444',
        'target-arrow-color': '#dc2626',
      },
    },
    {
      selector: 'edge[protocol = "gRPC"]',
      style: {
        'line-color': '#ed64a6',
        'target-arrow-color': '#d53f8c',
      },
    },
    {
      selector: 'edge[protocol = "UDP"]',
      style: {
        'line-color': '#4299e1',
        'target-arrow-color': '#3182ce',
      },
    },
    {
      selector: 'edge:selected',
      style: {
        'line-color': '#f6ad55',
        'target-arrow-color': '#ed8936',
      },
    },
  ], []);

  const getScoreColor = (score) => {
    if (score >= 80) return '#ef4444';
    if (score >= 50) return '#f59e0b';
    if (score >= 20) return '#3b82f6';
    return '#10b981';
  };

  const getScoreLabel = (score) => {
    if (score >= 80) return '严重';
    if (score >= 50) return '警告';
    if (score >= 20) return '关注';
    return '健康';
  };

  const highlightAnomaly = useCallback((anomaly) => {
    setSelectedAnomaly(anomaly);
    if (cyRef.current) {
      const cy = cyRef.current;
      cy.elements().removeClass('highlighted');

      (anomaly.nodes || []).forEach((nodeId) => {
        cy.$(`node[id = "${nodeId}"]`).addClass('highlighted');
      });

      (anomaly.edges || []).forEach((edgeId) => {
        const [source, target] = edgeId.split('->');
        cy.$(`edge[source = "${source}"][target = "${target}"]`).addClass('highlighted');
      });

      cy.fit(cy.elements('.highlighted'), 50);
    }
  }, []);

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header style={{
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: 'white',
        padding: '15px 30px',
        boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <h1 style={{ margin: 0, fontSize: '24px' }}>🔍 服务拓扑监控</h1>
            <div style={{
              background: getScoreColor(anomalyScore),
              padding: '8px 16px',
              borderRadius: '20px',
              fontSize: '14px',
              fontWeight: 'bold',
            }}>
              风险评分: {anomalyScore.toFixed(0)} - {getScoreLabel(anomalyScore)}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '30px' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{stats.nodes}</div>
              <div style={{ fontSize: '12px', opacity: 0.9 }}>服务节点</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{stats.edges}</div>
              <div style={{ fontSize: '12px', opacity: 0.9 }}>调用关系</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{stats.totalCalls}</div>
              <div style={{ fontSize: '12px', opacity: 0.9 }}>总调用量</div>
            </div>
          </div>
        </div>

        {anomalyStats.TOTAL > 0 && (
          <div style={{
            display: 'flex',
            gap: '20px',
            marginTop: '10px',
            paddingTop: '10px',
            borderTop: '1px solid rgba(255,255,255,0.2)',
          }}>
            <span>🚨 检测到 {anomalyStats.TOTAL} 个异常:</span>
            {anomalyStats.CRITICAL > 0 && (
              <span style={{ color: '#fecaca' }}>🔴 严重: {anomalyStats.CRITICAL}</span>
            )}
            {anomalyStats.WARNING > 0 && (
              <span style={{ color: '#fef3c7' }}>🟡 警告: {anomalyStats.WARNING}</span>
            )}
            {anomalyStats.INFO > 0 && (
              <span style={{ color: '#dbeafe' }}>🔵 信息: {anomalyStats.INFO}</span>
            )}
          </div>
        )}
      </header>

      <div style={{ flex: 1, display: 'flex', position: 'relative' }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <CytoscapeComponent
            elements={elements}
            style={{ width: '100%', height: '100%' }}
            layout={layout}
            stylesheet={stylesheet}
            cy={(cy) => {
              cyRef.current = cy;
            }}
          />

          <div style={{
            position: 'absolute',
            bottom: '20px',
            left: '20px',
            background: 'white',
            padding: '15px',
            borderRadius: '8px',
            boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
          }}>
            <div style={{ fontWeight: 'bold', marginBottom: '10px' }}>图例</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '16px', height: '16px', backgroundColor: '#667eea', borderRadius: '50%' }}></div>
                <span style={{ fontSize: '12px' }}>正常节点</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '16px', height: '16px', backgroundColor: '#ef4444', borderRadius: '50%', border: '2px solid #dc2626' }}></div>
                <span style={{ fontSize: '12px' }}>异常节点</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '30px', height: '3px', backgroundColor: '#48bb78' }}></div>
                <span style={{ fontSize: '12px' }}>HTTP</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '30px', height: '3px', backgroundColor: '#ed64a6' }}></div>
                <span style={{ fontSize: '12px' }}>gRPC</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '30px', height: '3px', backgroundColor: '#4299e1' }}></div>
                <span style={{ fontSize: '12px' }}>UDP</span>
              </div>
            </div>
          </div>

          <div style={{
            position: 'absolute',
            top: '20px',
            left: '20px',
            background: 'white',
            padding: '15px',
            borderRadius: '8px',
            boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
            fontSize: '12px',
          }}>
            <div>• 滚动缩放</div>
            <div>• 拖拽平移</div>
            <div>• 点击选中</div>
          </div>
        </div>

        {showPanel && anomalies.length > 0 && (
          <div style={{
            width: '400px',
            background: '#f8fafc',
            borderLeft: '1px solid #e2e8f0',
            overflowY: 'auto',
            padding: '16px',
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '16px',
            }}>
              <h3 style={{ margin: 0, color: '#1e293b' }}>⚠️ 异常检测报告</h3>
              <button
                onClick={() => setShowPanel(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '18px',
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {anomalies.map((anomaly, index) => (
                <div
                  key={index}
                  onClick={() => highlightAnomaly(anomaly)}
                  style={{
                    background: 'white',
                    borderRadius: '8px',
                    padding: '12px',
                    borderLeft: `4px solid ${getSeverityColor(anomaly.severity)}`,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                    cursor: 'pointer',
                    transition: 'transform 0.2s, box-shadow 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateX(-2px)';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateX(0)';
                    e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <span style={{
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontWeight: 'bold',
                      color: 'white',
                      backgroundColor: getSeverityColor(anomaly.severity),
                    }}>
                      {anomaly.severity}
                    </span>
                    <span style={{ fontWeight: 'bold', fontSize: '14px', color: '#1e293b' }}>
                      {getAnomalyTypeLabel(anomaly.type)}
                    </span>
                  </div>

                  <p style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#475569', lineHeight: '1.4' }}>
                    {anomaly.message}
                  </p>

                  <div style={{
                    background: '#f0f9ff',
                    borderRadius: '6px',
                    padding: '10px',
                    borderLeft: '3px solid #0ea5e9',
                  }}>
                    <div style={{ fontWeight: 'bold', fontSize: '12px', color: '#0284c7', marginBottom: '4px' }}>
                      💡 AI 建议
                    </div>
                    <p style={{ margin: 0, fontSize: '12px', color: '#0c4a6e', lineHeight: '1.5' }}>
                      {anomaly.suggestion}
                    </p>
                  </div>

                  <div style={{ marginTop: '8px', fontSize: '11px', color: '#94a3b8' }}>
                    影响: {anomaly.nodes?.length || 0} 个节点, {anomaly.edges?.length || 0} 条边
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {!showPanel && anomalies.length > 0 && (
          <button
            onClick={() => setShowPanel(true)}
            style={{
              position: 'absolute',
              right: '20px',
              top: '20px',
              background: '#ef4444',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              padding: '10px 16px',
              cursor: 'pointer',
              fontWeight: 'bold',
              boxShadow: '0 2px 8px rgba(239, 68, 68, 0.3)',
            }}
          >
            🚨 {anomalies.length} 个异常
          </button>
        )}
      </div>
    </div>
  );
};

export default App;
