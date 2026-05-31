#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

pub mod audio;
pub mod database;
pub mod entity;
pub mod migration;
pub mod models;
pub mod plugin_host;

use audio::AudioEngine;
use database::DatabaseService;
use models::{
    AudioDevice, ChannelLevels, CreateRoutingRequest, CreateSceneRequest, PluginInfo,
    RegisterPluginRequest, RoutingConfig, RoutingPluginConfig, RoutingState, Scene,
    UpdateSceneRequest,
};
use parking_lot::RwLock;
use plugin_host::PluginHost;
use std::sync::Arc;
use tauri::Manager;

struct AppState {
    audio_engine: Arc<RwLock<AudioEngine>>,
    database: Arc<DatabaseService>,
    runtime: tokio::runtime::Runtime,
    plugin_host: Arc<PluginHost>,
}

#[tauri::command]
fn list_audio_devices(state: tauri::State<'_, AppState>) -> Result<Vec<AudioDevice>, String> {
    state
        .audio_engine
        .write()
        .list_devices()
        .map_err(|e| format!("获取设备列表失败: {}", e))
}

#[tauri::command]
fn get_routings(state: tauri::State<'_, AppState>) -> Result<Vec<RoutingConfig>, String> {
    state
        .runtime
        .block_on(state.database.get_all_routings())
        .map_err(|e| format!("获取路由配置失败: {}", e))
}

#[tauri::command]
fn create_routing(
    state: tauri::State<'_, AppState>,
    routing: CreateRoutingRequest,
) -> Result<RoutingConfig, String> {
    let new_routing = RoutingConfig {
        id: uuid::Uuid::new_v4().to_string(),
        name: routing.name,
        input_device_id: routing.input_device_id,
        input_channels: routing.input_channels,
        output_device_id: routing.output_device_id,
        output_channels: routing.output_channels,
        gain: routing.gain,
        lowpass_cutoff: routing.lowpass_cutoff,
        enabled: routing.enabled,
    };

    state
        .runtime
        .block_on(state.database.create_routing(&new_routing))
        .map_err(|e| format!("创建路由失败: {}", e))
}

#[tauri::command]
fn update_routing(
    state: tauri::State<'_, AppState>,
    routing: RoutingConfig,
) -> Result<RoutingConfig, String> {
    state
        .runtime
        .block_on(state.database.update_routing(&routing))
        .map_err(|e| format!("更新路由失败: {}", e))
}

#[tauri::command]
fn delete_routing(state: tauri::State<'_, AppState>, id: String) -> Result<(), String> {
    state
        .runtime
        .block_on(state.database.delete_routing(&id))
        .map_err(|e| format!("删除路由失败: {}", e))
}

#[tauri::command]
fn start_audio(
    state: tauri::State<'_, AppState>,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    let routings = state
        .runtime
        .block_on(state.database.get_all_routings())
        .map_err(|e| format!("获取路由配置失败: {}", e))?;

    let sample_rate = 48000.0;
    let routing_states: Vec<RoutingState> = routings
        .into_iter()
        .map(|r| RoutingState::new(r, sample_rate))
        .collect();

    let (sender, receiver) = crossbeam_channel::unbounded::<Vec<ChannelLevels>>();

    {
        let mut engine = state.audio_engine.write();
        engine.set_level_sender(sender);
        engine
            .start(routing_states)
            .map_err(|e| format!("启动音频失败: {}", e))?;
    }

    let app_handle_clone = app_handle.clone();
    std::thread::spawn(move || {
        while let Ok(levels) = receiver.recv() {
            let _ = app_handle_clone.emit("channel_levels", levels.clone());
        }
    });

    Ok(())
}

#[tauri::command]
fn stop_audio(state: tauri::State<'_, AppState>) -> Result<(), String> {
    let mut engine = state.audio_engine.write();
    engine.stop();
    Ok(())
}

#[tauri::command]
fn is_audio_running(state: tauri::State<'_, AppState>) -> bool {
    state.audio_engine.read().is_running()
}

