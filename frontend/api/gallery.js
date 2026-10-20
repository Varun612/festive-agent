module.exports = (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const gallery = [
    { filename: "festival-diwali-var1-1789704240852.jpg", url: "/showcase/festival-diwali-var1-1789704240852.jpg", title: "Diwali Mahotsav", variant: "Radiant Deepams & Molten Gold" },
    { filename: "festival-diwali-var2-1789704243005.jpg", url: "/showcase/festival-diwali-var2-1789704243005.jpg", title: "Diwali Sapphire", variant: "Midnight Sapphire & Starlight Gold" },
    { filename: "ganesh_chaturthi_final.jpg", url: "/showcase/ganesh_chaturthi_final.jpg", title: "Ganesh Chaturthi", variant: "Royal Marigold & Auspicious Ganesha" },
    { filename: "maha_shivratri_final.jpg", url: "/showcase/maha_shivratri_final.jpg", title: "Maha Shivratri", variant: "Cosmic Indigo & Sacred Trishul" },
    { filename: "shri_ram_navami_final.jpg", url: "/showcase/shri_ram_navami_final.jpg", title: "Shri Ram Navami", variant: "Ayodhya Royal Saffron & Sun God Gold" },
    { filename: "eid_final.jpg", url: "/showcase/eid_final.jpg", title: "Eid Mubarak", variant: "Imperial Emerald & Islamic Mihrab" },
    { filename: "holi_final.jpg", url: "/showcase/holi_final.jpg", title: "Holi Mahotsav", variant: "Joyful Gulal & Vibrant Colors" }
  ];

  res.status(200).json({ success: true, gallery });
};
