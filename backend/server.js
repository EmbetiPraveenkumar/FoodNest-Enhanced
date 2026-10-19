const path = require("path");
const fs = require("fs");
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const helmet = require("helmet");
const authMiddleware = require("./middleware/auth");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const foodRoutes = require("./routes/foodRoutes");
const User = require("./models/User");
const app = express(); //express server creating(creates express application object)
const FoodItem = require("./models/Food");

const allowedOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5174",
  process.env.FRONTEND_ORIGIN,
  process.env.RENDER_EXTERNAL_URL,
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      const isLocalDevOrigin =
        !origin ||
        allowedOrigins.includes(origin) ||
        /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);

      if (isLocalDevOrigin) {
        callback(null, true);
        return;
      }

      callback(new Error("Not allowed by CORS"));
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: false,
    optionsSuccessStatus: 204,
  }),
);

app.disable("x-powered-by");
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader(
    "Permissions-Policy",
    "geolocation=(), microphone=(), camera=()",
  );
  next();
});

const isValidEmail = (value) =>
  typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

const isNonEmptyString = (value, minimumLength = 1) =>
  typeof value === "string" && value.trim().length >= minimumLength;

const validateRegistrationInput = ({ fullname, email, password }) => {
  if (!isNonEmptyString(fullname, 2)) {
    return "Full name is required";
  }

  if (!isValidEmail(email)) {
    return "Invalid Email";
  }

  if (!isNonEmptyString(password, 8)) {
    return "Password must be at least 8 characters";
  }

  return null;
};

const validateItemInput = ({ name, category, quantity, expiryDate }) => {
  if (!isNonEmptyString(name, 2)) {
    return "Item name is required";
  }

  if (!isNonEmptyString(category, 2)) {
    return "Category is required";
  }

  const quantityValue = Number(quantity);
  if (!Number.isInteger(quantityValue) || quantityValue < 0) {
    return "Quantity must be a non-negative integer";
  }

  const expiryValue = new Date(expiryDate);
  if (Number.isNaN(expiryValue.getTime())) {
    return "Valid expiry date is required";
  }

  return null;
};

const authAttempts = new Map();
const authRateLimitWindowMs = 60 * 1000;
const authRateLimitMaxRequests = 10;

const authRateLimiter = (req, res, next) => {
  const ip = req.ip || req.headers["x-forwarded-for"] || "unknown";
  const now = Date.now();
  const requestWindow = authAttempts.get(ip) || [];
  const activeRequests = requestWindow.filter(
    (timestamp) => now - timestamp < authRateLimitWindowMs,
  );

  if (activeRequests.length >= authRateLimitMaxRequests) {
    return res.status(429).json({
      message: "Too many requests. Please try again later.",
    });
  }

  activeRequests.push(now);
  authAttempts.set(ip, activeRequests);
  next();
};

app.use(["/api/login", "/api/register"], authRateLimiter);

const isSafeTestMongoUri = (uri) => {
  if (!uri) {
    return false;
  }

  const normalized = uri.trim();

  return (
    /^mongodb:\/\/(127\.0\.0\.1|localhost|\[::1\])(?::\d+)?\//i.test(
      normalized,
    ) && !/mongodb\+srv:\/\//i.test(normalized)
  );
};

const connectDB = async () => {
  if (mongoose.connection.readyState === 1) {
    return;
  }

  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is required");
  }

  if (process.env.NODE_ENV === "test") {
    const normalizedUri = process.env.MONGO_URI.trim();
    const unsafeProductionUri =
      /cluster0|mongodb\+srv:\/\/|mongodb\.net/i.test(normalizedUri) ||
      !isSafeTestMongoUri(normalizedUri);

    if (unsafeProductionUri) {
      throw new Error(
        "Test environment requires an isolated local MongoDB test URI. Refusing to use the production MongoDB configuration.",
      );
    }
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log("MongoDB Connected Successfully");
};

// app.get("/", (req, res) => {
//   res.send("Backend server is running");
// });

app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

