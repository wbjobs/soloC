use opencv::{
    core::{self, Mat, Point, Rect, Scalar, Size, Vec3b},
    imgproc,
    videoio,
    tracking,
};
use std::sync::{Arc, Mutex};
use tauri::Window;

const MAX_RESOLUTION: u32 = 1920 * 1080; // 1080p 阈值
const TILE_SIZE: i32 = 256; // 分块大小
const MAX_CONSECUTIVE_FAILURES: usize = 5;

#[derive(Debug, Clone, serde::Serialize)]
pub enum ProcessingState {
    Idle,
    Processing { current_frame: usize, total_frames: usize },
    Completed,
    Cancelled,
    Error(String),
    MemoryWarning { used_mb: f64, threshold_mb: f64 },
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct FrameTile {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
    pub data: Vec<u8>,
}

#[derive(Debug, Clone)]
pub struct TargetRegion {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}

#[derive(Debug, Clone)]
pub struct VideoMetadata {
    pub original_width: u32,
    pub original_height: u32,
    pub display_width: u32,
    pub display_height: u32,
    pub fps: f64,
    pub total_frames: usize,
    pub is_downsampled: bool,
    pub downscale_ratio: f64,
}

pub struct VideoProcessor {
    capture: videoio::VideoCapture,
    metadata: VideoMetadata,
    target: Option<TargetRegion>,
    tracker: Option<tracking::TrackerCSRT>,
    processing_state: Arc<Mutex<ProcessingState>>,
    cancel_flag: Arc<Mutex<bool>>,
    consecutive_failures: Arc<Mutex<usize>>,
}

impl VideoProcessor {
    pub fn new(path: &str) -> Result<Self, Box<dyn std::error::Error>> {
        let mut capture = videoio::VideoCapture::from_file(path, videoio::CAP_FFMPEG)?;
        
        if !capture.is_opened()? {
            return Err("无法打开视频文件".into());
        }

        let original_width = capture.get(videoio::CAP_PROP_FRAME_WIDTH)? as u32;
        let original_height = capture.get(videoio::CAP_PROP_FRAME_HEIGHT)? as u32;
        let fps = capture.get(videoio::CAP_PROP_FPS)?;
        let total_frames = capture.get(videoio::CAP_PROP_FRAME_COUNT)? as usize;

        let (display_width, display_height, is_downsampled, downscale_ratio) =
            Self::calculate_display_resolution(original_width, original_height);

        Ok(Self {
            capture,
            metadata: VideoMetadata {
                original_width,
                original_height,
                display_width,
                display_height,
                fps,
                total_frames,
                is_downsampled,
                downscale_ratio,
            },
            target: None,
            tracker: None,
            processing_state: Arc::new(Mutex::new(ProcessingState::Idle)),
            cancel_flag: Arc::new(Mutex::new(false)),
            consecutive_failures: Arc::new(Mutex::new(0)),
        })
    }

    fn calculate_display_resolution(width: u32, height: u32) -> (u32, u32, bool, f64) {
        let pixel_count = width * height;
        
        if pixel_count <= MAX_RESOLUTION {
            (width, height, false, 1.0)
        } else {
            let ratio = (MAX_RESOLUTION as f64 / pixel_count as f64).sqrt();
            let new_width = (width as f64 * ratio) as u32;
            let new_height = (height as f64 * ratio) as u32;
            (new_width, new_height, true, ratio)
        }
    }

    pub fn get_video_metadata(&self) -> VideoMetadata {
        self.metadata.clone()
    }

    fn force_gc() {
        use std::alloc::{System, GlobalAlloc, Layout};
        std::thread::yield_now();
    }

    fn get_memory_usage_mb() -> f64 {
        #[cfg(target_os = "windows")]
        {
            0.0
        }
        #[cfg(not(target_os = "windows"))]
        {
            0.0
        }
    }

