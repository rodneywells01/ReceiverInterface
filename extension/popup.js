const DEFAULT_HOST = "192.168.1.89:8080";
const DEFAULT_MAX_VOLUME_DB = 0.0;
const DEFAULT_ZONE = 1;
const DEFAULT_XBOX_BRIDGE_URL = "http://127.0.0.1:8765";

const state = {
  connected: false,
  host: DEFAULT_HOST,
  activeZone: DEFAULT_ZONE,
  maxVolumeDb: DEFAULT_MAX_VOLUME_DB,
  settingsOpen: false,
  inputs: new Map(),
  inputCount: 0,
  xbox: {
    host: "",
    liveId: "",
    bridgeUrl: DEFAULT_XBOX_BRIDGE_URL,
    busy: false,
    status: "Idle"
  },
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
  xboxHost: document.getElementById("xbox_host"),
  xboxLiveId: document.getElementById("xbox_live_id"),
  discoverXboxLiveId: document.getElementById("discover_xbox_live_id"),
  xboxBridgeUrl: document.getElementById("xbox_bridge_url"),
  power: document.getElementById("power"),
  mute: document.getElementById("mute"),
  refresh: document.getElementById("refresh"),
  volumeDown: document.getElementById("volume_down"),
  volume: document.getElementById("volume"),
  volumeUp: document.getElementById("volume_up"),
  volumeValue: document.getElementById("volume_value"),
  maxVolume: document.getElementById("max_volume"),
  saveMaxVolume: document.getElementById("save_max_volume"),
  input: document.getElementById("input"),
  xboxControlsCard: document.getElementById("xbox_controls_card"),
  xboxStatus: document.getElementById("xbox_status"),
  xboxActions: Array.from(document.querySelectorAll(".xbox-action"))
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
  if (!connected) {
    state.xbox.busy = false;
  }
  renderXboxControls();
}

function zoneLabel(zone) {
  return zone === 2 ? "Zone 2" : "Main Zone";
}

function renderContext() {
  els.hostSummary.textContent = state.host;
  els.zoneSummary.textContent = zoneLabel(state.activeZone);
  els.host.value = state.host;
  els.zone.value = String(state.activeZone);
  els.xboxHost.value = state.xbox.host;
  els.xboxLiveId.value = state.xbox.liveId;
  els.xboxBridgeUrl.value = state.xbox.bridgeUrl;
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
  renderXboxControls();
}

function getActiveInputName() {
  const zone = state.zone[getActiveZone()];
  const known = state.inputs.get(zone.input);
  if (known) {
    return known.trim();
  }
  const selectedOption = els.input.selectedOptions[0];
  if (selectedOption) {
    return selectedOption.textContent.trim();
  }
  return "";
}

function isXboxInputActive() {
  return getActiveInputName().toLowerCase() === "xbox";
}

function setXboxStatus(text) {
  state.xbox.status = text;
  els.xboxStatus.textContent = text;
}

