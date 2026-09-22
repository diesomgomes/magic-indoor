# Backend MAGICINDOR

Backend mínimo para fechar o primeiro fluxo ponta a ponta: cadastrar dispositivo, cadastrar campanha com upload, vincular campanha a dispositivo, e o APK consultar/baixar o conteúdo.

Stack: Node.js + Express. Contas, dispositivos, campanhas e eventos ficam no Postgres do Supabase (com RLS isolando cada conta); arquivos de mídia continuam salvos em disco local, em `uploads/<id-da-conta>/`.

## Como rodar

```powershell
cd backend
npm install
npm start
```

Servidor sobe em `http://localhost:3000`. Exige `backend/.env` com `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` preenchidos (veja `.env.example`) — sem isso o servidor não inicia. O schema do banco fica em [`../supabase/schema.sql`](../supabase/schema.sql).

O painel web (`../index.html`) é servido diretamente pelo backend na raiz (`GET /`), então basta abrir `http://localhost:3000` no navegador para usar o painel já conectado à API — evita problemas de CORS/bloqueio que ocorrem ao abrir o arquivo HTML diretamente (`file://`).

Para desenvolvimento com reinício automático:

```powershell
npm run dev
```

## Autenticação

Toda rota de dados (`/api/devices`, `/api/campaigns`, `/api/media`, `/api/company`, `/api/events`) exige `Authorization: Bearer <access_token>` de uma sessão Supabase válida — o painel (`index.html`) já cuida disso via `apiFetch()`. Só ficam públicas: `GET /api/devices/:code/campaigns` (consulta do APK, sem login) e `GET /api/config`/`/api/health`.

## Endpoints

### Dispositivos

| Método | Rota | Descrição |
| --- | --- | --- |
| `POST` | `/api/devices/link` | **Única forma de um dispositivo passar a existir.** Não há registro automático pela rede: o dono da conta digita o código `MI-XXXXXX` exibido na tela do aparelho. Body: `{ "name", "code" }`. Cria (ou renomeia, se já existir) já com status `aprovado` — não existe etapa de aprovação. |
| `GET` | `/api/devices` | Lista todos os dispositivos. |
| `PATCH` | `/api/devices/:id/status` | Ativa/desativa um dispositivo já vinculado. Body: `{ "status": "aprovado" \| "rejeitado" }`. |
| `DELETE` | `/api/devices/:id` | Exclui o dispositivo (remove também os vínculos com campanhas). |
| `GET` | `/api/devices/:code/campaigns?screenWidth&screenHeight&screenDensity` | Consulta feita pelo APK a cada 10s: retorna o dispositivo e a playlist (`items`). Devolve 404 se o código ainda não foi vinculado pelo painel. Os parâmetros de tela (opcionais) atualizam `screen_width/height/density` e `last_seen_at` a cada chamada. |

### Empresa

| Método | Rota | Descrição |
| --- | --- | --- |
| `GET` | `/api/company` | Retorna os dados cadastrais da empresa (razão social, CNPJ, endereço). |
| `PUT` | `/api/company` | Atualiza os dados cadastrais. Body: `{ razao_social, cnpj, endereco }`. |

### Downloads

| Método | Rota | Descrição |
| --- | --- | --- |
| `GET` | `/downloads/magic-indoor-player.apk` | Baixa o APK mais recente gerado em `app/build/outputs/apk/debug/` (botão "Baixar APK" na tela de Dispositivos). |

### Eventos

| Método | Rota | Descrição |
| --- | --- | --- |
| `GET` | `/api/events?limit=8` | Lista os eventos mais recentes (mais novo primeiro). `limit` é opcional, máximo 100. |

Eventos são gravados automaticamente ao registrar/vincular/aprovar/rejeitar/excluir dispositivos, ao criar/excluir/vincular programações, e por uma varredura periódica (a cada 15s) que detecta dispositivos aprovados ficando online/offline com base no `last_seen_at` (limite de 30s sem contato = offline).

### Campanhas

