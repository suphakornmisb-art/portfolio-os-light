FROM node:20-alpine

WORKDIR /app

# Copy built files
COPY dist/index.cjs ./dist/index.cjs
COPY dist/public ./dist/public

# Copy only production deps needed for better-sqlite3
COPY package.json ./
RUN npm install --omit=dev --ignore-scripts && \
    npm rebuild better-sqlite3

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

CMD ["node", "dist/index.cjs"]
