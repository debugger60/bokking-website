-- -----------------------------------------------------------------------------
-- CineBook AI — SQLite schema
-- Executed by database/database.js on every server start (idempotent).
-- All foreign keys are enforced. Deletes cascade where it makes sense.
-- -----------------------------------------------------------------------------

PRAGMA foreign_keys = ON;

-- Users -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Movies ------------------------------------------------------------
-- genre / language / cast / keywords are stored as comma-separated
-- strings so the recommendation engine can tokenize them easily.
-- status: 'now_showing' | 'coming_soon'
CREATE TABLE IF NOT EXISTS movies (
  id               TEXT PRIMARY KEY,
  title            TEXT NOT NULL,
  description      TEXT NOT NULL,
  genre            TEXT NOT NULL,
  language         TEXT NOT NULL,
  duration         INTEGER NOT NULL DEFAULT 0,
  release_date     TEXT NOT NULL,
  rating           REAL NOT NULL DEFAULT 0,
  poster_url       TEXT,
  backdrop_url     TEXT,
  trailer_url      TEXT,
  director         TEXT,
  cast             TEXT,
  age_rating       TEXT,
  popularity_score REAL NOT NULL DEFAULT 0,
  keywords         TEXT,
  status           TEXT NOT NULL DEFAULT 'now_showing'
);

-- Theatres ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS theatres (
  id      TEXT PRIMARY KEY,
  name    TEXT NOT NULL,
  city    TEXT NOT NULL,
  address TEXT NOT NULL,
  screens INTEGER NOT NULL DEFAULT 1
);

-- Screens (each theatre has multiple screens) ------------------------
CREATE TABLE IF NOT EXISTS screens (
  id            TEXT PRIMARY KEY,
  theatre_id    TEXT NOT NULL REFERENCES theatres(id) ON DELETE CASCADE,
  screen_number INTEGER NOT NULL,
  name          TEXT NOT NULL,
  total_seats   INTEGER NOT NULL DEFAULT 0
);

-- Seats (physical seats belonging to a screen) -----------------------
CREATE TABLE IF NOT EXISTS seats (
  id          TEXT PRIMARY KEY,
  screen_id   TEXT NOT NULL REFERENCES screens(id) ON DELETE CASCADE,
  row_label   TEXT NOT NULL,
  seat_number INTEGER NOT NULL,
  seat_code   TEXT NOT NULL,
  seat_type   TEXT NOT NULL DEFAULT 'standard',
  UNIQUE (screen_id, seat_code)
);

-- Shows (a movie screened in a theatre screen on a date/time) --------
CREATE TABLE IF NOT EXISTS shows (
  id           TEXT PRIMARY KEY,
  movie_id     TEXT NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
  theatre_id   TEXT NOT NULL REFERENCES theatres(id) ON DELETE CASCADE,
  screen_id    TEXT NOT NULL REFERENCES screens(id) ON DELETE CASCADE,
  show_date    TEXT NOT NULL,
  start_time   TEXT NOT NULL,
  end_time     TEXT NOT NULL,
  ticket_price REAL NOT NULL
);

-- Bookings ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bookings (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  show_id           TEXT NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
  booking_reference TEXT NOT NULL UNIQUE,
  total_amount      REAL NOT NULL,
  status            TEXT NOT NULL DEFAULT 'confirmed',
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Booking seats ------------------------------------------------------
-- UNIQUE(show_id, seat_id) prevents the same seat being booked twice
-- for the same show (duplicate-seat protection lives at the DB level).
CREATE TABLE IF NOT EXISTS booking_seats (
  id         TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  show_id    TEXT NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
  seat_id    TEXT NOT NULL REFERENCES seats(id) ON DELETE CASCADE,
  price      REAL NOT NULL,
  UNIQUE (show_id, seat_id)
);

-- Reviews (1-5 stars + text, one per user per movie) -----------------
CREATE TABLE IF NOT EXISTS reviews (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  movie_id    TEXT NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
  rating      INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  review_text TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, movie_id)
);

-- User preferences (cache built from booking history) ----------------
CREATE TABLE IF NOT EXISTS user_preferences (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category   TEXT NOT NULL,   -- 'genre' | 'language' | 'director' | 'cast' | 'rating'
  value      TEXT NOT NULL,
  weight     REAL NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, category, value)
);

-- Session store (used by express-session, implemented in server.js) --
CREATE TABLE IF NOT EXISTS sessions (
  sid    TEXT PRIMARY KEY,
  sess   TEXT NOT NULL,
  expire INTEGER NOT NULL
);

-- Indexes -------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_movies_status          ON movies(status);
CREATE INDEX IF NOT EXISTS idx_shows_movie            ON shows(movie_id);
CREATE INDEX IF NOT EXISTS idx_shows_theatre          ON shows(theatre_id);
CREATE INDEX IF NOT EXISTS idx_shows_date             ON shows(show_date);
CREATE INDEX IF NOT EXISTS idx_screens_theatre        ON screens(theatre_id);
CREATE INDEX IF NOT EXISTS idx_seats_screen           ON seats(screen_id);
CREATE INDEX IF NOT EXISTS idx_bookings_user          ON bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_booking_seats_booking  ON booking_seats(booking_id);
CREATE INDEX IF NOT EXISTS idx_booking_seats_show     ON booking_seats(show_id);
CREATE INDEX IF NOT EXISTS idx_reviews_movie          ON reviews(movie_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expire        ON sessions(expire);
