require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');

const { supabaseAdmin } = require('./supabase');
const { logEvent } = require('./events');
const devicesRouter = require('./routes/devices');
const campaignsRouter = require('./routes/campaigns');
const eventsRouter = require('./routes/events');
const newsRouter = require('./routes/news');
const mediaRouter = require('./routes/media');
const companyRouter = require('./routes/company');

const app = express();
const PORT = process.env.PORT || 3000;
const ONLINE_THRESHOLD_MS = 30_000;
const ONLINE_SWEEP_MS = 15_000;

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));
app.use('/assets', express.static(path.join(__dirname, '..', '..', 'assets')));

app.get('/', (_req, res) => res.sendFile(path.join(__dirname, '..', '..', 'index.html')));
app.get('/login', (_req, res) => res.sendFile(path.join(__dirname, '..', '..', 'login.html')));
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

// Config publica e segura de expor ao navegador: URL do projeto e a chave anon
// (protegida por RLS no banco). A service role key NUNCA passa por aqui.
app.get('/api/config', (_req, res) => {
  res.json({
    supabaseUrl: process.env.SUPABASE_URL || '',
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
  });
});
app.use('/api/devices', devicesRouter);
app.use('/api/campaigns', campaignsRouter);
app.use('/api/events', eventsRouter);
app.use('/api/news', newsRouter);
app.use('/api/media', mediaRouter);
app.use('/api/company', companyRouter);

// APK mais recente, disponibilizado para download em um clique na tela de Dispositivos.
app.get('/downloads/magic-indoor-player.apk', (_req, res) => {
  const apkPath = path.join(__dirname, '..', '..', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
  res.download(apkPath, 'magic-indoor-player.apk', (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: 'APK ainda nao foi gerado neste servidor.' });
  });
});

// Varre os dispositivos aprovados de TODAS as contas e registra eventos quando um fica
// online/offline, com base no ultimo contato (last_seen_at) reportado pelo APK. E uma
// tarefa de sistema cross-tenant, por isso usa o cliente admin (ignora RLS).
async function sweepDeviceConnectivity() {
  const { data: devices, error } = await supabaseAdmin.from('devices').select('*').eq('status', 'aprovado');
  if (error) { console.error('Falha na varredura de conectividade:', error.message); return; }

  const now = Date.now();
  for (const device of devices || []) {
    const seenAt = device.last_seen_at ? new Date(device.last_seen_at).getTime() : 0;
    const isOnline = now - seenAt < ONLINE_THRESHOLD_MS;
    if (isOnline !== device.is_online) {
      await supabaseAdmin.from('devices').update({ is_online: isOnline }).eq('id', device.id);
      const label = device.name || device.code;
      logEvent(
        device.owner_id,
        isOnline ? 'device_online' : 'device_offline',
        isOnline ? `${label} (${device.code}) conectou` : `${label} (${device.code}) desconectou`
      );
    }
  }
}
setInterval(() => { sweepDeviceConnectivity().catch((err) => console.error('Falha na varredura:', err)); }, ONLINE_SWEEP_MS);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Erro interno.' });
});

app.listen(PORT, () => {
  console.log(`Magic Indoor backend rodando em http://localhost:${PORT}`);
});
