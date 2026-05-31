import React from 'react';

interface ProgressBarProps {
  progress: number;
  status: string;
  message: string;
  fileName: string;
  onCancel?: () => void;
}

const ProgressBar: React.FC<ProgressBarProps> = ({ progress, status, message, fileName, onCancel }) => {
  const getStatusColor = () => {
    switch (status) {
      case 'indexing':
        return '#3498db';
      case 'inserting':
        return '#f39c12';
      case 'completed':
        return '#27ae60';
      case 'error':
        return '#e74c3c';
      default:
        return '#3498db';
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'indexing':
        return '解析中';
      case 'inserting':
        return '插入中';
      case 'completed':
        return '完成';
      case 'error':
        return '错误';
      default:
        return '处理中';
    }
  };

  return (
    <div className="progress-container">
      <div className="progress-header">
        <div className="progress-title">
          <span className="progress-file-name">{fileName}</span>
          <span className={`progress-status status-${status}`}>{getStatusText()}</span>
        </div>
        {status !== 'completed' && status !== 'error' && onCancel && (
          <button className="progress-cancel-btn" onClick={onCancel}>
            ✕
          </button>
        )}
      </div>
      <div className="progress-bar-wrapper">
        <div
          className="progress-bar-fill"
          style={{
            width: `${progress}%`,
            backgroundColor: getStatusColor()
          }}
        />
      </div>
      <div className="progress-footer">
        <span className="progress-percentage">{Math.round(progress)}%</span>
        <span className="progress-message">{message}</span>
      </div>
    </div>
  );
};

export default ProgressBar;
