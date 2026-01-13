FROM arm32v7/node:20-bookworm-slim AS frontend
WORKDIR /app

RUN corepack enable

# Copy only package files first (for better caching)
COPY browser/package.json browser/pnpm-lock.yaml ./browser/
RUN cd browser && pnpm install

# Copy source code after dependencies are installed
COPY browser ./browser
RUN cd browser && pnpm build

# Use the alpine version of Nginx for ARM32
FROM arm32v7/nginx:alpine

# Install tzdata using apk package manager (Alpine's version of apt-get)
RUN apk add --no-cache tzdata

COPY nginx.conf /etc/nginx/nginx.conf

COPY --from=frontend /app/browser/dist /usr/share/nginx/html

EXPOSE 80
ENTRYPOINT ["nginx", "-g", "daemon off;"]