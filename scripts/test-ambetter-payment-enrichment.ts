import assert from 'node:assert/strict';
import {
  AmbetterPaymentDetailError,
  AMBETTER_SESSION_EXPIRED_PATTERN,
  buildAmbetterPaymentInvoiceUrl,
  createFailedAmbetterPaymentEnrichment,
  extractLabeledValue,
  parseAmbetterPaymentDetailText,
  parseRequiredAmbetterPaymentDetail,
} from '../src/lib/carrier-portals/automation/ambetter-payment-detail';
import { isAmbetterPolicyEligibleForPaymentEnrichment } from '../src/lib/carrier-portals/automation/adapters/ambetter.adapter';
import { getCarrierPaymentStatus } from '../src/lib/carrier-portals/payment-semantics';
import { parseAmbetterCsv } from '../src/lib/carrier-portals/parsers/ambetter-parser';

const today = '2026-08-28';

function activeAmbetterRecord(rawData: Record<string, any> = {}, carrierStatus = 'active') {
  return {
    carrier: 'ambetter',
    carrier_status: carrierStatus,
    paid_through_date: null,
    autopay: false,
    balance: 0,
    raw_data: {
      rowLine: 'A,B,POL123,C,D,01/01/2026,12/31/2026,01/01/2026,12/31/2026,08/01/2026,X,X,X,X,X,X,',
      ...rawData,
    },
  };
}

function assertNotDue(status: ReturnType<typeof getCarrierPaymentStatus>) {
  assert.equal(status.paymentDue, false);
  assert.equal(status.amountDue, 0);
}

function assertDue(status: ReturnType<typeof getCarrierPaymentStatus>, amountDue: number) {
  assert.equal(status.paymentDue, true);
  assert.equal(status.amountDue, amountDue);
}

{
  const status = getCarrierPaymentStatus(activeAmbetterRecord({
    paid_through_date_detail: '09/30/2026',
    payment_current_amount: 123.45,
    delinquency_status: '30 days',
    payment_enrichment_status: 'enriched',
  }), today);

  assertDue(status, 123.45);
  assert.equal(status.paymentStatusLabel, 'Delinquent');
  assert.equal(status.paidThroughDate, '09/30/2026');
}

{
  const status = getCarrierPaymentStatus(activeAmbetterRecord({
    paid_through_date_detail: '08/28/2026',
    payment_current_amount: 50,
    delinquency_status: '60 days',
    payment_enrichment_status: 'enriched',
  }), today);

  assertDue(status, 50);
  assert.equal(status.paymentStatusLabel, 'Delinquent');
}

{
  const status = getCarrierPaymentStatus(activeAmbetterRecord({
    paid_through_date_detail: '07/31/2026',
    payment_current_amount: 50,
    payment_enrichment_status: 'enriched',
  }), today);

  assertNotDue(status);
  assert.equal(status.paymentStatusLabel, 'Paid');
}

{
  const status = getCarrierPaymentStatus(activeAmbetterRecord({
    rowLine: 'A,B,POL123,C,D,01/01/2026,12/31/2026,01/01/2026,12/31/2026,07/31/2026,X,X,X,X,X,X,',
    paid_through_date_detail: '09/30/2026',
    payment_current_amount: 88,
    delinquency_status: '30 days',
    payment_enrichment_status: 'enriched',
  }), today);

  assertDue(status, 88);
  assert.equal(status.paymentStatusLabel, 'Delinquent');
  assert.equal(status.paidThroughDate, '09/30/2026');
}

{
  const status = getCarrierPaymentStatus(activeAmbetterRecord({
    paid_through_date_detail: '09/30/2026',
    payment_current_amount: 0,
    payment_enrichment_status: 'enriched',
  }), today);

  assertNotDue(status);
  assert.equal(status.paymentStatusLabel, 'Paid');
}

{
  const status = getCarrierPaymentStatus(activeAmbetterRecord({
    paid_through_date_detail: '07/31/2026',
    payment_current_amount: 0,
    payment_enrichment_status: 'enriched',
  }), today);

  assertNotDue(status);
  assert.equal(status.paymentStatusLabel, 'Paid');
}

{
  const status = getCarrierPaymentStatus(activeAmbetterRecord({
    paid_through_date_detail: '09/30/2026',
    payment_current_amount: 12.34,
    delinquency_status: '30 days',
    payment_enrichment_status: 'enriched',
    autopay_status: 'enrolled',
  }), today);

  assertDue(status, 12.34);
  assert.equal(status.autopayStatus, 'enrolled');
}

