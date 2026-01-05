FROM arm32v7/node:20-bookworm-slim AS frontend
WORKDIR /app

RUN corepack enable

COPY browser browser

RUN yarn global add http-server

RUN cd browser && yarn install && yarn build

# Use the alpine version of Nginx for ARM32
FROM arm32v7/nginx:alpine

# Install tzdata using apk package manager (Alpine's version of apt-get)
RUN apk add --no-cache tzdata

COPY nginx.conf /etc/nginx/nginx.conf

COPY --from=frontend /app/browser/dist /usr/share/nginx/html

EXPOSE 80
ENTRYPOINT ["nginx", "-g", "daemon off;"]