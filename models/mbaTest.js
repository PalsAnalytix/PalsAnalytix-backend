const mongoose = require("mongoose");
const mbaTestSchema = new mongoose.Schema({
  title: { type: String, required: true },
  type: { type: String, enum: ["assignment", "exam"], required: true },
  totalQuestions: { type: Number, required: true },
  timePerQuestionSeconds: { type: Number, required: true },
  questionFilter: { tags: [String], difficulty: String },
  questionSelectionMode: { type: String, enum: ["fixed", "random"], default: "random" },
  fixedQuestionIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "MbaQuestion" }],
      status: { type: String, enum: ["draft", "published", "archived"], default: "draft" },
    passingScore: { type: Number, default: 50 },
  requiresFileSubmission: { type: Boolean, default: false },
  allowedStudentIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "MbaStudent" }],
  retakesAllowedFor: [{ type: mongoose.Schema.Types.ObjectId, ref: "MbaStudent" }],
  createdBy: { type: String },
}, { timestamps: true });

module.exports = mongoose.model("MbaTest", mbaTestSchema);
