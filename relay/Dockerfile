FROM node:22-alpine

WORKDIR /app

# 复制依赖文件
COPY package*.json ./
RUN npm ci --omit=dev

# 复制应用代码
COPY server.js ./

EXPOSE 3001

ENV PORT=3001

CMD ["node", "server.js"]
