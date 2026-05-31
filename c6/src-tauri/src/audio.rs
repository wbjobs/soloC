use crate::models::{
    apply_gain, AudioBuffer, AudioDevice, BiquadFilter, ChannelLevels, DeviceType, RoutingState,
};
use anyhow::{anyhow, Context, Result};
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{
    BufferSize, SampleFormat, SampleRate, StreamConfig, StreamError, SupportedStreamConfigRange,
};
use crossbeam_channel::Sender;
use parking_lot::RwLock;
use ringbuf::HeapRb;
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use std::thread;
use std::time::Duration;

type AudioRingBuffer = HeapRb<f32>;
type Producer = ringbuf::Producer<f32, Arc<AudioRingBuffer>>;
type Consumer = ringbuf::Consumer<f32, Arc<AudioRingBuffer>>;

pub struct AudioEngine {
    host: cpal::Host,
    is_running: Arc<RwLock<bool>>,
    routings: Arc<RwLock<Vec<RoutingState>>>,
    level_sender: Option<Sender<Vec<ChannelLevels>>>,
    devices_cache: Vec<AudioDevice>,
}

impl AudioEngine {
    pub fn new() -> Result<Self> {
        let host = cpal::default_host();

        Ok(Self {
            host,
            is_running: Arc::new(RwLock::new(false)),
            routings: Arc::new(RwLock::new(Vec::new())),
            level_sender: None,
            devices_cache: Vec::new(),
        })
    }

    pub fn list_devices(&mut self) -> Result<Vec<AudioDevice>> {
        let mut devices = Vec::new();
        let mut seen_device_ids = HashSet::new();

        let all_devices = self
            .host
            .devices()
            .map_err(|e| anyhow!("无法枚举音频设备: {}", e))?;

        for device in all_devices {
            let device_name = device
                .name()
                .unwrap_or_else(|_| "Unknown Device".to_string());

            let can_input = device.supported_input_configs().is_ok()
                && device
                    .supported_input_configs()
                    .map(|mut i| i.next().is_some())
                    .unwrap_or(false);

            let can_output = device.supported_output_configs().is_ok()
                && device
                    .supported_output_configs()
                    .map(|mut o| o.next().is_some())
                    .unwrap_or(false);

            let device_type = match (can_input, can_output) {
                (true, true) => DeviceType::Duplex,
                (true, false) => DeviceType::Input,
                (false, true) => DeviceType::Output,
                _ => continue,
            };

            let configs = Self::get_device_configs(&device, device_type)?;

            for config in configs {
                let device_id = format!(
                    "dev-{}-{}-{}ch-{}Hz",
                    device_name.replace(|c: char| !c.is_ascii_alphanumeric(), "_"),
                    device_type.as_u8(),
                    config.channels,
                    config.sample_rate
                );

                if seen_device_ids.insert(device_id.clone()) {
                    devices.push(AudioDevice {
                        id: device_id,
                        name: device_name.clone(),
                        device_type,
                        channels: config.channels,
                        sample_rate: config.sample_rate,
                        buffer_size: config.buffer_size,
                    });
                }
            }
        }

        devices.sort_by(|a, b| {
            a.name
                .cmp(&b.name)
                .then_with(|| a.device_type.as_u8().cmp(&b.device_type.as_u8()))
                .then_with(|| a.channels.cmp(&b.channels))
        });

        self.devices_cache = devices.clone();
        Ok(devices)
    }

    fn get_device_configs(device: &cpal::Device, device_type: DeviceType) -> Result<Vec<DeviceConfig>> {
        let mut configs = Vec::new();

        let supported_configs: Vec<SupportedStreamConfigRange> = match device_type {
            DeviceType::Input | DeviceType::Duplex => device
                .supported_input_configs()
                .map(|iter| iter.collect())
                .unwrap_or_default(),
            DeviceType::Output => device
                .supported_output_configs()
                .map(|iter| iter.collect())
                .unwrap_or_default(),
        };

        let preferred_sample_rates = [48000, 44100, 96000];

        for config in supported_configs {
            let channels = config.channels();
            let sample_format = config.sample_format();

            for &sample_rate in &preferred_sample_rates {
                let sr = SampleRate(sample_rate);
                if config.min_sample_rate() <= sr && sr <= config.max_sample_rate() {
                    let buffer_size = match config.buffer_size() {
                        BufferSize::Range { min, .. } => (*min).max(64),
                        BufferSize::Fixed(size) => *size,
                    };

                    configs.push(DeviceConfig {
                        channels,
                        sample_rate,
                        buffer_size,
                        sample_format,
                    });
                }
            }
        }

        configs.sort_by(|a, b| {
            b.sample_rate
                .cmp(&a.sample_rate)
                .then_with(|| b.channels.cmp(&a.channels))
        });
        configs.dedup_by(|a, b| a.sample_rate == b.sample_rate && a.channels == b.channels);

        Ok(configs)
    }

