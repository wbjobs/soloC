mod crypto;
mod recorder;
mod types;

use clap::Parser;
use recorder::TerminalRecorder;
use std::path::PathBuf;

#[derive(Parser, Debug)]
#[command(name = "termrec")]
#[command(about = "跨平台终端会话录制工具", long_about = None)]
struct Cli {
    #[arg(short, long)]
    output: Option<PathBuf>,

    #[arg(short, long)]
    shell: Option<String>,

    #[arg(short, long)]
    encrypt: bool,

    #[arg(short, long)]
    password: Option<String>,

    #[arg(short, long)]
    info: Option<PathBuf>,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let cli = Cli::parse();

    if let Some(info_path) = cli.info {
        let recorder = TerminalRecorder::new();
        recorder.show_file_info(&info_path).await?;
        return Ok(());
    }

    let mut recorder = TerminalRecorder::new();

    if let Some(shell) = cli.shell {
        recorder.set_shell(shell);
    }

    if cli.encrypt {
        recorder.enable_encryption(cli.password);
    }

    if let Some(output) = cli.output {
        recorder.set_output_path(output);
    }

    println!("开始录制终端会话...");
    println!("按 Ctrl+D 或输入 'exit' 结束录制");

    recorder.record().await?;

    Ok(())
}
