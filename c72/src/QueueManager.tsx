import React, { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';

interface TaskConfig {
  target_x: number;
  target_y: number;
  target_width: number;
  target_height: number;
  start_frame: number;
  output_path: string;
}

interface ProcessingTask {
  id: string;
  name: string;
  input_path: string;
  config: TaskConfig;
  priority: 'Low' | 'Normal' | 'High' | 'Urgent';
  status: 'Pending' | 'Running' | 'Paused' | 'Completed' | 'Failed' | 'Cancelled';
  progress: number;
  current_frame: number;
  total_frames: number;
  error_message?: string;
  created_at: number;
  started_at?: number;
  completed_at?: number;
}

interface QueueStats {
  pending: number;
  running: number;
  completed: number;
  failed: number;
  paused: number;
  total: number;
}

interface VideoFile {
  path: string;
  name: string;
  priority: 'Low' | 'Normal' | 'High' | 'Urgent';
}

const QueueManager: React.FC = () => {
  const [tasks, setTasks] = useState<ProcessingTask[]>([]);
  const [stats, setStats] = useState<QueueStats | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<VideoFile[]>([]);
  const [isAddingFiles, setIsAddingFiles] = useState(false);
  const [defaultTarget, setDefaultTarget] = useState({
    x: 100,
    y: 100,
    width: 200,
    height: 200,
    startFrame: 0,
  });

  const refreshTasks = useCallback(async () => {
    try {
      const [tasksData, statsData] = await Promise.all([
        invoke<ProcessingTask[]>('get_all_tasks'),
        invoke<QueueStats>('get_queue_stats'),
      ]);
      setTasks(tasksData);
      setStats(statsData);
    } catch (error) {
      console.error('刷新任务列表失败:', error);
    }
  }, []);

  useEffect(() => {
    refreshTasks();
    const interval = setInterval(refreshTasks, 2000);
    return () => clearInterval(interval);
  }, [refreshTasks]);

  const handleSelectFiles = async () => {
    try {
      const selected = await open({
        filters: [{
          name: '视频文件',
          extensions: ['mp4', 'avi', 'mov', 'mkv'],
        }],
        multiple: true,
      });

      if (selected && Array.isArray(selected)) {
        const newFiles: VideoFile[] = selected.map(path => {
          const name = path.split(/[\\/]/).pop() || path;
          return { path, name, priority: 'Normal' as const };
        });
        setSelectedFiles(prev => [...prev, ...newFiles]);
      }
    } catch (error) {
      console.error('选择文件失败:', error);
    }
  };

  const removeSelectedFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const updateFilePriority = (index: number, priority: 'Low' | 'Normal' | 'High' | 'Urgent') => {
    setSelectedFiles(prev => prev.map((file, i) =>
      i === index ? { ...file, priority } : file
    ));
  };

  const handleAddBatchTasks = async () => {
    if (selectedFiles.length === 0) return;

    setIsAddingFiles(true);
    try {
      const outputDir = await open({
        directory: true,
        title: '选择输出目录',
      });

      if (!outputDir || Array.isArray(outputDir)) return;

      const tasksToAdd = selectedFiles.map(file => {
        const outputName = file.name.replace(/\.[^/.]+$/, '_processed.mp4');
        const outputPath = `${outputDir}/${outputName}`;

        return [
          file.name,
          file.path,
          {
            target_x: defaultTarget.x,
            target_y: defaultTarget.y,
            target_width: defaultTarget.width,
            target_height: defaultTarget.height,
            start_frame: defaultTarget.startFrame,
            output_path: outputPath,
          },
          file.priority,
        ] as const;
      });

      await invoke<string[]>('add_batch_tasks', { tasks: tasksToAdd });
      setSelectedFiles([]);
      await refreshTasks();
    } catch (error) {
      console.error('批量添加任务失败:', error);
    } finally {
      setIsAddingFiles(false);
    }
  };

  const handleCancelTask = async (taskId: string) => {
    try {
      await invoke('cancel_task', { taskId });
      await refreshTasks();
    } catch (error) {
      console.error('取消任务失败:', error);
    }
  };

  const handleRemoveTask = async (taskId: string) => {
    try {
      await invoke('remove_task', { taskId });
      await refreshTasks();
    } catch (error) {
      console.error('删除任务失败:', error);
    }
  };

  const handlePauseTask = async (taskId: string) => {
    try {
      await invoke('pause_task', { taskId });
      await refreshTasks();
    } catch (error) {
      console.error('暂停任务失败:', error);
    }
  };

  const handleResumeTask = async (taskId: string) => {
    try {
      await invoke('resume_task', { taskId });
      await refreshTasks();
    } catch (error) {
      console.error('恢复任务失败:', error);
    }
  };

  const handleSetPriority = async (taskId: string, priority: 'Low' | 'Normal' | 'High' | 'Urgent') => {
    try {
      await invoke('set_task_priority', { taskId, priority });
      await refreshTasks();
    } catch (error) {
      console.error('设置优先级失败:', error);
    }
  };

  const handlePauseQueue = async () => {
    try {
      await invoke('pause_queue');
      await refreshTasks();
    } catch (error) {
      console.error('暂停队列失败:', error);
    }
  };

  const handleResumeQueue = async () => {
    try {
      await invoke('resume_queue');
      await refreshTasks();
    } catch (error) {
      console.error('恢复队列失败:', error);
    }
  };

  const handleClearCompleted = async () => {
    try {
      await invoke('clear_completed_tasks');
      await refreshTasks();
    } catch (error) {
      console.error('清除已完成任务失败:', error);
    }
  };

  const getStatusColor = (status: ProcessingTask['status']) => {
    switch (status) {
      case 'Pending': return '#ffc107';
      case 'Running': return '#00d4ff';
      case 'Paused': return '#6c757d';
      case 'Completed': return '#28a745';
      case 'Failed': return '#dc3545';
      case 'Cancelled': return '#6c757d';
      default: return '#6c757d';
    }
  };

  const getStatusText = (status: ProcessingTask['status']) => {
    switch (status) {
      case 'Pending': return '等待中';
      case 'Running': return '处理中';
      case 'Paused': return '已暂停';
      case 'Completed': return '已完成';
      case 'Failed': return '失败';
      case 'Cancelled': return '已取消';
      default: return status;
    }
  };

  const getPriorityColor = (priority: ProcessingTask['priority']) => {
    switch (priority) {
      case 'Low': return '#6c757d';
      case 'Normal': return '#17a2b8';
      case 'High': return '#ffc107';
      case 'Urgent': return '#dc3545';
      default: return '#6c757d';
    }
  };

  const getPriorityText = (priority: ProcessingTask['priority']) => {
    switch (priority) {
      case 'Low': return '低';
      case 'Normal': return '普通';
      case 'High': return '高';
      case 'Urgent': return '紧急';
      default: return priority;
    }
  };

  const formatTime = (timestamp?: number) => {
    if (!timestamp) return '-';
    return new Date(timestamp * 1000).toLocaleString();
  };

  return (
    <div className="queue-manager">
      <style>{`
        .queue-manager {
          padding: 20px;
          background: #16213e;
          border-radius: 12px;
          color: #eee;
        }
        .queue-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
        }
        .queue-header h2 {
          margin: 0;
          color: #00d4ff;
        }
        .stats-bar {
          display: flex;
          gap: 20px;
          margin-bottom: 20px;
          padding: 15px;
          background: #0f3460;
          border-radius: 8px;
        }
        .stat-item {
          text-align: center;
        }
        .stat-value {
          font-size: 24px;
          font-weight: bold;
          color: #00d4ff;
        }
        .stat-label {
          font-size: 12px;
          color: #888;
        }
        .queue-controls {
          display: flex;
          gap: 10px;
          margin-bottom: 20px;
        }
        .btn {
          padding: 10px 20px;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
          transition: all 0.2s;
        }
        .btn-primary {
          background: linear-gradient(135deg, #00d4ff, #0099cc);
          color: white;
        }
        .btn-primary:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0, 212, 255, 0.4);
        }
        .btn-secondary {
          background: #0f3460;
          color: #eee;
        }
        .btn-secondary:hover {
          background: #1a4a7a;
        }
        .btn-danger {
          background: #dc3545;
          color: white;
        }
        .btn-danger:hover {
          background: #c82333;
        }
        .btn-success {
          background: #28a745;
          color: white;
        }
        .btn-success:hover {
          background: #218838;
        }
        .file-list {
          margin-bottom: 20px;
          padding: 15px;
          background: #0f3460;
          border-radius: 8px;
        }
        .file-list h3 {
          margin-top: 0;
          margin-bottom: 15px;
          color: #00d4ff;
        }
        .file-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px;
          background: #16213e;
          border-radius: 6px;
          margin-bottom: 8px;
        }
        .file-name {
          flex: 1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .priority-select {
          padding: 6px 12px;
          border-radius: 4px;
          border: none;
          background: #0f3460;
          color: #eee;
          cursor: pointer;
        }
        .remove-file-btn {
          background: #dc3545;
          color: white;
          border: none;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .task-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .task-card {
          padding: 15px;
          background: #0f3460;
          border-radius: 8px;
          border-left: 4px solid;
        }
        .task-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 10px;
        }
        .task-name {
          font-weight: bold;
          font-size: 16px;
        }
        .task-status {
          padding: 4px 10px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: bold;
        }
        .task-priority {
          padding: 4px 10px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: bold;
        }
        .task-progress-bar {
          height: 6px;
          background: #16213e;
          border-radius: 3px;
          overflow: hidden;
          margin-bottom: 10px;
        }
        .task-progress-fill {
          height: 100%;
          background: linear-gradient(90deg, #00d4ff, #00ff88);
          transition: width 0.3s ease;
        }
        .task-info {
          display: flex;
          gap: 20px;
          font-size: 12px;
          color: #888;
          margin-bottom: 10px;
        }
        .task-actions {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .task-btn {
          padding: 6px 12px;
          font-size: 12px;
          border: none;
          border-radius: 4px;
          cursor: pointer;
        }
        .empty-state {
          text-align: center;
          padding: 40px;
          color: #888;
        }
        .empty-icon {
          font-size: 48px;
          margin-bottom: 10px;
        }
        .target-config {
          margin-bottom: 15px;
          padding: 15px;
          background: #0f3460;
          border-radius: 8px;
        }
        .target-config h4 {
          margin-top: 0;
          margin-bottom: 10px;
          color: #00d4ff;
        }
        .config-row {
          display: flex;
          gap: 15px;
          flex-wrap: wrap;
        }
        .config-item {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .config-item label {
          font-size: 12px;
          color: #888;
        }
        .config-item input {
          width: 80px;
          padding: 6px;
          border: none;
          border-radius: 4px;
          background: #16213e;
          color: #eee;
        }
      `}</style>

      <div className="queue-header">
        <h2>📋 任务队列管理</h2>
      </div>

      {stats && (
        <div className="stats-bar">
          <div className="stat-item">
            <div className="stat-value" style={{ color: '#ffc107' }}>{stats.pending}</div>
            <div className="stat-label">等待中</div>
          </div>
          <div className="stat-item">
            <div className="stat-value" style={{ color: '#00d4ff' }}>{stats.running}</div>
            <div className="stat-label">处理中</div>
          </div>
          <div className="stat-item">
            <div className="stat-value" style={{ color: '#28a745' }}>{stats.completed}</div>
            <div className="stat-label">已完成</div>
          </div>
          <div className="stat-item">
            <div className="stat-value" style={{ color: '#dc3545' }}>{stats.failed}</div>
            <div className="stat-label">失败</div>
          </div>
          <div className="stat-item">
            <div className="stat-value" style={{ color: '#6c757d' }}>{stats.total}</div>
            <div className="stat-label">总计</div>
          </div>
        </div>
      )}

      <div className="queue-controls">
        <button className="btn btn-primary" onClick={handleSelectFiles}>
          📂 添加视频文件
        </button>
        <button className="btn btn-secondary" onClick={handlePauseQueue}>
          ⏸ 暂停队列
        </button>
        <button className="btn btn-secondary" onClick={handleResumeQueue}>
          ▶ 恢复队列
        </button>
        <button className="btn btn-secondary" onClick={handleClearCompleted}>
          🗑 清除已完成
        </button>
      </div>

      {selectedFiles.length > 0 && (
        <div className="file-list">
          <h3>待添加文件 ({selectedFiles.length})</h3>

          <div className="target-config">
            <h4>默认目标配置（应用于所有待添加文件）</h4>
            <div className="config-row">
              <div className="config-item">
                <label>X 坐标</label>
                <input
                  type="number"
                  value={defaultTarget.x}
                  onChange={e => setDefaultTarget(p => ({ ...p, x: parseInt(e.target.value) || 0 }))}
                />
              </div>
              <div className="config-item">
                <label>Y 坐标</label>
                <input
                  type="number"
                  value={defaultTarget.y}
                  onChange={e => setDefaultTarget(p => ({ ...p, y: parseInt(e.target.value) || 0 }))}
                />
              </div>
              <div className="config-item">
                <label>宽度</label>
                <input
                  type="number"
                  value={defaultTarget.width}
                  onChange={e => setDefaultTarget(p => ({ ...p, width: parseInt(e.target.value) || 0 }))}
                />
              </div>
              <div className="config-item">
                <label>高度</label>
                <input
                  type="number"
                  value={defaultTarget.height}
                  onChange={e => setDefaultTarget(p => ({ ...p, height: parseInt(e.target.value) || 0 }))}
                />
              </div>
              <div className="config-item">
                <label>起始帧</label>
                <input
                  type="number"
                  value={defaultTarget.startFrame}
                  onChange={e => setDefaultTarget(p => ({ ...p, startFrame: parseInt(e.target.value) || 0 }))}
                />
              </div>
            </div>
          </div>

          {selectedFiles.map((file, index) => (
            <div key={index} className="file-item">
              <span className="file-name" title={file.path}>
                🎬 {file.name}
              </span>
              <select
                className="priority-select"
                value={file.priority}
                onChange={e => updateFilePriority(index, e.target.value as any)}
              >
                <option value="Low">低</option>
                <option value="Normal">普通</option>
                <option value="High">高</option>
                <option value="Urgent">紧急</option>
              </select>
              <button
                className="remove-file-btn"
                onClick={() => removeSelectedFile(index)}
              >
                ×
              </button>
            </div>
          ))}

          <button
            className="btn btn-success"
            onClick={handleAddBatchTasks}
            disabled={isAddingFiles}
            style={{ marginTop: '15px' }}
          >
            {isAddingFiles ? '添加中...' : `✓ 添加 ${selectedFiles.length} 个任务`}
          </button>
        </div>
      )}

      <div className="task-list">
        {tasks.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📭</div>
            <p>暂无任务，点击"添加视频文件"开始</p>
          </div>
        ) : (
          tasks.map(task => (
            <div
              key={task.id}
              className="task-card"
              style={{ borderLeftColor: getStatusColor(task.status) }}
            >
              <div className="task-header">
                <div>
                  <div className="task-name">{task.name}</div>
                  <div style={{ display: 'flex', gap: '10px', marginTop: '5px' }}>
                    <span
                      className="task-status"
                      style={{
                        background: getStatusColor(task.status) + '22',
                        color: getStatusColor(task.status),
                      }}
                    >
                      {getStatusText(task.status)}
                    </span>
                    <span
                      className="task-priority"
                      style={{
                        background: getPriorityColor(task.priority) + '22',
                        color: getPriorityColor(task.priority),
                      }}
                    >
                      {getPriorityText(task.priority)}
                    </span>
                  </div>
                </div>
              </div>

              {task.status === 'Running' && (
                <div className="task-progress-bar">
                  <div
                    className="task-progress-fill"
                    style={{ width: `${task.progress}%` }}
                  />
                </div>
              )}

              <div className="task-info">
                <span>进度: {task.progress.toFixed(1)}%</span>
                {task.total_frames > 0 && (
                  <span>
                    帧: {task.current_frame} / {task.total_frames}
                  </span>
                )}
                <span>创建: {formatTime(task.created_at)}</span>
                {task.started_at && <span>开始: {formatTime(task.started_at)}</span>}
                {task.completed_at && <span>完成: {formatTime(task.completed_at)}</span>}
              </div>

              {task.error_message && (
                <div style={{ color: '#dc3545', marginBottom: '10px', fontSize: '14px' }}>
                  ❌ {task.error_message}
                </div>
              )}

              <div className="task-actions">
                {task.status === 'Running' && (
                  <button
                    className="task-btn btn-warning"
                    onClick={() => handlePauseTask(task.id)}
                  >
                    ⏸ 暂停
                  </button>
                )}

                {task.status === 'Paused' && (
                  <button
                    className="task-btn btn-success"
                    onClick={() => handleResumeTask(task.id)}
                  >
                    ▶ 继续
                  </button>
                )}

                {(task.status === 'Pending' || task.status === 'Paused') && (
                  <>
                    <select
                      className="priority-select"
                      value={task.priority}
                      onChange={e => handleSetPriority(task.id, e.target.value as any)}
                    >
                      <option value="Low">低优先级</option>
                      <option value="Normal">普通优先级</option>
                      <option value="High">高优先级</option>
                      <option value="Urgent">紧急优先级</option>
                    </select>
                    <button
                      className="task-btn btn-danger"
                      onClick={() => handleCancelTask(task.id)}
                    >
                      ✕ 取消
                    </button>
                  </>
                )}

                {(task.status === 'Completed' || task.status === 'Failed' || task.status === 'Cancelled') && (
                  <button
                    className="task-btn btn-secondary"
                    onClick={() => handleRemoveTask(task.id)}
                  >
                    🗑 删除
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default QueueManager;