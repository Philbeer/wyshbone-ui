# Wyshbone AI - Prospect Discovery & Enrichment

This application provides AI-powered prospect discovery using Google Places API (New v1) combined with GPT enrichment for comprehensive lead research.

## API Endpoints

### 1. Places Search (`POST /api/places/search`)
Search for verified businesses using Google Places API. Returns only OPERATIONAL venues with real Google Place IDs.

### 2. Prospect Enrichment (`POST /api/prospects/enrich`)
Enrich a list of places with additional data using GPT web search, including domain, contact email, social links, business category, summary, and lead score.

### 3. Combined Search & Enrich (`POST /api/prospects/search_and_enrich`)
End-to-end prospecting: searches Google Places first, then enriches results with GPT.

## API Examples

Set your app URL:
```bash
export APP=http://localhost:5000
```

### Places-only search
Find businesses using Google Places API:
```bash
curl -s -X POST "$APP/api/places/search" -H "Content-Type: application/json" -d '{
  "query":"pub",
  "locationText":"Arundel, UK",
  "radiusMeters":12000,
  "typesFilter":["bar","restaurant","point_of_interest","establishment"],
  "maxResults":20
}'
```

### Enrich an array of results
Enrich pre-existing place data with GPT:
```bash
curl -s -X POST "$APP/api/prospects/enrich" -H "Content-Type: application/json" -d '{
  "items":[
    {"placeId":"ChIJ...","name":"The Swan Hotel","address":"...","website":"https://..."},
    {"placeId":"ChIJ...","name":"The Kings Arms","address":"..."}
  ],
  "concurrency":3
}'
```

### End-to-end search and enrichment
Search Google Places and enrich results in one call:
```bash
curl -s -X POST "$APP/api/prospects/search_and_enrich" -H "Content-Type: application/json" -d '{
  "query":"pub",
  "locationText":"Arundel, UK",
  "radiusMeters":12000,
  "maxResults":10,
  "enrich":true,
  "concurrency":3
}'
```

## Key Features

- **Google Places First**: Always uses verified Google Places data as the foundation
- **Never Fabricates Place IDs**: All Place IDs come from Google's official API
- **GPT Enrichment**: Uses OpenAI Responses API with web_search for additional context
- **Structured Output**: Returns JSON schema validated responses
- **Concurrency Control**: Manages API rate limits with configurable batch processing

## Environment Variables

Required:
- `GOOGLE_MAPS_API_KEY` - Google Maps API key with Places API (New) enabled
- `OPENAI_API_KEY` - OpenAI API key for GPT enrichment

## Response Format

Places search returns:
```json
{
  "results": [
    {
      "placeId": "ChIJ...",
      "resourceName": "places/ChIJ...",
      "name": "Business Name",
      "address": "Full Address",
      "businessStatus": "OPERATIONAL",
      "phone": "+44 ...",
      "website": "https://...",
      "types": ["bar", "restaurant"],
      "rating": 4.4,
      "userRatingCount": 312,
      "location": { "lat": 50.85, "lng": -0.55 }
    }
  ],
  "generated_at": "2025-10-07T..."
}
```

Enriched results add:
```json
{
  "domain": "example.com",
  "contact_email": "info@example.com",
  "socials": {
    "website": "...",
    "linkedin": "...",
    "instagram": "...",
    "facebook": "..."
  },
  "category": "pub",
  "summary": "Traditional British pub...",
  "suggested_intro": "I noticed your establishment...",
  "lead_score": 72
}
```
