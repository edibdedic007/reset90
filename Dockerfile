FROM node:24-alpine AS base

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV COREPACK_HOME=/corepack

RUN corepack enable \
  && corepack prepare pnpm@11.9.0 --activate \
  && chmod -R a+rX /corepack

WORKDIR /app

FROM base AS dependencies

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY prisma ./prisma
COPY prisma.config.ts tsconfig.json ./

RUN DATABASE_URL=postgresql://reset90:build-only@db:5432/reset90 \
  pnpm install --frozen-lockfile

FROM base AS builder

COPY --from=dependencies /app/node_modules ./node_modules
COPY . .

ARG APP_VERSION
ARG GIT_COMMIT

ENV APP_VERSION=$APP_VERSION
ENV APP_URL=https://build.invalid
ENV AUTH_MODE=oidc
ENV AUTH_SECRET=build-only-auth-secret-not-for-runtime
ENV AUTH_AUTHENTIK_ID=build-only-client
ENV AUTH_AUTHENTIK_ISSUER=https://auth.build.invalid/application/o/reset90
ENV AUTH_AUTHENTIK_SECRET=build-only-client-secret
ENV AUTH_TRUST_HOST=true
ENV DATABASE_URL=postgresql://reset90:build-only@db:5432/reset90
ENV GIT_COMMIT=$GIT_COMMIT
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN pnpm build \
  && pnpm prune --prod

FROM node:24-alpine AS runner

WORKDIR /app

RUN apk add --no-cache curl \
  && addgroup --system --gid 1001 reset90 \
  && adduser --system --uid 1001 --ingroup reset90 reset90 \
  && mkdir -p /app/exports /app/backups \
  && chown reset90:reset90 /app/exports /app/backups

ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=builder --chown=reset90:reset90 /app/package.json ./
COPY --from=builder --chown=reset90:reset90 /app/node_modules ./node_modules
COPY --from=builder --chown=reset90:reset90 /app/.next ./.next
COPY --from=builder --chown=reset90:reset90 /app/prisma/schema.prisma ./prisma/schema.prisma
COPY --from=builder --chown=reset90:reset90 /app/prisma/migrations ./prisma/migrations
COPY --from=builder --chown=reset90:reset90 /app/prisma.config.ts ./

USER reset90

EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=6s --start-period=10s --retries=12 \
  CMD curl --fail --silent --show-error --output /dev/null \
  --connect-timeout 2 --max-time 5 http://127.0.0.1:3000/api/ready

CMD ["node", "node_modules/next/dist/bin/next", "start"]
