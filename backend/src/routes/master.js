const express = require('express');
const { supabaseAdmin } = require('../supabase');
const { requireAuth, requireMaster } = require('../middleware/auth');

const router = express.Router();

function handleError(res, error, status = 500) {
  console.error(error);
  res.status(status).json({ error: error.message || 'Erro interno.' });
}

// Lista todas as contas (usuarios do Supabase Auth) cruzadas com os dados cadastrais,
// status de aprovacao, limite e quantidade atual de dispositivos. So o master ve isso —
// usa supabaseAdmin (service role) de proposito, ja que precisa enxergar TODAS as contas,
// nao so a propria (RLS normal bloquearia isso).
router.get('/accounts', requireAuth, requireMaster, async (req, res) => {
  const { data: usersPage, error: usersError } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
  if (usersError) return handleError(res, usersError);

  const { data: settingsRows, error: settingsError } = await supabaseAdmin.from('company_settings').select('*');
  if (settingsError) return handleError(res, settingsError);
  const settingsByOwner = new Map((settingsRows || []).map((row) => [row.owner_id, row]));

  const { data: deviceRows, error: devicesError } = await supabaseAdmin.from('devices').select('owner_id');
  if (devicesError) return handleError(res, devicesError);
  const deviceCountByOwner = new Map();
  for (const row of deviceRows || []) {
    deviceCountByOwner.set(row.owner_id, (deviceCountByOwner.get(row.owner_id) || 0) + 1);
  }

  const accounts = usersPage.users
    .filter((user) => user.id !== process.env.MASTER_USER_ID)
    .map((user) => {
      const settings = settingsByOwner.get(user.id);
      return {
        id: user.id,
        email: user.email,
        full_name: (user.user_metadata && user.user_metadata.full_name) || '',
        razao_social: settings ? settings.razao_social : '',
        created_at: user.created_at,
        email_confirmed: Boolean(user.email_confirmed_at),
        approved: settings ? settings.approved : false,
        max_devices: settings ? settings.max_devices : null,
        device_count: deviceCountByOwner.get(user.id) || 0,
      };
    })
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  res.json(accounts);
});

// Aprova/rejeita uma conta e/ou define o limite de dispositivos. Upsert porque a conta
// pode ainda nao ter nenhuma linha em company_settings (cria na primeira vez que o
// master mexe nela, ou na primeira vez que a propria pessoa salva os dados da empresa).
router.patch('/accounts/:id', requireAuth, requireMaster, async (req, res) => {
  const targetId = req.params.id;
  if (targetId === process.env.MASTER_USER_ID) {
    return res.status(400).json({ error: 'A conta master nao precisa de aprovacao.' });
  }

  const { data: existing } = await supabaseAdmin.from('company_settings').select('*').eq('owner_id', targetId).maybeSingle();

  const patch = { owner_id: targetId, updated_at: new Date().toISOString() };
  if (typeof req.body.approved === 'boolean') patch.approved = req.body.approved;
  if ('max_devices' in req.body) {
    const raw = req.body.max_devices;
    patch.max_devices = raw === null || raw === '' ? null : Math.max(0, Number.parseInt(raw, 10) || 0);
  }

  const { data, error } = await supabaseAdmin
    .from('company_settings')
    .upsert({ razao_social: '', cnpj: '', endereco: '', approved: false, max_devices: null, ...existing, ...patch })
    .select()
    .single();
  if (error) return handleError(res, error);
  res.json(data);
});

module.exports = router;
