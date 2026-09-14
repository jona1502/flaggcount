# FlagCount backend: API, Stripe, licenses, TikTok connection, relay and OBS overlays.
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
# npm workspaces: every workspace manifest must exist before the install.
COPY apps/web/package.json apps/web/
RUN npm ci
COPY . .
RUN npm run build:server

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3010 \
    DATA_DIR=/app/data
COPY --from=build /app/server-dist/server.cjs ./server.cjs
RUN mkdir -p /app/data && chown node:node /app/data
USER node
EXPOSE 3010
CMD ["node", "server.cjs"]
