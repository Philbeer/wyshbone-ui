// Debug Bridge Server - Receives browser data and makes it available to Claude Code
const http = require('http');
const PORT = 9998; // Changed from 9999 to avoid conflict with Chrome extension

// Store recent browser events (last 100)
const browserEvents = [];
const MAX_EVENTS = 100;

function addEvent(event) {
  browserEvents.unshift(event);
  if (browserEvents.length > MAX_EVENTS) {
    browserEvents.pop();
  }
  console.log(`📊 [${event.type}] ${event.message}`);
}

const server = http.createServer((req, res) => {
  // Enable CORS for localhost
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // POST /browser-data - Receive data from browser
  if (req.method === 'POST' && req.url === '/browser-data') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const event = JSON.parse(body);
        addEvent(event);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (err) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
    return;
  }

  // GET /browser-data - Retrieve recent events
  if (req.method === 'GET' && req.url === '/browser-data') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      events: browserEvents,
      count: browserEvents.length,
      timestamp: new Date().toISOString()
    }));
    return;
  }

  // GET /browser-data/latest - Get most recent event
  if (req.method === 'GET' && req.url === '/browser-data/latest') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(browserEvents[0] || null));
    return;
  }

  // GET /browser-data/errors - Get only errors
  if (req.method === 'GET' && req.url === '/browser-data/errors') {
    const errors = browserEvents.filter(e => 
      e.type.includes('error') || e.type.includes('rejection')
    );
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ errors, count: errors.length }));
    return;
  }

  // Default response
  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`🌉 Debug Bridge Server running on http://localhost:${PORT}`);
  console.log(`   Browser sends to: POST /browser-data`);
  console.log(`   Claude Code reads from: GET /browser-data`);
  console.log(`   Recent events: ${browserEvents.length}/${MAX_EVENTS}`);
});