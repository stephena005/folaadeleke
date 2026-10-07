/* ──────────────────────────────────────────────────────────────
   Homepage takeover mocks — shared behaviour
   - FA.prints: every print on the site (one per artwork) + the gallery hero
   - Propeller curtain: same MIN_SHOW / FADE as index.html
   - Newsletter card: same markup, copy and timing as js/newsletter-popup.js
     (opens 700ms after the curtain clears). Mock only — Subscribe does not
     call beehiiv. ?popup=0 suppresses it.
   ────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  var BASE = 'thumbs/';
  var PRINTS = [
    ['the-land-is-green', 'The Land Is Green'],
    ['attention-seeker', 'Attention Seeker'],
    ['centre-of-the-stage', 'Centre of the Stage'],
    ['i-do', 'I Do'],
    ['anniversary', 'Anniversary'],
    ['birthday-function', 'Birthday Function'],
    ['black-excellence', 'Black Excellence'],
    ['brotherhood', 'Brotherhood'],
    ['city-girls', 'City Girls'],
    ['community', 'Community'],
    ['drowned-kehinde', 'Drowned — Kehinde'],
    ['drowned-taiwo', 'Drowned — Taiwo'],
    ['elders-guidance', 'Elders’ Guidance'],
    ['family-council', 'Family Council'],
    ['girl-dad', 'Girl Dad'],
    ['husband-and-wife', 'Husband & Wife'],
    ['iykyk', 'IYKYK'],
    ['kingdom-we-carry', 'Kingdom We Carry'],
    ['life-of-a-masquerade', 'Life of a Masquerade'],
    ['loud-ancestors', 'Loud Ancestors'],
    ['loud-celebration', 'Loud Celebration'],
    ['mother-of-a-nation', 'Mother of a Nation'],
    ['my-sons-father', 'My Son’s Father'],
    ['no-vc', 'No VC'],
    ['one-vow', 'One Vow'],
    ['papas-girl', 'Papa’s Girl'],
    ['saturday-function', 'Saturday Function'],
    ['sisterhood', 'Sisterhood'],
    ['state-of-the-union', 'State of the Union'],
    ['the-crown-she-carries', 'The Crown She Carries'],
    ['unapologetic', 'Unapologetic'],
    ['uncles-stay-lit', 'Uncles Stay Lit'],
    ['we-give-thanks', 'We Give Thanks'],
    ['yemaya', 'Yemaya']
  ].map(function (p) {
    return { slug: p[0], title: p[1], src: BASE + p[0] + '.jpg', href: '/prints#' + p[0] };
  });

  var HERO = { slug: 'gallery', title: 'The Gallery', src: 'gallery-hero.jpg', href: '/prints' };

  function shuffle(a) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  // Hand out prints in a shuffled loop, never repeating one already on screen.
  function Deck(list) {
    var queue = [], live = {};
    function refill() { queue = shuffle(list); }
    return {
      next: function () {
        for (var guard = 0; guard < list.length * 2; guard++) {
          if (!queue.length) refill();
          var p = queue.shift();
          if (!live[p.slug]) { live[p.slug] = 1; return p; }
          queue.push(p);
        }
        return list[Math.floor(Math.random() * list.length)];
      },
      release: function (p) { if (p) delete live[p.slug]; }
    };
  }

  function preload(list) {
    return Promise.all(list.map(function (p) {
      return new Promise(function (res) {
        var i = new Image(); i.onload = i.onerror = res; i.src = p.src;
      });
    }));
  }

  var reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ── chrome ──────────────────────────────────────────────────
  function chrome(opts) {
    opts = opts || {};
    var html =
      '<div id="page-loader"><div class="propeller-icon"></div></div>' +
      '<nav class="' + (opts.ghostNav ? 'nav-ghost' : '') + '">' +
        '<button class="hamburger" aria-label="Open menu">☰</button>' +
        '<span class="nav-brand">Fola Adeleke®</span>' +
        '<a class="nav-contact" href="/contact">Contact</a>' +
      '</nav>' +
      '<div class="drawer-overlay"></div>' +
      '<div class="drawer" aria-hidden="true">' +
        '<button class="drawer-close" aria-label="Close menu">✕</button>' +
        '<a href="/">Home</a><a href="/prints">Prints</a><a href="/products">World</a>' +
        '<a href="/artist">Artist</a><a href="/press">Press</a><a href="/contact">Contact</a>' +
      '</div>' +
      '<button class="mock-replay" type="button">Replay intro</button>';
    document.body.insertAdjacentHTML('afterbegin', html);

    var drawer = document.querySelector('.drawer'), scrim = document.querySelector('.drawer-overlay');
    function toggle(on) { drawer.classList.toggle('open', on); scrim.classList.toggle('open', on); }
    document.querySelector('.hamburger').onclick = function () { toggle(true); };
    document.querySelector('.drawer-close').onclick = scrim.onclick = function () { toggle(false); };
    document.querySelector('.mock-replay').onclick = function () { location.reload(); };
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { toggle(false); closeCard(); } });
  }

  // ── curtain ─────────────────────────────────────────────────
  function curtain(ready) {
    var loader = document.getElementById('page-loader');
    var FADE = 608, MIN_SHOW = 1800, t0 = Date.now();
    return Promise.resolve(ready).then(function () {
      return new Promise(function (res) {
        setTimeout(function () {
          loader.style.transition = 'opacity ' + FADE + 'ms ease';
          loader.style.opacity = '0';
          res();                                   // grid starts animating as the curtain lifts
          setTimeout(function () { loader.classList.add('hidden'); }, FADE);
        }, Math.max(0, MIN_SHOW - (Date.now() - t0)));
      });
    });
  }

  // ── newsletter card ─────────────────────────────────────────
  var overlay;
  function openCard() {
    if (/[?&]popup=0/.test(location.search)) return;
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
          '<div class="fa-np-field">' +
            '<input type="email" placeholder="YOUR EMAIL" aria-label="Your email">' +
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
    overlay.addEventListener('click', function (e) { if (e.target === overlay) closeCard(); });
    overlay.querySelector('.fa-np-close').onclick = closeCard;
    overlay.querySelector('.fa-np-join').onclick = function () {
      overlay.querySelector('.fa-np-body').hidden = true;
      overlay.querySelector('.fa-np-ok').hidden = false;
    };
    void getComputedStyle(overlay).opacity;
    requestAnimationFrame(function () { overlay.classList.add('fa-open'); });
  }
  function closeCard() { if (overlay) overlay.classList.remove('fa-open'); }

  // ── boot ────────────────────────────────────────────────────
  // run(start) — start() is called the moment the curtain begins to lift.
  function boot(opts, start) {
    chrome(opts);
    var ready = preload(opts.preload || PRINTS.slice(0, 16));
    curtain(ready).then(function () {
      start();
      setTimeout(openCard, 608 + 700);             // curtain fade + HOME_DELAY
    });
  }

  window.FA = { prints: PRINTS, hero: HERO, shuffle: shuffle, Deck: Deck, boot: boot, reduced: reduced };
})();
