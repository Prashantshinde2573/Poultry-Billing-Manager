// Separate from vite.config.ts because Vitest bundles its own Vite version.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));

export default {
  resolve: { alias: { '@': path.resolve(dir, 'src') } },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
};
