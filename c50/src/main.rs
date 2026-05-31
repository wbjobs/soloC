mod config;
mod git;
mod github;
mod interact;
mod hooks;

use clap::Parser;
use anyhow::Result;

#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(clap::Subcommand, Debug)]
enum Commands {
    /// 自动提交代码变更
    Commit {
        /// 使用交互式模式编辑提交信息
        #[arg(short, long)]
        interactive: bool,
    },
    /// 创建 Pull Request
    Pr {
        /// PR 的目标分支
        #[arg(short, long, default_value = "main")]
        base: String,
        /// 使用交互式模式编辑 PR 信息
        #[arg(short, long)]
        interactive: bool,
    },
    /// 自动提交并创建 PR
    Auto {
        /// PR 的目标分支
        #[arg(short, long, default_value = "main")]
        base: String,
        /// 使用交互式模式
        #[arg(short, long)]
        interactive: bool,
    },
    /// 初始化配置文件
    Init,
}

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();

    match cli.command {
        Commands::Commit { interactive } => {
            let repo = git::GitRepo::open(".")?;
            let changes = repo.get_changes()?;
            
            if changes.is_empty() {
                println!("没有检测到变更");
                return Ok(());
            }

            let config = config::Config::load()?;
            let pre_commit_result = hooks::run_pre_commit_hooks(&config)?;
            
            for msg in &pre_commit_result.messages {
                println!("{}", msg);
            }
            
            if !pre_commit_result.success {
                eprintln!("预提交检查失败，提交已中止，请修复问题后重试");
                return Err(anyhow::anyhow!("预提交检查失败"));
            }

            let mut commit_msg = git::generate_commit_message(&changes)?;
            
            if interactive {
                commit_msg = interact::edit_commit_message(&commit_msg)?;
            }

            repo.stage_all()?;
            repo.commit(&commit_msg)?;
            println!("提交成功: {}", commit_msg.lines().next().unwrap_or(""));
        }
        Commands::Pr { base, interactive } => {
            let repo = git::GitRepo::open(".")?;
            let current_branch = repo.get_current_branch()?;
            
            if current_branch == base {
                println!("当前分支与目标分支相同，无法创建 PR");
                return Ok(());
            }

            let changes = repo.get_branch_diff(&base)?;
            let mut title = github::generate_pr_title(&current_branch, &changes)?;
            let mut body = github::generate_pr_body(&changes)?;

            if interactive {
                (title, body) = interact::edit_pr_info(&title, &body)?;
            }

            let config = config::Config::load()?;
            let github = github::GitHubClient::new(&config.github.token)?;
            let pr_url = github.create_pr(&base, &current_branch, &title, &body).await?;
            
            println!("PR 创建成功: {}", pr_url);
        }
        Commands::Auto { base, interactive } => {
            let repo = git::GitRepo::open(".")?;
            let changes = repo.get_changes()?;
            
            if changes.is_empty() {
                println!("没有检测到变更");
                return Ok(());
            }

            let config = config::Config::load()?;
            let pre_commit_result = hooks::run_pre_commit_hooks(&config)?;
            
            for msg in &pre_commit_result.messages {
                println!("{}", msg);
            }
            
            if !pre_commit_result.success {
                eprintln!("预提交检查失败，提交已中止，请修复问题后重试");
                return Err(anyhow::anyhow!("预提交检查失败"));
            }

            let mut commit_msg = git::generate_commit_message(&changes)?;
            
            if interactive {
                commit_msg = interact::edit_commit_message(&commit_msg)?;
            }

            repo.stage_all()?;
            let commit_oid = repo.commit(&commit_msg)?;
            println!("提交成功: {}", commit_msg.lines().next().unwrap_or(""));

            let current_branch = repo.get_current_branch()?;
            
            if current_branch == base {
                println!("当前分支与目标分支相同，跳过 PR 创建");
                return Ok(());
            }

            let branch_changes = repo.get_branch_diff(&base)?;
            let mut title = github::generate_pr_title(&current_branch, &branch_changes)?;
            let mut body = github::generate_pr_body(&branch_changes)?;

            if interactive {
                (title, body) = interact::edit_pr_info(&title, &body)?;
            }

            let github = github::GitHubClient::new(&config.github.token)?;
            
            println!("正在推送分支 {}...", current_branch);
            match repo.push_branch(&current_branch, "origin") {
                Ok(_) => {
                    println!("分支推送成功");
                }
                Err(e) => {
                    eprintln!("分支推送失败: {}", e);
                    eprintln!("正在回滚提交...");
                    if let Err(rollback_err) = repo.rollback_commit(commit_oid) {
                        eprintln!("回滚失败: {}", rollback_err);
                        eprintln!("请手动执行: git reset --mixed HEAD~1");
                    } else {
                        println!("回滚成功，提交已撤销");
                    }
                    return Err(anyhow::anyhow!("分支推送失败: {}", e));
                }
            }
            
            match github.create_pr(&base, &current_branch, &title, &body).await {
                Ok(pr_url) => {
                    println!("PR 创建成功: {}", pr_url);
                }
                Err(e) => {
                    eprintln!("PR 创建失败: {}", e);
                    eprintln!("注意: 分支 {} 已推送到远程", current_branch);
                    eprintln!("如需回滚，请手动执行:");
                    eprintln!("  git reset --mixed HEAD~1");
                    eprintln!("  git push origin --delete {}", current_branch);
                    return Err(e);
                }
            }
        }
        Commands::Init => {
            config::Config::init()?;
            println!("配置文件已创建，请编辑后使用");
        }
    }

    Ok(())
}
