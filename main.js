const path = require('path');
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const { FileUtils } = require('./src/services/fileUtils');
const { Converter } = require('./src/services/converter');

let mainWindow;
const converter = new Converter();

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'public', 'index.html'));
}

app.whenReady().then(() => {
  createWindow();

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

ipcMain.handle('browse-source-file', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile', 'openDirectory'],
    filters: [
      { name: 'Disques virtuels', extensions: ['vmdk', 'vhd', 'vhdx', 'qcow2', 'img', 'raw', 'vdi', 'vmwarevm'] },
      { name: 'Tous les fichiers', extensions: ['*'] }
    ]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  const selectedPath = result.filePaths[0];
  return FileUtils.resolveVirtualDiskPath(selectedPath);
});

ipcMain.handle('browse-destination-folder', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory']
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths[0];
});

ipcMain.handle('get-file-info', async (_event, filePath) => FileUtils.getFileInfo(filePath));
ipcMain.handle('get-free-disk-space', async (_event, dirPath) => FileUtils.getFreeDiskSpace(dirPath));
ipcMain.handle('is-conversion-possible', async (_event, sourceFormat, destFormat) => FileUtils.isConversionPossible(sourceFormat, destFormat));
ipcMain.handle('get-default-output-folder', async () => FileUtils.getDefaultOutputFolder());
ipcMain.handle('format-bytes', async (_event, bytes) => FileUtils.formatBytes(bytes));
ipcMain.handle('format-time', async (_event, milliseconds) => FileUtils.formatTime(milliseconds));
ipcMain.handle('get-history', async () => converter.getHistory());

ipcMain.handle('open-path', async (_event, targetPath) => {
  if (!targetPath) return false;
  const folderToOpen = targetPath;
  const error = await shell.openPath(folderToOpen);
  return !error;
});

ipcMain.handle('start-conversion', async (_event, options) => {
  const result = await converter.convert(options, (progress) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('conversion-progress', progress);
    }
  });

  return result;
});
