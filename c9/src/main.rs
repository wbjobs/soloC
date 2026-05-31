mod cli;
mod config;
mod ssh;
mod cache;
mod tui;
mod sync;
mod watch;

use anyhow::Result;
use clap::Parser;
use cli::Cli;

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();
    
    match cli.command {
        cli::Commands::Sync(sync_args) => {
            sync::sync_remote(&sync_args).await?;
        }
        cli::Commands::Watch(watch_args) => {
            watch::run_watch(&watch_args).await?;
        }
        cli::Commands::Browse(browse) => {
            tui::run_browse(&browse).await?;
        }
    }
    
    Ok(())
}
