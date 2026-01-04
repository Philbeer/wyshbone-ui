// Debug Bridge - Browser Capture Script
// Automatically captures errors and sends to debug server
(function() {
  const DEBUG_SERVER = 'http://localhost:9999/browser-data';
  const isDevelopment = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

  // Only run in development
  if (!isDevelopment) {
    console.log('Debug bridge disabled in production');
    return;
  }

  function sendToDebugServer(type, message, data = {}) {
    fetch(DEBUG_SERVER, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type,
        message,
        url: window.location.href,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        ...data
      })
    }).catch(err => {
      // Silent fail if bridge is offline
      console.debug('Debug bridge offline:', err.message);
    });
  }

  // Send initialization message
  sendToDebugServer('init', 'Debug capture script initialized', {
    page: window.location.href,
    timestamp: new Date().toISOString()
  });

  // Capture console.error
  const originalError = console.error;
  console.error = function(...args) {
    originalError.apply(console, args);
    sendToDebugServer('console-error', args.join(' '), {
      stack: new Error().stack,
      arguments: args
    });
  };

  // Capture console.warn
  const originalWarn = console.warn;
  console.warn = function(...args) {
    originalWarn.apply(console, args);
    sendToDebugServer('console-warn', args.join(' '), {
      arguments: args
    });
  };

  // Capture network errors with fetch
  const originalFetch = window.fetch;
  window.fetch = async function(...args) {
    const [url, options] = args;
    const startTime = Date.now();

    try {
      const response = await originalFetch(...args);
      const duration = Date.now() - startTime;

      // Capture failed responses
      if (!response.ok) {
        sendToDebugServer('network-error', `${response.status} ${response.statusText}`, {
          status: response.status,
          statusText: response.statusText,
          url: typeof url === 'string' ? url : url.toString(),
          method: options?.method || 'GET',
          duration: duration,
          headers: options?.headers
        });
      }

      return response;
    } catch (error) {
      const duration = Date.now() - startTime;
      sendToDebugServer('network-error', error.message, {
        url: typeof url === 'string' ? url : url.toString(),
        method: options?.method || 'GET',
        duration: duration,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  };

  // Capture unhandled errors
  window.addEventListener('error', (event) => {
    sendToDebugServer('window-error', event.message, {
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      error: event.error?.message,
      stack: event.error?.stack
    });
  });

  // Capture unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    sendToDebugServer('unhandled-rejection', event.reason?.message || String(event.reason), {
      reason: String(event.reason),
      stack: event.reason?.stack
    });
  });

  // Helper function for manual debugging
  window.sendDebugInfo = function(message, data) {
    console.log('📤 Sending to debug bridge:', message);
    sendToDebugServer('manual', message, data || {});
  };

  console.log('🌉 Debug Bridge Active');
  console.log('   Server: ' + DEBUG_SERVER);
  console.log('   Use: window.sendDebugInfo("message", {data})');
})();
