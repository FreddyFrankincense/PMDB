/**
 * PMDB — The Personal Movie Database
 * Native Electron Desktop Wrapper (Windows / macOS / Linux)
 *
 * Usage for local native desktop testing:
 *   1. npm run build
 *   2. npx electron electron-main.cjs
 */
const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const fs = require('fs');

function createMainWindow() {
  const win = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1024,
    minHeight: 700,
    title: 'PMDB · The Personal Movie Database',
    backgroundColor: '#0C0C0E',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const standaloneHtmlPath = path.join(__dirname, 'dist', 'PMDB-Standalone-Desktop.html');
  const distIndexPath = path.join(__dirname, 'dist', 'index.html');

  if (fs.existsSync(standaloneHtmlPath)) {
    win.loadFile(standaloneHtmlPath);
  } else if (fs.existsSync(distIndexPath)) {
    win.loadFile(distIndexPath);
  } else {
    win.loadURL('http://localhost:3000');
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  createMainWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
