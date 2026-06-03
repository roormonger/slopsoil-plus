"""WebSocket endpoint for real-time updates."""

import json
import logging

from fastapi import APIRouter, Query, WebSocketException, status
from jose import JWTError, jwt
from starlette.websockets import WebSocket, WebSocketDisconnect

from backend.auth import ALGORITHM, SECRET_KEY
from backend.ws.manager import ws_manager

log = logging.getLogger(__name__)
router = APIRouter()


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, token: str = Query(...)):
    """WebSocket endpoint for real-time bot events.

    Clients must provide a JWT token via query parameter:
    ws://host/ws?token=<jwt>
    """
    try:
        jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        log.warning("WebSocket connection rejected: invalid token")
        await websocket.close(code=4001, reason="Invalid token")
        return

    await ws_manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
            except json.JSONDecodeError:
                continue
            if msg.get("type") == "ping":
                await websocket.send_text(json.dumps({"type": "pong"}))
    except WebSocketDisconnect:
        await ws_manager.disconnect(websocket)
    except Exception:
        await ws_manager.disconnect(websocket)
