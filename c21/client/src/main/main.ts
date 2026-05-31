import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, dialog } from 'electron';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import Store from 'electron-store';
import { AppConfig, ClipboardContent, AuthPayload, DeviceInfo, ChunkStartPayload, ConflictPayload } from '../shared/types';
import { encryptionManager } from './encryption';
import { databaseManager } from './database';
import { clipboardListener } from './clipboardListener';
import { wsClient } from './wsClient';

const store = new Store<AppConfig>({
  defaults: {
    serverUrl: 'ws://localhost:3001',
    userId: null,
    token: null,
    deviceId: uuidv4(),
    deviceName: `${require('os').hostname()}`,
    autoSync: true,
    encryptionKey: ''
  }
});

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let devices: DeviceInfo[] = [];

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    title: 'Clipboard Sync',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    show: false
  });

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:3000');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('close', (e) => {
    if (!(app as any).isQuitting) {
      e.preventDefault();
      mainWindow?.hide();
    }
  });
}

function createTray(): void {
  const iconPath = path.join(__dirname, '../../assets/icon.png');
  const icon = nativeImage.createEmpty();
  
  tray = new Tray(icon);
  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示窗口',
      click: () => mainWindow?.show()
    },
    {
      label: '剪贴板同步: ' + (clipboardListener.isActive() ? '启用' : '禁用'),
      click: () => toggleClipboardSync()
    },
    {
      type: 'separator'
    },
    {
      label: '退出',
      click: () => {
        (app as any).isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setToolTip('Clipboard Sync');
  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    mainWindow?.show();
  });
}

function toggleClipboardSync(): void {
  if (clipboardListener.isActive()) {
    clipboardListener.stop();
  } else {
    clipboardListener.start();
  }
  updateTrayMenu();
}

