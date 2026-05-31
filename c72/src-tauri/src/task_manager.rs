use std::collections::VecDeque;
use std::sync::{Arc, Mutex};
use serde::{Serialize, Deserialize};
use tauri::Window;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum TaskPriority {
    Low = 0,
    Normal = 1,
    High = 2,
    Urgent = 3,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum TaskStatus {
    Pending,
    Running,
    Paused,
    Completed,
    Failed,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskConfig {
    pub target_x: i32,
    pub target_y: i32,
    pub target_width: i32,
    pub target_height: i32,
    pub start_frame: usize,
    pub output_path: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ProcessingTask {
    pub id: String,
    pub name: String,
    pub input_path: String,
    pub config: TaskConfig,
    pub priority: TaskPriority,
    pub status: TaskStatus,
    pub progress: f64,
    pub current_frame: usize,
    pub total_frames: usize,
    pub error_message: Option<String>,
    pub created_at: u64,
    pub started_at: Option<u64>,
    pub completed_at: Option<u64>,
}

impl ProcessingTask {
    fn new(id: String, name: String, input_path: String, config: TaskConfig, priority: TaskPriority) -> Self {
        Self {
            id,
            name,
            input_path,
            config,
            priority,
            status: TaskStatus::Pending,
            progress: 0.0,
            current_frame: 0,
            total_frames: 0,
            error_message: None,
            created_at: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs(),
            started_at: None,
            completed_at: None,
        }
    }
}

#[derive(Clone)]
pub struct TaskManager {
    tasks: Arc<Mutex<Vec<ProcessingTask>>>,
    queue: Arc<Mutex<VecDeque<String>>>,
    running_tasks: Arc<Mutex<usize>>,
    max_concurrent: usize,
    is_paused: Arc<Mutex<bool>>,
}

impl TaskManager {
    pub fn new() -> Self {
        Self {
            tasks: Arc::new(Mutex::new(Vec::new())),
            queue: Arc::new(Mutex::new(VecDeque::new())),
            running_tasks: Arc::new(Mutex::new(0)),
            max_concurrent: 2,
            is_paused: Arc::new(Mutex::new(false)),
        }
    }

    pub fn add_task(&self, name: String, input_path: String, config: TaskConfig, priority: TaskPriority) -> String {
        let task_id = uuid::Uuid::new_v4().to_string();
        let task = ProcessingTask::new(task_id.clone(), name, input_path, config, priority);

        let mut tasks = self.tasks.lock().unwrap();
        tasks.push(task);

        let mut queue = self.queue.lock().unwrap();
        let insert_pos = queue.iter()
            .position(|id| {
                let t = tasks.iter().find(|x| &x.id == id).unwrap();
                (t.priority as u8) < (priority as u8)
            })
            .unwrap_or(queue.len());
        queue.insert(insert_pos, task_id.clone());

        drop(queue);
        drop(tasks);

        self.try_process_next();

        task_id
    }

    pub fn cancel_task(&self, task_id: &str) -> bool {
        let mut tasks = self.tasks.lock().unwrap();
        if let Some(task) = tasks.iter_mut().find(|t| t.id == task_id) {
            if task.status == TaskStatus::Pending || task.status == TaskStatus::Paused {
                task.status = TaskStatus::Cancelled;
                let mut queue = self.queue.lock().unwrap();
                queue.retain(|id| id != task_id);
                return true;
            }
        }
        false
    }

    pub fn remove_task(&self, task_id: &str) -> bool {
        let mut tasks = self.tasks.lock().unwrap();
        let pos = tasks.iter().position(|t| t.id == task_id);
        if let Some(pos) = pos {
            let task = &tasks[pos];
            if matches!(task.status, TaskStatus::Completed | TaskStatus::Failed | TaskStatus::Cancelled) {
                tasks.remove(pos);
                let mut queue = self.queue.lock().unwrap();
                queue.retain(|id| id != task_id);
                return true;
            }
        }
        false
    }

    pub fn pause_queue(&self) {
        *self.is_paused.lock().unwrap() = true;
    }

    pub fn resume_queue(&self) {
        *self.is_paused.lock().unwrap() = false;
        self.try_process_next();
    }

    pub fn pause_task(&self, task_id: &str) -> bool {
        let mut tasks = self.tasks.lock().unwrap();
        if let Some(task) = tasks.iter_mut().find(|t| t.id == task_id) {
            if task.status == TaskStatus::Running {
                task.status = TaskStatus::Paused;
                return true;
            }
        }
        false
    }

    pub fn resume_task(&self, task_id: &str) -> bool {
        let mut tasks = self.tasks.lock().unwrap();
        if let Some(task) = tasks.iter_mut().find(|t| t.id == task_id) {
            if task.status == TaskStatus::Paused {
                task.status = TaskStatus::Pending;
                let mut queue = self.queue.lock().unwrap();
                if !queue.contains(&task.id) {
                    queue.push_front(task.id.clone());
                }
                drop(queue);
                drop(tasks);
                self.try_process_next();
                return true;
            }
        }
        false
    }

    pub fn set_task_priority(&self, task_id: &str, new_priority: TaskPriority) -> bool {
        let mut tasks = self.tasks.lock().unwrap();
        if let Some(task) = tasks.iter_mut().find(|t| t.id == task_id) {
            if task.status == TaskStatus::Pending {
                task.priority = new_priority;
                self.reorder_queue(&mut tasks);
                return true;
            }
        }
        false
    }

    fn reorder_queue(&self, tasks: &mut Vec<ProcessingTask>) {
        let mut queue = self.queue.lock().unwrap();
        let mut queue_vec: Vec<_> = queue.iter().cloned().collect();
        queue_vec.sort_by(|a, b| {
            let ta = tasks.iter().find(|t| &t.id == a).unwrap();
            let tb = tasks.iter().find(|t| &t.id == b).unwrap();
            (tb.priority as u8).cmp(&(ta.priority as u8))
        });
        *queue = VecDeque::from(queue_vec);
    }

    pub fn get_all_tasks(&self) -> Vec<ProcessingTask> {
        self.tasks.lock().unwrap().clone()
    }

    pub fn get_task(&self, task_id: &str) -> Option<ProcessingTask> {
        self.tasks.lock().unwrap().iter().find(|t| t.id == task_id).cloned()
    }

    pub fn clear_completed(&self) -> usize {
        let mut tasks = self.tasks.lock().unwrap();
        let initial_len = tasks.len();
        tasks.retain(|t| !matches!(t.status, TaskStatus::Completed | TaskStatus::Failed | TaskStatus::Cancelled));
        initial_len - tasks.len()
    }

    fn try_process_next(&self) {
        if *self.is_paused.lock().unwrap() {
            return;
        }

        let mut running = self.running_tasks.lock().unwrap();
        if *running >= self.max_concurrent {
            return;
        }

        let mut queue = self.queue.lock().unwrap();
        let task_id = match queue.pop_front() {
            Some(id) => id,
            None => return,
        };

        let mut tasks = self.tasks.lock().unwrap();
        let task = match tasks.iter_mut().find(|t| t.id == task_id) {
            Some(t) if t.status == TaskStatus::Pending => t,
            _ => return,
        };

        task.status = TaskStatus::Running;
        task.started_at = Some(std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs());

        *running += 1;
        let task_id = task.id.clone();
        let input_path = task.input_path.clone();
        let config = task.config.clone();
        let total_frames = task.total_frames;

        drop(tasks);
        drop(queue);
        drop(running);

        let tasks_clone = Arc::clone(&self.tasks);
        let running_clone = Arc::clone(&self.running_tasks);
        let self_clone = self.clone();

        std::thread::spawn(move || {
            Self::process_task(task_id, input_path, config, total_frames, tasks_clone, running_clone, self_clone);
        });
    }

    fn process_task(
        task_id: String,
        input_path: String,
        config: TaskConfig,
        _total_frames: usize,
        tasks: Arc<Mutex<Vec<ProcessingTask>>>,
        running_count: Arc<Mutex<usize>>,
        manager: TaskManager,
    ) {
        use crate::video_processor::VideoProcessor;

        let result = || -> Result<(), String> {
            let mut processor = VideoProcessor::new(&input_path).map_err(|e| e.to_string())?;
            let metadata = processor.get_video_metadata();

            {
                let mut tasks = tasks.lock().unwrap();
                if let Some(task) = tasks.iter_mut().find(|t| t.id == task_id) {
                    task.total_frames = metadata.total_frames;
                }
            }

            processor.set_target(
                crate::video_processor::TargetRegion {
                    x: config.target_x,
                    y: config.target_y,
                    width: config.target_width,
                    height: config.target_height,
                },
                config.start_frame,
            ).map_err(|e| e.to_string())?;

            let dummy_window = DummyWindow;
            processor.start_processing(&config.output_path, dummy_window).map_err(|e| e.to_string())?;

            Ok(())
        }();

        let mut tasks = tasks.lock().unwrap();
        if let Some(task) = tasks.iter_mut().find(|t| t.id == task_id) {
            match result {
                Ok(_) => {
                    task.status = TaskStatus::Completed;
                    task.progress = 100.0;
                    task.completed_at = Some(std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap()
                        .as_secs());
                }
                Err(e) => {
                    task.status = TaskStatus::Failed;
                    task.error_message = Some(e);
                }
            }
        }

        let mut running = running_count.lock().unwrap();
        *running -= 1;
        drop(running);
        drop(tasks);

        manager.try_process_next();
    }

    pub fn update_task_progress(&self, task_id: &str, current_frame: usize, total_frames: usize) {
        let mut tasks = self.tasks.lock().unwrap();
        if let Some(task) = tasks.iter_mut().find(|t| t.id == task_id) {
            task.current_frame = current_frame;
            task.total_frames = total_frames;
            task.progress = (current_frame as f64 / total_frames as f64) * 100.0;
        }
    }

    pub fn get_queue_stats(&self) -> QueueStats {
        let tasks = self.tasks.lock().unwrap();
        QueueStats {
            pending: tasks.iter().filter(|t| t.status == TaskStatus::Pending).count(),
            running: tasks.iter().filter(|t| t.status == TaskStatus::Running).count(),
            completed: tasks.iter().filter(|t| t.status == TaskStatus::Completed).count(),
            failed: tasks.iter().filter(|t| t.status == TaskStatus::Failed).count(),
            paused: tasks.iter().filter(|t| t.status == TaskStatus::Paused).count(),
            total: tasks.len(),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct QueueStats {
    pub pending: usize,
    pub running: usize,
    pub completed: usize,
    pub failed: usize,
    pub paused: usize,
    pub total: usize,
}

struct DummyWindow;

impl tauri::WindowEvent for DummyWindow {
    fn on_window_event(&self, _event: &tauri::WindowEvent) {}
}