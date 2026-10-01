FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# The API server has no runtime dependencies, so the final image is just Node + files.
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8787
COPY --from=build /app/dist ./dist
COPY server ./server
COPY content ./content
COPY package.json ./
EXPOSE 8787
CMD ["node", "server/index.mjs"]
