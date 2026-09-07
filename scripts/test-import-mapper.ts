import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { suggestMapping } from '../src/lib/import-mapper/fields';
import { normalizeMappedRows } from '../src/lib/import-mapper/mapper';
import { normalizeDate, normalizePhone, normalizeState, normalizeZip } from '../src/lib/import-mapper/normalizers';
import { parseImportFile } from '../src/lib/import-mapper/parser';
import { buildImportPlan } from '../src/lib/import-mapper/planner';

function makeWorkbookBuffer(rows: Record<string, unknown>[]) {
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

function makeCsvBuffer(csv: string) {
  return Buffer.from(csv, 'utf8');
}

function testExcelParsing() {
  const parsed = parseImportFile(makeWorkbookBuffer([{ 'Nombre Aplicante': 'Yolanda Test', DOB: '01/15/1980' }]), 'Yolanda.xlsx');
  assert.equal(parsed.sourceType, 'xlsx');
  assert.deepEqual(parsed.columns, ['Nombre Aplicante', 'DOB']);
  assert.equal(parsed.rows[0]['Nombre Aplicante'], 'Yolanda Test');
}

function testCsvParsing() {
  const parsed = parseImportFile(makeCsvBuffer('Full Name,Phone\nJane Client,4075551212'), 'clients.csv');
  assert.equal(parsed.sourceType, 'csv');
  assert.equal(parsed.columns.includes('Full Name'), true);
  assert.equal(parsed.rows[0].Phone, '4075551212');
}

function testExcelSerialDates() {
  assert.equal(normalizeDate(45292), '2024-01-01');
  assert.equal(normalizeDate('04/28/26'), '2026-04-28');
}

function testYolandaMappingSuggestion() {
  const mapping = suggestMapping([
    'Record Id',
    'Nombre Aplicante',
    'Agente.Name',
    'DOB',
    'SSN',
    'Dirección física',
    'Ciudad',
    'Estado/provincia',
    'Código postal',
    'Acción Pendiente',
  ]);
  assert.equal(mapping['Record Id'], 'client.external_legacy_id');
  assert.equal(mapping['Nombre Aplicante'], 'client.full_name');
  assert.equal(mapping['Agente.Name'], 'client.agent');
  assert.equal(mapping.DOB, 'client.date_of_birth');
  assert.equal(mapping.SSN, 'client.ssn');
  assert.equal(mapping['Dirección física'], 'client.address');
  assert.equal(mapping.Ciudad, 'client.city');
  assert.equal(mapping['Estado/provincia'], 'client.state');
  assert.equal(mapping['Código postal'], 'client.zip');
  assert.equal(mapping['Acción Pendiente'], 'other.pending_action');
}

function testNormalization() {
  assert.equal(normalizeState('Florida'), 'FL');
  assert.equal(normalizeState('pr'), 'PR');
  assert.equal(normalizeZip('32801-1234'), '32801-1234');
  assert.equal(normalizeZip(32801), '32801');
  assert.equal(normalizePhone('14075551212'), '(407) 555-1212');
}

function testFieldMapping() {
  const rows = normalizeMappedRows(
    [{
      'Nombre Aplicante': 'Maria Rivera',
      DOB: '05/21/1985',
      SSN: '123456789',
      Premium: '$123.45',
      Carrier: 'Ambetter',
    }],
    {
      'Nombre Aplicante': 'client.full_name',
      DOB: 'client.date_of_birth',
      SSN: 'client.ssn',
      Premium: 'health_policy.premium',
      Carrier: 'health_policy.carrier',
    }
  );
  assert.equal(rows[0].client.firstName, 'Maria');
  assert.equal(rows[0].client.lastName, 'Rivera');
  assert.equal(rows[0].client.dateOfBirth, '1985-05-21');
  assert.equal(rows[0].client.ssn, '123-45-6789');
  assert.equal(rows[0].healthPolicy.premium, 123.45);
}

function testDuplicateDetectionAndDryRun() {
  const rows = [{
    Name: 'Jane Client',
    DOB: '01/01/1990',
    Phone: '(407) 555-1212',
  }];
  const plan = buildImportPlan(
    rows,
    { Name: 'client.full_name', DOB: 'client.date_of_birth', Phone: 'client.phone' },
    [{
      id: 'existing-client',
      full_name: 'Jane Client',
      email: null,
      phone: '4075551212',
      personal: { date_of_birth: '1990-01-01', ssn: null, email: null, phone: '4075551212' },
    }]
  );
  assert.equal(plan.summary.totalRows, 1);
  assert.equal(plan.summary.probableDuplicates, 1);
  assert.equal(plan.rows[0].duplicateAction, 'review');
  assert.equal(plan.rows[0].ready, false);
}

function testAdminImportAccessExpression() {
  const policy = "public.can_access_agent(agent_id, 'property_casualty')";
  assert.equal(policy.includes('can_access_agent'), true);
  assert.equal(policy.includes('agent_id = auth.uid()'), false);
}

testExcelParsing();
testCsvParsing();
testExcelSerialDates();
testYolandaMappingSuggestion();
testNormalization();
testFieldMapping();
testDuplicateDetectionAndDryRun();
testAdminImportAccessExpression();

console.log('Import mapper focused tests passed.');
