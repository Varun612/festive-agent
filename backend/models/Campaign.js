const mongoose = require("mongoose");

const campaignSchema = new mongoose.Schema({
  festival: { type: String, required: true, index: true },
  variantIndex: { type: Number, default: 0 },
  variantName: { type: String },
  imageFilename: { type: String, required: true },
  imageUrl: { type: String },
  language: { type: String, default: "auto" },
  bgPattern: { type: String },
  metadata: {
    headline: String,
    blessingLine: String,
    topRightText: String,
    colorPalette: mongoose.Schema.Types.Mixed,
    dimensions: { width: Number, height: Number },
  },
  businessProfileId: { type: mongoose.Schema.Types.ObjectId, ref: "BusinessProfile" },
  createdAt: { type: Date, default: Date.now, index: true },
});

campaignSchema.index({ festival: 1, createdAt: -1 });

module.exports = mongoose.model("Campaign", campaignSchema);
