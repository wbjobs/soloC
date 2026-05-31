use wasm_bindgen::prelude::*;
use rustfft::{FftPlanner, num_complex::Complex};
use serde::{Serialize, Deserialize};

#[cfg(target_arch = "wasm32")]
#[global_allocator]
static ALLOC: wee_alloc::WeeAlloc = wee_alloc::WeeAlloc::INIT;

#[wasm_bindgen(start)]
pub fn init_panic_hook() {
    #[cfg(feature = "console_error_panic_hook")]
    console_error_panic_hook::set_once();
}

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = console)]
    fn log(s: &str);
}

#[derive(Serialize, Deserialize, Clone)]
#[wasm_bindgen]
pub struct SpectrumResult {
    frequencies: Vec<f64>,
    magnitudes: Vec<f64>,
    sample_rate: u32,
    fft_size: usize,
    timestamp: f64,
}

#[wasm_bindgen]
impl SpectrumResult {
    #[wasm_bindgen(constructor)]
    pub fn new(
        frequencies: Vec<f64>,
        magnitudes: Vec<f64>,
        sample_rate: u32,
        fft_size: usize,
        timestamp: f64
    ) -> Self {
        SpectrumResult {
            frequencies,
            magnitudes,
            sample_rate,
            fft_size,
            timestamp,
        }
    }
    
    #[wasm_bindgen(getter)]
    pub fn frequencies(&self) -> Vec<f64> {
        self.frequencies.clone()
    }
    
    #[wasm_bindgen(getter)]
    pub fn magnitudes(&self) -> Vec<f64> {
        self.magnitudes.clone()
    }
    
    #[wasm_bindgen(getter)]
    pub fn sample_rate(&self) -> u32 {
        self.sample_rate
    }
    
    #[wasm_bindgen(getter)]
    pub fn fft_size(&self) -> usize {
        self.fft_size
    }
    
    #[wasm_bindgen(getter)]
    pub fn timestamp(&self) -> f64 {
        self.timestamp
    }
    
    pub fn to_json(&self) -> Result<String, JsValue> {
        serde_json::to_string(self)
            .map_err(|e| JsValue::from_str(&e.to_string()))
    }
    
    pub fn free(self) {
        drop(self);
    }
}

#[wasm_bindgen]
pub struct FftAnalyzer {
    fft_size: usize,
    planner: FftPlanner<f64>,
    window: Vec<f64>,
    complex_buffer: Vec<Complex<f64>>,
}

#[wasm_bindgen]
impl FftAnalyzer {
    #[wasm_bindgen(constructor)]
    pub fn new(fft_size: usize) -> Self {
        let window = generate_hann_window(fft_size);
        let complex_buffer = vec![Complex::new(0.0, 0.0); fft_size];
        
        FftAnalyzer {
            fft_size,
            planner: FftPlanner::new(),
            window,
            complex_buffer,
        }
    }
    
    pub fn analyze_f64(
        &mut self,
        samples: &[f64],
        sample_rate: u32,
        timestamp: f64
    ) -> SpectrumResult {
        let len = samples.len().min(self.fft_size);
        
        for i in 0..len {
            self.complex_buffer[i] = Complex::new(samples[i] * self.window[i], 0.0);
        }
        
        for i in len..self.fft_size {
            self.complex_buffer[i] = Complex::new(0.0, 0.0);
        }
        
        let fft = self.planner.plan_fft_forward(self.fft_size);
        fft.process(&mut self.complex_buffer);
        
        let half_size = self.fft_size / 2;
        let mut magnitudes = Vec::with_capacity(half_size);
        let mut frequencies = Vec::with_capacity(half_size);
        
        for i in 0..half_size {
            let c = &self.complex_buffer[i];
            let mag = (c.re * c.re + c.im * c.im).sqrt();
            magnitudes.push(20.0 * mag.log10().max(-100.0));
            frequencies.push(i as f64 * sample_rate as f64 / self.fft_size as f64);
        }
        
        SpectrumResult::new(frequencies, magnitudes, sample_rate, self.fft_size, timestamp)
    }
    
    pub fn analyze_json(
        &mut self,
        samples: &[f64],
        sample_rate: u32,
        timestamp: f64
    ) -> Result<String, JsValue> {
        let result = self.analyze_f64(samples, sample_rate, timestamp);
        result.to_json()
    }
    
    pub fn analyze_f32(
        &mut self,
        samples: &[f32],
        sample_rate: u32,
        timestamp: f64
    ) -> SpectrumResult {
        let samples_f64: Vec<f64> = samples.iter().map(|&s| s as f64).collect();
        self.analyze_f64(&samples_f64, sample_rate, timestamp)
    }
    
    pub fn get_fft_size(&self) -> usize {
        self.fft_size
    }
    
    pub fn free(self) {
        drop(self);
    }
}

fn generate_hann_window(size: usize) -> Vec<f64> {
    (0..size)
        .map(|i| {
            let t = i as f64 / (size as f64 - 1.0);
            0.5 * (1.0 - (2.0 * std::f64::consts::PI * t).cos())
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_fft_analyzer_creation() {
        let analyzer = FftAnalyzer::new(1024);
        assert_eq!(analyzer.get_fft_size(), 1024);
    }

    #[test]
    fn test_fft_analysis() {
        let mut analyzer = FftAnalyzer::new(1024);
        let samples: Vec<f64> = (0..1024).map(|i| (i as f64 * 0.1).sin()).collect();
        let result = analyzer.analyze_f64(&samples, 44100, 0.0);
        assert_eq!(result.fft_size(), 1024);
        assert_eq!(result.frequencies().len(), 512);
        assert_eq!(result.magnitudes().len(), 512);
    }
    
    #[test]
    fn test_fft_json_output() {
        let mut analyzer = FftAnalyzer::new(1024);
        let samples: Vec<f64> = (0..1024).map(|i| (i as f64 * 0.1).sin()).collect();
        let json = analyzer.analyze_json(&samples, 44100, 0.0);
        assert!(json.is_ok());
        let json_str = json.unwrap();
        assert!(json_str.contains("\"frequencies\""));
        assert!(json_str.contains("\"magnitudes\""));
    }
}
