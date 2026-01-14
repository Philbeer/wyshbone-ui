import fs from 'fs';
import { parse } from 'csv-parse/sync';
import { neon } from '@neondatabase/serverless';

const dbUrl = process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;
const sql = neon(dbUrl!);

async function loadLocationHints() {
  console.log('🚀 Starting location hints import...');
  
  const csvPath = './attached_assets/All-Countries-and-Cities-modified_2025-10-13_13-33-09_1760453166143.csv';
  const fileContent = fs.readFileSync(csvPath, 'utf-8');
  
  const records = parse(fileContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });
  
  console.log(`📊 Parsed ${records.length} records from CSV`);
  
  // Check if table already has data
  const countResult = await sql`SELECT COUNT(*) as count FROM location_hints`;
  const existingCount = parseInt(countResult[0].count);
  
  if (existingCount > 0) {
    console.log(`⚠️  Table already has ${existingCount} records. Clearing...`);
    await sql`TRUNCATE TABLE location_hints`;
  }
  
  // Insert in batches using efficient batch inserts
  const batchSize = 1000;
  let inserted = 0;
  
  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    
    // Build values array for batch insert
    const values = batch.map((record: any) => [
      record.Country || '',
      record.Geonameid || null,
      record['Subcountry '] || record['Subcountry'] || null,
      record['Town/City'] || null,
    ]);
    
    // Use neon's batch insert capability with array spreading
    const queries = values.map(v => 
      sql`INSERT INTO location_hints (country, geonameid, subcountry, town_city) VALUES (${v[0]}, ${v[1]}, ${v[2]}, ${v[3]})`
    );
    
    // Execute all queries in parallel for this batch
    await Promise.all(queries);
    
    inserted += batch.length;
    console.log(`✅ Inserted ${inserted}/${records.length} records (${Math.round(inserted/records.length*100)}%)...`);
  }
  
  console.log('🎉 Location hints import complete!');
  
  // Show some stats
  const stats = await sql`
    SELECT 
      country,
      COUNT(*) as city_count
    FROM location_hints
    GROUP BY country
    ORDER BY city_count DESC
    LIMIT 10
  `;
  
  console.log('\n📈 Top 10 countries by city count:');
  stats.forEach((row: any) => {
    console.log(`  ${row.country}: ${row.city_count} cities`);
  });
}

loadLocationHints().catch(console.error);
