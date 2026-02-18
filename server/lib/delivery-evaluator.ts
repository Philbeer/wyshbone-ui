import { persistArtefactBatch, type ArtefactInput } from './artefact-persister';

export interface EvaluationInput {
  runId: string;
  requestedCount: number;
  userMessage: string;
  constraints: ParsedConstraint[];
  leads: EvaluationLead[];
}

export interface EvaluationLead {
  name: string;
  location?: string;
  phone?: string;
  website?: string;
  place_id?: string;
  types?: string[];
  business_type?: string;
  raw?: Record<string, any>;
}

export interface ParsedConstraint {
  text: string;
  field: 'business_type' | 'location' | 'amenity' | 'attribute' | 'count' | 'other';
  hard: boolean;
  verifiable: boolean;
  verificationSource?: string;
}

export type Verdict = 'PASS' | 'PARTIAL' | 'STOP';

export interface ConstraintCheck {
  constraint: string;
  hard: boolean;
  verifiable: boolean;
  passed: boolean;
  reason: string;
}

export interface LeadVerification {
  name: string;
  location?: string;
  exactMatch: boolean;
  checks: ConstraintCheck[];
  softViolations: string[];
}

const GOOGLE_PLACES_VERIFIABLE_ATTRIBUTES = new Set([
  'restaurant', 'bar', 'cafe', 'pub', 'hotel', 'gym', 'spa',
  'bakery', 'pharmacy', 'supermarket', 'store', 'shop',
  'parking', 'gas_station', 'bank', 'atm', 'hospital',
  'school', 'church', 'library', 'museum', 'park',
  'stadium', 'cinema', 'theater', 'nightclub',
  'laundry', 'car_wash', 'car_repair', 'veterinary_care',
  'dentist', 'doctor', 'florist', 'furniture_store',
  'hair_care', 'beauty_salon', 'clothing_store',
  'electronics_store', 'hardware_store', 'jewelry_store',
  'pet_store', 'shoe_store', 'convenience_store',
]);

const UNVERIFIABLE_AMENITIES = new Set([
  'beer garden', 'outdoor seating', 'live music', 'quiz night',
  'garden', 'terrace', 'rooftop', 'play area', 'playground',
  'dog friendly', 'pet friendly', 'disabled access', 'wheelchair',
  'parking', 'free wifi', 'private dining', 'function room',
  'happy hour', 'cocktails', 'craft beer', 'real ale',
  'sunday roast', 'vegan menu', 'gluten free',
  'open fire', 'fireplace', 'river view', 'sea view',
  'pool table', 'darts', 'karaoke', 'jukebox',
]);

export function parseConstraints(userMessage: string, searchQuery?: { business_type?: string; location?: string }): ParsedConstraint[] {
  const constraints: ParsedConstraint[] = [];
  const msg = userMessage.toLowerCase();

  if (searchQuery?.business_type) {
    const bt = searchQuery.business_type.toLowerCase();
    constraints.push({
      text: searchQuery.business_type,
      field: 'business_type',
      hard: true,
      verifiable: true,
      verificationSource: 'google_places_type',
    });
  }

  if (searchQuery?.location) {
    constraints.push({
      text: searchQuery.location,
      field: 'location',
      hard: true,
      verifiable: true,
      verificationSource: 'google_places_location',
    });
  }

  const countMatch = msg.match(/(?:find|get|show|list|discover)\s+(\d+)\s/i);
  if (countMatch) {
    constraints.push({
      text: `${countMatch[1]} results requested`,
      field: 'count',
      hard: false,
      verifiable: true,
      verificationSource: 'count_check',
    });
  }

  const unverifiableArr = Array.from(UNVERIFIABLE_AMENITIES);
  for (const amenity of unverifiableArr) {
    if (msg.includes(amenity)) {
      constraints.push({
        text: amenity,
        field: 'amenity',
        hard: true,
        verifiable: false,
        verificationSource: undefined,
      });
    }
  }

  const attributePatterns = [
    /(?:that|which|with)\s+(?:have?|has|offer|offers|include|features?)\s+(?:a\s+)?(.+?)(?:\s+(?:in|near|around|within)|$)/gi,
    /with\s+(?:a\s+)?(.+?)(?:\s+(?:in|near|around|within)|,|$)/gi,
  ];

  for (const pattern of attributePatterns) {
    let match;
    while ((match = pattern.exec(msg)) !== null) {
      const attr = match[1].trim().toLowerCase();
      if (attr.length > 2 && attr.length < 50) {
        const alreadyCaptured = constraints.some(c =>
          c.text.toLowerCase() === attr || attr.includes(c.text.toLowerCase()) || c.text.toLowerCase().includes(attr)
        );
        if (!alreadyCaptured) {
          const isUnverifiable = UNVERIFIABLE_AMENITIES.has(attr) ||
            !GOOGLE_PLACES_VERIFIABLE_ATTRIBUTES.has(attr.replace(/s$/, ''));
          constraints.push({
            text: attr,
            field: 'attribute',
            hard: true,
            verifiable: !isUnverifiable,
            verificationSource: isUnverifiable ? undefined : 'google_places_type',
          });
        }
      }
    }
  }

  return constraints;
}

