'use strict';

/**
 * CineBook AI — HTTP error type + centralized error handling middleware.
 *
 * Routes/services throw `HttpError` for expected failures (404, 400, 409…);
 * everything else is treated as a 500 and logged. All errors are returned
 * as JSON in a consistent shape: { success: false, message }.
 */

class HttpError extends Error {
  /**
   * @param {number} status   HTTP status code (4xx/5xx)
   * @param {string} message  Human-readable, client-safe message
   */
  constructor(status, message) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    // Always safe to expose to the client.
    this.expose = true;
    Error.captureStackTrace(this, HttpError);
  }
}

/** Convenience alias so callers can `const { createError } = ...`. */
const createError = (status, message) => new HttpError(status, message);

/**
 * Wraps an async route handler so rejected promises are forwarded to the
 * central error handler instead of crashing the process.
 */
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

/**
 * 404 fallback for unknown routes.
 */
function notFound(req, res) {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({
      success: false,
      message: `Endpoint not found: ${req.method} ${req.originalUrl}`
    });
  }
  return res.status(404).send('Not found');
}

/**
 * Centralized error handler (must be registered LAST).
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  // Malformed JSON body (express.json SyntaxError).
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, message: 'Invalid JSON in request body.' });
  }

  // Body too large.
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ success: false, message: 'Request body too large.' });
  }

  // SQLite duplicate-seat / unique-constraint safety net (normally the
  // booking service catches these first and throws a friendlier 409).
  if (err.code && err.code.startsWith('SQLITE_CONSTRAINT')) {
    return res.status(409).json({
      success: false,
      message: 'That action conflicts with existing data. Please refresh and try again.'
    });
  }

  const status = err.status || err.statusCode || 500;
  const message = status < 500 ? err.message : 'Internal server error.';

  if (status >= 500) {
    // Log full stack server-side, but never leak it to the client.
    console.error(`[error] ${req.method} ${req.originalUrl} ->`, err);
  }

  return res.status(status).json({ success: false, message });
}

module.exports = { HttpError, createError, asyncHandler, notFound, errorHandler };
