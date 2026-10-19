const jwt = require("jsonwebtoken");

const authMiddleware = (req, res, next) => {
  try {
    const authHeader = req.header("Authorization") || "";
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    const token = match ? match[1] : null;

    if (!token) {
      return res.status(401).json({
        message: "Access Denied",
      });
    }

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({
        message: "Server authentication is not configured",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = decoded;

    return next();
  } catch (error) {
    return res.status(401).json({
      message: "Invalid Token",
    });
  }
};

module.exports = authMiddleware;
