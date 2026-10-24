/**
 * Authentication and authorisation.
 *
 * Why app-level login: a frontend hosted on Netlify cannot call an Apps
 * Script Web App restricted to "Anyone with a Google account" (Google's login
 * redirect breaks cross-origin fetch). The Web App is therefore deployed with
 * access "Anyone" and EVERY action except healthCheck/login requires a valid
 * session token. The URL itself is not treated as a secret.
 *
 * - Users live in Script Properties (never in the spreadsheet), with salted,
 *   peppered, iterated SHA-256 password hashes. Plain passwords are never
 *   stored or logged.
 * - Sessions are random 192-bit tokens; only their SHA-256 hash is stored, in
 *   CacheService, for at most 6 hours (renewed while in use).
 * - Five wrong passwords lock a username for 15 minutes.
 * - Roles: OWNER (everything) and STAFF (daily entry; cannot void, adjust,
 *   archive/delete customers, change settings or manage users).
 *
 * Limitation: Apps Script cannot read client IPs or set HTTP status codes,
 * so throttling is per-username and errors are returned in the JSON body.
 */

function getUsers() {
  var raw = PropertiesService.getScriptProperties().getProperty(PBM.PROP.USERS);
  if (!raw) return {};
  try { return JSON.parse(raw) || {}; } catch (e) { return {}; }
}

function saveUsers(users) {
  PropertiesService.getScriptProperties().setProperty(PBM.PROP.USERS, JSON.stringify(users));
}

function getPepper() {
  var props = PropertiesService.getScriptProperties();
  var p = props.getProperty(PBM.PROP.PEPPER);
  if (!p) {
    p = randomHex(64);
    props.setProperty(PBM.PROP.PEPPER, p);
  }
  return p;
}

function hashPassword(password, salt, iterations) {
  var pepper = getPepper();
  var h = sha256Hex(pepper + ':' + salt + ':' + password);
  for (var i = 1; i < iterations; i++) h = sha256Hex(h + salt);
  return h;
}

function validateUsername(v) {
  return reqString(v, 'username', 'Username', { min: 3, max: 32, pattern: /^[a-z0-9._-]+$/ }).toLowerCase();
}

function validateNewPassword(v) {
  if (typeof v !== 'string' || v.length < 8) validationError('Password must be at least 8 characters', 'password');
  if (v.length > 128) validationError('Password is too long', 'password');
  return v;
}

function createUserRecord(username, password, role, displayName) {
  var salt = randomHex(32);
  return {
    username: username,
    displayName: displayName || username,
    role: role,
    salt: salt,
    hash: hashPassword(password, salt, PBM.PASSWORD_ITERATIONS),
    iterations: PBM.PASSWORD_ITERATIONS,
    active: true,
    epoch: 1,
    createdAt: nowIso(),
    passwordChangedAt: nowIso()
  };
}

function publicUser(u) {
  return {
    username: u.username,
    displayName: u.displayName,
    role: u.role,
    active: !!u.active,
    createdAt: u.createdAt,
    passwordChangedAt: u.passwordChangedAt
  };
}

// ---------------------------------------------------------------- session --

function sessionKey(token) {
  return 'sess:' + sha256Hex(token);
}

/** Validates the session token and returns the caller, or throws UNAUTHENTICATED. */
function authenticate(token) {
  if (typeof token !== 'string' || !/^[A-F0-9]{48}$/.test(token)) {
    fail('UNAUTHENTICATED', 'Please sign in to continue.');
  }
  var cache = CacheService.getScriptCache();
  var key = sessionKey(token);
  var raw = cache.get(key);
  if (!raw) fail('UNAUTHENTICATED', 'Your session has expired. Please sign in again.');
  var s = JSON.parse(raw);
  var u = getUsers()[s.username];
  if (!u || !u.active || u.epoch !== s.epoch) {
    cache.remove(key);
    fail('UNAUTHENTICATED', 'Your session is no longer valid. Please sign in again.');
  }
  var nowMs = Date.now();
  if (s.expiresAt - nowMs < PBM.SESSION_RENEW_BELOW_SECONDS * 1000) {
    s.expiresAt = nowMs + PBM.SESSION_TTL_SECONDS * 1000;
    cache.put(key, JSON.stringify(s), PBM.SESSION_TTL_SECONDS);
  }
  return { username: u.username, displayName: u.displayName, role: u.role, sessionExpiresAt: s.expiresAt };
}

function requireOwner(user) {
  if (!user || user.role !== 'OWNER') fail('FORBIDDEN', 'Only the business owner can do this.');
}

