use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum DeviceType {
    Input,
    Output,
    Duplex,
}

impl DeviceType {
    pub fn as_u8(&self) -> u8 {
        match self {
            DeviceType::Input => 0,
            DeviceType::Output => 1,
            DeviceType::Duplex => 2,
        }
    }

    pub fn can_input(&self) -> bool {
        matches!(self, DeviceType::Input | DeviceType::Duplex)
    }

    pub fn can_output(&self) -> bool {
        matches!(self, DeviceType::Output | DeviceType::Duplex)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioDevice {
    pub id: String,
    pub name: String,
    pub device_type: DeviceType,
    pub channels: u16,
    pub sample_rate: u32,
    pub buffer_size: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoutingConfig {
    pub id: String,
    pub name: String,
    pub input_device_id: String,
    pub input_channels: Vec<u16>,
    pub output_device_id: String,
    pub output_channels: Vec<u16>,
    pub gain: f32,
    pub lowpass_cutoff: f32,
    pub enabled: bool,
}

impl RoutingConfig {
    pub fn new(
        name: String,
        input_device_id: String,
        input_channels: Vec<u16>,
        output_device_id: String,
        output_channels: Vec<u16>,
    ) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            name,
            input_device_id,
            input_channels,
            output_device_id,
            output_channels,
            gain: 1.0,
            lowpass_cutoff: 20000.0,
            enabled: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateRoutingRequest {
    pub name: String,
    pub input_device_id: String,
    pub input_channels: Vec<u16>,
    pub output_device_id: String,
    pub output_channels: Vec<u16>,
    pub gain: f32,
    pub lowpass_cutoff: f32,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SceneSnapshot {
    pub routings: Vec<RoutingConfig>,
    pub created_at: String,
    pub version: String,
}

impl SceneSnapshot {
    pub fn new(routings: Vec<RoutingConfig>) -> Self {
        Self {
            routings,
            created_at: chrono::Utc::now().to_rfc3339(),
            version: "1.0".to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Scene {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub routings_data: String,
    pub is_default: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateSceneRequest {
    pub name: String,
    pub description: Option<String>,
    pub routings: Vec<RoutingConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateSceneRequest {
    pub id: String,
    pub name: Option<String>,
    pub description: Option<String>,
    pub routings: Option<Vec<RoutingConfig>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginInfo {
    pub id: String,
    pub name: String,
    pub vendor: String,
    pub plugin_path: String,
    pub plugin_type: String,
    pub category: Option<String>,
    pub is_enabled: bool,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegisterPluginRequest {
    pub name: String,
    pub vendor: String,
    pub plugin_path: String,
    pub plugin_type: String,
    pub category: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoutingPluginConfig {
    pub id: String,
    pub routing_id: String,
    pub plugin_id: String,
    pub position: i32,
    pub is_bypassed: bool,
    pub parameters: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChannelLevels {
    pub routing_id: String,
    pub left: f32,
    pub right: f32,
}

#[derive(Debug, Clone)]
pub struct AudioBuffer {
    pub data: Vec<f32>,
    pub channels: usize,
    pub frames: usize,
}

impl AudioBuffer {
    pub fn new(channels: usize, frames: usize) -> Self {
        Self {
            data: vec![0.0; channels * frames],
            channels,
            frames,
        }
    }

    pub fn get_sample(&self, frame: usize, channel: usize) -> Option<f32> {
        if frame < self.frames && channel < self.channels {
            Some(self.data[frame * self.channels + channel])
        } else {
            None
        }
    }

    pub fn set_sample(&mut self, frame: usize, channel: usize, value: f32) {
        if frame < self.frames && channel < self.channels {
            self.data[frame * self.channels + channel] = value;
        }
    }

    pub fn add_sample(&mut self, frame: usize, channel: usize, value: f32) {
        if frame < self.frames && channel < self.channels {
            self.data[frame * self.channels + channel] += value;
        }
    }

    pub fn clear(&mut self) {
        for sample in self.data.iter_mut() {
            *sample = 0.0;
        }
    }
}

#[derive(Debug, Clone)]
pub struct RoutingState {
    pub config: RoutingConfig,
    pub left_filter: BiquadFilter,
    pub right_filter: BiquadFilter,
    pub peak_left: f32,
    pub peak_right: f32,
}

impl RoutingState {
    pub fn new(config: RoutingConfig, sample_rate: f32) -> Self {
        Self {
            config: config.clone(),
            left_filter: BiquadFilter::lowpass(config.lowpass_cutoff, sample_rate, 0.707),
            right_filter: BiquadFilter::lowpass(config.lowpass_cutoff, sample_rate, 0.707),
            peak_left: 0.0,
            peak_right: 0.0,
        }
    }

    pub fn update_filters(&mut self, sample_rate: f32) {
        self.left_filter = BiquadFilter::lowpass(
            self.config.lowpass_cutoff,
            sample_rate,
            0.707,
        );
        self.right_filter = BiquadFilter::lowpass(
            self.config.lowpass_cutoff,
            sample_rate,
            0.707,
        );
    }

    pub fn process_sample(&mut self, left: f32, right: f32) -> (f32, f32) {
        let filtered_left = self.left_filter.process(left);
        let filtered_right = self.right_filter.process(right);
        
        let out_left = apply_gain(filtered_left, self.config.gain);
        let out_right = apply_gain(filtered_right, self.config.gain);
        
        (out_left, out_right)
    }
}

#[inline]
pub fn apply_gain(sample: f32, gain: f32) -> f32 {
    sample * gain
}

#[derive(Debug, Clone)]
pub struct BiquadFilter {
    pub b0: f32,
    pub b1: f32,
    pub b2: f32,
    pub a1: f32,
    pub a2: f32,
    pub x1: f32,
    pub x2: f32,
    pub y1: f32,
    pub y2: f32,
}

impl BiquadFilter {
    pub fn lowpass(cutoff: f32, sample_rate: f32, q: f32) -> Self {
        if cutoff >= 20000.0 || cutoff <= 0.0 {
            return Self::bypass();
        }

        let omega = 2.0 * std::f32::consts::PI * cutoff / sample_rate;
        let sin_omega = omega.sin();
        let cos_omega = omega.cos();
        let alpha = sin_omega / (2.0 * q);

        let b0 = (1.0 - cos_omega) / 2.0;
        let b1 = 1.0 - cos_omega;
        let b2 = (1.0 - cos_omega) / 2.0;
        let a0 = 1.0 + alpha;
        let a1 = -2.0 * cos_omega;
        let a2 = 1.0 - alpha;

        Self {
            b0: b0 / a0,
            b1: b1 / a0,
            b2: b2 / a0,
            a1: a1 / a0,
            a2: a2 / a0,
            x1: 0.0,
            x2: 0.0,
            y1: 0.0,
            y2: 0.0,
        }
    }

    pub fn bypass() -> Self {
        Self {
            b0: 1.0,
            b1: 0.0,
            b2: 0.0,
            a1: 0.0,
            a2: 0.0,
            x1: 0.0,
            x2: 0.0,
            y1: 0.0,
            y2: 0.0,
        }
    }

    pub fn process(&mut self, input: f32) -> f32 {
        let output = self.b0 * input + self.b1 * self.x1 + self.b2 * self.x2
            - self.a1 * self.y1 - self.a2 * self.y2;

        self.x2 = self.x1;
        self.x1 = input;
        self.y2 = self.y1;
        self.y1 = output;

        output
    }
}
