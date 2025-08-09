require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const puppeteer = require('puppeteer');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(__dirname));

const GROUP_URL = process.env.GROUP_URL || '';
let LOCK_NAME = process.env.LOCK_NAME || 'My Locked Group';
const FB_COOKIE = process.env.FB_COOKIE || '';
const PORT = process.env.PORT || 3000;
const HEADLESS = (process.env.HEADLESS || 'true') === 'true';

let browser = null;
let page = null;
let lockEnabled = false;
let monitorInterval = null;

async function startBot() {
  if (!FB_COOKIE || !GROUP_URL) {
    console.log('FB_COOKIE or GROUP_URL not set. Bot will not start until environment configured.');
    return;
  }
  try {
    browser = await puppeteer.launch({
      headless: HEADLESS,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    page = await browser.newPage();

    // parse cookies from env (format: key1=val1; key2=val2)
    const cookies = FB_COOKIE.split(';').map(c => c.trim()).filter(Boolean).map(pair => {
      const idx = pair.indexOf('=');
      const name = pair.substring(0, idx);
      const value = pair.substring(idx + 1);
      return { name, value, domain: '.facebook.com', path: '/' };
    });

    if (cookies.length) await page.setCookie(...cookies);
    await page.goto(GROUP_URL, { waitUntil: 'networkidle2', timeout: 60000 });

    console.log('Bot started and navigated to group.');
  } catch (err) {
    console.error('startBot error:', err);
  }
}

async function fetchGroupName() {
  if (!page) return null;
  try {
    await page.goto(GROUP_URL, { waitUntil: 'networkidle2', timeout: 60000 });
    // best-effort selectors — Facebook structure changes; adjust if necessary
    const name = await page.evaluate(() => {
      // try multiple selectors
      const h1 = document.querySelector('h1');
      if (h1) return h1.innerText.trim();
      const possible = document.querySelector('[data-testid="group-name"]');
      return possible ? possible.innerText.trim() : null;
    });
    return name;
  } catch (e) {
    console.error('fetchGroupName error:', e.message);
    return null;
  }
}

async function revertName(newName) {
  if (!page) throw new Error('Page not initialized');
  try {
    await page.goto(GROUP_URL, { waitUntil: 'networkidle2', timeout: 60000 });

    // open group settings / edit name (may require admin privileges & different selectors)
    // This block tries common flows and is best-effort. You may need to update selectors.

    // Click "Edit" button if visible
    const editButton = await page.$x("//span[contains(text(),'Edit') or contains(text(),'Edit Group') or contains(text(),'Edit Settings')]");
    if (editButton.length) {
      await editButton[0].click();
      await page.waitForTimeout(1500);
    }

    // Try to find the group name input
    const input = await page.$('input[type="text"]');
    if (input) {
      await input.click({ clickCount: 3 });
      await input.type(newName, { delay: 50 });
      // find Save button
      const saveBtn = await page.$x("//span[contains(text(),'Save')]");
      if (saveBtn.length) {
        await saveBtn[0].click();
      }
      await page.waitForTimeout(2000);
      return true;
    }

    console.warn('Could not find name input to revert name.');
    return false;
  } catch (e) {
    console.error('revertName error:', e.message);
    return false;
  }
}

async function startMonitor() {
  if (!page) await startBot();
  if (!page) return;
  if (monitorInterval) clearInterval(monitorInterval);

  monitorInterval = setInterval(async () => {
    if (!lockEnabled) return;
    try {
      const current = await fetchGroupName();
      console.log('Current group name:', current);
      if (current && current !== LOCK_NAME) {
        console.log('Name changed — reverting to', LOCK_NAME);
        const ok = await revertName(LOCK_NAME);
        console.log('Revert attempt result:', ok);
      }
    } catch (e) {
      console.error('Monitor loop error:', e.message);
    }
  }, 30000); // every 30s
}

async function stopMonitor() {
  lockEnabled = false;
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
  }
}

// HTTP API
app.get('/panel', (req, res) => {
  res.sendFile(path.join(__dirname, 'panel.html'));
});

app.get('/api/status', async (req, res) => {
  const currentName = await fetchGroupName();
  res.json({ running: !!page, lockEnabled, LOCK_NAME, currentName });
});

app.post('/api/lock', async (req, res) => {
  const name = req.body.name || LOCK_NAME;
  LOCK_NAME = name;
  lockEnabled = true;
  await startMonitor();
  res.json({ ok: true, lockEnabled, LOCK_NAME });
});

app.post('/api/unlock', (req, res) => {
  lockEnabled = false;
  stopMonitor();
  res.json({ ok: true, lockEnabled });
});

app.post('/api/restart', async (req, res) => {
  try {
    if (browser) await browser.close();
  } catch (e) {}
  browser = null;
  page = null;
  await startBot();
  res.json({ ok: true });
});

app.listen(PORT, async () => {
  console.log(`Server listening on ${PORT}`);
  await startBot();
});
