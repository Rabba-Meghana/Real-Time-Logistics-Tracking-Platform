import { createSignal, onMount } from 'solid-js';
import { Router, Route } from '@solidjs/router';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import LiveMap from './pages/LiveMap';
import Voyages from './pages/Voyages';
import Invoices from './pages/Invoices';
import { Fleet } from './pages/Anomalies';
import './styles/global.css';

const savedTheme = (typeof localStorage !== 'undefined' && localStorage.getItem('theme') as 'light' | 'dark') || 'light';
if (savedTheme === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
const [theme, setTheme] = createSignal<'light' | 'dark'>(savedTheme);

const toggleTheme = () => {
  const next = theme() === 'light' ? 'dark' : 'light';
  setTheme(next);
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
};

const Layout = (props: { children?: any }) => {
  onMount(() => {
    const saved = localStorage.getItem('theme') as 'light' | 'dark' | null;
    if (saved) {
      setTheme(saved);
      document.documentElement.setAttribute('data-theme', saved);
    }
  });
  return (
    <div class="app-layout">
      <Sidebar theme={theme()} onThemeToggle={toggleTheme} />
      <div class="main-content">
        {props.children}
      </div>
    </div>
  );
};

const App = () => (
  <Router root={Layout}>
    <Route path="/" component={Dashboard} />
    <Route path="/map" component={LiveMap} />
    <Route path="/voyages" component={Voyages} />
    <Route path="/invoices" component={Invoices} />
    <Route path="/fleet" component={Fleet} />
  </Router>
);

export default App;
