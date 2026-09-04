const express = require("express");
const bcrypt = require("bcrypt");
const MbaStudent = require("../models/mbaStudent");
const router = express.Router();

router.get("/create-test-student", async (req, res) => {
  const existing = await MbaStudent.findOne({ username: "teststudent" });
  if (existing) return res.send("Test student already exists — you're good to go.");

  const passwordHash = await bcrypt.hash("Test1234", 10);
  await MbaStudent.create({
    username: "teststudent",
    fullName: "Test Student",
    passwordHash,
    status: "active",
  });
  res.send("Test student created! Username: teststudent / Password: Test1234");
});

module.exports = router;
