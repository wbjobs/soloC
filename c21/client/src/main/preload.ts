import { contextBridge, ipcRenderer } from 'electron';
import { AppConfig, HistoryRecord, DeviceInfo } from '../shared/types';

contextBridge.exposeInMainWorld('electronAPI', {
  getConfig: (): Promise<AppConfig> => ipcRenderer.invoke('config:get'),
  setConfig: (config: Partial<AppConfig>): Promise<AppConfig> => 
    ipcRenderer.invoke('config:set', config),
  connectServer: (): Promise<{ success: boolean; error?: string }> => 
    ipcRenderer.invoke('server:connect'),
  disconnectServer: (): Promise<{ success: boolean }> => 
    ipcRenderer.invoke('server:disconnect'),
  getServerStatus: (): Promise<{ connected: boolean; devices: DeviceInfo[] }> => 
    ipcRenderer.invoke('server:status'),
  getHistory: (limit?: number): Promise<HistoryRecord[]> => 
    ipcRenderer.invoke('history:get', limit),
  deleteHistory: (id: number): Promise<{ success: boolean }> => 
    ipcRenderer.invoke('history:delete', id),
  clearOldHistory: (days?: number): Promise<{ success: boolean; count: number }> => 
    ipcRenderer.invoke('history:clear-old', days),
  toggleClipboard: (): Promise<{ active: boolean }> => 
    ipcRenderer.invoke('clipboard:toggle'),
  getClipboardStatus: (): Promise<{ active: boolean }> => 
    ipcRenderer.invoke('clipboard:status'),

  onClipboardChange: (callback: (content: any) => void) => {
    ipcRenderer.on('clipboard:change', (_event, content) => callback(content));
  },
  onClipboardReceived: (callback: (data: any) => void) => {
    ipcRenderer.on('clipboard:received', (_event, data) => callback(data));
  },
  onDevicesUpdate: (callback: (devices: DeviceInfo[]) => void) => {
    ipcRenderer.on('devices:update', (_event, devices) => callback(devices));
  }
});
