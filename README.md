# MAGICINDOR

Plataforma de mídia indoor inteligente para cadastrar campanhas e distribuir conteúdos para dispositivos Android conectados, substituindo o uso de pendrive.

> Estado atual: primeiro fluxo ponta a ponta funcionando. Painel web e APK Android já conversam com o backend real: cadastro de dispositivo, aprovação, cadastro de campanha com upload, vínculo e sincronização automática por polling.

## Visão do produto

O MAGICINDOR terá dois lados:

- **Painel web:** cadastro de campanhas, upload de imagens, vídeos e GIFs, gerenciamento de dispositivos e programação de veiculações.
- **Player Android:** aplicativo instalado em TVs, painéis ou dispositivos Android para reproduzir os conteúdos enviados pela plataforma.

Fluxo planejado:

```text
Administrador -> Painel web -> API/backend -> Dispositivo Android -> Tela
```

## O que já foi feito

### Painel web

Arquivo principal: `index.html` (servido pelo backend em `http://localhost:3000`)

- Dashboard com identidade visual do MAGICINDOR, conectado à API real (`backend/`).
- KPIs calculados a partir de dados reais: campanhas cadastradas, dispositivos online, dispositivos aguardando aprovação e vínculos ativos.
- Lista de campanhas cadastradas, carregada da API, com upload real de arquivo.
- Cadastro de campanha pelo modal com envio multipart para `POST /api/campaigns`.
- Formatos aceitos: imagens (JPG/PNG), vídeos (MP4/WebM/Ogg) e GIF, validados também no servidor.
- Pré-visualização local de imagem e vídeo antes do cadastro.
- Vínculo de campanha a dispositivo diretamente pela lista de campanhas (dropdown "Enviar para...").
- Lista de dispositivos cadastrados, com aprovação/rejeição direto na interface.
- Status "online"/"offline" calculado a partir do último contato (`last_seen_at`) reportado pelo APK.
- Atualização automática por polling a cada 5 segundos (campanhas e dispositivos).
- Layout responsivo para desktop e celular.
- Área de próximas veiculações e atividade da rede (ainda estáticas, aguardando o módulo de programação).

### Aplicativo Android

Projeto localizado em `app/`

- Projeto Android nativo configurado com Gradle.
- Application ID: `com.magicindor.player`.
- Nome exibido: `MAGICINDOR Player`.
- Compatibilidade mínima: Android 6.0 / API 23.
- Compilação configurada para Android SDK 36.
- Player abre em tela cheia.
- Orientação configurada para paisagem.
- Modo imersivo para uso em tela de mídia.
- WebView configurado para executar o player local.
- Reprodução automática de mídia configurada sem exigir toque do usuário.
- Identificador de dispositivo gerado a partir do Android ID, exibido como código `MI-XXXXXX`.
- Botão voltar bloqueado durante o modo apresentação.
- Registro automático do dispositivo na API ao iniciar (`POST /api/devices/register`).
- Polling a cada 10 segundos em `GET /api/devices/:code/campaigns` para buscar a campanha vinculada mais recente.
- Exibição da campanha recebida (imagem, vídeo ou GIF) direto pela URL do backend, substituindo a tela demo assim que sincroniza.
- Mantém o último conteúdo em tela caso a rede falhe ou não haja campanha vinculada.
- Tela demo em `app/src/main/assets/player.html` exibida até a primeira sincronização.

### Backend mínimo

Projeto localizado em `backend/` — ver [`backend/README.md`](backend/README.md) para detalhes completos da API.

- API em Node.js + Express, banco SQLite local (`better-sqlite3`).
- Cadastro e consulta de dispositivos, com fluxo de aprovação (`pendente` / `aprovado` / `rejeitado`).
- Cadastro de campanhas com upload real de arquivo (imagem, vídeo ou GIF), salvo em disco em `backend/uploads/`.
- Vínculo de campanha a dispositivo (`campaign_devices`).
- Endpoint de sincronização para o APK: `GET /api/devices/:code/campaigns`, retorna as campanhas vinculadas a um dispositivo aprovado.
- Fluxo ponta a ponta testado manualmente: registrar dispositivo → aprovar → cadastrar campanha com upload → vincular → dispositivo consulta e recebe a campanha.

### Testes já realizados

