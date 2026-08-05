const CACHE = "crypto-focus-v4";
const ASSETS = ["./", "./index.html", "./styles.css", "./theme-gold.css", "./realtime.css", "./app.js", "./manifest.webmanifest", "./icon.svg"];
self.addEventListener("install", event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS))));
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", event => {
  if (event.request.url.includes("api.binance.com")) return;
  event.respondWith(caches.match(event.request).then(hit => hit || fetch(event.request)));
});