function verifyLead(lead: EvaluationLead, constraints: ParsedConstraint[]): LeadVerification {
  const checks: ConstraintCheck[] = [];
  const softViolations: string[] = [];
  let exactMatch = true;

  for (const c of constraints) {
    if (c.field === 'count') continue;

    if (!c.verifiable) {
      checks.push({
        constraint: c.text,
        hard: c.hard,
        verifiable: false,
        passed: false,
        reason: `"${c.text}" cannot be verified via available data sources`,
      });
      if (c.hard) {
        exactMatch = false;
        softViolations.push(`${c.text} (unverifiable)`);
      }
      continue;
    }

    if (c.field === 'business_type') {
      const typeText = c.text.toLowerCase();
      const leadTypes = (lead.types || []).map(t => t.toLowerCase());
      const nameMatch = lead.name.toLowerCase().includes(typeText) ||
        (lead.business_type || '').toLowerCase().includes(typeText);
      const typeMatch = leadTypes.some(t => t.includes(typeText) || typeText.includes(t));
      const passed = nameMatch || typeMatch;

      checks.push({
        constraint: c.text,
        hard: c.hard,
        verifiable: true,
        passed,
        reason: passed
          ? `Matched via ${typeMatch ? 'place type' : 'name'}`
          : `No type or name match for "${c.text}"`,
      });

      if (!passed && c.hard) exactMatch = false;
      if (!passed && !c.hard) softViolations.push(c.text);
      continue;
    }

    if (c.field === 'location') {
      const locText = c.text.toLowerCase();
      const leadLoc = (lead.location || '').toLowerCase();
      const passed = leadLoc.includes(locText) || locText.includes(leadLoc.split(',')[0]?.trim() || '');

      checks.push({
        constraint: c.text,
        hard: c.hard,
        verifiable: true,
        passed,
        reason: passed ? 'Location matches' : `Location "${lead.location}" does not contain "${c.text}"`,
      });

      if (!passed && c.hard) exactMatch = false;
      continue;
    }

    checks.push({
      constraint: c.text,
      hard: c.hard,
      verifiable: true,
      passed: true,
      reason: 'Default pass (no specific check)',
    });
  }

  return { name: lead.name, location: lead.location, exactMatch, checks, softViolations };
}

