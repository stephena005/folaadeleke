/* ──────────────────────────────────────────────────────────────
   Analytics events — GA4 (G-K7ZCQ4YEN6)

   Loaded on every page beside js/consent.js. Every event goes
   through gtag, so consent mode still applies: until the visitor
   accepts, GA receives a cookieless ping and stores nothing.

   Events sent from here:
     shop_click     a link to shop.folaadeleke.com — the only way to
                    see the site → shop hand-off, since checkout is
                    on Shopify. `product` is the handle, or '' for
                    the shop front / a collection.
     email_click    a mailto: link (hello@, trade, press).

   Sent from the page that owns the moment:
     generate_lead           contact/index.html, on a successful send
     sign_up                 js/newsletter-popup.js, when the email is
                             handed to Beehiiv (before they confirm)
     newsletter_prompt_view  js/newsletter-popup.js, card or strip shown
     subscriber_code_claimed claim/index.html

   Mark shop_click, generate_lead and sign_up as key events in
   GA4 → Admin → Events for them to count as conversions.
   ────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  var SHOP_HOST = 'shop.folaadeleke.com';

  function send(name, params) {
    if (typeof window.gtag === 'function') window.gtag('event', name, params);
  }

  function label(a) {
    return (a.getAttribute('aria-label') || a.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 100);
  }

  // One delegated listener: the home wall and print cards are built at
  // runtime, so per-link listeners would miss them. Capture phase, so a
  // handler that stops propagation on the card cannot swallow the event.
  function onClick(e) {
    var a = e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    var href = a.getAttribute('href');

    if (/^mailto:/i.test(href)) {
      send('email_click', {
        email_to: href.replace(/^mailto:/i, '').split('?')[0],
        link_text: label(a)
      });
      return;
    }

    if (a.hostname !== SHOP_HOST) return;
    var product = a.pathname.match(/^\/products\/([^/?#]+)/);
    send('shop_click', {
      link_url: a.href,
      product: product ? product[1] : '',
      link_text: label(a)
    });
  }

  document.addEventListener('click', onClick, true);
  // Middle-click opens in a new tab without firing 'click'.
  document.addEventListener('auxclick', function (e) { if (e.button === 1) onClick(e); }, true);
})();
