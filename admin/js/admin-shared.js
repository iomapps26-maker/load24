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

// Redirects to /admin/login/ if there's no active session. Call at the top
// of every /admin/ page except the login page itself. Returns the session
// (with .access_token) so callers don't need a second getSession() round trip.
async function requireStaffSession() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) {
    window.location.href = '/admin/login/';
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
    window.location.href = '/admin/login/';
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
  window.location.href = '/admin/login/';
}

// Fills in the signed-in staff email and wires the Sign Out button. Every
// /admin/ page (except login) calls this once its nav markup is in the DOM.
// Deliberately doesn't touch the mobile burger menu — each page wires that
// up itself, same as the rest of the site.
async function initAdminNav() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  const emailEl = document.getElementById('staffEmail');
  if (emailEl && session) emailEl.textContent = session.user.email;

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
