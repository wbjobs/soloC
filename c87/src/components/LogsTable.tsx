import React from 'react';
import { LogEntry } from '../types';
import * as dayjs from 'dayjs';

interface LogsTableProps {
  logs: LogEntry[];
  isLoading?: boolean;
}

const LogsTable: React.FC<LogsTableProps> = ({ logs, isLoading }) => {
  if (isLoading) {
    return (
      <div className="empty-state">
        <div style={{ 
          width: '40px', 
          height: '40px', 
          margin: '0 auto 20px',
          border: '3px solid #666',
          borderTopColor: '#e94560',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }} />
        <p>加载中...</p>
        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="empty-state">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm4 18H6V4h7v5h5v11zM8 15.01l1.41 1.41L11 14.84V19h2v-4.16l1.59 1.59L16 15.01 12.01 11 8 15.01z" />
        </svg>
        <p>暂无日志数据，请先导入日志文件</p>
      </div>
    );
  }

  return (
    <div className="logs-table">
      <table>
        <thead>
          <tr>
            <th>时间</th>
            <th>级别</th>
            <th>来源</th>
            <th>消息</th>
            <th>主机/进程</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => (
            <tr key={log.id}>
              <td>{dayjs(log.timestamp).format('MM-DD HH:mm:ss')}</td>
              <td>
                <span className={`log-level ${log.level}`}>
                  {log.level}
                </span>
              </td>
              <td>{log.source}</td>
              <td style={{ maxWidth: '400px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {log.message}
              </td>
              <td>
                <div>{log.host || '-'}</div>
                <div style={{ color: '#666', fontSize: '11px' }}>{log.process || '-'}</div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default LogsTable;
