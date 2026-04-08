const DEFAULT_PORT = 502;
const HEARTBEAT_INTERVAL_MS = 1000;

const READ_REGISTERS = {
  PLC_STATUS: {
    address: "0x10",
    description: "PLC Status"
  },
  DOOR_STATUS: {
    address: "0x11",
    description: "Door Status"
  },
  CONVEYOR_STATUS: {
    address: "0x12",
    description: "Conveyor Status"
  },
  ERROR_CODE: {
    address: "0x13",
    description: "Error code"
  },
  HEARTBEAT_PLC: {
    address: "0x14",
    description: "PLC heartbeat counter"
  }
};

const VALUE_MAPS = {
  CMD_CODE: {
    0: "NONE",
    1: "DOOR_OPEN",
    2: "DOOR_CLOSE",
    3: "DOOR_STOP",
    4: "CONVEYOR_START",
    5: "CONVEYOR_STOP",
    6: "RESET"
  },
  PLC_STATUS: {
    0: "IDLE",
    1: "BUSY",
    2: "DONE",
    3: "ERROR",
    4: "MANUAL",
    5: "EMERGENCY_STOP"
  },
  DOOR_STATUS: {
    0: "NONE",
    1: "CLOSED",
    2: "CLOSING",
    3: "OPENING",
    4: "OPENED",
    5: "ERROR"
  },
  CONVEYOR_STATUS: {
    0: "NONE",
    1: "STOPPED",
    2: "RUNNING",
    3: "ERROR"
  }
};

let popupTimer = null;
let currentConnection = {
  status: "Disconnected",
  ipAddress: "192.168.2.1",
  port: DEFAULT_PORT,
  errorMessage: ""
};
let nextCmdSeq = 1;
let nextHeartbeatValue = 1;
let heartbeatTimerId = null;
let heartbeatRequestInProgress = false;
let heartbeatErrorShown = false;
let heartbeatPlcTimerId = null;
let heartbeatPlcRequestInProgress = false;
let heartbeatPlcErrorShown = false;

const currentReadResults = {
  PLC_STATUS: null,
  DOOR_STATUS: null,
  CONVEYOR_STATUS: null,
  ERROR_CODE: null,
  HEARTBEAT_PLC: null
};

const elements = {};

window.addEventListener("load", initializePage);

function initializePage() {
  cacheElements();
  bindEvents();
  renderReadResults();
  fetchConnectionStatus();
  refreshLogs();

  setInterval(fetchConnectionStatus, 5000);
  setInterval(refreshLogs, 2000);
}

function cacheElements() {
  elements.ipAddress = document.getElementById("ipAddress");
  elements.port = document.getElementById("port");
  elements.connectButton = document.getElementById("connectButton");
  elements.disconnectButton = document.getElementById("disconnectButton");
  elements.connectionStatus = document.getElementById("connectionStatus");
  elements.statusMessage = document.getElementById("statusMessage");
  elements.cmdCode = document.getElementById("cmdCode");
  elements.writeAllButton = document.getElementById("writeAllButton");
  elements.readAllButton = document.getElementById("readAllButton");
  elements.readResults = document.getElementById("readResults");
  elements.logList = document.getElementById("logList");
  elements.clearLogButton = document.getElementById("clearLogButton");
  elements.popupBox = document.getElementById("popupBox");
}

function bindEvents() {
  elements.connectButton.addEventListener("click", connectToSlave);
  elements.disconnectButton.addEventListener("click", disconnectFromSlave);
  elements.writeAllButton.addEventListener("click", writeCommandRegisters);
  elements.readAllButton.addEventListener("click", () => readStatusRegisters("all"));
  elements.clearLogButton.addEventListener("click", clearLogs);
}

async function connectToSlave() {
  const ipAddress = elements.ipAddress.value.trim();
  const portValue = elements.port.value.trim();

  if (!validateIp(ipAddress)) {
    showPopup("IP 주소 형식이 올바르지 않습니다.", "error");
    return;
  }

  if (!validatePort(portValue)) {
    showPopup("Port 값은 1~65535 범위의 정수여야 합니다.", "error");
    return;
  }

  try {
    const data = await requestJson("/api/connect", {
      method: "POST",
      body: JSON.stringify({
        ipAddress,
        port: Number(portValue)
      })
    });

    resetCmdSeq();
    resetHeartbeatState();
    resetHeartbeatPlcState();
    setConnectionStatus(data.connection, { syncInputs: true });
    await refreshLogs();
    showPopup(data.message, "success");
  } catch (error) {
    applyErrorState(error);
  }
}

