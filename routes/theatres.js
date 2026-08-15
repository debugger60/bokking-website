'use strict';

/**
 * CineBook AI — theatre routes
 *   GET /api/theatres      list all theatres
 *   GET /api/theatres/:id  theatre detail with screens + upcoming shows
 */

const db = require('../database/database');
const { createError, asyncHandler } = require('../middleware/errorHandler');

const router = require('express').Router();

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const today = todayStr();
    const theatres = db
      .prepare(
        `SELECT t.*,
                (SELECT COUNT(*) FROM shows s WHERE s.theatre_id = t.id AND s.show_date >= ?) AS upcoming_shows
           FROM theatres t
          ORDER BY t.city, t.name`
      )
      .all(today);

    return res.json({
      success: true,
      count: theatres.length,
      theatres: theatres.map((t) => ({
        id: t.id,
        name: t.name,
        city: t.city,
        address: t.address,
        screens: t.screens,
        upcomingShows: t.upcoming_shows
      }))
    });
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const theatre = db.prepare('SELECT * FROM theatres WHERE id = ?').get(req.params.id);
    if (!theatre) throw createError(404, 'Theatre not found.');

    const screens = db
      .prepare(
        `SELECT id, screen_number, name, total_seats
           FROM screens WHERE theatre_id = ?
          ORDER BY screen_number`
      )
      .all(theatre.id);

    const today = todayStr();
    const shows = db
      .prepare(
        `SELECT s.id, s.show_date, s.start_time, s.end_time, s.ticket_price,
                sc.name AS screen_name,
                m.id AS movie_id, m.title AS movie_title, m.poster_url,
                m.genre, m.language, m.age_rating, m.duration
           FROM shows s
           JOIN screens sc ON sc.id = s.screen_id
           JOIN movies m   ON m.id  = s.movie_id
          WHERE s.theatre_id = ? AND s.show_date >= ?
          ORDER BY s.show_date, s.start_time
          LIMIT 200`
      )
      .all(theatre.id, today);

    return res.json({
      success: true,
      theatre: {
        id: theatre.id,
        name: theatre.name,
        city: theatre.city,
        address: theatre.address,
        screens: theatre.screens
      },
      screens: screens.map((s) => ({
        id: s.id,
        screenNumber: s.screen_number,
        name: s.name,
        totalSeats: s.total_seats
      })),
      shows: shows.map((s) => ({
        id: s.id,
        date: s.show_date,
        startTime: s.start_time,
        endTime: s.end_time,
        ticketPrice: s.ticket_price,
        screenName: s.screen_name,
        movie: {
          id: s.movie_id,
          title: s.movie_title,
          posterUrl: s.poster_url,
          genre: s.genre,
          language: s.language,
          ageRating: s.age_rating,
          duration: s.duration
        }
      }))
    });
  })
);

module.exports = router;
