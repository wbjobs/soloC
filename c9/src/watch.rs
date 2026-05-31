use anyhow::{Context, Result};
use notify::{RecursiveMode, Watcher};
use notify_debouncer_mini::new_debouncer;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::UNIX_EPOCH;
use tokio::sync::{mpsc, Mutex};

use crate::cli::WatchArgs;
use crate::ssh::{FileType, RemoteFile, RemotePath, SshClient};
use crate::sync::{SyncManifest, load_manifest};

#[derive(Debug, Clone)]
pub enum ConflictStrategy {
    Newest,
    Local,
    Remote,
    Ask,
}

impl ConflictStrategy {
    pub fn from_str(s: &str) -> Self {
        match s {
            "local" => ConflictStrategy::Local,
            "remote" => ConflictStrategy::Remote,
            "ask" => ConflictStrategy::Ask,
            _ => ConflictStrategy::Newest,
        }
    }
}

enum SyncEvent {
    LocalFileChanged(PathBuf),
    LocalFileCreated(PathBuf),
    LocalFileDeleted(PathBuf),
    RemoteChanged,
}

#[derive(Debug, Clone)]
struct FileState {
    local_modified: u64,
    local_size: u64,
    remote_modified: u64,
    remote_size: u64,
}

struct SyncContext {
    local_root: PathBuf,
    manifest: SyncManifest,
    client: Arc<Mutex<SshClient>>,
    file_states: Arc<Mutex<HashMap<PathBuf, FileState>>>,
    conflict_strategy: ConflictStrategy,
}

pub async fn run_watch(args: &WatchArgs) -> Result<()> {
    let local_root = PathBuf::from(&args.local);
    
    if !local_root.exists() {
        return Err(anyhow::anyhow!(
            "Local directory does not exist: {}",
            local_root.display()
        ));
    }
    
    let manifest = load_manifest(&local_root)?
        .context("No manifest found. Please run 'sync' first")?;
    
    let remote = RemotePath {
        user: manifest.remote.user.clone(),
        host: manifest.remote.host.clone(),
        port: manifest.remote.port,
        path: manifest.remote.path.clone(),
    };
    
    let conflict_strategy = ConflictStrategy::from_str(&args.conflict);
    let poll_interval = std::time::Duration::from_secs(args.interval);
    
    println!("=== RemoteFS Watch ===");
    println!("Local: {}", local_root.display());
    println!("Remote: {}@{}:{}", remote.user, remote.host, remote.port);
    println!("Remote path: {}", remote.path);
    println!("Conflict strategy: {:?}", conflict_strategy);
    println!("Poll interval: {}s", args.interval);
    println!();
    println!("Watching for changes... (Press Ctrl+C to stop)");
    println!();
    
    let (event_tx, event_rx) = mpsc::channel::<SyncEvent>(100);
    
    let client = Arc::new(Mutex::new(SshClient::connect(&remote)?));
    let file_states = Arc::new(Mutex::new(HashMap::<PathBuf, FileState>::new()));
    
    initialize_file_states(&local_root, &manifest, &file_states).await?;
    
    let ctx = SyncContext {
        local_root: local_root.clone(),
        manifest: manifest.clone(),
        client: client.clone(),
        file_states: file_states.clone(),
        conflict_strategy: conflict_strategy.clone(),
    };
    
    let watcher_task = tokio::spawn(start_local_watcher(
        local_root.clone(),
        event_tx.clone(),
    ));
    
    let poller_task = tokio::spawn(start_remote_poller(
        event_tx.clone(),
        poll_interval,
    ));
    
    let sync_task = tokio::spawn(sync_loop(event_rx, ctx));
    
    tokio::signal::ctrl_c().await?;
    
    println!("\nStopping watch...");
    
    Ok(())
}

async fn initialize_file_states(
    local_root: &Path,
    manifest: &SyncManifest,
    file_states: &Arc<Mutex<HashMap<PathBuf, FileState>>>,
) -> Result<()> {
    let mut states = file_states.lock().await;
    
    for (rel_path, metadata) in &manifest.files {
        let local_path = local_root.join(rel_path.replace('/', std::path::MAIN_SEPARATOR_STR));
        
        let (local_modified, local_size) = get_local_file_info(&local_path);
        let remote_modified = metadata.modified.unwrap_or(0);
        let remote_size = metadata.size;
        
        states.insert(
            local_path.clone(),
            FileState {
                local_modified,
                local_size,
                remote_modified,
                remote_size,
            },
        );
    }
    
    Ok(())
}

fn get_local_file_info(path: &Path) -> (u64, u64) {
    if let Ok(metadata) = std::fs::metadata(path) {
        let modified = metadata
            .modified()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_secs())
            .unwrap_or(0);
        (modified, metadata.len())
    } else {
        (0, 0)
    }
}