#[tauri::command]
fn set_routing_gain(
    state: tauri::State<'_, AppState>,
    routing_id: String,
    gain: f32,
) -> Result<(), String> {
    state
        .runtime
        .block_on(state.database.update_gain(&routing_id, gain))
        .map_err(|e| format!("更新增益失败: {}", e))?;

    let engine = state.audio_engine.read();
    engine.update_routing_gain(&routing_id, gain);

    Ok(())
}

#[tauri::command]
fn set_routing_lowpass(
    state: tauri::State<'_, AppState>,
    routing_id: String,
    cutoff: f32,
) -> Result<(), String> {
    state
        .runtime
        .block_on(state.database.update_lowpass(&routing_id, cutoff))
        .map_err(|e| format!("更新低通滤波器失败: {}", e))?;

    let engine = state.audio_engine.read();
    engine.update_routing_lowpass(&routing_id, cutoff, 48000.0);

    Ok(())
}

#[tauri::command]
fn toggle_routing(
    state: tauri::State<'_, AppState>,
    routing_id: String,
    enabled: bool,
) -> Result<(), String> {
    state
        .runtime
        .block_on(state.database.toggle_routing(&routing_id, enabled))
        .map_err(|e| format!("切换路由失败: {}", e))?;

    let engine = state.audio_engine.read();
    engine.toggle_routing(&routing_id, enabled);

    Ok(())
}

#[tauri::command]
fn get_scenes(state: tauri::State<'_, AppState>) -> Result<Vec<Scene>, String> {
    state
        .runtime
        .block_on(state.database.get_all_scenes())
        .map_err(|e| format!("获取场景列表失败: {}", e))
}

#[tauri::command]
fn get_default_scene(state: tauri::State<'_, AppState>) -> Result<Option<Scene>, String> {
    state
        .runtime
        .block_on(state.database.get_default_scene())
        .map_err(|e| format!("获取默认场景失败: {}", e))
}

#[tauri::command]
fn create_scene(
    state: tauri::State<'_, AppState>,
    request: CreateSceneRequest,
) -> Result<Scene, String> {
    state
        .runtime
        .block_on(
            state
                .database
                .create_scene(request.name, request.description, request.routings),
        )
        .map_err(|e| format!("创建场景失败: {}", e))
}

#[tauri::command]
fn update_scene(
    state: tauri::State<'_, AppState>,
    request: UpdateSceneRequest,
) -> Result<Scene, String> {
    state
        .runtime
        .block_on(state.database.update_scene(request))
        .map_err(|e| format!("更新场景失败: {}", e))
}

#[tauri::command]
fn delete_scene(state: tauri::State<'_, AppState>, id: String) -> Result<(), String> {
    state
        .runtime
        .block_on(state.database.delete_scene(&id))
        .map_err(|e| format!("删除场景失败: {}", e))
}

#[tauri::command]
fn apply_scene(
    state: tauri::State<'_, AppState>,
    scene_id: String,
) -> Result<Vec<RoutingConfig>, String> {
    let routings = state
        .runtime
        .block_on(state.database.load_scene_routings(&scene_id))
        .map_err(|e| format!("加载场景失败: {}", e))?;

    state
        .runtime
        .block_on(state.database.replace_all_routings(&routings))
        .map_err(|e| format!("应用场景失败: {}", e))?;

    Ok(routings)
}

#[tauri::command]
fn set_default_scene(
    state: tauri::State<'_, AppState>,
    scene_id: String,
) -> Result<(), String> {
    state
        .runtime
        .block_on(state.database.set_default_scene(&scene_id))
        .map_err(|e| format!("设置默认场景失败: {}", e))
}

#[tauri::command]
fn save_current_as_scene(
    state: tauri::State<'_, AppState>,
    name: String,
    description: Option<String>,
) -> Result<Scene, String> {
    let current_routings = state
        .runtime
        .block_on(state.database.get_all_routings())
        .map_err(|e| format!("获取当前路由失败: {}", e))?;

    state
        .runtime
        .block_on(
            state
                .database
                .create_scene(name, description, current_routings),
        )
        .map_err(|e| format!("保存场景失败: {}", e))
}

