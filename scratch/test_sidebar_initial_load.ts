export {};
console.log('===========================================================');
console.log('TESTING CLIENT SIDEBAR INITIAL DATA RESOLUTION & FALLBACKS');
console.log('===========================================================\n');

let pass = 0;
let fail = 0;

function assert(cond: boolean, msg: string) {
  if (cond) {
    console.log(`✅ PASS: ${msg}`);
    pass++;
  } else {
    console.error(`❌ FAIL: ${msg}`);
    fail++;
  }
}

// Sidebar Resolution Helper matching page.tsx logic
function resolveSidebarData(
  loadingClient: boolean,
  loadingPersonal: boolean,
  loadingResidence: boolean,
  client: any,
  personalInfo: any,
  residenceInfo: any
) {
  const name = (loadingClient || loadingPersonal)
    ? 'Loading...'
    : ((personalInfo?.full_name && personalInfo.full_name.trim().length > 0)
        ? personalInfo.full_name.trim()
        : (client?.full_name || '-'));

  const email = (loadingClient || loadingPersonal)
    ? 'Loading...'
    : ((personalInfo?.email && personalInfo.email.trim().length > 0)
        ? personalInfo.email.trim()
        : ((client?.email && client.email.trim().length > 0) ? client.email.trim() : '-'));

  const phone = (loadingClient || loadingPersonal)
    ? 'Loading...'
    : ((personalInfo?.phone && personalInfo.phone.trim().length > 0)
        ? personalInfo.phone.trim()
        : ((client?.phone && client.phone.trim().length > 0) ? client.phone.trim() : '-'));

  let address = 'Loading...';
  if (!loadingClient && !loadingResidence) {
    const resParts = [residenceInfo?.address, residenceInfo?.city, residenceInfo?.state || residenceInfo?.county, residenceInfo?.zip_code]
      .filter(Boolean).map(s => String(s).trim()).filter(Boolean);
    const clientParts = [client?.address, client?.city, client?.state, client?.zip_code]
      .filter(Boolean).map(s => String(s).trim()).filter(Boolean);

    address = resParts.length > 0
      ? resParts.join(', ')
      : (clientParts.length > 0 ? clientParts.join(', ') : '-');
  }

  return { name, email, phone, address };
}

// Test Case 1: Initial loading state
const initial = resolveSidebarData(true, true, true, null, null, null);
assert(initial.name === 'Loading...', 'Name displays Loading... while loading');
assert(initial.email === 'Loading...', 'Email displays Loading... while loading');
assert(initial.phone === 'Loading...', 'Phone displays Loading... while loading');
assert(initial.address === 'Loading...', 'Address displays Loading... while loading');

// Test Case 2: Loaded with client_personal_information & client_residence_information overrides
const clientData = { full_name: 'Aemond Targaryen', email: 'aemond@dragon.com', phone: '555-1111', address: 'Old Address', city: 'Dragonstone', state: 'VA', zip_code: '20101' };
const personalData = { full_name: 'Aemond One-Eye Targaryen', email: 'aemond.updated@dragon.com', phone: '555-9999' };
const residenceData = { address: 'Red Keep Tower 4', city: 'Kings Landing', state: 'FL', zip_code: '33101' };

const loadedWithPersonal = resolveSidebarData(false, false, false, clientData, personalData, residenceData);
assert(loadedWithPersonal.name === 'Aemond One-Eye Targaryen', 'Name prefers personal_information.full_name over clients.full_name');
assert(loadedWithPersonal.email === 'aemond.updated@dragon.com', 'Email prefers personal_information.email over clients.email');
assert(loadedWithPersonal.phone === '555-9999', 'Phone prefers personal_information.phone over clients.phone');
assert(loadedWithPersonal.address === 'Red Keep Tower 4, Kings Landing, FL, 33101', 'Address prefers residence_information over clients address');

// Test Case 3: Fallback to clients table when personal/residence DB rows do not exist yet
const loadedMasterOnly = resolveSidebarData(false, false, false, clientData, null, null);
assert(loadedMasterOnly.name === 'Aemond Targaryen', 'Name falls back to clients.full_name');
assert(loadedMasterOnly.email === 'aemond@dragon.com', 'Email falls back to clients.email');
assert(loadedMasterOnly.phone === '555-1111', 'Phone falls back to clients.phone');
assert(loadedMasterOnly.address === 'Old Address, Dragonstone, VA, 20101', 'Address falls back to clients address fields');

// Test Case 4: Complete empty fallbacks
const emptyCase = resolveSidebarData(false, false, false, {}, null, null);
assert(emptyCase.name === '-', 'Name falls back to - when empty');
assert(emptyCase.email === '-', 'Email falls back to - when empty');
assert(emptyCase.phone === '-', 'Phone falls back to - when empty');
assert(emptyCase.address === '-', 'Address falls back to - when empty');

console.log('\n===========================================================');
console.log(`RESULTS: ${pass} PASSED, ${fail} FAILED`);
console.log('===========================================================');