async function disconnectFromSlave() {
  try {
    const data = await requestJson("/api/disconnect", {
      method: "POST"
    });

    setConnectionStatus(data.connection, { syncInputs: true });
    resetCmdSeq();
    resetHeartbeatState();
    resetHeartbeatPlcState();
    await refreshLogs();
    showPopup(data.message, "success");
  } catch (error) {
    applyErrorState(error);
  }
}

async function writeCommandRegisters() {
  if (!ensureConnectedFromUi()) {
    return;
  }

  try {
    const payload = buildWriteCommandPayload();

    const data = await requestJson("/api/write", {
      method: "POST",
      body: JSON.stringify(payload)
    });

    setConnectionStatus(data.connection);
    increaseCmdSeq();
    await refreshLogs();
    showPopup(data.message, "success");
  } catch (error) {
    applyErrorState(error);
  }
}

async function readStatusRegisters(mode, registerName) {
  if (!ensureConnectedFromUi()) {
    return;
  }

  try {
    const query = new URLSearchParams();
    query.set("mode", mode);

    if (mode === "single" && registerName) {
      query.set("registerName", registerName);
    }

    const data = await requestJson(`/api/read?${query.toString()}`, {
      method: "GET"
    });

    mergeReadResults(data.data);
    renderReadResults();
    setConnectionStatus(data.connection);
    await refreshLogs();
    showPopup(data.message, "success");
  } catch (error) {
    applyErrorState(error);
  }
}

function decodeRegisterValue(registerName, rawValue) {
  const map = VALUE_MAPS[registerName];

  if (!map) {
    return "";
  }

  if (Object.prototype.hasOwnProperty.call(map, rawValue)) {
    return map[rawValue];
  }

  return "UNKNOWN";
}

function appendLog(entry) {
  const row = document.createElement("div");
  row.className = `log-row ${String(entry.type || "").toLowerCase()}`;

  const time = document.createElement("span");
  time.textContent = entry.time || "-";

  const type = document.createElement("span");
  type.textContent = entry.type || "-";

  const message = document.createElement("span");
  message.textContent = entry.message || "";

  row.appendChild(time);
  row.appendChild(type);
  row.appendChild(message);
  elements.logList.appendChild(row);
}

function validateIp(ipAddress) {
  const ipRegex =
    /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/;
  return ipRegex.test(ipAddress);
}

function validatePort(portValue) {
  const port = Number(portValue);
  return portValue !== "" && Number.isInteger(port) && port >= 1 && port <= 65535;
}

function validateRegisterValue(value) {
  const parsed = Number(value);
  return value !== "" && Number.isInteger(parsed) && parsed >= 0 && parsed <= 65535;
}

function setConnectionStatus(connection, options = {}) {
  const syncInputs = Boolean(options.syncInputs);

  currentConnection = connection || currentConnection;

  elements.connectionStatus.textContent = currentConnection.status;
  elements.connectionStatus.classList.remove("status-connected", "status-disconnected", "status-error");

  if (currentConnection.status === "Connected") {
    elements.connectionStatus.classList.add("status-connected");
    elements.statusMessage.textContent = `${currentConnection.ipAddress}:${currentConnection.port} 에 연결되었습니다.`;
    startHeartbeatLoop();
    startHeartbeatPlcLoop();
  } else if (currentConnection.status === "Error") {
    elements.connectionStatus.classList.add("status-error");
    elements.statusMessage.textContent = currentConnection.errorMessage || "통신 오류가 발생했습니다.";
    stopHeartbeatLoop();
    stopHeartbeatPlcLoop();
  } else {
    elements.connectionStatus.classList.add("status-disconnected");
    elements.statusMessage.textContent = "연결 전입니다.";
    stopHeartbeatLoop();
    stopHeartbeatPlcLoop();
  }

  if (syncInputs && currentConnection.ipAddress) {
    elements.ipAddress.value = currentConnection.ipAddress;
  }

  if (syncInputs && currentConnection.port) {
    elements.port.value = currentConnection.port;
  }
}

async function fetchConnectionStatus() {
  try {
    const data = await requestJson("/api/status", { method: "GET" });
    setConnectionStatus(data.connection);
  } catch (error) {
    console.error(error);
  }
}

