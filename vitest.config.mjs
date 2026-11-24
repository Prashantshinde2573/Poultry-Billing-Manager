import path from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = path.dirname(fileURLToPath(import.meta.url));
export default {
  resolve: { alias: { '@': path.resolve(dir, 'src') } },
  test: { include: ['tests/**/*.test.ts'], environment: 'node', testTimeout: 60000, hookTimeout: 120000 },
};
