/**
 * Tiny hash router for the options page: #/setup, #/presets, #/presets/new,
 * #/presets/:id, #/settings, #/help. One global `hashchange` listener runs the
 * navigation guard (unsaved changes) before notifying subscribers.
 */
import { useEffect, useRef, useState } from 'preact/hooks';

export type Route =
  | { name: 'root' }
  | { name: 'setup' }
  | { name: 'presets' }
  | { name: 'preset-new' }
  | { name: 'preset'; id: string }
  | { name: 'settings' }
  | { name: 'help' }
  | { name: 'not-found'; path: string };

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#/, '').replace(/\/+$/, '');
  if (path === '' || path === '/') return { name: 'root' };
  const parts = path.split('/').filter(Boolean);
  const [head, second, ...rest] = parts;
  if (rest.length > 0) return { name: 'not-found', path };
  switch (head) {
    case 'setup':
      return second === undefined ? { name: 'setup' } : { name: 'not-found', path };
    case 'presets':
      if (second === undefined) return { name: 'presets' };
      if (second === 'new') return { name: 'preset-new' };
      return { name: 'preset', id: decodeURIComponent(second) };
    case 'settings':
      return second === undefined ? { name: 'settings' } : { name: 'not-found', path };
    case 'help':
      return second === undefined ? { name: 'help' } : { name: 'not-found', path };
    default:
      return { name: 'not-found', path };
  }
}

/** Returns false to cancel a navigation. */
type Guard = () => boolean;

let guard: Guard | null = null;
let currentHash = typeof location === 'undefined' ? '' : location.hash;
const subscribers = new Set<(hash: string) => void>();
let listening = false;

function onHashChange() {
  const next = location.hash;
  if (next === currentHash) return;
  if (guard && !guard()) {
    // Put the old hash back without triggering another hashchange.
    history.replaceState(history.state, '', currentHash === '' ? location.pathname + location.search : currentHash);
    return;
  }
  currentHash = next;
  for (const cb of subscribers) cb(next);
}

function ensureListening() {
  if (listening) return;
  listening = true;
  window.addEventListener('hashchange', onHashChange);
}

/** Navigate to a path like "/presets/abc". `replace` avoids a history entry (and skips the guard). */
export function navigate(path: string, { replace = false }: { replace?: boolean } = {}) {
  ensureListening();
  const hash = `#${path}`;
  if (hash === location.hash) return;
  if (replace) {
    history.replaceState(history.state, '', hash);
    currentHash = hash;
    for (const cb of subscribers) cb(hash);
    return;
  }
  location.hash = hash;
  // Some environments don't fire hashchange synchronously; handle it here too.
  onHashChange();
}

export function useRoute(): Route {
  ensureListening();
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    currentHash = location.hash;
    setHash(location.hash);
    subscribers.add(setHash);
    return () => {
      subscribers.delete(setHash);
    };
  }, []);
  return parseHash(hash);
}

export const UNSAVED_MESSAGE = 'You have unsaved changes to this preset. Leave without saving?';

/** Asks before leaving (hash navigation or closing the tab) while `dirty` is true. */
export function useUnsavedChangesGuard(dirty: boolean, message = UNSAVED_MESSAGE) {
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  useEffect(() => {
    const myGuard: Guard = () => !dirtyRef.current || window.confirm(message);
    guard = myGuard;
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      e.preventDefault();
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      if (guard === myGuard) guard = null;
      window.removeEventListener('beforeunload', beforeUnload);
    };
  }, [message]);
}

/** Test helper: forget router state between tests. */
export function resetRouterForTests() {
  guard = null;
  subscribers.clear();
  history.replaceState(null, '', location.pathname + location.search);
  currentHash = '';
}
