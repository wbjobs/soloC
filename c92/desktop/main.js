const { app, BrowserWindow, clipboard, ipcMain, Tray, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const zlib = require('zlib');
const CryptoJS = require('crypto-js');
const { v4: uuidv4 } = require('uuid');

const CONFIG = {
  API_URL: 'http://localhost:8080/api',
  ENCRYPTION_KEY: 'clipboard-sync-secret-key-2024',
  POLL_INTERVAL: 5000,
  MAX_HISTORY: 1000,
  ENABLE_COMPRESSION: true,
  COMPRESSION_THRESHOLD: 1024
};

let mainWindow;
let tray;
let lastClipboardText = '';
let lastClipboardImageHash = '';
let lastClipboardFilesHash = '';
let syncInterval = null;

const userDataPath = app.getPath('userData');
const dataPath = path.join(userDataPath, 'clipboard-data');

if (!fs.existsSync(dataPath)) {
  fs.mkdirSync(dataPath, { recursive: true });
}

function encrypt(text) {
  return CryptoJS.AES.encrypt(text, CONFIG.ENCRYPTION_KEY).toString();
}

function decrypt(ciphertext) {
  const bytes = CryptoJS.AES.decrypt(ciphertext, CONFIG.ENCRYPTION_KEY);
  return bytes.toString(CryptoJS.enc.Utf8);
}

function compressData(data) {
  if (!CONFIG.ENABLE_COMPRESSION) return data;
  
  try {
    const jsonStr = JSON.stringify(data);
    if (jsonStr.length < CONFIG.COMPRESSION_THRESHOLD) {
      return data;
    }
    
    const compressed = zlib.gzipSync(Buffer.from(jsonStr, 'utf8'));
    return {
      _compressed: true,
      data: compressed.toString('base64')
    };
  } catch (e) {
    console.warn('Compression failed, sending uncompressed:', e);
    return data;
  }
}

function decompressData(data) {
  if (!data || !data._compressed) return data;
  
  try {
    const compressed = Buffer.from(data.data, 'base64');
    const decompressed = zlib.gunzipSync(compressed);
    return JSON.parse(decompressed.toString('utf8'));
  } catch (e) {
    console.error('Decompression failed:', e);
    return null;
  }
}

function loadJSON(filename, defaultValue = []) {
  const filepath = path.join(dataPath, filename);
  try {
    if (fs.existsSync(filepath)) {
      const content = fs.readFileSync(filepath, 'utf8');
      return JSON.parse(content);
    }
  } catch (e) {
    console.error(`Error loading ${filename}:`, e);
  }
  return defaultValue;
}

function saveJSON(filename, data) {
  const filepath = path.join(dataPath, filename);
  try {
    fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error(`Error saving ${filename}:`, e);
  }
}

let settings = loadJSON('settings.json', {
  autoStart: true,
  syncEnabled: true,
  showNotifications: true,
  deviceName: os.hostname(),
  deviceUUID: uuidv4(),
  cleanupEnabled: false,
  cleanupInterval: 24,
  cleanupMode: 'time',
  retentionDays: 30,
  maxTotalSize: 100,
  lastCleanupTime: null
});

let authData = loadJSON('auth.json', { token: null, user: null });
let clipboardHistory = loadJSON('history.json', []);

function maskSensitiveData(text) {
  if (!text) return text;
  
  let masked = text;
  
  const idCardRegex = /(^|[^\d])(\d{6})(\d{8})(\d{4})([^\d]|$)/g;
  masked = masked.replace(idCardRegex, '$1$2********$4$5');
  
  const phoneRegex = /(^|[^\d])(1[3-9]\d)(\d{4})(\d{4})([^\d]|$)/g;
  masked = masked.replace(phoneRegex, '$1$2****$4$5');
  
  const bankCardRegex = /(^|[^\d])(\d{4})(\d{8,12})(\d{4})([^\d]|$)/g;
  masked = masked.replace(bankCardRegex, '$1$2********$4$5');
  
  return masked;
}

function isSensitiveData(text) {
  if (!text) return false;
  
  const patterns = [
    /\d{17}[\dXx]/,
    /1[3-9]\d{9}/,
    /\d{16,19}/
  ];
  
  return patterns.some(pattern => pattern.test(text));
}

function checkClipboard() {
  try {
    const hasFiles = clipboard.has('filePaths');
    if (hasFiles && process.platform === 'win32') {
      const files = clipboard.read('filePaths');
      if (files && files.length > 0) {
        const filesHash = CryptoJS.MD5(JSON.stringify(files)).toString();
        if (filesHash !== lastClipboardFilesHash) {
          lastClipboardFilesHash = filesHash;
          const fileContent = JSON.stringify(files);
          addClipboardItem('files', fileContent);
        }
      }
    }

    const text = clipboard.readText();
    
    if (text && text !== lastClipboardText && text.trim().length > 0) {
      lastClipboardText = text;
      addClipboardItem('text', text);
    }

    const image = clipboard.readImage();
    if (!image.isEmpty()) {
      const imageData = process.platform === 'linux' ? image.toPNG() : image.toPNG();
      const imageHash = CryptoJS.MD5(imageData.toString('base64')).toString();
      if (imageHash !== lastClipboardImageHash) {
        lastClipboardImageHash = imageHash;
        const imagePath = path.join(dataPath, `images/${uuidv4()}.png`);
        const imageDir = path.dirname(imagePath);
        if (!fs.existsSync(imageDir)) {
          fs.mkdirSync(imageDir, { recursive: true });
        }
        
        let imageBuffer = imageData;
        if (process.platform === 'linux') {
          const pngHeader = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
          if (!imageData.slice(0, 8).equals(pngHeader)) {
            try {
              const { nativeImage } = require('electron');
              const normalizedImage = nativeImage.createFromBuffer(imageData);
              imageBuffer = normalizedImage.toPNG();
            } catch (err) {
              console.warn('Failed to normalize Linux image format:', err);
            }
          }
        }
        
        fs.writeFileSync(imagePath, imageBuffer);
        addClipboardItem('image', '', imagePath);
      }
    }
  } catch (e) {
    console.error('Error checking clipboard:', e);
  }
}

function addClipboardItem(type, content, imagePath = '', tags = '') {
  let displayContent = content;
  if (type === 'files') {
    try {
      const files = JSON.parse(content);
      displayContent = `📁 ${files.length} 个文件: ${files.map(f => path.basename(f)).join(', ')}`;
    } catch (e) {
      displayContent = content;
    }
  } else {
    displayContent = maskSensitiveData(content);
  }

  const item = {
    id: uuidv4(),
    type: type,
    content: content,
    contentHash: CryptoJS.SHA256(content).toString(),
    imagePath: imagePath,
    tags: tags,
    isSensitive: type !== 'files' && isSensitiveData(content),
    displayContent: displayContent,
    modifiedTime: new Date().toISOString(),
    isDeleted: false,
    synced: false,
    deviceUUID: settings.deviceUUID
  };

  clipboardHistory.unshift(item);
  
  if (clipboardHistory.length > CONFIG.MAX_HISTORY) {
    clipboardHistory = clipboardHistory.slice(0, CONFIG.MAX_HISTORY);
  }
  
  saveJSON('history.json', clipboardHistory);
  
  if (mainWindow) {
    mainWindow.webContents.send('clipboard-updated', item);
  }

  return item;
}

async function syncWithServer() {
  if (!settings.syncEnabled || !authData.token) return;

  try {
    const axios = require('axios');
    const lastSync = settings.lastSyncTime || new Date(0).toISOString();

    const unsyncedItems = clipboardHistory.filter(item => !item.synced && !item.isDeleted);
    const syncData = unsyncedItems.map(item => ({
      data_id: item.id,
      data_type: item.type,
      content: encrypt(item.content),
      content_hash: item.contentHash,
      image_path: item.imagePath,
      tags: item.tags,
      is_sensitive: item.isSensitive,
      is_deleted: item.isDeleted,
      modified_time: item.modifiedTime,
      device_uuid: item.deviceUUID
    }));

    const payload = compressData({
      deviceUUID: settings.deviceUUID,
      lastSyncTime: lastSync,
      data: syncData
    });

    const response = await axios.post(
      `${CONFIG.API_URL}/clipboard/sync`,
      payload,
      {
        headers: { 
          Authorization: `Bearer ${authData.token}`,
          'Content-Encoding': payload._compressed ? 'gzip' : 'identity'
        }
      }
    );

    const { created, updated, conflicts, server_data } = response.data;

    clipboardHistory.forEach(item => {
      if (created.includes(item.id) || updated.includes(item.id)) {
        item.synced = true;
      }
    });

    server_data.forEach(serverItem => {
      const existing = clipboardHistory.find(item => item.id === serverItem.data_id);
      if (!existing) {
        try {
          const decryptedContent = decrypt(serverItem.content);
          let displayContent = decryptedContent;
          let normalizedImagePath = serverItem.image_path;
          
          if (serverItem.data_type === 'files') {
            try {
              const files = JSON.parse(decryptedContent);
              displayContent = `📁 ${files.length} 个文件: ${files.map(f => path.basename(f)).join(', ')}`;
            } catch (e) {
              displayContent = decryptedContent;
            }
          } else if (serverItem.data_type === 'image') {
            if (normalizedImagePath && fs.existsSync(normalizedImagePath)) {
              try {
                const { nativeImage } = require('electron');
                const imageBuffer = fs.readFileSync(normalizedImagePath);
                const image = nativeImage.createFromBuffer(imageBuffer);
                if (!image.isEmpty()) {
                  const normalizedBuffer = image.toPNG();
                  const pngHeader = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
                  if (!normalizedBuffer.slice(0, 8).equals(pngHeader)) {
                    const regeneratedImage = nativeImage.createFromBuffer(normalizedBuffer);
                    normalizedImagePath = path.join(dataPath, `images/${uuidv4()}_normalized.png`);
                    fs.writeFileSync(normalizedImagePath, regeneratedImage.toPNG());
                  }
                }
              } catch (e) {
                console.warn('Failed to normalize received image:', e);
              }
            }
            displayContent = '🖼️ 图片';
          } else {
            displayContent = maskSensitiveData(decryptedContent);
          }
          
          clipboardHistory.unshift({
            id: serverItem.data_id,
            type: serverItem.data_type,
            content: decryptedContent,
            contentHash: serverItem.content_hash,
            imagePath: normalizedImagePath,
            isSensitive: serverItem.data_type !== 'files' && serverItem.is_sensitive,
            displayContent: displayContent,
            modifiedTime: serverItem.modified_time,
            isDeleted: serverItem.is_deleted,
            synced: true,
            deviceUUID: serverItem.device_uuid
          });
        } catch (e) {
          console.error('Error decrypting server item:', e);
        }
      }
    });

    settings.lastSyncTime = new Date().toISOString();
    saveJSON('settings.json', settings);
    saveJSON('history.json', clipboardHistory);

    if (mainWindow && server_data.length > 0) {
      mainWindow.webContents.send('sync-completed', { received: server_data.length });
    }
  } catch (e) {
    console.error('Sync error:', e.message);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    icon: path.join(__dirname, 'icon.png')
  });

  mainWindow.loadFile('index.html');

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createTray() {
  const iconPath = path.join(__dirname, 'tray-icon.png');
  tray = new Tray(fs.existsSync(iconPath) ? iconPath : path.join(__dirname, 'icon.png'));

  const contextMenu = Menu.buildFromTemplate([
    { label: '打开面板', click: () => { if (mainWindow) mainWindow.show(); else createWindow(); } },
    { type: 'separator' },
    { label: '启用同步', type: 'checkbox', checked: settings.syncEnabled, click: (item) => {
      settings.syncEnabled = item.checked;
      saveJSON('settings.json', settings);
    }},
    { type: 'separator' },
    { label: '退出', click: () => { app.quit(); } }
  ]);

  tray.setToolTip('Clipboard Sync');
  tray.setContextMenu(contextMenu);
  tray.on('click', () => {
    if (mainWindow) mainWindow.show();
    else createWindow();
  });
}

ipcMain.handle('get-clipboard-history', async (event, filters = {}) => {
  let filtered = [...clipboardHistory.filter(item => !item.isDeleted)];

  if (filters.deviceUUID) {
    filtered = filtered.filter(item => item.deviceUUID === filters.deviceUUID);
  }
  if (filters.tag) {
    filtered = filtered.filter(item => item.tags && item.tags.includes(filters.tag));
  }
  if (filters.startTime) {
    filtered = filtered.filter(item => item.modifiedTime >= filters.startTime);
  }
  if (filters.endTime) {
    filtered = filtered.filter(item => item.modifiedTime <= filters.endTime);
  }

  const page = filters.page || 1;
  const pageSize = filters.pageSize || 50;
  const start = (page - 1) * pageSize;
  const end = start + pageSize;

  return {
    data: filtered.slice(start, end),
    total: filtered.length,
    page,
    pageSize
  };
});

ipcMain.handle('copy-to-clipboard', async (event, id) => {
  const item = clipboardHistory.find(i => i.id === id);
  if (item) {
    if (item.type === 'text') {
      clipboard.writeText(item.content);
    } else if (item.type === 'image' && item.imagePath) {
      const { nativeImage } = require('electron');
      const image = nativeImage.createFromPath(item.imagePath);
      clipboard.writeImage(image);
    } else if (item.type === 'files') {
      try {
        const files = JSON.parse(item.content);
        if (process.platform === 'win32') {
          clipboard.write('filePaths', files);
        } else {
          clipboard.writeText(files.join('\n'));
        }
      } catch (e) {
        console.error('Failed to write files to clipboard:', e);
      }
    }
    return true;
  }
  return false;
});

ipcMain.handle('delete-clipboard-item', async (event, id) => {
  const item = clipboardHistory.find(i => i.id === id);
  if (item) {
    item.isDeleted = true;
    item.modifiedTime = new Date().toISOString();
    saveJSON('history.json', clipboardHistory);
    return true;
  }
  return false;
});

ipcMain.handle('update-clipboard-tags', async (event, id, tags) => {
  const item = clipboardHistory.find(i => i.id === id);
  if (item) {
    item.tags = tags;
    item.modifiedTime = new Date().toISOString();
    item.synced = false;
    saveJSON('history.json', clipboardHistory);
    return true;
  }
  return false;
});

ipcMain.handle('get-all-tags', async () => {
  const tagSet = new Set();
  clipboardHistory.forEach(item => {
    if (item.tags && !item.isDeleted) {
      item.tags.split(',').forEach(tag => {
        const trimmed = tag.trim();
        if (trimmed) tagSet.add(trimmed);
      });
    }
  });
  return Array.from(tagSet);
});

ipcMain.handle('login', async (event, email, password) => {
  try {
    const axios = require('axios');
    const response = await axios.post(`${CONFIG.API_URL}/auth/login`, { email, password });
    authData = response.data;
    saveJSON('auth.json', authData);
    return { success: true, user: authData.user };
  } catch (e) {
    return { success: false, error: e.response?.data?.error || e.message };
  }
});

ipcMain.handle('register', async (event, username, email, password) => {
  try {
    const axios = require('axios');
    const response = await axios.post(`${CONFIG.API_URL}/auth/register`, { username, email, password });
    return { success: true };
  } catch (e) {
    return { success: false, error: e.response?.data?.error || e.message };
  }
});

ipcMain.handle('logout', async () => {
  authData = { token: null, user: null };
  saveJSON('auth.json', authData);
  return true;
});

ipcMain.handle('get-auth-status', async () => {
  return {
    isLoggedIn: !!authData.token,
    user: authData.user,
    deviceUUID: settings.deviceUUID
  };
});

ipcMain.handle('get-settings', async () => settings);

ipcMain.handle('update-settings', async (event, newSettings) => {
  settings = { ...settings, ...newSettings };
  saveJSON('settings.json', settings);
  return settings;
});

ipcMain.handle('backup-data', async (event, backupPath) => {
  try {
    const backupData = {
      version: '1.0',
      backupTime: new Date().toISOString(),
      settings: settings,
      history: clipboardHistory
    };
    fs.writeFileSync(backupPath, JSON.stringify(backupData, null, 2));
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('restore-data', async (event, backupPath) => {
  try {
    const content = fs.readFileSync(backupPath, 'utf8');
    const backupData = JSON.parse(content);
    
    if (backupData.settings) {
      settings = { ...settings, ...backupData.settings };
      saveJSON('settings.json', settings);
    }
    
    if (backupData.history) {
      clipboardHistory = backupData.history;
      saveJSON('history.json', clipboardHistory);
    }
    
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('register-device', async (event, deviceName) => {
  if (!authData.token) return { success: false, error: 'Not logged in' };
  
  try {
    const axios = require('axios');
    const response = await axios.post(
      `${CONFIG.API_URL}/devices`,
      {
        device_name: deviceName || settings.deviceName,
        device_type: 'desktop',
        os: process.platform
      },
      { headers: { Authorization: `Bearer ${authData.token}` } }
    );
    settings.deviceUUID = response.data.device_uuid;
    saveJSON('settings.json', settings);
    return { success: true, device: response.data.device };
  } catch (e) {
    return { success: false, error: e.response?.data?.error || e.message };
  }
});

ipcMain.handle('sync-now', async () => {
  await syncWithServer();
  return { success: true };
});

ipcMain.handle('run-cleanup', async () => {
  const result = await runCleanup();
  return result;
});

ipcMain.handle('restart-cleanup-scheduler', async () => {
  startCleanupScheduler();
  return { success: true };
});

async function runCleanup() {
  if (!settings.cleanupEnabled) {
    return { success: true, message: 'Cleanup not enabled', deleted: 0 };
  }

  const now = new Date();
  let deletedCount = 0;

  if (settings.cleanupMode === 'time' || settings.cleanupMode === 'both') {
    const cutoffTime = new Date(now.getTime() - settings.retentionDays * 24 * 60 * 60 * 1000);
    const toDelete = clipboardHistory.filter(item => 
      !item.isDeleted && new Date(item.modifiedTime) < cutoffTime
    );
    
    toDelete.forEach(item => {
      item.isDeleted = true;
      item.modifiedTime = now.toISOString();
      item.synced = false;
      deletedCount++;
      
      if (item.imagePath && fs.existsSync(item.imagePath)) {
        try {
          fs.unlinkSync(item.imagePath);
        } catch (e) {
          console.warn('Failed to delete image file:', e);
        }
      }
    });
  }

  if (settings.cleanupMode === 'size' || settings.cleanupMode === 'both') {
    let totalSize = 0;
    const itemsWithSize = clipboardHistory
      .filter(item => !item.isDeleted)
      .map(item => {
        const size = item.content ? item.content.length * 2 : 0;
        totalSize += size;
        return { ...item, size, sortTime: new Date(item.modifiedTime) };
      })
      .sort((a, b) => a.sortTime - b.sortTime);

    const maxSizeBytes = settings.maxTotalSize * 1024 * 1024;
    let sizeToRemove = Math.max(0, totalSize - maxSizeBytes);

    for (const item of itemsWithSize) {
      if (sizeToRemove <= 0) break;
      
      const fullItem = clipboardHistory.find(i => i.id === item.id);
      if (fullItem && !fullItem.isDeleted) {
        fullItem.isDeleted = true;
        fullItem.modifiedTime = now.toISOString();
        fullItem.synced = false;
        deletedCount++;
        sizeToRemove -= item.size;
        
        if (fullItem.imagePath && fs.existsSync(fullItem.imagePath)) {
          try {
            fs.unlinkSync(fullItem.imagePath);
          } catch (e) {
            console.warn('Failed to delete image file:', e);
          }
        }
      }
    }
  }

  saveJSON('history.json', clipboardHistory);
  settings.lastCleanupTime = now.toISOString();
  saveJSON('settings.json', settings);

  return { success: true, deleted: deletedCount };
}

let cleanupInterval = null;

function startCleanupScheduler() {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
  }

  if (settings.cleanupEnabled) {
    const intervalMs = settings.cleanupInterval * 60 * 60 * 1000;
    cleanupInterval = setInterval(runCleanup, intervalMs);
  }
}

startCleanupScheduler();

app.whenReady().then(() => {
  createWindow();
  createTray();

  setInterval(checkClipboard, 500);

  syncInterval = setInterval(syncWithServer, CONFIG.POLL_INTERVAL);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('quit', () => {
  if (syncInterval) {
    clearInterval(syncInterval);
  }
});
