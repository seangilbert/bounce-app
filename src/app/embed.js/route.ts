// Served at /embed.js — the copy-paste loader an operator drops on their site.
// It reads its own <script data-key="pk_live_…">, injects an iframe of the
// storefront, auto-sizes it from postMessage, and sends Stripe checkout to the
// top-level page (Stripe's hosted page can't render inside an iframe).

export const dynamic = "force-static";

const SCRIPT = `(function () {
  var script = document.currentScript;
  if (!script) {
    var all = document.querySelectorAll('script[data-key]');
    script = all[all.length - 1];
  }
  if (!script) return;
  var key = script.getAttribute('data-key');
  if (!key) { console.error('[bounce] embed.js: missing data-key'); return; }
  var base = new URL(script.src, location.href).origin;

  var iframe = document.createElement('iframe');
  iframe.src = base + '/embed?key=' + encodeURIComponent(key);
  iframe.title = 'Rentals';
  iframe.loading = 'lazy';
  iframe.setAttribute('scrolling', 'no');
  iframe.setAttribute('allow', 'clipboard-write');
  iframe.style.width = '100%';
  iframe.style.border = '0';
  iframe.style.display = 'block';
  iframe.style.minHeight = (script.getAttribute('data-min-height') || '640') + 'px';

  var targetId = script.getAttribute('data-target');
  var target = targetId ? document.getElementById(targetId) : null;
  if (target) target.appendChild(iframe);
  else script.parentNode.insertBefore(iframe, script.nextSibling);

  window.addEventListener('message', function (e) {
    if (e.origin !== base || !e.data || typeof e.data !== 'object') return;
    if (e.data.type === 'bounce:resize' && e.data.height) {
      iframe.style.height = e.data.height + 'px';
    } else if (e.data.type === 'bounce:checkout' && e.data.url) {
      // Stripe's hosted checkout can't load in an iframe — take the top page there.
      window.location.href = e.data.url;
    }
  });
})();`;

export function GET() {
  return new Response(SCRIPT, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
