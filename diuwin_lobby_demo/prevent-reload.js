// DiuWin Guard: Completely prevents automatic page reloads/blinking from VS Code Live Server, Live Preview, and file-watcher triggers
(function() {
  if (typeof window === 'undefined') return;

  // 1. Intercept Live Server WebSocket so file-watcher 'reload' commands are ignored
  try {
    const OriginalWebSocket = window.WebSocket;
    if (OriginalWebSocket) {
      window.WebSocket = function(url, protocols) {
        if (typeof url === 'string' && (url.includes('/ws') || url.includes(':5500') || url.includes(':5501') || url.includes('live-server') || url.includes('livepreview'))) {
          // Return an inert mock socket that absorbs Live Server signals
          return {
            onmessage: null,
            onopen: null,
            onclose: null,
            onerror: null,
            binaryType: 'blob',
            bufferedAmount: 0,
            extensions: '',
            protocol: '',
            url: url,
            addEventListener: function() {},
            removeEventListener: function() {},
            dispatchEvent: function() { return false; },
            send: function() {},
            close: function() {},
            readyState: 1
          };
        }
        return new OriginalWebSocket(url, protocols);
      };
      window.WebSocket.prototype = OriginalWebSocket.prototype;
    }
  } catch (e) {}

  // 2. Safely guard window.location.reload if permitted by browser
  try {
    const originalReload = window.location.reload;
    Object.defineProperty(window.location, 'reload', {
      configurable: true,
      enumerable: true,
      value: function(force) {
        // Only allow reload if called directly with true by user
        if (force === true) {
          return originalReload.call(window.location);
        }
        console.warn('[DiuWin Guard] Blocked automatic page reload.');
      }
    });
  } catch (e) {}
})();
