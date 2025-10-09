import { useEffect, useState } from 'react';
import Member from './pages/Member';
import ScenariosDashboard from './pages/ScenariosDashboard';
import CallsDashboard from './pages/CallsDashboard';

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

  function navigate(target: string) {
    if (target === path) return;
    window.history.pushState({}, '', target);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }

  const navItems = [
    { label: 'Member 360', path: '/' },
    { label: 'Care Calls', path: '/calls' },
    { label: 'AI Scenarios', path: '/scenarios' },
  ];

  let page: JSX.Element = <Member />;
  if (path.startsWith('/calls')) {
    page = <CallsDashboard />;
  } else if (path.startsWith('/scenarios')) {
    page = <ScenariosDashboard />;
  }

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="app-header__brand">
          <span className="app-header__logo">SDOH Bridge</span>
          <span className="app-header__subtitle">Care Coordination Ops</span>
        </div>
        <nav className="app-nav">
          {navItems.map((item) => (
            <button
              key={item.path}
              type="button"
              className={`app-nav__item${path === item.path || path.startsWith(item.path) ? ' app-nav__item--active' : ''}`}
              onClick={() => navigate(item.path)}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </header>
      <main className="app-main">{page}</main>
    </div>
  );
}