function computeVerdict(
  verifiedExactCount: number,
  requestedCount: number,
  hasUnverifiableHardConstraints: boolean,
  unverifiableConstraintTexts: string[],
): { verdict: Verdict; stopReason: { message: string; code: string } | null } {
  if (hasUnverifiableHardConstraints && verifiedExactCount === 0) {
    const constraintList = unverifiableConstraintTexts.join(', ');
    return {
      verdict: 'STOP',
      stopReason: {
        message: `"${constraintList}" cannot be verified through available data sources, so 0 exact matches can be confirmed. The ${unverifiableConstraintTexts.length > 1 ? 'constraints are' : 'constraint is'} unverifiable via Google Places or web data.`,
        code: 'unverifiable_constraint',
      },
    };
  }

  if (verifiedExactCount === 0 && requestedCount > 0) {
    return {
      verdict: 'STOP',
      stopReason: {
        message: `No results matched all constraints. 0 of ${requestedCount} requested could be verified.`,
        code: 'zero_matches',
      },
    };
  }

  if (verifiedExactCount >= requestedCount) {
    return { verdict: 'PASS', stopReason: null };
  }

  return {
    verdict: 'PARTIAL',
    stopReason: null,
  };
}

export function evaluateDelivery(input: EvaluationInput): {
  verificationSummary: Record<string, unknown>;
  towerJudgement: Record<string, unknown>;
  deliverySummary: Record<string, unknown>;
} {
  const { runId, requestedCount, constraints, leads } = input;

  const verifications = leads.map(lead => verifyLead(lead, constraints));
  const exactMatches = verifications.filter(v => v.exactMatch);
  const closestMatches = verifications.filter(v => !v.exactMatch);
  const verifiedExactCount = exactMatches.length;

  const unverifiableHardConstraints = constraints.filter(c => !c.verifiable && c.hard);
  const hasUnverifiableHardConstraints = unverifiableHardConstraints.length > 0;
  const unverifiableTexts = unverifiableHardConstraints.map(c => c.text);

  const { verdict, stopReason } = computeVerdict(
    verifiedExactCount,
    requestedCount,
    hasUnverifiableHardConstraints,
    unverifiableTexts,
  );

  const perConstraintStatus = constraints
    .filter(c => c.field !== 'count')
    .map(c => ({
      constraint: c.text,
      hard: c.hard,
      verifiable: c.verifiable,
      passRate: c.verifiable
        ? leads.length > 0
          ? verifications.filter(v => v.checks.find(ch => ch.constraint === c.text)?.passed).length / leads.length
          : 0
        : 0,
      unverifiableReason: !c.verifiable ? `"${c.text}" is not available in Google Places data` : undefined,
    }));

  const verificationSummary = {
    verified_count: verifiedExactCount,
    requested_count: requestedCount,
    total_leads_checked: leads.length,
    constraints_checked: constraints.filter(c => c.field !== 'count').length,
    unverifiable_constraints: unverifiableTexts,
    per_constraint: perConstraintStatus,
  };

  const deliveredRatio = requestedCount > 0 ? verifiedExactCount / requestedCount : 0;
  const confidence = Math.min(0.99, 0.5 + deliveredRatio * 0.4 + (hasUnverifiableHardConstraints ? 0 : 0.1));

  const towerVerdict = verdict === 'PASS' ? 'accept' :
    verdict === 'PARTIAL' ? 'revise' : 'reject';

  const towerJudgement = {
    verdict: towerVerdict,
    rationale: verdict === 'STOP'
      ? stopReason?.message || 'Search stopped due to constraint issues.'
      : verdict === 'PASS'
        ? `${verifiedExactCount}/${requestedCount} leads delivered and verified. All constraints met.`
        : `${verifiedExactCount}/${requestedCount} leads verified. Some constraints partially met.`,
    confidence: parseFloat(confidence.toFixed(2)),
    requested: requestedCount,
    delivered: verifiedExactCount,
    has_unverifiable_constraints: hasUnverifiableHardConstraints,
    unverifiable_constraints: unverifiableTexts,
  };

  const shortfall = Math.max(0, requestedCount - verifiedExactCount);

  let suggestedNextQuestion: string | null = null;
  if (verdict === 'STOP' && hasUnverifiableHardConstraints) {
    suggestedNextQuestion = `Would you like me to remove the "${unverifiableTexts.join('" / "')}" requirement and find ${requestedCount} that match the other criteria? Or should I broaden the search area?`;
  } else if (verdict === 'PARTIAL') {
    suggestedNextQuestion = `I found ${verifiedExactCount} of ${requestedCount}. Want me to broaden the criteria or expand the search area to find the remaining ${shortfall}?`;
  }

  const deliverySummary = {
    status: verdict,
    stop_reason: stopReason,
    delivered_exact: exactMatches.map(v => ({
      name: v.name,
      location: v.location,
      phone: leads.find(l => l.name === v.name)?.phone,
      website: leads.find(l => l.name === v.name)?.website,
    })),
    delivered_closest: closestMatches.map(v => ({
      name: v.name,
      location: v.location,
      phone: leads.find(l => l.name === v.name)?.phone,
      website: leads.find(l => l.name === v.name)?.website,
      soft_violations: v.softViolations,
    })),
    requested_count: requestedCount,
    delivered_count: verifiedExactCount,
    verified_exact_count: verifiedExactCount,
    shortfall,
    suggested_next_question: suggestedNextQuestion,
  };

  return { verificationSummary, towerJudgement, deliverySummary };
}

