import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright Configuration for Wyshbone UI Smoke Tests
 * 
 * Run with: npm run test:smoke
 * 
 * Prerequisites:
 * - Backend running on http://localhost:5001
 * - Frontend running on http://localhost:5173 (or nearby port)
 */
export default defineConfig({
  testDir: './tests',
  
  // Maximum time one test can run (2 minutes for slow network)
  timeout: 120 * 1000,
  
  // Expect assertions timeout
  expect: {
    timeout: 30 * 1000,
  },
  
  // Run tests sequentially for smoke tests
  fullyParallel: false,
  
  // Fail the build on CI if you accidentally left test.only in the source code
  forbidOnly: !!process.env.CI,
  
  // Retry on CI only
  retries: process.env.CI ? 2 : 0,
  
  // Single worker for smoke tests
  workers: 1,
  
  // Reporter configuration
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
  ],
  
  // Shared settings for all the projects below
  use: {
    // Base URL for tests - will try multiple ports
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173',
    
    // Collect trace when test fails
    trace: 'on-first-retry',
    
    // Take screenshot on failure
    screenshot: 'only-on-failure',
    
    // Video recording on failure
    video: 'on-first-retry',
  },

  // Configure projects for major browsers (just Chromium for smoke tests)
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Don't start a web server - we expect dev server to be running
  // webServer: undefined,
});

