'use strict';

/**
 * CineBook AI — booking routes (ALL protected)
 *   POST   /api/bookings        create a booking (transactional)
 *   GET    /api/bookings        user's booking history
 *   GET    /api/bookings/:id    single booking (ownership enforced)
 *   DELETE /api/bookings/:id    cancel a booking (releases seats)
 *
 * Booking creation, duplicate-seat prevention and cancellation all live
 * in services/bookingService.js (DB transactions + UNIQUE constraint).
 */

const { requireAuth } = require('../middleware/authMiddleware');
const { createError, asyncHandler } = require('../middleware/errorHandler');
const bookingService = require('../services/bookingService');

const router = require('express').Router();

router.use(requireAuth);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { showId, seatIds } = req.body || {};
    if (typeof showId !== 'string' || !showId.trim()) {
      throw createError(400, 'A show must be selected.');
    }
    if (!Array.isArray(seatIds)) {
      throw createError(400, 'Seat selection must be an array.');
    }

    const booking = bookingService.createBooking(req.user.id, showId, seatIds);
    return res.status(201).json({
      success: true,
      message: 'Booking confirmed. Enjoy the show!',
      booking
    });
  })
);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const bookings = bookingService.listUserBookings(req.user.id);
    return res.json({ success: true, count: bookings.length, bookings });
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    // Ownership is enforced inside the service (403 for other users).
    const booking = bookingService.getBookingById(req.params.id, req.user.id);
    return res.json({ success: true, booking });
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const booking = bookingService.cancelBooking(req.user.id, req.params.id);
    return res.json({
      success: true,
      message: 'Booking cancelled. Your seats have been released.',
      booking
    });
  })
);

module.exports = router;
