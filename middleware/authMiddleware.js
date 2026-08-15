'use strict';

/**
 * CineBook AI — authentication middleware.
 *
 * - requireAuth:   rejects unauthenticated requests with 401 (protects
 *                  private API routes: bookings, profile, reviews…).
 * - optionalAuth:  attaches `req.user` when a valid session exists but
 *                  allows guests through (recommendations, browsing).
 *
 * Sessions are express-session cookies; the authenticated user id lives
 * in `req.session.userId`.
 */

const db = require('../database/database');

/** Load the current user (sans password) for a session id. */
function loadUser(userId) {
  if (!userId) return null;
  return db
    .prepare('SELECT id, name, email, created_at FROM users WHERE id = ?')
    .get(userId) || null;
}

function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required. Please log in to continue.'
    });
  }

  const user = loadUser(req.session.userId);
  if (!user) {
    // Session points at a user that no longer exists.
    req.session.destroy(() => {});
    return res.status(401).json({
      success: false,
      message: 'Your session is no longer valid. Please log in again.'
    });
  }

  req.user = user;
  next();
}

function optionalAuth(req, res, next) {
  if (req.session && req.session.userId) {
    const user = loadUser(req.session.userId);
    if (user) req.user = user;
  }
  next();
}

module.exports = { requireAuth, optionalAuth };
