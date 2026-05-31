use clap::{Parser, Subcommand};

#[derive(Parser, Debug)]
#[command(name = "remotefs-cli", version, about = "Remote file system CLI tool with TUI")]
pub struct Cli {
    #[command(subcommand)]
    pub command: Commands,
}

#[derive(Subcommand, Debug)]
pub enum Commands {
    /// Sync remote directory to local cache
    Sync(SyncArgs),
    
    /// Watch local cache and sync changes to/from remote (incremental sync)
    Watch(WatchArgs),
    
    /// Browse cached files interactively
    Browse(BrowseArgs),
}

#[derive(Parser, Debug)]
pub struct SyncArgs {
    /// Remote path in format: user@host:/remote/path or alias
    #[arg(value_name = "REMOTE")]
    pub remote: String,
    
    /// Local cache directory
    #[arg(value_name = "LOCAL")]
    pub local: String,
    
    /// SSH port (default: 22)
    #[arg(short = 'p', long = "port", default_value = "22")]
    pub port: u16,
}

#[derive(Parser, Debug)]
pub struct WatchArgs {
    /// Local cache directory (must be synced first)
    #[arg(value_name = "LOCAL")]
    pub local: String,
    
    /// Conflict resolution strategy
    #[arg(
        short = 'c', 
        long = "conflict", 
        default_value = "newest",
        value_parser = ["newest", "local", "remote", "ask"]
    )]
    pub conflict: String,
    
    /// Poll interval in seconds for remote changes (default: 30)
    #[arg(short = 'i', long = "interval", default_value = "30")]
    pub interval: u64,
}

#[derive(Parser, Debug)]
pub struct BrowseArgs {
    /// Local cache directory or remote path (user@host:/path or alias)
    #[arg(value_name = "PATH")]
    pub path: String,
    
    /// SSH port (default: 22, only for remote paths)
    #[arg(short = 'p', long = "port", default_value = "22")]
    pub port: u16,
}
