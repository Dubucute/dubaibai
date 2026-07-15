// ===== Supabase Auth Module =====
// Server-side authentication using Supabase service role key.
// Provides signup, signin, session verification, and Express middleware.

const { createClient } = require("@supabase/supabase-js");

// Load .env for standalone usage (config.js also loads it, but this ensures
// env vars are available when auth.js is required directly)
try {
  const path = require("path");
  require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
} catch (e) { /* dotenv not installed, skip */ }

// ── Graceful init — if env vars are missing, auth is disabled ──
function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secretKey) return null;
  return createClient(url, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

const supabase = getSupabaseAdmin();
const AUTH_ENABLED = !!supabase;

/**
 * Sign in with email + password.
 * Returns a session token if email is confirmed.
 */
async function signIn(email, password) {
  if (!AUTH_ENABLED) {
    return { error: "Authentication is not configured on this server." };
  }
  // We use the regular auth signIn (not admin) — this returns a session token
  // that the frontend can use for subsequent requests.
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) {
    if (error.message.includes("Email not confirmed")) {
      return {
        error:
          "Email not confirmed yet. Please check your inbox and click the confirmation link.",
      };
    }
    return { error: error.message };
  }
  return {
    session: {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at,
    },
    user: {
      id: data.user.id,
      email: data.user.email,
    },
  };
}

/**
 * Verify a session / access token and return the user.
 */
async function getSessionUser(accessToken) {
  if (!AUTH_ENABLED || !accessToken) return null;
  try {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(accessToken);
    if (error || !user) return null;
    return {
      id: user.id,
      email: user.email,
      created_at: user.created_at,
      last_sign_in_at: user.last_sign_in_at,
    };
  } catch {
    return null;
  }
}

/**
 * Express middleware — verifies the Authorization header or X-Session-Token header.
 * Attaches req.user if valid.
 */
function authMiddleware(req, res, next) {
  // If auth is disabled, skip checks
  if (!AUTH_ENABLED) {
    req.user = null;
    return next();
  }

  const authHeader = req.headers.authorization;
  const sessionToken =
    req.headers["x-session-token"] ||
    req.query.token ||
    (authHeader && authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null);

  if (!sessionToken) {
    req.user = null;
    return next();
  }

  getSessionUser(sessionToken)
    .then((user) => {
      req.user = user;
      next();
    })
    .catch(() => {
      req.user = null;
      next();
    });
}

/**
 * Require authentication middleware.
 * Returns 401 if not authenticated.
 */
function requireAuth(req, res, next) {
  if (AUTH_ENABLED && !req.user) {
    return res.status(401).json({ error: "Authentication required. Please sign in." });
  }
  next();
}

module.exports = {
  supabase,
  AUTH_ENABLED,
  signIn,
  getSessionUser,
  authMiddleware,
  requireAuth,
};
