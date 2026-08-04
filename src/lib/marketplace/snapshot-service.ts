import { supabase } from '@/lib/supabaseClient';
import { MarketplacePlanPreview, MarketplacePlanSnapshot, MarketplacePlanBenefitRecord } from './types';

export async function saveMarketplacePlanSnapshot(
  clientId: string,
  healthPolicyId: string,
  agentId: string | null,
  planPreview: MarketplacePlanPreview
): Promise<{ snapshotId: string; error?: string }> {
  try {
    // 1. Insert snapshot record
    const snapshotPayload: MarketplacePlanSnapshot = {
      agent_id: agentId || null,
      client_id: clientId,
      health_policy_id: healthPolicyId,
      plan_id: planPreview.id,
      coverage_year: planPreview.coverageYear,
      issuer_name: planPreview.issuerName,
      plan_name: planPreview.planName,
      metal_level: planPreview.metalLevel,
      plan_type: planPreview.planType,
      network_type: planPreview.networkType,
      premium_full: planPreview.premiumFull,
      tax_credit: planPreview.taxCredit,
      premium_net: planPreview.premiumNet,
      premium_annual: planPreview.premiumAnnual,
      deductible_individual: planPreview.deductibleIndividual,
      deductible_family: planPreview.deductibleFamily,
      drug_deductible_individual: planPreview.drugDeductibleIndividual,
      drug_deductible_family: planPreview.drugDeductibleFamily,
      oop_max_individual: planPreview.oopMaxIndividual,
      oop_max_family: planPreview.oopMaxFamily,
      raw_response: planPreview.rawPlan,
      fetched_at: new Date().toISOString(),
      applied_at: new Date().toISOString(),
    };

    const { data: snapshotData, error: snapshotErr } = await supabase
      .from('health_marketplace_plan_snapshots')
      .insert(snapshotPayload)
      .select('id')
      .single();

    if (snapshotErr) {
      console.error('Error inserting plan snapshot:', snapshotErr);
      return { snapshotId: '', error: snapshotErr.message };
    }

    const snapshotId = snapshotData.id;

    // 2. Insert benefits records
    if (planPreview.benefits && planPreview.benefits.length > 0) {
      const benefitRecords: MarketplacePlanBenefitRecord[] = planPreview.benefits.map((b) => ({
        snapshot_id: snapshotId,
        category: b.category,
        service_name: b.serviceName,
        copay_amount: b.copayAmount,
        coinsurance_percentage: b.coinsurancePercentage,
        deductible_applies: b.deductibleApplies,
        coverage_status: b.coverageStatus,
        individual_value: b.individualValue,
        family_value: b.familyValue,
        limitations: b.limitations || null,
        notes: b.notes || null,
        source_text: b.sourceText || null,
        source_url: b.sourceUrl || null,
        sort_order: b.sortOrder,
      }));

      const { error: benefitsErr } = await supabase
        .from('health_marketplace_plan_benefits')
        .insert(benefitRecords);

      if (benefitsErr) {
        console.error('Error inserting plan benefits:', benefitsErr);
      }
    }

    return { snapshotId };
  } catch (err: any) {
    console.error('saveMarketplacePlanSnapshot error:', err);
    return { snapshotId: '', error: err?.message || 'Failed to persist plan snapshot' };
  }
}

export async function fetchLatestMarketplaceSnapshot(healthPolicyId: string): Promise<{ snapshot: MarketplacePlanSnapshot | null; benefits: MarketplacePlanBenefitRecord[] }> {
  try {
    const { data: snapshot, error: sErr } = await supabase
      .from('health_marketplace_plan_snapshots')
      .select('*')
      .eq('health_policy_id', healthPolicyId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (sErr || !snapshot) {
      return { snapshot: null, benefits: [] };
    }

    const { data: benefits, error: bErr } = await supabase
      .from('health_marketplace_plan_benefits')
      .select('*')
      .eq('snapshot_id', snapshot.id)
      .order('sort_order', { ascending: true });

    return {
      snapshot,
      benefits: benefits || []
    };
  } catch (err) {
    console.error('fetchLatestMarketplaceSnapshot error:', err);
    return { snapshot: null, benefits: [] };
  }
}
