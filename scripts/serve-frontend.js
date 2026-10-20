const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "..");
const FRONTEND_DIR = path.join(ROOT_DIR, "frontend");
const CONFIG_FILE = path.join(ROOT_DIR, "port_config.json");

let portConfig = {};
try {
  if (fs.existsSync(CONFIG_FILE)) {
    portConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
  }
} catch (e) {}

const port = parseInt(process.env.FRONTEND_PORT || portConfig.frontendPort || 3001, 10);

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
};

const server = http.createServer((req, res) => {
  // Enable CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");

  let parsedUrl = req.url.split("?")[0];
  if (parsedUrl === "/" || parsedUrl === "") {
    parsedUrl = "/index.html";
  }

  // Handle port_config.json request
  if (parsedUrl === "/port_config.json") {
    let latestConfig = portConfig;
    try {
      if (fs.existsSync(CONFIG_FILE)) {
        latestConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
      }
    } catch (e) {}
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify(latestConfig, null, 2));
  }

  const safePath = path.normalize(parsedUrl).replace(/^(\.\.[\/\\])+/, "");
  let filePath = path.join(FRONTEND_DIR, safePath);

  // If path doesn't exist in frontend/, check root
  if (!fs.existsSync(filePath)) {
    const rootCandidate = path.join(ROOT_DIR, safePath);
    if (fs.existsSync(rootCandidate) && fs.statSync(rootCandidate).isFile()) {
      filePath = rootCandidate;
    }
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    const mime = MIME_TYPES[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": mime });
    fs.createReadStream(filePath).pipe(res);
  } else {
    // SPA fallback
    const indexFile = path.join(FRONTEND_DIR, "index.html");
    if (fs.existsSync(indexFile)) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      fs.createReadStream(indexFile).pipe(res);
    } else {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("404 Not Found");
    }
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`FestiveAgent Frontend running at http://localhost:${port}`);
});
