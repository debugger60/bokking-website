'use strict';
/* =========================================================================
   CineBook AI — api.js
   Shared API client + UI helpers used by every page:
   - API.get/post/put/del : fetch wrapper (JSON, credentials, error norm)
   - escapeHTML / fmtMoney / fmtDate : safe rendering helpers
   - showToast            : global toast notifications
   - MovieCard            : reusable movie-card + poster rendering
   - renderTicketHTML     : reusable digital ticket (booking confirmation)
   ========================================================================= */
(function () {

  /* ---------------- API client ---------------- */
  const API = {
    async request(method, path, body) {
      const opts = { method: method, headers: {}, credentials: 'same-origin' };
      if (body !== undefined && body !== null) {
        opts.headers['Content-Type'] = 'application/json';
        opts.body = JSON.stringify(body);
      }
      let res;
      try {
        res = await fetch(path, opts);
      } catch (err) {
        throw new Error('Network error — please check your connection and try again.');
      }
      let data = null;
      try { data = await res.json(); } catch (err) { /* non-JSON body */ }
      if (!res.ok) {
        const message = (data && data.message) ? data.message : 'Request failed (HTTP ' + res.status + ').';
        const error = new Error(message);
        error.status = res.status;
        error.data = data;
        throw error;
      }
      return data;
    },
    get(path) { return this.request('GET', path); },
    post(path, body) { return this.request('POST', path, body); },
    put(path, body) { return this.request('PUT', path, body); },
    del(path) { return this.request('DELETE', path); }
  };

  /* ---------------- safe string helpers ---------------- */
  function escapeHTML(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function fmtMoney(n) {
    const num = Number(n) || 0;
    return '₹' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function fmtDate(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(String(dateStr).slice(0, 10) + 'T00:00:00');
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  }

  /* ---------------- toast ---------------- */
  function showToast(message, type) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.className = 'toast show' + (type ? ' ' + type : '');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(function () { toast.className = 'toast'; }, 3200);
  }

  /* ---------------- movie card + poster ---------------- */
  function posterFallback(title) {
    return '<div class="poster-fallback"><span class="emoji">🎬</span><span>' + escapeHTML(title) + '</span></div>';
  }

  function posterHTML(movie) {
    if (movie.posterUrl) {
      return '<img src="' + escapeHTML(movie.posterUrl) + '" alt="' + escapeHTML(movie.title) + ' poster" loading="lazy" onerror="MovieCard.imgError(this)" />';
    }
    return posterFallback(movie.title);
  }

  const MovieCard = {
    imgError(img) {
      const wrap = img && img.parentNode;
      if (wrap) {
        const title = (img.getAttribute('alt') || '').replace(/ poster$/i, '');
        wrap.innerHTML = posterFallback(title);
      }
    },

    cardHTML(movie, opts) {
      opts = opts || {};
      const year = movie.releaseDate ? String(movie.releaseDate).slice(0, 4) : '';
      const metaParts = [];
      if (movie.genre) metaParts.push(movie.genre.split(',')[0].trim());
      if (movie.language) metaParts.push(movie.language.split(',')[0].trim());
      if (year) metaParts.push(year);
      const meta = metaParts.join(' • ');

      const genres = (movie.genre || '')
        .split(',')
        .map(function (g) { return g.trim(); })
        .filter(Boolean)
        .slice(0, 3);

      const badges = [];
      if (movie.status === 'coming_soon') badges.push('<span class="poster-status">Coming Soon</span>');
      if (Number(movie.rating) > 0) badges.push('<span class="rating-badge">★ ' + Number(movie.rating).toFixed(1) + '</span>');
      if (opts.showScore && typeof movie.score === 'number') {
        badges.push('<span class="match-badge">' + Math.round(movie.score) + '% match</span>');
      }

      return (
        '<a class="movie-card" href="movie-details.html?id=' + encodeURIComponent(movie.id) + '">' +
          '<div class="movie-poster">' + posterHTML(movie) + badges.join('') + '</div>' +
          '<div class="movie-body">' +
            '<h3 class="movie-title">' + escapeHTML(movie.title) + '</h3>' +
            (meta ? '<p class="movie-meta">' + escapeHTML(meta) + '</p>' : '') +
            (genres.length
              ? '<div class="movie-genres">' + genres.map(function (g) { return '<span class="genre-tag">' + escapeHTML(g) + '</span>'; }).join('') + '</div>'
              : '') +
            (opts.showReason && movie.reason ? '<p class="movie-reason">✨ ' + escapeHTML(movie.reason) + '</p>' : '') +
          '</div>' +
        '</a>'
      );
    }
  };

  /* ---------------- digital ticket ---------------- */
  function qrCells(seed, size) {
    size = size || 13;
    let h = 2166136261 >>> 0;
    for (let i = 0; i < seed.length; i++) {
      h ^= seed.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    let s = h;
    function rand() {
      s = (s + 0x6D2B79F5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    const cells = [];
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        let on;
        const inTL = r < 5 && c < 5;
        const inTR = r < 5 && c >= size - 5;
        const inBL = r >= size - 5 && c < 5;
        if (inTL || inTR || inBL) {
          const lr = r < 5 ? r : r - (size - 5);
          const lc = c < 5 ? c : c - (size - 5);
          on = (lr === 0 || lr === 4 || lc === 0 || lc === 4);
        } else {
          on = rand() > 0.52;
        }
        cells.push(on);
      }
    }
    return cells;
  }

  function renderTicketHTML(b) {
    const seats = (b.seats || []).map(function (s) { return s.code; }).join(', ');
    const lang = b.movie.language || '';
    const genre = (b.movie.genre || '').split(',')[0].trim();
    const dur = b.movie.duration ? b.movie.duration + ' min' : '';
    const subtitle = [lang, genre, dur].filter(Boolean).join(' • ');
    const screenName = b.screen.name || ('Screen ' + b.screen.number);

    return (
      '<article class="ticket">' +
        '<div class="ticket-head">' +
          '<div>' +
            '<p class="ticket-label">Cinema e-ticket</p>' +
            '<p class="ticket-brand">CineBook<span>AI</span></p>' +
          '</div>' +
          '<div>' +
            '<p class="ticket-label">Booking ID</p>' +
            '<p class="ticket-ref">' + escapeHTML(b.bookingReference) + '</p>' +
          '</div>' +
        '</div>' +
        '<div class="ticket-body">' +
          '<h3 class="ticket-title">' + escapeHTML(b.movie.title) + '</h3>' +
          (subtitle ? '<p class="muted">' + escapeHTML(subtitle) + '</p>' : '') +
          '<div class="ticket-meta-grid">' +
            '<div><span class="ticket-meta-label">Theatre</span><span class="ticket-meta-value">' + escapeHTML(b.theatre.name + ', ' + b.theatre.city) + '</span></div>' +
            '<div><span class="ticket-meta-label">Screen</span><span class="ticket-meta-value">' + escapeHTML(screenName) + '</span></div>' +
            '<div><span class="ticket-meta-label">Date</span><span class="ticket-meta-value">' + escapeHTML(fmtDate(b.show.date)) + '</span></div>' +
            '<div><span class="ticket-meta-label">Time</span><span class="ticket-meta-value">' + escapeHTML(b.show.startTime) + '</span></div>' +
            '<div><span class="ticket-meta-label">Seats</span><span class="ticket-meta-value">' + escapeHTML(seats) + '</span></div>' +
            '<div><span class="ticket-meta-label">Guest</span><span class="ticket-meta-value">' + escapeHTML(b.customer.name) + '</span></div>' +
          '</div>' +
          '<div class="ticket-total-row"><span>Total paid</span><strong>' + fmtMoney(b.totalAmount) + '</strong></div>' +
          '<div class="ticket-qr-wrap">' +
            '<div class="qr">' + qrCells(b.bookingReference).map(function (on) { return '<span class="qr-cell' + (on ? ' on' : '') + '"></span>'; }).join('') + '</div>' +
            '<span class="ticket-qr-caption">' + escapeHTML(b.bookingReference) + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="ticket-foot">' +
          '<span>🔒 Demo payment — no real charge</span>' +
          '<span>ID: ' + escapeHTML(b.id) + '</span>' +
        '</div>' +
      '</article>'
    );
  }

  window.API = API;
  window.escapeHTML = escapeHTML;
  window.fmtMoney = fmtMoney;
  window.fmtDate = fmtDate;
  window.showToast = showToast;
  window.MovieCard = MovieCard;
  window.renderTicketHTML = renderTicketHTML;
})();
