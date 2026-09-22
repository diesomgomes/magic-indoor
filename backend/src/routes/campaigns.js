const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { logEvent } = require('../events');

const router = express.Router();

const URL_KINDS = ['web', 'noticias'];
const FIT_MODES = ['original', 'adaptavel'];
const ORIENTATIONS = ['horizontal', 'vertical'];
const DEFAULT_DURATION = 8;
const MIN_DURATION = 2;
const MAX_DURATION = 300;
const DEFAULT_NEWS_COUNT = 5;
const MAX_NEWS_COUNT = 10;
const MAX_ITEMS = 100;

const CAMPAIGN_SELECT = '*, campaign_items(*), campaign_devices(device:devices(id, code, name))';

function parseDuration(raw) {
  const value = Number.parseInt(raw, 10);
  if (Number.isNaN(value)) return DEFAULT_DURATION;
  return Math.min(MAX_DURATION, Math.max(MIN_DURATION, value));
}
function parseFitMode(raw) {
  return FIT_MODES.includes(raw) ? raw : 'original';
}
function parseNewsCount(raw) {
  const value = Number.parseInt(raw, 10);
  if (Number.isNaN(value)) return DEFAULT_NEWS_COUNT;
  return Math.min(MAX_NEWS_COUNT, Math.max(1, value));
}
function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}
function handleError(res, error, status = 500) {
  console.error(error);
  res.status(status).json({ error: error.message || 'Erro interno.' });
}
function mapCampaignRow(row) {
  const items = (row.campaign_items || []).slice().sort((a, b) => a.position - b.position);
  const devices = (row.campaign_devices || []).map((cd) => cd.device).filter(Boolean);
  return {
    id: row.id,
    name: row.name,
    orientation: row.orientation,
    created_at: row.created_at,
    items,
    devices,
    device_count: devices.length,
  };
}

// Valida o corpo { name, orientation, items: [...] } enviado pelo editor. Cada item e:
//   { type: 'media', media_id, duration, fit_mode }              (arquivo da biblioteca)
//   { type: 'tool', kind: 'web'|'noticias', url, integration, duration }   (ferramenta por URL)
// Itens de arquivo sao resolvidos contra a biblioteca do PROPRIO dono: a RLS faz um
// media_id de outra conta simplesmente nao aparecer, o que ja barra o cross-tenant.
async function parseBody(supabase, body) {
  const { name, items } = body || {};
  const trimmedName = typeof name === 'string' ? name.trim() : '';
  if (!trimmedName) return { error: 'Nome da programacao e obrigatorio.' };
  if (!Array.isArray(items) || !items.length) return { error: 'Adicione ao menos um item a programacao.' };
  if (items.length > MAX_ITEMS) return { error: `Uma programacao aceita no maximo ${MAX_ITEMS} itens.` };

  const orientation = ORIENTATIONS.includes(body.orientation) ? body.orientation : 'horizontal';
  const parsed = [];
  for (const raw of items) {
    const duration = parseDuration(raw && raw.duration);
    const fitMode = parseFitMode(raw && raw.fit_mode);

    if (raw && raw.type === 'media') {
      const { data: media } = await supabase.from('media_files').select('*').eq('id', raw.media_id).maybeSingle();
      if (!media) return { error: 'Um dos arquivos nao existe mais na biblioteca.' };
      parsed.push({
        media_id: media.id,
        file_name: media.file_name,
        file_type: media.file_type,
        file_size: media.file_size,
        media_kind: media.media_kind,
        duration_seconds: duration,
        fit_mode: fitMode,
        source_url: null,
        integration: null,
        news_count: null,
      });
    } else if (raw && raw.type === 'tool' && URL_KINDS.includes(raw.kind)) {
      const url = typeof raw.url === 'string' ? raw.url.trim() : '';
      if (!isHttpUrl(url)) return { error: 'Informe um endereco valido (http:// ou https://) em todos os itens de ferramenta.' };
      const integration = typeof raw.integration === 'string' ? raw.integration.trim().slice(0, 60) || null : null;
      parsed.push({
        media_id: null,
        file_name: '',
        file_type: 'text/uri-list',
        file_size: 0,
        media_kind: raw.kind,
        duration_seconds: duration,
        fit_mode: fitMode,
        source_url: url,
        integration,
        news_count: raw.kind === 'noticias' ? parseNewsCount(raw.news_count) : null,
      });
    } else {
      return { error: 'Item invalido na programacao.' };
    }
  }
  return { name: trimmedName, orientation, items: parsed };
}

