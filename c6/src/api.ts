import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import {
  AudioDevice,
  RoutingConfig,
  ChannelLevels,
  Scene,
  CreateSceneRequest,
  UpdateSceneRequest,
  PluginInfo,
  RegisterPluginRequest,
  RoutingPluginConfig,
} from "./types";

export async function listDevices(): Promise<AudioDevice[]> {
  return invoke("list_audio_devices");
}

export async function getRoutings(): Promise<RoutingConfig[]> {
  return invoke("get_routings");
}

export async function createRouting(routing: Omit<RoutingConfig, "id">): Promise<RoutingConfig> {
  return invoke("create_routing", { routing });
}

export async function updateRouting(routing: RoutingConfig): Promise<RoutingConfig> {
  return invoke("update_routing", { routing });
}

export async function deleteRouting(id: string): Promise<void> {
  return invoke("delete_routing", { id });
}

export async function startAudio(): Promise<void> {
  return invoke("start_audio");
}

export async function stopAudio(): Promise<void> {
  return invoke("stop_audio");
}

export async function isAudioRunning(): Promise<boolean> {
  return invoke("is_audio_running");
}

export async function setRoutingGain(routingId: string, gain: number): Promise<void> {
  return invoke("set_routing_gain", { routingId, gain });
}

export async function setRoutingLowpass(routingId: string, cutoff: number): Promise<void> {
  return invoke("set_routing_lowpass", { routingId, cutoff });
}

export async function toggleRouting(routingId: string, enabled: boolean): Promise<void> {
  return invoke("toggle_routing", { routingId, enabled });
}

export async function getScenes(): Promise<Scene[]> {
  return invoke("get_scenes");
}

export async function getDefaultScene(): Promise<Scene | null> {
  return invoke("get_default_scene");
}

export async function createScene(request: CreateSceneRequest): Promise<Scene> {
  return invoke("create_scene", { request });
}

export async function updateScene(request: UpdateSceneRequest): Promise<Scene> {
  return invoke("update_scene", { request });
}

export async function deleteScene(id: string): Promise<void> {
  return invoke("delete_scene", { id });
}

export async function applyScene(sceneId: string): Promise<RoutingConfig[]> {
  return invoke("apply_scene", { sceneId });
}

export async function setDefaultScene(sceneId: string): Promise<void> {
  return invoke("set_default_scene", { sceneId });
}

export async function saveCurrentAsScene(
  name: string,
  description?: string | null
): Promise<Scene> {
  return invoke("save_current_as_scene", { name, description });
}

export async function getPlugins(): Promise<PluginInfo[]> {
  return invoke("get_plugins");
}

export async function registerPlugin(request: RegisterPluginRequest): Promise<PluginInfo> {
  return invoke("register_plugin", { request });
}

export async function unregisterPlugin(pluginId: string): Promise<void> {
  return invoke("unregister_plugin", { pluginId });
}

export async function getRoutingPlugins(routingId: string): Promise<RoutingPluginConfig[]> {
  return invoke("get_routing_plugins", { routingId });
}

export async function addPluginToRouting(
  routingId: string,
  pluginId: string,
  position: number
): Promise<RoutingPluginConfig> {
  return invoke("add_plugin_to_routing", { routingId, pluginId, position });
}

export async function removePluginFromRouting(routingPluginId: string): Promise<void> {
  return invoke("remove_plugin_from_routing", { routingPluginId });
}

export async function togglePluginBypass(
  routingPluginId: string,
  bypassed: boolean
): Promise<void> {
  return invoke("toggle_plugin_bypass", { routingPluginId, bypassed });
}

export async function listenToChannelLevels(
  callback: (levels: ChannelLevels[]) => void
): Promise<UnlistenFn> {
  return listen<ChannelLevels[]>("channel_levels", (event) => {
    callback(event.payload);
  });
}
