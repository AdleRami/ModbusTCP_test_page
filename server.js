const path = require("path");
const express = require("express");
const ModbusRTU = require("modbus-serial");

const app = express();
const WEB_PORT = 3000;
const DEFAULT_SLAVE_IP = "192.168.2.1";
const DEFAULT_SLAVE_PORT = 502;
const MODBUS_TIMEOUT_MS = 3000;

// ------------------------------------------------------------------
// server.js quick guide
// ------------------------------------------------------------------
// 1) If you want to change the default target PLC address, edit
//    DEFAULT_SLAVE_IP and DEFAULT_SLAVE_PORT below.
// 2) If your PLC uses another Unit ID, edit MODBUS_UNIT_ID.
// 3) If your register map changes, edit REGISTER_DEFINITIONS.
// 4) The browser calls this file through /api/connect, /api/write,
//    /api/read and related endpoints.
// 5) All actual Modbus TCP communication happens only in this file.
// ------------------------------------------------------------------

// Many Modbus TCP simulators and PLCs use Unit ID 1 by default.
// If your equipment requires another Unit ID, change only this value.
const MODBUS_UNIT_ID = 1;

// The web page shows addresses such as 0x00 or 0x10.
// The Modbus library itself expects zero-based decimal offsets.
// Example:
//   UI address 0x00 -> library address 0
//   UI address 0x10 -> library address 16
//
// This object is the most important place to edit when the register map
// changes later. The UI labels and decoded text are based on this data.
const REGISTER_DEFINITIONS = {
  CMD_CODE: {
    address: 0x00,
    description: "Command code to be sent to the PLC",
    valueMap: {
      0: "NONE",
      1: "DOOR_OPEN",
      2: "DOOR_CLOSE",
      3: "DOOR_STOP",
      4: "CONVEYOR_START",
      5: "CONVEYOR_STOP",
      6: "RESET"
    }
  },
  CMD_SEQ: {
    address: 0x01,
    description: "Command Sequence Number",
    valueMap: null
  },
  HEARTBEAT_ACS: {
    address: 0x02,
    description: "ACS heartbeat counter",
    valueMap: null
  },
  PLC_STATUS: {
    address: 0x10,
    description: "PLC Status",
    valueMap: {
      0: "IDLE",
      1: "BUSY",
      2: "DONE",
      3: "ERROR",
      4: "MANUAL",
      5: "EMERGENCY_STOP"
    }
  },
  DOOR_STATUS: {
    address: 0x11,
    description: "Door Status",
    valueMap: {
      0: "NONE",
      1: "CLOSED",
      2: "CLOSING",
      3: "OPENING",
      4: "OPENED",
      5: "ERROR"
    }
  },
  CONVEYOR_STATUS: {
    address: 0x12,
    description: "Conveyor Status",
    valueMap: {
      0: "NONE",
      1: "STOPPED",
      2: "RUNNING",
      3: "ERROR"
    }
  },
  ERROR_CODE: {
    address: 0x13,
    description: "Error code",
    valueMap: null
  }
};

const WRITE_REGISTER_ORDER = ["CMD_CODE", "CMD_SEQ", "HEARTBEAT_ACS"];
const READ_REGISTER_ORDER = ["PLC_STATUS", "DOOR_STATUS", "CONVEYOR_STATUS", "ERROR_CODE"];
const MAX_LOG_ENTRIES = 300;
const MIN_MBAP_HEADER_LENGTH = 6;

// One Modbus client instance is kept on the server and reused.
// The web page acts like a simple control panel for this client.
let modbusClient = createModbusClient();
let logEntries = [];
let packetTraceState = createPacketTraceState();

// Connection state is separated from the actual socket object so that
// the browser can always ask for a simple JSON status through /api/status.
const connectionState = {
  status: "Disconnected",
  ipAddress: DEFAULT_SLAVE_IP,
  port: DEFAULT_SLAVE_PORT,
  errorMessage: ""
};

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Connect API
// The browser sends IP/Port here, and this route delegates the real
// connection work to connectToSlave().
app.post("/api/connect", async (req, res) => {
  try {
    const ipAddress = String(req.body.ipAddress || DEFAULT_SLAVE_IP).trim();
    const port = parsePort(req.body.port ?? DEFAULT_SLAVE_PORT);

    await connectToSlave(ipAddress, port);

    res.json({
      success: true,
      message: "Slave에 연결되었습니다.",
      connection: getConnectionStatus()
    });
  } catch (error) {
    sendApiError(res, error);
  }
});

