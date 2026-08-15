'use strict';
/* =========================================================================
   CineBook AI — profile.js
   User info, account stats, taste profile and name update.
   ========================================================================= */
(function () {
  if (document.body.dataset.page !== 'profile') return;

  const els = {
    avatar: document.getElementById('profile-avatar'),
    name: document.getElementById('profile-name'),
    email: document.getElementById('profile-email'),
    memberSince: document.getElementById('profile-member-since'),
    statBookings: document.getElementById('stat-bookings'),
    statReviews: document.getElementById('stat-reviews'),
    statSpent: document.getElementById('stat-spent'),
    form: document.getElementById('profile-form'),
    nameInput: document.getElementById('profile-name-input'),
    error: document.getElementById('profile-error'),
    save: document.getElementById('profile-save'),
    prefGenres: document.getElementById('pref-genres'),
    prefLanguages: document.getElementById('pref-languages'),
    prefDirectors: document.getElementById('pref-directors')
  };

  function renderChips(el, items) {
    const top = (items || [])
      .slice()
      .sort(function (a, b) { return (b.weight || 0) - (a.weight || 0); })
      .slice(0, 8);
    if (!top.length) {
      el.innerHTML = '<p class="muted">No data yet — book a movie to start.</p>';
      return;
    }
    el.innerHTML = top.map(function (i) {
      return '<span class="chip">' + escapeHTML(i.value) + '</span>';
    }).join('');
  }

  function render(data) {
    const u = data.user;
    els.avatar.textContent = (u.name || '?').trim().charAt(0).toUpperCase();
    els.name.textContent = u.name;
    els.email.textContent = u.email;
    els.memberSince.textContent = 'Member since ' + fmtDate(String(u.createdAt || '').slice(0, 10));
    els.statBookings.textContent = String(data.stats.bookings);
    els.statReviews.textContent = String(data.stats.reviews);
    els.statSpent.textContent = fmtMoney(data.stats.totalSpent);
    els.nameInput.value = u.name;

    const prefs = data.preferences || {};
    renderChips(els.prefGenres, prefs.genre);
    renderChips(els.prefLanguages, prefs.language);
    renderChips(els.prefDirectors, prefs.director);
  }

  async function loadProfile() {
    try {
      const data = await API.get('/api/users/profile');
      render(data);
    } catch (err) {
      if (err.status === 401) {
        window.location.href = 'login.html?redirect=profile.html';
        return;
      }
      showToast(err.message, 'error');
    }
  }

  function initForm() {
    els.form.addEventListener('submit', async function (e) {
      e.preventDefault();
      const name = els.nameInput.value.trim();
      els.error.hidden = true;
      if (name.length < 2) {
        els.error.textContent = 'Name must be at least 2 characters.';
        els.error.hidden = false;
        return;
      }
      els.save.disabled = true;
      els.save.textContent = 'Saving…';
      try {
        const data = await API.put('/api/users/profile', { name: name });
        els.name.textContent = data.user.name;
        if (Auth.user) Auth.user.name = data.user.name;
        Auth.renderNav();
        showToast('Profile updated.', 'success');
      } catch (err) {
        els.error.textContent = err.message;
        els.error.hidden = false;
      } finally {
        els.save.disabled = false;
        els.save.textContent = 'Save changes';
      }
    });
  }

  async function boot() {
    const user = await Auth.init();
    if (!user) {
      window.location.href = 'login.html?redirect=profile.html';
      return;
    }
    initForm();
    await loadProfile();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
