// Version update karte rahein (eg: v2, v3...)
const CACHE_NAME = 'dryfu-delivery-cache-v2';

const urlsToCache = [
  'delivery.html',
  'delivery-style.css',
  'manifest-delivery.json',
  'logo-192.png',
  'logo-512.png'
];

// 1. Install naya update
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(urlsToCache);
    })
  );
});

// 2. Activate aur Purana Kachra Saaf
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) {
            console.log('Old delivery cache cleared:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 3. NETWORK-FIRST LOGIC
self.addEventListener('fetch', event => {
  // 🚨 Firebase Database aur Auth ko cache hone se rokein (Taaki live orders delay na hon)
  if (event.request.url.includes('firestore.googleapis.com') ||
    event.request.url.includes('identitytoolkit.googleapis.com')) {
    return;
  }

  // Sirf GET requests ko cache karenge
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then(networkResponse => {
        // Internet chal raha hai: Naya data memory me save karo
        return caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, networkResponse.clone());
          return networkResponse;
        });
      })
      .catch(() => {
        // Internet band hai: Memory (cache) se app chalao
        return caches.match(event.request);
      })
  );
});