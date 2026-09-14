# FlagCount web container (Next.js). Build from the repository root:
#   docker build -f apps/web/Dockerfile -t flagcount-web .
# The image contains no backend secrets; Stripe, licenses and the database live in the backend container.
FROM node:22-alpine AS build
WORKDIR /repo
ENV NEXT_TELEMETRY_DISABLED=1
COPY package*.json ./
COPY apps/web/package.json apps/web/
RUN npm ci
COPY . .
RUN npm run build -w @flagcount/web && node scripts/check-client-bundle.mjs apps/web/.next/static

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget --spider -q http://127.0.0.1:3000/health || exit 1
CMD ["node", "apps/web/server.js"]
