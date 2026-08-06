console.log('===========================================================');
console.log('TESTING CLIENT ACTIVITY TIMELINE AGGREGATION & NORMALIZATION');
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

interface NormalizedTimelineEvent {
  id: string;
  client_id: string;
  policy_id?: string | null;
  module: 'property_casualty' | 'health' | 'life' | 'consent' | 'client';
  category: 'policies' | 'notes' | 'documents' | 'consents';
  event_type: string;
  title: string;
  description: string | null;
  actor_name: string;
  created_at: string;
  related_label: string;
  target_tab: 'policies' | 'health' | 'life' | 'consents' | 'notes' | 'documents' | 'personal-info';
  target_policy_id?: string | null;
  dedup_key?: string;
}

// Mock raw items from all modules
const mockActivityEvents = [
  { id: 'act1', client_id: 'c1', policy_id: 'pol1', event_type: 'policy_created', title: 'P&C Policy Created', description: 'Auto Policy', metadata: { line_of_business: 'Auto', policy_number: 'AUT-100' }, created_at: '2026-08-01T10:00:00Z' }
];

const mockHealthPolicies = [
  { id: 'h1', client_id: 'c1', company_2026: 'Ambetter', plan_id: 'AMB-99', plan_name: 'Silver Care', plan_cost: 350, created_at: '2026-08-02T11:00:00Z' }
];

const mockLifePolicies = [
  {
    id: 'l1',
    client_id: 'c1',
    created_at: '2026-08-03T09:00:00Z',
    life_policy_products: [{ id: 'lp1', product_type: 'Term Life', company: 'National Life', policy_number: 'TERM-555', monthly_premium: 80, created_at: '2026-08-03T09:05:00Z' }],
    life_policy_beneficiaries: [{ id: 'lb1', name: 'Daemon Targaryen', relationship: 'Brother', benefit_percentage: 100, created_at: '2026-08-03T09:10:00Z' }],
    life_policy_documents: [{ id: 'ld1', file_name: 'life_policy_scan.pdf', file_size: 204800, created_at: '2026-08-03T09:15:00Z' }],
    life_policy_notes: [{ id: 'ln1', body: 'Medical checkup scheduled', created_at: '2026-08-03T09:20:00Z' }],
    life_policy_timeline_events: []
  }
];

const mockConsents = [
  { id: 'cs1', client_id: 'c1', status: 'signed', consent_templates: { internal_name: 'HIPAA Consent', public_title: 'Medical Data Authorization' }, created_at: '2026-08-04T14:00:00Z' }
];

const mockClientNotes = [
  { id: 'cn1', client_id: 'c1', body: 'Client called asking about billing statement', created_at: '2026-08-05T08:30:00Z' }
];

const mockClientDocs = [
  { id: 'cd1', client_id: 'c1', display_name: 'Drivers_License.pdf', file_name: 'dl.pdf', document_type: 'Identification', created_at: '2026-08-05T09:00:00Z' }
];

