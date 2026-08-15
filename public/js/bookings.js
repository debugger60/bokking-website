'use strict';
/* =========================================================================
   CineBook AI — bookings.js
   Booking history cards, ticket modal, cancellation.
   ========================================================================= */
(function () {
  if (document.body.dataset.page !== 'bookings') return;

  const els = {
    list: document.getElementById('bookings-list'),
    empty: document.getElementById('bookings-empty'),
    login: document.getElementById('bookings-login'),
    modal: document.getElementById('ticket-modal'),
    modalContent: document.getElementById('ticket-modal-content')
  };

  function cardHTML(b) {
    const cancelled = b.status === 'cancelled';
    const poster = b.movie.posterUrl
      ? '<img src="' + escapeHTML(b.movie.posterUrl) + '" alt="' + escapeHTML(b.movie.title) + ' poster" loading="lazy" onerror="MovieCard.imgError(this)" />'
      : '<div class="poster-fallback"><span class="emoji">🎬</span></div>';
    const seatChips = (b.seats || []).map(function (c) { return '<span class="chip">' + escapeHTML(c) + '</span>'; }).join('');

    return '<article class="booking-card" data-id="' + escapeHTML(b.id) + '">' +
      '<div class="booking-card-poster">' + poster + '</div>' +
      '<div class="booking-card-info">' +
        '<h2 class="booking-card-title">' + escapeHTML(b.movie.title) + '</h2>' +
        '<div class="booking-card-meta">' +
          '<span>' + escapeHTML(b.theatre.name + ', ' + b.theatre.city) + '</span>' +
          '<span>' + escapeHTML(fmtDate(b.show.date)) + '</span>' +
          '<span>' + escapeHTML(b.show.startTime) + '</span>' +
          (b.screenName ? '<span>' + escapeHTML(b.screenName) + '</span>' : '') +
        '</div>' +
        '<div class="booking-card-seats">' + seatChips + '</div>' +
      '</div>' +
      '<div class="booking-card-side">' +
        '<span class="booking-ref">' + escapeHTML(b.bookingReference) + '</span>' +
        '<span class="status-badge ' + (cancelled ? 'status-cancelled' : 'status-confirmed') + '">' + (cancelled ? 'Cancelled' : 'Confirmed') + '</span>' +
        '<span class="booking-total">' + fmtMoney(b.totalAmount) + '</span>' +
        '<div class="booking-actions">' +
          '<button type="button" class="btn btn-outline view-btn" data-id="' + escapeHTML(b.id) + '">View ticket</button>' +
          (cancelled ? '' : '<button type="button" class="btn btn-ghost cancel-btn" data-id="' + escapeHTML(b.id) + '">Cancel</button>') +
        '</div>' +
      '</div>' +
    '</article>';
  }

  async function loadBookings() {
    els.list.innerHTML = '<div class="loading"><span class="spinner"></span>Loading your bookings…</div>';
    try {
      const data = await API.get('/api/bookings');
      const bookings = data.bookings || [];
      if (!bookings.length) {
        els.list.innerHTML = '';
        els.empty.hidden = false;
        return;
      }
      els.empty.hidden = true;
      els.list.innerHTML = bookings.map(cardHTML).join('');

      els.list.querySelectorAll('.view-btn').forEach(function (b) {
        b.addEventListener('click', function () { openTicket(b.dataset.id); });
      });
      els.list.querySelectorAll('.cancel-btn').forEach(function (b) {
        b.addEventListener('click', function () { cancelBooking(b.dataset.id); });
      });
    } catch (err) {
      els.list.innerHTML = '<div class="empty-state"><h2>Could not load bookings</h2><p>' + escapeHTML(err.message) + '</p></div>';
    }
  }

  function openModal() { els.modal.hidden = false; }
  function closeModal() { els.modal.hidden = true; }

  async function openTicket(id) {
    openModal();
    els.modalContent.innerHTML = '<div class="loading"><span class="spinner"></span>Loading ticket…</div>';
    try {
      const data = await API.get('/api/bookings/' + encodeURIComponent(id));
      els.modalContent.innerHTML = renderTicketHTML(data.booking);
    } catch (err) {
      els.modalContent.innerHTML = '<div class="empty-state"><p>' + escapeHTML(err.message) + '</p></div>';
    }
  }

  async function cancelBooking(id) {
    if (!window.confirm('Cancel this booking? Your seats will be released.')) return;
    try {
      await API.del('/api/bookings/' + encodeURIComponent(id));
      showToast('Booking cancelled.', 'success');
      loadBookings();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  function initModal() {
    els.modal.addEventListener('click', function (e) {
      if (e.target && e.target.hasAttribute && e.target.hasAttribute('data-close')) closeModal();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !els.modal.hidden) closeModal();
    });
  }

  async function boot() {
    initModal();
    const user = await Auth.init();
    if (!user) {
      els.login.hidden = false;
      els.empty.hidden = true;
      els.list.innerHTML = '';
      return;
    }
    await loadBookings();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
