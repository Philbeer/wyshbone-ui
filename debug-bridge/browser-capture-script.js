/**
 * Browser Debug Capture Script
 *
 * Captures console errors, network errors, and unhandled exceptions from the browser.
 * Sends all data to debug bridge server at http://localhost:9999
 *
 * Usage: Add to your HTML:
 * <script src="/debug-bridge/browser-capture-script.js"></script>
 *
 * Or in browser console:
 * // Copy and paste the contents of this file
 */

(function() {
  'use strict';

  const DEBUG_SERVER = 'http://localhost:9999';
  const MAX_MESSAGE_LENGTH = 1000;

  // Helper to send data to debug server
  function sendToDebugServer(data) {
    try {
      // Use sendBeacon if available (works even when page is closing)
      if (navigator.sendBeacon) {
        const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
        navigator.sendBeacon(`${DEBUG_SERVER}/browser-data`, blob);
      } else {
        // Fallback to fetch
        fetch(`${DEBUG_SERVER}/browser-data`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
          mode: 'cors'
        }).catch(err => {
          // Don't log to console to avoid infinite loop
          console.warn('Debug bridge: Could not send to server', err);
        });
      }
    } catch (error) {
      // Silently fail if debug server is not available
    }
  }

  // Helper to truncate long messages
  function truncate(str, maxLength) {
    if (!str) return '';
    const s = String(str);
    return s.length > maxLength ? s.substring(0, maxLength) + '...' : s;
  }

  // Helper to get stack trace
  function getStackTrace() {
    try {
      throw new Error();
    } catch (e) {
      return e.stack || '';
    }
  }

  // Capture console.error
  const originalError = console.error;
  console.error = function(...args) {
    // Call original
    originalError.apply(console, args);

    // Send to debug server
    sendToDebugServer({
      type: 'console-error',
      message: truncate(args.map(a => String(a)).join(' '), MAX_MESSAGE_LENGTH),
      args: args.map(a => String(a)),
      url: window.location.href,
      stack: getStackTrace()
    });
  };

  // Capture console.warn
  const originalWarn = console.warn;
  console.warn = function(...args) {
    // Call original
    originalWarn.apply(console, args);

    // Send to debug server
    sendToDebugServer({
      type: 'console-warn',
      message: truncate(args.map(a => String(a)).join(' '), MAX_MESSAGE_LENGTH),
      args: args.map(a => String(a)),
      url: window.location.href,
      stack: getStackTrace()
    });
  };

  // Capture unhandled errors
  window.addEventListener('error', function(event) {
    sendToDebugServer({
      type: 'unhandled-error',
      message: event.message || 'Unknown error',
      filename: event.filename || '',
      line: event.lineno || 0,
      column: event.colno || 0,
      error: event.error ? String(event.error) : '',
      stack: event.error ? event.error.stack : '',
      url: window.location.href
    });
  });

  // Capture unhandled promise rejections
  window.addEventListener('unhandledrejection', function(event) {
    sendToDebugServer({
      type: 'unhandled-rejection',
      message: event.reason ? String(event.reason) : 'Promise rejected',
      reason: event.reason ? String(event.reason) : '',
      url: window.location.href,
      stack: event.reason && event.reason.stack ? event.reason.stack : ''
    });
  });

  // Intercept fetch to capture network errors
  const originalFetch = window.fetch;
  window.fetch = function(...args) {
    const url = args[0];
    const options = args[1] || {};

    return originalFetch.apply(this, args)
      .then(response => {
        // Capture failed responses (4xx, 5xx)
        if (!response.ok) {
          sendToDebugServer({
            type: 'network-error',
            message: `HTTP ${response.status} ${response.statusText}`,
            url: url,
            status: response.status,
            statusText: response.statusText,
            method: options.method || 'GET',
            headers: options.headers ? JSON.stringify(options.headers) : '',
            pageUrl: window.location.href
          });

          // Special handling for 401 errors
          if (response.status === 401) {
            sendToDebugServer({
              type: 'auth-error-401',
              message: '🔴 401 UNAUTHORIZED',
              url: url,
              status: 401,
              method: options.method || 'GET',
              headers: options.headers ? JSON.stringify(options.headers) : '',
              body: options.body ? truncate(String(options.body), 500) : '',
              pageUrl: window.location.href,
              timestamp: new Date().toISOString()
            });
          }
        }

        return response;
      })
      .catch(error => {
        // Capture network failures (CORS, connection failed, etc.)
        sendToDebugServer({
          type: 'network-failure',
          message: error.message || 'Network request failed',
          url: url,
          error: String(error),
          method: options.method || 'GET',
          pageUrl: window.location.href
        });

        throw error; // Re-throw to not break the app
      });
  };

  // Intercept XMLHttpRequest (for legacy code)
  const originalXHROpen = XMLHttpRequest.prototype.open;
  const originalXHRSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    this._debugMethod = method;
    this._debugUrl = url;
    return originalXHROpen.apply(this, [method, url, ...rest]);
  };

  XMLHttpRequest.prototype.send = function(...args) {
    this.addEventListener('load', function() {
      if (this.status >= 400) {
        sendToDebugServer({
          type: 'xhr-error',
          message: `XHR ${this.status} ${this.statusText}`,
          url: this._debugUrl,
          status: this.status,
          statusText: this.statusText,
          method: this._debugMethod || 'GET',
          pageUrl: window.location.href
        });

        // Special handling for 401 errors
        if (this.status === 401) {
          sendToDebugServer({
            type: 'auth-error-401',
            message: '🔴 401 UNAUTHORIZED (XHR)',
            url: this._debugUrl,
            status: 401,
            method: this._debugMethod || 'GET',
            pageUrl: window.location.href,
            timestamp: new Date().toISOString()
          });
        }
      }
    });

    this.addEventListener('error', function() {
      sendToDebugServer({
        type: 'xhr-failure',
        message: 'XHR request failed',
        url: this._debugUrl,
        method: this._debugMethod || 'GET',
        pageUrl: window.location.href
      });
    });

    return originalXHRSend.apply(this, args);
  };

  // Add helper function to window for manual debugging
  window.sendDebugInfo = function(type, message, data) {
    sendToDebugServer({
      type: type || 'manual',
      message: message || 'Manual debug info',
      data: data || {},
      url: window.location.href,
      timestamp: new Date().toISOString()
    });
    console.log('✅ Debug info sent to bridge server');
  };

  // Send initialization message
  sendToDebugServer({
    type: 'init',
    message: 'Debug capture script initialized',
    url: window.location.href,
    userAgent: navigator.userAgent,
    timestamp: new Date().toISOString()
  });

  console.log('🌉 Debug Bridge: Capture script loaded');
  console.log('   Server: ' + DEBUG_SERVER);
  console.log('   Capturing: console.error, console.warn, network errors, unhandled errors');
  console.log('   Manual logging: window.sendDebugInfo(type, message, data)');

})();
