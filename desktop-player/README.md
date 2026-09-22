# Magic Indoor Player — Windows

Versão desktop do player, mesma função do APK Android: mostra o código de
vinculação, consulta a programação vinculada a esse código e toca a playlist
em tela cheia. Feito com Electron (Chromium empacotado).

## Como funciona

- `main.js` gera (na primeira vez) um código `MI-XXXXXX` aleatório e guarda em
  `%APPDATA%/magic-indoor-player/device-code.json` — persiste entre reinícios.
- `index.html` é a mesma lógica do `app/src/main/assets/player.html` do
  Android, adaptada pra rodar sozinha (o polling ao backend é feito direto em
  JS com `fetch`, sem precisar de uma ponte com código nativo).
- Abre em modo kiosk (tela cheia, sem bordas) e se registra pra iniciar junto
  com o Windows (`app.setLoginItemSettings`) — ou seja, ao ligar o PC (mais
  precisamente, ao fazer login no Windows) o player já sobe sozinho.
- `Ctrl+Shift+Q` fecha o programa (útil pra manutenção no local).

## Build

```powershell
cd desktop-player
npm install
npm run dist
```

Gera `dist/Magic Indoor Player Setup <versão>.exe` (instalador NSIS).

### Se o build travar no Windows

Dois problemas conhecidos, ambos específicos do ambiente Windows, não do
código:

1. **Erro de link simbólico ao baixar `winCodeSign`**: o electron-builder
   baixa ferramentas de assinatura (inclusive binários de macOS) mesmo pra
   build só de Windows. Sem *Modo de Desenvolvedor* ativado (ou sem rodar
   como Administrador), o Windows recusa criar os links simbólicos desses
   arquivos. Ative em Configurações → Privacidade e segurança → Para
   desenvolvedores → Modo de desenvolvedor, e rode de novo.
2. **`app.asar` "already in use by another process"**: costuma acontecer se
   o projeto estiver numa pasta protegida pelo Controlled Folder Access do
   Windows Defender (ex.: `Desktop`, `Documentos`). Se acontecer, builda
   apontando a saída pra outra pasta, editando temporariamente
   `directories.output` no `package.json` (ex.: `"C:/temp/dist"`), ou tire
   essa pasta da lista de "Acesso controlado a pastas" do Defender.

## Instalar num PC de exibição

1. Copia o `.exe` gerado pro computador.
2. Roda o instalador (instala por padrão pra todos os usuários da máquina).
3. Abre o "Magic Indoor Player" uma vez — mostra o código de vinculação.
4. No painel web, **Dispositivos → Vincular dispositivo**, digita o nome e
   esse código.
5. Da próxima vez que o Windows ligar, o player já abre sozinho.

Pra trocar o PC de conta/local, é só apagar
`%APPDATA%/magic-indoor-player/device-code.json` e abrir o programa de novo —
ele gera um código novo.
