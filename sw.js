// 🌟 नया: Firebase सर्विस वर्कर स्क्रिप्ट्स (Background Notifications के लिए)
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyDkW8QBHruMzQztReP3XmGU5sz8MwSlYEU",
  authDomain: "rd-catalog.firebaseapp.com",
  projectId: "rd-catalog",
  storageBucket: "rd-catalog.firebasestorage.app",
  messagingSenderId: "194426515298",
  appId: "1:194426515298:web:9d572c86a9c80b9fcc463b",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(function (payload) {
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/logo-192.png',
    badge: '/logo-192.png',
    data: payload.data
  };
  self.registration.showNotification(notificationTitle, notificationOptions);
});




// Version v10 - Network First Strategy
const CACHE_NAME = 'dryfu-cache-v12';

const urlsToCache = [
  'index.html',
  'delivery.html',
  'style.css',
  'script.js'
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
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 🌟 3. NAYA: NETWORK-FIRST LOGIC (Hamesha fresh code layega)
self.addEventListener('fetch', event => {
  event.respondWith(
    fetch(event.request)
      .then(networkResponse => {
        // Agar internet chal raha hai aur fresh data mil gaya, toh usko memory me save kar lo
        return caches.open(CACHE_NAME).then(cache => {
          // POST requests ko cache nahi karte
          if (event.request.method === 'GET') {
            cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        });
      })
      .catch(() => {
        // Agar internet band hai (Offline), tabhi memory (cache) se purana code dikhao
        return caches.match(event.request);
      })
  );
});
