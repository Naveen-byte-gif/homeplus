const admin = require("firebase-admin");

// Initialize Firebase Admin SDK
let firebaseApp;

const initializeFirebase = () => {
  try {
    // Check if Firebase is already initialized
    if (admin.apps.length > 0) {
      firebaseApp = admin.apps[0];
      console.log("✅ Firebase Admin already initialized");
      return firebaseApp;
    }

    let serviceAccount = null;

    // Try to load from environment variable (JSON string)
    if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
      try {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
        console.log("📝 Loading Firebase credentials from environment variable");
      } catch (e) {
        console.error("❌ Error parsing FIREBASE_SERVICE_ACCOUNT_KEY:", e.message);
      }
    }
    
    // Try to load from file (if env var not set)
    if (!serviceAccount) {
      try {
        const fs = require('fs');
        const path = require('path');
        
        // Look for service account JSON file in root directory
        const possibleFiles = [
          path.join(__dirname, '../apartmentsync-c3174-firebase-adminsdk-fbsvc-dac1bf241a.json'),
          path.join(__dirname, '../firebase-service-account.json'),
          path.join(__dirname, '../serviceAccountKey.json'),
        ];

        for (const filePath of possibleFiles) {
          if (fs.existsSync(filePath)) {
            const fileContent = fs.readFileSync(filePath, 'utf8');
            serviceAccount = JSON.parse(fileContent);
            console.log(`📝 Loading Firebase credentials from file: ${path.basename(filePath)}`);
            break;
          }
        }
      } catch (e) {
        // File not found or error reading - continue to next method
        console.log("ℹ️ No Firebase service account file found, trying other methods...");
      }
    }

    // Try individual environment variables
    if (!serviceAccount && process.env.FIREBASE_PROJECT_ID) {
      serviceAccount = {
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      };
      console.log("📝 Loading Firebase credentials from individual environment variables");
    }

    // Initialize Firebase if we have credentials
    if (serviceAccount) {
      firebaseApp = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      console.log("✅ Firebase Admin initialized successfully");
      return firebaseApp;
    } else {
      console.warn(
        "⚠️ Firebase credentials not found. Push notifications will be disabled."
      );
      console.warn(
        "ℹ️ To enable push notifications, add Firebase credentials to .env or place serviceAccountKey.json in the root directory."
      );
      return null;
    }

    console.log("✅ Firebase Admin initialized successfully");
    return firebaseApp;
  } catch (error) {
    console.error("❌ Firebase initialization error:", error);
    return null;
  }
};

// Send push notification to a device
const sendPushNotification = async (fcmToken, notification, data = {}) => {
  try {
    if (!firebaseApp) {
      console.warn(
        "⚠️ Firebase not initialized. Cannot send push notification."
      );
      return { success: false, message: "Firebase not initialized" };
    }

    const message = {
      notification: {
        title: notification.title,
        body: notification.body,
        imageUrl: notification.imageUrl,
      },
      data: {
        ...data,
        timestamp: new Date().toISOString(),
      },
      token: fcmToken,
      android: {
        priority: "high",
        notification: {
          sound: "default",
          channelId: "apartmentsync_notifications",
        },
      },
      apns: {
        payload: {
          aps: {
            sound: "default",
            badge: 1,
          },
        },
      },
    };

    const response = await admin.messaging().send(message);
    console.log("✅ Push notification sent successfully:", response);
    return { success: true, messageId: response };
  } catch (error) {
    console.error("❌ Error sending push notification:", error);

    // Handle invalid token errors
    if (
      error.code === "messaging/invalid-registration-token" ||
      error.code === "messaging/registration-token-not-registered"
    ) {
      console.log("⚠️ Invalid FCM token, should be removed from database");
      return { success: false, message: "Invalid token", shouldRemove: true };
    }

    return { success: false, message: error.message };
  }
};

// Send push notification to multiple devices
const sendMulticastPushNotification = async (
  fcmTokens,
  notification,
  data = {}
) => {
  try {
    if (!firebaseApp) {
      console.warn(
        "⚠️ Firebase not initialized. Cannot send push notification."
      );
      return { success: false, message: "Firebase not initialized" };
    }

    if (!fcmTokens || fcmTokens.length === 0) {
      return { success: false, message: "No FCM tokens provided" };
    }

    const message = {
      notification: {
        title: notification.title,
        body: notification.body,
        imageUrl: notification.imageUrl,
      },
      data: {
        ...data,
        timestamp: new Date().toISOString(),
      },
      android: {
        priority: "high",
        notification: {
          sound: "default",
          channelId: "apartmentsync_notifications",
        },
      },
      apns: {
        payload: {
          aps: {
            sound: "default",
            badge: 1,
          },
        },
      },
    };

    const response = await admin.messaging().sendEachForMulticast({
      tokens: fcmTokens,
      ...message,
    });

    console.log(
      `✅ Push notifications sent: ${response.successCount} successful, ${response.failureCount} failed`
    );

    // Return invalid tokens that should be removed
    const invalidTokens = [];
    response.responses.forEach((resp, idx) => {
      if (
        !resp.success &&
        (resp.error?.code === "messaging/invalid-registration-token" ||
          resp.error?.code === "messaging/registration-token-not-registered")
      ) {
        invalidTokens.push(fcmTokens[idx]);
      }
    });

    return {
      success: response.failureCount === 0,
      successCount: response.successCount,
      failureCount: response.failureCount,
      invalidTokens,
    };
  } catch (error) {
    console.error("❌ Error sending multicast push notification:", error);
    return { success: false, message: error.message };
  }
};

// Send push notification to a topic
const sendTopicPushNotification = async (topic, notification, data = {}) => {
  try {
    if (!firebaseApp) {
      console.warn(
        "⚠️ Firebase not initialized. Cannot send push notification."
      );
      return { success: false, message: "Firebase not initialized" };
    }

    const message = {
      notification: {
        title: notification.title,
        body: notification.body,
        imageUrl: notification.imageUrl,
      },
      data: {
        ...data,
        timestamp: new Date().toISOString(),
      },
      topic: topic,
      android: {
        priority: "high",
        notification: {
          sound: "default",
          channelId: "apartmentsync_notifications",
        },
      },
      apns: {
        payload: {
          aps: {
            sound: "default",
            badge: 1,
          },
        },
      },
    };

    const response = await admin.messaging().send(message);
    console.log("✅ Topic push notification sent successfully:", response);
    return { success: true, messageId: response };
  } catch (error) {
    console.error("❌ Error sending topic push notification:", error);
    return { success: false, message: error.message };
  }
};

module.exports = {
  initializeFirebase,
  sendPushNotification,
  sendMulticastPushNotification,
  sendTopicPushNotification,
};