function renderXboxControls() {
  const visible = state.connected && isXboxInputActive();
  els.xboxControlsCard.classList.toggle("hidden", !visible);
  for (const button of els.xboxActions) {
    button.disabled = state.xbox.busy;
  }
  setXboxStatus(state.xbox.status);
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
  renderXboxControls();
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

function normalizeBridgeUrl(value) {
  const trimmed = (value || "").trim();
  if (!trimmed) {
    return DEFAULT_XBOX_BRIDGE_URL;
  }
  return trimmed.replace(/\/+$/, "");
}

function normalizeXboxHost(value) {
  let host = (value || "").trim();
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
  if (host.includes(":") && host.indexOf(":") === host.lastIndexOf(":")) {
    host = host.split(":")[0];
  }
  return host.trim();
}

function saveXboxSettings() {
  localStorage.setItem("anthemXboxHost", state.xbox.host);
  localStorage.setItem("anthemXboxLiveId", state.xbox.liveId);
  localStorage.setItem("anthemXboxBridgeUrl", state.xbox.bridgeUrl);
}

function loadXboxSettings() {
  return {
    host: (localStorage.getItem("anthemXboxHost") || "").trim(),
    liveId: (localStorage.getItem("anthemXboxLiveId") || "").trim(),
    bridgeUrl: normalizeBridgeUrl(localStorage.getItem("anthemXboxBridgeUrl"))
  };
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
  const xboxHost = normalizeXboxHost(els.xboxHost.value);
  const xboxLiveId = (els.xboxLiveId.value || "").trim();
  const xboxBridgeUrl = normalizeBridgeUrl(els.xboxBridgeUrl.value);
  const hostChanged = host !== state.host;
  const zoneChanged = zone !== state.activeZone;

  state.host = host;
  state.activeZone = zone;
  state.xbox.host = xboxHost;
  state.xbox.liveId = xboxLiveId;
  state.xbox.bridgeUrl = xboxBridgeUrl;
  saveHost(host);
  saveZone(zone);
  saveXboxSettings();
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

async function discoverXboxLiveId() {
  const xboxHost = normalizeXboxHost(els.xboxHost.value);
  const bridgeUrl = normalizeBridgeUrl(els.xboxBridgeUrl.value);
  if (!xboxHost) {
    setXboxStatus("Set Xbox host first");
    return;
  }

  state.xbox.busy = true;
  els.discoverXboxLiveId.disabled = true;
  setXboxStatus("Discovering Live ID...");
  renderXboxControls();

  try {
    const response = await fetch(`${bridgeUrl}/discover`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ xboxHost })
    });
    const payload = await response.json().catch(() => ({}));
    if (response.status === 404) {
      throw new Error("Bridge missing /discover. Restart bridge from latest code.");
    }
    if (!response.ok || !payload.ok || !payload.liveId) {
      const detail = payload.error || payload.message || `HTTP ${response.status}`;
      throw new Error(detail);
    }

    state.xbox.host = xboxHost;
    state.xbox.bridgeUrl = bridgeUrl;
    state.xbox.liveId = String(payload.liveId).trim();
    els.xboxLiveId.value = state.xbox.liveId;
    els.xboxHost.value = state.xbox.host;
    els.xboxBridgeUrl.value = state.xbox.bridgeUrl;
    saveXboxSettings();
    setXboxStatus(`Live ID found: ${state.xbox.liveId}`);
  } catch (error) {
    setXboxStatus(`Discover failed: ${error.message}`);
  } finally {
    state.xbox.busy = false;
    els.discoverXboxLiveId.disabled = false;
    renderXboxControls();
  }
}

async function sendXboxCommand(action) {
  if (!state.xbox.host) {
    setXboxStatus("Set Xbox host in Settings");
    return;
  }
  if (action === "power_on" && !state.xbox.liveId) {
    setXboxStatus("Set Xbox Live ID for Power On");
    return;
  }

  state.xbox.busy = true;
  setXboxStatus(`Sending ${action}...`);
  renderXboxControls();

  try {
    const response = await fetch(`${state.xbox.bridgeUrl}/command`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        action,
        xboxHost: state.xbox.host,
        liveId: state.xbox.liveId
      })
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok) {
      const detail = payload.error || payload.message || `HTTP ${response.status}`;
      throw new Error(detail);
    }
    setXboxStatus(`OK: ${action}`);
  } catch (error) {
    setXboxStatus(`Error: ${error.message}`);
  } finally {
    state.xbox.busy = false;
    renderXboxControls();
  }
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

  els.discoverXboxLiveId.addEventListener("click", () => {
    discoverXboxLiveId();
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
    state.zone[zone].input = Number(els.input.value);
    renderZone();
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

  for (const button of els.xboxActions) {
    button.addEventListener("click", () => {
      const action = button.dataset.xboxAction;
      if (!action) {
        return;
      }
      sendXboxCommand(action);
    });
  }
}

function init() {
  state.host = loadHost();
  state.activeZone = loadZone();
  state.maxVolumeDb = loadMaxVolumeDb();
  state.xbox = {
    ...state.xbox,
    ...loadXboxSettings()
  };
  renderContext();
  toggleSettings(false);
  setStatus("Disconnected", false);
  setXboxStatus("Idle");
  renderZone();
  wireEvents();
  connect();
}

init();
