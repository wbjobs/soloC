import { useState, useEffect, useCallback } from "react";
import {
  listDevices,
  getRoutings,
  createRouting,
  deleteRouting,
  startAudio,
  stopAudio,
  isAudioRunning,
  setRoutingGain,
  setRoutingLowpass,
  toggleRouting,
  listenToChannelLevels,
} from "./api";
import { AudioDevice, RoutingConfig, ChannelLevels } from "./types";
import DeviceList from "./components/DeviceList";
import RoutingManager from "./components/RoutingManager";
import LevelMeter from "./components/LevelMeter";
import EffectsPanel from "./components/EffectsPanel";
import SceneManager from "./components/SceneManager";
import PluginManager from "./components/PluginManager";

export default function App() {
  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [routings, setRoutings] = useState<RoutingConfig[]>([]);
  const [selectedRoutingId, setSelectedRoutingId] = useState<string | null>(null);
  const [channelLevels, setChannelLevels] = useState<ChannelLevels[]>([]);
  const [audioRunning, setAudioRunning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"scenes" | "plugins">("scenes");

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [deviceList, routingList, running] = await Promise.all([
        listDevices(),
        getRoutings(),
        isAudioRunning(),
      ]);
      setDevices(deviceList);
      setRoutings(routingList);
      setAudioRunning(running);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载数据失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    let unlisten: (() => void) | null = null;

    const setupListener = async () => {
      try {
        unlisten = await listenToChannelLevels((levels) => {
          setChannelLevels(levels);
        });
      } catch (err) {
        console.warn("电平监听设置失败:", err);
      }
    };

    setupListener();

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, []);

  const handleCreateRouting = async (routing: Omit<RoutingConfig, "id">) => {
    try {
      const newRouting = await createRouting(routing);
      setRoutings((prev) => [...prev, newRouting]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建路由失败");
    }
  };

  const handleDeleteRouting = async (id: string) => {
    try {
      await deleteRouting(id);
      setRoutings((prev) => prev.filter((r) => r.id !== id));
      if (selectedRoutingId === id) {
        setSelectedRoutingId(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除路由失败");
    }
  };

  const handleToggleAudio = async () => {
    try {
      if (audioRunning) {
        await stopAudio();
        setAudioRunning(false);
      } else {
        await startAudio();
        setAudioRunning(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "音频控制失败");
    }
  };

  const handleGainChange = async (routingId: string, gain: number) => {
    try {
      await setRoutingGain(routingId, gain);
      setRoutings((prev) =>
        prev.map((r) => (r.id === routingId ? { ...r, gain } : r))
      );
    } catch (err) {
      console.error("增益设置失败:", err);
    }
  };

  const handleLowpassChange = async (routingId: string, cutoff: number) => {
    try {
      await setRoutingLowpass(routingId, cutoff);
      setRoutings((prev) =>
        prev.map((r) => (r.id === routingId ? { ...r, lowpass_cutoff: cutoff } : r))
      );
    } catch (err) {
      console.error("低通滤波器设置失败:", err);
    }
  };

  const handleToggleRouting = async (routingId: string, enabled: boolean) => {
    try {
      await toggleRouting(routingId, enabled);
      setRoutings((prev) =>
        prev.map((r) => (r.id === routingId ? { ...r, enabled } : r))
      );
    } catch (err) {
      console.error("路由切换失败:", err);
    }
  };

  const handleSceneApplied = async (newRoutings: RoutingConfig[]) => {
    if (audioRunning) {
      alert("请先停止音频再切换场景");
      return;
    }
    setRoutings(newRoutings);
    setSelectedRoutingId(null);
  };

  const selectedRouting = routings.find((r) => r.id === selectedRoutingId) || null;
  const selectedLevels = selectedRouting
    ? channelLevels.find((l) => l.routing_id === selectedRoutingId)
    : null;

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>多通道USB音频接口控制面板</h1>
      </header>

      <main className="app-content">
        {error && (
          <div
            style={{
              backgroundColor: "#dc3545",
              padding: "1rem",
              borderRadius: "8px",
              marginBottom: "1rem",
            }}
          >
            {error}
            <button
              className="button"
              style={{ marginLeft: "1rem" }}
              onClick={() => setError(null)}
            >
              关闭
            </button>
          </div>
        )}

        <section className="section">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2 className="section-title">音频设备</h2>
            <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
              <div className="status-indicator">
                <div className={`status-dot ${audioRunning ? "active" : "inactive"}`} />
                <span>{audioRunning ? "音频运行中" : "音频已停止"}</span>
              </div>
              <button
                className={`button ${audioRunning ? "button-danger" : ""}`}
                onClick={handleToggleAudio}
                disabled={routings.length === 0 || loading}
              >
                {audioRunning ? "停止音频" : "启动音频"}
              </button>
            </div>
          </div>

          {loading ? (
            <div className="empty-state">加载中...</div>
          ) : (
            <DeviceList devices={devices} />
          )}
        </section>

        <section className="section">
          <h2 className="section-title">虚拟路由</h2>
          <RoutingManager
            devices={devices}
            routings={routings}
            selectedRoutingId={selectedRoutingId}
            onCreate={handleCreateRouting}
            onDelete={handleDeleteRouting}
            onSelect={setSelectedRoutingId}
            onToggle={handleToggleRouting}
            audioRunning={audioRunning}
          />
        </section>

        {selectedRouting && (
          <>
            <section className="section">
              <h2 className="section-title">
                实时电平表 - {selectedRouting.name}
              </h2>
              <LevelMeter
                leftLevel={selectedLevels?.left || 0}
                rightLevel={selectedLevels?.right || 0}
              />
            </section>

            <section className="section">
              <h2 className="section-title">
                效果器 - {selectedRouting.name}
              </h2>
              <EffectsPanel
                routing={selectedRouting}
                onGainChange={(gain) => handleGainChange(selectedRouting.id, gain)}
                onLowpassChange={(cutoff) => handleLowpassChange(selectedRouting.id, cutoff)}
                disabled={!audioRunning || !selectedRouting.enabled}
              />
            </section>
          </>
        )}

        <section className="section">
          <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
            <button
              className={`button ${activeTab === "scenes" ? "" : "button-secondary"}`}
              onClick={() => setActiveTab("scenes")}
            >
              🎬 场景预设
            </button>
            <button
              className={`button ${activeTab === "plugins" ? "" : "button-secondary"}`}
              onClick={() => setActiveTab("plugins")}
            >
              🎛️ VST3 插件
            </button>
          </div>

          {activeTab === "scenes" ? (
            <SceneManager
              routings={routings}
              onSceneApplied={handleSceneApplied}
              disabled={audioRunning}
            />
          ) : (
            <PluginManager
              selectedRoutingId={selectedRoutingId}
            />
          )}
        </section>
      </main>

      <footer className="status-bar">
        <span>设备数量: {devices.length} | 路由数量: {routings.length}</span>
        <span>Tauri v2 + React + Rust</span>
      </footer>
    </div>
  );
}
