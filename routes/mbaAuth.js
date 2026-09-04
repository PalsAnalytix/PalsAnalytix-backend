const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const MbaStudent = require("../models/mbaStudent");
const router = express.Router();

router.post("/login", async (req, res) => {
  const { username, password } = req.body;
  const student = await MbaStudent.findOne({ username, status: "active" });
  if (!student) return res.status(401).json({ error: "Invalid credentials" });

  const valid = await bcrypt.compare(password, student.passwordHash);
  if (!valid) return res.status(401).json({ error: "Invalid credentials" });

  const token = jwt.sign(
    { id: student._id, username: student.username, fullName: student.fullName },
    process.env.MBA_JWT_SECRET,
    { expiresIn: "8h" }
  );
  res.cookie("mba_token", token, { httpOnly: true, secure: true, sameSite: "lax" });
  res.json({ id: student._id, fullName: student.fullName, username: student.username });
});

module.exports = router;
