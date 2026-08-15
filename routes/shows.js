'use strict';

/**
 * CineBook AI — show routes
 *   GET /api/shows             list shows (filters: movieId, theatreId, date, city)
 *   GET /api/shows/:id         single show detail
 *   GET /api/shows/:id/seats   live seat map (availability from the database)
 */

const db = require('../database/database');
const { createError, asyncHandler } = require('../middleware/errorHandler');
const bookingService = require('../services/bookingService');

const router = require('express').Router();

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const SHOW_SELECT = `
  SELECT s.id, s.show_date, s.start_time, s.end_time, s.ticket_price,
         sc.id AS screen_id, sc.name AS screen_name, sc.screen_number, sc.total_seats,
         m.id AS movie_id, m.title AS movie_title, m.poster_url,
         m.genre, m.language, m.age_rating, m.duration,
         t.id AS theatre_id, t.name AS theatre_name, t.city AS theatre_city, t.address AS theatre_address,
         (SELECT COUNT(*) FROM booking_seats bs WHERE bs.show_id = s.id) AS booked_count
    FROM shows s
    JOIN screens sc ON sc.id = s.screen_id
    JOIN movies m   ON m.id  = s.movie_id
    JOIN theatres t ON t.id  = s.theatre_id
`;

function toShow(row) {
  return {
    id: row.id,
    date: row.show_date,
    startTime: row.start_time,
    endTime: row.end_time,
    ticketPrice: row.ticket_price,
    screen: { id: row.screen_id, name: row.screen_name, number: row.screen_number },
    movie: {
      id: row.movie_id,
      title: row.movie_title,
      posterUrl: row.poster_url,
      genre: row.genre,
      language: row.language,
      ageRating: row.age_rating,
      duration: row.duration
    },
    theatre: {
      id: row.theatre_id,
      name: row.theatre_name,
      city: row.theatre_city,
      address: row.theatre_address
    },
    bookedCount: row.booked_count || 0,
    availableCount: Math.max(0, (row.total_seats || 0) - (row.booked_count || 0))
  };
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const where = [];
    const params = [];

    if (req.query.movieId) {
      where.push('s.movie_id = ?');
      params.push(req.query.movieId);
    }
    if (req.query.theatreId) {
      where.push('s.theatre_id = ?');
      params.push(req.query.theatreId);
    }
    if (req.query.city) {
      where.push('LOWER(t.city) = LOWER(?)');
      params.push(String(req.query.city).slice(0, 80));
    }
    if (req.query.date) {
      if (!DATE_RE.test(req.query.date)) {
        throw createError(400, 'date must be in YYYY-MM-DD format.');
      }
      where.push('s.show_date = ?');
      params.push(req.query.date);
    } else {
      // Default: only upcoming shows.
      where.push('s.show_date >= ?');
      params.push(todayStr());
    }

    const sql = SHOW_SELECT + ' WHERE ' + where.join(' AND ') + ' ORDER BY s.show_date, s.start_time LIMIT 300';
    const rows = db.prepare(sql).all(...params);

    return res.json({ success: true, count: rows.length, shows: rows.map(toShow) });
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const row = db.prepare(SHOW_SELECT + ' WHERE s.id = ?').get(req.params.id);
    if (!row) throw createError(404, 'Show not found.');
    return res.json({ success: true, show: toShow(row) });
  })
);

router.get(
  '/:id/seats',
  asyncHandler(async (req, res) => {
    const seatMap = bookingService.getSeatMap(req.params.id);
    return res.json({ success: true, ...seatMap });
  })
);

module.exports = router;
