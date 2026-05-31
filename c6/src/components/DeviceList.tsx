import React from "react";
import { AudioDevice } from "../types";

interface DeviceListProps {
  devices: AudioDevice[];
}

const DeviceList: React.FC<DeviceListProps> = ({ devices }) => {
  if (devices.length === 0) {
    return <div className="empty-state">未发现音频设备</div>;
  }

  const getDeviceTypeIcon = (type: string) => {
    switch (type) {
      case "input":
        return "🎤";
      case "output":
        return "🔊";
      case "duplex":
        return "🎧";
      default:
        return "📦";
    }
  };

  const getDeviceTypeName = (type: string) => {
    switch (type) {
      case "input":
        return "输入";
      case "output":
        return "输出";
      case "duplex":
        return "双向";
      default:
        return "未知";
    }
  };

  return (
    <div className="device-grid">
      {devices.map((device) => (
        <div key={device.id} className="device-card">
          <div className="device-name">
            {getDeviceTypeIcon(device.device_type)} {device.name}
          </div>
          <div className="device-info">
            <div className="device-info-item">
              <span className="device-info-label">类型</span>
              <span>{getDeviceTypeName(device.device_type)}</span>
            </div>
            <div className="device-info-item">
              <span className="device-info-label">通道数</span>
              <span>{device.channels}</span>
            </div>
            <div className="device-info-item">
              <span className="device-info-label">采样率</span>
              <span>{device.sample_rate} Hz</span>
            </div>
            <div className="device-info-item">
              <span className="device-info-label">缓冲区</span>
              <span>{device.buffer_size} 帧</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default DeviceList;
