const DEFAULT_HOST = "192.168.1.89:8080";
const DEFAULT_MAX_VOLUME_DB = 0.0;
const DEFAULT_ZONE = 1;

const state = {
  connected: false,
  host: DEFAULT_HOST,
  activeZone: DEFAULT_ZONE,
  maxVolumeDb: DEFAULT_MAX_VOLUME_DB,
  settingsOpen: false,
  inputs: new Map(),
  inputCount: 0,
  zone: {
    1: { power: false, mute: false, volumeDb: -35.0, input: 1 },
    2: { power: false, mute: false, volumeDb: -35.0, input: 1 }
  }
};

const els = {
  settingsToggle: document.getElementById("settings_toggle"),
  settingsPanel: document.getElementById("settings_panel"),
  settingsClose: document.getElementById("settings_close"),
  saveSettings: document.getElementById("save_settings"),
  hostSummary: document.getElementById("host_summary"),
  zoneSummary: document.getElementById("zone_summary"),
  host: document.getElementById("host"),
  connect: document.getElementById("connect"),
  status: document.getElementById("status"),
  zone: document.getElementById("zone"),
  power: document.getElementById("power"),
  mute: document.getElementById("mute"),
  refresh: document.getElementById("refresh"),
  volumeDown: document.getElementById("volume_down"),
  volume: document.getElementById("volume"),
  volumeUp: document.getElementById("volume_up"),
  volumeValue: document.getElementById("volume_value"),
  maxVolume: document.getElementById("max_volume"),
  saveMaxVolume: document.getElementById("save_max_volume"),
  input: document.getElementById("input")
};

let socket = null;
let keepAlive = null;
let messageFragment = "";

function getActiveZone() {
  return state.activeZone;
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
  els.volumeDown.disabled = !connected;
  els.volume.disabled = !connected;
  els.volumeUp.disabled = !connected;
  els.input.disabled = !connected;
  els.refresh.disabled = !connected;
}

function zoneLabel(zone) {
  return zone === 2 ? "Zone 2" : "Main Zone";
}

function renderContext() {
  els.hostSummary.textContent = state.host;
  els.zoneSummary.textContent = zoneLabel(state.activeZone);
  els.host.value = state.host;
  els.zone.value = String(state.activeZone);
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
  els.power.classList.toggle("is-active", zone.power);
  els.power.setAttribute("aria-pressed", zone.power ? "true" : "false");
  els.power.textContent = "⏻";
  els.mute.classList.toggle("is-active", zone.mute);
  els.mute.setAttribute("aria-pressed", zone.mute ? "true" : "false");
  els.refresh.textContent = "↻";
  const displayVolume = Math.min(zone.volumeDb, state.maxVolumeDb);
  els.volume.value = String(displayVolume);
  els.volumeValue.value = displayVolume.toFixed(1);
  els.maxVolume.value = String(state.maxVolumeDb);
  renderContext();
  renderInputs();
}

function saveHost(host) {
  localStorage.setItem("anthemHost", host);
}

function loadHost() {
  const saved = localStorage.getItem("anthemHost");
  return saved && saved.trim().length > 0 ? saved.trim() : DEFAULT_HOST;
}

function saveZone(zone) {
  localStorage.setItem("anthemZone", String(zone));
}

function loadZone() {
  const saved = Number(localStorage.getItem("anthemZone"));
  if (saved === 1 || saved === 2) {
    return saved;
  }
  return DEFAULT_ZONE;
}

function saveMaxVolumeDb(value) {
  localStorage.setItem("anthemMaxVolumeDb", String(value));
}

function loadMaxVolumeDb() {
  const saved = Number(localStorage.getItem("anthemMaxVolumeDb"));
  if (Number.isFinite(saved)) {
    return saved;
  }
  return DEFAULT_MAX_VOLUME_DB;
}

function clampVolumeToLimits(value) {
  const min = Number(els.volume.min);
  const max = Math.min(Number(els.volume.max), state.maxVolumeDb);
  return Math.min(max, Math.max(min, value));
}

