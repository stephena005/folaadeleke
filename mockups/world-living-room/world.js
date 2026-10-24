/* World — The Living Room. Shared by mockups A and B; each page sets
   window.ROOM (plate, size, hotspot boxes in plate pixels) before this
   script runs. Product copy and prices mirror /products and /prints. */
(function () {
  var R = window.ROOM;
  var SPEC = 'Archival pigment print · Signed &amp; numbered · Certificate of authenticity';

  var PRODUCTS = {
    'mummys-boy':         { kind: 'print', kicker: 'Print · Edition of 15', title: 'Mummy’s Boy',        price: 'From £100', href: '/prints#mummys-boy',         thumb: '/images/prints/thumbs/mummys-boy.jpg' },
    'loud-cloth':         { kind: 'print', kicker: 'Print · Edition of 15', title: 'Loud Cloth',         price: 'From £100', href: '/prints#loud-cloth',         thumb: '/images/prints/thumbs/loud-cloth.jpg' },
    'mother-of-a-nation': { kind: 'print', kicker: 'Print · Edition of 15', title: 'Mother of a Nation', price: 'From £100', href: '/prints#mother-of-a-nation', thumb: '/images/prints/thumbs/mother-of-a-nation.jpg' },
    'mama-comfort': {
      kind: 'product', kicker: 'Collectible Figure', flag: 'Pre-order', title: 'Mama Comfort', price: '£150',
      priceNote: 'Paid in full at checkout · Est. dispatch January 2027',
      desc: 'A 280 mm soft vinyl figure in matte black with gold jewellery. Numbered edition of 20.',
      href: '/products/mama-comfort', cta: 'View full product',
      imgs: ['/images/mama-comfort/front-c04.jpg', '/images/mama-comfort/side-c04.jpg', '/images/mama-comfort/back-c04.jpg', '/images/mama-comfort/detail-c04.jpg'],
      thumb: '/images/mama-comfort/card-black-gold.jpg'
    },
    'cards': {
      kind: 'product', kicker: 'Playing Cards', flag: 'Coming soon', title: 'Fola Adeleke Playing Cards', price: 'Price TBC',
      priceNote: 'Not yet on sale — join the list to hear first',
      desc: 'A full 52-card deck dressed in zebra. Kings, queens and jacks are photographic portraits in zebra-print agbada and gowns with gold jewellery; every card shares one back. Tuck-end box, 64 × 102 × 23 mm.',
      href: '/newsletter.html', cta: 'Join the list',
      imgs: ['/images/world/cards/box-front.jpg', '/images/world/cards/kh.jpg', '/images/world/cards/qs.jpg', '/images/world/cards/card-back.jpg'],
      thumb: '/images/world/cards/box-front.jpg'
    },
    'phone': {
      kind: 'product', kicker: 'Digital Product', title: 'Propeller Wallpaper Collection', price: '£9.99',
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

  // ── build the room ──
  (R.fixed || []).forEach(function (f) {          // real prints over the video, always on
    var i = new Image(); i.className = 'fixed-print'; i.src = f.src; i.alt = ''; place(i, f.box); scene.appendChild(i);
  });
  var spots = R.spots.map(function (s) {
    var p = PRODUCTS[s.id];
    var el = document.createElement(p.kind === 'print' ? 'a' : 'button');
    el.className = 'spot'; el.dataset.id = s.id;
    if (p.kind === 'print') el.href = p.href; else el.type = 'button';
    el.setAttribute('aria-label', p.title + ', ' + p.price + (p.kind === 'print' ? ' — view in prints' : ' — quick view'));
    var img = new Image(); img.src = s.lift; img.alt = ''; el.appendChild(img);
    place(el, s.box); scene.appendChild(el);
    var dot = document.createElement('span'); dot.className = 'dot';
    dot.style.left = pct((s.box[0] + s.box[2]) / 2, R.w); dot.style.top = pct(s.dotY != null ? s.dotY : (s.box[1] + s.box[3]) / 2, R.h);
    scene.appendChild(dot);
    return { el: el, p: p, s: s };
  });

  // ── size: cover the stage; wider than the stage means it pans ──
  function size() {
    var sw = stage.clientWidth, sh = stage.clientHeight, ar = R.w / R.h;
    var w = Math.max(sw, sh * ar), h = w / ar;
    scene.style.width = w + 'px'; scene.style.height = h + 'px';
    scene.style.marginTop = Math.min(0, (sh - h) / 2) + 'px';   // crop top/bottom evenly when taller
    stage.scrollLeft = (w - sw) * (R.startX != null ? R.startX : .5);
    panTarget = panX = stage.scrollLeft;
  }

  // ── B: drift the view toward the cursor (desktop only) ──
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
      // cursor resting (or never moved): wander slowly end to end so nothing at the edges stays hidden
      var max = scene.offsetWidth - stage.clientWidth;
      if (!still && !active && max > 0 && Date.now() - lastMove > 2500) {
        panTarget = (0.5 - 0.5 * Math.cos(Date.now() / 26000 * 2 * Math.PI - Math.PI / 2 + Math.PI)) * max;
      }
      if (active) panTarget = panX;
      panX += (panTarget - panX) * (still ? 1 : (Date.now() - lastMove > 2500 ? .02 : .06));
      if (Math.abs(panTarget - panX) > .3) { stage.scrollLeft = panX; if (active) placeTag(active); }
      requestAnimationFrame(loop);
    })();
  }

  // ── hover / focus → dim the room, lift the object, show its tag ──
  var active = null;
  function on(sp) {
    if (active === sp) return;
    off();
    active = sp; sp.el.classList.add('on'); body.classList.add('looking');
    var p = sp.p;
    tag.innerHTML = '<p class="k">' + esc(p.kicker) + '</p><p class="t">' + esc(p.title) + '</p>' +
      '<p class="p"><b>' + esc(p.price) + '</b><span>' + (touch ? 'Tap again' : (p.kind === 'print' ? 'View prints' : 'Quick view')) + ' &rarr;</span></p>';
    placeTag(sp); tag.classList.add('show');
  }
  function off() {
    if (!active) return;
    active.el.classList.remove('on'); active = null; body.classList.remove('looking'); tag.classList.remove('show');
  }
  function placeTag(sp) {
    var r = sp.el.getBoundingClientRect(), navH = 56;
    var x = Math.min(window.innerWidth - 140, Math.max(140, r.left + r.width / 2));
    var below = r.top - navH < 120;
    tag.classList.toggle('below', below);
    tag.style.left = x + 'px'; tag.style.top = (below ? r.bottom : r.top) + 'px';
  }
  var lastPointer = 'mouse';
  spots.forEach(function (sp) {
    sp.el.addEventListener('pointerdown', function (e) { lastPointer = e.pointerType; });
    sp.el.addEventListener('mouseenter', function () { if (!touch) on(sp); });
    sp.el.addEventListener('mouseleave', function () { if (!touch) off(); });
    sp.el.addEventListener('focus', function () { if (sp.el.matches(':focus-visible')) on(sp); });   // keyboard only; a tap also focuses
    sp.el.addEventListener('blur', function () { if (active === sp) off(); });
    sp.el.addEventListener('click', function (e) {
      if (lastPointer === 'touch' && active !== sp) { e.preventDefault(); on(sp); return; }   // first tap: tag only
      if (sp.p.kind === 'print') return;                                                         // prints: follow the link
      e.preventDefault(); openQuick(sp.s.id, sp.el);
    });
  });
  stage.addEventListener('click', function (e) { if (!e.target.closest('.spot')) off(); });
  stage.addEventListener('scroll', function () { if (active) placeTag(active); }, { passive: true });

  // ── quick view ──
  var qv = document.getElementById('qv'), scrim = document.getElementById('qvScrim'), opener = null;
  function openQuick(id, from) {
    var p = PRODUCTS[id]; if (!p || p.kind === 'print') return;
    opener = from || null; off(); closeList();
    qv.innerHTML =
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
      '</div>';
    var main = qv.querySelector('.main img');
    [].forEach.call(qv.querySelectorAll('.thumbs button'), function (b) {
      b.addEventListener('click', function () {
        main.src = p.imgs[+b.dataset.i];
        [].forEach.call(qv.querySelectorAll('.thumbs button'), function (x) { x.setAttribute('aria-current', x === b); });
      });
    });
    qv.querySelector('.qv-close').addEventListener('click', closeQuick);
    qv.querySelector('.qv-room').addEventListener('click', closeQuick);
    qv.setAttribute('aria-hidden', 'false'); scrim.classList.add('open');
    requestAnimationFrame(function () { qv.classList.add('open'); });
    setTimeout(function () { var f = qv.querySelector('.qv-close'); if (f) f.focus(); }, 50);
  }
  function closeQuick() {
    if (!qv.classList.contains('open')) return;
    qv.classList.remove('open'); qv.setAttribute('aria-hidden', 'true'); scrim.classList.remove('open');
    if (opener && opener.focus) opener.focus({ preventScroll: true });
  }
  scrim.addEventListener('click', closeQuick);

  // ── shop this room ──
  var list = document.getElementById('list'), listBtn = document.getElementById('listBtn');
  list.innerHTML = '<h3>In this room</h3>' + R.spots.map(function (s) {
    var p = PRODUCTS[s.id];
    var inner = '<img src="' + p.thumb + '" alt=""><span class="n"><small>' + esc(p.kicker.split(' · ')[0]) + '</small>' + esc(p.title) + '</span><span class="pr">' + esc(p.price) + '</span>';
    return p.kind === 'print' ? '<a href="' + p.href + '">' + inner + '</a>' : '<button type="button" data-id="' + s.id + '">' + inner + '</button>';
  }).join('');
  listBtn.textContent = 'Shop this room (' + R.spots.length + ')';
  function closeList() { list.classList.remove('open'); listBtn.setAttribute('aria-expanded', 'false'); }
  listBtn.addEventListener('click', function () {
    var open = !list.classList.contains('open');
    list.classList.toggle('open', open); listBtn.setAttribute('aria-expanded', open);
  });
  [].forEach.call(list.querySelectorAll('button[data-id]'), function (b) {
    b.addEventListener('click', function () { openQuick(b.dataset.id, listBtn); });
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { closeQuick(); closeList(); off(); return; }
    if (e.key !== 'Tab' || !qv.classList.contains('open')) return;   // keep Tab inside the open product
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
