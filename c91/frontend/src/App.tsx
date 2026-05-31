import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import axios from 'axios';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, Legend, BarChart, Bar } from 'recharts';
import './index.css';

const API_BASE = 'http://localhost:3001/api';
const WS_URL = 'ws://localhost:8080';
const MAX_DATA_POINTS = 100;
const MAX_DISPLAY_DEVICES = 5;

const COLORS = ['#1890ff', '#52c41a', '#faad14', '#f5222d', '#722ed1', '#13c2c2', '#eb2f96', '#fa8c16', '#2f54eb', '#a0d911'];

const ALARM_COLORS = {
  normal: '#52c41a',
  notice: '#1890ff',
  warning: '#faad14',
  critical: '#f5222d'
};

const ALARM_LABELS = {
  normal: '正常',
  notice: '注意',
  warning: '警告',
  critical: '严重'
};

const downsampleData = (data: any[], maxPoints: number): any[] => {
  if (data.length <= maxPoints) return data;
  const ratio = Math.ceil(data.length / maxPoints);
  return data.filter((_, index) => index % ratio === 0);
};

const DeviceCard = React.memo(({ device, isSelected, onClick }: { 
  device: any; 
  isSelected: boolean;
  onClick: () => void;
}) => (
  <div 
    className={`device-card ${device.status} ${isSelected ? 'selected' : ''}`}
    onClick={onClick}
  >
    <div className="device-name">{device.name}</div>
    <div className="device-location">{device.location}</div>
    <div className="health-bar">
      <div 
        className={`health-fill ${device.status}`}
        style={{ width: `${device.health_score}%` }}
      />
    </div>
    <div className="health-score">
      健康度: {device.health_score.toFixed(0)}% | {ALARM_LABELS[device.status as keyof typeof ALARM_LABELS]}
    </div>
  </div>
));

const AnomalyItem = React.memo(({ 
  anomaly, 
  deviceName,
  onAcknowledge
}: { 
  anomaly: any; 
  deviceName: string;
  onAcknowledge: (id: number) => void;
}) => (
  <div className={`anomaly-item ${anomaly.severity}`}>
    <div className="anomaly-device">{deviceName}</div>
    <div className="anomaly-time">
      {new Date(anomaly.timestamp).toLocaleString()}
      {anomaly.acknowledged && ' (已确认)'}
    </div>
    <div className="anomaly-desc">{anomaly.description}</div>
    {!anomaly.acknowledged && (
      <button 
        className="ack-btn"
        onClick={() => onAcknowledge(anomaly.id)}
      >
        确认
      </button>
    )}
  </div>
));

const ThresholdModal = ({ isOpen, onClose, device, onSave }: {
  isOpen: boolean;
  onClose: () => void;
  device: any;
  onSave: (thresholds: any) => void;
}) => {
  const [form, setForm] = useState({
    threshold_peak_notice: 30,
    threshold_peak_warning: 50,
    threshold_peak_critical: 80,
    threshold_rms_notice: 10,
    threshold_rms_warning: 20,
    threshold_rms_critical: 35
  });

  useEffect(() => {
    if (device) {
      setForm({
        threshold_peak_notice: device.threshold_peak_notice || 30,
        threshold_peak_warning: device.threshold_peak_warning || 50,
        threshold_peak_critical: device.threshold_peak_critical || 80,
        threshold_rms_notice: device.threshold_rms_notice || 10,
        threshold_rms_warning: device.threshold_rms_warning || 20,
        threshold_rms_critical: device.threshold_rms_critical || 35
      });
    }
  }, [device]);

  if (!isOpen || !device) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <h3>设置告警阈值 - {device.name}</h3>
        <div className="form-grid">
          <div className="form-group">
            <label>峰值 - 注意阈值</label>
            <input 
              type="number" 
              value={form.threshold_peak_notice}
              onChange={e => setForm({...form, threshold_peak_notice: Number(e.target.value)})}
            />
          </div>
          <div className="form-group">
            <label>峰值 - 警告阈值</label>
            <input 
              type="number" 
              value={form.threshold_peak_warning}
              onChange={e => setForm({...form, threshold_peak_warning: Number(e.target.value)})}
            />
          </div>
          <div className="form-group">
            <label>峰值 - 严重阈值</label>
            <input 
              type="number" 
              value={form.threshold_peak_critical}
              onChange={e => setForm({...form, threshold_peak_critical: Number(e.target.value)})}
            />
          </div>
          <div className="form-group">
            <label>RMS - 注意阈值</label>
            <input 
              type="number" 
              value={form.threshold_rms_notice}
              onChange={e => setForm({...form, threshold_rms_notice: Number(e.target.value)})}
            />
          </div>
          <div className="form-group">
            <label>RMS - 警告阈值</label>
            <input 
              type="number" 
              value={form.threshold_rms_warning}
              onChange={e => setForm({...form, threshold_rms_warning: Number(e.target.value)})}
            />
          </div>
          <div className="form-group">
            <label>RMS - 严重阈值</label>
            <input 
              type="number" 
              value={form.threshold_rms_critical}
              onChange={e => setForm({...form, threshold_rms_critical: Number(e.target.value)})}
            />
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>取消</button>
          <button className="btn-primary" onClick={() => onSave(form)}>保存</button>
        </div>
      </div>
    </div>
  );
};

