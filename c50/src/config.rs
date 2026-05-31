use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use anyhow::Result;

#[derive(Debug, Serialize, Deserialize)]
pub struct Config {
    pub github: GitHubConfig,
    pub templates: Templates,
    pub hooks: Hooks,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GitHubConfig {
    pub token: String,
    pub owner: String,
    pub repo: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Templates {
    pub commit_message: String,
    pub pr_title: String,
    pub pr_body: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Hooks {
    pub pre_commit: PreCommitHooks,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PreCommitHooks {
    pub enabled: bool,
    pub lint_command: Option<String>,
    pub test_command: Option<String>,
}

impl Default for Config {
    fn default() -> Self {
        Config {
            github: GitHubConfig {
                token: "your_github_token_here".to_string(),
                owner: "your_username".to_string(),
                repo: "your_repo".to_string(),
            },
            templates: Templates {
                commit_message: "{{type}}: {{subject}}\n\n{{body}}".to_string(),
                pr_title: "{{branch}}: {{summary}}".to_string(),
                pr_body: "## Changes\n\n{{changes}}\n\n## Checklist\n\n- [ ] Tests pass\n- [ ] Documentation updated".to_string(),
            },
            hooks: Hooks {
                pre_commit: PreCommitHooks {
                    enabled: false,
                    lint_command: None,
                    test_command: None,
                },
            },
        }
    }
}

impl Config {
    pub fn config_path() -> Result<PathBuf> {
        let mut path = dirs::home_dir().ok_or_else(|| anyhow::anyhow!("无法找到主目录"))?;
        path.push(".git-auto-pr.toml");
        Ok(path)
    }

    pub fn load() -> Result<Self> {
        let path = Self::config_path()?;
        if !path.exists() {
            return Ok(Config::default());
        }
        let content = fs::read_to_string(&path)?;
        let config: Config = toml::from_str(&content)?;
        Ok(config)
    }

    pub fn init() -> Result<()> {
        let path = Self::config_path()?;
        if path.exists() {
            println!("配置文件已存在: {:?}", path);
            return Ok(());
        }
        let config = Config::default();
        let content = toml::to_string_pretty(&config)?;
        fs::write(&path, content)?;
        println!("配置文件已创建: {:?}", path);
        Ok(())
    }
}
