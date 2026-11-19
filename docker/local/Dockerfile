FROM node:22-slim

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/backend-rest/package.json apps/backend-rest/
COPY apps/fakes/package.json apps/fakes/
COPY apps/frontend/package.json apps/frontend/
COPY apps/greedy-matcher/package.json apps/greedy-matcher/
COPY apps/notification-orchestrator/package.json apps/notification-orchestrator/
COPY packages/shared/package.json packages/shared/
COPY packages/shared-backend/package.json packages/shared-backend/
COPY packages/shared-frontend/package.json packages/shared-frontend/

RUN pnpm install --frozen-lockfile
