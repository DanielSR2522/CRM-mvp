import assert from 'node:assert/strict';
import type { Frame } from 'playwright';
import {
  findAmbetterPolicyFrame,
  formatAmbetterReadinessDiagnostics,
} from '../src/lib/carrier-portals/automation/ambetter-policy-readiness';

function frameWithUrl(url: string): Frame {
  return { url: () => url } as unknown as Frame;
}

{
  const policyFrame = frameWithUrl('https://broker.ambetterhealth.com/apex/BC_VFP02_PolicyList?nonce=secret');
  const otherFrame = frameWithUrl('https://broker.ambetterhealth.com/apex/OtherPage');

  assert.equal(findAmbetterPolicyFrame([otherFrame, policyFrame]), policyFrame);
  assert.equal(findAmbetterPolicyFrame([otherFrame]), null);
}

{
  const formatted = formatAmbetterReadinessDiagnostics({
    finalUrl: 'https://broker.ambetterhealth.com/s/login/',
    pageTitle: 'Login',
    frameUrls: ['https://broker.ambetterhealth.com/s/login/'],
    loginTextVisible: true,
  });

  assert.match(formatted, /finalUrl=https:\/\/broker\.ambetterhealth\.com\/s\/login\//);
  assert.match(formatted, /pageTitle=Login/);
  assert.match(formatted, /loginTextVisible=true/);
  assert.match(formatted, /frameUrls=\[/);
}

console.log('Ambetter policy readiness helper tests passed.');
