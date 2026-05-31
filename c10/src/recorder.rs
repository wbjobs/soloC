use eframe::egui;
use image::{RgbImage, Rgb};
use std::path::PathBuf;
use std::fs;

pub struct Recorder {
    is_recording: bool,
    frame_count: u32,
    output_dir: PathBuf,
    fps: u32,
    width: u32,
    height: u32,
    frame_interval: f32,
    last_frame_time: f32,
}

impl Recorder {
    pub fn new(width: u32, height: u32) -> Self {
        let base_dir = directories::ProjectDirs::from("com", "sphgame", "SPHPollution")
            .map(|dirs| dirs.data_local_dir().to_path_buf())
            .unwrap_or_else(|| PathBuf::from("./recordings"));
        
        Self {
            is_recording: false,
            frame_count: 0,
            output_dir: base_dir,
            fps: 30,
            width,
            height,
            frame_interval: 1.0 / 30.0,
            last_frame_time: 0.0,
        }
    }

    pub fn start_recording(&mut self) -> Result<(), String> {
        let timestamp = chrono_timestamp();
        let session_dir = self.output_dir.join(format!("recording_{}", timestamp));
        
        fs::create_dir_all(&session_dir)
            .map_err(|e| format!("无法创建录制目录: {}", e))?;

        self.output_dir = session_dir;
        self.is_recording = true;
        self.frame_count = 0;
        self.last_frame_time = 0.0;

        Ok(())
    }

    pub fn stop_recording(&mut self) {
        self.is_recording = false;
    }

    pub fn is_recording(&self) -> bool {
        self.is_recording
    }

    pub fn get_frame_count(&self) -> u32 {
        self.frame_count
    }

    pub fn get_output_dir(&self) -> &PathBuf {
        &self.output_dir
    }

    pub fn should_capture(&mut self, current_time: f32) -> bool {
        if !self.is_recording {
            return false;
        }

        if current_time - self.last_frame_time >= self.frame_interval {
            self.last_frame_time = current_time;
            true
        } else {
            false
        }
    }

    pub fn save_frame(
        &mut self,
        pixels: &[u8],
        width: u32,
        height: u32,
    ) -> Result<(), String> {
        if !self.is_recording {
            return Ok(());
        }

        let filename = format!("frame_{:06}.png", self.frame_count);
        let filepath = self.output_dir.join(filename);

        let mut img = RgbImage::new(width, height);
        
        for y in 0..height {
            for x in 0..width {
                let src_idx = ((height - 1 - y) * width + x) as usize * 4;
                if src_idx + 2 < pixels.len() {
                    let r = pixels[src_idx];
                    let g = pixels[src_idx + 1];
                    let b = pixels[src_idx + 2];
                    img.put_pixel(x, y, Rgb([r, g, b]));
                }
            }
        }

        img.save(&filepath)
            .map_err(|e| format!("保存帧失败: {}", e))?;

        self.frame_count += 1;
        Ok(())
    }

    pub fn set_fps(&mut self, fps: u32) {
        self.fps = fps.max(1);
        self.frame_interval = 1.0 / self.fps as f32;
    }

    pub fn get_fps(&self) -> u32 {
        self.fps
    }
}

fn chrono_timestamp() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs();
    
    let hours = (secs % 86400) / 3600;
    let minutes = (secs % 3600) / 60;
    let seconds = secs % 60;
    
    format!("{:02}{:02}{:02}_{}", hours, minutes, seconds, secs)
}

pub fn render_ui(recorder: &mut Recorder, ui: &mut egui::Ui, elapsed_time: f32) {
    ui.heading("录制");
    ui.separator();

    ui.horizontal(|ui| {
        if !recorder.is_recording() {
            if ui.button("▶ 开始录制").clicked() {
                match recorder.start_recording() {
                    Ok(_) => {
                        eprintln!("开始录制到: {:?}", recorder.get_output_dir());
                    }
                    Err(e) => {
                        eprintln!("录制失败: {}", e);
                    }
                }
            }
        } else {
            if ui.button("⏹ 停止录制").clicked() {
                recorder.stop_recording();
                eprintln!("录制完成，共 {} 帧", recorder.get_frame_count());
            }
        }
    });

    if recorder.is_recording() {
        ui.label(egui::RichText::new("● 录制中...")
            .color(egui::Color32::RED)
            .strong());
        ui.label(format!("已录制: {} 帧", recorder.get_frame_count()));
        ui.label(format!("输出目录: {}", recorder.get_output_dir().display()));
    }

    ui.separator();
    ui.label("录制帧率:");
    let mut fps = recorder.get_fps();
    if ui.add(egui::Slider::new(&mut fps, 10..=60).text("FPS")).changed() {
        recorder.set_fps(fps);
    }
}
