import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type Region = {
  id: string;
  name: string;
  parent_id?: string;
  code: string;
};

type RegionCache = {
  uk_counties: Region[];
  london_boroughs: Region[];
  us_states: Region[];
  us_counties_texas: Region[];
};

let cache: RegionCache | null = null;

function loadRegionsData(): RegionCache {
  if (cache) return cache;

  const dataDir = path.join(__dirname, 'data');
  
  cache = {
    uk_counties: JSON.parse(fs.readFileSync(path.join(dataDir, 'uk_counties.json'), 'utf-8')),
    london_boroughs: JSON.parse(fs.readFileSync(path.join(dataDir, 'london_boroughs.json'), 'utf-8')),
    us_states: JSON.parse(fs.readFileSync(path.join(dataDir, 'us_states.json'), 'utf-8')),
    us_counties_texas: JSON.parse(fs.readFileSync(path.join(dataDir, 'us_counties_texas.json'), 'utf-8'))
  };

  return cache;
}

export function getRegions(params: {
  country: 'UK' | 'US';
  granularity: 'county' | 'borough' | 'state';
  region_filter?: string;
}): Region[] {
  const data = loadRegionsData();
  let regions: Region[] = [];

  if (params.country === 'UK') {
    if (params.granularity === 'county') {
      regions = data.uk_counties;
    } else if (params.granularity === 'borough') {
      regions = data.london_boroughs;
    }
  } else if (params.country === 'US') {
    if (params.granularity === 'state') {
      regions = data.us_states;
    } else if (params.granularity === 'county') {
      // For now, only Texas counties available
      regions = data.us_counties_texas;
    }
  }

  // Apply region_filter if provided
  if (params.region_filter) {
    const filter = params.region_filter.toLowerCase();
    regions = regions.filter(r => 
      r.name.toLowerCase().includes(filter) || 
      (r.parent_id && r.parent_id.toLowerCase().includes(filter))
    );
  }

  return regions;
}
