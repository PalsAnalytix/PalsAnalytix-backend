const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
    },
    phoneNumber: {
      type: String,
      required: true,
      unique: true,
    },
    password: {
      type: String,
      required: true,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    // Subscription Details
    currentSubscriptionPlan: {
      type: String,
      enum: ["FREE", "BASIC", "PREMIUM", "ENTERPRISE"],
      default: "FREE"
    },
    subscriptionHistory: [{
      planName: {
        type: String,
        required: true,
        enum: ["FREE", "BASIC", "PREMIUM", "ENTERPRISE"]
      },
      dateOfPurchase: {
        type: Date,
        required: true
      },
      expiryDate: {
        type: Date,
        required: true
      },
      amountPaid: {
        type: Number,
        required: true
      },
      paymentId: {
        type: String,
        required: true
      },
      status: {
        type: String,
        enum: ["ACTIVE", "EXPIRED", "CANCELLED"],
        default: "ACTIVE"
      }
    }],
    subscriptionExpiryDate: {
      type: Date,
      default: null
    },
    // WhatsApp Preferences
    currentCourseForWhatsapp: {
      type: String,
      enum: ["CFA", "FRM", "SCR"],
      default: null,
    },
    currentChapterForWhatsapp: {
      type: String,
      default: null,
    },
    whatsappNotificationsEnabled: {
      type: Boolean,
      default: true
    },
    // Updated Question Attempts with embedded Question schema
    questions: [{
      question: {
        _id: { type: mongoose.Schema.Types.ObjectId, ref: 'Question' },
        courses: { type: [String], required: true },
        chapterName: { type: String, required: true },
        questionStatement: { type: String, required: true },
        questionImage: { type: String },
        options: {
          optionA: { type: String, required: true },
          optionAImage: { type: String },
          optionB: { type: String, required: true },
          optionBImage: { type: String },
          optionC: { type: String, required: true },
          optionCImage: { type: String },
          optionD: { type: String, required: true },
          optionDImage: { type: String }
        },
        rightAnswer: { type: String, required: true },
        explanation: { type: String, required: true },
        explanationImage: { type: String },
        difficulty: { type: String, required: true },
        tags: { type: [String], default: [] }
      },
      attempted: {
        type: Boolean,
        default: false
      },
      attemptDetails: {
        attemptedOption: {
          type: String,
          default: null
        },
        isCorrect: {
          type: Boolean,
          default: false
        },
        attemptedAt: {
          type: Date,
          default: null
        },
        timeSpent: {
          type: Number,
          default: 0
        }
      },
      assignedDate: {
        type: Date,
        default: Date.now
      },
      isSampleQuestion: {
        type: Boolean,
        default: false
      }
    }],
    // Performance Metrics
    performanceMetrics: {
      totalQuestionsAttempted: {
        type: Number,
        default: 0
      },
      correctAnswers: {
        type: Number,
        default: 0
      },
      averageTimePerQuestion: {
        type: Number,
        default: 0
      },
      courseWiseProgress: {
        CFA: {
          questionsAttempted: { type: Number, default: 0 },
          correctAnswers: { type: Number, default: 0 }
        },
        FRM: {
          questionsAttempted: { type: Number, default: 0 },
          correctAnswers: { type: Number, default: 0 }
        },
        SCR: {
          questionsAttempted: { type: Number, default: 0 },
          correctAnswers: { type: Number, default: 0 }
        }
      }
    },
    // User Preferences
    preferences: {
      dailyQuestionLimit: {
        type: Number,
        default: 10
      },
      preferredLanguage: {
        type: String,
        enum: ["English", "Hindi"],
        default: "English"
      },
      emailNotifications: {
        type: Boolean,
        default: true
      },
      theme: {
        type: String,
        enum: ["light", "dark"],
        default: "light"
      }
    },
    // Account Status
    accountStatus: {
      type: String,
      enum: ["ACTIVE", "SUSPENDED", "DEACTIVATED"],
      default: "ACTIVE"
    },
    lastLoginDate: {
      type: Date,
      default: null
    },
    loginHistory: [{
      timestamp: {
        type: Date,
        default: Date.now
      },
      ipAddress: String,
      deviceInfo: String
    }]
  },
  { 
    timestamps: true,
    // Add indexes for frequently queried fields
    indexes: [
      { phoneNumber: 1 },
      { email: 1 },
      { currentSubscriptionPlan: 1 },
      { "questions.question._id": 1 },
      { accountStatus: 1 }
    ]
  }
);

// Add a virtual property for subscription status
userSchema.virtual('isSubscriptionActive').get(function() {
  return this.subscriptionExpiryDate && this.subscriptionExpiryDate > new Date();
});

// Add a method to check subscription validity
userSchema.methods.hasValidSubscription = function() {
  return this.subscriptionExpiryDate && this.subscriptionExpiryDate > new Date();
};

// Updated method to update performance metrics
userSchema.methods.updatePerformanceMetrics = function(questionData) {
  const metrics = this.performanceMetrics;
  metrics.totalQuestionsAttempted++;
  if (questionData.isCorrect) metrics.correctAnswers++;
  
  // Update course-wise progress
  // Now getting the course from the question's courses array
  const course = questionData.question.courses[0]; // Taking the first course if multiple exist
  const courseMetrics = metrics.courseWiseProgress[course];
  if (courseMetrics) {
    courseMetrics.questionsAttempted++;
    if (questionData.isCorrect) courseMetrics.correctAnswers++;
  }
  
  // Update average time
  metrics.averageTimePerQuestion = (
    (metrics.averageTimePerQuestion * (metrics.totalQuestionsAttempted - 1) + questionData.timeSpent) / 
    metrics.totalQuestionsAttempted
  );
};

// Updated method to update question attempt
userSchema.methods.updateQuestionAttempt = async function(questionId, attemptData) {
  const questionIndex = this.questions.findIndex(q => 
    q.question._id.toString() === questionId.toString()
  );
  
  if (questionIndex === -1) {
    throw new Error('Question not found in user\'s questions');
  }
  
  this.questions[questionIndex].attempted = true;
  this.questions[questionIndex].attemptDetails = {
    attemptedOption: attemptData.attemptedOption,
    isCorrect: attemptData.isCorrect,
    attemptedAt: new Date(),
    timeSpent: attemptData.timeSpent || 0
  };
  
  // Update performance metrics with the full question data
  this.updatePerformanceMetrics({
    question: this.questions[questionIndex].question,
    isCorrect: attemptData.isCorrect,
    timeSpent: attemptData.timeSpent || 0
  });
  
  return this.save();
};

module.exports = mongoose.model("User", userSchema);