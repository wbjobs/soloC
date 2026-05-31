import { useState } from "react";
import {
  getScenes,
  applyScene,
  saveCurrentAsScene,
  deleteScene,
  setDefaultScene,
  createScene,
} from "../api";
import { Scene, RoutingConfig } from "../types";

interface SceneManagerProps {
  routings: RoutingConfig[];
  onSceneApplied: (routings: RoutingConfig[]) => void;
  disabled: boolean;
}

export default function SceneManager({
  routings,
  onSceneApplied,
  disabled,
}: SceneManagerProps) {
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newSceneName, setNewSceneName] = useState("");
  const [newSceneDescription, setNewSceneDescription] = useState("");
  const [saveAsNew, setSaveAsNew] = useState(true);
  const [loading, setLoading] = useState(false);

  const loadScenes = async () => {
    try {
      const loaded = await getScenes();
      setScenes(loaded);
    } catch (err) {
      console.error("加载场景失败:", err);
    }
  };

  useState(() => {
    loadScenes();
  });

  const handleApplyScene = async (scene: Scene) => {
    if (disabled) return;

    setLoading(true);
    try {
      const newRoutings = await applyScene(scene.id);
      onSceneApplied(newRoutings);
    } catch (err) {
      console.error("应用场景失败:", err);
      alert(err instanceof Error ? err.message : "应用场景失败");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveScene = async () => {
    if (!newSceneName.trim()) {
      alert("请输入场景名称");
      return;
    }

    setLoading(true);
    try {
      if (saveAsNew) {
        await saveCurrentAsScene(
          newSceneName.trim(),
          newSceneDescription.trim() || null
        );
      } else {
        await createScene({
          name: newSceneName.trim(),
          description: newSceneDescription.trim() || null,
          routings: routings,
        });
      }
      setNewSceneName("");
      setNewSceneDescription("");
      setShowCreateForm(false);
      await loadScenes();
    } catch (err) {
      console.error("保存场景失败:", err);
      alert(err instanceof Error ? err.message : "保存场景失败");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteScene = async (scene: Scene) => {
    if (scene.is_default) {
      alert("无法删除默认场景");
      return;
    }

    if (!confirm(`确定要删除场景 "${scene.name}" 吗?`)) {
      return;
    }

    try {
      await deleteScene(scene.id);
      await loadScenes();
    } catch (err) {
      console.error("删除场景失败:", err);
      alert(err instanceof Error ? err.message : "删除场景失败");
    }
  };

  const handleSetDefault = async (scene: Scene) => {
    try {
      await setDefaultScene(scene.id);
      await loadScenes();
    } catch (err) {
      console.error("设置默认场景失败:", err);
      alert(err instanceof Error ? err.message : "设置默认场景失败");
    }
  };

  return (
    <div style={{ marginTop: "1rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1rem" }}>
        <h3 style={{ color: "#e94560", margin: 0 }}>场景预设</h3>
        <button
          className="button"
          onClick={() => setShowCreateForm(true)}
          disabled={loading || disabled}
        >
          保存当前为场景
        </button>
      </div>

      {showCreateForm && (
        <div
          style={{
            backgroundColor: "#0f3460",
            padding: "1rem",
            borderRadius: "8px",
            marginBottom: "1rem",
          }}
        >
          <div className="form-group">
            <label className="form-label">场景名称</label>
            <input
              className="form-input"
              type="text"
              value={newSceneName}
              onChange={(e) => setNewSceneName(e.target.value)}
              placeholder="例如: 吉他录制模式"
            />
          </div>

          <div className="form-group">
            <label className="form-label">描述 (可选)</label>
            <input
              className="form-input"
              type="text"
              value={newSceneDescription}
              onChange={(e) => setNewSceneDescription(e.target.value)}
              placeholder="场景描述"
            />
          </div>

          <div className="form-group" style={{ flexDirection: "row", gap: "1rem" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <input
                type="checkbox"
                checked={saveAsNew}
                onChange={(e) => setSaveAsNew(e.target.checked)}
              />
              <span style={{ color: "#a0a0a0" }}>保存当前配置</span>
            </label>
          </div>

          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              className="button"
              onClick={handleSaveScene}
              disabled={loading || !newSceneName.trim()}
            >
              保存
            </button>
            <button
              className="button button-secondary"
              onClick={() => setShowCreateForm(false)}
              disabled={loading}
            >
              取消
            </button>
          </div>
        </div>
      )}

      {scenes.length === 0 ? (
        <div className="empty-state">暂无场景预设</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "0.75rem" }}>
          {scenes.map((scene) => (
            <div
              key={scene.id}
              className="device-card"
              style={{ position: "relative" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <strong>{scene.name}</strong>
                    {scene.is_default && (
                      <span
                        style={{
                          fontSize: "0.7rem",
                          backgroundColor: "#e94560",
                          padding: "0.1rem 0.4rem",
                          borderRadius: "4px",
                        }}
                      >
                        默认
                      </span>
                    )}
                  </div>
                  {scene.description && (
                    <div style={{ color: "#707070", fontSize: "0.8rem", marginTop: "0.25rem" }}>
                      {scene.description}
                    </div>
                  )}
                </div>
              </div>

              <div style={{ marginTop: "0.75rem", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                <button
                  className="button"
                  style={{ fontSize: "0.75rem", padding: "0.3rem 0.6rem", flex: 1 }}
                  onClick={() => handleApplyScene(scene)}
                  disabled={loading || disabled}
                >
                  应用
                </button>
                {!scene.is_default && (
                  <>
                    <button
                      className="button button-secondary"
                      style={{ fontSize: "0.75rem", padding: "0.3rem 0.6rem" }}
                      onClick={() => handleSetDefault(scene)}
                      disabled={loading}
                    >
                      设为默认
                    </button>
                    <button
                      className="button button-danger"
                      style={{ fontSize: "0.75rem", padding: "0.3rem 0.6rem" }}
                      onClick={() => handleDeleteScene(scene)}
                      disabled={loading}
                    >
                      删除
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

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
        <strong>预设场景:</strong> 默认场景、吉他录制模式、播客模式已预置。
        您可以保存当前所有路由配置为新场景，并一键切换。
      </div>
    </div>
  );
}
