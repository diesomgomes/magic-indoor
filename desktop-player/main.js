const { app, BrowserWindow, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

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

function createWindow() {
  const deviceCode = getOrCreateDeviceCode();

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
  win.loadFile('index.html', { query: { code: deviceCode } });

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
