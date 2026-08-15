'use strict';
/* =========================================================================
   CineBook AI — booking.js
   Show summary, seat selection, live price breakdown, demo payment and
   the digital ticket confirmation.
   ========================================================================= */
(function () {
  if (document.body.dataset.page !== 'booking') return;

  const showId = new URLSearchParams(window.location.search).get('showId');
  const MAX_SEATS = 10;
  let ticketPrice = 0;
  const selected = new Map(); // seatId -> seatCode

  const els = {
    state: document.getElementById('booking-state'),
    layout: document.getElementById('booking-layout'),
    summaryPoster: document.getElementById('summary-poster'),
    movieTitle: document.getElementById('booking-movie-title'),
    movieMeta: document.getElementById('booking-movie-meta'),
    theatre: document.getElementById('booking-theatre'),
    screen: document.getElementById('booking-screen'),
    date: document.getElementById('booking-date'),
    time: document.getElementById('booking-time'),
    price: document.getElementById('booking-price'),
    seatMap: document.getElementById('seat-map'),
    selectedSeats: document.getElementById('selected-seats'),
    seatCount: document.getElementById('seat-count'),
    priceTicket: document.getElementById('price-ticket'),
    priceFee: document.getElementById('price-fee'),
    priceGst: document.getElementById('price-gst'),
    priceTotal: document.getElementById('price-total'),
    authNote: document.getElementById('booking-auth-note'),
    payBtn: document.getElementById('pay-btn'),
    confirm: document.getElementById('confirmation-section'),
    ticket: document.getElementById('digital-ticket'),
    changeLink: document.getElementById('change-show-link')
  };

  function showState(html) {
    els.layout.hidden = true;
    els.confirm.hidden = true;
    els.state.innerHTML = html;
  }

  async function loadShow() {
    if (!showId) {
      showState('<div class="empty-state"><h2>No show selected</h2><p>Pick a movie and showtime first.</p>' +
        '<a class="btn btn-primary" href="movies.html">Browse movies</a></div>');
      return;
    }
    try {
      const [showData, seatData] = await Promise.all([
        API.get('/api/shows/' + encodeURIComponent(showId)),
        API.get('/api/shows/' + encodeURIComponent(showId) + '/seats')
      ]);
      const showStart = new Date(showData.show.date + 'T' + showData.show.startTime + ':00');
      if (showStart.getTime() <= Date.now()) {
        showState('<div class="empty-state"><h2>This show has already started</h2><p>Please pick an upcoming showtime.</p>' +
          '<a class="btn btn-primary" href="movies.html">Browse movies</a></div>');
        return;
      }
      renderSummary(showData.show);
      renderSeatMap(seatData.rows);
      ticketPrice = showData.show.ticketPrice;
      els.layout.hidden = false;
      els.state.innerHTML = '';
    } catch (err) {
      showState('<div class="empty-state"><h2>Show not available</h2><p>' + escapeHTML(err.message) + '</p>' +
        '<a class="btn btn-primary" href="movies.html">Browse movies</a></div>');
    }
  }

  function renderSummary(show) {
    els.changeLink.href = 'movie-details.html?id=' + encodeURIComponent(show.movie.id) + '#booking-panel';
    if (show.movie.posterUrl) {
      els.summaryPoster.innerHTML = '<img src="' + escapeHTML(show.movie.posterUrl) + '" alt="' + escapeHTML(show.movie.title) + ' poster" onerror="MovieCard.imgError(this)" />';
    } else {
      els.summaryPoster.innerHTML = '<div class="poster-fallback"><span class="emoji">🎬</span><span>' + escapeHTML(show.movie.title) + '</span></div>';
    }
    els.movieTitle.textContent = show.movie.title;
    els.movieMeta.textContent = [show.movie.genre, show.movie.language, show.movie.duration ? show.movie.duration + ' min' : '']
      .filter(Boolean).join(' • ');
    els.theatre.textContent = show.theatre.name + ', ' + show.theatre.city;
    els.screen.textContent = show.screen.name;
    els.date.textContent = fmtDate(show.date);
    els.time.textContent = show.startTime + ' – ' + show.endTime;
    els.price.textContent = fmtMoney(show.ticketPrice);
  }

  function renderSeatMap(rows) {
    els.seatMap.innerHTML = rows.map(function (r) {
      return '<div class="seat-row">' +
        '<span class="seat-row-label">' + escapeHTML(r.row) + '</span>' +
        r.seats.map(function (s) {
          const cls = 'seat' +
            (s.booked ? ' booked' : ' available') +
            (s.seatType === 'premium' ? ' premium' : '');
          return '<button type="button" class="' + cls + '" data-id="' + escapeHTML(s.id) + '" data-code="' + escapeHTML(s.code) + '"' +
            (s.booked ? ' disabled' : '') + ' aria-label="Seat ' + escapeHTML(s.code) + (s.booked ? ' (booked)' : '') + '" aria-pressed="false">' + escapeHTML(s.code) + '</button>';
        }).join('') +
      '</div>';
    }).join('');

    els.seatMap.querySelectorAll('.seat.available').forEach(function (btn) {
      btn.addEventListener('click', function () { toggleSeat(btn); });
    });

    // Show a "Premium" legend entry only when the screen has premium seats.
    const hasPremium = rows.some(function (r) {
      return r.seats.some(function (s) { return s.seatType === 'premium'; });
    });
    const legend = document.querySelector('.seat-legend');
    if (legend && hasPremium && !legend.querySelector('.legend-premium')) {
      const item = document.createElement('span');
      item.className = 'legend legend-premium';
      item.textContent = 'Premium';
      legend.appendChild(item);
    }
  }

  function toggleSeat(btn) {
    const id = btn.dataset.id;
    const code = btn.dataset.code;
    if (selected.has(id)) {
      selected.delete(id);
      btn.classList.remove('selected');
      btn.classList.add('available');
      btn.setAttribute('aria-pressed', 'false');
    } else {
      if (selected.size >= MAX_SEATS) {
        showToast('You can book up to ' + MAX_SEATS + ' seats per transaction.', 'error');
        return;
      }
      selected.set(id, code);
      btn.classList.add('selected');
      btn.classList.remove('available');
      btn.setAttribute('aria-pressed', 'true');
    }
    updateSelection();
  }

  function updateSelection() {
    const codes = Array.from(selected.values());
    els.seatCount.textContent = String(codes.length);
    if (codes.length) {
      els.selectedSeats.innerHTML = codes.map(function (c) {
        return '<span class="seat-chip">' + escapeHTML(c) +
          '<button type="button" class="remove" data-code="' + escapeHTML(c) + '" aria-label="Remove seat ' + escapeHTML(c) + '">×</button></span>';
      }).join('');
      els.selectedSeats.querySelectorAll('.remove').forEach(function (b) {
        b.addEventListener('click', function () {
          let targetId = null;
          selected.forEach(function (val, key) { if (val === b.dataset.code) targetId = key; });
          if (targetId) selected.delete(targetId);
          const btn = els.seatMap.querySelector('.seat.selected[data-code="' + escapeHTML(b.dataset.code) + '"]');
          if (btn) { btn.classList.remove('selected'); btn.classList.add('available'); }
          updateSelection();
        });
      });
    } else {
      els.selectedSeats.innerHTML = '<p class="muted">No seats selected yet.</p>';
    }
    updatePrice();
  }

  function updatePrice() {
    const n = selected.size;
    const subtotal = Math.round(ticketPrice * n * 100) / 100;
    const fee = Math.round(subtotal * 0.05 * 100) / 100;
    const gst = Math.round((subtotal + fee) * 0.18 * 100) / 100;
    const total = Math.round((subtotal + fee + gst) * 100) / 100;
    els.priceTicket.textContent = fmtMoney(subtotal);
    els.priceFee.textContent = fmtMoney(fee);
    els.priceGst.textContent = fmtMoney(gst);
    els.priceTotal.textContent = fmtMoney(total);
    els.payBtn.disabled = n === 0;
  }

  async function initAuthState() {
    const user = await Auth.init();
    if (!user) {
      els.authNote.hidden = false;
      els.authNote.innerHTML = 'You need to <a href="' + 'login.html?redirect=' +
        encodeURIComponent('booking.html?showId=' + (showId || '')) + '">log in</a> to confirm your booking.';
    } else {
      els.authNote.hidden = true;
    }
  }

  async function reloadSeats() {
    try {
      const seatData = await API.get('/api/shows/' + encodeURIComponent(showId) + '/seats');
      selected.clear();
      renderSeatMap(seatData.rows);
      updateSelection();
      els.payBtn.disabled = true;
      els.payBtn.textContent = 'Pay & Confirm';
    } catch (err) { /* ignore */ }
  }

  function showTicket(booking) {
    els.layout.hidden = true;
    els.confirm.hidden = false;
    els.ticket.innerHTML = renderTicketHTML(booking) +
      '<div class="ticket-actions">' +
        '<a class="btn btn-primary" href="bookings.html">View my bookings</a>' +
        '<a class="btn btn-ghost" href="index.html">Back to home</a>' +
      '</div>';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function initPay() {
    els.payBtn.addEventListener('click', async function () {
      if (!Auth.isLoggedIn()) {
        showToast('Please log in to book tickets.', 'error');
        window.location.href = 'login.html?redirect=' + encodeURIComponent('booking.html?showId=' + showId);
        return;
      }
      const seatIds = Array.from(selected.keys());
      if (!seatIds.length) {
        showToast('Please select at least one seat.', 'error');
        return;
      }
      els.payBtn.disabled = true;
      els.payBtn.textContent = 'Confirming…';
      try {
        const data = await API.post('/api/bookings', { showId: showId, seatIds: seatIds });
        showToast('Booking confirmed!', 'success');
        showTicket(data.booking);
      } catch (err) {
        if (err.status === 401) {
          window.location.href = 'login.html?redirect=' + encodeURIComponent('booking.html?showId=' + showId);
        } else if (err.status === 409) {
          showToast(err.message, 'error');
          await reloadSeats();
        } else {
          showToast(err.message || 'Booking failed. Please try again.', 'error');
          els.payBtn.disabled = false;
          els.payBtn.textContent = 'Pay & Confirm';
        }
      }
    });
  }

  async function boot() {
    await loadShow();
    initAuthState();
    initPay();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
