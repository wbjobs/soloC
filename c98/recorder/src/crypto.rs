use aes_gcm::{
    aead::{Aead, KeyInit, OsRng},
    Aes256Gcm, Nonce,
};
use sha2::{Sha256, Digest};
use rand::RngCore;
use anyhow::Result;
use std::fs::File;
use std::io::{Read, Write};
use flate2::write::GzEncoder;
use flate2::read::GzDecoder;
use flate2::Compression;

pub struct CryptoManager {
    key: Option<[u8; 32]>,
}

impl CryptoManager {
    pub fn new() -> Self {
        Self { key: None }
    }

    pub fn with_password(password: &str) -> Self {
        let key = Self::derive_key(password);
        Self { key: Some(key) }
    }

    fn derive_key(password: &str) -> [u8; 32] {
        let mut hasher = Sha256::new();
        hasher.update(password.as_bytes());
        let result = hasher.finalize();
        let mut key = [0u8; 32];
        key.copy_from_slice(&result[..32]);
        key
    }

    pub fn encrypt(&self, data: &[u8]) -> Result<Vec<u8>> {
        if let Some(key) = self.key {
            let cipher = Aes256Gcm::new(&key.into());
            
            let mut nonce_bytes = [0u8; 12];
            OsRng.fill_bytes(&mut nonce_bytes);
            let nonce = Nonce::from_slice(&nonce_bytes);
            
            let ciphertext = cipher.encrypt(nonce, data)
                .map_err(|e| anyhow::anyhow!("加密失败: {}", e))?;
            
            let mut result = Vec::with_capacity(12 + ciphertext.len());
            result.extend_from_slice(&nonce_bytes);
            result.extend(ciphertext);
            
            Ok(result)
        } else {
            Ok(data.to_vec())
        }
    }

    pub fn decrypt(&self, data: &[u8]) -> Result<Vec<u8>> {
        if let Some(key) = self.key {
            if data.len() < 12 {
                return Err(anyhow::anyhow!("数据格式错误"));
            }
            
            let cipher = Aes256Gcm::new(&key.into());
            let nonce = Nonce::from_slice(&data[..12]);
            let ciphertext = &data[12..];
            
            let plaintext = cipher.decrypt(nonce, ciphertext)
                .map_err(|e| anyhow::anyhow!("解密失败: {}", e))?;
            
            Ok(plaintext)
        } else {
            Ok(data.to_vec())
        }
    }

    pub fn compress(data: &[u8]) -> Result<Vec<u8>> {
        let mut encoder = GzEncoder::new(Vec::new(), Compression::best());
        encoder.write_all(data)?;
        let compressed = encoder.finish()?;
        Ok(compressed)
    }

    pub fn decompress(data: &[u8]) -> Result<Vec<u8>> {
        let mut decoder = GzDecoder::new(data);
        let mut decompressed = Vec::new();
        decoder.read_to_end(&mut decompressed)?;
        Ok(decompressed)
    }
}

impl Default for CryptoManager {
    fn default() -> Self {
        Self::new()
    }
}