// Disconnect API
// Safe to call multiple times. If already disconnected, it simply keeps
// the state as Disconnected.
app.post("/api/disconnect", async (req, res) => {
  try {
    await disconnectFromSlave();

    res.json({
      success: true,
      message: "Slave 연결을 해제했습니다.",
      connection: getConnectionStatus()
    });
  } catch (error) {
    sendApiError(res, error);
  }
});

// Write API
// mode=single : write one holding register
// mode=block  : write 0x00~0x02 in one request
app.post("/api/write", async (req, res) => {
  try {
    const mode = String(req.body.mode || "block").trim();
    const wrote = await writeCommandRegisters(mode, req.body);

    res.json({
      success: true,
      message: mode === "single" ? "선택한 레지스터에 값을 썼습니다." : "명령 블록 0x00~0x02를 전송했습니다.",
      wrote,
      connection: getConnectionStatus()
    });
  } catch (error) {
    sendApiError(res, error);
  }
});

// Read API
// mode=single : read one holding register
// mode=all    : read 0x10~0x13 in one request
app.get("/api/read", async (req, res) => {
  try {
    const mode = String(req.query.mode || "all").trim();
    const registerName = req.query.registerName ? String(req.query.registerName).trim() : "";
    const data = await readStatusRegisters(mode, registerName);

    res.json({
      success: true,
      message: mode === "single" ? "선택한 레지스터를 읽었습니다." : "상태 블록 0x10~0x13을 읽었습니다.",
      data,
      connection: getConnectionStatus()
    });
  } catch (error) {
    sendApiError(res, error);
  }
});

// The browser polls this endpoint to refresh the connection badge.
app.get("/api/status", (req, res) => {
  res.json({
    success: true,
    connection: getConnectionStatus()
  });
});

// The browser fetches the server-side log list from here.
app.get("/api/logs", (req, res) => {
  res.json({
    success: true,
    logs: logEntries
  });
});

// Clear stored logs in memory.
app.delete("/api/logs", (req, res) => {
  logEntries = [];

  res.json({
    success: true,
    message: "로그를 비웠습니다."
  });
});

app.listen(WEB_PORT, () => {
  console.log(`Modbus TCP test page is running on http://localhost:${WEB_PORT}`);
  console.log(`Default slave target: ${DEFAULT_SLAVE_IP}:${DEFAULT_SLAVE_PORT}`);
});

// Create a fresh Modbus client instance.
// This is wrapped in a function because we recreate the client after
// disconnects or failed connections to keep the state simple.
function createModbusClient() {
  const client = new ModbusRTU();
  client.setTimeout(MODBUS_TIMEOUT_MS);
  return client;
}

function createPacketTraceState() {
  return {
    socket: null,
    originalWrite: null,
    rxListener: null,
    closeListener: null,
    txBuffer: Buffer.alloc(0),
    rxBuffer: Buffer.alloc(0)
  };
}

// For this test tool, raw byte logging is done at the TCP socket level.
// That means TX/RX logs show the real Modbus TCP frame bytes, not the
// decoded register text.
function attachPacketTraceHandlers() {
  const tcpPort = modbusClient && modbusClient._port;
  const socket = tcpPort && tcpPort._client;

  if (!socket) {
    return;
  }

  if (packetTraceState.socket === socket) {
    return;
  }

  detachPacketTraceHandlers();

  packetTraceState.socket = socket;
  packetTraceState.txBuffer = Buffer.alloc(0);
  packetTraceState.rxBuffer = Buffer.alloc(0);
  packetTraceState.originalWrite = socket.write;

  socket.write = function tracedSocketWrite(...args) {
    const chunk = args[0];
    const encoding = typeof args[1] === "string" ? args[1] : undefined;

    try {
      tracePacketChunk("TX", normalizeSocketChunk(chunk, encoding));
    } catch (error) {
      console.log("Failed to trace TX packet bytes:", error.message);
    }

    return packetTraceState.originalWrite.apply(this, args);
  };

  packetTraceState.rxListener = (data) => {
    try {
      tracePacketChunk("RX", data);
    } catch (error) {
      console.log("Failed to trace RX packet bytes:", error.message);
    }
  };

  packetTraceState.closeListener = () => {
    detachPacketTraceHandlers();
  };

  socket.on("data", packetTraceState.rxListener);
  socket.on("close", packetTraceState.closeListener);
}

