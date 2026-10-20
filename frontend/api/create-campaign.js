module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  // If cloud backend URL is configured in environment, proxy to it
  const CLOUD_BACKEND = process.env.CLOUD_BACKEND_URL;
  if (CLOUD_BACKEND) {
    try {
      const response = await fetch(`${CLOUD_BACKEND}/api/create-campaign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req.body || {}),
      });
      const data = await response.json();
      return res.status(response.status).json(data);
    } catch (e) {
      console.warn("Cloud backend proxy fallback:", e.message);
    }
  }

  // Showcase fallback on serverless edge
  const body = req.body || {};
  const festival = body.festival || "Diwali";
  const showcaseMap = {
    diwali: "/showcase/festival-diwali-var1-1789704240852.jpg",
    "ganesh chaturthi": "/showcase/ganesh_chaturthi_final.jpg",
    "maha shivratri": "/showcase/maha_shivratri_final.jpg",
    eid: "/showcase/eid_final.jpg",
    holi: "/showcase/holi_final.jpg",
    christmas: "/showcase/festival-diwali-var3-1789704273297.jpg",
    "shri ram navami": "/showcase/shri_ram_navami_final.jpg"
  };

  const festKey = festival.toLowerCase().trim();
  const selectedUrl = showcaseMap[festKey] || "/showcase/festival-diwali-var1-1789704240852.jpg";

  res.status(200).json({
    success: true,
    campaign: {
      imageUrl: selectedUrl,
      festival: festival,
      themeName: "Clean-Canvas Studio Creative",
      language: "hindi",
      variantIndex: 1,
      totalVariants: 3,
      caption: `Wishing everyone a joyful and blessed ${festival} from Kandhari Tent & Caterers & Dwarka Shri Lawn, Lucknow!`,
      hashtags: ["#FestiveAgent", `#${festival.replace(/\s+/g, '')}`, "#KandhariCaterers", "#LucknowEvents", "#LuxuryVenues"]
    }
  });
};
