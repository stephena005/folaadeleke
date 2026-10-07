/* ──────────────────────────────────────────────────────────────
   Homepage takeover mocks — shared behaviour (v2: conversion)
   - FA.prints: every print, with the real shop data from prints/index.html
     (Shopify URL, sizes + prices, edition, new / sold-out flags)
   - Quick view: click any print → product panel with size picker and a
     Buy button straight to the Shopify product. One click from home to PDP.
   - Propeller curtain: same MIN_SHOW / FADE as index.html
   - Newsletter card: same markup/copy as js/newsletter-popup.js, but it
     waits until the visitor has looked (8s) or is leaving (exit intent),
     never interrupts an open quick view, and folds into a persistent
     "25% off" tab when closed. Mock only — Subscribe does not call beehiiv.
     ?popup=0 suppresses it; ?popup=now opens it straight away.
   ────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  var BASE = '/images/prints/thumbs/';
  var SHOP = 'https://shop.folaadeleke.com/products/';
  var SIZES = [{ id: 'A3', price: 200 }, { id: 'A2', price: 250 }, { id: 'A1', price: 300 }];
  var SPEC = 'Archival pigment print · Signed & numbered · Certificate of authenticity';

  // [slug, title, shopHandle, flags]  — n = new, s = sold out
  var PRINTS = [
    ['the-land-is-green', 'The Land Is Green', 'the-land-is-green', 'n'],
    ['attention-seeker', 'Attention Seeker', 'attention-seeker', 'n'],
    ['centre-of-the-stage', 'Centre of the Stage', 'centre-of-stage', 'n'],
    ['city-girls', 'City Girls', 'city-girls'],
    ['yemaya', 'Yemaya', 'yemaya'],
    ['unapologetic', 'Unapologetic', 'unapologetic'],
    ['no-vc', 'No VC / No Vacation', 'novc'],
    ['sisterhood', 'Sisterhood', 'sisterhood'],
    ['the-crown-she-carries', 'The Crown She Carries', 'the-crown-she-carries'],
    ['one-vow', 'One Vow', 'one-vow'],
    ['anniversary', 'Anniversary', 'anniversary'],
    ['black-excellence', 'Black Excellence', 'black-excellence'],
    ['husband-and-wife', 'Husband & Wife', 'husband-and-wife'],
    ['kingdom-we-carry', 'The Kingdom We Carry', 'kingdom-we-carry'],
    ['state-of-the-union', 'State of the Union', 'state-of-the-union'],
    ['i-do', 'I Do', 'i-do'],
    ['mother-of-a-nation', 'Mother of a Nation', 'mother-of-a-nation'],
    ['girl-dad', 'Girl Dad', 'girl-dad'],
    ['family-council', 'Family Council', 'family-council'],
    ['my-sons-father', 'My Son’s Father Was Fatherless', 'my-sons-father'],
    ['elders-guidance', 'Elders Guidance', 'elders-guidance'],
    ['papas-girl', 'Papa’s Girl', 'papa-s-girl'],
    ['brotherhood', 'Brotherhood', 'brotherhood'],
    ['community', 'Community', 'community'],
    ['uncles-stay-lit', 'Uncles Stay Lit', 'uncles-stay-lit'],
    ['we-give-thanks', 'We Give Thanks', 'we-give-thanks'],
    ['birthday-function', 'Birthday Function', 'birthday-function'],
    ['saturday-function', 'Saturday Function', 'saturday-function'],
    ['loud-celebration', 'Loud Celebration', '', 's'],
    ['loud-ancestors', 'Loud Ancestors', 'loud-ancestors'],
    ['life-of-a-masquerade', 'Life of a Masquerade', 'life-is-a-masquerade'],
    ['iykyk', 'If You Know, You Know, Sha', 'if-you-know-you-know-sha'],
    ['drowned-kehinde', 'Drowned in Native Cloth — Kehinde', 'drowned-in-cloth-kehinde'],
    ['drowned-taiwo', 'Drowned in Native Cloth — Taiwo', 'drowned-in-cloth']
  ].map(function (p) {
    var f = p[3] || '';
    return {
      slug: p[0], title: p[1], src: BASE + p[0] + '.jpg', href: '/prints#' + p[0],
      shop: p[2] ? SHOP + p[2] : '', isNew: f.indexOf('n') > -1, sold: f.indexOf('s') > -1,
      edition: 15, from: 200
    };
  });

  var HERO = { slug: 'gallery', title: 'The Gallery', src: 'gallery-hero.jpg', href: '/prints', hero: true };
  var bySlug = {}; PRINTS.forEach(function (p) { bySlug[p.slug] = p; });

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
  function priceTag(p) { return p.sold ? 'Sold out' : 'From £' + p.from; }

  function shuffle(a) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  // Hand out prints in a shuffled loop, never repeating one already on screen.
  // New prints come round twice as often — they are what we most want seen.
  function Deck(list) {
    var queue = [], live = {};
    var weighted = list.concat(list.filter(function (p) { return p.isNew; }));
    function refill() { queue = shuffle(weighted); }
    return {
      next: function () {
        for (var guard = 0; guard < weighted.length * 2; guard++) {
          if (!queue.length) refill();
          var p = queue.shift();
          if (!live[p.slug]) { live[p.slug] = 1; return p; }
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
  var touch = window.matchMedia && matchMedia('(hover: none)').matches;

  // ── chrome ──────────────────────────────────────────────────
  function chrome(opts) {
    var html =
      '<div id="page-loader"><div class="propeller-icon"></div></div>' +
      '<nav class="' + (opts.ghostNav ? 'nav-ghost' : '') + '">' +
        '<button class="hamburger" aria-label="Open menu">☰</button>' +
        '<span class="nav-brand">Fola Adeleke®</span>' +
        '<div class="nav-right"><a class="nav-shop" href="/prints">Shop Prints</a>' +
        '<a class="nav-contact" href="https://shop.folaadeleke.com/cart" aria-label="Basket">Basket</a></div>' +
      '</nav>' +
      '<div class="drawer-overlay"></div>' +
      '<div class="drawer" aria-hidden="true">' +
        '<button class="drawer-close" aria-label="Close menu">✕</button>' +
        '<a href="/prints">Shop Prints</a><a href="/products">World</a>' +
        '<a href="/artist">Artist</a><a href="/press">Press</a><a href="/contact">Contact</a>' +
      '</div>' +
      '<div class="qv-scrim" id="qvScrim"></div>' +
      '<aside class="qv" id="qv" role="dialog" aria-modal="true" aria-labelledby="qvTitle" aria-hidden="true"></aside>' +
      '<button class="offer-tab" id="offerTab" type="button" hidden>25% off your first order</button>' +
      '<button class="mock-replay" type="button">Replay intro</button>';
    document.body.insertAdjacentHTML('afterbegin', html);

    var drawer = document.querySelector('.drawer'), scrim = document.querySelector('.drawer-overlay');
    function toggle(on) { drawer.classList.toggle('open', on); scrim.classList.toggle('open', on); }
    document.querySelector('.hamburger').onclick = function () { toggle(true); };
    document.querySelector('.drawer-close').onclick = scrim.onclick = function () { toggle(false); };
    document.querySelector('.mock-replay').onclick = function () { location.reload(); };
    document.getElementById('offerTab').onclick = function () { openCard(true); };
    document.getElementById('qvScrim').onclick = closeQuick;
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      toggle(false); closeCard(); closeQuick();
    });

    // Any element with data-quick="slug" opens the quick view instead of navigating.
    document.addEventListener('click', function (e) {
      var t = e.target.closest('[data-quick]');
      if (!t) return;
      e.preventDefault();
      openQuick(bySlug[t.getAttribute('data-quick')]);
    });
  }

  // ── quick view ──────────────────────────────────────────────
  var qvOpen = false, qvListeners = [];
  function openQuick(p) {
    if (!p) return;
    var qv = document.getElementById('qv');
    var size = 'A2';
    function buyLabel() {
      var s = SIZES.filter(function (x) { return x.id === size; })[0];
      return 'Buy ' + s.id + ' — £' + s.price;
    }
    qv.innerHTML =
      '<button class="qv-close" type="button" aria-label="Close">✕</button>' +
      '<div class="qv-img"><img src="' + p.src + '" alt="' + esc(p.title) + ' — fine art print by Fola Adeleke"></div>' +
      '<div class="qv-info">' +
        '<p class="qv-kicker">' + (p.isNew ? '<span class="flag">New</span>' : '') + 'Limited edition of ' + p.edition + '</p>' +
        '<h2 id="qvTitle">' + esc(p.title) + '</h2>' +
        '<p class="qv-spec">' + SPEC + '</p>' +
        (p.sold
          ? '<p class="qv-sold">This edition has sold out.</p>' +
            '<button class="qv-buy" type="button" data-join>Join the list for the next drop</button>'
          : '<div class="qv-sizes" role="radiogroup" aria-label="Size">' +
              SIZES.map(function (s) {
                return '<button type="button" role="radio" data-size="' + s.id + '" aria-checked="' + (s.id === size) + '">' +
                  s.id + '<small>£' + s.price + '</small></button>';
              }).join('') +
            '</div>' +
            '<a class="qv-buy" href="' + p.shop + '">' + buyLabel() + ' &rarr;</a>') +
        '<a class="qv-wall underline-link" href="' + p.href + '">See it on a wall &rarr;</a>' +
        '<p class="qv-offer">New here? <button type="button" data-join>Take 25% off your first order</button></p>' +
      '</div>';
    qv.querySelector('.qv-close').onclick = closeQuick;
    qv.querySelectorAll('[data-size]').forEach(function (b) {
      b.onclick = function () {
        size = b.getAttribute('data-size');
        qv.querySelectorAll('[data-size]').forEach(function (x) { x.setAttribute('aria-checked', x === b); });
        qv.querySelector('a.qv-buy').innerHTML = buyLabel() + ' &rarr;';
      };
    });
    qv.querySelectorAll('[data-join]').forEach(function (b) { b.onclick = function () { closeQuick(); openCard(true); }; });
    qv.setAttribute('aria-hidden', 'false');
    document.getElementById('qvScrim').classList.add('open');
    requestAnimationFrame(function () { qv.classList.add('open'); });
    qvOpen = true;
    emit('quick', true);
  }
  function closeQuick() {
    if (!qvOpen) return;
    var qv = document.getElementById('qv');
    qv.classList.remove('open'); qv.setAttribute('aria-hidden', 'true');
    document.getElementById('qvScrim').classList.remove('open');
    qvOpen = false;
    emit('quick', false);
    if (cardPending) { cardPending = false; setTimeout(function () { openCard(); }, 900); }
  }
  function on(fn) { qvListeners.push(fn); }
  function emit(k, v) { qvListeners.forEach(function (f) { f(k, v); }); }

  // ── curtain ─────────────────────────────────────────────────
  function curtain(ready) {
    var loader = document.getElementById('page-loader');
    var FADE = 608, MIN_SHOW = 1800, t0 = Date.now();
    return Promise.resolve(ready).then(function () {
      return new Promise(function (res) {
        setTimeout(function () {
          loader.style.transition = 'opacity ' + FADE + 'ms ease';
          loader.style.opacity = '0';
          res();
          setTimeout(function () { loader.classList.add('hidden'); }, FADE);
        }, Math.max(0, MIN_SHOW - (Date.now() - t0)));
      });
    });
  }

  // ── newsletter card ─────────────────────────────────────────
  var overlay, cardShown = false, cardPending = false;
  function openCard(byUser) {
    if (!byUser) {
      if (/[?&]popup=0/.test(location.search) || cardShown) return;
      if (qvOpen) { cardPending = true; return; }       // never stack on a quick view
    }
    cardShown = true;
    document.getElementById('offerTab').hidden = true;
    if (!overlay) {
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
              '<input type="email" id="faNpEmail" placeholder="YOUR EMAIL" aria-label="Your email">' +
              '<button type="button" class="fa-np-join">Get 25% off</button>' +
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
            '<a class="qv-buy" href="/prints" style="margin-top:8px">Keep browsing the prints &rarr;</a>' +
          '</div>' +
        '</div>';
      document.body.appendChild(overlay);
      overlay.addEventListener('click', function (e) { if (e.target === overlay) closeCard(); });
      overlay.querySelector('.fa-np-close').onclick = closeCard;
      overlay.querySelector('.fa-np-join').onclick = function () {
        overlay.querySelector('.fa-np-body').hidden = true;
        overlay.querySelector('.fa-np-ok').hidden = false;
        joined = true;
      };
    }
    void getComputedStyle(overlay).opacity;
    requestAnimationFrame(function () { overlay.classList.add('fa-open'); });
    emit('card', true);
  }
  var joined = false;
  function closeCard() {
    if (!overlay || !overlay.classList.contains('fa-open')) return;
    overlay.classList.remove('fa-open');
    if (!joined) document.getElementById('offerTab').hidden = false;   // the offer stays one tap away
    emit('card', false);
  }

  // Show once the visitor has had a proper look (or is heading for the exit).
  function armCard() {
    if (/[?&]popup=now/.test(location.search)) return setTimeout(openCard, 1300);
    var DWELL = 8000;
    setTimeout(openCard, DWELL);
    document.addEventListener('mouseout', function (e) {
      if (!e.relatedTarget && e.clientY <= 0) openCard();
    });
  }

  // ── boot ────────────────────────────────────────────────────
  function boot(opts, start) {
    chrome(opts);
    var ready = preload(opts.preload || PRINTS.slice(0, 16));
    curtain(ready).then(function () { start(); armCard(); });
  }

  window.FA = {
    prints: PRINTS, hero: HERO, bySlug: bySlug, sizes: SIZES, spec: SPEC,
    shuffle: shuffle, Deck: Deck, boot: boot, on: on, openQuick: openQuick, openCard: openCard,
    priceTag: priceTag, esc: esc, reduced: reduced, touch: touch
  };
})();
