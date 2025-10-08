import { useEffect, useState } from 'react';
import Member from './pages/Member';
import ScenariosDashboard from './pages/ScenariosDashboard';

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

  if (path.startsWith('/scenarios')) {
    return <ScenariosDashboard />;
  }

  return <Member />;
}
