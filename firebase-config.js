// firebase-config.js - SECURE VERSION
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, enableIndexedDbPersistence } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getMessaging } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging.js";

// ⚠️ IMPORTANT: Restrict this API key in Firebase Console
// Go to: Google Cloud Console → APIs & Services → Credentials → HTTP referrers
const firebaseConfig = {
    apiKey: "AIzaSyDkW8QBHruMzQztReP3XmGU5sz8MwSlYEU",
    authDomain: "rd-catalog.firebaseapp.com",
    databaseURL: "https://rd-catalog-default-rtdb.firebaseio.com",
    projectId: "rd-catalog",
    storageBucket: "rd-catalog.firebasestorage.app",
    messagingSenderId: "194426515298",
    appId: "1:194426515298:web:9d572c86a9c80b9fcc463b",
    measurementId: "G-DXJ5KQ0RZS"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const messaging = getMessaging(app);

// 🌟 NAYA: Offline persistence enable karo
enableIndexedDbPersistence(db).catch((err) => {
    if (err.code == 'failed-precondition') {
        console.log("Multiple tabs open, persistence enabled in first tab only");
    } else if (err.code == 'unimplemented') {
        console.log("Browser doesn't support offline persistence");
    }
});

export { app, db, auth, messaging };