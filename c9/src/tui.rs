use anyhow::{Context, Result};
use crossterm::{
    event::{self, DisableMouseCapture, EnableMouseCapture, Event, KeyCode, KeyEvent},
    execute,
    terminal::{disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen},
};
use std::io::{self, Stdout};
use std::path::{Path, PathBuf};
use tokio::sync::mpsc;
use tui::{
    backend::CrosstermBackend,
    layout::{Constraint, Direction, Layout, Rect},
    style::{Color, Modifier, Style},
    text::{Span, Spans},
    widgets::{Block, Borders, List, ListItem, ListState, Paragraph, Wrap},
    Frame, Terminal,
};

use crate::cli::BrowseArgs;
use crate::config::Config;
use crate::sync::{FileMetadata, SyncManifest, load_manifest};

enum Mode {
    Normal,
    Search,
}

enum UiMessage {
    FilesLoaded(Vec<CachedFile>),
    Error(String),
    CopyCompleted(String),
}

enum IoMessage {
    LoadDirectory(PathBuf),
    CopyFile(PathBuf, PathBuf),
    Refresh,
}

struct AppState {
    current_path: PathBuf,
    cache_root: PathBuf,
    manifest: Option<SyncManifest>,
    files: Vec<CachedFile>,
    selected: ListState,
    mode: Mode,
    search_query: String,
    filtered_files: Vec<CachedFile>,
    message: String,
    is_loading: bool,
}

