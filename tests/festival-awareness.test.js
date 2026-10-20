const assert = require("assert");
const path = require("path");
const {
  matchFestivalProfile,
  validateFestivalConsistency,
  FESTIVAL_PROFILES,
  analyzeBrandAndCreateCampaign
} = require("../backend/agent.js");

console.log("==========================================================");
console.log("🧪 Running FestiveAgent Festival-Awareness & Consistency Tests");
console.log("==========================================================\n");

let passed = 0;
let total = 0;

function runTest(name, fn) {
  total++;
  try {
    fn();
    console.log(`✅ [PASS] Test ${total}: ${name}`);
    passed++;
  } catch (err) {
    console.error(`❌ [FAIL] Test ${total}: ${name}`);
    console.error(`   Error: ${err.message}\n`);
  }
}

async function runAsyncTest(name, fn) {
  total++;
  try {
    await fn();
    console.log(`✅ [PASS] Test ${total}: ${name}`);
    passed++;
  } catch (err) {
    console.error(`❌ [FAIL] Test ${total}: ${name}`);
    console.error(`   Error: ${err.message}\n`);
  }
}

async function main() {
  // Test 1: Input Dussehra
  runTest("Input Dussehra -> Profile & Motif must strictly specify Dussehra/Vijayadashami", () => {
    const prof = matchFestivalProfile("Dussehra");
    assert.strictEqual(prof.name, "Dussehra");
    assert.strictEqual(prof.id, "dussehra");
    assert.strictEqual(prof.motifFile, "dussehra.jpg");
    assert.strictEqual(prof.defaultHindiTitle, "शुभ दशहरा");
    assert.strictEqual(prof.defaultGreeting, "विजयादशमी की हार्दिक शुभकामनाएं!");

    const sampleDussehraData = {
      festival_name: "Dussehra",
      hindi_festival_title: "शुभ दशहरा",
      hindi_greeting: "विजयादशमी की हार्दिक शुभकामनाएं!",
      caption: "Wishing you a victorious and auspicious Dussehra from Kandhari Tent & Caterers & Dwarka Shri Lawn Lucknow! 📞 9305465848"
    };
    const val = validateFestivalConsistency({ festival: "Dussehra", festivalData: sampleDussehraData, profile: prof });
    assert.strictEqual(val.passed, true, "Validation gate must pass for authentic Dussehra data");
    assert.strictEqual(val.errors.length, 0);
  });

  // Test 2: Input Diwali
  runTest("Input Diwali -> Profile & Motif must strictly specify Diwali", () => {
    const prof = matchFestivalProfile("Diwali");
    assert.strictEqual(prof.name, "Diwali");
    assert.strictEqual(prof.id, "diwali");
    assert.strictEqual(prof.motifFile, "diwali.jpg");
    assert.strictEqual(prof.defaultHindiTitle, "दीपावली महोत्सव");

    const sampleDiwaliData = {
      festival_name: "Diwali",
      hindi_festival_title: "दीपावली महोत्सव",
      hindi_greeting: "की हार्दिक शुभकामनाएं!",
      caption: "Celebrate Diwali with Kandhari Tent & Caterers & Dwarka Shri Lawn Lucknow! 📞 9305465848"
    };
    const val = validateFestivalConsistency({ festival: "Diwali", festivalData: sampleDiwaliData, profile: prof });
    assert.strictEqual(val.passed, true);
  });

  // Test 3: Input Christmas
  runTest("Input Christmas -> Profile must specify Christmas with holiday theme", () => {
    const prof = matchFestivalProfile("Christmas");
    assert.strictEqual(prof.name, "Christmas");
    assert.strictEqual(prof.id, "christmas");
    assert.strictEqual(prof.motifFile, "christmas.jpg");
    assert.ok(prof.defaultEnglishTitle.includes("Christmas"), "Default title must include Christmas");

    const sampleXmasData = {
      festival_name: "Christmas",
      english_main_title: "MERRY CHRISTMAS",
      english_greeting: "Season's Greetings & Joyful Cheer!",
      caption: "Celebrate Christmas and Holiday Season at Dwarka Shri Lawn, Lucknow! 📞 9305465848"
    };
    const val = validateFestivalConsistency({ festival: "Christmas", festivalData: sampleXmasData, profile: prof });
    assert.strictEqual(val.passed, true);
  });

  // Test 4: Input Eid
  runTest("Input Eid -> Profile must specify Eid Mubarak", () => {
    const prof = matchFestivalProfile("Eid");
    assert.strictEqual(prof.name, "Eid");
    assert.strictEqual(prof.id, "eid");
    assert.strictEqual(prof.motifFile, "eid.jpg");
    assert.strictEqual(prof.defaultHindiTitle, "ईद मुबारक");

    const sampleEidData = {
      festival_name: "Eid",
      hindi_festival_title: "ईद मुबारक",
      caption: "Eid Mubarak from Kandhari Tent & Caterers & Dwarka Shri Lawn Lucknow! 📞 9305465848"
    };
    const val = validateFestivalConsistency({ festival: "Eid", festivalData: sampleEidData, profile: prof });
    assert.strictEqual(val.passed, true);
  });

  // Test 5: Switch active request from Diwali to Dussehra
  runTest("Switch active request from Diwali to Dussehra -> purges Diwali and matches Dussehra", () => {
    const previousActive = "Diwali";
    const userPrompt = "Actually, change festival to Dussehra";

    // Detect switch regex used in agent redesign
    const switchRegex = /(?:switch\s+(?:the\s+festival\s+)?to|redesign\s+for|change\s+(?:festival\s+)?to|create\s+(?:a\s+)?(?:poster\s+for\s+)|make\s+(?:a\s+)?(?:poster\s+for\s+)|generate\s+(?:for\s+)?)([a-z\s]+)/i;
    const match = userPrompt.match(switchRegex);
    assert.ok(match && match[1], "Switch command must be detected");
    
    const targetProfile = matchFestivalProfile(match[1].trim());
    assert.strictEqual(targetProfile.name, "Dussehra", "Target must resolve to Dussehra, not Diwali");
    assert.notStrictEqual(targetProfile.name, previousActive, "Must not keep previous festival");
    assert.strictEqual(targetProfile.motifFile, "dussehra.jpg");
  });

  // Test 6: Missing festival input -> must reject and ask for clarification
  await runAsyncTest("Missing festival input -> must reject and throw clarification error (never default to Diwali)", async () => {
    let errorCaught = null;
    try {
      await analyzeBrandAndCreateCampaign({ festival: "" });
    } catch (err) {
      errorCaught = err;
    }
    assert.ok(errorCaught, "Missing festival input must throw error");
    assert.ok(errorCaught.message.includes("Festival name is required"), "Error message must ask for festival name");
    assert.ok(!/silently defaulting to diwali/i.test(errorCaught.message), "Must not silently assume Diwali");
  });

  // Test 7: Validation Gate Rejection on Cross-Festival Contamination
  runTest("Validation Gate -> Rejects Dussehra output contaminated with Diwali elements", () => {
    const prof = matchFestivalProfile("Dussehra");
    const contaminatedData = {
      festival_name: "Dussehra",
      hindi_festival_title: "शुभ दीपावली", // CONTAMINATED with Diwali!
      caption: "Happy Dussehra! Light your diyas and make rangoli today." // CONTAMINATED with diyas/rangoli!
    };
    const val = validateFestivalConsistency({ festival: "Dussehra", festivalData: contaminatedData, profile: prof });
    assert.strictEqual(val.passed, false, "Validation gate must reject contaminated data");
    assert.ok(val.errors.some(e => e.includes("Contamination detected")), "Must report contamination error");
    assert.ok(val.errors.some(e => e.includes("does not match requested festival")), "Must report title mismatch error");
  });

  console.log("\n==========================================================");
  console.log(`📊 Test Summary: ${passed} / ${total} tests passed (${Math.round((passed/total)*100)}%)`);
  console.log("==========================================================");
}

main().catch(err => {
  console.error("Fatal test error:", err);
  process.exit(1);
});
