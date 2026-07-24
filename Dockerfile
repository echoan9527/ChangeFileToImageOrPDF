# 使用 Node.js 22 官方轻量级镜像
FROM node:22-slim

# 【重大修改】：安装完整的 CJK 字体和 Emoji 字体，替换基础文泉驿
# 安装 Chromium 浏览器、系统依赖以及 Noto 系列中文字体和彩色 Emoji 字体
RUN apt-get update \
    && apt-get install -y wget gnupg \
    && apt-get install -y chromium fonts-noto-cjk fonts-noto-color-emoji --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# 【新增关键配置】：通过 Fontconfig 配置，让彩色 Emoji 字体具有最高 Emoji 渲染优先级，防止被中文字体“截胡”导致豆腐块或偏移
RUN mkdir -p /etc/fonts/local.conf.d
RUN echo '<?xml version="1.0"?> \
<!DOCTYPE fontconfig SYSTEM "fonts.dtd"> \
<fontconfig> \
  <alias> \
    <family>sans-serif</family> \
    <prefer> \
      <family>Noto Sans CJK SC</family> \
      <family>Noto Sans</family> \
      <family>Noto Color Emoji</family> \
    </prefer> \
  </alias> \
  <alias> \
    <family>serif</family> \
    <prefer> \
      <family>Noto Serif CJK SC</family> \
      <family>Noto Serif</family> \
      <family>Noto Color Emoji</family> \
    </prefer> \
  </alias> \
  <alias> \
    <family>monospace</family> \
    <prefer> \
      <family>Noto Sans Mono CJK SC</family> \
      <family>Noto Sans Mono</family> \
      <family>Noto Color Emoji</family> \
    </prefer> \
  </alias> \
</fontconfig>' > /etc/fonts/local.conf.d/50-prefer-noto.conf

# 强制更新字体缓存
RUN fc-cache -f -v

WORKDIR /app

# 设置跳过下载的环境变量，保持原样
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# 明确指定生产环境环境变量
ENV NODE_ENV=production

# 复制依赖文件并安装
COPY package.json ./
# COPY package-lock.json ./
RUN npm install

# 复制所有源代码并执行打包
COPY . .
RUN npm run build

# 暴露端口
EXPOSE 3000

# 启动服务
CMD ["npm", "start"]