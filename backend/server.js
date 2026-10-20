require("dotenv").config();

const express = require("express");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const path = require("path");

const { connectDB, getConnectionStatus } = require("./db");
const {
  analyzeBrandAndCreateCampaign,
  redesignCampaignWithPrompt,
  loadLearnings,
  loadLearningsAsync,
  FESTIVAL_PROFILES,
} = require("./agent");

const app = express();

// Safe dynamic port resolution — strictly excludes 3000 and 5000
let portConfig = {};
try {
  const cfgPath = path.join(__dirname, "..", "port_config.json");
  if (fs.existsSync(cfgPath)) {
    portConfig = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
  }
} catch (e) {}

let rawPort = parseInt(process.env.PORT || portConfig.backendPort || 5001, 10);
if (rawPort === 5000 || rawPort === 3000) {
  console.warn(`⚠️ Port ${rawPort} is reserved for other projects! Safely redirecting to port 5001.`);
  rawPort = 5001;
}
const PORT = rawPort;

// Enable CORS for decoupled frontend
app.use(cors());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve public static assets (HTML UI, generated images, motif artwork)
app.use(express.static(path.join(__dirname, "public")));
app.use("/assets", express.static(path.join(__dirname, "assets")));
app.use("/generated", express.static(path.join(__dirname, "public", "generated")));

