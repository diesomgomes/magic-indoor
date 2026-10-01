const { app, BrowserWindow, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const http = require('http');

// Serve o index.html por http://127.0.0.1 em vez de carregar via file://. O YouTube
// embutido recusa tocar (erro 153) quando a pagina que o contem nao tem uma origem
// http(s) valida — carregar como arquivo local nao satisfaz isso.
function startLocalServer() {
  const root = __dirname;
  const mimeTypes = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const urlPath = req.url.split('?')[0];
      const filePath = path.join(root, urlPath === '/' ? 'index.html' : urlPath);
      if (!filePath.startsWith(root)) { res.writeHead(403); return res.end(); }
      fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404); return res.end(); }
        res.writeHead(200, { 'Content-Type': mimeTypes[path.extname(filePath)] || 'application/octet-stream' });
        res.end(data);
      });
    });
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

// Codigo do "dispositivo" (equivalente ao MI-XXXXXX do app Android), gerado uma unica
// vez e guardado na pasta de dados do usuario — persiste entre reinicios do programa.
function getOrCreateDeviceCode() {
  const file = path.join(app.getPath('userData'), 'device-code.json');
  try {
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (saved && /^MI-[A-Z0-9]{6}$/.test(saved.code)) return saved.code;
  } catch { /* primeira vez, ou arquivo corrompido: gera um novo */ }

  const random = crypto.randomBytes(4).toString('hex').toUpperCase().slice(0, 6);
  const code = `MI-${random}`;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ code }));
  } catch { /* segue mesmo sem conseguir salvar; so nao persiste entre execucoes */ }
  return code;
}

async function createWindow() {
  const deviceCode = getOrCreateDeviceCode();
  const port = await startLocalServer();

  const win = new BrowserWindow({
    fullscreen: true,
    kiosk: true,
    autoHideMenuBar: true,
    backgroundColor: '#000000',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.setMenuBarVisibility(false);
  win.loadURL(`http://127.0.0.1:${port}/?code=${encodeURIComponent(deviceCode)}`);

  // Assim que o Windows liga (ou a pessoa faz login), o Windows ja abre o player sozinho.
  app.setLoginItemSettings({ openAtLogin: true, path: process.execPath });

  // Ctrl+Shift+Q sai do modo kiosk/fecha o programa — util pra manutencao no local.
  globalShortcut.register('Control+Shift+Q', () => app.quit());
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  app.quit();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