{
  const status = getCarrierPaymentStatus(activeAmbetterRecord({
    payment_enrichment_status: 'failed',
    payment_enrichment_error: 'Timeout waiting for payment detail',
  }), today);

  assertNotDue(status);
  assert.equal(status.paymentStatusLabel, 'Unknown');
  assert.equal(status.paidThroughDate, null);
  assert.equal(status.amountDueFormatted, 'Unavailable');
}

{
  const status = getCarrierPaymentStatus(activeAmbetterRecord({
    paid_through_date_detail: '09/30/2026',
    payment_current_amount: 'malformed',
    payment_enrichment_status: 'enriched',
  }), today);

  assertNotDue(status);
  assert.equal(status.paymentStatusLabel, 'Unknown');
  assert.equal(status.amountDueFormatted, 'Unavailable');
}

{
  const status = getCarrierPaymentStatus(activeAmbetterRecord({
    rowLine: 'A,B,POL123,C,D,01/01/2026,12/31/2026,01/01/2026,07/31/2026,07/31/2026,X,X,X,X,X,X,',
    paid_through_date_detail: '07/31/2026',
    payment_current_amount: 25,
    payment_enrichment_status: 'skipped_inactive',
  }, 'inactive'), today);

  assertNotDue(status);
  assert.equal(status.isActive, false);
}

{
  const bryanStyleText = [
    'Eligible For Commissions',
    'Yes',
    'Delinquency Status',
    '60 days',
    'Linkage Effective Date',
    '06/01/2025',
    'Current Amount: $74.96Paid Through: 05/31/2026Last Payment Date: 04/14/26AutoPay: Not Enrolled',
  ].join('\n');
  const detail = parseAmbetterPaymentDetailText(bryanStyleText);

  assert.equal(detail.delinquency_status, '60 days');
  assert.equal(detail.payment_current_amount, 74.96);
  assert.equal(detail.paid_through_date_detail, '05/31/2026');
}

{
  const compactStructuredText = 'Eligible For CommissionsYesDelinquency Status30 daysLinkage Effective Date01/01/2025Current Amount: $103.02Paid Through: 06/30/2026Last Payment Date: 05/21/26AutoPay: Not Enrolled';
  const detail = parseAmbetterPaymentDetailText(compactStructuredText);

  assert.equal(detail.delinquency_status, '30 days');
  assert.equal(detail.payment_current_amount, 103.02);
  assert.equal(detail.paid_through_date_detail, '06/30/2026');
}

{
  const duplicateLabelText = [
    'Delinquency Status',
    'Linkage Effective Date',
    '01/01/2025',
    'Delinquency Status',
    '60 days',
    'Linkage Effective Date',
    '01/01/2025',
    'Current Amount: $256.28Paid Through: 05/31/2026Last Payment Date: 04/28/26AutoPay: Not Enrolled',
  ].join('\n');
  const detail = parseAmbetterPaymentDetailText(duplicateLabelText);

  assert.equal(detail.delinquency_status, '60 days');
}

{
  const blankDelinquencyText = [
    'Eligible For Commissions',
    'Yes',
    'Delinquency Status',
    'Linkage Effective Date',
    '08/01/2026',
    'Current Amount: $595.28Paid Through: 08/31/2026Last Payment Date: 08/01/26AutoPay: Not Enrolled',
  ].join('\n');
  const detail = parseAmbetterPaymentDetailText(blankDelinquencyText);

  assert.equal(detail.delinquency_status, null);
}

{
  const delayedReadyText = 'Current Amount: $75.35Paid Through: 06/30/2026Last Payment Date: 08/26/26AutoPay: Not Enrolled';
  const delayedCompleteText = `${delayedReadyText}\nDelinquency Status\n60 days\nLinkage Effective Date`;

  assert.equal(parseAmbetterPaymentDetailText(delayedReadyText).delinquency_status, null);
  assert.equal(parseAmbetterPaymentDetailText(delayedCompleteText).delinquency_status, '60 days');
}

{
  const compactLabelValue = 'Eligible For CommissionsYesDelinquency Status60 daysLinkage Effective Date01/01/2025';

  assert.equal(extractLabeledValue(compactLabelValue, 'Delinquency Status'), '60 days');
  assert.equal(extractLabeledValue('Delinquency StatusLinkage Effective Date01/01/2025', 'Delinquency Status'), null);
}

{
  const compactText = 'Delinquency Status\n60 days\nCurrent Amount: $256.28Paid Through: 05/31/2026Last Payment Date: 04/28/26AutoPay: Not Enrolled';
  const detail = parseAmbetterPaymentDetailText(compactText);

  assert.equal(detail.payment_current_amount, 256.28);
  assert.equal(detail.paid_through_date_detail, '05/31/2026');
  assert.equal(detail.delinquency_status, '60 days');
  assert.equal(detail.last_payment_date, '04/28/2026');
  assert.equal(detail.autopay_status, 'not_enrolled');
}

