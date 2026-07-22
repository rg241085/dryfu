// 🌟 Firebase सर्विस वर्कर स्क्रिप्ट्स (Background Notifications के लिए)
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

// 1. Background Notification Receiver
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

// 🌟 NAYA: Notification par click karne se App open hogi
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(
    clients.openWindow('/') // Customer ko home page par le jayega
  );
});


// ----------------------------------------------------
// 🌟 CACHING STRATEGY (Network First with Firebase Bypass)
// ----------------------------------------------------

// Version update karte rahein (eg: v13, v14...)
const CACHE_NAME = 'dryfu-cache-v14'; 

const urlsToCache = [
  'index.html',
  'style.css',
  'script.js'
];

// 2. Install naya update
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(urlsToCache);
    })
  );
});

// 3. Activate aur Purana Kachra Saaf
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) {
            console.log('Old cache cleared:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 4. NETWORK-FIRST LOGIC
self.addEventListener('fetch', event => {
  // 🚨 BOHOT ZAROORI: Firebase Database aur Auth ko cache hone se rokein
  // Taki customer ko hamesha live products aur orders dikhein
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