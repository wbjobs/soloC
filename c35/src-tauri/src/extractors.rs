use std::fs::File;
use std::io::Read;
use std::path::Path;
use anyhow::{Result, anyhow};
use zip::ZipArchive;
use lopdf::Document;

pub struct ExtractedBook {
    pub title: String,
    pub author: String,
    pub content: String,
    pub file_type: String,
}

pub fn extract_text(file_path: &Path) -> Result<ExtractedBook> {
    let ext = file_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    
    match ext.as_str() {
        "epub" => extract_epub(file_path),
        "pdf" => extract_pdf(file_path),
        "mobi" => extract_mobi(file_path),
        _ => Err(anyhow!("不支持的文件类型: {}", ext)),
    }
}

#[allow(dead_code)]
pub fn extract_text_from_path(path_str: String) -> Result<ExtractedBook> {
    extract_text(Path::new(&path_str))
}

fn extract_epub(file_path: &Path) -> Result<ExtractedBook> {
    let file = File::open(file_path)?;
    let mut archive = ZipArchive::new(file)?;
    
    let mut title = String::new();
    let mut author = String::new();
    let mut content = String::new();
    
    for i in 0..archive.len() {
        let mut file = archive.by_index(i)?;
        let name = file.name().to_lowercase();
        
        if name.ends_with(".opf") || name.contains("content.opf") {
            let mut opf_content = String::new();
            file.read_to_string(&mut opf_content)?;
            title = extract_from_xml(&opf_content, "dc:title");
            author = extract_from_xml(&opf_content, "dc:creator");
        }
        
        if name.ends_with(".html") || name.ends_with(".xhtml") {
            let mut html_content = String::new();
            file.read_to_string(&mut html_content)?;
            let text = strip_html(&html_content);
            if !text.trim().is_empty() {
                content.push_str(&text);
                content.push_str("\n\n");
            }
        }
    }
    
    if title.is_empty() {
        title = file_path.file_stem().and_then(|s| s.to_str()).unwrap_or("未知书名").to_string();
    }
    
    Ok(ExtractedBook {
        title,
        author: if author.is_empty() { "未知作者".to_string() } else { author },
        content,
        file_type: "epub".to_string(),
    })
}

fn extract_pdf(file_path: &Path) -> Result<ExtractedBook> {
    let doc = Document::load(file_path)?;
    
    let mut content = String::new();
    let pages = doc.get_pages();
    
    for (page_num, _) in pages.iter() {
        if let Ok(text) = doc.extract_text(&[*page_num]) {
            content.push_str(&text);
            content.push_str("\n\n");
        }
    }
    
    let title = file_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("未知书名")
        .to_string();
    
    Ok(ExtractedBook {
        title,
        author: "未知作者".to_string(),
        content,
        file_type: "pdf".to_string(),
    })
}

fn extract_mobi(file_path: &Path) -> Result<ExtractedBook> {
    let mut file = File::open(file_path)?;
    let mut buffer = Vec::new();
    file.read_to_end(&mut buffer)?;
    
    if buffer.len() < 60 {
        return Err(anyhow!("无效的 MOBI 文件"));
    }
    
    let mut title = String::new();
    let mut author = String::new();
    let mut content = String::new();
    
    if buffer.starts_with(b"PK") {
        return extract_epub(file_path);
    }
    
    if &buffer[0x3C..0x44] == b"BOOKMOBI" {
        let title_len = buffer[0x54] as usize;
        if 0x54 + 1 + title_len <= buffer.len() {
            title = String::from_utf8_lossy(&buffer[0x55..0x55 + title_len]).to_string();
        }
    }
    
    let start_offset = 78;
    if start_offset < buffer.len() {
        let text_bytes: Vec<u8> = buffer[start_offset..]
            .iter()
            .filter(|&&b| b.is_ascii() || b >= 0x80)
            .copied()
            .collect();
        content = String::from_utf8_lossy(&text_bytes).to_string();
        content = clean_text(&content);
    }
    
    if title.is_empty() {
        title = file_path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("未知书名")
            .to_string();
    }
    
    Ok(ExtractedBook {
        title,
        author: if author.is_empty() { "未知作者".to_string() } else { author },
        content,
        file_type: "mobi".to_string(),
    })
}

fn extract_from_xml(xml: &str, tag: &str) -> String {
    let open_tag = format!("<{}>", tag);
    let close_tag = format!("</{}>", tag);
    
    if let Some(start) = xml.find(&open_tag) {
        let start = start + open_tag.len();
        if let Some(end) = xml[start..].find(&close_tag) {
            return xml[start..start + end].trim().to_string();
        }
    }
    String::new()
}

fn strip_html(html: &str) -> String {
    let mut text = String::new();
    let mut in_tag = false;
    let mut last_char = ' ';
    
    for c in html.chars() {
        match c {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => {
                if c.is_whitespace() {
                    if !last_char.is_whitespace() {
                        text.push(' ');
                    }
                } else {
                    text.push(c);
                }
                last_char = c;
            }
            _ => {}
        }
    }
    
    text.trim().to_string()
}

fn clean_text(text: &str) -> String {
    text.chars()
        .filter(|c| c.is_ascii_graphic() || c.is_whitespace() || (*c as u32 >= 0x4E00 && *c as u32 <= 0x9FFF))
        .collect()
}
