# Supabase — contas individuais por cliente

Este diretório prepara o terreno para o Magic Indoor virar multi-cliente: cada empresa
com sua própria conta, login e dados isolados (dispositivos, programações, biblioteca de
arquivos, eventos).

## O que já está pronto

- [`schema.sql`](schema.sql): schema completo no Postgres do Supabase, espelhando as
  tabelas do SQLite atual, mas com `owner_id` em cada linha e RLS (Row Level Security)
  garantindo que uma conta nunca veja ou edite dado de outra.
- [`login.html`](../login.html): tela de login/cadastro (email e senha, "Continuar com
  Google"), já preparada para conversar com o Supabase Auth assim que houver um projeto
  configurado.
- Campo para colar a **URL do projeto** e a **anon public key** em
  Configurações → Integração Supabase no painel (`index.html`), salvos neste navegador.

## Status: migração concluída

O backend (`backend/`) já lê e escreve no Postgres do Supabase, com `owner_id` em toda
linha e RLS garantindo o isolamento — ver detalhes em
[`../backend/README.md`](../backend/README.md#contas-individuais-supabase`). Resumo:

- Todas as rotas de dados exigem uma sessão válida (`Authorization: Bearer`) e usam um
  cliente Supabase autenticado como o usuário da requisição, então a RLS filtra
  automaticamente — não existe mais um `owner_id` fixo nem SQLite.
- **Arquivos de mídia continuam em disco local** (`backend/uploads/<owner_id>/…`), não no
  bucket `media` do Supabase Storage — decisão feita ao planejar hospedar o backend numa
  VPS com armazenamento próprio. O bucket e as policies seguem definidos no `schema.sql`
  (não fazem mal ficarem aí), mas não são usados; o Postgres só guarda o caminho relativo
  do arquivo em `file_name`.
- Cada dispositivo só passa a existir quando o dono da conta digita, pelo painel, o
  código `MI-XXXXXX` exibido na tela do aparelho — não há registro automático nem
  convite por rede.

O que falta é só a parte de operação: fluxo de cadastro/convite de novas contas (hoje é
manual via Supabase) e, futuramente, mover a VPS de produção para trás de um domínio com
HTTPS antes de liberar clientes de verdade.
