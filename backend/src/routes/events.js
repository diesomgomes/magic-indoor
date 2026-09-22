const express = require('express');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 8));
  const { data, error } = await req.supabase
    .from('events')
    .select('*')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit);
  if (error) { console.error(error); return res.status(500).json({ error: error.message }); }
  res.json(data);
});

module.exports = router;
