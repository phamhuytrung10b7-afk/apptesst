const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false // Cho phép giao diện React gọi trực tiếp các tính năng Node.js khi cần
    },
  });

  // Khi đóng gói thành file .exe, ứng dụng sẽ load trực tiếp file index.html từ thư mục dist
  if (process.env.NODE_ENV === 'development') {
    win.loadURL('http://localhost:3000'); 
  } else {
    win.loadFile(path.join(__dirname, 'dist/index.html'));
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});