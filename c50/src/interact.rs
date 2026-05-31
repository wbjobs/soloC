use dialoguer::{Editor, Input};
use anyhow::Result;

pub fn edit_commit_message(original: &str) -> Result<String> {
    println!("\n=== 编辑提交信息 ===");
    
    let edited = Editor::new()
        .edit(original)?
        .unwrap_or_else(|| original.to_string());
    
    Ok(edited)
}

pub fn edit_pr_info(title: &str, body: &str) -> Result<(String, String)> {
    println!("\n=== 编辑 PR 信息 ===");
    
    println!("\n当前标题: {}", title);
    let new_title: String = Input::new()
        .with_prompt("PR 标题 (按回车保留原值)")
        .default(title.to_string())
        .interact_text()?;
    
    println!("\n编辑 PR 描述:");
    let new_body = Editor::new()
        .edit(body)?
        .unwrap_or_else(|| body.to_string());
    
    Ok((new_title, new_body))
}
