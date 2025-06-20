# Talko Backend v1.1

A robust and scalable backend API for real-time chat application built with modern web technologies.

## 📋 Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [API Documentation](#api-documentation)
- [Usage](#usage)
- [Testing](#testing)
- [Deployment](#deployment)
- [Contributing](#contributing)
- [License](#license)
- [Support](#support)

## 🌟 Overview

Talko Backend v1.1 is a comprehensive server-side solution designed to power real-time chat applications. It provides secure authentication, real-time messaging, user management, and file sharing capabilities with a focus on performance, scalability, and developer experience.

## ✨ Features

### Core Features
- **Real-time Messaging**: WebSocket-based instant messaging with Socket.IO
- **User Authentication**: JWT-based secure authentication system
- **User Management**: Complete user profile management and settings
- **Group Chat**: Create and manage group conversations
- **File Sharing**: Upload and share images, documents, and media files
- **Message History**: Persistent message storage and retrieval
- **Online Status**: Real-time user presence indicators
- **Push Notifications**: Cross-platform notification support

### Advanced Features
- **Message Encryption**: End-to-end encryption for secure communication
- **Rate Limiting**: API rate limiting to prevent abuse
- **Email Verification**: Account verification via email
- **Password Recovery**: Secure password reset functionality
- **Admin Panel**: Administrative dashboard for user and content management
- **Message Search**: Full-text search across chat history
- **Typing Indicators**: Real-time typing status updates

## 🛠 Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: MongoDB with Mongoose ODM
- **Real-time Communication**: Socket.IO
- **Authentication**: JWT (JSON Web Tokens)
- **File Storage**: Multer + Cloud Storage (AWS S3/Cloudinary)
- **Email Service**: Nodemailer
- **Validation**: Joi/Express-validator
- **Security**: Helmet, CORS, bcrypt
- **Environment Management**: dotenv
- **Process Management**: PM2 (Production)

## 📋 Prerequisites

Before running this application, make sure you have the following installed:

- Node.js (v14.0.0 or higher)
- npm (v6.0.0 or higher)
- MongoDB (v4.0 or higher)
- Redis (for session management, optional)

## 🚀 Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/MrHussnainAhmad/Talko-Backend-v1.1.git
   cd Talko-Backend-v1.1
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```
   Edit the `.env` file with your configuration (see [Configuration](#configuration) section)

4. **Start MongoDB**
   Make sure MongoDB is running on your system

5. **Run the application**
   ```bash
   # Development mode
   npm run dev
   
   # Production mode
   npm start
   ```

## ⚙️ Configuration

Create a `.env` file in the root directory with the following variables:

```env
# Server Configuration
PORT=5000
NODE_ENV=development

# Database Configuration
MONGODB_URI=mongodb://localhost:27017/talko
REDIS_URL=redis://localhost:6379

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key
JWT_EXPIRE=7d
JWT_REFRESH_SECRET=your-refresh-token-secret
JWT_REFRESH_EXPIRE=30d

# Email Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
FROM_EMAIL=noreply@talko.com
FROM_NAME=Talko Team

# File Upload Configuration
MAX_FILE_SIZE=5242880
UPLOAD_PATH=./uploads
CLOUDINARY_CLOUD_NAME=your-cloudinary-name
CLOUDINARY_API_KEY=your-cloudinary-key
CLOUDINARY_API_SECRET=your-cloudinary-secret

# Security Configuration
BCRYPT_SALT_ROUNDS=12
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# CORS Configuration
CLIENT_URL=http://localhost:3000
```

## 📚 API Documentation

### Authentication Endpoints

| Method | Endpoint | Description | Authentication |
|--------|----------|-------------|----------------|
| POST | `/api/auth/register` | Register new user | No |
| POST | `/api/auth/login` | User login | No |
| POST | `/api/auth/logout` | User logout | Yes |
| POST | `/api/auth/refresh` | Refresh access token | No |
| POST | `/api/auth/forgot-password` | Request password reset | No |
| POST | `/api/auth/reset-password` | Reset password | No |
| GET | `/api/auth/verify-email/:token` | Verify email address | No |

### User Endpoints

| Method | Endpoint | Description | Authentication |
|--------|----------|-------------|----------------|
| GET | `/api/users/profile` | Get user profile | Yes |
| PUT | `/api/users/profile` | Update user profile | Yes |
| POST | `/api/users/upload-avatar` | Upload profile picture | Yes |
| GET | `/api/users/search` | Search users | Yes |
| GET | `/api/users/:id` | Get user by ID | Yes |

### Chat Endpoints

| Method | Endpoint | Description | Authentication |
|--------|----------|-------------|----------------|
| GET | `/api/chats` | Get user's chats | Yes |
| POST | `/api/chats` | Create new chat | Yes |
| GET | `/api/chats/:id` | Get chat details | Yes |
| PUT | `/api/chats/:id` | Update chat | Yes |
| DELETE | `/api/chats/:id` | Delete chat | Yes |
| POST | `/api/chats/:id/join` | Join group chat | Yes |
| POST | `/api/chats/:id/leave` | Leave group chat | Yes |

### Message Endpoints

| Method | Endpoint | Description | Authentication |
|--------|----------|-------------|----------------|
| GET | `/api/messages/:chatId` | Get chat messages | Yes |
| POST | `/api/messages` | Send message | Yes |
| PUT | `/api/messages/:id` | Edit message | Yes |
| DELETE | `/api/messages/:id` | Delete message | Yes |
| POST | `/api/messages/upload` | Upload file | Yes |

### WebSocket Events

| Event | Description | Data |
|-------|-------------|------|
| `connection` | User connects | - |
| `join_room` | Join chat room | `{ chatId }` |
| `leave_room` | Leave chat room | `{ chatId }` |
| `send_message` | Send message | `{ chatId, content, type }` |
| `message_received` | New message | `{ message, chat }` |
| `typing_start` | User starts typing | `{ chatId, userId }` |
| `typing_stop` | User stops typing | `{ chatId, userId }` |
| `user_status` | User online/offline | `{ userId, status }` |

## 🎯 Usage

### Starting the Server

```bash
# Development with auto-reload
npm run dev

# Production
npm start

# With PM2 (recommended for production)
npm run start:prod
```

### Example API Requests

**Register a new user:**
```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "email": "john@example.com",
    "password": "securepassword123"
  }'
```

**Login:**
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "password": "securepassword123"
  }'
```

**Send a message:**
```bash
curl -X POST http://localhost:5000/api/messages \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "chatId": "60f7b3b3b3b3b3b3b3b3b3b3",
    "content": "Hello, World!",
    "type": "text"
  }'
```

## 🧪 Testing

Run the test suite:

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run integration tests
npm run test:integration
```

### Testing with Different Environments

```bash
# Test with development database
npm run test:dev

# Test with staging database
npm run test:staging
```

## 🚀 Deployment

### Docker Deployment

1. **Build the Docker image:**
   ```bash
   docker build -t talko-backend .
   ```

2. **Run with Docker Compose:**
   ```bash
   docker-compose up -d
   ```

### Manual Deployment

1. **Install dependencies:**
   ```bash
   npm ci --only=production
   ```

2. **Set production environment variables**

3. **Start with PM2:**
   ```bash
   pm2 start ecosystem.config.js --env production
   ```

### Deployment Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Configure production database
- [ ] Set up SSL certificates
- [ ] Configure reverse proxy (Nginx)
- [ ] Set up monitoring (PM2, New Relic)
- [ ] Configure logging
- [ ] Set up backup strategy
- [ ] Configure CDN for file uploads

## 📁 Project Structure

```
talko-backend-v1.1/
├── src/
│   ├── config/          # Configuration files
│   ├── controllers/     # Route controllers
│   ├── middleware/      # Custom middleware
│   ├── models/          # Database models
│   ├── routes/          # API routes
│   ├── services/        # Business logic
│   ├── utils/           # Utility functions
│   ├── validators/      # Input validation
│   └── app.js          # Express app setup
├── tests/              # Test files
├── uploads/            # File uploads (development)
├── docs/               # Documentation
├── .env.example        # Environment variables template
├── Dockerfile          # Docker configuration
├── docker-compose.yml  # Docker compose setup
├── ecosystem.config.js # PM2 configuration
└── package.json        # Dependencies and scripts
```

## 🤝 Contributing

We welcome contributions! Please follow these steps:

1. **Fork the repository**
2. **Create a feature branch**
   ```bash
   git checkout -b feature/amazing-feature
   ```
3. **Make your changes**
4. **Add tests for new functionality**
5. **Ensure all tests pass**
   ```bash
   npm test
   ```
6. **Commit your changes**
   ```bash
   git commit -m 'Add amazing feature'
   ```
7. **Push to the branch**
   ```bash
   git push origin feature/amazing-feature
   ```
8. **Open a Pull Request**

### Development Guidelines

- Follow ESLint configuration
- Write tests for new features
- Update documentation
- Use conventional commit messages
- Ensure backward compatibility

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

If you encounter any issues or have questions:

1. **Check the [Issues](https://github.com/MrHussnainAhmad/Talko-Backend-v1.1/issues)** for existing solutions
2. **Create a new issue** with detailed information
3. **Contact the maintainer**: [MrHussnainAhmad](https://github.com/MrHussnainAhmad)

### Getting Help

- 📧 Email: support@talko.com
- 💬 Discord: [Join our community](https://discord.gg/talko)
- 📚 Documentation: [Wiki](https://github.com/MrHussnainAhmad/Talko-Backend-v1.1/wiki)

## 🙏 Acknowledgments

- Socket.IO team for real-time communication
- Express.js community
- MongoDB team
- All contributors and testers

---

**Made with ❤️ by [Hussnain Ahmad](https://github.com/MrHussnainAhmad)**

*Last updated: June 2025*