function actionLogin(payload) {
  var username = String((payload && payload.username) || '').trim().toLowerCase();
  var password = payload && payload.password;
  if (!username || typeof password !== 'string' || !password) {
    validationError('Enter your username and password');
  }
  if (username.length > 32 || password.length > 128) fail('INVALID_CREDENTIALS', 'Incorrect username or password.');

  var cache = CacheService.getScriptCache();
  var failKey = 'fail:' + username;
  var failures = parseInt(cache.get(failKey) || '0', 10);
  if (failures >= PBM.LOGIN_MAX_FAILURES) {
    fail('RATE_LIMITED', 'Too many failed attempts. Try again in 15 minutes.');
  }

  var u = getUsers()[username];
  // Always compute a hash so response time does not reveal whether the user exists.
  var salt = u ? u.salt : 'NO_SUCH_USER_SALT_VALUE';
  var computed = hashPassword(password, salt, u ? u.iterations : PBM.PASSWORD_ITERATIONS);
  if (!u || !u.active || !constantTimeEquals(computed, u.hash)) {
    cache.put(failKey, String(failures + 1), PBM.LOGIN_LOCK_SECONDS);
    fail('INVALID_CREDENTIALS', 'Incorrect username or password.');
  }
  cache.remove(failKey);

  var token = randomHex(48);
  var expiresAt = Date.now() + PBM.SESSION_TTL_SECONDS * 1000;
  cache.put(sessionKey(token), JSON.stringify({ username: u.username, epoch: u.epoch, expiresAt: expiresAt }), PBM.SESSION_TTL_SECONDS);
  writeAuditSafe(u.username, 'LOGIN', '', '', 'Signed in');
  return {
    token: token,
    expiresAt: expiresAt,
    user: { username: u.username, displayName: u.displayName, role: u.role }
  };
}

function actionLogout(payload, user, ctx) {
  if (ctx && ctx.token) CacheService.getScriptCache().remove(sessionKey(ctx.token));
  return { loggedOut: true };
}

function actionMe(payload, user) {
  return user;
}

// ------------------------------------------------------ user management ----

function actionListUsers(payload, user) {
  requireOwner(user);
  var users = getUsers();
  return Object.keys(users).sort().map(function (k) { return publicUser(users[k]); });
}

function actionCreateUser(payload, user) {
  requireOwner(user);
  var username = validateUsername(payload.username);
  var password = validateNewPassword(payload.password);
  var role = reqEnum(payload.role || 'STAFF', 'role', 'Role', PBM.ROLES);
  var displayName = optString(payload.displayName, 'displayName', 'Display name', { max: 60 }) || username;
  return withLock(function () {
    var users = getUsers();
    if (users[username]) fail('DUPLICATE', 'A user with this username already exists.');
    users[username] = createUserRecord(username, password, role, displayName);
    saveUsers(users);
    writeAudit([{ user: user.username, action: 'USER_CREATE', summary: 'Created ' + role + ' user ' + username }]);
    return publicUser(users[username]);
  });
}

function actionUpdateUser(payload, user) {
  requireOwner(user);
  var username = validateUsername(payload.username);
  return withLock(function () {
    var users = getUsers();
    var u = users[username];
    if (!u) fail('NOT_FOUND', 'User not found.');
    var changes = [];
    if (payload.displayName !== undefined) {
      u.displayName = optString(payload.displayName, 'displayName', 'Display name', { max: 60 }) || username;
      changes.push('name');
    }
    if (payload.role !== undefined) {
      var role = reqEnum(payload.role, 'role', 'Role', PBM.ROLES);
      if (role !== u.role) { u.role = role; u.epoch++; changes.push('role=' + role); }
    }
    if (payload.active !== undefined) {
      var active = optBool(payload.active);
      if (active !== u.active) { u.active = active; u.epoch++; changes.push(active ? 'enabled' : 'disabled'); }
    }
    if (payload.newPassword) {
      validateNewPassword(payload.newPassword);
      u.salt = randomHex(32);
      u.iterations = PBM.PASSWORD_ITERATIONS;
      u.hash = hashPassword(payload.newPassword, u.salt, u.iterations);
      u.passwordChangedAt = nowIso();
      u.epoch++;
      changes.push('password reset');
    }
    var owners = Object.keys(users).filter(function (k) { return users[k].active && users[k].role === 'OWNER'; });
    if (!owners.length) fail('VALIDATION_ERROR', 'At least one active owner account must remain.');
    saveUsers(users);
    writeAudit([{ user: user.username, action: 'USER_UPDATE', summary: username + ': ' + (changes.join(', ') || 'no change') }]);
    return publicUser(u);
  });
}

function actionChangePassword(payload, user) {
  var current = payload.currentPassword;
  var next = validateNewPassword(payload.newPassword);
  return withLock(function () {
    var users = getUsers();
    var u = users[user.username];
    if (!u || !constantTimeEquals(hashPassword(String(current || ''), u.salt, u.iterations), u.hash)) {
      fail('INVALID_CREDENTIALS', 'Your current password is incorrect.');
    }
    u.salt = randomHex(32);
    u.iterations = PBM.PASSWORD_ITERATIONS;
    u.hash = hashPassword(next, u.salt, u.iterations);
    u.passwordChangedAt = nowIso();
    u.epoch++;
    saveUsers(users);
    writeAudit([{ user: user.username, action: 'PASSWORD_CHANGE', summary: 'Changed own password' }]);
    return { changed: true, signInAgain: true };
  });
}