- Dashboard aberto no navegador.
- Cadastro de campanha pelo modal testado.
- Upload de um GIF de teste realizado com sucesso.
- Campanha `TESTE` apareceu na lista como `GIF · 0.1 MB · pronto para envio`.
- Arquivo HTML validado sem erros pelo VS Code.
- APK compilado com sucesso em modo debug.
- Backend testado manualmente via curl: registro de dispositivo, aprovação, upload de campanha, vínculo dispositivo-campanha e consulta de sincronização, todos retornando os dados esperados.
- Painel web testado no navegador servido pelo backend: aprovação de dispositivo pela interface refletida no banco, campanha cadastrada via API aparece na lista com o dropdown de vínculo populado pelos dispositivos aprovados.
- APK recompilado com sucesso após a integração com a API (`assembleDebug`), pronto para testar a sincronização em um emulador ou dispositivo físico apontando para o IP do backend.

## Onde estão os arquivos importantes

| Arquivo | Finalidade |
| --- | --- |
| `index.html` | Dashboard e protótipo do painel web |
| `app/src/main/java/com/magicindor/player/MainActivity.java` | Atividade principal do APK |
| `app/src/main/assets/player.html` | Tela demo exibida pelo player Android |
| `app/src/main/AndroidManifest.xml` | Configuração, permissões e atividade inicial |
| `app/build.gradle` | Configuração de build do aplicativo |
| `settings.gradle` | Configuração do projeto Gradle |
| `build.gradle` | Versão do plugin Android |
| `app/build/outputs/apk/debug/app-debug.apk` | APK de teste compilado |
| `backend/src/server.js` | Ponto de entrada da API |
| `backend/src/db.js` | Conexão e schema do SQLite |
| `backend/src/routes/devices.js` | Rotas de dispositivos e sincronização |
| `backend/src/routes/campaigns.js` | Rotas de campanhas e upload de mídia |
| `backend/README.md` | Documentação da API do backend |

## Como testar o painel

1. Suba o backend (ver [`backend/README.md`](backend/README.md)): `cd backend && npm install && npm start`.
2. Abra `http://localhost:3000` no navegador (o próprio backend serve o painel).
3. Clique em **+ Nova campanha**, informe o nome, selecione uma imagem/vídeo/GIF e clique em **Cadastrar campanha**.
4. A campanha é enviada de verdade para a API e aparece na lista com um seletor **Enviar para...**.
5. Quando um dispositivo se registrar (via APK ou `curl`), ele aparece em **Minha rede**, com botões para aprovar ou rejeitar.
6. Após aprovado, use o seletor da campanha para vinculá-la ao dispositivo.

### Limitação atual do painel

Ainda não há autenticação nem controle de usuários/empresas — qualquer pessoa com acesso à rede local pode usar o painel. Programação por data/horário e relatórios ainda não existem (seção "Próximas veiculações" e "Atividade da rede" seguem estáticas).

## Como gerar o APK

Pré-requisitos:

- Java instalado.
- Android SDK instalado.
- Android SDK Platform 36.
- Build-tools do Android.
- Gradle 8.13 ou Android Studio.

No Windows PowerShell, a compilação utilizada neste projeto foi:

```powershell
.\.gradle-local\gradle-8.13\bin\gradle.bat assembleDebug --no-daemon
```

O APK é criado em:

```text
app\build\outputs\apk\debug\app-debug.apk
```

O arquivo `local.properties` aponta para o SDK Android local da máquina e normalmente não deve ser compartilhado entre computadores.

## Como instalar no celular Android

Ative as opções de desenvolvedor e a depuração USB no aparelho. Depois conecte o celular ao computador e confirme a autorização da depuração.

Verifique a conexão:

```powershell
adb devices
```

Instale o APK:

```powershell
adb install -r app\build\outputs\apk\debug\app-debug.apk
```

Abra o aplicativo pelo menu do celular. O player deve iniciar em modo paisagem e tela cheia, exibindo a campanha demo até sincronizar com o backend e, em seguida, a campanha vinculada ao dispositivo.

### Apontando o APK para o backend

Por padrão o APK aponta para `http://10.0.2.2:3000`, endereço que só funciona em **emulador Android** (mapeia para o `localhost` da máquina host). Para testar em um **celular físico**:

1. Descubra o IP local da máquina onde o backend está rodando (`ipconfig` no Windows, procure o IPv4 da rede Wi-Fi).
2. Edite a constante `API_BASE` em [`app/src/main/java/com/magicindor/player/MainActivity.java`](app/src/main/java/com/magicindor/player/MainActivity.java) para `http://SEU_IP_LOCAL:3000`.
3. Recompile o APK e reinstale no celular.
4. Garanta que o celular esteja na mesma rede Wi-Fi que o backend.

## O que ainda precisa ser feito

### 1. Backend e banco de dados

