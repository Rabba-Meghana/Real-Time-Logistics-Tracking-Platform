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
    <nav class="sidebar" style={sidebarStyle}>
      <div style={logoWrap}>
        <span style={logoIcon}>⚓</span>
        <div>
          <div style={logoTitle}>BargeOS</div>
          <div style={logoSub}>Logistics Platform</div>
        </div>
      </div>

      <div style={navSection}>
        {NAV.map((item) => {
          const active = () =>
            item.href === '/'
              ? location.pathname === '/'
              : location.pathname.startsWith(item.href);
          return (
            <A
              href={item.href}
              style={{
                ...navItem,
                ...(active() ? navItemActive : {}),
              }}
            >
              <span style={navIcon}>{item.icon}</span>
              <span>{item.label}</span>
              {active() && <span style={activeDot} />}
            </A>
          );
        })}
      </div>

      <div style={sidebarFooter}>
        <button
          onClick={props.onThemeToggle}
          style={themeBtn}
          aria-label="Toggle theme"
        >
          <span>{props.theme === 'dark' ? '☀' : '◑'}</span>
          <span>{props.theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
        </button>
        <div style={versionTag}>v1.0 · inland waterways</div>
      </div>
    </nav>
  );
};

const sidebarStyle: Record<string, string> = {
  position: 'fixed',
  left: '0', top: '0', bottom: '0',
  width: 'var(--sidebar-width)',
  background: 'var(--bg-card)',
  borderRight: '1px solid var(--border)',
  display: 'flex',
  flexDirection: 'column',
  zIndex: '50',
  boxShadow: 'var(--shadow-sm)',
};
const logoWrap: Record<string, string> = {
  display: 'flex', alignItems: 'center', gap: '12px',
  padding: '22px 20px 18px',
  borderBottom: '1px solid var(--border)',
};
const logoIcon: Record<string, string> = {
  fontSize: '1.6rem', lineHeight: '1',
  filter: 'drop-shadow(0 1px 2px rgba(217,119,6,0.4))',
};
const logoTitle: Record<string, string> = {
  fontFamily: 'var(--font-display)', fontSize: '1.15rem',
  color: 'var(--text-primary)', lineHeight: '1.2',
};
const logoSub: Record<string, string> = {
  fontSize: '0.68rem', color: 'var(--text-muted)',
  textTransform: 'uppercase', letterSpacing: '0.08em',
};
const navSection: Record<string, string> = {
  flex: '1', overflowY: 'auto', padding: '12px 10px',
  display: 'flex', flexDirection: 'column', gap: '2px',
};
const navItem: Record<string, string> = {
  display: 'flex', alignItems: 'center', gap: '10px',
  padding: '9px 12px', borderRadius: 'var(--radius-md)',
  color: 'var(--text-secondary)', textDecoration: 'none',
  fontSize: '0.875rem', fontWeight: '500',
  transition: 'all var(--transition)',
  position: 'relative',
};
const navItemActive: Record<string, string> = {
  background: 'var(--accent-subtle)',
  color: 'var(--accent)',
};
const navIcon: Record<string, string> = {
  fontSize: '1rem', width: '20px', textAlign: 'center',
};
const activeDot: Record<string, string> = {
  position: 'absolute', right: '10px', top: '50%',
  transform: 'translateY(-50%)',
  width: '5px', height: '5px', borderRadius: '50%',
  background: 'var(--accent)',
};
const sidebarFooter: Record<string, string> = {
  padding: '12px 10px 16px',
  borderTop: '1px solid var(--border)',
};
const themeBtn: Record<string, string> = {
  display: 'flex', alignItems: 'center', gap: '8px',
  width: '100%', padding: '8px 12px',
  background: 'transparent', border: '1px solid var(--border)',
  borderRadius: 'var(--radius-md)', color: 'var(--text-secondary)',
  fontSize: '0.82rem', cursor: 'pointer',
  transition: 'all var(--transition)',
  marginBottom: '8px',
};
const versionTag: Record<string, string> = {
  textAlign: 'center', fontSize: '0.68rem',
  color: 'var(--text-muted)', letterSpacing: '0.05em',
};

export default Sidebar;
