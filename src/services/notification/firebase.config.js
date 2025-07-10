// Firebase Admin SDK Configuration
import admin from 'firebase-admin';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

dotenv.config();

// Get the directory of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Enhanced Feature toggles for notification system
export const NOTIFICATION_FEATURES = {
  // Core notification features
  PUSH_NOTIFICATIONS_ENABLED: process.env.ENABLE_PUSH_NOTIFICATIONS === 'true',
  SOCKET_IO_ENABLED: process.env.ENABLE_SOCKET_NOTIFICATIONS !== 'false', // Default true
  
  // Notification types - granular control
  NEW_MESSAGE_NOTIFICATIONS: process.env.ENABLE_MESSAGE_NOTIFICATIONS !== 'false', // Default true
  FRIEND_REQUEST_NOTIFICATIONS: process.env.ENABLE_FRIEND_REQUEST_NOTIFICATIONS !== 'false', // Default true
  FRIEND_ACCEPTED_NOTIFICATIONS: process.env.ENABLE_FRIEND_ACCEPTED_NOTIFICATIONS !== 'false', // Default true
  ACCOUNT_ACTIVITY_NOTIFICATIONS: process.env.ENABLE_ACCOUNT_NOTIFICATIONS !== 'false', // Default true
  
  // Delivery methods
  OFFLINE_PUSH_ENABLED: process.env.ENABLE_OFFLINE_PUSH_NOTIFICATIONS !== 'false', // Default true
  STORE_UNDELIVERED_NOTIFICATIONS: process.env.STORE_UNDELIVERED_NOTIFICATIONS !== 'false', // Default true
  
  // Development and monitoring
  NOTIFICATION_LOGGING: process.env.NODE_ENV !== 'production',
  NOTIFICATION_METRICS: process.env.ENABLE_NOTIFICATION_METRICS === 'true',
  
  // Backward compatibility mode (fallback to old system)
  BACKWARD_COMPATIBILITY_MODE: process.env.NOTIFICATION_BACKWARD_COMPATIBILITY === 'true'
};

let firebaseApp = null;
let firebaseMessaging = null;

// Initialize Firebase Admin SDK
export const initializeFirebase = () => {
  try {
    // Check if Firebase is enabled via feature toggle
    if (!NOTIFICATION_FEATURES.PUSH_NOTIFICATIONS_ENABLED) {
      console.log('🔕 Push notifications are disabled via feature toggle');
      return false;
    }

    // Check if Firebase credentials are provided
    const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
    
    if (!serviceAccountPath) {
      console.warn('⚠️ Firebase service account path not provided. Push notifications will be disabled.');
      return false;
    }

    // Read the service account file
    let serviceAccount;
    try {
      const fullPath = serviceAccountPath.startsWith('/') 
        ? serviceAccountPath 
        : join(process.cwd(), serviceAccountPath);
      
      const fileContent = readFileSync(fullPath, 'utf8');
      serviceAccount = JSON.parse(fileContent);
    } catch (error) {
      console.error('❌ Failed to read Firebase service account file:', error.message);
      return false;
    }

    // Initialize Firebase Admin
    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: serviceAccount.project_id || process.env.FIREBASE_PROJECT_ID
    });

    firebaseMessaging = admin.messaging();
    
    console.log('✅ Firebase Admin SDK initialized successfully');
    return true;
  } catch (error) {
    console.error('❌ Failed to initialize Firebase Admin SDK:', error.message);
    return false;
  }
};

// Get Firebase Messaging instance
export const getMessaging = () => {
  if (!firebaseMessaging && NOTIFICATION_FEATURES.PUSH_NOTIFICATIONS_ENABLED) {
    initializeFirebase();
  }
  return firebaseMessaging;
};

// Export admin for other uses if needed
export { admin };
