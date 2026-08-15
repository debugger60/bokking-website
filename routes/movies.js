'use strict';

/**
 * CineBook AI — movie routes
 *   GET  /api/movies               list with search + filters + sorting
 *   GET  /api/movies/search        same handler (alias for the search bar)
 *   GET  /api/movies/:id           full movie detail (+ similar, theatres, dates)
 *   GET  /api/movies/:id/reviews   list reviews for a movie
 *   POST /api/movies/:id/reviews   submit/update a review (protected)
 *
 * The displayed `rating` is computed dynamically from the reviews table
 * and falls back to the seed rating when a movie has no reviews yet.
 */

const { randomUUID } = require('crypto');
const db = require('../database/database');
const { createError, asyncHandler } = require('../middleware/errorHandler');
const { requireAuth } = require('../middleware/authMiddleware');
const recEngine = require('../services/recommendationEngine');

const router = require('express').Router();

const SORTS = {
  popularity: 'popularity',
  rating: 'rating',
  newest: 'newest',
  alphabetical: 'alphabetical'
};

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function clampInt(value, min, max, fallback) {
  const n = parseInt(value, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

/** DB row → API movie object (same camelCase shape as the rec engine). */
function toMovie(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    genre: row.genre,
    language: row.language,
    duration: row.duration,
    releaseDate: row.release_date,
    rating: row.avg_rating != null ? row.avg_rating : row.rating,
    baseRating: row.rating,
    posterUrl: row.poster_url,
    backdropUrl: row.backdrop_url,
    trailerUrl: row.trailer_url,
    director: row.director,
    cast: row.cast,
    ageRating: row.age_rating,
    popularity: row.popularity_score,
    keywords: row.keywords,
    status: row.status,
    reviewCount: row.review_count || 0
  };
}

const MOVIE_SELECT = `
  SELECT m.*,
         ROUND(COALESCE((SELECT AVG(rating) FROM reviews WHERE movie_id = m.id), m.rating), 1) AS avg_rating,
         (SELECT COUNT(*) FROM reviews WHERE movie_id = m.id) AS review_count
    FROM movies m
`;

/**
 * Shared list/search query builder. All matching happens in SQL
 * (parameterized); sorting, minRating and limiting are applied in JS.
 */
function queryMovies(q) {
  const where = [];
  const params = [];

  const addLike = (col, value) => {
    where.push(`LOWER(COALESCE(${col}, '')) LIKE ?`);
    params.push(`%${value.toLowerCase()}%`);
  };

  if (q.q) {
    where.push(
      `(LOWER(COALESCE(m.title, '')) LIKE ?
        OR LOWER(COALESCE(m.description, '')) LIKE ?
        OR LOWER(COALESCE(m.genre, '')) LIKE ?
        OR LOWER(COALESCE(m.language, '')) LIKE ?
        OR LOWER(COALESCE(m.director, '')) LIKE ?
        OR LOWER(COALESCE(m.cast, '')) LIKE ?
        OR LOWER(COALESCE(m.keywords, '')) LIKE ?)`
    );
    const like = `%${q.q.toLowerCase()}%`;
    params.push(like, like, like, like, like, like, like);
  }
  if (q.genre) addLike('m.genre', q.genre);
  if (q.language) addLike('m.language', q.language);
  if (q.director) addLike('m.director', q.director);
  if (q.actor) addLike('m.cast', q.actor);
  if (q.year) {
    where.push('m.release_date LIKE ?');
    params.push(`${q.year}%`);
  }
  if (q.status) {
    where.push('m.status = ?');
    params.push(q.status);
  }

  let sql = MOVIE_SELECT;
  if (where.length) sql += ' WHERE ' + where.join(' AND ');

  return db.prepare(sql).all(...params);
}

function sortMovies(rows, sort) {
  const cmp = {
    popularity: (a, b) => (b.popularity_score || 0) - (a.popularity_score || 0),
    rating: (a, b) => (b.avg_rating || 0) - (a.avg_rating || 0),
    newest: (a, b) => (b.release_date || '').localeCompare(a.release_date || ''),
    alphabetical: (a, b) => a.title.localeCompare(b.title)
  }[sort] || ((a, b) => (b.popularity_score || 0) - (a.popularity_score || 0));
  return rows.slice().sort(cmp);
}

function parseFilters(req) {
  const str = (v, max = 100) =>
    typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;

  const q = str(req.query.q, 200);
  const genre = str(req.query.genre);
  const language = str(req.query.language);
  const director = str(req.query.director);
  const actor = str(req.query.actor);
  const year = str(req.query.year);
  const status = str(req.query.status);

  if (year && !/^\d{4}$/.test(year)) {
    throw createError(400, 'Year filter must be a 4-digit year (e.g. 2023).');
  }
  if (status && !['now_showing', 'coming_soon'].includes(status)) {
    throw createError(400, "Status must be 'now_showing' or 'coming_soon'.");
  }

  let minRating = null;
  if (req.query.minRating !== undefined && req.query.minRating !== '') {
    minRating = parseFloat(req.query.minRating);
    if (!Number.isFinite(minRating) || minRating < 0 || minRating > 10) {
      throw createError(400, 'minRating must be a number between 0 and 10.');
    }
  }

  const sort = req.query.sort in SORTS ? req.query.sort : 'popularity';
  const limit = req.query.limit !== undefined ? clampInt(req.query.limit, 1, 100, null) : null;

  return { q, genre, language, director, actor, year, status, minRating, sort, limit };
}

function listMoviesHandler(req, res) {
  const f = parseFilters(req);
  let rows = queryMovies(f);

  if (f.minRating != null) {
    rows = rows.filter((r) => (r.avg_rating != null ? r.avg_rating : r.rating) >= f.minRating);
  }
  rows = sortMovies(rows, f.sort);
  if (f.limit) rows = rows.slice(0, f.limit);

  return res.json({ success: true, count: rows.length, movies: rows.map(toMovie) });
}

router.get(['/', '/search'], asyncHandler(listMoviesHandler));

router.get(
  '/:id/reviews',
  asyncHandler(async (req, res) => {
    const movie = db.prepare('SELECT id FROM movies WHERE id = ?').get(req.params.id);
    if (!movie) throw createError(404, 'Movie not found.');

    const reviews = db
      .prepare(
        `SELECT r.id, r.movie_id, r.rating, r.review_text, r.created_at, u.name AS user_name
           FROM reviews r JOIN users u ON u.id = r.user_id
          WHERE r.movie_id = ?
          ORDER BY r.created_at DESC, r.id DESC`
      )
      .all(req.params.id);

    const agg = db
      .prepare('SELECT ROUND(AVG(rating), 1) AS avg, COUNT(*) AS count FROM reviews WHERE movie_id = ?')
      .get(req.params.id);

    return res.json({
      success: true,
      avgRating: agg.avg,
      count: agg.count,
      reviews: reviews.map((r) => ({
        id: r.id,
        movieId: r.movie_id,
        rating: r.rating,
        reviewText: r.review_text,
        createdAt: r.created_at,
        userName: r.user_name
      }))
    });
  })
);

router.post(
  '/:id/reviews',
  requireAuth,
  asyncHandler(async (req, res) => {
    const movie = db.prepare('SELECT id FROM movies WHERE id = ?').get(req.params.id);
    if (!movie) throw createError(404, 'Movie not found.');

    const rating = Number(req.body && req.body.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw createError(400, 'Rating must be an integer between 1 and 5.');
    }

    let reviewText = null;
    if (req.body && req.body.reviewText != null) {
      if (typeof req.body.reviewText !== 'string') {
        throw createError(400, 'Review text must be a string.');
      }
      reviewText = req.body.reviewText.trim().slice(0, 2000);
      if (!reviewText) reviewText = null;
    }

    // One review per user per movie (UNIQUE(user_id, movie_id)) — a second
    // submission updates the existing review instead of creating a duplicate.
    db.prepare(
      `INSERT INTO reviews (id, user_id, movie_id, rating, review_text, created_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(user_id, movie_id) DO UPDATE SET
         rating = excluded.rating,
         review_text = excluded.review_text,
         created_at = datetime('now')`
    ).run(randomUUID(), req.user.id, req.params.id, rating, reviewText);

    const agg = db
      .prepare('SELECT ROUND(AVG(rating), 1) AS avg, COUNT(*) AS count FROM reviews WHERE movie_id = ?')
      .get(req.params.id);

    return res.status(201).json({
      success: true,
      message: 'Review submitted successfully.',
      avgRating: agg.avg,
      count: agg.count
    });
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const row = db.prepare(`${MOVIE_SELECT} WHERE m.id = ?`).get(req.params.id);
    if (!row) throw createError(404, 'Movie not found.');

    const movie = toMovie(row);
    const today = todayStr();

    // "More like this" via the content-based recommendation engine.
    const similar = recEngine.getSimilarMovies(row.id, { limit: 6 });

    // Theatres currently screening this movie.
    const theatres = db
      .prepare(
        `SELECT DISTINCT t.id, t.name, t.city, t.address, t.screens
           FROM shows s JOIN theatres t ON t.id = s.theatre_id
          WHERE s.movie_id = ? AND s.show_date >= ?
          ORDER BY t.city, t.name`
      )
      .all(row.id, today);

    // Distinct upcoming show dates for this movie.
    const showDates = db
      .prepare(
        `SELECT DISTINCT show_date FROM shows
          WHERE movie_id = ? AND show_date >= ?
          ORDER BY show_date`
      )
      .all(row.id, today)
      .map((d) => d.show_date);

    return res.json({ success: true, movie, similar, theatres, showDates });
  })
);

module.exports = router;
