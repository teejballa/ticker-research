/**
 * browser-monitor.js
 *
 * Browser-side monitoring script injected into every page via Playwright MCP
 * --init-script flag. Captures console messages, fetch requests/responses,
 * and unhandled errors into window.__monitor.
 *
 * To read captured data at any time, call browser_evaluate with:
 *   JSON.stringify(window.__monitor, null, 2)
 *
 * Or get just errors:
 *   JSON.stringify(window.__monitor.errors)
 *
 * Or just API calls:
 *   JSON.stringify(window.__monitor.network.filter(n => n.url.includes('/api/')))
 */
(function () {
  if (window.__monitor) return; // already injected

  window.__monitor = {
    startedAt: Date.now(),
    console: [],
    errors: [],
    network: [],
  };

  // ─── Console capture ───────────────────────────────────────────────────────
  ['log', 'warn', 'error', 'info', 'debug', 'group', 'groupEnd'].forEach(function (level) {
    var orig = console[level];
    console[level] = function () {
      var args = Array.prototype.slice.call(arguments);
      var msg = args
        .map(function (a) {
          try {
            return typeof a === 'object' && a !== null ? JSON.stringify(a) : String(a);
          } catch (_) {
            return String(a);
          }
        })
        .join(' ');

      window.__monitor.console.push({
        t: Date.now() - window.__monitor.startedAt,
        level: level,
        msg: msg,
      });

      orig.apply(console, args);
    };
  });

  // ─── Fetch intercept ───────────────────────────────────────────────────────
  var _origFetch = window.fetch;
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : input && input.url ? input.url : String(input);
    var method = (init && init.method ? init.method : 'GET').toUpperCase();
    var requestBody = null;
    if (init && init.body) {
      try {
        requestBody =
          typeof init.body === 'string' ? init.body.slice(0, 500) : '[non-string body]';
      } catch (_) {}
    }

    var entry = {
      t: Date.now() - window.__monitor.startedAt,
      method: method,
      url: url,
      requestBody: requestBody,
      status: null,
      responseBody: null,
      error: null,
      durationMs: null,
    };
    window.__monitor.network.push(entry);
    var t0 = Date.now();

    return _origFetch.apply(this, arguments).then(
      function (res) {
        entry.status = res.status;
        entry.durationMs = Date.now() - t0;

        // Capture response body for API calls and errors
        var shouldCapture = url.includes('/api/') || res.status >= 400 || res.status === 0;
        if (shouldCapture) {
          return res
            .clone()
            .text()
            .then(function (text) {
              entry.responseBody = text.slice(0, 2000);
              return res;
            })
            .catch(function () {
              return res;
            });
        }
        return res;
      },
      function (err) {
        entry.error = err && err.message ? err.message : String(err);
        entry.durationMs = Date.now() - t0;
        throw err;
      }
    );
  };

  // ─── XHR intercept (for SSE / EventSource fallback detection) ─────────────
  var _origXHROpen = XMLHttpRequest.prototype.open;
  var _origXHRSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url) {
    this._monitorMethod = method;
    this._monitorUrl = url;
    return _origXHROpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function (body) {
    var self = this;
    var entry = {
      t: Date.now() - window.__monitor.startedAt,
      method: self._monitorMethod || 'GET',
      url: self._monitorUrl || '',
      type: 'XHR',
      status: null,
      responseBody: null,
    };

    if (self._monitorUrl && (self._monitorUrl.includes('/api/') || self._monitorUrl.includes('stream'))) {
      window.__monitor.network.push(entry);

      self.addEventListener('load', function () {
        entry.status = self.status;
        try {
          entry.responseBody = (self.responseText || '').slice(0, 1000);
        } catch (_) {}
      });
    }

    return _origXHRSend.apply(this, arguments);
  };

  // ─── Global JS error capture ───────────────────────────────────────────────
  window.addEventListener('error', function (e) {
    window.__monitor.errors.push({
      t: Date.now() - window.__monitor.startedAt,
      type: 'js_error',
      message: e.message,
      filename: e.filename,
      line: e.lineno,
      col: e.colno,
      stack: e.error && e.error.stack ? e.error.stack.slice(0, 500) : null,
    });
  });

  window.addEventListener('unhandledrejection', function (e) {
    var msg = e.reason
      ? e.reason.message
        ? e.reason.message
        : String(e.reason)
      : 'unknown rejection';
    var stack = e.reason && e.reason.stack ? e.reason.stack.slice(0, 500) : null;
    window.__monitor.errors.push({
      t: Date.now() - window.__monitor.startedAt,
      type: 'unhandledRejection',
      message: msg,
      stack: stack,
    });
  });

  // ─── SSE / EventSource monitor ─────────────────────────────────────────────
  var _origEventSource = window.EventSource;
  if (_origEventSource) {
    window.EventSource = function (url, config) {
      var es = new _origEventSource(url, config);
      var entry = {
        t: Date.now() - window.__monitor.startedAt,
        type: 'SSE',
        url: url,
        events: [],
        error: null,
        closed: false,
      };
      window.__monitor.network.push(entry);

      es.addEventListener('message', function (e) {
        entry.events.push({ t: Date.now() - window.__monitor.startedAt, data: (e.data || '').slice(0, 300) });
      });

      es.addEventListener('error', function (e) {
        entry.error = 'SSE error at t=' + (Date.now() - window.__monitor.startedAt);
      });

      var _origClose = es.close.bind(es);
      es.close = function () {
        entry.closed = true;
        return _origClose();
      };

      return es;
    };
    window.EventSource.prototype = _origEventSource.prototype;
  }

  console.log('[__monitor] Browser monitoring active');
})();
