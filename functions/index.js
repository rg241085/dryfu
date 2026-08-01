const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");

admin.initializeApp();
const db = admin.firestore();

// YAHAN APNA UOMOX API TOKEN DALEIN
const UOMOX_API_TOKEN = "266af627-77df-4966-84de-10470faa01f6";
const UOMOX_TEMPLATE_NAME = "dryfu_authentication"; 

// 1️⃣ OTP BHEJNE KA FUNCTION (Simple REST API)
exports.sendOtp = functions.https.onRequest(async (req, res) => {
    // Cross-Origin (CORS) Bypass - Browser ko block karne se rokega
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
    }

    try {
        // Data seedha bina kisi Firebase Magic ke nikalega
        const body = req.body.data || req.body;
        const mobile = body.mobile;

        if (!mobile) {
            return res.status(400).json({ error: { message: 'Mobile number is required' } });
        }

        // 6-digit ka random OTP banayein
        const otp = Math.floor(100000 + Math.random() * 900000).toString();

        await db.collection("otp_codes").doc(mobile).set({
            otp: otp,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // WhatsApp par message bhejein
        await axios.post('https://api.uomox.com/services/V1/whatsapp/template', {
            "messaging_product": "whatsapp",
            "to": mobile,
            "type": "template",
            "template": {
                "name": UOMOX_TEMPLATE_NAME,
                "language": { "code": "en_US" },
                "components": [
                    {
                        "type": "body",
                        "parameters": [{ "type": "text", "text": otp }]
                    }
                ]
            }
        }, {
            headers: {
                'Authorization': `Bearer ${UOMOX_API_TOKEN}`,
                'Content-Type': 'application/json'
            }
        });

        return res.status(200).json({ success: true, message: "OTP Sent via WhatsApp" });
    } catch (error) {
        console.error("WhatsApp Error:", error);
        return res.status(500).json({ error: { message: 'Failed to send WhatsApp OTP' } });
    }
});

// 2️⃣ OTP VERIFY KARNE KA FUNCTION (Simple REST API)
exports.verifyOtp = functions.https.onRequest(async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
    }

    try {
        const body = req.body.data || req.body;
        const mobile = body.mobile;
        const userOtp = body.otp;

        if (!mobile || !userOtp) {
            return res.status(400).json({ error: { message: 'Mobile and OTP are required' } });
        }

        const docRef = db.collection("otp_codes").doc(mobile);
        const docSnap = await docRef.get();

        if (!docSnap.exists) {
            return res.status(404).json({ error: { message: 'OTP expired or not requested' } });
        }

        const savedOtp = docSnap.data().otp;

        if (savedOtp === userOtp) {
            const uid = "+" + mobile;
            const customToken = await admin.auth().createCustomToken(uid);
            
            await docRef.delete();
            return res.status(200).json({ result: { token: customToken } });
        } else {
            return res.status(400).json({ error: { message: 'Incorrect OTP' } });
        }
    } catch (error) {
        console.error("Verify Error:", error);
        return res.status(500).json({ error: { message: 'Internal Server Error' } });
    }
});