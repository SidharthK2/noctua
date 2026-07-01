# Single-service image: the RFQ service (API + chain watcher) also serves the built
# frontend from the same origin. See README "Deploying" for the env vars.
#
# The VITE_* values are baked into the frontend at BUILD time — pass them as build args.
# On Railway, declare them as service variables; they are exposed to the Docker build
# automatically for any ARG declared below.
FROM node:24-slim

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app

# Install with only the manifests first so dependency layers cache across code changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY services/rfq/package.json services/rfq/
COPY services/web/package.json services/web/
RUN pnpm install --frozen-lockfile

COPY packages ./packages
COPY services ./services

# Frontend build-time config (chain + contract addresses).
ARG VITE_CHAIN_ID=84532
ARG VITE_RPC_URL
ARG VITE_NOCTUA_ADDRESS
ARG VITE_LOAN_ADDRESS
ARG VITE_COLLATERAL_ADDRESS
ARG VITE_ORACLE_ADDRESS
ENV VITE_CHAIN_ID=$VITE_CHAIN_ID \
    VITE_RPC_URL=$VITE_RPC_URL \
    VITE_NOCTUA_ADDRESS=$VITE_NOCTUA_ADDRESS \
    VITE_LOAN_ADDRESS=$VITE_LOAN_ADDRESS \
    VITE_COLLATERAL_ADDRESS=$VITE_COLLATERAL_ADDRESS \
    VITE_ORACLE_ADDRESS=$VITE_ORACLE_ADDRESS

RUN pnpm -r build

ENV NODE_ENV=production \
    STATIC_DIR=/app/services/web/dist \
    DB_PATH=/data/noctua-rfq.db \
    PORT=3000
EXPOSE 3000

# /data should be a mounted volume so the SQLite book survives restarts.
CMD ["node", "services/rfq/dist/index.js"]