async fn start_local_watcher(local_root: PathBuf, event_tx: mpsc::Sender<SyncEvent>) -> Result<()> {
    let (tx, mut rx) = mpsc::channel::<notify_debouncer_mini::DebouncedEvent>(100);
    
    let mut debouncer = new_debouncer(
        std::time::Duration::from_millis(500),
        move |res: Result<Vec<notify_debouncer_mini::DebouncedEvent>, notify::Error>| {
            if let Ok(events) = res {
                for event in events {
                    let path = event.path.clone();
                    if path.file_name()
                        .and_then(|n| n.to_str())
                        .map(|n| n.starts_with('.'))
                        .unwrap_or(false)
                    {
                        continue;
                    }
                    let _ = tx.blocking_send(event);
                }
            }
        },
    )?;
    
    debouncer
        .watcher()
        .watch(&local_root, RecursiveMode::Recursive)?;
    
    println!("[Local] Local watcher started");
    
    while let Some(event) = rx.recv().await {
        let sync_event = match event.kind {
            notify_debouncer_mini::DebouncedEventKind::Create => SyncEvent::LocalFileCreated(event.path),
            notify_debouncer_mini::DebouncedEventKind::Modify => SyncEvent::LocalFileChanged(event.path),
            notify_debouncer_mini::DebouncedEventKind::Remove => SyncEvent::LocalFileDeleted(event.path),
            _ => continue,
        };
        let _ = event_tx.send(sync_event).await;
    }
    
    Ok(())
}

async fn start_remote_poller(
    event_tx: mpsc::Sender<SyncEvent>,
    interval: std::time::Duration,
) -> Result<()> {
    println!("[Remote] Poller started (interval: {:?})", interval);
    
    loop {
        tokio::time::sleep(interval).await;
        let _ = event_tx.send(SyncEvent::RemoteChanged).await;
    }
}

async fn sync_loop(mut event_rx: mpsc::Receiver<SyncEvent>, ctx: SyncContext) -> Result<()> {
    while let Some(event) = event_rx.recv().await {
        match event {
            SyncEvent::LocalFileChanged(path) => {
                handle_local_change(&ctx, &path).await?;
            }
            SyncEvent::LocalFileCreated(path) => {
                handle_local_create(&ctx, &path).await?;
            }
            SyncEvent::LocalFileDeleted(path) => {
                handle_local_delete(&ctx, &path).await?;
            }
            SyncEvent::RemoteChanged => {
                handle_remote_poll(&ctx).await?;
            }
        }
    }
    Ok(())
}

fn to_remote_path(ctx: &SyncContext, rel_str: &str) -> String {
    format!(
        "{}/{}",
        ctx.manifest.remote.path.trim_end_matches('/'),
        rel_str
    )
}

async fn handle_local_change(ctx: &SyncContext, path: &Path) -> Result<()> {
    if !path.exists() {
        return Ok(());
    }
    
    let rel_path = path.strip_prefix(&ctx.local_root)?;
    let rel_str = rel_path.to_string_lossy().replace(std::path::MAIN_SEPARATOR, "/");
    let remote_path = to_remote_path(ctx, &rel_str);
    
    let is_dir = path.is_dir();
    
    let states = ctx.file_states.lock().await;
    let prev_state = states.get(path).cloned();
    drop(states);
    
    let (local_modified, local_size) = get_local_file_info(path);
    
    if let Some(prev) = prev_state {
        if local_modified == prev.local_modified && local_size == prev.local_size {
            return Ok(());
        }
    }
    
    if is_dir {
        println!("[Sync] Directory changed: {}", rel_str);
        sync_directory(ctx, path).await?;
    } else {
        println!("[Sync] File changed: {}", rel_str);
        
        let content = tokio::fs::read(path).await?;
        
        let mut client_lock = ctx.client.lock().await;
        client_lock.write_file(&remote_path, &content)?;
        drop(client_lock);
        
        let mut states = ctx.file_states.lock().await;
        states.insert(
            path.to_path_buf(),
            FileState {
                local_modified,
                local_size,
                remote_modified: local_modified,
                remote_size: local_size,
            },
        );
        
        println!("[Sync] Uploaded: {}", remote_path);
    }
    
    Ok(())
}

