const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

// 🌟 SECURE BACKEND CHECK: Bina login kiye securely database check karega
exports.checkUserPin = functions.https.onRequest(async (req, res) => {
    // Cross-Origin Bypass (Browser ko rokne se bachane ke liye)
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
    }

    try {
        const body = req.body.data || req.body;
        const mobile = body.mobile;

        if (!mobile) {
            return res.status(400).json({ error: 'Mobile number required' });
        }

        // Firebase Admin hamesha sach batata hai (Bina kisi permission block ke)
        const docSnap = await db.collection("customers").doc(mobile).get();

        if (docSnap.exists && docSnap.data().loginPin) {
            return res.status(200).json({ hasPin: true });
        } else {
            return res.status(200).json({ hasPin: false });
        }
    } catch (error) {
        console.error("Check Error:", error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
});