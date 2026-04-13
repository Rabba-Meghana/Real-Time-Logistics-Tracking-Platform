import { createSignal, onCleanup } from 'solid-js';
import { createStore } from 'solid-js/store';
import type { LivePosition } from '../types';

type WsStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

function createVesselStore() {
  const [positions, setPositions] = createStore<Record<string, LivePosition>>({});
  const [wsStatus, setWsStatus] = createSignal<WsStatus>('disconnected');
  const [lastUpdate, setLastUpdate] = createSignal<Date | null>(null);

  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectDelay = 2000;

  function connect() {
    if (ws?.readyState === WebSocket.OPEN || ws?.readyState === WebSocket.CONNECTING) return;
    setWsStatus('connecting');

    // Use the same host as the page, just switch protocol
    const wsBase = window.location.hostname === 'localhost'
      ? `ws://localhost:8000`
      : `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}`;

    try {
      ws = new WebSocket(`${wsBase}/ws/vessels/tracking/`);

      ws.onopen = () => {
        setWsStatus('connected');
        reconnectDelay = 2000;
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string);
          if (msg.type === 'position_update' && Array.isArray(msg.data)) {
            const updates: Record<string, LivePosition> = {};
            for (const pos of msg.data as LivePosition[]) {
              updates[pos.vessel_id] = pos;
            }
            setPositions(updates);
            setLastUpdate(new Date());
          }
        } catch { /* ignore */ }
      };

      ws.onerror = () => setWsStatus('error');
      ws.onclose = () => {
        setWsStatus('disconnected');
        scheduleReconnect();
      };
    } catch {
      setWsStatus('error');
      scheduleReconnect();
    }
  }

  function scheduleReconnect() {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => {
      reconnectDelay = Math.min(reconnectDelay * 1.5, 15000);
      connect();
    }, reconnectDelay);
  }

  function disconnect() {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    ws?.close();
    ws = null;
    setWsStatus('disconnected');
  }

  onCleanup(disconnect);

  return {
    positions,
    wsStatus,
    lastUpdate,
    connect,
    disconnect,
    positionList: () => Object.values(positions),
  };
}

export const vesselStore = createVesselStore();