| Método | Rota | Descrição |
| --- | --- | --- |
| `GET` | `/api/media` | Lista a biblioteca de arquivos (com `usage_count` = em quantas programações cada um é usado). |
| `POST` | `/api/media` | Envia um ou mais arquivos para a biblioteca (multipart, campo `files`; JPG/PNG/GIF/MP4/WebM/Ogg, até 200 MB cada). O tipo é detectado pelo arquivo. |
| `PATCH` | `/api/media/:id` | Renomeia um arquivo da biblioteca. Body: `{ "name" }`. |
| `DELETE` | `/api/media/:id` | Exclui o arquivo da biblioteca e do disco; os itens de programação que o usavam são removidos junto. |
| `GET` | `/api/campaigns` | Lista as programações, cada uma com `items` (na ordem de exibição) e `devices` vinculados. |
| `POST` | `/api/campaigns` | Cria uma programação. JSON: `{ name, orientation, items: [...] }` (`orientation`: `horizontal` ou `vertical`; padrão horizontal — no vertical o player gira o conteúdo 90° para a direita quando a tela está deitada). Item de arquivo: `{ type: "media", media_id, duration, fit_mode }`. Item de ferramenta: `{ type: "tool", kind: "web" \| "noticias", url, integration, duration, news_count }` (`news_count`, de 1 a 10, só para notícias: quantas manchetes aparecem por vez; padrão 5). A ordem do array é a ordem de exibição. |
| `PUT` | `/api/campaigns/:id` | Salva a edição: atualiza o nome e substitui a lista de itens (mesmo corpo do POST). |
| `DELETE` | `/api/campaigns/:id` | Exclui a programação (os arquivos continuam na biblioteca). |
| `POST` | `/api/campaigns/:id/assign` | Vincula campanha a um dispositivo. Body: `{ "deviceId": 1 }`. |
| `DELETE` | `/api/campaigns/:id/assign/:deviceId` | Remove o vínculo. |

Arquivos enviados ficam acessíveis em `GET /uploads/<file_name>`.

### Tipos de mídia aceitos

`image/jpeg`, `image/png`, `image/gif`, `video/mp4`, `video/webm`, `video/ogg`. Tamanho máximo por arquivo: 200 MB.

## Fluxo de teste manual

Rotas de dados exigem um token: faça login pelo painel (`/login`) e copie `access_token` de `authClient.auth.getSession()` no console do navegador, ou gere um via Supabase Auth API. Com o `$TOKEN` em mãos:

```powershell
# 1. Vincular dispositivo (o codigo e o que aparece na tela do app; ja entra aprovado)
curl -X POST http://localhost:3000/api/devices/link -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "{\"name\":\"TV Recepcao\",\"code\":\"MI-AB12CD\"}"

# 2. Enviar um arquivo para a biblioteca e montar uma programação com ele
curl -X POST http://localhost:3000/api/media -H "Authorization: Bearer $TOKEN" -F "files=@caminho\para\arquivo.gif;type=image/gif"
curl -X POST http://localhost:3000/api/campaigns -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "{\"name\":\"TESTE\",\"items\":[{\"type\":\"media\",\"media_id\":\"<uuid-do-arquivo>\",\"duration\":8}]}"

# 3. Vincular campanha ao dispositivo
curl -X POST http://localhost:3000/api/campaigns/<uuid-da-campanha>/assign -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "{\"deviceId\":\"<uuid-do-dispositivo>\"}"

# 4. APK consulta suas campanhas (rota publica, sem token)
curl http://localhost:3000/api/devices/MI-AB12CD/campaigns
```

## Status da integração

- [x] Painel web (`index.html`) consome a API real: lista campanhas e dispositivos, cadastra campanha com upload de verdade, aprova/rejeita dispositivo e vincula campanha a dispositivo, tudo com polling automático a cada 5s.
- [x] APK Android não se registra sozinho: só mostra o código na tela e faz polling a cada 10s em `GET /api/devices/:code/campaigns` (404 até o painel vincular). Assim que vinculado, reproduz a playlist completa direto da URL do backend.

## Contas individuais (Supabase)

- [x] Tela de login (`/login`), com e-mail/senha, já fala com o Supabase Auth quando configurado.
- [x] Schema multi-tenant pronto em [`../supabase/schema.sql`](../supabase/schema.sql) (RLS por `owner_id`).
- [x] Painel (`index.html`) redireciona para `/login` sem sessão, e envia `Authorization: Bearer` em toda chamada de API.
- [x] Rotas deste backend (`src/routes/*.js`) migradas de SQLite para o Postgres do Supabase: cada uma usa um cliente autenticado como o usuário da requisição (`req.supabase`), então a RLS filtra por `owner_id` automaticamente — nenhuma conta enxerga dado de outra.
- [x] Arquivos de mídia continuam em disco local (`backend/uploads/<owner_id>/…`), não no Supabase Storage — decisão deliberada para quando o backend for hospedado numa VPS com armazenamento local; o Postgres só guarda o caminho relativo do arquivo.

## O que ainda falta (próximos passos)

- Download do arquivo para armazenamento local do Android (hoje o player reproduz direto pela URL do backend, sem cache offline).
- Fila/checksum para retomada de downloads interrompidos no APK.
- Programação por data/horário (hoje toda campanha vinculada é sempre "ativa").
- Tela de pareamento com QR Code no painel, hoje a aprovação de dispositivo é feita numa lista simples.
- Cadastro de conta (signup) ainda é feito manualmente; falta um fluxo de convite/onboarding para novos clientes.
