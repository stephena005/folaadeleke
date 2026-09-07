/* ──────────────────────────────────────────────────────────────
   Cookie consent — UK GDPR / PECR
   Google Analytics is loaded with consent_mode defaulting to
   'denied' in each page's <head>. Nothing is stored and no
   analytics cookie is set until the visitor actively accepts.
   ────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  var KEY = 'fa_consent';          // 'granted' | 'denied'
  var STAMP = 'fa_consent_date';

  function read() {
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  }

  function write(value) {
    try {
      localStorage.setItem(KEY, value);
      localStorage.setItem(STAMP, new Date().toISOString());
    } catch (e) { /* private mode — choice applies to this page view only */ }
  }

  function apply(value) {
    if (typeof window.gtag !== 'function') return;
    window.gtag('consent', 'update', {
      analytics_storage: value === 'granted' ? 'granted' : 'denied'
    });
  }

  function injectStyles() {
    if (document.getElementById('fa-consent-styles')) return;
    var css = [
      '#fa-consent{position:fixed;left:0;right:0;bottom:0;z-index:10000;',
      'background:#fff;border-top:1px solid #000;padding:18px 20px;',
      "font-family:'Courier New',Courier,monospace;",
      'display:flex;flex-wrap:wrap;align-items:center;justify-content:center;',
      'gap:14px 24px;transform:translateY(100%);transition:transform .35s ease}',
      '#fa-consent.fa-visible{transform:translateY(0)}',
      '#fa-consent p{font-size:11px;line-height:1.7;letter-spacing:.06em;color:#000;',
      'margin:0;max-width:640px;text-align:center}',
      '#fa-consent a{color:#000;text-decoration:underline}',
      '#fa-consent .fa-actions{display:flex;gap:10px;flex-shrink:0}',
      '#fa-consent button{font-family:inherit;font-size:10px;letter-spacing:.18em;',
      'text-transform:uppercase;padding:10px 18px;cursor:pointer;background:#fff;',
      'color:#000;border:1px solid #000;transition:background .2s,color .2s}',
      '#fa-consent button:hover,#fa-consent button:focus-visible{background:#000;color:#fff}',
      '#fa-consent button.fa-accept{background:#000;color:#fff}',
      '#fa-consent button.fa-accept:hover,#fa-consent button.fa-accept:focus-visible{background:#fff;color:#000}',
      '@media (max-width:600px){#fa-consent{padding:16px}',
      '#fa-consent .fa-actions{width:100%;justify-content:center}}'
    ].join('');
    var style = document.createElement('style');
    style.id = 'fa-consent-styles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  function banner() {
    injectStyles();

    var el = document.createElement('div');
    el.id = 'fa-consent';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-live', 'polite');
    el.setAttribute('aria-label', 'Cookie consent');
    el.innerHTML =
      '<p>This site uses Google Analytics cookies to understand how the site is used. ' +
      'They are only set if you accept. See the <a href="/privacy">Privacy Policy</a>.</p>' +
      '<div class="fa-actions">' +
      '<button type="button" class="fa-decline">Decline</button>' +
      '<button type="button" class="fa-accept">Accept</button>' +
      '</div>';
    document.body.appendChild(el);
    requestAnimationFrame(function () { el.classList.add('fa-visible'); });

    function choose(value) {
      write(value);
      apply(value);
      el.classList.remove('fa-visible');
      setTimeout(function () { el.remove(); }, 350);
    }

    el.querySelector('.fa-accept').addEventListener('click', function () { choose('granted'); });
    el.querySelector('.fa-decline').addEventListener('click', function () { choose('denied'); });
  }

  function init() {
    var stored = read();
    if (stored === 'granted' || stored === 'denied') {
      apply(stored);
      return;
    }
    banner();
  }

  /* Let the privacy page (or anywhere else) re-open the choice:
     <button onclick="faConsent.reset()">Change cookie settings</button> */
  window.faConsent = {
    reset: function () {
      try { localStorage.removeItem(KEY); localStorage.removeItem(STAMP); } catch (e) {}
      apply('denied');
      if (!document.getElementById('fa-consent')) banner();
    },
    status: read
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
