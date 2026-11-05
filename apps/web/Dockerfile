# RYDO web image (Next.js standalone). Build from the repo root:
#   docker build -f apps/web/Dockerfile --build-arg NEXT_PUBLIC_GOOGLE_MAPS_KEY=... -t rydo-web .
# NEXT_PUBLIC_* values are baked into the browser code at build time. Use the BROWSER key (website-restricted).
FROM node:24-bookworm-slim AS build
WORKDIR /app
ARG NEXT_PUBLIC_GOOGLE_MAPS_KEY=""
ARG NEXT_PUBLIC_GOOGLE_MAP_ID=""
# Empty = live updates go to the same address as the website (Caddy sends them to the API).
ARG NEXT_PUBLIC_REALTIME_URL=""
# Where the web server forwards /api/v1 inside the private network.
ARG API_URL=http://api:4000
ENV NEXT_PUBLIC_GOOGLE_MAPS_KEY=$NEXT_PUBLIC_GOOGLE_MAPS_KEY NEXT_PUBLIC_GOOGLE_MAP_ID=$NEXT_PUBLIC_GOOGLE_MAP_ID \
    NEXT_PUBLIC_REALTIME_URL=$NEXT_PUBLIC_REALTIME_URL API_URL=$API_URL NEXT_TELEMETRY_DISABLED=1 NEXT_OUTPUT=standalone
COPY package.json package-lock.json turbo.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/ui-tokens/package.json packages/ui-tokens/
COPY services/api/package.json services/api/
COPY apps/web/package.json apps/web/
COPY apps/mobile/package.json apps/mobile/
RUN npm ci --workspace @rydo/web --workspace @rydo/shared --workspace @rydo/ui-tokens --include-workspace-root --ignore-scripts
COPY packages packages
COPY apps/web apps/web
RUN npm run build --workspace @rydo/shared && npm run build --workspace @rydo/web

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static apps/web/.next/static
COPY --from=build /app/apps/web/public apps/web/public
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]