# Web version of FlagCount: dashboard, API and OBS overlay in one Node.js process.
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
# npm workspaces: every workspace manifest must exist before the install.
COPY apps/web/package.json apps/web/
RUN npm ci
COPY . .
RUN npm run build:web && npm run build:server

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    DATA_DIR=/app/data \
    WEB_ROOT=/app/public
COPY --from=build /app/server-dist/server.cjs ./server.cjs
COPY --from=build /app/dist-web ./public
RUN mkdir -p /app/data && chown node:node /app/data
USER node
EXPOSE 3000
CMD ["node", "server.cjs"]
