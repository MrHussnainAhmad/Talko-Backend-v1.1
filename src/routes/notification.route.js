// Notification Routes
import express from 'express';
import { protectRoute } from '../middleware/auth.middleware.js';
import {
  markMessageAsRead,
  replyFromNotification,
  getUnreadNotificationsCount,
  getUserNotifications,
  markNotificationAsRead,
  clearAllNotifications
} from '../controllers/notification.controller.js';
import User from '../models/User.model.js';
import { sendNotification, NotificationTypes, getNotificationMetrics, resetNotificationMetrics } from '../services/notification/notification.handler.js';
import { NOTIFICATION_FEATURES } from '../services/notification/firebase.config.js';

const router = express.Router();

// Register/Update FCM token
router.post('/fcm-token', protectRoute, async (req, res) => {
  try {
    const { token, platform, deviceId } = req.body;
    const userId = req.user._id;

    if (!token || !platform) {
      return res.status(400).json({ error: 'Token and platform are required' });
    }

    const user = await User.findById(userId);
    
    // Remove existing token for this device if exists
    user.fcmTokens = user.fcmTokens.filter(t => t.deviceId !== deviceId);
    
    // Add new token
    user.fcmTokens.push({
      token,
      platform,
      deviceId: deviceId || `${platform}-${Date.now()}`,
      createdAt: new Date()
    });

    // Keep only last 5 tokens per user
    if (user.fcmTokens.length > 5) {
      user.fcmTokens = user.fcmTokens.slice(-5);
    }

    await user.save();

    res.status(200).json({ 
      success: true, 
      message: 'FCM token registered successfully' 
    });
  } catch (error) {
    console.error('Error registering FCM token:', error);
    res.status(500).json({ error: 'Failed to register FCM token' });
  }
});

// Remove FCM token (on logout)
router.delete('/fcm-token', protectRoute, async (req, res) => {
  try {
    const { deviceId, token } = req.body;
    const userId = req.user._id;

    await User.findByIdAndUpdate(userId, {
      $pull: {
        fcmTokens: {
          $or: [
            { deviceId },
            { token }
          ]
        }
      }
    });

    res.status(200).json({ 
      success: true, 
      message: 'FCM token removed successfully' 
    });
  } catch (error) {
    console.error('Error removing FCM token:', error);
    res.status(500).json({ error: 'Failed to remove FCM token' });
  }
});

// Get unread notifications
router.get('/unread', protectRoute, async (req, res) => {
  try {
    const userId = req.user._id;
    const user = await User.findById(userId).select('unreadNotifications');
    
    const unreadNotifications = user.unreadNotifications.filter(n => !n.read);
    
    res.status(200).json({ 
      success: true, 
      notifications: unreadNotifications 
    });
  } catch (error) {
    console.error('Error fetching unread notifications:', error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// Mark notification as read
router.put('/read/:notificationId', protectRoute, async (req, res) => {
  try {
    const { notificationId } = req.params;
    const userId = req.user._id;

    await User.updateOne(
      { 
        _id: userId,
        'unreadNotifications._id': notificationId 
      },
      {
        $set: {
          'unreadNotifications.$.read': true
        }
      }
    );

    res.status(200).json({ 
      success: true, 
      message: 'Notification marked as read' 
    });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({ error: 'Failed to update notification' });
  }
});

// Clear all notifications
router.delete('/clear', protectRoute, async (req, res) => {
  try {
    const userId = req.user._id;

    await User.findByIdAndUpdate(userId, {
      $set: { unreadNotifications: [] }
    });

    res.status(200).json({ 
      success: true, 
      message: 'All notifications cleared' 
    });
  } catch (error) {
    console.error('Error clearing notifications:', error);
    res.status(500).json({ error: 'Failed to clear notifications' });
  }
});

// Test notification endpoint
router.post('/test', protectRoute, async (req, res) => {
  try {
    const { userId, type, title, body, data } = req.body;
    
    const result = await sendNotification({
      userId: userId || req.user._id,
      type: type || NotificationTypes.NEW_MESSAGE,
      title: title || 'Test Notification',
      body: body || 'This is a test notification',
      data: data || {},
      priority: 'high'
    });

    res.status(200).json({ 
      success: true, 
      result 
    });
  } catch (error) {
    console.error('Error sending test notification:', error);
    res.status(500).json({ error: 'Failed to send test notification' });
  }
});

// Get notification metrics (development/admin only)
router.get('/metrics', protectRoute, async (req, res) => {
  try {
    if (!NOTIFICATION_FEATURES.NOTIFICATION_METRICS) {
      return res.status(403).json({ error: 'Metrics are disabled' });
    }

    const metrics = getNotificationMetrics();
    res.status(200).json({ 
      success: true, 
      metrics,
      features: NOTIFICATION_FEATURES
    });
  } catch (error) {
    console.error('Error fetching notification metrics:', error);
    res.status(500).json({ error: 'Failed to fetch metrics' });
  }
});

// Reset notification metrics (development/admin only)
router.post('/metrics/reset', protectRoute, async (req, res) => {
  try {
    if (!NOTIFICATION_FEATURES.NOTIFICATION_METRICS) {
      return res.status(403).json({ error: 'Metrics are disabled' });
    }

    resetNotificationMetrics();
    res.status(200).json({ 
      success: true, 
      message: 'Metrics reset successfully'
    });
  } catch (error) {
    console.error('Error resetting notification metrics:', error);
    res.status(500).json({ error: 'Failed to reset metrics' });
  }
});

// NEW NOTIFICATION ACTION ROUTES (WhatsApp-style)

// Mark message as read from notification action
router.post('/actions/mark-read', protectRoute, markMessageAsRead);

// Reply from notification action
router.post('/actions/reply', protectRoute, replyFromNotification);

// Get unread notifications count
router.get('/count/unread', protectRoute, getUnreadNotificationsCount);

// Get all user notifications with pagination
router.get('/user', protectRoute, getUserNotifications);

// Mark specific notification as read
router.put('/mark-read/:notificationId', protectRoute, markNotificationAsRead);

// Clear all notifications
router.delete('/clear-all', protectRoute, clearAllNotifications);

export default router;
