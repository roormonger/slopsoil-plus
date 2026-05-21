# Project structure

```
slopsoil/
├── bot.py               — entry point; applies patches, loads cogs, shared state
├── video_compat.py      — voice WebSocket patches for H.264 video signalling
├── davey_compat.py      — DAVE E2EE shim: wraps dave.py (libdave) as a davey drop-in
├── cogs/
│   ├── general.py       — !ping, !hello, !help
│   ├── voice.py         — !join, !leave, !stop
│   ├── tv.py            — TVheadend client, !channels, !play, !search (EPG + scheduling)
│   ├── iptv.py          — IPTV M3U sources, !add-source, !sources, !delete-source, EPG via XMLTV
│   ├── stream.py        — shared start_stream / start_live_stream / cancel_stream used by all media cogs
│   ├── golive.py        — GoLiveConnection + GoLiveAudioSender: Discord go-live (screenshare) stream path
│   ├── video_player.py  — H264VideoPlayer + _AudioPipeSource: single FFmpeg → H.264/PCM → FIFO → DAVE encrypt → RTP → UDP
│   └── utils.py         — shared helpers (resolve_voice, etc.)
├── tools/
│   └── analyze_dave.py  — pcap tool: decrypts outer RTP and inspects DAVE payloads
├── Dockerfile           — Fedora 44 image with ffmpeg-free (libopenh264)
├── docker-compose.yml   — single-service compose; reads .env at runtime
├── requirements.txt
├── .env.example
└── README.md
```

## Adding commands

Create a new file in [cogs/](cogs/) following the existing pattern, then load it in [bot.py](bot.py):

```python
await self.load_extension("cogs.yourfeature")
```
