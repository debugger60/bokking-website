'use strict';

/**
 * CineBook AI — booking service
 *
 * All ticket-booking logic lives here (not in the route layer):
 * seat-map building, price calculation, transactional booking creation,
 * duplicate-seat prevention, retrieval and cancellation.
 *
 * Pricing is ALWAYS recomputed server-side from the show's ticket price
 * (never trusted from the client):
 *   subtotal       = ticketPrice × seatCount
 *   convenienceFee = 5% of subtotal
 *   gst            = 18% of (subtotal + convenienceFee)
 *   total          = subtotal + convenienceFee + gst
 */

const { randomUUID } = require('crypto');
const db = require('../database/database');
const { HttpError } = require('../middleware/errorHandler');

const CONVENIENCE_FEE_RATE = 0.05;
const GST_RATE = 0.18;
const MAX_SEATS_PER_BOOKING = 10;

/* ------------------------------------------------------------------ */
/*  Pricing                                                           */
/* ------------------------------------------------------------------ */

function round2(n) {
  return Math.round(n * 100) / 100;
}

function computePriceBreakdown(ticketPrice, seatCount) {
  const price = round2(ticketPrice);
  const subtotal = round2(price * seatCount);
  const convenienceFee = round2(subtotal * CONVENIENCE_FEE_RATE);
  const gst = round2((subtotal + convenienceFee) * GST_RATE);
  const total = round2(subtotal + convenienceFee + gst);
  return { ticketPrice: price, seatCount, subtotal, convenienceFee, gst, total };
}

/* ------------------------------------------------------------------ */
/*  Booking reference                                                 */
/* ------------------------------------------------------------------ */

function generateBookingReference() {
  for (let i = 0; i < 5; i += 1) {
    const ref =
      'CB' +
      Date.now().toString(36).toUpperCase() +
      Math.random().toString(36).slice(2, 8).toUpperCase();
    const exists = db.prepare('SELECT 1 FROM bookings WHERE booking_reference = ?').get(ref);
    if (!exists) return ref;
  }
  return 'CB' + randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase();
}

/* ------------------------------------------------------------------ */
/*  Seat map                                                          */
/* ------------------------------------------------------------------ */

function getSeatMap(showId) {
  const show = db
    .prepare(
      `SELECT s.id, s.movie_id, s.theatre_id, s.screen_id, s.show_date,
              s.start_time, s.end_time, s.ticket_price,
              m.title AS movie_title,
              t.name AS theatre_name, t.city AS theatre_city,
              sc.name AS screen_name, sc.screen_number
         FROM shows s
         JOIN movies m   ON m.id = s.movie_id
         JOIN theatres t ON t.id = s.theatre_id
         JOIN screens sc ON sc.id = s.screen_id
        WHERE s.id = ?`
    )
    .get(showId);

  if (!show) throw new HttpError(404, 'Show not found.');

  const seats = db
    .prepare(
      `SELECT s.id, s.row_label, s.seat_number, s.seat_code, s.seat_type,
              CASE WHEN bs.id IS NULL THEN 0 ELSE 1 END AS booked
         FROM seats s
         LEFT JOIN booking_seats bs ON bs.seat_id = s.id AND bs.show_id = ?
        WHERE s.screen_id = ?
        ORDER BY s.row_label, s.seat_number`
    )
    .all(showId, show.screen_id);

  const rows = [];
  const byRow = new Map();
  for (const s of seats) {
    if (!byRow.has(s.row_label)) byRow.set(s.row_label, []);
    byRow.get(s.row_label).push({
      id: s.id,
      code: s.seat_code,
      seatType: s.seat_type,
      booked: !!s.booked
    });
  }
  for (const [row, seatList] of byRow) rows.push({ row, seats: seatList });

  const bookedCount = seats.filter((s) => s.booked).length;

  return {
    show: {
      id: show.id,
      movieId: show.movie_id,
      movieTitle: show.movie_title,
      theatreId: show.theatre_id,
      theatreName: show.theatre_name,
      theatreCity: show.theatre_city,
      screenId: show.screen_id,
      screenName: show.screen_name,
      screenNumber: show.screen_number,
      date: show.show_date,
      startTime: show.start_time,
      endTime: show.end_time,
      ticketPrice: show.ticket_price
    },
    rows,
    totalSeats: seats.length,
    bookedCount,
    availableCount: seats.length - bookedCount
  };
}

/* ------------------------------------------------------------------ */
/*  Booking creation (transactional, duplicate-safe)                 */
/* ------------------------------------------------------------------ */

