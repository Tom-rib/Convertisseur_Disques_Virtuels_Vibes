const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  browseSourceFile: () => ipcRenderer.invoke('browse-source-file'),
  browseDestinationFolder: () => ipcRenderer.invoke('browse-destination-folder'),
  getFileInfo: (filePath) => ipcRenderer.invoke('get-file-info', filePath),
  getFreeDiskSpace: (dirPath) => ipcRenderer.invoke('get-free-disk-space', dirPath),
  isConversionPossible: (sourceFormat, destFormat) => ipcRenderer.invoke('is-conversion-possible', sourceFormat, destFormat),
  getDefaultOutputFolder: () => ipcRenderer.invoke('get-default-output-folder'),
  formatBytes: (bytes) => ipcRenderer.invoke('format-bytes', bytes),
  formatTime: (milliseconds) => ipcRenderer.invoke('format-time', milliseconds),
  getHistory: () => ipcRenderer.invoke('get-history'),
  startConversion: (options) => ipcRenderer.invoke('start-conversion', options),
  openPath: (targetPath) => ipcRenderer.invoke('open-path', targetPath),
  onConversionProgress: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('conversion-progress', handler);
    return () => ipcRenderer.removeListener('conversion-progress', handler);
  }
});
