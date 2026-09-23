FROM node:22-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY apps/web/package.json apps/web/
COPY apps/server/package.json apps/server/
COPY packages/game-core/package.json packages/game-core/
COPY packages/content/package.json packages/content/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:22-slim
WORKDIR /app
RUN corepack enable
ENV NODE_ENV=production PORT=8787 DATA_DIR=/data
COPY --from=build /app /app
VOLUME /data
EXPOSE 8787
CMD ["pnpm", "start"]
