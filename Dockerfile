# syntax=docker/dockerfile:1.7
# Multi-stage, Node ghim phiên bản. Dùng cho Coolify (server Myanmar) và docker-compose.prod.yml.

ARG NODE_VERSION=24.12.0

# ── deps: cài toàn bộ dependency (cần cho build + prisma) ──
FROM node:${NODE_VERSION}-alpine AS deps
WORKDIR /app
# Mirror Alpine tuỳ chọn (server Myanmar: ALPINE_MIRROR=https://mirror.kku.ac.th/alpine trong .env.prod). Trống = CDN mặc định.
ARG ALPINE_MIRROR=
RUN if [ -n "$ALPINE_MIRROR" ]; then \
      sed -i "s|https://dl-cdn.alpinelinux.org/alpine|${ALPINE_MIRROR%/}|g" /etc/apk/repositories; \
    fi \
 && apk add --no-cache libc6-compat
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm ci

# ── builder: generate Prisma client + next build (standalone) ──
FROM node:${NODE_VERSION}-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# URL gốc cho metadata tĩnh (canonical, hreflang, Open Graph) — phần trang prerender lúc build. Không phải secret.
ARG APP_URL=http://localhost:3000
ENV APP_URL=${APP_URL}
# Khoá mã hoá Server Action cố định giữa các lần build (base64, 32 byte) → tab đang mở không lỗi
# "Failed to find Server Action" sau mỗi lần deploy. Để trống = Next tự sinh mỗi build. Được nhúng vào bản build.
ARG NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=
ENV NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=${NEXT_SERVER_ACTIONS_ENCRYPTION_KEY}
# Mã phiên bản deploy (vd git SHA) → client cũ tự tải lại trang khi app đã lên bản mới. Để trống = tắt.
ARG NEXT_DEPLOYMENT_ID=
ENV NEXT_DEPLOYMENT_ID=${NEXT_DEPLOYMENT_ID}
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npm run build

# ── migrator: chạy `prisma migrate deploy` một lần trước khi app khởi động ──
FROM node:${NODE_VERSION}-alpine AS migrator
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json prisma.config.ts ./
COPY prisma ./prisma
# Script một lần khi chuyển từ Vercel: chuyển file Blob → volume uploads (DEPLOY.md §2.4).
COPY scripts/migrate-blob-to-local.mjs ./scripts/
CMD ["npx", "prisma", "migrate", "deploy"]

# ── runner: image chạy production, user không phải root ──
FROM node:${NODE_VERSION}-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
# /app/.next/cache: cache ảnh next/image — compose gắn volume để không mã hoá lại AVIF sau mỗi lần deploy.
RUN addgroup -S -g 1001 nodejs && adduser -S -u 1001 -G nodejs nextjs \
 && mkdir -p /app/storage /app/.next/cache && chown nextjs:nodejs /app/storage /app/.next /app/.next/cache
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
