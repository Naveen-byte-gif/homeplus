const admin = require("firebase-admin");

// Initialize Firebase Admin SDK
let firebaseApp;

// Check Firebase connection status
const checkFirebaseStatus = () => {
  console.log(
    "\n🔍 ========== [BACKEND FCM] CONNECTION STATUS CHECK =========="
  );
  console.log(`🔍 [BACKEND FCM] Timestamp: ${new Date().toISOString()}`);

  const status = {
    initialized: false,
    appName: null,
    projectId: null,
    hasCredentials: false,
    errors: [],
  };

  try {
    // Check if Firebase is initialized
    if (admin.apps.length > 0) {
      firebaseApp = admin.apps[0];
      status.initialized = true;
      status.appName = firebaseApp.name;

      // Try to get project ID
      try {
        status.projectId = firebaseApp.options?.projectId || "unknown";
        console.log("✅ [BACKEND FCM] Firebase Admin is INITIALIZED");
        console.log(`✅ [BACKEND FCM] App name: ${status.appName}`);
        console.log(`✅ [BACKEND FCM] Project ID: ${status.projectId}`);
        status.hasCredentials = true;
      } catch (e) {
        console.warn("⚠️ [BACKEND FCM] Could not get project ID:", e.message);
        status.errors.push(`Could not get project ID: ${e.message}`);
      }
    } else {
      status.errors.push("Firebase Admin is not initialized");
      console.error("❌ [BACKEND FCM] Firebase Admin is NOT INITIALIZED");
    }

    // Check for credentials
    if (!status.initialized) {
      let serviceAccount = null;

      // Check environment variable
      if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
        try {
          serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
          status.hasCredentials = true;
          console.log(
            "✅ [BACKEND FCM] Credentials found in FIREBASE_SERVICE_ACCOUNT_KEY"
          );
        } catch (e) {
          status.errors.push(
            `Error parsing FIREBASE_SERVICE_ACCOUNT_KEY: ${e.message}`
          );
        }
      }

      // Check individual env vars
      if (!serviceAccount && process.env.FIREBASE_PROJECT_ID) {
        status.hasCredentials = true;
        console.log(
          "✅ [BACKEND FCM] Credentials found in individual environment variables"
        );
      }

      // Check files
      if (!serviceAccount) {
        const fs = require("fs");
        const path = require("path");
        const possibleFiles = [
          path.join(
            __dirname,
            "../apartmentsync-c3174-firebase-adminsdk-fbsvc-dac1bf241a.json"
          ),
          path.join(__dirname, "../firebase-service-account.json"),
          path.join(__dirname, "../serviceAccountKey.json"),
        ];

        for (const filePath of possibleFiles) {
          if (fs.existsSync(filePath)) {
            status.hasCredentials = true;
            console.log(
              `✅ [BACKEND FCM] Credentials file found: ${path.basename(
                filePath
              )}`
            );
            break;
          }
        }
      }

      if (!status.hasCredentials) {
        status.errors.push("No Firebase credentials found");
        console.error("❌ [BACKEND FCM] No Firebase credentials found");
        console.error(
          "❌ [BACKEND FCM] Check: FIREBASE_SERVICE_ACCOUNT_KEY in .env"
        );
        console.error(
          "❌ [BACKEND FCM] Check: Or FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY"
        );
        console.error(
          "❌ [BACKEND FCM] Check: Or firebase-service-account.json file"
        );
      }
    }

    console.log("\n📊 [BACKEND FCM] ========== CONNECTION SUMMARY ==========");
    console.log(
      `📊 [BACKEND FCM] Initialized: ${status.initialized ? "✅ YES" : "❌ NO"}`
    );
    console.log(
      `📊 [BACKEND FCM] Has Credentials: ${
        status.hasCredentials ? "✅ YES" : "❌ NO"
      }`
    );
    if (status.appName)
      console.log(`📊 [BACKEND FCM] App Name: ${status.appName}`);
    if (status.projectId)
      console.log(`📊 [BACKEND FCM] Project ID: ${status.projectId}`);

    if (status.errors.length > 0) {
      console.log(`📊 [BACKEND FCM] Errors: ${status.errors.length}`);
      status.errors.forEach((err) => console.log(`   ⚠️ ${err}`));
    }

    console.log(
      `📊 [BACKEND FCM] Overall Status: ${
        status.initialized && status.hasCredentials
          ? "✅ CONNECTED"
          : "❌ NOT CONNECTED"
      }`
    );
    console.log(
      "📊 [BACKEND FCM] ==========================================\n"
    );

    return status;
  } catch (error) {
    console.error("❌ [BACKEND FCM] Error checking Firebase status:", error);
    status.errors.push(`Exception: ${error.message}`);
    return status;
  }
};

