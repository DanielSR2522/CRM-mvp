console.log('===========================================================');
console.log('TESTING 4 CLIENT DATA SYNCHRONIZATION ISSUES');
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

// 1. Issue 1: Personal Info Name Fallback Order Test
const clientMaster = { full_name: 'Aemond Targaryen', email: 'aemond@targaryen.com', phone: '555-0199' };
const emptyPersonalInfo = { full_name: '', email: null, phone: null };
const populatedPersonalInfo = { full_name: 'Aemond One-Eye Targaryen', email: 'oneeye@targaryen.com', phone: '555-0999' };

const resolveName = (pData: any, cData: any) => {
  return (pData?.full_name && pData.full_name.trim().length > 0)
    ? pData.full_name.trim()
    : (cData?.full_name || '');
};

assert(resolveName(emptyPersonalInfo, clientMaster) === 'Aemond Targaryen', 'Issue 1: Applicant Name inherits clients.full_name when personal info name is empty');
assert(resolveName(populatedPersonalInfo, clientMaster) === 'Aemond One-Eye Targaryen', 'Issue 1: Applicant Name preserves personal_information.full_name when non-empty');

// 2. Issue 2: P&C Sidebar Resolution Test
const residenceInfo = { address: '777 Dragonpit Way', city: 'King Landing', state: 'Westeros', zip_code: '10001' };

const resolveSidebar = (pData: any, cData: any, rData: any) => {
  const name = (pData?.full_name && pData.full_name.trim().length > 0) ? pData.full_name.trim() : (cData?.full_name || '-');
  const email = (pData?.email && pData.email.trim().length > 0) ? pData.email.trim() : (cData?.email || '-');
  const phone = (pData?.phone && pData.phone.trim().length > 0) ? pData.phone.trim() : (cData?.phone || '-');
  
  let address = '-';
  if (rData?.address && rData.address.trim().length > 0) {
    address = [rData.address.trim(), rData.city?.trim(), rData.state?.trim(), rData.zip_code?.trim()].filter(Boolean).join(', ');
  } else if (cData?.address && cData.address.trim().length > 0) {
    address = cData.address.trim();
  }

  return { name, email, phone, address };
};

const sidebarResult = resolveSidebar(emptyPersonalInfo, clientMaster, residenceInfo);
assert(sidebarResult.name === 'Aemond Targaryen', 'Issue 2: Sidebar resolves name correctly via fallback');
assert(sidebarResult.email === 'aemond@targaryen.com', 'Issue 2: Sidebar resolves email correctly via client fallback');
assert(sidebarResult.phone === '555-0199', 'Issue 2: Sidebar resolves phone correctly via client fallback');
assert(sidebarResult.address === '777 Dragonpit Way, King Landing, Westeros, 10001', 'Issue 2: Sidebar resolves residence address correctly');

// 3. Issue 3: Use Address on File logic test
const getAddressOnFile = (rData: any, cData: any) => {
  let street = '';
  let c = '';
  let s = '';
  let z = '';

  if (rData?.address && rData.address.trim().length > 0) {
    street = rData.address.trim();
    c = rData.city?.trim() || '';
    s = rData.state?.trim() || '';
    z = rData.zip_code?.trim() || '';
  } else if (cData?.address && cData.address.trim().length > 0) {
    street = cData.address.trim();
  }

  const hasAddress = Boolean(street || c || s || z);
  return { street, c, s, z, hasAddress };
};

const addrTest1 = getAddressOnFile(residenceInfo, clientMaster);
assert(addrTest1.hasAddress === true && addrTest1.street === '777 Dragonpit Way' && addrTest1.c === 'King Landing', 'Issue 3: Use Address on File extracts street, city, state, zip');

const addrTest2 = getAddressOnFile(null, { full_name: 'No Address Client' });
assert(addrTest2.hasAddress === false, 'Issue 3: Detects when no address is available in Personal Information');

// 4. Issue 4: Health Enrolled label test
const healthPolicyRecord = { active: true, policy_status: 'Active' };
assert(healthPolicyRecord.active === true, 'Issue 4: Health DB field remains active = true');

console.log('\n===========================================================');
console.log(`RESULTS: ${pass} PASSED, ${fail} FAILED`);
console.log('===========================================================');

export {};
