import { Component, onMount, onCleanup, createEffect, createSignal } from 'solid-js';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { vesselStore } from '../stores/vesselStore';
import Header from '../components/Header';
import { config } from '../config';
import type { LivePosition } from '../types';
import { format } from 'date-fns';

const VESSEL_COLORS: Record<string, string> = {
  barge: '#f59e0b',
  cargo: '#3b82f6',
  tanker: '#10b981',
  tug: '#8b5cf6',
  passenger: '#ec4899',
  other: '#6b7280',
};

function makeIcon(type: string, selected = false) {
  const color = VESSEL_COLORS[type] ?? '#6b7280';
  const size = selected ? 18 : 13;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="10" fill="${color}" opacity="${selected ? 1 : 0.85}" stroke="white" stroke-width="${selected ? 3 : 2}"/>
    ${selected ? `<circle cx="12" cy="12" r="5" fill="white" opacity="0.5"/>` : ''}
  </svg>`;
  return L.divIcon({
    html: svg, className: '', iconSize: [size, size], iconAnchor: [size / 2, size / 2],
  });
}

const LiveMap: Component = () => {
  let mapContainer: HTMLDivElement | undefined;
  let map: L.Map | undefined;
  const markers = new Map<string, L.Marker>();
  const [selectedVessel, setSelectedVessel] = createSignal<LivePosition | null>(null);
  const [filter, setFilter] = createSignal<string>('all');

  onMount(() => {
    if (!mapContainer) return;
    map = L.map(mapContainer, {
      center: [config.defaultMapCenter.lat, config.defaultMapCenter.lon],
      zoom: config.defaultMapZoom,
      zoomControl: true,
    });

    L.tileLayer(config.mapTileUrl, {
      attribution: config.mapTileAttribution,
      maxZoom: 18,
    }).addTo(map);

    vesselStore.connect();
  });

  onCleanup(() => {
    map?.remove();
  });

  createEffect(() => {
    const positions = vesselStore.positionList();
    if (!map) return;

    const currentType = filter();

    for (const pos of positions) {
      if (currentType !== 'all' && pos.vessel_type !== currentType) {
        if (markers.has(pos.vessel_id)) {
          markers.get(pos.vessel_id)!.remove();
          markers.delete(pos.vessel_id);
        }
        continue;
      }

      const isSelected = selectedVessel()?.vessel_id === pos.vessel_id;
      const icon = makeIcon(pos.vessel_type, isSelected);

      if (markers.has(pos.vessel_id)) {
        const marker = markers.get(pos.vessel_id)!;
        marker.setLatLng([pos.lat, pos.lon]);
        marker.setIcon(icon);
      } else {
        const marker = L.marker([pos.lat, pos.lon], { icon })
          .addTo(map!)
          .on('click', () => setSelectedVessel(pos));
        markers.set(pos.vessel_id, marker);
      }
    }

    // Remove stale markers
    for (const [id] of markers) {
      if (!positions.find(p => p.vessel_id === id)) {
        markers.get(id)!.remove();
        markers.delete(id);
      }
    }
  });

  const vesselTypes = () => {
    const types = new Set(vesselStore.positionList().map(p => p.vessel_type));
    return ['all', ...types];
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Header title="Live Map" subtitle="Real-time AIS vessel position feed" />
      <div style={{ flex: '1', display: 'flex', position: 'relative', overflow: 'hidden' }}>

        {/* Map */}
        <div ref={mapContainer!} style={{ flex: '1', height: '100%' }} />

        {/* Controls overlay */}
        <div style={controlsPanel}>
          <div style={{ marginBottom: '12px' }}>
            <div style={controlLabel}>Filter by type</div>
            <select
              class="input"
              style={{ fontSize: '0.8rem', padding: '6px 10px' }}
              value={filter()}
              onChange={(e) => setFilter(e.currentTarget.value)}
            >
              {vesselTypes().map(t => (
                <option value={t}>{t === 'all' ? 'All vessels' : t.charAt(0).toUpperCase() + t.slice(1)}</option>
              ))}
            </select>
          </div>

          <div style={legendWrap}>
            {Object.entries(VESSEL_COLORS).map(([type, color]) => (
              <div style={legendItem}>
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: color, display: 'inline-block', flexShrink: '0' }} />
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'capitalize' }}>{type}</span>
              </div>
            ))}
          </div>

          <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--border)' }}>
            <div style={controlLabel}>Visible</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', color: 'var(--accent)' }}>
              {vesselStore.positionList().filter(p => filter() === 'all' || p.vessel_type === filter()).length}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>vessels on map</div>
          </div>
        </div>

        {/* Selected vessel panel */}
        {selectedVessel() && (
          <div style={vesselPanel} class="fade-in">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem' }}>{selectedVessel()!.name}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>MMSI: {selectedVessel()!.mmsi}</div>
              </div>
              <button
                onClick={() => setSelectedVessel(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '1.1rem', lineHeight: '1' }}
              >×</button>
            </div>

            <span class={`badge badge-${selectedVessel()!.vessel_type === 'barge' ? 'active' : 'planned'}`} style={{ marginBottom: '12px', display: 'inline-block' }}>
              {selectedVessel()!.vessel_type}
            </span>

            {[
              ['Position', `${selectedVessel()!.lat.toFixed(4)}°N, ${Math.abs(selectedVessel()!.lon).toFixed(4)}°W`],
              ['Speed', `${selectedVessel()!.speed.toFixed(1)} knots`],
              ['Course', `${selectedVessel()!.course.toFixed(0)}°`],
              ['Updated', format(new Date(selectedVessel()!.timestamp), 'HH:mm:ss')],
            ].map(([label, val]) => (
              <div style={detailRow}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
                <span style={{ fontSize: '0.84rem', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{val}</span>
              </div>
            ))}

            <button
              class="btn btn-primary btn-sm"
              style={{ marginTop: '12px', width: '100%', justifyContent: 'center' }}
              onClick={() => {
                const pos = selectedVessel()!;
                map?.flyTo([pos.lat, pos.lon], 10, { duration: 1.5 });
              }}
            >
              Center on vessel
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

const controlsPanel: Record<string, string> = {
  position: 'absolute', top: '16px', right: '16px', zIndex: '1000',
  background: 'var(--bg-overlay)', backdropFilter: 'blur(12px)',
  border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)',
  padding: '16px', width: '180px', boxShadow: 'var(--shadow-md)',
};
const controlLabel: Record<string, string> = {
  fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.08em',
  color: 'var(--text-muted)', marginBottom: '6px', fontWeight: '600',
};
const legendWrap: Record<string, string> = {
  display: 'flex', flexDirection: 'column', gap: '5px',
};
const legendItem: Record<string, string> = {
  display: 'flex', alignItems: 'center', gap: '7px',
};
const vesselPanel: Record<string, string> = {
  position: 'absolute', bottom: '24px', left: '24px', zIndex: '1000',
  background: 'var(--bg-overlay)', backdropFilter: 'blur(12px)',
  border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)',
  padding: '18px', width: '260px', boxShadow: 'var(--shadow-lg)',
};
const detailRow: Record<string, string> = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  padding: '5px 0', borderBottom: '1px solid var(--border)',
};

export default LiveMap;
