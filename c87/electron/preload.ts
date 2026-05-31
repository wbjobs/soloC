import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  openFileDialog: () => ipcRenderer.send('open-file-dialog'),
  onFileDialogResult: (callback: (filePaths: string[]) => void) => {
    ipcRenderer.on('file-dialog-result', (_, filePaths) => callback(filePaths));
  },
  importLogs: (filePaths: string[], format: string) => 
    ipcRenderer.invoke('import-logs', filePaths, format),
  cancelImport: (filePath: string) => 
    ipcRenderer.invoke('cancel-import', filePath),
  getImportStatus: () => 
    ipcRenderer.invoke('get-import-status'),
  onImportProgress: (callback: (progress: any) => void) => {
    ipcRenderer.on('import-progress', (_, progress) => callback(progress));
  },
  removeImportProgressListener: () => {
    ipcRenderer.removeAllListeners('import-progress');
  },
  searchLogs: (query: string, filters: any, page: number, pageSize: number) => 
    ipcRenderer.invoke('search-logs', query, filters, page, pageSize),
  getHeatmapData: (startDate: string, endDate: string) => 
    ipcRenderer.invoke('get-heatmap-data', startDate, endDate),
  getClusters: (startDate: string, endDate: string) => 
    ipcRenderer.invoke('get-clusters', startDate, endDate),
  exportPDF: (options: any) => 
    ipcRenderer.invoke('export-pdf', options),
  closeSearchWindow: () => ipcRenderer.send('close-search-window'),
  quickSearch: (query: string) => 
    ipcRenderer.invoke('quick-search', query),
  getTotalLogs: () => 
    ipcRenderer.invoke('get-total-logs'),
  minePatterns: (minSupport: number, maxPatternLength: number) => 
    ipcRenderer.invoke('mine-patterns', minSupport, maxPatternLength),
  testRegex: (regex: string, limit: number) => 
    ipcRenderer.invoke('test-regex', regex, limit),
  generateRegexForPattern: (pattern: string[]) => 
    ipcRenderer.invoke('generate-regex-for-pattern', pattern),
  getLogsByRegex: (regex: string, limit: number) => 
    ipcRenderer.invoke('get-logs-by-regex', regex, limit)
});
