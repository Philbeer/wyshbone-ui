import { test, expect, type APIRequestContext } from '@playwright/test';

/**
 * Demo Mode Smoke Tests
 * =====================
 * 
 * These tests verify the core demo mode API endpoints work:
 * 1. Goal save/retrieve
 * 2. Plan creation
 * 3. Duty rate calculator
 * 4. Deep research listing
 * 5. Conversations
 * 
 * Prerequisites:
 * - Run `npm run dev` first (backend on port 5001)
 * 
 * Run with: npm run test:smoke
 */

const API_BASE = 'http://localhost:5001';

test.describe('Demo Mode API Smoke Tests', () => {
  
  test('1. Goal: save and retrieve', async ({ request }) => {
    // Save a goal
    const saveResponse = await request.put(`${API_BASE}/api/goal`, {
      data: { goal: 'find breweries in london' },
      headers: { 'Content-Type': 'application/json' },
    });
    
    if (!saveResponse.ok()) {
      const body = await saveResponse.text();
      throw new Error(`Goal save failed: ${saveResponse.status()} - ${body}`);
    }
    
    console.log(`✅ PUT /api/goal: ${saveResponse.status()}`);
    
    // Retrieve the goal
    const getResponse = await request.get(`${API_BASE}/api/goal`);
    expect(getResponse.status()).toBeLessThan(500);
    console.log(`✅ GET /api/goal: ${getResponse.status()}`);
  });

  test('2. Plan: create and retrieve', async ({ request }) => {
    // Create a plan
    const createResponse = await request.post(`${API_BASE}/api/plan/start`, {
      data: { goal: 'find breweries in london' },
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000,
    });
    
    if (!createResponse.ok()) {
      const body = await createResponse.text();
      throw new Error(`Plan creation failed: ${createResponse.status()} - ${body}`);
    }
    
    const createData = await createResponse.json();
    expect(createData.success).toBe(true);
    expect(createData.plan).toBeDefined();
    expect(createData.plan.id).toBeDefined();
    
    console.log(`✅ POST /api/plan/start: ${createResponse.status()} - Plan ID: ${createData.plan.id}`);
    
    // Retrieve the plan
    const getResponse = await request.get(`${API_BASE}/api/plan`, { timeout: 30000 });
    expect(getResponse.status()).toBeLessThan(500);
    console.log(`✅ GET /api/plan: ${getResponse.status()}`);
  });

  test('3. Duty Calculator: get duty bands', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/brewcrm/duty-lookup-bands?regime=UK`);
    
    expect(response.status()).toBe(200);
    
    const data = await response.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
    
    // Verify band structure
    const firstBand = data[0];
    expect(firstBand).toHaveProperty('dutyCategoryKey');
    expect(firstBand).toHaveProperty('baseRatePerHl');
    
    console.log(`✅ GET /api/brewcrm/duty-lookup-bands: ${response.status()} - ${data.length} bands`);
  });

  test('4. Deep Research: list runs (should not 500)', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/deep-research?userId=demo-user`);
    
    // Should not return 500 - even if empty, should return 200
    expect(response.status()).toBeLessThan(500);
    
    const data = await response.json();
    expect(data).toHaveProperty('runs');
    expect(Array.isArray(data.runs)).toBe(true);
    
    console.log(`✅ GET /api/deep-research: ${response.status()} - ${data.runs.length} runs`);
  });

  test('5. Conversations: list for demo user', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/conversations/demo-user`);
    
    expect(response.status()).toBeLessThan(500);
    
    const data = await response.json();
    expect(Array.isArray(data)).toBe(true);
    
    console.log(`✅ GET /api/conversations/demo-user: ${response.status()} - ${data.length} conversations`);
  });

  test('6. Error format: should include hints, not just CORS', async ({ request }) => {
    // Make a request that should fail with a structured error
    // We'll test the plan start endpoint which goes through full auth + DB
    
    const response = await request.post(`${API_BASE}/api/plan/start`, {
      data: { goal: 'test error format' },
      headers: { 'Content-Type': 'application/json' },
    });
    
    // If it fails, the error should be structured
    if (!response.ok()) {
      const body = await response.json().catch(() => ({}));
      
      // Error should have code, message, or error - NOT just "CORS"
      const hasStructuredError = body.code || body.message || body.error;
      expect(hasStructuredError).toBeTruthy();
      
      const errorText = JSON.stringify(body);
      expect(errorText.toLowerCase()).not.toContain('not allowed by cors');
      
      console.log(`✅ Error response is structured:`, body);
    } else {
      console.log(`✅ Request succeeded - plan created successfully`);
    }
  });
});

