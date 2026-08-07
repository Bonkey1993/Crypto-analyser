const CACHE = "crypto-focus-v12";
const ASSETS = ["./", "./index.html", "./reset.html", "./styles.css", "./theme-gold.css", "./realtime.css", "./reset.css", "./supabase-config.js", "./app.js", "./reset.js", "./manifest.webmanifest", "./icon.svg"];
self.addEventListener("install", event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())));
self.addEventListener("activate", event => event.waitUntil(caches.keys().then(names => Promise.all(names.filter(name => name !== CACHE).map(name => caches.delete(name)))).then(() => self.clients.claim())));
self.addEventListener("fetch", event => {
  if (event.request.url.includes("api.binance.com")) return;
  if (event.request.method !== "GET") return;
  event.respondWith(caches.open(CACHE).then(cache => cache.match(event.request).then(hit => hit || fetch(event.request))));
});
