import { useCallback, useEffect, useRef, useState } from "react";

export type WSEvent = {
  type: string;
  data: Record<string, unknown>;
};

export function useWebSocket() {
  const [connected, setConnected] = useState(false);
  const [eventTick, setEventTick] = useState(0);
  const eventQueueRef = useRef<WSEvent[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const heartbeatRef = useRef<ReturnType<typeof setInterval>>();

  const connect = useCallback(() => {
    const token = localStorage.getItem("slopsoil_token");
    if (!token) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${protocol}//${window.location.host}/ws?token=${token}`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      // Heartbeat every 30s
      heartbeatRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "ping" }));
        }
      }, 30000);
    };

    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      // Reconnect with backoff
      reconnectTimeoutRef.current = setTimeout(connect, 3000);
    };

    ws.onmessage = (msg) => {
      let data: WSEvent;
      try {
        data = JSON.parse(msg.data);
      } catch {
        return;
      }
      if (data.type === "pong") return;
      console.log('[WS] received:', data.type, data.data);
      eventQueueRef.current.push(data);
      setEventTick((t) => t + 1);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const consumeEvents = useCallback(() => {
    const events = eventQueueRef.current;
    eventQueueRef.current = [];
    return events;
  }, []);

  return { connected, eventTick, consumeEvents };
}
