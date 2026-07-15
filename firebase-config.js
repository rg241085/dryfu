import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
// 🌟 नया: Messaging इंपोर्ट करें
import { getMessaging } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging.js";

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
// 🌟 नया: Messaging शुरू करें
const messaging = getMessaging(app);

// 🌟 नया: messaging को भी एक्सपोर्ट करें
export { app, db, auth, messaging };