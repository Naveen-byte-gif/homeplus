const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const rateLimit = require("express-rate-limit");
const mongoSanitize = require("express-mongo-sanitize");
const xss = require("xss-clean");
const path = require("path");
const fs = require("fs");
const dotenv = require("dotenv");

// Detect git branch BEFORE loading env file
function detectGitBranch() {
  try {
    const headPath = path.resolve(__dirname, ".git/HEAD");
    const head = fs.readFileSync(headPath, "utf8").trim();
    if (head.startsWith("ref:")) {
      const ref = head.split(" ")[1].trim();
      return ref.split("/").pop();
    }
    return head;
  } catch (e) {
    return process.env.GIT_BRANCH || null;
  }
}

const gitBranch = detectGitBranch();
console.log("🔀 [SERVER] Git branch detected:", gitBranch);

// Set NODE_ENV based on git branch BEFORE loading env file
if (gitBranch && gitBranch.toLowerCase().includes("prod")) {
  process.env.NODE_ENV = "production";
  // console.log("⚠️ [SERVER] NODE_ENV set to 'production' because branch is 'prod'");
}

const envPath =
  process.env.NODE_ENV === "production"
    ? path.resolve(__dirname, ".env.production")
    : path.resolve(__dirname, ".env");

dotenv.config({ path: envPath, override: true });

console.log("Loaded ENV file:", envPath);
console.log("NODE_ENV:", process.env.NODE_ENV);
console.log("Loaded ENV URI:", process.env.MONGODB_URI);

// Import database connection
const connectDB = require("./config/database");

// Initialize Firebase
const {
  initializeFirebase,
  checkFirebaseStatus,
} = require("./config/firebase");
console.log("\n🚀 [SERVER] Starting Firebase initialization...");
initializeFirebase();

// Check Firebase status after a short delay
setTimeout(() => {
  console.log("\n🔍 [SERVER] Checking Firebase connection status...");
  checkFirebaseStatus();
}, 1000);

// Import routes
const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/users");
const complaintRoutes = require("./routes/complaints");
const adminRoutes = require("./routes/admin");
const staffRoutes = require("./routes/staff");
const noticeRoutes = require("./routes/notices");
const visitorRoutes = require("./routes/visitors");
const chatRoutes = require("./routes/chats");
const communicationRoutes = require("./routes/communication");
const uploadRoutes = require("./routes/upload");
const paymentRoutes = require("./routes/payments");
const invoiceRoutes = require("./routes/invoices");
const upiConfigRoutes = require("./routes/upiConfig");

// Import socket service
const { initializeSocket } = require("./services/socketService");

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
app.use("/api/payments", paymentRoutes);
app.use("/api/invoices", invoiceRoutes);
app.use("/api/upi-config", upiConfigRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/staff", staffRoutes);
app.use("/api/notices", noticeRoutes);
app.use("/api/visitors", visitorRoutes);
app.use("/api/chats", chatRoutes);
app.use("/api/communication", communicationRoutes);
app.use("/api/upload", uploadRoutes);

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
const isProd = process.env.NODE_ENV === "production";

const PORT = process.env.PORT || (isProd ? 6501 : 6500);

server.listen(PORT, () => {
  console.log(
    `ApartmentSync Server running in ${process.env.NODE_ENV} mode on port ${PORT}`
  );
  console.log(`📱 API Health: http://localhost:${PORT}/health`);
  console.log(`🔌 Socket.IO: http://localhost:${PORT}`);
});

module.exports = app;
