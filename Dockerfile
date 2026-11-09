FROM node:24-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile && pnpm -r build && pnpm --filter @dex/api deploy --prod --legacy /out/api

FROM node:24-alpine AS api
WORKDIR /app
COPY --from=build /out/api .
USER node
EXPOSE 3000
CMD ["node", "--import", "@opentelemetry/auto-instrumentations-node/register", "dist/index.js"]

FROM nginxinc/nginx-unprivileged:1.29-alpine AS web
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
