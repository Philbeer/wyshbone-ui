import { readFileSync } from 'fs';
import { join } from 'path';

export type ChatModeType = 'CHAT_INFO' | 'CLARIFY_FOR_RUN' | 'RUN_SUPERVISOR';

export interface ChatModeDecision {
  mode: ChatModeType;
  reason: string;
  entityType?: string;
  location?: string;
  requestedCount?: number;
}

const KNOWN_LOCATIONS = buildKnownLocationsSet();

function buildKnownLocationsSet(): Set<string> {
  const locs = new Set<string>();
  const dataDir = join(process.cwd(), 'server', 'data');
  const files = ['uk_counties.json', 'london_boroughs.json', 'gb_devolved.json', 'ie_counties.json'];
  for (const file of files) {
    try {
      const raw = readFileSync(join(dataDir, file), 'utf-8');
      const entries: Array<{ id?: string; name?: string }> = JSON.parse(raw);
      for (const entry of entries) {
        if (entry.name) locs.add(entry.name.toLowerCase().trim());
        if (entry.id) locs.add(entry.id.replace(/_/g, ' ').toLowerCase().trim());
      }
    } catch {}
  }
  const extraCities = [
    'london', 'edinburgh', 'glasgow', 'cardiff', 'belfast', 'aberdeen', 'dundee',
    'bath', 'oxford', 'cambridge', 'york', 'canterbury', 'brighton', 'bournemouth',
    'southampton', 'portsmouth', 'exeter', 'plymouth', 'norwich', 'nottingham',
    'leicester', 'coventry', 'wolverhampton', 'stoke', 'sunderland', 'hull',
    'bradford', 'middlesbrough', 'reading', 'luton', 'milton keynes', 'northampton',
    'swindon', 'peterborough', 'ipswich', 'colchester', 'chelmsford', 'gloucester',
    'chester', 'carlisle', 'darlington', 'harrogate', 'scarborough', 'whitby',
    'arundel', 'chichester', 'worthing', 'crawley', 'horsham', 'eastbourne',
    'hastings', 'lewes', 'tunbridge wells', 'maidstone', 'folkestone', 'dover',
    'margate', 'ramsgate', 'ashford', 'guildford', 'woking', 'epsom', 'windsor',
    'slough', 'watford', 'st albans', 'stevenage', 'hemel hempstead', 'harlow',
    'basildon', 'southend', 'cheltenham', 'stroud', 'cirencester', 'taunton',
    'yeovil', 'bridgwater', 'salisbury', 'newbury', 'basingstoke', 'andover',
    'winchester', 'fareham', 'gosport', 'havant', 'petersfield',
    'dorchester', 'weymouth', 'poole', 'christchurch', 'barnstaple', 'torquay',
    'truro', 'falmouth', 'newquay', 'penzance', 'st ives',
    'sussex', 'east sussex', 'west sussex',
    'blackpool', 'preston', 'burnley', 'lancaster', 'accrington', 'fleetwood',
    'morecambe', 'lytham', 'chorley', 'leyland', 'clitheroe', 'nelson',
    'colne', 'rawtenstall', 'bacup', 'ormskirk', 'skelmersdale', 'wigan',
    'bolton', 'bury', 'rochdale', 'oldham', 'stockport', 'tameside',
    'salford', 'trafford', 'warrington', 'widnes', 'runcorn', 'crewe',
    'macclesfield', 'congleton', 'nantwich', 'stafford', 'lichfield',
    'tamworth', 'burton upon trent', 'cannock', 'rugeley', 'uttoxeter',
    'newcastle under lyme', 'leek', 'biddulph', 'telford', 'shrewsbury',
    'oswestry', 'bridgnorth', 'ludlow', 'hereford', 'leominster', 'ross on wye',
    'worcester', 'redditch', 'bromsgrove', 'kidderminster', 'droitwich',
    'evesham', 'pershore', 'malvern', 'stratford upon avon', 'kenilworth',
    'rugby', 'nuneaton', 'bedworth', 'hinckley', 'loughborough',
    'melton mowbray', 'market harborough', 'coalville', 'corby', 'kettering',
    'wellingborough', 'rushden', 'daventry', 'towcester', 'brackley',
    'banbury', 'bicester', 'witney', 'carterton', 'abingdon', 'didcot',
    'wantage', 'henley on thames', 'thame', 'aylesbury', 'high wycombe',
    'amersham', 'chesham', 'marlow', 'maidenhead', 'wokingham', 'bracknell',
    'camberley', 'farnham', 'aldershot', 'farnborough', 'fleet', 'bordon',
    'liphook', 'midhurst', 'petworth', 'bognor regis', 'littlehampton',
    'birkenhead', 'wallasey', 'southport', 'formby', 'crosby', 'bootle',
    'st helens', 'prescot', 'huyton', 'kirkby', 'maghull',
    'grimsby', 'scunthorpe', 'cleethorpes', 'brigg', 'barton upon humber',
    'doncaster', 'rotherham', 'barnsley', 'wakefield', 'dewsbury',
    'batley', 'huddersfield', 'halifax', 'keighley', 'skipton', 'ilkley',
    'otley', 'wetherby', 'selby', 'goole', 'bridlington', 'driffield',
    'beverley', 'hornsea', 'withernsea', 'filey', 'pickering', 'malton',
    'thirsk', 'ripon', 'northallerton', 'richmond', 'leyburn',
    'stockton on tees', 'hartlepool', 'redcar', 'guisborough',
    'bishop auckland', 'durham', 'consett', 'stanley', 'chester le street',
    'seaham', 'peterlee', 'newton aycliffe', 'spennymoor',
    'south shields', 'gateshead', 'jarrow', 'washington', 'houghton le spring',
    'hexham', 'morpeth', 'blyth', 'cramlington', 'ashington', 'alnwick',
    'berwick upon tweed', 'amble', 'prudhoe', 'ponteland',
    'inverness', 'stirling', 'perth', 'dumfries', 'ayr', 'kilmarnock',
    'paisley', 'greenock', 'hamilton', 'motherwell', 'coatbridge', 'airdrie',
    'east kilbride', 'cumbernauld', 'livingston', 'kirkcaldy', 'dunfermline',
    'falkirk', 'alloa', 'arbroath', 'montrose', 'forfar', 'brechin',
    'elgin', 'nairn', 'fort william', 'oban', 'campbeltown',
    'swansea', 'newport', 'wrexham', 'bangor', 'aberystwyth', 'carmarthen',
    'llanelli', 'neath', 'port talbot', 'bridgend', 'pontypridd', 'caerphilly',
    'cwmbran', 'pontypool', 'abergavenny', 'monmouth', 'chepstow',
    'merthyr tydfil', 'ebbw vale', 'tredegar', 'bargoed', 'aberdare',
    'rhondda', 'barry', 'penarth', 'cowbridge',
    'uk', 'england', 'scotland', 'wales', 'northern ireland',
  ];
  for (const city of extraCities) {
    locs.add(city.toLowerCase().trim());
  }
  return locs;
}