#[tauri::command]
fn get_plugins(state: tauri::State<'_, AppState>) -> Result<Vec<PluginInfo>, String> {
    state
        .runtime
        .block_on(state.database.get_all_plugins())
        .map_err(|e| format!("获取插件列表失败: {}", e))
}

#[tauri::command]
fn register_plugin(
    state: tauri::State<'_, AppState>,
    request: RegisterPluginRequest,
) -> Result<PluginInfo, String> {
    let plugin_info = state
        .runtime
        .block_on(state.database.register_plugin(request))
        .map_err(|e| format!("注册插件失败: {}", e))?;

    state
        .plugin_host
        .register_plugin(&plugin_info)
        .map_err(|e| format!("加载插件失败: {}", e))?;

    Ok(plugin_info)
}

#[tauri::command]
fn unregister_plugin(
    state: tauri::State<'_, AppState>,
    plugin_id: String,
) -> Result<(), String> {
    state.plugin_host.unregister_plugin(&plugin_id);

    state
        .runtime
        .block_on(state.database.unregister_plugin(&plugin_id))
        .map_err(|e| format!("卸载插件失败: {}", e))
}

#[tauri::command]
fn get_routing_plugins(
    state: tauri::State<'_, AppState>,
    routing_id: String,
) -> Result<Vec<RoutingPluginConfig>, String> {
    state
        .runtime
        .block_on(state.database.get_routing_plugins(&routing_id))
        .map_err(|e| format!("获取路由插件失败: {}", e))
}

#[tauri::command]
fn add_plugin_to_routing(
    state: tauri::State<'_, AppState>,
    routing_id: String,
    plugin_id: String,
    position: i32,
) -> Result<RoutingPluginConfig, String> {
    state
        .runtime
        .block_on(
            state
                .database
                .add_plugin_to_routing(&routing_id, &plugin_id, position),
        )
        .map_err(|e| format!("添加插件到路由失败: {}", e))
}

#[tauri::command]
fn remove_plugin_from_routing(
    state: tauri::State<'_, AppState>,
    routing_plugin_id: String,
) -> Result<(), String> {
    state
        .runtime
        .block_on(state.database.remove_plugin_from_routing(&routing_plugin_id))
        .map_err(|e| format!("从路由移除插件失败: {}", e))
}

#[tauri::command]
fn toggle_plugin_bypass(
    state: tauri::State<'_, AppState>,
    routing_plugin_id: String,
    bypassed: bool,
) -> Result<(), String> {
    state
        .runtime
        .block_on(
            state
                .database
                .update_plugin_bypass(&routing_plugin_id, bypassed),
        )
        .map_err(|e| format!("切换插件旁路状态失败: {}", e))
}

pub fn run() {
    let runtime = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .expect("无法创建Tokio运行时");

    let database = runtime.block_on(async {
        DatabaseService::new()
            .await
            .expect("无法初始化数据库")
    });

    let audio_engine = AudioEngine::new().expect("无法初始化音频引擎");
    let plugin_host = PluginHost::new();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(AppState {
            audio_engine: Arc::new(RwLock::new(audio_engine)),
            database: Arc::new(database),
            runtime,
            plugin_host: Arc::new(plugin_host),
        })
        .invoke_handler(tauri::generate_handler![
            list_audio_devices,
            get_routings,
            create_routing,
            update_routing,
            delete_routing,
            start_audio,
            stop_audio,
            is_audio_running,
            set_routing_gain,
            set_routing_lowpass,
            toggle_routing,
            get_scenes,
            get_default_scene,
            create_scene,
            update_scene,
            delete_scene,
            apply_scene,
            set_default_scene,
            save_current_as_scene,
            get_plugins,
            register_plugin,
            unregister_plugin,
            get_routing_plugins,
            add_plugin_to_routing,
            remove_plugin_from_routing,
            toggle_plugin_bypass,
        ])
        .run(tauri::generate_context!())
        .expect("运行Tauri应用时出错");
}
