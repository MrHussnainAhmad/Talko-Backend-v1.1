# Firebase Setup Guide for Talkora

## Prerequisites
- Google account
- Node.js installed
- Backend server running

## Step-by-Step Setup

### 1. Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Sign in with your Google account
3. Click "Create a project" or "Add project"
4. Enter project name: `Talkora` (or any name you prefer)
5. Accept terms and click "Continue"
6. Disable Google Analytics (optional) and click "Create project"

### 2. Download Service Account Key

1. In Firebase Console, click the gear icon ⚙️ next to "Project Overview"
2. Select "Project settings"
3. Navigate to "Service accounts" tab
4. Click "Generate new private key"
5. Click "Generate key" in the confirmation popup
6. A JSON file will download - **KEEP THIS FILE SECURE!**

### 3. Configure Backend

1. Move the downloaded JSON file to your backend:
   ```bash
   # Create config directory if it doesn't exist
   mkdir -p /media/jack-the-sparrow/W00RK/Talkora/backend/config
   
   # Move and rename the file (adjust the source path)
   mv ~/Downloads/your-project-firebase-adminsdk-xxxxx-xxxxxxxxxx.json \
      /media/jack-the-sparrow/W00RK/Talkora/backend/config/firebase-service-account.json
   ```

2. Create or update your `.env` file:
   ```bash
   cd /media/jack-the-sparrow/W00RK/Talkora/backend
   
   # Copy the example file if you haven't already
   cp .env.example .env
   ```

3. Edit `.env` and add:
   ```env
   # Enable push notifications
   ENABLE_PUSH_NOTIFICATIONS=true
   
   # Path to your service account file
   FIREBASE_SERVICE_ACCOUNT_PATH=./config/firebase-service-account.json
   
   # Your Firebase project ID (found in Firebase Console > Project Settings)
   FIREBASE_PROJECT_ID=your-project-id
   ```

### 4. Verify Setup

1. Initialize Firebase in your app:
   ```bash
   cd /media/jack-the-sparrow/W00RK/Talkora/backend
   npm run dev
   ```

2. Look for this message in console:
   ```
   ✅ Firebase Admin SDK initialized successfully
   ```

   If you see:
   ```
   🔕 Push notifications are disabled via feature toggle
   ```
   Make sure `ENABLE_PUSH_NOTIFICATIONS=true` in your `.env` file

### 5. Test the Setup

Test the notification system:

```bash
# First, get an auth token by logging in
# Then test sending a notification:

curl -X POST http://localhost:3000/api/notifications/test \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "new_message",
    "title": "Test Notification",
    "body": "If you see this, Firebase is working!",
    "data": {}
  }'
```

## Security Notes

⚠️ **IMPORTANT SECURITY PRACTICES:**

1. **NEVER commit the service account JSON file to Git**
   - It's already in `.gitignore`
   - This file contains sensitive credentials

2. **Keep your Firebase project secure**
   - Don't share project IDs publicly
   - Use Firebase Security Rules when needed

3. **Rotate keys periodically**
   - Generate new service account keys every few months
   - Delete old keys from Firebase Console

## Troubleshooting

### "Failed to read Firebase service account file"
- Check file path in `.env`
- Ensure file exists and is readable
- Verify JSON file is not corrupted

### "Firebase Admin SDK initialization failed"
- Verify the service account JSON is from the correct project
- Check internet connection
- Ensure all required fields are in the JSON file

### Push notifications not working
1. Check browser console for errors
2. Ensure HTTPS is used (required for web push)
3. Verify notification permissions are granted
4. Check if FCM tokens are being saved to database

## Next Steps

After completing setup:
1. Implement client-side Firebase SDK
2. Request notification permissions from users
3. Register FCM tokens with backend
4. Test end-to-end notification flow

## Resources

- [Firebase Cloud Messaging Docs](https://firebase.google.com/docs/cloud-messaging)
- [Firebase Admin SDK Docs](https://firebase.google.com/docs/admin/setup)
- [Web Push Notifications Guide](https://web.dev/notifications/)