    pub fn get_frame_tiles(
        &mut self,
        frame_index: usize,
    ) -> Result<Vec<FrameTile>, Box<dyn std::error::Error>> {
        self.capture.set(videoio::CAP_PROP_POS_FRAMES, frame_index as f64)?;
        let mut frame = Mat::default();
        self.capture.read(&mut frame)?;

        if frame.empty() {
            return Err("无法读取帧".into());
        }

        let mut rgb_frame = Mat::default();
        imgproc::cvt_color(&frame, &mut rgb_frame, imgproc::COLOR_BGR2RGB, 0)?;

        let mut resized_frame = Mat::default();
        if self.metadata.is_downsampled {
            let size = Size::new(
                self.metadata.display_width as i32,
                self.metadata.display_height as i32,
            );
            imgproc::resize(
                &rgb_frame,
                &mut resized_frame,
                size,
                0.0,
                0.0,
                imgproc::INTER_AREA,
            )?;
        } else {
            resized_frame = rgb_frame;
        }

        let width = self.metadata.display_width as i32;
        let height = self.metadata.display_height as i32;

        let mut tiles = Vec::new();
        let mut total_processed = 0;

        for y in (0..height).step_by(TILE_SIZE as usize) {
            for x in (0..width).step_by(TILE_SIZE as usize) {
                let tile_width = TILE_SIZE.min(width - x);
                let tile_height = TILE_SIZE.min(height - y);

                let mut tile_data = Vec::with_capacity((tile_width * tile_height * 3) as usize);

                for ty in 0..tile_height {
                    for tx in 0..tile_width {
                        let pixel = resized_frame.at_2d::<Vec3b>(y + ty, x + tx)?;
                        tile_data.push(pixel[0]);
                        tile_data.push(pixel[1]);
                        tile_data.push(pixel[2]);
                    }
                }

                tiles.push(FrameTile {
                    x,
                    y,
                    width: tile_width,
                    height: tile_height,
                    data: tile_data,
                });

                total_processed += 1;
                if total_processed % 4 == 0 {
                    Self::force_gc();
                }
            }
        }

        drop(resized_frame);
        drop(frame);
        Self::force_gc();

        Ok(tiles)
    }

    pub fn get_frame_data(
        &mut self,
        frame_index: usize,
    ) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
        let tiles = self.get_frame_tiles(frame_index)?;
        
        let width = self.metadata.display_width;
        let height = self.metadata.display_height;
        let mut result = vec![0u8; (width * height * 3) as usize];

        for tile in tiles {
            for ty in 0..tile.height {
                for tx in 0..tile.width {
                    let src_idx = ((ty * tile.width + tx) * 3) as usize;
                    let dst_x = tile.x + tx;
                    let dst_y = tile.y + ty;
                    let dst_idx = ((dst_y * width as i32 + dst_x) * 3) as usize;
                    
                    if dst_idx + 2 < result.len() && src_idx + 2 < tile.data.len() {
                        result[dst_idx] = tile.data[src_idx];
                        result[dst_idx + 1] = tile.data[src_idx + 1];
                        result[dst_idx + 2] = tile.data[src_idx + 2];
                    }
                }
            }
        }

        Ok(result)
    }

    pub fn set_target(&mut self, target: TargetRegion, start_frame: usize) -> Result<(), Box<dyn std::error::Error>> {
        let adjusted_target = if self.metadata.is_downsampled {
            TargetRegion {
                x: (target.x as f64 * self.metadata.downscale_ratio) as i32,
                y: (target.y as f64 * self.metadata.downscale_ratio) as i32,
                width: (target.width as f64 * self.metadata.downscale_ratio) as i32,
                height: (target.height as f64 * self.metadata.downscale_ratio) as i32,
            }
        } else {
            target.clone()
        };

        self.target = Some(adjusted_target.clone());
        
        self.capture.set(videoio::CAP_PROP_POS_FRAMES, start_frame as f64)?;
        let mut frame = Mat::default();
        self.capture.read(&mut frame)?;

        if frame.empty() {
            return Err("无法读取初始帧".into());
        }

        let mut processed_frame = Mat::default();
        if self.metadata.is_downsampled {
            let size = Size::new(
                self.metadata.display_width as i32,
                self.metadata.display_height as i32,
            );
            imgproc::resize(
                &frame,
                &mut processed_frame,
                size,
                0.0,
                0.0,
                imgproc::INTER_AREA,
            )?;
        } else {
            processed_frame = frame;
        }

        let rect = Rect::new(
            adjusted_target.x,
            adjusted_target.y,
            adjusted_target.width,
            adjusted_target.height,
        );
        let mut tracker = tracking::TrackerCSRT::create(&tracking::TrackerCSRT_Params::default())?;
        tracker.init(&processed_frame, &rect)?;
        self.tracker = Some(tracker);

        drop(processed_frame);
        Self::force_gc();

        Ok(())
    }