function detachPacketTraceHandlers() {
  if (!packetTraceState.socket) {
    packetTraceState = createPacketTraceState();
    return;
  }

  try {
    if (packetTraceState.originalWrite) {
      packetTraceState.socket.write = packetTraceState.originalWrite;
    }

    if (packetTraceState.rxListener) {
      packetTraceState.socket.off("data", packetTraceState.rxListener);
    }

    if (packetTraceState.closeListener) {
      packetTraceState.socket.off("close", packetTraceState.closeListener);
    }
  } catch (error) {
    console.log("Failed to detach packet trace handlers cleanly:", error.message);
  }

  packetTraceState = createPacketTraceState();
}

function normalizeSocketChunk(chunk, encoding) {
  if (Buffer.isBuffer(chunk)) {
    return Buffer.from(chunk);
  }

  if (typeof chunk === "string") {
    return Buffer.from(chunk, encoding || "utf8");
  }

  return Buffer.from(chunk);
}

function tracePacketChunk(direction, buffer) {
  if (!buffer || !buffer.length) {
    return;
  }

  const bufferKey = direction === "TX" ? "txBuffer" : "rxBuffer";
  packetTraceState[bufferKey] = Buffer.concat([packetTraceState[bufferKey], buffer]);

  const extracted = extractModbusTcpFrames(packetTraceState[bufferKey]);
  packetTraceState[bufferKey] = extracted.remaining;

  extracted.frames.forEach((frame) => {
    appendLog(direction, buildByteLogMessage(frame));
  });
}

function extractModbusTcpFrames(buffer) {
  const frames = [];
  let offset = 0;

  while (buffer.length - offset >= MIN_MBAP_HEADER_LENGTH) {
    const lengthField = buffer.readUInt16BE(offset + 4);

    if (lengthField <= 0) {
      break;
    }

    const frameLength = MIN_MBAP_HEADER_LENGTH + lengthField;

    if (buffer.length - offset < frameLength) {
      break;
    }

    frames.push(Buffer.from(buffer.subarray(offset, offset + frameLength)));
    offset += frameLength;
  }

  return {
    frames,
    remaining: Buffer.from(buffer.subarray(offset))
  };
}

function buildByteLogMessage(frame) {
  return `Bytes (${frame.length}): ${formatPacketBytes(frame)}`;
}

function formatPacketBytes(buffer) {
  return Array.from(buffer)
    .map((byte) => byte.toString(16).toUpperCase().padStart(2, "0"))
    .join(" ");
}

// Connect to the Modbus TCP slave.
// Why this function exists:
// - Keeps route logic short
// - Centralizes validation, open/close handling, and error translation
// - Makes it easier to adjust connection behavior later
async function connectToSlave(ipAddress, port) {
  validateIp(ipAddress);
  validatePort(port);

  connectionState.ipAddress = ipAddress;
  connectionState.port = port;

  // If the user connects again with another IP/Port, we close the
  // previous socket first and start from a clean client instance.
  if (modbusClient.isOpen) {
    await safeCloseClient();
    modbusClient = createModbusClient();
  }

  try {
    // connectTCP() expects host + port, and register addresses used later
    // are still zero-based offsets handled by the library.
    await modbusClient.connectTCP(ipAddress, { port });
    modbusClient.setID(MODBUS_UNIT_ID);
    attachPacketTraceHandlers();
    markConnected();
    appendLog("INFO", `Connected to ${ipAddress}:${port}`);
  } catch (error) {
    const message = explainModbusError(error, "connect");
    markError(message);
    appendLog("ERROR", message);
    await safeCloseClient();
    modbusClient = createModbusClient();

    const wrappedError = new Error(message);
    wrappedError.statusCode = 500;
    wrappedError.userMessage = message;
    throw wrappedError;
  }
}