export async function evaluateAndPersist(input: EvaluationInput): Promise<{ ok: boolean; verdict: Verdict; error?: string }> {
  const { runId } = input;

  console.log(`[DELIVERY_EVAL] Starting evaluation for run=${runId} leads=${input.leads.length} constraints=${input.constraints.length} requested=${input.requestedCount}`);

  const { verificationSummary, towerJudgement, deliverySummary } = evaluateDelivery(input);

  const verdict = deliverySummary.status as Verdict;
  console.log(`[DELIVERY_EVAL] Verdict=${verdict} exact=${(deliverySummary as any).verified_exact_count} shortfall=${(deliverySummary as any).shortfall} run=${runId}`);

  const artefacts: ArtefactInput[] = [
    {
      runId,
      type: 'verification_summary',
      title: `Verification: ${(verificationSummary as any).verified_count}/${(verificationSummary as any).requested_count} verified`,
      summary: `${(verificationSummary as any).constraints_checked} constraints checked, ${(verificationSummary as any).unverifiable_constraints.length} unverifiable`,
      payload: verificationSummary,
    },
    {
      runId,
      type: 'tower_judgement',
      title: `Tower Verdict: ${(towerJudgement as any).verdict.toUpperCase()}`,
      summary: `${(towerJudgement as any).delivered}/${(towerJudgement as any).requested} delivered • Confidence ${Math.round((towerJudgement as any).confidence * 100)}%`,
      payload: towerJudgement,
    },
    {
      runId,
      type: 'delivery_summary',
      title: `Delivery: ${verdict}`,
      summary: `${(deliverySummary as any).delivered_count}/${(deliverySummary as any).requested_count} delivered${(deliverySummary as any).shortfall > 0 ? `, shortfall ${(deliverySummary as any).shortfall}` : ''}`,
      payload: deliverySummary,
    },
  ];

  const result = await persistArtefactBatch(artefacts);

  if (!result.ok) {
    console.error(`[DELIVERY_EVAL] Artefact persistence failed for run=${runId}: ${result.failed.join('; ')}`);
    const failArtefact: ArtefactInput = {
      runId,
      type: 'delivery_summary',
      title: 'Delivery: STOP',
      summary: 'Artefact persistence failed',
      payload: {
        status: 'STOP',
        stop_reason: { message: 'Artefact persistence failed — results may be incomplete', code: 'artefact_persist_failed' },
        delivered_exact: [],
        delivered_closest: [],
        requested_count: input.requestedCount,
        delivered_count: 0,
        verified_exact_count: 0,
        shortfall: input.requestedCount,
        suggested_next_question: 'There was a system error persisting results. Please try again.',
      },
    };
    await persistArtefactBatch([failArtefact]);
    return { ok: false, verdict: 'STOP', error: result.failed.join('; ') };
  }

  return { ok: true, verdict };
}
