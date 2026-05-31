use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::sync::{mpsc, Mutex};

use crate::cli::SyncArgs;
use crate::config::Config;
use crate::ssh::{FileType, RemoteFile, RemotePath, SshClient};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileMetadata {
    pub name: String,
    pub remote_path: String,
    pub local_path: String,
    pub size: u64,
    pub permissions: String,
    pub file_type: FileType,
    pub modified: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncManifest {
    pub remote: RemotePathInfo,
    pub synced_at: u64,
    pub files: HashMap<String, FileMetadata>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemotePathInfo {
    pub user: String,
    pub host: String,
    pub port: u16,
    pub path: String,
}

pub async fn sync_remote(args: &SyncArgs) -> Result<()> {
    let config = Config::load()?;
    
    let remote = if let Some(host_config) = config.get_host(&args.remote) {
        RemotePath {
            user: host_config.user.clone(),
            host: host_config.host.clone(),
            port: host_config.port,
            path: host_config.path.clone().unwrap_or_else(|| "/".to_string()),
        }
    } else {
        RemotePath::parse(&args.remote, args.port)?
    };
    
    let local_root = PathBuf::from(&args.local);
    
    println!("Connecting to {}@{}:{}...", remote.user, remote.host, remote.port);
    println!("Syncing from: {}", remote.path);
    println!("To: {}", local_root.display());
    
    let client = Arc::new(Mutex::new(SshClient::connect(&remote)?));
    
    println!("Connection established. Starting sync...");
    
    let manifest = sync_recursive(client, &remote.path, &local_root, &remote).await?;
    
    save_manifest(&local_root, &manifest)?;
    
    println!("\nSync completed successfully!");
    println!("Total files synced: {}", manifest.files.len());
    println!("Manifest saved to: {}", local_root.join(".remotefs_manifest.toml").display());
    
    Ok(())
}

async fn sync_recursive(
    client: Arc<Mutex<SshClient>>,
    remote_path: &str,
    local_root: &Path,
    remote_info: &RemotePath,
) -> Result<SyncManifest> {
    let mut manifest = SyncManifest {
        remote: RemotePathInfo {
            user: remote_info.user.clone(),
            host: remote_info.host.clone(),
            port: remote_info.port,
            path: remote_info.path.clone(),
        },
        synced_at: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs(),
        files: HashMap::new(),
    };
    
    let (tx, mut rx) = mpsc::channel::<SyncMessage>(100);
    
    let tx_clone = tx.clone();
    let client_clone = client.clone();
    let remote_path_str = remote_path.to_string();
    
    tokio::spawn(async move {
        if let Err(e) = crawl_directory(&client_clone, &remote_path_str, tx_clone).await {
            eprintln!("Crawl error: {}", e);
        }
    });
    
    while let Some(msg) = rx.recv().await {
        match msg {
            SyncMessage::File(file, rel_path) => {
                let local_path = local_root.join(&rel_path);
                
                match file.file_type {
                    FileType::Directory => {
                        tokio::fs::create_dir_all(&local_path).await?;
                        println!("[DIR]  {}", rel_path);
                    }
                    FileType::File => {
                        if let Some(parent) = local_path.parent() {
                            tokio::fs::create_dir_all(parent).await?;
                        }
                        
                        let client_lock = client.lock().await;
                        let content = client_lock.read_file(&file.path)?;
                        drop(client_lock);
                        
                        tokio::fs::write(&local_path, &content).await?;
                        println!("[FILE] {} ({})", rel_path, format_size(file.size));
                    }
                    FileType::Symlink => {
                        println!("[LINK] {} (skipped)", rel_path);
                    }
                    FileType::Other => {
                        println!("[OTHER] {} (skipped)", rel_path);
                    }
                }
                
                let metadata = FileMetadata {
                    name: file.name.clone(),
                    remote_path: file.path.clone(),
                    local_path: local_path.to_string_lossy().to_string(),
                    size: file.size,
                    permissions: file.permissions_string().to_string(),
                    file_type: file.file_type.clone(),
                    modified: file.modified,
                };
                
                manifest.files.insert(rel_path, metadata);
            }
        }
    }
    
    Ok(manifest)
}

enum SyncMessage {
    File(RemoteFile, String),
}

async fn crawl_directory(
    client: &Arc<Mutex<SshClient>>,
    remote_path: &str,
    tx: mpsc::Sender<SyncMessage>,
) -> Result<()> {
    let client_lock = client.lock().await;
    let files = client_lock.list_dir(remote_path)?;
    drop(client_lock);
    
    for file in files {
        let rel_path = if remote_path == "/" {
            file.name.clone()
        } else {
            format!(
                "{}/{}",
                remote_path.trim_start_matches('/').trim_end_matches('/'),
                file.name
            )
        };
        
        tx.send(SyncMessage::File(file.clone(), rel_path.clone())).await?;
        
        if file.file_type == FileType::Directory {
            let sub_path = if remote_path.ends_with('/') {
                format!("{}{}", remote_path, file.name)
            } else {
                format!("{}/{}", remote_path, file.name)
            };
            
            crawl_directory(client, &sub_path, tx.clone()).await?;
        }
    }
    
    Ok(())
}

fn save_manifest(local_root: &Path, manifest: &SyncManifest) -> Result<()> {
    let manifest_path = local_root.join(".remotefs_manifest.toml");
    let content = toml::to_string_pretty(manifest)?;
    std::fs::write(&manifest_path, content)
        .with_context(|| format!("Failed to write manifest: {:?}", manifest_path))?;
    Ok(())
}

pub fn load_manifest(local_root: &Path) -> Result<Option<SyncManifest>> {
    let manifest_path = local_root.join(".remotefs_manifest.toml");
    if !manifest_path.exists() {
        return Ok(None);
    }
    
    let content = std::fs::read_to_string(&manifest_path)
        .with_context(|| format!("Failed to read manifest: {:?}", manifest_path))?;
    
    let manifest: SyncManifest = toml::from_str(&content)?;
    Ok(Some(manifest))
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