const upload = multer({
  dest: path.join(__dirname, "uploads"),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const handleUpload = (req, res, next) => {
  const contentType = req.headers["content-type"] || "";
  if (!contentType.includes("multipart/form-data")) {
    return next();
  }
  upload.fields([
    { name: "referenceCreative", maxCount: 1 },
    { name: "businessCard", maxCount: 1 },
  ])(req, res, (err) => {
    if (err) {
      console.warn("Multer upload note:", err.message);
      req.files = req.files || {};
      req.body = req.body || {};
      return next();
    }
    next();
  });
};

// Serve frontend main page on root
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Health check endpoint
app.get("/api/health", (req, res) => {
  const dbStatus = getConnectionStatus();
  res.json({
    status: "ok",
    server: "FestiveAgent AI Studio",
    version: "2.1.0",
    port: PORT,
    environment: process.env.NODE_ENV || "development",
    db: dbStatus,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// List festivals
app.get("/api/festivals", (req, res) => {
  try {
    const list = Object.values(FESTIVAL_PROFILES).map((p) => ({
      id: p.id,
      name: p.name,
      defaultHindiTitle: p.defaultHindiTitle,
      defaultEnglishTop: p.defaultEnglishTop,
      variantsCount: p.variants ? p.variants.length : 1,
      variants: p.variants ? p.variants.map((v) => v.variantName) : [],
    }));
    res.json({ success: true, festivals: list });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get learnings (persistent mind)
app.get("/api/learnings", async (req, res) => {
  try {
    const data = await loadLearningsAsync();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Gallery of generated designs
app.get("/api/gallery", (req, res) => {
  try {
    const generatedDir = path.join(__dirname, "public", "generated");
    let items = [];
    if (fs.existsSync(generatedDir)) {
      items = fs
        .readdirSync(generatedDir)
        .filter((f) => f.endsWith(".jpg") || f.endsWith(".png"))
        .map((f) => {
          const stats = fs.statSync(path.join(generatedDir, f));
          return {
            filename: f,
            url: `/generated/${f}`,
            createdAt: stats.mtimeMs,
          };
        })
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 12);
    }
    res.json({ success: true, gallery: items });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Create campaign
app.post(
  "/api/create-campaign",
  handleUpload,
  async (req, res) => {
    try {
      const body = req.body || {};
      const festival = body.festival || "Diwali";
      const variant = body.variant !== undefined ? body.variant : undefined;
      const language = body.language || "auto";
      const bgPattern = body.bgPattern || null;

      const referenceCreative =
        req.files && req.files.referenceCreative
          ? req.files.referenceCreative[0]
          : null;

      const businessCard =
        req.files && req.files.businessCard
          ? req.files.businessCard[0]
          : null;

      console.log("");
      console.log(
        "Festival:", festival,
        "Requested Variant:", variant,
        "Language:", language,
        "Pattern:", bgPattern
      );
      console.log("Creating campaign...");
      console.log("");

      const campaign = await analyzeBrandAndCreateCampaign({
        festival,
        referenceCreative,
        businessCard,
        preferredVariant: variant !== undefined ? variant : null,
        languagePreference: language || "auto",
        bgPattern: bgPattern || null,
      });

      // Save campaign to MongoDB if connected
      try {
        const Campaign = require("./models/Campaign");
        const mongoose = require("mongoose");
        if (mongoose.connection.readyState === 1) {
          const imageFilename = path.basename(campaign.imageUrl || "") || `${festival.toLowerCase().replace(/\s+/g, '-')}-poster.jpg`;
          await Campaign.create({
            festival,
            variantIndex: campaign.variantIndex || 0,
            variantName: campaign.themeName || campaign.variantName || "",
            imageFilename: imageFilename,
            imageUrl: campaign.imageUrl || "",
            language: language || "auto",
            bgPattern: bgPattern || null,
            metadata: {
              headline: campaign.caption || "",
              blessingLine: campaign.blessingLine || "",
              topRightText: campaign.topRightText || "",
            },
          });
          console.log(`💾 Saved campaign '${festival}' to MongoDB!`);
        }
      } catch (e) {
        console.warn("Campaign save to Mongo:", e.message);
      }

      res.json({ success: true, campaign });
    } catch (error) {
      console.error("Agent error:", error);
      res.status(500).json({
        success: false,
        error: error.message || "Something went wrong.",
      });
    }
  }
);

// Redesign chat
app.post("/api/redesign-chat", async (req, res) => {
  try {
    const body = req.body || {};
    const prompt = body.prompt;
    const festival = body.festival || "Diwali";
    const variantIndex = body.variantIndex;
    if (!prompt) {
      return res.status(400).json({
        success: false,
        error: "Prompt is required.",
      });
    }

    console.log(
      `[Chatbot Redesign] Prompt: "${prompt}" | Festival: "${festival}"`
    );
    const result = await redesignCampaignWithPrompt({
      userPrompt: prompt,
      currentFestival: festival,
      currentVariantIndex:
        typeof variantIndex === "number" ? variantIndex : 0,
    });

    res.json({
      success: true,
      reply: result.reply,
      campaign: result.campaign,
      suggestedSections: result.suggestedSections || [],
      learnedRecord: result.learnedRecord,
    });
  } catch (error) {
    console.error("Redesign chat error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Something went wrong during redesign.",
    });
  }
});

// Start Server
async function startServer() {
  // Attempt MongoDB connect (falls back smoothly to file store if local service is unavailable)
  await connectDB();

  // Seed default business profile if MongoDB is connected
  try {
    const mongoose = require("mongoose");
    if (mongoose.connection.readyState === 1) {
      const BusinessProfile = require("./models/BusinessProfile");
      const existing = await BusinessProfile.findOne({ isDefault: true });
      if (!existing) {
        await BusinessProfile.create({
          businessName: "Kandhari Tent & Caterers",
          tagline: "Making Your Celebrations Memorable",
          industry: "events",
          phoneNumbers: ["9305465848", "9307908994", "7355059566"],
          address: "Lucknow",
          city: "Lucknow",
          services: [
            "WEDDING",
            "TENT HOUSE",
            "EVENT DECORATION",
            "LAWN BOOKING",
            "CATERING",
          ],
          branding: {
            primaryColor: "#d4af37",
            secondaryColor: "#1a0a2e",
            fontFamily: "Cinzel",
          },
          isDefault: true,
        });
        console.log("✅ Default business profile seeded in MongoDB");
      }
    }
  } catch (e) {
    console.warn("Seed/migration:", e.message);
  }

  // 404 JSON fallback
  app.use((req, res) => {
    res.status(404).json({ success: false, error: `Endpoint not found: ${req.method} ${req.originalUrl}` });
  });

  // Global JSON error handler
  app.use((err, req, res, next) => {
    console.error("Express error handler:", err);
    res.status(err.status || 500).json({
      success: false,
      error: err.message || "Internal server error occurred.",
    });
  });

  if (require.main === module) {
    app.listen(PORT, () => {
      console.log("");
      console.log(`🚀 FestiveAgent AI Studio running at http://localhost:${PORT}`);
      console.log(`📡 CORS enabled for all origins`);
      console.log("");
    });
  }
}

if (require.main === module) {
  startServer().catch((err) => {
    console.error("Failed to start server:", err);
    process.exit(1);
  });
}

module.exports = app;
module.exports.startServer = startServer;