function createBooking(userId, showId, seatIds) {
  if (!Array.isArray(seatIds)) {
    throw new HttpError(400, 'Seat selection must be an array.');
  }

  const uniqueSeats = [...new Set(seatIds)];
  if (uniqueSeats.length === 0) throw new HttpError(400, 'Please select at least one seat.');
  if (uniqueSeats.length !== seatIds.length) {
    throw new HttpError(400, 'Duplicate seats detected in your selection.');
  }
  if (uniqueSeats.length > MAX_SEATS_PER_BOOKING) {
    throw new HttpError(400, `You can book at most ${MAX_SEATS_PER_BOOKING} seats per transaction.`);
  }

  const show = db
    .prepare(
      `SELECT s.*, m.title AS movie_title
         FROM shows s JOIN movies m ON m.id = s.movie_id
        WHERE s.id = ?`
    )
    .get(showId);
  if (!show) throw new HttpError(404, 'Show not found.');

  // Do not allow booking a show that has already started.
  const showStart = new Date(`${show.show_date}T${show.start_time}:00`);
  if (showStart.getTime() <= Date.now()) {
    throw new HttpError(400, 'This show has already started. Please choose an upcoming show.');
  }

  const placeholders = uniqueSeats.map(() => '?').join(',');

  // Every seat must belong to the screen that hosts this show.
  const seatRows = db
    .prepare(
      `SELECT id, seat_code, row_label, seat_number
         FROM seats
        WHERE screen_id = ? AND id IN (${placeholders})`
    )
    .all(show.screen_id, ...uniqueSeats);
  if (seatRows.length !== uniqueSeats.length) {
    throw new HttpError(400, 'One or more seats do not belong to the selected screen.');
  }

  // Price is computed server-side from the show's ticket price.
  const breakdown = computePriceBreakdown(show.ticket_price, seatRows.length);

  let bookingId;
  try {
    const run = db.transaction(() => {
      // Re-check availability INSIDE the transaction so the booking is atomic.
      const conflict = db
        .prepare(
          `SELECT COUNT(*) AS n FROM booking_seats
            WHERE show_id = ? AND seat_id IN (${placeholders})`
        )
        .get(show.id, ...uniqueSeats).n;
      if (conflict > 0) {
        throw new HttpError(409, 'One or more selected seats were just booked. Please choose different seats.');
      }

      const id = randomUUID();
      const ref = generateBookingReference();
      db.prepare(
        `INSERT INTO bookings (id, user_id, show_id, booking_reference, total_amount, status)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(id, userId, show.id, ref, breakdown.total, 'confirmed');

      const insertSeat = db.prepare(
        `INSERT INTO booking_seats (id, booking_id, show_id, seat_id, price)
         VALUES (?, ?, ?, ?, ?)`
      );
      for (const s of seatRows) {
        insertSeat.run(randomUUID(), id, show.id, s.id, show.ticket_price);
      }
      return id;
    });
    bookingId = run();
  } catch (err) {
    // Safety net if the UNIQUE(show_id, seat_id) constraint trips anyway.
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      throw new HttpError(409, 'One or more selected seats were just booked. Please choose different seats.');
    }
    throw err;
  }

  return getBookingById(bookingId);
}

/* ------------------------------------------------------------------ */
/*  Booking retrieval / listing / cancellation                        */
/* ------------------------------------------------------------------ */

function getBookingById(bookingId, userId = null) {
  const b = db
    .prepare(
      `SELECT b.*,
              s.show_date, s.start_time, s.end_time, s.ticket_price,
              sc.name AS screen_name, sc.screen_number,
              m.id AS movie_id, m.title AS movie_title, m.poster_url, m.backdrop_url,
              m.genre, m.language, m.duration, m.age_rating,
              t.id AS theatre_id, t.name AS theatre_name, t.city AS theatre_city, t.address AS theatre_address,
              u.name AS customer_name, u.email AS customer_email
         FROM bookings b
         JOIN shows s    ON s.id  = b.show_id
         JOIN screens sc ON sc.id = s.screen_id
         JOIN movies m   ON m.id  = s.movie_id
         JOIN theatres t ON t.id  = s.theatre_id
         JOIN users u    ON u.id  = b.user_id
        WHERE b.id = ?`
    )
    .get(bookingId);

  if (!b) throw new HttpError(404, 'Booking not found.');
  if (userId && b.user_id !== userId) {
    throw new HttpError(403, 'You do not have access to this booking.');
  }

  const seatRows = db
    .prepare(
      `SELECT s.id, s.row_label, s.seat_number, s.seat_code, bs.price
         FROM booking_seats bs JOIN seats s ON s.id = bs.seat_id
        WHERE bs.booking_id = ?
        ORDER BY s.row_label, s.seat_number`
    )
    .all(bookingId);

  const breakdown = computePriceBreakdown(b.ticket_price, seatRows.length);

  return {
    id: b.id,
    bookingReference: b.booking_reference,
    status: b.status,
    createdAt: b.created_at,
    totalAmount: b.total_amount,
    breakdown,
    customer: { name: b.customer_name, email: b.customer_email },
    movie: {
      id: b.movie_id,
      title: b.movie_title,
      posterUrl: b.poster_url,
      backdropUrl: b.backdrop_url,
      genre: b.genre,
      language: b.language,
      duration: b.duration,
      ageRating: b.age_rating
    },
    theatre: { id: b.theatre_id, name: b.theatre_name, city: b.theatre_city, address: b.theatre_address },
    screen: { name: b.screen_name, number: b.screen_number },
    show: { date: b.show_date, startTime: b.start_time, endTime: b.end_time, ticketPrice: b.ticket_price },
    seats: seatRows.map((s) => ({
      id: s.id,
      code: s.seat_code,
      row: s.row_label,
      number: s.seat_number,
      price: s.price
    }))
  };
}

function listUserBookings(userId) {
  const rows = db
    .prepare(
      `SELECT b.id, b.booking_reference, b.total_amount, b.status, b.created_at,
              s.show_date, s.start_time, s.end_time, s.ticket_price,
              sc.name AS screen_name,
              m.id AS movie_id, m.title AS movie_title, m.poster_url,
              m.genre, m.language, m.duration, m.age_rating,
              t.name AS theatre_name, t.city AS theatre_city
         FROM bookings b
         JOIN shows s    ON s.id  = b.show_id
         JOIN screens sc ON sc.id = s.screen_id
         JOIN movies m   ON m.id  = s.movie_id
         JOIN theatres t ON t.id  = s.theatre_id
        WHERE b.user_id = ?
        ORDER BY b.created_at DESC, b.id DESC`
    )
    .all(userId);

  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const placeholders = ids.map(() => '?').join(',');
  const seatRows = db
    .prepare(
      `SELECT bs.booking_id, s.seat_code
         FROM booking_seats bs JOIN seats s ON s.id = bs.seat_id
        WHERE bs.booking_id IN (${placeholders})
        ORDER BY s.row_label, s.seat_number`
    )
    .all(...ids);

  const seatsByBooking = {};
  for (const r of seatRows) {
    if (!seatsByBooking[r.booking_id]) seatsByBooking[r.booking_id] = [];
    seatsByBooking[r.booking_id].push(r.seat_code);
  }

  return rows.map((r) => ({
    id: r.id,
    bookingReference: r.booking_reference,
    status: r.status,
    createdAt: r.created_at,
    totalAmount: r.total_amount,
    ticketPrice: r.ticket_price,
    screenName: r.screen_name,
    show: { date: r.show_date, startTime: r.start_time, endTime: r.end_time },
    movie: {
      id: r.movie_id,
      title: r.movie_title,
      posterUrl: r.poster_url,
      genre: r.genre,
      language: r.language,
      duration: r.duration,
      ageRating: r.age_rating
    },
    theatre: { name: r.theatre_name, city: r.theatre_city },
    seats: seatsByBooking[r.id] || []
  }));
}

function cancelBooking(userId, bookingId) {
  const b = db.prepare('SELECT * FROM bookings WHERE id = ?').get(bookingId);
  if (!b) throw new HttpError(404, 'Booking not found.');
  if (b.user_id !== userId) {
    throw new HttpError(403, 'You do not have access to this booking.');
  }
  if (b.status === 'cancelled') {
    throw new HttpError(409, 'This booking is already cancelled.');
  }

  const show = db
    .prepare('SELECT show_date, start_time FROM shows WHERE id = ?')
    .get(b.show_id);
  const showStart = new Date(`${show.show_date}T${show.start_time}:00`);
  if (showStart.getTime() <= Date.now()) {
    throw new HttpError(400, 'Cannot cancel a booking for a show that has already started.');
  }

  db.transaction(() => {
    // Release the seats so they can be booked again.
    db.prepare('DELETE FROM booking_seats WHERE booking_id = ?').run(bookingId);
    db.prepare('UPDATE bookings SET status = ? WHERE id = ?').run('cancelled', bookingId);
  })();

  return getBookingById(bookingId);
}

module.exports = {
  computePriceBreakdown,
  getSeatMap,
  createBooking,
  getBookingById,
  listUserBookings,
  cancelBooking
};
