"use strict";

function createHttp({ MAX_BODY_BYTES }) {
  function parseBody(value) {
    const data = typeof value === "string" ? JSON.parse(value || "{}") : value;
    if (!data || typeof data !== "object" || Array.isArray(data))
      throw Object.assign(new Error("ข้อมูลคำขอต้องเป็น JSON object"), {
        status: 400,
      });
    return data;
  }
  function json(res, status, data, extra = {}) {
    const body = Buffer.from(JSON.stringify(data));
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Length": body.length,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...extra,
    });
    res.end(body);
  }
  function parseCookies(header = "") {
    const out = {};
    for (const part of header.split(";")) {
      const i = part.indexOf("=");
      if (i <= 0) continue;
      const key = part.slice(0, i).trim();
      try {
        out[key] = decodeURIComponent(part.slice(i + 1).trim());
      } catch {
        /* Ignore malformed cookies; protected routes will treat them as unauthenticated. */
      }
    }
    return out;
  }

  function bodyJson(req) {
    // Vercel may parse the request body before invoking our function.
    if (req.body !== undefined) {
      try {
        const raw = Buffer.isBuffer(req.body)
          ? req.body.toString("utf8")
          : req.body;
        const size = Buffer.byteLength(
          typeof raw === "string" ? raw : JSON.stringify(raw),
        );
        if (size > MAX_BODY_BYTES)
          throw Object.assign(new Error("คำขอมีขนาดใหญ่เกินกำหนด"), {
            status: 413,
          });
        return Promise.resolve(parseBody(raw));
      } catch (error) {
        return Promise.reject(
          Object.assign(error, { status: error.status || 400 }),
        );
      }
    }
    return new Promise((resolve, reject) => {
      let size = 0;
      const chunks = [];
      req.on("data", (chunk) => {
        size += chunk.length;
        if (size > MAX_BODY_BYTES) {
          reject(
            Object.assign(new Error("คำขอมีขนาดใหญ่เกินกำหนด"), {
              status: 413,
            }),
          );
          chunks.length = 0;
        } else chunks.push(chunk);
      });
      req.on("end", () => {
        try {
          if (size <= MAX_BODY_BYTES)
            resolve(parseBody(Buffer.concat(chunks).toString("utf8")));
        } catch {
          reject(
            Object.assign(new Error("รูปแบบข้อมูลไม่ถูกต้อง"), { status: 400 }),
          );
        }
      });
      req.on("error", reject);
    });
  }

  return { json, bodyJson, parseCookies };
}

function createStatic({ fs, path, PUBLIC, MIME }) {
  function serveStatic(req, res, url) {
    if (!["GET", "HEAD"].includes(req.method)) {
      res.writeHead(405, { Allow: "GET, HEAD" });
      return res.end();
    }
    let requested;
    try {
      requested =
        url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
    } catch {
      res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("URL ไม่ถูกต้อง");
    }
    if (requested.includes("\0")) {
      res.writeHead(400);
      return res.end("Invalid URL");
    }
    const file = path.resolve(PUBLIC, "." + requested);
    if (!file.startsWith(PUBLIC + path.sep)) {
      res.writeHead(403);
      return res.end("Forbidden");
    }
    fs.stat(file, (err, stat) => {
      if (err || !stat.isFile()) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        return res.end("ไม่พบไฟล์");
      }
      const type =
        MIME[path.extname(file).toLowerCase()] || "application/octet-stream";
      res.writeHead(200, {
        "Content-Type": type,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-store",
      });
      if (req.method === "HEAD") return res.end();
      const stream = fs.createReadStream(file);
      stream.on("error", () => res.destroy());
      res.on("close", () => stream.destroy());
      stream.pipe(res);
    });
  }

  return { serveStatic };
}

// Proxies may terminate HTTPS before forwarding the request to Node.
// Compare the browser origin with the public Host, never the listening address.
function isAllowedOrigin(req, configuredOrigin) {
  if (!req.headers.origin) return true;
  try {
    const origin = new URL(req.headers.origin);
    if (!["http:", "https:"].includes(origin.protocol)) return false;
    if (configuredOrigin) return origin.origin === configuredOrigin;
    return origin.host === req.headers.host;
  } catch {
    return false;
  }
}

module.exports = { createHttp, createStatic, isAllowedOrigin };
