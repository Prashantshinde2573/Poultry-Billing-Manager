/**
 * LOCAL DEVELOPMENT BACKEND — not for real data.
 *
 * Runs the real apps-script/*.gs code in Node against an EMPTY in-memory
 * spreadsheet so the UI can be tried without a Google account. Everything is
 * lost when the process stops. Nothing is pre-filled: you start with zero
 * customers, exactly like a new spreadsheet.
 *
 *   npm run dev:local-backend          (terminal 1, port 8787)
 *   VITE_API_URL=http://localhost:8787 npm run dev   (terminal 2)
 *
 * Login: username "owner", password from LOCAL_OWNER_PASSWORD (default "localdev123").
 */
import http from 'node:http';
import { bootstrap } from './backend/harness';

const port = Number(process.env.PORT || 8787);
const password = process.env.LOCAL_OWNER_PASSWORD || 'localdev123';
const backend = (() => {
  const b = bootstrap({ advancedSheets: true });
  b.props.set('BOOTSTRAP_USERNAME', 'owner');
  b.props.set('BOOTSTRAP_PASSWORD', password);
  b.ctx.resetOwnerPassword();
  return b;
})();

http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Headers': 'Content-Type' }); res.end(); return; }
  if (req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(backend.ctx.handleRequest(JSON.stringify({ action: 'healthCheck' }))));
    return;
  }
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    const out = backend.ctx.handleRequest(body);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(out));
  });
}).listen(port, () => {
  console.log(`Local test backend on http://localhost:${port} (in-memory, data is discarded on exit)`);
  console.log(`Sign in with owner / ${password === 'localdev123' ? 'localdev123' : '(LOCAL_OWNER_PASSWORD)'}`);
});
