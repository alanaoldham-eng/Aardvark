// Aardvark service worker: keeps the app shell available offline.
// Bump VERSION whenever app files change so phones pick up the new build.
var VERSION = "aardvark-v6";
var SHELL = [
  "./", "./index.html", "./app.css", "./book.css", "./app.js", "./api.js", "./geo.js", "./book.js", "./data.js", "./manifest.webmanifest",
  "../config.js", "../vendor/supabase/supabase.js",
  "../vendor/leaflet/leaflet.js", "../vendor/leaflet/leaflet.css",
  "../assets/mark.png", "../assets/icon-192.png", "../assets/icon-512.png", "../assets/favicon.png"
];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  // Same-origin files: network first so updates show up, cache as fallback for offline.
  if (url.origin === location.origin) {
    // Settings and the page itself always skip the browser's short-term cache
    var fresh = /\/config\.js$|\/$|\.html$/.test(url.pathname) ? { cache: "no-cache" } : undefined;
    e.respondWith(fetch(req, fresh).then(function (res) {
      var copy = res.clone();
      caches.open(VERSION).then(function (c) { c.put(req, copy); });
      return res;
    }).catch(function () {
      return caches.match(req, { ignoreSearch: true }).then(function (r) { return r || caches.match("./index.html"); });
    }));
  }
  // Map tiles and fonts go straight to the network.
});
