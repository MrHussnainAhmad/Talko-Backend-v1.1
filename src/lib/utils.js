import jwt from "jsonwebtoken";

export const genToken = (userId, res) => {
  const token = jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });

  res.cookie("token", token, {
    maxAge: 7 * 24 * 60 * 60 * 1000,
    httpOnly: true,
    secure: false,
    sameSite: "lax",
    domain: "localhost"
  });

  return token;
};

export const validateObjectId = (id) => {
  return /^[0-9a-fA-F]{24}$/.test(id);
};

export const formatUserResponse = (user) => {
  return {
    _id: user._id,
    id: user._id,
    fullname: user.fullname,
    username: user.username,
    email: user.email,
    profilePic: user.profilePic,
    friends: user.friends || [],
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
};

export const formatFriendRequestResponse = (request) => {
  return {
    _id: request._id,
    senderId: request.senderId,
    receiverId: request.receiverId,
    message: request.message,
    status: request.status,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt
  };
};

export const handleAsyncError = (asyncFn) => {
  return (req, res, next) => {
    Promise.resolve(asyncFn(req, res, next)).catch(next);
  };
};

export const sendResponse = (res, statusCode, data, message = null) => {
  const response = {
    success: statusCode < 400,
    ...(message && { message }),
    ...(data && { data })
  };
  
  return res.status(statusCode).json(response);
};

export const sendError = (res, statusCode, message, error = null) => {
  const response = {
    success: false,
    message,
    ...(process.env.NODE_ENV === 'development' && error && { error: error.message })
  };
  
  return res.status(statusCode).json(response);
};