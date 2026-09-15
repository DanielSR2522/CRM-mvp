const { chromium } = require('playwright');

(async () => {
  const edgePath = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  const browser = await chromium.launch({ executablePath: edgePath, headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  console.log('Navigating to http://localhost:3001/login...');
  await page.goto('http://localhost:3001/login');
  await page.waitForTimeout(4000);

  const emailInput = await page.$('input[type="email"]');
  console.log('Email input exists:', Boolean(emailInput));
  if (emailInput) {
    console.log('Filling email and password...');
    await page.fill('input[type="email"]', 'agent@smartrack.com');
    await page.fill('input[type="password"]', 'Password123!');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(4000);
  } else {
    // Check if Continue to CRM button exists
    const continueBtn = await page.$('button:has-text("Continue to CRM")');
    if (continueBtn) {
      console.log('Clicking Continue to CRM...');
      await continueBtn.click();
      await page.waitForTimeout(3000);
    }
  }

  console.log('Logged in URL:', page.url());

  console.log('Navigating to http://localhost:3001/clients...');
  await page.goto('http://localhost:3001/clients');
  await page.waitForTimeout(3000);

  const clientLink = await page.$('a[href^="/clients/"]');
  let href = '/clients/8ec921a5-08f4-4ad7-9bb3-3113929067ce';
  if (clientLink) {
    href = await clientLink.getAttribute('href');
  }

  // 1. Measure HEALTH
  const healthUrl = `http://localhost:3001${href}?section=health`;
  console.log('Navigating to Health:', healthUrl);
  await page.goto(healthUrl);
  await page.waitForTimeout(4000);

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
  const overviewUrl = `http://localhost:3001${href}?section=overview`;
  console.log('Navigating to Overview:', overviewUrl);
  await page.goto(overviewUrl);
  await page.waitForTimeout(4000);

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

  console.log('MEASUREMENTS_COMPARISON:');
  console.log('HEALTH:', JSON.stringify(healthData, null, 2));
  console.log('OVERVIEW:', JSON.stringify(overviewData, null, 2));

  await browser.close();
})();
