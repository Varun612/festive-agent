const OpenAI = require("openai");
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const mongoose = require("mongoose");

const groq = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

/**
 * Resizes an image file to max 512x512 and encodes as JPEG data URL for optimal AI Vision ingestion.
 */
async function imageToOptimizedDataUrl(filePath) {
  try {
    const optimizedBuffer = await sharp(filePath)
      .resize(512, 512, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
    return `data:image/jpeg;base64,${optimizedBuffer.toString("base64")}`;
  } catch (err) {
    console.warn("Image optimization fallback:", err.message);
    const rawBuffer = fs.readFileSync(filePath);
    return `data:image/jpeg;base64,${rawBuffer.toString("base64")}`;
  }
}

/**
 * 11 Comprehensive Festival Profiles.
 * Each profile contains MULTIPLE distinct design variants (color harmonies, typography accents, badge styling)
 * ensuring that every click / API call yields a fresh, unique visual option ("acts like ChatGPT every time").
 */

const memoryFilePath = path.join(__dirname, "data", "creative_learnings.json");

// MongoDB model (lazy-loaded to avoid circular require issues)
let LearningStoreModel = null;
function getLearningModel() {
  if (!LearningStoreModel) {
    try {
      LearningStoreModel = require("./models/Learning");
    } catch (e) { /* fallback to file */ }
  }
  return LearningStoreModel;
}

function isMongoConnected() {
  return mongoose.connection && mongoose.connection.readyState === 1;
}

/**
 * Load learnings from MongoDB first, then file fallback.
 */
function loadLearnings() {
  // Synchronous — for now read from file; MongoDB async ops happen in recordLearning
  try {
    if (fs.existsSync(memoryFilePath)) {
      return JSON.parse(fs.readFileSync(memoryFilePath, "utf8"));
    }
  } catch (e) {
    console.warn("Failed to load learnings:", e.message);
  }
  return { systemLearnedRules: [], interactionHistory: [] };
}

/**
 * Async version that tries MongoDB first, then falls back to file.
 */
async function loadLearningsAsync() {
  if (isMongoConnected()) {
    try {
      const Model = getLearningModel();
      if (Model) {
        let doc = await Model.findOne({ storeKey: "global" }).lean();
        if (doc) {
          return {
            systemLearnedRules: (doc.systemLearnedRules || []).map(r => ({
              id: r.ruleId,
              rule: r.rule,
              category: r.category,
              addedAt: r.addedAt,
            })),
            interactionHistory: (doc.interactionHistory || []).map(h => ({
              id: h.interactionId,
              timestamp: h.timestamp,
              userPrompt: h.userPrompt,
              festival: h.festival,
              detectedIntent: h.detectedIntent,
              appliedChanges: h.appliedChanges,
            })),
          };
        }
      }
    } catch (e) {
      console.warn("MongoDB loadLearnings fallback:", e.message);
    }
  }
  return loadLearnings();
}

/**
 * Save learnings to BOTH file and MongoDB for durability.
 */
async function saveLearningsToMongo(store) {
  if (!isMongoConnected()) return;
  try {
    const Model = getLearningModel();
    if (!Model) return;
    await Model.findOneAndUpdate(
      { storeKey: "global" },
      {
        storeKey: "global",
        systemLearnedRules: (store.systemLearnedRules || []).map(r => ({
          ruleId: r.id,
          rule: r.rule,
          category: r.category,
          addedAt: r.addedAt ? new Date(r.addedAt) : new Date(),
        })),
        interactionHistory: (store.interactionHistory || []).slice(0, 50).map(h => ({
          interactionId: h.id,
          timestamp: h.timestamp ? new Date(h.timestamp) : new Date(),
          userPrompt: h.userPrompt,
          festival: h.festival,
          detectedIntent: h.detectedIntent,
          appliedChanges: h.appliedChanges,
        })),
        updatedAt: new Date(),
      },
      { upsert: true, new: true }
    );
  } catch (e) {
    console.warn("MongoDB saveLearnings error:", e.message);
  }
}

function synthesizeLearnedRules(store, userPrompt, detectedIntent) {
  if (!Array.isArray(store.systemLearnedRules)) store.systemLearnedRules = [];

  const lower = String(userPrompt || "").toLowerCase();
  
  // Rule: Golden brand prominence
  if (/kandhari.*gold|gold.*kandhari|brand.*gold/i.test(lower)) {
    if (!store.systemLearnedRules.some(r => r.id === "rule_kandhari_gold")) {
      store.systemLearnedRules.push({
        id: "rule_kandhari_gold",
        rule: "Prominently display Kandhari Tent & Caterers in royal metallic gold foil for maximum brand recognition and prestige.",
        category: "branding",
        addedAt: new Date().toISOString()
      });
    }
  }

  // Rule: Golden contact numbers
  if (/(?:phone|mobile|number|contact).*gold/i.test(lower)) {
    if (!store.systemLearnedRules.some(r => r.id === "rule_phone_gold")) {
      store.systemLearnedRules.push({
        id: "rule_phone_gold",
        rule: "Highlight verified booking mobile numbers in crisp golden yellow font for high contrast and elegance on dark footers.",
        category: "contact_info",
        addedAt: new Date().toISOString()
      });
    }
  }

  // Rule: Dwarka Shri Lawn lettering
  if (/dwarka.*gold/i.test(lower)) {
    if (!store.systemLearnedRules.some(r => r.id === "rule_dwarka_gold")) {
      store.systemLearnedRules.push({
        id: "rule_dwarka_gold",
        rule: "Display Dwarka Shri Lawn shield header in gleaming gold lettering.",
        category: "branding",
        addedAt: new Date().toISOString()
      });
    }
  }

  // Rule: Festival-specific English requests
  if (/english/i.test(lower) && detectedIntent && detectedIntent.festival) {
    const festId = `rule_english_${detectedIntent.festival.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
    if (!store.systemLearnedRules.some(r => r.id === festId)) {
      store.systemLearnedRules.push({
        id: festId,
        rule: `When designing for ${detectedIntent.festival} or international festivities, render primary festive headlines and greetings in English.`,
        category: "language",
        addedAt: new Date().toISOString()
      });
    }
  }
}

function recordLearning({ userPrompt, detectedIntent, appliedChanges, festival }) {
  try {
    const store = loadLearnings();
    const newRecord = {
      id: "learn_" + Date.now(),
      timestamp: new Date().toISOString(),
      userPrompt,
      festival,
      detectedIntent,
      appliedChanges,
    };
    if (!Array.isArray(store.interactionHistory)) {
      store.interactionHistory = [];
    }
    store.interactionHistory.unshift(newRecord);
    if (store.interactionHistory.length > 50) {
      store.interactionHistory = store.interactionHistory.slice(0, 50);
    }
    synthesizeLearnedRules(store, userPrompt, detectedIntent);
    fs.writeFileSync(memoryFilePath, JSON.stringify(store, null, 2), "utf8");
    // Also persist to MongoDB (fire-and-forget)
    saveLearningsToMongo(store).catch(e => console.warn("MongoDB sync:", e.message));
    console.log(`[Agent Memory] Saved learning & synthesized rules from prompt: "${userPrompt.slice(0, 45)}..."`);
    return newRecord;
  } catch (e) {
    console.warn("Failed to record learning:", e.message);
  }
}

function getLearnedContextPrompt() {
  const store = loadLearnings();
  const rulesText = (store.systemLearnedRules || [])
    .map((r, i) => `${i + 1}. [${r.category.toUpperCase()}] ${r.rule}`)
    .join("\n");
  const recentPreferences = (store.interactionHistory || [])
    .slice(0, 5)
    .map(h => `- When asked "${h.userPrompt}", applied language: ${h.detectedIntent.language || "auto"}, pattern: ${h.detectedIntent.bgPattern || "default"}.`)
    .join("\n");

  return `
CRITICAL LEARNED AGENT RULES & HISTORICAL USER PREFERENCES:
${rulesText}

RECENT USER PREFERENCES:
${recentPreferences || "No recent overrides."}
`;
}

/**
 * Luxury Printed Pattern Generator (SVG Defs & Overlay)
 * Fills negative/empty space with subtle, royal printed wallpaper/fabric texture (6-10% opacity).
 */

/**
 * Resolves a custom background color or gradient from user input into a rich 3-stop gradient.
 */
function resolveBgGradient(customBg, defaultBgGrad) {
  if (Array.isArray(customBg) && customBg.length >= 2) return customBg;
  if (!customBg) return defaultBgGrad;
  const s = String(customBg).toLowerCase().trim();
  if (s.includes("lilac") || s.includes("pink")) {
    return ["#3b0834", "#661356", "#260320"];
  }
  if (s.includes("purple") || s.includes("violet") || s.includes("lavender")) {
    return ["#24072b", "#460f54", "#18041c"];
  }
  if (s.includes("blue") || s.includes("navy") || s.includes("sapphire")) {
    return ["#051226", "#0b2347", "#030c1a"];
  }
  if (s.includes("cyan") || s.includes("teal") || s.includes("aqua")) {
    return ["#031c24", "#073747", "#021117"];
  }
  if (s.includes("green") || s.includes("emerald")) {
    return ["#022415", "#06472b", "#01170d"];
  }
  if (s.includes("maroon") || s.includes("ruby") || s.includes("wine") || s.includes("crimson")) {
    return ["#38050e", "#5e0b19", "#210207"];
  }
  if (s.includes("saffron") || s.includes("orange")) {
    return ["#3d1303", "#692207", "#240b02"];
  }
  if (s.includes("gold") || s.includes("golden") || s.includes("yellow")) {
    return ["#2b1c03", "#4d3507", "#1c1202"];
  }
  if (s.includes("black") || s.includes("dark") || s.includes("charcoal")) {
    return ["#09090d", "#14141d", "#040407"];
  }
  if (s.includes("white") || s.includes("ivory") || s.includes("cream")) {
    return ["#fffdf5", "#fef6e4", "#faebd7"];
  }
  if (s.startsWith("#")) {
    return [s, s, s];
  }
  return defaultBgGrad;
}

/**
 * Authentic Multi-Color Festival Water Splashes & Liquid Droplets SVG Layer
 * Generates vivid, joyful watercolor bursts, fluid curved arcs, and gulal droplets.
 */
function getWaterSplashesSvg(width, height) {
  return `
    <!-- Vibrant Festival Water & Gulal Splashes Layer -->
    <!-- Soft Ambient Organic Color Halos in Background -->
    <g opacity="0.4" filter="url(#splashBlur)">
      <circle cx="150" cy="260" r="140" fill="#06b6d4" />
      <circle cx="940" cy="270" r="150" fill="#d946ef" />
      <circle cx="160" cy="620" r="130" fill="#facc15" />
      <circle cx="920" cy="650" r="140" fill="#f43f5e" />
      <circle cx="540" cy="180" r="120" fill="#8b5cf6" />
      <circle cx="340" cy="740" r="110" fill="#10b981" />
      <circle cx="760" cy="740" r="120" fill="#ea580c" />
    </g>

    <!-- Dynamic Curved Liquid Splash Arcs & Spray Droplets -->
    <!-- Top-Left Cyan & Yellow Splash -->
    <g transform="translate(50, 180)" fill="#06b6d4" opacity="0.85">
      <path d="M 0 0 C 40 -30 80 -10 100 20 C 70 40 30 20 0 0 Z" />
      <circle cx="120" cy="35" r="10" />
      <circle cx="145" cy="20" r="5.5" />
      <circle cx="95" cy="-20" r="7" fill="#facc15" />
      <circle cx="130" cy="-40" r="4.5" fill="#facc15" />
      <circle cx="70" cy="55" r="6" fill="#f43f5e" />
    </g>

    <!-- Top-Right Magenta & Rose Splash -->
    <g transform="translate(920, 170)" fill="#d946ef" opacity="0.85">
      <path d="M 50 0 C 10 -30 -30 -10 -50 20 C -20 40 20 20 50 0 Z" />
      <circle cx="-70" cy="35" r="9" fill="#f43f5e" />
      <circle cx="-95" cy="20" r="5" fill="#f43f5e" />
      <circle cx="-55" cy="-20" r="7" fill="#facc15" />
      <circle cx="-80" cy="-35" r="4.5" />
      <circle cx="-30" cy="60" r="6.5" fill="#06b6d4" />
    </g>

    <!-- Mid-Left Saffron & Emerald Splash Droplets around blessing -->
    <g transform="translate(70, 480)" fill="#ea580c" opacity="0.85">
      <path d="M 0 0 C 30 -20 60 -5 70 15 C 50 30 20 15 0 0 Z" />
      <circle cx="85" cy="25" r="8.5" fill="#10b981" />
      <circle cx="108" cy="15" r="5" fill="#10b981" />
      <circle cx="65" cy="-25" r="6.5" fill="#facc15" />
      <circle cx="115" cy="-15" r="5" fill="#d946ef" />
    </g>

    <!-- Mid-Right Electric Violet & Cyan Splash Droplets -->
    <g transform="translate(950, 520)" fill="#8b5cf6" opacity="0.85">
      <path d="M 30 0 C 0 -25 -40 -10 -55 15 C -30 30 0 15 30 0 Z" />
      <circle cx="-75" cy="30" r="9.5" fill="#06b6d4" />
      <circle cx="-98" cy="15" r="5" fill="#06b6d4" />
      <circle cx="-60" cy="-25" r="7" fill="#f43f5e" />
      <circle cx="-100" cy="-20" r="4.5" fill="#facc15" />
      <circle cx="-40" cy="50" r="6" fill="#10b981" />
    </g>

    <!-- Lower Festive Ribbon Area Gulal Splatters -->
    <g transform="translate(540, 770)" opacity="0.8">
      <circle cx="-280" cy="-15" r="8" fill="#d946ef" />
      <circle cx="-255" cy="-30" r="5" fill="#06b6d4" />
      <circle cx="-305" cy="5" r="6" fill="#10b981" />
      <circle cx="280" cy="-15" r="8" fill="#f43f5e" />
      <circle cx="255" cy="-30" r="5" fill="#facc15" />
      <circle cx="305" cy="5" r="6" fill="#06b6d4" />
    </g>
  `;
}

function getPatternSvg(patternType, strokeColor = "#facc15") {
  if (patternType === "color_splashes" || patternType === "water_splashes") {
    return `
      <pattern id="bgPattern" width="120" height="120" patternUnits="userSpaceOnUse">
        <circle cx="20" cy="20" r="3.5" fill="#06b6d4" opacity="0.6" />
        <circle cx="45" cy="15" r="2" fill="#facc15" opacity="0.7" />
        <circle cx="85" cy="30" r="4" fill="#d946ef" opacity="0.6" />
        <circle cx="105" cy="18" r="2.5" fill="#f43f5e" opacity="0.7" />
        <circle cx="30" cy="75" r="3" fill="#10b981" opacity="0.6" />
        <circle cx="65" cy="85" r="4.5" fill="#ea580c" opacity="0.6" />
        <circle cx="95" cy="65" r="2" fill="#8b5cf6" opacity="0.7" />
        <circle cx="15" cy="105" r="2.5" fill="#facc15" opacity="0.6" />
        <circle cx="110" cy="110" r="3" fill="#06b6d4" opacity="0.6" />
      </pattern>
    `;
  }

  if (patternType === "winter_stars") {
    return `
      <pattern id="bgPattern" width="90" height="90" patternUnits="userSpaceOnUse">
        <g transform="translate(45, 45)" stroke="${strokeColor}" stroke-width="0.75" fill="none">
          <line x1="-14" y1="0" x2="14" y2="0" />
          <line x1="0" y1="-14" x2="0" y2="14" />
          <line x1="-9" y1="-9" x2="9" y2="9" />
          <line x1="-9" y1="9" x2="9" y2="-9" />
          <circle cx="0" cy="0" r="1.5" fill="${strokeColor}" />
        </g>
        <path d="M 0 4 Q 0 0 4 0 Q 0 0 0 -4 Q 0 0 -4 0 Q 0 0 0 4 Z" fill="${strokeColor}" opacity="0.8" />
        <path d="M 90 4 Q 90 0 94 0 Q 90 0 90 -4 Q 90 0 86 0 Q 90 0 90 4 Z" fill="${strokeColor}" opacity="0.8" />
        <path d="M 0 94 Q 0 90 4 90 Q 0 90 0 86 Q 0 90 -4 90 Q 0 90 0 94 Z" fill="${strokeColor}" opacity="0.8" />
        <path d="M 90 94 Q 90 90 94 90 Q 90 90 90 86 Q 90 90 86 90 Q 90 90 90 94 Z" fill="${strokeColor}" opacity="0.8" />
        <circle cx="20" cy="20" r="1.2" fill="${strokeColor}" opacity="0.7" />
        <circle cx="70" cy="25" r="0.9" fill="${strokeColor}" opacity="0.6" />
        <circle cx="25" cy="70" r="1" fill="${strokeColor}" opacity="0.6" />
        <circle cx="72" cy="75" r="1.3" fill="${strokeColor}" opacity="0.8" />
      </pattern>
    `;
  }
  if (patternType === "royal_jaali") {
    return `
      <pattern id="bgPattern" width="60" height="60" patternUnits="userSpaceOnUse">
        <g fill="none" stroke="${strokeColor}" stroke-width="0.7">
          <polygon points="30,0 60,30 30,60 0,30" />
          <polygon points="30,12 48,30 30,48 12,30" />
          <line x1="0" y1="0" x2="60" y2="60" stroke-dasharray="2 2" opacity="0.5" />
          <line x1="60" y1="0" x2="0" y2="60" stroke-dasharray="2 2" opacity="0.5" />
          <circle cx="30" cy="30" r="2.2" fill="${strokeColor}" />
        </g>
      </pattern>
    `;
  }
  if (patternType === "festive_mandala") {
    return `
      <pattern id="bgPattern" width="80" height="80" patternUnits="userSpaceOnUse">
        <g fill="none" stroke="${strokeColor}" stroke-width="0.75">
          <circle cx="40" cy="40" r="18" />
          <circle cx="40" cy="40" r="8" />
          <circle cx="40" cy="40" r="2.5" fill="${strokeColor}" />
          <path d="M 40 22 C 36 28 36 34 40 40 C 44 34 44 28 40 22 Z" />
          <path d="M 40 40 C 36 46 36 52 40 58 C 44 52 44 46 40 40 Z" />
          <path d="M 22 40 C 28 36 34 36 40 40 C 34 44 28 44 22 40 Z" />
          <path d="M 40 40 C 46 36 52 36 58 40 C 52 44 46 44 40 40 Z" />
          <circle cx="0" cy="0" r="3.5" />
          <circle cx="80" cy="0" r="3.5" />
          <circle cx="0" cy="80" r="3.5" />
          <circle cx="80" cy="80" r="3.5" />
        </g>
      </pattern>
    `;
  }
  // Default: printed_damask
  return `
    <pattern id="bgPattern" width="100" height="100" patternUnits="userSpaceOnUse">
      <g fill="none" stroke="${strokeColor}" stroke-width="0.8">
        <path d="M 50 10 C 35 25 35 45 50 60 C 65 45 65 25 50 10 Z" />
        <path d="M 50 22 C 42 32 42 42 50 50 C 58 42 58 32 50 22 Z" />
        <circle cx="50" cy="35" r="2.5" fill="${strokeColor}" />
        <path d="M 10 50 C 25 35 45 35 60 50 C 45 65 25 65 10 50" />
        <path d="M 90 50 C 75 35 55 35 40 50 C 55 65 75 65 90 50" />
        <circle cx="0" cy="0" r="2" fill="${strokeColor}" />
        <circle cx="100" cy="0" r="2" fill="${strokeColor}" />
        <circle cx="0" cy="100" r="2" fill="${strokeColor}" />
        <circle cx="100" cy="100" r="2" fill="${strokeColor}" />
      </g>
    </pattern>
  `;
}

const FESTIVAL_PROFILES = {
  shivratri: {
    id: "shivratri",
    name: "Maha Shivratri",
    motifFile: "shivratri.jpg",
    borderDecoration: "shivratri",
    defaultBgPattern: "royal_jaali",
    defaultHindiTitle: "महाशिवरात्रि",
    defaultGreeting: "की हार्दिक शुभकामनाएं!",
    defaultBlessings: [
      "ॐ नमः शिवाय। देवाधिदेव महादेव",
      "की असीम कृपा से आपके जीवन में सुख,",
      "शांति, स्वास्थ्य और समृद्धि का वास हो।"
    ],
    defaultEnglishTop: "✦ Divine ✦",
    defaultEnglishTitle: "Maha Shivratri",
    defaultFooterBlessing: [
      "May Lord Shiva bless you with",
      "peace, prosperity, and success",
      "in every joyful endeavor."
    ],
    variants: [
      {
        variantName: "Cosmic Indigo & Sacred Trishul",
        isDark: true,
        bgGrad: ["#050814", "#0c1527", "#13213d"],
        headerText: "#fef08a",
        headerSub: "#e2e8f0",
        bannerBg: ["#0f172a", "#1e293b"],
        bannerBorder: "#38bdf8",
        bannerText: "#ffffff",
        titleGrad: ["#ffffff", "#93c5fd", "#38bdf8", "#0284c7"],
        titleStroke: "#0c1a30",
        titleShadow: "#0284c7",
        blessingColor: "#e2e8f0",
        greetingColor: "#38bdf8",
        dividerColor: "#38bdf8",
        badgeBg: ["#0f172a", "#1e293b", "#0f172a"],
        badgeBorder: "#38bdf8",
        badgeText: "#38bdf8",
        badgeScript: "#ffffff",
        ribbonBg: ["#0f172a", "#1e293b", "#0f172a"],
        ribbonBorder: "#38bdf8",
        ribbonText: "#ffffff",
        footerBg: "#060917",
        addrBoxBg: ["#0a1224", "#13203c", "#0a1224"],
        addrBoxBorder: "#38bdf8",
        footerBlessingColor: "#e2e8f0",
      },
      {
        variantName: "Sacred Bhasma & Celestial Cyan",
        isDark: true,
        bgGrad: ["#071018", "#0e202f", "#183247"],
        headerText: "#e0f2fe",
        headerSub: "#bae6fd",
        bannerBg: ["#082f49", "#0c4a6e"],
        bannerBorder: "#38bdf8",
        bannerText: "#ffffff",
        titleGrad: ["#ffffff", "#7dd3fc", "#0284c7", "#0369a1"],
        titleStroke: "#082f49",
        titleShadow: "#0369a1",
        blessingColor: "#e0f2fe",
        greetingColor: "#38bdf8",
        dividerColor: "#0284c7",
        badgeBg: ["#082f49", "#0c4a6e", "#082f49"],
        badgeBorder: "#7dd3fc",
        badgeText: "#7dd3fc",
        badgeScript: "#ffffff",
        ribbonBg: ["#082f49", "#0c4a6e", "#082f49"],
        ribbonBorder: "#38bdf8",
        ribbonText: "#ffffff",
        footerBg: "#040b12",
        addrBoxBg: ["#082032", "#0f314c", "#082032"],
        addrBoxBorder: "#38bdf8",
        footerBlessingColor: "#e0f2fe",
      },
      {
        variantName: "Mystic Neelkanth & Golden Aura",
        isDark: true,
        bgGrad: ["#06061a", "#121336", "#1c1d4d"],
        headerText: "#fef08a",
        headerSub: "#fde047",
        bannerBg: ["#1e1b4b", "#312e81"],
        bannerBorder: "#fbbf24",
        bannerText: "#ffffff",
        titleGrad: ["#fffbeb", "#fde047", "#f59e0b", "#d97706"],
        titleStroke: "#1e1b4b",
        titleShadow: "#b45309",
        blessingColor: "#fef3c7",
        greetingColor: "#fbbf24",
        dividerColor: "#fbbf24",
        badgeBg: ["#1e1b4b", "#312e81", "#1e1b4b"],
        badgeBorder: "#fbbf24",
        badgeText: "#fde047",
        badgeScript: "#ffffff",
        ribbonBg: ["#1e1b4b", "#312e81", "#1e1b4b"],
        ribbonBorder: "#fbbf24",
        ribbonText: "#ffffff",
        footerBg: "#060714",
        addrBoxBg: ["#111333", "#1b1e4c", "#111333"],
        addrBoxBorder: "#fbbf24",
        footerBlessingColor: "#fef3c7",
      }
    ]
  },
  holi: {
    id: "holi",
    name: "Holi",
    motifFile: "holi.jpg",
    borderDecoration: "holi",
    defaultBgPattern: "color_splashes",
    defaultHindiTitle: "शुभ होली महोत्सव",
    defaultGreeting: "रंगों के महापर्व की शुभकामनाएं!",
    defaultBlessings: [
      "उमंग, उल्लास और रंगों के इस पावन पर्व पर",
      "आपके जीवन में खुशियों, उमंग और",
      "सद्भाव के अनंत रंग बिखरें।"
    ],
    defaultEnglishTop: "✦ Joyous ✦",
    defaultEnglishTitle: "Happy Holi",
    defaultFooterBlessing: [
      "Wishing you a vibrant, joyful",
      "and colorful celebration with",
      "cherished loved ones."
    ],
    variants: [
      {
        variantName: "Joyful Gulal & Vibrant Colors",
        isDark: false,
        bgGrad: ["#fffdf7", "#fef5e7", "#faebd7"],
        headerText: "#701a75",
        headerSub: "#86198f",
        bannerBg: ["#701a75", "#4a044e"],
        bannerBorder: "#f59e0b",
        bannerText: "#ffffff",
        titleGrad: ["#f43f5e", "#d946ef", "#8b5cf6"],
        titleStroke: "#4a044e",
        titleShadow: "#701a75",
        blessingColor: "#3b0764",
        greetingColor: "#c026d3",
        dividerColor: "#d946ef",
        badgeBg: ["#86198f", "#701a75", "#4a044e"],
        badgeBorder: "#facc15",
        badgeText: "#fef08a",
        badgeScript: "#ffffff",
        ribbonBg: ["#701a75", "#4a044e", "#701a75"],
        ribbonBorder: "#facc15",
        ribbonText: "#ffffff",
        footerBg: "#2d0333",
        addrBoxBg: ["#1e1438", "#2c154f", "#1e1438"],
        addrBoxBorder: "#facc15",
        footerBlessingColor: "#ffedd5",
      },
      {
        variantName: "Sunshine Amber & Radiant Coral",
        isDark: false,
        bgGrad: ["#fffdf2", "#fef7dc", "#fdecc8"],
        headerText: "#9a3412",
        headerSub: "#c2410c",
        bannerBg: ["#9a3412", "#7c2d12"],
        bannerBorder: "#facc15",
        bannerText: "#ffffff",
        titleGrad: ["#ea580c", "#e11d48", "#be185d"],
        titleStroke: "#7c2d12",
        titleShadow: "#9a3412",
        blessingColor: "#7c2d12",
        greetingColor: "#c2410c",
        dividerColor: "#ea580c",
        badgeBg: ["#9a3412", "#7c2d12", "#9a3412"],
        badgeBorder: "#facc15",
        badgeText: "#fef08a",
        badgeScript: "#ffffff",
        ribbonBg: ["#9a3412", "#7c2d12", "#9a3412"],
        ribbonBorder: "#facc15",
        ribbonText: "#ffffff",
        footerBg: "#2b1008",
        addrBoxBg: ["#241209", "#3d1b0d", "#241209"],
        addrBoxBorder: "#facc15",
        footerBlessingColor: "#fef3c7",
      },
      {
        variantName: "Electric Violet & Festive Teal",
        isDark: false,
        bgGrad: ["#faf7ff", "#f3e8ff", "#e9d5ff"],
        headerText: "#581c87",
        headerSub: "#6b21a8",
        bannerBg: ["#581c87", "#3b0764"],
        bannerBorder: "#06b6d4",
        bannerText: "#ffffff",
        titleGrad: ["#7c3aed", "#2563eb", "#0284c7"],
        titleStroke: "#3b0764",
        titleShadow: "#581c87",
        blessingColor: "#3b0764",
        greetingColor: "#7c3aed",
        dividerColor: "#06b6d4",
        badgeBg: ["#581c87", "#3b0764", "#581c87"],
        badgeBorder: "#06b6d4",
        badgeText: "#a5f3fc",
        badgeScript: "#ffffff",
        ribbonBg: ["#581c87", "#3b0764", "#581c87"],
        ribbonBorder: "#06b6d4",
        ribbonText: "#ffffff",
        footerBg: "#1e0b36",
        addrBoxBg: ["#170b29", "#291349", "#170b29"],
        addrBoxBorder: "#06b6d4",
        footerBlessingColor: "#f5f3ff",
      }
    ]
  },
  diwali: {
    id: "diwali",
    name: "Diwali",
    motifFile: "diwali.jpg",
    borderDecoration: "diwali",
    defaultBgPattern: "printed_damask",
    defaultHindiTitle: "दीपावली महोत्सव",
    defaultGreeting: "की हार्दिक शुभकामनाएं!",
    defaultBlessings: [
      "दीपों के पावन प्रकाश से आपके",
      "घर-आँगन में सुख, समृद्धि, वैभव",
      "और शांति का सदैव वास हो।"
    ],
    defaultEnglishTop: "✦ Shubh ✦",
    defaultEnglishTitle: "Deepavali",
    defaultFooterBlessing: [
      "May Goddess Lakshmi bless you",
      "with boundless prosperity, joy",
      "and eternal happiness."
    ],
    variants: [
      {
        variantName: "Radiant Deepams & Molten Gold",
        isDark: true,
        bgGrad: ["#260416", "#450624", "#1f0312"],
        headerText: "#fef08a",
        headerSub: "#fde047",
        bannerBg: ["#50072b", "#310419"],
        bannerBorder: "#d4af37",
        bannerText: "#ffffff",
        titleGrad: ["#fff9c4", "#f59e0b", "#b45309", "#78350f"],
        titleStroke: "#451a03",
        titleShadow: "#78350f",
        blessingColor: "#fef08a",
        greetingColor: "#fbbf24",
        dividerColor: "#d4af37",
        badgeBg: ["#450624", "#2c0416", "#1f0312"],
        badgeBorder: "#d4af37",
        badgeText: "#fef08a",
        badgeScript: "#ffffff",
        ribbonBg: ["#450624", "#2c0416", "#450624"],
        ribbonBorder: "#d4af37",
        ribbonText: "#ffffff",
        footerBg: "#1a020e",
        addrBoxBg: ["#1c0f38", "#2a144e", "#1c0f38"],
        addrBoxBorder: "#d4af37",
        footerBlessingColor: "#fef08a",
      },
      {
        variantName: "Midnight Sapphire & Starlight Gold",
        isDark: true,
        bgGrad: ["#050c21", "#0b193d", "#08122c"],
        headerText: "#fef08a",
        headerSub: "#fde047",
        bannerBg: ["#0f2352", "#081330"],
        bannerBorder: "#fbbf24",
        bannerText: "#ffffff",
        titleGrad: ["#fffbeb", "#fde047", "#f59e0b", "#ca8a04"],
        titleStroke: "#081330",
        titleShadow: "#b45309",
        blessingColor: "#fef08a",
        greetingColor: "#fbbf24",
        dividerColor: "#fbbf24",
        badgeBg: ["#0f2352", "#081330", "#0f2352"],
        badgeBorder: "#fbbf24",
        badgeText: "#fef08a",
        badgeScript: "#ffffff",
        ribbonBg: ["#0f2352", "#081330", "#0f2352"],
        ribbonBorder: "#fbbf24",
        ribbonText: "#ffffff",
        footerBg: "#040917",
        addrBoxBg: ["#0a142e", "#122046", "#0a142e"],
        addrBoxBorder: "#fbbf24",
        footerBlessingColor: "#fef08a",
      },
      {
        variantName: "Royal Velvet Maroon & Warm Brass",
        isDark: true,
        bgGrad: ["#330412", "#52091f", "#26030e"],
        headerText: "#fed7aa",
        headerSub: "#fde047",
        bannerBg: ["#5e0b24", "#3d0516"],
        bannerBorder: "#f59e0b",
        bannerText: "#ffffff",
        titleGrad: ["#fef08a", "#f59e0b", "#d97706", "#92400e"],
        titleStroke: "#3d0516",
        titleShadow: "#78350f",
        blessingColor: "#fef3c7",
        greetingColor: "#f59e0b",
        dividerColor: "#f59e0b",
        badgeBg: ["#5e0b24", "#3d0516", "#5e0b24"],
        badgeBorder: "#f59e0b",
        badgeText: "#fef08a",
        badgeScript: "#ffffff",
        ribbonBg: ["#5e0b24", "#3d0516", "#5e0b24"],
        ribbonBorder: "#f59e0b",
        ribbonText: "#ffffff",
        footerBg: "#1c030b",
        addrBoxBg: ["#1f0612", "#310a1d", "#1f0612"],
        addrBoxBorder: "#f59e0b",
        footerBlessingColor: "#ffedd5",
      }
    ]
  },
  eid: {
    id: "eid",
    name: "Eid",
    motifFile: "eid.jpg",
    borderDecoration: "eid",
    defaultHindiTitle: "ईद मुबारक",
    defaultGreeting: "की दिली मुबारकबाद!",
    defaultBlessings: [
      "खुशियों का यह पावन पर्व आपके और",
      "आपके परिवार के लिए अमन, बरकत,",
      "सद्भाव और खुशहाली लेकर आए।"
    ],
    defaultEnglishTop: "✦ Mubarak ✦",
    defaultEnglishTitle: "Eid Mubarak",
    defaultFooterBlessing: [
      "May Allah fill your life with",
      "peace, endless happiness and",
      "divine blessings always."
    ],
    variants: [
      {
        variantName: "Imperial Emerald & Islamic Mihrab",
        isDark: true,
        bgGrad: ["#02241b", "#063d2e", "#011611"],
        headerText: "#fef08a",
        headerSub: "#a7f3d0",
        bannerBg: ["#064e3b", "#022c22"],
        bannerBorder: "#eab308",
        bannerText: "#ffffff",
        titleGrad: ["#fffbeb", "#fde047", "#eab308", "#ca8a04"],
        titleStroke: "#022c22",
        titleShadow: "#064e3b",
        blessingColor: "#a7f3d0",
        greetingColor: "#fde047",
        dividerColor: "#eab308",
        badgeBg: ["#064e3b", "#022c22", "#011611"],
        badgeBorder: "#eab308",
        badgeText: "#fde047",
        badgeScript: "#ffffff",
        ribbonBg: ["#064e3b", "#022c22", "#064e3b"],
        ribbonBorder: "#eab308",
        ribbonText: "#ffffff",
        footerBg: "#01150f",
        addrBoxBg: ["#042018", "#083327", "#042018"],
        addrBoxBorder: "#eab308",
        footerBlessingColor: "#dcfce7",
      },
      {
        variantName: "Midnight Azure & Starlight Crescent",
        isDark: true,
        bgGrad: ["#03182b", "#082b4a", "#021221"],
        headerText: "#fef08a",
        headerSub: "#bae6fd",
        bannerBg: ["#0c3c66", "#06223b"],
        bannerBorder: "#facc15",
        bannerText: "#ffffff",
        titleGrad: ["#fffbeb", "#fde047", "#eab308", "#ca8a04"],
        titleStroke: "#06223b",
        titleShadow: "#0c3c66",
        blessingColor: "#bae6fd",
        greetingColor: "#fde047",
        dividerColor: "#facc15",
        badgeBg: ["#0c3c66", "#06223b", "#0c3c66"],
        badgeBorder: "#facc15",
        badgeText: "#fde047",
        badgeScript: "#ffffff",
        ribbonBg: ["#0c3c66", "#06223b", "#0c3c66"],
        ribbonBorder: "#facc15",
        ribbonText: "#ffffff",
        footerBg: "#020d18",
        addrBoxBg: ["#071b2d", "#0c2c49", "#071b2d"],
        addrBoxBorder: "#facc15",
        footerBlessingColor: "#e0f2fe",
      },
      {
        variantName: "Regal Olive & Molten Brass",
        isDark: true,
        bgGrad: ["#14240f", "#243c1b", "#0d1a0a"],
        headerText: "#fef08a",
        headerSub: "#d9f99d",
        bannerBg: ["#2d4a22", "#192c13"],
        bannerBorder: "#eab308",
        bannerText: "#ffffff",
        titleGrad: ["#fffbeb", "#fef08a", "#eab308", "#a16207"],
        titleStroke: "#192c13",
        titleShadow: "#2d4a22",
        blessingColor: "#d9f99d",
        greetingColor: "#facc15",
        dividerColor: "#eab308",
        badgeBg: ["#2d4a22", "#192c13", "#2d4a22"],
        badgeBorder: "#eab308",
        badgeText: "#fef08a",
        badgeScript: "#ffffff",
        ribbonBg: ["#2d4a22", "#192c13", "#2d4a22"],
        ribbonBorder: "#eab308",
        ribbonText: "#ffffff",
        footerBg: "#0a1307",
        addrBoxBg: ["#12200d", "#1d3315", "#12200d"],
        addrBoxBorder: "#eab308",
        footerBlessingColor: "#ecfccb",
      }
    ]
  },
  ganesh: {
    id: "ganesh",
    name: "Ganesh Chaturthi",
    motifFile: "ganesh_golden.jpg",
    borderDecoration: "ganesh",
    defaultHindiTitle: "गणेश चतुर्थी",
    defaultGreeting: "की हार्दिक शुभकामनाएं!",
    defaultBlessings: [
      "मंगलमूर्ति भगवान श्री गणेश आपके",
      "सभी विघ्नों को दूर कर जीवन में",
      "सुख, शांति और समृद्धि प्रदान करें।"
    ],
    defaultEnglishTop: "✦ Shubh ✦",
    defaultEnglishTitle: "Ganesh Chaturthi",
    defaultFooterBlessing: [
      "May Lord Ganesha bestow upon",
      "you and your family endless",
      "wisdom, joy and prosperity."
    ],
    variants: [
      {
        variantName: "Royal Marigold & Auspicious Ganesha",
        isDark: false,
        bgGrad: ["#fff9ee", "#faebd2", "#f5dcba"],
        headerText: "#581c87",
        headerSub: "#78350f",
        bannerBg: ["#581c87", "#3b0764"],
        bannerBorder: "#d4af37",
        bannerText: "#ffffff",
        titleGrad: ["#b91c1c", "#881337", "#4c0519"],
        titleStroke: "#d4af37",
        titleShadow: "#3b0764",
        blessingColor: "#451a03",
        greetingColor: "#78350f",
        dividerColor: "#d4af37",
        badgeBg: ["#7f1d1d", "#4c0519", "#2d0612"],
        badgeBorder: "#d4af37",
        badgeText: "#fef08a",
        badgeScript: "#ffffff",
        ribbonBg: ["#581c87", "#3b0764", "#581c87"],
        ribbonBorder: "#d4af37",
        ribbonText: "#ffffff",
        footerBg: "#2d0333",
        addrBoxBg: ["#120826", "#1c0f38", "#120826"],
        addrBoxBorder: "#d4af37",
        footerBlessingColor: "#fef3c7",
      },
      {
        variantName: "Divine Saffron & Golden Sunset",
        isDark: false,
        bgGrad: ["#fffcf0", "#fef3c7", "#fde68a"],
        headerText: "#9a3412",
        headerSub: "#78350f",
        bannerBg: ["#9a3412", "#7c2d12"],
        bannerBorder: "#d4af37",
        bannerText: "#ffffff",
        titleGrad: ["#c2410c", "#9a3412", "#7c2d12"],
        titleStroke: "#d4af37",
        titleShadow: "#7c2d12",
        blessingColor: "#7c2d12",
        greetingColor: "#9a3412",
        dividerColor: "#ea580c",
        badgeBg: ["#9a3412", "#7c2d12", "#9a3412"],
        badgeBorder: "#d4af37",
        badgeText: "#fef08a",
        badgeScript: "#ffffff",
        ribbonBg: ["#9a3412", "#7c2d12", "#9a3412"],
        ribbonBorder: "#d4af37",
        ribbonText: "#ffffff",
        footerBg: "#291008",
        addrBoxBg: ["#231008", "#381a0e", "#231008"],
        addrBoxBorder: "#d4af37",
        footerBlessingColor: "#fef3c7",
      },
      {
        variantName: "Imperial Purple & Sandalwood Gold",
        isDark: true,
        bgGrad: ["#22062b", "#3d0b4d", "#1c0523"],
        headerText: "#fef08a",
        headerSub: "#fde047",
        bannerBg: ["#4a0d5c", "#2b0636"],
        bannerBorder: "#fbbf24",
        bannerText: "#ffffff",
        titleGrad: ["#fffbeb", "#fde047", "#f59e0b", "#d97706"],
        titleStroke: "#2b0636",
        titleShadow: "#4a0d5c",
        blessingColor: "#fef3c7",
        greetingColor: "#fbbf24",
        dividerColor: "#fbbf24",
        badgeBg: ["#4a0d5c", "#2b0636", "#4a0d5c"],
        badgeBorder: "#fbbf24",
        badgeText: "#fef08a",
        badgeScript: "#ffffff",
        ribbonBg: ["#4a0d5c", "#2b0636", "#4a0d5c"],
        ribbonBorder: "#fbbf24",
        ribbonText: "#ffffff",
        footerBg: "#140319",
        addrBoxBg: ["#190620", "#290c33", "#190620"],
        addrBoxBorder: "#fbbf24",
        footerBlessingColor: "#fef3c7",
      }
    ]
  },
  janmashtami: {
    id: "janmashtami",
    name: "Janmashtami",
    motifFile: "janmashtami.jpg",
    borderDecoration: "janmashtami",
    defaultHindiTitle: "श्रीकृष्ण जन्माष्टमी",
    defaultGreeting: "की मंगलमय शुभकामनाएं!",
    defaultBlessings: [
      "माखन-चोर नंदकिशोर भगवान श्रीकृष्ण",
      "की कृपा आप और आपके पूरे परिवार",
      "पर सदैव बनी रहे।"
    ],
    defaultEnglishTop: "✦ Divine ✦",
    defaultEnglishTitle: "Janmashtami",
    defaultFooterBlessing: [
      "May Lord Krishna fill your life",
      "with love, divine music, peace",
      "and spiritual bliss."
    ],
    variants: [
      {
        variantName: "Divine Vrindavan Peacock & Gold",
        isDark: true,
        bgGrad: ["#071124", "#0f2347", "#050e1c"],
        headerText: "#fde047",
        headerSub: "#bae6fd",
        bannerBg: ["#1e3a8a", "#0f172a"],
        bannerBorder: "#facc15",
        bannerText: "#ffffff",
        titleGrad: ["#fef08a", "#facc15", "#eab308", "#ca8a04"],
        titleStroke: "#0f172a",
        titleShadow: "#1e3a8a",
        blessingColor: "#bae6fd",
        greetingColor: "#facc15",
        dividerColor: "#facc15",
        badgeBg: ["#1e3a8a", "#0f172a", "#0284c7"],
        badgeBorder: "#facc15",
        badgeText: "#fde047",
        badgeScript: "#ffffff",
        ribbonBg: ["#1e3a8a", "#0f172a", "#1e3a8a"],
        ribbonBorder: "#facc15",
        ribbonText: "#ffffff",
        footerBg: "#060d1a",
        addrBoxBg: ["#0a1830", "#12264a", "#0a1830"],
        addrBoxBorder: "#facc15",
        footerBlessingColor: "#e0f2fe",
      },
      {
        variantName: "Midnight Gokul Blue & Golden Flute",
        isDark: true,
        bgGrad: ["#040a18", "#081630", "#030814"],
        headerText: "#fef08a",
        headerSub: "#bae6fd",
        bannerBg: ["#0f2854", "#081733"],
        bannerBorder: "#fbbf24",
        bannerText: "#ffffff",
        titleGrad: ["#fffbeb", "#fde047", "#f59e0b", "#d97706"],
        titleStroke: "#081733",
        titleShadow: "#0f2854",
        blessingColor: "#bae6fd",
        greetingColor: "#fbbf24",
        dividerColor: "#fbbf24",
        badgeBg: ["#0f2854", "#081733", "#0f2854"],
        badgeBorder: "#fbbf24",
        badgeText: "#fef08a",
        badgeScript: "#ffffff",
        ribbonBg: ["#0f2854", "#081733", "#0f2854"],
        ribbonBorder: "#fbbf24",
        ribbonText: "#ffffff",
        footerBg: "#02060f",
        addrBoxBg: ["#061124", "#0c1d3c", "#061124"],
        addrBoxBorder: "#fbbf24",
        footerBlessingColor: "#e0f2fe",
      },
      {
        variantName: "Peacock Emerald & Divine Amber",
        isDark: true,
        bgGrad: ["#041c1f", "#083338", "#021214"],
        headerText: "#fef08a",
        headerSub: "#a5f3fc",
        bannerBg: ["#0e454b", "#06292d"],
        bannerBorder: "#facc15",
        bannerText: "#ffffff",
        titleGrad: ["#fef08a", "#facc15", "#f59e0b", "#d97706"],
        titleStroke: "#06292d",
        titleShadow: "#0e454b",
        blessingColor: "#a5f3fc",
        greetingColor: "#facc15",
        dividerColor: "#facc15",
        badgeBg: ["#0e454b", "#06292d", "#0e454b"],
        badgeBorder: "#facc15",
        badgeText: "#fef08a",
        badgeScript: "#ffffff",
        ribbonBg: ["#0e454b", "#06292d", "#0e454b"],
        ribbonBorder: "#facc15",
        ribbonText: "#ffffff",
        footerBg: "#010d0f",
        addrBoxBg: ["#051d21", "#0b3137", "#051d21"],
        addrBoxBorder: "#facc15",
        footerBlessingColor: "#cffafe",
      }
    ]
  },
  navratri: {
    id: "navratri",
    name: "Navratri",
    motifFile: "navratri.jpg",
    borderDecoration: "navratri",
    defaultHindiTitle: "शुभ नवरात्रि महोत्सव",
    defaultGreeting: "की मंगलमय शुभकामनाएं!",
    defaultBlessings: [
      "मां दुर्गा की नौ दिव्य शक्तियां आपके",
      "जीवन से अंधकार दूर कर यश, बल,",
      "आरोग्य और सिद्धि प्रदान करें।"
    ],
    defaultEnglishTop: "✦ Auspicious ✦",
    defaultEnglishTitle: "Navratri",
    defaultFooterBlessing: [
      "May Maa Durga shower divine",
      "blessings of strength, vitality",
      "and happiness upon you."
    ],
    variants: [
      {
        variantName: "Divine Crimson & Maa Durga",
        isDark: true,
        bgGrad: ["#4a0707", "#730d0d", "#330303"],
        headerText: "#fef08a",
        headerSub: "#fed7aa",
        bannerBg: ["#7f1d1d", "#450a0a"],
        bannerBorder: "#facc15",
        bannerText: "#ffffff",
        titleGrad: ["#fff9c4", "#f59e0b", "#b45309", "#78350f"],
        titleStroke: "#450a0a",
        titleShadow: "#7f1d1d",
        blessingColor: "#fef08a",
        greetingColor: "#facc15",
        dividerColor: "#facc15",
        badgeBg: ["#7f1d1d", "#450a0a", "#290505"],
        badgeBorder: "#facc15",
        badgeText: "#fde047",
        badgeScript: "#ffffff",
        ribbonBg: ["#7f1d1d", "#450a0a", "#7f1d1d"],
        ribbonBorder: "#facc15",
        ribbonText: "#ffffff",
        footerBg: "#290505",
        addrBoxBg: ["#1c0404", "#2e0808", "#1c0404"],
        addrBoxBorder: "#facc15",
        footerBlessingColor: "#ffedd5",
      },
      {
        variantName: "Auspicious Saffron & Royal Amber",
        isDark: true,
        bgGrad: ["#3f1203", "#611d06", "#2b0c02"],
        headerText: "#fef08a",
        headerSub: "#fed7aa",
        bannerBg: ["#7c2d12", "#431407"],
        bannerBorder: "#fbbf24",
        bannerText: "#ffffff",
        titleGrad: ["#fffbeb", "#fde047", "#f59e0b", "#c2410c"],
        titleStroke: "#431407",
        titleShadow: "#7c2d12",
        blessingColor: "#fed7aa",
        greetingColor: "#fbbf24",
        dividerColor: "#fbbf24",
        badgeBg: ["#7c2d12", "#431407", "#7c2d12"],
        badgeBorder: "#fbbf24",
        badgeText: "#fef08a",
        badgeScript: "#ffffff",
        ribbonBg: ["#7c2d12", "#431407", "#7c2d12"],
        ribbonBorder: "#fbbf24",
        ribbonText: "#ffffff",
        footerBg: "#1f0902",
        addrBoxBg: ["#1f0802", "#361004", "#1f0802"],
        addrBoxBorder: "#fbbf24",
        footerBlessingColor: "#ffedd5",
      },
      {
        variantName: "Shakti Royal Violet & Golden Flame",
        isDark: true,
        bgGrad: ["#2d0530", "#47094d", "#1f0322"],
        headerText: "#fef08a",
        headerSub: "#f5d0fe",
        bannerBg: ["#581c87", "#3b0764"],
        bannerBorder: "#facc15",
        bannerText: "#ffffff",
        titleGrad: ["#fffbeb", "#fde047", "#f59e0b", "#b45309"],
        titleStroke: "#3b0764",
        titleShadow: "#581c87",
        blessingColor: "#f5d0fe",
        greetingColor: "#facc15",
        dividerColor: "#facc15",
        badgeBg: ["#581c87", "#3b0764", "#581c87"],
        badgeBorder: "#facc15",
        badgeText: "#fef08a",
        badgeScript: "#ffffff",
        ribbonBg: ["#581c87", "#3b0764", "#581c87"],
        ribbonBorder: "#facc15",
        ribbonText: "#ffffff",
        footerBg: "#140217",
        addrBoxBg: ["#19051d", "#2d0b33", "#19051d"],
        addrBoxBorder: "#facc15",
        footerBlessingColor: "#fae8ff",
      }
    ]
  },
  christmas: {
    id: "christmas",
    name: "Christmas",
    motifFile: "christmas.jpg",
    borderDecoration: "christmas",
    defaultLanguage: "english",
    defaultBgPattern: "winter_stars",
    defaultEnglishMainTitle: "MERRY CHRISTMAS",
    defaultEnglishGreeting: "Season's Greetings & Joyful Cheer!",
    defaultEnglishBlessings: [
      "May the peace, love, and wonder of Christmas",
      "fill your home and hearts with enduring joy,",
      "and bring countless blessings in the New Year."
    ],
    defaultHindiTitle: "क्रिसमस महोत्सव",
    defaultGreeting: "Merry Christmas & Happy New Year!",
    defaultBlessings: [
      "प्रभु यीशु की असीम कृपा और शांति से",
      "आपका घर-आंगन प्रेम, आनंद और",
      "सद्भाव के प्रकाश से जगमगाए।"
    ],
    defaultEnglishTop: "✦ Joyous ✦",
    defaultEnglishTitle: "Christmas Cheer",
    defaultFooterBlessing: [
      "Wishing you and your loved",
      "ones a magical season filled",
      "with warm holiday cheer."
    ],
    variants: [
      {
        variantName: "Holiday Velvet Ruby & Evergreen",
        isDark: true,
        bgGrad: ["#2a040e", "#450818", "#13281b"],
        headerText: "#fef08a",
        headerSub: "#dcfce7",
        bannerBg: ["#881337", "#14532d"],
        bannerBorder: "#facc15",
        bannerText: "#ffffff",
        titleGrad: ["#fffbeb", "#fde047", "#eab308", "#ca8a04"],
        titleStroke: "#78350f",
        titleShadow: "#14532d",
        blessingColor: "#fef08a",
        greetingColor: "#4ade80",
        dividerColor: "#facc15",
        badgeBg: ["#881337", "#4c0519", "#14532d"],
        badgeBorder: "#facc15",
        badgeText: "#fef08a",
        badgeScript: "#ffffff",
        ribbonBg: ["#881337", "#4c0519", "#881337"],
        ribbonBorder: "#facc15",
        ribbonText: "#ffffff",
        footerBg: "#1e040c",
        addrBoxBg: ["#1f0510", "#2c0919", "#1f0510"],
        addrBoxBorder: "#facc15",
        footerBlessingColor: "#fef3c7",
      },
      {
        variantName: "Midnight Sapphire & Golden Star",
        isDark: true,
        bgGrad: ["#071129", "#0e204a", "#060d1f"],
        headerText: "#fef08a",
        headerSub: "#bae6fd",
        bannerBg: ["#142e66", "#0b1b3d"],
        bannerBorder: "#fbbf24",
        bannerText: "#ffffff",
        titleGrad: ["#fffbeb", "#fde047", "#f59e0b", "#d97706"],
        titleStroke: "#0b1b3d",
        titleShadow: "#142e66",
        blessingColor: "#bae6fd",
        greetingColor: "#fbbf24",
        dividerColor: "#fbbf24",
        badgeBg: ["#142e66", "#0b1b3d", "#142e66"],
        badgeBorder: "#fbbf24",
        badgeText: "#fef08a",
        badgeScript: "#ffffff",
        ribbonBg: ["#142e66", "#0b1b3d", "#142e66"],
        ribbonBorder: "#fbbf24",
        ribbonText: "#ffffff",
        footerBg: "#040917",
        addrBoxBg: ["#091736", "#112859", "#091736"],
        addrBoxBorder: "#fbbf24",
        footerBlessingColor: "#e0f2fe",
      },
      {
        variantName: "Classic Pine & Champagne Cheer",
        isDark: true,
        bgGrad: ["#061a10", "#0c2e1d", "#05140d"],
        headerText: "#fef08a",
        headerSub: "#bbf7d0",
        bannerBg: ["#14532d", "#052e16"],
        bannerBorder: "#eab308",
        bannerText: "#ffffff",
        titleGrad: ["#fffbeb", "#fef08a", "#eab308", "#ca8a04"],
        titleStroke: "#052e16",
        titleShadow: "#14532d",
        blessingColor: "#bbf7d0",
        greetingColor: "#facc15",
        dividerColor: "#eab308",
        badgeBg: ["#14532d", "#052e16", "#14532d"],
        badgeBorder: "#eab308",
        badgeText: "#fef08a",
        badgeScript: "#ffffff",
        ribbonBg: ["#14532d", "#052e16", "#14532d"],
        ribbonBorder: "#eab308",
        ribbonText: "#ffffff",
        footerBg: "#030d08",
        addrBoxBg: ["#0a2114", "#113822", "#0a2114"],
        addrBoxBorder: "#eab308",
        footerBlessingColor: "#dcfce7",
      }
    ]
  },
  raksha_bandhan: {
    id: "raksha_bandhan",
    name: "Raksha Bandhan",
    motifFile: "raksha_bandhan.jpg",
    borderDecoration: "raksha_bandhan",
    defaultHindiTitle: "रक्षाबंधन महोत्सव",
    defaultGreeting: "पवित्र स्नेह और विश्वास का महापर्व",
    defaultBlessings: [
      "भाई-बहन के अटूट प्रेम, विश्वास और",
      "स्नेह के इस पावन पर्व पर आप",
      "सभी को ढेरों मंगलकामनाएं।"
    ],
    defaultEnglishTop: "✦ Auspicious ✦",
    defaultEnglishTitle: "Raksha Bandhan",
    defaultFooterBlessing: [
      "Celebrating the eternal bond of",
      "love, protection and lifelong",
      "cherished togetherness."
    ],
    variants: [
      {
        variantName: "Golden Zari & Sacred Rakhi",
        isDark: true,
        bgGrad: ["#3b0814", "#610e23", "#2b050e"],
        headerText: "#fef08a",
        headerSub: "#fed7aa",
        bannerBg: ["#701228", "#450616"],
        bannerBorder: "#f59e0b",
        bannerText: "#ffffff",
        titleGrad: ["#fff9c4", "#f59e0b", "#b45309", "#78350f"],
        titleStroke: "#450616",
        titleShadow: "#701228",
        blessingColor: "#fef08a",
        greetingColor: "#facc15",
        dividerColor: "#f59e0b",
        badgeBg: ["#701228", "#450616", "#2c040e"],
        badgeBorder: "#f59e0b",
        badgeText: "#fef08a",
        badgeScript: "#ffffff",
        ribbonBg: ["#701228", "#450616", "#701228"],
        ribbonBorder: "#f59e0b",
        ribbonText: "#ffffff",
        footerBg: "#1f040a",
        addrBoxBg: ["#1f0612", "#2c0a1a", "#1f0612"],
        addrBoxBorder: "#f59e0b",
        footerBlessingColor: "#ffedd5",
      },
      {
        variantName: "Auspicious Saffron & Ruby Thread",
        isDark: true,
        bgGrad: ["#400b12", "#63141f", "#2b070c"],
        headerText: "#fef08a",
        headerSub: "#fed7aa",
        bannerBg: ["#7c1d29", "#4c0f18"],
        bannerBorder: "#fbbf24",
        bannerText: "#ffffff",
        titleGrad: ["#fffbeb", "#fde047", "#f59e0b", "#b45309"],
        titleStroke: "#4c0f18",
        titleShadow: "#7c1d29",
        blessingColor: "#fed7aa",
        greetingColor: "#fbbf24",
        dividerColor: "#fbbf24",
        badgeBg: ["#7c1d29", "#4c0f18", "#7c1d29"],
        badgeBorder: "#fbbf24",
        badgeText: "#fef08a",
        badgeScript: "#ffffff",
        ribbonBg: ["#7c1d29", "#4c0f18", "#7c1d29"],
        ribbonBorder: "#fbbf24",
        ribbonText: "#ffffff",
        footerBg: "#1a0407",
        addrBoxBg: ["#21090d", "#331116", "#21090d"],
        addrBoxBorder: "#fbbf24",
        footerBlessingColor: "#ffedd5",
      },
      {
        variantName: "Festive Rose & Golden Filigree",
        isDark: true,
        bgGrad: ["#2d071c", "#470f2f", "#1e0413"],
        headerText: "#fef08a",
        headerSub: "#fbcfe8",
        bannerBg: ["#5b143c", "#380a24"],
        bannerBorder: "#facc15",
        bannerText: "#ffffff",
        titleGrad: ["#fef08a", "#facc15", "#f59e0b", "#9d174d"],
        titleStroke: "#380a24",
        titleShadow: "#5b143c",
        blessingColor: "#fbcfe8",
        greetingColor: "#facc15",
        dividerColor: "#facc15",
        badgeBg: ["#5b143c", "#380a24", "#5b143c"],
        badgeBorder: "#facc15",
        badgeText: "#fef08a",
        badgeScript: "#ffffff",
        ribbonBg: ["#5b143c", "#380a24", "#5b143c"],
        ribbonBorder: "#facc15",
        ribbonText: "#ffffff",
        footerBg: "#14020c",
        addrBoxBg: ["#1c0713", "#2e0e21", "#1c0713"],
        addrBoxBorder: "#facc15",
        footerBlessingColor: "#fce7f3",
      }
    ]
  },
  ram_navami: {
    id: "ram_navami",
    name: "Ram Navami",
    motifFile: "ram_navami.jpg",
    borderDecoration: "ram_navami",
    defaultHindiTitle: "श्री राम नवमी",
    defaultGreeting: "की हार्दिक मंगलकामनाएं!",
    defaultBlessings: [
      "मर्यादा पुरुषोत्तम भगवान श्री राम",
      "की कृपा से आपके जीवन में धर्म, यश,",
      "सद्भाव और सुख-समृद्धि का वास हो।"
    ],
    defaultEnglishTop: "✦ Divine ✦",
    defaultEnglishTitle: "Shri Ram Navami",
    defaultFooterBlessing: [
      "May Lord Rama bless your home",
      "with righteousness, enduring peace,",
      "and boundless divine joy."
    ],
    variants: [
      {
        variantName: "Ayodhya Royal Saffron & Sun God Gold",
        isDark: true,
        bgGrad: ["#3d1303", "#611f07", "#2b0d02"],
        headerText: "#fef08a",
        headerSub: "#fed7aa",
        bannerBg: ["#7c2d12", "#451406"],
        bannerBorder: "#facc15",
        bannerText: "#ffffff",
        titleGrad: ["#fff9c4", "#f59e0b", "#b45309", "#78350f"],
        titleStroke: "#451406",
        titleShadow: "#7c2d12",
        blessingColor: "#fef08a",
        greetingColor: "#facc15",
        dividerColor: "#facc15",
        badgeBg: ["#7c2d12", "#451406", "#7c2d12"],
        badgeBorder: "#facc15",
        badgeText: "#fde047",
        badgeScript: "#ffffff",
        ribbonBg: ["#7c2d12", "#451406", "#7c2d12"],
        ribbonBorder: "#facc15",
        ribbonText: "#ffffff",
        footerBg: "#1a0801",
        addrBoxBg: ["#1c0a02", "#311406", "#1c0a02"],
        addrBoxBorder: "#facc15",
        footerBlessingColor: "#ffedd5",
      },
      {
        variantName: "Sacred Coral & Divine Golden Bow",
        isDark: true,
        bgGrad: ["#420b12", "#66131f", "#2b070c"],
        headerText: "#fef08a",
        headerSub: "#fde047",
        bannerBg: ["#831828", "#4e0c16"],
        bannerBorder: "#fbbf24",
        bannerText: "#ffffff",
        titleGrad: ["#fffbeb", "#fde047", "#f59e0b", "#ca8a04"],
        titleStroke: "#4e0c16",
        titleShadow: "#831828",
        blessingColor: "#fed7aa",
        greetingColor: "#fbbf24",
        dividerColor: "#fbbf24",
        badgeBg: ["#831828", "#4e0c16", "#831828"],
        badgeBorder: "#fbbf24",
        badgeText: "#fef08a",
        badgeScript: "#ffffff",
        ribbonBg: ["#831828", "#4e0c16", "#831828"],
        ribbonBorder: "#fbbf24",
        ribbonText: "#ffffff",
        footerBg: "#1b0407",
        addrBoxBg: ["#21090d", "#331116", "#21090d"],
        addrBoxBorder: "#fbbf24",
        footerBlessingColor: "#ffedd5",
      },
      {
        variantName: "Celestial Sunrise & Surya Tejas",
        isDark: false,
        bgGrad: ["#fffbf0", "#fef3c7", "#fde68a"],
        headerText: "#9a3412",
        headerSub: "#78350f",
        bannerBg: ["#9a3412", "#7c2d12"],
        bannerBorder: "#d4af37",
        bannerText: "#ffffff",
        titleGrad: ["#c2410c", "#9a3412", "#7c2d12"],
        titleStroke: "#d4af37",
        titleShadow: "#7c2d12",
        blessingColor: "#7c2d12",
        greetingColor: "#9a3412",
        dividerColor: "#ea580c",
        badgeBg: ["#9a3412", "#7c2d12", "#9a3412"],
        badgeBorder: "#d4af37",
        badgeText: "#fef08a",
        badgeScript: "#ffffff",
        ribbonBg: ["#9a3412", "#7c2d12", "#9a3412"],
        ribbonBorder: "#d4af37",
        ribbonText: "#ffffff",
        footerBg: "#291008",
        addrBoxBg: ["#231008", "#381a0e", "#231008"],
        addrBoxBorder: "#d4af37",
        footerBlessingColor: "#fef3c7",
      }
    ]
  },
  general: {
    id: "general",
    name: "Festive Celebration",
    motifFile: "festive_diya.jpg",
    borderDecoration: "general",
    defaultHindiTitle: "पावन उत्सव",
    defaultGreeting: "की हार्दिक शुभकामनाएं!",
    defaultBlessings: [
      "इस पावन अवसर पर आपके जीवन में",
      "सुख, शांति, स्वास्थ्य और",
      "उन्नति का सदैव वास हो।"
    ],
    defaultEnglishTop: "✦ Festive ✦",
    defaultEnglishTitle: "Celebration",
    defaultFooterBlessing: [
      "Wishing you and your family",
      "joy, abundance and success",
      "in all celebrations."
    ],
    variants: [
      {
        variantName: "Royal Imperial Crimson & Gold",
        isDark: true,
        bgGrad: ["#380612", "#5c0b20", "#26030b"],
        headerText: "#fef08a",
        headerSub: "#fde047",
        bannerBg: ["#700e26", "#420615"],
        bannerBorder: "#d4af37",
        bannerText: "#ffffff",
        titleGrad: ["#fff9c4", "#f59e0b", "#b45309", "#78350f"],
        titleStroke: "#420615",
        titleShadow: "#700e26",
        blessingColor: "#fef08a",
        greetingColor: "#fbbf24",
        dividerColor: "#d4af37",
        badgeBg: ["#700e26", "#420615", "#700e26"],
        badgeBorder: "#d4af37",
        badgeText: "#fef08a",
        badgeScript: "#ffffff",
        ribbonBg: ["#700e26", "#420615", "#700e26"],
        ribbonBorder: "#d4af37",
        ribbonText: "#ffffff",
        footerBg: "#170207",
        addrBoxBg: ["#1c060d", "#2d0b17", "#1c060d"],
        addrBoxBorder: "#d4af37",
        footerBlessingColor: "#fef3c7",
      },
      {
        variantName: "Midnight Velvet & Champagne Gold",
        isDark: true,
        bgGrad: ["#070d24", "#0e1a47", "#05091a"],
        headerText: "#fef08a",
        headerSub: "#bae6fd",
        bannerBg: ["#142566", "#0b1438"],
        bannerBorder: "#facc15",
        bannerText: "#ffffff",
        titleGrad: ["#fffbeb", "#fde047", "#f59e0b", "#d97706"],
        titleStroke: "#0b1438",
        titleShadow: "#142566",
        blessingColor: "#bae6fd",
        greetingColor: "#facc15",
        dividerColor: "#facc15",
        badgeBg: ["#142566", "#0b1438", "#142566"],
        badgeBorder: "#facc15",
        badgeText: "#fde047",
        badgeScript: "#ffffff",
        ribbonBg: ["#142566", "#0b1438", "#142566"],
        ribbonBorder: "#facc15",
        ribbonText: "#ffffff",
        footerBg: "#030612",
        addrBoxBg: ["#091333", "#112257", "#091333"],
        addrBoxBorder: "#facc15",
        footerBlessingColor: "#e0f2fe",
      },
      {
        variantName: "Auspicious Saffron & Royal Ivory",
        isDark: false,
        bgGrad: ["#fff8ed", "#faecd2", "#f5e0be"],
        headerText: "#581c87",
        headerSub: "#78350f",
        bannerBg: ["#581c87", "#3b0764"],
        bannerBorder: "#d4af37",
        bannerText: "#ffffff",
        titleGrad: ["#b91c1c", "#881337", "#4c0519"],
        titleStroke: "#d4af37",
        titleShadow: "#3b0764",
        blessingColor: "#451a03",
        greetingColor: "#78350f",
        dividerColor: "#d4af37",
        badgeBg: ["#7f1d1d", "#4c0519", "#2d0612"],
        badgeBorder: "#d4af37",
        badgeText: "#fef08a",
        badgeScript: "#ffffff",
        ribbonBg: ["#581c87", "#3b0764", "#581c87"],
        ribbonBorder: "#d4af37",
        ribbonText: "#ffffff",
        footerBg: "#2d0333",
        addrBoxBg: ["#120826", "#1c0f38", "#120826"],
        addrBoxBorder: "#d4af37",
        footerBlessingColor: "#fef3c7",
      }
    ]
  }
};

// Global tracking to cycle variants automatically on consecutive requests for the same festival
const festivalVariantCounters = {};

/**
 * Maps any user-provided festival string to its authentic design profile.
 */
function matchFestivalProfile(festivalName) {
  const norm = (festivalName || "").toLowerCase().trim();

  if (/shiv|mahadev|bholenath|shankar|sawan/i.test(norm)) return FESTIVAL_PROFILES.shivratri;
  if (/diwali|deepawali|deepavali|dhanteras|lakshmi/i.test(norm)) return FESTIVAL_PROFILES.diwali;
  if (/holi|dhuleti|rang|gulal/i.test(norm)) return FESTIVAL_PROFILES.holi;
  if (/eid|ramadan|ramzan|bakrid|muharram/i.test(norm)) return FESTIVAL_PROFILES.eid;
  if (/krishna|janmashtami|gokul/i.test(norm)) return FESTIVAL_PROFILES.janmashtami;
  if (/ganesh|vinayak|ganpati/i.test(norm)) return FESTIVAL_PROFILES.ganesh;
  if (/navratri|durga|dussehra|dasara|garba|dandiya/i.test(norm)) return FESTIVAL_PROFILES.navratri;
  if (/christmas|xmas|new year/i.test(norm)) return FESTIVAL_PROFILES.christmas;
  if (/rakhi|raksha|bandhan/i.test(norm)) return FESTIVAL_PROFILES.raksha_bandhan;
  if (/ram|navami|shri ram|ayodhya/i.test(norm)) return FESTIVAL_PROFILES.ram_navami;

  const fallback = { ...FESTIVAL_PROFILES.general };
  fallback.defaultHindiTitle = festivalName;
  fallback.defaultEnglishTitle = festivalName;
  return fallback;
}

/**
 * Creative Director AI Brain (Groq Qwen 3.8 27B).
 * Trained strictly according to the user's comprehensive design manifesto:
 * 1. Takes Festival Name, Festival Reference Image (Image 1), and Business Master (Image 2).
 * 2. Conceptual Zone Separation (Zone A: Protected Brand Zone; Zone B: Dynamic Festival Creative Zone).
 * 3. Enforces the "Remove Festival Name" test and "Remove Business Name" test.
 * 4. Extracts visual soul from Image 1, verifies factual brand information against Image 2.
 */
async function understandCampaign({
  festival,
  referenceCreative,
  businessCard,
  profile,
  variant,
  languagePreference = "auto",
  customNotes = "",
}) {
  const learnedContext = getLearnedContextPrompt();

  let effectiveLanguage = languagePreference;
  if (!effectiveLanguage || effectiveLanguage === "auto") {
    if (profile.defaultLanguage === "english" || /christmas|xmas|new year|holiday|valentine/i.test(festival)) {
      effectiveLanguage = "english";
    } else {
      effectiveLanguage = "hindi";
    }
  }

  const systemPrompt = `
You are the AI Creative Director and Social Media Poster Designer for "Kandhari Tent & Caterers" and "Dwarka Shri Lawn", located at Opp. Piller No. 37, Daroga Kheda, Kanpur Road, Lucknow.

${learnedContext}

YOUR CORE ROLE & RESPONSIBILITY:
Generate a brand-new, culturally authentic festival-specific promotional design package whenever provided with a festival name, a festival reference image (Image 1), and a business master template (Image 2).

LANGUAGE DIRECTIVE:
The target language for this campaign is: "${effectiveLanguage.toUpperCase()}".
${effectiveLanguage === "english" 
  ? "- Provide English main festival title (e.g. 'MERRY CHRISTMAS', 'SEASON'S GREETINGS', 'CELEBRATE DIWALI', 'HAPPY NEW YEAR').\n- Provide 2 to 3 poetic English blessing lines celebrating love, joy, peace, and togetherness.\n- Provide English sub-greeting (e.g. 'Season's Greetings & Joyful Cheer!', 'Wishing You Peace & Endless Joy!')."
  : "- Provide 2 to 3 poetic Devanagari Hindi blessing lines wishing divine grace, peace, and prosperity.\n- Provide bold Hindi festival title in Devanagari (e.g. 'महाशिवरात्रि', 'दीपावली महोत्सव', 'श्रीकृष्ण जन्माष्टमी', 'ईद मुबारक').\n- Provide Hindi sub-greeting ('की हार्दिक शुभकामनाएं!' or 'की मंगलमय शुभकामनाएं!')."
}

STRICT OPERATIONAL RULES:
1. ZONE A (Protected Business Identity):
   * Kandhari Tent & Caterers (Golden Prominence)
   * — Making Your Celebrations Memorable —
   * Dwarka Shri Lawn (Managed by Kandhari Tent and Caterers)
   * Verified Phones: 9305465848 | 9307908994 | 7355059566
   * Address: Opp. Piller No. 37, Daroga Kheda, Kanpur Road, Lucknow
2. ZONE B (Dynamic Festival Creative Zone):
   * Reimagined independently for every festival.
   * Controls main visual, background atmosphere, decorative elements, borders, festival typography, colors, lighting, and spiritual blessings.
3. ACT LIKE CHATGPT EVERY TIME: Formulate fresh, evocative blessings and engaging social copy each time called.
`;

  const userInstruction = `
Festival Name: "${festival}"
Selected Style Theme: "${variant.variantName}"
Target Language: "${effectiveLanguage}"
${customNotes ? "User Custom Notes: " + customNotes : ""}

Formulate an authentic, culturally rich, and poetic festive campaign package for "${festival}" in ${effectiveLanguage.toUpperCase()}.
Provide:
1. ${effectiveLanguage === "english" ? "English main festival headline (e.g. 'MERRY CHRISTMAS', 'SEASON'S GREETINGS')" : "Bold Hindi festival title in Devanagari (e.g. 'महाशिवरात्रि', 'दीपावली महोत्सव')"}
2. ${effectiveLanguage === "english" ? "English sub-greeting ('Season\'s Greetings & Holiday Cheer!' or 'Wishing You Peace & Joy!')" : "Sub-greeting in Hindi ('की हार्दिक शुभकामनाएं!' or 'की मंगलमय शुभकामनाएं!')"}
3. ${effectiveLanguage === "english" ? "2 to 3 poetic English blessing lines celebrating the festival spirit" : "2 to 3 poetic Devanagari Hindi blessing lines"}
4. English wish top (e.g. "✦ Joyous ✦", "✦ Divine ✦", "✦ Auspicious ✦", "✦ Mubarak ✦")
5. English festival badge title (e.g. "Christmas Cheer", "Holiday Magic", "Deepavali", "Janmashtami")
6. 3 short footer blessing lines in English
7. Promotional Instagram & WhatsApp caption under 380 characters celebrating ${festival} and welcoming lawn & event bookings at Kandhari Tent & Caterers / Dwarka Shri Lawn, Lucknow
8. Exactly 5 relevant hashtags

Return ONLY valid JSON matching this schema:
{
  "festival_name": "${festival}",
  "language": "${effectiveLanguage}",
  "english_main_title": "MERRY CHRISTMAS",
  "english_greeting": "Season's Greetings & Joyful Cheer!",
  "english_blessing_lines": [
    "Line 1",
    "Line 2",
    "Line 3"
  ],
  "hindi_festival_title": "Festival in Hindi",
  "hindi_greeting": "की हार्दिक शुभकामनाएं!",
  "hindi_blessing_lines": [
    "Line 1",
    "Line 2",
    "Line 3"
  ],
  "english_wish_top": "✦ Joyous ✦",
  "english_festival_title": "Festival Name",
  "footer_blessing_lines": [
    "Line 1",
    "Line 2",
    "Line 3"
  ],
  "caption": "Celebratory caption...",
  "hashtags": ["#Tag1", "#Tag2", "#Tag3", "#Tag4", "#Tag5"]
}
`;

  const userContent = [{ type: "text", text: userInstruction }];

  // Ingest Image 1 (Festival Reference) if provided
  if (referenceCreative && fs.existsSync(referenceCreative.path)) {
    const refDataUrl = await imageToOptimizedDataUrl(referenceCreative.path);
    userContent.push({
      type: "text",
      text: "Attached is Image 1 (Festival Reference Image). Extract its visual soul, symbolism, and cultural mood:"
    });
    userContent.push({
      type: "image_url",
      image_url: { url: refDataUrl }
    });
  }

  // Ingest Image 2 (Business Master Template) if provided
  if (businessCard && fs.existsSync(businessCard.path)) {
    const busDataUrl = await imageToOptimizedDataUrl(businessCard.path);
    userContent.push({
      type: "text",
      text: "Attached is Image 2 (Business Master Template). Use it as the strict source of truth for Kandhari Tent & Caterers & Dwarka Shri Lawn:"
    });
    userContent.push({
      type: "image_url",
      image_url: { url: busDataUrl }
    });
  }

  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent }
  ];

  let response;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      response = await groq.chat.completions.create({
        model: "qwen/qwen3.8-27b",
        messages,
        response_format: { type: "json_object" },
        temperature: 0.88,
        max_completion_tokens: 680,
      });
      break;
    } catch (err) {
      if (err.status === 429 && attempt < 3) {
        console.log(`Groq rate limit, waiting 4s (attempt ${attempt})...`);
        await new Promise((r) => setTimeout(r, 4000));
      } else {
        console.warn("Groq completion warning:", err.message);
        break;
      }
    }
  }

  if (response && response.choices && response.choices[0] && response.choices[0].message) {
    try {
      return JSON.parse(response.choices[0].message.content);
    } catch (e) {
      console.warn("JSON parse fallback:", e.message);
    }
  }

  return {
    festival_name: festival,
    language: effectiveLanguage,
    english_main_title: profile.defaultEnglishMainTitle || festival.toUpperCase(),
    english_greeting: profile.defaultEnglishGreeting || "Warm Festive Greetings & Best Wishes!",
    english_blessing_lines: profile.defaultEnglishBlessings || [
      `May the sacred joy and blessings of ${festival}`,
      "fill your hearts and home with enduring peace,",
      "and bring prosperity throughout the coming year."
    ],
    hindi_festival_title: profile.defaultHindiTitle,
    hindi_greeting: profile.defaultGreeting,
    hindi_blessing_lines: profile.defaultBlessings,
    english_wish_top: profile.defaultEnglishTop,
    english_festival_title: profile.defaultEnglishTitle,
    footer_blessing_lines: profile.defaultFooterBlessing,
    caption: `✨ Wishing you and your family a joyous and blessed ${festival}! Celebrate your special moments with Kandhari Tent & Caterers & Dwarka Shri Lawn, Lucknow. Book our royal lawn and premium event decor for your grand celebrations. 📞 9305465848 | 9307908994 | 7355059566 📍 Opp. Piller No. 37, Daroga Kheda, Kanpur Road, Lucknow`,
    hashtags: [
      `#${festival.replace(/\s+/g, "")}`,
      "#KandhariTentCaterers",
      "#DwarkaShriLawn",
      "#LucknowWeddings",
      "#EventDecor"
    ]
  };
}

