use std::path::{Path, PathBuf};
use git2::{Repository, RepositoryInitOptions, Signature, StatusOptions, Commit, Tree};
use chrono::Utc;

use crate::models::{CommitInfo, FileHistory};

fn get_repo_path(root_dir: &str) -> Result<PathBuf, String> {
    Ok(PathBuf::from(root_dir))
}

pub fn is_git_repo(root_dir: &str) -> bool {
    let repo_path = match get_repo_path(root_dir) {
        Ok(p) => p,
        Err(_) => return false,
    };
    Repository::open(&repo_path).is_ok()
}

pub fn init_git_repo(root_dir: &str) -> Result<(), String> {
    let repo_path = get_repo_path(root_dir)?;
    
    if is_git_repo(root_dir) {
        return Ok(());
    }
    
    let mut opts = RepositoryInitOptions::new();
    opts.initial_head("main");
    
    Repository::init_opts(&repo_path, &opts)
        .map_err(|e| format!("Failed to initialize git repo: {}", e))?;
    
    let gitignore = repo_path.join(".gitignore");
    if !gitignore.exists() {
        std::fs::write(&gitignore, ".DS_Store\n*.pdf\n")
            .map_err(|e| format!("Failed to create .gitignore: {}", e))?;
    }
    
    Ok(())
}

fn get_repo(root_dir: &str) -> Result<Repository, String> {
    let repo_path = get_repo_path(root_dir)?;
    Repository::open(&repo_path).map_err(|e| e.to_string())
}

fn get_signature() -> Result<Signature<'static>, String> {
    Signature::now("Markdown KB", "user@markdown-kb.local")
        .map_err(|e| format!("Failed to create signature: {}", e))
}

pub fn has_uncommitted_changes(root_dir: &str) -> Result<bool, String> {
    if !is_git_repo(root_dir) {
        return Ok(false);
    }
    
    let repo = get_repo(root_dir)?;
    let mut opts = StatusOptions::new();
    opts.include_untracked(true);
    
    let statuses = repo.statuses(Some(&mut opts))
        .map_err(|e| e.to_string())?;
    
    Ok(!statuses.is_empty())
}

pub fn commit_changes(root_dir: &str, message: &str) -> Result<String, String> {
    if !is_git_repo(root_dir) {
        init_git_repo(root_dir)?;
    }
    
    let repo = get_repo(root_dir)?;
    let mut index = repo.index().map_err(|e| e.to_string())?;
    
    index.add_all(["*"].iter(), git2::IndexAddOption::DEFAULT, None)
        .map_err(|e| e.to_string())?;
    
    index.write().map_err(|e| e.to_string())?;
    
    let tree_id = index.write_tree().map_err(|e| e.to_string())?;
    let tree = repo.find_tree(tree_id).map_err(|e| e.to_string())?;
    
    let sig = get_signature()?;
    let message = if message.is_empty() {
        format!("Auto-commit at {}", Utc::now().format("%Y-%m-%d %H:%M:%S"))
    } else {
        message.to_string()
    };
    
    let parent_commit = match repo.head() {
        Ok(head) => Some(repo.find_commit(head.target().unwrap())
            .map_err(|e| e.to_string())?),
        Err(_) => None,
    };
    
    let parents: Vec<&Commit> = match &parent_commit {
        Some(c) => vec![c],
        None => vec![],
    };
    
    let oid = repo.commit(
        Some("HEAD"),
        &sig,
        &sig,
        &message,
        &tree,
        &parents,
    ).map_err(|e| e.to_string())?;
    
    Ok(oid.to_string())
}

