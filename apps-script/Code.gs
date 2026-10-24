/**
 * Poultry Business Manager — Web App entry point and action router.
 *
 * Request (HTTP POST, Content-Type text/plain to avoid a CORS preflight):
 *   { "action": "createBill", "token": "<session>", "requestId": "<uuid>", "payload": { ... } }
 *
 * Response (always HTTP 200; check `success`):
 *   { "success": true,  "data": { ... }, "message": "..." }
 *   { "success": false, "error": { "code": "VALIDATION_ERROR", "message": "...", "field": "weightKg" } }
 *
 * Only actions listed in ROUTES can run. The client can never ask for an
 * arbitrary sheet, range or formula.
 */

function getRoutes() {
  return {
    // public
    healthCheck: { fn: actionHealthCheck, auth: false, msg: 'Service is running' },
    login: { fn: actionLogin, auth: false, msg: 'Signed in' },
    // session
    logout: { fn: actionLogout, msg: 'Signed out' },
    me: { fn: actionMe },
    changePassword: { fn: actionChangePassword, msg: 'Password changed. Please sign in again.' },
    // dashboard
    getDashboard: { fn: actionGetDashboard },
    getDashboardSummary: { fn: actionGetDashboardSummary },
    getDashboardChartData: { fn: actionGetDashboardChartData },
    // customers
    listCustomers: { fn: actionListCustomers },
    getCustomer: { fn: actionGetCustomer },
    createCustomer: { fn: actionCreateCustomer, msg: 'Customer created' },
    updateCustomer: { fn: actionUpdateCustomer, msg: 'Customer updated' },
    archiveCustomer: { fn: actionArchiveCustomer, msg: 'Customer status updated' },
    deleteCustomer: { fn: actionDeleteCustomer, msg: 'Customer deleted' },
    createCustomerSheet: { fn: actionCreateCustomerSheet, msg: 'Customer sheet is ready' },
    // transactions
    listTransactions: { fn: actionListTransactions },
    getTransaction: { fn: actionGetTransaction },
    createBill: { fn: actionCreateBill, msg: 'Bill saved' },
    createPayment: { fn: actionCreatePayment, msg: 'Payment recorded' },
    createAdjustment: { fn: actionCreateAdjustment, msg: 'Adjustment recorded' },
    updateTransaction: { fn: actionUpdateTransaction, msg: 'Transaction updated' },
    voidTransaction: { fn: actionVoidTransaction, msg: 'Transaction voided' },
    // reports (also the data source for PDF/CSV exports)
    getCustomerStatement: { fn: actionGetCustomerStatement },
    getReports: { fn: actionGetReports },
    getOutstandingReport: { fn: actionGetOutstandingReport },
    // settings & admin
    getSettings: { fn: actionGetSettings },
    updateSettings: { fn: actionUpdateSettings, msg: 'Settings saved' },
    getSystemStatus: { fn: actionGetSystemStatus },
    getAuditLog: { fn: actionGetAuditLog },
    listUsers: { fn: actionListUsers },
    createUser: { fn: actionCreateUser, msg: 'User created' },
    updateUser: { fn: actionUpdateUser, msg: 'User updated' }
  };
}

function doGet(e) {
  var action = e && e.parameter && e.parameter.action;
  if (!action || action === 'healthCheck') {
    return jsonOutput(handleRequest(JSON.stringify({ action: 'healthCheck' })));
  }
  return jsonOutput({ success: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Use POST for API actions.' } });
}

function doPost(e) {
  var body = e && e.postData ? e.postData.contents : '';
  return jsonOutput(handleRequest(body));
}

function jsonOutput(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** Parses, authenticates, dispatches and wraps the result. Never throws. */
function handleRequest(rawBody) {
  PBM._memo = {};
  var started = Date.now();
  var actionName = '(unknown)';
  try {
    if (typeof rawBody !== 'string' || !rawBody) fail('BAD_REQUEST', 'Empty request.');
    if (rawBody.length > PBM.LIMITS.MAX_BODY_CHARS) fail('BAD_REQUEST', 'Request is too large.');
    var req;
    try { req = JSON.parse(rawBody); } catch (e) { fail('BAD_REQUEST', 'Request is not valid JSON.'); }
    if (!req || typeof req !== 'object' || Array.isArray(req)) fail('BAD_REQUEST', 'Request must be a JSON object.');

    actionName = String(req.action || '');
    var routes = getRoutes();
    if (!Object.prototype.hasOwnProperty.call(routes, actionName)) fail('UNKNOWN_ACTION', 'Unknown action.');
    var route = routes[actionName];
    var payload = req.payload && typeof req.payload === 'object' && !Array.isArray(req.payload) ? req.payload : {};
    var ctx = { token: req.token, requestId: req.requestId };
    var user = route.auth === false ? null : authenticate(req.token);
    var data = route.fn(payload, user, ctx);
    return { success: true, data: data, message: route.msg || 'OK' };
  } catch (err) {
    if (err instanceof ApiError) {
      var out = { success: false, error: { code: err.code, message: err.message } };
      if (err.details) {
        if (err.details.field) out.error.field = err.details.field;
        out.error.details = err.details;
      }
      if (err.code !== 'VALIDATION_ERROR' && err.code !== 'UNAUTHENTICATED') {
        console.warn('[' + actionName + '] ' + err.code + ': ' + err.message);
      }
      return out;
    }
    var errorId = randomHex(8);
    console.error('[' + actionName + '] INTERNAL ' + errorId + ': ' + (err && err.stack ? err.stack : err));
    var msg = String(err && err.message || '');
    if (/permission|access denied|not have permission|authoriz/i.test(msg)) {
      return { success: false, error: { code: 'PERMISSION_ERROR', message: 'The script does not have permission to use the spreadsheet. The owner should re-authorise the deployment (see README → Troubleshooting).', errorId: errorId } };
    }
    return { success: false, error: { code: 'INTERNAL_ERROR', message: 'Something went wrong on the server. Nothing was changed unless a success message was shown. Reference: ' + errorId, errorId: errorId } };
  } finally {
    var ms = Date.now() - started;
    if (ms > 5000) console.warn('[' + actionName + '] slow request: ' + ms + 'ms');
  }
}

function actionHealthCheck() {
  var status = { status: 'ok', version: PBM.VERSION, serverTime: nowIso(), businessDate: todayStr(), timezone: PBM.TZ };
  try {
    var ss = getSpreadsheet();
    status.spreadsheetReachable = !!ss;
    status.setupComplete = !!ss.getSheetByName(PBM.SHEETS.CLIENTS) && Object.keys(getUsers()).length > 0;
  } catch (e) {
    status.spreadsheetReachable = false;
    status.setupComplete = false;
    status.problem = e && e.message ? e.message : 'Spreadsheet not reachable';
  }
  return status;
}