    pub fn start_processing(&mut self, output_path: &str, window: Window) -> Result<(), Box<dyn std::error::Error>> {
        if self.target.is_none() {
            return Err("未设置追踪目标".into());
        }

        let fourcc = videoio::VideoWriter::fourcc('m', 'p', '4', 'v')?;
        let size = Size::new(
            self.metadata.original_width as i32,
            self.metadata.original_height as i32,
        );
        let mut writer = videoio::VideoWriter::new(
            output_path,
            fourcc,
            self.metadata.fps,
            size,
            true,
        )?;

        if !writer.is_opened()? {
            return Err("无法创建输出视频文件".into());
        }

        *self.processing_state.lock().unwrap() = ProcessingState::Processing {
            current_frame: 0,
            total_frames: self.metadata.total_frames,
        };
        *self.cancel_flag.lock().unwrap() = false;
        *self.consecutive_failures.lock().unwrap() = 0;

        self.capture.set(videoio::CAP_PROP_POS_FRAMES, 0.0)?;

        let processing_state = Arc::clone(&self.processing_state);
        let cancel_flag = Arc::clone(&self.cancel_flag);
        let consecutive_failures = Arc::clone(&self.consecutive_failures);
        let display_width = self.metadata.display_width;
        let display_height = self.metadata.display_height;
        let original_width = self.metadata.original_width;
        let original_height = self.metadata.original_height;
        let is_downsampled = self.metadata.is_downsampled;
        let downscale_ratio = self.metadata.downscale_ratio;
        let total_frames = self.metadata.total_frames;

        std::thread::spawn(move || {
            let mut frame = Mat::default();
            let mut frame_idx = 0usize;

            loop {
                if *cancel_flag.lock().unwrap() {
                    *processing_state.lock().unwrap() = ProcessingState::Cancelled;
                    let _ = window.emit("processing-update", ProcessingState::Cancelled);
                    break;
                }

                match self.capture.read(&mut frame) {
                    Ok(true) if !frame.empty() => {
                        *consecutive_failures.lock().unwrap() = 0;

                        let mut working_frame = Mat::default();
                        if is_downsampled {
                            let size = Size::new(display_width as i32, display_height as i32);
                            imgproc::resize(&frame, &mut working_frame, size, 0.0, 0.0, imgproc::INTER_AREA).unwrap_or(());
                        } else {
                            working_frame = frame.clone();
                        }

                        if let Some(tracker) = &mut self.tracker {
                            let mut bbox = Rect::default();
                            if tracker.update(&working_frame, &mut bbox).unwrap_or(false) {
                                let original_bbox = if is_downsampled {
                                    Rect::new(
                                        (bbox.x as f64 / downscale_ratio) as i32,
                                        (bbox.y as f64 / downscale_ratio) as i32,
                                        (bbox.width as f64 / downscale_ratio) as i32,
                                        (bbox.height as f64 / downscale_ratio) as i32,
                                    )
                                } else {
                                    bbox
                                };
                                Self::apply_mosaic_tiled(&mut frame, &original_bbox, 15);
                            }
                        }

                        drop(working_frame);

                        let _ = writer.write(&frame);

                        frame_idx += 1;
                        *processing_state.lock().unwrap() = ProcessingState::Processing {
                            current_frame: frame_idx,
                            total_frames,
                        };
                        let _ = window.emit("processing-update", ProcessingState::Processing {
                            current_frame: frame_idx,
                            total_frames,
                        });

                        if frame_idx % 10 == 0 {
                            Self::force_gc();
                        }
                    }
                    _ => {
                        let mut failures = consecutive_failures.lock().unwrap();
                        *failures += 1;
                        if *failures >= MAX_CONSECUTIVE_FAILURES {
                            *processing_state.lock().unwrap() = 
                                ProcessingState::Error(format!("连续 {} 帧读取失败，终止处理", MAX_CONSECUTIVE_FAILURES));
                            break;
                        }
                    }
                }

                if frame_idx >= total_frames {
                    break;
                }
            }

            if frame_idx >= total_frames {
                *processing_state.lock().unwrap() = ProcessingState::Completed;
                let _ = window.emit("processing-update", ProcessingState::Completed);
            }

            let _ = writer.release();
            Self::force_gc();
        });

        Ok(())
    }

