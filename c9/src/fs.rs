//! 文件系统工具模块 - 辅助函数
//! 注意：完整的 FUSE 实现已被移除，改为使用 sync + browse 模式

use anyhow::Result;
use std::path::Path;

pub fn ensure_dir_exists(path: &Path) -> Result<()> {
    if !path.exists() {
        std::fs::create_dir_all(path)?;
    }
    Ok(())
}

pub fn get_file_size(path: &Path) -> Result<u64> {
    let metadata = std::fs::metadata(path)?;
    Ok(metadata.len())
}

pub fn is_directory(path: &Path) -> bool {
    path.is_dir()
}

pub fn is_file(path: &Path) -> bool {
    path.is_file()
}
