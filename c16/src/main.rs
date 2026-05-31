#![no_std]
#![no_main]

use esp_idf_hal::gpio::{AnyIOPin, InputOutput, Output, PinDriver};
use esp_idf_hal::peripherals::Peripherals;
use esp_idf_svc::eventloop::EspSystemEventLoop;
use esp_idf_svc::http::server::{Configuration, EspHttpServer};
use esp_idf_svc::http::server::Method;
use esp_idf_svc::nvs::EspDefaultNvsPartition;
use esp_idf_svc::nvs::NvsStorage;
use esp_idf_svc::ota::EspOtaUpdate;
use esp_idf_svc::wifi::{BlockingWifi, EspWifi};
use esp_idf_svc::wifi::AccessPointConfiguration;
use esp_idf_svc::wifi::ClientConfiguration;
use esp_idf_svc::wifi::Configuration;
use esp_idf_sys as _;
use log::*;
use serde::{Deserialize, Serialize};
use serde_json::{json, to_string, Value};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Duration;

#[derive(Deserialize, Serialize, Default, Clone, Debug)]
struct WifiConfig {
    ssid: String,
    password: String,
}

#[derive(Deserialize, Serialize, Debug)]
struct GpioState {
    state: bool,
}

#[derive(Serialize, Debug)]
struct GpioInfo {
    pin: u8,
    state: bool,
    direction: &'static str,
}

#[derive(Serialize, Debug, Clone)]
struct SensorData {
    temperature: f32,
    humidity: f32,
    timestamp: u64,
}

#[derive(Serialize, Debug, Clone, Default)]
struct SdCardInfo {
    mounted: bool,
    total_bytes: u64,
    free_bytes: u64,
    used_bytes: u64,
}

struct AppState {
    gpio_drivers: Mutex<HashMap<u8, PinDriver<'static, AnyIOPin, InputOutput>>>,
    wifi_config: Mutex<Option<WifiConfig>>,
    sensor_data: Mutex<Option<SensorData>>,
    dht11_pin: Mutex<Option<u8>>,
    sd_card_info: Mutex<SdCardInfo>,
}

fn setup_logger() {
    esp_idf_svc::log::EspLogger::initialize_default();
    log::set_max_level(log::LevelFilter::Info);
}

fn get_gpio_state(state: &Arc<AppState>, pin: u8) -> Result<bool, String> {
    let drivers = state.gpio_drivers.lock().map_err(|e| e.to_string())?;
    let driver = drivers.get(&pin).ok_or(format!("Pin {} not initialized", pin))?;
    Ok(driver.is_set_high())
}

