use anyhow::{Result, anyhow};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct NamedEntity {
    pub text: String,
    pub label: String,
    pub start: usize,
    pub end: usize,
}

pub struct NlpEngine {
    ner_model: Option<Arc<dyn NerModel + Send + Sync>>,
}

trait NerModel {
    fn extract_entities(&self, text: &str) -> Result<Vec<NamedEntity>>;
}

struct DummyNerModel;

impl NerModel for DummyNerModel {
    fn extract_entities(&self, text: &str) -> Result<Vec<NamedEntity>> {
        let mut entities = Vec::new();
        
        let stop_words = [
            "the", "a", "an", "and", "or", "but", "in", "on", "at", "to",
            "for", "of", "with", "by", "as", "is", "was", "are", "were",
            "be", "been", "being", "have", "has", "had", "do", "does", "did",
            "will", "would", "could", "should", "may", "might", "must", "shall",
            "can", "need", "dare", "ought", "used", "it", "its", "this",
            "that", "these", "those", "he", "she", "they", "we", "you", "i",
            "me", "him", "her", "us", "them", "my", "your", "his", "her",
            "its", "our", "their", "not", "no", "yes", "so", "very", "too",
            "also", "just", "now", "here", "there", "when", "where", "why",
            "how", "what", "which", "who", "whom", "whose", "if", "then",
            "else", "than", "about", "after", "again", "against", "all",
            "almost", "alone", "along", "already", "also", "although", "always",
            "among", "another", "any", "anybody", "anyone", "anything",
        ];
        
        let patterns = [
            ("PERSON", &[
                "爱因斯坦", "牛顿", "达尔文", "孔子", "老子", "孟子",
                "莎士比亚", "歌德", "托尔斯泰", "鲁迅", "毛泽东", "孙中山",
                "华盛顿", "林肯", "罗斯福", "丘吉尔", "斯大林", "拿破仑",
                "比尔盖茨", "乔布斯", "马斯克", "扎克伯格", "马云", "马化腾",
            ]),
            ("LOCATION", &[
                "北京", "上海", "广州", "深圳", "香港", "台湾",
                "纽约", "伦敦", "巴黎", "东京", "柏林", "罗马",
                "中国", "美国", "英国", "法国", "德国", "日本",
                "俄罗斯", "印度", "巴西", "澳大利亚", "加拿大",
            ]),
            ("ORGANIZATION", &[
                "联合国", "世界银行", "国际货币基金组织", "北约", "欧盟",
                "谷歌", "微软", "苹果", "亚马逊", "腾讯", "阿里巴巴",
                "百度", "字节跳动", "华为", "小米", "三星",
            ]),
            ("WORK_OF_ART", &[
                "红楼梦", "西游记", "三国演义", "水浒传",
                "哈姆雷特", "罗密欧与朱丽叶", "堂吉诃德", "战争与和平",
            ]),
            ("DATE", &[
                "公元前", "公元", "世纪", "年代",
            ]),
        ];
        
        let text_lower = text.to_lowercase();
        let chars: Vec<char> = text.chars().collect();
        
        for (label, keywords) in patterns.iter() {
            for keyword in *keywords {
                let keyword_lower = keyword.to_lowercase();
                let keyword_len = keyword.chars().count();
                
                let mut start = 0;
                while let Some(pos) = text_lower[start..].find(&keyword_lower) {
                    let abs_start = start + pos;
                    let abs_end = abs_start + keyword_len;
                    
                    let is_ascii = keyword.chars().all(|c| c.is_ascii_alphabetic());
                    if is_ascii {
                        let before = if abs_start > 0 { chars.get(abs_start - 1).copied() } else { None };
                        let after = chars.get(abs_end).copied();
                        
                        let is_boundary_before = before.map_or(true, |c| !c.is_ascii_alphabetic());
                        let is_boundary_after = after.map_or(true, |c| !c.is_ascii_alphabetic());
                        
                        if !is_boundary_before || !is_boundary_after {
                            start = abs_end;
                            continue;
                        }
                        
                        if stop_words.contains(&keyword_lower.as_str()) {
                            start = abs_end;
                            continue;
                        }
                    }
                    
                    entities.push(NamedEntity {
                        text: keyword.to_string(),
                        label: label.to_string(),
                        start: abs_start,
                        end: abs_end,
                    });
                    start = abs_end;
                }
            }
        }
        
        entities.sort_by_key(|e| e.start);
        
        Ok(entities)
    }
}

impl NlpEngine {
    pub fn new() -> Result<Self> {
        let ner_model: Option<Arc<dyn NerModel + Send + Sync>> = Some(Arc::new(DummyNerModel));
        
        Ok(Self {
            ner_model,
        })
    }
    
    pub fn extract_entities(&self, text: &str) -> Result<Vec<NamedEntity>> {
        if let Some(model) = &self.ner_model {
            model.extract_entities(text)
        } else {
            Err(anyhow!("NLP 模型未初始化"))
        }
    }
}