const initializeFirebase = () => {
  console.log("\n🔧 ========== [BACKEND FCM] INITIALIZATION START ==========");
  console.log(`🔧 [BACKEND FCM] Timestamp: ${new Date().toISOString()}`);

  try {
    // Check if Firebase is already initialized
    if (admin.apps.length > 0) {
      firebaseApp = admin.apps[0];
      console.log("✅ [BACKEND FCM] Firebase Admin already initialized");
      console.log(`✅ [BACKEND FCM] App name: ${firebaseApp.name}`);
      checkFirebaseStatus();
      return firebaseApp;
    }

    let serviceAccount = null;

    // Try to load from environment variable (JSON string)
    if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
      try {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
        console.log(
          "📝 Loading Firebase credentials from environment variable"
        );
      } catch (e) {
        console.error(
          "❌ Error parsing FIREBASE_SERVICE_ACCOUNT_KEY:",
          e.message
        );
      }
    }

    // Try to load from file (if env var not set)
    if (!serviceAccount) {
      try {
        const fs = require("fs");
        const path = require("path");

        // Look for service account JSON file in root directory
        const possibleFiles = [
          path.join(
            __dirname,
            "../apartmentsync-c3174-firebase-adminsdk-fbsvc-dac1bf241a.json"
          ),
          path.join(__dirname, "../firebase-service-account.json"),
          path.join(__dirname, "../serviceAccountKey.json"),
        ];

        for (const filePath of possibleFiles) {
          if (fs.existsSync(filePath)) {
            const fileContent = fs.readFileSync(filePath, "utf8");
            serviceAccount = JSON.parse(fileContent);
            console.log(
              `📝 Loading Firebase credentials from file: ${path.basename(
                filePath
              )}`
            );
            break;
          }
        }
      } catch (e) {
        // File not found or error reading - continue to next method
        console.log(
          "ℹ️ No Firebase service account file found, trying other methods..."
        );
      }
    }

    // Try individual environment variables
    if (!serviceAccount && process.env.FIREBASE_PROJECT_ID) {
      const privateKey = process.env.FIREBASE_PRIVATE_KEY;

      // Handle private key formatting - it might have escaped newlines or be in different formats
      let formattedPrivateKey = privateKey;
      if (privateKey) {
        // Replace escaped newlines (common in .env files)
        formattedPrivateKey = privateKey.replace(/\\n/g, "\n");

        // If the key doesn't have proper newlines, try to fix it
        if (!formattedPrivateKey.includes("\n")) {
          // Check if it's a base64-encoded key without newlines
          if (
            formattedPrivateKey.includes("-----BEGIN PRIVATE KEY-----") &&
            formattedPrivateKey.includes("-----END PRIVATE KEY-----")
          ) {
            // Key has markers but no newlines - restore proper formatting
            formattedPrivateKey = formattedPrivateKey
              .replace(
                /-----BEGIN PRIVATE KEY-----/g,
                "-----BEGIN PRIVATE KEY-----\n"
              )
              .replace(
                /-----END PRIVATE KEY-----/g,
                "\n-----END PRIVATE KEY-----"
              )
              .replace(/\n+/g, "\n") // Remove multiple newlines
              .trim();
          } else if (
            formattedPrivateKey.length > 100 &&
            !formattedPrivateKey.includes("-----")
          ) {
            // It might be a base64 string - wrap it properly
            console.warn(
              "⚠️ [BACKEND FCM] Private key appears to be base64 without markers"
            );
            formattedPrivateKey = `-----BEGIN PRIVATE KEY-----\n${formattedPrivateKey}\n-----END PRIVATE KEY-----`;
          }
        }

        // Ensure proper newline format (CRLF to LF conversion)
        formattedPrivateKey = formattedPrivateKey
          .replace(/\r\n/g, "\n")
          .replace(/\r/g, "\n");

        // Validate the key structure
        const lines = formattedPrivateKey.split("\n");
        const beginLine = lines.find((line) => line.includes("BEGIN"));
        const endLine = lines.find((line) => line.includes("END"));

        if (!beginLine || !endLine) {
          console.error(
            "❌ [BACKEND FCM] ERROR: Private key missing BEGIN/END markers"
          );
          console.error(
            "❌ [BACKEND FCM] Private key should start with '-----BEGIN PRIVATE KEY-----'"
          );
          console.error(
            "❌ [BACKEND FCM] Private key should end with '-----END PRIVATE KEY-----'"
          );
        }
      }

      serviceAccount = {
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: formattedPrivateKey,
      };

      console.log(
        "📝 Loading Firebase credentials from individual environment variables"
      );
      console.log(
        `📝 Project ID: ${serviceAccount.projectId ? "found" : "MISSING"}`
      );
      console.log(
        `📝 Client Email: ${serviceAccount.clientEmail ? "found" : "MISSING"}`
      );
      console.log(
        `📝 Private Key: ${
          serviceAccount.privateKey
            ? `found (length: ${serviceAccount.privateKey.length})`
            : "MISSING"
        }`
      );

      if (serviceAccount.privateKey) {
        const hasBegin = serviceAccount.privateKey.includes("-----BEGIN");
        const hasEnd = serviceAccount.privateKey.includes("-----END");
        const hasNewlines = serviceAccount.privateKey.includes("\n");
        const keyType = serviceAccount.privateKey.includes("PRIVATE KEY")
          ? "PKCS#8"
          : serviceAccount.privateKey.includes("RSA PRIVATE KEY")
          ? "PKCS#1"
          : "unknown";

        console.log(
          `📝 Private Key Format: BEGIN=${hasBegin}, END=${hasEnd}, Newlines=${hasNewlines}, Type=${keyType}`
        );

        // Validate key format more strictly
        if (!hasBegin || !hasEnd) {
          console.error(
            "❌ [BACKEND FCM] ERROR: Private key format is invalid - missing BEGIN/END markers"
          );
        } else if (!hasNewlines) {
          console.error(
            "❌ [BACKEND FCM] ERROR: Private key format is invalid - missing newlines"
          );
          console.error(
            "❌ [BACKEND FCM] Private key must have newlines between BEGIN/END and the key content"
          );
        } else {
          // Try to validate it's a proper RSA key format
          const keyContent = serviceAccount.privateKey
            .replace(/-----BEGIN.*-----/g, "")
            .replace(/-----END.*-----/g, "")
            .replace(/\s/g, "");

          if (keyContent.length < 100) {
            console.error(
              "❌ [BACKEND FCM] ERROR: Private key content seems too short"
            );
          } else {
            console.log(
              `✅ [BACKEND FCM] Private key format appears valid (content length: ${keyContent.length})`
            );
          }
        }
      }
    }

    // Initialize Firebase if we have credentials
    if (serviceAccount) {
      // Validate required fields
      if (!serviceAccount.projectId) {
        console.error(
          "❌ [BACKEND FCM] ERROR: serviceAccount.projectId is missing"
        );
        console.error("❌ [BACKEND FCM] Invalid service account credentials");
        checkFirebaseStatus();
        return null;
      }
      if (!serviceAccount.clientEmail) {
        console.error(
          "❌ [BACKEND FCM] ERROR: serviceAccount.clientEmail is missing"
        );
        console.error("❌ [BACKEND FCM] Invalid service account credentials");
        checkFirebaseStatus();
        return null;
      }
      if (!serviceAccount.privateKey) {
        console.error(
          "❌ [BACKEND FCM] ERROR: serviceAccount.privateKey is missing"
        );
        console.error("❌ [BACKEND FCM] Invalid service account credentials");
        checkFirebaseStatus();
        return null;
      }

      try {
        // Create credential first to validate it
        const credential = admin.credential.cert(serviceAccount);
        console.log("✅ [BACKEND FCM] Credential created successfully");

        firebaseApp = admin.initializeApp(
          {
            credential: credential,
          },
          "apartmentsync-default"
        ); // Use explicit name

        console.log("✅ [BACKEND FCM] Firebase Admin initialized successfully");
        console.log(`✅ [BACKEND FCM] Project ID: ${serviceAccount.projectId}`);
        console.log(
          `✅ [BACKEND FCM] Client Email: ${serviceAccount.clientEmail}`
        );

        // Test messaging access immediately
        try {
          const testMessaging = admin.messaging(firebaseApp);
          console.log("✅ [BACKEND FCM] Messaging service test: SUCCESS");
        } catch (testError) {
          console.error("❌ [BACKEND FCM] Messaging service test: FAILED");
          console.error(`❌ [BACKEND FCM] Test error: ${testError.message}`);
          console.error(
            "❌ [BACKEND FCM] Credentials may be invalid or expired"
          );
        }

        console.log(
          `🔧 ========== [BACKEND FCM] INITIALIZATION SUCCESS ==========\n`
        );

        // Print status after initialization
        checkFirebaseStatus();
        return firebaseApp;
      } catch (initError) {
        console.error("❌ [BACKEND FCM] ERROR: Failed to initialize Firebase");
        console.error(`❌ [BACKEND FCM] Error: ${initError.message}`);
        console.error(`❌ [BACKEND FCM] Stack: ${initError.stack}`);
        checkFirebaseStatus();
        return null;
      }
    } else {
      console.error(
        "❌ [BACKEND FCM] Firebase credentials not found. Push notifications will be disabled."
      );
      console.error("❌ [BACKEND FCM] To enable push notifications:");
      console.error(
        "   - Add FIREBASE_SERVICE_ACCOUNT_KEY to .env (JSON string)"
      );
      console.error(
        "   - Or add FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY to .env"
      );
      console.error(
        "   - Or place firebase-service-account.json in root directory"
      );
      console.log(
        `🔧 ========== [BACKEND FCM] INITIALIZATION FAILED ==========\n`
      );

      checkFirebaseStatus();
      return null;
    }
  } catch (error) {
    console.error(
      "❌ ========== [BACKEND FCM] INITIALIZATION ERROR =========="
    );
    console.error("❌ [BACKEND FCM] Error:", error.message);
    console.error("❌ [BACKEND FCM] Stack:", error.stack);
    console.error(
      "❌ ========== [BACKEND FCM] INITIALIZATION ERROR ==========\n"
    );
    checkFirebaseStatus();
    return null;
  }
};

