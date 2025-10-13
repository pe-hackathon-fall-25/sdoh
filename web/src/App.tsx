import { useEffect, useMemo, useState } from 'react';
import Member from './pages/Member';
import ScenariosDashboard from './pages/ScenariosDashboard';
import CallsDashboard from './pages/CallsDashboard';

function navigate(path: string) {
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

function usePathname() {
  const [path, setPath] = useState(() => window.location.pathname);

  useEffect(() => {
    const handler = () => setPath(window.location.pathname);
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, []);

  return path;
}

export default function App() {
  const path = usePathname();
  const content = useMemo(() => {
    if (path.startsWith('/scenarios')) {
      return <ScenariosDashboard />;
    }
    if (path.startsWith('/calls')) {
      return <CallsDashboard />;
    }
    return <Member />;
  }, [path]);

  const navItems = [
    { path: '/', label: 'Member 360' },
    { path: '/scenarios', label: 'AI Scenarios' },
    { path: '/calls', label: 'Calls' },
  ];

  return (
    <div className="app-shell">
      <header className="top-nav">
        <div className="top-nav__brand">SDOH Bridge</div>
        <nav className="top-nav__links">
          {navItems.map((item) => {
            const isActive = item.path === '/' ? path === '/' : path.startsWith(item.path);
            return (
              <button
                key={item.path}
                type="button"
                className={`top-nav__link${isActive ? ' top-nav__link--active' : ''}`}
                onClick={() => navigate(item.path)}
              >
                {item.label}
              </button>
            );
          })}
        </nav>
      </header>
      <main className="route-container">{content}</main>
    </div>
  );
}
