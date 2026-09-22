const { supabaseAdmin } = require('./supabase');

function logEvent(ownerId, type, message) {
  supabaseAdmin
    .from('events')
    .insert({ owner_id: ownerId, type, message })
    .then(({ error }) => { if (error) console.error('Falha ao gravar evento:', error.message); });
}

module.exports = { logEvent };
