module.exports = (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const festivals = [
    { id: "dussehra", name: "Dussehra", defaultHindiTitle: "शुभ दशहरा", defaultEnglishTop: "HAPPY DUSSEHRA", variantsCount: 3, variants: ["Royal Maroon & Triumphant Gold", "Imperial Purple & Victory Gold", "Auspicious Saffron & Molten Brass"] },
    { id: "diwali", name: "Diwali", defaultHindiTitle: "दीपावली", defaultEnglishTop: "HAPPY DIWALI", variantsCount: 3, variants: ["Radiant Deepams & Molten Gold", "Midnight Sapphire & Starlight Gold", "Royal Velvet Maroon & Warm Brass"] },
    { id: "ganesh-chaturthi", name: "Ganesh Chaturthi", defaultHindiTitle: "गणेश चतुर्थी", defaultEnglishTop: "SHREE GANESH UTSAV", variantsCount: 3, variants: ["Royal Marigold & Auspicious Ganesha", "Molten Gold & Imperial Red", "Peacock Blue & Velvet Rose"] },
    { id: "maha-shivratri", name: "Maha Shivratri", defaultHindiTitle: "महाशिवरात्रि", defaultEnglishTop: "HAR HAR MAHADEV", variantsCount: 3, variants: ["Cosmic Indigo & Sacred Trishul", "Silver Moonlight & Sacred Bhasma", "Molten Copper & Mystic Smoked Pearl"] },
    { id: "eid", name: "Eid", defaultHindiTitle: "ईद मुबारक", defaultEnglishTop: "EID MUBARAK", variantsCount: 2, variants: ["Imperial Emerald & Islamic Mihrab", "Midnight Navy & Gilded Crescent Moon"] },
    { id: "holi", name: "Holi", defaultHindiTitle: "होली", defaultEnglishTop: "HAPPY HOLI", variantsCount: 3, variants: ["Joyful Gulal & Vibrant Colors", "Saffron Sunset & Festive Marigold", "Electric Royal Indigo & Bright Turquoise"] },
    { id: "christmas", name: "Christmas", defaultHindiTitle: "क्रिसमस", defaultEnglishTop: "MERRY CHRISTMAS", variantsCount: 3, variants: ["Holiday Evergreen & Crimson Velvet", "Starlight Frost & Champagne Gold", "Royal Midnight Blue & Silver Noel"] },
    { id: "janmashtami", name: "Janmashtami", defaultHindiTitle: "श्रीकृष्ण जन्माष्टमी", defaultEnglishTop: "SHREE KRISHNA JANMASHTAMI", variantsCount: 3, variants: ["Peacock Feather Emerald & Royal Blue", "Vrindavan Kadamba & Butter Gold", "Divine Midnight Black & Lapis Lazuli"] },
    { id: "navratri", name: "Navratri", defaultHindiTitle: "नवरात्रि", defaultEnglishTop: "JAI MATA DI", variantsCount: 3, variants: ["Shakti Crimson & Royal Gold Foil", "Sunset Saffron & Amber Radiance", "Royal Velvet Magenta & Auspicious Red"] },
    { id: "shri-ram-navami", name: "Shri Ram Navami", defaultHindiTitle: "श्री राम नवमी", defaultEnglishTop: "JAI SHREE RAM", variantsCount: 2, variants: ["Ayodhya Royal Saffron & Sun God Gold", "Sacred Lotus Red & Molten Brass"] },
    { id: "raksha-bandhan", name: "Raksha Bandhan", defaultHindiTitle: "रक्षाबंधन", defaultEnglishTop: "HAPPY RAKSHA BANDHAN", variantsCount: 3, variants: ["Sacred Silk Thread & Radiant Ruby", "Saffron Sibling Bond & Molten Gold", "Pastel Rose & Silver Filigree"] }
  ];

  res.status(200).json({ success: true, festivals });
};