async function refreshLogs() {
  try {
    const data = await requestJson("/api/logs", { method: "GET" });
    renderLogs(data.logs || []);
  } catch (error) {
    console.error(error);
  }
}

function renderLogs(logs) {
  elements.logList.innerHTML = "";

  if (!logs.length) {
    const empty = document.createElement("div");
    empty.className = "log-empty";
    empty.textContent = "아직 로그가 없습니다.";
    elements.logList.appendChild(empty);
    return;
  }

  logs
    .slice()
    .reverse()
    .forEach((entry) => {
      appendLog(entry);
    });
}

function renderReadResults() {
  elements.readResults.innerHTML = "";

  Object.keys(READ_REGISTERS).forEach((registerName) => {
    const data = currentReadResults[registerName];
    const definition = READ_REGISTERS[registerName];
    const card = document.createElement("div");
    card.className = "result-card";

    const top = document.createElement("div");
    top.className = "result-top";

    const title = document.createElement("span");
    title.className = "result-title";
    title.textContent = registerName;

    const address = document.createElement("span");
    address.className = "result-address";
    address.textContent = definition.address;

    top.appendChild(title);
    top.appendChild(address);

    const value = document.createElement("div");
    value.className = "result-value";

    if (!data) {
      value.textContent = "미조회";
    } else if (data.name) {
      value.textContent = `${data.rawValue} (${data.name})`;
    } else {
      const fallbackName = decodeRegisterValue(registerName, data.rawValue);
      value.textContent = fallbackName
        ? `${data.rawValue} (${fallbackName})`
        : `${data.rawValue}`;
    }

    const description = document.createElement("div");
    description.className = "result-description";
    description.textContent = definition.description;

    card.appendChild(top);
    card.appendChild(value);
    card.appendChild(description);
    elements.readResults.appendChild(card);
  });
}

function mergeReadResults(data) {
  Object.keys(data || {}).forEach((key) => {
    currentReadResults[key] = data[key];
  });
}

async function clearLogs() {
  try {
    await requestJson("/api/logs", {
      method: "DELETE"
    });

    await refreshLogs();
    showPopup("로그를 비웠습니다.", "success");
  } catch (error) {
    applyErrorState(error);
  }
}

function ensureConnectedFromUi() {
  if (currentConnection.status !== "Connected") {
    showPopup("먼저 Slave에 연결하세요.", "error");
    return false;
  }

  return true;
}

function buildWriteCommandPayload() {
  const cmdCode = elements.cmdCode.value;
  const cmdSeq = nextCmdSeq;

  if (!validateRegisterValue(String(cmdCode)) || !validateRegisterValue(String(cmdSeq))) {
    throw new Error("숫자 입력값이 허용 범위를 벗어났습니다.");
  }

  return {
    mode: "block",
    values: {
      cmdCode: Number(cmdCode),
      cmdSeq: Number(cmdSeq)
    }
  };
}

// CMD_SEQ is kept internally now because the UI only exposes CMD_CODE.
// We send the current sequence value with Write Command and move to the
// next value only after a successful command write.
function increaseCmdSeq() {
  if (!Number.isInteger(nextCmdSeq) || nextCmdSeq < 0 || nextCmdSeq > 65535) {
    nextCmdSeq = 1;
    return;
  }

  if (nextCmdSeq >= 65535) {
    nextCmdSeq = 1;
    return;
  }

  nextCmdSeq += 1;
}

function resetCmdSeq() {
  nextCmdSeq = 1;
}

// HEARTBEAT_ACS is written in the background every second while connected.
// The PLC can watch this value to confirm that the ACS side is still alive.
function startHeartbeatLoop() {
  if (heartbeatTimerId || currentConnection.status !== "Connected") {
    return;
  }

  heartbeatTimerId = setInterval(() => {
    sendHeartbeatWrite();
  }, HEARTBEAT_INTERVAL_MS);
}

function stopHeartbeatLoop() {
  if (heartbeatTimerId) {
    clearInterval(heartbeatTimerId);
    heartbeatTimerId = null;
  }
}

