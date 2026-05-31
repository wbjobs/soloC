import React, { useState } from "react";
import { AudioDevice, RoutingConfig } from "../types";

interface RoutingManagerProps {
  devices: AudioDevice[];
  routings: RoutingConfig[];
  selectedRoutingId: string | null;
  onCreate: (routing: Omit<RoutingConfig, "id">) => void;
  onDelete: (id: string) => void;
  onSelect: (id: string | null) => void;
  onToggle: (id: string, enabled: boolean) => void;
  audioRunning: boolean;
}

const RoutingManager: React.FC<RoutingManagerProps> = ({
  devices,
  routings,
  selectedRoutingId,
  onCreate,
  onDelete,
  onSelect,
  onToggle,
  audioRunning,
}) => {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [inputDeviceId, setInputDeviceId] = useState("");
  const [inputChannelStart, setInputChannelStart] = useState(1);
  const [outputDeviceId, setOutputDeviceId] = useState("");
  const [outputChannelStart, setOutputChannelStart] = useState(1);

  const inputDevices = devices.filter(
    (d) => d.device_type === "input" || d.device_type === "duplex"
  );
  const outputDevices = devices.filter(
    (d) => d.device_type === "output" || d.device_type === "duplex"
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !inputDeviceId || !outputDeviceId) return;

    const inputDevice = devices.find((d) => d.id === inputDeviceId);
    const outputDevice = devices.find((d) => d.id === outputDeviceId);

    if (!inputDevice || !outputDevice) return;

    onCreate({
      name,
      input_device_id: inputDeviceId,
      input_channels: [inputChannelStart, inputChannelStart + 1],
      output_device_id: outputDeviceId,
      output_channels: [outputChannelStart, outputChannelStart + 1],
      gain: 1.0,
      lowpass_cutoff: 20000,
      enabled: true,
    });

    setName("");
    setInputDeviceId("");
    setInputChannelStart(1);
    setOutputDeviceId("");
    setOutputChannelStart(1);
    setShowForm(false);
  };

  const getDeviceName = (id: string) => {
    return devices.find((d) => d.id === id)?.name || "未知设备";
  };

  return (
    <div>
      {!showForm && (
        <button
          className="button"
          onClick={() => setShowForm(true)}
          style={{ marginBottom: "1rem" }}
        >
          + 创建新路由
        </button>
      )}

      {showForm && (
        <form className="routing-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">路由名称</label>
            <input
              className="form-input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如: 主混音"
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">输入设备</label>
            <select
              className="form-select"
              value={inputDeviceId}
              onChange={(e) => setInputDeviceId(e.target.value)}
              required
            >
              <option value="">选择输入设备</option>
              {inputDevices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">输入起始通道</label>
            <select
              className="form-select"
              value={inputChannelStart}
              onChange={(e) => setInputChannelStart(Number(e.target.value))}
            >
              {inputDeviceId &&
                Array.from(
                  {
                    length: Math.max(
                      0,
                      (devices.find((d) => d.id === inputDeviceId)?.channels || 2) - 1
                    ),
                  },
                  (_, i) => i + 1
                ).map((ch) => (
                  <option key={ch} value={ch}>
                    通道 {ch}-{ch + 1}
                  </option>
                ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">输出设备</label>
            <select
              className="form-select"
              value={outputDeviceId}
              onChange={(e) => setOutputDeviceId(e.target.value)}
              required
            >
              <option value="">选择输出设备</option>
              {outputDevices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">输出起始通道</label>
            <select
              className="form-select"
              value={outputChannelStart}
              onChange={(e) => setOutputChannelStart(Number(e.target.value))}
            >
              {outputDeviceId &&
                Array.from(
                  {
                    length: Math.max(
                      0,
                      (devices.find((d) => d.id === outputDeviceId)?.channels || 2) - 1
                    ),
                  },
                  (_, i) => i + 1
                ).map((ch) => (
                  <option key={ch} value={ch}>
                    通道 {ch}-{ch + 1}
                  </option>
                ))}
            </select>
          </div>

          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              type="submit"
              className="button"
              disabled={!name || !inputDeviceId || !outputDeviceId}
            >
              创建
            </button>
            <button
              type="button"
              className="button button-secondary"
              onClick={() => setShowForm(false)}
            >
              取消
            </button>
          </div>
        </form>
      )}

      {routings.length === 0 ? (
        <div className="empty-state">暂无路由配置</div>
      ) : (
        <table className="routing-table">
          <thead>
            <tr>
              <th>名称</th>
              <th>输入</th>
              <th>输出</th>
              <th>增益</th>
              <th>低通滤波</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {routings.map((routing) => (
              <tr
                key={routing.id}
                style={{
                  cursor: "pointer",
                  backgroundColor:
                    selectedRoutingId === routing.id ? "rgba(233, 69, 96, 0.2)" : undefined,
                }}
                onClick={() => onSelect(routing.id)}
              >
                <td style={{ fontWeight: "600" }}>{routing.name}</td>
                <td>
                  {getDeviceName(routing.input_device_id)}
                  <br />
                  <span style={{ color: "#707070", fontSize: "0.8rem" }}>
                    通道 {routing.input_channels.join("-")}
                  </span>
                </td>
                <td>
                  {getDeviceName(routing.output_device_id)}
                  <br />
                  <span style={{ color: "#707070", fontSize: "0.8rem" }}>
                    通道 {routing.output_channels.join("-")}
                  </span>
                </td>
                <td>{(routing.gain * 100).toFixed(0)}%</td>
                <td>
                  {routing.lowpass_cutoff >= 20000
                    ? "关闭"
                    : `${routing.lowpass_cutoff} Hz`}
                </td>
                <td>
                  <button
                    className={`button ${routing.enabled ? "" : "button-secondary"}`}
                    style={{ fontSize: "0.75rem", padding: "0.25rem 0.5rem" }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggle(routing.id, !routing.enabled);
                    }}
                    disabled={audioRunning}
                  >
                    {routing.enabled ? "启用" : "禁用"}
                  </button>
                </td>
                <td>
                  <button
                    className="button button-danger"
                    style={{ fontSize: "0.75rem", padding: "0.25rem 0.5rem" }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(`确定要删除路由 "${routing.name}" 吗?`)) {
                        onDelete(routing.id);
                      }
                    }}
                    disabled={audioRunning}
                  >
                    删除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default RoutingManager;
