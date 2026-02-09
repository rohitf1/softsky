FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM nginx:1.27-alpine
WORKDIR /app

RUN apk add --no-cache gettext

COPY infra/nginx/web.conf.template /etc/nginx/templates/web.conf.template
COPY infra/nginx/docker-entrypoint.sh /docker-entrypoint.d/10-softsky-web.sh
COPY --from=build /app/dist /usr/share/nginx/html

RUN chmod +x /docker-entrypoint.d/10-softsky-web.sh

ENV SOFTSKY_API_ORIGIN=https://softsky-api-mxuh5zd5za-uc.a.run.app
EXPOSE 8080