#[derive(Debug, Clone)]
struct CachedFile {
    name: String,
    local_path: PathBuf,
    remote_path: String,
    size: u64,
    permissions: String,
    file_type: FileType,
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub enum FileType {
    Directory,
    File,
    Symlink,
    Other,
}

impl From<crate::ssh::FileType> for FileType {
    fn from(ft: crate::ssh::FileType) -> Self {
        match ft {
            crate::ssh::FileType::Directory => FileType::Directory,
            crate::ssh::FileType::File => FileType::File,
            crate::ssh::FileType::Symlink => FileType::Symlink,
            crate::ssh::FileType::Other => FileType::Other,
        }
    }
}

pub async fn run_browse(args: &BrowseArgs) -> Result<()> {
    let config = Config::load()?;
    
    let input_path = PathBuf::from(&args.path);
    
    let (cache_root, manifest) = if input_path.exists() && input_path.is_dir() {
        let manifest = load_manifest(&input_path)?;
        (input_path, manifest)
    } else {
        return Err(anyhow::anyhow!(
            "Path does not exist or is not a directory: {}\n\
             Please use 'remotefs-cli sync' first to sync remote files to local cache.",
            args.path
        ));
    };
    
    println!("Browsing cache at: {}", cache_root.display());
    if let Some(m) = &manifest {
        println!(
            "Remote: {}@{}:{}",
            m.remote.user, m.remote.host, m.remote.port
        );
        println!("Synced at: {}", format_timestamp(m.synced_at));
        println!("Total files: {}", m.files.len());
    }
    println!("\nPress any key to start browsing...");
    let _ = event::read();
    
    let initial_files = load_directory(&cache_root, &cache_root, manifest.as_ref()).await?;
    
    let mut state = AppState {
        current_path: cache_root.clone(),
        cache_root: cache_root.clone(),
        manifest,
        files: initial_files.clone(),
        selected: ListState::default(),
        mode: Mode::Normal,
        search_query: String::new(),
        filtered_files: initial_files,
        message: "Ready".to_string(),
        is_loading: false,
    };
    
    state.selected.select(Some(0));
    
    let (ui_tx, mut ui_rx) = mpsc::channel::<UiMessage>(32);
    let (io_tx, io_rx) = mpsc::channel::<IoMessage>(32);
    
    let io_task = tokio::spawn(io_worker(
        io_rx,
        ui_tx.clone(),
        cache_root.clone(),
        state.manifest.clone(),
    ));
    
    enable_raw_mode()?;
    let mut stdout = io::stdout();
    execute!(stdout, EnterAlternateScreen, EnableMouseCapture)?;
    let backend = CrosstermBackend::new(stdout);
    let mut terminal = Terminal::new(backend)?;
    
    let res = run_event_loop(
        &mut terminal,
        &mut state,
        &mut ui_rx,
        io_tx.clone(),
    )
    .await;
    
    drop(io_tx);
    let _ = io_task.await;
    
    disable_raw_mode()?;
    execute!(
        terminal.backend_mut(),
        LeaveAlternateScreen,
        DisableMouseCapture
    )?;
    terminal.show_cursor()?;
    
    res?;
    Ok(())
}

async fn io_worker(
    mut rx: mpsc::Receiver<IoMessage>,
    tx: mpsc::Sender<UiMessage>,
    cache_root: PathBuf,
    manifest: Option<SyncManifest>,
) {
    while let Some(msg) = rx.recv().await {
        match msg {
            IoMessage::LoadDirectory(path) => {
                match load_directory(&cache_root, &path, manifest.as_ref()).await {
                    Ok(files) => {
                        let _ = tx.send(UiMessage::FilesLoaded(files)).await;
                    }
                    Err(e) => {
                        let _ = tx.send(UiMessage::Error(e.to_string())).await;
                    }
                }
            }
            IoMessage::CopyFile(src, dst) => {
                match copy_file(&src, &dst).await {
                    Ok(_) => {
                        let _ = tx
                            .send(UiMessage::CopyCompleted(format!(
                                "Copied to: {}",
                                dst.display()
                            )))
                            .await;
                    }
                    Err(e) => {
                        let _ = tx.send(UiMessage::Error(e.to_string())).await;
                    }
                }
            }
            IoMessage::Refresh => {
                match load_directory(&cache_root, &cache_root, manifest.as_ref()).await {
                    Ok(files) => {
                        let _ = tx.send(UiMessage::FilesLoaded(files)).await;
                    }
                    Err(e) => {
                        let _ = tx.send(UiMessage::Error(e.to_string())).await;
                    }
                }
            }
        }
    }
}

async fn load_directory(
    cache_root: &Path,
    dir_path: &Path,
    manifest: Option<&SyncManifest>,
) -> Result<Vec<CachedFile>> {
    let mut entries = tokio::fs::read_dir(dir_path).await?;
    let mut files = Vec::new();
    
    while let Some(entry) = entries.next_entry().await? {
        let path = entry.path();
        let name = entry
            .file_name()
            .into_string()
            .unwrap_or_else(|_| "unknown".to_string());
        
        if name.starts_with('.') {
            continue;
        }
        
        let metadata = entry.metadata().await?;
        
        let file_type = if metadata.is_dir() {
            FileType::Directory
        } else if metadata.is_file() {
            FileType::File
        } else if metadata.is_symlink() {
            FileType::Symlink
        } else {
            FileType::Other
        };
        
        let permissions_str = get_permissions_string(&path);
        
        let (remote_path, size) = if let Some(m) = manifest {
            let rel_path = path.strip_prefix(cache_root)
                .unwrap_or(&path)
                .to_string_lossy()
                .replace('\\', "/");
            
            m.files.get(&rel_path)
                .map(|fm| (fm.remote_path.clone(), fm.size))
                .unwrap_or_else(|| (
                    path.to_string_lossy().to_string(),
                    metadata.len()
                ))
        } else {
            (path.to_string_lossy().to_string(), metadata.len())
        };
        
        files.push(CachedFile {
            name,
            local_path: path,
            remote_path,
            size,
            permissions: permissions_str,
            file_type,
        });
    }
    
    files.sort_by(|a, b| {
        a.file_type.cmp(&b.file_type).then_with(|| a.name.cmp(&b.name))
    });
    
    Ok(files)
}

fn get_permissions_string(path: &Path) -> String {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if let Ok(metadata) = std::fs::metadata(path) {
            let perm = metadata.permissions().mode();
            let is_dir = metadata.is_dir();
            let is_symlink = metadata.file_type().is_symlink();
            
            let mut s = String::new();
            s.push(if is_symlink {
                'l'
            } else if is_dir {
                'd'
            } else {
                '-'
            });
            
            for i in (0..9).step_by(3) {
                let p = (perm >> (6 - i)) & 0o7;
                s.push(if p & 0o4 != 0 { 'r' } else { '-' });
                s.push(if p & 0o2 != 0 { 'w' } else { '-' });
                s.push(if p & 0o1 != 0 { 'x' } else { '-' });
            }
            
            return s;
        }
    }
    
    "-rwxrwxrwx".to_string()
}

async fn copy_file(src: &Path, dst: &Path) -> Result<()> {
    if let Some(parent) = dst.parent() {
        tokio::fs::create_dir_all(parent).await?;
    }
    tokio::fs::copy(src, dst).await?;
    Ok(())
}

async fn run_event_loop(
    terminal: &mut Terminal<CrosstermBackend<Stdout>>,
    state: &mut AppState,
    ui_rx: &mut mpsc::Receiver<UiMessage>,
    io_tx: mpsc::Sender<IoMessage>,
) -> Result<()> {
    let tick_rate = std::time::Duration::from_millis(200);
    
    loop {
        terminal.draw(|f| ui(f, state))?;
        
        tokio::select! {
            biased;
            
            msg = ui_rx.recv() => {
                if let Some(msg) = msg {
                    handle_ui_message(msg, state);
                }
            }
            
            event = event::poll(tick_rate) => {
                if event? {
                    if let Event::Key(key) = event::read()? {
                        if !handle_key_event(key, state, io_tx.clone()).await? {
                            break;
                        }
                    }
                }
            }
        }
    }
    
    Ok(())
}

