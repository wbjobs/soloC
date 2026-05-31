export interface AudioDevice {
  id: string;
  name: string;
  device_type: "input" | "output" | "duplex";
  channels: number;
  sample_rate: number;
  buffer_size: number;
}

export interface RoutingConfig {
  id: string;
  name: string;
  input_device_id: string;
  input_channels: number[];
  output_device_id: string;
  output_channels: number[];
  gain: number;
  lowpass_cutoff: number;
  enabled: boolean;
}

export interface ChannelLevels {
  routing_id: string;
  left: number;
  right: number;
}

export interface Scene {
  id: string;
  name: string;
  description: string | null;
  routings_data: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateSceneRequest {
  name: string;
  description?: string | null;
  routings: RoutingConfig[];
}

export interface UpdateSceneRequest {
  id: string;
  name?: string;
  description?: string;
  routings?: RoutingConfig[];
}

export interface PluginInfo {
  id: string;
  name: string;
  vendor: string;
  plugin_path: string;
  plugin_type: string;
  category: string | null;
  is_enabled: boolean;
  created_at: string;
}

export interface RegisterPluginRequest {
  name: string;
  vendor: string;
  plugin_path: string;
  plugin_type: string;
  category?: string | null;
}

export interface RoutingPluginConfig {
  id: string;
  routing_id: string;
  plugin_id: string;
  position: number;
  is_bypassed: boolean;
  parameters: Record<string, unknown> | null;
}

export interface AppState {
  devices: AudioDevice[];
  routings: RoutingConfig[];
  activeRoutingId: string | null;
  channelLevels: ChannelLevels[];
  isAudioRunning: boolean;
  scenes: Scene[];
  plugins: PluginInfo[];
}
