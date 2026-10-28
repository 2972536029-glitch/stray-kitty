# Build context: the final approved stray-kitty project root.
# This file contains no credentials or private configuration.
FROM node:24-alpine AS web
WORKDIR /app
COPY package.json package-lock.json ./
COPY web/package.json web/package.json
RUN npm ci --ignore-scripts
COPY web web
RUN npm run build --workspace web

FROM golang:1.26-alpine AS api
WORKDIR /app/server
COPY server ./
RUN CGO_ENABLED=0 go build -trimpath -o /kitty-api ./cmd/api

FROM alpine:3.23
ARG BUILD_REVISION=unverified
LABEL org.opencontainers.image.revision="${BUILD_REVISION}"
RUN apk add --no-cache ca-certificates \
    && update-ca-certificates \
    && addgroup -S -g 10001 kitty \
    && adduser -S -u 10001 kitty -G kitty \
    && mkdir /data \
    && chown 10001:10001 /data
WORKDIR /app
COPY --from=api /kitty-api /app/kitty-api
COPY --from=web /app/web/dist /app/web
USER 10001:10001
ENV GAME_ADDR=0.0.0.0:8080 \
    GAME_DATA_FILE=/data/game.json \
    GAME_WEB_DIR=/app/web
EXPOSE 8080
ENTRYPOINT ["/app/kitty-api"]
