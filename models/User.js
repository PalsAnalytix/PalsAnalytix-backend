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
    // Question Attempts
    attemptedQuestions: [
      {
        question_id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Question",
          required: true,
        },
        attempted_option: {
          type: String,
          required: true,
        },
        date_of_attempt: {
          type: Date,
          default: Date.now,
        },
        whatsapp_attempt: {
          type: Boolean,
          default: false,
        },
        isCorrect: {
          type: Boolean,
          required: true,
        },
        timeSpent: {
          type: Number, // in seconds
          default: 0
        }
      },
    ],
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
      { "subscriptionHistory.status": 1 },
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

// Add a method to update performance metrics
userSchema.methods.updatePerformanceMetrics = function(questionData) {
  const metrics = this.performanceMetrics;
  metrics.totalQuestionsAttempted++;
  if (questionData.isCorrect) metrics.correctAnswers++;
  
  // Update course-wise progress
  const courseMetrics = metrics.courseWiseProgress[questionData.course];
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

module.exports = mongoose.model("User", userSchema);