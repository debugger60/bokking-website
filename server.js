'use strict';

/**
 * CineBook AI — Express application entry point.
 *
 * Boot order:
 *   1. load environment (.env)
 *   2. open SQLite (schema applied by database/database.js)
 *   3. auto-seed if the database is empty (so `npm install && npm start`
 *      works with zero manual steps)
 *   4. session (SQLite-backed), CORS, JSON parsing, static files
 *   5. REST API routes
 *   6. 404 + centralized error handling
 *   7. listen
 */

require('dotenv').config();

const path = require('path');
const express = require('express');
const session = require('express-session');
const cors = require('cors');

const db = require('./database/database');
const { seedDatabase } = require('./database/seed');

const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

app.disable('x-powered-by');
// Required so cookies / secure flags behave correctly behind a proxy
// (e.g. the hosted preview environment).
app.set('trust proxy', 1);

/* ------------------------------------------------------------------ *
 *  1. Auto-seed on first boot
 * ------------------------------------------------------------------ */
const movieCount = db.prepare('SELECT COUNT(*) AS n FROM movies').get().n;
if (movieCount === 0) {
  console.log('[server] Empty database detected — seeding…');
  seedDatabase();
}

/* ------------------------------------------------------------------ *
 *  2. SQLite-backed session store (express-session)
 * ------------------------------------------------------------------ */
class SqliteSessionStore extends session.Store {
  get(sid, cb) {
    try {
      const row = db.prepare('SELECT sess, expire FROM sessions WHERE sid = ?').get(sid);
      if (!row) return cb(null, null);
      if (row.expire && row.expire < Date.now()) {
        db.prepare('DELETE FROM sessions WHERE sid = ?').run(sid);
        return cb(null, null);
      }
      let data = null;
      try {
        data = JSON.parse(row.sess);
      } catch (_) {
        data = null;
      }
      cb(null, data);
    } catch (err) {
      cb(err);
    }
  }

  set(sid, sess, cb) {
    try {
      const expire =
        (sess.cookie && sess.cookie.expires)
          ? new Date(sess.cookie.expires).getTime()
          : Date.now() + ((sess.cookie && sess.cookie.maxAge) || 86400000);
      db.prepare(
        `INSERT INTO sessions (sid, sess, expire) VALUES (?, ?, ?)
         ON CONFLICT(sid) DO UPDATE SET sess = excluded.sess, expire = excluded.expire`
      ).run(sid, JSON.stringify(sess), expire);
      cb(null);
    } catch (err) {
      cb(err);
    }
  }

  destroy(sid, cb) {
    try {
      db.prepare('DELETE FROM sessions WHERE sid = ?').run(sid);
      cb(null);
    } catch (err) {
      cb(err);
    }
  }

  touch(sid, sess, cb) {
    try {
      const expire =
        (sess.cookie && sess.cookie.expires)
          ? new Date(sess.cookie.expires).getTime()
          : Date.now() + ((sess.cookie && sess.cookie.maxAge) || 86400000);
      db.prepare('UPDATE sessions SET expire = ? WHERE sid = ?').run(expire, sid);
      cb(null);
    } catch (err) {
      cb(err);
    }
  }
}

/* ------------------------------------------------------------------ *
 *  3. Core middleware
 * ------------------------------------------------------------------ */
app.use(
  cors({
    // Reflect the requesting origin when credentials are used; restrict
    // via CORS_ORIGIN in production if the frontend lives elsewhere.
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map((s) => s.trim()) : true,
    credentials: true
  })
);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));

app.use(
  session({
    name: 'cinebook.sid',
    secret: process.env.SESSION_SECRET || 'cinebook-ai-dev-secret-change-me',
    store: new SqliteSessionStore(),
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      // Keep false so the app also works over plain HTTP in development;
      // enable `secure: true` behind HTTPS in production.
      secure: false,
      maxAge: 1000 * 60 * 60 * 24 * 7 // 7 days
    }
  })
);

if (!process.env.SESSION_SECRET) {
  console.warn('[server] WARNING: SESSION_SECRET is not set — using an insecure default. Copy .env.example to .env in production.');
}

/* ------------------------------------------------------------------ *
 *  4. Static assets
 * ------------------------------------------------------------------ */

// Redirect trailing-slash URLs (e.g. /movies/ -> /movies) so users never
// hit the 404 handler for a page that actually exists, and so relative
// asset paths (css/, js/, assets/) always resolve against the right base.
app.use((req, res, next) => {
  if (req.path.length > 1 && req.path.endsWith('/')) {
    const query = req.url.slice(req.path.length);
    return res.redirect(301, req.path.slice(0, -1) + query);
  }
  next();
});

app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));
// Poster/backdrop fallbacks served from the assets directory.
app.use('/assets', express.static(path.join(__dirname, 'assets')));

/* ------------------------------------------------------------------ *
 *  5. API routes
 * ------------------------------------------------------------------ */
app.use('/api/auth', require('./routes/auth'));
app.use('/api/movies', require('./routes/movies'));
app.use('/api/theatres', require('./routes/theatres'));
app.use('/api/shows', require('./routes/shows'));
app.use('/api/bookings', require('./routes/bookings'));
app.use('/api/recommendations', require('./routes/recommendations'));
app.use('/api/users', require('./routes/users'));

// Lightweight health check (handy for smoke-testing the server).
app.get('/health', (req, res) => res.json({ success: true, status: 'ok', uptime: process.uptime() }));

/* ------------------------------------------------------------------ *
 *  6. 404 + centralized error handling
 * ------------------------------------------------------------------ */
app.use(notFound);
app.use(errorHandler);

/* ------------------------------------------------------------------ *
 *  7. Listen (only when run directly)
 * ------------------------------------------------------------------ */
if (require.main === module) {
  const server = app.listen(PORT, () => {
    console.log('---------------------------------------------');
    console.log('  CineBook AI server');
    console.log(`  Environment : ${NODE_ENV}`);
    console.log(`  Database    : ${db.DB_PATH}`);
    console.log(`  URL         : http://localhost:${PORT}`);
    console.log('---------------------------------------------');
  });

  const shutdown = () => {
    console.log('\n[server] Shutting down…');
    server.close(() => {
      db.close();
      process.exit(0);
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

module.exports = app;