function escapeXml(unsafe) {
  return String(unsafe || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function wrapHindiText(lines, maxChars = 32) {
  const result = [];
  const inputLines = Array.isArray(lines) ? lines : [String(lines || "")];
  for (const rawLine of inputLines) {
    const words = rawLine.split(/\s+/);
    let current = "";
    for (const word of words) {
      if ((current + " " + word).trim().length <= maxChars) {
        current = (current + " " + word).trim();
      } else {
        if (current) result.push(current);
        current = word;
      }
    }
    if (current) result.push(current);
  }
  return result.slice(0, 3);
}

/**
 * Generates festival-specific ornamental borders, atmospheric lighting, and traditional filigree.
 */
function getChristmasTopDecoration(width) {
  return `
  <!-- Christmas Evergreen Pine Boughs, Holly Berries & Hanging Golden Stars -->
  <defs>
    <radialGradient id="xmasStarGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#fffde7" stop-opacity="1" />
      <stop offset="50%" stop-color="#facc15" stop-opacity="0.8" />
      <stop offset="100%" stop-color="#ca8a04" stop-opacity="0" />
    </radialGradient>
  </defs>

  <!-- Top Pine Swag Garland across width -->
  <g fill="#14532d" opacity="0.95">
    ${Array.from({ length: 14 }).map((_, i) => {
      const x = 40 + i * 75;
      const y = (i % 2 === 0) ? 22 : 28;
      return `
        <ellipse cx="${x}" cy="${y}" rx="45" ry="18" fill="#15803d" />
        <ellipse cx="${x + 10}" cy="${y + 6}" rx="38" ry="14" fill="#166534" />
        <ellipse cx="${x - 10}" cy="${y + 4}" rx="32" ry="12" fill="#14532d" />
      `;
    }).join('\n')}
  </g>

  <!-- Holly Berries Clusters (Bright Crimson Red) -->
  <g fill="#dc2626">
    ${Array.from({ length: 13 }).map((_, i) => {
      const x = 80 + i * 75;
      const y = 32 + (i % 3) * 4;
      return `
        <circle cx="${x - 5}" cy="${y}" r="4.5" fill="#dc2626" />
        <circle cx="${x + 4}" cy="${y - 2}" r="4.5" fill="#ef4444" />
        <circle cx="${x}" cy="${y + 5}" r="4" fill="#b91c1c" />
        <circle cx="${x - 1}" cy="${y + 1}" r="1.5" fill="#ffffff" opacity="0.8" />
      `;
    }).join('\n')}
  </g>

  <!-- Hanging Golden Chains with Christmas Ornaments & Stars -->
  <line x1="85" y1="0" x2="85" y2="105" stroke="#ca8a04" stroke-width="1.2" stroke-dasharray="3 2" />
  <circle cx="85" cy="115" r="14" fill="#dc2626" stroke="#fbbf24" stroke-width="1.5" />
  <circle cx="82" cy="111" r="3" fill="#ffffff" opacity="0.6" />

  <line x1="145" y1="0" x2="145" y2="70" stroke="#ca8a04" stroke-width="1.2" stroke-dasharray="3 2" />
  <g transform="translate(145, 80) scale(0.8)">
    <polygon points="0,-12 3,-3 12,-3 5,3 8,12 0,6 -8,12 -5,3 -12,-3 -3,-3" fill="#facc15" stroke="#ca8a04" stroke-width="1" />
  </g>

  <line x1="940" y1="0" x2="940" y2="70" stroke="#ca8a04" stroke-width="1.2" stroke-dasharray="3 2" />
  <g transform="translate(940, 80) scale(0.8)">
    <polygon points="0,-12 3,-3 12,-3 5,3 8,12 0,6 -8,12 -5,3 -12,-3 -3,-3" fill="#facc15" stroke="#ca8a04" stroke-width="1" />
  </g>

  <line x1="1000" y1="0" x2="1000" y2="105" stroke="#ca8a04" stroke-width="1.2" stroke-dasharray="3 2" />
  <circle cx="1000" cy="115" r="14" fill="#15803d" stroke="#fbbf24" stroke-width="1.5" />
  <circle cx="997" cy="111" r="3" fill="#ffffff" opacity="0.6" />

  <!-- Twinkling fairy lights wire -->
  <path d="M 30 42 Q 270 75 542 42 Q 814 75 1055 42" stroke="#facc15" stroke-width="1" fill="none" opacity="0.7" />
  ${[100, 220, 340, 460, 620, 740, 860, 980].map(x => `
    <circle cx="${x}" cy="${50 + Math.sin(x)*8}" r="3.5" fill="#fef08a" />
    <circle cx="${x}" cy="${50 + Math.sin(x)*8}" r="7" fill="url(#xmasStarGlow)" />
  `).join('\n')}
  `;
}

function getEidTopDecoration(width) {
  return `
  <!-- Eid Grand Islamic Arabesque Arch & Hanging Brass Fanoos Lanterns -->
  <defs>
    <radialGradient id="fanoosGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#fffbeb" stop-opacity="1" />
      <stop offset="60%" stop-color="#fbbf24" stop-opacity="0.8" />
      <stop offset="100%" stop-color="#b45309" stop-opacity="0" />
    </radialGradient>
  </defs>

  <g fill="none" stroke="#d4af37" stroke-width="1.5" opacity="0.85">
    <path d="M 40 0 C 180 50 360 30 542 65 C 724 30 904 50 1045 0" />
    <path d="M 40 8 C 180 58 360 38 542 73 C 724 38 904 58 1045 8" stroke-dasharray="4 3" />
  </g>

  <!-- Hanging Brass Chains with Ornate Fanoos -->
  <line x1="110" y1="0" x2="110" y2="90" stroke="#ca8a04" stroke-width="1.2" stroke-dasharray="3 2" />
  <g transform="translate(95, 90) scale(0.7)" fill="#d4af37" stroke="#92400e" stroke-width="1.2">
    <polygon points="20,0 32,14 8,14" />
    <rect x="6" y="14" width="28" height="36" rx="4" fill="#fef08a" />
    <circle cx="20" cy="32" r="7" fill="#f59e0b" />
    <polygon points="6,50 20,64 34,50" fill="#d4af37" />
    <circle cx="20" cy="68" r="3" fill="#ca8a04" />
  </g>

  <line x1="975" y1="0" x2="975" y2="90" stroke="#ca8a04" stroke-width="1.2" stroke-dasharray="3 2" />
  <g transform="translate(960, 90) scale(0.7)" fill="#d4af37" stroke="#92400e" stroke-width="1.2">
    <polygon points="20,0 32,14 8,14" />
    <rect x="6" y="14" width="28" height="36" rx="4" fill="#fef08a" />
    <circle cx="20" cy="32" r="7" fill="#f59e0b" />
    <polygon points="6,50 20,64 34,50" fill="#d4af37" />
    <circle cx="20" cy="68" r="3" fill="#ca8a04" />
  </g>

  <!-- Crescent and Stars Accents -->
  <g transform="translate(170, 45) scale(0.65)" fill="#facc15">
    <path d="M 0 0 A 15 15 0 0 0 20 20 A 18 18 0 1 1 0 0 Z" />
    <polygon points="26,10 28,15 33,15 29,18 31,23 26,20 22,23 24,18 20,15 25,15" />
  </g>
  <g transform="translate(900, 45) scale(-0.65, 0.65)" fill="#facc15">
    <path d="M 0 0 A 15 15 0 0 0 20 20 A 18 18 0 1 1 0 0 Z" />
    <polygon points="26,10 28,15 33,15 29,18 31,23 26,20 22,23 24,18 20,15 25,15" />
  </g>
  `;
}

function getHoliTopDecoration(width) {
  return `
  <!-- Holi Dynamic Organic Color Splashes & Gulal Powders -->
  <defs>
    <filter id="splashGlow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="8" />
    </filter>
  </defs>

  <g transform="translate(80, 50)" opacity="0.9">
    <circle cx="0" cy="0" r="32" fill="#ea580c" opacity="0.6" filter="url(#splashGlow)" />
    <circle cx="-10" cy="-5" r="20" fill="#facc15" opacity="0.8" />
    <circle cx="18" cy="10" r="14" fill="#f43f5e" opacity="0.85" />
    <circle cx="30" cy="-15" r="6" fill="#06b6d4" />
    <circle cx="-25" cy="20" r="8" fill="#10b981" />
  </g>

  <g transform="translate(1005, 50)" opacity="0.9">
    <circle cx="0" cy="0" r="32" fill="#d946ef" opacity="0.6" filter="url(#splashGlow)" />
    <circle cx="10" cy="-5" r="20" fill="#06b6d4" opacity="0.8" />
    <circle cx="-18" cy="10" r="14" fill="#facc15" opacity="0.85" />
    <circle cx="-30" cy="-15" r="6" fill="#10b981" />
    <circle cx="25" cy="20" r="8" fill="#ea580c" />
  </g>

  <g fill="none" stroke-width="2" opacity="0.75">
    <path d="M 60 20 Q 280 60 542 25" stroke="#f43f5e" stroke-linecap="round" />
    <path d="M 542 25 Q 810 60 1025 20" stroke="#06b6d4" stroke-linecap="round" />
  </g>
  `;
}

function getTraditionalMarigoldTopDecoration(width) {
  return `
  <!-- Traditional Fresh Marigold Toran & Mango Leaves -->
  <defs>
    <radialGradient id="marigoldOrange" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#fb923c" />
      <stop offset="70%" stop-color="#ea580c" />
      <stop offset="100%" stop-color="#c2410c" />
    </radialGradient>
    <radialGradient id="marigoldYellow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#fef08a" />
      <stop offset="65%" stop-color="#facc15" />
      <stop offset="100%" stop-color="#eab308" />
    </radialGradient>
  </defs>

  <g>
    ${Array.from({ length: 18 }).map((_, i) => {
      const x = 40 + i * 58;
      const isYellow = i % 2 === 0;
      const y = 20 + Math.sin(i * 0.7) * 8;
      return `
        <path d="M ${x} 8 C ${x - 8} 25 ${x} 38 ${x} 42 C ${x} 38 ${x + 8} 25 ${x} 8 Z" fill="#15803d" opacity="0.85" />
        <circle cx="${x}" cy="${y + 12}" r="14" fill="url(${isYellow ? '#marigoldYellow' : '#marigoldOrange'})" stroke="#b45309" stroke-width="0.8" />
        <circle cx="${x}" cy="${y + 12}" r="6" fill="#fef08a" opacity="0.6" />
      `;
    }).join('\n')}
  </g>

  <line x1="115" y1="0" x2="115" y2="95" stroke="#b45309" stroke-width="1.2" stroke-dasharray="3 2" />
  <g transform="translate(100, 95) scale(0.65)" fill="#d4af37">
    <path d="M 0 12 C 18 35 42 18 42 12 C 30 12 12 12 0 12 Z" fill="#d4af37" stroke="#b45309" stroke-width="1" />
    <circle cx="21" cy="6" r="7" fill="#ef4444" opacity="0.9" />
    <circle cx="21" cy="4" r="3.5" fill="#fef08a" />
  </g>

  <line x1="970" y1="0" x2="970" y2="95" stroke="#b45309" stroke-width="1.2" stroke-dasharray="3 2" />
  <g transform="translate(955, 95) scale(0.65)" fill="#d4af37">
    <path d="M 0 12 C 18 35 42 18 42 12 C 30 12 12 12 0 12 Z" fill="#d4af37" stroke="#b45309" stroke-width="1" />
    <circle cx="21" cy="6" r="7" fill="#ef4444" opacity="0.9" />
    <circle cx="21" cy="4" r="3.5" fill="#fef08a" />
  </g>
  `;
}

function getShivratriTopDecoration(width) {
  return `
  <!-- Maha Shivratri Celestial Cosmic Stars, Sacred Moon & Temple Bells -->
  <defs>
    <radialGradient id="shivaMoon" cx="40%" cy="40%" r="60%">
      <stop offset="0%" stop-color="#ffffff" />
      <stop offset="70%" stop-color="#e0f2fe" />
      <stop offset="100%" stop-color="#38bdf8" />
    </radialGradient>
  </defs>

  <path d="M 40 15 Q 542 60 1045 15" stroke="#38bdf8" stroke-width="1.5" fill="none" opacity="0.7" stroke-dasharray="6 3" />

  <line x1="110" y1="0" x2="110" y2="95" stroke="#94a3b8" stroke-width="1.2" stroke-dasharray="3 2" />
  <g transform="translate(98, 95) scale(0.6)" fill="#e2e8f0" stroke="#475569" stroke-width="1.5">
    <path d="M 20 0 C 10 10 5 25 0 35 L 40 35 C 35 25 30 10 20 0 Z" />
    <circle cx="20" cy="38" r="4" fill="#38bdf8" />
  </g>

  <line x1="975" y1="0" x2="975" y2="95" stroke="#94a3b8" stroke-width="1.2" stroke-dasharray="3 2" />
  <g transform="translate(963, 95) scale(0.6)" fill="#e2e8f0" stroke="#475569" stroke-width="1.5">
    <path d="M 20 0 C 10 10 5 25 0 35 L 40 35 C 35 25 30 10 20 0 Z" />
    <circle cx="20" cy="38" r="4" fill="#38bdf8" />
  </g>

  <g transform="translate(170, 45) scale(0.7)" fill="url(#shivaMoon)">
    <path d="M 0 0 A 15 15 0 0 0 20 20 A 18 18 0 1 1 0 0 Z" />
  </g>
  <g transform="translate(900, 45) scale(-0.7, 0.7)" fill="url(#shivaMoon)">
    <path d="M 0 0 A 15 15 0 0 0 20 20 A 18 18 0 1 1 0 0 Z" />
  </g>
  `;
}

/**
 * PURE CLEAN-CANVAS 6-LAYER RENDERER
 * Guarantees zero leftover elements from prior festivals.
 */
async function compositeFestivalCreative({ festivalData, profile, variant, variantIndex, bgPattern = null, customOverrides = {} }) {
  const width = 1085;
  const height = 1449;

  const assetsDir = path.join(__dirname, "assets");
  const motifsDir = path.join(assetsDir, "motifs");
  const outputDir = path.join(__dirname, "public", "generated");

  fs.mkdirSync(outputDir, { recursive: true });
  const outputFile = path.join(
    outputDir,
    `festival-${festivalData.festival_name.toLowerCase().replace(/[^a-z0-9]/g, "-")}-var${variantIndex + 1}-${Date.now()}.jpg`
  );

  const festLower = (festivalData.festival_name || profile.name || "").toLowerCase();
  let topDecorationSvg = '';
  let bgGradColors = ['#fffdf7', '#fef8ea', '#faedd5'];
  let scriptColor = '#3b074d';
  let titleColor = '#881337';
  let titleStroke = '#4c0519';
  let blessingColor = '#2c0838';
  let subGreetingColor = '#3b074d';
  let footerBgColor = '#28052f';

  if (festLower.includes('christmas')) {
    topDecorationSvg = getChristmasTopDecoration(width);
    bgGradColors = ['#fffdf7', '#fef7e8', '#faedd5'];
    scriptColor = '#14532d'; // Evergreen
    titleColor = '#b91c1c';  // Holiday Ruby
    titleStroke = '#7f1d1d';
    blessingColor = '#14532d';
    subGreetingColor = '#b91c1c';
    footerBgColor = '#1b040a'; // Holiday deep ruby
  } else if (festLower.includes('eid')) {
    topDecorationSvg = getEidTopDecoration(width);
    bgGradColors = ['#fffef8', '#f8faf7', '#eaf2ea'];
    scriptColor = '#065f46'; // Emerald
    titleColor = '#047857';
    titleStroke = '#064e3b';
    blessingColor = '#064e3b';
    subGreetingColor = '#d97706';
    footerBgColor = '#032115'; // Deep emerald
  } else if (festLower.includes('holi')) {
    topDecorationSvg = getHoliTopDecoration(width);
    bgGradColors = ['#fffdfa', '#fef8f4', '#fdf2eb'];
    scriptColor = '#c026d3'; // Magenta
    titleColor = '#e11d48';  // Rose
    titleStroke = '#881337';
    blessingColor = '#471249';
    subGreetingColor = '#d97706';
    footerBgColor = '#270a2a';
  } else if (festLower.includes('shivratri')) {
    topDecorationSvg = getShivratriTopDecoration(width);
    bgGradColors = ['#fffdfa', '#f6f9fe', '#e8f0fe'];
    scriptColor = '#1e3a8a'; // Sacred Blue
    titleColor = '#1e3a8a';
    titleStroke = '#0f172a';
    blessingColor = '#0f172a';
    subGreetingColor = '#0284c7';
    footerBgColor = '#070b1a'; // Cosmic Indigo
  } else {
    // Ganesh Chaturthi, Diwali, Navratri, Ram Navami, Raksha Bandhan
    topDecorationSvg = getTraditionalMarigoldTopDecoration(width);
    bgGradColors = ['#fffdf7', '#fef8ea', '#faedd5'];
    scriptColor = '#3b074d';
    titleColor = '#881337';
    titleStroke = '#4c0519';
    blessingColor = '#2c0838';
    subGreetingColor = '#3b074d';
    footerBgColor = '#28052f';
  }

  // Handle custom background override from user prompt
  if (customOverrides.bgColor) {
    const c = String(customOverrides.bgColor).toLowerCase();
    if (c.includes('lilac') || c.includes('pink')) {
      bgGradColors = ['#52144e', '#802379', '#380936'];
      blessingColor = '#fef3c7';
      titleColor = '#ffd700';
      titleStroke = '#b45309';
      subGreetingColor = '#fef08a';
      scriptColor = '#fef08a';
    } else {
      const resolved = resolveBgGradient(customOverrides.bgColor, bgGradColors);
      if (resolved && resolved.length >= 2) {
        bgGradColors = resolved;
        blessingColor = '#fef3c7';
        titleColor = '#ffd700';
        titleStroke = '#b45309';
        subGreetingColor = '#fef08a';
        scriptColor = '#fef08a';
      }
    }
  }

  const isEnglish = festivalData.language === 'english';

  let mainFestivalTitle = '';
  let subGreetingText = '';
  let formattedBlessings = [];

  if (isEnglish) {
    mainFestivalTitle = (festivalData.english_main_title || festivalData.english_festival_title || festivalData.festival_name || 'CELEBRATION').toUpperCase().trim();
    subGreetingText = festivalData.english_greeting || "Season's Greetings & Holiday Cheer!";
    const rawEngBlessings = festivalData.english_blessing_lines || [
      `Wishing you joy and peace on ${festivalData.festival_name}.`,
      "May your celebrations be filled with treasured moments.",
      "Making your celebrations memorable with Kandhari Tent & Caterers."
    ];
    formattedBlessings = wrapHindiText(rawEngBlessings, 32);
  } else {
    mainFestivalTitle = (festivalData.hindi_festival_title || profile.defaultHindiTitle || festivalData.festival_name || '').trim();
    subGreetingText = festivalData.hindi_greeting || profile.defaultGreeting || 'की हार्दिक शुभकामनाएं!';
    formattedBlessings = wrapHindiText(
      festivalData.hindi_blessing_lines || profile.defaultBlessings || [
        "भगवान की असीम कृपा से आपका जीवन",
        "सदा सुख, शांति और समृद्धि से परिपूर्ण रहे।"
      ],
      28
    );
  }

  const badgeHeadline = isEnglish ? (festLower.includes('christmas') ? '• Holiday Season •' : '• Best Wishes •') : (profile.defaultBadgeHeadline || '• Shubh •');
  const badgeScript = isEnglish ? (festLower.includes('christmas') ? 'Merry Christmas' : festivalData.festival_name) : (festivalData.english_festival_title || profile.defaultEnglishTitle || festivalData.festival_name);

  const footerBlessingLines = festivalData.footer_blessing_lines || profile.defaultFooterBlessing || [
    `May this auspicious festival bring`,
    "peace, happiness and prosperity",
    "into your home."
  ];

  // Dynamic Base Canvas SVG (1085 x 1449)
  const baseCanvasSvg = `
  <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <!-- LAYER 6: Canvas Background Gradient -->
      <linearGradient id="canvasBg" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="${bgGradColors[0]}" />
        <stop offset="40%" stop-color="${bgGradColors[1]}" />
        <stop offset="85%" stop-color="${bgGradColors[2]}" />
        <stop offset="100%" stop-color="${bgGradColors[2]}" />
      </linearGradient>

      <!-- Golden Sunburst Aura for Deity / Motif -->
      <radialGradient id="sunburstHalo" cx="72%" cy="48%" r="42%">
        <stop offset="0%" stop-color="#ffe899" stop-opacity="0.9" />
        <stop offset="35%" stop-color="#fff1ba" stop-opacity="0.6" />
        <stop offset="70%" stop-color="${bgGradColors[1]}" stop-opacity="0.2" />
        <stop offset="100%" stop-color="${bgGradColors[1]}" stop-opacity="0" />
      </radialGradient>

      <!-- 3D Title Shadow -->
      <filter id="title3dShadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="1" dy="2.5" stdDeviation="2.2" flood-color="#4a044e" flood-opacity="0.45" />
      </filter>

      <!-- Royal Metallic Gold Foil Gradient -->
      <linearGradient id="goldMetallic" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#fff5c0" />
        <stop offset="25%" stop-color="#ffd700" />
        <stop offset="50%" stop-color="#d4af37" />
        <stop offset="75%" stop-color="#aa771c" />
        <stop offset="100%" stop-color="#ffd700" />
      </linearGradient>

      ${(bgPattern === 'color_splashes' || bgPattern === 'water_splashes') ? `
      <filter id="splashBlur" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="40" />
      </filter>
      ` : ''}
    </defs>

    <!-- LAYER 6: Pure Clean Background -->
    <rect x="0" y="0" width="${width}" height="${height}" fill="url(#canvasBg)" />

    <!-- Thin Golden Side Border Lines (Preserved Brand DNA) -->
    <line x1="95" y1="20" x2="95" y2="1265" stroke="#d4af37" stroke-width="1.4" opacity="0.6" />
    <line x1="990" y1="20" x2="990" y2="1265" stroke="#d4af37" stroke-width="1.4" opacity="0.6" />

    <!-- Golden Sunburst behind Deity in Creative Zone -->
    <rect x="420" y="340" width="570" height="425" fill="url(#sunburstHalo)" />

    ${(bgPattern === 'color_splashes' || bgPattern === 'water_splashes') ? getWaterSplashesSvg(width, 760) : ''}

    <!-- ============================================== -->
    <!-- LAYER 5: FESTIVAL-SPECIFIC TOP DECORATION       -->
    <!-- ============================================== -->
    ${topDecorationSvg}

    <!-- ============================================== -->
    <!-- LAYER 1: PERMANENT BUSINESS BRAND HEADER       -->
    <!-- ============================================== -->
    <g transform="translate(542, 45)">
      <!-- Lotus Crest -->
      <g transform="translate(0, 0) scale(0.95)">
        <path d="M 0 -12 C 8 -24 24 -16 20 0 C 14 12 0 18 0 18 C 0 18 -14 12 -20 0 C -24 -16 -8 -24 0 -12 Z" fill="#d4af37" />
        <path d="M -16 2 C -32 -6 -38 12 -22 18 C -14 21 0 18 0 18 C 0 18 -14 21 -22 18 Z" fill="#b91c1c" />
        <path d="M 16 2 C 32 -6 38 12 22 18 C 14 21 0 18 0 18 C 0 18 14 21 22 18 Z" fill="#b91c1c" />
        <circle cx="0" cy="2" r="3" fill="#fef08a" />
      </g>

      <!-- Grand Brand Title: KANDHARI (prominent, regal) -->
      <text x="0" y="62" text-anchor="middle"
            font-family="'Playfair Display', 'Cinzel', 'Georgia', serif" 
            font-size="46" font-weight="900" letter-spacing="3.5"
            fill="${customOverrides.kandhariColor || '#3b0840'}">
        KANDHARI
      </text>
      <text x="0" y="96" text-anchor="middle"
            font-family="'Cinzel', 'Georgia', serif" 
            font-size="22" font-weight="bold" letter-spacing="5"
            fill="${customOverrides.kandhariColor || '#4a0d52'}">
        TENT &amp; CATERERS
      </text>
      <text x="0" y="122" text-anchor="middle"
            font-family="'Georgia', serif" font-style="italic"
            font-size="14.5" fill="#7a2588" letter-spacing="1.5">
        — Making Your Celebrations Memorable —
      </text>

      <!-- DWARKA SHRI LAWN Curved Shield Banner -->
      <g transform="translate(0, 180)">
        <path d="M -260 0 C -240 -15 -210 -25 0 -25 C 210 -25 240 -15 260 0 C 240 15 210 25 0 25 C -210 25 -240 15 -260 0 Z" 
              fill="#2d0636" stroke="#d4af37" stroke-width="1.8" />
        <text x="0" y="-3" text-anchor="middle"
              font-family="'Cinzel', 'Georgia', serif" font-size="22" font-weight="900" letter-spacing="2"
              fill="${customOverrides.dwarkaTextColor || '#ffffff'}">
          DWARKA SHRI LAWN
        </text>
        <text x="0" y="15" text-anchor="middle"
              font-family="'Georgia', serif" font-size="12" font-weight="normal" letter-spacing="1"
              fill="#fde68a">
          Managed by Kandhari Tent and Caterers
        </text>
      </g>
    </g>

    <!-- Top-Right Dynamic Festival Script Badge -->
    <g transform="translate(935, 205)">
      <text x="0" y="-20" text-anchor="middle"
            font-family="'Georgia', serif" font-size="14" font-style="italic" font-weight="bold" fill="${scriptColor}">
        ${escapeXml(badgeHeadline)}
      </text>
      ${(() => {
        const parts = badgeScript.split(' ');
        if (parts.length === 1) {
          return `
          <text x="0" y="18" text-anchor="middle"
                font-family="'Segoe Script', 'Brush Script MT', cursive, serif" font-size="26" font-weight="bold" fill="${scriptColor}">
            ${escapeXml(parts[0])}
          </text>`;
        } else {
          return `
          <text x="0" y="8" text-anchor="middle"
                font-family="'Segoe Script', 'Brush Script MT', cursive, serif" font-size="22" font-weight="bold" fill="${scriptColor}">
            ${escapeXml(parts[0])}
          </text>
          <text x="0" y="38" text-anchor="middle"
                font-family="'Segoe Script', 'Brush Script MT', cursive, serif" font-size="22" font-weight="bold" fill="${scriptColor}">
            ${escapeXml(parts.slice(1).join(' '))}
          </text>`;
        }
      })()}
      <g transform="translate(0, 58) scale(0.68)" fill="none" stroke="${scriptColor}" stroke-width="1.6">
        <path d="M -25 0 C -15 10 0 -5 0 0 C 0 -5 15 10 25 0" />
        <circle cx="0" cy="0" r="2.5" fill="${scriptColor}" />
      </g>
    </g>

    <!-- ============================================== -->
    <!-- LAYER 4: FESTIVAL CREATIVE & TYPOGRAPHY       -->
    <!-- ============================================== -->
    <!-- Auspicious Blessings -->
    <text x="125" y="405" font-family="${isEnglish ? "'Playfair Display', 'Georgia', serif" : "'Nirmala UI', 'Mangal', sans-serif"}" 
          font-size="${isEnglish ? 20 : 21.5}" font-style="${isEnglish ? 'italic' : 'normal'}" font-weight="bold" fill="${blessingColor}" letter-spacing="0.2">
      ${formattedBlessings.map((l, i) => `<tspan x="125" dy="${i === 0 ? 0 : 34}">${escapeXml(l)}</tspan>`).join('\n')}
    </text>

    <!-- Golden Flourish Divider with Diamond -->
    <g transform="translate(125, 515)">
      <line x1="0" y1="0" x2="110" y2="0" stroke="#d4af37" stroke-width="1.8" />
      <path d="M 120 -6 L 126 0 L 120 6 L 114 0 Z" fill="#b45309" stroke="#d4af37" stroke-width="1" />
      <circle cx="120" cy="0" r="2" fill="#fef08a" />
      <circle cx="132" cy="0" r="2" fill="#d4af37" />
      <circle cx="108" cy="0" r="2" fill="#d4af37" />
      <line x1="138" y1="0" x2="250" y2="0" stroke="#d4af37" stroke-width="1.8" />
    </g>

    <!-- Main Bold 3D Festival Headline -->
    <text x="125" y="590" font-family="${isEnglish ? "'Playfair Display', 'Cinzel', serif" : "'Nirmala UI', 'Mangal', sans-serif"}" 
          font-size="${mainFestivalTitle.length > 14 ? 40 : 50}" font-weight="900" letter-spacing="${isEnglish ? 1.5 : 0.5}"
          fill="${titleColor}" stroke="${titleStroke}" stroke-width="0.8" filter="url(#title3dShadow)">
      ${escapeXml(mainFestivalTitle)}
    </text>

    <!-- Sub-Greeting -->
    <text x="125" y="645" font-family="${isEnglish ? "'Playfair Display', 'Georgia', serif" : "'Nirmala UI', 'Mangal', sans-serif"}" 
          font-size="${isEnglish ? 22 : 26}" font-style="${isEnglish ? 'italic' : 'normal'}" font-weight="bold" fill="${subGreetingColor}" letter-spacing="0.4">
      ${escapeXml(subGreetingText)}
    </text>

    <!-- ============================================== -->
    <!-- LAYER 2: PROTECTED CONTACT FOOTER             -->
    <!-- ============================================== -->
    <rect x="0" y="1265" width="${width}" height="184" fill="${footerBgColor}" />
    <line x1="0" y1="1265" x2="${width}" y2="1265" stroke="#d4af37" stroke-width="1.6" />

    <!-- Left Footer: Book Now + Phone Numbers -->
    <g transform="translate(80, 1315)">
      <!-- Golden Phone Icon -->
      <g transform="translate(15, -12) scale(0.85)" fill="#f59e0b">
        <circle cx="0" cy="0" r="22" fill="#fbbf24" opacity="0.2" />
        <circle cx="0" cy="0" r="18" fill="#f59e0b" />
        <path d="M -7 -4 C -7 3 2 10 7 10 C 9 10 10 8 9 7 L 7 4 C 6 3 5 3 4 4 L 3 5 C 1 4 -1 2 -2 0 L -1 -1 C 0 -2 0 -3 -1 -4 L -4 -6 C -5 -7 -7 -6 -7 -4 Z" fill="#ffffff" />
      </g>
      <text x="50" y="-3" font-family="'Georgia', serif" font-style="italic" font-size="18" fill="#fef08a">Book Now:</text>
      <text x="155" y="-3" font-family="'Arial', sans-serif" font-size="19" font-weight="bold" fill="${customOverrides.phoneColor || '#ffffff'}" letter-spacing="1">
        9305465848   |   9307908994   |   7355059566
      </text>
    </g>

    <!-- Address Box with Golden Border cleanly enclosing Lucknow -->
    <rect x="75" y="1348" width="620" height="44" rx="10" ry="10"
          fill="#1b0321" stroke="#d4af37" stroke-width="1.4" />
    <g transform="translate(98, 1360) scale(0.7)">
      <path d="M 0 0 C -7 0 -13 6 -13 13 C -13 22 0 32 0 32 C 0 32 13 22 13 13 C 13 6 7 0 0 0 Z" fill="#f59e0b" />
      <circle cx="0" cy="12" r="4.5" fill="#ffffff" />
    </g>
    <text x="385" y="1375" text-anchor="middle"
          font-family="'Times New Roman', 'Georgia', serif" font-size="13.5" font-weight="bold" fill="#ffffff" letter-spacing="0.4">
      Opp. Piller No. 37, Daroga Kheda, Kanpur Road, Lucknow
    </text>

    <!-- Vertical Gold Divider -->
    <line x1="740" y1="1280" x2="740" y2="1430" stroke="#d4af37" stroke-width="1.4" opacity="0.6" />

    <!-- Right Footer: Dynamic Festival Blessing -->
    <text x="875" y="1300" text-anchor="middle"
          font-family="'Georgia', serif" font-size="14.5" font-style="italic" fill="#fef3c7" line-height="1.5">
      ${footerBlessingLines.map((l, i) => `<tspan x="875" dy="${i === 0 ? 0 : 23}">${escapeXml(l)}</tspan>`).join('\n')}
    </text>

    <!-- Golden Lotus Ornament at bottom right -->
    <g transform="translate(875, 1375) scale(0.75)" fill="#d4af37">
      <path d="M 0 -8 C 5 -16 16 -10 12 0 C 8 8 0 12 0 12 C 0 12 -8 8 -12 0 C -16 -10 -5 -16 0 -8 Z" />
      <circle cx="0" cy="0" r="2" fill="#ffffff" />
      <line x1="-35" y1="0" x2="-18" y2="0" stroke="#d4af37" stroke-width="1.2" />
      <line x1="18" y1="0" x2="35" y2="0" stroke="#d4af37" stroke-width="1.2" />
      <circle cx="-38" cy="0" r="2" fill="#d4af37" />
      <circle cx="38" cy="0" r="2" fill="#d4af37" />
    </g>
  </svg>
  `;

  // Hero Deity Artwork (feathered oval mask)
  const deityW = 440;
  const deityH = 410;
  const deityMaskSvg = `
  <svg width="${deityW}" height="${deityH}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <filter id="softFilt" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="7" />
      </filter>
      <radialGradient id="deityMask" cx="50%" cy="50%" r="50%">
        <stop offset="65%" stop-color="#ffffff" stop-opacity="1" />
        <stop offset="85%" stop-color="#ffffff" stop-opacity="0.85" />
        <stop offset="97%" stop-color="#ffffff" stop-opacity="0.2" />
        <stop offset="100%" stop-color="#ffffff" stop-opacity="0" />
      </radialGradient>
    </defs>
    <ellipse cx="${deityW/2}" cy="${deityH/2}" rx="${deityW/2 - 12}" ry="${deityH/2 - 12}" fill="url(#deityMask)" filter="url(#softFilt)" />
  </svg>
  `;

  let deityBuf = null;
  const heroPath = path.join(motifsDir, profile.motifFile || "ganesh_golden.jpg");
  if (fs.existsSync(heroPath)) {
    deityBuf = await sharp(heroPath)
      .resize(deityW, deityH, { fit: "cover", position: "center" })
      .composite([{ input: Buffer.from(deityMaskSvg), blend: "dest-in" }])
      .png()
      .toBuffer();
  }

  // Load Real Approved Venue Photos (Layer 3)
  const venuePhotosPath = path.join(assetsDir, 'venue_photos.png');
  const venuePhotosBuf = await sharp(venuePhotosPath)
    .resize(1015, 260, { fit: 'inside' })
    .toBuffer();

  // Load Service Icons Strip (Layer 2)
  const serviceIconsPath = path.join(assetsDir, 'service_icons.png');
  const serviceIconsBuf = await sharp(serviceIconsPath)
    .resize(925, 140, { fit: 'inside' })
    .toBuffer();

  // Load Celebration Ribbon (Layer 3)
  const ribbonPath = path.join(assetsDir, 'ribbon_clean.png');
  const ribbonBuf = await sharp(ribbonPath)
    .resize(750, 60, { fit: 'inside' })
    .toBuffer();

  const layers = [
    { input: Buffer.from(baseCanvasSvg), top: 0, left: 0 }
  ];

  if (deityBuf) {
    layers.push({ input: deityBuf, top: 350, left: 535 });
  }

  // Layer 3: Ribbon at y = 765
  layers.push({ input: ribbonBuf, top: 765, left: 167 });

  // Layer 2: Service Icons at y = 830
  layers.push({ input: serviceIconsBuf, top: 830, left: 80 });

  // Layer 3: Venue Photos at y = 980
  layers.push({ input: venuePhotosBuf, top: 980, left: 35 });

  // Optional Ribbon Custom Text Overlay
  if (customOverrides.ribbonText && customOverrides.ribbonText !== "Celebrate Your Special Moments With Us") {
    const ribSvg = `
    <svg width="600" height="32" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="600" height="32" rx="10" fill="#2d0636" />
      <text x="300" y="22" text-anchor="middle" font-family="'Playfair Display', 'Georgia', serif" font-size="19" font-weight="bold" font-style="italic" fill="#fef08a">
        ${escapeXml(customOverrides.ribbonText)}
      </text>
    </svg>`;
    layers.push({ input: Buffer.from(ribSvg), top: 768, left: 242 });
  }

  // PURE CLEAN CANVAS: Base is created from scratch with pure background color
  const buffer = await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: bgGradColors[0]
    }
  })
    .composite(layers)
    .jpeg({ quality: 96 })
    .toBuffer();

  try {
    fs.writeFileSync(outputFile, buffer);
  } catch (err) {
    console.warn("Filesystem write warning (cloud ephemeral mode):", err.message);
  }

  const imageDataUrl = `data:image/jpeg;base64,${buffer.toString("base64")}`;

  return {
    imageUrl: `/generated/${path.basename(outputFile)}`,
    imageDataUrl,
  };
}

