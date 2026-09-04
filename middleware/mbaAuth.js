const jwt = require("jsonwebtoken");
const MBA_JWT_SECRET = process.env.MBA_JWT_SECRET;

function requireMbaStudentAuth(req, res, next) {
  const token = req.cookies?.mba_token || req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Not logged in" });
  try {
    req.mbaStudent = jwt.verify(token, MBA_JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired session" });
  }
}

module.exports = { requireMbaStudentAuth };
