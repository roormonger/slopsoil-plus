# Streaming internals

## Pipeline overview

All streams use the same single-FFmpeg-process pipeline defined in `cogs/stream.py`:

- **Video** — `H264VideoPlayer` runs in a background thread. For TVheadend, FFmpeg transcodes MPEG-2 to H.264 and forces a keyframe every 25 frames (1 second at 25 fps). For IPTV, FFmpeg copies the existing H.264 bitstream directly (`-c:v copy`) with no re-encode. In both cases raw Annex B is written to stdout, and a wall-clock pacing loop sends frames at exactly the configured FPS.
- **Audio** — FFmpeg writes raw S16LE PCM to a named FIFO (`/tmp/slopsoil_<ssrc>_audio.fifo`). An `_AudioPipeSource` reads 20 ms frames directly from the FIFO.
- **A/V sync** — Both video and audio come from the same FFmpeg process: video to stdout, audio to the FIFO. Because both streams are demuxed from a single input connection they are inherently content-aligned. Audio playback begins as soon as the FIFO opens — no artificial delay is applied.
- **Probe size** — TVheadend uses a 2 MB FFmpeg probe window. IPTV HLS streams use a 10 MB probe to ensure audio tracks are detected before mapping is applied.

## How video streaming works

Getting video into Discord voice was non-trivial. Four separate problems had to be solved:

### 1. Voice WebSocket patches (`video_compat.py`)

discord.py-self does not include video-capable voice signalling out of the box. Three WebSocket opcodes needed patching:

- **IDENTIFY (op 0):** Must include `"video": true` and a `streams` descriptor or the voice server silently drops all video RTP packets.
- **SELECT_PROTOCOL (op 1):** Must include a `codecs` field listing both Opus (audio) and H.264 (video) with their payload types, so the server allocates a video forwarding slot.
- **VIDEO (op 12):** Must include the `video_ssrc`, `rtx_ssrc`, and a `streams` array with `max_bitrate`, `max_framerate`, and `max_resolution` so the server knows how much bandwidth to reserve.

The video SSRC is `audio_ssrc + 1`. These patches are applied at startup in `bot.py` before any voice connections are made.

### 2. H.264 SPS VUI rewriting (`cogs/video_player.py`)

Discord rejects H.264 streams that do not have `bitstream_restriction_flag=1` and `max_num_reorder_frames=0` in the SPS NAL unit's VUI parameters, returning **Error 2015**. FFmpeg encoders do not set these fields correctly by default.

The fix is a full H.264 RBSP bit-level parser and rewriter (`rewrite_sps_vui`) that:
1. Strips emulation prevention bytes to get the raw RBSP
2. Reads through all SPS fields using Exp-Golomb decoding, copying them to a new bitstream
3. Forces `bitstream_restriction_flag=1` and `max_num_reorder_frames=0` regardless of what the encoder produced
4. Re-inserts emulation prevention bytes and replaces the SPS NAL before sending

### 3. DAVE E2EE video encryption (`davey_compat.py` + `cogs/video_player.py`)

Discord voice channels use DAVE (Discord's MLS-based E2EE protocol). Audio frames are DAVE-encrypted in discord.py-self automatically, but video requires explicit handling.

**The DAVE encryption format for H.264** (derived from [libdave](https://github.com/discord/libdave)):

- Input is a complete Annex B access unit (all NALs for one frame joined with `\x00\x00\x00\x01` start codes).
- Non-VCL NALs (SPS, PPS, SEI) are left **entirely unencrypted**.
- VCL NALs (slices, IDR frames) have their NAL header and `pps_id` prefix left unencrypted; the remainder is encrypted with AES-GCM-128 using the MLS-derived key ratchet. Ciphertext is the **same size** as the plaintext.
- A supplemental trailer is appended after the last NAL: `[8-byte truncated AES-GCM tag] [LEB128 nonce] [LEB128 unencrypted ranges] [1-byte size] [0xFAFA magic marker]`.

`H264VideoPlayer._send_frame()` implements this by:
1. Building the complete Annex B access unit and calling `dave_session.encrypt_h264()` once per frame.
2. Splitting the encrypted output back into per-NAL slices using the **input NAL sizes** (not start-code scanning, since ciphertext = same size as plaintext).
3. Appending the supplemental trailer (everything after the last NAL in the output) onto the last NAL so it survives FU-A fragmentation intact.
4. RTP-packetizing normally and applying the outer transport encryption.

**The davey shim:** discord.py-self 2.1 imports `davey` (a broken Rust binding) for DAVE support. `davey_compat.py` is a drop-in replacement module that wraps `dave.py` (DisnakeDev's Python bindings for the official C++ libdave). The module references are swapped at startup in `bot.py`:

```python
discord.voice_state.davey = davey_compat
discord.gateway.davey     = davey_compat
davey_compat.patch_reinit(discord.voice_state)
```

DAVE is mandatory — setting `max_dave_protocol_version: 0` to bypass it causes the voice server to disconnect the bot.

### 4. Audio/video synchronisation (`cogs/stream.py` + `cogs/video_player.py`)

**Single-process FIFO sync** — A single FFmpeg process reads the source URL once and demuxes both streams: H.264 video goes to stdout (consumed by `H264VideoPlayer`) and raw PCM audio goes to a named FIFO (consumed by `_AudioPipeSource`). Because both streams come from the same input connection they are inherently content-aligned — there is no risk of two independent HTTP connections landing at different positions in the stream. Audio playback begins as soon as the FIFO opens.

**Wall-clock frame pacing** — After sending each video frame, `H264VideoPlayer` sleeps until the next frame deadline calculated from `time.monotonic()`. This prevents the video thread from sending faster than real-time if the encoder is fast, and prevents it from accumulating lag if the encoder is slow — it just catches up by not sleeping. The sleep uses `threading.Event.wait()` so a `!stop` command interrupts it immediately.
