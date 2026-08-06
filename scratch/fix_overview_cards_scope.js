const fs = require('fs');
const path = require('path');

const targetFile = path.join(__dirname, '../src/app/clients/[id]/page.tsx');
let content = fs.readFileSync(targetFile, 'utf-8');

// Extract consolidatedOverviewCards definition block
const overviewCardsStart = content.indexOf("  // Build unified consolidated policy summary cards for Overview tab");
const overviewCardsEnd = content.indexOf("  })();", overviewCardsStart) + 7;

if (overviewCardsStart !== -1 && overviewCardsEnd !== -1) {
  const cardsBlock = content.substring(overviewCardsStart, overviewCardsEnd);
  
  // Remove cardsBlock from current position
  content = content.replace(cardsBlock, '');

  // Insert cardsBlock right above activeCount calculation (line ~1830)
  content = content.replace(
    "  // Consolidated overview stats across Health, P&C, Life, and Supplemental",
    `${cardsBlock}\n\n  // Consolidated overview stats across Health, P&C, Life, and Supplemental`
  );

  fs.writeFileSync(targetFile, content, 'utf-8');
  console.log('Successfully re-ordered consolidatedOverviewCards scope in page.tsx!');
} else {
  console.error('Could not find consolidatedOverviewCards block');
}
