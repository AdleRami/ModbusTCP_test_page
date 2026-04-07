const WRITE_REGISTERS = {
  CMD_CODE: { address: "0x00" },
  CMD_SEQ: { address: "0x01" },
  HEARTBEAT_ACS: { address: "0x02" }
};

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
  port: 502,
  errorMessage: ""
};

const currentReadResults = {
  PLC_STATUS: null,
  DOOR_STATUS: null,
  CONVEYOR_STATUS: null,
  ERROR_CODE: null
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
  elements.cmdSeq = document.getElementById("cmdSeq");
  elements.heartbeatAcs = document.getElementById("heartbeatAcs");
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
  elements.writeAllButton.addEventListener("click", () => writeCommandRegisters("block"));
  elements.readAllButton.addEventListener("click", () => readStatusRegisters("all"));
  elements.clearLogButton.addEventListener("click", clearLogs);

  document.querySelectorAll("[data-write-single]").forEach((button) => {
    button.addEventListener("click", () => {
      writeCommandRegisters("single", button.dataset.writeSingle);
    });
  });

  document.querySelectorAll("[data-read-single]").forEach((button) => {
    button.addEventListener("click", () => {
      readStatusRegisters("single", button.dataset.readSingle);
    });
  });
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

    setConnectionStatus(data.connection, { syncInputs: true });
    resetCmdSeq();
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
    await refreshLogs();
    showPopup(data.message, "success");
  } catch (error) {
    applyErrorState(error);
  }
}

async function writeCommandRegisters(mode, registerName) {
  if (!ensureConnectedFromUi()) {
    return;
  }

  try {
    const payload = buildWritePayload(mode, registerName);

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
    increaseCmdSeq();
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
  } else if (currentConnection.status === "Error") {
    elements.connectionStatus.classList.add("status-error");
    elements.statusMessage.textContent = currentConnection.errorMessage || "통신 오류가 발생했습니다.";
  } else {
    elements.connectionStatus.classList.add("status-disconnected");
    elements.statusMessage.textContent = "연결 전입니다.";
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

function buildWritePayload(mode, registerName) {
  if (mode === "single") {
    const value = getSingleWriteValue(registerName);

    if (!validateRegisterValue(String(value))) {
      throw new Error("숫자 입력값이 허용 범위를 벗어났습니다.");
    }

    return {
      mode: "single",
      registerName,
      value: Number(value)
    };
  }

  const cmdCode = elements.cmdCode.value;
  const cmdSeq = elements.cmdSeq.value.trim();
  const heartbeatAcs = elements.heartbeatAcs.value.trim();

  if (!validateRegisterValue(cmdCode) || !validateRegisterValue(cmdSeq) || !validateRegisterValue(heartbeatAcs)) {
    throw new Error("숫자 입력값이 허용 범위를 벗어났습니다.");
  }

  return {
    mode: "block",
    values: {
      cmdCode: Number(cmdCode),
      cmdSeq: Number(cmdSeq),
      heartbeatAcs: Number(heartbeatAcs)
    }
  };
}

function getSingleWriteValue(registerName) {
  if (registerName === "CMD_CODE") {
    return elements.cmdCode.value;
  }

  if (registerName === "CMD_SEQ") {
    return elements.cmdSeq.value.trim();
  }

  if (registerName === "HEARTBEAT_ACS") {
    return elements.heartbeatAcs.value.trim();
  }

  throw new Error("쓰기 가능한 레지스터 이름이 아닙니다.");
}

// CMD_SEQ is used as a simple running sequence number.
// Increase it after every successful Modbus read/write transaction so the
// operator can compare it with the Modbus Transaction ID.
function increaseCmdSeq() {
  const currentValue = Number(elements.cmdSeq.value.trim());

  if (!Number.isInteger(currentValue) || currentValue < 0 || currentValue > 65535) {
    elements.cmdSeq.value = 1;
    return;
  }

  if (currentValue >= 65535) {
    elements.cmdSeq.value = 1;
    return;
  }

  elements.cmdSeq.value = currentValue + 1;
}

function resetCmdSeq() {
  elements.cmdSeq.value = 1;
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
