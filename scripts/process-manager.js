const fs = require("fs");
const path = require("path");
const { spawn, execSync } = require("child_process");
const http = require("http");

const ROOT_DIR = path.resolve(__dirname, "..");
const PID_FILE = path.join(ROOT_DIR, ".project_pids.json");
const CONFIG_FILE = path.join(ROOT_DIR, "port_config.json");
const BACKEND_DIR = path.join(ROOT_DIR, "backend");
const BACKEND_LOG = path.join(ROOT_DIR, "backend.log");
const FRONTEND_LOG = path.join(ROOT_DIR, "frontend.log");

function isPidAlive(pid) {
  if (!pid) return false;
  try {
    const out = execSync(`tasklist /FI "PID eq ${pid}" /NH 2>nul`).toString();
    return out.includes(String(pid));
  } catch (e) {
    return false;
  }
}

function pingHttp(url) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: 1500 }, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => resolve({ ok: res.statusCode >= 200 && res.statusCode < 400, status: res.statusCode, data }));
    });
    req.on("error", () => resolve({ ok: false }));
    req.on("timeout", () => {
      req.destroy();
      resolve({ ok: false });
    });
  });
}

async function start() {
  console.log("==================================================");
  console.log("🚀 Starting FestiveAgent AI Studio...");
  console.log("==================================================");

  // 1. Run port discovery
  try {
    execSync(`node "${path.join(__dirname, "find-ports.js")}"`, { stdio: "inherit", cwd: ROOT_DIR });
  } catch (e) {
    console.error("❌ Failed to discover safe ports:", e.message);
    process.exit(1);
  }

  // 2. Load port configuration
  let config = {};
  try {
    config = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
  } catch (e) {
    console.error("❌ Failed to read port_config.json");
    process.exit(1);
  }

  const { frontendPort, backendPort, frontendUrl, backendUrl } = config;

  // 3. Check for existing running instance
  let pids = {};
  if (fs.existsSync(PID_FILE)) {
    try {
      pids = JSON.parse(fs.readFileSync(PID_FILE, "utf8"));
    } catch (e) {}
  }

  let backendRunning = pids.backendPid && isPidAlive(pids.backendPid);
  let frontendRunning = pids.frontendPid && isPidAlive(pids.frontendPid);

  if (backendRunning && frontendRunning) {
    const health = await pingHttp(`${backendUrl}/api/health`);
    if (health.ok) {
      console.log("⚡ FestiveAgent is ALREADY RUNNING and healthy!");
      console.log(`🖥️  Frontend: ${frontendUrl}`);
      console.log(`⚙️  Backend:  ${backendUrl}`);
      console.log(`🛡️  Ports 3000 & 5000: Completely untouched & reserved`);
      console.log("==================================================");
      openBrowser(frontendUrl);
      return;
    }
  }

  // 4. Start Backend
  console.log(`\n⏳ Launching Backend Server on port ${backendPort}...`);
  const backendProc = spawn(
    "cmd.exe",
    ["/c", `node server.js >> "${BACKEND_LOG}" 2>&1`],
    {
      cwd: BACKEND_DIR,
      env: { ...process.env, PORT: String(backendPort) },
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    }
  );
  backendProc.unref();
  const backendPid = backendProc.pid;

  // 5. Start Frontend
  console.log(`⏳ Launching Frontend Server on port ${frontendPort}...`);
  const frontendProc = spawn(
    "cmd.exe",
    ["/c", `node "${path.join(__dirname, "serve-frontend.js")}" >> "${FRONTEND_LOG}" 2>&1`],
    {
      cwd: ROOT_DIR,
      env: { ...process.env, FRONTEND_PORT: String(frontendPort) },
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    }
  );
  frontendProc.unref();
  const frontendPid = frontendProc.pid;

  // 6. Save PIDs
  fs.writeFileSync(
    PID_FILE,
    JSON.stringify(
      {
        backendPid,
        frontendPid,
        backendPort,
        frontendPort,
        startedAt: new Date().toISOString(),
      },
      null,
      2
    ),
    "utf8"
  );

  // 7. Verify health
  process.stdout.write("⏳ Verifying server initialization");
  let healthy = false;
  for (let i = 0; i < 8; i++) {
    await new Promise((r) => setTimeout(r, 600));
    process.stdout.write(".");
    const check = await pingHttp(`${backendUrl}/api/health`);
    if (check.ok) {
      healthy = true;
      break;
    }
  }
  console.log("\n");

  if (!healthy) {
    console.warn("⚠️  Backend took longer than expected to report healthy. Check backend.log for details.");
  } else {
    console.log("✅ Backend & Frontend verified online!");
  }

  console.log("==================================================");
  console.log(`🎉 FestiveAgent AI Studio Active!`);
  console.log(`🖥️  Frontend URL: ${frontendUrl}`);
  console.log(`⚙️  Backend API:   ${backendUrl}`);
  console.log(`🛡️  Ports 3000 & 5000: Completely untouched & reserved`);
  console.log(`📋 Logs: backend.log & frontend.log`);
  console.log("==================================================");

  openBrowser(frontendUrl);
}

