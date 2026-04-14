import { Component, onMount, onCleanup, createEffect, createSignal } from 'solid-js';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { vesselStore } from '../stores/vesselStore';
import Header from '../components/Header';
import type { LivePosition } from '../types';
import { format } from 'date-fns';
import { vesselsApi } from '../api';

const VESSEL_COLORS: Record<string, string> = {
  barge: '#d97706', cargo: '#2563eb', tanker: '#059669',
  tug: '#7c3aed', passenger: '#db2777', other: '#6b7280',
};

function makeIcon(type: string, selected = false) {
  const color = VESSEL_COLORS[type] ?? '#6b7280';
  const s = selected ? 18 : 12;
  return L.divIcon({
    html: `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="${color}" stroke="white" stroke-width="${selected ? 3 : 2}"/>${selected ? '<circle cx="12" cy="12" r="4" fill="white" opacity="0.7"/>' : ''}</svg>`,
    className: '', iconSize: [s, s], iconAnchor: [s/2, s/2]
  });
}

const LiveMap: Component = () => {
  let mapContainer: HTMLDivElement | undefined;
  let map: L.Map | undefined;
  const markers = new Map<string, L.Marker>();
  const [selected, setSelected] = createSignal<LivePosition | null>(null);
  const [filter, setFilter] = createSignal('all');
  const [count, setCount] = createSignal(0);

  const placeMarker = (pos: LivePosition) => {
    if (!map) return;
    if (filter() !== 'all' && pos.vessel_type !== filter()) return;
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

  onMount(async () => {
    if (!mapContainer) return;
    map = L.map(mapContainer, { center: [38.5, -90.0], zoom: 5, preferCanvas: true, zoomControl: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors', maxZoom: 18,
    }).addTo(map);

    // Load from REST API immediately
    try {
      const res = await vesselsApi.livePositions();
      const positions: LivePosition[] = res.data;
      setCount(positions.length);
      positions.forEach(placeMarker);
    } catch (e) { console.error('Failed to load positions', e); }

    vesselStore.connect();
  });

  createEffect(() => {
    const positions = vesselStore.positionList();
    if (!positions.length) return;
    setCount(positions.length);
    positions.forEach(placeMarker);
  });

  onCleanup(() => map?.remove());

  return (
    <div style={{ display:'flex', 'flex-direction':'column', height:'100%' }}>
      <Header title="Live Map" subtitle="Real-time AIS vessel position feed · US inland waterways" />
      <div style={{ flex:'1', position:'relative', overflow:'hidden' }}>
        <div ref={mapContainer!} style={{ width:'100%', height:'100%' }} />

        {/* Controls top-right */}
        <div style={{ position:'absolute', top:'12px', right:'12px', 'z-index':'1000', background:'rgba(255,251,235,0.95)', 'backdrop-filter':'blur(8px)', border:'1px solid var(--border)', 'border-radius':'var(--radius-lg)', padding:'14px 16px', 'min-width':'160px', 'box-shadow':'var(--shadow-md)' }}>
          <div style={{ 'font-size':'0.62rem', 'text-transform':'uppercase', 'letter-spacing':'0.08em', color:'var(--text-muted)', 'margin-bottom':'6px', 'font-weight':'700' }}>Filter type</div>
          <select class="input" style={{ 'font-size':'0.78rem', padding:'5px 8px', 'margin-bottom':'10px' }} value={filter()} onChange={e => setFilter(e.currentTarget.value)}>
            <option value="all">All vessels</option>
            {Object.keys(VESSEL_COLORS).map(t => <option value={t}>{t.charAt(0).toUpperCase()+t.slice(1)}</option>)}
          </select>
          <div style={{ display:'flex', 'flex-direction':'column', gap:'4px', 'margin-bottom':'10px' }}>
            {Object.entries(VESSEL_COLORS).map(([type, color]) => (
              <div style={{ display:'flex', 'align-items':'center', gap:'7px' }}>
                <span style={{ width:'9px', height:'9px', 'border-radius':'50%', background:color, display:'inline-block' }}/>
                <span style={{ 'font-size':'0.72rem', color:'var(--text-secondary)', 'text-transform':'capitalize' }}>{type}</span>
              </div>
            ))}
          </div>
          <div style={{ 'border-top':'1px solid var(--border)', 'padding-top':'8px' }}>
            <div style={{ 'font-family':'var(--font-display)', 'font-size':'1.8rem', color:'var(--accent)', 'line-height':'1' }}>{count()}</div>
            <div style={{ 'font-size':'0.68rem', color:'var(--text-muted)' }}>vessels tracked</div>
            <div style={{ 'font-size':'0.65rem', 'margin-top':'3px', color: vesselStore.wsStatus()==='connected' ? 'var(--status-active)' : 'var(--text-muted)' }}>
              WS: {vesselStore.wsStatus()}
            </div>
          </div>
        </div>

        {/* Vessel detail - centered popup */}
        {selected() && (
          <div style={{ position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)', 'z-index':'2000', background:'var(--bg-card)', border:'1px solid var(--border)', 'border-radius':'var(--radius-xl)', padding:'28px 32px', width:'380px', 'box-shadow':'var(--shadow-lg)' }} class="fade-in">
            <div style={{ display:'flex', 'justify-content':'space-between', 'align-items':'flex-start', 'margin-bottom':'16px' }}>
              <div>
                <div style={{ 'font-family':'var(--font-display)', 'font-size':'1.4rem', color:'var(--text-primary)' }}>{selected()!.name}</div>
                <div style={{ 'font-size':'0.75rem', color:'var(--text-muted)', 'margin-top':'2px' }}>MMSI: <code style={{ 'font-family':'var(--font-mono)', color:'var(--accent)' }}>{selected()!.mmsi}</code></div>
              </div>
              <button onClick={() => setSelected(null)} style={{ background:'none', border:'1px solid var(--border)', cursor:'pointer', color:'var(--text-muted)', 'font-size':'1.1rem', 'border-radius':'50%', width:'28px', height:'28px', display:'flex', 'align-items':'center', 'justify-content':'center' }}>×</button>
            </div>
            <span class={`badge badge-${selected()!.vessel_type}`} style={{ 'margin-bottom':'16px', display:'inline-block', 'font-size':'0.78rem', padding:'4px 12px' }}>{selected()!.vessel_type}</span>
            <div style={{ display:'grid', 'grid-template-columns':'1fr 1fr', gap:'12px', 'margin-bottom':'16px' }}>
              {[
                ['Latitude', `${selected()!.lat.toFixed(5)}°N`],
                ['Longitude', `${Math.abs(selected()!.lon).toFixed(5)}°W`],
                ['Speed', `${selected()!.speed.toFixed(1)} knots`],
                ['Course', `${selected()!.course.toFixed(0)}°`],
              ].map(([label, val]) => (
                <div style={{ background:'var(--bg-subtle)', 'border-radius':'var(--radius-md)', padding:'10px 14px' }}>
                  <div style={{ 'font-size':'0.65rem', color:'var(--text-muted)', 'text-transform':'uppercase', 'letter-spacing':'0.07em', 'margin-bottom':'4px' }}>{label}</div>
                  <div style={{ 'font-family':'var(--font-mono)', 'font-size':'0.88rem', color:'var(--text-primary)', 'font-weight':'500' }}>{val}</div>
                </div>
              ))}
            </div>
            <div style={{ 'font-size':'0.72rem', color:'var(--text-muted)', 'margin-bottom':'14px' }}>
              Last updated: {format(new Date(selected()!.timestamp), 'MMM d, HH:mm:ss')}
            </div>
            <div style={{ display:'flex', gap:'8px' }}>
              <button class="btn btn-primary" style={{ flex:'1', 'justify-content':'center' }}
                onClick={() => { map?.flyTo([selected()!.lat, selected()!.lon], 11, { duration: 1.2 }); setSelected(null); }}>
                Fly to vessel
              </button>
              <button class="btn btn-ghost" style={{ flex:'1', 'justify-content':'center' }} onClick={() => setSelected(null)}>
                Close
              </button>
            </div>
          </div>
        )}
        {selected() && <div onClick={() => setSelected(null)} style={{ position:'absolute', inset:'0', 'z-index':'1999', background:'rgba(0,0,0,0.15)' }} />}
      </div>
    </div>
  );
};

export default LiveMap;
