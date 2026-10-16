# Zombies.io

Protótipo de sobrevivência top-down inspirado no Braains.io clássico. O projeto mantém o modo local e o editor sandbox e agora inclui uma base jogável para sala online com servidor autoritativo.

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
