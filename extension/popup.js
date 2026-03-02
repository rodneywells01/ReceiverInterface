const DEFAULT_HOST = "192.168.1.89:8080";

const state = {
  connected: false,
  host: DEFAULT_HOST,
  inputs: new Map(),
  inputCount: 0,
  zone: {
    1: { power: false, mute: false, volumeDb: -35.0, input: 1 },
    2: { power: false, mute: false, volumeDb: -35.0, input: 1 }
  }
};

const els = {
  host: document.getElementById("host"),
  connect: document.getElementById("connect"),
  status: document.getElementById("status"),
  zone: document.getElementById("zone"),
  power: document.getElementById("power"),
  mute: document.getElementById("mute"),
  refresh: document.getElementById("refresh"),
  volume: document.getElementById("volume"),
  volumeValue: document.getElementById("volume_value"),
  input: document.getElementById("input")
};

let socket = null;
let keepAlive = null;
let messageFragment = "";

function getActiveZone() {
  return Number(els.zone.value);
}

function zoneCommand(zoneNumber, suffix) {
  return `Z${zoneNumber}${suffix}`;
}

function setStatus(text, connected) {
  state.connected = connected;
  els.status.textContent = text;
  els.status.classList.toggle("connected", connected);
  els.status.classList.toggle("disconnected", !connected);

  els.power.disabled = !connected;
  els.mute.disabled = !connected;
  els.volume.disabled = !connected;
  els.input.disabled = !connected;
  els.refresh.disabled = !connected;
}

function renderInputs() {
  const selected = state.zone[getActiveZone()].input;
  els.input.innerHTML = "";

  const total = state.inputCount || Math.max(1, state.inputs.size);
  for (let i = 1; i <= total; i += 1) {
    const option = document.createElement("option");
    option.value = String(i);
    option.textContent = state.inputs.get(i) || `Input ${i}`;
    els.input.appendChild(option);
  }

  els.input.value = String(selected);
}

function renderZone() {
  const zone = state.zone[getActiveZone()];
  els.power.textContent = zone.power ? "Power On" : "Power Off";
  els.mute.textContent = zone.mute ? "Mute On" : "Mute Off";
  els.volume.value = String(zone.volumeDb);
  els.volumeValue.value = zone.volumeDb.toFixed(1);
  renderInputs();
}

function saveHost(host) {
  localStorage.setItem("anthemHost", host);
}

function loadHost() {
  const saved = localStorage.getItem("anthemHost");
  return saved && saved.trim().length > 0 ? saved.trim() : DEFAULT_HOST;
}

function clearSocketTimers() {
  if (keepAlive) {
    clearInterval(keepAlive);
    keepAlive = null;
  }
}

function safeCloseSocket() {
  if (socket) {
    try {
      socket.close();
    } catch (err) {
      console.error("close socket failed", err);
    }
    socket = null;
  }
  clearSocketTimers();
}

function sendRaw(payload) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    return;
  }
  socket.send(payload);
}

function sendQuery(command) {
  sendRaw(`${command}?;`);
}

function sendSet(command, value) {
  sendRaw(`${command}${value};`);
  sendQuery(command);
}

function queryZone(zoneNumber) {
  sendQuery(zoneCommand(zoneNumber, "POW"));
  sendQuery(zoneCommand(zoneNumber, "MUT"));
  sendQuery(zoneCommand(zoneNumber, "VOL"));
  sendQuery(zoneCommand(zoneNumber, "INP"));
}

function queryInputs() {
  sendQuery("ICN");
  const known = state.inputCount || state.inputs.size;
  const total = known > 0 ? known : 20;
  for (let i = 1; i <= total; i += 1) {
    sendQuery(`IS${i}IN`);
  }
}

function queryAll() {
  queryZone(1);
  queryZone(2);
  queryInputs();
}