// Disconnect from the slave.
// This function is intentionally simple so that beginners can easily see
// what happens during disconnect: close socket -> recreate client -> reset state.
async function disconnectFromSlave() {
  if (!modbusClient.isOpen) {
    markDisconnected();
    return;
  }

  await safeCloseClient();
  modbusClient = createModbusClient();
  markDisconnected();
  appendLog("INFO", "Disconnected from slave");
}

// Write holding registers for the ACS command area.
// Supported modes:
// - single: write one register such as CMD_SEQ
// - block : write 0x00, 0x01, 0x02 continuously in one Modbus request
//
// If you later add another write register, update:
// - REGISTER_DEFINITIONS
// - WRITE_REGISTER_ORDER
// - public/index.html / public/app.js
async function writeCommandRegisters(mode, body) {
  ensureConnected();

  try {
    let wrote = [];

    if (mode === "single") {
      const registerName = String(body.registerName || "").trim();
      ensureWriteRegister(registerName);

      const value = parseRegisterValue(body.value, registerName);
      validateWriteValue(registerName, value);

      const address = REGISTER_DEFINITIONS[registerName].address;

      // writeRegister(address, value)
      // address here is already the zero-based holding register offset.
      // Example: CMD_SEQ at UI address 0x01 becomes library address 1.
      await modbusClient.writeRegister(address, value);

      const item = buildRegisterResult(registerName, value);
      wrote.push(item);
    } else if (mode === "block") {
      const cmdCode = parseRegisterValue(body.values && body.values.cmdCode, "CMD_CODE");
      const cmdSeq = parseRegisterValue(body.values && body.values.cmdSeq, "CMD_SEQ");
      const heartbeatAcs = parseRegisterValue(body.values && body.values.heartbeatAcs, "HEARTBEAT_ACS");

      validateWriteValue("CMD_CODE", cmdCode);
      validateWriteValue("CMD_SEQ", cmdSeq);
      validateWriteValue("HEARTBEAT_ACS", heartbeatAcs);

      const values = [cmdCode, cmdSeq, heartbeatAcs];
      const startAddress = REGISTER_DEFINITIONS.CMD_CODE.address;

      // writeRegisters(startAddress, values)
      // This sends 0x00~0x02 as one continuous block write.
      await modbusClient.writeRegisters(startAddress, values);

      wrote = WRITE_REGISTER_ORDER.map((registerName, index) => buildRegisterResult(registerName, values[index]));
    } else {
      throw createValidationError("write mode 값이 올바르지 않습니다.");
    }

    markConnected();
    return wrote;
  } catch (error) {
    const message = error.userMessage || explainModbusError(error, "write");
    markError(message);
    appendLog("ERROR", message);

    const wrappedError = new Error(message);
    wrappedError.statusCode = error.statusCode || 500;
    wrappedError.userMessage = message;
    throw wrappedError;
  }
}

// Read holding registers for the PLC status area.
// Supported modes:
// - single: read one status register
// - all   : read 0x10~0x13 in one request
//
// If the PLC register map changes later, this is the main place to check.
async function readStatusRegisters(mode, registerName) {
  ensureConnected();

  try {
    let results = {};

    if (mode === "single") {
      ensureReadRegister(registerName);

      const address = REGISTER_DEFINITIONS[registerName].address;

      // readHoldingRegisters(address, length)
      // Example: PLC_STATUS at UI address 0x10 becomes library address 16.
      const response = await modbusClient.readHoldingRegisters(address, 1);
      const rawValue = response.data[0];
      const item = buildRegisterResult(registerName, rawValue);

      results[registerName] = item;
    } else if (mode === "all") {
      const startAddress = REGISTER_DEFINITIONS.PLC_STATUS.address;

      // This reads four continuous holding registers:
      // 0x10, 0x11, 0x12, 0x13
      const response = await modbusClient.readHoldingRegisters(startAddress, READ_REGISTER_ORDER.length);

      READ_REGISTER_ORDER.forEach((name, index) => {
        const rawValue = response.data[index];
        const item = buildRegisterResult(name, rawValue);
        results[name] = item;
      });
    } else {
      throw createValidationError("read mode 값이 올바르지 않습니다.");
    }

    markConnected();
    return results;
  } catch (error) {
    const message = error.userMessage || explainModbusError(error, "read");
    markError(message);
    appendLog("ERROR", message);

    const wrappedError = new Error(message);
    wrappedError.statusCode = error.statusCode || 500;
    wrappedError.userMessage = message;
    throw wrappedError;
  }
}

