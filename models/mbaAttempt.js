const mongoose = require("mongoose");
const mbaAttemptSchema = new mongoose.Schema({
  testId: { type: mongoose.Schema.Types.ObjectId, ref: "MbaTest", required: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: "MbaStudent", required: true },
  attemptNumber: { type: Number, default: 1 },
  status: { type: String, enum: ["in_progress", "submitted", "abandoned"], default: "in_progress" },
  timeRemainingSec: { type: Number, required: true }, // pooled timer, decremented server-side
  questionsServed: [{
    questionId: { type: mongoose.Schema.Types.ObjectId, ref: "MbaQuestion" },
    order: Number,
    answerGiven: Number,      // index chosen, null if unanswered
    markedForReview: { type: Boolean, default: false },
    visited: { type: Boolean, default: false },
  }],
  score: Number,
  totalCorrect: Number,
  autoSubmitted: { type: Boolean, default: false },
  startedAt: Date,
  submittedAt: Date,
}, { timestamps: true });

module.exports = mongoose.model("MbaAttempt", mbaAttemptSchema);
