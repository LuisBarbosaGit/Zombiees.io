# Zombies.io

Protótipo de sobrevivência top-down inspirado no Braains.io clássico. O projeto mantém o modo local e o editor sandbox e agora inclui uma base jogável para sala online com servidor autoritativo. [Acesse o passo a passo para hospedar o backend na AWS EC2](#hospedar-o-backend-na-aws-ec2).

## Rodar localmente

Requer Node.js 20.19+ ou 22.12+.

```bash
npm install
Copy-Item .env.example .env
# Preencha as variáveis Supabase descritas abaixo
npm run dev:api
```

Em outro terminal:

```bash
npm run dev
```

O front abre no endereço do Vite (por padrão `http://127.0.0.1:5173`) e a API fica em `http://127.0.0.1:3001/api`. Para validar sem Supabase, `npm test`, `npm run test:api`, `npm run build` e `npm run build:api`.

## Rodar o backend com Docker

Requer Docker Desktop (ou Docker Engine) com Docker Compose v2. O container contém o servidor NestJS e o mapa; o frontend continua sendo publicado separadamente pela Vercel.

No PowerShell, copie o exemplo e preencha `SUPABASE_URL`, `DATABASE_URL` e `WEB_ORIGIN` com os valores do projeto Supabase do Zombies.io e o domínio público do frontend:

```powershell
Copy-Item .env.example .env
docker compose up --build game-server
```

A API fica em `http://localhost:3001/api`; confira `/health` e `/rooms/main`. O WebSocket usa `ws://localhost:3001/ws/game`. Para encerrar, use `Ctrl+C` ou rode `docker compose down`. Não coloque chaves administrativas do Supabase em variáveis `VITE_*`; o backend usa somente `SUPABASE_URL` e `DATABASE_URL`.

## Hospedar o backend na AWS EC2

O servidor online mantém conexões WebSocket e uma simulação contínua em memória, então roda como container persistente em EC2. O front continua na Vercel; para produção, use um Application Load Balancer com HTTPS/ACM. O ALB aceita WebSockets e encaminha o tráfego ao container.

### Preparação única da AWS

1. Crie uma instância Ubuntu 24.04 LTS x86_64 (t3.small é um ponto de partida, ajuste após medir carga). Configure o Security Group para aceitar SSH (22) somente do seu IP e TCP 3001 somente do Security Group do ALB; exponha HTTPS 443 no ALB. Não exponha SSH nem a porta 3001 para a internet inteira.
2. Instale Docker Engine e Docker Compose v2 na EC2. Crie `/opt/zombies-io/.env` com `SUPABASE_URL`, `DATABASE_URL`, `DATABASE_SSL=true` e `WEB_ORIGIN` (origem exata da Vercel); restrinja o arquivo com `sudo chmod 600 /opt/zombies-io/.env`.
3. Crie um repositório privado no ECR, por exemplo `zombies-io-backend`, e um ALB HTTPS com certificado ACM e target group HTTP para a EC2 na porta 3001; health check: `/api/health`.
4. Use seu perfil AWS pessoal já configurado no AWS CLI e conceda a essa identidade permissão para publicar imagens no ECR. Não crie role/profile para a EC2 nem credenciais AWS para GitHub Actions. A policy mínima para o usuário/perfil está em [docs/aws-ec2-iam.md](docs/aws-ec2-iam.md).
5. Para cada deploy, faça login no ECR com esse perfil, construa e envie a imagem, copie `compose.ec2.yaml` para `/opt/zombies-io/compose.yaml` e conecte por SSH. Na EC2, faça `docker compose pull` e `docker compose up -d`. O passo a passo com comandos está em [docs/aws-ec2-iam.md](docs/aws-ec2-iam.md).

O GitHub Actions executa testes e builds em cada push/PR, mas não acessa sua conta AWS nem publica automaticamente. O deploy é iniciado manualmente no seu computador usando seu perfil AWS normal e sua chave SSH; assim as credenciais não ficam no GitHub. A EC2 faz login no ECR durante o deploy usando um token temporário encaminhado pelo SSH.

### Ligar o front da Vercel

No projeto Vercel, configure em Production `VITE_GAME_API_URL=https://api.seudominio.com/api` e `VITE_GAME_WS_URL=wss://api.seudominio.com/ws/game`, substituindo pelo hostname do ALB; então redeploy o front. Na EC2, `WEB_ORIGIN` deve ser a origem exata da Vercel, sem caminho. Atualize também Redirect URLs no Supabase.

Valide `https://api.seudominio.com/api/health` e `/api/rooms/main` e a conexão WSS. Uma única EC2 mantém a sala em memória, mas não oferece alta disponibilidade: uma reinicialização encerra a partida; múltiplas instâncias exigirão sincronizar estado de jogo em serviço compartilhado.

## Preparar Supabase

1. Crie um projeto Supabase e habilite **Anonymous Sign-Ins** em Authentication → Sign In / Providers. A identidade de convidado fica salva no navegador e poderá ser vinculada a uma conta depois.
2. Copie a Project URL e a chave **publishable** para `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`. Não use service-role/secret key em variáveis `VITE_*`.
3. Configure `SUPABASE_URL` com a mesma URL e `DATABASE_URL` com a conexão PostgreSQL do projeto. Mantenha `DATABASE_SSL=true`.
4. Aplique a migration versionada em `supabase/migrations/` com o Supabase CLI. O SQL cria tabelas, índices, políticas RLS e a sala `main` (capacidade 32).
5. Opcionalmente rode `npm run db:seed-map` para guardar o tilemap Tiled inteiro em `public.maps.map_data`.

Para vincular/aplicar a migration depois que o projeto existir:

```bash
npm exec --yes --package=supabase -- supabase login
npm exec --yes --package=supabase -- supabase link --project-ref SEU_PROJECT_REF
npm exec --yes --package=supabase -- supabase db push
```

O servidor verifica o JWT de convidado via JWKS e usa conexão PostgreSQL direta; não recebe nem expõe a chave administrativa do Supabase. RLS está ligada em todas as tabelas. Gravações de partida são feitas pelo backend, não pelo navegador. Antes de abrir o acesso ao público, configure CAPTCHA/rate limits para sign-ins anônimos e revise os advisors de segurança do Supabase.

## Organização do backend

O NestJS segue a estrutura modular convencional: cada domínio tem sua pasta, módulo e providers, e o módulo raiz apenas compõe os módulos. A estrutura atual é:

```text
server/src/
├── app.module.ts       # composição dos módulos
├── database/           # conexão PostgreSQL
├── game/               # sala, regras e gateway WebSocket
├── health/             # health check HTTP
└── maps/               # carregamento e endpoint do mapa
```

`HealthModule` expõe saúde do processo; `MapsModule` carrega o mapa e serve sua definição; `GameModule` concentra sala, gateway WebSocket e simulação; `DatabaseModule` encapsula a conexão PostgreSQL. Os arquivos de cada domínio ficam dentro da respectiva pasta, sem os antigos arquivos de módulo na raiz de `server/src`.

## Multiplayer implementado

- A sala pública única aceita até 32 jogadores; a primeira pessoa inicia como humana e as demais são distribuídas para manter os times equilibrados.
- Humanos que encostam em zumbis são infectados. A rodada dura até 5 minutos; a horda vence quando não há humanos e humanos vencem quando o tempo acaba.
- NestJS usa `WsAdapter` (WebSocket nativo, sem camada Socket.IO) e uma simulação autoritativa de 30 ticks/s; snapshots são enviados a 20 Hz. O browser envia somente intenção de movimento/mira, nunca coordenadas autoritativas.
- `packages/game-core` contém tipos, movimento, validação de entrada, equipes e contato compartilhados entre servidor e cliente. `OnlineSession` é o adaptador do browser; `LocalSession` segue disponível para o modo local.
- A colisão online usa as camadas `walls` e `trees` do mapa versionado. Mapas, salas, sessões, participantes, perfis, catálogo, carteira, transações, inventário, compras e pedidos de moeda já têm estrutura no banco.

O modo online precisa de um projeto Supabase configurado. Sem essas variáveis, menu, sobrevivência local e sandbox continuam disponíveis. Ainda não há pagamento de moedas, loja, autenticação vinculada, editor de mapa online, reconexão de partida ou múltiplas salas. A posição dos móveis e mudanças de mapa ainda são locais; `map_objects` e o serviço de seed preparam a persistência futura, mas não sincronizam o sandbox.

## Controles e mapa local

- `WASD` ou setas: mover
- Mouse: orientar o personagem
- Mobile: joystick virtual
- `E`: interação futura; `Esc`: pausar
- No sandbox: arraste para mover móveis, escolha item na paleta e clique para adicionar, `Delete` para remover; roda aproxima/afasta e botão direito arrasta o mapa.

O mapa de 35 × 57 tiles, pisos, paredes, árvores e móveis originais ficam em `public/assets/`. O sandbox grava seu layout no `localStorage` do navegador. `Simulation` conserva as regras locais; o mapa pode ser editado offline sem afetar a sala online.



## Conta opcional no modo online

Qualquer pessoa pode entrar na sala informando apenas um nome. Convidados jogam em tempo real sem criar conta, e o servidor não grava perfil nem participação individual para eles. Para salvar histórico e progresso, use **Entrar para salvar progresso** na tela inicial: o Supabase envia um link por e-mail. O backend associa registros somente quando valida um JWT de usuário permanente; tokens de usuário anônimo, inclusive sessões antigas no navegador, são tratados como convidado.

Para que o link de acesso retorne ao deploy, adicione a URL pública da Vercel em **Authentication → URL Configuration → Redirect URLs** do Supabase. A autenticação por e-mail precisa estar habilitada; a variável Vite usa apenas a publishable key.