// Convert a raw numeric register value into a readable name.
// Example:
//   PLC_STATUS raw 1 -> BUSY
//   DOOR_STATUS raw 4 -> OPENED
//
// For registers without a value table, return an empty string so that the
// UI can still display the raw numeric value.
function decodeRegisterValue(registerName, rawValue) {
  const definition = REGISTER_DEFINITIONS[registerName];
  if (!definition || !definition.valueMap) {
    return "";
  }

  if (Object.prototype.hasOwnProperty.call(definition.valueMap, rawValue)) {
    return definition.valueMap[rawValue];
  }

  return "UNKNOWN";
}

// Save one log entry in server memory.
// The browser periodically reads these logs through /api/logs.
// Keeping logs on the server side makes it easier to see TX/RX records
// even when the UI refreshes its screen state.
function appendLog(type, message, details = {}) {
  const entry = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    time: new Date().toLocaleTimeString("en-GB", { hour12: false }),
    type,
    message,
    address: details.address || "",
    rawValue: typeof details.rawValue === "number" ? details.rawValue : null,
    name: details.name || "",
    registerName: details.registerName || ""
  };

  logEntries.push(entry);

  if (logEntries.length > MAX_LOG_ENTRIES) {
    logEntries = logEntries.slice(logEntries.length - MAX_LOG_ENTRIES);
  }

  console.log(`[${entry.time}] ${type} - ${message}`);
  return entry;
}

// Basic IPv4 validation used before attempting a TCP connection.
function validateIp(ipAddress) {
  const ipRegex =
    /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/;

  if (!ipRegex.test(ipAddress)) {
    throw createValidationError("IP 주소 형식이 올바르지 않습니다.");
  }
}

// Port validation kept separate because both the API route and connect
// logic depend on the same rule.
function validatePort(port) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw createValidationError("Port 값은 1~65535 범위의 정수여야 합니다.");
  }
}

// Common guard used before read/write.
// This gives the user a clean message instead of a low-level socket error.
function ensureConnected() {
  if (!modbusClient.isOpen) {
    throw createValidationError("먼저 Slave에 연결하세요.");
  }
}

// Limit single-write requests to the ACS command area only.
function ensureWriteRegister(registerName) {
  if (!WRITE_REGISTER_ORDER.includes(registerName)) {
    throw createValidationError("쓰기 가능한 레지스터 이름이 아닙니다.");
  }
}

// Limit single-read requests to the PLC status area only.
function ensureReadRegister(registerName) {
  if (!READ_REGISTER_ORDER.includes(registerName)) {
    throw createValidationError("읽기 가능한 레지스터 이름이 아닙니다.");
  }
}

// Validate values before sending them to the PLC.
// All values are handled as unsigned 16-bit integers: 0~65535.
// CMD_CODE is additionally restricted to the defined command table.
function validateWriteValue(registerName, value) {
  if (value < 0 || value > 65535) {
    throw createValidationError("숫자 입력값이 허용 범위를 벗어났습니다.");
  }

  if (registerName === "CMD_CODE") {
    const allowed = Object.keys(REGISTER_DEFINITIONS.CMD_CODE.valueMap).map(Number);
    if (!allowed.includes(value)) {
      throw createValidationError("CMD_CODE 값이 올바르지 않습니다.");
    }
  }
}

// Parse and validate the TCP port from request JSON.
function parsePort(value) {
  const parsed = Number(value);

  if (value === undefined || value === null || value === "" || !Number.isInteger(parsed)) {
    throw createValidationError("Port 값은 숫자로 입력해야 합니다.");
  }

  return parsed;
}

