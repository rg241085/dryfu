const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
admin.initializeApp();

exports.sendLiveNotification = functions.firestore
    .document('notifications/{docId}')
    .onCreate(async (snap, context) => {
        const notifData = snap.data();

        if (!notifData) {
            console.log("No data found");
            return null;
        }

        const title = notifData.title;
        const body = notifData.body;

        // 🌟 Agar admin ne link nahi dala, toh aapka home page khulega
        const clickLink = notifData.link || "https://rg241085.github.io/dryfu";
        const imageUrl = notifData.image;

        try {
            const customersSnap = await admin.firestore().collection('customers').get();
            const tokens = [];

            customersSnap.forEach(doc => {
                const data = doc.data();
                if (data.fcmToken) {
                    tokens.push(data.fcmToken);
                }
            });

            if (tokens.length === 0) {
                console.log("Koi FCM token nahi mila.");
                return snap.ref.update({ status: 'failed', reason: 'No tokens found' });
            }

            const message = {
                notification: {
                    title: title,
                    body: body,
                    ...(imageUrl && { image: imageUrl })
                },
                webpush: {
                    fcmOptions: {
                        link: clickLink
                    }
                },
                tokens: tokens
            };

            const response = await admin.messaging().sendEachForMulticast(message);
            console.log(response.successCount + ' messages successfully send ho gaye');

            return snap.ref.update({
                status: 'sent',
                successCount: response.successCount,
                failureCount: response.failureCount
            });

        } catch (error) {
            console.error('Notification error:', error);
            return snap.ref.update({ status: 'failed', error: error.message });
        }
    });