router.get('/', requireAuth, async (req, res) => {
  const { data, error } = await req.supabase
    .from('campaigns')
    .select(CAMPAIGN_SELECT)
    .order('created_at', { ascending: false });
  if (error) return handleError(res, error);
  res.json(data.map(mapCampaignRow));
});

router.post('/', requireAuth, async (req, res) => {
  const parsed = await parseBody(req.supabase, req.body);
  if (parsed.error) return res.status(400).json({ error: parsed.error });

  const { data: campaign, error: campaignError } = await req.supabase
    .from('campaigns')
    .insert({ owner_id: req.ownerId, name: parsed.name, orientation: parsed.orientation })
    .select()
    .single();
  if (campaignError) return handleError(res, campaignError);

  const rows = parsed.items.map((item, index) => ({ ...item, owner_id: req.ownerId, campaign_id: campaign.id, position: index }));
  const { error: itemsError } = await req.supabase.from('campaign_items').insert(rows);
  if (itemsError) return handleError(res, itemsError);

  logEvent(req.ownerId, 'campaign_created', `Nova programação cadastrada: ${parsed.name} (${rows.length} ${rows.length === 1 ? 'item' : 'itens'})`);

  const { data: full } = await req.supabase.from('campaigns').select(CAMPAIGN_SELECT).eq('id', campaign.id).single();
  res.status(201).json(mapCampaignRow(full));
});

// Salva a edicao: atualiza o nome e substitui a lista de itens (na ordem enviada).
router.put('/:id', requireAuth, async (req, res) => {
  const { data: campaign } = await req.supabase.from('campaigns').select('*').eq('id', req.params.id).maybeSingle();
  if (!campaign) return res.status(404).json({ error: 'Programacao nao encontrada.' });

  const parsed = await parseBody(req.supabase, req.body);
  if (parsed.error) return res.status(400).json({ error: parsed.error });

  const { error: updateError } = await req.supabase
    .from('campaigns')
    .update({ name: parsed.name, orientation: parsed.orientation })
    .eq('id', campaign.id);
  if (updateError) return handleError(res, updateError);

  await req.supabase.from('campaign_items').delete().eq('campaign_id', campaign.id);
  const rows = parsed.items.map((item, index) => ({ ...item, owner_id: req.ownerId, campaign_id: campaign.id, position: index }));
  const { error: itemsError } = await req.supabase.from('campaign_items').insert(rows);
  if (itemsError) return handleError(res, itemsError);

  logEvent(req.ownerId, 'campaign_updated', `Programação atualizada: ${parsed.name} (${rows.length} ${rows.length === 1 ? 'item' : 'itens'})`);

  const { data: full } = await req.supabase.from('campaigns').select(CAMPAIGN_SELECT).eq('id', campaign.id).single();
  res.json(mapCampaignRow(full));
});

router.delete('/:id', requireAuth, async (req, res) => {
  const { data: campaign } = await req.supabase.from('campaigns').select('*').eq('id', req.params.id).maybeSingle();
  if (!campaign) return res.status(404).json({ error: 'Programacao nao encontrada.' });

  const { error } = await req.supabase.from('campaigns').delete().eq('id', req.params.id);
  if (error) return handleError(res, error);
  logEvent(req.ownerId, 'campaign_deleted', `Programação excluída: ${campaign.name}`);
  res.status(204).end();
});

router.post('/:id/assign', requireAuth, async (req, res) => {
  const { deviceId } = req.body || {};
  const { data: campaign } = await req.supabase.from('campaigns').select('*').eq('id', req.params.id).maybeSingle();
  if (!campaign) return res.status(404).json({ error: 'Campanha nao encontrada.' });

  const { data: device } = await req.supabase.from('devices').select('*').eq('id', deviceId).maybeSingle();
  if (!device) return res.status(404).json({ error: 'Dispositivo nao encontrado.' });

  const { error } = await req.supabase
    .from('campaign_devices')
    .upsert({ owner_id: req.ownerId, campaign_id: campaign.id, device_id: device.id }, { onConflict: 'campaign_id,device_id' });
  if (error) return handleError(res, error);

  logEvent(req.ownerId, 'campaign_assigned', `"${campaign.name}" vinculada ao dispositivo ${device.code}`);
  res.status(201).json({ campaignId: campaign.id, deviceId: device.id });
});

router.delete('/:id/assign/:deviceId', requireAuth, async (req, res) => {
  const { error } = await req.supabase
    .from('campaign_devices')
    .delete()
    .eq('campaign_id', req.params.id)
    .eq('device_id', req.params.deviceId);
  if (error) return handleError(res, error);
  res.status(204).end();
});

module.exports = router;