async fn sync_directory(ctx: &SyncContext, dir_path: &Path) -> Result<()> {
    let rel_path = dir_path.strip_prefix(&ctx.local_root)?;
    let rel_str = rel_path.to_string_lossy().replace(std::path::MAIN_SEPARATOR, "/");
    
    let mut entries = tokio::fs::read_dir(dir_path).await?;
    
    while let Some(entry) = entries.next_entry().await? {
        let entry_path = entry.path();
        let entry_name = entry.file_name();
        let entry_name_str = entry_name.to_string_lossy();
        
        if entry_name_str.starts_with('.') {
            continue;
        }
        
        let entry_rel = if rel_str.is_empty() {
            entry_name_str.to_string()
        } else {
            format!("{}/{}", rel_str, entry_name_str)
        };
        
        let metadata = entry.metadata().await?;
        
        if metadata.is_dir() {
            sync_directory(ctx, &entry_path).await?;
        } else {
            let content = tokio::fs::read(&entry_path).await?;
            let remote_file_path = to_remote_path(ctx, &entry_rel);
            
            let mut client_lock = ctx.client.lock().await;
            client_lock.write_file(&remote_file_path, &content)?;
            drop(client_lock);
            
            println!("[Sync] Uploaded: {}", remote_file_path);
        }
    }
    
    Ok(())
}

async fn handle_local_create(ctx: &SyncContext, path: &Path) -> Result<()> {
    if !path.exists() {
        return Ok(());
    }
    
    let rel_path = path.strip_prefix(&ctx.local_root)?;
    let rel_str = rel_path.to_string_lossy().replace(std::path::MAIN_SEPARATOR, "/");
    
    let is_dir = path.is_dir();
    
    if is_dir {
        println!("[Sync] Directory created: {}", rel_str);
        let remote_dir = to_remote_path(ctx, &rel_str);
        let mut client_lock = ctx.client.lock().await;
        client_lock.create_dir(&remote_dir)?;
        drop(client_lock);
        sync_directory(ctx, path).await?;
    } else {
        println!("[Sync] File created: {}", rel_str);
        let remote_path = to_remote_path(ctx, &rel_str);
        let content = tokio::fs::read(path).await?;
        let mut client_lock = ctx.client.lock().await;
        client_lock.write_file(&remote_path, &content)?;
        drop(client_lock);
        
        let (local_modified, local_size) = get_local_file_info(path);
        let mut states = ctx.file_states.lock().await;
        states.insert(
            path.to_path_buf(),
            FileState {
                local_modified,
                local_size,
                remote_modified: local_modified,
                remote_size: local_size,
            },
        );
        
        println!("[Sync] Uploaded: {}", remote_path);
    }
    
    Ok(())
}

async fn handle_local_delete(ctx: &SyncContext, path: &Path) -> Result<()> {
    let rel_path = path.strip_prefix(&ctx.local_root)?;
    let rel_str = rel_path.to_string_lossy().replace(std::path::MAIN_SEPARATOR, "/");
    
    println!("[Sync] Deleted locally: {}", rel_str);
    
    let remote_path = to_remote_path(ctx, &rel_str);
    
    let mut client_lock = ctx.client.lock().await;
    
    let states = ctx.file_states.lock().await;
    let had_entry = states.contains_key(path);
    drop(states);
    
    if had_entry {
        let is_dir = if let Ok(meta) = std::fs::metadata(path) {
            meta.is_dir()
        } else {
            false
        };
        
        if is_dir {
            client_lock.delete_dir(&remote_path)?;
            println!("[Sync] Deleted remote directory: {}", remote_path);
        } else {
            client_lock.delete_file(&remote_path)?;
            println!("[Sync] Deleted remote file: {}", remote_path);
        }
    }
    
    drop(client_lock);
    
    let mut states = ctx.file_states.lock().await;
    states.remove(path);
    
    Ok(())
}

