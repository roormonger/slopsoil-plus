"""WebSocket connection manager for broadcasting events."""

import asyncio
import json
import logging

from starlette.websockets import WebSocket

log = logging.getLogger(__name__)


class ConnectionManager:
    """Manages active WebSocket connections and broadcasts events."""

    def __init__(self) -> None:
        self.connections: set[WebSocket] = set()
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self.connections.add(websocket)
        log.info("WebSocket client connected (%d total)", len(self.connections))

    async def disconnect(self, websocket: WebSocket) -> None:
        async with self._lock:
            self.connections.discard(websocket)
        log.info("WebSocket client disconnected (%d total)", len(self.connections))

    async def broadcast(self, event_type: str, payload: dict | None = None) -> None:
        """Broadcast an event to all connected WebSocket clients."""
        message = json.dumps({"type": event_type, "data": payload or {}})
        dead: set[WebSocket] = set()

        async with self._lock:
            connections = list(self.connections)

        for ws in connections:
            try:
                await ws.send_text(message)
            except Exception:
                dead.add(ws)

        if dead:
            async with self._lock:
                self.connections -= dead


# Module-level singleton
ws_manager = ConnectionManager()
