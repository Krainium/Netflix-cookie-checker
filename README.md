# 🎬 Netflix Cookie Checker

Checks Netflix cookies for live accounts. Detects plan type. Shows real-time progress. Saves valid cookies.

## 📋 Requirements

- Node.js 16+
- npm

## ⚙️ Setup

```bash
npm install
```

## 🍪 Cookie File Format

Put one cookie per line in `cookies.txt`:

```
NetflixId=v%3D3%26ct%3D...
NetflixId=ct%3DBgjHlOvc...
```

## ▶️ Run

```bash
node checker.js
```

## 📊 Example Output

```
[#] 5 cookie(s) loaded
[#] Checking…

[+] NetflixId=ct%3DBgjHlOvc… | Basic plan
[-] NetflixId=v%3D3%26ct%3D… | dead
[+] NetflixId=ct%3DBgjHlOvc… | Premium
  [████████████░░░░░░░░░░░░░░░░]  60%  3/5  ✓ 2  ✗ 1

[@] Checked : 5
[+] Live    : 2
[-] Dead    : 3

[@] Saved 2 valid cookie(s) → valids.txt
```

- Green `[+]` — live cookie with plan type
- Red `[-]` — dead or expired
- Progress bar — updates after every batch (percentage, count, live, dead)
- Valid cookies saved to `valids.txt`

## 🔀 Extract from Netscape Format

If you have a browser cookie export (tab-separated Netscape format), extract the `NetflixId` entries first:

```bash
node checker.js --extract cookies_raw.txt cookies.txt
```

Then run the checker as normal.

## 🔧 Config

Edit the `CONFIG` block at the top of `checker.js`:

| Key | Default | Description |
|-----|---------|-------------|
| `concurrency` | `3` | Parallel checks at once |
| `timeout` | `15000` | Request timeout (ms) |
| `delay` | `800` | Delay between batches (ms) |
| `inputFile` | `cookies.txt` | Input file |
| `outputFile` | `valids.txt` | Output file |
