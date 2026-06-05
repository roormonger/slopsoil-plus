# Stage 1: Build frontend with Node.js
FROM node:22-alpine AS frontend-builder

WORKDIR /build
RUN apk upgrade --no-cache
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install

COPY frontend/ ./
RUN npm run build

# Stage 2: Main application with Fedora
FROM fedora:44

# ffmpeg-free is Fedora's standard FFmpeg build (no libx264, but includes
# libopenh264, h264_vaapi, h264_nvenc, and h264_qsv).  This matches the
# working host environment exactly.  Do NOT swap this for RPM Fusion's
# `ffmpeg` package: it ships a different FFmpeg version with libx264, and
# libx264's output currently causes Discord to drop the stream after one frame.
RUN dnf install -y \
        ffmpeg-free \
        python3 \
        python3-pip \
    && dnf clean all \
    && rm -rf /var/cache/dnf

WORKDIR /app

# Install Python deps before copying source so this layer is cached unless
# requirements.txt changes.
COPY requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Remove any old frontend dist files so stale hashed bundles don't persist
RUN rm -rf ./frontend/dist

# Copy built frontend from stage 1
COPY --from=frontend-builder /build/dist ./frontend/dist

# Create data and soundboard directories
RUN mkdir -p /app/data /app/soundboard/system /app/soundboard/users

# Expose web admin port
EXPOSE 6000

# Use new unified entrypoint with web GUI
CMD ["python3", "backend/main.py"]