pub fn get_file_history(root_dir: &str, file_path: &str) -> Result<FileHistory, String> {
    if !is_git_repo(root_dir) {
        return Ok(FileHistory {
            file_path: file_path.to_string(),
            commits: vec![],
        });
    }
    
    let repo = get_repo(root_dir)?;
    let repo_path = get_repo_path(root_dir)?;
    
    let relative_path = if Path::new(file_path).is_absolute() {
        Path::new(file_path).strip_prefix(&repo_path)
            .map_err(|e| format!("File not in repo: {}", e))?
            .to_string_lossy()
            .to_string()
    } else {
        file_path.to_string()
    };
    
    let mut revwalk = repo.revwalk().map_err(|e| e.to_string())?;
    revwalk.push_head().map_err(|e| e.to_string())?;
    revwalk.set_sorting(git2::Sort::TIME | git2::Sort::REVERSE)
        .map_err(|e| e.to_string())?;
    
    let mut commits = Vec::new();
    
    for oid in revwalk {
        let oid = oid.map_err(|e| e.to_string())?;
        let commit = repo.find_commit(oid).map_err(|e| e.to_string())?;
        
        let tree = commit.tree().map_err(|e| e.to_string())?;
        let entry = tree.get_path(Path::new(&relative_path));
        
        if entry.is_ok() {
            let parent_tree = commit.parent(0).and_then(|c| c.tree()).ok();
            
            let changed = if let Some(pt) = &parent_tree {
                let diff = repo.diff_tree_to_tree(
                    Some(pt),
                    Some(&tree),
                    None,
                ).map_err(|e| e.to_string())?;
                
                diff.deltas().any(|d| {
                    d.new_file().path().map(|p| p == Path::new(&relative_path))
                        .unwrap_or(false)
                        || d.old_file().path().map(|p| p == Path::new(&relative_path))
                        .unwrap_or(false)
                })
            } else {
                true
            };
            
            if changed || parent_tree.is_none() {
                let timestamp = commit.time().seconds();
                let message = commit.message().unwrap_or("").to_string();
                let author = commit.author().name().unwrap_or("Unknown").to_string();
                
                let mut files = Vec::new();
                if let Some(pt) = parent_tree {
                    let diff = repo.diff_tree_to_tree(Some(&pt), Some(&tree), None)
                        .map_err(|e| e.to_string())?;
                    for delta in diff.deltas() {
                        if let Some(path) = delta.new_file().path() {
                            files.push(path.to_string_lossy().to_string());
                        }
                    }
                }
                
                commits.push(CommitInfo {
                    id: oid.to_string(),
                    message,
                    author,
                    timestamp,
                    files,
                });
            }
        }
    }
    
    commits.reverse();
    
    Ok(FileHistory {
        file_path: file_path.to_string(),
        commits,
    })
}

pub fn get_file_version(root_dir: &str, file_path: &str, commit_id: &str) -> Result<String, String> {
    if !is_git_repo(root_dir) {
        return Err("Git repository not initialized".into());
    }
    
    let repo = get_repo(root_dir)?;
    let repo_path = get_repo_path(root_dir)?;
    
    let relative_path = if Path::new(file_path).is_absolute() {
        Path::new(file_path).strip_prefix(&repo_path)
            .map_err(|e| format!("File not in repo: {}", e))?
            .to_string_lossy()
            .to_string()
    } else {
        file_path.to_string()
    };
    
    let oid = git2::Oid::from_str(commit_id)
        .map_err(|e| format!("Invalid commit ID: {}", e))?;
    
    let commit = repo.find_commit(oid).map_err(|e| e.to_string())?;
    let tree = commit.tree().map_err(|e| e.to_string())?;
    let entry = tree.get_path(Path::new(&relative_path))
        .map_err(|_| "File not found in this commit".to_string())?;
    
    let object = entry.to_object(&repo).map_err(|e| e.to_string())?;
    let blob = object.as_blob().ok_or("Not a file".to_string())?;
    
    let content = String::from_utf8_lossy(blob.content()).to_string();
    Ok(content)
}

pub fn restore_version(root_dir: &str, file_path: &str, commit_id: &str) -> Result<(), String> {
    let content = get_file_version(root_dir, file_path, commit_id)?;
    
    std::fs::write(file_path, &content)
        .map_err(|e| format!("Failed to write file: {}", e))?;
    
    Ok(())
}

pub fn restore_and_commit(root_dir: &str, file_path: &str, commit_id: &str) -> Result<String, String> {
    let content = get_file_version(root_dir, file_path, commit_id)?;
    let file_name = Path::new(file_path)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "file".to_string());
    
    std::fs::write(file_path, &content)
        .map_err(|e| format!("Failed to write file: {}", e))?;
    
    commit_changes(root_dir, &format!("Revert {} to version {}", file_name, &commit_id[..7]))
}
