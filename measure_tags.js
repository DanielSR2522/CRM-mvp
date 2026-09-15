const { chromium } = require('playwright');

(async () => {
  const edgePath = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  const browser = await chromium.launch({ executablePath: edgePath, headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  try {
    console.log('Navigating to http://localhost:3001/login...');
    await page.goto('http://localhost:3001/login', { waitUntil: 'networkidle' });

    console.log('Logging in...');
    await page.fill('input[type="email"]', 'agent@smartrack.com');
    await page.fill('input[type="password"]', 'Password123!');
    await page.click('button[type="submit"]');

    await page.waitForTimeout(2000);

    console.log('Navigating to http://localhost:3001/clients...');
    await page.goto('http://localhost:3001/clients', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    // Look for Denise Reinoso or first client
    const deniseLink = await page.$('a:has-text("Denise")') || await page.$('a[href^="/clients/"]');
    if (!deniseLink) {
      console.log('No client link found.');
      await browser.close();
      return;
    }

    const href = await deniseLink.getAttribute('href');
    const clientUrl = `http://localhost:3001${href}?section=overview`;
    console.log('Navigating to client overview:', clientUrl);
    await page.goto(clientUrl, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);

    const measurements = await page.evaluate(() => {
      const h1 = document.querySelector('header h1') || document.querySelector('h1');
      const addTagsBtn = document.querySelector('button[title="Add tags"]') || Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Add tags'));
      const tagsContainer = addTagsBtn ? addTagsBtn.parentElement : null;

      const nameRect = h1 ? h1.getBoundingClientRect() : null;
      const tagBtnRect = addTagsBtn ? addTagsBtn.getBoundingClientRect() : null;
      const tagsContainerRect = tagsContainer ? tagsContainer.getBoundingClientRect() : null;

      return {
        nameText: h1 ? h1.textContent.trim() : null,
        nameLeft: nameRect ? nameRect.left : null,
        tagBtnLeft: tagBtnRect ? tagBtnRect.left : null,
        tagsContainerLeft: tagsContainerRect ? tagsContainerRect.left : null,
        tagsContainerClasses: tagsContainer ? tagsContainer.className : null,
        tagBtnClasses: addTagsBtn ? addTagsBtn.className : null,
      };
    });

    console.log('MEASUREMENTS_RESULTS:', JSON.stringify(measurements, null, 2));

  } catch (err) {
    console.error('Error in measurement script:', err);
  } finally {
    await browser.close();
  }
})();