app.post("/api/register", async (req, res) => {
  try {
    const { fullname, email, password } = req.body;
    const validationError = validateRegistrationInput({
      fullname,
      email,
      password,
    });

    if (validationError) {
      return res.status(400).json({
        message: validationError,
      });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const existingUser = await User.findOne({ email: normalizedEmail });

    if (existingUser) {
      return res.status(400).json({
        message: "Email already Registered",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({
      fullname: String(fullname).trim(),
      email: normalizedEmail,
      password: hashedPassword,
    });
    await newUser.save();

    return res.status(200).json({
      message: "Registration Successful",
    });
  } catch (error) {
    return res.status(500).json({
      message: "Registration failed",
    });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!isValidEmail(email) || !isNonEmptyString(password, 8)) {
      return res.status(400).json({
        message: isValidEmail(email) ? "Invalid Password" : "Invalid Email",
      });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const existingUser = await User.findOne({ email: normalizedEmail });

    if (!existingUser) {
      return res.status(400).json({
        message: "Invalid Email",
      });
    }

    const isPasswordMatch = await bcrypt.compare(
      password,
      existingUser.password,
    );

    if (!isPasswordMatch) {
      return res.status(400).json({
        message: "Invalid Password",
      });
    }

    const token = jwt.sign(
      {
        id: existingUser._id,
        email: existingUser.email,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "1h",
      },
    );

    return res.status(200).json({
      message: "Login Successful",
      token,
      user: {
        id: existingUser._id,
        fullname: existingUser.fullname,
        email: existingUser.email,
      },
    });
  } catch (error) {
    return res.status(500).json({
      message: "Login Failed",
    });
  }
});

app.put("/api/change-password", authMiddleware, async (req, res) => {
  try {
    const { newPassword } = req.body;

    if (!isNonEmptyString(newPassword, 8)) {
      return res.status(400).json({
        message: "Password must be at least 8 characters",
      });
    }

    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    user.password = hashedPassword;

    await user.save();

    return res.status(200).json({
      message: "Password Changed Successfully",
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to Change Password",
    });
  }
});

app.use("/api/items", authMiddleware);

app.post("/api/items", async (req, res) => {
  try {
    const { userId, ...itemData } = req.body;
    const itemValidationError = validateItemInput(itemData);

    if (itemValidationError) {
      return res.status(400).json({
        message: itemValidationError,
      });
    }

    const item = new FoodItem({
      ...itemData,
      userId: req.user.id,
      quantity: Number(itemData.quantity),
      status: itemData.status || "In Stock",
    });

    await item.save();

    return res.status(201).json({
      message: "Item Added Successfully",
      item,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to Add Item",
    });
  }
});

app.get("/api/items", async (req, res) => {
  try {
    const items = await FoodItem.find({ userId: req.user.id });

    return res.status(200).json(items);
  } catch (error) {
    return res.status(500).json({
      message: "Failed to Fetch Items",
    });
  }
});

app.put("/api/items/:id", async (req, res) => {
  try {
    const { userId, ...allowedUpdate } = req.body;

    if (allowedUpdate.quantity !== undefined) {
      const quantityValue = Number(allowedUpdate.quantity);
      if (!Number.isInteger(quantityValue) || quantityValue < 0) {
        return res.status(400).json({
          message: "Quantity must be a non-negative integer",
        });
      }
      allowedUpdate.quantity = quantityValue;
    }

    if (
      allowedUpdate.status !== undefined &&
      !isNonEmptyString(allowedUpdate.status, 1)
    ) {
      return res.status(400).json({
        message: "Status cannot be empty",
      });
    }

    const updatedItem = await FoodItem.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      allowedUpdate,
      { new: true },
    );

    if (!updatedItem) {
      return res.status(404).json({
        message: "Item not found or access denied",
      });
    }

    return res.status(200).json({
      message: "Item Updated Successfully",
      updatedItem,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to Update Item",
    });
  }
});

app.delete("/api/items/:id", async (req, res) => {
  try {
    const deletedItem = await FoodItem.findOneAndDelete({
      _id: req.params.id,
      userId: req.user.id,
    });

    if (!deletedItem) {
      return res.status(404).json({
        message: "Item not found or access denied",
      });
    }

    return res.status(200).json({
      message: "Item Deleted Successfully",
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to Delete Item",
    });
  }
});
app.get("/api/profile", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    return res.status(200).json(user);
  } catch (error) {
    return res.status(500).json({
      message: "Failed to Fetch Profile",
    });
  }
});

app.put("/api/update-profile", authMiddleware, async (req, res) => {
  try {
    const { fullname } = req.body;

    if (!isNonEmptyString(fullname, 2)) {
      return res.status(400).json({
        message: "Full name is required",
      });
    }

    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    user.fullname = String(fullname).trim();

    await user.save();

    return res.status(200).json({
      message: "Profile Updated Successfully",
      user,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to Update Profile",
    });
  }
});

// Serve the built React frontend from frontend/dist.
// Serve the built React frontend
const frontendDistPath = path.resolve(
  __dirname,
  "../frontend/dist"
);

console.log("Frontend build path:", frontendDistPath);
console.log(
  "Frontend index.html exists:",
  fs.existsSync(path.join(frontendDistPath, "index.html"))
);

app.use(express.static(frontendDistPath));

// React SPA fallback; keep this after API routes
app.use((req, res, next) => {
  const isApiRequest =
    req.path === "/api" || req.path.startsWith("/api/");

  if (req.method !== "GET" || isApiRequest) {
    return next();
  }

  res.sendFile(
    path.join(frontendDistPath, "index.html"),
    (error) => {
      if (error) next(error);
    }
  );
});

// Return JSON 404 for unmatched routes.
app.use((req, res) => {
  res.status(404).json({
    message: "Route not found",
  });
});

app.use((error, req, res, next) => {
  console.error("Unhandled application error:", error);

  if (res.headersSent) {
    return next(error);
  }

  return res.status(500).json({
    message: "Internal server error",
  });
});

const startServer = async () => {
  if (!process.env.JWT_SECRET && process.env.NODE_ENV !== "test") {
    throw new Error("JWT_SECRET is required in production environments");
  }

  await connectDB();

  app.listen(process.env.PORT || 3000, () => {
    console.log(`Server running on port ${process.env.PORT || 3000}`);
  });
};

if (require.main === module) {
  startServer().catch((error) => {
    console.error("Server startup failed", error.message);
    process.exit(1);
  });
}

module.exports = { app, connectDB, startServer };
