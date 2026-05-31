import React, { useState, useEffect } from 'react';

interface HeatmapProps {
  startDate: string;
  endDate: string;
}

const Heatmap: React.FC<HeatmapProps> = ({ startDate, endDate }) => {
  const [heatmapData, setHeatmapData] = useState<{ [key: string]: { [key: string]: number } }>({});

  useEffect(() => {
    loadHeatmapData();
  }, [startDate, endDate]);

  const loadHeatmapData = async () => {
    const data = await window.electronAPI.getHeatmapData(startDate, endDate);
    setHeatmapData(data);
  };

  const getColor = (value: number): string => {
    if (value === 0) return '#1a1a2e';
    if (value < 5) return '#16425b';
    if (value < 10) return '#2f6690';
    if (value < 20) return '#3a7ca5';
    if (value < 50) return '#81c3d7';
    return '#d9dcd6';
  };

  const dates = Object.keys(heatmapData).sort();
  const hours = Array.from({ length: 24 }, (_, i) => i.toString());

  if (dates.length === 0) {
    return (
      <div className="heatmap-container">
        <h2>时间分布热力图</h2>
        <div className="empty-state">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zm-5-7h2v2h-2zm0-4h2v2h-2zm-4 4h2v2h-2zm0-4h2v2H8zm-4 4h2v2H4zm0-4h2v2H4z" />
          </svg>
          <p>暂无数据，请先导入日志文件</p>
        </div>
      </div>
    );
  }

  return (
    <div className="heatmap-container">
      <h2>时间分布热力图（按小时）</h2>
      <div className="heatmap">
        <div className="heatmap-header">
          <span></span>
          {hours.map(hour => (
            <span key={hour}>{hour.padStart(2, '0')}</span>
          ))}
        </div>
        {dates.map(date => (
          <div key={date} className="heatmap-row">
            <span className="heatmap-date">{date}</span>
            {hours.map(hour => (
              <div
                key={hour}
                className="heatmap-cell"
                style={{ backgroundColor: getColor(heatmapData[date]?.[hour] || 0) }}
                title={`${date} ${hour.padStart(2, '0')}时: ${heatmapData[date]?.[hour] || 0}条日志`}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

export default Heatmap;
