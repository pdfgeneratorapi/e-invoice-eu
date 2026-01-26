# Stage 1: Build stage
FROM node:20-alpine AS builder

ENV NODE_ENV=production

RUN apk add --no-cache \
	bash \
	curl \
    git

RUN npm install -g pnpm@10

WORKDIR /app

COPY . .

# Give the installation two tries because of various issues.
RUN pnpm install || true
RUN pnpm install && pnpm run build
RUN pnpm --filter @e-invoice-eu/server deploy --prod --legacy /out

# Stage 2: Runtime stage
FROM node:20-alpine

ENV NODE_ENV=production

WORKDIR /app

COPY --from=builder /out ./

# Create a non-root user
RUN addgroup -S e-invoice-eu && adduser -S e-invoice-eu -G e-invoice-eu

USER e-invoice-eu

EXPOSE 3000

ENTRYPOINT ["node", "dist/main.js"]
