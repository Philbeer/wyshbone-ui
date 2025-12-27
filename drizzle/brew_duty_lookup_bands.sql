-- ============================================================
-- Brewery Duty Lookup Bands Table
-- Stores UK HMRC duty rate bands for piecewise linear relief calculation
-- 
-- Terminology:
--   annual_hl = Annual hectolitres of PRODUCT (beer/cider volume)
--   NOT pure alcohol - this is total product volume
--
-- Relief calculation formula:
--   relief_total = c + m * (annual_hl - threshold_hl)
--   rate_per_hl = base_rate_per_hl - (relief_total / annual_hl)
--
-- Query pattern: Find the band where threshold_hl <= annual_hl,
-- ordered by threshold_hl DESC, LIMIT 1
-- ============================================================

CREATE TABLE IF NOT EXISTS brew_duty_lookup_bands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Regime identifier (for future multi-country support)
  regime TEXT NOT NULL DEFAULT 'UK',
  
  -- Category key encodes product type, draught status, and ABV band
  -- Examples: 'beer_draught_lt_3_5', 'beer_non_draught_gte_8_5', 'cider_draught_lt_8_5'
  duty_category_key TEXT NOT NULL,
  
  -- Threshold in hectolitres of product (annual production volume)
  -- For annual_hl values >= this threshold, use this band's parameters
  threshold_hl NUMERIC NOT NULL DEFAULT 0,
  
  -- Piecewise linear relief parameters
  -- relief_total = c + m * (annual_hl - threshold_hl)
  m NUMERIC NOT NULL,  -- slope for relief calculation
  c NUMERIC NOT NULL,  -- constant for relief calculation
  
  -- Base rate before relief is applied (pence per hectolitre)
  base_rate_per_hl NUMERIC NOT NULL,
  
  -- Effective date range for versioning duty changes
  effective_from DATE NOT NULL,
  effective_to DATE,  -- NULL means currently active
  
  -- Audit timestamp
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Primary lookup index: find active band for category where threshold <= annual_hl
-- Supports: WHERE duty_category_key = ? AND threshold_hl <= ? ORDER BY threshold_hl DESC LIMIT 1
CREATE INDEX IF NOT EXISTS brew_duty_lookup_bands_lookup_idx 
  ON brew_duty_lookup_bands (duty_category_key, regime, threshold_hl DESC);

-- Index for date-range filtering (active bands)
CREATE INDEX IF NOT EXISTS brew_duty_lookup_bands_effective_idx 
  ON brew_duty_lookup_bands (effective_from, effective_to);

-- Composite index for full query pattern
CREATE INDEX IF NOT EXISTS brew_duty_lookup_bands_full_lookup_idx 
  ON brew_duty_lookup_bands (duty_category_key, regime, effective_from, effective_to, threshold_hl DESC);

-- ============================================================
-- QUERY EXAMPLE (for documentation, not executed):
-- 
-- To find the correct band for annual_hl = 5000 hectolitres:
--
-- SELECT 
--   id,
--   threshold_hl,
--   m,
--   c,
--   base_rate_per_hl
-- FROM brew_duty_lookup_bands
-- WHERE duty_category_key = 'beer_draught_lt_3_5'
--   AND regime = 'UK'
--   AND effective_from <= CURRENT_DATE
--   AND (effective_to IS NULL OR effective_to >= CURRENT_DATE)
--   AND threshold_hl <= 5000
-- ORDER BY threshold_hl DESC
-- LIMIT 1;
--
-- Then in application code:
--   relief_total = c + m * (annual_hl - threshold_hl)
--   rate_per_hl = base_rate_per_hl - (relief_total / annual_hl)
--   duty_amount = rate_per_hl * volume_hl
-- ============================================================