// Helper function to convert all data values to strings (FCM requirement)
const stringifyData = (data) => {
  const stringified = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === null || value === undefined) {
      stringified[key] = "";
    } else if (typeof value === "object") {
      // Stringify objects/arrays
      stringified[key] = JSON.stringify(value);
    } else {
      // Convert to string
      stringified[key] = String(value);
    }
  }
  return stringified;
};

// Send push notification to a device
const sendPushNotification = async (fcmToken, notification, data = {}) => {
  console.log("\n🔔 ========== [FCM] SEND PUSH NOTIFICATION START ==========");
  console.log(`🔔 [FCM] Timestamp: ${new Date().toISOString()}`);

  try {
    // Check Firebase initialization and credentials
    console.log(`🔔 [FCM] Checking Firebase initialization...`);
    if (!firebaseApp) {
      console.error(
        "❌ [FCM] ERROR: Firebase not initialized. Cannot send push notification."
      );
      console.log("🔔 [FCM] Check: Is Firebase Admin SDK properly configured?");
      console.log("🔔 [FCM] Check: Are FIREBASE credentials in .env?");
      return { success: false, message: "Firebase not initialized" };
    }
    console.log("✅ [FCM] Firebase app exists");

    // Check if we can access messaging service
    try {
      const messaging = admin.messaging(firebaseApp);
      if (!messaging) {
        throw new Error("Messaging service is null");
      }
      console.log("✅ [FCM] Messaging service accessible");
    } catch (messagingError) {
      console.error("❌ [FCM] ERROR: Cannot access messaging service");
      console.error(`❌ [FCM] Error: ${messagingError.message}`);
      console.error(
        "❌ [FCM] This usually means Firebase credentials are invalid or missing"
      );
      console.error(
        "❌ [FCM] Check: Are Firebase credentials properly configured?"
      );
      return {
        success: false,
        message: "Cannot access messaging service - credentials invalid",
      };
    }

    // Verify credential exists and is valid
    try {
      const appOptions = firebaseApp.options;
      if (!appOptions || !appOptions.credential) {
        throw new Error("No credential found in Firebase app");
      }
      console.log("✅ [FCM] Credential found in Firebase app");

      // Try to get project ID as a test
      if (appOptions.projectId) {
        console.log(`✅ [FCM] Project ID: ${appOptions.projectId}`);
      } else {
        console.warn(
          "⚠️ [FCM] WARNING: No project ID found in Firebase app options"
        );
      }
    } catch (credError) {
      console.error("❌ [FCM] ERROR: Firebase credential validation failed");
      console.error(`❌ [FCM] Error: ${credError.message}`);
      console.error("❌ [FCM] Firebase app exists but credentials are invalid");
      return { success: false, message: "Firebase credentials invalid" };
    }

    // Validate FCM token
    console.log(`🔔 [FCM] Validating FCM token...`);
    console.log(`🔔 [FCM] Token type: ${typeof fcmToken}`);
    console.log(
      `🔔 [FCM] Token length: ${fcmToken ? fcmToken.length : "null"}`
    );
    console.log(
      `🔔 [FCM] Token preview: ${
        fcmToken ? fcmToken.substring(0, 50) + "..." : "null"
      }`
    );

    if (
      !fcmToken ||
      typeof fcmToken !== "string" ||
      fcmToken.trim().length === 0
    ) {
      console.error("❌ [FCM] ERROR: Invalid FCM token provided");
      console.error(`❌ [FCM] Token value: ${JSON.stringify(fcmToken)}`);
      return { success: false, message: "Invalid FCM token" };
    }
    console.log("✅ [FCM] Token is valid");

    // Prepare data payload - all values must be strings
    console.log(`🔔 [FCM] Preparing data payload...`);
    console.log(`🔔 [FCM] Original data keys: ${Object.keys(data).join(", ")}`);
    console.log(`🔔 [FCM] Original data:`, JSON.stringify(data, null, 2));

    const dataPayload = stringifyData({
      ...data,
      timestamp: new Date().toISOString(),
    });

    console.log(
      `🔔 [FCM] Stringified data keys: ${Object.keys(dataPayload).join(", ")}`
    );
    console.log(
      `🔔 [FCM] Stringified data preview:`,
      JSON.stringify(dataPayload).substring(0, 500)
    );

    // Build notification message
    console.log(`🔔 [FCM] Building notification message...`);
    console.log(`🔔 [FCM] Title: "${notification.title || "Notification"}"`);
    console.log(
      `🔔 [FCM] Body: "${notification.body || "You have a new notification"}"`
    );

    const message = {
      notification: {
        title: notification.title || "Notification",
        body: notification.body || "You have a new notification",
      },
      data: dataPayload,
      token: fcmToken,
      android: {
        priority: "high",
        notification: {
          sound: "default",
          channelId: "apartmentsync_notifications",
          priority: "high",
          visibility: "public",
          defaultSound: true,
          defaultVibrateTimings: true,
        },
      },
      apns: {
        payload: {
          aps: {
            sound: "default",
            badge: 1,
            alert: {
              title: notification.title || "Notification",
              body: notification.body || "You have a new notification",
            },
          },
        },
      },
    };

    console.log(
      `🔔 [FCM] Message structure:`,
      JSON.stringify(
        {
          notification: message.notification,
          dataKeys: Object.keys(message.data),
          token: message.token.substring(0, 30) + "...",
          android: "configured",
          apns: "configured",
        },
        null,
        2
      )
    );

    // Get messaging instance from the app
    let messaging;
    try {
      messaging = admin.messaging(firebaseApp);
      if (!messaging) {
        throw new Error("Messaging instance is null");
      }
    } catch (msgError) {
      console.error("❌ [FCM] ERROR: Failed to get messaging instance");
      console.error(`❌ [FCM] Error: ${msgError.message}`);
      return {
        success: false,
        message: "Failed to get messaging instance",
        error: msgError.message,
      };
    }

    // Send notification
    console.log(`🔔 [FCM] Sending to Firebase Admin SDK...`);
    console.log(
      `🔔 [FCM] Using messaging instance from app: ${firebaseApp.name}`
    );
    const response = await messaging.send(message);
    console.log(`✅ [FCM] SUCCESS: Push notification sent successfully!`);
    console.log(`✅ [FCM] Message ID: ${response}`);
    console.log(
      `🔔 ========== [FCM] SEND PUSH NOTIFICATION SUCCESS ==========\n`
    );
    return { success: true, messageId: response };
  } catch (error) {
    console.error(
      "\n❌ ========== [FCM] SEND PUSH NOTIFICATION ERROR =========="
    );
    console.error(`❌ [FCM] Error occurred at: ${new Date().toISOString()}`);
    console.error(`❌ [FCM] Error name: ${error.name}`);
    console.error(`❌ [FCM] Error code: ${error.code}`);
    console.error(`❌ [FCM] Error message: ${error.message}`);
    console.error(`❌ [FCM] Full error:`, error);

    if (error.stack) {
      console.error(`❌ [FCM] Stack trace:`, error.stack);
    }

    // Handle specific error codes
    if (
      error.code === "messaging/invalid-registration-token" ||
      error.code === "messaging/registration-token-not-registered"
    ) {
      console.error("⚠️ [FCM] ISSUE: Invalid or unregistered FCM token");
      console.error(
        "⚠️ [FCM] ACTION: This token should be removed from database"
      );
      console.error(
        "⚠️ [FCM] CAUSE: Token may have expired or app was uninstalled"
      );
      return { success: false, message: "Invalid token", shouldRemove: true };
    }

    if (error.code === "messaging/invalid-argument") {
      console.error("⚠️ [FCM] ISSUE: Invalid argument in message");
      console.error("⚠️ [FCM] ACTION: Check message structure and data types");
    }

    console.error(
      `❌ ========== [FCM] SEND PUSH NOTIFICATION FAILED ==========\n`
    );
    return { success: false, message: error.message, code: error.code };
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

    // Filter out invalid tokens
    const validTokens = fcmTokens.filter(
      (token) => token && typeof token === "string" && token.trim().length > 0
    );

    if (validTokens.length === 0) {
      console.warn("⚠️ [FCM] No valid FCM tokens provided");
      return { success: false, message: "No valid FCM tokens" };
    }

    // Prepare data payload - all values must be strings
    const dataPayload = stringifyData({
      ...data,
      timestamp: new Date().toISOString(),
    });

    console.log(
      `📤 [FCM] Sending multicast notification to ${validTokens.length} devices`
    );
    console.log(`📤 [FCM] Title: ${notification.title}`);
    console.log(`📤 [FCM] Body: ${notification.body}`);

    const message = {
      notification: {
        title: notification.title || "Notification",
        body: notification.body || "You have a new notification",
      },
      data: dataPayload,
      android: {
        priority: "high",
        notification: {
          sound: "default",
          channelId: "apartmentsync_notifications",
          priority: "high",
          visibility: "public",
          defaultSound: true,
          defaultVibrateTimings: true,
        },
      },
      apns: {
        payload: {
          aps: {
            sound: "default",
            badge: 1,
            alert: {
              title: notification.title || "Notification",
              body: notification.body || "You have a new notification",
            },
          },
        },
      },
    };

    const response = await admin.messaging().sendEachForMulticast({
      tokens: validTokens,
      ...message,
    });

    console.log(
      `✅ [FCM] Push notifications sent: ${response.successCount} successful, ${response.failureCount} failed`
    );

    // Return invalid tokens that should be removed
    const invalidTokens = [];
    response.responses.forEach((resp, idx) => {
      if (
        !resp.success &&
        (resp.error?.code === "messaging/invalid-registration-token" ||
          resp.error?.code === "messaging/registration-token-not-registered")
      ) {
        invalidTokens.push(validTokens[idx]);
      }
    });

    if (invalidTokens.length > 0) {
      console.log(
        `⚠️ [FCM] Found ${invalidTokens.length} invalid tokens that should be removed`
      );
    }

    return {
      success: response.failureCount === 0,
      successCount: response.successCount,
      failureCount: response.failureCount,
      invalidTokens,
    };
  } catch (error) {
    console.error("❌ [FCM] Error sending multicast push notification:", error);
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
  checkFirebaseStatus,
  sendPushNotification,
  sendMulticastPushNotification,
  sendTopicPushNotification,
};
