/**
 * Test harness: runs the real Apps Script backend (apps-script/*.gs) inside a
 * Node VM with in-memory fakes of SpreadsheetApp, Sheets (advanced service),
 * CacheService, PropertiesService, LockService and Utilities.
 *
 * Nothing here touches a real Google account or real business data.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

type Cell = string | number | boolean | Date | '';

export class FakeSheet {
  grid: Cell[][] = [];
  maxRows = 1000;
  formats: Record<string, string> = {};
  constructor(public name: string) {}
  getName() { return this.name; }
  setName(n: string) { this.name = n; return this; }
  getLastRow() {
    for (let r = this.grid.length - 1; r >= 0; r--) {
      if ((this.grid[r] || []).some((v) => v !== '' && v !== null && v !== undefined)) return r + 1;
    }
    return 0;
  }
  getLastColumn() {
    let max = 0;
    this.grid.forEach((row) => {
      for (let c = (row || []).length - 1; c >= 0; c--) {
        if (row[c] !== '' && row[c] !== undefined) { max = Math.max(max, c + 1); break; }
      }
    });
    return max;
  }
  getMaxRows() { return this.maxRows; }
  insertRowsAfter(_after: number, n: number) { this.maxRows += n; }
  setFrozenRows() {}
  getRange(row: number, col: number, nr = 1, nc = 1) {
    if (row < 1 || col < 1 || nr < 1 || nc < 1) throw new Error('Range out of bounds');
    if (row + nr - 1 > this.maxRows) throw new Error('Exception: Those rows are out of bounds.');
    return new FakeRange(this, row, col, nr, nc);
  }
  getDataRange() { return this.getRange(1, 1, Math.max(this.getLastRow(), 1), Math.max(this.getLastColumn(), 1)); }
  appendRow(values: Cell[]) {
    const r = this.getLastRow() + 1;
    if (r > this.maxRows) this.maxRows = r;
    this.getRange(r, 1, 1, values.length).setValues([values]);
  }
  deleteRow(r: number) { this.grid.splice(r - 1, 1); }
  /** test helper: rows as header-keyed objects */
  objects() {
    const [h, ...rows] = this.grid;
    return rows.filter((r) => r && r.some((v) => v !== '')).map((r) => Object.fromEntries((h as string[]).map((k, i) => [k, r[i] ?? ''])));
  }
}

class FakeRange {
  constructor(private s: FakeSheet, private r: number, private c: number, private nr: number, private nc: number) {}
  getValues() {
    const out: Cell[][] = [];
    for (let i = 0; i < this.nr; i++) {
      const row: Cell[] = [];
      for (let j = 0; j < this.nc; j++) {
        const v = (this.s.grid[this.r - 1 + i] || [])[this.c - 1 + j];
        row.push(v === undefined || v === null ? '' : v);
      }
      out.push(row);
    }
    return out;
  }
  setValues(vals: Cell[][]) {
    if (vals.length !== this.nr || vals.some((r) => r.length !== this.nc)) throw new Error('Incorrect range dimensions');
    vals.forEach((row, i) => {
      const rr = this.r - 1 + i;
      while (this.s.grid.length <= rr) this.s.grid.push([]);
      row.forEach((v, j) => {
        let val: Cell = v;
        // Google Sheets strips a leading apostrophe and stores the rest as text.
        if (typeof val === 'string' && val.startsWith("'")) val = val.substring(1);
        else if (typeof val === 'string' && val.startsWith('=')) val = `#FORMULA(${val})`;
        this.s.grid[rr][this.c - 1 + j] = val;
      });
    });
    for (const row of this.s.grid) for (let k = 0; k < row.length; k++) if (row[k] === undefined) row[k] = '';
    return this;
  }
  setNumberFormats() { return this; }
  setNumberFormat() { return this; }
  setFontWeight() { return this; }
}

export class FakeSpreadsheet {
  sheets: FakeSheet[] = [];
  constructor(public id = 'TEST_SPREADSHEET_ID_123456') {}
  getId() { return this.id; }
  getName() { return 'Test Poultry Books'; }
  getUrl() { return 'https://docs.google.com/spreadsheets/d/' + this.id; }
  getSheets() { return this.sheets; }
  getSheetByName(n: string) { return this.sheets.find((s) => s.name === n) || null; }
  insertSheet(n: string) {
    if (this.getSheetByName(n)) throw new Error(`A sheet with the name "${n}" already exists.`);
    if (n.length > 100 || /[\[\]\*\?\/\\:]/.test(n)) throw new Error('Invalid sheet name');
    const s = new FakeSheet(n);
    this.sheets.push(s);
    return s;
  }
  deleteSheet(s: FakeSheet) { this.sheets = this.sheets.filter((x) => x !== s); }
}

export interface Backend {
  call: (action: string, payload?: Record<string, unknown>, opts?: { token?: string | null; requestId?: string }) => any;
  ss: FakeSpreadsheet;
  props: Map<string, string>;
  ctx: any;
  login: (u: string, p: string) => string;
}

