const mongoose = require("mongoose");

const learnedRuleSchema = new mongoose.Schema({
  ruleId: { type: String, required: true },
  rule: { type: String, required: true },
  category: { type: String },
  addedAt: { type: Date, default: Date.now },
});

const interactionSchema = new mongoose.Schema({
  interactionId: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  userPrompt: { type: String },
  festival: { type: String },
  detectedIntent: mongoose.Schema.Types.Mixed,
  appliedChanges: mongoose.Schema.Types.Mixed,
});

const learningStoreSchema = new mongoose.Schema({
  storeKey: { type: String, default: "global", unique: true, index: true },
  systemLearnedRules: [learnedRuleSchema],
  interactionHistory: [interactionSchema],
  updatedAt: { type: Date, default: Date.now },
});

learningStoreSchema.pre("save", function () {
  this.updatedAt = new Date();
});

module.exports = mongoose.model("LearningStore", learningStoreSchema);
