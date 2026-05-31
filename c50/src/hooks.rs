use anyhow::Result;
use std::process::Command;
use crate::config::Config;

pub struct PreCommitResult {
    pub success: bool,
    pub messages: Vec<String>,
}

pub fn run_pre_commit_hooks(config: &Config) -> Result<PreCommitResult> {
    if !config.hooks.pre_commit.enabled {
        return Ok(PreCommitResult {
            success: true,
            messages: vec!["预提交钩子已禁用".to_string()],
        });
    }

    let mut messages = Vec::new();
    let mut all_success = true;

    if let Some(lint_cmd) = &config.hooks.pre_commit.lint_command {
        println!("运行 Lint 检查: {}", lint_cmd);
        match run_command(lint_cmd) {
            Ok(output) => {
                if output.success {
                    messages.push("✓ Lint 检查通过".to_string());
                    if !output.stdout.is_empty() {
                        messages.push(format!("Lint 输出:\n{}", output.stdout));
                    }
                } else {
                    all_success = false;
                    messages.push("✗ Lint 检查失败".to_string());
                    if !output.stdout.is_empty() {
                        messages.push(format!("标准输出:\n{}", output.stdout));
                    }
                    if !output.stderr.is_empty() {
                        messages.push(format!("错误输出:\n{}", output.stderr));
                    }
                }
            }
            Err(e) => {
                all_success = false;
                messages.push(format!("✗ Lint 命令执行失败: {}", e));
            }
        }
    }

    if let Some(test_cmd) = &config.hooks.pre_commit.test_command {
        println!("运行测试: {}", test_cmd);
        match run_command(test_cmd) {
            Ok(output) => {
                if output.success {
                    messages.push("✓ 测试通过".to_string());
                    if !output.stdout.is_empty() {
                        messages.push(format!("测试输出:\n{}", output.stdout));
                    }
                } else {
                    all_success = false;
                    messages.push("✗ 测试失败".to_string());
                    if !output.stdout.is_empty() {
                        messages.push(format!("标准输出:\n{}", output.stdout));
                    }
                    if !output.stderr.is_empty() {
                        messages.push(format!("错误输出:\n{}", output.stderr));
                    }
                }
            }
            Err(e) => {
                all_success = false;
                messages.push(format!("✗ 测试命令执行失败: {}", e));
            }
        }
    }

    Ok(PreCommitResult {
        success: all_success,
        messages,
    })
}

struct CommandOutput {
    success: bool,
    stdout: String,
    stderr: String,
}

fn run_command(command: &str) -> Result<CommandOutput> {
    let parts: Vec<&str> = command.split_whitespace().collect();
    if parts.is_empty() {
        return Err(anyhow::anyhow!("空命令"));
    }

    let output = if cfg!(target_os = "windows") {
        Command::new("cmd")
            .args(&["/C", command])
            .output()?
    } else {
        Command::new("sh")
            .args(&["-c", command])
            .output()?
    };

    Ok(CommandOutput {
        success: output.status.success(),
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
    })
}
