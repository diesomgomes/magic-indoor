const { supabaseAdmin, supabaseForToken } = require('../supabase');

// Exige uma sessao Supabase valida no header Authorization. Preenche req.ownerId
// e req.supabase (cliente ja autenticado como esse usuario, sujeito as policies de RLS).
async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Faca login para usar o painel.' });

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) {
    return res.status(401).json({ error: 'Sessao invalida ou expirada. Faca login novamente.' });
  }

  req.ownerId = data.user.id;
  req.supabase = supabaseForToken(token);
  next();
}

// Pra usar DEPOIS de requireAuth (precisa de req.ownerId ja preenchido). So deixa passar
// quem e o usuario designado como master via MASTER_USER_ID no .env — nenhum outro
// usuario, mesmo autenticado, tem acesso as rotas de /api/master.
function requireMaster(req, res, next) {
  if (!process.env.MASTER_USER_ID || req.ownerId !== process.env.MASTER_USER_ID) {
    return res.status(403).json({ error: 'Acesso restrito.' });
  }
  next();
}

module.exports = { requireAuth, requireMaster };
