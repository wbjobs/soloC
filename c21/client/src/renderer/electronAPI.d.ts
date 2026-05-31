import { AppConfig, HistoryRecord, DeviceInfo } from '../shared/types';

declare global {
  interface Window {
    electronAPI: {
      getConfig: () => Promise<AppConfig>;
      setConfig: (config: Partial<AppConfig>) => Promise<AppConfig>;
      connectServer: () => Promise<{ success: boolean; error?: string }>;
      disconnectServer: () => Promise<{ success: boolean }>;
      getServerStatus: () => Promise<{ connected: boolean; devices: DeviceInfo[] }>;
      getHistory: (limit?: number) => Promise<HistoryRecord[]>;
      deleteHistory: (id: number) => Promise<{ success: boolean }>;
      clearOldHistory: (days?: number) => Promise<{ success: boolean; count: number }>;
      toggleClipboard: () => Promise<{ active: boolean }>;
      getClipboardStatus: () => Promise<{ active: boolean }>;
      onClipboardChange: (callback: (content: any) => void) => void;
      onClipboardReceived: (callback: (data: any) => void) => void;
      onDevicesUpdate: (callback: (devices: DeviceInfo[]) => void) => void;
    };
  }
}

export {};
