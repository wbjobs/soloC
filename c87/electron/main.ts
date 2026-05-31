import { app, BrowserWindow, ipcMain, Tray, Menu, dialog } from 'electron';
import * as path from 'path';
import { setupDatabase } from './database';
import { setupLogParsers } from './log-parsers';
import { setupSearch } from './search';
import { setupClustering } from './clustering';
import { setupPDFExport } from './pdf-export';
import { setupPatternMiningIPC } from './pattern-mining/pattern-mining-service';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let searchWindow: BrowserWindow | null = null;

const createMainWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../react/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
};

const createSearchWindow = () => {
  if (searchWindow) {
    searchWindow.focus();
    return;
  }

  searchWindow = new BrowserWindow({
    width: 600,
    height: 500,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  if (process.env.NODE_ENV === 'development') {
    searchWindow.loadURL('http://localhost:3000#search');
  } else {
    searchWindow.loadFile(path.join(__dirname, '../react/index.html'), {
      hash: 'search'
    });
  }

  searchWindow.once('ready-to-show', () => {
    searchWindow?.show();
  });

  searchWindow.on('closed', () => {
    searchWindow = null;
  });

  searchWindow.on('blur', () => {
    searchWindow?.hide();
  });
};

const createTray = () => {
  tray = new Tray(path.join(__dirname, '../assets/tray-icon.png'));
  
  const contextMenu = Menu.buildFromTemplate([
    {
      label: '打开主窗口',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
        } else {
          createMainWindow();
        }
      }
    },
    {
      label: '快速搜索',
      click: () => {
        createSearchWindow();
      }
    },
    {
      type: 'separator'
    },
    {
      label: '退出',
      click: () => {
        app.quit();
      }
    }
  ]);

  tray.setToolTip('日志分析器');
  tray.setContextMenu(contextMenu);

  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show();
    } else {
      createMainWindow();
    }
  });
};

app.whenReady().then(() => {
  setupDatabase();
  setupLogParsers();
  setupSearch();
  setupClustering();
  setupPDFExport();
  setupPatternMiningIPC();
  
  createMainWindow();
  createTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.on('open-file-dialog', async (event) => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: '日志文件', extensions: ['log', 'json', 'txt', 'journal'] },
      { name: '所有文件', extensions: ['*'] }
    ]
  });

  event.reply('file-dialog-result', result.filePaths);
});

ipcMain.on('close-search-window', () => {
  if (searchWindow) {
    searchWindow.hide();
  }
});
