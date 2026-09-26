// Shared Supabase client + admin API helpers for the /admin/ staff section.
// Loaded as a classic <script> (no build tooling on this site) after the
// Supabase UMD CDN script, same pattern as the unpkg Lucide script every
// other page already uses — everything here hangs off the global scope.

const SUPABASE_URL = 'https://tgichwkrqreuhlydsjvz.supabase.co';
// Anon key — the same one apps/mobile/.env ships inside the LOAD24 app, so
// it's already public. Real authorization happens server-side via the
// user_roles check in requireRole(), not by keeping this secret.
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRnaWNod2tycXJldWhseWRzanZ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ1MjUxMDMsImV4cCI6MjEwMDEwMTEwM30.Pl--MJvsQ4tywVqBUl4yj6gTDNeuc4lM-CypPn_n9yQ';
const API_BASE = 'https://load24-app.onrender.com';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Support executives get a personal login ID (e.g. "ravi.k") from an admin
// on /admin/staff-logins/. Supabase auth is email-based, so the API stores it
// as ravi.k@staff.load24.internal — must match STAFF_LOGIN_DOMAIN in the
// backend's routes/admin/staffAccounts.js. Executives never see the domain.
const STAFF_LOGIN_DOMAIN = 'staff.load24.internal';

// What the login form sends to Supabase: a bare ID gets the staff domain,
// anything with an "@" is used as-is (admins still sign in by email).
function staffLoginEmail(loginIdOrEmail) {
  const value = String(loginIdOrEmail || '').trim().toLowerCase();
  return value.includes('@') ? value : `${value}@${STAFF_LOGIN_DOMAIN}`;
}

// The reverse, for display: ravi.k@staff.load24.internal -> "ravi.k".
function staffLoginLabel(email) {
  const suffix = `@${STAFF_LOGIN_DOMAIN}`;
  return email && email.endsWith(suffix) ? email.slice(0, -suffix.length) : email;
}

function isStaffLoginId(email) {
  return !!email && email.endsWith(`@${STAFF_LOGIN_DOMAIN}`);
}

// Where a signed-out user goes: the Executive Desk has its own sign-in page
// (/executive/login/, login ID + password); every other admin page uses
// /admin/login/.
function staffLoginPage() {
  return window.location.pathname.startsWith('/executive') ? '/executive/login/' : '/admin/login/';
}

// desk_executive (the role Staff Logins gives executives) can use only the
// Executive Desk — the API refuses it everywhere under /api/admin/*. Reads
// the signed-in user's own user_roles rows (RLS allows reading your own).
async function isDeskOnlyUser(userId) {
  const { data } = await supabaseClient.from('user_roles').select('role').eq('user_id', userId);
  return !!data && data.length > 0 && data.every((r) => r.role === 'desk_executive');
}

// Redirects to the sign-in page if there's no active session, and sends
// executives away from the admin portal to their desk. Call at the top of
// every /admin/ page (and the desk) except the login pages. Returns the
// session (with .access_token) so callers don't need a second getSession().
async function requireStaffSession() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) {
    window.location.href = staffLoginPage();
    return null;
  }
  if (window.location.pathname.startsWith('/admin') && (await isDeskOnlyUser(session.user.id))) {
    window.location.href = '/executive/';
    return null;
  }
  return session;
}

// Wraps fetch() against the Render API with the signed-in staff member's
// bearer token attached. Whether the caller actually *has* a staff role is
// enforced server-side by requireRole() — a 403 here just means they don't.
async function adminApiFetch(path, options = {}) {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) {
    window.location.href = staffLoginPage();
    throw new Error('No active session');
  }
  return fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      ...(options.headers || {})
    }
  });
}

async function adminSignOut() {
  await supabaseClient.auth.signOut();
  window.location.href = staffLoginPage();
}

// The API always answers with JSON. When it doesn't — a Render cold-start or
// 502 error page, or a 404 HTML page because an endpoint isn't deployed yet —
// res.json() throws an opaque `Unexpected token '<', "<!DOCTYPE "...`. Read
// the body once as text and turn a non-JSON response into an actionable
// message instead. Returns the parsed body on success (any status).
async function readApiJson(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    if (!res.ok) {
      throw new Error(`API request failed (${res.status}). This endpoint may not be deployed yet.`);
    }
    throw new Error(`The API returned an unexpected non-JSON response: ${text.trim().slice(0, 120)}`);
  }
}

// Fills in the signed-in staff email (or login ID) and wires the Sign Out button. Every
// /admin/ page (except login) calls this once its nav markup is in the DOM.
// Deliberately doesn't touch the mobile burger menu — each page wires that
// up itself, same as the rest of the site.
async function initAdminNav() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  const emailEl = document.getElementById('staffEmail');
  if (emailEl && session) emailEl.textContent = staffLoginLabel(session.user.email);

  const signOutBtn = document.getElementById('signOutBtn');
  if (signOutBtn) signOutBtn.addEventListener('click', adminSignOut);
}

// 403 from requireRole() means the signed-in user just has no user_roles
// row yet — there's no self-serve way to grant one, so spell out the fix.
const NO_STAFF_ROLE_MESSAGE =
  'Your account has no staff role yet. Ask an admin to add a row for your user in the Supabase user_roles table (role: admin, support_executive or support_manager).';

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

function formatInr(amount) {
  return `₹${Number(amount).toLocaleString('en-IN')}`;
}

function titleCase(slug) {
  return String(slug || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// User-supplied strings (names, filenames, bank details) get rendered into
// innerHTML templates below — always route them through this first.
function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = value == null ? '' : String(value);
  return div.innerHTML;
}
