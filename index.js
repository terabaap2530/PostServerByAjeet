const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const helmet = require('helmet');
const { Server } = require('socket.io');

const app = express();
app.use(helmet());
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// --- Auto create folders ---
const DATA_DIR = path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const LOG_FILE = path.join(DATA_DIR, 'logs.txt');

// default config
let config = {
  adminFacebookID: "",    // set via Settings tab
  cookieFile: null,       // saved filename
  abuseFile: null,        // saved filename
  botRunning: false,
  nicknameLock: {},       // threadID -> locked nickname (simulated)
  groupNameLock: {}       // threadID -> locked group name (simulated)
};

// Load config if exists
try {
  if (fs.existsSync(CONFIG_FILE)) {
    const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
    config = Object.assign(config, JSON.parse(raw || "{}"));
  } else {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  }
} catch (e) {
  console.error('Failed to load config', e);
}

// simple logger
function log(msg) {
  const time = new Date().toLocaleString();
  const line = `[${time}] ${msg}\n`;
  fs.appendFileSync(LOG_FILE, line);
  io.emit('log', line);
  console.log(line.trim());
}

// multer for uploads (cookie, abuse)
const upload = multer({ dest: UPLOADS_DIR });

// serve static (HTML panel)
app.get('/', (req, res) => {
  res.send(renderHTML());
});

// upload cookie
app.post('/upload/cookie', upload.single('cookiefile'), (req, res) => {
  if (req.file) {
    const dest = path.join(DATA_DIR, 'cookie' + path.extname(req.file.originalname));
    fs.renameSync(req.file.path, dest);
    config.cookieFile = dest;
    saveConfig();
    log('Cookie file uploaded: ' + path.basename(dest));
    return res.json({ ok: true, file: path.basename(dest) });
  }
  res.status(400).json({ ok: false });
});

// upload abuse file
app.post('/upload/abuse', upload.single('abusefile'), (req, res) => {
  if (req.file) {
    const dest = path.join(DATA_DIR, 'abuse.txt');
    fs.renameSync(req.file.path, dest);
    config.abuseFile = dest;
    saveConfig();
    log('Abuse file uploaded: ' + path.basename(dest));
    return res.json({ ok: true, file: path.basename(dest) });
  }
  res.status(400).json({ ok: false });
});

// API: start/stop bot
app.post('/api/bot/:action', express.json(), (req, res) => {
  const action = req.params.action;
  if (action === 'start') {
    if (!config.adminFacebookID) return res.status(400).json({ ok: false, error: 'Set Admin Facebook ID in Settings first.' });
    config.botRunning = true;
    saveConfig();
    log('Bot started by control panel.');
    return res.json({ ok: true });
  } else if (action === 'stop') {
    config.botRunning = false;
    saveConfig();
    log('Bot stopped by control panel.');
    return res.json({ ok: true });
  }
  res.status(400).json({ ok: false });
});

// API: save settings
app.post('/api/settings', express.json(), (req, res) => {
  const { adminFacebookID } = req.body;
  config.adminFacebookID = adminFacebookID || config.adminFacebookID;
  saveConfig();
  log('Settings updated.');
  return res.json({ ok: true, config });
});

// API: run command (simulation only)
app.post('/api/command', express.json(), (req, res) => {
  const { adminID, command, args } = req.body;
  if (!adminID || String(adminID) !== String(config.adminFacebookID)) {
    return res.status(403).json({ ok: false, error: 'Only configured admin can run commands.' });
  }

  switch ((command || '').toLowerCase()) {
    case 'tid': {
      const tid = '1000' + Math.floor(Math.random() * 9000);
      log(`TID requested by admin ${adminID}: ${tid}`);
      return res.json({ ok: true, tid });
    }
    case 'uid': {
      const uid = args && args[0] ? args[0] : adminID;
      log(`UID command by ${adminID} => ${uid}`);
      return res.json({ ok: true, uid });
    }
    case 'info': {
      const target = args && args[0] ? args[0] : adminID;
      const info = { id: target, name: 'Simulated User', isBot: false };
      log(`Info requested for ${target} by ${adminID}`);
      return res.json({ ok: true, info });
    }
    default:
      log(`Unknown command from ${adminID}: ${command}`);
      return res.status(400).json({ ok: false, error: 'Unknown command' });
  }
});

// save config
function saveConfig() {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
}

// Socket.io for logs
io.on('connection', (socket) => {
  try {
    const raw = fs.existsSync(LOG_FILE) ? fs.readFileSync(LOG_FILE, 'utf8') : '';
    const lines = raw.split('\n').filter(Boolean);
    const last = lines.slice(-200).join('\n') + '\n';
    socket.emit('log', last);
  } catch (e) {}
});

server.listen(PORT, () => {
  console.log(`Panel running on http://localhost:${PORT}`);
  log('Control panel ready. Server started.');
});

// Panel HTML render function
function renderHTML() {
  return `
  <!doctype html>
  <html>
  <head><title>🔥 AJEET BOT PANEL 🔥</title></head>
  <body style="background:#000;color:#fff;font-family:sans-serif">
    <h1>🔥 AJEET BOT PANEL 🔥</h1>
    <p>Panel is running. Go to console for logs.</p>
  </body>
  </html>
  `;
                     }
