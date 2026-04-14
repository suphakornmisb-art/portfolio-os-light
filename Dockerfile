FROM node:20-slim

# Build tools for native modules
RUN apt-get update && apt-get install -y \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install deps first (cache layer)
COPY package.json package-lock.json ./

# Install all deps, then force-rebuild better-sqlite3 for this exact platform
RUN npm ci --ignore-scripts && \
    npm rebuild better-sqlite3 --build-from-source

# Copy source
COPY . .

# Build the app
RUN npm run build

ENV NODE_ENV=production
ENV PORT=10000

EXPOSE 10000

CMD ["node", "dist/index.cjs"]