const ENTITY_FINDING_VERBS = [
  'find', 'list', 'show', 'get', 'locate', 'search for', 'search',
  'look for', 'looking for', 'lookup', 'discover', 'get me',
  'generate leads', 'lead list', 'prospects',
];

const ENTITY_LOCATION_PATTERNS = [
  /(.+?)\s+in\s+([a-z][a-z\s,]+)/i,
  /(.+?)\s+near\s+([a-z][a-z\s,]+)/i,
  /(.+?)\s+around\s+([a-z][a-z\s,]+)/i,
  /(.+?)\s+at\s+([a-z][a-z\s,]+)/i,
];

const ENTITY_NOUN_PATTERNS = [
  /(?:find|list|show|get|locate|search\s+for|search|look\s+for|looking\s+for|lookup|discover|get\s+me)\s+(.+?)(?:\s+(?:in|near|around|at)\s+|$)/i,
  /\b(organisations?|organizations?|charities|charit(?:y|ies)|businesses|companies|shops?|pubs?|bars?|restaurants?|cafes?|coffee\s+shops?|hotels?|dentists?|dental\s+practices?|salons?|gyms?|clinics?|venues?|breweries?|bakeries?|florists?|plumbers?|electricians?|mechanics?|garages?|nurseries?|schools?|churches?|offices?|warehouses?|factories?|takeaways?|stores?|retailers?)\b/i,
];

const ENTITY_DISCOVERY_PATTERNS = [
  /\b(?:organisations?|organizations?|businesses|companies|charities)\s+(?:that|which|who)\b/i,
  /\b(?:places|establishments|outlets)\s+(?:that|which|who|in|near)\b/i,
];

