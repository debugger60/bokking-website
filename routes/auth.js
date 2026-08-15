'use strict';

/**
 * CineBook AI — authentication routes
 *   POST /api/auth/register   create account + establish session
 *   POST /api/auth/login      log in + establish session
 *   POST /api/auth/logout     destroy session
 *   GET  /api/auth/me         current user (protected)
 */

const bcrypt = require('bcrypt');
const { randomUUID } = require('crypto');
const db = require('../database/database');
const { createError, asyncHandler } = require('../middleware/errorHandler');
const { requireAuth } = require('../middleware/authMiddleware');

const router = require('express').Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BCRYPT_ROUNDS = 10;

/** Strip sensitive fields before sending a user to the client. */
function publicUser(row) {
  return { id: row.id, name: row.name, email: row.email, createdAt: row.created_at };
}

/** Wrap express-session's callback-based regenerate() in a promise. */
function regenerateSession(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => (err ? reject(err) : resolve()));
  });
}

router.post(
  '/register',
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = body.password;

    if (name.length < 2 || name.length > 80) {
      throw createError(400, 'Name must be between 2 and 80 characters.');
    }
    if (!EMAIL_RE.test(email) || email.length > 254) {
      throw createError(400, 'Please provide a valid email address.');
    }
    if (typeof password !== 'string' || password.length < 6 || password.length > 72) {
      throw createError(400, 'Password must be between 6 and 72 characters.');
    }

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      throw createError(409, 'An account with this email already exists.');
    }

    // Password is stored ONLY as a bcrypt hash.
    const id = randomUUID();
    const hash = bcrypt.hashSync(password, BCRYPT_ROUNDS);
    db.prepare('INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)')
      .run(id, name, email, hash);

    const row = db.prepare('SELECT id, name, email, created_at FROM users WHERE id = ?').get(id);

    // Regenerate the session id to prevent session-fixation, then log in.
    await regenerateSession(req);
    req.session.userId = id;

    return res.status(201).json({
      success: true,
      message: 'Account created successfully.',
      user: publicUser(row)
    });
  })
);

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = body.password;

    if (!EMAIL_RE.test(email)) throw createError(400, 'Please provide a valid email address.');
    if (typeof password !== 'string' || password.length === 0) {
      throw createError(400, 'Please provide your password.');
    }

    const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!row) throw createError(401, 'Invalid email or password.');

    const ok = bcrypt.compareSync(password, row.password_hash);
    if (!ok) throw createError(401, 'Invalid email or password.');

    await regenerateSession(req);
    req.session.userId = row.id;

    return res.json({
      success: true,
      message: 'Logged in successfully.',
      user: publicUser(row)
    });
  })
);

router.post(
  '/logout',
  asyncHandler(async (req, res) => {
    if (req.session) req.session.destroy(() => {});
    res.clearCookie('cinebook.sid');
    return res.json({ success: true, message: 'Logged out successfully.' });
  })
);

router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => res.json({ success: true, user: req.user }))
);

module.exports = router;
