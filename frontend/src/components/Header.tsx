import { Component } from 'solid-js';
import { vesselStore } from '../stores/vesselStore';
import { format } from 'date-fns';

interface HeaderProps {
  title: string;
  subtitle?: string;
}

const Header: Component<HeaderProps> = (props) => {
  const statusColor = () => ({
    connected: 'var(--status-active)',
    connecting: 'var(--gold-500)',
    disconnected: 'var(--text-muted)',
    error: 'var(--status-delayed)',
  }[vesselStore.wsStatus()] ?? 'var(--text-muted)');

  const statusLabel = () => ({
    connected: 'Live',
    connecting: 'Connecting',
    disconnected: 'Offline',
    error: 'Error',
  }[vesselStore.wsStatus()] ?? 'Unknown');

  return (
    <header class="page-header">
      <div>
        <h1 style={{ 'font-family':'var(--font-display)', 'font-size':'1.3rem', color:'var(--text-primary)', 'font-weight':'400' }}>
          {props.title}
        </h1>
        {props.subtitle && (
          <p style={{ 'font-size':'0.72rem', color:'var(--text-muted)', 'margin-top':'1px' }}>{props.subtitle}</p>
        )}
      </div>
      <div style={{ display:'flex', 'align-items':'center', gap:'16px' }}>
        <div style={{ display:'flex', 'align-items':'center', gap:'6px' }}>
          <span
            class={vesselStore.wsStatus() === 'connected' ? 'pulse' : ''}
            style={{ width:'7px', height:'7px', 'border-radius':'50%', background: statusColor(), display:'inline-block' }}
          />
          <span style={{ 'font-size':'0.76rem', color:'var(--text-secondary)' }}>{statusLabel()}</span>
          {vesselStore.lastUpdate() && (
            <span style={{ 'font-size':'0.70rem', color:'var(--text-muted)' }}>
              · {format(vesselStore.lastUpdate()!, 'HH:mm:ss')}
            </span>
          )}
        </div>
        <div style={{ display:'flex', 'align-items':'baseline', background:'var(--accent-subtle)', padding:'3px 12px', 'border-radius':'100px', border:'1px solid var(--border)' }}>
          <strong style={{ color:'var(--accent)', 'font-size':'0.95rem' }}>{vesselStore.positionList().length}</strong>
          <span style={{ 'font-size':'0.70rem', color:'var(--text-muted)', 'margin-left':'4px' }}>vessels</span>
        </div>
      </div>
    </header>
  );
};

export default Header;
