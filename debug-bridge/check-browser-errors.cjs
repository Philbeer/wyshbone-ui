/**
 * Check Browser Errors Script
 *
 * Fetches and displays errors captured from the browser by the debug bridge server.
 * Uses only built-in Node.js modules (http) - no npm dependencies.
 *
 * Usage: node debug-bridge/check-browser-errors.js
 */

const http = require('http');

const DEBUG_SERVER_HOST = 'localhost';
const DEBUG_SERVER_PORT = 9999;

// ANSI color codes for terminal
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
  bold: '\x1b[1m'
};

function colorize(color, text) {
  return colors[color] + text + colors.reset;
}

// Make HTTP GET request
function httpGet(path, callback) {
  const options = {
    hostname: DEBUG_SERVER_HOST,
    port: DEBUG_SERVER_PORT,
    path: path,
    method: 'GET'
  };

  const req = http.request(options, (res) => {
    let data = '';

    res.on('data', (chunk) => {
      data += chunk;
    });

    res.on('end', () => {
      try {
        const parsed = JSON.parse(data);
        callback(null, parsed);
      } catch (error) {
        callback(error, null);
      }
    });
  });

  req.on('error', (error) => {
    callback(error, null);
  });

  req.setTimeout(5000, () => {
    req.destroy();
    callback(new Error('Request timeout'), null);
  });

  req.end();
}

// Format timestamp
function formatTime(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleTimeString();
}

// Group messages by type
function groupByType(messages) {
  const groups = {};

  messages.forEach(msg => {
    const type = msg.type || 'unknown';
    if (!groups[type]) {
      groups[type] = [];
    }
    groups[type].push(msg);
  });

  return groups;
}

// Display messages
function displayMessages(messages) {
  if (messages.length === 0) {
    console.log(colorize('gray', '  No messages captured yet'));
    console.log('');
    console.log(colorize('cyan', '  💡 Tips:'));
    console.log(colorize('gray', '     1. Make sure debug server is running'));
    console.log(colorize('gray', '     2. Add browser capture script to your HTML'));
    console.log(colorize('gray', '     3. Open your app in browser and trigger some errors'));
    console.log('');
    return;
  }

  const groups = groupByType(messages);
  const types = Object.keys(groups).sort();

  // Display summary
  console.log(colorize('bold', '📊 Summary:'));
  console.log('');
  types.forEach(type => {
    const count = groups[type].length;
    const icon = type.includes('401') ? '🔴' : type.includes('error') ? '❌' : type.includes('warn') ? '⚠️' : '📝';
    const color = type.includes('401') ? 'red' : type.includes('error') ? 'red' : type.includes('warn') ? 'yellow' : 'white';
    console.log(`  ${icon} ${colorize(color, type)}: ${count} message(s)`);
  });
  console.log('');

  // Show 401 errors prominently
  if (groups['auth-error-401'] || groups['network-error']) {
    const authErrors = groups['auth-error-401'] || [];
    const networkErrors = (groups['network-error'] || []).filter(msg => msg.status === 401);
    const all401s = [...authErrors, ...networkErrors];

    if (all401s.length > 0) {
      console.log('');
      console.log(colorize('red', colorize('bold', '🔴 401 UNAUTHORIZED ERRORS')));
      console.log(colorize('red', '='.repeat(70)));
      console.log('');

      all401s.forEach((msg, i) => {
        console.log(colorize('red', `[${i + 1}/${all401s.length}] ${formatTime(msg.timestamp)}`));
        console.log(colorize('white', `  URL: ${msg.url}`));
        console.log(colorize('gray', `  Method: ${msg.method || 'GET'}`));
        if (msg.headers) {
          console.log(colorize('gray', `  Headers: ${msg.headers}`));
        }
        if (msg.message) {
          console.log(colorize('yellow', `  Message: ${msg.message}`));
        }
        console.log('');
      });

      console.log(colorize('cyan', '💡 Auth Debug Tips:'));
      console.log(colorize('gray', '   1. Check if session ID exists in localStorage'));
      console.log(colorize('gray', '   2. Verify credentials: "include" in fetch calls'));
      console.log(colorize('gray', '   3. Check x-session-id header is being sent'));
      console.log(colorize('gray', '   4. Verify backend is accepting session headers'));
      console.log('');
    }
  }

  // Show all error types in detail
  console.log('');
  console.log(colorize('bold', '📋 Detailed Errors:'));
  console.log('='.repeat(70));
  console.log('');

  types.forEach(type => {
    const msgs = groups[type];

    // Skip if already shown in 401 section
    if (type === 'auth-error-401') return;

    const typeColor = type.includes('error') ? 'red' : type.includes('warn') ? 'yellow' : 'white';
    const icon = type.includes('error') ? '❌' : type.includes('warn') ? '⚠️' : '📝';

    console.log(colorize(typeColor, colorize('bold', `${icon} ${type.toUpperCase()} (${msgs.length})`)));
    console.log('-'.repeat(70));

    // Show up to 3 most recent
    const toShow = msgs.slice(0, 3);
    toShow.forEach((msg, i) => {
      console.log('');
      console.log(colorize('gray', `  ${formatTime(msg.timestamp)} - ${msg.url || 'Unknown URL'}`));
      console.log(colorize('white', `  ${msg.message || 'No message'}`));

      if (msg.status) {
        console.log(colorize('gray', `  Status: ${msg.status} ${msg.statusText || ''}`));
      }

      if (msg.stack && i === 0) {
        // Show stack for first error only
        const stackLines = msg.stack.split('\n').slice(0, 3);
        console.log(colorize('gray', '  Stack:'));
        stackLines.forEach(line => {
          console.log(colorize('gray', `    ${line.trim()}`));
        });
      }
    });

    if (msgs.length > 3) {
      console.log('');
      console.log(colorize('gray', `  ... and ${msgs.length - 3} more`));
    }

    console.log('');
  });
}

