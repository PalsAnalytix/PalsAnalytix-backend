const mongoose = require("mongoose");
const mbaStudentSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  fullName: { type: String, required: true },
  passwordHash: { type: String, required: true },
  cohort: { type: String }, // optional, for class-wide results later
  status: { type: String, enum: ["active", "disabled"], default: "active" },
  createdBy: { type: String }, // admin email/id
}, { timestamps: true });

module.exports = mongoose.model("MbaStudent", mbaStudentSchema);
