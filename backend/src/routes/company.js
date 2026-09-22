const express = require('express');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  const { data, error } = await req.supabase.from('company_settings').select('*').eq('owner_id', req.ownerId).maybeSingle();
  if (error) { console.error(error); return res.status(500).json({ error: error.message }); }
  res.json(data || { razao_social: '', cnpj: '', endereco: '' });
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