// Main function
function checkErrors() {
  console.log('');
  console.log(colorize('bold', '='.repeat(70)));
  console.log(colorize('bold', '🌉 DEBUG BRIDGE - BROWSER ERROR CHECKER'));
  console.log(colorize('bold', '='.repeat(70)));
  console.log('');

  // Check server health first
  console.log(colorize('cyan', '🔍 Checking debug server...'));

  httpGet('/health', (error, health) => {
    if (error) {
      console.log('');
      console.log(colorize('red', '❌ Could not connect to debug server'));
      console.log(colorize('gray', '   Error: ' + error.message));
      console.log('');
      console.log(colorize('yellow', '💡 Make sure debug server is running:'));
      console.log(colorize('gray', '   node debug-bridge/simple-server.js'));
      console.log('');
      process.exit(1);
    }

    console.log(colorize('green', '✅ Debug server is running'));
    console.log(colorize('gray', `   Uptime: ${Math.round(health.uptime)} seconds`));
    console.log('');

    // Fetch browser messages
    console.log(colorize('cyan', '📡 Fetching browser messages...'));
    console.log('');

    httpGet('/browser-data', (error, data) => {
      if (error) {
        console.log(colorize('red', '❌ Error fetching messages: ' + error.message));
        console.log('');
        process.exit(1);
      }

      console.log(colorize('green', `✅ Received ${data.total} message(s)`));
      console.log('');

      if (data.total === 0) {
        displayMessages([]);
      } else {
        displayMessages(data.messages);
      }

      console.log('');
      console.log(colorize('bold', '='.repeat(70)));
      console.log(colorize('gray', '💡 Run this script again to see new errors'));
      console.log(colorize('gray', '   Or visit: http://localhost:9999/browser-data'));
      console.log(colorize('bold', '='.repeat(70)));
      console.log('');
    });
  });
}

// Run
checkErrors();
