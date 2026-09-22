const express = require('express');
const { supabaseAdmin } = require('../supabase');
const { requireAuth } = require('../middleware/auth');
const { logEvent } = require('../events');

const router = express.Router();

const CODE_RE = /^MI-[A-Z0-9]{6}$/;

function handleError(res, error, status = 500) {
  console.error(error);
  res.status(status).json({ error: error.message || 'Erro interno.' });
}

// Painel chama isso quando o usuario digita manualmente o codigo exibido no dispositivo.
// E a UNICA forma de um dispositivo passar a existir: nao ha registro automatico pela rede,
// so entra quem o dono da conta adicionar digitando o codigo que aparece na tela do aparelho.
router.post('/link', requireAuth, async (req, res) => {
  const { code, name } = req.body || {};
  const trimmedCode = (code || '').trim().toUpperCase();
  const trimmedName = (name || '').trim();

  if (!CODE_RE.test(trimmedCode)) {
    return res.status(400).json({ error: 'Codigo de dispositivo invalido. Formato esperado: MI-XXXXXX' });
  }
  if (!trimmedName) {
    return res.status(400).json({ error: 'Informe um nome para o dispositivo.' });
  }

  const { data: existing } = await req.supabase.from('devices').select('*').eq('code', trimmedCode).maybeSingle();

  if (existing) {
    const { data, error } = await req.supabase
      .from('devices')
      .update({ name: trimmedName, status: 'aprovado' })
      .eq('id', existing.id)
      .select()
      .single();
    if (error) return handleError(res, error);
    logEvent(req.ownerId, 'device_linked', `Dispositivo vinculado manualmente: ${trimmedName} (${trimmedCode})`);
    return res.json(data);
  }

  const { data, error } = await req.supabase
    .from('devices')
    .insert({ owner_id: req.ownerId, code: trimmedCode, name: trimmedName, status: 'aprovado' })
    .select()
    .single();
  if (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Esse codigo ja esta em uso por outro dispositivo.' });
    return handleError(res, error);
  }
  logEvent(req.ownerId, 'device_linked', `Dispositivo cadastrado e vinculado: ${trimmedName} (${trimmedCode})`);
  res.status(201).json(data);
});

router.get('/', requireAuth, async (req, res) => {
  const { data, error } = await req.supabase.from('devices').select('*').order('created_at', { ascending: false });
  if (error) return handleError(res, error);
  res.json(data);
});

router.patch('/:id/status', requireAuth, async (req, res) => {
  const { status } = req.body || {};
  if (!['aprovado', 'rejeitado'].includes(status)) {
    return res.status(400).json({ error: 'Status invalido. Use aprovado ou rejeitado.' });
  }
  const { data, error } = await req.supabase
    .from('devices')
    .update({ status })
    .eq('id', req.params.id)
    .select()
    .maybeSingle();
  if (error) return handleError(res, error);
  if (!data) return res.status(404).json({ error: 'Dispositivo nao encontrado.' });
  logEvent(req.ownerId, 'device_status', `Dispositivo ${status === 'aprovado' ? 'reativado' : 'desativado'}: ${data.code}`);
  res.json(data);
});

router.delete('/:id', requireAuth, async (req, res) => {
  const { data: device } = await req.supabase.from('devices').select('*').eq('id', req.params.id).maybeSingle();
  if (!device) return res.status(404).json({ error: 'Dispositivo nao encontrado.' });

  const { error } = await req.supabase.from('devices').delete().eq('id', req.params.id);
  if (error) return handleError(res, error);
  logEvent(req.ownerId, 'device_deleted', `Dispositivo excluído: ${device.name || device.code} (${device.code})`);
  res.status(204).end();
});

// Consulta feita pelo APK: publica (o aparelho nao tem login), por isso usa o cliente
// admin e busca so pelo codigo. Retorna a playlist achatada (um item por arquivo) de
// todas as programacoes vinculadas a este dispositivo aprovado.
router.get('/:code/campaigns', async (req, res) => {
  const { data: device } = await supabaseAdmin.from('devices').select('*').eq('code', req.params.code).maybeSingle();
  if (!device) return res.status(404).json({ error: 'Dispositivo nao encontrado. Vincule-o pelo painel antes.' });

  const { screenWidth, screenHeight, screenDensity } = req.query;
  const width = screenWidth !== undefined ? Number.parseInt(screenWidth, 10) : device.screen_width;
  const height = screenHeight !== undefined ? Number.parseInt(screenHeight, 10) : device.screen_height;
  const density = screenDensity !== undefined ? String(screenDensity) : device.screen_density;

  await supabaseAdmin
    .from('devices')
    .update({
      last_seen_at: new Date().toISOString(),
      screen_width: Number.isFinite(width) ? width : null,
      screen_height: Number.isFinite(height) ? height : null,
      screen_density: density || null,
    })
    .eq('id', device.id);

  if (device.status !== 'aprovado') {
    return res.json({ device, items: [] });
  }

  const { data: rows, error } = await supabaseAdmin
    .from('campaign_devices')
    .select('campaign:campaigns(id, name, orientation, created_at, campaign_items(*))')
    .eq('device_id', device.id);
  if (error) return handleError(res, error);

  const campaigns = (rows || [])
    .map((r) => r.campaign)
    .filter(Boolean)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  const flattened = [];
  for (const campaign of campaigns) {
    const items = (campaign.campaign_items || []).slice().sort((a, b) => a.position - b.position);
    for (const item of items) {
      flattened.push({ ...item, campaign_name: campaign.name, orientation: campaign.orientation });
    }
  }

  // Noticias viram uma pagina web servida por este proprio backend (no endereco pelo qual o
  // aparelho nos alcancou), ja com a quantidade de manchetes escolhida; o player so exibe a URL.
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  for (const item of flattened) {
    if (item.media_kind === 'noticias') {
      item.source_url = `${baseUrl}/api/news/view?url=${encodeURIComponent(item.source_url)}&count=${item.news_count || 5}`;
      item.media_kind = 'web';
    }
  }

  res.json({ device, items: flattened });
});

module.exports = router;
