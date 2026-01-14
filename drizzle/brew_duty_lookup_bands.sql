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

-- ============================================================
-- UK HMRC SMALL PRODUCER RELIEF SEED DATA
-- Based on UK Alcohol Duty rates effective from August 2023
-- 
-- Categories:
--   - beer_smallpack_lt_3_5: Non-draught beer <3.5% ABV
--   - beer_smallpack_3_5_to_8_5: Non-draught beer ≥3.5% to <8.5% ABV
--   - cider_smallpack_lt_3_5: Non-draught cider <3.5% ABV  
--   - cider_smallpack_3_5_to_8_5: Non-draught cider ≥3.5% to <8.5% ABV
--   - beer_draught_lt_3_5: Draught beer <3.5% ABV
--   - beer_draught_3_5_to_8_5: Draught beer ≥3.5% to <8.5% ABV
--   - cider_draught_lt_3_5: Draught cider <3.5% ABV
--   - cider_draught_3_5_to_8_5: Draught cider ≥3.5% to <8.5% ABV
--
-- Relief bands (annual production in hectolitres):
--   Band 1: 0 - 100 hl (maximum relief)
--   Band 2: 100 - 500 hl (tapered relief)
--   Band 3: 500 - 2100 hl (reduced relief)
--   Band 4: 2100 - 4500 hl (minimal relief)
--   Band 5: 4500+ hl (no relief)
-- ============================================================

-- Clear existing UK regime data to avoid duplicates on re-run
DELETE FROM brew_duty_lookup_bands WHERE regime = 'UK';

-- ============================================================
-- BEER SMALLPACK (Non-draught) < 3.5% ABV
-- Base rate: £9.27 per hectolitre
-- ============================================================
INSERT INTO brew_duty_lookup_bands (regime, duty_category_key, threshold_hl, m, c, base_rate_per_hl, effective_from) VALUES
('UK', 'beer_smallpack_lt_3_5', 0, 1.91, 0, 9.27, '2023-08-01'),
('UK', 'beer_smallpack_lt_3_5', 100, 0.95, 191, 9.27, '2023-08-01'),
('UK', 'beer_smallpack_lt_3_5', 500, 0.48, 571, 9.27, '2023-08-01'),
('UK', 'beer_smallpack_lt_3_5', 2100, 0.24, 1339, 9.27, '2023-08-01'),
('UK', 'beer_smallpack_lt_3_5', 4500, 0, 1915, 9.27, '2023-08-01');

-- ============================================================
-- BEER SMALLPACK (Non-draught) ≥3.5% to <8.5% ABV
-- Base rate: £21.01 per hectolitre
-- ============================================================
INSERT INTO brew_duty_lookup_bands (regime, duty_category_key, threshold_hl, m, c, base_rate_per_hl, effective_from) VALUES
('UK', 'beer_smallpack_3_5_to_8_5', 0, 4.33, 0, 21.01, '2023-08-01'),
('UK', 'beer_smallpack_3_5_to_8_5', 100, 2.16, 433, 21.01, '2023-08-01'),
('UK', 'beer_smallpack_3_5_to_8_5', 500, 1.08, 1297, 21.01, '2023-08-01'),
('UK', 'beer_smallpack_3_5_to_8_5', 2100, 0.54, 3025, 21.01, '2023-08-01'),
('UK', 'beer_smallpack_3_5_to_8_5', 4500, 0, 4321, 21.01, '2023-08-01');

-- ============================================================
-- CIDER SMALLPACK (Non-draught) < 3.5% ABV
-- Base rate: £9.27 per hectolitre (same as reduced rate beer)
-- ============================================================
INSERT INTO brew_duty_lookup_bands (regime, duty_category_key, threshold_hl, m, c, base_rate_per_hl, effective_from) VALUES
('UK', 'cider_smallpack_lt_3_5', 0, 1.91, 0, 9.27, '2023-08-01'),
('UK', 'cider_smallpack_lt_3_5', 100, 0.95, 191, 9.27, '2023-08-01'),
('UK', 'cider_smallpack_lt_3_5', 500, 0.48, 571, 9.27, '2023-08-01'),
('UK', 'cider_smallpack_lt_3_5', 2100, 0.24, 1339, 9.27, '2023-08-01'),
('UK', 'cider_smallpack_lt_3_5', 4500, 0, 1915, 9.27, '2023-08-01');

