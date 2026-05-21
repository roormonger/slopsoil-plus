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

COPY . .

CMD ["python3", "bot.py"]