/**
 * Main Agent Orchestrator:
 * 1. Matches Festival Profile & selects the dynamic design variant (cycling automatically for multiple clicks).
 * 2. Ingests Image 1 (Festival Reference) & Image 2 (Business Master) through AI Vision.
 * 3. Formulates culturally authentic Hindi blessings and marketing copy.
 * 4. Composites brand-new festival creative while strictly preserving Zone A protected brand facts.
 */
async function analyzeBrandAndCreateCampaign({
  festival,
  referenceCreative,
  businessCard,
  preferredVariant = null,
  languagePreference = "auto",
  bgPattern = null,
  customNotes = "",
  customOverrides = {},
}) {
  const store = loadLearnings();
  const rules = store.systemLearnedRules || [];

  // Apply persistent brand rules if not overridden explicitly:
  // 1. Golden Brand Prominence Rule
  if (!customOverrides.kandhariColor) {
    const hasGoldBrand = rules.some(r => r.category === "branding" && /gold/i.test(r.rule));
    if (hasGoldBrand) {
      customOverrides.kandhariColor = "url(#goldMetallic)";
    }
  }

  // 2. Global / English Language Rule for Christmas/New Year
  if (languagePreference === "auto") {
    const festName = String(festival || "").toLowerCase();
    if (festName.includes("christmas") || festName.includes("new year")) {
      languagePreference = "english";
    }
  }

  const profile = matchFestivalProfile(festival);
  const totalVariants = profile.variants.length;

  // Variant Selection: Explicit or auto-cycle on repeated clicks for the same festival
  let variantIndex = 0;
  if (preferredVariant !== null && !isNaN(parseInt(preferredVariant, 10))) {
    variantIndex = Math.abs(parseInt(preferredVariant, 10)) % totalVariants;
  } else {
    const currentCount = festivalVariantCounters[profile.id] || 0;
    variantIndex = currentCount % totalVariants;
    festivalVariantCounters[profile.id] = currentCount + 1;
  }

  const variant = profile.variants[variantIndex];
  const effectivePattern = bgPattern || profile.defaultBgPattern || "printed_damask";

  console.log(`\n======================================================`);
  console.log(`🎨 Festival: "${festival}" -> Profile: "${profile.name}"`);
  console.log(`✨ Selected Design Variant [${variantIndex + 1}/${totalVariants}]: "${variant.variantName}"`);
  console.log(`🖼️  Motif Artwork: ${profile.motifFile} | Texture Pattern: ${effectivePattern}`);
  console.log(`🌐 Language Preference: "${languagePreference}"`);
  console.log(`======================================================`);

  console.log(`✍️  Formulating authentic festival copy via AI brain...`);
  const festivalData = await understandCampaign({
    festival,
    referenceCreative,
    businessCard,
    profile,
    variant,
    languagePreference,
    customNotes,
  });

  console.log(`🎨 Compositing dynamic festival creative with printed texture...`);
  const { imageUrl, imageDataUrl } = await compositeFestivalCreative({
    festivalData,
    profile,
    variant,
    variantIndex,
    bgPattern: effectivePattern,
    customOverrides,
  });

  console.log(`✅ Design ready: ${imageUrl}\n`);

  return {
    imageUrl,
    imageDataUrl,
    caption: festivalData.caption,
    hashtags: festivalData.hashtags.slice(0, 5),
    festival: festivalData.festival_name,
    language: festivalData.language || "hindi",
    themeName: variant.variantName,
    bgPattern: effectivePattern,
    variantIndex: variantIndex + 1,
    totalVariants,
  };
}


