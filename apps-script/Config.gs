/**
 * Poultry Business Manager — backend configuration constants.
 *
 * Apps Script loads every .gs file into one global scope. Only `var PBM` is
 * defined at load time; every other file reads it inside functions, so the
 * order in which files load does not matter.
 */
var PBM = {
  VERSION: '1.0.0',
  TZ: 'Asia/Kolkata',
  MIN_DATE: '2000-01-01',

  SHEETS: {
    SETTINGS: 'Settings',
    CLIENTS: 'Clients',
    AUDIT: 'AuditLog',
    DASHBOARD: 'Dashboard'
  },

  CLIENT_HEADERS: [
    'customerId', 'customerName', 'phone', 'address', 'notes', 'createdAt',
    'status', 'openingBalance', 'sheetName', 'updatedAt', 'version',
    'requestId', 'createdBy'
  ],

  // Number formats per Clients column ('@' = plain text, so Sheets never
  // auto-converts phone numbers, dates or IDs).
  CLIENT_FORMATS: {
    openingBalance: '0.00',
    version: '0'
  },

  TXN_HEADERS: [
    'transactionId', 'transactionDate', 'transactionType', 'birdCount',
    'weightKg', 'ratePerKg', 'billAmount', 'paymentAmount', 'paymentMethod',
    'referenceNumber', 'notes', 'createdAt', 'updatedAt', 'createdBy',
    'status', 'version', 'requestId', 'updatedBy', 'voidedAt', 'voidedBy',
    'voidReason'
  ],

  TXN_FORMATS: {
    birdCount: '0',
    weightKg: '0.000',
    ratePerKg: '0.00',
    billAmount: '0.00',
    paymentAmount: '0.00',
    version: '0'
  },

  AUDIT_HEADERS: ['timestamp', 'user', 'action', 'customerId', 'transactionId', 'summary'],
  SETTINGS_HEADERS: ['key', 'value', 'updatedAt', 'updatedBy'],

  TXN_TYPES: ['BILL', 'PAYMENT', 'ADJUSTMENT'],
  PAYMENT_METHODS: ['CASH', 'BANK_TRANSFER', 'UPI', 'OTHER'],
  CUSTOMER_STATUS: ['ACTIVE', 'INACTIVE'],
  ROLES: ['OWNER', 'STAFF'],
  PERIODS: ['DAY', 'WEEK', 'MONTH', 'QUARTER', 'HALF_YEAR', 'YEAR', 'CUSTOM'],

  LIMITS: {
    MAX_BIRDS: 1000000,
    MAX_WEIGHT_GRAMS: 1000000000,   // 10,00,000 kg
    MAX_RATE_PAISE: 10000000,        // ₹1,00,000 per kg
    MAX_AMOUNT_PAISE: 100000000000,  // ₹100 crore
    MAX_BODY_CHARS: 200000,
    MAX_NOTES: 500,
    MAX_ADDRESS: 200,
    MAX_NAME: 80,
    MAX_REF: 60
  },

  SESSION_TTL_SECONDS: 21600,        // 6 hours (CacheService maximum)
  SESSION_RENEW_BELOW_SECONDS: 10800,
  LOGIN_MAX_FAILURES: 5,
  LOGIN_LOCK_SECONDS: 900,
  PASSWORD_ITERATIONS: 2000,
  DATASET_CACHE_SECONDS: 300,
  LOCK_WAIT_MS: 20000,

  PROP: {
    SPREADSHEET_ID: 'SPREADSHEET_ID',
    USERS: 'PBM_USERS',
    PEPPER: 'PBM_PEPPER',
    NEXT_CUSTOMER: 'PBM_NEXT_CUSTOMER_NO',
    DATA_VERSION: 'PBM_DATA_VERSION',
    BOOTSTRAP_USERNAME: 'BOOTSTRAP_USERNAME',
    BOOTSTRAP_PASSWORD: 'BOOTSTRAP_PASSWORD'
  },

  // Per-execution memo (Apps Script resets globals on every request).
  _memo: {}
};