{
  const compactTextWithButton = [
    'Payments/Invoices',
    'Enroll In AutoPay',
    'Make a Payment',
    'Delinquency Status',
    '30 days',
    'Current Amount: $256.28Paid Through: 05/31/2026Last Payment Date: 04/28/26AutoPay: Not Enrolled',
    'Navigation Mode',
  ].join('\n');
  const detail = parseAmbetterPaymentDetailText(compactTextWithButton);

  assert.equal(detail.payment_current_amount, 256.28);
  assert.equal(detail.paid_through_date_detail, '05/31/2026');
  assert.equal(detail.delinquency_status, '30 days');
  assert.equal(detail.last_payment_date, '04/28/2026');
  assert.equal(detail.autopay_status, 'not_enrolled');
}

{
  const enriched = parseRequiredAmbetterPaymentDetail(
    'Current Amount: $103.02Paid Through: 06/30/2026Last Payment Date: 05/21/26AutoPay: Not Enrolled',
    'direct'
  );

  assert.equal(enriched.payment_current_amount, 103.02);
  assert.equal(enriched.paid_through_date_detail, '06/30/2026');
  assert.equal(enriched.last_payment_date, '05/21/2026');
  assert.equal(enriched.autopay_status, 'not_enrolled');
  assert.equal(enriched.payment_detail_source, 'direct');
}

{
  assert.throws(
    () => parseRequiredAmbetterPaymentDetail('Current Amount: $abcPaid Through: 06/30/2026AutoPay: Not Enrolled', 'direct'),
    (error) => error instanceof AmbetterPaymentDetailError && error.status === 'parse_failed'
  );
}

{
  assert.throws(
    () => parseRequiredAmbetterPaymentDetail('AutoPay: Not Enrolled', 'direct'),
    (error) => error instanceof AmbetterPaymentDetailError && error.status === 'parse_failed'
  );
}

{
  assert.throws(
    () => parseRequiredAmbetterPaymentDetail('Payments/Invoices\nMake a Payment\nNo invoice data available', 'direct'),
    (error) => error instanceof AmbetterPaymentDetailError && error.status === 'no_current_invoice'
  );
}

{
  const sessionFailure = createFailedAmbetterPaymentEnrichment(
    new AmbetterPaymentDetailError('session_failed', 'Ambetter portal session expired while reading payment detail.')
  );
  assert.equal(sessionFailure.payment_enrichment_status, 'session_failed');

  const pageFailure = createFailedAmbetterPaymentEnrichment(
    new AmbetterPaymentDetailError('page_failed', 'Ambetter View Payments/Invoices link was not found.')
  );
  assert.equal(pageFailure.payment_enrichment_status, 'page_failed');
}

{
  const headers = [
    'Policy Number',
    'Policy Effective Date',
    'Policy Term Date',
    'Broker Term Date',
    'Status',
  ];
  const suspendedRow = ['U98791207', '06/01/2024', '12/31/2026', '12/31/9999', 'Suspended'];
  const inactiveRow = ['U96055313', '01/01/2025', '07/31/2026', '12/31/9999', 'Inactive'];

  assert.equal(isAmbetterPolicyEligibleForPaymentEnrichment(headers, suspendedRow), true);
  assert.equal(isAmbetterPolicyEligibleForPaymentEnrichment(headers, inactiveRow), false);
}

{
  const regressionCases = [
    ['Eduardo Soto Santiago', 'Current Amount: $256.28Paid Through: 05/31/2026Last Payment Date: 04/28/26AutoPay: Not Enrolled', 256.28, '05/31/2026', '04/28/2026'],
    ['Alicia Rivera', 'Current Amount: $103.02Paid Through: 06/30/2026Last Payment Date: 05/21/26AutoPay: Not Enrolled', 103.02, '06/30/2026', '05/21/2026'],
    ['Maria Uribe Parra', 'Current Amount: $70.05Paid Through: 06/30/2026Last Payment Date: 08/17/26AutoPay: Not Enrolled', 70.05, '06/30/2026', '08/17/2026'],
    ['Maria Ortiz Martinez', 'Current Amount: $75.35Paid Through: 06/30/2026Last Payment Date: 08/26/26AutoPay: Not Enrolled', 75.35, '06/30/2026', '08/26/2026'],
  ] as const;

  for (const [memberName, text, amount, paidThrough, lastPayment] of regressionCases) {
    const detail = parseRequiredAmbetterPaymentDetail(text, 'direct');
    assert.equal(detail.payment_current_amount, amount, memberName);
    assert.equal(detail.paid_through_date_detail, paidThrough, memberName);
    assert.equal(detail.last_payment_date, lastPayment, memberName);
    assert.equal(detail.autopay_status, 'not_enrolled', memberName);
  }
}

