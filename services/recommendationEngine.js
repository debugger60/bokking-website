'use strict';

/**
 * CineBook AI — content-based movie recommendation engine.
 *
 * Two modes:
 *
 * 1. PERSONALIZED (user has booking history)
 *    A taste profile is built from the movies the user has booked
 *    (genre, language, director, cast, keywords + average rating) and
 *    every candidate movie is scored against that profile. The profile
 *    is also persisted into `user_preferences` for the profile page.
 *
 * 2. COLD START (guest or no history)
 *    Returns "Popular Movies For You" ranked by popularity × rating.
 *
 * Item–item similarity (genre / language / cast / director / rating /
 * keyword overlap) is also exposed for "More like this" suggestions on
 * the movie details page, and to generate human-readable reasons such as
 * "Because you watched Inception".
 */

const { randomUUID } = require('crypto');
const db = require('../database/database');

/* ------------------------------------------------------------------ */
/*  Tokenization helpers                                              */
/* ------------------------------------------------------------------ */

/** Split a comma-separated string into normalized lowercase tokens. */
function tokenize(csv) {
  if (!csv) return [];
  return csv
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function toSet(tokens) {
  return new Set(tokens);
}

/** Number of shared elements between two sets. */
function intersect(a, b) {
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  let n = 0;
  for (const x of small) if (big.has(x)) n += 1;
  return n;
}

/** Jaccard similarity (intersection / union), always in [0, 1]. */
function jaccard(a, b) {
  if (a.size === 0 && b.size === 0) return 0;
  const inter = intersect(a, b);
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

/** Overlap ratio relative to the smaller set — rewards shared cast/keywords. */
function overlapRatio(a, b) {
  if (a.size === 0 || b.size === 0) return 0;
  return intersect(a, b) / Math.min(a.size, b.size);
}

/** Rating closeness in [0, 1]. `scale` controls sensitivity. */
function ratingSim(a, b, scale = 5) {
  if (!a || !b) return 0.5;
  return Math.max(0, 1 - Math.abs(a - b) / scale);
}

function directorSim(a, b) {
  return intersect(toSet(tokenize(a)), toSet(tokenize(b))) > 0 ? 1 : 0;
}

/* ------------------------------------------------------------------ */
/*  Serialization (DB row → API-friendly object)                      */
/* ------------------------------------------------------------------ */

function toMovie(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    genre: row.genre,
    language: row.language,
    duration: row.duration,
    releaseDate: row.release_date,
    rating: row.rating,
    posterUrl: row.poster_url,
    backdropUrl: row.backdrop_url,
    trailerUrl: row.trailer_url,
    director: row.director,
    cast: row.cast,
    ageRating: row.age_rating,
    popularity: row.popularity_score,
    keywords: row.keywords,
    status: row.status,
    genres: tokenize(row.genre),
    languages: tokenize(row.language),
    castList: tokenize(row.cast)
  };
}

/* ------------------------------------------------------------------ */
/*  Content-based similarity                                          */
/* ------------------------------------------------------------------ */

const FEATURE_WEIGHTS = {
  genre: 0.26,
  keywords: 0.16,
  cast: 0.14,
  director: 0.1,
  language: 0.12,
  rating: 0.22
};

/** Weighted content similarity between two movies, in [0, 1]. */
function movieSimilarity(mA, mB) {
  const genre = jaccard(toSet(tokenize(mA.genre)), toSet(tokenize(mB.genre)));
  const keywords = jaccard(toSet(tokenize(mA.keywords)), toSet(tokenize(mB.keywords)));
  const cast = overlapRatio(toSet(tokenize(mA.cast)), toSet(tokenize(mB.cast)));
  const director = directorSim(mA.director, mB.director);
  const language = jaccard(toSet(tokenize(mA.language)), toSet(tokenize(mB.language)));
  const rating = ratingSim(mA.rating, mB.rating);

  return (
    FEATURE_WEIGHTS.genre * genre +
    FEATURE_WEIGHTS.keywords * keywords +
    FEATURE_WEIGHTS.cast * cast +
    FEATURE_WEIGHTS.director * director +
    FEATURE_WEIGHTS.language * language +
    FEATURE_WEIGHTS.rating * rating
  );
}

/** Normalize a list of scores so the best match maps to 100. */
function normalizeScores(scored) {
  const max = Math.max(...scored.map((s) => s.score), 1e-9);
  for (const s of scored) s.score = Math.round((s.score / max) * 100);
  return scored;
}

function sortByScoreThenPopularity(scored) {
  return scored.sort(
    (a, b) =>
      b.score - a.score ||
      (b.movie.popularity_score || 0) - (a.movie.popularity_score || 0)
  );
}

/* ------------------------------------------------------------------ */
/*  "More like this" (item–item)                                      */
/* ------------------------------------------------------------------ */

function getSimilarMovies(movieId, { limit = 6, excludeIds = [] } = {}) {
  const movie = db.prepare('SELECT * FROM movies WHERE id = ?').get(movieId);
  if (!movie) return [];

  const exclude = new Set([movieId, ...excludeIds]);
  const candidates = db.prepare('SELECT * FROM movies').all().filter((m) => !exclude.has(m.id));

  const scored = candidates.map((c) => ({ movie: c, score: movieSimilarity(movie, c) }));
  const ranked = normalizeScores(sortByScoreThenPopularity(scored)).slice(0, limit);

  return ranked.map(({ movie: m, score }) => ({
    ...toMovie(m),
    score,
    reason: `Because you viewed ${movie.title}`
  }));
}

/* ------------------------------------------------------------------ */
/*  Personalized recommendations                                      */
/* ------------------------------------------------------------------ */

const PROFILE_WEIGHTS = {
  genre: 0.3,
  language: 0.12,
  director: 0.1,
  cast: 0.13,
  keywords: 0.1,
  rating: 0.15,
  popularity: 0.1
};

function watchedMovies(userId) {
  return db
    .prepare(
      `SELECT DISTINCT m.*
         FROM bookings b
         JOIN shows s ON s.id = b.show_id
         JOIN movies m ON m.id = s.movie_id
        WHERE b.user_id = ? AND b.status = 'confirmed'`
    )
    .all(userId);
}

function addAll(map, tokens, weight) {
  for (const t of tokens) map.set(t, (map.get(t) || 0) + weight);
}

/** Build a taste profile from a user's watched movies. */
function buildProfile(history) {
  const genres = new Map();
  const languages = new Map();
  const directors = new Map();
  const cast = new Map();
  const keywords = new Map();
  let ratingSum = 0;
  let ratingCount = 0;

  for (const m of history) {
    addAll(genres, tokenize(m.genre), 1);
    addAll(languages, tokenize(m.language), 1);
    addAll(directors, tokenize(m.director), 1.5);
    addAll(cast, tokenize(m.cast), 1);
    addAll(keywords, tokenize(m.keywords), 1);
    if (m.rating > 0) {
      ratingSum += m.rating;
      ratingCount += 1;
    }
  }

  return {
    genres,
    languages,
    directors,
    cast,
    keywords,
    avgRating: ratingCount ? ratingSum / ratingCount : null
  };
}

/** How much of a movie's features match a weighted profile map, in [0,1]. */
function profileOverlap(profileMap, movieTokens) {
  if (!profileMap.size) return 0;
  let total = 0;
  for (const w of profileMap.values()) total += w;
  if (total === 0) return 0;

  let hit = 0;
  for (const t of toSet(movieTokens)) hit += profileMap.get(t) || 0;
  return Math.min(1, hit / total);
}

/** Score a candidate movie against a user profile, in [0,1]. */
function profileScore(profile, movie) {
  const genre = profileOverlap(profile.genres, tokenize(movie.genre));
  const language = profileOverlap(profile.languages, tokenize(movie.language));
  const director = profileOverlap(profile.directors, tokenize(movie.director));
  const cast = profileOverlap(profile.cast, tokenize(movie.cast));
  const keywords = profileOverlap(profile.keywords, tokenize(movie.keywords));
  const rating =
    profile.avgRating == null ? 0.5 : ratingSim(profile.avgRating, movie.rating, 2.5);
  const popularity = Math.min(1, (movie.popularity_score || 0) / 100);

  return (
    PROFILE_WEIGHTS.genre * genre +
    PROFILE_WEIGHTS.language * language +
    PROFILE_WEIGHTS.director * director +
    PROFILE_WEIGHTS.cast * cast +
    PROFILE_WEIGHTS.keywords * keywords +
    PROFILE_WEIGHTS.rating * rating +
    PROFILE_WEIGHTS.popularity * popularity
  );
}

/** Find the watched movie most similar to a candidate (for the "reason"). */
function bestWatchedMatch(candidate, history) {
  let best = null;
  let bestScore = -1;
  for (const h of history) {
    const s = movieSimilarity(candidate, h);
    if (s > bestScore) {
      bestScore = s;
      best = h;
    }
  }
  return best;
}

/** Persist the taste profile into user_preferences (idempotent). */
function rebuildUserPreferences(userId, history) {
  const profile = buildProfile(history);
  db.transaction(() => {
    db.prepare('DELETE FROM user_preferences WHERE user_id = ?').run(userId);
    const insert = db.prepare(
      `INSERT INTO user_preferences (id, user_id, category, value, weight)
       VALUES (?, ?, ?, ?, ?)`
    );
    const push = (category, map) => {
      for (const [value, weight] of map) {
        insert.run(randomUUID(), userId, category, value, Math.round(weight * 100) / 100);
      }
    };
    push('genre', profile.genres);
    push('language', profile.languages);
    push('director', profile.directors);
    push('cast', profile.cast);
    push('keywords', profile.keywords);
    if (profile.avgRating != null) {
      insert.run(randomUUID(), userId, 'rating', String(Math.round(profile.avgRating * 10) / 10), 1);
    }
  })();
}

function popularRecommendations(limit) {
  const rows = db
    .prepare(
      `SELECT * FROM movies
        WHERE status = 'now_showing'
        ORDER BY popularity_score DESC, rating DESC
        LIMIT ?`
    )
    .all(limit);
  return rows.map((m) => ({
    ...toMovie(m),
    score: Math.round(m.popularity_score || 0),
    reason: m.rating > 0 ? `Popular • rated ${Number(m.rating).toFixed(1)}` : 'Trending now'
  }));
}

function personalizedRecommendations(userId, limit) {
  const history = watchedMovies(userId);
  if (history.length === 0) return popularRecommendations(limit);

  // Keep the cached preferences fresh for the profile page.
  rebuildUserPreferences(userId, history);

  const profile = buildProfile(history);
  const watchedIds = new Set(history.map((m) => m.id));

  const candidates = db
    .prepare(`SELECT * FROM movies WHERE status = 'now_showing'`)
    .all()
    .filter((m) => !watchedIds.has(m.id));

  if (candidates.length === 0) return popularRecommendations(limit);

  const scored = candidates.map((m) => ({ movie: m, score: profileScore(profile, m) }));
  const ranked = normalizeScores(sortByScoreThenPopularity(scored)).slice(0, limit);

  return ranked.map(({ movie: m, score }) => {
    const match = bestWatchedMatch(m, history);
    return {
      ...toMovie(m),
      score,
      reason: match ? `Because you watched ${match.title}` : 'Matches your taste profile'
    };
  });
}

/**
 * Entry point used by GET /api/recommendations.
 * @param {string|null} userId  null for guests → popular fallback.
 * @param {{limit?: number}} [opts]
 */
function getRecommendationsForUser(userId, { limit = 10 } = {}) {
  if (!userId) return popularRecommendations(limit);
  return personalizedRecommendations(userId, limit);
}

/** Read the persisted taste profile (for the profile page). */
function getUserPreferences(userId) {
  const rows = db
    .prepare(
      `SELECT category, value, weight
         FROM user_preferences
        WHERE user_id = ?
        ORDER BY category, weight DESC`
    )
    .all(userId);
  const grouped = {};
  for (const r of rows) {
    if (!grouped[r.category]) grouped[r.category] = [];
    grouped[r.category].push({ value: r.value, weight: r.weight });
  }
  return grouped;
}

module.exports = {
  tokenize,
  movieSimilarity,
  getSimilarMovies,
  getRecommendationsForUser,
  getUserPreferences,
  rebuildUserPreferences
};