const CHAT_INFO_PATTERNS = [
  /^(hi|hello|hey|thanks|thank you|ok|okay|sure|yes|no)\b/i,
  /^what (is|are|do|does|can|should)\b/i,
  /^how (do|does|can|should|to)\b/i,
  /^(explain|tell me about|describe|summarize|summarise|help)\b/i,
  /^(who is|who are|when did|when was|where is|where are|why)\b/i,
  /^(can you explain|what's the difference|define)\b/i,
];

const LOCATION_PATTERN = /\b(?:in|near|around)\s+([a-z][a-z\s,]+)/i;

const INFORMATIONAL_QUESTION_PREFIXES = [
  /^who (?:is|are|was|were)\b/i,
  /^what (?:is|are|was|were|do|does|can|should)\b/i,
  /^how (?:do|does|can|should|to|many|much)\b/i,
  /^why\b/i,
  /^when\b/i,
  /^where (?:is|are|was|were|do|does|can|should)\b/i,
  /^explain\b/i,
  /^tell me (?:about|what|how|why|when|where)\b/i,
  /^describe\b/i,
  /^define\b/i,
  /^can you explain\b/i,
  /^what's the (?:difference|best|biggest|largest|smallest)\b/i,
];

const QUANTIFIER_PATTERN = /^(?:(\d+)\s+|(?:a|an|some|several|few|many|couple(?:\s+of)?)\s+)/i;
const QUANTIFIER_WORD_MAP: Record<string, number> = {
};

export function sanitizeBusinessType(raw: string): { businessType: string; requestedCount?: number } {
  let working = raw.trim();
  let requestedCount: number | undefined;

  const match = working.match(QUANTIFIER_PATTERN);
  if (match) {
    if (match[1]) {
      requestedCount = parseInt(match[1], 10);
    } else {
      const word = match[0].trim().toLowerCase().replace(/\s+of$/, '');
      if (QUANTIFIER_WORD_MAP[word] !== undefined) {
        requestedCount = QUANTIFIER_WORD_MAP[word];
      }
    }
    working = working.slice(match[0].length).trim();
  }

  if (working.length === 0) {
    working = raw.trim();
    requestedCount = undefined;
  }

  return { businessType: working, requestedCount };
}

function detectEntityIntent(normalized: string): { isEntity: boolean; entityType?: string; location?: string; requestedCount?: number; reason: string } {
  for (const pattern of INFORMATIONAL_QUESTION_PREFIXES) {
    if (pattern.test(normalized)) {
      return { isEntity: false, reason: `Informational question prefix: "${normalized.slice(0, 30)}..."` };
    }
  }

  for (const verbPhrase of ENTITY_FINDING_VERBS) {
    if (normalized.includes(verbPhrase)) {
      const entityInfo = extractEntityAndLocation(normalized);
      return {
        isEntity: true,
        entityType: entityInfo.entityType,
        location: entityInfo.location,
        requestedCount: entityInfo.requestedCount,
        reason: `Entity-finding verb: "${verbPhrase}"`,
      };
    }
  }

  for (const pattern of ENTITY_DISCOVERY_PATTERNS) {
    if (pattern.test(normalized)) {
      const entityInfo = extractEntityAndLocation(normalized);
      return {
        isEntity: true,
        entityType: entityInfo.entityType,
        location: entityInfo.location,
        requestedCount: entityInfo.requestedCount,
        reason: 'Entity discovery pattern (X that/which...)',
      };
    }
  }

  for (const pattern of ENTITY_NOUN_PATTERNS) {
    const match = normalized.match(pattern);
    if (match) {
      const hasLocationContext = LOCATION_PATTERN.test(normalized);
      if (hasLocationContext) {
        const entityInfo = extractEntityAndLocation(normalized);
        const rawEntity = entityInfo.entityType || match[1]?.trim();
        const sanitized = rawEntity ? sanitizeBusinessType(rawEntity) : { businessType: rawEntity };
        return {
          isEntity: true,
          entityType: sanitized.businessType,
          location: entityInfo.location,
          requestedCount: entityInfo.requestedCount || sanitized.requestedCount,
          reason: `Entity noun with location context: "${sanitized.businessType}"`,
        };
      }
    }
  }

  return { isEntity: false, reason: 'No entity-finding intent detected' };
}

function extractTrailingKnownLocation(entityType: string): { location: string; cleanedEntity: string } | undefined {
  const words = entityType.toLowerCase().trim().split(/\s+/);
  if (words.length < 2) return undefined;

  for (let take = Math.min(words.length - 1, 4); take >= 1; take--) {
    const candidate = words.slice(words.length - take).join(' ');
    if (KNOWN_LOCATIONS.has(candidate)) {
      const cleaned = words.slice(0, words.length - take).join(' ').trim();
      if (cleaned.length > 0) {
        return { location: candidate, cleanedEntity: cleaned };
      }
    }
  }
  return undefined;
}

const NON_LOCATION_WORDS = new Set(['me', 'my area', 'my location', 'here', 'this area']);

function extractEntityAndLocation(message: string): { entityType?: string; location?: string; requestedCount?: number } {
  let location: string | undefined;
  let entityType: string | undefined;
  let requestedCount: number | undefined;

  const locMatch = message.match(LOCATION_PATTERN);
  if (locMatch && locMatch[1]) {
    const candidate = locMatch[1].trim().replace(/[.,!?;:]+$/, '');
    if (!NON_LOCATION_WORDS.has(candidate.toLowerCase())) {
      location = candidate;
    }
  }

  for (const pattern of ENTITY_NOUN_PATTERNS) {
    const match = message.match(pattern);
    if (match && match[1]) {
      const extracted = match[1].trim()
        .replace(/\s+(in|near|around|at)\s+.*$/i, '')
        .replace(/[.,!?;:]+$/, '');
      if (extracted.length > 0 && extracted.length < 100) {
        const sanitized = sanitizeBusinessType(extracted);
        entityType = sanitized.businessType;
        requestedCount = sanitized.requestedCount;
        break;
      }
    }
  }

  if (!location && entityType) {
    const trailing = extractTrailingKnownLocation(entityType);
    if (trailing) {
      location = trailing.location;
      entityType = trailing.cleanedEntity;
    }
  }

  return { entityType, location, requestedCount };
}

const SEMANTIC_CONSTRAINT_PATTERNS = [
  /\bthat\s+(?:work|deal|partner|collaborate|operate|specialise|specialize|focus|engage)\b/i,
  /\bwhich\s+(?:work|deal|partner|collaborate|operate|specialise|specialize|focus|engage)\b/i,
  /\bwho\s+(?:work|deal|partner|collaborate|operate|specialise|specialize|focus|engage)\b/i,
  /\bthat\s+(?:are|have|do|provide|offer|support|help|serve)\b/i,
  /\bwhich\s+(?:are|have|do|provide|offer|support|help|serve)\b/i,
  /\band\s+(?:have|are|do|provide|offer|support|help|serve)\b/i,
];

function hasSemanticConstraint(message: string): boolean {
  return SEMANTIC_CONSTRAINT_PATTERNS.some(p => p.test(message));
}

const OPENED_TIME_PREDICATE_PATTERNS = [
  /\b(?:that|which|who)\s+opened\s+(?:in\s+the\s+last|in\s+the\s+past|within\s+the\s+last|within\s+the\s+past)\s+\d+\s+(?:months?|years?|weeks?|days?)\b/i,
  /\b(?:that|which|who)\s+opened\s+(?:recently|this\s+year|this\s+month|last\s+year|last\s+month)\b/i,
  /\b(?:that|which)\s+(?:just|recently|newly)\s+opened\b/i,
  /\b(?:recently|newly|just)\s+opened\s+(?:pubs?|bars?|restaurants?|cafes?|shops?|stores?|businesses|venues?|hotels?|gyms?|salons?|clinics?|breweries?|bakeries?)\b/i,
  /\bnew(?:ly)?\s+(?:pubs?|bars?|restaurants?|cafes?|shops?|stores?|businesses|venues?|hotels?|gyms?|salons?|clinics?|breweries?|bakeries?)\s+(?:that|which)?\s*opened\b/i,
  /\bopened\s+(?:in\s+the\s+last|in\s+the\s+past|within\s+the\s+last|within\s+the\s+past)\s+\d+\s+(?:months?|years?|weeks?|days?)\b/i,
  /\bopened\s+(?:recently|this\s+year|this\s+month|last\s+year|last\s+month)\b/i,
];

const EXPLICIT_PROXY_PATTERNS = [
  /\busing\s+(?:[\w\s]+?)\s+as\s+(?:a\s+)?proxy\b/i,
  /\bproxy\s*:\s*\w+/i,
  /\buse\s+(?:first\s+review|google\s+listing|companies\s+house|news\s+mentions?|press\s+releases?|listing\s+freshness)\s+(?:as\s+(?:a\s+)?proxy|data|date)?\b/i,
];

const NO_PROXY_REFUSAL_PATTERNS = [
  /\bno\s+prox(?:y|ies)\b/i,
  /\bmust\s+be\s+certain\b/i,
  /\bno\s+(?:guessing|assumptions?|approximations?)\b/i,
  /\bonly\s+(?:if\s+)?(?:verified|confirmed|certain|guaranteed)\b/i,
  /\bdon'?t\s+(?:guess|assume|approximate)\b/i,
];

export function hasOpenedTimePredicate(message: string): boolean {
  return OPENED_TIME_PREDICATE_PATTERNS.some(p => p.test(message));
}

export function hasExplicitProxy(message: string): boolean {
  return EXPLICIT_PROXY_PATTERNS.some(p => p.test(message));
}

export function hasNoProxyRefusal(message: string): boolean {
  return NO_PROXY_REFUSAL_PATTERNS.some(p => p.test(message));
}

const COMPOUND_ATTRIBUTE_PATTERN = /\band\s+(?:have|are|do|provide|offer|support|help|serve)\s+([^.!?,]+)/gi;
const WITH_ATTRIBUTE_PATTERN = /\bwith\s+(live\s+music|beer\s+garden|outdoor\s+seating|parking|wifi|free\s+wifi|food|accommodation|garden|terrace|rooftop|karaoke|pool\s+table|darts|quiz\s+night|function\s+room|disabled\s+access|dog\s+friendly|vegan\s+(?:menu|options?)|gluten\s+free|halal|kosher|late\s+(?:opening|licence|license)|happy\s+hour|brunch|delivery|takeaway|drive\s+through|play\s+area|kids?\s+area)/gi;

const LOCATION_PREPOSITIONS = /\s+(?:in|near|around|from|across|throughout|within)\s+/i;
const STRUCTURAL_NOISE = /\s+(?:that|which|who|where|when)\s+/i;

export function extractAttributeConstraints(message: string): string[] {
  const attributes: string[] = [];
  const normalized = message.toLowerCase().trim();

  let match: RegExpExecArray | null;
  const compoundRe = new RegExp(COMPOUND_ATTRIBUTE_PATTERN.source, 'gi');
  while ((match = compoundRe.exec(normalized)) !== null) {
    let attr = match[1].trim()
      .replace(/\s+and\s+.*$/, '')
      .split(LOCATION_PREPOSITIONS)[0].trim()
      .split(STRUCTURAL_NOISE)[0].trim();
    if (attr.length > 2 && attr.length < 60 && !CONCRETE_ENTITY_NOUNS.test(attr)) {
      attributes.push(attr);
    }
  }

  const withRe = new RegExp(WITH_ATTRIBUTE_PATTERN.source, 'gi');
  while ((match = withRe.exec(normalized)) !== null) {
    const attr = match[1].trim();
    if (!attributes.some(a => a.includes(attr))) {
      attributes.push(attr);
    }
  }

  return attributes;
}

const CONCRETE_ENTITY_NOUNS = /\b(organisations?|organizations?|charities|charit(?:y|ies)|businesses|companies|shops?|pubs?|bars?|restaurants?|cafes?|coffee\s*shops?|hotels?|dentists?|dental\s+practices?|salons?|gyms?|clinics?|venues?|breweries?|bakeries?|florists?|plumbers?|electricians?|mechanics?|garages?|nurseries?|schools?|churches?|offices?|warehouses?|factories?|takeaways?|stores?|retailers?|accountants?|solicitors?|lawyers?|agents?|consultants?|contractors?|architects?|pharmacies|pharmacy|opticians?|vets?|veterinar(?:y|ians?)|caterers?|cleaners?|painters?|roofers?|landscapers?|builders?|joiners?|carpenters?|locksmiths?|tutors?|therapists?|counsellors?|counselors?|chiropractors?|physiotherapists?|osteopaths?|studios?|galleries?|cinemas?|theatres?|theaters?|libraries?|museums?|parks?|pools?|spas?|clubs?|lodges?|inns?|hostels?|motels?|B&Bs?|guesthouses?|guest\s*houses?|supermarkets?|markets?|boutiques?|dealerships?|showrooms?|workshops?|labs?|laboratories?|warehouses?|depots?|suppliers?|wholesalers?|distributors?|manufacturers?|printers?|signmakers?|jewellers?|jewelers?|tailors?|dressmakers?|cobblers?|barbers?|hairdressers?|beauticians?|aestheticians?|nail\s*bars?|tanning\s*salons?|tattoo\s*(?:parlours?|studios?|shops?)|piercing\s*studios?|launderettes?|laundromats?|dry\s*cleaners?)\b/i;

const SUBJECTIVE_WORDS = new Set([
  'best', 'top', 'greatest', 'finest', 'amazing', 'awesome', 'coolest', 'cool',
  'nicest', 'nice', 'vibes', 'vibe', 'energy', 'feels', 'feel', 'good', 'great',
  'excellent', 'fantastic', 'wonderful', 'brilliant', 'superb', 'outstanding',
  'exceptional', 'remarkable', 'incredible', 'magnificent', 'terrific', 'fabulous',
  'spectacular', 'phenomenal', 'extraordinary', 'marvellous', 'marvelous',
  'the', 'a', 'an', 'some', 'most', 'really', 'very', 'super', 'ultra',
]);

export function isKnownLocation(location: string): boolean {
  const normalized = location.toLowerCase().trim().replace(/[.,!?;:]+$/, '');
  if (KNOWN_LOCATIONS.has(normalized)) return true;
  const words = normalized.split(/\s+/);
  for (let take = Math.min(words.length, 4); take >= 1; take--) {
    for (let start = 0; start <= words.length - take; start++) {
      const candidate = words.slice(start, start + take).join(' ');
      if (KNOWN_LOCATIONS.has(candidate)) return true;
    }
  }
  return false;
}

export function hasConcreteEntityNoun(entityType: string): boolean {
  if (CONCRETE_ENTITY_NOUNS.test(entityType)) return true;
  const words = entityType.toLowerCase().trim().split(/\s+/);
  const allSubjective = words.every(w => SUBJECTIVE_WORDS.has(w));
  if (allSubjective) return false;
  return true;
}

function isRunnable(entityType?: string, location?: string, message?: string): boolean {
  if (!entityType || entityType.length === 0 || !location || location.length === 0) {
    return false;
  }
  if (message && hasSemanticConstraint(message)) {
    return false;
  }
  if (message && hasOpenedTimePredicate(message) && !hasExplicitProxy(message)) {
    return false;
  }
  if (!isKnownLocation(location)) {
    return false;
  }
  if (!hasConcreteEntityNoun(entityType)) {
    return false;
  }
  return true;
}

export function decideChatMode({ userMessage }: { userMessage: string }): ChatModeDecision {
  const normalized = userMessage.toLowerCase().trim();

  const entityResult = detectEntityIntent(normalized);

  if (entityResult.isEntity) {
    if (isRunnable(entityResult.entityType, entityResult.location, normalized)) {
      return {
        mode: 'RUN_SUPERVISOR',
        reason: entityResult.reason,
        entityType: entityResult.entityType,
        location: entityResult.location,
        requestedCount: entityResult.requestedCount,
      };
    } else {
      const missingParts: string[] = [];
      if (!entityResult.entityType) missingParts.push('entity type');
      if (!entityResult.location) missingParts.push('location');
      if (entityResult.location && !isKnownLocation(entityResult.location)) missingParts.push('unrecognised location');
      if (entityResult.entityType && !hasConcreteEntityNoun(entityResult.entityType)) missingParts.push('vague/subjective entity type');
      if (hasSemanticConstraint(normalized)) missingParts.push('semantic constraint needs clarification');
      if (hasOpenedTimePredicate(normalized) && !hasExplicitProxy(normalized)) missingParts.push('opened-time predicate needs proxy clarification');
      return {
        mode: 'CLARIFY_FOR_RUN',
        reason: `${entityResult.reason} — ${missingParts.length > 0 ? 'needs: ' + missingParts.join(', ') : 'needs clarification'}`,
        entityType: entityResult.entityType,
        location: entityResult.location,
        requestedCount: entityResult.requestedCount,
      };
    }
  }

  for (const pattern of CHAT_INFO_PATTERNS) {
    if (pattern.test(normalized)) {
      return {
        mode: 'CHAT_INFO',
        reason: 'Matched informational/conversational pattern',
      };
    }
  }

  return {
    mode: 'CHAT_INFO',
    reason: 'No entity-finding intent detected — informational chat',
  };
}
