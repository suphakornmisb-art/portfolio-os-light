FROM node:20-slim

WORKDIR /app

# Copy deps first for layer caching
COPY package.json package-lock.json ./

# Install all deps — no native builds needed (@libsql/client is pure JS)
RUN npm ci --ignore-scripts

# Copy source and build
COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV PORT=10000

EXPOSE 10000

CMD ["node", "dist/index.cjs"]
