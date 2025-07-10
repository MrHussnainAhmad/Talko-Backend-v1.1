// Unified Notification Handler with Enhanced Features
import { sendPushNotification, sendRealtimeNotification } from './notification.service.js';
import { getReceiverSocketId } from '../../lib/socket.js';
import User from '../../models/User.model.js';
import { NOTIFICATION_FEATURES } from './firebase.config.js';

// Notification metrics
let notificationMetrics = {
  totalSent: 0,
  socketDelivered: 0,
  pushSent: 0,
  stored: 0,
  failed: 0,
  byType: {}
};

/**
 * Smart notification delivery system
 * Layer 1: Real-time via Socket.IO (if user is online)
 * Layer 2: Enhanced Socket.IO events
 * Layer 3: Push notifications via FCM (if user is offline)
 */
export const sendNotification = async ({
  userId,
  type,
  title,
  body,
  data = {},
  priority = 'normal'
}) => {
  try {
    // Update metrics
    if (NOTIFICATION_FEATURES.NOTIFICATION_METRICS) {
      notificationMetrics.totalSent++;
      if (!notificationMetrics.byType[type]) {
        notificationMetrics.byType[type] = 0;
      }
      notificationMetrics.byType[type]++;
    }

    if (NOTIFICATION_FEATURES.NOTIFICATION_LOGGING) {
      console.log(`📬 Sending notification to user ${userId}:`, { type, title, body });
    }

    // Check type-specific feature toggles
    if (!isNotificationTypeEnabled(type)) {
      if (NOTIFICATION_FEATURES.NOTIFICATION_LOGGING) {
        console.log(`🔕 Notification type ${type} is disabled`);
      }
      return { delivered: false, method: 'disabled', reason: 'type_disabled' };
    }

    // Backward compatibility mode
    if (NOTIFICATION_FEATURES.BACKWARD_COMPATIBILITY_MODE) {
      return await sendNotificationLegacy(userId, type, title, body, data, priority);
    }

    // Check if user is online (Layer 1)
    const socketId = getReceiverSocketId(userId);
    
    if (socketId && NOTIFICATION_FEATURES.SOCKET_IO_ENABLED) {
      // User is online - send real-time notification
      sendRealtimeNotification(userId, 'notification', {
        type,
        title,
        body,
        data,
        timestamp: new Date().toISOString()
      });
      
      if (NOTIFICATION_FEATURES.NOTIFICATION_METRICS) {
        notificationMetrics.socketDelivered++;
      }
      
      if (NOTIFICATION_FEATURES.NOTIFICATION_LOGGING) {
        console.log(`✅ Notification delivered via Socket.IO to user ${userId}`);
      }
      return { delivered: true, method: 'socket' };
    }

    // User is offline - check for FCM token (Layer 3)
    if (NOTIFICATION_FEATURES.PUSH_NOTIFICATIONS_ENABLED && NOTIFICATION_FEATURES.OFFLINE_PUSH_ENABLED) {
      const user = await User.findById(userId).select('fcmTokens');
      
      if (user && user.fcmTokens && user.fcmTokens.length > 0) {
        // Send push notification
        const payload = {
          notification: {
            title,
            body,
            click_action: 'OPEN_APP',
            sound: 'default'
          },
          data: {
            type,
            ...data,
            timestamp: new Date().toISOString()
          },
          priority: priority === 'high' ? 'high' : 'normal'
        };

        await sendPushNotification(user.fcmTokens, payload);
        
        if (NOTIFICATION_FEATURES.NOTIFICATION_METRICS) {
          notificationMetrics.pushSent++;
        }
        
        if (NOTIFICATION_FEATURES.NOTIFICATION_LOGGING) {
          console.log(`✅ Push notification sent to user ${userId}`);
        }
        return { delivered: true, method: 'push' };
      }
    }

    // Fallback - store notification for later delivery
    if (NOTIFICATION_FEATURES.STORE_UNDELIVERED_NOTIFICATIONS) {
      await storeNotificationForLater(userId, { type, title, body, data });
      
      if (NOTIFICATION_FEATURES.NOTIFICATION_METRICS) {
        notificationMetrics.stored++;
      }
      
      if (NOTIFICATION_FEATURES.NOTIFICATION_LOGGING) {
        console.log(`📥 Notification stored for later delivery to user ${userId}`);
      }
      return { delivered: false, method: 'stored' };
    }

    return { delivered: false, method: 'none', reason: 'all_methods_disabled' };

  } catch (error) {
    if (NOTIFICATION_FEATURES.NOTIFICATION_METRICS) {
      notificationMetrics.failed++;
    }
    console.error(`❌ Failed to send notification to user ${userId}:`, error);
    return { delivered: false, error: error.message };
  }
};

