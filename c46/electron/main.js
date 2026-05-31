const { app, BrowserWindow, globalShortcut, clipboard, ipcMain, Tray, Menu, nativeImage, dialog } = require('electron');
const Store = require('electron-store');
const path = require('path');
const fs = require('fs');
const CryptoUtils = require('./crypto-utils');

const storePath = path.join(__dirname, '../data');
if (!fs.existsSync(storePath)) {
  fs.mkdirSync(storePath, { recursive: true });
}

const imageCachePath = path.join(storePath, 'images');
if (!fs.existsSync(imageCachePath)) {
  fs.mkdirSync(imageCachePath, { recursive: true });
}

const syncPath = path.join(storePath, 'sync');
if (!fs.existsSync(syncPath)) {
  fs.mkdirSync(syncPath, { recursive: true });
}

const store = new Store({ cwd: storePath });

let mainWindow = null;
let tray = null;
let clipboardHistory = store.get('clipboardHistory', []);
let blacklistedApps = store.get('blacklistedApps', []);
let lastClipboardHash = null;

const CLIPBOARD_CHECK_INTERVAL = 500;
const MAX_HISTORY = 500;
const isWindows = process.platform === 'win32';

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 500,
    height: 600,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true,
    },
  });

  const startUrl = process.env.VITE_DEV_SERVER_URL || `file://${path.join(__dirname, '../dist/index.html')}`;
  
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(startUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('blur', () => {
    mainWindow.hide();
  });
}

function getCurrentAppName() {
  return 'unknown';
}

function hashContent(content) {
  if (typeof content === 'string') {
    return content.substring(0, 100) + content.length;
  }
  if (Buffer.isBuffer(content)) {
    return content.toString('base64', 0, 50) + content.length;
  }
  return JSON.stringify(content);
}

function getClipboardFiles() {
  try {
    if (isWindows) {
      const formats = clipboard.availableFormats();
      if (formats.includes('CF_HDROP')) {
        const filePaths = clipboard.read('text/uri-list');
        if (filePaths) {
          return filePaths;
        }
      }
    }
    const fileUrl = clipboard.read('public.file-url');
    if (fileUrl) {
      return fileUrl;
    }
    const text = clipboard.readText();
    if (text && /^[A-Za-z]:\\/.test(text) || text.startsWith('file://')) {
      return text;
    }
    return null;
  } catch (e) {
    return null;
  }
}

function saveImageToCache(image) {
  const timestamp = Date.now();
  const imagePath = path.join(imageCachePath, `${timestamp}.png`);
  const pngBuffer = image.toPNG();
  fs.writeFileSync(imagePath, pngBuffer);
  return {
    path: imagePath,
    dataUrl: image.toDataURL(),
    size: pngBuffer.length
  };
}

function checkClipboard() {
  let content = null;
  let type = null;
  let metadata = null;

  const text = clipboard.readText();
  if (text && text.trim()) {
    const textHash = hashContent(text);
    if (textHash !== lastClipboardHash) {
      content = text;
      type = 'text';
      lastClipboardHash = textHash;
    }
  }

  const image = clipboard.readImage();
  if (image && !image.isEmpty()) {
    const imageBuffer = image.toPNG();
    const imageHash = hashContent(imageBuffer);
    if (imageHash !== lastClipboardHash) {
      const imageData = saveImageToCache(image);
      content = imageData.path;
      metadata = imageData;
      type = 'image';
      lastClipboardHash = imageHash;
    }
  }

  const files = getClipboardFiles();
  if (files) {
    const fileHash = hashContent(files);
    if (fileHash !== lastClipboardHash) {
      content = files;
      type = 'file';
      lastClipboardHash = fileHash;
    }
  }

  if (content && type) {
    const currentApp = getCurrentAppName();
    
    if (!blacklistedApps.includes(currentApp)) {
      const newItem = {
        id: Date.now().toString(),
        type,
        content,
        metadata,
        app: currentApp,
        timestamp: Date.now(),
      };

      clipboardHistory = [newItem, ...clipboardHistory.slice(0, MAX_HISTORY - 1)];
      store.set('clipboardHistory', clipboardHistory);
      
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('clipboard-update', clipboardHistory);
      }
    }
  }
}

function toggleWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
  }

  if (mainWindow.isVisible()) {
    mainWindow.hide();
  } else {
    const { screen } = require('electron');
    const cursor = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(cursor);
    const workArea = display.workArea;
    
    const windowWidth = 500;
    const windowHeight = 600;
    const x = Math.max(workArea.x, cursor.x - windowWidth / 2);
    const y = Math.max(workArea.y, cursor.y - windowHeight / 2);
    
    mainWindow.setBounds({
      x: Math.min(x, workArea.x + workArea.width - windowWidth),
      y: Math.min(y, workArea.y + workArea.height - windowHeight),
      width: windowWidth,
      height: windowHeight,
    });
    
    mainWindow.show();
    mainWindow.focus();
    mainWindow.webContents.send('clipboard-update', clipboardHistory);
  }
}

function createTray() {
  try {
    const iconPath = path.join(__dirname, '../assets/tray-icon.png');
    tray = new Tray(iconPath);
  } catch (e) {
    tray = new Tray(
      nativeImage.createFromBuffer(
        Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAB3RJTUUH5gMVESs6k5rG4QAAABl0RVh0Q29tbWVudABDcmVhdGVkIHdpdGggR0lNUFeBDhcAAAAUSURBVDjLY2AYBaNgFIyCUTAKRsEAAH0AAT99YcNAAAAAElFTkSuQmCC',
          'base64'
        )
      )
    );
  }

  const contextMenu = Menu.buildFromTemplate([
    { label: '显示剪贴板 (Ctrl+Shift+V)', click: toggleWindow },
    { type: 'separator' },
    { label: '清空历史', click: () => {
      clipboardHistory = [];
      store.set('clipboardHistory', []);
      try {
        const files = fs.readdirSync(imageCachePath);
        files.forEach(file => {
          fs.unlinkSync(path.join(imageCachePath, file));
        });
      } catch (e) {}
    }},
    { type: 'separator' },
    { label: '退出', click: () => app.quit() },
  ]);

  tray.setToolTip('剪贴板历史管理器');
  tray.setContextMenu(contextMenu);
}

app.whenReady().then(() => {
  createWindow();
  createTray();

  globalShortcut.register('CommandOrControl+Shift+V', toggleWindow);

  setInterval(checkClipboard, CLIPBOARD_CHECK_INTERVAL);

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

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

ipcMain.on('copy-to-clipboard', (event, item) => {
  clipboard.clear();
  
  if (item.type === 'text') {
    clipboard.writeText(item.content);
    lastClipboardHash = hashContent(item.content);
  } else if (item.type === 'image') {
    try {
      let image;
      if (item.metadata && item.metadata.path && fs.existsSync(item.metadata.path)) {
        image = nativeImage.createFromPath(item.metadata.path);
      } else if (typeof item.content === 'string' && item.content.startsWith('data:')) {
        image = nativeImage.createFromDataURL(item.content);
      } else if (typeof item.content === 'string' && fs.existsSync(item.content)) {
        image = nativeImage.createFromPath(item.content);
      }
      
      if (image && !image.isEmpty()) {
        clipboard.writeImage(image);
        lastClipboardHash = hashContent(image.toPNG());
      }
    } catch (e) {
      console.error('Failed to copy image:', e);
    }
  } else if (item.type === 'file') {
    try {
      clipboard.write('public.file-url', item.content);
      if (isWindows) {
        clipboard.write('text/uri-list', item.content);
      }
      lastClipboardHash = hashContent(item.content);
    } catch (e) {
      console.error('Failed to copy file:', e);
    }
  }
  
  mainWindow.hide();
});

ipcMain.on('get-history', (event) => {
  event.reply('clipboard-update', clipboardHistory);
});

ipcMain.on('delete-item', (event, id) => {
  const item = clipboardHistory.find(i => i.id === id);
  if (item && item.type === 'image' && item.metadata && item.metadata.path) {
    try {
      if (fs.existsSync(item.metadata.path)) {
        fs.unlinkSync(item.metadata.path);
      }
    } catch (e) {}
  }
  
  clipboardHistory = clipboardHistory.filter(item => item.id !== id);
  store.set('clipboardHistory', clipboardHistory);
  event.reply('clipboard-update', clipboardHistory);
});

ipcMain.on('clear-history', () => {
  clipboardHistory = [];
  store.set('clipboardHistory', []);
  try {
    const files = fs.readdirSync(imageCachePath);
    files.forEach(file => {
      fs.unlinkSync(path.join(imageCachePath, file));
    });
  } catch (e) {}
});

ipcMain.on('get-blacklist', (event) => {
  event.reply('blacklist-update', blacklistedApps);
});

ipcMain.on('add-to-blacklist', (event, appName) => {
  if (!blacklistedApps.includes(appName)) {
    blacklistedApps.push(appName);
    store.set('blacklistedApps', blacklistedApps);
  }
  event.reply('blacklist-update', blacklistedApps);
});

ipcMain.on('remove-from-blacklist', (event, appName) => {
  blacklistedApps = blacklistedApps.filter(app => app !== appName);
  store.set('blacklistedApps', blacklistedApps);
  event.reply('blacklist-update', blacklistedApps);
});

ipcMain.on('hide-window', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.hide();
  }
});

