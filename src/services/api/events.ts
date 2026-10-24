/** Tiny pub/sub so every screen reloads after any successful write. */
type Listener = (version: number) => void;
const listeners = new Set<Listener>();
let version = 0;

export function notifyDataChanged() {
  version += 1;
  listeners.forEach((fn) => fn(version));
}

export function onDataChanged(fn: Listener) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function getDataVersion() {
  return version;
}
