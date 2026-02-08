# Dockerfile for Church Media Automation
# Optimized for Fly.io deployment with ffmpeg support

FROM node:22-slim

# Install system dependencies (ffmpeg, yt-dlp, python for native modules)
# Also includes ca-certificates for HTTPS and build tools for native Node modules
RUN apt-get update && apt-get install -y \
    ffmpeg \
    python3 \
    python3-pip \
    make \
    g++ \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install yt-dlp and faster-whisper via pip
RUN pip3 install --no-cache-dir --break-system-packages yt-dlp faster-whisper

# Verify yt-dlp is accessible and create symlink if needed
RUN which yt-dlp || ln -s /usr/local/bin/yt-dlp /usr/bin/yt-dlp && yt-dlp --version

# Verify Node.js is accessible for yt-dlp JavaScript runtime
# yt-dlp needs Node.js to solve YouTube's signature challenges
RUN node --version && echo "Node.js available at: $(which node)"

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
