use anyhow::Result;
use chrono::Utc;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Instant;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::sync::Mutex;
use crate::crypto::CryptoManager;
use crate::types::{EventType, RecordingFile, TerminalEvent};

#[cfg(unix)]
use std::os::unix::process::CommandExt;
#[cfg(unix)]
use nix::sys::termios;

pub struct TerminalRecorder {
    shell: String,
    output_path: Option<PathBuf>,
    encrypt: bool,
    password: Option<String>,
    start_time: Instant,
}

impl TerminalRecorder {
    pub fn new() -> Self {
        Self {
            shell: Self::detect_shell(),
            output_path: None,
            encrypt: false,
            password: None,
            start_time: Instant::now(),
        }
    }

    fn detect_shell() -> String {
        if cfg!(windows) {
            std::env::var("COMSPEC").unwrap_or_else(|_| "powershell.exe".to_string())
        } else {
            std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string())
        }
    }

    pub fn set_shell(&mut self, shell: String) {
        self.shell = shell;
    }

    pub fn set_output_path(&mut self, path: PathBuf) {
        self.output_path = Some(path);
    }

    pub fn enable_encryption(&mut self, password: Option<String>) {
        self.encrypt = true;
        self.password = password;
    }

    fn get_terminal_size(&self) -> (u16, u16) {
        if let Ok((cols, rows)) = termion::terminal_size() {
            (cols, rows)
        } else {
            (80, 24)
        }
    }

    fn get_password(&self) -> String {
        if let Some(pwd) = &self.password {
            pwd.clone()
        } else {
            rpassword::read_password_from_tty(Some("请输入加密密码: ")).unwrap_or_default()
        }
    }

    #[cfg(unix)]
    pub async fn record(&mut self) -> Result<()> {
        self.start_time = Instant::now();
        let (cols, rows) = self.get_terminal_size();
        
        let mut recording = RecordingFile::new(self.shell.clone(), cols, rows);
        
        println!("\n=== 终端录制已开始");
        println!("Shell: {}", self.shell);
        println!("终端大小: {}x{}", cols, rows);
        println!("按 Ctrl+D 或输入 'exit' 结束录制\n");

        recording.add_event(TerminalEvent {
            timestamp: 0.0,
            event_type: EventType::Resize { cols, rows },
            data: String::new(),
        });

        let recording_arc = Arc::new(Mutex::new(recording));
        let start_time = self.start_time;

        let orig_termios = termios::tcgetattr(libc::STDIN_FILENO)?;
        let mut raw_termios = orig_termios.clone();
        termios::cfmakeraw(&mut raw_termios);
        termios::tcsetattr(libc::STDIN_FILENO, termios::SetArg::TCSANOW, &raw_termios)?;

        let result = self.record_pty(recording_arc.clone(), start_time, cols, rows).await;

        termios::tcsetattr(libc::STDIN_FILENO, termios::SetArg::TCSANOW, &orig_termios)?;

        let mut recording = recording_arc.lock().await;
        recording.finalize();

        let output_path = self.output_path.clone().unwrap_or_else(|| {
            let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
            let filename = format!("termrec_{}.tr", Utc::now().format("%Y%m%d_%H%M%S"));
            home.join(filename)
        });

        self.save_recording(&recording, &output_path).await?;

        println!("\n\n录制已保存到: {}", output_path.display());
        println!("录制时长: {:.2} 秒", recording.header.duration);
        println!("事件数量: {}", recording.header.event_count);

        result
    }

    #[cfg(windows)]
    pub async fn record(&mut self) -> Result<()> {
        self.start_time = Instant::now();
        let (cols, rows) = self.get_terminal_size();
        
        let mut recording = RecordingFile::new(self.shell.clone(), cols, rows);
        
        println!("\n=== 终端录制已开始");
        println!("Shell: {}", self.shell);
        println!("终端大小: {}x{}", cols, rows);
        println!("按 Ctrl+D 或输入 'exit' 结束录制\n");

        recording.add_event(TerminalEvent {
            timestamp: 0.0,
            event_type: EventType::Resize { cols, rows },
            data: String::new(),
        });

        let recording_arc = Arc::new(Mutex::new(recording));
        let start_time = self.start_time;

        let result = self.record_pty(recording_arc.clone(), start_time, cols, rows).await;

        let mut recording = recording_arc.lock().await;
        recording.finalize();

        let output_path = self.output_path.clone().unwrap_or_else(|| {
            let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
            let filename = format!("termrec_{}.tr", Utc::now().format("%Y%m%d_%H%M%S"));
            home.join(filename)
        });

        self.save_recording(&recording, &output_path).await?;

        println!("\n\n录制已保存到: {}", output_path.display());
        println!("录制时长: {:.2} 秒", recording.header.duration);
        println!("事件数量: {}", recording.header.event_count);

        result
    }

    #[cfg(unix)]
    async fn record_pty(&self, recording: Arc<Mutex<RecordingFile>>, start_time: Instant, cols: u16, rows: u16) -> Result<()> {
        use portable_pty::{CommandBuilder, NativePtySystem, PtySize};

        let pty_system = NativePtySystem::default();
        
        let pair = pty_system.openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })?;

        let mut cmd = CommandBuilder::new(&self.shell);
        cmd.env("TERM", "xterm-256color");
        cmd.env("COLORTERM", "truecolor");
        
        let mut child = pair.master.spawn_command(cmd)?;
        
        let mut reader = pair.master.try_clone_reader()?;
        let mut writer = pair.master.try_clone_writer()?;
        
        let (tx, mut rx) = tokio::sync::mpsc::channel::<Vec<u8>>(100);

        let stdin_task = tokio::spawn(async move {
            let mut stdin = tokio::io::stdin();
            let mut buf = vec![0u8; 1024];
            
            loop {
                let n = match stdin.read(&mut buf).await {
                    Ok(0) | Err(_) => break,
                    Ok(n) => n,
                };
                
                let data = buf[..n].to_vec();
                if tx.send(data.clone()).await.is_err() {
                    break;
                }
            }
        });

        let recording_clone = recording.clone();
        let output_task = tokio::spawn(async move {
            let mut buf = vec![0u8; 4096];
            
            loop {
                let n = match reader.read(&mut buf) {
                    Ok(0) | Err(_) => break,
                    Ok(n) => n,
                };
                
                let data = &buf[..n];
                let timestamp = start_time.elapsed().as_secs_f64();
                
                if let Ok(s) = String::from_utf8(data.to_vec()) {
                    let mut rec = recording_clone.lock().await;
                    rec.add_event(TerminalEvent {
                        timestamp,
                        event_type: EventType::Output,
                        data: s,
                    });
                }
                
                let _ = std::io::Write::write(&mut std::io::stdout(), data);
                let _ = std::io::Write::flush(&mut std::io::stdout());
            }
        });

        let recording_clone = recording.clone();
        let write_task = tokio::spawn(async move {
            while let Some(data) = rx.recv().await {
                let timestamp = start_time.elapsed().as_secs_f64();
                
                if let Ok(s) = String::from_utf8(data.clone()) {
                    let mut rec = recording_clone.lock().await;
                    rec.add_event(TerminalEvent {
                        timestamp,
                        event_type: EventType::Input,
                        data: s,
                    });
                }
                
                let _ = writer.write_all(&data);
            }
        });

        let _ = child.wait();
        let _ = stdin_task.abort();
        let _ = write_task.abort();
        let _ = output_task.abort();

        Ok(())
    }

    #[cfg(windows)]
    async fn record_pty(&self, recording: Arc<Mutex<RecordingFile>>, start_time: Instant, cols: u16, rows: u16) -> Result<()> {
        use portable_pty::{CommandBuilder, NativePtySystem, PtySize};
        use windows::Win32::System::Console::{GetConsoleMode, SetConsoleMode, CONSOLE_MODE};

        let original_mode = unsafe {
            let mut mode = CONSOLE_MODE(0);
            GetConsoleMode(windows::Win32::System::Console::GetStdHandle(-10).unwrap(), &mut mode);
            mode
        };
        
        unsafe {
            let raw_mode = CONSOLE_MODE(0x0001 | 0x0002 | 0x0004 | 0x0008);
            SetConsoleMode(windows::Win32::System::Console::GetStdHandle(-10).unwrap(), raw_mode);
        }

        let result = async {
            let pty_system = NativePtySystem::default();
            
            let pair = pty_system.openpty(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })?;

            let mut cmd = CommandBuilder::new(&self.shell);
            cmd.env("TERM", "xterm-256color");
            cmd.env("COLORTERM", "truecolor");
            
            let mut child = pair.master.spawn_command(cmd)?;
            
            let mut reader = pair.master.try_clone_reader()?;
            let mut writer = pair.master.try_clone_writer()?;
            
            let (tx, mut rx) = tokio::sync::mpsc::channel::<Vec<u8>>(100);

            let stdin_task = tokio::spawn(async move {
                let mut stdin = tokio::io::stdin();
                let mut buf = vec![0u8; 1024];
                
                loop {
                    let n = match stdin.read(&mut buf).await {
                        Ok(0) | Err(_) => break,
                        Ok(n) => n,
                    };
                    
                    let data = buf[..n].to_vec();
                    if tx.send(data.clone()).await.is_err() {
                        break;
                    }
                }
            });

            let recording_clone = recording.clone();
            let output_task = tokio::spawn(async move {
                let mut buf = vec![0u8; 4096];
                
                loop {
                    let n = match reader.read(&mut buf) {
                        Ok(0) | Err(_) => break,
                        Ok(n) => n,
                    };
                    
                    let data = &buf[..n];
                    let timestamp = start_time.elapsed().as_secs_f64();
                    
                    if let Ok(s) = String::from_utf8(data.to_vec()) {
                        let mut rec = recording_clone.lock().await;
                        rec.add_event(TerminalEvent {
                            timestamp,
                            event_type: EventType::Output,
                            data: s,
                        });
                    }
                    
                    let _ = std::io::Write::write(&mut std::io::stdout(), data);
                    let _ = std::io::Write::flush(&mut std::io::stdout());
                }
            });

            let recording_clone = recording.clone();
            let write_task = tokio::spawn(async move {
                while let Some(data) = rx.recv().await {
                    let timestamp = start_time.elapsed().as_secs_f64();
                    
                    if let Ok(s) = String::from_utf8(data.clone()) {
                        let mut rec = recording_clone.lock().await;
                        rec.add_event(TerminalEvent {
                            timestamp,
                            event_type: EventType::Input,
                            data: s,
                        });
                    }
                    
                    let _ = writer.write_all(&data);
                }
            });

            let _ = child.wait();
            let _ = stdin_task.abort();
            let _ = write_task.abort();
            let _ = output_task.abort();

            Ok::<(), anyhow::Error>(())
        }.await;

        unsafe {
            SetConsoleMode(windows::Win32::System::Console::GetStdHandle(-10).unwrap(), original_mode);
        }

        result
    }

    async fn save_recording(&self, recording: &RecordingFile, path: &PathBuf) -> Result<()> {
        let json_data = serde_json::to_vec(recording)?;
        
        let final_data = if self.encrypt {
            let password = self.get_password();
            let crypto = CryptoManager::with_password(&password);
            
            let compressed = CryptoManager::compress(&json_data)?;
            crypto.encrypt(&compressed)?
        } else {
            CryptoManager::compress(&json_data)?
        };

        tokio::fs::write(path, &final_data).await?;

        Ok(())
    }

    pub async fn show_file_info(&self, path: &PathBuf) -> Result<()> {
        let data = tokio::fs::read(path).await?;
        let decompressed = CryptoManager::decompress(&data)?;
        
        let recording: RecordingFile = serde_json::from_slice(&decompressed)?;

        println!("=== 录制文件信息 ===");
        println!("文件: {}", path.display());
        println!("版本: {}", recording.header.version);
        println!("创建时间: {}", recording.header.created_at);
        println!("Shell: {}", recording.header.shell);
        println!("终端: {}", recording.header.term);
        println!("初始大小: {}x{}", recording.header.cols, recording.header.rows);
        println!("时长: {:.2} 秒", recording.header.duration);
        println!("事件数: {}", recording.header.event_count);
        println!("加密: {}", recording.header.encrypted);

        Ok(())
    }
}

impl Default for TerminalRecorder {
    fn default() -> Self {
        Self::new()
    }
}
