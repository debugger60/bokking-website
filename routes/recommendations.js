'use strict';

/**
 * CineBook AI — recommendation routes
 *   GET /api/recommendations                 personalized (or popular fallback)
 *   GET /api/recommendations/similar/:movieId   "More like this"
 *
 * All logic lives in services/recommendationEngine.js (content-based
 * scoring over genre / language / director / cast / rating / keywords).
 */

const db = require('../database/database');
const { createError, asyncHandler } = require('../middleware/errorHandler');
const { optionalAuth } = require('../middleware/authMiddleware');
const recEngine = require('../services/recommendationEngine');

const router = require('express').Router();

function clampInt(value, min, max, fallback) {
  const n = parseInt(value, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

router.get(
  '/',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const limit = clampInt(req.query.limit, 1, 20, 10);
    const userId = req.user ? req.user.id : null;

    let hasHistory = false;
    if (userId) {
      hasHistory =
        db
          .prepare(
            `SELECT 1 FROM bookings b
              JOIN shows s ON s.id = b.show_id
             WHERE b.user_id = ? AND b.status = 'confirmed'
             LIMIT 1`
          )
          .get(userId) !== undefined;
    }

    const recommendations = recEngine.getRecommendationsForUser(userId, { limit });

    return res.json({
      success: true,
      personalized: hasHistory,
      message: hasHistory
        ? 'Personalized recommendations based on your booking history.'
        : 'Popular movies for you.',
      recommendations
    });
  })
);

router.get(
  '/similar/:movieId',
  asyncHandler(async (req, res) => {
    const movie = db.prepare('SELECT id FROM movies WHERE id = ?').get(req.params.movieId);
    if (!movie) throw createError(404, 'Movie not found.');

    const limit = clampInt(req.query.limit, 1, 12, 6);
    const similar = recEngine.getSimilarMovies(movie.id, { limit });
    return res.json({ success: true, similar });
  })
);

module.exports = router;
