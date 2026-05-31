mod video_processor;
mod task_manager;

use std::sync::Mutex;
use tauri::State;
use video_processor::{VideoProcessor, VideoMetadata, FrameTile, ProcessingState, TargetRegion};
use task_manager::{TaskManager, TaskPriority, TaskConfig, ProcessingTask, QueueStats};

struct AppState {
    processor: Mutex<Option<VideoProcessor>>,
    task_manager: Mutex<TaskManager>,
}

#[tauri::command]
async fn open_video(
    path: String,
    state: State<'_, AppState>,
) -> Result<VideoMetadata, String> {
    let mut processor = state.processor.lock().map_err(|e| e.to_string())?;
    let vp = VideoProcessor::new(&path).map_err(|e| e.to_string())?;
    let metadata = vp.get_video_metadata();
    *processor = Some(vp);
    Ok(metadata)
}

#[tauri::command]
async fn get_frame_tiles(
    frame_index: usize,
    state: State<'_, AppState>,
) -> Result<Vec<FrameTile>, String> {
    let mut processor = state.processor.lock().map_err(|e| e.to_string())?;
    if let Some(vp) = processor.as_mut() {
        vp.get_frame_tiles(frame_index).map_err(|e| e.to_string())
    } else {
        Err("视频未打开".to_string())
    }
}

#[tauri::command]
async fn get_frame(
    frame_index: usize,
    state: State<'_, AppState>,
) -> Result<Vec<u8>, String> {
    let mut processor = state.processor.lock().map_err(|e| e.to_string())?;
    if let Some(vp) = processor.as_mut() {
        vp.get_frame_data(frame_index).map_err(|e| e.to_string())
    } else {
        Err("视频未打开".to_string())
    }
}

#[tauri::command]
async fn set_target(
    x: i32,
    y: i32,
    width: i32,
    height: i32,
    start_frame: usize,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let mut processor = state.processor.lock().map_err(|e| e.to_string())?;
    if let Some(vp) = processor.as_mut() {
        let target = TargetRegion { x, y, width, height };
        vp.set_target(target, start_frame).map_err(|e| e.to_string())
    } else {
        Err("视频未打开".to_string())
    }
}

#[tauri::command]
async fn start_processing(
    output_path: String,
    state: State<'_, AppState>,
    window: tauri::Window,
) -> Result<(), String> {
    let mut processor = state.processor.lock().map_err(|e| e.to_string())?;
    if let Some(vp) = processor.as_mut() {
        vp.check_memory_safety().map_err(|e| e.to_string())?;
        vp.start_processing(&output_path, window).map_err(|e| e.to_string())
    } else {
        Err("视频未打开".to_string())
    }
}

#[tauri::command]
async fn get_processing_state(
    state: State<'_, AppState>,
) -> Result<ProcessingState, String> {
    let processor = state.processor.lock().map_err(|e| e.to_string())?;
    if let Some(vp) = processor.as_ref() {
        Ok(vp.get_processing_state())
    } else {
        Ok(ProcessingState::Idle)
    }
}

#[tauri::command]
async fn cancel_processing(
    state: State<'_, AppState>,
) -> Result<(), String> {
    let mut processor = state.processor.lock().map_err(|e| e.to_string())?;
    if let Some(vp) = processor.as_mut() {
        vp.cancel_processing();
        Ok(())
    } else {
        Err("视频未打开".to_string())
    }
}

#[tauri::command]
async fn add_task_to_queue(
    name: String,
    input_path: String,
    config: TaskConfig,
    priority: TaskPriority,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let task_manager = state.task_manager.lock().map_err(|e| e.to_string())?;
    Ok(task_manager.add_task(name, input_path, config, priority))
}

#[tauri::command]
async fn add_batch_tasks(
    tasks: Vec<(String, String, TaskConfig, TaskPriority)>,
    state: State<'_, AppState>,
) -> Result<Vec<String>, String> {
    let task_manager = state.task_manager.lock().map_err(|e| e.to_string())?;
    let mut task_ids = Vec::new();
    for (name, input_path, config, priority) in tasks {
        let id = task_manager.add_task(name, input_path, config, priority);
        task_ids.push(id);
    }
    Ok(task_ids)
}

#[tauri::command]
async fn cancel_task(
    task_id: String,
    state: State<'_, AppState>,
) -> Result<bool, String> {
    let task_manager = state.task_manager.lock().map_err(|e| e.to_string())?;
    Ok(task_manager.cancel_task(&task_id))
}

#[tauri::command]
async fn remove_task(
    task_id: String,
    state: State<'_, AppState>,
) -> Result<bool, String> {
    let task_manager = state.task_manager.lock().map_err(|e| e.to_string())?;
    Ok(task_manager.remove_task(&task_id))
}

#[tauri::command]
async fn pause_queue(
    state: State<'_, AppState>,
) -> Result<(), String> {
    let task_manager = state.task_manager.lock().map_err(|e| e.to_string())?;
    task_manager.pause_queue();
    Ok(())
}

#[tauri::command]
async fn resume_queue(
    state: State<'_, AppState>,
) -> Result<(), String> {
    let task_manager = state.task_manager.lock().map_err(|e| e.to_string())?;
    task_manager.resume_queue();
    Ok(())
}

#[tauri::command]
async fn pause_task(
    task_id: String,
    state: State<'_, AppState>,
) -> Result<bool, String> {
    let task_manager = state.task_manager.lock().map_err(|e| e.to_string())?;
    Ok(task_manager.pause_task(&task_id))
}

#[tauri::command]
async fn resume_task(
    task_id: String,
    state: State<'_, AppState>,
) -> Result<bool, String> {
    let task_manager = state.task_manager.lock().map_err(|e| e.to_string())?;
    Ok(task_manager.resume_task(&task_id))
}

#[tauri::command]
async fn set_task_priority(
    task_id: String,
    priority: TaskPriority,
    state: State<'_, AppState>,
) -> Result<bool, String> {
    let task_manager = state.task_manager.lock().map_err(|e| e.to_string())?;
    Ok(task_manager.set_task_priority(&task_id, priority))
}

#[tauri::command]
async fn get_all_tasks(
    state: State<'_, AppState>,
) -> Result<Vec<ProcessingTask>, String> {
    let task_manager = state.task_manager.lock().map_err(|e| e.to_string())?;
    Ok(task_manager.get_all_tasks())
}

#[tauri::command]
async fn get_queue_stats(
    state: State<'_, AppState>,
) -> Result<QueueStats, String> {
    let task_manager = state.task_manager.lock().map_err(|e| e.to_string())?;
    Ok(task_manager.get_queue_stats())
}

#[tauri::command]
async fn clear_completed_tasks(
    state: State<'_, AppState>,
) -> Result<usize, String> {
    let task_manager = state.task_manager.lock().map_err(|e| e.to_string())?;
    Ok(task_manager.clear_completed())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState {
            processor: Mutex::new(None),
            task_manager: Mutex::new(TaskManager::new()),
        })
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            open_video,
            get_frame_tiles,
            get_frame,
            set_target,
            start_processing,
            get_processing_state,
            cancel_processing,
            add_task_to_queue,
            add_batch_tasks,
            cancel_task,
            remove_task,
            pause_queue,
            resume_queue,
            pause_task,
            resume_task,
            set_task_priority,
            get_all_tasks,
            get_queue_stats,
            clear_completed_tasks,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}