FROM node:22-alpine AS build

WORKDIR /workspace

COPY package.json package-lock.json ./
COPY server/package.json ./server/package.json
COPY packages/game-core/package.json ./packages/game-core/package.json

RUN npm ci

COPY server ./server
COPY packages/game-core ./packages/game-core

RUN npm run build:api
RUN npm prune --omit=dev

FROM node:22-alpine AS runtime

ENV NODE_ENV=production \
    PORT=3001 \
    GAME_MAP_FILE=/app/public/assets/maps/braains-classic-clean.tmj

WORKDIR /app

COPY --from=build --chown=node:node /workspace/package.json ./package.json
COPY --from=build --chown=node:node /workspace/node_modules ./node_modules
COPY --from=build --chown=node:node /workspace/server/package.json ./server/package.json
COPY --from=build --chown=node:node /workspace/server/dist ./server/dist
COPY --from=build --chown=node:node /workspace/packages/game-core/package.json ./packages/game-core/package.json
COPY --from=build --chown=node:node /workspace/packages/game-core/dist ./packages/game-core/dist
COPY --chown=node:node public/assets/maps/braains-classic-clean.tmj ./public/assets/maps/braains-classic-clean.tmj

USER node

EXPOSE 3001

CMD ["node", "server/dist/main.js"]
