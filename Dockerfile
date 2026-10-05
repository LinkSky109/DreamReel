# DreamReel Dockerfile
FROM node:20-slim

# 安装 ffmpeg
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 复制依赖文件
COPY package*.json ./
RUN npm install --production

# 复制源码
COPY src/ ./src/
COPY public/ ./public/
COPY .env.example ./.env

# 创建存储目录
RUN mkdir -p storage/videos storage/exports storage/audio storage/temp storage/data storage/thumbnails

# 暴露端口
EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# 启动
CMD ["node", "src/server.js"]
