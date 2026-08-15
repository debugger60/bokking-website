'use strict';
/* =========================================================================
   CineBook AI — movie-details.js
   Movie detail hero, booking panel (date → theatre → showtime picker),
   similar movies, reviews + ratings.
   ========================================================================= */
(function () {
  if (document.body.dataset.page !== 'movie-details') return;

  const movieId = new URLSearchParams(window.location.search).get('id');
  const state = { date: null, theatre: null, showId: null };

  const els = {
    hero: document.getElementById('movie-detail-hero'),
    backdrop: document.getElementById('detail-backdrop'),
    poster: document.getElementById('detail-poster'),
    title: document.getElementById('detail-title'),
    meta: document.getElementById('detail-meta'),
    rating: document.getElementById('detail-rating'),
    desc: document.getElementById('detail-description'),
    director: document.getElementById('detail-director'),
    cast: document.getElementById('detail-cast'),
    trailerBtn: document.getElementById('trailer-btn'),
    bookingPanel: document.getElementById('booking-panel'),
    dateList: document.getElementById('date-list'),
    theatreSelect: document.getElementById('theatre-select'),
    showtimeList: document.getElementById('showtime-list'),
    showtimeNote: document.getElementById('showtime-note'),
    bookBtn: document.getElementById('book-btn'),
    bookBtnNote: document.getElementById('book-btn-note'),
    similarGrid: document.getElementById('similar-grid'),
    reviewsSection: document.getElementById('reviews-section'),
    reviewsAvg: document.getElementById('reviews-avg'),
    reviewsCount: document.getElementById('reviews-count'),
    reviewLoginNote: document.getElementById('review-login-note'),
    reviewForm: document.getElementById('review-form'),
    reviewRating: document.getElementById('review-rating'),
    reviewText: document.getElementById('review-text'),
    reviewError: document.getElementById('review-error'),
    reviewSubmit: document.getElementById('review-submit'),
    reviewsList: document.getElementById('reviews-list')
  };

  function todayStr() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function showError(msg) {
    els.hero.innerHTML =
      '<div class="empty-state"><h2>Movie not available</h2><p>' + escapeHTML(msg) + '</p>' +
      '<a class="btn btn-primary" href="movies.html">Browse movies</a></div>';
    els.bookingPanel.hidden = true;
    els.reviewsSection.hidden = true;
  }

  /* ---------------- load + render ---------------- */
  async function loadMovie() {
    if (!movieId) { showError('No movie selected.'); return; }
    try {
      const data = await API.get('/api/movies/' + encodeURIComponent(movieId));
      renderMovie(data.movie);
      renderSimilar(data.similar || []);
      renderDates(data.showDates || []);
      renderTheatres(data.theatres || []);
      loadReviews();
    } catch (err) {
      showError(err.message);
    }
  }

  function renderMovie(m) {
    els.backdrop.style.backgroundImage = m.backdropUrl
      ? 'url("' + String(m.backdropUrl).replace(/"/g, '') + '")'
      : 'linear-gradient(120deg, #1a1a26, #0a0a10)';

    els.poster.alt = m.title + ' poster';
    if (m.posterUrl) {
      els.poster.onerror = function () { els.poster.src = 'assets/images/placeholder-poster.svg'; els.poster.onerror = null; };
      els.poster.src = m.posterUrl;
    } else {
      els.poster.src = 'assets/images/placeholder-poster.svg';
    }

    els.title.textContent = m.title;

    const chips = [];
    (m.genre || '').split(',').forEach(function (g) { g = g.trim(); if (g) chips.push('<span>' + escapeHTML(g) + '</span>'); });
    if (m.language) chips.push('<span>' + escapeHTML(m.language) + '</span>');
    if (m.duration) chips.push('<span>' + m.duration + ' min</span>');
    if (m.ageRating) chips.push('<span>' + escapeHTML(m.ageRating) + '</span>');
    if (m.releaseDate) chips.push('<span>' + String(m.releaseDate).slice(0, 4) + '</span>');
    els.meta.innerHTML = chips.join('');

    els.rating.innerHTML = Number(m.rating) > 0
      ? '<span class="star">★</span> ' + Number(m.rating).toFixed(1) + ' / 10'
      : 'Not rated yet';

    els.desc.textContent = m.description || '';
    els.director.textContent = m.director || '—';
    els.cast.textContent = m.cast || '—';

    if (m.trailerUrl) {
      els.trailerBtn.href = m.trailerUrl;
      els.trailerBtn.style.display = '';
    } else {
      els.trailerBtn.style.display = 'none';
    }
  }

  function renderSimilar(similar) {
    els.similarGrid.innerHTML = similar.length
      ? similar.map(function (m) { return MovieCard.cardHTML(m, { showScore: true }); }).join('')
      : '<p class="muted">No similar movies found.</p>';
  }

  /* ---------------- booking panel ---------------- */
  function renderDates(dates) {
    if (!dates.length) {
      els.dateList.innerHTML = '<p class="muted">No showtimes available for this movie yet.</p>';
      updateBookBtn();
      return;
    }
    const today = todayStr();
    els.dateList.innerHTML = dates.map(function (d) {
      const dt = new Date(d + 'T00:00:00');
      const label = d === today ? 'Today' : dt.toLocaleDateString('en-IN', { weekday: 'short' });
      const day = dt.getDate();
      const month = dt.toLocaleDateString('en-IN', { month: 'short' });
      return '<button type="button" class="date-chip" data-date="' + d + '">' +
        '<span class="day">' + escapeHTML(label) + '</span>' +
        '<span class="date">' + day + ' ' + escapeHTML(month) + '</span>' +
      '</button>';
    }).join('');

    els.dateList.querySelectorAll('.date-chip').forEach(function (chip) {
      chip.addEventListener('click', function () { selectDate(chip.dataset.date); });
    });

    selectDate(dates[0]);
  }

  function selectDate(d) {
    state.date = d;
    els.dateList.querySelectorAll('.date-chip').forEach(function (chip) {
      chip.classList.toggle('active', chip.dataset.date === d);
    });
    loadShowtimes();
  }

  function renderTheatres(theatres) {
    els.theatreSelect.innerHTML = '<option value="">Choose a theatre…</option>' +
      theatres.map(function (t) {
        return '<option value="' + escapeHTML(t.id) + '">' + escapeHTML(t.name) + ' — ' + escapeHTML(t.city) + '</option>';
      }).join('');
    state.theatre = theatres.length ? theatres[0].id : null;
    if (theatres.length) els.theatreSelect.value = theatres[0].id;
  }

  function bindTheatreSelect() {
    els.theatreSelect.addEventListener('change', function () {
      state.theatre = els.theatreSelect.value || null;
      loadShowtimes();
    });
  }

  function clearSelection() {
    state.showId = null;
    updateBookBtn();
  }

  function updateBookBtn() {
    if (state.showId) {
      els.bookBtn.disabled = false;
      els.bookBtn.onclick = function () {
        window.location.href = 'booking.html?showId=' + encodeURIComponent(state.showId);
      };
      els.bookBtnNote.textContent = 'Ready — tap “Book Tickets” to pick your seats.';
    } else {
      els.bookBtn.disabled = true;
      els.bookBtn.onclick = null;
      els.bookBtnNote.textContent = 'Pick a date, theatre and showtime to continue.';
    }
  }

  async function loadShowtimes() {
    const list = els.showtimeList;
    if (!state.date || !state.theatre) {
      list.innerHTML = '';
      els.showtimeNote.textContent = 'Pick a date and theatre to see showtimes.';
      clearSelection();
      return;
    }
    list.innerHTML = '<div class="loading"><span class="spinner"></span>Loading showtimes…</div>';
    els.showtimeNote.textContent = '';
    try {
      const data = await API.get('/api/shows?movieId=' + encodeURIComponent(movieId) +
        '&date=' + encodeURIComponent(state.date) +
        '&theatreId=' + encodeURIComponent(state.theatre));
      let shows = data.shows || [];
      // Hide showtimes that have already started today.
      if (state.date === todayStr()) {
        const now = new Date();
        const nowHM = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
        shows = shows.filter(function (s) { return s.startTime > nowHM; });
      }
      if (!shows.length) {
        list.innerHTML = '';
        els.showtimeNote.textContent = 'No upcoming showtimes for this date and theatre. Try another date.';
        clearSelection();
        return;
      }
      list.innerHTML = shows.map(function (s) {
        return '<button type="button" class="showtime-chip" data-id="' + escapeHTML(s.id) + '" data-price="' + s.ticketPrice + '">' +
          '<span class="time">' + escapeHTML(s.startTime) + '</span>' +
          '<span class="price">' + fmtMoney(s.ticketPrice) + '</span>' +
        '</button>';
      }).join('');

      list.querySelectorAll('.showtime-chip').forEach(function (chip) {
        chip.addEventListener('click', function () {
          list.querySelectorAll('.showtime-chip').forEach(function (c) { c.classList.remove('active'); });
          chip.classList.add('active');
          state.showId = chip.dataset.id;
          updateBookBtn();
        });
      });

      const first = list.querySelector('.showtime-chip');
      if (first) first.click();
      else clearSelection();
    } catch (err) {
      list.innerHTML = '';
      els.showtimeNote.textContent = 'Could not load showtimes: ' + err.message;
      clearSelection();
    }
  }

  /* ---------------- reviews ---------------- */
  function fmtReviewDate(s) {
    const d = new Date(String(s).replace(' ', 'T'));
    if (isNaN(d.getTime())) return s;
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function reviewHTML(r) {
    const initial = (r.userName || '?').trim().charAt(0).toUpperCase();
    const stars = '★'.repeat(r.rating) + '<span class="star-empty">' + '☆'.repeat(5 - r.rating) + '</span>';
    return '<article class="review-card">' +
      '<div class="review-user">' +
        '<span class="review-avatar">' + escapeHTML(initial) + '</span>' +
        '<span class="review-name">' + escapeHTML(r.userName) + '</span>' +
        '<span class="review-date">' + escapeHTML(fmtReviewDate(r.createdAt)) + '</span>' +
      '</div>' +
      '<div class="stars">' + stars + '</div>' +
      (r.reviewText ? '<p class="review-text">' + escapeHTML(r.reviewText) + '</p>' : '') +
    '</article>';
  }

  async function loadReviews() {
    try {
      const data = await API.get('/api/movies/' + encodeURIComponent(movieId) + '/reviews');
      els.reviewsAvg.textContent = data.avgRating != null ? Number(data.avgRating).toFixed(1) + ' / 5' : '—';
      els.reviewsCount.textContent = data.count ? data.count + (data.count === 1 ? ' review' : ' reviews') : 'No reviews yet';
      const list = data.reviews || [];
      els.reviewsList.innerHTML = list.length
        ? list.map(reviewHTML).join('')
        : '<p class="muted">Be the first to review this movie.</p>';
    } catch (err) {
      els.reviewsList.innerHTML = '<p class="muted">Could not load reviews.</p>';
    }
  }

  async function initReviewForm() {
    if (!movieId) return;
    const user = await Auth.init();
    if (user) {
      els.reviewLoginNote.hidden = true;
      els.reviewForm.hidden = false;
    } else {
      els.reviewLoginNote.hidden = false;
      els.reviewLoginNote.innerHTML = 'Please <a href="' + 'login.html?redirect=' +
        encodeURIComponent('movie-details.html?id=' + movieId) + '">log in</a> to write a review.';
      els.reviewForm.hidden = true;
    }

    els.reviewForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      const rating = Number(els.reviewRating.value);
      const text = els.reviewText.value.trim();
      els.reviewError.hidden = true;
      if (!rating || rating < 1 || rating > 5) {
        els.reviewError.textContent = 'Please choose a rating from 1 to 5.';
        els.reviewError.hidden = false;
        return;
      }
      els.reviewSubmit.disabled = true;
      els.reviewSubmit.textContent = 'Submitting…';
      try {
        await API.post('/api/movies/' + encodeURIComponent(movieId) + '/reviews', { rating: rating, reviewText: text });
        showToast('Thanks for your review!', 'success');
        els.reviewText.value = '';
        loadReviews();
      } catch (err) {
        if (err.status === 401) {
          window.location.href = 'login.html?redirect=' + encodeURIComponent('movie-details.html?id=' + movieId);
        } else {
          els.reviewError.textContent = err.message;
          els.reviewError.hidden = false;
        }
      } finally {
        els.reviewSubmit.disabled = false;
        els.reviewSubmit.textContent = 'Submit review';
      }
    });
  }

  function boot() {
    bindTheatreSelect();
    loadMovie();
    initReviewForm();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
