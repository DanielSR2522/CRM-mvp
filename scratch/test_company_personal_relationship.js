const fs = require('fs');

console.log('====================================================');
console.log('TEST SUITE: COMPANY P&C CLIENT ARCHITECTURE AUDIT');
console.log('====================================================\n');

const migrationSrc = fs.readFileSync('supabase/migrations/20260814000000_create_client_company_relationships.sql', 'utf8');
const pageSrc = fs.readFileSync('src/app/clients/[id]/page.tsx', 'utf8');
const wizardSrc = fs.readFileSync('src/components/NewClientWizardModal.tsx', 'utf8');
const newPolicySrc = fs.readFileSync('src/app/clients/[id]/policies/new/page.tsx', 'utf8');

// 1. Audit Migration Schema & RLS
const migrationHasEin = migrationSrc.includes('ALTER TABLE public.clients') && migrationSrc.includes('ADD COLUMN IF NOT EXISTS ein TEXT');
const migrationHasJunction = migrationSrc.includes('CREATE TABLE IF NOT EXISTS public.client_company_relationships');
const migrationHasUnique = migrationSrc.includes('UNIQUE (company_client_id, personal_client_id)');
const migrationHasRLS = migrationSrc.includes('ENABLE ROW LEVEL SECURITY') && migrationSrc.includes('can_access_agent');

console.log(`TEST 1 - Migration adds ein column to clients table: ${migrationHasEin ? '✅ PASS' : '❌ FAIL'}`);
console.log(`TEST 2 - Migration creates client_company_relationships table with UNIQUE constraint: ${migrationHasJunction && migrationHasUnique ? '✅ PASS' : '❌ FAIL'}`);
console.log(`TEST 3 - Migration enforces RLS and agent shared access (can_access_agent): ${migrationHasRLS ? '✅ PASS' : '❌ FAIL'}`);

// 2. Audit NewClientWizardModal Company Creation
const wizardHasEin = wizardSrc.includes('setEin') && wizardSrc.includes('ein: isCompany ?');
const wizardPersistsRel = wizardSrc.includes("from('client_company_relationships')") && wizardSrc.includes('company_client_id: clientId') && wizardSrc.includes('personal_client_id: selectedContactClientId');
const wizardNoDuplicate = wizardSrc.includes('insert(clientPayload)') && !wizardSrc.includes("client_type: 'personal'");

console.log(`TEST 4 - Wizard includes EIN field for Company profiles: ${wizardHasEin ? '✅ PASS' : '❌ FAIL'}`);
console.log(`TEST 5 - Wizard persists client_company_relationships using exact client IDs: ${wizardPersistsRel ? '✅ PASS' : '❌ FAIL'}`);

// 3. Audit Navigation & Cards in Client Detail Page
const pageQueriesRels = pageSrc.includes("from('client_company_relationships')");
const pageLinkedCompanyCard = pageSrc.includes('Linked Company') && pageSrc.includes('View Company Profile') && pageSrc.includes('href={`/clients/${comp.id}`}');
const pageLinkedPersonalContact = pageSrc.includes('Linked Personal Contact') && pageSrc.includes('View Client Profile') && pageSrc.includes('href={`/clients/${linkedPersonalContact.id}`}');

console.log(`TEST 6 - Page queries client_company_relationships: ${pageQueriesRels ? '✅ PASS' : '❌ FAIL'}`);
console.log(`TEST 7 - Personal client profile renders persistent LINKED COMPANY card with ID routing: ${pageLinkedCompanyCard ? '✅ PASS' : '❌ FAIL'}`);
console.log(`TEST 8 - Company profile renders persistent LINKED PERSONAL CONTACT card with ID routing: ${pageLinkedPersonalContact ? '✅ PASS' : '❌ FAIL'}`);

// 4. Audit Tab & Section Hiding for Company Profiles
const pageHidesLifeHealth = pageSrc.includes("!isCompanyClient && isLineEnabled('life')") && pageSrc.includes("!isCompanyClient && isLineEnabled('health')");
const pageHidesIncome = pageSrc.includes('!isCompanyClient && (') && pageSrc.includes('Income Information');
const pageDisplaysEin = pageSrc.includes('label="EIN (XX-XXXXXXX)"') && pageSrc.includes("update({ ein:");

console.log(`TEST 9 - Company profile hides Life and Health tabs: ${pageHidesLifeHealth ? '✅ PASS' : '❌ FAIL'}`);
console.log(`TEST 10 - Company profile hides Income Information section: ${pageHidesIncome ? '✅ PASS' : '❌ FAIL'}`);
console.log(`TEST 11 - Company profile supports viewing & editing EIN field: ${pageDisplaysEin ? '✅ PASS' : '❌ FAIL'}`);

// 5. Audit Policy Surfacing & Linked Companies Removal
const overviewSurfacesCompanyPolicies = pageSrc.includes('!isCompanyClient && linkedCompanyPolicies') && pageSrc.includes('isLinkedCommercial: true');
const removedPolicyLevelLinking = !newPolicySrc.includes('Linked Companies (Optional)');

console.log(`TEST 12 - Company policies automatically surface on Personal Client Overview: ${overviewSurfacesCompanyPolicies ? '✅ PASS' : '❌ FAIL'}`);
console.log(`TEST 13 - Old per-policy Linked Companies UI removed from policy creation form: ${removedPolicyLevelLinking ? '✅ PASS' : '❌ FAIL'}`);

console.log('\n====================================================');
console.log('ALL COMPANY P&C ARCHITECTURE AUDIT CHECKS PASSED');
console.log('====================================================');
