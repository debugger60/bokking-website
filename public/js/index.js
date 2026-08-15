'use strict';
/* =========================================================================
   CineBook AI — index.js (home page)
   Hero, search, Trending / Popular / Now Showing / Coming Soon /
   Recommended For You.
   ========================================================================= */
(function () {
  if (document.body.dataset.page !== 'home') return;

  const els = {
    backdrop: document.getElementById('hero-backdrop'),
    title: document.getElementById('hero-title'),
    rating: document.getElementById('hero-rating'),
    genre: document.getElementById('hero-genre'),
    lang: document.getElementById('hero-lang'),
    desc: document.getElementById('hero-description'),
    bookBtn: document.getElementById('hero-book-btn'),
    detailsBtn: document.getElementById('hero-details-btn'),
    searchForm: document.getElementById('home-search-form'),
    searchInput: document.getElementById('home-search-input'),
    trending: document.getElementById('trending-grid'),
    popular: document.getElementById('popular-grid'),
    nowShowing: document.getElementById('now-showing-grid'),
    comingSoon: document.getElementById('coming-soon-grid'),
    recommended: document.getElementById('recommended-grid'),
    recNote: document.getElementById('recommended-note')
  };

  function fillGrid(el, movies, opts) {
    if (!movies || !movies.length) {
      el.innerHTML = '<p class="muted">Nothing to show right now.</p>';
      return;
    }
    el.innerHTML = movies.map(function (m) { return MovieCard.cardHTML(m, opts); }).join('');
  }

  async function loadHero() {
    try {
      const data = await API.get('/api/movies?sort=popularity&limit=20');
      const movies = data.movies || [];
      const featured = movies.find(function (m) { return m.backdropUrl && m.status === 'now_showing'; }) || movies[0];
      if (!featured) return;

      els.backdrop.style.backgroundImage = featured.backdropUrl
        ? 'url("' + String(featured.backdropUrl).replace(/"/g, '') + '")'
        : 'linear-gradient(120deg, #1a1a26, #0a0a10)';
      els.title.textContent = featured.title;
      els.rating.innerHTML = Number(featured.rating) > 0 ? '★ ' + Number(featured.rating).toFixed(1) : '★ New';
      els.genre.textContent = (featured.genre || '').split(',')[0].trim();
      els.lang.textContent = featured.language || '';
      els.desc.textContent = featured.description || '';
      const href = 'movie-details.html?id=' + encodeURIComponent(featured.id);
      els.bookBtn.href = href + '#booking-panel';
      els.detailsBtn.href = href;
    } catch (err) {
      els.title.textContent = 'CineBook AI';
      els.desc.textContent = 'Book movie tickets online with AI-powered personalised recommendations.';
    }
  }

  async function loadSections() {
    const loading = '<div class="loading"><span class="spinner"></span>Loading…</div>';
    [els.trending, els.popular, els.nowShowing, els.comingSoon, els.recommended].forEach(function (el) { el.innerHTML = loading; });

    const results = await Promise.allSettled([
      API.get('/api/movies?sort=popularity&limit=10'),
      API.get('/api/movies?sort=rating&limit=10'),
      API.get('/api/movies?status=now_showing&sort=popularity&limit=10'),
      API.get('/api/movies?status=coming_soon&sort=newest&limit=10'),
      API.get('/api/recommendations?limit=10')
    ]);

    const grids = [els.trending, els.popular, els.nowShowing, els.comingSoon];
    const labels = ['trending', 'popular', 'now showing', 'coming soon'];
    for (let i = 0; i < 4; i++) {
      if (results[i].status === 'fulfilled') fillGrid(grids[i], results[i].value.movies);
      else grids[i].innerHTML = '<p class="muted">Could not load ' + labels[i] + ' movies.</p>';
    }

    if (results[4].status === 'fulfilled') {
      const r = results[4].value;
      fillGrid(els.recommended, r.recommendations, { showReason: true, showScore: r.personalized });
      els.recNote.textContent = r.message || '';
    } else {
      els.recommended.innerHTML = '<p class="muted">Could not load recommendations.</p>';
    }
  }

  function initSearch() {
    els.searchForm.addEventListener('submit', function (e) {
      e.preventDefault();
      const q = els.searchInput.value.trim();
      if (q) window.location.href = 'movies.html?q=' + encodeURIComponent(q);
      else window.location.href = 'movies.html';
    });
  }

  function boot() {
    loadHero();
    loadSections();
    initSearch();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
