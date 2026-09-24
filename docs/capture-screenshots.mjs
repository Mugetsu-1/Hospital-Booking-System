// @ts-check
/**
 * Capture UI evidence screenshots into ../screenshots/*.png using headless
 * Chromium (via puppeteer). Auth is done by calling the API for a JWT and
 * seeding localStorage — this sidesteps React controlled-input quirks and is
 * deterministic. Requires the frontend dev server (5173) and API (5000) up,
 * and a freshly seeded database.
 *
 *   cd docs && node capture-screenshots.mjs
 */
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const DOCS_DIR = dirname(fileURLToPath(import.meta.url));
const SHOTS_DIR = join(DOCS_DIR, '..', 'screenshots');
const BASE = 'http://localhost:5173';
mkdirSync(SHOTS_DIR, { recursive: true });

const ACCOUNTS = {
  patient: { email: 'alice@example.com', password: 'Patient@123' },
  doctor: { email: 'mehta@hospital.com', password: 'Doctor@123' },
  admin: { email: 'admin@hospital.com', password: 'Admin@123' },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function login(page, who) {
  const { email, password } = ACCOUNTS[who];
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle2' });
  const { token, user } = await page.evaluate(async (creds) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(creds),
    });
    if (!res.ok) throw new Error(`login ${res.status}`);
    return res.json();
  }, { email, password });
  await page.evaluate((t, u) => {
    localStorage.setItem('token', t);
    localStorage.setItem('user', JSON.stringify(u));
  }, token, user);
  return user;
}

async function shot(page, route, file, { fullPage = true, settle = 1400, before } = {}) {
  try {
    await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle2' });
    await sleep(settle);
    if (before) await before(page);
    await page.screenshot({ path: join(SHOTS_DIR, file), fullPage });
    console.log(`  ✓ ${file}`);
  } catch (e) {
    console.log(`  ✗ ${file} — ${e.message}`);
  }
}

async function clickTab(page, label) {
  await page.evaluate((l) => {
    const btn = [...document.querySelectorAll('[role="tab"], button.tab')]
      .find((b) => b.textContent.trim().startsWith(l));
    if (btn) btn.click();
  }, label);
  await sleep(1200);
}

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });

console.log('→ Public pages…');
await shot(page, '/login', '02-login.png', { fullPage: false });
await shot(page, '/register', '01-register.png', { fullPage: false });

console.log('→ Patient journeys (alice)…');
await login(page, 'patient');
await shot(page, '/patient/browse', '03-browse-doctors.png');
await shot(page, '/patient/browse', '04-slot-picker.png', {
  before: async (p) => {
    await p.evaluate(() => {
      const b = [...document.querySelectorAll('button')]
        .find((x) => /book/i.test(x.textContent));
      if (b) b.click();
    });
    await sleep(1200);
  },
});
await shot(page, '/patient/appointments', '08-appointment-history.png');
await shot(page, '/patient/profile', '10-profile.png');

console.log('→ Doctor journey (mehta) — verifies patient age/gender/phone…');
await login(page, 'doctor');
await shot(page, '/doctor', '11-doctor-queue-day.png');

console.log('→ Admin journeys (admin) — verifies revenue + fee column…');
await login(page, 'admin');
await shot(page, '/admin', '16-admin-overview.png');
await shot(page, '/admin', '17-admin-doctors.png', { before: (p) => clickTab(p, 'Doctors') });
await shot(page, '/admin', '19-admin-patients.png', { before: (p) => clickTab(p, 'Patients') });
await shot(page, '/admin', '20-admin-ledger.png', { before: (p) => clickTab(p, 'Appointments') });

await browser.close();
console.log('\n✓ Screenshots written to screenshots/.');