fn handle_ui_message(msg: UiMessage, state: &mut AppState) {
    match msg {
        UiMessage::FilesLoaded(files) => {
            state.files = files.clone();
            state.filtered_files = files;
            state.selected.select(Some(0));
            state.is_loading = false;
            state.message = format!("Loaded {} items", state.files.len());
        }
        UiMessage::Error(e) => {
            state.message = format!("Error: {}", e);
            state.is_loading = false;
        }
        UiMessage::CopyCompleted(msg) => {
            state.message = msg;
        }
    }
}

async fn handle_key_event(
    key: KeyEvent,
    state: &mut AppState,
    io_tx: mpsc::Sender<IoMessage>,
) -> Result<bool> {
    match state.mode {
        Mode::Normal => handle_normal_mode(key, state, io_tx).await,
        Mode::Search => handle_search_mode(key, state),
    }
}

async fn handle_normal_mode(
    key: KeyEvent,
    state: &mut AppState,
    io_tx: mpsc::Sender<IoMessage>,
) -> Result<bool> {
    match key.code {
        KeyCode::Char('q') | KeyCode::Esc => {
            return Ok(false);
        }
        KeyCode::Down | KeyCode::Char('j') => {
            let current = state.selected.selected().unwrap_or(0);
            if current < state.filtered_files.len().saturating_sub(1) {
                state.selected.select(Some(current + 1));
            }
        }
        KeyCode::Up | KeyCode::Char('k') => {
            let current = state.selected.selected().unwrap_or(0);
            if current > 0 {
                state.selected.select(Some(current - 1));
            }
        }
        KeyCode::Home => {
            state.selected.select(Some(0));
        }
        KeyCode::End => {
            if !state.filtered_files.is_empty() {
                state.selected.select(Some(state.filtered_files.len() - 1));
            }
        }
        KeyCode::Enter => {
            if let Some(idx) = state.selected.selected() {
                if let Some(file) = state.filtered_files.get(idx) {
                    if file.file_type == FileType::Directory {
                        state.current_path = file.local_path.clone();
                        state.message = format!("Loading: {}", file.name);
                        state.is_loading = true;
                        io_tx.send(IoMessage::LoadDirectory(file.local_path.clone())).await?;
                    }
                }
            }
        }
        KeyCode::Backspace | KeyCode::Char('h') => {
            if state.current_path != state.cache_root {
                if let Some(parent) = state.current_path.parent() {
                    state.current_path = parent.to_path_buf();
                    state.message = "Loading parent...".to_string();
                    state.is_loading = true;
                    io_tx.send(IoMessage::LoadDirectory(parent.to_path_buf())).await?;
                }
            }
        }
        KeyCode::Char('/') => {
            state.mode = Mode::Search;
            state.search_query.clear();
        }
        KeyCode::Char('y') => {
            if let Some(idx) = state.selected.selected() {
                if let Some(file) = state.filtered_files.get(idx) {
                    if file.file_type == FileType::File {
                        let dst_dir = std::env::current_dir()?;
                        let dst = dst_dir.join(&file.name);
                        
                        state.message = format!("Copying: {}...", file.name);
                        io_tx
                            .send(IoMessage::CopyFile(
                                file.local_path.clone(),
                                dst.clone(),
                            ))
                            .await?;
                    } else {
                        state.message = format!("Cannot copy directories with 'y', use 'cp' command manually");
                    }
                }
            }
        }
        KeyCode::Char('r') => {
            state.message = "Refreshing...".to_string();
            state.is_loading = true;
            io_tx.send(IoMessage::LoadDirectory(state.current_path.clone())).await?;
        }
        _ => {}
    }
    Ok(true)
}

fn handle_search_mode(key: KeyEvent, state: &mut AppState) -> Result<bool> {
    match key.code {
        KeyCode::Esc => {
            state.mode = Mode::Normal;
            state.search_query.clear();
            apply_filter(state);
        }
        KeyCode::Enter => {
            state.mode = Mode::Normal;
        }
        KeyCode::Backspace => {
            state.search_query.pop();
            apply_filter(state);
        }
        KeyCode::Char(c) => {
            state.search_query.push(c);
            apply_filter(state);
        }
        _ => {}
    }
    Ok(true)
}

