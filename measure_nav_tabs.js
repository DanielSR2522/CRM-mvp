const { chromium } = require('playwright');

(async () => {
  const edgePath = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  const browser = await chromium.launch({ executablePath: edgePath, headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  console.log('Navigating to http://localhost:3001/login...');
  await page.goto('http://localhost:3001/login');
  await page.waitForTimeout(3000);
  console.log('After login navigation, page URL is:', page.url());

  console.log('Navigating to http://localhost:3001/clients...');
  await page.goto('http://localhost:3001/clients');
  await page.waitForTimeout(3000);
  console.log('After clients navigation, page URL is:', page.url());

  const clientLink = await page.$('a[href^="/clients/"]');
  console.log('Client link found:', Boolean(clientLink));
  if (clientLink) {
    const href = await clientLink.getAttribute('href');
    console.log('Client href:', href);

    // 1. Measure HEALTH
    await page.goto(`http://localhost:3001${href}?section=health`);
    await page.waitForTimeout(3000);
    console.log('Health URL:', page.url());

    const healthData = await page.evaluate(() => {
      const sep = document.querySelector('.bg-slate-100.w-2') || document.querySelector('.bg-slate-100');
      const firstTab = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Overview');

      const sepRect = sep ? sep.getBoundingClientRect() : null;
      const firstTabRect = firstTab ? firstTab.getBoundingClientRect() : null;

      return {
        sepLeft: sepRect ? sepRect.left : null,
        sepRight: sepRect ? sepRect.right : null,
        firstTabLeft: firstTabRect ? firstTabRect.left : null,
        offsetFromSepRight: (firstTabRect && sepRect) ? (firstTabRect.left - sepRect.right) : null,
      };
    });

    // 2. Measure OVERVIEW
    await page.goto(`http://localhost:3001${href}?section=overview`);
    await page.waitForTimeout(3000);
    console.log('Overview URL:', page.url());

    const overviewData = await page.evaluate(() => {
      const sep = document.querySelector('.bg-slate-100.w-2') || document.querySelector('.bg-slate-100');
      const firstTab = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Overview');

      const sepRect = sep ? sep.getBoundingClientRect() : null;
      const firstTabRect = firstTab ? firstTab.getBoundingClientRect() : null;

      return {
        sepLeft: sepRect ? sepRect.left : null,
        sepRight: sepRect ? sepRect.right : null,
        firstTabLeft: firstTabRect ? firstTabRect.left : null,
        offsetFromSepRight: (firstTabRect && sepRect) ? (firstTabRect.left - sepRect.right) : null,
      };
    });

    console.log('HEALTH:', JSON.stringify(healthData, null, 2));
    console.log('OVERVIEW:', JSON.stringify(overviewData, null, 2));
  } else {
    console.log('Page content:', (await page.content()).slice(0, 500));
  }

  await browser.close();
})();