function updateTrayMenu(): void {
  if (!tray) return;

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示窗口',
      click: () => mainWindow?.show()
    },
    {
      label: '剪贴板同步: ' + (clipboardListener.isActive() ? '启用' : '禁用'),
      click: () => toggleClipboardSync()
    },
    {
      type: 'separator'
    },
    {
      label: '退出',
      click: () => {
        (app as any).isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
}

async function initialize(): Promise<void> {
  let encryptionKey = store.get('encryptionKey');
  if (!encryptionKey) {
    encryptionKey = encryptionManager.generateKey();
    store.set('encryptionKey', encryptionKey);
  }
  encryptionManager.setKey(encryptionKey);

  await databaseManager.init();

  const userId = store.get('userId');
  const token = store.get('token');

  if (userId && token) {
    await connectToServer();
  }

  if (store.get('autoSync')) {
    clipboardListener.start();
  }

  clipboardListener.onClipboardChange(async (content) => {
    if (!store.get('autoSync')) return;

    const updatedContent = {
      ...content,
      fromDeviceId: store.get('deviceId') as string,
      userId: store.get('userId') as string,
      encrypted: true,
      data: encryptionManager.encrypt(content.data)
    };

    wsClient.sendSync(updatedContent);

    await databaseManager.addHistory({
      type: content.type,
      data: content.data,
      timestamp: content.timestamp,
      fromDeviceId: store.get('deviceId') as string,
      fromDeviceName: '本机'
    });

    mainWindow?.webContents.send('clipboard:change', content);
  });

  wsClient.on('sync', async (message) => {
    const { content, fromDeviceName } = message.payload;

    let decryptedData = content.data;
    if (content.encrypted) {
      try {
        decryptedData = encryptionManager.decrypt(content.data);
      } catch (error) {
        console.error('[Main] Failed to decrypt content:', error);
        return;
      }
    }

    const decryptedContent = {
      ...content,
      data: decryptedData,
      encrypted: false
    };

    if (decryptedContent.fromDeviceId !== store.get('deviceId')) {
      clipboardListener.writeToClipboard(decryptedContent);

      await databaseManager.addHistory({
        type: decryptedContent.type,
        data: decryptedContent.data,
        timestamp: decryptedContent.timestamp,
        fromDeviceId: decryptedContent.fromDeviceId,
        fromDeviceName: fromDeviceName || '其他设备'
      });

      mainWindow?.webContents.send('clipboard:received', {
        content: decryptedContent,
        fromDeviceName
      });
    }
  });

  wsClient.on('device-list', (message) => {
    devices = message.payload.devices;
    mainWindow?.webContents.send('devices:update', devices);
  });

  wsClient.setChunkCompleteCallback(async (data: string, payload: ChunkStartPayload) => {
    console.log('[Main] Received chunked content from:', payload.fromDeviceName || payload.fromDeviceId, 'size:', data.length);

    let decryptedData = data;
    if (payload.encrypted) {
      try {
        decryptedData = encryptionManager.decrypt(data);
      } catch (error) {
        console.error('[Main] Failed to decrypt chunked content:', error);
        return;
      }
    }

    const content = {
      type: payload.contentType,
      data: decryptedData,
      timestamp: Date.now(),
      fromDeviceId: payload.fromDeviceId,
      userId: payload.userId,
      encrypted: false
    };

    if (content.fromDeviceId !== store.get('deviceId')) {
      clipboardListener.writeToClipboard(content);

      await databaseManager.addHistory({
        type: content.type,
        data: content.data,
        timestamp: content.timestamp,
        fromDeviceId: content.fromDeviceId,
        fromDeviceName: payload.fromDeviceName || '其他设备'
      });

      mainWindow?.webContents.send('clipboard:received', {
        content,
        fromDeviceName: payload.fromDeviceName
      });
    }
  });

  wsClient.setConflictCallback(async (conflict: ConflictPayload) => {
    console.log('[Main] Conflict detected:', conflict.contentId);
    
    const formatTime = (ts: number) => {
      return new Date(ts).toLocaleString();
    };

    const localPreview = conflict.localContent.type === 'text'
      ? conflict.localContent.data.substring(0, 100) + (conflict.localContent.data.length > 100 ? '...' : '')
      : `[图片 ${(conflict.localContent.data.length / 1024).toFixed(1)}KB]`;

    const remotePreview = conflict.remoteContent.type === 'text'
      ? conflict.remoteContent.data.substring(0, 100) + (conflict.remoteContent.data.length > 100 ? '...' : '')
      : `[图片 ${(conflict.remoteContent.data.length / 1024).toFixed(1)}KB]`;

    const recommendedButton = conflict.serverRecommendation === 'local' ? '保留本地 (推荐)' : '保留远程 (推荐)';
    const otherButton = conflict.serverRecommendation === 'local' ? '保留远程' : '保留本地';

    const result = await dialog.showMessageBox(mainWindow || undefined, {
      type: 'question',
      buttons: [recommendedButton, otherButton, '取消'],
      defaultId: 0,
      cancelId: 2,
      title: '剪贴板冲突',
      message: '检测到剪贴板内容冲突',
      detail: `本地内容 (${conflict.localContent.fromDeviceName}) ${formatTime(conflict.localContent.timestamp)}\n` +
              `  预览: ${localPreview}\n\n` +
              `远程内容 (${conflict.remoteContent.fromDeviceName}) ${formatTime(conflict.remoteContent.timestamp)}\n` +
              `  预览: ${remotePreview}\n\n` +
              `服务器建议: ${conflict.reason}`,
      noLink: true
    });

    if (result.response === 2) {
      console.log('[Main] Conflict resolution cancelled by user');
      return;
    }

    const choice: 'local' | 'remote' = result.response === 0 
      ? conflict.serverRecommendation 
      : (conflict.serverRecommendation === 'local' ? 'remote' : 'local');

    console.log('[Main] User chose to keep:', choice);
    wsClient.resolveConflict(conflict.contentId, choice);
  });

  ipcMain.handle('config:get', () => store.store);
  ipcMain.handle('config:set', (_event, config: Partial<AppConfig>) => {
    Object.entries(config).forEach(([key, value]) => {
      store.set(key, value);
    });
    return store.store;
  });

  ipcMain.handle('server:connect', async () => {
    try {
      await connectToServer();
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('server:disconnect', () => {
    wsClient.disconnect();
    return { success: true };
  });

  ipcMain.handle('server:status', () => ({
    connected: wsClient.connected(),
    devices
  }));

  ipcMain.handle('history:get', async (_event, limit: number = 100) => {
    return databaseManager.getHistory(limit);
  });

  ipcMain.handle('history:delete', async (_event, id: number) => {
    databaseManager.deleteHistory(id);
    return { success: true };
  });

  ipcMain.handle('history:clear-old', async (_event, days: number = 30) => {
    const count = databaseManager.clearOldHistory(days);
    return { success: true, count };
  });

  ipcMain.handle('clipboard:toggle', () => {
    toggleClipboardSync();
    return { active: clipboardListener.isActive() };
  });

  ipcMain.handle('clipboard:status', () => ({
    active: clipboardListener.isActive()
  }));
}

async function connectToServer(): Promise<void> {
  const serverUrl = store.get('serverUrl');
  const userId = store.get('userId');
  const token = store.get('token');
  const deviceId = store.get('deviceId');
  const deviceName = store.get('deviceName');

  if (!userId || !token) {
    throw new Error('用户未配置凭证');
  }

  const authPayload: AuthPayload = {
    userId,
    token,
    deviceId,
    deviceName
  };

  await wsClient.connect(serverUrl, authPayload);
}

app.on('ready', async () => {
  await initialize();
  createWindow();
  createTray();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  } else {
    mainWindow.show();
  }
});

app.on('before-quit', () => {
  (app as any).isQuitting = true;
  wsClient.disconnect();
  clipboardListener.stop();
  databaseManager.close();
});