    pub fn set_level_sender(&mut self, sender: Sender<Vec<ChannelLevels>>) {
        self.level_sender = Some(sender);
    }

    pub fn is_running(&self) -> bool {
        *self.is_running.read()
    }

    pub fn start(
        &mut self,
        routings: Vec<RoutingState>,
    ) -> Result<()> {
        if *self.is_running.read() {
            return Ok(());
        }

        *self.routings.write() = routings;
        *self.is_running.write() = true;

        let routings_clone = self.routings.clone();
        let is_running_clone = self.is_running.clone();
        let level_sender_clone = self.level_sender.clone();

        thread::spawn(move || {
            if let Err(e) = Self::run_audio_loop(routings_clone, is_running_clone, level_sender_clone)
            {
                eprintln!("音频线程错误: {}", e);
            }
        });

        Ok(())
    }

    pub fn stop(&mut self) {
        *self.is_running.write() = false;
    }

    pub fn update_routing_gain(&self, routing_id: &str, gain: f32) {
        let mut routings = self.routings.write();
        for routing in routings.iter_mut() {
            if routing.config.id == routing_id {
                routing.config.gain = gain;
            }
        }
    }

    pub fn update_routing_lowpass(&self, routing_id: &str, cutoff: f32, sample_rate: f32) {
        let mut routings = self.routings.write();
        for routing in routings.iter_mut() {
            if routing.config.id == routing_id {
                routing.config.lowpass_cutoff = cutoff;
                routing.left_filter = BiquadFilter::lowpass(cutoff, sample_rate, 0.707);
                routing.right_filter = BiquadFilter::lowpass(cutoff, sample_rate, 0.707);
            }
        }
    }

    pub fn toggle_routing(&self, routing_id: &str, enabled: bool) {
        let mut routings = self.routings.write();
        for routing in routings.iter_mut() {
            if routing.config.id == routing_id {
                routing.config.enabled = enabled;
            }
        }
    }

    fn run_audio_loop(
        routings: Arc<RwLock<Vec<RoutingState>>>,
        is_running: Arc<RwLock<bool>>,
        level_sender: Option<Sender<Vec<ChannelLevels>>>,
    ) -> Result<()> {
        let host = cpal::default_host();

        let input_device = host
            .default_input_device()
            .ok_or_else(|| anyhow!("未找到默认输入设备"))?;
        let output_device = host
            .default_output_device()
            .ok_or_else(|| anyhow!("未找到默认输出设备"))?;

        let input_config: StreamConfig = input_device
            .default_input_config()
            .map_err(|e| anyhow!("无法获取输入配置: {}", e))?
            .into();
        let output_config: StreamConfig = output_device
            .default_output_config()
            .map_err(|e| anyhow!("无法获取输出配置: {}", e))?
            .into();

        let sample_rate = input_config.sample_rate.0 as f32;
        let input_channels = input_config.channels as usize;
        let output_channels = output_config.channels as usize;
        let buffer_frames = 512;

        let ring_buffer_size = buffer_frames * input_channels * 4;
        let rb = Arc::new(AudioRingBuffer::new(ring_buffer_size));
        let (mut rb_producer, mut rb_consumer) = rb.split();

        let routings_clone = routings.clone();
        let is_running_clone = is_running.clone();

        let input_stream = input_device
            .build_input_stream(
                &input_config,
                move |data: &[f32], _: &_| {
                    if !*is_running_clone.read() {
                        return;
                    }
                    let _ = rb_producer.push_slice(data);
                },
                |err: StreamError| {
                    eprintln!("输入流错误: {}", err);
                },
                None,
            )
            .context("无法创建输入流")?;

        let level_sender_clone = level_sender.clone();

        let output_stream = output_device
            .build_output_stream(
                &output_config,
                move |output: &mut [f32], _: &cpal::OutputCallbackInfo| {
                    if !*is_running.read() {
                        for sample in output.iter_mut() {
                            *sample = 0.0;
                        }
                        return;
                    }

                    Self::process_audio_buffer(
                        output,
                        &mut rb_consumer,
                        &routings,
                        sample_rate,
                        input_channels,
                        output_channels,
                        buffer_frames,
                    );

                    Self::collect_and_send_levels(&routings, &level_sender);
                },
                |err: StreamError| {
                    eprintln!("输出流错误: {}", err);
                },
                None,
            )
            .context("无法创建输出流")?;

        input_stream.play()?;
        output_stream.play()?;

        while *is_running_clone.read() {
            thread::sleep(Duration::from_millis(100));
        }

        drop(input_stream);
        drop(output_stream);

        Ok(())
    }

