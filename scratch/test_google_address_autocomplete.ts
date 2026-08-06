import { parseGooglePlace, NormalizedAddress } from '../src/components/address/GoogleAddressAutocomplete';

console.log('===========================================================');
console.log('TESTING GOOGLE ADDRESS AUTOCOMPLETE & INLINE EDITABLE ADDRESS');
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

// 1. Test parseGooglePlace normalization
const mockPlaceResult: any = {
  address_components: [
    { long_name: '1200', types: ['street_number'] },
    { long_name: 'S Pine Island Rd', types: ['route'] },
    { long_name: 'Plantation', types: ['locality'] },
    { long_name: 'Broward County', types: ['administrative_area_level_2'] },
    { short_name: 'FL', long_name: 'Florida', types: ['administrative_area_level_1'] },
    { long_name: '33324', types: ['postal_code'] },
    { long_name: 'United States', types: ['country'] },
  ],
  formatted_address: '1200 S Pine Island Rd, Plantation, FL 33324, USA',
  geometry: {
    location: {
      lat: () => 26.115,
      lng: () => -80.268,
    },
  },
  place_id: 'ChIJ123456789',
};

const parsed: NormalizedAddress = parseGooglePlace(mockPlaceResult);

assert(parsed.streetAddress === '1200 S Pine Island Rd', `Street Address parsed as "${parsed.streetAddress}"`);
assert(parsed.city === 'Plantation', `City parsed as "${parsed.city}"`);
assert(parsed.state === 'FL', `State parsed as "${parsed.state}"`);
assert(parsed.postalCode === '33324', `Postal Code parsed as "${parsed.postalCode}"`);
assert(parsed.country === 'United States', `Country parsed as "${parsed.country}"`);
assert(parsed.county === 'Broward County', `County parsed as "${parsed.county}"`);

console.log('\n===========================================================');
console.log(`RESULTS: ${pass} PASSED, ${fail} FAILED`);
console.log('===========================================================');
