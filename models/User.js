const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  auth0ID: { type: String, required: true, unique: true },
  // Changed to match your route handler checking git hub
  picture : {type: String},
  phoneNo: { type: String,  unique: true },
  attemptedQuestions: {type : Array},
  attemptedTests: {type : Array},
  subscriptionId: { type: String },
  purchaseDate: { type: Date },
  expiryDate: { type: Date },
  paymentId: { type: String },
  amountPaid: { type: Number },
  currentChapterForWhatsapp : {type : String},
  currentCourseForWhatsapp : {type : String},
});

const User = mongoose.model('User', userSchema);

module.exports = User;
