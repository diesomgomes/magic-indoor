const path = require('path');
const fs = require('fs');
const express = require('express');
const multer = require('multer');
const { requireAuth } = require('../middleware/auth');
const { logEvent } = require('../events');

const router = express.Router();

const uploadsRoot = path.join(__dirname, '..', '..', 'uploads');

const ALLOWED_MIME = {
  'image/jpeg': 'imagem',
  'image/png': 'imagem',
  'image/gif': 'gif',
  'video/mp4': 'video',
  'video/webm': 'video',
  'video/ogg': 'video',
};
const MAX_FILES_PER_UPLOAD = 20;

// Cada conta grava em uploads/<owner_id>/ — requireAuth roda antes do multer,
// entao req.ownerId ja esta disponivel aqui.
const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const dir = path.join(uploadsRoot, req.ownerId);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME[file.mimetype]) {
      const err = new Error('Tipo de arquivo nao suportado. Envie imagem (JPG/PNG), video (MP4/WebM/Ogg) ou GIF.');
      err.status = 400;
      return cb(err);
    }
    cb(null, true);
  },
});

// O multer entrega o nome original interpretado como latin1; reconverte para UTF-8 (acentos).
function displayName(originalName) {
  const decoded = Buffer.from(originalName, 'latin1').toString('utf8');
  return path.basename(decoded, path.extname(decoded)).trim().slice(0, 120) || 'Arquivo';
}
function handleError(res, error, status = 500) {
  console.error(error);
  res.status(status).json({ error: error.message || 'Erro interno.' });
}

router.get('/', requireAuth, async (req, res) => {
  const { data: files, error } = await req.supabase.from('media_files').select('*').order('created_at', { ascending: false });
  if (error) return handleError(res, error);

  const { data: usageRows } = await req.supabase.from('campaign_items').select('media_id, campaign_id').not('media_id', 'is', null);
  const usageMap = new Map();
  for (const row of usageRows || []) {
    if (!usageMap.has(row.media_id)) usageMap.set(row.media_id, new Set());
    usageMap.get(row.media_id).add(row.campaign_id);
  }
  res.json(files.map((f) => ({ ...f, usage_count: usageMap.has(f.id) ? usageMap.get(f.id).size : 0 })));
});

router.post('/', requireAuth, upload.array('files', MAX_FILES_PER_UPLOAD), async (req, res) => {
  const files = req.files || [];
  if (!files.length) return res.status(400).json({ error: 'Envie ao menos um arquivo.' });

  const rows = files.map((file) => ({
    owner_id: req.ownerId,
    name: displayName(file.originalname),
    // guarda o caminho relativo a uploads/, ja incluindo a pasta do dono, para que
    // GET /uploads/<file_name> funcione sem o cliente (painel/APK) precisar saber o owner_id.
    file_name: `${req.ownerId}/${file.filename}`,
    file_type: file.mimetype,
    file_size: file.size,
    media_kind: ALLOWED_MIME[file.mimetype],
  }));
  const { data, error } = await req.supabase.from('media_files').insert(rows).select();
  if (error) return handleError(res, error);

  logEvent(req.ownerId, 'media_uploaded', `${data.length === 1 ? 'Arquivo enviado' : `${data.length} arquivos enviados`}: ${data.map((f) => f.name).join(', ')}`.slice(0, 200));
  res.status(201).json(data);
});

router.patch('/:id', requireAuth, async (req, res) => {
  const name = ((req.body || {}).name || '').trim().slice(0, 120);
  if (!name) return res.status(400).json({ error: 'Informe um nome para o arquivo.' });

  const { data, error } = await req.supabase.from('media_files').update({ name }).eq('id', req.params.id).select().maybeSingle();
  if (error) return handleError(res, error);
  if (!data) return res.status(404).json({ error: 'Arquivo nao encontrado.' });
  res.json(data);
});

// Exclui o arquivo da biblioteca e do disco. Os itens de programacao que o usavam sao
// removidos junto (ON DELETE CASCADE no schema.sql).
router.delete('/:id', requireAuth, async (req, res) => {
  const { data: file } = await req.supabase.from('media_files').select('*').eq('id', req.params.id).maybeSingle();
  if (!file) return res.status(404).json({ error: 'Arquivo nao encontrado.' });

  const { error } = await req.supabase.from('media_files').delete().eq('id', req.params.id);
  if (error) return handleError(res, error);
  fs.unlink(path.join(uploadsRoot, file.file_name), () => {});
  logEvent(req.ownerId, 'media_deleted', `Arquivo excluído: ${file.name}`);
  res.status(204).end();
});

module.exports = router;
