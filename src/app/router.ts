import { useEffect, useState } from 'preact/hooks';

export interface Route {
  path: string;
  segments: string[];
  query: URLSearchParams;
}

export function readRoute(hash: string = typeof location === 'undefined' ? '' : location.hash): Route {
  const raw = hash.replace(/^#/, '');
  const [pathPart = '', queryPart = ''] = raw.split('?');
  const path = pathPart === '' ? '/' : pathPart;
  return {
    path,
    segments: path.split('/').filter(Boolean),
    query: new URLSearchParams(queryPart),
  };
}

export function navigate(path: string): void {
  if (typeof location === 'undefined') return;
  const target = path.startsWith('#') ? path : `#${path}`;
  if (location.hash === target) return;
  location.hash = target;
  if (typeof window !== 'undefined') window.scrollTo(0, 0);
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => readRoute());

  useEffect(() => {
    const onChange = () => setRoute(readRoute());
    window.addEventListener('hashchange', onChange);
    if (typeof location !== 'undefined' && location.hash === '') navigate('/');
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  return route;
}

export function isActive(route: Route, path: string): boolean {
  if (path === '/') return route.path === '/';
  return route.path === path || route.path.startsWith(`${path}/`);
}