fn apply_filter(state: &mut AppState) {
    if state.search_query.is_empty() {
        state.filtered_files = state.files.clone();
    } else {
        let query = state.search_query.to_lowercase();
        state.filtered_files = state
            .files
            .iter()
            .filter(|f| f.name.to_lowercase().contains(&query))
            .cloned()
            .collect();
    }
    
    if state.filtered_files.is_empty() {
        state.selected.select(None);
    } else if state.selected.selected().is_none()
        || state.selected.selected().unwrap() >= state.filtered_files.len()
    {
        state.selected.select(Some(0));
    }
}

fn ui(f: &mut Frame<CrosstermBackend<Stdout>>, state: &AppState) {
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .margin(0)
        .constraints(
            [
                Constraint::Length(3),
                Constraint::Min(5),
                Constraint::Length(3),
            ]
            .as_ref(),
        )
        .split(f.size());

    render_header(f, chunks[0], state);
    render_file_list(f, chunks[1], state);
    render_footer(f, chunks[2], state);
}

fn render_header(f: &mut Frame<CrosstermBackend<Stdout>>, area: Rect, state: &AppState) {
    let path_str = state.current_path.to_string_lossy();
    
    let header = Paragraph::new(Spans::from(vec![
        Span::styled(
            "remotefs-cli ",
            Style::default().fg(Color::Cyan).add_modifier(Modifier::BOLD),
        ),
        Span::raw(&path_str),
    ]))
    .block(Block::default().borders(Borders::ALL).title("Cached Files"))
    .wrap(Wrap { trim: true });
    
    f.render_widget(header, area);
}

fn render_file_list(f: &mut Frame<CrosstermBackend<Stdout>>, area: Rect, state: &AppState) {
    let items: Vec<ListItem> = state
        .filtered_files
        .iter()
        .map(|file| {
            let icon = match file.file_type {
                FileType::Directory => "📁",
                FileType::File => "📄",
                FileType::Symlink => "🔗",
                FileType::Other => "❓",
            };
            
            let name_color = match file.file_type {
                FileType::Directory => Color::Blue,
                FileType::File => Color::White,
                FileType::Symlink => Color::Cyan,
                FileType::Other => Color::Gray,
            };
            
            let size_str = format_size(file.size);
            
            let content = Spans::from(vec![
                Span::raw(format!("{} ", icon)),
                Span::styled(
                    format!("{:<40}", truncate(&file.name, 40)),
                    Style::default().fg(name_color),
                ),
                Span::raw(format!("{:>10} ", size_str)),
                Span::styled(
                    &file.permissions,
                    Style::default().fg(Color::Green),
                ),
            ]);
            
            ListItem::new(content)
        })
        .collect();

    let list = List::new(items)
        .block(
            Block::default()
                .borders(Borders::ALL)
                .title(Span::styled(
                    if state.search_query.is_empty() {
                        if state.is_loading {
                            "Loading...".to_string()
                        } else {
                            format!("Files ({})", state.filtered_files.len())
                        }
                    } else {
                        format!("Search: /{}", state.search_query)
                    },
                    Style::default().fg(Color::Yellow),
                )),
        )
        .highlight_style(
            Style::default()
                .bg(Color::DarkGray)
                .add_modifier(Modifier::BOLD),
        )
        .highlight_symbol("> ");

    f.render_stateful_widget(list, area, &mut state.selected.clone());
}

fn render_footer(f: &mut Frame<CrosstermBackend<Stdout>>, area: Rect, state: &AppState) {
    let help = match state.mode {
        Mode::Normal => {
            "↑↓/jk: Navigate | Enter: Open | Backspace/h: Back | /: Search | y: Copy to current dir | r: Refresh | q: Quit"
        }
        Mode::Search => {
            "Type to search | Enter: Confirm | Esc: Cancel"
        }
    };
    
    let footer = Paragraph::new(Spans::from(vec![
        Span::styled(
            format!("[{}] ", state.message),
            Style::default().fg(Color::Magenta),
        ),
        Span::styled(help, Style::default().fg(Color::Gray)),
    ]))
    .block(Block::default().borders(Borders::ALL).title("Help"))
    .wrap(Wrap { trim: true });
    
    f.render_widget(footer, area);
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

fn truncate(s: &str, max_len: usize) -> String {
    if s.len() <= max_len {
        s.to_string()
    } else {
        let mut result: String = s.chars().take(max_len - 3).collect();
        result.push_str("...");
        result
    }
}

fn format_timestamp(secs: u64) -> String {
    let datetime = chrono::DateTime::<chrono::Utc>::from_timestamp(secs as i64, 0)
        .unwrap_or_else(|| chrono::Utc::now());
    datetime.format("%Y-%m-%d %H:%M:%S").to_string()
}