function parseMessageLine(line) {
  const text = line.trim();
  if (!text) {
    return;
  }

  let match = text.match(/^Z([12])POW([01])$/);
  if (match) {
    const zone = Number(match[1]);
    state.zone[zone].power = match[2] === "1";
    renderZone();
    return;
  }

  match = text.match(/^Z([12])MUT([01])$/);
  if (match) {
    const zone = Number(match[1]);
    state.zone[zone].mute = match[2] === "1";
    renderZone();
    return;
  }

  match = text.match(/^Z([12])VOL(-?\d+(?:\.\d+)?)$/);
  if (match) {
    const zone = Number(match[1]);
    state.zone[zone].volumeDb = Number(match[2]);
    renderZone();
    return;
  }

  match = text.match(/^Z([12])INP(\d+)$/);
  if (match) {
    const zone = Number(match[1]);
    state.zone[zone].input = Number(match[2]);
    renderZone();
    return;
  }

  match = text.match(/^ICN(\d+)$/);
  if (match) {
    state.inputCount = Number(match[1]);
    renderInputs();
    for (let i = 1; i <= state.inputCount; i += 1) {
      sendQuery(`IS${i}IN`);
    }
    return;
  }

  match = text.match(/^IS(\d+)IN(.+)$/);
  if (match) {
    const index = Number(match[1]);
    const name = match[2].trim();
    if (name) {
      state.inputs.set(index, name);
      renderInputs();
    }
  }
}

function handleSocketMessage(data) {
  const lines = data.split(";");
  if (lines.length > 0 && messageFragment) {
    lines[0] = messageFragment + lines[0];
    messageFragment = "";
  }

  if (data.length > 0 && data[data.length - 1] !== ";") {
    messageFragment = lines.pop() || "";
  }

  for (const line of lines) {
    parseMessageLine(line);
  }
}

function connect() {
  const host = els.host.value.trim() || DEFAULT_HOST;
  saveHost(host);
  state.host = host;

  safeCloseSocket();
  setStatus("Connecting...", false);

  const wsUrl = `ws://${host}/cmd`;
  socket = new WebSocket(wsUrl);

  socket.addEventListener("open", () => {
    setStatus(`Connected: ${host}`, true);
    messageFragment = "";
    queryAll();
    keepAlive = setInterval(() => sendRaw("IDQ?;"), 30000);
  });

  socket.addEventListener("message", (event) => {
    handleSocketMessage(String(event.data || ""));
  });

  socket.addEventListener("close", () => {
    setStatus("Disconnected", false);
    clearSocketTimers();
  });

  socket.addEventListener("error", () => {
    setStatus("Connection Error", false);
    clearSocketTimers();
  });
}

function wireEvents() {
  els.connect.addEventListener("click", connect);

  els.zone.addEventListener("change", () => {
    renderZone();
    if (state.connected) {
      queryZone(getActiveZone());
    }
  });

  els.power.addEventListener("click", () => {
    const zone = getActiveZone();
    const next = state.zone[zone].power ? 0 : 1;
    sendSet(zoneCommand(zone, "POW"), next);
  });

  els.mute.addEventListener("click", () => {
    const zone = getActiveZone();
    const next = state.zone[zone].mute ? 0 : 1;
    sendSet(zoneCommand(zone, "MUT"), next);
  });

  els.volume.addEventListener("input", () => {
    els.volumeValue.value = Number(els.volume.value).toFixed(1);
  });

  els.volume.addEventListener("change", () => {
    const zone = getActiveZone();
    const value = Number(els.volume.value).toFixed(1);
    sendSet(zoneCommand(zone, "VOL"), value);
  });

  els.input.addEventListener("change", () => {
    const zone = getActiveZone();
    sendSet(zoneCommand(zone, "INP"), Number(els.input.value));
  });

  els.refresh.addEventListener("click", () => {
    queryAll();
  });

  window.addEventListener("beforeunload", () => {
    safeCloseSocket();
  });
}

function init() {
  els.host.value = loadHost();
  setStatus("Disconnected", false);
  renderZone();
  wireEvents();
  connect();
}

init();
