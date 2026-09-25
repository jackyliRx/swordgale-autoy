/*
 * Autoy API Recorder
 *
 * Paste this file into the DevTools Console while on the game site, then use
 * the site normally. It records fetch/XHR activity only in this browser tab.
 * It never sends data anywhere. Sensitive headers and common token fields are
 * redacted before a record is stored.
 *
 * Commands after installation:
 *   __autoyApiRecorder.logs()     // inspect sanitized records
 *   __autoyApiRecorder.export()   // copy JSON to the clipboard
 *   __autoyApiRecorder.clear()    // discard captured records
 *   __autoyApiRecorder.stop()     // restore the original browser APIs
 */
(() => {
  if (window.__autoyApiRecorder) {
    console.info("[Autoy] Recorder is already running.");
    return;
  }

  const MAX_BODY_LENGTH = 20_000;
  const MAX_RECORDS = 200;
  const secretKey = /authorization|cookie|token|password|secret|api[-_]?key|session|ownerid|userid/i;
  const originalFetch = window.fetch;
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  const originalSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
  const records = [];

  function redact(value, depth = 0) {
    if (depth > 8) return "[truncated]";
    if (value === null || value === undefined) return value;
    if (typeof value === "string") {
      return value.length > MAX_BODY_LENGTH
        ? `${value.slice(0, MAX_BODY_LENGTH)}…[truncated]`
        : value;
    }
    if (Array.isArray(value)) return value.map((entry) => redact(entry, depth + 1));
    if (typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value).map(([key, entry]) => [
          key,
          secretKey.test(key) ? "[redacted]" : redact(entry, depth + 1),
        ]),
      );
    }
    return value;
  }

  function safeUrl(input) {
    try {
      const url = new URL(input, window.location.href);
      for (const key of [...url.searchParams.keys()]) {
        if (secretKey.test(key)) url.searchParams.set(key, "[redacted]");
      }
      return url.toString();
    } catch {
      return String(input);
    }
  }

  function parseBody(value) {
    if (!value) return undefined;
    if (typeof value !== "string") return redact(String(value));
    try {
      return redact(JSON.parse(value));
    } catch {
      return redact(value);
    }
  }

  function selectedResponseHeaders(headers) {
    const names = [
      "content-type",
      "access-control-allow-origin",
      "access-control-allow-credentials",
    ];
    return Object.fromEntries(
      names
        .map((name) => [name, headers.get(name)])
        .filter(([, value]) => value !== null),
    );
  }

  async function readResponse(response) {
    const contentType = response.headers.get("content-type") || "";
    const text = await response.clone().text();
    if (contentType.includes("application/json")) return parseBody(text);
    return redact(text);
  }

  function add(record) {
    records.push(redact(record));
    if (records.length > MAX_RECORDS) records.shift();
    console.info(
      `[Autoy] ${record.method} ${record.status ?? "pending"} ${record.url}`,
      records.at(-1),
    );
  }

  window.fetch = async function autoyRecordedFetch(input, init = {}) {
    const request = input instanceof Request ? input : null;
    const method = init.method || request?.method || "GET";
    const url = safeUrl(request?.url || input);
    const startedAt = new Date().toISOString();
    const started = performance.now();
    try {
      const response = await originalFetch.apply(this, arguments);
      add({
        source: "fetch",
        startedAt,
        durationMs: Math.round(performance.now() - started),
        method,
        url,
        status: response.status,
        responseHeaders: selectedResponseHeaders(response.headers),
        requestBody: parseBody(init.body),
        responseBody: await readResponse(response),
      });
      return response;
    } catch (error) {
      add({
        source: "fetch",
        startedAt,
        durationMs: Math.round(performance.now() - started),
        method,
        url,
        requestBody: parseBody(init.body),
        error: String(error?.message || error),
      });
      throw error;
    }
  };

  XMLHttpRequest.prototype.open = function autoyRecordedOpen(method, url) {
    this.__autoyRecord = {
      source: "xhr",
      startedAt: new Date().toISOString(),
      started: performance.now(),
      method: String(method || "GET").toUpperCase(),
      url: safeUrl(url),
      headers: {},
    };
    return originalOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.setRequestHeader = function autoyRecordedHeader(name, value) {
    if (this.__autoyRecord) this.__autoyRecord.headers[name] = value;
    return originalSetRequestHeader.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function autoyRecordedSend(body) {
    const record = this.__autoyRecord;
    if (record) {
      record.requestBody = parseBody(body);
      this.addEventListener(
        "loadend",
        () => {
          add({
            ...record,
            durationMs: Math.round(performance.now() - record.started),
            status: this.status,
            responseHeaders: {
              "content-type": this.getResponseHeader("content-type"),
              "access-control-allow-origin": this.getResponseHeader(
                "access-control-allow-origin",
              ),
              "access-control-allow-credentials": this.getResponseHeader(
                "access-control-allow-credentials",
              ),
            },
            responseBody: parseBody(this.responseText),
          });
        },
        { once: true },
      );
    }
    return originalSend.apply(this, arguments);
  };

  window.__autoyApiRecorder = {
    logs: () => records.map((record) => ({ ...record })),
    clear: () => {
      records.length = 0;
      console.info("[Autoy] Records cleared.");
    },
    export: async () => {
      const json = JSON.stringify(records, null, 2);
      await navigator.clipboard.writeText(json);
      console.info(`[Autoy] Copied ${records.length} sanitized records.`);
      return json;
    },
    stop: () => {
      window.fetch = originalFetch;
      XMLHttpRequest.prototype.open = originalOpen;
      XMLHttpRequest.prototype.send = originalSend;
      XMLHttpRequest.prototype.setRequestHeader = originalSetRequestHeader;
      delete window.__autoyApiRecorder;
      console.info("[Autoy] Recorder stopped and browser APIs restored.");
    },
  };

  console.info("[Autoy] Recorder started. Use the site, then run __autoyApiRecorder.export().");
})();
