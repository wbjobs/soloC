import { useState, useEffect } from "react";
import {
  getPlugins,
  registerPlugin,
  unregisterPlugin,
  getRoutingPlugins,
  addPluginToRouting,
  removePluginFromRouting,
  togglePluginBypass,
} from "../api";
import { PluginInfo, RoutingPluginConfig } from "../types";

interface PluginManagerProps {
  selectedRoutingId: string | null;
}

export default function PluginManager({
  selectedRoutingId,
}: PluginManagerProps) {
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  const [routingPlugins, setRoutingPlugins] = useState<RoutingPluginConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [showRegisterForm, setShowRegisterForm] = useState(false);
  const [newPluginPath, setNewPluginPath] = useState("");
  const [newPluginName, setNewPluginName] = useState("");
  const [newPluginVendor, setNewPluginVendor] = useState("");
  const [newPluginType, setNewPluginType] = useState("effect");

  const loadPlugins = async () => {
    try {
      const loaded = await getPlugins();
      setPlugins(loaded);
    } catch (err) {
      console.error("加载插件失败:", err);
    }
  };

  const loadRoutingPlugins = async () => {
    if (!selectedRoutingId) {
      setRoutingPlugins([]);
      return;
    }
    try {
      const loaded = await getRoutingPlugins(selectedRoutingId);
      setRoutingPlugins(loaded);
    } catch (err) {
      console.error("加载路由插件失败:", err);
    }
  };

  useEffect(() => {
    loadPlugins();
  }, []);

  useEffect(() => {
    loadRoutingPlugins();
  }, [selectedRoutingId]);

  const handlePathChange = (value: string) => {
    setNewPluginPath(value);
    if (value && !newPluginName) {
      const pathParts = value.split(/[/\\]/);
      const fileName = pathParts[pathParts.length - 1] || "";
      setNewPluginName(fileName.replace(/\.[^.]+$/, ""));
    }
  };

  const handleRegisterPlugin = async () => {
    if (!newPluginPath.trim() || !newPluginName.trim()) {
      alert("请填写插件路径和名称");
      return;
    }

    setLoading(true);
    try {
      await registerPlugin({
        name: newPluginName.trim(),
        vendor: newPluginVendor.trim() || "Unknown",
        plugin_path: newPluginPath.trim(),
        plugin_type: newPluginType,
        category: null,
      });
      setNewPluginPath("");
      setNewPluginName("");
      setNewPluginVendor("");
      setShowRegisterForm(false);
      await loadPlugins();
    } catch (err) {
      console.error("注册插件失败:", err);
      alert(err instanceof Error ? err.message : "注册插件失败");
    } finally {
      setLoading(false);
    }
  };

  const handleUnregisterPlugin = async (plugin: PluginInfo) => {
    if (!confirm(`确定要卸载插件 "${plugin.name}" 吗?`)) {
      return;
    }

    try {
      await unregisterPlugin(plugin.id);
      await loadPlugins();
    } catch (err) {
      console.error("卸载插件失败:", err);
      alert(err instanceof Error ? err.message : "卸载插件失败");
    }
  };

  const handleAddToRouting = async (plugin: PluginInfo) => {
    if (!selectedRoutingId) {
      alert("请先选择一个路由");
      return;
    }

    const position = routingPlugins.length;
    try {
      await addPluginToRouting(selectedRoutingId, plugin.id, position);
      await loadRoutingPlugins();
    } catch (err) {
      console.error("添加插件到路由失败:", err);
      alert(err instanceof Error ? err.message : "添加插件失败");
    }
  };

  const handleRemoveFromRouting = async (rp: RoutingPluginConfig) => {
    try {
      await removePluginFromRouting(rp.id);
      await loadRoutingPlugins();
    } catch (err) {
      console.error("移除插件失败:", err);
      alert(err instanceof Error ? err.message : "移除插件失败");
    }
  };

  const handleToggleBypass = async (rp: RoutingPluginConfig) => {
    try {
      await togglePluginBypass(rp.id, !rp.is_bypassed);
      await loadRoutingPlugins();
    } catch (err) {
      console.error("切换旁路状态失败:", err);
    }
  };

  const getPluginName = (pluginId: string) => {
    return plugins.find((p) => p.id === pluginId)?.name || "未知插件";
  };

  return (
    <div style={{ marginTop: "1rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1rem" }}>
        <h3 style={{ color: "#e94560", margin: 0 }}>插件管理器 (VST3)</h3>
        <button
          className="button"
          onClick={() => setShowRegisterForm(true)}
          disabled={loading}
        >
          注册 VST3 插件
        </button>
      </div>

      {showRegisterForm && (
        <div
          style={{
            backgroundColor: "#0f3460",
            padding: "1rem",
            borderRadius: "8px",
            marginBottom: "1rem",
          }}
        >
          <div className="form-group">
            <label className="form-label">插件路径</label>
            <input
              className="form-input"
              type="text"
              value={newPluginPath}
              onChange={(e) => handlePathChange(e.target.value)}
              placeholder="例如: C:\Program Files\Common Files\VST3\MyPlugin.vst3"
            />
            <div style={{ fontSize: "0.75rem", color: "#707070", marginTop: "0.25rem" }}>
              请输入 VST3 插件的完整路径 (.vst3 或 .dll)
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">插件名称</label>
            <input
              className="form-input"
              type="text"
              value={newPluginName}
              onChange={(e) => setNewPluginName(e.target.value)}
              placeholder="插件显示名称"
            />
          </div>

          <div className="form-group">
            <label className="form-label">厂商</label>
            <input
              className="form-input"
              type="text"
              value={newPluginVendor}
              onChange={(e) => setNewPluginVendor(e.target.value)}
              placeholder="插件厂商 (可选)"
            />
          </div>

          <div className="form-group">
            <label className="form-label">类型</label>
            <select
              className="form-select"
              value={newPluginType}
              onChange={(e) => setNewPluginType(e.target.value)}
            >
              <option value="effect">效果器</option>
              <option value="instrument">乐器</option>
              <option value="utility">工具</option>
            </select>
          </div>

          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              className="button"
              onClick={handleRegisterPlugin}
              disabled={loading || !newPluginPath.trim() || !newPluginName.trim()}
            >
              注册
            </button>
            <button
              className="button button-secondary"
              onClick={() => setShowRegisterForm(false)}
              disabled={loading}
            >
              取消
            </button>
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
        <div>
          <h4 style={{ color: "#a0a0a0", marginBottom: "0.5rem", fontSize: "0.9rem" }}>
            已注册插件
          </h4>

          {plugins.length === 0 ? (
            <div className="empty-state" style={{ backgroundColor: "#0f3460" }}>
              暂无注册的插件
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {plugins.map((plugin) => (
                <div
                  key={plugin.id}
                  className="device-card"
                  style={{ padding: "0.75rem" }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{plugin.name}</div>
                      <div style={{ color: "#707070", fontSize: "0.75rem" }}>
                        {plugin.vendor} · {plugin.plugin_type}
                      </div>
                      <div style={{ color: "#555", fontSize: "0.7rem", wordBreak: "break-all" }}>
                        {plugin.plugin_path}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
                    {selectedRoutingId && (
                      <button
                        className="button"
                        style={{ fontSize: "0.7rem", padding: "0.25rem 0.5rem", flex: 1 }}
                        onClick={() => handleAddToRouting(plugin)}
                        disabled={loading}
                      >
                        添加到当前路由
                      </button>
                    )}
                    <button
                      className="button button-danger"
                      style={{ fontSize: "0.7rem", padding: "0.25rem 0.5rem" }}
                      onClick={() => handleUnregisterPlugin(plugin)}
                      disabled={loading}
                    >
                      卸载
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <h4 style={{ color: "#a0a0a0", marginBottom: "0.5rem", fontSize: "0.9rem" }}>
            {selectedRoutingId ? `当前路由插件链` : "请先选择一个路由"}
          </h4>

          {!selectedRoutingId ? (
            <div className="empty-state" style={{ backgroundColor: "#0f3460" }}>
              选择路由以管理其插件链
            </div>
          ) : routingPlugins.length === 0 ? (
            <div className="empty-state" style={{ backgroundColor: "#0f3460" }}>
              该路由暂无插件
              <div style={{ fontSize: "0.8rem", marginTop: "0.5rem" }}>
                从左侧选择插件添加到路由
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {routingPlugins.map((rp, index) => (
                <div
                  key={rp.id}
                  className="device-card"
                  style={{
                    padding: "0.75rem",
                    opacity: rp.is_bypassed ? 0.5 : 1,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <span style={{ color: "#707070", marginRight: "0.5rem" }}>
                        {index + 1}.
                      </span>
                      <span style={{ fontWeight: 600 }}>
                        {getPluginName(rp.plugin_id)}
                      </span>
                      {rp.is_bypassed && (
                        <span
                          style={{
                            fontSize: "0.65rem",
                            marginLeft: "0.5rem",
                            backgroundColor: "#ffc107",
                            color: "#000",
                            padding: "0.1rem 0.3rem",
                            borderRadius: "3px",
                          }}
                        >
                          Bypassed
                        </span>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: "0.25rem" }}>
                      <button
                        className={`button ${rp.is_bypassed ? "" : "button-secondary"}`}
                        style={{ fontSize: "0.65rem", padding: "0.2rem 0.4rem" }}
                        onClick={() => handleToggleBypass(rp)}
                      >
                        {rp.is_bypassed ? "启用" : "旁路"}
                      </button>
                      <button
                        className="button button-danger"
                        style={{ fontSize: "0.65rem", padding: "0.2rem 0.4rem" }}
                        onClick={() => handleRemoveFromRouting(rp)}
                      >
                        移除
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div
        style={{
          marginTop: "1rem",
          padding: "0.75rem",
          backgroundColor: "rgba(15, 52, 96, 0.5)",
          borderRadius: "8px",
          fontSize: "0.85rem",
          color: "#707070",
        }}
      >
        <strong>VST3 插件支持:</strong> 可以注册 .vst3 或 .dll 格式的 VST3 插件。
        插件将按顺序在路由中处理音频信号。当前实现已完成数据库和UI基础架构，
        完整的音频处理需要集成 VST3 SDK。
      </div>
    </div>
  );
}
