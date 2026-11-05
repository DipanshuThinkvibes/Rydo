# RYDO API image. Build from the repo root:  docker build -f services/api/Dockerfile -t rydo-api .
# Stage "build" has every tool (Prisma CLI, ts-node) and is also used to run migrations and the seed.
FROM node:24-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json turbo.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/ui-tokens/package.json packages/ui-tokens/
COPY services/api/package.json services/api/
COPY apps/web/package.json apps/web/
COPY apps/mobile/package.json apps/mobile/
RUN npm ci --workspace @rydo/api --workspace @rydo/shared --include-workspace-root --ignore-scripts
COPY packages/shared packages/shared
COPY services/api services/api
RUN cd services/api && npx prisma generate \
 && cd /app && npm run build --workspace @rydo/shared && npm run build --workspace @rydo/api
WORKDIR /app/services/api

# Small runtime image: production dependencies, compiled code, Prisma client and migrations.
FROM node:24-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates tini && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/packages/shared/package.json packages/shared/package.json
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/services/api/package.json services/api/package.json
COPY packages/ui-tokens/package.json packages/ui-tokens/
COPY apps/web/package.json apps/web/
COPY apps/mobile/package.json apps/mobile/
RUN npm ci --workspace @rydo/api --workspace @rydo/shared --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=build /app/node_modules/.prisma node_modules/.prisma
COPY --from=build /app/services/api/dist services/api/dist
COPY --from=build /app/services/api/prisma services/api/prisma
WORKDIR /app/services/api
USER node
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=3s --retries=5 CMD node -e "fetch('http://localhost:4000/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/main.js"]