const CryptoJS = require('crypto-js');
const fs = require('fs');
const path = require('path');

class CryptoUtils {
  static encrypt(data, password) {
    try {
      const jsonStr = JSON.stringify(data);
      const encrypted = CryptoJS.AES.encrypt(jsonStr, password).toString();
      return {
        success: true,
        data: encrypted,
        timestamp: Date.now()
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  static decrypt(encryptedData, password) {
    try {
      const bytes = CryptoJS.AES.decrypt(encryptedData, password);
      const decryptedStr = bytes.toString(CryptoJS.enc.Utf8);
      if (!decryptedStr) {
        return {
          success: false,
          error: '密码错误或数据损坏'
        };
      }
      const data = JSON.parse(decryptedStr);
      return {
        success: true,
        data: data
      };
    } catch (error) {
      return {
        success: false,
        error: '密码错误或数据损坏'
      };
    }
  }

  static hashPassword(password) {
    return CryptoJS.SHA256(password).toString();
  }

  static verifyPassword(password, hash) {
    return this.hashPassword(password) === hash;
  }

  static exportEncryptedData(items, password, exportPath) {
    const importantItems = items.filter(item => item.starred || item.important);
    const exportData = {
      version: '1.0',
      exportTime: Date.now(),
      items: importantItems.length > 0 ? importantItems : items
    };

    const result = this.encrypt(exportData, password);
    if (!result.success) {
      return result;
    }

    try {
      fs.writeFileSync(exportPath, result.data, 'utf8');
      return {
        success: true,
        path: exportPath,
        itemCount: exportData.items.length
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  static importEncryptedData(filePath, password) {
    try {
      const encryptedData = fs.readFileSync(filePath, 'utf8');
      const result = this.decrypt(encryptedData, password);
      return result;
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = CryptoUtils;
