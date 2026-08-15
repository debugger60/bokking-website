'use strict';
/* =========================================================================
   CineBook AI — recommendations.js
   Personalised recommendations (or popular fallback for guests), plus a
   "because you might like" similar section.
   ========================================================================= */
(function () {
  if (document.body.dataset.page !== 'recommendations') return;

  const els = {
    heading: document.getElementById('rec-heading'),
    message: document.getElementById('rec-message'),
    recSection: document.getElementById('rec-section'),
    recTitle: document.getElementById('rec-section-title'),
    recGrid: document.getElementById('recommendations-grid'),
    recEmpty: document.getElementById('rec-empty'),
    similarSection: document.getElementById('similar-section'),
    similarTitle: document.getElementById('similar-section-title'),
    similarGrid: document.getElementById('similar-grid'),
    popularSection: document.getElementById('popular-section'),
    popularGrid: document.getElementById('popular-grid')
  };

  async function loadRecs() {
    els.recGrid.innerHTML = '<div class="loading"><span class="spinner"></span>Analysing your taste…</div>';
    try {
      const data = await API.get('/api/recommendations?limit=10');
      const recs = data.recommendations || [];
      const personalized = !!data.personalized;

      if (personalized) {
        els.heading.textContent = '✨ AI Recommendations';
        els.message.textContent = data.message || '';
        els.recSection.hidden = false;
        els.popularSection.hidden = true;
        els.recTitle.textContent = 'Recommended for you';
        els.recGrid.innerHTML = recs.map(function (m) {
          return MovieCard.cardHTML(m, { showScore: true, showReason: true });
        }).join('');
        els.recEmpty.hidden = recs.length > 0;
      } else {
        els.heading.textContent = '✨ Popular Movies For You';
        els.message.innerHTML = 'You are browsing as a guest — here are the most popular movies right now. ' +
          '<a href="login.html?redirect=recommendations.html">Log in</a> and book a movie to unlock personalised picks.';
        els.recSection.hidden = true;
        els.popularSection.hidden = false;
        els.popularGrid.innerHTML = recs.map(function (m) {
          return MovieCard.cardHTML(m, { showReason: true });
        }).join('');
      }

      if (recs.length) {
        loadSimilar(recs[0]);
      } else {
        els.similarSection.hidden = true;
      }
    } catch (err) {
      els.recGrid.innerHTML = '<div class="empty-state"><p>' + escapeHTML(err.message) + '</p></div>';
      els.recSection.hidden = false;
    }
  }

  async function loadSimilar(topMovie) {
    els.similarGrid.innerHTML = '<div class="loading"><span class="spinner"></span>Finding similar movies…</div>';
    try {
      const data = await API.get('/api/recommendations/similar/' + encodeURIComponent(topMovie.id) + '?limit=6');
      const similar = data.similar || [];
      els.similarSection.hidden = false;
      els.similarTitle.textContent = 'Because you might like ' + topMovie.title;
      els.similarGrid.innerHTML = similar.length
        ? similar.map(function (m) { return MovieCard.cardHTML(m, { showScore: true }); }).join('')
        : '<p class="muted">No similar movies found.</p>';
    } catch (err) {
      els.similarSection.hidden = true;
    }
  }

  function initRefresh() {
    const btn = document.getElementById('rec-refresh');
    if (!btn) return;
    btn.addEventListener('click', async function () {
      btn.disabled = true;
      btn.textContent = 'Refreshing…';
      // GET /api/recommendations rebuilds the taste profile server-side
      // (services/recommendationEngine.js) from the user's booking history,
      // so re-fetching is the equivalent of a "refresh".
      await loadRecs();
      btn.disabled = false;
      btn.textContent = 'Refresh recommendations';
      showToast('Recommendations refreshed.', 'success');
    });
  }

  async function boot() {
    await Auth.init();
    await loadRecs();
    initRefresh();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
