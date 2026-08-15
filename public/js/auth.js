'use strict';
/* =========================================================================
   CineBook AI — auth.js
   Session state, navbar rendering, login + register forms.
   Included on every page (after app.js and api.js).

   NOTE: the mobile navigation toggle now lives in app.js (shared shell).
   ========================================================================= */
(function () {

  const Auth = {
    user: null,
    _ready: null,

    /** Fetch the current session user once (idempotent). */
    init() {
      if (!this._ready) this._ready = this._load();
      return this._ready;
    },

    async _load() {
      try {
        const data = await API.get('/api/auth/me');
        this.user = data.user;
      } catch (err) {
        this.user = null;
      }
      this.renderNav();
      return this.user;
    },

    isLoggedIn() {
      return !!this.user;
    },

    setUser(user) {
      this.user = user || null;
      this.renderNav();
    },

    renderNav() {
      const el = document.getElementById('nav-auth');
      if (!el) return;
      if (this.user) {
        const name = this.user.name || 'User';
        const initial = name.trim().charAt(0).toUpperCase() || '?';
        el.innerHTML =
          '<a class="user-chip" href="profile.html" title="' + escapeHTML(name) + '">' +
            '<span class="user-avatar">' + escapeHTML(initial) + '</span>' +
            '<span class="user-name">' + escapeHTML(name) + '</span>' +
          '</a>' +
          '<button class="logout-btn" id="logout-btn" type="button">Log out</button>';
        document.getElementById('logout-btn').addEventListener('click', function () { Auth.logout(); });
      } else {
        el.innerHTML =
          '<a class="btn btn-ghost" href="login.html">Log in</a>' +
          '<a class="btn btn-primary" href="register.html">Register</a>';
      }
    },

    async logout() {
      try { await API.post('/api/auth/logout'); } catch (err) { /* session already gone */ }
      this.user = null;
      this._ready = null;
      this.renderNav();
      showToast('Logged out.', 'success');
      window.location.href = 'index.html';
    }
  };

  window.Auth = Auth;

  /* ---------------- login form ---------------- */
  function initLogin() {
    const form = document.getElementById('login-form');
    if (!form) return;
    const errEl = document.getElementById('login-error');
    const btn = document.getElementById('login-btn');

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      const email = document.getElementById('login-email').value.trim();
      const password = document.getElementById('login-password').value;
      errEl.hidden = true;
      if (!email || !password) {
        errEl.textContent = 'Please enter both email and password.';
        errEl.hidden = false;
        return;
      }
      btn.disabled = true;
      btn.textContent = 'Logging in…';
      try {
        const data = await API.post('/api/auth/login', { email: email, password: password });
        Auth.setUser(data.user);
        showToast('Welcome back, ' + data.user.name + '!', 'success');
        const params = new URLSearchParams(window.location.search);
        const redirect = params.get('redirect');
        const safe = redirect && /^[a-z-]+\.html(\?.*)?$/.test(redirect) ? redirect : 'index.html';
        window.location.href = safe;
      } catch (err) {
        errEl.textContent = err.message;
        errEl.hidden = false;
        btn.disabled = false;
        btn.textContent = 'Log in';
      }
    });

    const demoBtn = document.getElementById('demo-fill');
    if (demoBtn) {
      demoBtn.addEventListener('click', function () {
        document.getElementById('login-email').value = 'demo@cinebook.ai';
        document.getElementById('login-password').value = 'Demo@1234';
      });
    }
  }

  /* ---------------- register form ---------------- */
  function initRegister() {
    const form = document.getElementById('register-form');
    if (!form) return;
    const errEl = document.getElementById('register-error');
    const btn = document.getElementById('register-btn');

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      const name = document.getElementById('register-name').value.trim();
      const email = document.getElementById('register-email').value.trim();
      const password = document.getElementById('register-password').value;
      const confirm = document.getElementById('register-confirm').value;
      errEl.hidden = true;

      const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (name.length < 2) { errEl.textContent = 'Please enter your name (at least 2 characters).'; errEl.hidden = false; return; }
      if (!emailRe.test(email)) { errEl.textContent = 'Please enter a valid email address.'; errEl.hidden = false; return; }
      if (password.length < 6) { errEl.textContent = 'Password must be at least 6 characters.'; errEl.hidden = false; return; }
      if (password !== confirm) { errEl.textContent = 'Passwords do not match.'; errEl.hidden = false; return; }

      btn.disabled = true;
      btn.textContent = 'Creating account…';
      try {
        const data = await API.post('/api/auth/register', { name: name, email: email, password: password });
        Auth.setUser(data.user);
        showToast('Account created — welcome to CineBook AI!', 'success');
        window.location.href = 'index.html';
      } catch (err) {
        errEl.textContent = err.message;
        errEl.hidden = false;
        btn.disabled = false;
        btn.textContent = 'Create account';
      }
    });
  }

  function boot() {
    Auth.init(); // renders the nav on every page
    initLogin();
    initRegister();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
