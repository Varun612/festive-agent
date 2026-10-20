const net = require("net");
const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "..");
const CONFIG_FILE = path.join(ROOT_DIR, "port_config.json");
const FRONTEND_CONFIG = path.join(ROOT_DIR, "frontend", "port_config.json");
const BACKEND_ENV = path.join(ROOT_DIR, "backend", ".env");

// STRICTLY PROHIBITED PORTS
const PROHIBITED_PORTS = [3000, 5000];

// Safe Port Ranges
const FRONTEND_RANGE = { start: 3001, end: 3999 };
const BACKEND_RANGE = { start: 5001, end: 5999 };

/**
 * Checks if a specific port is available to bind.
 * Resolves true if available, false if in use or prohibited.
 */
function isPortAvailable(port) {
  if (PROHIBITED_PORTS.includes(port)) {
    return Promise.resolve(false);
  }
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", (err) => {
      resolve(false);
    });
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "127.0.0.1");
  });
}

/**
 * Scans a range of ports until the first available port is found.
 */
async function findAvailablePort(start, end, label) {
  for (let port = start; port <= end; port++) {
    if (PROHIBITED_PORTS.includes(port)) continue;
    const available = await isPortAvailable(port);
    if (available) {
      return port;
    }
  }
  throw new Error(`No available ports found for ${label} in range ${start}-${end}`);
}

async function main() {
  const isCheckOnly = process.argv.includes("--check");
  const isJsonOnly = process.argv.includes("--json");

  // Read existing config if present
  let existingConfig = {};
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      existingConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
    } catch (e) {}
  }

  // Determine Frontend Port
  let frontendPort = null;
  if (existingConfig.frontendPort && !PROHIBITED_PORTS.includes(existingConfig.frontendPort)) {
    const stillFree = await isPortAvailable(existingConfig.frontendPort);
    if (stillFree) {
      frontendPort = existingConfig.frontendPort;
    }
  }
  if (!frontendPort) {
    frontendPort = await findAvailablePort(FRONTEND_RANGE.start, FRONTEND_RANGE.end, "Frontend");
  }

  // Determine Backend Port
  let backendPort = null;
  if (existingConfig.backendPort && !PROHIBITED_PORTS.includes(existingConfig.backendPort)) {
    const stillFree = await isPortAvailable(existingConfig.backendPort);
    if (stillFree) {
      backendPort = existingConfig.backendPort;
    }
  }
  if (!backendPort) {
    backendPort = await findAvailablePort(BACKEND_RANGE.start, BACKEND_RANGE.end, "Backend");
  }

  const portConfig = {
    frontendPort,
    backendPort,
    frontendUrl: `http://localhost:${frontendPort}`,
    backendUrl: `http://localhost:${backendPort}`,
    apiBase: `http://localhost:${backendPort}`,
    prohibitedPorts: PROHIBITED_PORTS,
    updatedAt: new Date().toISOString(),
  };

  if (isJsonOnly) {
    console.log(JSON.stringify(portConfig));
    return;
  }

  if (isCheckOnly) {
    console.log("Current Port Configuration:");
    console.log(`- Frontend: ${portConfig.frontendUrl} (Port ${frontendPort})`);
    console.log(`- Backend:  ${portConfig.backendUrl} (Port ${backendPort})`);
    console.log(`- Prohibited: Ports ${PROHIBITED_PORTS.join(", ")} untouched`);
    return;
  }

  // Save port_config.json in root and frontend
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(portConfig, null, 2), "utf8");
  if (fs.existsSync(path.dirname(FRONTEND_CONFIG))) {
    fs.writeFileSync(FRONTEND_CONFIG, JSON.stringify(portConfig, null, 2), "utf8");
  }

  // Update backend/.env PORT and FRONTEND_URL safely
  if (fs.existsSync(BACKEND_ENV)) {
    let envContent = fs.readFileSync(BACKEND_ENV, "utf8");
    if (/^PORT=.*/m.test(envContent)) {
      envContent = envContent.replace(/^PORT=.*/m, `PORT=${backendPort}`);
    } else {
      envContent += `\nPORT=${backendPort}`;
    }
    if (/^FRONTEND_URL=.*/m.test(envContent)) {
      envContent = envContent.replace(/^FRONTEND_URL=.*/m, `FRONTEND_URL=http://localhost:${frontendPort}`);
    } else {
      envContent += `\nFRONTEND_URL=http://localhost:${frontendPort}`;
    }
    fs.writeFileSync(BACKEND_ENV, envContent, "utf8");
  }

  console.log("==================================================");
  console.log("✅ FestiveAgent Safe Port Discovery Complete");
  console.log(`🖥️  Frontend Port: ${frontendPort} (${portConfig.frontendUrl})`);
  console.log(`⚙️  Backend Port:  ${backendPort} (${portConfig.backendUrl})`);
  console.log(`🛡️  Ports ${PROHIBITED_PORTS.join(" & ")} strictly protected and untouched`);
  console.log("==================================================");
}

main().catch((err) => {
  console.error("❌ Port discovery error:", err.message);
  process.exit(1);
});