-- ============================================================
-- CIDER SMALLPACK (Non-draught) ≥3.5% to <8.5% ABV
-- Base rate: £9.67 per hectolitre
-- ============================================================
INSERT INTO brew_duty_lookup_bands (regime, duty_category_key, threshold_hl, m, c, base_rate_per_hl, effective_from) VALUES
('UK', 'cider_smallpack_3_5_to_8_5', 0, 1.99, 0, 9.67, '2023-08-01'),
('UK', 'cider_smallpack_3_5_to_8_5', 100, 1.00, 199, 9.67, '2023-08-01'),
('UK', 'cider_smallpack_3_5_to_8_5', 500, 0.50, 599, 9.67, '2023-08-01'),
('UK', 'cider_smallpack_3_5_to_8_5', 2100, 0.25, 1399, 9.67, '2023-08-01'),
('UK', 'cider_smallpack_3_5_to_8_5', 4500, 0, 1999, 9.67, '2023-08-01');

-- ============================================================
-- BEER DRAUGHT < 3.5% ABV
-- Base rate: £8.42 per hectolitre (9.2% draught relief applied)
-- ============================================================
INSERT INTO brew_duty_lookup_bands (regime, duty_category_key, threshold_hl, m, c, base_rate_per_hl, effective_from) VALUES
('UK', 'beer_draught_lt_3_5', 0, 1.73, 0, 8.42, '2023-08-01'),
('UK', 'beer_draught_lt_3_5', 100, 0.87, 173, 8.42, '2023-08-01'),
('UK', 'beer_draught_lt_3_5', 500, 0.43, 521, 8.42, '2023-08-01'),
('UK', 'beer_draught_lt_3_5', 2100, 0.22, 1209, 8.42, '2023-08-01'),
('UK', 'beer_draught_lt_3_5', 4500, 0, 1737, 8.42, '2023-08-01');

-- ============================================================
-- BEER DRAUGHT ≥3.5% to <8.5% ABV
-- Base rate: £19.08 per hectolitre (9.2% draught relief applied)
-- ============================================================
INSERT INTO brew_duty_lookup_bands (regime, duty_category_key, threshold_hl, m, c, base_rate_per_hl, effective_from) VALUES
('UK', 'beer_draught_3_5_to_8_5', 0, 3.93, 0, 19.08, '2023-08-01'),
('UK', 'beer_draught_3_5_to_8_5', 100, 1.96, 393, 19.08, '2023-08-01'),
('UK', 'beer_draught_3_5_to_8_5', 500, 0.98, 1177, 19.08, '2023-08-01'),
('UK', 'beer_draught_3_5_to_8_5', 2100, 0.49, 2745, 19.08, '2023-08-01'),
('UK', 'beer_draught_3_5_to_8_5', 4500, 0, 3921, 19.08, '2023-08-01');

-- ============================================================
-- CIDER DRAUGHT < 3.5% ABV
-- Base rate: £8.42 per hectolitre (9.2% draught relief applied)
-- ============================================================
INSERT INTO brew_duty_lookup_bands (regime, duty_category_key, threshold_hl, m, c, base_rate_per_hl, effective_from) VALUES
('UK', 'cider_draught_lt_3_5', 0, 1.73, 0, 8.42, '2023-08-01'),
('UK', 'cider_draught_lt_3_5', 100, 0.87, 173, 8.42, '2023-08-01'),
('UK', 'cider_draught_lt_3_5', 500, 0.43, 521, 8.42, '2023-08-01'),
('UK', 'cider_draught_lt_3_5', 2100, 0.22, 1209, 8.42, '2023-08-01'),
('UK', 'cider_draught_lt_3_5', 4500, 0, 1737, 8.42, '2023-08-01');

-- ============================================================
-- CIDER DRAUGHT ≥3.5% to <8.5% ABV
-- Base rate: £8.78 per hectolitre (9.2% draught relief applied)
-- ============================================================
INSERT INTO brew_duty_lookup_bands (regime, duty_category_key, threshold_hl, m, c, base_rate_per_hl, effective_from) VALUES
('UK', 'cider_draught_3_5_to_8_5', 0, 1.81, 0, 8.78, '2023-08-01'),
('UK', 'cider_draught_3_5_to_8_5', 100, 0.90, 181, 8.78, '2023-08-01'),
('UK', 'cider_draught_3_5_to_8_5', 500, 0.45, 541, 8.78, '2023-08-01'),
('UK', 'cider_draught_3_5_to_8_5', 2100, 0.23, 1261, 8.78, '2023-08-01'),
('UK', 'cider_draught_3_5_to_8_5', 4500, 0, 1813, 8.78, '2023-08-01');

-- ============================================================
-- VERIFICATION QUERY (run after seeding to verify data)
-- ============================================================
-- SELECT duty_category_key, COUNT(*) as bands, MIN(threshold_hl) as min_threshold, MAX(threshold_hl) as max_threshold
-- FROM brew_duty_lookup_bands 
-- WHERE regime = 'UK' 
-- GROUP BY duty_category_key 
-- ORDER BY duty_category_key;