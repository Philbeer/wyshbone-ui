/**
 * Simple Debug Bridge Server
 *
 * A lightweight HTTP server that receives debug data from browser and code.
 * No dependencies - uses only built-in Node.js modules.
 *
 * Usage: node debug-bridge/simple-server.js
 * Server runs on: http://localhost:9999
 */

const http = require('http');

// Storage for debug messages (in memory)
const browserMessages = [];
const codeMessages = [];
const MAX_MESSAGES = 50;

// Helper to add message with deduplication
function addMessage(array, message) {
  // Add timestamp
  message.timestamp = Date.now();
  message.time = new Date().toISOString();

  // Add to array (keep max 50)
  array.unshift(message);
  if (array.length > MAX_MESSAGES) {
    array.pop();
  }
}

// Parse JSON body
function parseBody(req, callback) {
  let body = '';

  req.on('data', chunk => {
    body += chunk.toString();
  });

  req.on('end', () => {
    try {
      const data = body ? JSON.parse(body) : {};
      callback(null, data);
    } catch (error) {
      callback(error, null);
    }
  });
}

// Send JSON response
function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(data, null, 2));
}

// Create server
const server = http.createServer((req, res) => {
  const { method, url } = req;

  // Handle CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end();
    return;
  }

  // Route: POST /browser-data
  if (method === 'POST' && url === '/browser-data') {
    parseBody(req, (error, data) => {
      if (error) {
        return sendJSON(res, 400, { error: 'Invalid JSON' });
      }

      addMessage(browserMessages, data);

      // Log to console
      console.log(`[BROWSER] ${data.type || 'unknown'}: ${data.message || 'No message'}`);
      if (data.type === 'network-error' && data.status === 401) {
        console.log('  🔴 401 UNAUTHORIZED ERROR DETECTED');
        console.log('  URL:', data.url);
      }

      sendJSON(res, 200, {
        success: true,
        stored: browserMessages.length,
        message: 'Browser data received'
      });
    });
    return;
  }

  // Route: POST /code-data
  if (method === 'POST' && url === '/code-data') {
    parseBody(req, (error, data) => {
      if (error) {
        return sendJSON(res, 400, { error: 'Invalid JSON' });
      }

      addMessage(codeMessages, data);
      console.log(`[CODE] ${data.type || 'unknown'}: ${data.message || 'No message'}`);

      sendJSON(res, 200, {
        success: true,
        stored: codeMessages.length,
        message: 'Code data received'
      });
    });
    return;
  }

  // Route: GET /browser-data
  if (method === 'GET' && url === '/browser-data') {
    sendJSON(res, 200, {
      total: browserMessages.length,
      messages: browserMessages
    });
    return;
  }

  // Route: GET /code-data
  if (method === 'GET' && url === '/code-data') {
    sendJSON(res, 200, {
      total: codeMessages.length,
      messages: codeMessages
    });
    return;
  }

  // Route: GET /health
  if (method === 'GET' && url === '/health') {
    sendJSON(res, 200, {
      status: 'ok',
      uptime: process.uptime(),
      browserMessages: browserMessages.length,
      codeMessages: codeMessages.length,
      timestamp: new Date().toISOString()
    });
    return;
  }

  // Route: POST /clear
  if (method === 'POST' && url === '/clear') {
    const browserCount = browserMessages.length;
    const codeCount = codeMessages.length;

    browserMessages.length = 0;
    codeMessages.length = 0;

    console.log(`🧹 Cleared ${browserCount} browser messages and ${codeCount} code messages`);

    sendJSON(res, 200, {
      success: true,
      cleared: {
        browser: browserCount,
        code: codeCount
      }
    });
    return;
  }

  // Route: GET / (status page)
  if (method === 'GET' && url === '/') {
    res.writeHead(200, {
      'Content-Type': 'text/html',
      'Access-Control-Allow-Origin': '*'
    });

    const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Debug Bridge Server</title>
  <style>
    body { font-family: monospace; margin: 20px; background: #1e1e1e; color: #fff; }
    h1 { color: #4ec9b0; }
    .status { color: #4ec9b0; }
    .endpoint { background: #2d2d2d; padding: 10px; margin: 10px 0; border-left: 3px solid #4ec9b0; }
    .method { color: #dcdcaa; font-weight: bold; }
    pre { background: #2d2d2d; padding: 10px; overflow-x: auto; }
    a { color: #569cd6; }
    .stats { background: #2d2d2d; padding: 15px; margin: 20px 0; }
    button { background: #4ec9b0; border: none; color: #000; padding: 10px 20px; cursor: pointer; font-weight: bold; }
    button:hover { background: #6edfcf; }
  </style>
</head>
<body>
  <h1>🌉 Debug Bridge Server</h1>
  <p class="status">✅ Status: RUNNING</p>
  <p>Server: http://localhost:9999</p>

  <div class="stats">
    <h3>📊 Current Stats</h3>
    <p>Browser Messages: ${browserMessages.length}</p>
    <p>Code Messages: ${codeMessages.length}</p>
    <p>Uptime: ${Math.round(process.uptime())} seconds</p>
    <button onclick="clearMessages()">🧹 Clear All Messages</button>
  </div>

  <h2>📡 API Endpoints</h2>

  <div class="endpoint">
    <span class="method">POST</span> /browser-data
    <p>Receive debug data from browser</p>
  </div>

  <div class="endpoint">
    <span class="method">GET</span> /browser-data
    <p>Retrieve all browser messages</p>
    <a href="/browser-data" target="_blank">View Browser Data →</a>
  </div>

  <div class="endpoint">
    <span class="method">POST</span> /code-data
    <p>Receive debug data from code</p>
  </div>

  <div class="endpoint">
    <span class="method">GET</span> /code-data
    <p>Retrieve all code messages</p>
    <a href="/code-data" target="_blank">View Code Data →</a>
  </div>

  <div class="endpoint">
    <span class="method">GET</span> /health
    <p>Server health check</p>
    <a href="/health" target="_blank">View Health →</a>
  </div>

  <div class="endpoint">
    <span class="method">POST</span> /clear
    <p>Clear all stored messages</p>
  </div>

  <h2>🚀 Quick Start</h2>

  <h3>1. In your browser console:</h3>
  <pre>
// Test sending data
fetch('http://localhost:9999/browser-data', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    type: 'test',
    message: 'Hello from browser!'
  })
});
  </pre>

  <h3>2. View captured data:</h3>
  <pre>
node debug-bridge/check-browser-errors.js
  </pre>

  <h3>3. Add browser capture script to your HTML:</h3>
  <pre>
&lt;script src="/debug-bridge/browser-capture-script.js"&gt;&lt;/script&gt;
  </pre>

  <script>
    function clearMessages() {
      fetch('http://localhost:9999/clear', { method: 'POST' })
        .then(() => {
          alert('✅ All messages cleared!');
          location.reload();
        });
    }
  </script>
</body>
</html>
    `;

    res.end(html);
    return;
  }

  // 404 Not Found
  sendJSON(res, 404, { error: 'Not Found' });
});

// Start server
const PORT = 9999;
server.listen(PORT, () => {
  console.log('');
  console.log('='.repeat(70));
  console.log('🌉 DEBUG BRIDGE SERVER STARTED');
  console.log('='.repeat(70));
  console.log('');
  console.log('Server running on: http://localhost:9999');
  console.log('Status page:       http://localhost:9999/');
  console.log('Health check:      http://localhost:9999/health');
  console.log('');
  console.log('API Endpoints:');
  console.log('  POST /browser-data   - Receive browser debug data');
  console.log('  GET  /browser-data   - Retrieve browser messages');
  console.log('  POST /code-data      - Receive code debug data');
  console.log('  GET  /code-data      - Retrieve code messages');
  console.log('  POST /clear          - Clear all messages');
  console.log('');
  console.log('Press Ctrl+C to stop');
  console.log('='.repeat(70));
  console.log('');
});

// Handle shutdown gracefully
process.on('SIGINT', () => {
  console.log('');
  console.log('🛑 Shutting down debug bridge server...');
  console.log(`   Captured ${browserMessages.length} browser messages`);
  console.log(`   Captured ${codeMessages.length} code messages`);
  server.close(() => {
    console.log('✅ Server stopped');
    process.exit(0);
  });
});
