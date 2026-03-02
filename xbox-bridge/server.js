const http = require("http");
const { X509 } = require("jsrsasign");

const Smartglass = require("xbox-smartglass-core-node");
const SystemInputChannel = require("xbox-smartglass-core-node/src/channels/systeminput");
const SystemMediaChannel = require("xbox-smartglass-core-node/src/channels/systemmedia");

const PORT = Number(process.env.PORT || 8765);
const MANAGER_WARMUP_MS = 350;

const INPUT_ACTIONS = new Set(["up", "down", "left", "right", "a", "b", "x", "y", "view", "menu", "nexus"]);
const MEDIA_ACTIONS = new Set(["play", "pause", "playpause", "stop"]);

const sessions = new Map();

function extractLiveIdFromCertificate(certificateBuffer) {
  const pem = `-----BEGIN CERTIFICATE-----\n${certificateBuffer
    .toString("base64")
    .match(/.{1,64}/g)
    .join("\n")}\n-----END CERTIFICATE-----`;
  const cert = new X509();
  cert.readCertPEM(pem);
  const subject = cert.getSubjectString();

  if (!subject) {
    throw new Error("Certificate subject is empty");
  }

  // Most consoles expose a 16-char hex Live ID (often starting with FD) in subject attributes.
  const attrs = subject
    .split("/")
    .filter(Boolean)
    .map((entry) => {
      const idx = entry.indexOf("=");
      if (idx === -1) {
        return "";
      }
      return entry.slice(idx + 1).trim();
    })
    .filter(Boolean);

  for (const value of attrs) {
    if (/^FD[0-9A-F]{14}$/i.test(value)) {
      return value.toUpperCase();
    }
  }

  for (const value of attrs) {
    if (/^[0-9A-F]{16}$/i.test(value)) {
      return value.toUpperCase();
    }
  }

  const embedded = subject.match(/FD[0-9A-F]{14}/i) || subject.match(/[0-9A-F]{16}/i);
  if (embedded) {
    return embedded[0].toUpperCase();
  }

  throw new Error(`Could not extract Live ID from certificate subject: ${subject}`);
}

async function discoverConsole(xboxHost) {
  const client = Smartglass();
  const results = await client.discovery(xboxHost);
  if (!results || results.length === 0) {
    throw new Error(`No Xbox discovered at ${xboxHost}`);
  }
  const found = results.find((item) => item.remote && item.remote.address === xboxHost) || results[0];
  if (!found || !found.message || !found.message.certificate) {
    throw new Error("Discovery response missing certificate");
  }
  return {
    xboxHost: found.remote.address,
    name: found.message.name,
    uuid: found.message.uuid,
    liveId: extractLiveIdFromCertificate(found.message.certificate)
  };
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.end(JSON.stringify(payload));
}

function normalizeXboxHost(value) {
  let host = String(value || "").trim();
  if (!host) {
    return "";
  }

  try {
    if (host.includes("://")) {
      host = new URL(host).hostname;
    }
  } catch (_error) {
    // Keep original value if URL parsing fails.
  }

  if (host.includes("/")) {
    host = host.split("/")[0];
  }

  // Handle IPv4/hostname with port (e.g. 192.168.1.120:5050).
  if (host.includes(":") && host.indexOf(":") === host.lastIndexOf(":")) {
    host = host.split(":")[0];
  }

  return host.trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getSession(xboxHost) {
  let session = sessions.get(xboxHost);
  if (session) {
    return session;
  }
  session = {
    xboxHost,
    client: null,
    queue: Promise.resolve()
  };
  sessions.set(xboxHost, session);
  return session;
}

async function connectSession(session) {
  if (session.client && session.client.isConnected()) {
    return session.client;
  }

  const client = Smartglass();
  await client.connect(session.xboxHost);
  client.addManager("system_input", SystemInputChannel());
  client.addManager("system_media", SystemMediaChannel());
  session.client = client;

  await sleep(MANAGER_WARMUP_MS);

  return client;
}

async function runAction(session, action, liveId) {
  if (action === "power_on") {
    if (!liveId) {
      throw new Error("Power on requires liveId");
    }
    await Smartglass().powerOn({
      ip: session.xboxHost,
      live_id: liveId,
      tries: 5
    });
    return { message: "Power on sent" };
  }

  const client = await connectSession(session);

  if (action === "power_off") {
    await client.powerOff();
    return { message: "Power off sent" };
  }

  if (INPUT_ACTIONS.has(action)) {
    await client.getManager("system_input").sendCommand(action);
    return { message: `Input action sent: ${action}` };
  }

  if (MEDIA_ACTIONS.has(action)) {
    await client.getManager("system_media").sendCommand(action);
    return { message: `Media action sent: ${action}` };
  }

  throw new Error(`Unsupported action: ${action}`);
}

function enqueue(session, task) {
  const run = session.queue.then(task, task);
  session.queue = run.catch(() => {});
  return run;
}

async function parseJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) {
    return {};
  }
  return JSON.parse(raw);
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.end();
    return;
  }

  if (req.method === "GET" && req.url === "/health") {
    sendJson(res, 200, {
      ok: true,
      status: "up",
      sessions: Array.from(sessions.keys())
    });
    return;
  }

  if (req.method === "POST" && req.url === "/discover") {
    try {
      const body = await parseJsonBody(req);
      const xboxHost = normalizeXboxHost(body.xboxHost);
      if (!xboxHost) {
        sendJson(res, 400, { ok: false, error: "Missing xboxHost" });
        return;
      }
      const discovered = await discoverConsole(xboxHost);
      sendJson(res, 200, {
        ok: true,
        ...discovered
      });
    } catch (error) {
      const statusCode = error instanceof SyntaxError ? 400 : 500;
      sendJson(res, statusCode, {
        ok: false,
        error: error && error.message ? error.message : String(error)
      });
    }
    return;
  }

  if (req.method === "DELETE" && req.url === "/session") {
    try {
      const body = await parseJsonBody(req);
      const xboxHost = normalizeXboxHost(body.xboxHost);
      if (!xboxHost) {
        sendJson(res, 400, { ok: false, error: "Missing xboxHost" });
        return;
      }
      const session = sessions.get(xboxHost);
      if (session && session.client) {
        try { session.client.disconnect(); } catch (_) {}
      }
      const existed = sessions.delete(xboxHost);
      sendJson(res, 200, { ok: true, deleted: existed, xboxHost });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error && error.message ? error.message : String(error) });
    }
    return;
  }

  if (req.method !== "POST" || req.url !== "/command") {
    sendJson(res, 404, {
      ok: false,
      error: "Not found"
    });
    return;
  }

  try {
    const body = await parseJsonBody(req);
    const xboxHost = normalizeXboxHost(body.xboxHost);
    const action = String(body.action || "").trim();
    const liveId = String(body.liveId || "").trim();

    if (!xboxHost) {
      sendJson(res, 400, { ok: false, error: "Missing xboxHost" });
      return;
    }
    if (!action) {
      sendJson(res, 400, { ok: false, error: "Missing action" });
      return;
    }

    const session = getSession(xboxHost);
    const result = await enqueue(session, () => runAction(session, action, liveId));

    sendJson(res, 200, {
      ok: true,
      ...result
    });
  } catch (error) {
    const statusCode = error instanceof SyntaxError ? 400 : 500;
    sendJson(res, statusCode, {
      ok: false,
      error: error && error.message ? error.message : String(error)
    });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Xbox bridge listening on http://127.0.0.1:${PORT}`);
});