ipcMain.on('set-sync-password', (event, password) => {
  try {
    const passwordHash = CryptoUtils.hashPassword(password);
    store.set('syncPasswordHash', passwordHash);
    event.reply('sync-password-set', { success: true });
  } catch (error) {
    event.reply('sync-password-set', { success: false, error: error.message });
  }
});

ipcMain.on('verify-sync-password', (event, password) => {
  const savedHash = store.get('syncPasswordHash');
  if (!savedHash) {
    event.reply('sync-password-verified', { success: false, error: '未设置同步密码' });
    return;
  }
  const isValid = CryptoUtils.verifyPassword(password, savedHash);
  event.reply('sync-password-verified', { success: isValid });
});

ipcMain.on('has-sync-password', (event) => {
  const hasPassword = !!store.get('syncPasswordHash');
  event.reply('has-sync-password-result', { hasPassword });
});

ipcMain.on('export-encrypted-data', async (event, password) => {
  try {
    const defaultPath = path.join(app.getPath('documents'), `clipboard-sync-${Date.now()}.enc`);
    const result = await dialog.showSaveDialog(mainWindow, {
      title: '导出加密剪贴板数据',
      defaultPath: defaultPath,
      filters: [
        { name: '加密剪贴板文件', extensions: ['enc'] },
        { name: '所有文件', extensions: ['*'] }
      ]
    });

    if (result.canceled || !result.filePath) {
      event.reply('export-result', { success: false, canceled: true });
      return;
    }

    const exportResult = CryptoUtils.exportEncryptedData(clipboardHistory, password, result.filePath);
    event.reply('export-result', exportResult);
  } catch (error) {
    event.reply('export-result', { success: false, error: error.message });
  }
});

ipcMain.on('import-encrypted-data', async (event, password) => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '导入加密剪贴板数据',
      filters: [
        { name: '加密剪贴板文件', extensions: ['enc'] },
        { name: '所有文件', extensions: ['*'] }
      ],
      properties: ['openFile']
    });

    if (result.canceled || result.filePaths.length === 0) {
      event.reply('import-result', { success: false, canceled: true });
      return;
    }

    const importResult = CryptoUtils.importEncryptedData(result.filePaths[0], password);
    if (importResult.success && importResult.data && importResult.data.items) {
      const existingIds = new Set(clipboardHistory.map(item => item.id));
      const newItems = importResult.data.items.filter(item => !existingIds.has(item.id));
      
      clipboardHistory = [...newItems, ...clipboardHistory].slice(0, MAX_HISTORY);
      store.set('clipboardHistory', clipboardHistory);
      
      event.reply('import-result', {
        success: true,
        importedCount: newItems.length,
        totalCount: importResult.data.items.length,
        items: clipboardHistory
      });
    } else {
      event.reply('import-result', importResult);
    }
  } catch (error) {
    event.reply('import-result', { success: false, error: error.message });
  }
});

ipcMain.on('toggle-item-star', (event, itemId) => {
  const itemIndex = clipboardHistory.findIndex(item => item.id === itemId);
  if (itemIndex !== -1) {
    clipboardHistory[itemIndex].starred = !clipboardHistory[itemIndex].starred;
    store.set('clipboardHistory', clipboardHistory);
    event.reply('item-star-toggled', { 
      id: itemId, 
      starred: clipboardHistory[itemIndex].starred,
      items: clipboardHistory
    });
  }
});

ipcMain.on('get-starred-items', (event) => {
  const starredItems = clipboardHistory.filter(item => item.starred);
  event.reply('starred-items-result', { items: starredItems });
});
