import type {
  AppUser, AuditEntry, Customer, CustomerDetail, CustomerStatement, Dashboard, HealthStatus, LoginResult,
  OutstandingReport, PaymentMethod, PeriodKey, Report, ReportType, SessionUser, Settings, SystemStatus,
  TransactionList, Transaction, TransactionType, WriteResult,
} from '@/types/api';
import { apiCall } from './client';
import { notifyDataChanged } from './events';

/** Typed wrappers for every backend action. Writes notify listeners so screens refresh. */

export interface PeriodParams {
  period: PeriodKey;
  start?: string;
  end?: string;
  fresh?: boolean;
}

async function write<T>(action: string, payload: unknown, requestId?: string): Promise<T> {
  const data = await apiCall<T>(action, payload, { requestId });
  notifyDataChanged();
  return data;
}

export const api = {
  healthCheck: () => apiCall<HealthStatus>('healthCheck', {}, { timeoutMs: 20000 }),
  login: (username: string, password: string) => apiCall<LoginResult>('login', { username, password }),
  logout: () => apiCall<{ loggedOut: boolean }>('logout'),
  me: () => apiCall<SessionUser>('me'),
  changePassword: (currentPassword: string, newPassword: string) =>
    apiCall<{ changed: boolean }>('changePassword', { currentPassword, newPassword }),

  getDashboard: (p: PeriodParams) => apiCall<Dashboard>('getDashboard', p),

  listCustomers: (p: { status?: 'ALL' | 'ACTIVE' | 'INACTIVE'; search?: string; fresh?: boolean } = {}) =>
    apiCall<{ customers: Customer[]; missingSheets: string[]; loadedAt: string }>('listCustomers', p),
  getCustomer: (customerId: string, fresh = false) => apiCall<CustomerDetail>('getCustomer', { customerId, fresh }),
  createCustomer: (
    p: { customerName: string; phone: string; address?: string; notes?: string; openingBalance?: string; allowDuplicate?: boolean },
    requestId: string,
  ) => write<{ customer: Customer; duplicateRequest: boolean }>('createCustomer', p, requestId),
  updateCustomer: (p: {
    customerId: string; expectedVersion: number; customerName?: string; phone?: string; address?: string;
    notes?: string; openingBalance?: string; allowDuplicate?: boolean;
  }) => write<{ customer: Customer }>('updateCustomer', p),
  archiveCustomer: (customerId: string, status: 'ACTIVE' | 'INACTIVE') =>
    write<{ customer: Customer }>('archiveCustomer', { customerId, status }),
  deleteCustomer: (customerId: string, confirmName: string) =>
    write<{ deleted: boolean }>('deleteCustomer', { customerId, confirmName }),
  createCustomerSheet: (customerId: string) =>
    write<{ sheetName: string; created: boolean }>('createCustomerSheet', { customerId }),

  listTransactions: (p: PeriodParams & {
    customerId?: string; transactionType?: TransactionType | ''; paymentMethod?: PaymentMethod | '';
    includeVoid?: boolean; limit?: number; offset?: number;
  }) => apiCall<TransactionList>('listTransactions', p),
  createBill: (
    p: { customerId: string; transactionDate: string; birdCount: string; weightKg: string; ratePerKg: string; notes?: string },
    requestId: string,
  ) => write<WriteResult>('createBill', p, requestId),
  createPayment: (
    p: {
      customerId: string; transactionDate: string; amount: string; paymentMethod: PaymentMethod;
      referenceNumber?: string; notes?: string; confirmOverpayment?: boolean;
    },
    requestId: string,
  ) => write<WriteResult>('createPayment', p, requestId),
  createAdjustment: (
    p: { customerId: string; transactionDate: string; direction: 'DEBIT' | 'CREDIT'; amount: string; notes: string },
    requestId: string,
  ) => write<WriteResult>('createAdjustment', p, requestId),
  updateTransaction: (p: Record<string, unknown> & { customerId: string; transactionId: string; expectedVersion: number }) =>
    write<{ transaction: Transaction; customerBalance: number }>('updateTransaction', p),
  voidTransaction: (p: { customerId: string; transactionId: string; expectedVersion: number; reason: string }) =>
    write<{ transaction: Transaction; customerBalance: number }>('voidTransaction', p),

  getCustomerStatement: (customerId: string, p: PeriodParams) =>
    apiCall<CustomerStatement>('getCustomerStatement', { customerId, ...p }),
  getReports: (p: PeriodParams & { reportType: ReportType; customerId?: string; transactionType?: string; paymentMethod?: string }) =>
    apiCall<Report>('getReports', p),
  getOutstandingReport: (p: { asOf?: string; includeZero?: boolean; fresh?: boolean }) =>
    apiCall<OutstandingReport>('getOutstandingReport', p),

  getSettings: () => apiCall<Settings>('getSettings'),
  updateSettings: (p: Partial<Settings>) => write<Settings>('updateSettings', p),
  getSystemStatus: () => apiCall<SystemStatus>('getSystemStatus'),
  getAuditLog: (limit = 100) => apiCall<{ rows: AuditEntry[] }>('getAuditLog', { limit }),
  listUsers: () => apiCall<AppUser[]>('listUsers'),
  createUser: (p: { username: string; password: string; role: 'OWNER' | 'STAFF'; displayName?: string }) =>
    apiCall<AppUser>('createUser', p),
  updateUser: (p: { username: string; displayName?: string; role?: 'OWNER' | 'STAFF'; active?: boolean; newPassword?: string }) =>
    apiCall<AppUser>('updateUser', p),
};
