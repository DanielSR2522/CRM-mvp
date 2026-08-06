const fs = require('fs');
const path = require('path');

const targetFile = path.join(__dirname, '../src/app/clients/[id]/page.tsx');
let content = fs.readFileSync(targetFile, 'utf-8');

const targetHeader = `function ClientProfileContent({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { id: clientId } = use(params);`;

const newHeaderAndTabNav = `function ClientProfileContent({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { id: clientId } = use(params);
  const { isLineEnabled } = useBusinessLines();

  const isValidUuid = (uuid: string) => {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid);
  };

  // Section mapping & URL-driven tab state
  const rawSection = searchParams.get('section') || searchParams.get('tab');
  const validSections = ['overview', 'personal-information', 'personal-info', 'policies', 'documents', 'notes', 'consents', 'timeline', 'health', 'life'];
  const normalizedSection = validSections.includes(rawSection || '')
    ? (rawSection === 'personal-info' ? 'personal-information' : rawSection!)
    : 'overview';

  const activeTab = (normalizedSection === 'personal-information' ? 'personal-info' : normalizedSection) as 'overview' | 'personal-info' | 'policies' | 'documents' | 'notes' | 'consents' | 'timeline' | 'health' | 'life';

  // Temporary diagnostic log as requested
  if (typeof window !== 'undefined') {
    console.log('[ClientTabNav Diagnostic]', {
      rawSection,
      normalizedSection,
      activeTab,
      isLifeRendered: activeTab === 'life',
      isLifeEnabled: isLineEnabled('life')
    });
  }

  const handleTabChange = useCallback((tab: string) => {
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

// Clean up broken header if present
const brokenHeaderIndex = content.indexOf('function ClientProfileContent');
const sidebarPrefIndex = content.indexOf('// Client Sidebar Collapse Preference');

if (brokenHeaderIndex !== -1 && sidebarPrefIndex !== -1) {
  content = content.substring(0, brokenHeaderIndex) + newHeaderAndTabNav + '\n\n  ' + content.substring(sidebarPrefIndex);
  fs.writeFileSync(targetFile, content, 'utf-8');
  console.log('Successfully restored ClientProfileContent header with life in validSections and diagnostic logs!');
} else {
  console.error('Could not find header boundaries');
}
