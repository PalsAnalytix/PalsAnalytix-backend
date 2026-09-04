const mongoose = require("mongoose");
const mbaTestSchema = new mongoose.Schema({
  title: { type: String, required: true },
  type: { type: String, enum: ["assignment", "exam"], required: true },
  totalQuestions: { type: Number, required: true },
  timePerQuestionSeconds: { type: Number, required: true }, // used to compute pooled time
  questionFilter: { tags: [String], difficulty: String },
  status: { type: String, enum: ["draft", "published"], default: "draft" },
  allowedStudentIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "MbaStudent" }],
  retakesAllowedFor: [{ type: mongoose.Schema.Types.ObjectId, ref: "MbaStudent" }],
  createdBy: { type: String },
}, { timestamps: true });

module.exports = mongoose.model("MbaTest", mbaTestSchema);
