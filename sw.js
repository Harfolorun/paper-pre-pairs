// Paper Pre-Pairs offline helper (service worker).
// The game opens instantly from the copy saved on the phone; when online, it quietly fetches the latest version
// in the background, so a newly uploaded version shows up the next time the app is opened.
const CACHE = "pre-pairs-v1";
const APP = ["./", "index.html", "manifest.webmanifest", "icon-192.png", "icon-512.png", "icon-maskable-512.png", "apple-touch-icon.png"];
const FONT_CSS = [
  "https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800&family=Noto+Serif:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400;1,500;1,700;1,800&display=swap",
  "https://fonts.googleapis.com/css2?family=Saira+Stencil+One&text=INSTRUCTIONS%3A&display=swap",
  "https://fonts.googleapis.com/css2?family=Noto+Sans:wght@700&text=ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789%3A%7C.%20%E2%80%94&display=swap"
];

// Save the fonts too (every file the font lists point to), so text looks right offline. Best effort: if it fails, the game still installs.
async function saveFonts(cache){
  for(const url of FONT_CSS){
    try{
      const res = await fetch(url, {mode:"cors", cache:"reload"});
      if(!res.ok) continue;
      const css = await res.clone().text();
      await cache.put(url, res);
      const files = [...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)].map(m=>m[1]);
      await Promise.all(files.map(f=>fetch(f, {mode:"cors"}).then(r=>r.ok && cache.put(f, r)).catch(()=>{})));
    }catch(e){}
  }
}

self.addEventListener("install", e=>{
  e.waitUntil((async()=>{
    const cache = await caches.open(CACHE);
    await cache.addAll(APP.map(u=>new Request(u, {cache:"reload"})));
    await saveFonts(cache);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", e=>{
  e.waitUntil((async()=>{
    for(const k of await caches.keys()) if(k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", e=>{
  const req = e.request;
  if(req.method !== "GET") return;
  const url = new URL(req.url);
  const isFont = url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";
  const isApp = url.origin === location.origin;
  if(!isFont && !isApp) return;   // blob: picture/sound files and anything else go straight through
  e.respondWith((async()=>{
    const cache = await caches.open(CACHE);
    // the game page itself: always answer from the saved copy of index.html
    const key = req.mode === "navigate" ? "index.html" : req;
    const saved = await cache.match(key, {ignoreSearch: req.mode === "navigate"});
    const getFresh = ()=>fetch(req.mode === "navigate" ? new Request("index.html", {cache:"no-cache"}) : req)
      .then(res=>{ if(res && (res.ok || res.type === "opaque")) cache.put(key, res.clone()); return res; })
      .catch(()=>null);
    if(saved){
      if(isApp) e.waitUntil(getFresh());   // refresh the app's own files in the background; fonts never change
      return saved;
    }
    return (await getFresh()) || new Response("Offline", {status:503, statusText:"Offline"});
  })());
});
