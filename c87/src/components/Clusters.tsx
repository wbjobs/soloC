import React, { useState, useEffect } from 'react';
import { Cluster } from '../types';
import * as dayjs from 'dayjs';

interface ClustersProps {
  startDate: string;
  endDate: string;
}

const Clusters: React.FC<ClustersProps> = ({ startDate, endDate }) => {
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [expandedCluster, setExpandedCluster] = useState<number | null>(null);

  useEffect(() => {
    loadClusters();
  }, [startDate, endDate]);

  const loadClusters = async () => {
    const data = await window.electronAPI.getClusters(startDate, endDate);
    setClusters(data);
  };

  if (clusters.length === 0) {
    return (
      <div className="clusters-container">
        <h2>异常日志聚类（DBSCAN）</h2>
        <div className="empty-state">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
          </svg>
          <p>暂无异常聚类，请先导入包含ERROR/WARN级别的日志</p>
        </div>
      </div>
    );
  }

  return (
    <div className="clusters-container">
      <h2>异常日志聚类（DBSCAN） - 发现 {clusters.length} 个异常模式</h2>
      {clusters.map(cluster => (
        <div 
          key={cluster.id} 
          className="cluster-card"
          onClick={() => setExpandedCluster(expandedCluster === cluster.id ? null : cluster.id)}
        >
          <div className="cluster-header">
            <span>聚类 #{cluster.id + 1}</span>
            <span className="cluster-size">{cluster.size} 条相似日志</span>
          </div>
          <div className="cluster-sample">{cluster.representative}</div>
          
          {expandedCluster === cluster.id && (
            <div style={{ marginTop: '15px', paddingTop: '15px', borderTop: '1px solid #0f3460' }}>
              <h4 style={{ marginBottom: '10px', color: '#aaa' }}>样本日志:</h4>
              {cluster.sampleLogs.map((log, idx) => (
                <div 
                  key={idx} 
                  style={{ 
                    padding: '10px', 
                    background: '#1a1a2e', 
                    borderRadius: '6px', 
                    marginBottom: '8px',
                    fontSize: '12px'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                    <span className={`log-level ${log.level}`}>{log.level}</span>
                    <span style={{ color: '#888' }}>{dayjs(log.timestamp).format('MM-DD HH:mm:ss')}</span>
                  </div>
                  <div style={{ fontFamily: 'monospace', color: '#ccc' }}>{log.message}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default Clusters;