/**
 * Interactive Redesign via Chatbot Prompt:
 * Analyzes the user's natural language redesign request, adjusts design parameters,
 * logs to persistent memory store, and regenerates the festival poster.
 */
/**
 * Interactive Redesign via Chatbot Prompt:
 * Analyzes the user's natural language redesign request, adjusts design parameters,
 * prevents festival hallucination, logs to persistent memory store, and regenerates the poster.
 */
async function redesignCampaignWithPrompt({
  userPrompt,
  currentFestival,
  currentVariantIndex = 0,
}) {
  const activeFestival = currentFestival || "Maha Shivratri";

  // Check if user EXPLICITLY wants to switch to a different festival
  let targetFestival = activeFestival;
  const switchRegex = /(?:switch\s+(?:the\s+festival\s+)?to|redesign\s+for|change\s+(?:festival\s+)?to|create\s+(?:a\s+)?(?:poster\s+for\s+))([a-z\s]+)/i;
  const switchMatch = userPrompt.match(switchRegex);
  if (switchMatch && switchMatch[1]) {
    const matched = matchFestivalProfile(switchMatch[1].trim());
    if (matched && matched.name) {
      targetFestival = matched.name;
    }
  } else {
    // Check if the prompt starts with a distinct festival name
    for (const [k, prof] of Object.entries(FESTIVAL_PROFILES)) {
      if (prof.name.toLowerCase() !== activeFestival.toLowerCase()) {
        const regex = new RegExp(`^\\s*${prof.name}\\b`, 'i');
        if (regex.test(userPrompt)) {
          targetFestival = prof.name;
          break;
        }
      }
    }
  }

  // Extract component overrides from prompt
  const customOverrides = {};

  // Background Color override (e.g. "lilac pink", "pink", "navy blue", "emerald green", "gold")
  const bgColMatch = userPrompt.match(/(?:background(?:\s+color)?\s+(?:to\s+|in\s+)?([a-z\s]+?)(?:\s+from|\s+and|\s+with|\s*$))/i);
  if (bgColMatch && bgColMatch[1]) {
    const colStr = bgColMatch[1].trim();
    if (/lilac|pink|purple|violet|blue|navy|green|emerald|maroon|ruby|saffron|orange|gold|yellow|black|charcoal|white|ivory/i.test(colStr)) {
      customOverrides.bgColor = colStr;
    }
  } else if (/lilac\s*pink/i.test(userPrompt)) {
    customOverrides.bgColor = "lilac pink";
  } else if (/pink/i.test(userPrompt) && /background/i.test(userPrompt)) {
    customOverrides.bgColor = "pink";
  }

  // Splashes / Multi-color Water Splashes / Gulal
  let detectedBgPattern = null;
  if (/splash|multi-colou?r|water\s*splash|gulal/i.test(userPrompt)) {
    detectedBgPattern = "color_splashes";
    customOverrides.bgPattern = "color_splashes";
  } else if (/snow|winter|star|christmas/i.test(userPrompt)) {
    detectedBgPattern = "winter_stars";
  } else if (/damask|wallpaper/i.test(userPrompt)) {
    detectedBgPattern = "printed_damask";
  } else if (/mandala/i.test(userPrompt)) {
    detectedBgPattern = "festive_mandala";
  } else if (/jaali|lattice/i.test(userPrompt)) {
    detectedBgPattern = "royal_jaali";
  }

  // Phone / Mobile Numbers Color
  if (/(?:mobile|phone|number|contact)/i.test(userPrompt)) {
    if (/gold|golden|yellow/i.test(userPrompt)) {
      customOverrides.phoneColor = "gold";
    } else if (/silver/i.test(userPrompt)) {
      customOverrides.phoneColor = "silver";
    } else if (/white/i.test(userPrompt)) {
      customOverrides.phoneColor = "white";
    }
  }

  // Dwarka Shri Lawn Text Color
  if (/dwarka/i.test(userPrompt)) {
    if (/gold|golden/i.test(userPrompt)) customOverrides.dwarkaTextColor = "gold";
    else if (/silver/i.test(userPrompt)) customOverrides.dwarkaTextColor = "silver";
    else if (/white/i.test(userPrompt)) customOverrides.dwarkaTextColor = "white";
  }

  // Kandhari Brand Text Color
  if (/kandhari|brand/i.test(userPrompt)) {
    if (/gold|golden/i.test(userPrompt)) customOverrides.brandTextColor = "gold";
    else if (/silver/i.test(userPrompt)) customOverrides.brandTextColor = "silver";
  }

  // Ribbon Text
  const ribbonMatch = userPrompt.match(/ribbon(?:\s+text)?\s+(?:to\s+)?['"]([^'"]+)['"]/i);
  if (ribbonMatch && ribbonMatch[1]) {
    customOverrides.ribbonText = ribbonMatch[1].trim();
  }

  // Variant index (keep current unless user asked to cycle)
  let variantIndex = currentVariantIndex || 0;
  if (/next\s*(?:variant|style|option)|cycle|different\s*style|try\s*another/i.test(userPrompt)) {
    variantIndex = (variantIndex + 1) % 3;
  }

  const learnedContext = getLearnedContextPrompt();

  let decision = {
    festival: targetFestival,
    language: /english|eng/i.test(userPrompt) ? "english" : (/hindi|devanagari/i.test(userPrompt) ? "hindi" : "auto"),
    bgPattern: detectedBgPattern || (targetFestival.toLowerCase().includes("holi") ? "color_splashes" : "default"),
    variantIndex,
    customOverrides,
    reply: `I have updated the poster for ${targetFestival} as requested! ✨ The brand identity and protected contact details remain perfectly preserved. Is there anything else I can help you with?`,
    suggestedSections: [
      "🎨 Background: Lilac Pink",
      "💦 Multi-Color Water Splashes",
      "📞 Mobile Numbers: Golden",
      "🏛️ Dwarka Lawn: Gold Text",
      "👑 Kandhari: Royal Gold Foil"
    ]
  };

  const systemPrompt = `
You are the hospitable, highly skilled AI Creative Director Assistant for Kandhari Tent & Caterers & Dwarka Shri Lawn, Lucknow.
The user is viewing a festival poster and asking for adjustments.

${learnedContext}

ACTIVE FESTIVAL ON CANVAS: "${activeFestival}"
TARGET FESTIVAL: "${targetFestival}"

CRITICAL RULES:
1. ZERO HALLUCINATION ON FESTIVAL: The festival being customized is "${targetFestival}". DO NOT change or hallucinate the festival name to Christmas or anything else! Keep "festival": "${targetFestival}".
2. DISAMBIGUATE VISUAL STYLING: Requests like "change background color to lilac pink", "make mobile numbers golden", "add multi-color splashes" are VISUAL STYLING changes. NEVER insert words like "lilac pink" or "splash of water" into festival blessings, headlines, or brand text!
3. HOMELY HOSPITALITY: Acknowledge the exact change warmly and always end your reply with: "Here is your updated poster. Is there anything else I can help you with?"

Return ONLY valid JSON:
{
  "festival": "${targetFestival}",
  "language": "${decision.language}",
  "bgPattern": "${decision.bgPattern}",
  "customOverrides": ${JSON.stringify(customOverrides)},
  "reply": "Warm confirmation of the exact change made. Here is your updated poster. Is there anything else I can help you with?",
  "suggestedSections": [
    "🎨 Background: Lilac Pink",
    "💦 Multi-Color Water Splashes",
    "📞 Mobile Numbers: Golden",
    "🏛️ Dwarka Lawn: Gold Text",
    "👑 Kandhari: Royal Gold Foil"
  ]
}
`;

  try {
    const res = await groq.chat.completions.create({
      model: "qwen/qwen3.8-27b",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      response_format: { type: "json_object" },
      temperature: 0.6,
      max_completion_tokens: 350,
    });
    if (res.choices && res.choices[0] && res.choices[0].message) {
      const parsed = JSON.parse(res.choices[0].message.content);
      // Strictly guard festival against hallucination
      if (switchMatch && parsed.festival) {
        decision.festival = parsed.festival;
      } else {
        decision.festival = targetFestival;
      }
      if (parsed.language && parsed.language !== "auto") decision.language = parsed.language;
      if (parsed.bgPattern && parsed.bgPattern !== "default") decision.bgPattern = parsed.bgPattern;
      if (parsed.customOverrides && typeof parsed.customOverrides === "object") {
        decision.customOverrides = { ...decision.customOverrides, ...parsed.customOverrides };
      }
      if (parsed.reply) decision.reply = parsed.reply;
      if (Array.isArray(parsed.suggestedSections)) decision.suggestedSections = parsed.suggestedSections;
    }
  } catch (err) {
    console.warn("Redesign prompt interpretation warning:", err.message);
  }

  // Ensure prompt overrides remain set
  decision.customOverrides = { ...decision.customOverrides, ...customOverrides };
  if (detectedBgPattern) decision.bgPattern = detectedBgPattern;

  // Formulate friendly reply if default
  if (!decision.reply || decision.reply.includes("based on your prompt")) {
    let changeDesc = "custom styling";
    if (decision.customOverrides.bgColor) changeDesc = `background color to ${decision.customOverrides.bgColor}`;
    else if (decision.bgPattern === "color_splashes") changeDesc = "vibrant multi-color water splashes in the background";
    else if (decision.customOverrides.phoneColor) changeDesc = `mobile numbers to ${decision.customOverrides.phoneColor}`;
    else if (decision.customOverrides.dwarkaTextColor) changeDesc = `Dwarka Shri Lawn text color to ${decision.customOverrides.dwarkaTextColor}`;

    decision.reply = `I have updated the ${changeDesc} for your ${decision.festival} poster! ✨ The brand identity and verified phone numbers remain strictly preserved. Here is your updated poster. Is there anything else I can help you with?`;
  }

  // Avoid polluting creative copy with visual style commands
  const isPureStylePrompt = /color|background|gold|silver|pink|splash|phone|mobile|dwarka|kandhari|ribbon/i.test(userPrompt) && !/blessing|quote|wishing/i.test(userPrompt);
  const cleanCustomNotes = isPureStylePrompt ? "" : userPrompt;

  // RECORD IN PERSISTENT TRAINING MEMORY STORE!
  const learnedRecord = recordLearning({
    userPrompt,
    detectedIntent: {
      festival: decision.festival,
      language: decision.language,
      bgPattern: decision.bgPattern,
      variantIndex: decision.variantIndex,
      customOverrides: decision.customOverrides || {},
    },
    appliedChanges: decision,
    festival: decision.festival,
  });

  const campaign = await analyzeBrandAndCreateCampaign({
    festival: decision.festival,
    preferredVariant: decision.variantIndex,
    languagePreference: decision.language,
    bgPattern: decision.bgPattern,
    customNotes: cleanCustomNotes,
    customOverrides: decision.customOverrides || {},
  });

  return {
    campaign,
    reply: decision.reply,
    suggestedSections: decision.suggestedSections || [
      "🎨 Background: Lilac Pink",
      "💦 Multi-Color Water Splashes",
      "📞 Mobile Numbers: Golden",
      "🏛️ Dwarka Lawn: Gold Text",
      "👑 Kandhari: Royal Gold Foil"
    ],
    learnedRecord,
  };
}

module.exports = {
  analyzeBrandAndCreateCampaign,
  redesignCampaignWithPrompt,
  loadLearnings,
  loadLearningsAsync,
  recordLearning,
  FESTIVAL_PROFILES,
  matchFestivalProfile,
};
