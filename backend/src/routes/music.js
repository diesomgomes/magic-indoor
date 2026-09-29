const express = require('express');

const router = express.Router();

const FETCH_TIMEOUT_MS = 8000;
const POLL_SECONDS = 15;

// Le a "faixa tocando agora" de um usuario do Last.fm (gratuito, sem OAuth — so precisa
// de uma API key). O Last.fm funciona como agregador: a pessoa pode estar ouvindo de
// qualquer app (Spotify, YouTube Music, Amazon Music, um radio...), desde que esse app
// esteja "fazendo scrobble" pro Last.fm — a TV so mostra a informacao, nao toca audio.
async function fetchNowPlaying(username) {
  const apiKey = process.env.LASTFM_API_KEY;
  if (!apiKey) throw Object.assign(new Error('LASTFM_API_KEY nao configurada no servidor.'), { code: 'no_key' });

  const url = `https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=${encodeURIComponent(username)}&api_key=${apiKey}&format=json&limit=1`;
  const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  const data = await response.json();
  if (data.error) throw Object.assign(new Error(data.message || 'Usuario do Last.fm nao encontrado.'), { code: 'lastfm_error' });

  const track = data.recenttracks && data.recenttracks.track && data.recenttracks.track[0];
  if (!track) return { playing: false };

  const isPlaying = track['@attr'] && track['@attr'].nowplaying === 'true';
  if (!isPlaying) return { playing: false };

  const images = track.image || [];
  const art = (images.find((i) => i.size === 'extralarge') || images[images.length - 1] || {})['#text'] || '';

  return {
    playing: true,
    track: track.name || '',
    artist: (track.artist && track.artist['#text']) || '',
    album: (track.album && track.album['#text']) || '',
    art: art || null,
  };
}

// JSON puro, consultado pela propria pagina /view via fetch (evita recarregar a pagina
// inteira a cada atualizacao, o que faria a capa do album piscar na TV).
router.get('/now-playing.json', async (req, res) => {
  const username = String(req.query.user || '').trim();
  if (!username) return res.status(400).json({ error: 'Informe o usuario do Last.fm.' });
  try {
    res.json(await fetchNowPlaying(username));
  } catch (err) {
    console.warn('Falha ao consultar Last.fm:', err.message);
    res.status(502).json({ error: err.message });
  }
});

// Pagina pronta pra exibir em tela cheia (o player mostra dentro de um iframe), com a
// capa do album, musica e artista tocando agora — atualiza sozinha via JS, sem piscar.
router.get('/view', (req, res) => {
  const username = String(req.query.user || '').trim();
  res.type('html').send(`<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Trilha sonora</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; height: 100%; background: #0d1b2a; color: #eaf1fb; font-family: 'Segoe UI', Arial, sans-serif; overflow: hidden; }
  body { display: flex; align-items: center; justify-content: center; background: radial-gradient(circle at 30% 20%, #1c3560 0%, #0d1b2a 65%); }
  .card { display: flex; align-items: center; gap: 5vw; padding: 4vh 5vw; max-width: 90vw; opacity: 0; transition: opacity .6s ease; }
  .card.visible { opacity: 1; }
  .art { width: 34vh; height: 34vh; border-radius: 18px; object-fit: cover; background: rgba(255,255,255,.06); box-shadow: 0 30px 70px rgba(0,0,0,.5); flex-shrink: 0; }
  .info { min-width: 0; }
  .eyebrow { font-size: clamp(11px, 1.4vw, 16px); font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: #6ec6ff; display: flex; align-items: center; gap: 10px; }
  .dot { width: 9px; height: 9px; border-radius: 50%; background: #4ade80; animation: pulse 1.6s infinite; }
  @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: .35; } }
  .track { margin: 1.6vh 0 0; font-size: clamp(24px, 4.2vw, 56px); font-weight: 800; letter-spacing: -.02em; line-height: 1.15; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
  .artist { margin: 1.2vh 0 0; font-size: clamp(16px, 2.4vw, 30px); color: #b9c9e2; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .msg { font-size: clamp(16px, 2.4vw, 28px); color: #93a9cc; text-align: center; padding: 0 6vw; }
</style></head>
<body>
  <div class="card" id="card">
    <img class="art" id="art" alt="">
    <div class="info">
      <div class="eyebrow"><span class="dot"></span>Tocando agora</div>
      <div class="track" id="track"></div>
      <div class="artist" id="artist"></div>
    </div>
  </div>
  <div class="msg" id="msg" style="display:none"></div>
  <script>
    var username = ${JSON.stringify(username).replace(/</g, '\\u003c')};
    var card = document.getElementById('card');
    var artEl = document.getElementById('art');
    var trackEl = document.getElementById('track');
    var artistEl = document.getElementById('artist');
    var msgEl = document.getElementById('msg');
    var lastArt = null;

    function showMessage(text) {
      card.classList.remove('visible');
      msgEl.style.display = 'block';
      msgEl.textContent = text;
    }

    function showTrack(data) {
      msgEl.style.display = 'none';
      trackEl.textContent = data.track || '';
      artistEl.textContent = [data.artist, data.album].filter(Boolean).join(' — ');
      if (data.art && data.art !== lastArt) { artEl.src = data.art; lastArt = data.art; }
      card.classList.add('visible');
    }

    function poll() {
      if (!username) { showMessage('Configure o usuário do Last.fm nesta ferramenta.'); return; }
      fetch('/api/music/now-playing.json?user=' + encodeURIComponent(username))
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data.error) { showMessage(data.error); return; }
          if (!data.playing) { showMessage('Nada tocando agora.'); return; }
          showTrack(data);
        })
        .catch(function () { showMessage('Não foi possível consultar o Last.fm agora.'); });
    }
    poll();
    setInterval(poll, ${POLL_SECONDS * 1000});
  </script>
</body></html>`);
});

module.exports = router;