fn set_gpio_state(state: &Arc<AppState>, pin: u8, value: bool) -> Result<(), String> {
    let mut drivers = state.gpio_drivers.lock().map_err(|e| e.to_string())?;
    let driver = drivers.get_mut(&pin).ok_or(format!("Pin {} not initialized", pin))?;
    if value {
        driver.set_high().map_err(|e| e.to_string())?;
    } else {
        driver.set_low().map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn list_gpio_state(state: &Arc<AppState>) -> Result<Vec<GpioInfo>, String> {
    let drivers = state.gpio_drivers.lock().map_err(|e| e.to_string())?;
    let mut result = Vec::new();
    for (pin, driver) in drivers.iter() {
        result.push(GpioInfo {
            pin: *pin,
            state: driver.is_set_high(),
            direction: "output",
        });
    }
    result.sort_by(|a, b| a.pin.cmp(&b.pin));
    Ok(result)
}

fn initialize_gpios(peripherals: &Peripherals) -> HashMap<u8, PinDriver<'static, AnyIOPin, InputOutput>> {
    let mut drivers = HashMap::new();
    
    let pins = [
        peripherals.pins.gpio2.downgrade(),
        peripherals.pins.gpio4.downgrade(),
        peripherals.pins.gpio5.downgrade(),
        peripherals.pins.gpio12.downgrade(),
        peripherals.pins.gpio13.downgrade(),
        peripherals.pins.gpio14.downgrade(),
        peripherals.pins.gpio15.downgrade(),
        peripherals.pins.gpio16.downgrade(),
        peripherals.pins.gpio17.downgrade(),
        peripherals.pins.gpio18.downgrade(),
        peripherals.pins.gpio19.downgrade(),
        peripherals.pins.gpio21.downgrade(),
        peripherals.pins.gpio22.downgrade(),
        peripherals.pins.gpio23.downgrade(),
        peripherals.pins.gpio25.downgrade(),
        peripherals.pins.gpio26.downgrade(),
        peripherals.pins.gpio27.downgrade(),
    ];

    for pin in pins {
        let pin_number = pin.pin();
        let mut driver = PinDriver::input_output(pin).unwrap();
        driver.set_low().unwrap();
        drivers.insert(pin_number, driver);
        info!("Initialized GPIO {}", pin_number);
    }

    drivers
}

fn save_wifi_config_to_nvs(config: &WifiConfig) -> Result<(), String> {
    let nvs_part = EspDefaultNvsPartition::take().map_err(|e| e.to_string())?;
    let mut nvs = NvsStorage::new(nvs_part, "wifi_config", Default::default()).map_err(|e| e.to_string())?;
    let json = to_string(config).map_err(|e| e.to_string())?;
    nvs.set_raw("config", json.as_bytes()).map_err(|e| e.to_string())?;
    info!("WiFi config saved to NVS");
    Ok(())
}

fn load_wifi_config_from_nvs() -> Option<WifiConfig> {
    let nvs_part = EspDefaultNvsPartition::take().ok()?;
    let nvs = NvsStorage::new(nvs_part, "wifi_config", Default::default()).ok()?;
    let mut buffer = [0u8; 256];
    match nvs.get_raw("config", &mut buffer) {
        Ok(Some(data)) => {
            if let Ok(json) = std::str::from_utf8(data) {
                if let Ok(config) = serde_json::from_str::<WifiConfig>(json) {
                    info!("WiFi config loaded from NVS: SSID={}", config.ssid);
                    return Some(config);
                }
            }
            None
        }
        _ => None,
    }
}

fn connect_to_wifi(wifi: &mut BlockingWifi<EspWifi<'static>>, config: &WifiConfig) -> Result<(), String> {
    if config.ssid.is_empty() {
        return Err("SSID cannot be empty".to_string());
    }
    
    info!("Connecting to WiFi: {}", config.ssid);
    
    let sta_config = Configuration::Client(ClientConfiguration {
        ssid: heapless::String::from(config.ssid.as_str()),
        password: heapless::String::from(config.password.as_str()),
        ..Default::default()
    });
    
    wifi.set_configuration(&sta_config).map_err(|e| e.to_string())?;
    wifi.start().map_err(|e| e.to_string())?;
    wifi.connect().map_err(|e| e.to_string())?;
    wifi.wait_netif_up().map_err(|e| e.to_string())?;
    
    info!("WiFi connected successfully");
    Ok(())
}

fn start_soft_ap(wifi: &mut BlockingWifi<EspWifi<'static>>) -> Result<(), String> {
    info!("Starting SoftAP mode");
    
    let ap_config = Configuration::AccessPoint(AccessPointConfiguration {
        ssid: heapless::String::from("ESP32-RUST-SERVER"),
        password: heapless::String::from("password123"),
        ..Default::default()
    });
    
    wifi.set_configuration(&ap_config).map_err(|e| e.to_string())?;
    wifi.start().map_err(|e| e.to_string())?;
    
    info!("SoftAP started: SSID=ESP32-RUST-SERVER, IP=192.168.4.1");
    Ok(())
}

fn send_json_response(req: &mut impl esp_idf_svc::http::server::Request<impl esp_idf_svc::http::server::Connection>, status: u16, response: &Value) {
    let json_str = to_string(response).unwrap_or_default();
    let mut resp = req.into_response(status, Some("application/json"), Some(json_str.len())).unwrap();
    resp.write(json_str.as_bytes()).unwrap();
}

fn send_options_response(req: &mut impl esp_idf_svc::http::server::Request<impl esp_idf_svc::http::server::Connection>) {
    let response = json!({
        "success": true,
        "message": "CORS preflight OK"
    });
    send_json_response(req, 200, &response);
}

struct OtaState {
    update: Option<EspOtaUpdate<'static>>,
    total_size: u32,
    written_size: u32,
    is_active: bool,
}

unsafe impl Send for OtaState {}
unsafe impl Sync for OtaState {}

static OTA_STATE: Mutex<Option<OtaState>> = Mutex::new(None);

fn init_ota_update(total_size: u32) -> Result<(), String> {
    info!("Initializing OTA update, total size: {} bytes", total_size);
    
    if total_size < 1024 {
        return Err("Firmware too small".to_string());
    }
    
    let ota = esp_idf_svc::ota::EspOta::new().map_err(|e| e.to_string())?;
    let update = ota.initiate_update(total_size, None).map_err(|e| e.to_string())?;
    
    let mut state = OTA_STATE.lock().map_err(|e| e.to_string())?;
    *state = Some(OtaState {
        update: Some(update),
        total_size,
        written_size: 0,
        is_active: true,
    });
    
    Ok(())
}

fn write_ota_chunk(chunk: &[u8]) -> Result<u32, String> {
    info!("Writing OTA chunk: {} bytes", chunk.len());
    
    let mut state_guard = OTA_STATE.lock().map_err(|e| e.to_string())?;
    let state = state_guard.as_mut().ok_or("OTA not initialized")?;
    
    if !state.is_active {
        return Err("OTA not active".to_string());
    }
    
    let update = state.update.as_mut().ok_or("OTA update not found")?;
    update.write(chunk).map_err(|e| e.to_string())?;
    
    state.written_size += chunk.len() as u32;
    info!("OTA progress: {} / {} bytes", state.written_size, state.total_size);
    
    Ok(state.written_size)
}

fn complete_ota_update() -> Result<(), String> {
    info!("Completing OTA update");
    
    let mut state_guard = OTA_STATE.lock().map_err(|e| e.to_string())?;
    let mut state = state_guard.take().ok_or("OTA not initialized")?;
    
    if !state.is_active {
        return Err("OTA not active".to_string());
    }
    
    if state.written_size < state.total_size {
        return Err(format!("Incomplete firmware: {} / {} bytes", state.written_size, state.total_size));
    }
    
    let update = state.update.take().ok_or("OTA update not found")?;
    update.complete().map_err(|e| e.to_string())?;
    
    state.is_active = false;
    info!("OTA update completed successfully");
    
    Ok(())
}

fn cancel_ota_update() -> Result<(), String> {
    info!("Cancelling OTA update");
    
    let mut state_guard = OTA_STATE.lock().map_err(|e| e.to_string())?;
    let mut state = state_guard.take().ok_or("OTA not initialized")?;
    
    if state.is_active {
        if let Some(update) = state.update.take() {
            drop(update);
        }
        state.is_active = false;
    }
    
    Ok(())
}

const DHT11_START_DELAY_US: u64 = 20000;
const DHT11_WAIT_ACK_US: u64 = 40;
const DHT11_TIMEOUT_US: u64 = 100000;

fn read_dht11(pin: &mut PinDriver<'static, AnyIOPin, InputOutput>) -> Result<SensorData, String> {
    let mut data = [0u8; 5];
    
    pin.set_output().map_err(|e| e.to_string())?;
    pin.set_low().map_err(|e| e.to_string())?;
    std::thread::sleep(Duration::from_micros(DHT11_START_DELAY_US));
    
    pin.set_high().map_err(|e| e.to_string())?;
    pin.set_input().map_err(|e| e.to_string())?;
    
    let mut timeout = 0;
    while pin.is_low() && timeout < DHT11_TIMEOUT_US {
        std::thread::sleep(Duration::from_micros(1));
        timeout += 1;
    }
    if timeout >= DHT11_TIMEOUT_US {
        return Err("DHT11 timeout waiting for low to high".to_string());
    }
    
    timeout = 0;
    while pin.is_high() && timeout < DHT11_TIMEOUT_US {
        std::thread::sleep(Duration::from_micros(1));
        timeout += 1;
    }
    if timeout >= DHT11_TIMEOUT_US {
        return Err("DHT11 timeout waiting for ACK".to_string());
    }
    
    timeout = 0;
    while pin.is_low() && timeout < DHT11_TIMEOUT_US {
        std::thread::sleep(Duration::from_micros(1));
        timeout += 1;
    }
    if timeout >= DHT11_TIMEOUT_US {
        return Err("DHT11 timeout waiting for data start".to_string());
    }
    
    for i in 0..5 {
        for j in 0..8 {
            timeout = 0;
            while pin.is_low() && timeout < DHT11_TIMEOUT_US {
                std::thread::sleep(Duration::from_micros(1));
                timeout += 1;
            }
            if timeout >= DHT11_TIMEOUT_US {
                return Err(format!("DHT11 timeout waiting for bit {}:{}", i, j).to_string());
            }
            
            std::thread::sleep(Duration::from_micros(35));
            
            if pin.is_high() {
                data[i] |= 1 << (7 - j);
                
                timeout = 0;
                while pin.is_high() && timeout < DHT11_TIMEOUT_US {
                    std::thread::sleep(Duration::from_micros(1));
                    timeout += 1;
                }
            }
        }
    }
    
    let checksum = (data[0] as u16 + data[1] as u16 + data[2] as u16 + data[3] as u16) as u8;
    if checksum != data[4] {
        return Err(format!("DHT11 checksum error: {:?}", data).to_string());
    }
    
    let humidity = data[0] as f32 + (data[1] as f32) * 0.1;
    let temperature = data[2] as f32 + (data[3] as f32) * 0.1;
    
    let timestamp = unsafe {
        let mut tv = std::mem::zeroed();
        esp_idf_sys::gettimeofday(&mut tv, std::ptr::null_mut());
        tv.tv_sec as u64
    };
    
    Ok(SensorData {
        temperature,
        humidity,
        timestamp,
    })
}

fn read_dht11_sensor(state: &Arc<AppState>) -> Result<SensorData, String> {
    let pin_opt = state.dht11_pin.lock().map_err(|e| e.to_string())?;
    let pin_num = pin_opt.ok_or("DHT11 pin not configured".to_string())?;
    
    let mut drivers = state.gpio_drivers.lock().map_err(|e| e.to_string())?;
    
    if let Some(driver) = drivers.get_mut(&pin_num) {
        let result = read_dht11(driver);
        
        driver.set_output().map_err(|e| e.to_string())?;
        driver.set_low().map_err(|e| e.to_string())?;
        
        match result {
            Ok(sensor_data) => {
                drop(drivers);
                let mut stored = state.sensor_data.lock().map_err(|e| e.to_string())?;
                *stored = Some(sensor_data.clone());
                Ok(sensor_data)
            }
            Err(e) => Err(e),
        }
    } else {
        Err(format!("DHT11 pin {} not found in initialized pins", pin_num).to_string())
    }
}

fn set_dht11_pin(state: &Arc<AppState>, pin: u8) -> Result<(), String> {
    let drivers = state.gpio_drivers.lock().map_err(|e| e.to_string())?;
    
    if !drivers.contains_key(&pin) {
        return Err(format!("Pin {} not initialized", pin).to_string());
    }
    
    let mut pin_config = state.dht11_pin.lock().map_err(|e| e.to_string())?;
    *pin_config = Some(pin);
    
    info!("DHT11 pin set to GPIO {}", pin);
    Ok(())
}

static SD_MOUNTED: Mutex<bool> = Mutex::new(false);

fn init_sd_card() -> bool {
    unsafe {
        let mount_path = std::ffi::CString::new("/sdcard").unwrap();
        
        let mut config = esp_idf_sys::sdmmc_host_t {
            flags: esp_idf_sys::SDMMC_HOST_FLAG_SPI | esp_idf_sys::SDMMC_HOST_FLAG_DEINIT_ARG,
            slot: 1,
            max_freq_khz: esp_idf_sys::SDMMC_FREQ_DEFAULT,
            io_voltage: 3.3,
            init: None,
            deinit: None,
            connect_irq: None,
            disconnect_irq: None,
            set_host_speed: None,
            set_bus_width: None,
            set_input_delay: None,
            get_cd: None,
            get_wp: None,
            hw_voltage_switch: None,
            ack_transfer: None,
            io_command: None,
            do_transaction: None,
            deinit_arg: std::ptr::null_mut(),
        };
        
        let mut slot_config = esp_idf_sys::sdspi_device_config_t {
            host_id: 1,
            cs_io_num: 5,
            gpio_mosi: 23,
            gpio_miso: 19,
            gpio_sclk: 18,
            gpio_cd: esp_idf_sys::GPIO_NUM_NEGATIVE_ONE as i32,
            gpio_wp: esp_idf_sys::GPIO_NUM_NEGATIVE_ONE as i32,
            gpio_int: esp_idf_sys::GPIO_NUM_NEGATIVE_ONE as i32,
        };
        
        let mut fs_config = esp_idf_sys::esp_vfs_fat_sdmmc_mount_config_t {
            format_if_mount_failed: false,
            max_files: 5,
            allocation_unit_size: 16 * 1024,
            disk_status_check_enable: false,
        };
        
        let mut card: *mut esp_idf_sys::sdmmc_card_t = std::ptr::null_mut();
        
        info!("Mounting SD card...");
        
        let ret = esp_idf_sys::esp_vfs_fat_sdspi_mount(
            mount_path.as_ptr(),
            &mut config,
            &mut slot_config,
            &mut fs_config,
            &mut card,
        );
        
        if ret == 0 {
            info!("SD card mounted successfully at /sdcard");
            *SD_MOUNTED.lock().unwrap() = true;
            true
        } else {
            error!("Failed to mount SD card: {}", ret);
            *SD_MOUNTED.lock().unwrap() = false;
            false
        }
    }
}

fn get_sd_card_info() -> SdCardInfo {
    let mounted = *SD_MOUNTED.lock().unwrap();
    
    if !mounted {
        return SdCardInfo {
            mounted: false,
            total_bytes: 0,
            free_bytes: 0,
            used_bytes: 0,
        };
    }
    
    unsafe {
        let mut total_bytes = 0u64;
        let mut free_bytes = 0u64;
        
        let mut statvfs = std::mem::zeroed::<esp_idf_sys::statvfs_t>();
        let mount_path = b"/sdcard\0";
        
        if esp_idf_sys::statvfs(mount_path.as_ptr() as *const i8, &mut statvfs) == 0 {
            total_bytes = statvfs.f_frsize as u64 * statvfs.f_blocks as u64;
            free_bytes = statvfs.f_frsize as u64 * statvfs.f_bavail as u64;
            
            SdCardInfo {
                mounted: true,
                total_bytes,
                free_bytes,
                used_bytes: total_bytes.saturating_sub(free_bytes),
            }
        } else {
            SdCardInfo {
                mounted: false,
                total_bytes: 0,
                free_bytes: 0,
                used_bytes: 0,
            }
        }
    }
}

fn backup_config_to_sd_card(wifi_config: &Option<WifiConfig>) -> Result<String, String> {
    info!("Backing up config to SD card");
    
    let config_json = serde_json::json!({
        "wifi": wifi_config,
        "timestamp": unsafe {
            let mut tv = std::mem::zeroed();
            esp_idf_sys::gettimeofday(&mut tv, std::ptr::null_mut());
            tv.tv_sec as u64
        }
    });
    
    let json_str = serde_json::to_string_pretty(&config_json).map_err(|e| e.to_string())?;
    let file_path = "/sdcard/esp32_config_backup.json";
    
    unsafe {
        let c_path = std::ffi::CString::new(file_path).map_err(|e| e.to_string())?;
        let file = esp_idf_sys::fopen(c_path.as_ptr(), b"w\0".as_ptr() as *const i8);
        
        if file.is_null() {
            return Err(format!("Failed to open file for writing: {}", file_path).to_string());
        }
        
        let bytes = json_str.as_bytes();
        let written = esp_idf_sys::fwrite(
            bytes.as_ptr() as *const _,
            1,
            bytes.len(),
            file
        );
        
        esp_idf_sys::fclose(file);
        
        if written != bytes.len() as esp_idf_sys::size_t {
            return Err(format!("Failed to write all data to file").to_string());
        }
    }
    
    info!("Config backed up to {}", file_path);
    Ok(format!("Config backed up to {}", file_path).to_string())
}

fn restore_config_from_sd_card() -> Result<WifiConfig, String> {
    info!("Restoring config from SD card");
    
    let file_path = "/sdcard/esp32_config_backup.json";
    
    let mut json_str = String::new();
    
    unsafe {
        let c_path = std::ffi::CString::new(file_path).map_err(|e| e.to_string())?;
        let file = esp_idf_sys::fopen(c_path.as_ptr(), b"r\0".as_ptr() as *const i8);
        
        if file.is_null() {
            return Err(format!("Config file not found on SD card: {}", file_path).to_string());
        }
        
        let mut buffer = [0u8; 1024];
        loop {
            let bytes_read = esp_idf_sys::fread(
                buffer.as_mut_ptr() as *mut _,
                1,
                buffer.len(),
                file
            );
            
            if bytes_read == 0 {
                break;
            }
            
            if let Ok(s) = std::str::from_utf8(&buffer[..bytes_read]) {
                json_str.push_str(s);
            }
            
            if bytes_read < buffer.len() as esp_idf_sys::size_t {
                break;
            }
        }
        
        esp_idf_sys::fclose(file);
    }
    
    let config_json: serde_json::Value = serde_json::from_str(&json_str).map_err(|e| e.to_string())?;
    
    let wifi_config: WifiConfig = serde_json::from_value(
        config_json.get("wifi")
            .ok_or("No wifi config found in backup")?
            .clone()
    ).map_err(|e| e.to_string())?;
    
    info!("Config restored from SD card");
    Ok(wifi_config)
}

fn list_sd_files() -> Result<Vec<String>, String> {
    let mut files = Vec::new();
    
    unsafe {
        let dir_path = std::ffi::CString::new("/sdcard").map_err(|e| e.to_string())?;
        let dir = esp_idf_sys::opendir(dir_path.as_ptr());
        
        if dir.is_null() {
            return Err("Failed to open SD card directory".to_string());
        }
        
        loop {
            let entry = esp_idf_sys::readdir(dir);
            if entry.is_null() {
                break;
            }
            
            let name = (*entry).d_name.as_ptr();
            if let Ok(c_str) = std::ffi::CStr::from_ptr(name).to_str() {
                if c_str != "." && c_str != ".." {
                    files.push(c_str.to_string());
                }
            }
        }
        
        esp_idf_sys::closedir(dir);
    }
    
    files.sort();
    Ok(files)
}

fn create_http_server(state: Arc<AppState>) -> Result<EspHttpServer<'static>, String> {
    let server_config = Configuration {
        http_max_uri_len: 512,
        http_max_req_hdr_len: 1024,
        http_max_body_size: 16384,
        ..Default::default()
    };
    
    let mut server = EspHttpServer::new(&server_config)
        .map_err(|e| format!("Failed to create HTTP server: {}", e))?;

    {
        let state_clone = Arc::clone(&state);
        server.fn_handler("/", Method::Get, move |req| {
            let html = r#"
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ESP32 Rust Web Server</title>
    <style>
        body { font-family: Arial, sans-serif; max-width: 900px; margin: 0 auto; padding: 20px; }
        .section { border: 1px solid #ddd; padding: 20px; margin: 20px 0; border-radius: 8px; }
        h1, h2 { color: #333; }
        button { background: #4CAF50; color: white; border: none; padding: 10px 20px; margin: 5px; border-radius: 4px; cursor: pointer; }
        button:hover { background: #45a049; }
        button.off { background: #f44336; }
        button.off:hover { background: #da190b; }
        button:disabled { background: #cccccc; cursor: not-allowed; }
        button.warn { background: #ff9800; }
        button.warn:hover { background: #f57c00; }
        input, select { padding: 8px; margin: 5px 0; border: 1px solid #ddd; border-radius: 4px; }
        .gpio-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }
        .gpio-item { border: 1px solid #eee; padding: 15px; border-radius: 8px; text-align: center; }
        .status { font-weight: bold; }
        .status.on { color: #4CAF50; }
        .status.off { color: #f44336; }
        .progress { width: 100%; background: #ddd; height: 20px; border-radius: 10px; margin: 10px 0; display: none; }
        .progress-bar { height: 100%; background: #4CAF50; border-radius: 10px; transition: width 0.3s; }
        .sensor-card { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 8px; margin: 10px 0; }
        .sensor-value { font-size: 2em; font-weight: bold; }
        .sensor-unit { font-size: 0.8em; opacity: 0.8; }
        .info-box { background: #f5f5f5; padding: 10px; border-radius: 4px; margin: 5px 0; }
        .file-list { max-height: 200px; overflow-y: auto; background: #f9f9f9; padding: 10px; border-radius: 4px; }
        .file-item { padding: 5px; border-bottom: 1px solid #eee; }
    </style>
</head>
<body>
    <h1>ESP32 Rust Web Server</h1>
    
    <div class="section">
        <h2>温湿度传感器 (DHT11)</h2>
        <div class="sensor-card">
            <div style="display: flex; justify-content: space-around;">
                <div>
                    <div>温度</div>
                    <div class="sensor-value"><span id="temp-val">--</span><span class="sensor-unit"> °C</span></div>
                </div>
                <div>
                    <div>湿度</div>
                    <div class="sensor-value"><span id="hum-val">--</span><span class="sensor-unit"> %</span></div>
                </div>
            </div>
        </div>
        <div class="info-box" id="sensor-info">传感器未配置</div>
        <div>
            <label>DHT11 引脚: 
                <select id="dht11-pin">
                    <option value="">选择引脚</option>
                </select>
            </label>
            <button onclick="setDht11Pin()">设置</button>
            <button onclick="refreshSensor()">立即读取</button>
        </div>
    </div>
    
    <div class="section">
        <h2>WiFi 配置</h2>
        <div>
            <label>SSID: <input type="text" id="ssid" placeholder="输入WiFi名称"></label><br>
            <label>密码: <input type="password" id="password" placeholder="输入WiFi密码"></label><br>
            <button id="wifi-btn" onclick="saveWifiConfig()">保存并连接</button>
            <button class="warn" onclick="backupToSd()">备份到SD卡</button>
            <button onclick="restoreFromSd()">从SD卡恢复</button>
            <div id="wifi-status"></div>
        </div>
    </div>
    
    <div class="section">
        <h2>SD 卡</h2>
        <div id="sd-status" class="info-box">检测SD卡中...</div>
        <div id="sd-files" style="display: none;">
            <h3>文件列表:</h3>
            <div id="file-list" class="file-list"></div>
        </div>
    </div>
    
    <div class="section">
        <h2>GPIO 控制</h2>
        <div id="gpio-container" class="gpio-grid"></div>
        <button onclick="refreshGpio()">刷新</button>
    </div>
    
    <div class="section">
        <h2>OTA 固件更新</h2>
        <div>
            <input type="file" id="firmware-file" accept=".bin">
            <button id="ota-btn" onclick="uploadFirmware()">上传并更新</button>
            <button id="ota-cancel-btn" onclick="cancelFirmware()" style="display: none; background: #ff9800;">取消</button>
        </div>
        <div id="ota-status"></div>
        <div id="progress-container" class="progress">
            <div id="progress-bar" class="progress-bar" style="width: 0%"></div>
        </div>
    </div>

    <script>
        let otaCancelled = false;
        
        async function fetchApi(url, options = {}) {
            try {
                const res = await fetch(url, options);
                if (!res.ok) {
                    throw new Error('Network response was not ok: ' + res.status);
                }
                return await res.json();
            } catch (error) {
                console.error('Fetch error:', error);
                return {
                    success: false,
                    error: error.message
                };
            }
        }
        
        async function populateDhtPinOptions() {
            const data = await fetchApi('/api/gpio');
            const select = document.getElementById('dht11-pin');
            select.innerHTML = '<option value="">选择引脚</option>';
            if (data.success && data.gpios) {
                data.gpios.forEach(gpio => {
                    const option = document.createElement('option');
                    option.value = gpio.pin;
                    option.textContent = 'GPIO ' + gpio.pin;
                    select.appendChild(option);
                });
            }
        }
        
        async function setDht11Pin() {
            const pin = document.getElementById('dht11-pin').value;
            if (!pin) {
                alert('请选择引脚');
                return;
            }
            
            const result = await fetchApi('/api/sensor/dht11', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pin: parseInt(pin) })
            });
            
            if (result.success) {
                alert('DHT11引脚已设置为 GPIO ' + pin);
                refreshSensor();
            } else {
                alert('设置失败: ' + (result.error || '未知错误'));
            }
        }
        
        async function refreshSensor() {
            const infoDiv = document.getElementById('sensor-info');
            const result = await fetchApi('/api/sensor/dht11', {
                method: 'GET'
            });
            
            if (result.success && result.data) {
                document.getElementById('temp-val').textContent = result.data.temperature.toFixed(1);
                document.getElementById('hum-val').textContent = result.data.humidity.toFixed(1);
                infoDiv.textContent = '上次更新: ' + new Date(result.data.timestamp * 1000).toLocaleString();
                infoDiv.style.color = '#4CAF50';
            } else {
                infoDiv.textContent = '读取失败: ' + (result.error || '请先配置DHT11引脚');
                infoDiv.style.color = '#f44336';
            }
        }
        
        async function refreshSdCard() {
            const statusDiv = document.getElementById('sd-status');
            const filesDiv = document.getElementById('sd-files');
            const fileListDiv = document.getElementById('file-list');
            
            const result = await fetchApi('/api/sd/info', {
                method: 'GET'
            });
            
            if (result.success && result.info) {
                const info = result.info;
                if (info.mounted) {
                    statusDiv.innerHTML = `
                        <strong>SD卡已挂载</strong><br>
                        总容量: ${(info.total_bytes / 1024 / 1024).toFixed(2)} MB<br>
                        已用: ${(info.used_bytes / 1024 / 1024).toFixed(2)} MB<br>
                        可用: ${(info.free_bytes / 1024 / 1024).toFixed(2)} MB
                    `;
                    statusDiv.style.color = '#4CAF50';
                    
                    const filesResult = await fetchApi('/api/sd/files', {
                        method: 'GET'
                    });
                    
                    if (filesResult.success && filesResult.files) {
                        filesDiv.style.display = 'block';
                        fileListDiv.innerHTML = '';
                        if (filesResult.files.length === 0) {
                            fileListDiv.innerHTML = '<div>（空）</div>';
                        } else {
                            filesResult.files.forEach(file => {
                                const div = document.createElement('div');
                                div.className = 'file-item';
                                div.textContent = file;
                                fileListDiv.appendChild(div);
                            });
                        }
                    }
                } else {
                    statusDiv.textContent = 'SD卡未插入或未挂载';
                    statusDiv.style.color = '#f44336';
                    filesDiv.style.display = 'none';
                }
            } else {
                statusDiv.textContent = 'SD卡检测失败';
                statusDiv.style.color = '#f44336';
            }
        }
        
        async function backupToSd() {
            const ssid = document.getElementById('ssid').value.trim();
            if (!ssid) {
                alert('请先输入WiFi配置');
                return;
            }
            
            const result = await fetchApi('/api/sd/backup', {
                method: 'POST'
            });
            
            if (result.success) {
                alert('配置已备份到SD卡');
                refreshSdCard();
            } else {
                alert('备份失败: ' + (result.error || '请检查SD卡是否插入'));
            }
        }
        
        async function restoreFromSd() {
            if (!confirm('确定要从SD卡恢复配置吗？这将覆盖当前配置。')) {
                return;
            }
            
            const result = await fetchApi('/api/sd/restore', {
                method: 'POST'
            });
            
            if (result.success && result.config) {
                document.getElementById('ssid').value = result.config.ssid || '';
                alert('配置已从SD卡恢复，点击"保存并连接"以应用');
            } else {
                alert('恢复失败: ' + (result.error || 'SD卡中无备份文件'));
            }
        }
        
        async function refreshGpio() {
            const data = await fetchApi('/api/gpio');
            const container = document.getElementById('gpio-container');
            container.innerHTML = '';
            if (data.success && data.gpios) {
                data.gpios.forEach(gpio => {
                    const div = document.createElement('div');
                    div.className = 'gpio-item';
                    div.innerHTML = `
                        <div><strong>GPIO ${gpio.pin}</strong></div>
                        <div class="status ${gpio.state ? 'on' : 'off'}">${gpio.state ? 'ON' : 'OFF'}</div>
                        <button class="${gpio.state ? 'off' : ''}" onclick="toggleGpio(${gpio.pin}, ${!gpio.state})">
                            ${gpio.state ? '关闭' : '开启'}
                        </button>
                    `;
                    container.appendChild(div);
                });
            } else {
                container.innerHTML = '<div>加载GPIO状态失败: ' + (data.error || '未知错误') + '</div>';
            }
        }
        
        async function toggleGpio(pin, state) {
            const result = await fetchApi(`/api/gpio/${pin}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ state })
            });
            if (!result.success) {
                alert('操作失败: ' + (result.error || '未知错误'));
            }
            refreshGpio();
        }
        
        async function saveWifiConfig() {
            const btn = document.getElementById('wifi-btn');
            const statusDiv = document.getElementById('wifi-status');
            btn.disabled = true;
            statusDiv.textContent = '正在保存...';
            statusDiv.style.color = '#333';
            
            const ssid = document.getElementById('ssid').value.trim();
            const password = document.getElementById('password').value;
            
            if (!ssid) {
                alert('请输入WiFi名称');
                btn.disabled = false;
                statusDiv.textContent = '';
                return;
            }
            
            const result = await fetchApi('/api/wifi', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ssid, password })
            });
            
            if (result.success) {
                statusDiv.textContent = result.message;
                statusDiv.style.color = '#4CAF50';
                alert('WiFi配置已保存。重启设备后将尝试连接。');
            } else {
                statusDiv.textContent = '保存失败: ' + (result.error || '未知错误');
                statusDiv.style.color = '#f44336';
                alert('保存失败: ' + (result.error || '未知错误'));
            }
            
            btn.disabled = false;
        }
        
        async function cancelFirmware() {
            otaCancelled = true;
            const result = await fetchApi('/api/ota/cancel', {
                method: 'POST'
            });
            if (result.success) {
                alert('OTA更新已取消');
                resetOtaUI();
            } else {
                alert('取消失败: ' + (result.error || '未知错误'));
            }
        }
        
        function resetOtaUI() {
            const btn = document.getElementById('ota-btn');
            const cancelBtn = document.getElementById('ota-cancel-btn');
            const progressContainer = document.getElementById('progress-container');
            
            otaCancelled = false;
            btn.disabled = false;
            cancelBtn.style.display = 'none';
            progressContainer.style.display = 'none';
        }
        
        async function uploadFirmware() {
            const fileInput = document.getElementById('firmware-file');
            const btn = document.getElementById('ota-btn');
            const cancelBtn = document.getElementById('ota-cancel-btn');
            const statusDiv = document.getElementById('ota-status');
            const progressContainer = document.getElementById('progress-container');
            const progressBar = document.getElementById('progress-bar');
            
            if (!fileInput.files[0]) {
                alert('请选择固件文件');
                return;
            }
            
            const file = fileInput.files[0];
            console.log('准备上传固件:', file.name, '大小:', file.size, 'bytes');
            
            if (file.size < 1024) {
                alert('固件文件太小，可能无效');
                return;
            }
            
            otaCancelled = false;
            btn.disabled = true;
            cancelBtn.style.display = 'inline-block';
            statusDiv.textContent = '正在初始化OTA更新...';
            statusDiv.style.color = '#333';
            progressContainer.style.display = 'block';
            progressBar.style.width = '0%';
            
            try {
                const initResult = await fetchApi('/api/ota/init', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ totalSize: file.size })
                });
                
                if (!initResult.success) {
                    throw new Error(initResult.error || '初始化失败');
                }
                
                const CHUNK_SIZE = 8192;
                const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
                
                for (let i = 0; i < totalChunks; i++) {
                    if (otaCancelled) {
                        throw new Error('用户取消');
                    }
                    
                    const start = i * CHUNK_SIZE;
                    const end = Math.min(start + CHUNK_SIZE, file.size);
                    const chunk = file.slice(start, end);
                    
                    const progress = Math.round(((i + 1) / totalChunks) * 100);
                    progressBar.style.width = progress + '%';
                    statusDiv.textContent = '上传中... ' + progress + '% (' + (i + 1) + '/' + totalChunks + ')';
                    
                    const result = await fetch('/api/ota/write', {
                        method: 'POST',
                        body: chunk
                    });
                    
                    if (!result.ok) {
                        throw new Error('写入失败: HTTP ' + result.status);
                    }
                    
                    const json = await result.json();
                    if (!json.success) {
                        throw new Error(json.error || '写入失败');
                    }
                }
                
                if (otaCancelled) {
                    throw new Error('用户取消');
                }
                
                statusDiv.textContent = '正在完成OTA更新...';
                const completeResult = await fetchApi('/api/ota/finish', {
                    method: 'POST'
                });
                
                if (completeResult.success) {
                    statusDiv.textContent = '固件更新完成，设备将重启...';
                    statusDiv.style.color = '#4CAF50';
                    alert('固件更新成功！设备将在3秒后重启。');
                    setTimeout(() => location.reload(), 3000);
                } else {
                    throw new Error(completeResult.error || '完成更新失败');
                }
                
            } catch (error) {
                statusDiv.textContent = '更新失败: ' + error.message;
                statusDiv.style.color = '#f44336';
                if (error.message !== '用户取消') {
                    alert('OTA更新失败: ' + error.message);
                }
                resetOtaUI();
            }
        }
        
        async function loadWifiConfig() {
            const data = await fetchApi('/api/wifi');
            if (data.success && data.ssid) {
                document.getElementById('ssid').value = data.ssid;
            }
        }
        
        populateDhtPinOptions();
        loadWifiConfig();
        refreshGpio();
        refreshSdCard();
        refreshSensor();
        
        setInterval(() => {
            refreshSensor();
        }, 10000);
    </script>
</body>
</html>
"#;
            let _ = req.into_ok_response().map(|mut res| {
                res.write(html.as_bytes()).unwrap();
            });
            Ok(())
        })?;
    }

    {
        server.fn_handler("/api/wifi", Method::Options, move |mut req| {
            send_options_response(&mut req);
            Ok(())
        })?;
    }

    {
        let state_clone = Arc::clone(&state);
        server.fn_handler("/api/gpio", Method::Get, move |req| {
            match list_gpio_state(&state_clone) {
                Ok(gpios) => {
                    let response = json!({
                        "success": true,
                        "gpios": gpios
                    });
                    send_json_response(req, 200, &response);
                }
                Err(e) => {
                    let response = json!({
                        "success": false,
                        "error": e
                    });
                    send_json_response(req, 500, &response);
                }
            }
            Ok(())
        })?;
    }

    {
        server.fn_handler("/api/gpio/:pin", Method::Options, move |mut req| {
            send_options_response(&mut req);
            Ok(())
        })?;
    }

    {
        let state_clone = Arc::clone(&state);
        server.fn_handler("/api/gpio/:pin", Method::Get, move |req| {
            let pin_str = req.uri().trim_start_matches("/api/gpio/");
            let pin_str = pin_str.split('/').next().unwrap_or("");
            match pin_str.parse::<u8>() {
                Ok(pin) => {
                    match get_gpio_state(&state_clone, pin) {
                        Ok(gpio_state) => {
                            let response = json!({
                                "success": true,
                                "pin": pin,
                                "state": gpio_state
                            });
                            send_json_response(req, 200, &response);
                        }
                        Err(e) => {
                            let response = json!({
                                "success": false,
                                "error": e
                            });
                            send_json_response(req, 404, &response);
                        }
                    }
                }
                Err(_) => {
                    let response = json!({
                        "success": false,
                        "error": "Invalid pin number"
                    });
                    send_json_response(req, 400, &response);
                }
            }
            Ok(())
        })?;
    }

    {
        let state_clone = Arc::clone(&state);
        server.fn_handler("/api/gpio/:pin", Method::Put, move |mut req| {
            let pin_str = req.uri().trim_start_matches("/api/gpio/");
            let pin_str = pin_str.split('/').next().unwrap_or("");
            let body = std::str::from_utf8(&req.body().unwrap_or_default()).unwrap_or("");
            match pin_str.parse::<u8>() {
                Ok(pin) => {
                    match serde_json::from_str::<GpioState>(body) {
                        Ok(body) => {
                            match set_gpio_state(&state_clone, pin, body.state) {
                                Ok(_) => {
                                    let response = json!({
                                        "success": true,
                                        "message": format!("GPIO {} set to {}", pin, body.state)
                                    });
                                    send_json_response(&mut req, 200, &response);
                                }
                                Err(e) => {
                                    let response = json!({
                                        "success": false,
                                        "error": e
                                    });
                                    send_json_response(&mut req, 500, &response);
                                }
                            }
                        }
                        Err(e) => {
                            let response = json!({
                                "success": false,
                                "error": format!("Invalid request body: {}", e)
                            });
                            send_json_response(&mut req, 400, &response);
                        }
                    }
                }
                Err(_) => {
                    let response = json!({
                        "success": false,
                        "error": "Invalid pin number"
                    });
                    send_json_response(&mut req, 400, &response);
                }
            }
            Ok(())
        })?;
    }

    {
        let state_clone = Arc::clone(&state);
        server.fn_handler("/api/wifi", Method::Get, move |req| {
            let config = state_clone.wifi_config.lock().map_err(|e| e.to_string()).unwrap_or_default();
            let response = json!({
                "success": true,
                "ssid": config.as_ref().map(|c| c.ssid.clone()).unwrap_or_default()
            });
            send_json_response(req, 200, &response);
            Ok(())
        })?;
    }

    {
        let state_clone = Arc::clone(&state);
        server.fn_handler("/api/wifi", Method::Post, move |mut req| {
            let body = std::str::from_utf8(&req.body().unwrap_or_default()).unwrap_or("");
            match serde_json::from_str::<WifiConfig>(body) {
                Ok(config) => {
                    if let Err(e) = save_wifi_config_to_nvs(&config) {
                        let response = json!({
                            "success": false,
                            "error": format!("Failed to save WiFi config: {}", e)
                        });
                        send_json_response(&mut req, 500, &response);
                        return Ok(());
                    }
                    *state_clone.wifi_config.lock().map_err(|e| e.to_string()).unwrap_or_default() = Some(config.clone());
                    let response = json!({
                        "success": true,
                        "message": format!("WiFi config saved. SSID: {}. Device will attempt to connect on next boot.", config.ssid)
                    });
                    send_json_response(&mut req, 200, &response);
                }
                Err(e) => {
                    let response = json!({
                        "success": false,
                        "error": format!("Invalid request body: {}", e)
                    });
                    send_json_response(&mut req, 400, &response);
                }
            }
            Ok(())
        })?;
    }

    {
        server.fn_handler("/api/sensor/dht11", Method::Options, move |mut req| {
            send_options_response(&mut req);
            Ok(())
        })?;
    }

    {
        let state_clone = Arc::clone(&state);
        server.fn_handler("/api/sensor/dht11", Method::Get, move |req| {
            let stored = state_clone.sensor_data.lock().map_err(|e| e.to_string()).unwrap_or_default();
            
            if let Some(sensor_data) = stored.as_ref() {
                let response = json!({
                    "success": true,
                    "data": sensor_data
                });
                send_json_response(req, 200, &response);
            } else {
                match read_dht11_sensor(&state_clone) {
                    Ok(sensor_data) => {
                        let response = json!({
                            "success": true,
                            "data": sensor_data
                        });
                        send_json_response(req, 200, &response);
                    }
                    Err(e) => {
                        let response = json!({
                            "success": false,
                            "error": e
                        });
                        send_json_response(req, 500, &response);
                    }
                }
            }
            
            Ok(())
        })?;
    }

    {
        let state_clone = Arc::clone(&state);
        server.fn_handler("/api/sensor/dht11", Method::Post, move |mut req| {
            let body = std::str::from_utf8(&req.body().unwrap_or_default()).unwrap_or("");
            #[derive(Deserialize)]
            struct DhtConfig {
                pin: u8,
            }
            match serde_json::from_str::<DhtConfig>(body) {
                Ok(config) => {
                    match set_dht11_pin(&state_clone, config.pin) {
                        Ok(_) => {
                            let response = json!({
                                "success": true,
                                "message": format!("DHT11 pin set to GPIO {}", config.pin)
                            });
                            send_json_response(&mut req, 200, &response);
                        }
                        Err(e) => {
                            let response = json!({
                                "success": false,
                                "error": e
                            });
                            send_json_response(&mut req, 500, &response);
                        }
                    }
                }
                Err(e) => {
                    let response = json!({
                        "success": false,
                        "error": format!("Invalid request: {}", e)
                    });
                    send_json_response(&mut req, 400, &response);
                }
            }
            Ok(())
        })?;
    }

    {
        server.fn_handler("/api/sd/info", Method::Options, move |mut req| {
            send_options_response(&mut req);
            Ok(())
        })?;
    }

    {
        let state_clone = Arc::clone(&state);
        server.fn_handler("/api/sd/info", Method::Get, move |req| {
            let info = get_sd_card_info();
            *state_clone.sd_card_info.lock().map_err(|e| e.to_string()).unwrap_or_default() = info.clone();
            let response = json!({
                "success": true,
                "info": info
            });
            send_json_response(req, 200, &response);
            Ok(())
        })?;
    }

    {
        server.fn_handler("/api/sd/files", Method::Options, move |mut req| {
            send_options_response(&mut req);
            Ok(())
        })?;
    }

    {
        server.fn_handler("/api/sd/files", Method::Get, move |req| {
            match list_sd_files() {
                Ok(files) => {
                    let response = json!({
                        "success": true,
                        "files": files
                    });
                    send_json_response(req, 200, &response);
                }
                Err(e) => {
                    let response = json!({
                        "success": false,
                        "error": e
                    });
                    send_json_response(req, 500, &response);
                }
            }
            Ok(())
        })?;
    }

    {
        server.fn_handler("/api/sd/backup", Method::Options, move |mut req| {
            send_options_response(&mut req);
            Ok(())
        })?;
    }

    {
        let state_clone = Arc::clone(&state);
        server.fn_handler("/api/sd/backup", Method::Post, move |mut req| {
            let wifi_config = state_clone.wifi_config.lock().map_err(|e| e.to_string()).unwrap_or_default();
            match backup_config_to_sd_card(&wifi_config) {
                Ok(message) => {
                    let response = json!({
                        "success": true,
                        "message": message
                    });
                    send_json_response(&mut req, 200, &response);
                }
                Err(e) => {
                    let response = json!({
                        "success": false,
                        "error": e
                    });
                    send_json_response(&mut req, 500, &response);
                }
            }
            Ok(())
        })?;
    }

    {
        server.fn_handler("/api/sd/restore", Method::Options, move |mut req| {
            send_options_response(&mut req);
            Ok(())
        })?;
    }

    {
        let state_clone = Arc::clone(&state);
        server.fn_handler("/api/sd/restore", Method::Post, move |mut req| {
            match restore_config_from_sd_card() {
                Ok(config) => {
                    *state_clone.wifi_config.lock().map_err(|e| e.to_string()).unwrap_or_default() = Some(config.clone());
                    let response = json!({
                        "success": true,
                        "config": {
                            "ssid": config.ssid
                        },
                        "message": "Config restored successfully"
                    });
                    send_json_response(&mut req, 200, &response);
                }
                Err(e) => {
                    let response = json!({
                        "success": false,
                        "error": e
                    });
                    send_json_response(&mut req, 500, &response);
                }
            }
            Ok(())
        })?;
    }

    {
        server.fn_handler("/api/ota/init", Method::Post, move |mut req| {
            info!("OTA init request");
            let body = std::str::from_utf8(&req.body().unwrap_or_default()).unwrap_or("");
            #[derive(Deserialize)]
            struct OtaInitReq {
                totalSize: u32,
            }
            match serde_json::from_str::<OtaInitReq>(body) {
                Ok(init_req) => {
                    match init_ota_update(init_req.totalSize) {
                        Ok(_) => {
                            let response = json!({
                                "success": true,
                                "message": "OTA initialized",
                                "totalSize": init_req.totalSize
                            });
                            send_json_response(&mut req, 200, &response);
                        }
                        Err(e) => {
                            let response = json!({
                                "success": false,
                                "error": format!("Failed to init OTA: {}", e)
                            });
                            send_json_response(&mut req, 500, &response);
                        }
                    }
                }
                Err(e) => {
                    let response = json!({
                        "success": false,
                        "error": format!("Invalid request: {}", e)
                    });
                    send_json_response(&mut req, 400, &response);
                }
            }
            Ok(())
        })?;
    }

    {
        server.fn_handler("/api/ota/write", Method::Post, move |mut req| {
            let body = req.body().unwrap_or_default();
            if body.is_empty() {
                let response = json!({
                    "success": false,
                    "error": "No data"
                });
                send_json_response(&mut req, 400, &response);
                return Ok(());
            }
            
            match write_ota_chunk(&body) {
                Ok(written) => {
                    let response = json!({
                        "success": true,
                        "written": written
                    });
                    send_json_response(&mut req, 200, &response);
                }
                Err(e) => {
                    let response = json!({
                        "success": false,
                        "error": format!("Write failed: {}", e)
                    });
                    send_json_response(&mut req, 500, &response);
                }
            }
            Ok(())
        })?;
    }

    {
        server.fn_handler("/api/ota/finish", Method::Post, move |mut req| {
            info!("Finishing OTA update");
            match complete_ota_update() {
                Ok(_) => {
                    let response = json!({
                        "success": true,
                        "message": "OTA update successful. Device will restart."
                    });
                    send_json_response(&mut req, 200, &response);
                    
                    std::thread::sleep(Duration::from_millis(500));
                    esp_idf_sys::esp!(unsafe { esp_idf_sys::esp_restart() }).unwrap();
                }
                Err(e) => {
                    let response = json!({
                        "success": false,
                        "error": format!("Failed to complete OTA: {}", e)
                    });
                    send_json_response(&mut req, 500, &response);
                }
            }
            Ok(())
        })?;
    }

    {
        server.fn_handler("/api/ota/cancel", Method::Post, move |mut req| {
            info!("Cancelling OTA update");
            match cancel_ota_update() {
                Ok(_) => {
                    let response = json!({
                        "success": true,
                        "message": "OTA update cancelled"
                    });
                    send_json_response(&mut req, 200, &response);
                }
                Err(e) => {
                    let response = json!({
                        "success": false,
                        "error": format!("Failed to cancel OTA: {}", e)
                    });
                    send_json_response(&mut req, 500, &response);
                }
            }
            Ok(())
        })?;
    }

    Ok(server)
}

#[esp_idf_hal::main]
fn main() -> ! {
    setup_logger();
    
    info!("ESP32 Rust Web Server Starting...");
    
    let peripherals = Peripherals::take().unwrap();
    let gpio_drivers = initialize_gpios(&peripherals);
    
    init_sd_card();
    
    let state = Arc::new(AppState {
        gpio_drivers: Mutex::new(gpio_drivers),
        wifi_config: Mutex::new(None),
        sensor_data: Mutex::new(None),
        dht11_pin: Mutex::new(None),
        sd_card_info: Mutex::new(SdCardInfo::default()),
    });
    
    let sysloop = EspSystemEventLoop::take().unwrap();
    let nvs = EspDefaultNvsPartition::take().unwrap();
    let modem = esp_idf_hal::modem::Modem::new();
    
    let wifi = EspWifi::new(modem, sysloop.clone(), Some(nvs)).unwrap();
    let mut wifi = BlockingWifi::wrap(wifi, sysloop).unwrap();
    
    if let Some(saved_config) = load_wifi_config_from_nvs() {
        info!("Using saved WiFi config");
        *state.wifi_config.lock().unwrap() = Some(saved_config.clone());
        if let Err(e) = connect_to_wifi(&mut wifi, &saved_config) {
            error!("Failed to connect to saved WiFi: {}. Starting SoftAP.", e);
            start_soft_ap(&mut wifi).unwrap();
        }
    } else {
        info!("No WiFi config found. Starting SoftAP mode.");
        start_soft_ap(&mut wifi).unwrap();
    }
    
    loop {
        if let Err(e) = create_http_server(Arc::clone(&state)) {
            error!("HTTP server error: {}", e);
        }
        info!("HTTP server stopped. Restarting...");
        std::thread::sleep(Duration::from_secs(1));
    }
}
