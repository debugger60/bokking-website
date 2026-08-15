'use strict';
/* =========================================================================
   CineBook AI — movies.js (movies page)
   Server-side search/filter/sort + client-side load-more reveal.
   ========================================================================= */
(function () {
  if (document.body.dataset.page !== 'movies') return;

  const PAGE_SIZE = 12;
  const state = { q: '', genre: '', language: '', minRating: '', year: '', sort: 'popularity', status: '' };
  let allResults = [];
  let visible = PAGE_SIZE;

  const els = {
    form: document.getElementById('filters-form'),
    search: document.getElementById('search-input'),
    genre: document.getElementById('filter-genre'),
    language: document.getElementById('filter-language'),
    rating: document.getElementById('filter-rating'),
    year: document.getElementById('filter-year'),
    sort: document.getElementById('sort-select'),
    clear: document.getElementById('clear-filters'),
    grid: document.getElementById('movie-grid'),
    count: document.getElementById('result-count'),
    empty: document.getElementById('empty-state'),
    loadMore: document.getElementById('load-more')
  };

  function readURL() {
    const p = new URLSearchParams(window.location.search);
    if (p.get('q')) { state.q = p.get('q'); els.search.value = state.q; }
    if (p.get('sort')) { state.sort = p.get('sort'); els.sort.value = state.sort; }
    if (p.get('status')) state.status = p.get('status');
  }

  function fillSelect(selectEl, values, allLabel, selected) {
    selectEl.innerHTML = '<option value="">' + allLabel + '</option>' +
      values.map(function (v) { return '<option value="' + escapeHTML(v) + '">' + escapeHTML(v) + '</option>'; }).join('');
    if (selected) selectEl.value = selected;
  }

  async function loadOptions() {
    try {
      const data = await API.get('/api/movies');
      const movies = data.movies || [];
      const genreSet = new Set();
      const langSet = new Set();
      const yearSet = new Set();
      movies.forEach(function (m) {
        (m.genre || '').split(',').forEach(function (g) { g = g.trim(); if (g) genreSet.add(g); });
        (m.language || '').split(',').forEach(function (l) { l = l.trim(); if (l) langSet.add(l); });
        if (m.releaseDate) yearSet.add(String(m.releaseDate).slice(0, 4));
      });
      fillSelect(els.genre, Array.from(genreSet).sort(), 'All genres', state.genre);
      fillSelect(els.language, Array.from(langSet).sort(), 'All languages', state.language);
      fillSelect(els.year, Array.from(yearSet).sort().reverse(), 'All years', state.year);
    } catch (err) { /* options are non-fatal */ }
  }

  function buildCountText() {
    let text = allResults.length + (allResults.length === 1 ? ' movie' : ' movies');
    if (state.status === 'coming_soon') text = 'Coming soon — ' + text;
    else if (state.status === 'now_showing') text = 'Now showing — ' + text;
    if (state.q) text += ' for “' + state.q + '”';
    return text;
  }

  function render() {
    const list = allResults.slice(0, visible);
    if (!allResults.length) {
      els.grid.innerHTML = '';
      els.empty.hidden = false;
      els.count.textContent = '';
      els.loadMore.hidden = true;
      return;
    }
    els.empty.hidden = true;
    els.grid.innerHTML = list.map(function (m) { return MovieCard.cardHTML(m); }).join('');
    els.count.textContent = buildCountText();
    els.loadMore.hidden = visible >= allResults.length;
  }

  async function loadMovies() {
    els.grid.innerHTML = '<div class="loading"><span class="spinner"></span>Loading movies…</div>';
    els.empty.hidden = true;
    els.loadMore.hidden = true;

    const params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.genre) params.set('genre', state.genre);
    if (state.language) params.set('language', state.language);
    if (state.minRating) params.set('minRating', state.minRating);
    if (state.year) params.set('year', state.year);
    if (state.status) params.set('status', state.status);
    params.set('sort', state.sort || 'popularity');

    try {
      const data = await API.get('/api/movies?' + params.toString());
      allResults = data.movies || [];
      visible = PAGE_SIZE;
      render();
    } catch (err) {
      els.grid.innerHTML = '<div class="empty-state"><h2>Something went wrong</h2><p>' + escapeHTML(err.message) + '</p></div>';
      els.count.textContent = '';
    }
  }

  function bindEvents() {
    els.form.addEventListener('submit', function (e) {
      e.preventDefault();
      state.q = els.search.value.trim();
      loadMovies();
    });
    els.genre.addEventListener('change', function () { state.genre = els.genre.value; loadMovies(); });
    els.language.addEventListener('change', function () { state.language = els.language.value; loadMovies(); });
    els.rating.addEventListener('change', function () { state.minRating = els.rating.value; loadMovies(); });
    els.year.addEventListener('change', function () { state.year = els.year.value; loadMovies(); });
    els.sort.addEventListener('change', function () { state.sort = els.sort.value; loadMovies(); });

    els.clear.addEventListener('click', function () {
      state.q = ''; state.genre = ''; state.language = ''; state.minRating = ''; state.year = ''; state.status = ''; state.sort = 'popularity';
      els.search.value = '';
      els.genre.value = '';
      els.language.value = '';
      els.rating.value = '';
      els.year.value = '';
      els.sort.value = 'popularity';
      loadMovies();
    });

    els.loadMore.addEventListener('click', function () {
      visible = Math.min(visible + PAGE_SIZE, allResults.length);
      render();
    });
  }

  async function boot() {
    readURL();
    bindEvents();
    await loadOptions();
    await loadMovies();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
