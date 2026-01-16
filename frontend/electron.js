const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('path');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadURL('http://localhost:5173');

  mainWindow.on('close', (e) => {
    e.preventDefault();
    const choice = dialog.showMessageBoxSync(mainWindow, {
      type: 'none',
      buttons: ['Fermer', 'Annuler'],
      defaultId: 1,
      title: 'Confirmation',
      message: 'Êtes-vous sûr de vouloir fermer MineManager ?'
    });
    if (choice === 0) {
      mainWindow.destroy();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

ipcMain.on('quit-app', () => {
  if (mainWindow) {
    mainWindow.destroy();
  }
  app.quit();
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
