import { useSyncExternalStore } from 'react';

export type Route =
  | { name: 'home' }
  | { name: 'room'; code: string }
  | { name: 'nebula' }
  | { name: 'world'; id: string }
  | { name: 'notFound' };

export function parse(path: string): Route {
  if (path === '/' || path === '') return { name: 'home' };
  const room = path.match(/^\/r\/([A-Za-z0-9]{4,6})\/?$/);
  if (room) return { name: 'room', code: room[1]!.toUpperCase() };
  if (/^\/nebula\/?$/.test(path)) return { name: 'nebula' };
  const world = path.match(/^\/w\/([\w-]+)\/?$/);
  if (world) return { name: 'world', id: world[1]! };
  return { name: 'notFound' };
}

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
window.addEventListener('popstate', notify);

export function navigate(path: string, opts: { replace?: boolean } = {}) {
  if (opts.replace) history.replaceState(null, '', path);
  else history.pushState(null, '', path);
  window.scrollTo(0, 0);
  notify();
}

export function useRoute(): Route {
  const path = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => location.pathname,
  );
  return parse(path);
}
