# Unified Notification System Documentation

## Overview
The Unified Notification System provides a three-layer approach to ensure reliable notification delivery across web and mobile platforms:

1. **Layer 1**: Real-time notifications via Socket.IO (when users are online)
2. **Layer 2**: Enhanced Socket.IO events for stable message delivery
3. **Layer 3**: Push notifications via Firebase Cloud Messaging (when users are offline)

## Setup

### 1. Firebase Configuration

1. Create a Firebase project at [Firebase Console](https://console.firebase.google.com)
2. Generate a service account key:
   - Go to Project Settings > Service Accounts
   - Click "Generate new private key"
   - Save the JSON file securely
3. Update your `.env` file:
   ```
   ENABLE_PUSH_NOTIFICATIONS=true
   FIREBASE_PROJECT_ID=your_project_id
   FIREBASE_SERVICE_ACCOUNT_PATH=./firebase-service-account.json
   ```

### 2. Environment Variables

The system uses feature toggles for safe deployment:

- `ENABLE_PUSH_NOTIFICATIONS`: Enable/disable push notifications (default: false)
- `NODE_ENV`: Set to 'production' to disable notification logging

## Usage

### Sending Notifications

```javascript
import { sendNotification, NotificationTypes } from './services/notification/notification.handler.js';

// Send a notification
const result = await sendNotification({
  userId: 'user123',
  type: NotificationTypes.NEW_MESSAGE,
  title: 'New Message',
  body: 'You have a new message from John',
  data: {
    senderId: 'sender123',
    messageId: 'msg456'
  },
  priority: 'high' // 'normal' or 'high'
});
```

### Notification Types

- `NEW_MESSAGE`: New message received
- `FRIEND_REQUEST`: Friend request received
- `FRIEND_REQUEST_ACCEPTED`: Friend request accepted
- `USER_ONLINE`: Friend came online
- `USER_OFFLINE`: Friend went offline
- `ACCOUNT_DELETED`: User account deleted

### API Endpoints

#### Register FCM Token
```http
POST /api/notifications/fcm-token
Authorization: Bearer <token>
Content-Type: application/json

{
  "token": "FCM_TOKEN_HERE",
  "platform": "web|ios|android",
  "deviceId": "unique_device_id"
}
```

#### Remove FCM Token (on logout)
```http
DELETE /api/notifications/fcm-token
Authorization: Bearer <token>
Content-Type: application/json

{
  "deviceId": "unique_device_id"
}
```

#### Get Unread Notifications
```http
GET /api/notifications/unread
Authorization: Bearer <token>
```

#### Mark Notification as Read
```http
PUT /api/notifications/read/:notificationId
Authorization: Bearer <token>
```

#### Clear All Notifications
```http
DELETE /api/notifications/clear
Authorization: Bearer <token>
```

#### Test Notification
```http
POST /api/notifications/test
Authorization: Bearer <token>
Content-Type: application/json

{
  "type": "new_message",
  "title": "Test Notification",
  "body": "This is a test",
  "data": {}
}
```

## Client Implementation

### Web Client
```javascript
// Register for push notifications
const registerForPushNotifications = async () => {
  // Request notification permission
  const permission = await Notification.requestPermission();
  
  if (permission === 'granted') {
    // Get FCM token
    const token = await getToken(messaging);
    
    // Send token to backend
    await fetch('/api/notifications/fcm-token', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        token,
        platform: 'web',
        deviceId: navigator.userAgent
      })
    });
  }
};

// Listen for real-time notifications
socket.on('notification', (data) => {
  console.log('Received notification:', data);
  // Display notification to user
});
```

### Mobile Client (React Native)
```javascript
// Similar implementation using Firebase Messaging for React Native
```

## Testing

### Test Real-time Notification
```bash
curl -X POST http://localhost:3000/api/test/realtime-notification \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "USER_ID",
    "event": "notification",
    "data": {
      "type": "new_message",
      "title": "Test",
      "body": "Test message"
    }
  }'
```

### Test Push Notification
```bash
curl -X POST http://localhost:3000/api/test/push-notification \
  -H "Content-Type: application/json" \
  -d '{
    "tokens": ["FCM_TOKEN"],
    "payload": {
      "notification": {
        "title": "Test Push",
        "body": "Test push notification"
      }
    }
  }'
```

## Monitoring

The system includes comprehensive logging:
- ✅ Successful deliveries
- ❌ Failed deliveries
- 📬 Notification attempts
- 🔕 Feature toggle status

## Best Practices

1. **Always use the unified handler**: Use `sendNotification()` instead of directly calling Socket.IO or FCM
2. **Set appropriate priorities**: Use 'high' priority only for urgent notifications
3. **Include relevant data**: Always include necessary data for deep linking
4. **Clean up tokens**: Remove FCM tokens on logout to prevent unauthorized notifications
5. **Handle failures gracefully**: The system automatically falls back to storing notifications

## Troubleshooting

### Push notifications not working
1. Check if `ENABLE_PUSH_NOTIFICATIONS=true` in `.env`
2. Verify Firebase service account file path
3. Ensure user has FCM tokens registered
4. Check Firebase project configuration

### Real-time notifications not working
1. Verify Socket.IO connection is established
2. Check if user is in the `userSocketMap`
3. Ensure correct event names are used

### Notifications not being stored
1. Check MongoDB connection
2. Verify User model has `unreadNotifications` field
3. Check for database write errors in logs
