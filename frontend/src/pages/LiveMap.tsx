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

// US inland waterways bounding box
const US_BOUNDS = L.latLngBounds([24.0, -100.0], [49.0, -66.0]);

function makeIcon(type: string, selected = false) {
  const color = VESSEL_COLORS[type] ?? '#6b7280';
  const s = selected ? 20 : 13;
  return L.divIcon({
    html: `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10" fill="${color}" stroke="white" stroke-width="${selected ? 3 : 2.5}" opacity="0.92"/>
      ${selected ? '<circle cx="12" cy="12" r="4" fill="white" opacity="0.7"/>' : ''}
    </svg>`,
    className: '', iconSize: [s, s], iconAnchor: [s/2, s/2]
  });
}

const LiveMap: Component = () => {
  let mapContainer: HTMLDivElement | undefined;
  let map: L.Map | undefined;
  const markers = new Map<string, L.Marker>();
  const [selected, setSelected] = createSignal<LivePosition | null>(null);
  const [count, setCount] = createSignal(0);
  const [lastFetch, setLastFetch] = createSignal<Date | null>(null);
  const [isLive, setIsLive] = createSignal(false);

  const placeMarker = (pos: LivePosition) => {
    if (!map) return;
    // Show all vessels within broad US waters (inland, Gulf Coast, East Coast, West Coast)
    if (pos.lat < 17 || pos.lat > 50 || pos.lon < -130 || pos.lon > -60) return;
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
    map = L.map(mapContainer, {
      center: [35.0, -95.0],
      zoom: 4,
      preferCanvas: true,
      maxBounds: L.latLngBounds([14.0, -140.0], [62.0, -50.0]),
      minZoom: 3,
      scrollWheelZoom: true,
      wheelDebounceTime: 100,
      wheelPxPerZoomLevel: 120,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors', maxZoom: 18,
    }).addTo(map);

    // Load positions immediately from REST
    try {
      const res = await vesselsApi.livePositions();
      const positions: LivePosition[] = res.data;
      positions.forEach(placeMarker);
      setCount(positions.length);
      setLastFetch(new Date());
      setIsLive(true);
    } catch (e) { console.error('Failed to load positions', e); }

    // Connect WebSocket for live updates
    vesselStore.connect();

    // Also poll REST every 30s as fallback
    const pollInterval = setInterval(async () => {
      try {
        const res = await vesselsApi.livePositions();
        const positions: LivePosition[] = res.data;
        positions.forEach(placeMarker);
        setCount(positions.length);
        setLastFetch(new Date());
        setIsLive(true);
      } catch {}
    }, 30000);

    onCleanup(() => clearInterval(pollInterval));
  });

  // Update from WebSocket
  createEffect(() => {
    const positions = vesselStore.positionList();
    if (!positions.length) return;
    positions.forEach(placeMarker);
    setCount(positions.length);
    setLastFetch(new Date());
    setIsLive(true);
  });

  onCleanup(() => map?.remove());

  return (
    <div style={{ display:'flex', 'flex-direction':'column', height:'100%' }}>
      <Header title="Live Map" subtitle="Real-time AIS vessel positions · US waters via aisstream.io" />
      <div style={{ flex:'1', position:'relative', overflow:'hidden' }}>
        <div ref={mapContainer!} style={{ width:'100%', height:'100%' }} />

        {/* Live status badge - top left */}
        <div style={{ position:'absolute', bottom:'20px', left:'12px', 'z-index':'1000', background: isLive() ? 'rgba(5,150,105,0.95)' : 'rgba(107,114,128,0.9)', 'backdrop-filter':'blur(8px)', 'border-radius':'100px', padding:'6px 14px', display:'flex', 'align-items':'center', gap:'7px', 'box-shadow':'var(--shadow-md)' }}>
          <span style={{ width:'7px', height:'7px', 'border-radius':'50%', background:'white', display:'inline-block', animation: isLive() ? 'pulse 1.5s ease-in-out infinite' : 'none' }}/>
          <span style={{ color:'white', 'font-size':'0.76rem', 'font-weight':'600', 'letter-spacing':'0.04em' }}>
            {isLive() ? 'LIVE' : 'LOADING'}
          </span>
          <span style={{ color:'rgba(255,255,255,0.8)', 'font-size':'0.70rem' }}>
            {count()} vessels
          </span>
          {lastFetch() && (
            <span style={{ color:'rgba(255,255,255,0.65)', 'font-size':'0.68rem' }}>
              · {format(lastFetch()!, 'HH:mm:ss')}
            </span>
          )}
        </div>

        {/* Legend - top right */}
        <div style={{ position:'absolute', top:'12px', right:'12px', 'z-index':'1000', background:'rgba(255,251,235,0.96)', 'backdrop-filter':'blur(8px)', border:'1px solid var(--border)', 'border-radius':'var(--radius-lg)', padding:'14px 16px', 'box-shadow':'var(--shadow-md)' }}>
          <div style={{ 'font-size':'0.62rem', 'text-transform':'uppercase', 'letter-spacing':'0.08em', color:'var(--text-muted)', 'margin-bottom':'8px', 'font-weight':'700' }}>Vessel Types</div>
          <div style={{ display:'flex', 'flex-direction':'column', gap:'5px' }}>
            {Object.entries(VESSEL_COLORS).map(([type, color]) => (
              <div style={{ display:'flex', 'align-items':'center', gap:'8px' }}>
                <span style={{ width:'10px', height:'10px', 'border-radius':'50%', background:color, display:'inline-block', 'flex-shrink':'0' }}/>
                <span style={{ 'font-size':'0.74rem', color:'var(--text-secondary)', 'text-transform':'capitalize' }}>{type}</span>
              </div>
            ))}
          </div>
          <div style={{ 'margin-top':'10px', 'padding-top':'10px', 'border-top':'1px solid var(--border)', 'font-size':'0.68rem', color:'var(--text-muted)' }}>
            AIS updates every 5 min<br/>
            Click vessel for details
          </div>
        </div>

        {/* Centered vessel detail popup */}
        {selected() && (
          <>
            <div onClick={() => setSelected(null)} style={{ position:'absolute', inset:'0', 'z-index':'1999', background:'rgba(0,0,0,0.2)' }}/>
            <div class="fade-in" style={{ position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)', 'z-index':'2000', background:'var(--bg-card)', border:'1px solid var(--border)', 'border-radius':'var(--radius-xl)', padding:'28px 32px', width:'380px', 'box-shadow':'var(--shadow-lg)' }}>
              <div style={{ display:'flex', 'justify-content':'space-between', 'align-items':'flex-start', 'margin-bottom':'16px' }}>
                <div>
                  <div style={{ 'font-family':'var(--font-display)', 'font-size':'1.35rem' }}>{selected()!.name}</div>
                  <div style={{ 'font-size':'0.72rem', color:'var(--text-muted)', 'margin-top':'2px' }}>
                    MMSI: <code style={{ 'font-family':'var(--font-mono)', color:'var(--accent)' }}>{selected()!.mmsi}</code>
                  </div>
                </div>
                <button onClick={() => setSelected(null)} style={{ background:'none', border:'1px solid var(--border)', cursor:'pointer', color:'var(--text-muted)', 'border-radius':'50%', width:'28px', height:'28px', display:'flex', 'align-items':'center', 'justify-content':'center' }}>×</button>
              </div>

              <div style={{ display:'flex', gap:'8px', 'margin-bottom':'16px' }}>
                <span class={`badge badge-${selected()!.vessel_type}`} style={{ padding:'4px 12px', 'font-size':'0.76rem' }}>{selected()!.vessel_type}</span>
                <span style={{ background:'var(--status-active-bg)', color:'var(--status-active)', padding:'4px 12px', 'border-radius':'100px', 'font-size':'0.72rem', 'font-weight':'600' }}>LIVE</span>
              </div>

              <div style={{ display:'grid', 'grid-template-columns':'1fr 1fr', gap:'10px', 'margin-bottom':'16px' }}>
                {[
                  ['Latitude', `${selected()!.lat.toFixed(5)}°N`],
                  ['Longitude', `${Math.abs(selected()!.lon).toFixed(5)}°W`],
                  ['Speed', `${selected()!.speed.toFixed(1)} knots`],
                  ['Course', `${selected()!.course.toFixed(0)}° true`],
                ].map(([label, val]) => (
                  <div style={{ background:'var(--bg-subtle)', 'border-radius':'var(--radius-md)', padding:'10px 14px' }}>
                    <div style={{ 'font-size':'0.62rem', color:'var(--text-muted)', 'text-transform':'uppercase', 'letter-spacing':'0.07em', 'margin-bottom':'3px' }}>{label}</div>
                    <div style={{ 'font-family':'var(--font-mono)', 'font-size':'0.88rem', 'font-weight':'500' }}>{val}</div>
                  </div>
                ))}
              </div>

              <div style={{ 'font-size':'0.70rem', color:'var(--text-muted)', 'margin-bottom':'14px', 'padding':'8px 12px', background:'var(--bg-subtle)', 'border-radius':'var(--radius-md)' }}>
                Position sourced from AIS feed · Updated {format(new Date(selected()!.timestamp), 'MMM d HH:mm:ss')}
              </div>

              <div style={{ display:'flex', gap:'8px' }}>
                <button class="btn btn-primary" style={{ flex:'1', 'justify-content':'center' }}
                  onClick={() => { map?.flyTo([selected()!.lat, selected()!.lon], 11, { duration:1.2 }); setSelected(null); }}>
                  Fly to vessel
                </button>
                <button class="btn btn-ghost" style={{ flex:'1', 'justify-content':'center' }} onClick={() => setSelected(null)}>
                  Close
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default LiveMap;
