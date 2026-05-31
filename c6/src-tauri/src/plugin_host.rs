use crate::models::PluginInfo;
use anyhow::{anyhow, Context, Result};
use parking_lot::RwLock;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;

#[derive(Debug, Clone)]
pub struct PluginInstance {
    pub plugin_id: String,
    pub name: String,
    pub is_bypassed: bool,
    pub sample_rate: f32,
    pub num_inputs: usize,
    pub num_outputs: usize,
}

pub trait AudioPlugin: Send + Sync {
    fn process(&mut self, input: &[f32], output: &mut [f32], frames: usize);
    fn set_bypassed(&mut self, bypassed: bool);
    fn is_bypassed(&self) -> bool;
    fn set_sample_rate(&mut self, sample_rate: f32);
    fn release(&mut self);
}

pub struct PassThroughPlugin;

impl AudioPlugin for PassThroughPlugin {
    fn process(&mut self, input: &[f32], output: &mut [f32], frames: usize) {
        let samples = frames * 2;
        let copy_len = input.len().min(samples).min(output.len());
        output[..copy_len].copy_from_slice(&input[..copy_len]);
    }

    fn set_bypassed(&mut self, _bypassed: bool) {}
    fn is_bypassed(&self) -> bool {
        false
    }
    fn set_sample_rate(&mut self, _sample_rate: f32) {}
    fn release(&mut self) {}
}

pub struct PluginHost {
    loaded_plugins: Arc<RwLock<HashMap<String, PluginInstance>>>,
    plugin_instances: Arc<RwLock<HashMap<String, Box<dyn AudioPlugin>>>>,
}

impl PluginHost {
    pub fn new() -> Self {
        Self {
            loaded_plugins: Arc::new(RwLock::new(HashMap::new())),
            plugin_instances: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub fn validate_plugin_path(&self, plugin_path: &str) -> Result<PathBuf> {
        let path = PathBuf::from(plugin_path);
        if !path.exists() {
            return Err(anyhow!("插件文件不存在: {}", plugin_path));
        }

        let extension = path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();

        match extension.as_str() {
            "vst3" | "dll" | "so" | "dylib" => Ok(path),
            _ => Err(anyhow!(
                "不支持的插件格式。请使用 .vst3、.dll、.so 或 .dylib 文件"
            )),
        }
    }

    pub fn register_plugin(&self, plugin_info: &PluginInfo) -> Result<()> {
        let path = self.validate_plugin_path(&plugin_info.plugin_path)?;
        println!("注册插件: {} -> {:?}", plugin_info.name, path);

        let mut plugins = self.loaded_plugins.write();
        plugins.insert(
            plugin_info.id.clone(),
            PluginInstance {
                plugin_id: plugin_info.id.clone(),
                name: plugin_info.name.clone(),
                is_bypassed: false,
                sample_rate: 48000.0,
                num_inputs: 2,
                num_outputs: 2,
            },
        );

        Ok(())
    }

    pub fn unregister_plugin(&self, plugin_id: &str) {
        let mut plugins = self.loaded_plugins.write();
        plugins.remove(plugin_id);

        let mut instances = self.plugin_instances.write();
        instances.remove(plugin_id);
    }

    pub fn create_instance(
        &self,
        plugin_id: &str,
        sample_rate: f32,
    ) -> Result<Box<dyn AudioPlugin>> {
        let plugins = self.loaded_plugins.read();
        let plugin = plugins
            .get(plugin_id)
            .ok_or_else(|| anyhow!("插件未注册: {}", plugin_id))?;

        println!(
            "创建插件实例: {} (采样率: {} Hz)",
            plugin.name, sample_rate
        );

        Ok(Box::new(PassThroughPlugin))
    }

    pub fn get_plugin_info(&self, plugin_id: &str) -> Option<PluginInstance> {
        let plugins = self.loaded_plugins.read();
        plugins.get(plugin_id).cloned()
    }

    pub fn is_plugin_registered(&self, plugin_id: &str) -> bool {
        let plugins = self.loaded_plugins.read();
        plugins.contains_key(plugin_id)
    }
}

impl Default for PluginHost {
    fn default() -> Self {
        Self::new()
    }
}

pub struct PluginChain {
    plugins: Vec<(String, Box<dyn AudioPlugin>)>,
}

impl PluginChain {
    pub fn new() -> Self {
        Self {
            plugins: Vec::new(),
        }
    }

    pub fn add_plugin(&mut self, plugin_id: String, plugin: Box<dyn AudioPlugin>) {
        self.plugins.push((plugin_id, plugin));
    }

    pub fn process(&mut self, input: &[f32], output: &mut [f32], frames: usize) {
        if self.plugins.is_empty() {
            let samples = frames * 2;
            let copy_len = input.len().min(samples).min(output.len());
            output[..copy_len].copy_from_slice(&input[..copy_len]);
            return;
        }

        let mut temp_buffer: Vec<f32> = vec![0.0; frames * 2];
        let mut current_input = input;

        for (_, plugin) in self.plugins.iter_mut() {
            if plugin.is_bypassed() {
                continue;
            }
            plugin.process(current_input, &mut temp_buffer, frames);
            current_input = &temp_buffer;
        }

        let samples = frames * 2;
        let copy_len = temp_buffer.len().min(samples).min(output.len());
        output[..copy_len].copy_from_slice(&temp_buffer[..copy_len]);
    }

    pub fn set_sample_rate(&mut self, sample_rate: f32) {
        for (_, plugin) in self.plugins.iter_mut() {
            plugin.set_sample_rate(sample_rate);
        }
    }

    pub fn clear(&mut self) {
        for (_, mut plugin) in self.plugins.drain(..) {
            plugin.release();
        }
    }
}

impl Default for PluginChain {
    fn default() -> Self {
        Self::new()
    }
}
