import { NormalizedCarrierRecord, CarrierRecordDB, CarrierEventDB, EventSeverityType, CarrierEventType, CarrierType } from './types';

export interface DetectChangesInput {
  isBaseline: boolean;
  currentRecords: NormalizedCarrierRecord[];
  previousRecords: CarrierRecordDB[];
  matchesMap: Map<string, string | null>; // external_member_id -> client_id
  syncRunId: string;
  agentId: string;
  carrier: CarrierType;
}

export function detectCarrierChanges(input: DetectChangesInput): Omit<CarrierEventDB, 'id' | 'created_at'>[] {
  const { isBaseline, currentRecords, previousRecords, matchesMap, syncRunId, agentId, carrier } = input;
  const events: Omit<CarrierEventDB, 'id' | 'created_at'>[] = [];

  const previousMap = new Map<string, CarrierRecordDB>();
  previousRecords.forEach((rec) => {
    previousMap.set(rec.external_member_id, rec);
  });

  const currentMemberIds = new Set<string>();

  // 1. Process Current Records vs Previous Records
  for (const record of currentRecords) {
    const memberId = record.external_member_id;
    currentMemberIds.add(memberId);
    const clientId = matchesMap.get(memberId) || null;
    const prev = previousMap.get(memberId);

    if (!prev) {
      // New policy found
      if (!isBaseline) {
        events.push({
          agent_id: agentId,
          carrier,
          external_member_id: memberId,
          client_id: clientId,
          sync_run_id: syncRunId,
          event_type: 'NEW_POLICY',
          severity: 'info',
          previous_value: null,
          current_value: {
            member_name: record.member_name,
            plan: record.plan,
            carrier_status: record.carrier_status,
            premium_amount: record.premium_amount,
            balance: record.balance,
          },
        });
      }
      continue;
    }

    // Baseline or not, if previous record exists, check for diffs
    // A. Status Changed
    if (prev.carrier_status !== record.carrier_status) {
      events.push({
        agent_id: agentId,
        carrier,
        external_member_id: memberId,
        client_id: clientId,
        sync_run_id: syncRunId,
        event_type: 'STATUS_CHANGED',
        severity: record.carrier_status === 'inactive' || record.carrier_status === 'grace_period' ? 'warning' : 'info',
        previous_value: { status: prev.carrier_status },
        current_value: { status: record.carrier_status },
      });

      if (record.carrier_status === 'grace_period') {
        events.push({
          agent_id: agentId,
          carrier,
          external_member_id: memberId,
          client_id: clientId,
          sync_run_id: syncRunId,
          event_type: 'ENTERED_GRACE_PERIOD',
          severity: 'warning',
          previous_value: { status: prev.carrier_status },
          current_value: { status: record.carrier_status, balance: record.balance },
        });
      } else if (record.carrier_status === 'inactive') {
        events.push({
          agent_id: agentId,
          carrier,
          external_member_id: memberId,
          client_id: clientId,
          sync_run_id: syncRunId,
          event_type: 'BECAME_INACTIVE',
          severity: 'warning',
          previous_value: { status: prev.carrier_status },
          current_value: { status: record.carrier_status },
        });
      } else if (record.carrier_status === 'active') {
        events.push({
          agent_id: agentId,
          carrier,
          external_member_id: memberId,
          client_id: clientId,
          sync_run_id: syncRunId,
          event_type: 'BECAME_ACTIVE',
          severity: 'info',
          previous_value: { status: prev.carrier_status },
          current_value: { status: record.carrier_status },
        });
      }
    }

    // B. Balance Changed
    if (Number(prev.balance) !== Number(record.balance)) {
      events.push({
        agent_id: agentId,
        carrier,
        external_member_id: memberId,
        client_id: clientId,
        sync_run_id: syncRunId,
        event_type: 'BALANCE_CHANGED',
        severity: record.balance > prev.balance ? 'warning' : 'info',
        previous_value: { balance: prev.balance },
        current_value: { balance: record.balance },
      });

      if (Number(prev.balance) === 0 && Number(record.balance) > 0) {
        events.push({
          agent_id: agentId,
          carrier,
          external_member_id: memberId,
          client_id: clientId,
          sync_run_id: syncRunId,
          event_type: 'NEW_BALANCE',
          severity: 'warning',
          previous_value: { balance: prev.balance },
          current_value: { balance: record.balance },
        });
      } else if (Number(prev.balance) > 0 && Number(record.balance) === 0) {
        events.push({
          agent_id: agentId,
          carrier,
          external_member_id: memberId,
          client_id: clientId,
          sync_run_id: syncRunId,
          event_type: 'BALANCE_CLEARED',
          severity: 'info',
          previous_value: { balance: prev.balance },
          current_value: { balance: record.balance },
        });
      }
    }

    // C. Premium Changed
    if (Number(prev.premium_amount) !== Number(record.premium_amount)) {
      events.push({
        agent_id: agentId,
        carrier,
        external_member_id: memberId,
        client_id: clientId,
        sync_run_id: syncRunId,
        event_type: 'PREMIUM_CHANGED',
        severity: 'info',
        previous_value: { premium_amount: prev.premium_amount },
        current_value: { premium_amount: record.premium_amount },
      });
    }

    // D. Plan Changed
    if (prev.plan !== record.plan) {
      events.push({
        agent_id: agentId,
        carrier,
        external_member_id: memberId,
        client_id: clientId,
        sync_run_id: syncRunId,
        event_type: 'PLAN_CHANGED',
        severity: 'info',
        previous_value: { plan: prev.plan },
        current_value: { plan: record.plan },
      });
    }

    // E. Autopay Changed
    if (Boolean(prev.autopay) !== Boolean(record.autopay)) {
      events.push({
        agent_id: agentId,
        carrier,
        external_member_id: memberId,
        client_id: clientId,
        sync_run_id: syncRunId,
        event_type: 'AUTOPAY_CHANGED',
        severity: 'info',
        previous_value: { autopay: prev.autopay },
        current_value: { autopay: record.autopay },
      });
    }
  }

  // 2. Check for Policy Missing (present in previous sync, missing in current sync)
  if (!isBaseline) {
    for (const prev of previousRecords) {
      if (!currentMemberIds.has(prev.external_member_id)) {
        const clientId = matchesMap.get(prev.external_member_id) || null;
        events.push({
          agent_id: agentId,
          carrier,
          external_member_id: prev.external_member_id,
          client_id: clientId,
          sync_run_id: syncRunId,
          event_type: 'POLICY_MISSING',
          severity: 'warning',
          previous_value: {
            member_name: prev.member_name,
            plan: prev.plan,
            carrier_status: prev.carrier_status,
          },
          current_value: null,
        });
      }
    }
  }

  return events;
}
