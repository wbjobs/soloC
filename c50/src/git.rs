use git2::{Repository, StatusOptions, DiffOptions, Oid, Signature, ResetType};
use std::path::Path;
use anyhow::Result;
use std::collections::HashMap;

fn decode_bytes_to_string(bytes: &[u8]) -> String {
    match String::from_utf8(bytes.to_vec()) {
        Ok(s) => s,
        Err(_) => {
            match String::from_utf16(
                &bytes
                    .chunks(2)
                    .map(|chunk| {
                        if chunk.len() == 2 {
                            u16::from_le_bytes([chunk[0], chunk[1]])
                        } else {
                            0
                        }
                    })
                    .collect::<Vec<_>>(),
            ) {
                Ok(s) => s,
                Err(_) => String::from_utf8_lossy(bytes).to_string(),
            }
        }
    }
}

#[derive(Debug, Clone)]
pub struct FileChange {
    pub path: String,
    pub status: String,
    pub diff: String,
}

pub struct GitRepo {
    repo: Repository,
}

impl GitRepo {
    pub fn open<P: AsRef<Path>>(path: P) -> Result<Self> {
        let repo = Repository::open(path)?;
        Ok(GitRepo { repo })
    }

    pub fn get_changes(&self) -> Result<Vec<FileChange>> {
        let mut status_opts = StatusOptions::new();
        status_opts.include_untracked(true);
        let statuses = self.repo.statuses(Some(&mut status_opts))?;
        
        let mut changes = Vec::new();
        
        for entry in statuses.iter() {
            let path = entry.path()
                .map(|s| s.to_string())
                .unwrap_or_else(|| "unknown".to_string());
            let status = if entry.status().is_wt_new() {
                "new"
            } else if entry.status().is_wt_modified() {
                "modified"
            } else if entry.status().is_wt_deleted() {
                "deleted"
            } else if entry.status().is_index_new() {
                "staged new"
            } else if entry.status().is_index_modified() {
                "staged modified"
            } else if entry.status().is_index_deleted() {
                "staged deleted"
            } else {
                "unknown"
            }.to_string();

            let diff = self.get_file_diff(&path)?;
            
            changes.push(FileChange {
                path,
                status,
                diff,
            });
        }
        
        Ok(changes)
    }

    fn get_file_diff(&self, path: &str) -> Result<String> {
        let head = self.repo.head()?;
        let head_tree = head.peel_to_tree()?;
        
        let mut diff_opts = DiffOptions::new();
        diff_opts.pathspec(path);
        
        let diff = self.repo.diff_tree_to_workdir(Some(&head_tree), Some(&mut diff_opts))?;
        let mut diff_text = Vec::new();
        diff.print(git2::DiffFormat::Patch, |_delta, _hunk, line| {
            diff_text.extend_from_slice(line.content());
            true
        })?;
        
        Ok(decode_bytes_to_string(&diff_text))
    }

    pub fn get_branch_diff(&self, base_branch: &str) -> Result<Vec<FileChange>> {
        let base = self.repo.find_branch(base_branch, git2::BranchType::Local)?;
        let base_commit = base.get().peel_to_commit()?;
        let base_tree = base_commit.tree()?;
        
        let head = self.repo.head()?;
        let head_commit = head.peel_to_commit()?;
        let head_tree = head_commit.tree()?;
        
        let diff = self.repo.diff_tree_to_tree(Some(&base_tree), Some(&head_tree), None)?;
        
        let mut changes = Vec::new();
        let mut deltas = Vec::new();
        
        for delta in diff.deltas() {
            if let Some(path) = delta.new_file().path() {
                deltas.push(path.to_string_lossy().into_owned());
            }
        }
        
        let mut diff_text = Vec::new();
        diff.print(git2::DiffFormat::Patch, |_delta, _hunk, line| {
            diff_text.extend_from_slice(line.content());
            true
        })?;
        
        let diff_string = decode_bytes_to_string(&diff_text);
        
        for path in deltas {
            changes.push(FileChange {
                path: path.clone(),
                status: "modified".to_string(),
                diff: diff_string.clone(),
            });
        }
        
        Ok(changes)
    }

    pub fn get_current_branch(&self) -> Result<String> {
        let head = self.repo.head()?;
        let branch = head.shorthand().ok_or_else(|| anyhow::anyhow!("无法获取分支名称"))?;
        Ok(branch.to_string())
    }

    pub fn stage_all(&self) -> Result<()> {
        let mut index = self.repo.index()?;
        index.add_all(["*"].iter(), git2::IndexAddOption::DEFAULT, None)?;
        index.write()?;
        Ok(())
    }

    pub fn commit(&self, message: &str) -> Result<Oid> {
        let mut index = self.repo.index()?;
        let tree_id = index.write_tree()?;
        let tree = self.repo.find_tree(tree_id)?;
        
        let head = self.repo.head()?;
        let parent_commit = head.peel_to_commit()?;
        
        let signature = Signature::now("Git Auto PR", "auto@pr.com")?;
        
        let oid = self.repo.commit(
            Some("HEAD"),
            &signature,
            &signature,
            message,
            &tree,
            &[&parent_commit],
        )?;
        
        Ok(oid)
    }

    pub fn rollback_commit(&self, commit_oid: Oid) -> Result<()> {
        let commit = self.repo.find_commit(commit_oid)?;
        let parent = commit.parent(0)?;
        let obj = self.repo.find_object(parent.id(), None)?;
        
        self.repo.reset(
            &obj,
            ResetType::Mixed,
            None,
        )?;
        
        Ok(())
    }

    pub fn push_branch(&self, branch: &str, remote: &str) -> Result<()> {
        let mut remote = self.repo.find_remote(remote)?;
        
        let refspec = format!("refs/heads/{}", branch);
        remote.push(&[&refspec], None)?;
        
        Ok(())
    }
}

pub fn generate_commit_message(changes: &[FileChange]) -> Result<String> {
    let mut type_counts = HashMap::new();
    let mut modified_files = Vec::new();
    
    for change in changes {
        let commit_type = infer_commit_type(&change.path, &change.diff);
        *type_counts.entry(commit_type).or_insert(0) += 1;
        modified_files.push(change.path.clone());
    }
    
    let primary_type = type_counts.into_iter()
        .max_by_key(|&(_, count)| count)
        .map(|(t, _)| t)
        .unwrap_or("feat");
    
    let subject = if modified_files.len() == 1 {
        format!("update {}", modified_files[0])
    } else {
        format!("update {} files", modified_files.len())
    };
    
    let body = modified_files.join("\n- ");
    
    Ok(format!("{}: {}\n\n- {}", primary_type, subject, body))
}

fn infer_commit_type(path: &str, _diff: &str) -> &'static str {
    let path_lower = path.to_lowercase();
    
    if path_lower.contains("test") {
        "test"
    } else if path_lower.contains("doc") || path_lower.ends_with(".md") {
        "docs"
    } else if path_lower.contains("fix") || path_lower.contains("bug") {
        "fix"
    } else if path_lower.contains("refactor") {
        "refactor"
    } else if path_lower.ends_with(".yml") || path_lower.ends_with(".yaml") || path_lower.ends_with(".json") {
        "chore"
    } else {
        "feat"
    }
}
