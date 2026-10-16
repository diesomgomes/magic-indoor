const express = require('express');

const router = express.Router();

const DEFAULT_ITEMS = 5;
const MAX_ITEMS = 10;
const FETCH_TIMEOUT_MS = 8000;
const REFRESH_SECONDS = 60;
// So aceitamos o endpoint do conector do Agenda Expert: evita usar este backend para buscar qualquer URL.
const ENDPOINT_PATH = /\/api\/publico\/tv\/proximos\/?$/;

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function parseAgendaUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (!ENDPOINT_PATH.test(url.pathname)) return null;
    return url;
  } catch {
    return null;
  }
}

// "2026-10-16 14:30" -> { day: '2026-10-16', time: '14:30' } (horario local da agenda, sem fuso)
function splitLocal(value) {
  const [day = '', time = ''] = String(value || '').split(' ');
  return { day, time };
}

function dayLabel(day, today) {
  if (day === today) return 'Hoje';
  const next = new Date(`${today}T12:00:00`);
  next.setDate(next.getDate() + 1);
  if (day === next.toISOString().slice(0, 10)) return 'Amanhã';
  const [y, m, d] = day.split('-');
  return y ? `${d}/${m}` : day;
}

function renderPage({ company, items, error }) {
  let body;
  if (error) {
    body = `<div class="msg">${escapeHtml(error)}</div>`;
  } else if (!items.length) {
    body = '<div class="msg">Nenhum agendamento por enquanto.</div>';
  } else {
    let lastDay = '';
    body = items
      .map((item) => {
        const { day, time } = splitLocal(item.inicio);
        const heading = day !== lastDay ? `<h2 class="day">${escapeHtml(dayLabel(day, item.today))}</h2>` : '';
        lastDay = day;
        const who = [item.cliente, item.servico].filter(Boolean).map(escapeHtml).join(' · ');
        const color = /^#[0-9a-f]{3,8}$/i.test(item.cor || '') ? item.cor : '#4f8ff0';
        return `${heading}<article style="border-left-color:${color}"><time>${escapeHtml(time)}</time><div><strong>${who}</strong><span>${escapeHtml(item.profissional || '')}</span></div></article>`;
      })
      .join('');
  }
  const updated = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="${REFRESH_SECONDS}">
<title>Próximos atendimentos</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; height: 100%; background: #0d1b2a; color: #eaf1fb; font-family: 'Segoe UI', Arial, sans-serif; overflow: hidden; }
  body { display: flex; flex-direction: column; padding: 3.5vh 4vw; background: radial-gradient(circle at 20% 0%, #1c3560 0%, #0d1b2a 65%); }
  header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 2vh; }
  header h1 { margin: 0; font-size: clamp(18px, 3vw, 34px); letter-spacing: -.02em; }
  header span { color: #93a9cc; font-size: clamp(11px, 1.4vw, 16px); }
  main { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 1.2vh; overflow: hidden; }
  h2.day { margin: .6vh 0 0; color: #93a9cc; font-size: clamp(12px, 1.6vw, 20px); text-transform: uppercase; letter-spacing: .08em; }
  article { flex: 1 1 0; min-height: 0; display: flex; align-items: center; gap: 2vw; background: rgba(255,255,255,.06); border-left: 6px solid #4f8ff0; border-radius: 6px; padding: 0 1.6vw; overflow: hidden; }
  article time { font-size: clamp(20px, 4vw, 46px); font-weight: 700; font-variant-numeric: tabular-nums; min-width: 4.2em; }
  article div { display: flex; flex-direction: column; min-width: 0; }
  article strong { font-size: clamp(15px, 2.6vw, 30px); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  article span { color: #b9c9e2; font-size: clamp(11px, 1.6vw, 20px); }
  .msg { color: #93a9cc; font-size: clamp(14px, 2vw, 22px); padding: 4vh 0; }
</style></head>
<body>
  <header><h1>${escapeHtml(company || 'Próximos atendimentos')}</h1><span>Atualizado às ${updated}</span></header>
  <main>${body}</main>
</body></html>`;
}

// Pagina de proximos agendamentos pronta para tela cheia (o player mostra dentro de um iframe).
router.get('/view', async (req, res) => {
  const target = parseAgendaUrl(String(req.query.url || '').trim());
  const requested = Number.parseInt(req.query.count, 10);
  const limit = Number.isNaN(requested) ? DEFAULT_ITEMS : Math.min(MAX_ITEMS, Math.max(1, requested));
  res.type('html');

  if (!target) {
    return res.status(400).send(renderPage({ items: [], error: 'Endereço da agenda inválido.' }));
  }

  try {
    target.searchParams.set('limite', String(limit));
    const response = await fetch(target, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { 'User-Agent': 'MagicIndoor/1.0', Accept: 'application/json' },
    });
    if (response.status === 401) {
      return res.send(renderPage({ items: [], error: 'Chave da agenda inválida. Gere a chave de novo e atualize a programação.' }));
    }
    if (!response.ok) {
      return res.send(renderPage({ items: [], error: 'Não foi possível ler a agenda agora.' }));
    }
    const data = await response.json();
    const today = splitLocal(data.agora).day;
    const items = (Array.isArray(data.itens) ? data.itens : []).slice(0, limit).map((item) => ({ ...item, today }));
    res.send(renderPage({ company: data.empresa, items }));
  } catch (error) {
    console.error('agenda view:', error.message);
    res.send(renderPage({ items: [], error: 'Agenda indisponível no momento.' }));
  }
});

module.exports = router;
