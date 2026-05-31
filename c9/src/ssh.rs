use anyhow::{Context, Result};
use std::net::TcpStream;
use std::path::PathBuf;
use ssh2::Session;

#[derive(Debug, Clone)]
pub struct RemotePath {
    pub user: String,
    pub host: String,
    pub port: u16,
    pub path: String,
}

impl RemotePath {
    pub fn parse(input: &str, port: u16) -> Result<Self> {
        if !input.contains(':') {
            return Err(anyhow::anyhow!("Invalid remote path format. Expected: user@host:/path"));
        }
        
        let parts: Vec<&str> = input.splitn(2, ':').collect();
        let user_host = parts[0];
        let path = parts[1].to_string();
        
        let (user, host) = if user_host.contains('@') {
            let uh_parts: Vec<&str> = user_host.splitn(2, '@').collect();
            (uh_parts[0].to_string(), uh_parts[1].to_string())
        } else {
            let current_user = std::env::var("USER").unwrap_or_else(|_| "root".to_string());
            (current_user, user_host.to_string())
        };
        
        Ok(RemotePath {
            user,
            host,
            port,
            path,
        })
    }
}

pub struct SshClient {
    session: Session,
}

impl SshClient {
    pub fn connect(remote: &RemotePath) -> Result<Self> {
        let tcp = TcpStream::connect((remote.host.as_str(), remote.port))
            .with_context(|| format!("Failed to connect to {}:{}", remote.host, remote.port))?;
        
        let mut session = Session::new().context("Failed to create SSH session")?;
        session.set_tcp_stream(tcp);
        session.handshake().context("SSH handshake failed")?;
        
        session.userauth_agent(&remote.user)
            .or_else(|_| {
                let home = dirs::home_dir().context("Failed to get home directory")?;
                let key_path = home.join(".ssh").join("id_rsa");
                session.userauth_pubkey_file(&remote.user, None, &key_path, None)
            })
            .with_context(|| format!("Authentication failed for user {}", remote.user))?;
        
        if !session.authenticated() {
            return Err(anyhow::anyhow!("Authentication failed"));
        }
        
        Ok(SshClient { session })
    }
    
    pub fn list_dir(&mut self, path: &str) -> Result<Vec<RemoteFile>> {
        let sftp = self.session.sftp().context("Failed to create SFTP session")?;
        let dir = sftp.opendir(std::path::Path::new(path))
            .with_context(|| format!("Failed to open directory: {}", path))?;
        
        let mut files = Vec::new();
        
        for entry in dir.readdir()? {
            let (file_path, stat) = entry;
            let name = file_path.file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("")
                .to_string();
            
            if name == "." || name == ".." {
                continue;
            }
            
            let file_type = if stat.is_dir() {
                FileType::Directory
            } else if stat.is_file() {
                FileType::File
            } else if stat.is_symlink() {
                FileType::Symlink
            } else {
                FileType::Other
            };
            
            let permissions_str = if let Some(perm) = stat.perm {
                permissions_to_string(perm, &file_type)
            } else {
                "----------".to_string()
            };
            
            files.push(RemoteFile {
                name,
                path: file_path.to_string_lossy().to_string(),
                size: stat.size.unwrap_or(0),
                permissions: stat.perm.unwrap_or(0),
                permissions_string: permissions_str,
                file_type,
                modified: stat.mtime,
            });
        }
        
        files.sort_by(|a, b| {
            a.file_type.cmp(&b.file_type).then_with(|| a.name.cmp(&b.name))
        });
        
        Ok(files)
    }
    
    pub fn read_file(&mut self, path: &str) -> Result<Vec<u8>> {
        let sftp = self.session.sftp().context("Failed to create SFTP session")?;
        let mut file = sftp.open(std::path::Path::new(path))
            .with_context(|| format!("Failed to open file: {}", path))?;
        
        let mut content = Vec::new();
        std::io::Read::read_to_end(&mut file, &mut content)?;
        Ok(content)
    }
    
    pub fn write_file(&mut self, path: &str, content: &[u8]) -> Result<()> {
        let sftp = self.session.sftp().context("Failed to create SFTP session")?;
        
        let path_obj = std::path::Path::new(path);
        if let Some(parent) = path_obj.parent() {
            self.ensure_remote_dir(&sftp, parent)?;
        }
        
        let mut file = sftp.create(path_obj)
            .with_context(|| format!("Failed to create file: {}", path))?;
        
        std::io::Write::write_all(&mut file, content)?;
        Ok(())
    }
    
