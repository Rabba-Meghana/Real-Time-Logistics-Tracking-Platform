import { Component } from 'solid-js';
import { A, useLocation } from '@solidjs/router';

interface SidebarProps {
  theme: 'light' | 'dark';
  onThemeToggle: () => void;
}

const NAV = [
  { href: '/',          icon: '◈', label: 'Dashboard'  },
  { href: '/map',       icon: '⊕', label: 'Live Map'   },
  { href: '/voyages',   icon: '⌁', label: 'Voyages'    },
  { href: '/invoices',  icon: '⊞', label: 'Invoices'   },
  { href: '/anomalies', icon: '⚡', label: 'Anomalies'  },
  { href: '/fleet',     icon: '⛵', label: 'Fleet'      },
];

const Sidebar: Component<SidebarProps> = (props) => {
  const location = useLocation();

  return (
    <nav class="sidebar">
      {/* Logo */}
      <div style={{ display:'flex', 'align-items':'center', gap:'10px', padding:'20px 16px 16px', 'border-bottom':'1px solid var(--border)' }}>
        <span style={{ 'font-size':'1.5rem' }}>⚓</span>
        <div>
          <div style={{ 'font-family':'var(--font-display)', 'font-size':'1.1rem', color:'var(--text-primary)' }}>BargeOS</div>
          <div style={{ 'font-size':'0.62rem', color:'var(--text-muted)', 'text-transform':'uppercase', 'letter-spacing':'0.08em' }}>Logistics Platform</div>
        </div>
      </div>

      {/* Nav */}
      <div style={{ flex:'1', 'overflow-y':'auto', padding:'10px 8px', display:'flex', 'flex-direction':'column', gap:'2px' }}>
        {NAV.map((item) => {
          const isActive = () => item.href === '/' ? location.pathname === '/' : location.pathname.startsWith(item.href);
          return (
            <A
              href={item.href}
              style={{
                display: 'flex',
                'align-items': 'center',
                gap: '9px',
                padding: '8px 10px',
                'border-radius': 'var(--radius-md)',
                color: isActive() ? 'var(--accent)' : 'var(--text-secondary)',
                background: isActive() ? 'var(--accent-subtle)' : 'transparent',
                'text-decoration': 'none',
                'font-size': '0.855rem',
                'font-weight': '500',
                transition: 'all var(--transition)',
              }}
            >
              <span style={{ width:'18px', 'text-align':'center', 'font-size':'0.95rem' }}>{item.icon}</span>
              <span>{item.label}</span>
            </A>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{ padding:'10px 8px 14px', 'border-top':'1px solid var(--border)' }}>
        <button
          onClick={props.onThemeToggle}
          style={{ display:'flex', 'align-items':'center', gap:'8px', width:'100%', padding:'7px 10px', background:'transparent', border:'1px solid var(--border)', 'border-radius':'var(--radius-md)', color:'var(--text-secondary)', 'font-size':'0.80rem', cursor:'pointer', 'margin-bottom':'6px' }}
        >
          <span>{props.theme === 'dark' ? '☀' : '◑'}</span>
          <span>{props.theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
        </button>
        <div style={{ 'text-align':'center', 'font-size':'0.65rem', color:'var(--text-muted)', 'letter-spacing':'0.05em' }}>
          v1.0 · inland waterways
        </div>
      </div>
    </nav>
  );
};

export default Sidebar;