async fn handle_remote_poll(ctx: &SyncContext) -> Result<()> {
    println!("[Poll] Checking remote for changes...");
    
    let mut client_lock = ctx.client.lock().await;
    
    let remote_files = collect_remote_files(&mut client_lock, &ctx.manifest.remote.path)?;
    drop(client_lock);
    
    for (rel_path, remote_file) in remote_files {
        let local_path = ctx.local_root.join(&rel_path.replace('/', std::path::MAIN_SEPARATOR));
        
        let states = ctx.file_states.lock().await;
        let prev_state = states.get(&local_path).cloned();
        drop(states);
        
        let local_exists = local_path.exists();
        let (local_modified, local_size) = if local_exists {
            get_local_file_info(&local_path)
        } else {
            (0, 0)
        };
        
        let remote_modified = remote_file.modified.unwrap_or(0);
        let remote_size = remote_file.size;
        
        let needs_sync = if let Some(prev) = prev_state {
            remote_modified != prev.remote_modified || remote_size != prev.remote_size
        } else {
            !local_exists
        };
        
        if needs_sync {
            if !local_exists {
                println!("[Poll] New remote: {}", rel_path);
                download_remote_file(ctx, &rel_path, &remote_file).await?;
            } else {
                match ctx.conflict_strategy {
                    ConflictStrategy::Newest => {
                        if remote_modified > local_modified {
                            println!("[Poll] Remote newer: {}", rel_path);
                            download_remote_file(ctx, &rel_path, &remote_file).await?;
                        } else if local_modified > remote_modified {
                            println!("[Poll] Local newer, uploading: {}", rel_path);
                            let content = tokio::fs::read(&local_path).await?;
                            let mut client_lock = ctx.client.lock().await;
                            let remote_full = to_remote_path(ctx, &rel_path);
                            client_lock.write_file(&remote_full, &content)?;
                            drop(client_lock);
                        }
                    }
                    ConflictStrategy::Remote => {
                        println!("[Poll] Remote wins: {}", rel_path);
                        download_remote_file(ctx, &rel_path, &remote_file).await?;
                    }
                    ConflictStrategy::Local => {
                        println!("[Poll] Local wins, uploading: {}", rel_path);
                        let content = tokio::fs::read(&local_path).await?;
                        let mut client_lock = ctx.client.lock().await;
                        let remote_full = to_remote_path(ctx, &rel_path);
                        client_lock.write_file(&remote_full, &content)?;
                        drop(client_lock);
                    }
                    ConflictStrategy::Ask => {
                        println!("[Conflict] {}", rel_path);
                        println!("  Local: modified={}, size={}", local_modified, local_size);
                        println!("  Remote: modified={}, size={}", remote_modified, remote_size);
                        println!("  Using: newest (remote)");
                        download_remote_file(ctx, &rel_path, &remote_file).await?;
                    }
                }
            }
            
            let mut states = ctx.file_states.lock().await;
            states.insert(
                local_path,
                FileState {
                    local_modified: remote_modified,
                    local_size: remote_size,
                    remote_modified,
                    remote_size,
                },
            );
        }
    }
    
    Ok(())
}

fn collect_remote_files(
    client: &mut SshClient,
    remote_root: &str,
) -> Result<HashMap<String, RemoteFile>> {
    let mut result = HashMap::new();
    crawl_remote_recursive(client, remote_root, remote_root, &mut result)?;
    Ok(result)
}

fn crawl_remote_recursive(
    client: &mut SshClient,
    remote_root: &str,
    current_path: &str,
    result: &mut HashMap<String, RemoteFile>,
) -> Result<()> {
    let files = client.list_dir(current_path)?;
    
    for file in files {
        let rel_path = if current_path == remote_root {
            file.name.clone()
        } else {
            let trimmed = current_path.strip_prefix(remote_root).unwrap_or("");
            let trimmed = trimmed.trim_start_matches('/');
            if trimmed.is_empty() {
                file.name.clone()
            } else {
                format!("{}/{}", trimmed, file.name)
            }
        };
        
        result.insert(rel_path.clone(), file.clone());
        
        if file.file_type == FileType::Directory {
            let sub_path = if current_path.ends_with('/') {
                format!("{}{}", current_path, file.name)
            } else {
                format!("{}/{}", current_path, file.name)
            };
            crawl_remote_recursive(client, remote_root, &sub_path, result)?;
        }
    }
    
    Ok(())
}

async fn download_remote_file(
    ctx: &SyncContext,
    rel_path: &str,
    remote_file: &RemoteFile,
) -> Result<()> {
    let local_path = ctx.local_root.join(&rel_path.replace('/', std::path::MAIN_SEPARATOR));
    
    if remote_file.file_type == FileType::Directory {
        tokio::fs::create_dir_all(&local_path).await?;
        println!("[Download] Directory: {}", rel_path);
    } else {
        if let Some(parent) = local_path.parent() {
            tokio::fs::create_dir_all(parent).await?;
        }
        
        let mut client_lock = ctx.client.lock().await;
        let content = client_lock.read_file(&remote_file.path)?;
        drop(client_lock);
        
        tokio::fs::write(&local_path, &content).await?;
        println!("[Download] File: {} ({})", rel_path, format_size(remote_file.size));
    }
    
    Ok(())
}

fn format_size(size: u64) -> String {
    const KB: u64 = 1024;
    const MB: u64 = KB * 1024;
    const GB: u64 = MB * 1024;
    
    if size >= GB {
        format!("{:.1}G", size as f64 / GB as f64)
    } else if size >= MB {
        format!("{:.1}M", size as f64 / MB as f64)
    } else if size >= KB {
        format!("{:.1}K", size as f64 / KB as f64)
    } else {
        format!("{}B", size)
    }
}
