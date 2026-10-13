# Debian/glibc supports libSQL's Linux ARM64 native module on Ampere A1.
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tailwind.config.js ./
COPY public ./public
RUN npm run tailwind:build:production && npm prune --omit=dev

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production HOST=127.0.0.1 PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/public ./public
COPY --chown=node:node package.json package-lock.json server.js ./
COPY --chown=node:node backend ./backend
COPY --chown=node:node deploy/oracle/check-env.js ./deploy/oracle/check-env.js
USER node
CMD ["node", "server.js"]
