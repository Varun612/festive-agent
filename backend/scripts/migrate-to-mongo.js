require("dotenv").config({ path: "../.env" });
const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");
const BusinessProfile = require("../models/BusinessProfile");
const LearningStore = require("../models/Learning");

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/festive-agent";

async function migrate() {
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(MONGODB_URI);
    console.log("✅ Connected");

    console.log("Seeding Default Business Profile...");
    const existing = await BusinessProfile.findOne({ isDefault: true });
    if (!existing) {
      await BusinessProfile.create({
        businessName: "Kandhari Tent & Caterers",
        tagline: "Making Your Celebrations Memorable",
        industry: "events",
        phoneNumbers: ["9305465848", "9307908994", "7355059566"],
        address: "Lucknow",
        city: "Lucknow",
        services: ["WEDDING", "TENT HOUSE", "EVENT DECORATION", "LAWN BOOKING", "CATERING"],
        branding: { primaryColor: "#d4af37", secondaryColor: "#1a0a2e", fontFamily: "Cinzel" },
        isDefault: true,
      });
      console.log("✅ Seeded default profile");
    } else {
      console.log("ℹ️ Default profile already exists");
    }

    console.log("Migrating Learnings...");
    const jsonPath = path.join(__dirname, "../data/creative_learnings.json");
    if (fs.existsSync(jsonPath)) {
      const jsonData = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
      
      const existingStore = await LearningStore.findOne({ storeKey: "global" });
      if (!existingStore) {
        await LearningStore.create({
          storeKey: "global",
          systemLearnedRules: (jsonData.systemLearnedRules || []).map((r) => ({
            ruleId: r.id,
            rule: r.rule,
            category: r.category,
            addedAt: r.addedAt ? new Date(r.addedAt) : new Date(),
          })),
          interactionHistory: (jsonData.interactionHistory || []).map((h) => ({
            interactionId: h.id,
            timestamp: h.timestamp ? new Date(h.timestamp) : new Date(),
            userPrompt: h.userPrompt,
            festival: h.festival,
            detectedIntent: h.detectedIntent,
            appliedChanges: h.appliedChanges,
          })),
        });
        console.log(`✅ Migrated ${(jsonData.systemLearnedRules || []).length} rules and ${(jsonData.interactionHistory || []).length} interactions`);
      } else {
        console.log("ℹ️ Learnings already migrated");
      }
    } else {
      console.log("ℹ️ No JSON learnings found to migrate");
    }

    console.log("Migration Complete!");
    process.exit(0);
  } catch (err) {
    console.error("❌ Migration failed:", err.message);
    process.exit(1);
  }
}

migrate();
