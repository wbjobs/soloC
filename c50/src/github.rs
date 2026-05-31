use super::git::FileChange;
use super::config::Config;
use anyhow::Result;
use octocrab::Octocrab;
use std::time::Duration;

pub struct GitHubClient {
    client: Octocrab,
    owner: String,
    repo: String,
}

impl GitHubClient {
    pub fn new(token: &str) -> Result<Self> {
        let config = Config::load()?;
        let client = Octocrab::builder().personal_token(token.to_string()).build()?;
        
        Ok(GitHubClient {
            client,
            owner: config.github.owner,
            repo: config.github.repo,
        })
    }

    pub async fn create_pr(&self, base: &str, head: &str, title: &str, body: &str) -> Result<String> {
        let max_retries = 3;
        let mut retry_count = 0;
        
        loop {
            match self.client
                .pulls(&self.owner, &self.repo)
                .create(title, head, base)
                .body(body)
                .send()
                .await {
                Ok(pr) => {
                    return Ok(pr.html_url.to_string());
                }
                Err(e) => {
                    retry_count += 1;
                    if retry_count >= max_retries {
                        return Err(anyhow::anyhow!("创建 PR 失败，已重试 {} 次: {}", max_retries, e));
                    }
                    eprintln!("创建 PR 失败 (尝试 {}/{}): {}", retry_count, max_retries, e);
                    eprintln!("{} 秒后重试...", retry_count * 2);
                    tokio::time::sleep(Duration::from_secs((retry_count * 2) as u64)).await;
                }
            }
        }
    }
}

pub fn generate_pr_title(branch: &str, changes: &[FileChange]) -> Result<String> {
    let summary = if changes.len() == 1 {
        format!("update {}", changes[0].path)
    } else {
        format!("update {} files", changes.len())
    };
    
    Ok(format!("{}: {}", branch, summary))
}

pub fn generate_pr_body(changes: &[FileChange]) -> Result<String> {
    let mut body = String::from("## Changes Made\n\n");
    
    for change in changes {
        body.push_str(&format!("- **{}**: {}\n", change.status, change.path));
    }
    
    body.push_str("\n## Description\n\n");
    body.push_str("This PR contains automated changes.\n\n");
    
    body.push_str("## Checklist\n\n");
    body.push_str("- [ ] Code follows project style guidelines\n");
    body.push_str("- [ ] Tests pass\n");
    body.push_str("- [ ] Documentation updated if needed\n");
    
    Ok(body)
}
