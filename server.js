const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const rateLimit = require("express-rate-limit");
const mongoSanitize = require("express-mongo-sanitize");
const xss = require("xss-clean");
const dotenv = require("dotenv");

// Load env vars
dotenv.config();
console.log("Loaded ENV URI:", process.env.MONGODB_URI);

// Import database connection
const connectDB = require("./config/database");

// Initialize Firebase
const { initializeFirebase } = require("./config/firebase");
initializeFirebase();

// Import routes
const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/users");
const complaintRoutes = require("./routes/complaints");
const adminRoutes = require("./routes/admin");
const staffRoutes = require("./routes/staff");
const noticeRoutes = require("./routes/notices");
const chatRoutes = require("./routes/chats");

// Import socket service
const { initializeSocket } = require("./services/socketService");

// Initialize express app
const app = express();
const server = http.createServer(app);

// Initialize Socket.io
const io = socketIo(server, {
  cors: {
    origin: process.env.SOCKET_CORS_ORIGIN || "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// Initialize socket service
initializeSocket(io);

// Connect to database
connectDB();

// Security middleware
app.use(helmet());
app.use(mongoSanitize());
app.use(xss());

// CORS configuration (needs to be early for preflight requests)
app.use(
  cors({
    origin: process.env.SOCKET_CORS_ORIGIN || "http://localhost:3000",
    credentials: true,
  })
);

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: "Too many requests from this IP, please try again later.",
});
app.use(limiter);

// Body parsing middleware (must be before request logging)
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Request logging middleware (after body parsing so we can log body)
app.use((req, res, next) => {
  console.log(
    `\n🌐 [SERVER] ${new Date().toISOString()} - ${req.method} ${
      req.originalUrl
    }`
  );
  console.log(`🌐 [SERVER] IP: ${req.ip || req.connection.remoteAddress}`);
  console.log(`🌐 [SERVER] Headers:`, JSON.stringify(req.headers, null, 2));
  if (req.body && Object.keys(req.body).length > 0) {
    const bodyCopy = { ...req.body };
    if (bodyCopy.password) bodyCopy.password = "***";
    if (bodyCopy.otp) bodyCopy.otp = "***";
    if (bodyCopy.userData && bodyCopy.userData.password)
      bodyCopy.userData.password = "***";
    console.log(`🌐 [SERVER] Body:`, JSON.stringify(bodyCopy, null, 2));
  }

  // Log response
  const originalSend = res.send;
  res.send = function (data) {
    console.log(`📤 [SERVER] Response Status: ${res.statusCode}`);
    try {
      const responseData = typeof data === "string" ? JSON.parse(data) : data;
      const responseCopy = { ...responseData };
      if (responseCopy.data?.token) responseCopy.data.token = "***TOKEN***";
      console.log(
        `📤 [SERVER] Response Body:`,
        JSON.stringify(responseCopy, null, 2)
      );
    } catch (e) {
      console.log(`📤 [SERVER] Response Body: ${data}`);
    }
    return originalSend.call(this, data);
  };

  next();
});

// Compression middleware
app.use(compression());

// Health check route
app.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "ApartmentSync API is running",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
  });
});

// API routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/complaints", complaintRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/staff", staffRoutes);
app.use("/api/notices", noticeRoutes);
app.use("/api/chats", chatRoutes);

// 404 handler
app.use("*", (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`,
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error("\n❌ [SERVER] Global error handler triggered");
  console.error("❌ [SERVER] Error:", err);
  console.error("❌ [SERVER] Error name:", err.name);
  console.error("❌ [SERVER] Error message:", err.message);
  console.error("❌ [SERVER] Error stack:", err.stack);
  console.error("❌ [SERVER] Request URL:", req.originalUrl);
  console.error("❌ [SERVER] Request method:", req.method);

  let error = { ...err };
  error.message = err.message;

  // Mongoose bad ObjectId
  if (err.name === "CastError") {
    const message = "Resource not found";
    error = { message, statusCode: 404 };
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    const message = "Duplicate field value entered";
    error = { message, statusCode: 400 };
  }

  // Mongoose validation error
  if (err.name === "ValidationError") {
    const message = Object.values(err.errors)
      .map((val) => val.message)
      .join(", ");
    error = { message, statusCode: 400 };
  }

  res.status(error.statusCode || 500).json({
    success: false,
    message: error.message || "Server Error",
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down gracefully");
  server.close(() => {
    console.log("Process terminated");
  });
});

// Start server
const PORT = process.env.PORT || 6500;

server.listen(PORT, () => {
  console.log(
    `🚀 ApartmentSync Server running in ${process.env.NODE_ENV} mode on port ${PORT}`
  );
  console.log(`📱 API Health: http://localhost:${PORT}/health`);
  console.log(`🔌 Socket.IO: http://localhost:${PORT}`);
});

module.exports = app;