// Parse one register value from request JSON.
// This function intentionally checks "integer only" because Modbus holding
// registers here are being treated as whole-number 16-bit values.
function parseRegisterValue(value, registerName) {
  const parsed = Number(value);

  if (value === undefined || value === null || value === "" || !Number.isInteger(parsed)) {
    throw createValidationError(`${registerName} 값은 0~65535 범위의 정수여야 합니다.`);
  }

  return parsed;
}

// Build a common response object for UI display and log output.
// Using one shape everywhere keeps the frontend code simple.
function buildRegisterResult(registerName, rawValue) {
  const definition = REGISTER_DEFINITIONS[registerName];

  return {
    registerName,
    address: formatHexAddress(definition.address),
    rawValue,
    name: decodeRegisterValue(registerName, rawValue),
    description: definition.description
  };
}

// Convert decimal offsets to UI-friendly hex labels such as 0x10.
function formatHexAddress(address) {
  return `0x${address.toString(16).toUpperCase().padStart(2, "0")}`;
}

// Small helper used by multiple API responses.
function getConnectionStatus() {
  return {
    status: connectionState.status,
    ipAddress: connectionState.ipAddress,
    port: connectionState.port,
    errorMessage: connectionState.errorMessage,
    unitId: MODBUS_UNIT_ID
  };
}

// Status helpers are split out to keep route and communication code readable.
function markConnected() {
  connectionState.status = "Connected";
  connectionState.errorMessage = "";
}

function markDisconnected() {
  connectionState.status = "Disconnected";
  connectionState.errorMessage = "";
}

function markError(message) {
  connectionState.status = "Error";
  connectionState.errorMessage = message;
}

// Validation errors are returned as HTTP 400 so the browser can show a
// user-friendly popup without treating them as an internal server crash.
function createValidationError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  error.userMessage = message;
  return error;
}

// Translate low-level Modbus/library errors into messages that an operator
// can understand more easily on the web page.
function explainModbusError(error, action) {
  const sourceMessage = String((error && error.message) || "").toLowerCase();

  if (sourceMessage.includes("timed out") || sourceMessage.includes("timeout")) {
    return "Slave 응답 시간이 초과되었습니다. 네트워크 상태와 PLC 응답을 확인하세요.";
  }

  if (
    sourceMessage.includes("econnrefused") ||
    sourceMessage.includes("ehostunreach") ||
    sourceMessage.includes("enetunreach") ||
    sourceMessage.includes("cannot connect") ||
    sourceMessage.includes("connect")
  ) {
    return "Slave에 연결할 수 없습니다. IP 또는 Port를 확인하세요.";
  }

  if (sourceMessage.includes("port not open") || sourceMessage.includes("not open")) {
    return "먼저 Slave에 연결하세요.";
  }

  if (sourceMessage.includes("illegal data address")) {
    return "PLC에서 해당 레지스터 주소를 허용하지 않았습니다. Register Map을 확인하세요.";
  }

  if (sourceMessage.includes("illegal data value")) {
    return "PLC에서 해당 값 쓰기를 거부했습니다. 입력값 범위를 확인하세요.";
  }

  if (error && error.userMessage) {
    return error.userMessage;
  }

  if (action === "connect") {
    return "Slave에 연결할 수 없습니다. IP 또는 Port를 확인하세요.";
  }

  return "Modbus 통신 중 오류가 발생했습니다. 연결 상태와 입력값을 확인하세요.";
}

// Close the current client carefully.
// Some libraries need a short delay before a reconnect becomes stable.
async function safeCloseClient() {
  try {
    detachPacketTraceHandlers();

    if (modbusClient && modbusClient.isOpen) {
      modbusClient.close();
      await wait(100);
    }
  } catch (error) {
    console.log("Failed to close Modbus client cleanly:", error.message);
  }
}

// Small async delay helper used after closing the socket.
function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

// Send a consistent JSON error response back to the browser.
function sendApiError(res, error) {
  const statusCode = error.statusCode || 500;
  const message = error.userMessage || "서버에서 요청을 처리하지 못했습니다.";

  res.status(statusCode).json({
    success: false,
    message,
    connection: getConnectionStatus()
  });
}