// Normalization function
function buildNormalizedTimeline(): NormalizedTimelineEvent[] {
  const list: NormalizedTimelineEvent[] = [];

  // P&C
  mockActivityEvents.forEach(evt => {
    list.push({
      id: evt.id,
      client_id: evt.client_id,
      policy_id: evt.policy_id,
      module: 'property_casualty',
      category: 'policies',
      event_type: evt.event_type,
      title: evt.title,
      description: evt.description,
      actor_name: 'Agent',
      created_at: evt.created_at,
      related_label: `P&C | ${evt.metadata.line_of_business} | ${evt.metadata.policy_number}`,
      target_tab: 'policies',
      target_policy_id: evt.policy_id,
      dedup_key: `act_${evt.id}_${evt.event_type}_${evt.created_at.slice(0, 19)}`
    });
  });

  // Health
  mockHealthPolicies.forEach(h => {
    list.push({
      id: `health_pol_${h.id}`,
      client_id: h.client_id,
      policy_id: h.id,
      module: 'health',
      category: 'policies',
      event_type: 'health_policy_created',
      title: 'Health Policy Registered',
      description: `Plan: ${h.plan_name} | Insurer: ${h.company_2026}`,
      actor_name: 'Agent',
      created_at: h.created_at,
      related_label: `Health | ${h.company_2026} | ${h.plan_id}`,
      target_tab: 'health',
      target_policy_id: h.id,
      dedup_key: `health_${h.id}_created_${h.created_at.slice(0, 19)}`
    });
  });

  // Life
  mockLifePolicies.forEach(l => {
    const mainProd = l.life_policy_products[0];
    const lifeLabel = mainProd ? `Life | ${mainProd.product_type} | ${mainProd.company}` : 'Life | Policy';

    l.life_policy_products.forEach(p => {
      list.push({
        id: `life_prod_${p.id}`,
        client_id: l.client_id,
        policy_id: l.id,
        module: 'life',
        category: 'policies',
        event_type: 'life_product_added',
        title: `Life Product: ${p.product_type} (${p.company})`,
        description: `Policy #: ${p.policy_number}`,
        actor_name: 'Agent',
        created_at: p.created_at,
        related_label: `Life | ${p.product_type} | ${p.company}`,
        target_tab: 'life',
        target_policy_id: l.id,
        dedup_key: `life_prod_${p.id}_${p.created_at.slice(0, 19)}`
      });
    });

    l.life_policy_beneficiaries.forEach(b => {
      list.push({
        id: `life_ben_${b.id}`,
        client_id: l.client_id,
        policy_id: l.id,
        module: 'life',
        category: 'policies',
        event_type: 'life_beneficiary_updated',
        title: `Life Beneficiary: ${b.name}`,
        description: `Relationship: ${b.relationship} | Allocation: ${b.benefit_percentage}%`,
        actor_name: 'Agent',
        created_at: b.created_at,
        related_label: lifeLabel,
        target_tab: 'life',
        target_policy_id: l.id,
        dedup_key: `life_ben_${b.id}_${b.created_at.slice(0, 19)}`
      });
    });

    l.life_policy_documents.forEach(d => {
      list.push({
        id: `life_doc_${d.id}`,
        client_id: l.client_id,
        policy_id: l.id,
        module: 'life',
        category: 'documents',
        event_type: 'life_document_uploaded',
        title: `Life Document Uploaded: ${d.file_name}`,
        description: `File Size: ${(d.file_size / 1024).toFixed(1)} KB`,
        actor_name: 'Agent',
        created_at: d.created_at,
        related_label: lifeLabel,
        target_tab: 'life',
        target_policy_id: l.id,
        dedup_key: `life_doc_${d.id}_${d.created_at.slice(0, 19)}`
      });
    });

    l.life_policy_notes.forEach(n => {
      list.push({
        id: `life_note_${n.id}`,
        client_id: l.client_id,
        policy_id: l.id,
        module: 'life',
        category: 'notes',
        event_type: 'life_note_added',
        title: 'Life Internal Note Added',
        description: n.body,
        actor_name: 'Agent',
        created_at: n.created_at,
        related_label: lifeLabel,
        target_tab: 'life',
        target_policy_id: l.id,
        dedup_key: `life_note_${n.id}_${n.created_at.slice(0, 19)}`
      });
    });
  });

  // Consents
  mockConsents.forEach(c => {
    list.push({
      id: `consent_${c.id}`,
      client_id: c.client_id,
      module: 'consent',
      category: 'consents',
      event_type: `consent_${c.status}`,
      title: `Consent Request: ${c.consent_templates.internal_name}`,
      description: `Status: ${c.status}`,
      actor_name: 'Agent',
      created_at: c.created_at,
      related_label: `Consent | ${c.consent_templates.internal_name}`,
      target_tab: 'consents',
      dedup_key: `consent_${c.id}_${c.status}_${c.created_at.slice(0, 19)}`
    });
  });

  // Client Notes
  mockClientNotes.forEach(n => {
    list.push({
      id: `cnote_${n.id}`,
      client_id: n.client_id,
      module: 'client',
      category: 'notes',
      event_type: 'client_note_added',
      title: 'Client Note Added',
      description: n.body,
      actor_name: 'Agent',
      created_at: n.created_at,
      related_label: 'Client | Note',
      target_tab: 'notes',
      dedup_key: `cnote_${n.id}_${n.created_at.slice(0, 19)}`
    });
  });

  // Client Docs
  mockClientDocs.forEach(d => {
    list.push({
      id: `cdoc_${d.id}`,
      client_id: d.client_id,
      module: 'client',
      category: 'documents',
      event_type: 'client_document_uploaded',
      title: `Client Document: ${d.display_name}`,
      description: `Category: ${d.document_type}`,
      actor_name: 'Agent',
      created_at: d.created_at,
      related_label: 'Client | Document',
      target_tab: 'documents',
      dedup_key: `cdoc_${d.id}_${d.created_at.slice(0, 19)}`
    });
  });

  list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return list;
}

const allEvents = buildNormalizedTimeline();

// 1. Check total event count across modules
assert(allEvents.length === 9, 'All 9 events across P&C, Health, Life, Consents, and Client level are aggregated');

// 2. Check descending sorting
const dates = allEvents.map(e => new Date(e.created_at).getTime());
const isSorted = dates.every((val, i, arr) => !i || arr[i - 1] >= val);
assert(isSorted, 'All activity events are sorted by created_at descending');

// 3. Category Filter tests
const policyEvents = allEvents.filter(e => e.category === 'policies');
const noteEvents = allEvents.filter(e => e.category === 'notes');
const docEvents = allEvents.filter(e => e.category === 'documents');
const consentEvents = allEvents.filter(e => e.category === 'consents');

assert(policyEvents.length === 4, 'Policies filter includes P&C created, Health registered, Life product, and Life beneficiary');
assert(noteEvents.length === 2, 'Notes filter includes Life note and Client note');
assert(docEvents.length === 2, 'Documents filter includes Life document and Client document');
assert(consentEvents.length === 1, 'Consents filter includes signed consent request');

// 4. Record Labels & Target Tabs Verification
const healthEvt = allEvents.find(e => e.module === 'health');
assert(healthEvt?.related_label === 'Health | Ambetter | AMB-99', 'Health related label matches format Health | Carrier | Plan ID');
assert(healthEvt?.target_tab === 'health', 'Health target tab is health');

const lifeEvt = allEvents.find(e => e.event_type === 'life_product_added');
assert(lifeEvt?.related_label === 'Life | Term Life | National Life', 'Life product related label matches format Life | Product | Carrier');
assert(lifeEvt?.target_tab === 'life', 'Life target tab is life');

const consentEvt = allEvents.find(e => e.module === 'consent');
assert(consentEvt?.related_label === 'Consent | HIPAA Consent', 'Consent related label matches format Consent | Template Name');
assert(consentEvt?.target_tab === 'consents', 'Consent target tab is consents');

console.log('\n===========================================================');
console.log(`RESULTS: ${pass} PASSED, ${fail} FAILED`);
console.log('===========================================================');
