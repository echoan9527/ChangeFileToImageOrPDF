# 使用 Node.js 22 官方轻量级镜像
FROM node:22-slim

# 安装 Chromium 浏览器、系统依赖以及文泉驿中文字体 (防止中文乱码)
RUN apt-get update \
    && apt-get install -y wget gnupg \
    && apt-get install -y chromium fonts-wqy-zenhei --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 【修复关键点】：必须在 npm install 之前设置环境变量，阻止 Puppeteer 下载自带浏览器
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# 复制依赖文件并安装 (利用缓存机制加快后续构建)
COPY package.json ./
# 如果你有 package-lock.json，把下面这行注释打开
# COPY package-lock.json ./
RUN npm install

# 复制所有源代码并执行打包
COPY . .
RUN npm run build

# 明确指定当前为生产环境（新增这一行！）
ENV NODE_ENV=production

# 暴露端口 (请确保你的 server.ts 监听的是 process.env.PORT)
EXPOSE 3000

# 启动服务
CMD ["npm", "start"]