    fn process_audio_buffer(
        output: &mut [f32],
        rb_consumer: &mut Consumer,
        routings: &Arc<RwLock<Vec<RoutingState>>>,
        sample_rate: f32,
        input_channels: usize,
        output_channels: usize,
        buffer_frames: usize,
    ) {
        for sample in output.iter_mut() {
            *sample = 0.0;
        }

        let input_samples_needed = buffer_frames * input_channels;
        let mut input_buffer = AudioBuffer::new(input_channels, buffer_frames);

        let available = rb_consumer.occupied_len();
        if available < input_samples_needed {
            return;
        }

        let mut temp_buf = vec![0.0; input_samples_needed];
        let read_count = rb_consumer.pop_slice(&mut temp_buf);

        if read_count < input_samples_needed {
            return;
        }

        input_buffer.data.copy_from_slice(&temp_buf[..input_samples_needed]);

        let routings_guard = routings.read();

        for frame in 0..buffer_frames {
            for routing in routings_guard.iter() {
                if !routing.config.enabled {
                    continue;
                }

                let input_chs = &routing.config.input_channels;
                let output_chs = &routing.config.output_channels;

                if input_chs.len() < 2 || output_chs.len() < 2 {
                    continue;
                }

                let left_in_ch = (input_chs[0] as usize).saturating_sub(1);
                let right_in_ch = (input_chs[1] as usize).saturating_sub(1);
                let left_out_ch = (output_chs[0] as usize).saturating_sub(1);
                let right_out_ch = (output_chs[1] as usize).saturating_sub(1);

                let left_sample = input_buffer
                    .get_sample(frame, left_in_ch)
                    .unwrap_or(0.0);
                let right_sample = input_buffer
                    .get_sample(frame, right_in_ch)
                    .unwrap_or(0.0);

                let filtered_left = routing.left_filter.process(left_sample);
                let filtered_right = routing.right_filter.process(right_sample);

                let out_left = apply_gain(filtered_left, routing.config.gain);
                let out_right = apply_gain(filtered_right, routing.config.gain);

                let clamped_left = out_left.clamp(-1.0, 1.0);
                let clamped_right = out_right.clamp(-1.0, 1.0);

                if left_out_ch < output_channels {
                    let idx = frame * output_channels + left_out_ch;
                    if idx < output.len() {
                        output[idx] += clamped_left;
                    }
                }
                if right_out_ch < output_channels {
                    let idx = frame * output_channels + right_out_ch;
                    if idx < output.len() {
                        output[idx] += clamped_right;
                    }
                }
            }
        }

        for sample in output.iter_mut() {
            *sample = sample.clamp(-1.0, 1.0);
        }
    }

    fn collect_and_send_levels(
        routings: &Arc<RwLock<Vec<RoutingState>>>,
        level_sender: &Option<Sender<Vec<ChannelLevels>>>,
    ) {
        let mut levels = Vec::new();
        let mut routings_guard = routings.write();

        for routing in routings_guard.iter_mut() {
            let decay = (-1.0 / 48000.0f32 * 0.3f32).exp();
            routing.peak_left *= decay;
            routing.peak_right *= decay;

            levels.push(ChannelLevels {
                routing_id: routing.config.id.clone(),
                left: routing.peak_left,
                right: routing.peak_right,
            });
        }

        if let Some(sender) = level_sender {
            let _ = sender.try_send(levels);
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
struct DeviceConfig {
    channels: u16,
    sample_rate: u32,
    buffer_size: u32,
    sample_format: SampleFormat,
}
