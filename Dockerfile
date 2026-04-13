FROM oven/bun:1 AS base
WORKDIR /app
 
# Install deps first (cached layer)
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile
 
# Copy source
COPY . .
 
# Build (bun build compiles src/index.ts → dist/)
RUN bun run build
 
EXPOSE 3000
 
# Default: run the compiled backend
# Override with: command: bun run worker
CMD ["bun", "run", "start"]
 
