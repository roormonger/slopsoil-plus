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
        self._last_events: dict[str, dict | None] = {}

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self.connections.add(websocket)
        log.info("WebSocket client connected (%d total)", len(self.connections))

        # Send last known state for each event type to new client
        log.info("Sending %d cached event types to new WS client", len(self._last_events))
        for event_type, payload in self._last_events.items():
            if payload is not None:
                try:
                    await websocket.send_text(
                        json.dumps({"type": event_type, "data": payload})
                    )
                    log.info("Sent cached event %s to new WS client", event_type)
                    # Small pause so the frontend has time to process each message
                    await asyncio.sleep(0.05)
                except Exception:
                    pass

    async def disconnect(self, websocket: WebSocket) -> None:
        async with self._lock:
            self.connections.discard(websocket)
        log.info("WebSocket client disconnected (%d total)", len(self.connections))

    async def broadcast(self, event_type: str, payload: dict | None = None) -> None:
        """Broadcast an event to all connected WebSocket clients."""
        if payload is not None:
            self._last_events[event_type] = payload
        # Use `is not None` so empty lists/arrays serialize correctly instead of becoming {}
        safe_payload = payload if payload is not None else {}
        message = json.dumps({"type": event_type, "data": safe_payload})
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
