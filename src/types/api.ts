/** Types mirroring the Apps Script API contract (see apps-script/Code.gs). */

export type Role = 'OWNER' | 'STAFF';
export type TransactionType = 'BILL' | 'PAYMENT' | 'ADJUSTMENT';
export type PaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'UPI' | 'OTHER';
export type CustomerStatus = 'ACTIVE' | 'INACTIVE';
export type PeriodKey = 'DAY' | 'WEEK' | 'MONTH' | 'QUARTER' | 'HALF_YEAR' | 'YEAR' | 'CUSTOM';

export interface ApiSuccess<T> {
  success: true;
  data: T;
  message: string;
}

export interface ApiErrorBody {
  code: string;
  message: string;
  field?: string;
  details?: Record<string, unknown>;
  errorId?: string;
}

export interface ApiFailure {
  success: false;
  error: ApiErrorBody;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export interface SessionUser {
  username: string;
  displayName: string;
  role: Role;
}

export interface LoginResult {
  token: string;
  expiresAt: number;
  user: SessionUser;
}

export interface HealthStatus {
  status: string;
  version: string;
  serverTime: string;
  businessDate: string;
  timezone: string;
  spreadsheetReachable: boolean;
  setupComplete: boolean;
  problem?: string;
}

export interface DateRange {
  period: PeriodKey;
  start: string;
  end: string;
  label: string;
  days: number;
  granularity: 'day' | 'month';
  today: string;
  isHistorical: boolean;
}

export interface CustomerSummary {
  openingBalance: number;
  totalBilling: number;
  totalPayments: number;
  totalAdjustmentsDebit: number;
  totalAdjustmentsCredit: number;
  balance: number;
  birds: number;
  weightKg: number;
  billCount: number;
  paymentCount: number;
  adjustmentCount: number;
  transactionCount: number;
  lastTransactionDate: string;
  lastPaymentDate: string;
}

export interface Customer {
  customerId: string;
  customerName: string;
  phone: string;
  address: string;
  notes: string;
  createdAt: string;
  status: CustomerStatus;
  openingBalance: number;
  sheetName: string;
  updatedAt: string;
  version: number;
  summary?: CustomerSummary;
}

export interface Transaction {
  transactionId: string;
  customerId: string;
  customerName?: string;
  transactionDate: string;
  transactionType: TransactionType;
  birdCount: number | null;
  weightKg: number | null;
  ratePerKg: number | null;
  billAmount: number;
  paymentAmount: number;
  amount: number;
  direction: 'DEBIT' | 'CREDIT';
  paymentMethod: PaymentMethod | null;
  referenceNumber: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
  status: 'ACTIVE' | 'VOID';
  version: number;
  voidedAt: string;
  voidedBy: string;
  voidReason: string;
  runningBalance?: number;
}

export interface CustomerDetail extends Customer {
  summary: CustomerSummary;
  sheetMissing: boolean;
  unidentifiedRows: number;
  transactions?: Transaction[];
}

export interface ActivityTotals {
  billing: number;
  payments: number;
  adjustmentsDebit: number;
  adjustmentsCredit: number;
  netChange: number;
  billCount: number;
  paymentCount: number;
  adjustmentCount: number;
  voidCount: number;
  birds: number;
  weightKg: number;
  avgRatePerKg: number;
}

export interface DashboardTotals extends ActivityTotals {
  activeCustomers: number;
  totalCustomers: number;
  customersWithActivity: number;
  outstanding: number;
  advances: number;
  netOutstanding: number;
  customersWithOutstanding: number;
  closingOutstanding: number;
  closingNetOutstanding: number;
}

export interface ChartPoint {
  key: string;
  start: string;
  end: string;
  billing: number;
  payments: number;
  weightKg: number;
  birds: number;
}

export interface Dashboard {
  range: DateRange;
  totals: DashboardTotals;
  chart: ChartPoint[];
  topCustomersByBilling: { customerId: string; customerName: string; billing: number; weightKg: number; birds: number }[];
  topOutstanding: { customerId: string; customerName: string; phone: string; balance: number; status: CustomerStatus }[];
  recentTransactions: Transaction[];
  missingSheets: string[];
  loadedAt: string;
}

export interface WriteResult {
  transaction: Transaction;
  customerBalance: number;
  duplicateRequest?: boolean;
}

export interface StatementRow {
  transaction: Transaction;
  debit: number;
  credit: number;
  runningBalance: number;
}

export interface CustomerStatement {
  customer: Customer;
  range: DateRange;
  openingBalance: number;
  closingBalance: number;
  currentBalance: number;
  totals: ActivityTotals;
  rows: StatementRow[];
  generatedAt: string;
}

export type ReportType = 'SUMMARY' | 'PAYMENTS' | 'BILLING';

export interface ReportCustomerRow {
  customerId: string;
  customerName: string;
  phone: string;
  status: CustomerStatus;
  billing: number;
  payments: number;
  adjustmentsDebit: number;
  adjustmentsCredit: number;
  birds: number;
  weightKg: number;
  billCount: number;
  paymentCount: number;
  openingBalance: number;
  closingBalance: number;
  currentBalance: number;
}

export interface Report {
  reportType: ReportType;
  range: DateRange;
  filters: { customerId: string; transactionType: string; paymentMethod: string };
  totals: ActivityTotals & {
    currentOutstanding: number;
    currentNetOutstanding: number;
    closingOutstanding: number;
    closingNetOutstanding: number;
  };
  paymentsByMethod: { paymentMethod: PaymentMethod; amount: number }[];
  rows: Transaction[];
  byCustomer: ReportCustomerRow[];
  generatedAt: string;
}

export interface OutstandingReport {
  asOf: string;
  isHistorical: boolean;
  totals: { receivable: number; advances: number; net: number; customersWithOutstanding: number; customersWithAdvance: number };
  rows: {
    customerId: string;
    customerName: string;
    phone: string;
    status: CustomerStatus;
    balance: number;
    lastBillDate: string;
    lastPaymentDate: string;
    daysSinceLastPayment: number | null;
  }[];
  generatedAt: string;
}

export interface TransactionList {
  range: DateRange;
  total: number;
  totals: ActivityTotals;
  rows: Transaction[];
}

export interface Settings {
  businessName: string;
  businessPhone: string;
  businessEmail: string;
  businessAddress: string;
  gstin: string;
  defaultRatePerKg: number | '';
  allowZeroRate: boolean;
  allowAdvancePayments: boolean;
  reportFooter: string;
  statementNote: string;
  logoDataUrl: string;
  currency: 'INR';
  timezone: string;
}

export interface SystemStatus {
  version: string;
  spreadsheetName: string;
  spreadsheetIdMasked: string;
  spreadsheetUrl: string;
  sheetCount: number;
  customerCount: number;
  advancedSheetsService: boolean;
  timezone: string;
  serverTime: string;
  businessDate: string;
  dataVersion: string;
}

export interface AppUser {
  username: string;
  displayName: string;
  role: Role;
  active: boolean;
  createdAt: string;
  passwordChangedAt: string;
}

export interface AuditEntry {
  timestamp: string;
  user: string;
  action: string;
  customerId: string;
  transactionId: string;
  summary: string;
}
