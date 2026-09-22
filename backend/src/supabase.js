const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Configure SUPABASE_URL, SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY em backend/.env');
}

// Cliente com privilegio total (ignora RLS). So para tarefas do sistema: verificar
// tokens de sessao, o polling publico dos dispositivos (o APK nao tem login) e a
// varredura periodica de online/offline, que e cross-tenant por natureza.
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Cliente por requisicao, autenticado como o usuario dono do token de sessao.
// As policies de RLS do supabase/schema.sql garantem que ele so enxerga/edita
// as proprias linhas (owner_id = auth.uid()) mesmo que uma rota esqueca um filtro.
function supabaseForToken(accessToken) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

module.exports = { supabaseAdmin, supabaseForToken };
