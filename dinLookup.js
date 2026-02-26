const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');

async function lookupDIN(din) {
  const start = Date.now();

  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath(),
    headless: chromium.headless,
  });

  const page = await browser.newPage();

  await page.setRequestInterception(true);
  page.on('request', req => {
    const url = req.url();
    const type = req.resourceType();

    const blockedDomains = [
      'facebook', 'twitter', 'linkedin', 'instagram', 'youtube',
      'google-analytics', 'googletagmanager', 'static-assets.ny.gov',
      'jquery', 'bootstrapcdn', 'cloudflare', 'cdn.jsdelivr'
    ];

    if (['image', 'font', 'media'].includes(type)) return req.abort();
    if (blockedDomains.some(d => url.includes(d))) return req.abort();

    req.continue();
  });

  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  );

  // Set up response listener BEFORE navigating - 60 second timeout
  const apiResponsePromise = page.waitForResponse(
    res => res.url().includes('/IncarceratedPerson/SearchByDin') && res.status() === 200,
    { timeout: 90000 }
  );

  // Wait for full network settle so Blazor is ready
  await page.goto('https://nysdoccslookup.doccs.ny.gov/', {
    waitUntil: 'networkidle2',
    timeout: 90000
  });

  // Wait for input to appear
  await page.waitForSelector('#din', { timeout: 90000 });

  console.log(`Page ready in ${Date.now() - start}ms`);

  // Give Blazor a moment to become interactive
  await new Promise(r => setTimeout(r, 1000));

  // Type with slight delay so Blazor registers keystrokes
  await page.type('#din', din, { delay: 50 });
  await new Promise(r => setTimeout(r, 500));
  await page.keyboard.press('Enter');

  console.log(`Submitted, waiting for API response...`);

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

async function lookupMultipleDINs(dinList) {
  const start = Date.now();

  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath(),
    headless: chromium.headless,
  });

  const results = [];

  for (const din of dinList) {
    const page = await browser.newPage();

    await page.setRequestInterception(true);
    page.on('request', req => {
      const blockedDomains = [
        'facebook', 'twitter', 'linkedin', 'instagram',
        'static-assets.ny.gov', 'google-analytics', 'googletagmanager'
      ];
      if (['image', 'font', 'media'].includes(req.resourceType())) return req.abort();
      if (blockedDomains.some(d => req.url().includes(d))) return req.abort();
      req.continue();
    });

    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    );

    const apiResponsePromise = page.waitForResponse(
      res => res.url().includes('/IncarceratedPerson/SearchByDin') && res.status() === 200,
      { timeout: 60000 }
    );

    await page.goto('https://nysdoccslookup.doccs.ny.gov/', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    await page.waitForSelector('#din', { timeout: 60000 });
    await new Promise(r => setTimeout(r, 1000));
    await page.type('#din', din, { delay: 50 });
    await new Promise(r => setTimeout(r, 500));
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

module.exports = { lookupDIN, lookupMultipleDINs };