/**
 * Store notification for later delivery
 */
const storeNotificationForLater = async (userId, notificationData) => {
  // This could be implemented with a notification queue or database storage
  // For now, we'll add it to user's unread notifications
  try {
    await User.findByIdAndUpdate(userId, {
      $push: {
        unreadNotifications: {
          ...notificationData,
          createdAt: new Date(),
          read: false
        }
      }
    });
  } catch (error) {
    console.error('Failed to store notification:', error);
  }
};

/**
 * Notification types and templates
 */
export const NotificationTypes = {
  NEW_MESSAGE: 'new_message',
  FRIEND_REQUEST: 'friend_request',
  FRIEND_REQUEST_ACCEPTED: 'friend_request_accepted',
  USER_ONLINE: 'user_online',
  USER_OFFLINE: 'user_offline',
  ACCOUNT_DELETED: 'account_deleted'
};

/**
 * Check if a notification type is enabled
 */
const isNotificationTypeEnabled = (type) => {
  switch (type) {
    case NotificationTypes.NEW_MESSAGE:
      return NOTIFICATION_FEATURES.NEW_MESSAGE_NOTIFICATIONS;
    case NotificationTypes.FRIEND_REQUEST:
      return NOTIFICATION_FEATURES.FRIEND_REQUEST_NOTIFICATIONS;
    case NotificationTypes.FRIEND_REQUEST_ACCEPTED:
      return NOTIFICATION_FEATURES.FRIEND_ACCEPTED_NOTIFICATIONS;
    case NotificationTypes.USER_ONLINE:
    case NotificationTypes.USER_OFFLINE:
    case NotificationTypes.ACCOUNT_DELETED:
      return NOTIFICATION_FEATURES.ACCOUNT_ACTIVITY_NOTIFICATIONS;
    default:
      return true; // Allow unknown types by default
  }
};

/**
 * Legacy notification method for backward compatibility
 */
const sendNotificationLegacy = async (userId, type, title, body, data, priority) => {
  try {
    // This is a simplified version of the old notification system
    const socketId = getReceiverSocketId(userId);
    
    if (socketId) {
      // Send via socket only
      sendRealtimeNotification(userId, 'notification', {
        type,
        title,
        body,
        data,
        timestamp: new Date().toISOString()
      });
      return { delivered: true, method: 'socket_legacy' };
    }
    
    return { delivered: false, method: 'legacy_no_socket' };
  } catch (error) {
    return { delivered: false, error: error.message, method: 'legacy_error' };
  }
};

/**
 * Get notification metrics
 */
export const getNotificationMetrics = () => {
  return { ...notificationMetrics };
};

/**
 * Reset notification metrics
 */
export const resetNotificationMetrics = () => {
  notificationMetrics = {
    totalSent: 0,
    socketDelivered: 0,
    pushSent: 0,
    stored: 0,
    failed: 0,
    byType: {}
  };
};

/**
 * Send batch notifications
 */
export const sendBatchNotifications = async (notifications) => {
  const results = await Promise.all(
    notifications.map(notification => sendNotification(notification))
  );
  
  return results;
};
