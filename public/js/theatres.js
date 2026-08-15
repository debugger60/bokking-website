'use strict';
/* =========================================================================
   CineBook AI — theatres.js
   Theatre listing with city filter and per-theatre "now playing" preview.
   ========================================================================= */
(function () {
  if (document.body.dataset.page !== 'theatres') return;

  let theatres = [];
  const showsByTheatre = {};

  const els = {
    cityFilter: document.getElementById('city-filter'),
    list: document.getElementById('theatre-list'),
    empty: document.getElementById('theatres-empty')
  };

  async function boot() {
    els.list.innerHTML = '<div class="loading"><span class="spinner"></span>Loading theatres…</div>';
    try {
      const results = await Promise.allSettled([
        API.get('/api/theatres'),
        API.get('/api/shows')
      ]);
      if (results[0].status === 'fulfilled') {
        theatres = results[0].value.theatres || [];
      } else {
        theatres = [];
      }
      if (results[1].status === 'fulfilled') {
        (results[1].value.shows || []).forEach(function (s) {
          const tid = s.theatre.id;
          if (!showsByTheatre[tid]) showsByTheatre[tid] = [];
          showsByTheatre[tid].push(s);
        });
      }
      renderCities();
      render();
    } catch (err) {
      els.list.innerHTML = '<div class="empty-state"><h2>Could not load theatres</h2><p>' + escapeHTML(err.message) + '</p></div>';
    }
  }

  function renderCities() {
    const cities = Array.from(new Set(theatres.map(function (t) { return t.city; }))).sort();
    const current = els.cityFilter.value;
    els.cityFilter.innerHTML = '<option value="">All cities</option>' +
      cities.map(function (c) { return '<option value="' + escapeHTML(c) + '">' + escapeHTML(c) + '</option>'; }).join('');
    if (current) els.cityFilter.value = current;
  }

  function cardHTML(t) {
    const shows = (showsByTheatre[t.id] || []).slice(0, 3);
    const rows = shows.map(function (s) {
      return '<div class="show-row">' +
        '<span class="show-movie">' + escapeHTML(s.movie.title) + '</span>' +
        '<span class="time-tag">' + escapeHTML(String(s.date).slice(5)) + ' · ' + escapeHTML(s.startTime) + '</span>' +
      '</div>';
    }).join('');
    return '<article class="theatre-card">' +
      '<div class="theatre-head">' +
        '<h2 class="theatre-name">' + escapeHTML(t.name) + '</h2>' +
        '<span class="theatre-city">' + escapeHTML(t.city) + '</span>' +
      '</div>' +
      '<p class="theatre-address">' + escapeHTML(t.address) + '</p>' +
      '<div class="theatre-meta">' +
        '<span class="meta-item"><strong>' + t.screens + '</strong> screens</span>' +
        '<span class="meta-item"><strong>' + (t.upcomingShows || 0) + '</strong> upcoming shows</span>' +
      '</div>' +
      (rows ? '<div class="theatre-shows"><h4>Now playing</h4>' + rows + '</div>' : '') +
    '</article>';
  }

  function render() {
    const city = els.cityFilter.value;
    const list = city ? theatres.filter(function (t) { return t.city === city; }) : theatres;
    if (!list.length) {
      els.list.innerHTML = '';
      els.empty.hidden = false;
      return;
    }
    els.empty.hidden = true;
    els.list.innerHTML = list.map(cardHTML).join('');
  }

  els.cityFilter.addEventListener('change', render);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
