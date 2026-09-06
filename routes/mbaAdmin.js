const express = require("express");
const bcrypt = require("bcrypt");
const MbaStudent = require("../models/mbaStudent");
const router = express.Router();

// Create a new student account
router.post("/students", async (req, res) => {
  try {
    const { username, fullName, password } = req.body;

    if (!username || !fullName || !password) {
      return res.status(400).json({ error: "username, fullName, and password are all required" });
    }

    const existing = await MbaStudent.findOne({ username });
    if (existing) {
      return res.status(400).json({ error: "That username is already taken" });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const student = await MbaStudent.create({
      username,
      fullName,
      passwordHash,
      status: "active",
    });

    res.status(201).json({
      id: student._id,
      username: student.username,
      fullName: student.fullName,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// List all students
router.get("/students", async (req, res) => {
  try {
    const students = await MbaStudent.find().select("-passwordHash");
    res.status(200).json(students);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
