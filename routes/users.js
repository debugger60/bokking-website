'use strict';

/**
 * CineBook AI — user routes (ALL protected)
 *   GET /api/users/profile   user + booking/review stats + taste profile
 *   PUT /api/users/profile   update display name
 */

const db = require('../database/database');
const { createError, asyncHandler } = require('../middleware/errorHandler');
const { requireAuth } = require('../middleware/authMiddleware');
const recEngine = require('../services/recommendationEngine');

const router = require('express').Router();

router.use(requireAuth);

router.get(
  '/profile',
  asyncHandler(async (req, res) => {
    const uid = req.user.id;

    const bookings = db
      .prepare("SELECT COUNT(*) AS n FROM bookings WHERE user_id = ? AND status = 'confirmed'")
      .get(uid).n;
    const reviews = db.prepare('SELECT COUNT(*) AS n FROM reviews WHERE user_id = ?').get(uid).n;
    const totalSpent = db
      .prepare("SELECT COALESCE(SUM(total_amount), 0) AS s FROM bookings WHERE user_id = ? AND status = 'confirmed'")
      .get(uid).s;

    // Rebuild the taste profile from booking history, then read it back.
    const watched = db
      .prepare(
        `SELECT DISTINCT m.*
           FROM bookings b
           JOIN shows s ON s.id = b.show_id
           JOIN movies m ON m.id = s.movie_id
          WHERE b.user_id = ? AND b.status = 'confirmed'`
      )
      .all(uid);
    recEngine.rebuildUserPreferences(uid, watched);
    const preferences = recEngine.getUserPreferences(uid);

    return res.json({
      success: true,
      user: req.user,
      stats: { bookings, reviews, totalSpent },
      preferences
    });
  })
);

router.put(
  '/profile',
  asyncHandler(async (req, res) => {
    const name = typeof (req.body || {}).name === 'string' ? req.body.name.trim() : '';
    if (name.length < 2 || name.length > 80) {
      throw createError(400, 'Name must be between 2 and 80 characters.');
    }

    db.prepare('UPDATE users SET name = ? WHERE id = ?').run(name, req.user.id);
    const row = db.prepare('SELECT id, name, email, created_at FROM users WHERE id = ?').get(req.user.id);

    return res.json({
      success: true,
      message: 'Profile updated successfully.',
      user: row
    });
  })
);

module.exports = router;
