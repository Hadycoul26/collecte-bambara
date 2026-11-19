// Toto installable : garde les fichiers du jeu sur le téléphone (il s'ouvre même avec un réseau faible).
// ⚠ Le RÉSEAU D'ABORD pour nos fichiers : une mise à jour publiée sur le site arrive tout de suite ; la copie
//   gardée ne sert que si le réseau manque. Les fichiers de three.js (version figée sur le CDN) : la copie d'abord.
// ⛔ Rien de Supabase (autre domaine : connexion, phrases, envoi des lectures) ne passe par ici.
const CACHE = "toto-v1";
const DEPART = ["./", "./index.html", "./manifest.webmanifest", "./bulbo/toto3d.js", "./bulbo/bulbo.glb",
  "./bulbo/visage.webp", "./bulbo/visage.json", "./icones/icone-192.png",
  "../config.js", "../phonetique.js", "../phrases.json", "../toto.json"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(DEPART)).catch(() => {}).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const r = e.request;
  if (r.method !== "GET") return;
  const u = new URL(r.url);
  const cdn = u.hostname === "cdn.jsdelivr.net" && u.pathname.startsWith("/npm/three@");
  if (!cdn && u.origin !== self.location.origin) return;
  if (r.headers.has("range")) return;                       // lecture audio en morceaux : laissée au navigateur
  if (cdn) {
    e.respondWith(caches.match(r).then(m => m || fetch(r).then(rep => {
      if (rep.ok) { const copie = rep.clone(); caches.open(CACHE).then(c => c.put(r, copie)); }
      return rep;
    })));
    return;
  }
  e.respondWith(fetch(r).then(rep => {
    if (rep.ok && rep.type === "basic") { const copie = rep.clone(); caches.open(CACHE).then(c => c.put(r, copie)); }
    return rep;
  }).catch(() => caches.match(r, { ignoreSearch: true }).then(m => m || Response.error())));
});