- [x] Criar banco de dados para campanhas, arquivos e dispositivos (SQLite local).
- [x] Persistir campanhas cadastradas via API.
- [x] Armazenar os arquivos em storage (disco local do backend nesta fase).
- Criar API para usuários, empresas e permissões.
- Implementar autenticação e recuperação de senha.
- Migrar storage local para S3, Cloud Storage ou equivalente em produção.

### 2. Vínculo do dispositivo

- [x] Registrar dispositivo pelo código `MI-XXXXXX` via API (`POST /api/devices/register`).
- [x] Aprovar ou rejeitar dispositivos via API (`PATCH /api/devices/:id/status`).
- [x] Vincular campanha a dispositivo (`POST /api/campaigns/:id/assign`).
- Criar fluxo de pareamento com código ou QR Code na interface do painel.
- Fazer o APK chamar `POST /api/devices/register` automaticamente ao iniciar.
- Criar tela no painel para aprovar/rejeitar dispositivos (hoje só existe via API).
- Associar dispositivos a grupos, lojas ou pontos de exibição.
- Mostrar último contato, versão do aplicativo e estado da conexão no painel.

### 3. Sincronização de conteúdo

- [x] Endpoint de consulta para o APK (`GET /api/devices/:code/campaigns`), com polling simples.
- [x] Arquivos servidos por HTTP (`GET /uploads/:arquivo`).
- Fazer o painel web (`index.html`) parar de guardar tudo em memória e chamar a API real.
- Fazer o APK consultar a API em polling periódico e baixar o arquivo indicado.
- Baixar arquivos para armazenamento local do Android.
- Continuar exibindo o último conteúdo quando a internet cair.
- Validar checksum e permitir retomada de downloads interrompidos.
- Informar progresso de sincronização no painel.
- Avaliar migração de polling para WebSocket quando o número de dispositivos crescer.

### 4. Player de produção

- [x] Reproduzir playlists com múltiplos arquivos, em loop contínuo (volta ao primeiro item ao terminar o último).
- [x] Suportar duração configurável para imagens e GIFs (editável no painel, em segundos).
- [x] Vídeos tocam pela duração natural deles e avançam para o próximo item ao terminar.
- [x] Atualizar a playlist automaticamente sem reiniciar o aplicativo (polling detecta mudança e reinicia do primeiro item).
- [x] Impedir que o dispositivo entre em suspensão (tela sempre ativa).
- [x] Iniciar automaticamente após reinicialização do Android.
- Configurar ordem manual, prioridade e horários de veiculação (hoje a ordem é a de cadastro).
- Criar tela técnica protegida para configuração da rede e pareamento.

### 5. Programação e relatórios

- Criar calendário de veiculação.
- Definir data inicial e final das campanhas.
- Definir horários e dias da semana.
- Escolher quais dispositivos devem receber cada campanha.
- Registrar confirmações de reprodução.
- Gerar impressões estimadas, tempo de tela e disponibilidade.
- Exportar relatórios.

### 6. Segurança e publicação

- Remover o modo de desenvolvimento e conteúdo demo.
- Trocar a permissão de tráfego claro por HTTPS em produção.
- Proteger a comunicação com tokens e renovação de sessão.
- Validar tamanho e tipo de arquivo no servidor.
- Assinar o APK com chave de produção.
- Criar APK release ou publicação na Google Play, conforme o modelo de distribuição.
- Definir política de privacidade e termos de uso.

## Próxima etapa recomendada

O primeiro fluxo ponta a ponta já funciona: registrar dispositivo → aprovar no painel → cadastrar campanha com upload → vincular → APK sincroniza e reproduz. Os próximos passos de maior valor:

1. Testar a sincronização em um dispositivo Android real (hoje validado apenas por build e por testes de API).
2. Implementar download com cache local no APK, para manter o conteúdo tocando mesmo com a internet instável (hoje ele reproduz direto da URL do backend).
3. Adicionar autenticação básica no painel e na API.
4. Criar tela de pareamento com QR Code, substituindo a lista simples de aprovação.
5. Avançar para programação por data/horário e relatórios de veiculação.

Depois desse fluxo, entram grupos de dispositivos, relatórios avançados e publicação em produção.

## Observações

- O APK atual é de debug e serve para testes.
- O painel e o backend não têm autenticação: qualquer pessoa na rede local pode acessar.
- O APK reproduz a mídia direto pela URL do backend; ainda não baixa e armazena o arquivo localmente (sem cache offline).
- O teste do APK em aparelho físico depende de ajustar `API_BASE` para o IP local do backend (ver seção acima) e de um dispositivo conectado via ADB ou da instalação manual do arquivo APK.
