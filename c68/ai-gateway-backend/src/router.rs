use serde::{Deserialize, Serialize};
use regex::Regex;
use lazy_static::lazy_static;
use std::collections::HashSet;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ModelType {
    Claude,
    DeepSeek,
    Qwen,
}

impl std::fmt::Display for ModelType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ModelType::Claude => write!(f, "Claude"),
            ModelType::DeepSeek => write!(f, "DeepSeek"),
            ModelType::Qwen => write!(f, "Qwen"),
        }
    }
}

pub struct LLMRouter {
    client: reqwest::Client,
}

lazy_static! {
    static ref CODE_KEYWORD_SET: HashSet<&'static str> = {
        let keywords = vec![
            "function", "class", "def", "fn", "import", "include", "var", "let", "const",
            "if", "else", "for", "while", "loop", "return", "void", "public", "private",
            "static", "async", "await", "promise", "struct", "impl", "mod", "trait",
            "interface", "type", "export", "module", "package", "require", "console",
            "print", "println", "select", "from", "where", "create", "table", "insert",
            "update", "delete", "npm", "cargo", "pip", "docker", "git", "yarn", "pnpm",
            "java", "python", "rust", "javascript", "typescript", "cpp", "c++", "golang",
        ];
        keywords.into_iter().collect()
    };

    static ref TRANSLATION_KEYWORD_SET: HashSet<&'static str> = {
        let keywords = vec![
            "翻译", "translate", "translation", "译成", "译为", "translated",
            "英文", "中文", "英语", "汉语", "日文", "日文", "法语", "德语",
            "english", "chinese", "japanese", "french", "german",
            "en to", "zh to", "into english", "into chinese",
            "用英语", "用中文", "in english", "in chinese",
            "请翻译", "please translate", "how to say", "怎么说",
        ];
        keywords.into_iter().collect()
    };

    static ref CODE_PATTERNS: Vec<Regex> = {
        vec![
            Regex::new(r"fn\s+\w+").unwrap(),
            Regex::new(r"def\s+\w+").unwrap(),
            Regex::new(r"function\s+\w+").unwrap(),
            Regex::new(r"class\s+\w+").unwrap(),
            Regex::new(r"const\s+\w+").unwrap(),
            Regex::new(r"let\s+\w+").unwrap(),
            Regex::new(r"var\s+\w+").unwrap(),
        ]
    };
}

impl LLMRouter {
    pub fn new() -> Self {
        Self {
            client: reqwest::Client::new(),
        }
    }

    fn get_first_20_tokens(&self, text: &str) -> Vec<&str> {
        let words: Vec<&str> = text.split_whitespace().collect();
        let take = std::cmp::min(20, words.len());
        words[0..take].to_vec()
    }

    fn detect_code_fast(&self, tokens: &[&str]) -> bool {
        let mut keyword_count = 0;
        for token in tokens {
            let token_lower = token.to_lowercase();
            if CODE_KEYWORD_SET.contains(token_lower.as_str()) {
                keyword_count += 1;
            }
        }

        if keyword_count >= 2 {
            return true;
        }

        let text: String = tokens.join(" ");
        for pattern in CODE_PATTERNS.iter() {
            if pattern.is_match(&text) {
                return true;
            }
        }

        false
    }

    fn detect_translation_fast(&self, tokens: &[&str]) -> bool {
        for token in tokens {
            let token_lower = token.to_lowercase();
            if TRANSLATION_KEYWORD_SET.contains(token_lower.as_str()) {
                return true;
            }
        }
        false
    }

    pub fn route(&self, prompt: &str) -> ModelType {
        let tokens = self.get_first_20_tokens(prompt);

        if self.detect_code_fast(&tokens) {
            ModelType::DeepSeek
        } else if self.detect_translation_fast(&tokens) {
            ModelType::Qwen
        } else {
            ModelType::Claude
        }
    }

    pub async fn call_model(&self, model: ModelType, prompt: &str) -> Result<String, String> {
        match model {
            ModelType::Claude => self.call_claude(prompt).await,
            ModelType::DeepSeek => self.call_deepseek(prompt).await,
            ModelType::Qwen => self.call_qwen(prompt).await,
        }
    }

    async fn call_claude(&self, prompt: &str) -> Result<String, String> {
        Ok(format!("[Claude Response] This is a simulated response for: {}", prompt))
    }

    async fn call_deepseek(&self, prompt: &str) -> Result<String, String> {
        Ok(format!("[DeepSeek Response] This is a simulated code response for: {}", prompt))
    }

    async fn call_qwen(&self, prompt: &str) -> Result<String, String> {
        Ok(format!("[Qwen Response] This is a simulated translation response for: {}", prompt))
    }
}