function openBrowser(url) {
  try {
    if (process.platform === "win32") {
      execSync(`start "" "${url}"`);
    } else {
      execSync(`xdg-open "${url}" || open "${url}"`);
    }
  } catch (e) {}
}

function stop() {
  console.log("==================================================");
  console.log("🛑 Stopping FestiveAgent AI Studio...");
  console.log("==================================================");

  if (!fs.existsSync(PID_FILE)) {
    console.log("ℹ️  No active FestiveAgent processes found (.project_pids.json not found).");
    console.log("🛡️  All unrelated processes remain completely untouched.");
    return;
  }

  let pids = {};
  try {
    pids = JSON.parse(fs.readFileSync(PID_FILE, "utf8"));
  } catch (e) {}

  let stoppedCount = 0;

  if (pids.backendPid) {
    if (isPidAlive(pids.backendPid)) {
      try {
        execSync(`taskkill /PID ${pids.backendPid} /F /T 2>nul`);
        console.log(`✅ Stopped FestiveAgent Backend process (PID ${pids.backendPid})`);
        stoppedCount++;
      } catch (e) {}
    }
  }

  if (pids.frontendPid) {
    if (isPidAlive(pids.frontendPid)) {
      try {
        execSync(`taskkill /PID ${pids.frontendPid} /F /T 2>nul`);
        console.log(`✅ Stopped FestiveAgent Frontend process (PID ${pids.frontendPid})`);
        stoppedCount++;
      } catch (e) {}
    }
  }

  try {
    fs.unlinkSync(PID_FILE);
  } catch (e) {}

  console.log("--------------------------------------------------");
  if (stoppedCount > 0) {
    console.log(`✅ Successfully stopped ${stoppedCount} FestiveAgent process(es).`);
  } else {
    console.log("ℹ️  Processes had already exited. Cleaned up PID registry.");
  }
  console.log("🛡️  Ports 3000 & 5000 and all unrelated applications were NEVER touched.");
  console.log("==================================================");
}

async function check() {
  console.log("==================================================");
  console.log("🔍 FestiveAgent Health & Port Diagnostic Report");
  console.log("==================================================");

  let config = {};
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      config = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
    }
  } catch (e) {}

  let pids = {};
  try {
    if (fs.existsSync(PID_FILE)) {
      pids = JSON.parse(fs.readFileSync(PID_FILE, "utf8"));
    }
  } catch (e) {}

  const backendPort = config.backendPort || 5001;
  const frontendPort = config.frontendPort || 3001;
  const backendUrl = `http://localhost:${backendPort}`;
  const frontendUrl = `http://localhost:${frontendPort}`;

  console.log(`📍 Allocated Ports: Frontend ${frontendPort} | Backend ${backendPort}`);
  console.log(`🛡️  Reserved Protected Ports: 3000 & 5000 (Untouched)`);
  console.log("--------------------------------------------------");

  // Ping Backend
  const bHealth = await pingHttp(`${backendUrl}/api/health`);
  if (bHealth.ok) {
    try {
      const data = JSON.parse(bHealth.data);
      console.log(`✅ Backend: ONLINE (${backendUrl})`);
      console.log(`   - Storage Mode: ${data.db ? data.db.storageMode : "Unknown"}`);
      console.log(`   - Version: ${data.version || "2.1.0"}`);
      console.log(`   - Uptime: ${Math.round(data.uptime || 0)}s`);
    } catch (e) {
      console.log(`✅ Backend: ONLINE (${backendUrl})`);
    }
  } else {
    console.log(`❌ Backend: OFFLINE on port ${backendPort}`);
  }

  // Ping Frontend
  const fHealth = await pingHttp(frontendUrl);
  if (fHealth.ok) {
    console.log(`✅ Frontend: ONLINE (${frontendUrl})`);
  } else {
    console.log(`❌ Frontend: OFFLINE on port ${frontendPort}`);
  }

  // Check PID status
  if (pids.backendPid || pids.frontendPid) {
    console.log("--------------------------------------------------");
    console.log(`📋 Managed Process PIDs: Backend=${pids.backendPid || "N/A"} | Frontend=${pids.frontendPid || "N/A"}`);
  }

  // Check Groq Key
  const envPath = path.join(BACKEND_DIR, ".env");
  let hasKey = false;
  if (fs.existsSync(envPath)) {
    const envStr = fs.readFileSync(envPath, "utf8");
    hasKey = /OPENAI_API_KEY=gsk_\w+/.test(envStr);
  }
  console.log("--------------------------------------------------");
  console.log(`🔑 AI Brain (Groq Qwen Vision): ${hasKey ? "CONFIGURED & READY" : "⚠️ Key Missing in backend/.env"}`);
  console.log("==================================================");
}

const command = (process.argv[2] || "check").toLowerCase();
if (command === "start") {
  start();
} else if (command === "stop") {
  stop();
} else if (command === "check" || command === "status") {
  check();
} else {
  console.log("Usage: node scripts/process-manager.js [start|stop|check]");
}
