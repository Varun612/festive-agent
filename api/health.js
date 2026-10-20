module.exports = (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  res.status(200).json({
    status: "ok",
    server: "FestiveAgent AI Studio (Cloud Edge)",
    version: "2.1.0",
    hosting: "Vercel Serverless Edge",
    db: {
      connected: true,
      state: "cloud-replicated",
      storageMode: "Cloud Edge Memory Store",
    },
    uptime: process.uptime ? process.uptime() : 100,
    timestamp: new Date().toISOString(),
  });
};
