const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");

admin.initializeApp();
const db = admin.firestore();

// YAHAN APNA UOMOX API TOKEN DALEIN
const UOMOX_API_TOKEN = "266af627-77df-4966-84de-10470faa01f6";
const UOMOX_TEMPLATE_NAME = "dryfu_authentication"; // Aapka template name

// 1️⃣ OTP BHEJNE KA FUNCTION
exports.sendOtp = functions.https.onCall(async (reqData, context) => {
    // 🔥 Firebase Update Fix: Data chahe kisi bhi format me aaye, yeh number nikal lega
    const mobile = reqData.mobile || (reqData.data && reqData.data.mobile) || (reqData.body && reqData.body.mobile);

    if (!mobile) {
        throw new functions.https.HttpsError('invalid-argument', 'Mobile number is required');
    }

    // 6-digit ka random OTP banayein
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // OTP ko Firebase me save karein
    await db.collection("otp_codes").doc(mobile).set({
        otp: otp,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // UOMOX API ke through WhatsApp par OTP bhejein
    try {
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

        return { success: true, message: "OTP Sent via WhatsApp" };
    } catch (error) {
        console.error("WhatsApp API Error:", error.response ? error.response.data : error.message);
        throw new functions.https.HttpsError('internal', 'Failed to send WhatsApp OTP');
    }
});

// 2️⃣ OTP VERIFY KARNE KA FUNCTION
exports.verifyOtp = functions.https.onCall(async (reqData, context) => {
    // 🔥 Bulletproof Check for Verify
    const mobile = reqData.mobile || (reqData.data && reqData.data.mobile) || (reqData.body && reqData.body.mobile);
    const userOtp = reqData.otp || (reqData.data && reqData.data.otp) || (reqData.body && reqData.body.otp);

    if (!mobile || !userOtp) {
        throw new functions.https.HttpsError('invalid-argument', 'Mobile and OTP are required');
    }

    const docRef = db.collection("otp_codes").doc(mobile);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'OTP expired or not requested');
    }

    const savedOtp = docSnap.data().otp;

    if (savedOtp === userOtp) {
        const uid = "+" + mobile;
        const customToken = await admin.auth().createCustomToken(uid);

        await docRef.delete();
        return { success: true, token: customToken };
    } else {
        throw new functions.https.HttpsError('invalid-argument', 'Incorrect OTP');
    }
});