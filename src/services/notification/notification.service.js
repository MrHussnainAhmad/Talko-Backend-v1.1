// Notification Service Implementation
import { getMessaging, NOTIFICATION_FEATURES } from './firebase.config.js';
import { io, getReceiverSocketId } from '../../lib/socket.js';

// Function to send a push notification
export const sendPushNotification = async (tokens, payload) => {
  if (!NOTIFICATION_FEATURES.PUSH_NOTIFICATIONS_ENABLED) {
    console.warn('🔕 Push notifications are disabled via feature toggle');
    return;
  }

  const messaging = getMessaging();

  if (!messaging) {
    console.error('❌ Firebase Messaging service not initialized');
    return;
  }

  try {
    const response = await messaging.sendToDevice(tokens, payload);
    console.log('✅ Push notification sent:', response);
  } catch (error) {
    console.error('❌ Failed to send push notification:', error.message);
  }
};

// Function to send real-time notification via Socket.IO
export const sendRealtimeNotification = (userId, event, data) => {
  if (!NOTIFICATION_FEATURES.SOCKET_IO_ENABLED) {
    console.warn('🔕 Real-time notifications are disabled via feature toggle');
    return;
  }

  const socketId = getReceiverSocketId(userId);

  if (!socketId) {
    console.error('❌ Socket ID not found for userId:', userId);
    return;
  }

  io.to(socketId).emit(event, data);
  console.log(`✅ Real-time notification sent to userId ${userId}`);
};