export function createBackend(options: { advancedSheets?: boolean; spreadsheetId?: string } = {}): Backend {
  const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../apps-script');
  const code = readdirSync(dir).filter((f) => f.endsWith('.gs')).sort().map((f) => readFileSync(path.join(dir, f), 'utf8')).join('\n;\n');

  const ss = new FakeSpreadsheet();
  const props = new Map<string, string>();
  props.set('SPREADSHEET_ID', options.spreadsheetId ?? ss.id);
  const cache = new Map<string, { v: string; exp: number }>();

  const ctx: any = {
    console: { log() {}, warn() {}, error() {}, info() {} },
    Date, // host Date so vi.setSystemTime controls "today"
    SpreadsheetApp: {
      openById(id: string) {
        if (id !== ss.id) throw new Error('Exception: You do not have permission to access the requested document.');
        return ss;
      },
      getActiveSpreadsheet() { return null; },
      flush() {},
    },
    PropertiesService: {
      getScriptProperties() {
        return {
          getProperty: (k: string) => (props.has(k) ? props.get(k)! : null),
          setProperty: (k: string, v: string) => { props.set(k, String(v)); },
          deleteProperty: (k: string) => { props.delete(k); },
          getProperties: () => Object.fromEntries(props),
        };
      },
    },
    CacheService: {
      getScriptCache() {
        const get = (k: string) => {
          const e = cache.get(k);
          if (!e) return null;
          if (e.exp < Date.now()) { cache.delete(k); return null; }
          return e.v;
        };
        return {
          get,
          put: (k: string, v: string, ttl = 600) => { cache.set(k, { v, exp: Date.now() + ttl * 1000 }); },
          remove: (k: string) => { cache.delete(k); },
          getAll: (keys: string[]) => Object.fromEntries(keys.map((k) => [k, get(k)]).filter(([, v]) => v !== null)),
          putAll: (m: Record<string, string>, ttl = 600) => { Object.entries(m).forEach(([k, v]) => cache.set(k, { v, exp: Date.now() + ttl * 1000 })); },
        };
      },
    },
    LockService: { getScriptLock: () => ({ tryLock: () => true, waitLock() {}, releaseLock() {} }) },
    ContentService: {
      MimeType: { JSON: 'json' },
      createTextOutput: (s: string) => ({ s, setMimeType() { return this; }, getContent() { return s; } }),
    },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256' },
      Charset: { UTF_8: 'utf8' },
      getUuid: () => randomUUID(),
      computeDigest: (_alg: string, text: string) => Array.from(createHash('sha256').update(text, 'utf8').digest()).map((b) => (b > 127 ? b - 256 : b)),
      formatDate: (d: Date, tz: string, fmt: string) => {
        if (fmt !== 'yyyy-MM-dd') throw new Error('fake formatDate only supports yyyy-MM-dd');
        return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
      },
    },
  };
  if (options.advancedSheets) {
    ctx.Sheets = {
      Spreadsheets: {
        Values: {
          batchGet(id: string, req: { ranges: string[] }) {
            if (id !== ss.id) throw new Error('not found');
            return {
              valueRanges: req.ranges.map((r) => {
                const m = /^'(.*)'!A1:Z$/.exec(r);
                const name = m ? m[1].replace(/''/g, "'") : '';
                const sh = ss.getSheetByName(name);
                if (!sh) throw new Error('Unable to parse range: ' + r);
                const rows = sh.grid.slice(0, sh.getLastRow()).map((row) => {
                  const copy = [...row];
                  while (copy.length && copy[copy.length - 1] === '') copy.pop();
                  return copy;
                });
                return { range: r, values: rows };
              }),
            };
          },
        },
      },
    };
  }
  vm.createContext(ctx);
  vm.runInContext(code, ctx, { filename: 'apps-script-bundle.js' });

  let reqCounter = 0;
  const backend: Backend = {
    ss, props, ctx,
    call(action, payload = {}, opts = {}) {
      // Advance the (fake) clock 1 ms per request so createdAt values are ordered like real life.
      try { (globalThis as any).__vi_advance?.(); } catch { /* ignore */ }
      const body = JSON.stringify({
        action,
        token: opts.token === undefined ? (backend as any).token : opts.token,
        requestId: opts.requestId ?? `req-${Date.now()}-${++reqCounter}-${Math.random().toString(36).slice(2, 8)}`,
        payload,
      });
      return JSON.parse(JSON.stringify(ctx.handleRequest(body)));
    },
    login(u, p) {
      const r = backend.call('login', { username: u, password: p }, { token: null });
      if (!r.success) throw new Error('login failed: ' + JSON.stringify(r));
      return r.data.token;
    },
  };
  return backend;
}

/** Creates a backend with setup() run and an owner signed in. */
export function bootstrap(options: { advancedSheets?: boolean } = {}) {
  const b = createBackend(options);
  b.props.set('BOOTSTRAP_USERNAME', 'owner');
  b.props.set('BOOTSTRAP_PASSWORD', 'Owner#Pass123');
  b.ctx.setup();
  (b as any).token = b.login('owner', 'Owner#Pass123');
  return b;
}

export function ok<T = any>(res: any): T {
  if (!res.success) throw new Error('Expected success, got ' + JSON.stringify(res.error));
  return res.data as T;
}
