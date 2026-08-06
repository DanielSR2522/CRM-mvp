const fs = require('fs');
const path = require('path');

const targetFile = path.join(__dirname, '../src/app/clients/[id]/page.tsx');
let content = fs.readFileSync(targetFile, 'utf-8');

// 1. Update validSections to include 'life'
const oldValidSections = `const validSections = ['overview', 'personal-information', 'personal-info', 'policies', 'documents', 'notes', 'consents', 'timeline', 'health'];`;
const newValidSections = `const rawSection = searchParams.get('section') || searchParams.get('tab');
  const validSections = ['overview', 'personal-information', 'personal-info', 'policies', 'documents', 'notes', 'consents', 'timeline', 'health', 'life'];`;

content = content.replace(
  "const rawSection = searchParams.get('section');\n  const validSections = ['overview', 'personal-information', 'personal-info', 'policies', 'documents', 'notes', 'consents', 'timeline', 'health'];",
  newValidSections
);

// 2. Add diagnostic logging inside handleTabChange
const oldHandleTab = `const handleTabChange = useCallback((tab: string) => {
    const targetSection = tab === 'personal-info' ? 'personal-information' : tab;
    const currentSectionInUrl = searchParams.get('section');
    if (currentSectionInUrl !== targetSection) {
      const paramsObj = new URLSearchParams(searchParams.toString());
      paramsObj.set('section', targetSection);
      router.push(\`/clients/\${clientId}?\${paramsObj.toString()}\`);
    }
  }, [clientId, router, searchParams]);`;

const newHandleTab = `const handleTabChange = useCallback((tab: string) => {
    console.log('[ClientTabNav] Clicked tab key:', tab);
    const targetSection = tab === 'personal-info' ? 'personal-information' : tab;
    const currentSectionInUrl = searchParams.get('section') || searchParams.get('tab');
    if (currentSectionInUrl !== targetSection) {
      const paramsObj = new URLSearchParams(searchParams.toString());
      paramsObj.set('section', targetSection);
      if (paramsObj.has('tab')) paramsObj.set('tab', targetSection);
      router.push(\`/clients/\${clientId}?\${paramsObj.toString()}\`);
    }
  }, [clientId, router, searchParams]);`;

content = content.replace(oldHandleTab, newHandleTab);

fs.writeFileSync(targetFile, content, 'utf-8');
console.log('Successfully fixed validSections and handleTabChange in page.tsx!');
