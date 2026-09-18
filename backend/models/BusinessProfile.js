const mongoose = require("mongoose");

const businessProfileSchema = new mongoose.Schema({
  businessName: { type: String, required: true },
  tagline: { type: String },
  industry: { type: String, default: "events", enum: ["events", "healthcare", "education", "hospitality", "retail", "other"] },
  phoneNumbers: [{ type: String }],
  address: { type: String },
  city: { type: String },
  services: [{ type: String }],
  branding: {
    primaryColor: { type: String, default: "#d4af37" },
    secondaryColor: { type: String, default: "#1a0a2e" },
    fontFamily: { type: String, default: "Cinzel" },
    logoUrl: { type: String },
  },
  venuePhotos: [{ type: String }],
  isDefault: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

businessProfileSchema.pre("save", function () {
  this.updatedAt = new Date();
});

module.exports = mongoose.model("BusinessProfile", businessProfileSchema);
