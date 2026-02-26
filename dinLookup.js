const puppeteer = require('puppeteer');

async function lookupDIN(din) {
  const start = Date.now();

  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-extensions',
      '--disable-default-apps',
      '--disable-translate',
      '--disable-sync',
      '--no-first-run',
      '--window-size=1280,720'
    ],
    defaultViewport: { width: 1280, height: 720 }
  });

  const page = await browser.newPage();

  // Block everything except the Blazor app essentials
  await page.setRequestInterception(true);
  page.on('request', req => {
    const url = req.url();
    const type = req.resourceType();

    // Block tracking, analytics, social, ads, fonts, images
    const blockedDomains = ['facebook', 'twitter', 'linkedin', 'instagram', 'youtube',
      'google-analytics', 'googletagmanager', 'static-assets.ny.gov', 'jquery',
      'bootstrapcdn', 'cloudflare', 'cdn.jsdelivr'];

    if (['image', 'font', 'media'].includes(type)) return req.abort();
    if (blockedDomains.some(d => url.includes(d))) return req.abort();

    req.continue();
  });

  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36'
  );

  // Listen for the API response BEFORE navigating
  const apiResponsePromise = page.waitForResponse(
    res => res.url().includes('/IncarceratedPerson/SearchByDin') && res.status() === 200,
    { timeout: 30000 }
  );

  // Only wait for DOM, not full network idle (Blazor handles the rest)
  await page.goto('https://nysdoccslookup.doccs.ny.gov/', {
    waitUntil: 'domcontentloaded'
  });

  // Wait for Blazor to render the input field
  await page.waitForSelector('#din', { timeout: 20000 });

  console.log(`Page ready in ${Date.now() - start}ms`);

  // Type instantly and submit
  await page.type('#din', din, { delay: 0 });
  await page.keyboard.press('Enter');

  // Grab the API response
  const response = await apiResponsePromise;

  let data;
  try {
    data = await response.json();
  } catch {
    data = await response.text();
  }

  await browser.close();

  console.log(`Total time: ${Date.now() - start}ms`);
  return data;
}

// ─────────────────────────────────────────────
// BONUS: Reuse browser for multiple DIN lookups
// (much faster than launching a new browser each time)
// ─────────────────────────────────────────────
async function lookupMultipleDINs(dinList) {
  const puppeteer = require('puppeteer');
  const start = Date.now();

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  const results = [];

  for (const din of dinList) {
    const page = await browser.newPage();

    await page.setRequestInterception(true);
    page.on('request', req => {
      const blockedDomains = ['facebook', 'twitter', 'linkedin', 'instagram',
        'static-assets.ny.gov', 'google-analytics', 'googletagmanager'];
      if (['image', 'font', 'media'].includes(req.resourceType())) return req.abort();
      if (blockedDomains.some(d => req.url().includes(d))) return req.abort();
      req.continue();
    });

    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

    const apiResponsePromise = page.waitForResponse(
      res => res.url().includes('/IncarceratedPerson/SearchByDin') && res.status() === 200,
      { timeout: 30000 }
    );

    await page.goto('https://nysdoccslookup.doccs.ny.gov/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#din', { timeout: 20000 });
    await page.type('#din', din, { delay: 0 });
    await page.keyboard.press('Enter');

    try {
      const response = await apiResponsePromise;
      const data = await response.json();
      results.push({ din, data });
    } catch (err) {
      results.push({ din, error: err.message });
    }

    await page.close();
    console.log(`Done: ${din}`);
  }

  await browser.close();
  console.log(`All ${dinList.length} lookups done in ${Date.now() - start}ms`);
  return results;
}

// ─────────────────────────────────────────────
// RUN
// ─────────────────────────────────────────────

// Single lookup
lookupDIN('12A3456').then(console.log).catch(console.error);

// Multiple lookups (uncomment to use)
// lookupMultipleDINs(['12A3456', '23B5678']).then(console.log).catch(console.error);
module.exports = { lookupDIN };