    pub fn delete_file(&mut self, path: &str) -> Result<()> {
        let sftp = self.session.sftp().context("Failed to create SFTP session")?;
        sftp.unlink(std::path::Path::new(path))
            .with_context(|| format!("Failed to delete file: {}", path))?;
        Ok(())
    }
    
    pub fn create_dir(&mut self, path: &str) -> Result<()> {
        let sftp = self.session.sftp().context("Failed to create SFTP session")?;
        self.ensure_remote_dir(&sftp, std::path::Path::new(path))?;
        Ok(())
    }
    
    pub fn delete_dir(&mut self, path: &str) -> Result<()> {
        let sftp = self.session.sftp().context("Failed to create SFTP session")?;
        self.delete_remote_dir_recursive(&sftp, std::path::Path::new(path))?;
        Ok(())
    }
    
    fn ensure_remote_dir(
        &mut self,
        sftp: &ssh2::Sftp,
        path: &std::path::Path,
    ) -> Result<()> {
        if path.as_os_str().is_empty() || path == std::path::Path::new("/") {
            return Ok(());
        }
        
        if let Some(parent) = path.parent() {
            self.ensure_remote_dir(sftp, parent)?;
        }
        
        match sftp.stat(path) {
            Ok(_) => Ok(()),
            Err(_) => {
                sftp.mkdir(path, 0o755)
                    .with_context(|| format!("Failed to create directory: {:?}", path))?;
                Ok(())
            }
        }
    }
    
    fn delete_remote_dir_recursive(
        &mut self,
        sftp: &ssh2::Sftp,
        path: &std::path::Path,
    ) -> Result<()> {
        if let Ok(mut dir) = sftp.opendir(path) {
            for entry in dir.readdir()? {
                let (entry_path, stat) = entry;
                let name = entry_path.file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("");
                
                if name == "." || name == ".." {
                    continue;
                }
                
                if stat.is_dir() {
                    self.delete_remote_dir_recursive(sftp, &entry_path)?;
                } else {
                    let _ = sftp.unlink(&entry_path);
                }
            }
        }
        
        let _ = sftp.rmdir(path);
        Ok(())
    }
    
    pub fn stat(&mut self, path: &str) -> Result<RemoteFile> {
        let sftp = self.session.sftp().context("Failed to create SFTP session")?;
        let stat = sftp.stat(std::path::Path::new(path))
            .with_context(|| format!("Failed to stat path: {}", path))?;
        
        let file_path = PathBuf::from(path);
        let name = file_path.file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();
        
        let file_type = if stat.is_dir() {
            FileType::Directory
        } else if stat.is_file() {
            FileType::File
        } else if stat.is_symlink() {
            FileType::Symlink
        } else {
            FileType::Other
        };
        
        let permissions_str = if let Some(perm) = stat.perm {
            permissions_to_string(perm, &file_type)
        } else {
            "----------".to_string()
        };
        
        Ok(RemoteFile {
            name,
            path: path.to_string(),
            size: stat.size.unwrap_or(0),
            permissions: stat.perm.unwrap_or(0),
            permissions_string: permissions_str,
            file_type,
            modified: stat.mtime,
        })
    }
}

fn permissions_to_string(perm: u32, file_type: &FileType) -> String {
    let mut s = String::new();
    
    s.push(match file_type {
        FileType::Directory => 'd',
        FileType::Symlink => 'l',
        FileType::File => '-',
        FileType::Other => '?',
    });
    
    let owner = (perm >> 6) & 0o7;
    let group = (perm >> 3) & 0o7;
    let other = perm & 0o7;
    
    push_perm_triple(&mut s, owner);
    push_perm_triple(&mut s, group);
    push_perm_triple(&mut s, other);
    
    s
}

fn push_perm_triple(s: &mut String, perm: u32) {
    s.push(if perm & 0o4 != 0 { 'r' } else { '-' });
    s.push(if perm & 0o2 != 0 { 'w' } else { '-' });
    s.push(if perm & 0o1 != 0 { 'x' } else { '-' });
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub enum FileType {
    Directory,
    File,
    Symlink,
    Other,
}

#[derive(Debug, Clone)]
pub struct RemoteFile {
    pub name: String,
    pub path: String,
    pub size: u64,
    pub permissions: u32,
    pub permissions_string: String,
    pub file_type: FileType,
    pub modified: Option<u64>,
}

impl RemoteFile {
    pub fn permissions_string(&self) -> &str {
        &self.permissions_string
    }
}
