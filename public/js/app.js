'use strict';
/* =========================================================================
   CineBook AI — app.js
   Shared application shell, loaded on every page BEFORE api.js:
   - mobile navigation toggle (hamburger)
   - active navigation-link highlighting (driven by <body data-page="…">)
   Exposes window.App for other scripts.
   ========================================================================= */
(function () {

  // Maps body[data-page] to the nav link that should appear active.
  // Pages that are sub-flows (booking, login, register) highlight nothing.
  const ACTIVE_MAP = {
    home: 'index.html',
    movies: 'movies.html',
    'movie-details': 'movies.html',
    theatres: 'theatres.html',
    booking: null,
    login: null,
    register: null,
    profile: 'profile.html',
    bookings: 'bookings.html',
    recommendations: 'recommendations.html'
  };

  const App = {
    /** Called once on DOMContentLoaded. */
    init() {
      this.initNavToggle();
      this.highlightActiveLink();
    },

    /** Mobile hamburger menu (open/close + X animation). */
    initNavToggle() {
      const toggle = document.getElementById('nav-toggle');
      const links = document.getElementById('nav-links');
      if (!toggle || !links) return;
      toggle.addEventListener('click', function () {
        const open = links.classList.toggle('open');
        toggle.classList.toggle('open', open);
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
      links.addEventListener('click', function (e) {
        if (e.target && e.target.tagName === 'A') {
          links.classList.remove('open');
          toggle.classList.remove('open');
          toggle.setAttribute('aria-expanded', 'false');
        }
      });
    },

    /** Set .active + aria-current on the link matching the current page. */
    highlightActiveLink() {
      const page = document.body && document.body.dataset ? document.body.dataset.page : null;
      if (!page) return;
      const target = ACTIVE_MAP[page];
      document.querySelectorAll('#nav-links a').forEach(function (a) {
        const href = a.getAttribute('href');
        if (target && href === target) {
          a.classList.add('active');
          a.setAttribute('aria-current', 'page');
        } else {
          a.classList.remove('active');
          a.removeAttribute('aria-current');
        }
      });
    }
  };

  window.App = App;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { App.init(); });
  } else {
    App.init();
  }
})();
