const express = require('express');

const router = express.Router();

const DEFAULT_ITEMS = 5;
const MAX_ITEMS = 10;
const FETCH_TIMEOUT_MS = 8000;
const MAX_BODY_CHARS = 2_000_000;
const REFRESH_SECONDS = 300;

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function decodeEntities(text) {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&amp;/g, '&');
}

// Extrai texto puro de um trecho de XML: remove CDATA, decodifica entidades e tira tags HTML.
function toPlainText(raw) {
  if (!raw) return '';
  const unwrapped = raw.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  return decodeEntities(unwrapped).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function firstTag(block, names) {
  for (const name of names) {
    const match = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
    if (match) return toPlainText(match[1]);
  }
  return '';
}

function parseFeed(xml, limit) {
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) || [];
  const firstBlockIndex = blocks.length ? xml.indexOf(blocks[0]) : xml.length;
  const source = firstTag(xml.slice(0, firstBlockIndex), ['title']);
  const items = blocks
    .map((block) => ({
      title: firstTag(block, ['title']),
      summary: firstTag(block, ['description', 'summary', 'content']),
    }))
    .filter((item) => item.title)
    .slice(0, limit);
  return { source, items };
}

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function renderPage({ source, items, error }) {
  const cards = items
    .map((item) => {
      const summary = item.summary ? escapeHtml(item.summary.slice(0, 220)) + (item.summary.length > 220 ? '…' : '') : '';
      return `<article><h2>${escapeHtml(item.title)}</h2>${summary ? `<p>${summary}</p>` : ''}</article>`;
    })
    .join('');
  const body = error
    ? `<div class="msg">${escapeHtml(error)}</div>`
    : (cards || '<div class="msg">Nenhuma notícia encontrada neste feed.</div>');
  const updated = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="${REFRESH_SECONDS}">
<title>Notícias</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; height: 100%; background: #0d1b2a; color: #eaf1fb; font-family: 'Segoe UI', Arial, sans-serif; overflow: hidden; }
  body { display: flex; flex-direction: column; padding: 3.5vh 4vw; background: radial-gradient(circle at 20% 0%, #1c3560 0%, #0d1b2a 65%); }
  header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 2.5vh; }
  header h1 { margin: 0; font-size: clamp(18px, 3vw, 34px); letter-spacing: -.02em; }
  header span { color: #93a9cc; font-size: clamp(11px, 1.4vw, 16px); }
  main { flex: 1; min-height: 0; display: grid; grid-auto-rows: minmax(0, 1fr); gap: 1.6vh; overflow: hidden; }
  article { background: rgba(255,255,255,.06); border-left: 4px solid #4f8ff0; border-radius: 6px; padding: 1.6vh 1.6vw; display: flex; flex-direction: column; justify-content: center; overflow: hidden; }
  article h2 { margin: 0; font-size: clamp(15px, 2.4vw, 28px); line-height: 1.25; }
  article p { margin: .8vh 0 0; color: #b9c9e2; font-size: clamp(11px, 1.5vw, 18px); line-height: 1.4; }
  .msg { color: #93a9cc; font-size: clamp(14px, 2vw, 22px); padding: 4vh 0; }
</style></head>
<body>
  <header><h1>${escapeHtml(source || 'Notícias')}</h1><span>Atualizado às ${updated}</span></header>
  <main>${body}</main>
</body></html>`;
}

// Pagina de noticias pronta para exibir em tela cheia (o player mostra dentro de um iframe).
router.get('/view', async (req, res) => {
  const feedUrl = String(req.query.url || '').trim();
  const requested = Number.parseInt(req.query.count, 10);
  const limit = Number.isNaN(requested) ? DEFAULT_ITEMS : Math.min(MAX_ITEMS, Math.max(1, requested));
  res.type('html');

  if (!isHttpUrl(feedUrl)) {
    return res.status(400).send(renderPage({ items: [], error: 'Endereço do feed inválido.' }));
  }

  try {
    const response = await fetch(feedUrl, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { 'User-Agent': 'MagicIndoor/1.0', Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*' },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const xml = (await response.text()).slice(0, MAX_BODY_CHARS);
    res.send(renderPage(parseFeed(xml, limit)));
  } catch (err) {
    console.warn('Falha ao carregar feed de noticias:', err.message);
    res.status(502).send(renderPage({ items: [], error: 'Não foi possível carregar as notícias agora. Tentando novamente em instantes.' }));
  }
});

module.exports = router;
