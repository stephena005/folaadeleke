/* ──────────────────────────────────────────────────────────────
   Newsletter pop-up — "Drift"

   Homepage:    a centred card rises 120px from below the fold
                behind a dim overlay. Blocking, dismissable.
   Every other: a full-width strip descends from under the nav.
                Blocks nothing, locks no scroll, retracts itself.

   Both travel on the same expo-out curve over 900ms, which is
   what reads as slow without feeling like it has stalled.

   Shown at most once per fortnight, never to someone who has
   already subscribed, never before the cookie banner has been
   answered, and never on the campaign or transactional routes.
   ────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  var CARD_SEEN  = 'fa_popup_seen';    // ISO date the card last ran
  var STRIP_SEEN = 'fa_strip_seen';    // ISO date the strip last ran
  var SUBBED     = 'fa_subscribed';    // '1' once they have joined
  var VIEWS      = 'fa_popup_views';   // page views this session
  var CARD_TODAY = 'fa_card_shown';    // card already ran this session
  var CONSENT    = 'fa_consent';       // set by js/consent.js

  // The card blocks the page, so it asks rarely. The strip blocks nothing and
  // is easy to ignore, so it may ask more often.
  var CARD_COOLDOWN  = 14 * 24 * 60 * 60 * 1000;
  var STRIP_COOLDOWN = 3 * 24 * 60 * 60 * 1000;
  var HOME_DELAY   = 700;    // measured from when the loading curtain clears
  var STRIP_DELAY  = 600;
  var CURTAIN_MAX  = 6000;   // safety net if the curtain never lifts
  var STRIP_LIFE   = 12000;  // then it retracts on its own
  var RISE         = 900;
  var DIM          = 420;
  var EASE         = 'cubic-bezier(.16, 1, .3, 1)';
  var BEEHIIV      = 'https://subscribe-forms.beehiiv.com/b64503cb-8e19-4aec-9d50-a7a707588ca5';

  // Campaign landings and transactional pages own their own call to action.
  var BLOCKED = [
    /^\/claim/, /^\/verify/, /^\/guess/, /^\/rearrange/,
    /unsubscribe/, /newsletter/, /feedback/, /404/
  ];

  var overlay, card, strip, emailInput, msg, formWrap, okWrap, lastFocus, stripTimer;

  // ── storage (private mode throws) ───────────────────────────
  function get(k, store) {
    try { return (store || localStorage).getItem(k); } catch (e) { return null; }
  }
  function set(k, v, store) {
    try { (store || localStorage).setItem(k, v); } catch (e) { /* choice applies to this view only */ }
  }

  function isHome() {
    return /^\/(index\.html)?$/.test(location.pathname);
  }

  function blocked() {
    var path = location.pathname;
    for (var i = 0; i < BLOCKED.length; i++) if (BLOCKED[i].test(path)) return true;
    return false;
  }

  function bumpViews() {
    var n = parseInt(get(VIEWS, sessionStorage) || '0', 10) + 1;
    set(VIEWS, String(n), sessionStorage);
    return n;
  }

  function within(stamp, cooldown) {
    return !!stamp && (Date.now() - new Date(stamp).getTime()) < cooldown;
  }

  // Visitors from before the strip had its own clock only carry the card's
  // timestamp. Seed from it so the split does not hand them a strip at once.
  function stripLastSeen() { return get(STRIP_SEEN) || get(CARD_SEEN); }

  function shouldRun(views) {
    if (blocked()) return false;
    if (get(SUBBED) === '1') return false;
    if (!get(CONSENT)) return false;              // never stack two interruptions

    if (isHome()) return !within(get(CARD_SEEN), CARD_COOLDOWN);

    if (views < 2) return false;                  // inner pages: second view onward
    if (get(CARD_TODAY, sessionStorage)) return false;  // never both in one visit
    return !within(stripLastSeen(), STRIP_COOLDOWN);
  }

  function markCardSeen() {
    set(CARD_SEEN, new Date().toISOString());
    set(CARD_TODAY, '1', sessionStorage);
  }

  function markStripSeen() { set(STRIP_SEEN, new Date().toISOString()); }

  function navHeight() {
    var nav = document.querySelector('nav');
    if (nav) {
      var h = Math.round(nav.getBoundingClientRect().height);
      if (h > 0) return h;
    }
    var v = parseInt(getComputedStyle(document.documentElement)
              .getPropertyValue('--nav-height'), 10);
    return v > 0 ? v : 56;
  }

  // ── styles ──────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById('fa-np-styles')) return;
    var mono = "'Courier New',Courier,monospace";
    var css = [
      /* The overlay must never use display:none — a display swap cannot be
         transitioned, which is why the old pop-up snapped into place. */
      '.fa-np-overlay{position:fixed;inset:0;z-index:9000;display:flex;',
      'align-items:center;justify-content:center;padding:20px;',
      'background:rgba(0,0,0,0);visibility:hidden;',
      'transition:background ' + DIM + 'ms linear,visibility 0s linear ' + RISE + 'ms}',
      '.fa-np-overlay.fa-open{background:rgba(0,0,0,.45);visibility:visible;',
      'transition:background ' + DIM + 'ms linear,visibility 0s}',

      '.fa-np-card{position:relative;background:#fff;border:1px solid #eee;',
      'padding:40px 36px 32px;max-width:420px;width:100%;text-align:center;',
      'font-family:' + mono + ';transform:translateY(120px);opacity:0;',
      'transition:transform ' + RISE + 'ms ' + EASE + ',opacity ' + RISE + 'ms linear}',
      '.fa-np-overlay.fa-open .fa-np-card{transform:translateY(0);opacity:1}',

      '.fa-np-close{position:absolute;top:14px;right:16px;background:none;border:none;',
      'cursor:pointer;font-size:18px;color:#6f6f6f;line-height:1;font-family:' + mono + '}',
      '.fa-np-kicker{font-size:9px;letter-spacing:.35em;text-transform:uppercase;',
      'color:#6f6f6f;margin:0 0 14px}',
      '.fa-np-card h2{font-size:14px;font-weight:normal;letter-spacing:.3em;',
      'text-transform:uppercase;margin:0 0 10px;color:#000}',
      '.fa-np-sub{font-size:10px;letter-spacing:.08em;line-height:1.9;color:#6f6f6f;margin:0 0 28px}',
      '.fa-np-hp{display:none}',
      '.fa-np-field{display:flex;width:100%;margin-bottom:10px;border:1px solid #000}',
      '.fa-np-field input{flex:1;min-width:0;border:none;padding:13px 14px;',
      'font-family:' + mono + ';font-size:10px;letter-spacing:.2em;text-transform:uppercase;',
      'outline:none;background:#fff;color:#000;border-radius:0;-webkit-appearance:none;margin:0}',
      '.fa-np-field input::placeholder{color:#6f6f6f}',
      '.fa-np-field button{background:#000;color:#fff;border:none;border-left:1px solid #000;',
      'padding:13px 18px;font-family:' + mono + ';font-size:10px;letter-spacing:.2em;',
      'text-transform:uppercase;cursor:pointer;white-space:nowrap;border-radius:0;',
      'flex-shrink:0;margin:0;transition:opacity .15s}',
      '.fa-np-field button:hover{opacity:.75}',
      '.fa-np-msg{font-size:9px;letter-spacing:.1em;color:#6f6f6f;min-height:14px;margin:0 0 12px}',
      '.fa-np-legal{font-size:8px;letter-spacing:.06em;color:#6f6f6f;line-height:1.9;margin:0}',
      '.fa-np-legal a{color:#6f6f6f;text-decoration:underline}',
      '.fa-np-ok p{margin:0 0 12px;font-family:' + mono + '}',

      /* Strip sits BELOW the nav in the stack, so it slides out from under it
         rather than across it, and parks out of sight while closed. */
      '.fa-np-strip{position:fixed;left:0;right:0;z-index:90;background:#fff;',
      'border-bottom:1px solid #000;font-family:' + mono + ';',
      'display:flex;align-items:center;justify-content:center;gap:18px;',
      'padding:13px 44px 13px 20px;font-size:10px;letter-spacing:.22em;',
      'text-transform:uppercase;color:#000;transform:translateY(-100%);',
      'visibility:hidden;transition:transform ' + RISE + 'ms ' + EASE + ',',
      'visibility 0s linear ' + RISE + 'ms}',
      '.fa-np-strip.fa-open{transform:translateY(0);visibility:visible;',
      'transition:transform ' + RISE + 'ms ' + EASE + ',visibility 0s}',
      '.fa-np-strip button.fa-np-cta{background:none;border:none;border-bottom:1px solid #000;',
      'font-family:inherit;font-size:inherit;letter-spacing:inherit;text-transform:inherit;',
      'color:#000;cursor:pointer;padding:0 0 2px}',
      '.fa-np-strip .fa-np-close{top:50%;right:16px;transform:translateY(-50%);font-size:14px}',
      '@media(max-width:600px){.fa-np-strip{gap:10px;font-size:9px;letter-spacing:.14em;',
      'padding:11px 40px 11px 14px}.fa-np-card{padding:40px 24px 32px}}',

      /* Respect the OS setting: fade, do not travel. */
      '@media(prefers-reduced-motion:reduce){',
      '.fa-np-card{transform:none;transition:opacity .2s linear}',
      '.fa-np-strip{transform:none;opacity:0;transition:opacity .2s linear,visibility 0s linear .2s}',
      '.fa-np-strip.fa-open{opacity:1;transition:opacity .2s linear,visibility 0s}}'
    ].join('');
    var style = document.createElement('style');
    style.id = 'fa-np-styles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ── markup ──────────────────────────────────────────────────
  function buildCard() {
    overlay = document.createElement('div');
    overlay.className = 'fa-np-overlay';
    overlay.innerHTML =
      '<div class="fa-np-card" role="dialog" aria-modal="true" aria-labelledby="fa-np-title">' +
        '<button type="button" class="fa-np-close" aria-label="Close">✕</button>' +
        '<div class="fa-np-body">' +
          '<p class="fa-np-kicker">Fola Adeleke’s Notes — Newsletter</p>' +
          '<h2 id="fa-np-title">25% off your first order</h2>' +
          '<p class="fa-np-sub">Subscribe and get 25% off your first order.<br>' +
            'Plus first access to every drop, direct from Fola.</p>' +
          '<input type="text" class="fa-np-hp" tabindex="-1" autocomplete="off" aria-hidden="true">' +
          '<div class="fa-np-field">' +
            '<input type="email" id="fa-np-email" placeholder="YOUR EMAIL" autocomplete="email" aria-label="Your email">' +
            '<button type="button" class="fa-np-join">Subscribe</button>' +
          '</div>' +
          '<p class="fa-np-msg" role="status"></p>' +
          '<p class="fa-np-legal">By subscribing you agree to receive emails from Fola Adeleke. ' +
            '<a href="/unsubscribe.html">Unsubscribe</a> any time.</p>' +
        '</div>' +
        '<div class="fa-np-ok" hidden>' +
          '<p class="fa-np-kicker">Fola Adeleke’s Notes</p>' +
          '<p style="font-size:14px;letter-spacing:.3em;text-transform:uppercase">Almost there.</p>' +
          '<p style="font-size:10px;letter-spacing:.08em;line-height:1.9;color:#6f6f6f">' +
            'Check the new tab to confirm your<br>subscription and unlock your 25% off.</p>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    card       = overlay.querySelector('.fa-np-card');
    emailInput = overlay.querySelector('#fa-np-email');
    msg        = overlay.querySelector('.fa-np-msg');
    formWrap   = overlay.querySelector('.fa-np-body');
    okWrap     = overlay.querySelector('.fa-np-ok');

    overlay.addEventListener('click', function (e) { if (e.target === overlay) closeCard(); });
    overlay.querySelector('.fa-np-close').addEventListener('click', closeCard);
    overlay.querySelector('.fa-np-join').addEventListener('click', join);
    emailInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') join(); });
  }

  function buildStrip() {
    strip = document.createElement('div');
    strip.className = 'fa-np-strip';
    strip.setAttribute('role', 'region');
    strip.setAttribute('aria-label', 'Newsletter offer');
    strip.style.top = navHeight() + 'px';
    strip.innerHTML =
      '<span>25% off your first order</span>' +
      '<button type="button" class="fa-np-cta">Join the Notes</button>' +
      '<button type="button" class="fa-np-close" aria-label="Dismiss">✕</button>';
    document.body.appendChild(strip);

    strip.querySelector('.fa-np-cta').addEventListener('click', function () {
      closeStrip();
      openCard();
    });
    strip.querySelector('.fa-np-close').addEventListener('click', closeStrip);
    window.addEventListener('resize', function () { strip.style.top = navHeight() + 'px'; });
  }

  // ── open / close ────────────────────────────────────────────
  // A freshly appended element has no painted start state, so adding the open
  // class in the same frame skips the transition entirely. Force the start
  // style to be computed first, then open on the next frame.
  function reveal(el, after) {
    void getComputedStyle(el).transform;
    requestAnimationFrame(function () { el.classList.add('fa-open'); if (after) after(); });
  }

  function openCard() {
    if (!overlay) buildCard();
    lastFocus = document.activeElement;
    reveal(card.parentNode);
    document.body.style.overflow = 'hidden';
    markCardSeen();
    setTimeout(function () { emailInput.focus(); }, RISE);
  }

  function closeCard() {
    if (!overlay) return;
    overlay.classList.remove('fa-open');
    document.body.style.overflow = '';
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function openStrip() {
    if (!strip) buildStrip();
    strip.style.top = navHeight() + 'px';
    reveal(strip);
    markStripSeen();
    stripTimer = setTimeout(closeStrip, STRIP_LIFE);
  }

  function closeStrip() {
    clearTimeout(stripTimer);
    if (strip) strip.classList.remove('fa-open');
  }

  // Keep Tab inside the card while it is open — it is a blocking dialog.
  function onKeydown(e) {
    if (e.key === 'Escape') { closeCard(); closeStrip(); return; }
    if (e.key !== 'Tab' || !overlay || !overlay.classList.contains('fa-open')) return;
    var items = card.querySelectorAll('button, input[type="email"], a[href]');
    if (!items.length) return;
    var first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  // ── subscribe ───────────────────────────────────────────────
  function join() {
    var email = emailInput.value.trim();
    if (card.querySelector('.fa-np-hp').value) { closeCard(); return; }   // honeypot

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      msg.style.color = '#c00';
      msg.textContent = 'Please enter a valid email address.';
      emailInput.focus();
      return;
    }

    // Beehiiv's hosted form, email pre-filled — the only guaranteed-working path.
    window.open(BEEHIIV + '?email=' + encodeURIComponent(email), '_blank');
    set(SUBBED, '1');
    formWrap.hidden = true;
    okWrap.hidden = false;
  }

  // ── run ─────────────────────────────────────────────────────
  // Most pages open behind a loading curtain that holds for at least 1.8s and
  // then fades. Opening into that means the pop-up rises over a loading screen,
  // so wait for the curtain to clear and time the delay from there.
  function afterCurtain(fn) {
    var loader = document.getElementById('page-loader');
    if (!loader || loader.classList.contains('hidden')) { fn(); return; }

    var done = false;
    function go() { if (done) return; done = true; observer.disconnect(); fn(); }
    var observer = new MutationObserver(function () {
      if (loader.classList.contains('hidden')) go();
    });
    observer.observe(loader, { attributes: true, attributeFilter: ['class'] });
    setTimeout(go, CURTAIN_MAX);
  }

  function start() {
    var views = bumpViews();
    if (!shouldRun(views)) return;
    injectStyles();
    document.addEventListener('keydown', onKeydown);

    var open  = isHome() ? openCard : openStrip;
    var delay = isHome() ? HOME_DELAY : STRIP_DELAY;
    function begin() { afterCurtain(function () { setTimeout(open, delay); }); }
    if (document.readyState === 'complete') begin();
    else window.addEventListener('load', begin);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
