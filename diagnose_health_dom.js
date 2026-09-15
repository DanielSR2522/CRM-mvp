const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const edgePath = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  const browser = await chromium.launch({ executablePath: edgePath, headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  console.log('Navigating to http://localhost:3001/login...');
  await page.goto('http://localhost:3001/login', { waitUntil: 'networkidle' });

  console.log('Filling login credentials...');
  await page.fill('input[type="email"]', 'agent@smartrack.com');
  await page.fill('input[type="password"]', 'Password123!');
  await page.click('button[type="submit"]');

  await page.waitForTimeout(3000);
  console.log('Logged in. Current URL:', page.url());

  console.log('Navigating to http://localhost:3001/clients...');
  await page.goto('http://localhost:3001/clients', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  const clientLink = await page.$('a[href^="/clients/"]');
  let url = 'http://localhost:3001/clients';
  if (clientLink) {
    const href = await clientLink.getAttribute('href');
    url = `http://localhost:3001${href}?section=health`;
  } else {
    url = 'http://localhost:3001/clients/1?section=health';
  }

  console.log('Navigating to client health section:', url);
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  const screenshotPath = 'C:/Users/SEBASTIAN/.gemini/antigravity/brain/d95dd424-c260-4c09-8d52-3328f1437c0a/health_profile_diagnosis.png';
  await page.screenshot({ path: screenshotPath, fullPage: false });
  console.log('Saved screenshot to:', screenshotPath);

  const diagnosis = await page.evaluate(() => {
    function getCssDetails(el, label) {
      if (!el) return null;
      const cs = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return {
        label,
        tagName: el.tagName,
        id: el.id || null,
        className: el.className,
        rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
        backgroundColor: cs.backgroundColor,
        borderLeft: `${cs.borderLeftWidth} ${cs.borderLeftStyle} ${cs.borderLeftColor}`,
        borderRight: `${cs.borderRightWidth} ${cs.borderRightStyle} ${cs.borderRightColor}`,
        borderTop: `${cs.borderTopWidth} ${cs.borderTopStyle} ${cs.borderTopColor}`,
        borderBottom: `${cs.borderBottomWidth} ${cs.borderBottomStyle} ${cs.borderBottomColor}`,
        marginLeft: cs.marginLeft,
        marginRight: cs.marginRight,
        paddingLeft: cs.paddingLeft,
        paddingRight: cs.paddingRight,
        boxShadow: cs.boxShadow,
        gap: cs.gap,
        flex: cs.flex,
        position: cs.position,
        outerHTMLSnippet: el.outerHTML.slice(0, 300)
      };
    }

    const main = document.querySelector('main');
    const globalSidebar = document.querySelector('aside');
    const healthHeader = document.querySelector('header') || document.querySelector('.bg-white.border-b');
    const navTabs = document.querySelector('.bg-\\[\\#F3F6FB\\]') || document.querySelector('nav')?.parentElement;
    const mainContentArea = document.querySelector('.p-6.flex-1') || document.querySelector('.space-y-6');

    // Find all elements inside workspace flex row
    const workspaceFlexRow = document.querySelector('.flex.flex-col.lg\\:flex-row') || document.querySelector('.items-stretch');
    
    let flexRowChildren = [];
    if (workspaceFlexRow) {
      flexRowChildren = Array.from(workspaceFlexRow.children).map((child, idx) => ({
        index: idx,
        details: getCssDetails(child, `workspaceFlexRow_child_${idx}`),
        childrenCount: child.children.length,
        childrenDetails: Array.from(child.children).map((c, cIdx) => getCssDetails(c, `child_${idx}_subchild_${cIdx}`))
      }));
    }

    const healthLeftRailAside = Array.from(document.querySelectorAll('aside')).find(a => a !== globalSidebar);
    const mainContentContainer = healthLeftRailAside ? healthLeftRailAside.nextElementSibling : null;

    return {
      pageTitle: document.title,
      pageURL: window.location.href,
      main: getCssDetails(main, 'main'),
      globalSidebar: getCssDetails(globalSidebar, 'globalSidebar'),
      healthHeader: getCssDetails(healthHeader, 'healthHeader'),
      navTabs: getCssDetails(navTabs, 'navTabs'),
      workspaceFlexRow: getCssDetails(workspaceFlexRow, 'workspaceFlexRow'),
      flexRowChildren,
      healthLeftRailAside: getCssDetails(healthLeftRailAside, 'healthLeftRailAside'),
      mainContentContainer: getCssDetails(mainContentContainer, 'mainContentContainer'),
      mainContentArea: getCssDetails(mainContentArea, 'mainContentArea')
    };
  });

  const outPath = 'C:/Users/SEBASTIAN/.gemini/antigravity/brain/d95dd424-c260-4c09-8d52-3328f1437c0a/health_dom_diagnosis.json';
  fs.writeFileSync(outPath, JSON.stringify(diagnosis, null, 2));
  console.log('Saved JSON diagnosis to:', outPath);

  await browser.close();
})();