async function sendHeartbeatWrite() {
  if (heartbeatRequestInProgress || currentConnection.status !== "Connected") {
    return;
  }

  const heartbeatValue = nextHeartbeatValue;
  heartbeatRequestInProgress = true;

  try {
    const data = await requestJson("/api/write", {
      method: "POST",
      body: JSON.stringify({
        mode: "single",
        registerName: "HEARTBEAT_ACS",
        value: heartbeatValue
      })
    });

    nextHeartbeatValue = getNextHeartbeatValue(heartbeatValue);
    heartbeatErrorShown = false;
    setConnectionStatus(data.connection);
  } catch (error) {
    if (error.responseData && error.responseData.connection) {
      setConnectionStatus(error.responseData.connection);
    } else {
      setConnectionStatus({
        ...currentConnection,
        status: "Error",
        errorMessage: error.message || "HEARTBEAT_ACS 전송에 실패했습니다."
      });
    }

    if (!heartbeatErrorShown) {
      showPopup(error.message || "HEARTBEAT_ACS 전송에 실패했습니다.", "error");
      heartbeatErrorShown = true;
    }
  } finally {
    heartbeatRequestInProgress = false;
  }
}

function getNextHeartbeatValue(currentValue) {
  if (!Number.isInteger(currentValue) || currentValue < 0 || currentValue > 65535) {
    return 1;
  }

  if (currentValue >= 65535) {
    return 0;
  }

  return currentValue + 1;
}

function resetHeartbeatState() {
  stopHeartbeatLoop();
  nextHeartbeatValue = 1;
  heartbeatRequestInProgress = false;
  heartbeatErrorShown = false;
}

// HEARTBEAT_PLC is read in the background every second while connected.
// This value is shown in the Read Panel so the operator can confirm the
// PLC heartbeat is changing without pressing Read manually.
function startHeartbeatPlcLoop() {
  if (heartbeatPlcTimerId || currentConnection.status !== "Connected") {
    return;
  }

  heartbeatPlcTimerId = setInterval(() => {
    readHeartbeatPlcInBackground();
  }, HEARTBEAT_INTERVAL_MS);
}

function stopHeartbeatPlcLoop() {
  if (heartbeatPlcTimerId) {
    clearInterval(heartbeatPlcTimerId);
    heartbeatPlcTimerId = null;
  }
}

async function readHeartbeatPlcInBackground() {
  if (heartbeatPlcRequestInProgress || currentConnection.status !== "Connected") {
    return;
  }

  heartbeatPlcRequestInProgress = true;

  try {
    const data = await requestJson("/api/read?mode=single&registerName=HEARTBEAT_PLC", {
      method: "GET"
    });

    mergeReadResults(data.data);
    renderReadResults();
    heartbeatPlcErrorShown = false;
    setConnectionStatus(data.connection);
  } catch (error) {
    if (error.responseData && error.responseData.connection) {
      setConnectionStatus(error.responseData.connection);
    } else {
      setConnectionStatus({
        ...currentConnection,
        status: "Error",
        errorMessage: error.message || "HEARTBEAT_PLC 읽기에 실패했습니다."
      });
    }

    if (!heartbeatPlcErrorShown) {
      showPopup(error.message || "HEARTBEAT_PLC 읽기에 실패했습니다.", "error");
      heartbeatPlcErrorShown = true;
    }
  } finally {
    heartbeatPlcRequestInProgress = false;
  }
}

function resetHeartbeatPlcState() {
  stopHeartbeatPlcLoop();
  heartbeatPlcRequestInProgress = false;
  heartbeatPlcErrorShown = false;
  currentReadResults.HEARTBEAT_PLC = null;
  renderReadResults();
}

function showPopup(message, type) {
  clearTimeout(popupTimer);

  elements.popupBox.textContent = message;
  elements.popupBox.className = `popup-box show ${type}`;

  popupTimer = setTimeout(() => {
    elements.popupBox.className = "popup-box";
  }, 3500);
}

function applyErrorState(error) {
  const responseData = error.responseData || {};

  if (responseData.connection) {
    setConnectionStatus(responseData.connection);
  }

  showPopup(error.message || "요청 처리 중 오류가 발생했습니다.", "error");
  refreshLogs();
}

async function requestJson(url, options = {}) {
  let response;

  try {
    response = await fetch(url, {
      headers: {
        "Content-Type": "application/json"
      },
      ...options
    });
  } catch (error) {
    throw new Error("서버에 연결할 수 없습니다. start 실행 여부를 확인하세요.");
  }

  let data;

  try {
    data = await response.json();
  } catch (error) {
    throw new Error("서버 응답을 읽을 수 없습니다.");
  }

  if (!response.ok || !data.success) {
    const requestError = new Error(data.message || "서버 요청에 실패했습니다.");
    requestError.responseData = data;
    throw requestError;
  }

  return data;
}