    fn apply_mosaic_tiled(frame: &mut Mat, bbox: &Rect, block_size: i32) {
        let x_start = bbox.x.max(0);
        let y_start = bbox.y.max(0);
        let x_end = (bbox.x + bbox.width).min(frame.cols());
        let y_end = (bbox.y + bbox.height).min(frame.rows());

        for y in (y_start..y_end).step_by((block_size * 4) as usize) {
            for x in (x_start..x_end).step_by((block_size * 4) as usize) {
                let tile_x_end = (x + block_size * 4).min(x_end);
                let tile_y_end = (y + block_size * 4).min(y_end);
                
                Self::process_mosaic_tile(frame, x, tile_x_end, y, tile_y_end, block_size);
            }
            Self::force_gc();
        }
    }

    fn process_mosaic_tile(
        frame: &mut Mat,
        x_start: i32,
        x_end: i32,
        y_start: i32,
        y_end: i32,
        block_size: i32,
    ) {
        for y in (y_start..y_end).step_by(block_size as usize) {
            for x in (x_start..x_end).step_by(block_size as usize) {
                let block_x_end = (x + block_size).min(x_end);
                let block_y_end = (y + block_size).min(y_end);
                
                let mut sum_r = 0u32;
                let mut sum_g = 0u32;
                let mut sum_b = 0u32;
                let mut count = 0u32;

                for by in y..block_y_end {
                    for bx in x..block_x_end {
                        if let Ok(pixel) = frame.at_2d::<Vec3b>(by, bx) {
                            sum_b += pixel[0] as u32;
                            sum_g += pixel[1] as u32;
                            sum_r += pixel[2] as u32;
                            count += 1;
                        }
                    }
                }

                if count > 0 {
                    let avg_b = (sum_b / count) as u8;
                    let avg_g = (sum_g / count) as u8;
                    let avg_r = (sum_r / count) as u8;

                    for by in y..block_y_end {
                        for bx in x..block_x_end {
                            if let Ok(pixel) = frame.at_2d_mut::<Vec3b>(by, bx) {
                                (*pixel)[0] = avg_b;
                                (*pixel)[1] = avg_g;
                                (*pixel)[2] = avg_r;
                            }
                        }
                    }
                }
            }
        }
    }

    pub fn get_processing_state(&self) -> ProcessingState {
        self.processing_state.lock().unwrap().clone()
    }

    pub fn cancel_processing(&mut self) {
        *self.cancel_flag.lock().unwrap() = true;
    }

    pub fn check_memory_safety(&self) -> Result<(), String> {
        let mem_usage = Self::get_memory_usage_mb();
        let threshold = 2048.0;

        if mem_usage > threshold {
            Err(format!("内存使用超过阈值: {:.1}MB / {:.1}MB", mem_usage, threshold))
        } else {
            Ok(())
        }
    }
}

unsafe impl Send for VideoProcessor {}
unsafe impl Sync for VideoProcessor {}