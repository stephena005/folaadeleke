/* World — The Living Room (/world). The page sets window.ROOM (plate
   size, wall frames, print rack, product hotspots, all in plate pixels)
   before this script runs. Product copy and prices mirror /products and
   /prints — change a price there, change it here. See design.md §12.

   Frames are live: each wall frame holds a curated set of prints and the
   leaning rack holds the rest of the collection. Prints are mapped into
   the photo's frames with a perspective transform and lit by a light map
   taken from the render, so a swapped print sits in the same sunlight. */
(function () {
  var R = window.ROOM;
  var SPEC = 'Archival pigment print · Signed &amp; numbered · Certificate of authenticity';
  var SIZES = [{ id: 'A3', price: 100 }, { id: 'A2', price: 150 }, { id: 'A1', price: 200 }];
  var SHOP = 'https://shop.folaadeleke.com/products/';

  // slug: [title, Shopify handle]
  var PRINTS = {
    'mummys-boy': ['Mummy’s Boy', 'mummys-boy'],
    'loud-cloth': ['Loud Cloth', 'loud-cloth'],
    'on-point': ['On Point', 'on-point'],
    'attention-seeker': ['Attention Seeker', 'attention-seeker'],
    'centre-of-the-stage': ['Centre of the Stage', 'centre-of-stage'],
    'i-do': ['I Do', 'i-do'],
    'papas-girl': ['Papa’s Girl', 'papa-s-girl'],
    'the-crown-she-carries': ['The Crown She Carries', 'the-crown-she-carries'],
    'state-of-the-union': ['State of the Union', 'state-of-the-union'],
    'kingdom-we-carry': ['The Kingdom We Carry', 'kingdom-we-carry'],
    'sisterhood': ['Sisterhood', 'sisterhood'],
    'unapologetic': ['Unapologetic', 'unapologetic'],
    'drowned-taiwo': ['Drowned in Native Cloth — Taiwo', 'drowned-in-cloth'],
    'drowned-kehinde': ['Drowned in Native Cloth — Kehinde', 'drowned-in-cloth-kehinde'],
    'iykyk': ['If You Know, You Know, Sha', 'if-you-know-you-know-sha'],
    'husband-and-wife': ['Husband & Wife', 'husband-and-wife'],
    'elders-guidance': ['Elders Guidance', 'elders-guidance'],
    'saturday-function': ['Saturday Function', 'saturday-function'],
    'my-sons-father': ['My Son’s Father Was Fatherless', 'my-sons-father'],
    'black-excellence': ['Black Excellence', 'black-excellence'],
    'family-council': ['Family Council', 'family-council'],
    'we-give-thanks': ['We Give Thanks', 'we-give-thanks'],
    'life-of-a-masquerade': ['Life of a Masquerade', 'life-is-a-masquerade'],
    'yemaya': ['Yemaya', 'yemaya'],
    'one-vow': ['One Vow', 'one-vow'],
    'girl-dad': ['Girl Dad', 'girl-dad'],
    'mother-of-a-nation': ['Mother of a Nation', 'mother-of-a-nation']
  };
  function art(slug) { return '/images/prints/web/' + slug + '.jpg'; }
  function thumb(slug) { return '/images/prints/thumbs/' + slug + '.jpg'; }

  var PRODUCTS = {
    'mama-comfort': {
      kicker: 'Collectible Figure', flag: 'Pre-order', title: 'Mama Comfort', price: '£150',
      priceNote: 'Paid in full at checkout · Est. dispatch January 2027',
      desc: 'A 280 mm soft vinyl figure in matte black with gold jewellery. Numbered edition of 20.',
      href: '/products/mama-comfort', cta: 'View full product',
      imgs: ['/images/mama-comfort/front-c04.jpg', '/images/mama-comfort/side-c04.jpg', '/images/mama-comfort/back-c04.jpg', '/images/mama-comfort/detail-c04.jpg'],
      thumb: '/images/mama-comfort/card-black-gold.jpg'
    },
    'cards': {
      kicker: 'Playing Cards', flag: 'New', title: 'Fola Adeleke Playing Cards', price: 'In the shop',
      priceNote: 'Sold on the Fola Adeleke shop',
      desc: 'A full 52-card deck dressed in zebra. Kings, queens and jacks are photographic portraits in zebra-print agbada and gowns with gold jewellery; every card shares one back. Tuck-end box, 64 × 102 × 23 mm.',
      href: 'https://shop.folaadeleke.com/products/playing-cards', cta: 'Buy in the shop',
      imgs: ['/images/world/cards/box-front.jpg', '/images/world/cards/kh.jpg', '/images/world/cards/qs.jpg', '/images/world/cards/card-back.jpg'],
      thumb: '/images/world/cards/box-front.jpg'
    },
    'phone': {
      kicker: 'Digital Product', title: 'Propeller Wallpaper Collection', price: '£9.99',
      priceNote: 'Instant download',
      desc: '5 phone wallpapers, one per colorway — Indigo, Denim, Green, Gold and Sand.',
      href: '/products/propeller-wallpaper-pack', cta: 'View full product',
      imgs: ['/images/Propeller/propeller-wallpapers-1290x2796/propeller-indigo-1290x2796.jpg', '/images/Propeller/propeller-wallpapers-1290x2796/propeller-gold-1290x2796.jpg', '/images/Propeller/propeller-wallpapers-1290x2796/propeller-green-1290x2796.jpg', '/images/Propeller/propeller-wallpapers-1290x2796/propeller-sand-1290x2796.jpg'],
      thumb: '/images/Propeller/propeller-wallpapers-1290x2796/propeller-indigo-1290x2796.jpg'
    }
  };

  var body = document.body, stage = document.getElementById('stage'), scene = document.getElementById('scene');
  var tag = document.getElementById('tag');
  var touch = window.matchMedia('(hover: none)').matches;
  var still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (touch) body.classList.add('touch');
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function pct(v, of) { return (v / of * 100) + '%'; }
  function place(el, b) {
    el.style.left = pct(b[0], R.w); el.style.top = pct(b[1], R.h);
    el.style.width = pct(b[2] - b[0], R.w); el.style.height = pct(b[3] - b[1], R.h);
  }
  function bbox(q) {
    var xs = q.map(function (p) { return p[0]; }), ys = q.map(function (p) { return p[1]; });
    return [Math.min.apply(0, xs), Math.min.apply(0, ys), Math.max.apply(0, xs), Math.max.apply(0, ys)];
  }
  function addDot(box, dotY) {
    var dot = document.createElement('span'); dot.className = 'dot';
    dot.style.left = pct((box[0] + box[2]) / 2, R.w); dot.style.top = pct(dotY != null ? dotY : (box[1] + box[3]) / 2, R.h);
    scene.appendChild(dot);
  }

  // A w×h box onto a four-point quad (TL, TR, BR, BL), as a CSS matrix3d.
  function quadMatrix(w, h, q) {
    var x0 = q[0][0], y0 = q[0][1], x1 = q[1][0], y1 = q[1][1], x2 = q[2][0], y2 = q[2][1], x3 = q[3][0], y3 = q[3][1];
    var dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3, dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
    var g = 0, hh = 0;
    if (dx3 || dy3) { var det = dx1 * dy2 - dx2 * dy1; g = (dx3 * dy2 - dx2 * dy3) / det; hh = (dx1 * dy3 - dx3 * dy1) / det; }
    var a = x1 - x0 + g * x1, b = x3 - x0 + hh * x3, d = y1 - y0 + g * y1, e = y3 - y0 + hh * y3;
    return 'matrix3d(' + [a / w, d / w, 0, g / w, b / h, e / h, 0, hh / h, 0, 0, 1, 0, x0, y0, 0, 1].join(',') + ')';
  }

  // ── live frames: wall slots + the rack ──
  var planes = [];          // plate-space layers, rescaled with the scene
  var groups = [];          // { el, plane, set, i, kind, imgs, flip }
  function makePlane(quad, light) {
    var plane = document.createElement('div'); plane.className = 'plane';
    var w = Math.round((Math.hypot(quad[1][0] - quad[0][0], quad[1][1] - quad[0][1]) + Math.hypot(quad[2][0] - quad[3][0], quad[2][1] - quad[3][1])) / 2);
    var h = Math.round((Math.hypot(quad[3][0] - quad[0][0], quad[3][1] - quad[0][1]) + Math.hypot(quad[2][0] - quad[1][0], quad[2][1] - quad[1][1])) / 2);
    var win = document.createElement('div'); win.className = 'win';
    win.style.width = w + 'px'; win.style.height = h + 'px'; win.style.transform = quadMatrix(w, h, quad);
    var a = new Image(), b = new Image(); a.alt = b.alt = ''; a.className = 'art show'; b.className = 'art';
    win.appendChild(a); win.appendChild(b); plane.appendChild(win);
    var bb = bbox(quad), lt = new Image(); lt.className = 'light'; lt.alt = ''; lt.src = light;
    lt.style.left = bb[0] + 'px'; lt.style.top = bb[1] + 'px'; lt.style.width = (bb[2] - bb[0]) + 'px'; lt.style.height = (bb[3] - bb[1]) + 'px';
    lt.style.clipPath = 'polygon(' + quad.map(function (p) { return (p[0] - bb[0]) + 'px ' + (p[1] - bb[1]) + 'px'; }).join(',') + ')';
    plane.appendChild(lt);
    scene.appendChild(plane); planes.push(plane);
    return { plane: plane, imgs: [a, b] };
  }
  function show(g, i) {
    g.i = (i + g.set.length) % g.set.length;
    var slug = g.set[g.i], next = g.imgs[g.flip ? 0 : 1], cur = g.imgs[g.flip ? 1 : 0];
    next.onload = function () { next.classList.add('show'); cur.classList.remove('show'); g.flip = !g.flip; };
    next.src = art(slug);
    if (active === g) fillTag(g);
  }
  function makeGroup(kind, cfg) {
    var p = makePlane(cfg.quad, cfg.light);
    var el = document.createElement('div'); el.className = 'spot group';
    var lift = new Image(); lift.src = cfg.lift; lift.alt = ''; el.appendChild(lift);
    var hit = document.createElement(kind === 'rack' ? 'button' : 'a'); hit.className = 'hit';
    if (kind === 'rack') hit.type = 'button';
    el.appendChild(hit);
    ['prev', 'next'].forEach(function (dir) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'swap ' + dir;
      b.setAttribute('aria-label', (dir === 'prev' ? 'Previous' : 'Next') + ' print in this frame'); b.innerHTML = dir === 'prev' ? '&lsaquo;' : '&rsaquo;';
      b.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); g.touched = Date.now(); show(g, g.i + (dir === 'prev' ? -1 : 1)); });
      el.appendChild(b);
    });
    place(el, cfg.box); scene.appendChild(el); addDot(cfg.box, cfg.dotY);
    var g = { kind: kind, el: el, hit: hit, plane: p.plane, imgs: p.imgs, set: cfg.set, i: 0, flip: false, touched: 0 };
    p.imgs[0].src = art(cfg.set[0]);
    groups.push(g); bindHover(g, hit);
    hit.addEventListener('click', function (e) {
      if (lastPointer === 'touch' && active !== g) { e.preventDefault(); on(g); return; }
      if (kind === 'rack') { e.preventDefault(); openRack(g.i, hit); }
    });
    syncHref(g);
    return g;
  }
  function syncHref(g) {
    if (g.kind !== 'wall') return;
    var slug = g.set[g.i]; g.hit.href = '/prints#' + slug;
    g.hit.setAttribute('aria-label', PRINTS[slug][0] + ', from £100 — view in prints');
  }
  (R.wall || []).forEach(function (w) { makeGroup('wall', w); });
  var rack = null;
  if (R.rack) {
    var patch = new Image(); patch.className = 'patch'; patch.src = R.rack.patch.src; patch.alt = '';
    place(patch, R.rack.patch.box); scene.appendChild(patch);
    rack = makeGroup('rack', R.rack);
    rack.hit.setAttribute('aria-label', 'The print rack, ' + R.rack.set.length + ' prints — browse');
  }

  // ── product hotspots ──
  R.spots.forEach(function (s) {
    var p = PRODUCTS[s.id];
    var el = document.createElement('button'); el.type = 'button'; el.className = 'spot'; el.dataset.id = s.id;
    el.setAttribute('aria-label', p.title + ', ' + p.price + ' — quick view');
    var img = new Image(); img.src = s.lift; img.alt = ''; el.appendChild(img);
    place(el, s.box); scene.appendChild(el); addDot(s.box, s.dotY);
    var sp = { kind: 'product', el: el, hit: el, p: p, s: s };
    bindHover(sp, el);
    el.addEventListener('click', function (e) {
      if (lastPointer === 'touch' && active !== sp) { e.preventDefault(); on(sp); return; }
      e.preventDefault(); openQuick(s.id, el);
    });
  });

  // ── size: cover the stage; wider than the stage means it pans ──
  function size() {
    var sw = stage.clientWidth, sh = stage.clientHeight, ar = R.w / R.h;
    var w = Math.max(sw, sh * ar), h = w / ar;
    scene.style.width = w + 'px'; scene.style.height = h + 'px';
    scene.style.marginTop = Math.min(0, (sh - h) / 2) + 'px';
    planes.forEach(function (p) { p.style.transform = 'scale(' + (w / R.w) + ')'; });
    stage.scrollLeft = (w - sw) * (R.startX != null ? R.startX : .5);
    panTarget = panX = stage.scrollLeft;
  }

  // ── B: drift the view toward the cursor; wander when it rests (desktop) ──
  var panX = 0, panTarget = 0;
  if (R.pan === 'mouse' && !touch) {
    stage.style.overflowX = 'hidden';
    var lastMove = 0;
    window.addEventListener('mousemove', function (e) {
      var max = scene.offsetWidth - stage.clientWidth; if (max <= 0 || active) return;   // hold still while an item is lit
      var t = Math.min(1, Math.max(0, (e.clientX / window.innerWidth - .5) * 1.25 + .5));
      panTarget = t * max; lastMove = Date.now();
    });
    (function loop() {
      var max = scene.offsetWidth - stage.clientWidth;
      if (!still && !active && max > 0 && Date.now() - lastMove > 2500) {
        panTarget = (0.5 - 0.5 * Math.cos(Date.now() / 26000 * 2 * Math.PI + Math.PI / 2)) * max;
      }
      if (active) panTarget = panX;
      panX += (panTarget - panX) * (still ? 1 : (Date.now() - lastMove > 2500 ? .02 : .06));
      if (Math.abs(panTarget - panX) > .3) { stage.scrollLeft = panX; if (active) placeTag(active); }
      requestAnimationFrame(loop);
    })();
  }

  // ── hover / focus → dim the room, lift the object, show its tag ──
  var active = null, lastPointer = 'mouse';
  function bindHover(x, focusEl) {
    x.el.addEventListener('pointerdown', function (e) { lastPointer = e.pointerType; });
    x.el.addEventListener('mouseenter', function () { if (!touch) on(x); });
    x.el.addEventListener('mouseleave', function () { if (!touch) off(); });
    focusEl.addEventListener('focus', function () { if (focusEl.matches(':focus-visible')) on(x); });   // keyboard only; a tap also focuses
    focusEl.addEventListener('blur', function () { setTimeout(function () { if (active === x && !x.el.contains(document.activeElement)) off(); }, 0); });
  }
  function on(x) {
    if (active === x) return;
    off();
    active = x; x.el.classList.add('on'); if (x.plane) x.plane.classList.add('on'); body.classList.add('looking');
    fillTag(x); placeTag(x); tag.classList.add('show');
  }
  function off() {
    if (!active) return;
    active.el.classList.remove('on'); if (active.plane) active.plane.classList.remove('on');
    active = null; body.classList.remove('looking'); tag.classList.remove('show');
  }
  function fillTag(x) {
    var k, t, pr, hint;
    if (x.kind === 'product') { k = x.p.kicker; t = x.p.title; pr = x.p.price; hint = touch ? 'Tap again' : 'Quick view'; }
    else {
      var slug = x.set[x.i];
      k = (x.kind === 'rack' ? 'The print rack · ' : 'Print · ') + (x.i + 1) + ' / ' + x.set.length;
      t = PRINTS[slug][0]; pr = 'From £100';
      hint = touch ? 'Tap again' : (x.kind === 'rack' ? 'Browse the rack' : 'View prints');
      syncHref(x);
    }
    tag.innerHTML = '<p class="k">' + esc(k) + '</p><p class="t">' + esc(t) + '</p>' +
      '<p class="p"><b>' + esc(pr) + '</b><span>' + hint + ' &rarr;</span></p>' +
      (x.kind !== 'product' ? '<p class="s">&lsaquo; &rsaquo; to rehang this frame</p>' : '');
  }
  function placeTag(x) {
    var r = x.el.getBoundingClientRect(), navH = 56;
    var cx = Math.min(window.innerWidth - 140, Math.max(140, r.left + r.width / 2));
    var below = r.top - navH < 150;
    tag.classList.toggle('below', below);
    tag.style.left = cx + 'px'; tag.style.top = (below ? r.bottom : r.top) + 'px';
  }
  stage.addEventListener('click', function (e) { if (!e.target.closest('.spot')) off(); });
  stage.addEventListener('scroll', function () { if (active) placeTag(active); }, { passive: true });

  // ── quick view (products) ──
  var qv = document.getElementById('qv'), scrim = document.getElementById('qvScrim'), opener = null;

  // ── the room rehangs itself, one frame at a time, while nobody is touching it ──
  var turn = 0;
  if (!still) setInterval(function () {
    if (document.hidden || active || qv.classList.contains('open') || !groups.length) return;
    var g = groups[turn++ % groups.length];
    if (Date.now() - g.touched < 20000) return;      // leave a frame the visitor just chose alone
    show(g, g.i + 1);
  }, 5200);

  function track(name, params) { if (typeof window.gtag === 'function') window.gtag('event', name, params); }
  function openPanel(html, from) {
    opener = from || null; off(); closeList();
    document.documentElement.classList.add('fa-hold-popup');   // the newsletter card waits while a product is open
    qv.innerHTML = html;
    qv.querySelector('.qv-close').addEventListener('click', closeQuick);
    var back = qv.querySelector('.qv-room'); if (back) back.addEventListener('click', closeQuick);
    qv.setAttribute('aria-hidden', 'false'); scrim.classList.add('open');
    requestAnimationFrame(function () { qv.classList.add('open'); });
    setTimeout(function () { var f = qv.querySelector('.qv-close'); if (f) f.focus(); }, 50);
  }
  function openQuick(id, from) {
    var p = PRODUCTS[id]; if (!p) return;
    openPanel(
      '<button class="qv-close" type="button" aria-label="Close">✕</button>' +
      '<div class="qv-img"><div class="main"><img src="' + p.imgs[0] + '" alt="' + esc(p.title) + '"></div>' +
        '<div class="thumbs">' + p.imgs.map(function (src, i) {
          return '<button type="button" data-i="' + i + '" aria-current="' + (i === 0) + '" aria-label="Image ' + (i + 1) + '"><img src="' + src + '" alt=""></button>';
        }).join('') + '</div></div>' +
      '<div class="qv-info">' +
        '<p class="qv-kicker">' + (p.flag ? '<span class="flag">' + esc(p.flag) + '</span>' : '') + esc(p.kicker) + '</p>' +
        '<h2 id="qvTitle">' + esc(p.title) + '</h2>' +
        '<p class="qv-price">' + esc(p.price) + (p.priceNote ? '<small>' + esc(p.priceNote) + '</small>' : '') + '</p>' +
        '<p class="qv-desc">' + esc(p.desc) + '</p>' +
        '<a class="qv-buy" href="' + p.href + '">' + esc(p.cta) + ' &rarr;</a>' +
        '<button class="qv-room" type="button">Back to the room</button>' +
        '<p class="qv-note">Seen in the Living Room · Fola Adeleke® World</p>' +
      '</div>', from);
    track('view_item', { item_list_name: 'world_living_room', items: [{ item_id: id, item_name: p.title, currency: 'GBP' }] });
    var main = qv.querySelector('.main img');
    [].forEach.call(qv.querySelectorAll('.thumbs button'), function (b) {
      b.addEventListener('click', function () {
        main.src = p.imgs[+b.dataset.i];
        [].forEach.call(qv.querySelectorAll('.thumbs button'), function (x) { x.setAttribute('aria-current', x === b); });
      });
    });
  }

  // ── the rack: flip through the prints that aren't on the wall ──
  var rackIndex = 0;
  function openRack(i, from) {
    var set = R.rack.set;
    openPanel(
      '<button class="qv-close" type="button" aria-label="Close">✕</button>' +
      '<div class="qv-img rack-view"><div class="main"><img alt=""></div>' +
        '<div class="flip"><button type="button" data-d="-1" aria-label="Previous print">&larr;</button><span class="count"></span><button type="button" data-d="1" aria-label="Next print">&rarr;</button></div>' +
        '<div class="thumbs strip">' + set.map(function (slug, j) {
          return '<button type="button" data-j="' + j + '" aria-label="' + esc(PRINTS[slug][0]) + '"><img src="' + thumb(slug) + '" alt="" loading="lazy"></button>';
        }).join('') + '</div></div>' +
      '<div class="qv-info">' +
        '<p class="qv-kicker">The print rack · Edition of 15 · Limited</p>' +
        '<h2 id="qvTitle"></h2>' +
        '<p class="qv-spec">' + SPEC + '</p>' +
        '<div class="qv-sizes" role="radiogroup" aria-label="Size">' + SIZES.map(function (s) {
          return '<button type="button" role="radio" data-size="' + s.id + '" aria-checked="' + (s.id === 'A2') + '">' + s.id + '<small>£' + s.price + '</small></button>';
        }).join('') + '</div>' +
        '<a class="qv-buy" href="#"></a>' +
        '<a class="qv-wall" href="#">See it in prints &rarr;</a>' +
        '<button class="qv-room" type="button">Back to the room</button>' +
        '<p class="qv-note">Leaning against the credenza: the prints that aren’t on the wall today. Flip through, then buy or look closer.</p>' +
      '</div>', from);
    var pick = SIZES[1], buy = qv.querySelector('.qv-buy');
    function label() { buy.innerHTML = 'Buy ' + pick.id + ' — £' + pick.price + ' &rarr;'; }
    function go(j) {
      rackIndex = (j + set.length) % set.length;
      var slug = set[rackIndex], img = qv.querySelector('.main img');
      img.src = art(slug); img.alt = PRINTS[slug][0] + ' — fine art print by Fola Adeleke';
      qv.querySelector('#qvTitle').textContent = PRINTS[slug][0];
      qv.querySelector('.count').textContent = (rackIndex + 1) + ' / ' + set.length;
      buy.href = SHOP + PRINTS[slug][1]; qv.querySelector('.qv-wall').href = '/prints#' + slug;
      [].forEach.call(qv.querySelectorAll('.strip button'), function (b) { b.setAttribute('aria-current', +b.dataset.j === rackIndex); });
      var strip = qv.querySelector('.strip'), cur = strip.querySelector('[aria-current="true"]');
      if (cur) strip.scrollLeft = cur.offsetLeft - strip.clientWidth / 2 + cur.offsetWidth / 2;
      if (rack) { rack.touched = Date.now(); show(rack, rackIndex); }   // the frame in the room follows
      track('view_item', { item_list_name: 'world_print_rack', items: [{ item_id: slug, item_name: PRINTS[slug][0], currency: 'GBP' }] });
    }
    [].forEach.call(qv.querySelectorAll('.flip button'), function (b) { b.addEventListener('click', function () { go(rackIndex + +b.dataset.d); }); });
    [].forEach.call(qv.querySelectorAll('.strip button'), function (b) { b.addEventListener('click', function () { go(+b.dataset.j); }); });
    [].forEach.call(qv.querySelectorAll('[data-size]'), function (b) {
      b.addEventListener('click', function () {
        pick = SIZES.filter(function (s) { return s.id === b.dataset.size; })[0];
        [].forEach.call(qv.querySelectorAll('[data-size]'), function (x) { x.setAttribute('aria-checked', x === b); });
        label();
      });
    });
    qv.dataset.mode = 'rack'; label(); go(i);
  }
  function closeQuick() {
    if (!qv.classList.contains('open')) return;
    qv.classList.remove('open'); qv.setAttribute('aria-hidden', 'true'); scrim.classList.remove('open'); delete qv.dataset.mode;
    document.documentElement.classList.remove('fa-hold-popup');
    if (opener && opener.focus) opener.focus({ preventScroll: true });
  }
  scrim.addEventListener('click', closeQuick);

  // ── shop this room (built on open, so it lists what's hanging now) ──
  var list = document.getElementById('list'), listBtn = document.getElementById('listBtn');
  var total = groups.filter(function (g) { return g.kind === 'wall'; }).length + (rack ? R.rack.set.length : 0) + R.spots.length;
  listBtn.textContent = 'Shop this room (' + total + ')';
  function row(img, kicker, name, price) {
    return '<img src="' + img + '" alt=""><span class="n"><small>' + esc(kicker) + '</small>' + esc(name) + '</span><span class="pr">' + esc(price) + '</span>';
  }
  function buildList() {
    var html = '<h3>In this room</h3>';
    groups.forEach(function (g) {
      if (g.kind !== 'wall') return;
      var slug = g.set[g.i];
      html += '<a href="/prints#' + slug + '">' + row(thumb(slug), 'On the wall', PRINTS[slug][0], 'From £100') + '</a>';
    });
    if (rack) html += '<button type="button" data-rack>' + row(thumb(R.rack.set[rack.i]), 'Print rack', R.rack.set.length + ' more prints', 'Browse') + '</button>';
    R.spots.forEach(function (s) {
      var p = PRODUCTS[s.id];
      html += '<button type="button" data-id="' + s.id + '">' + row(p.thumb, p.kicker, p.title, p.price) + '</button>';
    });
    html += '<a class="all" href="/products">All products &rarr;</a>';
    list.innerHTML = html;
    [].forEach.call(list.querySelectorAll('button[data-id]'), function (b) { b.addEventListener('click', function () { openQuick(b.dataset.id, listBtn); }); });
    var rb = list.querySelector('[data-rack]'); if (rb) rb.addEventListener('click', function () { openRack(rack.i, listBtn); });
  }
  function closeList() { list.classList.remove('open'); listBtn.setAttribute('aria-expanded', 'false'); }
  listBtn.addEventListener('click', function () {
    var open = !list.classList.contains('open');
    if (open) buildList();
    list.classList.toggle('open', open); listBtn.setAttribute('aria-expanded', open);
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { closeQuick(); closeList(); off(); return; }
    if (qv.dataset.mode === 'rack' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      var b = qv.querySelector('.flip [data-d="' + (e.key === 'ArrowLeft' ? -1 : 1) + '"]'); if (b) b.click(); return;
    }
    if (e.key !== 'Tab' || !qv.classList.contains('open')) return;   // keep Tab inside the open panel
    var items = qv.querySelectorAll('button, a[href]'), first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  // ── go ──
  window.addEventListener('resize', size);
  size();
  if (!touch) { body.classList.add('hint'); setTimeout(function () { body.classList.remove('hint'); }, 3200); }
  var v = scene.querySelector('video');
  if (v && still) { v.removeAttribute('autoplay'); v.pause(); }
})();
