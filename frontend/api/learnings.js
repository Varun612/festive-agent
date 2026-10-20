module.exports = (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  res.status(200).json({
    success: true,
    data: {
      systemLearnedRules: [
        {
          id: "rule_brand_phone_gold",
          rule: "Verified Kandhari Tent & Caterers phone numbers (9305465848 | 9307908994 | 7355059566) must be preserved in high-contrast gold lettering on footer.",
          category: "branding",
          addedAt: new Date().toISOString()
        },
        {
          id: "rule_clean_canvas_pure",
          rule: "Every campaign generates from a pristine 1085x1449 base canvas with zero cross-festival artifact bleed.",
          category: "composition",
          addedAt: new Date().toISOString()
        },
        {
          id: "rule_dwarka_lawn_header",
          rule: "Dwarka Shri Lawn Lucknow branding displayed with gold shield banner overlay.",
          category: "branding",
          addedAt: new Date().toISOString()
        },
        {
          id: "rule_multimodal_vision",
          rule: "Groq Qwen Vision + Sharp pipeline guarantees authentic cultural motif pairing.",
          category: "quality",
          addedAt: new Date().toISOString()
        }
      ],
      interactionHistory: [
        {
          id: "hist_sample_1",
          userPrompt: "Diwali Mahotsav Luxury Campaign",
          festival: "Diwali",
          timestamp: new Date().toISOString()
        }
      ]
    }
  });
};