function toggleSettings(open) {
  state.settingsOpen = open;
  els.settingsPanel.classList.toggle("hidden", !open);
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

function adjustVolumeDb(delta) {
  const zone = getActiveZone();
  const current = state.zone[zone].volumeDb;
  const next = clampVolumeToLimits(current + delta);
  state.zone[zone].volumeDb = next;
  renderZone();
  sendSet(zoneCommand(zone, "VOL"), next.toFixed(1));
}

function setMaxVolumeDbFromInput() {
  const parsed = Number(els.maxVolume.value);
  if (!Number.isFinite(parsed)) {
    els.maxVolume.value = String(state.maxVolumeDb);
    return;
  }
  const next = Math.min(0, Math.max(-90, parsed));
  state.maxVolumeDb = next;
  saveMaxVolumeDb(next);
  const zone = getActiveZone();
  if (state.zone[zone].volumeDb > next) {
    state.zone[zone].volumeDb = next;
    renderZone();
    if (state.connected) {
      sendSet(zoneCommand(zone, "VOL"), next.toFixed(1));
    }
    return;
  }
  renderZone();
}

function saveSettingsFromInputs() {
  const host = (els.host.value || "").trim() || DEFAULT_HOST;
  const zone = Number(els.zone.value) === 2 ? 2 : 1;
  const hostChanged = host !== state.host;
  const zoneChanged = zone !== state.activeZone;

  state.host = host;
  state.activeZone = zone;
  saveHost(host);
  saveZone(zone);
  renderZone();

  if (hostChanged) {
    connect();
    return;
  }
  if (state.connected && zoneChanged) {
    queryZone(state.activeZone);
  }
}

function toggleMuteForActiveZone() {
  const zone = getActiveZone();
  const next = state.zone[zone].mute ? 0 : 1;
  sendSet(zoneCommand(zone, "MUT"), next);
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
  const host = state.host || DEFAULT_HOST;

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
  els.connect.addEventListener("click", () => {
    state.host = (els.host.value || "").trim() || DEFAULT_HOST;
    state.activeZone = Number(els.zone.value) === 2 ? 2 : 1;
    saveHost(state.host);
    saveZone(state.activeZone);
    renderZone();
    connect();
  });

  els.settingsToggle.addEventListener("click", () => {
    toggleSettings(!state.settingsOpen);
  });

  els.settingsClose.addEventListener("click", () => {
    toggleSettings(false);
  });

  els.saveSettings.addEventListener("click", () => {
    saveSettingsFromInputs();
    toggleSettings(false);
  });

  els.power.addEventListener("click", () => {
    const zone = getActiveZone();
    const next = state.zone[zone].power ? 0 : 1;
    sendSet(zoneCommand(zone, "POW"), next);
  });

  els.mute.addEventListener("click", () => {
    toggleMuteForActiveZone();
  });

  els.volume.addEventListener("input", () => {
    els.volumeValue.value = Number(els.volume.value).toFixed(1);
  });

  els.volume.addEventListener("change", () => {
    const zone = getActiveZone();
    const value = clampVolumeToLimits(Number(els.volume.value)).toFixed(1);
    state.zone[zone].volumeDb = Number(value);
    renderZone();
    sendSet(zoneCommand(zone, "VOL"), value);
  });

  els.volumeDown.addEventListener("click", () => {
    adjustVolumeDb(-1);
  });

  els.volumeUp.addEventListener("click", () => {
    adjustVolumeDb(1);
  });

  els.saveMaxVolume.addEventListener("click", () => {
    setMaxVolumeDbFromInput();
  });

  els.maxVolume.addEventListener("change", () => {
    setMaxVolumeDbFromInput();
  });

  els.input.addEventListener("change", () => {
    const zone = getActiveZone();
    sendSet(zoneCommand(zone, "INP"), Number(els.input.value));
  });

  els.refresh.addEventListener("click", () => {
    queryZone(getActiveZone());
    queryInputs();
  });

  window.addEventListener("beforeunload", () => {
    safeCloseSocket();
  });

  window.addEventListener("keydown", (event) => {
    if (!state.connected) {
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }
    const target = event.target;
    if (
      target instanceof HTMLElement &&
      (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
    ) {
      return;
    }
    if (event.key.toLowerCase() === "m") {
      event.preventDefault();
      toggleMuteForActiveZone();
    }
  });
}

function init() {
  state.host = loadHost();
  state.activeZone = loadZone();
  state.maxVolumeDb = loadMaxVolumeDb();
  renderContext();
  toggleSettings(false);
  setStatus("Disconnected", false);
  renderZone();
  wireEvents();
  connect();
}

init();
