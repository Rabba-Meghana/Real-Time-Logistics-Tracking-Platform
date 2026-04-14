import { Component, onMount, onCleanup, createEffect, createSignal } from 'solid-js';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { vesselStore } from '../stores/vesselStore';
import Header from '../components/Header';
import type { LivePosition } from '../types';
import { format } from 'date-fns';
import { vesselsApi } from '../api';

const VESSEL_COLORS: Record<string, string> = {
  barge: '#d97706',
  cargo: '#2563eb',
  tanker: '#059669',
  tug: '#7c3aed',
  passenger: '#db2777',
  other: '#6b7280',
};

function makeIcon(type: string, selected = false) {
  const color = VESSEL_COLORS[type] ?? '#6b7280';
  const s = selected ? 16 : 11;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="10" fill="${color}" opacity="${selected ? 1 : 0.9}" stroke="white" stroke-width="${selected ? 3 : 2.5}"/>
    ${selected ? '<circle cx="12" cy="12" r="4" fill="white" opacity="0.6"/>' : ''}
  </svg>`;
  return L.divIcon({ html: svg, className: '', iconSize: [s, s], iconAnchor: [s / 2, s / 2] });
}

const LiveMap: Component = () => {
  let mapContainer: HTMLDivElement | undefined;
  let map: L.Map | undefined;
  const markers = new Map<string, L.Marker>();
  const [selected, setSelected] = createSignal<LivePosition | null>(null);
  const [filter, setFilter] = createSignal<string>('all');
  const [positionCount, setPositionCount] = createSignal(0);

  onMount(() => {
    if (!mapContainer) return;

    map = L.map(mapContainer, {
      center: [38.5, -90.0],
      zoom: 5,
      zoomControl: true,
      preferCanvas: true, // Fix zoom jitter
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 18,
    }).addTo(map);

    // Load initial positions from REST API immediately
    loadInitialPositions();

    // Then connect WebSocket for live updates
    vesselStore.connect();
  });

  const loadInitialPositions = async () => {
    try {
      const res = await vesselsApi.livePositions();
      const positions: LivePosition[] = res.data;
      setPositionCount(positions.length);
      for (const pos of positions) {
        updateMarker(pos);
      }
    } catch (e) {
      console.error('Failed to load initial positions', e);
    }
  };

  const updateMarker = (pos: LivePosition) => {
    if (!map) return;
    const currentFilter = filter();
    if (currentFilter !== 'all' && pos.vessel_type !== currentFilter) {
      if (markers.has(pos.vessel_id)) {
        markers.get(pos.vessel_id)!.remove();
        markers.delete(pos.vessel_id);
      }
      return;
    }
    const isSelected = selected()?.vessel_id === pos.vessel_id;
    const icon = makeIcon(pos.vessel_type, isSelected);
    if (markers.has(pos.vessel_id)) {
      markers.get(pos.vessel_id)!.setLatLng([pos.lat, pos.lon]).setIcon(icon);
    } else {
      const m = L.marker([pos.lat, pos.lon], { icon })
        .addTo(map!)
        .on('click', () => setSelected(pos));
      markers.set(pos.vessel_id, m);
    }
  };

  // Update markers when WebSocket pushes new positions
  createEffect(() => {
    const positions = vesselStore.positionList();
    if (positions.length === 0) return;
    setPositionCount(positions.length);
    for (const pos of positions) {
      updateMarker(pos);
    }
  });

  // Refilter on filter change
  createEffect(() => {
    const currentFilter = filter();
    for (const [id, marker] of markers) {
      const pos = vesselStore.positions[id];
      if (pos && currentFilter !== 'all' && pos.vessel_type !== currentFilter) {
        marker.remove();
        markers.delete(id);
      }
    }
  });

  onCleanup(() => { map?.remove(); });

  const vesselTypes = () => {
    const types = new Set<string>();
    for (const p of vesselStore.positionList()) types.add(p.vessel_type);
    return ['all', ...types];
  };

  return (
    <div style={{ display: 'flex', 'flex-direction': 'column', height: '100%' }}>
      <Header title="Live Map" subtitle="Real-time AIS vessel position feed" />
      <div style={{ flex: '1', display: 'flex', position: 'relative', overflow: 'hidden' }}>
        <div ref={mapContainer!} style={{ flex: '1', height: '100%' }} />

        {/* Controls */}
        <div style={{ position: 'absolute', top: '14px', right: '14px', 'z-index': '1000', background: 'var(--bg-overlay)', 'backdrop-filter': 'blur(12px)', border: '1px solid var(--border)', 'border-radius': 'var(--radius-lg)', padding: '14px', width: '170px', 'box-shadow': 'var(--shadow-md)' }}>
          <div style={{ 'font-size': '0.65rem', 'text-transform': 'uppercase', 'letter-spacing': '0.08em', color: 'var(--text-muted)', 'margin-bottom': '6px', 'font-weight': '600' }}>Filter type</div>
          <select class="input" style={{ 'font-size': '0.78rem', padding: '5px 8px', 'margin-bottom': '12px' }} value={filter()} onChange={e => setFilter(e.currentTarget.value)}>
            {vesselTypes().map(t => <option value={t}>{t === 'all' ? 'All vessels' : t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
          </select>

          <div style={{ display: 'flex', 'flex-direction': 'column', gap: '4px', 'margin-bottom': '12px' }}>
            {Object.entries(VESSEL_COLORS).map(([type, color]) => (
              <div style={{ display: 'flex', 'align-items': 'center', gap: '6px' }}>
                <span style={{ width: '9px', height: '9px', 'border-radius': '50%', background: color, display: 'inline-block', 'flex-shrink': '0' }} />
                <span style={{ 'font-size': '0.72rem', color: 'var(--text-secondary)', 'text-transform': 'capitalize' }}>{type}</span>
              </div>
            ))}
          </div>

          <div style={{ 'padding-top': '10px', 'border-top': '1px solid var(--border)' }}>
            <div style={{ 'font-size': '0.65rem', color: 'var(--text-muted)', 'text-transform': 'uppercase', 'letter-spacing': '0.06em' }}>Vessels on map</div>
            <div style={{ 'font-family': 'var(--font-display)', 'font-size': '1.6rem', color: 'var(--accent)' }}>{positionCount()}</div>
            <div style={{ 'font-size': '0.68rem', color: 'var(--text-muted)' }}>
              WS: <span style={{ color: vesselStore.wsStatus() === 'connected' ? 'var(--status-active)' : 'var(--text-muted)' }}>{vesselStore.wsStatus()}</span>
            </div>
          </div>
        </div>

        {/* Vessel detail panel */}
        {selected() && (
          <div style={{ position: 'absolute', bottom: '20px', left: '20px', 'z-index': '1000', background: 'var(--bg-overlay)', 'backdrop-filter': 'blur(12px)', border: '1px solid var(--border)', 'border-radius': 'var(--radius-lg)', padding: '16px', width: '255px', 'box-shadow': 'var(--shadow-lg)' }} class="fade-in">
            <div style={{ display: 'flex', 'justify-content': 'space-between', 'align-items': 'flex-start', 'margin-bottom': '10px' }}>
              <div>
                <div style={{ 'font-family': 'var(--font-display)', 'font-size': '1.05rem' }}>{selected()!.name}</div>
                <div style={{ 'font-size': '0.72rem', color: 'var(--text-muted)' }}>MMSI: {selected()!.mmsi}</div>
              </div>
              <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', 'font-size': '1.1rem' }}>×</button>
            </div>
            <span class={`badge badge-${selected()!.vessel_type}`} style={{ 'margin-bottom': '10px', display: 'inline-block' }}>{selected()!.vessel_type}</span>
            {[
              ['Position', `${selected()!.lat.toFixed(4)}°N, ${Math.abs(selected()!.lon).toFixed(4)}°W`],
              ['Speed', `${selected()!.speed.toFixed(1)} knots`],
              ['Course', `${selected()!.course.toFixed(0)}°`],
              ['Updated', format(new Date(selected()!.timestamp), 'HH:mm:ss')],
            ].map(([label, val]) => (
              <div style={{ display: 'flex', 'justify-content': 'space-between', 'align-items': 'center', padding: '4px 0', 'border-bottom': '1px solid var(--border)' }}>
                <span style={{ 'font-size': '0.70rem', color: 'var(--text-muted)', 'text-transform': 'uppercase', 'letter-spacing': '0.05em' }}>{label}</span>
                <span style={{ 'font-size': '0.82rem', color: 'var(--text-primary)', 'font-family': 'var(--font-mono)' }}>{val}</span>
              </div>
            ))}
            <button class="btn btn-primary btn-sm" style={{ 'margin-top': '10px', width: '100%', 'justify-content': 'center' }}
              onClick={() => map?.flyTo([selected()!.lat, selected()!.lon], 10, { duration: 1.2 })}>
              Center on vessel
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default LiveMap;
