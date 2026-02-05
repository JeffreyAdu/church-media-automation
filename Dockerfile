# Dockerfile for Church Media Automation
# Optimized for Fly.io deployment with ffmpeg support

FROM node:22-slim

# Install system dependencies (ffmpeg, python for native modules)
RUN apt-get update && apt-get install -y \
    ffmpeg \
    python3 \
    make \
    g++ \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install pnpm globally
RUN npm install -g pnpm

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install --frozen-lockfile --prod=false

# Copy source code
COPY . .

# Build TypeScript
RUN pnpm build

# Remove dev dependencies to reduce image size
RUN pnpm prune --prod

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s \
  CMD curl -f http://localhost:3000/health || exit 1

# Default command (can be overridden in fly.toml)
CMD ["node", "dist/server.js"]
