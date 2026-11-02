FROM node:24-alpine AS web
WORKDIR /app
COPY package.json package-lock.json ./
COPY web/package.json web/package.json
RUN npm ci --ignore-scripts
COPY web web
# web 构建跨目录引用仓库级内容资产(nightMarket/rainyAlley 地图 JSON、阿策参考 JSON),
# 漏拷会 TS2307——team-preview 镜像修过同类问题(f0c0672),compose 这条路径同样需要
COPY specs specs
COPY level_design level_design
COPY server server
RUN npm run build --workspace web

FROM golang:1.26-alpine AS api
WORKDIR /app/server
# 默认 proxy.golang.org 是 Google 系,在受限网络下不可达;goproxy.cn 与 CI 保持一致
ENV GOPROXY=https://goproxy.cn,direct
COPY server ./
RUN CGO_ENABLED=0 go build -trimpath -o /kitty-api ./cmd/api

FROM alpine:3.23
RUN addgroup -S -g 10001 kitty && adduser -S -u 10001 kitty -G kitty && mkdir /data && chown kitty:kitty /data
WORKDIR /app
COPY --from=api /kitty-api /app/kitty-api
COPY --from=web /app/web/dist /app/web
USER kitty
ENV GAME_ADDR=0.0.0.0:8080 GAME_DATA_FILE=/data/game.json GAME_WEB_DIR=/app/web
EXPOSE 8080
ENTRYPOINT ["/app/kitty-api"]