const ReportModal = ({ isOpen, onClose, report }: {
  isOpen: boolean;
  onClose: () => void;
  report: any;
}) => {
  if (!isOpen || !report) return null;

  const alarmData = [
    { name: '严重', count: report.statistics.critical_count, color: ALARM_COLORS.critical },
    { name: '警告', count: report.statistics.warning_count, color: ALARM_COLORS.warning },
    { name: '注意', count: report.statistics.notice_count, color: ALARM_COLORS.notice }
  ];

  return (
    <div className="modal-overlay report-modal" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <h3>设备振动分析报告</h3>
        
        <div className="report-section">
          <h4>设备信息</h4>
          <p>设备名称: {report.device.name}</p>
          <p>位置: {report.device.location}</p>
          <p>当前健康度: {report.health_trend.current_score.toFixed(1)}%</p>
          <p>风险等级: <span style={{color: report.health_trend.risk_level === 'High' ? ALARM_COLORS.critical : 
            report.health_trend.risk_level === 'Medium' ? ALARM_COLORS.warning : ALARM_COLORS.normal}}>
            {report.health_trend.risk_level === 'High' ? '高' : report.health_trend.risk_level === 'Medium' ? '中' : '低'}
          </span></p>
        </div>

        <div className="report-section">
          <h4>统计数据 ({report.period.days} 天)</h4>
          <div className="stats-grid">
            <div className="stat-item">
              <div className="stat-value">{report.statistics.total_records}</div>
              <div className="stat-label">总记录数</div>
            </div>
            <div className="stat-item">
              <div className="stat-value">{report.statistics.peak_avg.toFixed(2)}</div>
              <div className="stat-label">平均峰值</div>
            </div>
            <div className="stat-item">
              <div className="stat-value">{report.statistics.peak_max.toFixed(2)}</div>
              <div className="stat-label">最大峰值</div>
            </div>
            <div className="stat-item">
              <div className="stat-value">{report.statistics.rms_avg.toFixed(2)}</div>
              <div className="stat-label">平均 RMS</div>
            </div>
            <div className="stat-item">
              <div className="stat-value">{report.health_trend.anomaly_rate}%</div>
              <div className="stat-label">异常率</div>
            </div>
            <div className="stat-item">
              <div className="stat-value">{report.statistics.anomaly_count}</div>
              <div className="stat-label">异常事件数</div>
            </div>
          </div>
        </div>

        <div className="report-section">
          <h4>告警分布</h4>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={alarmData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="count" fill="#1890ff" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="report-section">
          <h4>建议</h4>
          <ul>
            {report.recommendations.map((rec: string, i: number) => (
              <li key={i}>{rec}</li>
            ))}
          </ul>
        </div>

        <div className="modal-actions">
          <button className="btn-primary" onClick={onClose}>关闭</button>
        </div>
      </div>
    </div>
  );
};

const App: React.FC = () => {
  const [devices, setDevices] = useState<any[]>([]);
  const [selectedDevices, setSelectedDevices] = useState<string[]>([]);
  const [allVibrationData, setAllVibrationData] = useState<Map<string, any[]>>(new Map());
  const [anomalies, setAnomalies] = useState<any[]>([]);
  const [alert, setAlert] = useState<{ severity: string; message: string } | null>(null);
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  
  const [thresholdModalOpen, setThresholdModalOpen] = useState(false);
  const [selectedDeviceForThreshold, setSelectedDeviceForThreshold] = useState<any>(null);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportData, setReportData] = useState<any>(null);
  const [importResult, setImportResult] = useState<any>(null);
  
  const fetchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchDevices = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE}/devices`);
      setDevices(response.data);
      if (response.data.length > 0 && selectedDevices.length === 0) {
        setSelectedDevices([response.data[0].id]);
      }
    } catch (error) {
      console.error('Error fetching devices:', error);
    }
  }, [selectedDevices.length]);

  const fetchVibrationData = useCallback(async (deviceId: string) => {
    if (!deviceId) return;
    
    setIsLoading(true);
    
    try {
      const params: any = { limit: 100 };
      if (startDate) params.start_time = startDate;
      if (endDate) params.end_time = endDate;
      const response = await axios.get(`${API_BASE}/data/${deviceId}`, { params });
      
      setAllVibrationData(prev => {
        const newMap = new Map(prev);
        newMap.set(deviceId, response.data.reverse());
        return newMap;
      });
    } catch (error) {
      console.error('Error fetching vibration data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [startDate, endDate]);

  const fetchAnomalies = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE}/anomalies`, { params: { limit: 20 } });
      setAnomalies(response.data);
    } catch (error) {
      console.error('Error fetching anomalies:', error);
    }
  }, []);

  const acknowledgeAnomaly = async (id: number) => {
    try {
      await axios.post(`${API_BASE}/anomalies/${id}/acknowledge`);
      fetchAnomalies();
    } catch (error) {
      console.error('Error acknowledging anomaly:', error);
    }
  };

  const saveThresholds = async (thresholds: any) => {
    if (!selectedDeviceForThreshold) return;
    try {
      await axios.put(`${API_BASE}/devices/${selectedDeviceForThreshold.id}/thresholds`, thresholds);
      fetchDevices();
      setThresholdModalOpen(false);
    } catch (error) {
      console.error('Error saving thresholds:', error);
    }
  };

  const exportCSV = async () => {
    if (selectedDevices.length === 0) return;
    try {
      for (const deviceId of selectedDevices) {
        const params: any = {};
        if (startDate) params.start_time = startDate;
        if (endDate) params.end_time = endDate;
        const response = await axios.get(`${API_BASE}/export/${deviceId}`, {
          params,
          responseType: 'blob'
        });
        const url = window.URL.createObjectURL(new Blob([response.data]));
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `vibration_data_${deviceId}.csv`);
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('Error exporting CSV:', error);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || selectedDevices.length === 0) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      setIsLoading(true);
      const response = await axios.post(`${API_BASE}/import/${selectedDevices[0]}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setImportResult(response.data);
      fetchVibrationData(selectedDevices[0]);
      fetchAnomalies();
      setTimeout(() => setImportResult(null), 5000);
    } catch (error: any) {
      alert('导入失败: ' + (error.response?.data?.error || error.message));
    } finally {
      setIsLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const generateReport = async () => {
    if (selectedDevices.length === 0) return;
    try {
      setIsLoading(true);
      const params: any = { days: 7 };
      if (startDate) params.start_time = startDate;
      if (endDate) params.end_time = endDate;
      const response = await axios.get(`${API_BASE}/report/${selectedDevices[0]}`, { params });
      setReportData(response.data);
      setReportModalOpen(true);
    } catch (error) {
      console.error('Error generating report:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDevices();
    fetchAnomalies();
  }, [fetchDevices, fetchAnomalies]);

  useEffect(() => {
    selectedDevices.forEach(deviceId => {
      fetchVibrationData(deviceId);
    });
  }, [selectedDevices, fetchVibrationData]);

  useEffect(() => {
    if (wsRef.current) {
      wsRef.current.close();
    }

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      if (data.type === 'vibration_data' && selectedDevices.includes(data.device_id)) {
        setAllVibrationData(prev => {
          const newMap = new Map(prev);
          const deviceData = newMap.get(data.device_id) || [];
          const newData = [...deviceData, {
            id: Date.now(),
            device_id: data.device_id,
            timestamp: data.timestamp,
            raw_data: [],
            peak_value: data.peak_value,
            rms_value: data.rms_value,
            alarm_level: data.alarm_level,
            is_anomaly: data.is_anomaly ? 1 : 0
          }];
          newMap.set(data.device_id, newData.slice(-MAX_DATA_POINTS));
          return newMap;
        });
      }
      
      if (data.type === 'anomaly') {
        setAlert({
          severity: data.severity,
          message: `设备 ${devices.find(d => d.id === data.device_id)?.name || data.device_id} 检测到 ${ALARM_LABELS[data.severity as keyof typeof ALARM_LABELS]} 振动异常！`
        });
        setTimeout(() => setAlert(null), 5000);
        fetchAnomalies();
        fetchDevices();
      }
    };

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [selectedDevices, fetchAnomalies, fetchDevices, devices]);

  const chartData = useMemo(() => {
    if (selectedDevices.length === 0) return [];
    
    const timePoints = new Set<string>();
    selectedDevices.forEach(deviceId => {
      const deviceData = allVibrationData.get(deviceId) || [];
      deviceData.forEach(d => timePoints.add(d.timestamp));
    });
    
    const sortedTimes = Array.from(timePoints).sort();
    
    return sortedTimes.map(timestamp => {
      const point: any = {
        time: new Date(timestamp).toLocaleTimeString()
      };
      
      selectedDevices.forEach((deviceId, index) => {
        const deviceData = allVibrationData.get(deviceId) || [];
        const dataPoint = deviceData.find(d => d.timestamp === timestamp);
        if (dataPoint) {
          point[`peak_${deviceId}`] = dataPoint.peak_value;
          point[`rms_${deviceId}`] = dataPoint.rms_value;
          point[`alarm_${deviceId}`] = dataPoint.alarm_level;
        }
      });
      
      return point;
    });
  }, [selectedDevices, allVibrationData]);

  const downsampledChartData = useMemo(() => {
    return downsampleData(chartData, 50);
  }, [chartData]);

  const rawSignalData = useMemo(() => {
    if (selectedDevices.length === 0) return [];
    const deviceId = selectedDevices[0];
    const deviceData = allVibrationData.get(deviceId) || [];
    if (deviceData.length === 0) return [];
    
    const rawData = deviceData[deviceData.length - 1].raw_data || [];
    const sampled = downsampleData(rawData.map((v: number, i: number) => ({ index: i, value: v })), 200);
    return sampled;
  }, [selectedDevices, allVibrationData]);

  const toggleDevice = (deviceId: string) => {
    setSelectedDevices(prev => {
      if (prev.includes(deviceId)) {
        return prev.filter(id => id !== deviceId);
      } else if (prev.length < MAX_DISPLAY_DEVICES) {
        return [...prev, deviceId];
      }
      return prev;
    });
  };

  const deviceNameMap = useMemo(() => {
    const map = new Map<string, string>();
    devices.forEach(d => map.set(d.id, d.name));
    return map;
  }, [devices]);

  const getDeviceColor = (index: number) => COLORS[index % COLORS.length];

  return (
    <div className="app">
      <header className="header">
        <h1>工业设备振动信号分析系统</h1>
      </header>

      {alert && (
        <div className={`alert-banner ${alert.severity}`}>
          {alert.message}
        </div>
      )}

      {importResult && (
        <div className="alert-banner normal">
          导入成功！共导入 {importResult.imported} 条记录，其中异常 {importResult.anomalies} 条
        </div>
      )}

      <main className="main-content">
        <div className="dashboard-grid">
          <div className="card full-width">
            <div className="card-header">
              <h2>设备健康度热力图</h2>
              <div className="card-actions">
                <span className="selection-hint">
                  已选择 {selectedDevices.length}/{MAX_DISPLAY_DEVICES} 台设备
                </span>
                {selectedDevices.length === 1 && (
                  <button 
                    className="btn-secondary"
                    onClick={() => {
                      const device = devices.find(d => d.id === selectedDevices[0]);
                      setSelectedDeviceForThreshold(device);
                      setThresholdModalOpen(true);
                    }}
                  >
                    设置阈值
                  </button>
                )}
              </div>
            </div>
            <div className="health-grid">
              {devices.map(device => (
                <DeviceCard
                  key={device.id}
                  device={device}
                  isSelected={selectedDevices.includes(device.id)}
                  onClick={() => toggleDevice(device.id)}
                />
              ))}
            </div>
          </div>

          <div className="card full-width">
            <div className="card-header">
              <h2>实时振动曲线 {isLoading && '(加载中...)'}</h2>
            </div>
            <div className="chart-controls">
              <input 
                type="datetime-local" 
                className="date-input"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                placeholder="开始时间"
              />
              <input 
                type="datetime-local" 
                className="date-input"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                placeholder="结束时间"
              />
              <button className="btn-primary" onClick={exportCSV}>
                导出 CSV
              </button>
              <input 
                ref={fileInputRef}
                type="file" 
                accept=".csv"
                style={{ display: 'none' }}
                onChange={handleFileUpload}
              />
              <button 
                className="btn-secondary" 
                onClick={() => fileInputRef.current?.click()}
                disabled={selectedDevices.length !== 1}
              >
                导入 CSV
              </button>
              <button 
                className="btn-secondary" 
                onClick={generateReport}
                disabled={selectedDevices.length !== 1}
              >
                生成报告
              </button>
            </div>
            <ResponsiveContainer width="100%" height={350}>
              <LineChart data={downsampledChartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="time" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                {selectedDevices.map((deviceId, index) => (
                  <Line
                    key={deviceId}
                    type="monotone"
                    dataKey={`peak_${deviceId}`}
                    stroke={getDeviceColor(index)}
                    strokeWidth={2}
                    name={`${deviceNameMap.get(deviceId)} - 峰值`}
                    dot={false}
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="card">
            <h2>原始振动信号</h2>
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={rawSignalData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="index" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Area 
                  type="monotone" 
                  dataKey="value" 
                  stroke={COLORS[0]} 
                  fill="#e6f7ff" 
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="card">
            <div className="card-header">
              <h2>异常事件记录</h2>
              <span className="count-badge">{anomalies.length}</span>
            </div>
            <div className="anomaly-list">
              {anomalies.length === 0 ? (
                <p style={{ color: '#999', textAlign: 'center', padding: '20px' }}>暂无异常事件</p>
              ) : (
                anomalies.map(anomaly => (
                  <AnomalyItem
                    key={anomaly.id}
                    anomaly={anomaly}
                    deviceName={deviceNameMap.get(anomaly.device_id) || anomaly.device_id}
                    onAcknowledge={acknowledgeAnomaly}
                  />
                ))
              )}
            </div>
          </div>

          <div className="card full-width">
            <h2>系统统计</h2>
            <div className="stats-grid">
              <div className="stat-item">
                <div className="stat-value">{devices.length}</div>
                <div className="stat-label">设备总数</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{devices.filter(d => d.status === 'normal').length}</div>
                <div className="stat-label">正常设备</div>
              </div>
              <div className="stat-item">
                <div className="stat-value" style={{ color: ALARM_COLORS.notice }}>
                  {devices.filter(d => d.status === 'notice').length}
                </div>
                <div className="stat-label">注意状态</div>
              </div>
              <div className="stat-item">
                <div className="stat-value" style={{ color: ALARM_COLORS.warning }}>
                  {devices.filter(d => d.status === 'warning').length}
                </div>
                <div className="stat-label">警告状态</div>
              </div>
              <div className="stat-item">
                <div className="stat-value" style={{ color: ALARM_COLORS.critical }}>
                  {devices.filter(d => d.status === 'critical').length}
                </div>
                <div className="stat-label">严重状态</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{anomalies.filter(a => !a.acknowledged).length}</div>
                <div className="stat-label">待确认异常</div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <ThresholdModal
        isOpen={thresholdModalOpen}
        onClose={() => setThresholdModalOpen(false)}
        device={selectedDeviceForThreshold}
        onSave={saveThresholds}
      />

      <ReportModal
        isOpen={reportModalOpen}
        onClose={() => setReportModalOpen(false)}
        report={reportData}
      />
    </div>
  );
};

export default App;
