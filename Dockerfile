FROM oven/bun:1 AS base
WORKDIR /app

COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

EXPOSE 3000

# Default: run API server. Override in k8s worker deployment with: ["bun", "run", "worker"]
CMD ["bun", "run", "start"]
