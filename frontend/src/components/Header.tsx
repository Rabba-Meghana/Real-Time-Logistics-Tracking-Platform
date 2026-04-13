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
    connecting: 'Connecting…',
    disconnected: 'Offline',
    error: 'Error',
  }[vesselStore.wsStatus()] ?? 'Unknown');

  return (
    <header style={headerStyle}>
      <div>
        <h1 style={titleStyle}>{props.title}</h1>
        {props.subtitle && <p style={subtitleStyle}>{props.subtitle}</p>}
      </div>
      <div style={rightWrap}>
        <div style={wsIndicator}>
          <span
            class={vesselStore.wsStatus() === 'connected' ? 'pulse' : ''}
            style={{ ...dot, background: statusColor() }}
          />
          <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
            {statusLabel()}
          </span>
          {vesselStore.lastUpdate() && (
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              · {format(vesselStore.lastUpdate()!, 'HH:mm:ss')}
            </span>
          )}
        </div>
        <div style={posCount}>
          <strong style={{ color: 'var(--accent)' }}>
            {vesselStore.positionList().length}
          </strong>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginLeft: '4px' }}>
            vessels tracked
          </span>
        </div>
      </div>
    </header>
  );
};

const headerStyle: Record<string, string> = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: '0 32px', height: 'var(--header-height)',
  borderBottom: '1px solid var(--border)',
  background: 'var(--bg-card)',
  flexShrink: '0',
};
const titleStyle: Record<string, string> = {
  fontFamily: 'var(--font-display)', fontSize: '1.35rem',
  color: 'var(--text-primary)', fontWeight: '400',
};
const subtitleStyle: Record<string, string> = {
  fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '1px',
};
const rightWrap: Record<string, string> = {
  display: 'flex', alignItems: 'center', gap: '20px',
};
const wsIndicator: Record<string, string> = {
  display: 'flex', alignItems: 'center', gap: '6px',
};
const dot: Record<string, string> = {
  width: '7px', height: '7px', borderRadius: '50%', display: 'inline-block',
};
const posCount: Record<string, string> = {
  display: 'flex', alignItems: 'baseline',
  background: 'var(--accent-subtle)',
  padding: '4px 12px', borderRadius: '100px',
  border: '1px solid var(--border)',
};

export default Header;
