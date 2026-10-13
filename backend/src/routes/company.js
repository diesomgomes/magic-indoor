const express = require('express');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  const { data, error } = await req.supabase.from('company_settings').select('*').eq('owner_id', req.ownerId).maybeSingle();
  if (error) { console.error(error); return res.status(500).json({ error: error.message }); }
  const result = data || { razao_social: '', cnpj: '', endereco: '', approved: false, max_devices: null };
  // A conta master nunca fica presa atras do proprio portao de aprovacao.
  if (req.ownerId === process.env.MASTER_USER_ID) result.approved = true;
  res.json(result);
});

router.put('/', requireAuth, async (req, res) => {
  const { razao_social, cnpj, endereco } = req.body || {};
  const { data, error } = await req.supabase
    .from('company_settings')
    .upsert({
      owner_id: req.ownerId,
      razao_social: (razao_social || '').trim(),
      cnpj: (cnpj || '').trim(),
      endereco: (endereco || '').trim(),
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (error) { console.error(error); return res.status(500).json({ error: error.message }); }
  res.json(data);
});

module.exports = router;
