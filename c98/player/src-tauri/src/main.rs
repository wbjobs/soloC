#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use flate2::read::GzDecoder;
use std::io::Read;

#[tauri::command]
fn decompress_data(data: Vec<u8>) -> Result<Vec<u8>, String> {
    let mut decoder = GzDecoder::new(&data[..]);
    let mut decompressed = Vec::new();
    decoder
        .read_to_end(&mut decompressed)
        .map_err(|e| e.to_string())?;
    Ok(decompressed)
}

#[tauri::command]
fn download_recording(url: String) -> Result<Vec<u8>, String> {
    let client = reqwest::blocking::Client::new();
    let response = client
        .get(&url)
        .send()
        .map_err(|e| e.to_string())?;
    
    if !response.status().is_success() {
        return Err(format!("HTTP error: {}", response.status()));
    }
    
    let bytes = response.bytes().map_err(|e| e.to_string())?;
    Ok(bytes.to_vec())
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![decompress_data, download_recording])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