{
  const detailText = [
    'Current Amount: $123.45',
    'Paid Through: 09/30/2026',
    'Last Payment Date: 08/15/2026',
    'AutoPay: Enrolled',
  ].join('\n');
  const detail = parseAmbetterPaymentDetailText(detailText);

  assert.equal(detail.payment_current_amount, 123.45);
  assert.equal(detail.paid_through_date_detail, '09/30/2026');
  assert.equal(detail.last_payment_date, '08/15/2026');
  assert.equal(detail.autopay_status, 'enrolled');
}

{
  const malformed = parseAmbetterPaymentDetailText('Policy page loaded without payment fields');
  assert.equal(malformed.payment_current_amount, null);
  assert.equal(malformed.paid_through_date_detail, null);
  assert.equal(malformed.autopay_status, 'unknown');
}

{
  assert.equal(AMBETTER_SESSION_EXPIRED_PATTERN.test('Sign in to your account'), true);
  assert.equal(buildAmbetterPaymentInvoiceUrl('POL 123').includes('POL%20123'), true);
}

{
  const csv = [
    [
      'Member ID',
      'Member Name',
      'Balance',
      'Effective Date',
      'Term Date',
      'Status',
      'Member Responsibility',
      'Payment Current Amount Detail',
      'Paid Through Date Detail',
      'Delinquency Status Detail',
      'Last Payment Date Detail',
      'AutoPay Status Detail',
      'Payment Enrichment Status',
      'Payment Enriched At',
      'Payment Enrichment Error',
      'Payment Detail Source',
    ].join(','),
    [
      'POL123',
      'Example Member',
      '$25.00',
      '01/01/2026',
      '12/31/2026',
      'Active',
      '$456.78',
      '$123.45',
      '09/30/2026',
      '30 days',
      '08/15/2026',
      'enrolled',
      'enriched',
      '2026-08-28T12:00:00.000Z',
      '',
      'direct',
    ].join(','),
  ].join('\n');
  const [record] = parseAmbetterCsv(csv);

  assert.equal(record.raw_data.payment_current_amount, 123.45);
  assert.equal(record.raw_data.paid_through_date_detail, '09/30/2026');
  assert.equal(record.raw_data.delinquency_status, '30 days');
  assert.equal(record.raw_data.last_payment_date, '08/15/2026');
  assert.equal(record.raw_data.autopay_status, 'enrolled');
  assert.equal(record.raw_data.payment_enrichment_status, 'enriched');
  assert.equal(record.raw_data.payment_detail_source, 'direct');
  assert.equal(record.premium_amount, 456.78);
  assert.equal(record.coverage_start_date, '2026-01-01');
  assert.equal(record.coverage_end_date, '2026-12-31');
}

{
  const csv = [
    [
      'Member ID',
      'Member Name',
      'Effective Date',
      'Term Date',
      'Status',
      'Payment Current Amount Detail',
      'Paid Through Date Detail',
      'Payment Enrichment Status',
      'Payment Enriched At',
      'Payment Enrichment Error',
      'Payment Detail Source',
    ].join(','),
    [
      'POL456',
      'Parse Failed Member',
      '01/01/2026',
      '12/31/2026',
      'Active',
      '',
      '',
      'parse_failed',
      '2026-08-28T12:00:00.000Z',
      'Required fields were not parseable',
      '',
    ].join(','),
  ].join('\n');
  const [record] = parseAmbetterCsv(csv);

  assert.equal(record.raw_data.payment_enrichment_status, 'parse_failed');
  assert.equal(record.raw_data.payment_enrichment_error, 'Required fields were not parseable');
}

{
  const oscarActive = getCarrierPaymentStatus({
    carrier: 'oscar',
    carrier_status: 'active',
    balance: 99,
    raw_data: { AutoPay: 'Yes' },
  }, today);
  assertNotDue(oscarActive);
  assert.equal(oscarActive.autopayStatus, 'enrolled');

  const oscarGrace = getCarrierPaymentStatus({
    carrier: 'oscar',
    carrier_status: 'grace_period',
    balance: 99,
    raw_data: { AutoPay: 'No' },
  }, today);
  assert.equal(oscarGrace.paymentDue, true);
  assert.equal(oscarGrace.amountDue, 99);
  assert.equal(oscarGrace.autopayStatus, 'not_enrolled');
}

console.log('Ambetter payment enrichment semantics tests passed.');
