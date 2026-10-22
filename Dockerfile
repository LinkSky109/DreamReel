# syntax=docker/dockerfile:1
# DreamReel 单进程镜像：构建阶段产出前端静态资源，运行阶段只带生产依赖。
# 不烘焙任何 .env / 示例密钥；JWT_SECRET 等由运行时环境注入。

# ---------- build: 前端 ----------
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci && npm cache clean --force

# 仅复制构建所需源码；public/ 下已入库的静态资源一并带入。
COPY web/ ./web/
COPY public/ ./public/
COPY scripts/clean-web-build.js ./scripts/clean-web-build.js
COPY scripts/check-web-build.js ./scripts/check-web-build.js

# 输出到 /app/public（vite 配置默认 outDir，不含 WEB_OUT_DIR）；
# check:web-build 作为镜像内守卫，确保入口 HTML 与 hashed 资源一致。
RUN npm run build && npm run check:web-build && rm -rf /app/node_modules /root/.npm

# ---------- runtime ----------
FROM node:22-alpine
# ffmpeg + 片头标题卡渲染依赖（python3 / Pillow / 中文字体）
RUN apk add --no-cache ffmpeg python3 py3-pillow font-noto-cjk

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src/ ./src/
COPY scripts/ ./scripts/
COPY --from=build /app/public ./public

RUN mkdir -p storage/videos storage/exports storage/audio storage/temp storage/data storage/thumbnails \
    && chmod +x scripts/docker-entrypoint.sh \
    && chown -R node:node /app

ENV NODE_ENV=production \
    PORT=3000 \
    SERVE_STATIC=true \
    STORAGE_PATH=/app/storage

USER node

EXPOSE 3000

# 就绪探针包含 PostgreSQL 连通性，避免“进程活着但业务不可用”。
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# 入口脚本等待数据库、执行迁移后再启动服务。
CMD ["sh", "scripts/docker-entrypoint.sh"]
