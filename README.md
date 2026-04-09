# Modbus TCP Test Page

Node.js + Express + Vanilla JavaScript로 만든 간단한 Modbus TCP 테스트 페이지입니다.  
Windows 노트북에서 바로 실행할 수 있도록 구성했으며, 브라우저에서 PLC 또는 Modbus TCP Slave Simulator에 연결한 뒤 Holding Register를 읽고 쓸 수 있습니다.

## 1. 프로젝트 개요

이 프로젝트는 다음 목적에 맞춰 작성되었습니다.

- Modbus TCP Master 역할을 하는 웹 페이지 제공
- Slave(PLC, 시뮬레이터)에 연결/해제 기능 제공
- Write 영역(0x00-0x02)과 Read 영역(0x10-0x13) 테스트 가능
- TX / RX 로그를 시간 포함 형태로 확인 가능
- 숫자 범위 오류, 연결 실패, 타임아웃 등을 사용자에게 알기 쉬운 메시지로 표시
- 처음 Node.js를 보는 사용자도 파일 구조를 이해하고 수정할 수 있도록 최대한 단순하게 구성

## 2. 폴더 구조 설명

```text
project-root/
  package.json
  server.js
  install.bat
  start.bat
  README.md
  /public
    index.html
    style.css
    app.js
```

### 주요 파일 설명

- `package.json`
  - 프로젝트 이름, 실행 스크립트, 필요한 패키지 목록이 들어 있습니다.
- `server.js`
  - Express 웹 서버
  - Modbus TCP 클라이언트 연결/해제
  - Read/Write API
  - 서버 내부 로그 처리
  - Register Map 정의
- `public/index.html`
  - 브라우저 화면의 전체 UI 구조입니다.
- `public/style.css`
  - 화면 레이아웃과 색상, 버튼, 로그 영역 등의 스타일입니다.
- `public/app.js`
  - 버튼 클릭 이벤트 처리
  - 입력값 검증
  - 서버 API 호출
  - 읽기 결과 표시
  - 로그 표시와 팝업 처리
- `install.bat`
  - Windows에서 `npm install`을 쉽게 실행하기 위한 배치 파일입니다.
- `start.bat`
  - Windows에서 `npm start`를 쉽게 실행하기 위한 배치 파일입니다.

## 3. 사전 준비사항

### 운영체제

- Windows 10 또는 Windows 11 기준으로 설명합니다.

### Node.js 버전

- Node.js 18 이상 권장
- `install.bat`를 실행하면 Node.js가 없을 때 자동 설치를 시도합니다.
- 자동 설치는 Windows의 `winget`을 사용합니다.

Node.js가 설치되어 있지 않다면 아래 공식 사이트에서 설치하세요.

- https://nodejs.org/

설치가 끝난 뒤 명령 프롬프트 또는 PowerShell에서 아래 명령으로 확인할 수 있습니다.

```bash
node -v
npm -v
```

## 4. 설치 방법

프로젝트 폴더에서 아래 둘 중 한 가지 방법으로 설치하면 됩니다.

### 방법 A. Windows 배치 파일 사용

1. `install.bat` 더블클릭
2. 또는 명령 프롬프트에서 실행

```bat
install.bat
```

`install.bat` 동작 순서:

1. PC에 Node.js가 설치되어 있는지 확인
2. Node.js가 없으면 `winget`으로 Node.js LTS 자동 설치 시도
3. Node.js 확인 후 `npm install` 실행

즉, Windows 환경에서는 가능하면 `install.bat`만 실행해도 되도록 구성했습니다.

### 방법 B. 직접 npm install 실행

```bash
npm install
```

## 5. 실행 방법

### 방법 A. Windows 배치 파일 사용

```bat
start.bat
```

`start.bat`는 아래를 자동 확인합니다.

1. Node.js가 없으면 `install.bat` 호출
2. `node_modules`가 없으면 `install.bat` 호출
3. 준비가 끝나면 `npm start` 실행

### 방법 B. 직접 npm start 실행

```bash
npm start
```

정상 실행되면 콘솔에 아래와 비슷한 메시지가 표시됩니다.

```text
Modbus TCP test page is running on http://localhost:3000
Default slave target: 192.168.2.1:502
```

브라우저에서 아래 주소를 열면 됩니다.

- http://localhost:3000

## 6. 기본 접속 정보

- 기본 Slave IP Address: `192.168.2.1`
- 기본 Port: `502`
- 웹 서버 접속 주소: `http://localhost:3000`

## 7. 사용 방법

### 7-1. Connect

1. 웹 페이지 상단의 `Slave IP Address` 입력칸 확인
2. 기본값은 `192.168.2.1`
3. 필요하면 IP와 Port를 수정
4. `Connect` 버튼 클릭
5. 연결 상태가 `Connected`로 바뀌면 통신 준비 완료

연결 실패 시 화면 팝업과 상태 텍스트에 오류가 표시됩니다.

### 7-2. Write

Write Panel에서는 아래 두 가지 방식으로 값을 쓸 수 있습니다.

- 개별 Write
  - 각 항목 오른쪽의 `Write` 버튼 사용
- 전체 Block Write
  - `Write All (0x00~0x02)` 버튼 사용

#### Write 대상 레지스터

- `CMD_CODE` at `0x00`
- `CMD_SEQ` at `0x01`
- `HEARTBEAT_ACS` at `0x02`

`Write All`을 누르면 0x00, 0x01, 0x02 주소에 대해 연속 쓰기(`writeRegisters`)가 수행됩니다.

### 7-3. Read

Read Panel에서는 아래 두 가지 방식으로 상태를 읽을 수 있습니다.

- 개별 Read
  - `PLC_STATUS`, `DOOR_STATUS`, `CONVEYOR_STATUS`, `ERROR_CODE` 각각 읽기 가능
- 전체 Read
  - `Read All (0x10~0x13)` 버튼 사용

`Read All`을 누르면 0x10, 0x11, 0x12, 0x13 주소를 한 번에 읽습니다.

읽은 결과는 아래 형식으로 표시됩니다.

```text
PLC_STATUS = 1 (BUSY)
DOOR_STATUS = 4 (OPENED)
ERROR_CODE = 15
```

### 7-4. Log 확인

Log Panel에서는 다음 정보를 볼 수 있습니다.

- 시간
- TX / RX / INFO / ERROR 구분
- 레지스터 주소
- Raw 값
- 해석 가능한 경우 값 이름

예시:

```text
[10:15:20] TX - Write Register 0x00 = 1 (DOOR_OPEN)
[10:15:21] RX - Read Register 0x10 = 1 (BUSY)
```

`Clear Log` 버튼을 누르면 화면 로그를 비울 수 있습니다.

## 8. Register Map 설명 표

### 8-1. Write 영역: ACS Command

| UI 이름 | 주소 | 설명 | 값 정의 |
|---|---|---|---|
| CMD_CODE | 0x00 | Command code to be sent to the PLC | 0=NONE, 1=DOOR_OPEN, 2=DOOR_CLOSE, 3=DOOR_STOP, 4=CONVEYOR_START, 5=CONVEYOR_STOP, 6=RESET |
| CMD_SEQ | 0x01 | Command Sequence Number | 0=NULL, 1~65535=Sequence Number |
| HEARTBEAT_ACS | 0x02 | ACS heartbeat counter | 0~65535=ACS TIMER |

### 8-2. Read 영역: PLC Status

| UI 이름 | 주소 | 설명 | 값 정의 |
|---|---|---|---|
| PLC_STATUS | 0x10 | PLC Status | 0=IDLE, 1=BUSY, 2=DONE, 3=ERROR, 4=MANUAL, 5=EMERGENCY_STOP |
| DOOR_STATUS | 0x11 | Door Status | 0=NONE, 1=CLOSED, 2=CLOSING, 3=OPENING, 4=OPENED, 5=ERROR |
| CONVEYOR_STATUS | 0x12 | Conveyor Status | 0=NONE, 1=STOPPED, 2=RUNNING, 3=ERROR |
| ERROR_CODE | 0x13 | Error code | 현재는 raw 숫자만 표시 |

## 9. Modbus 주소 처리 방식 설명

화면에는 주소를 `0x00`, `0x10`처럼 16진수 형식으로 보여줍니다.  
하지만 실제 Modbus 라이브러리 호출 시에는 0부터 시작하는 decimal offset을 사용합니다.

예:

- 화면 표기 `0x00` -> 라이브러리 주소 `0`
- 화면 표기 `0x01` -> 라이브러리 주소 `1`
- 화면 표기 `0x10` -> 라이브러리 주소 `16`

이 부분은 `server.js` 상단 주석에 다시 설명되어 있습니다.

## 10. API 설명

이 프로젝트는 아래 API를 사용합니다.

### POST /api/connect

#### 요청 예시

```json
{
  "ipAddress": "192.168.2.1",
  "port": 502
}
```

#### 응답 예시

```json
{
  "success": true,
  "message": "Slave에 연결되었습니다.",
  "connection": {
    "status": "Connected",
    "ipAddress": "192.168.2.1",
    "port": 502,
    "errorMessage": "",
    "unitId": 1
  }
}
```

### POST /api/disconnect

#### 응답 예시

```json
{
  "success": true,
  "message": "Slave 연결을 해제했습니다.",
  "connection": {
    "status": "Disconnected",
    "ipAddress": "192.168.2.1",
    "port": 502,
    "errorMessage": "",
    "unitId": 1
  }
}
```

### POST /api/write

#### 1) 전체 Block Write 요청 예시

```json
{
  "mode": "block",
  "values": {
    "cmdCode": 1,
    "cmdSeq": 100,
    "heartbeatAcs": 55
  }
}
```

#### 2) 개별 Write 요청 예시

```json
{
  "mode": "single",
  "registerName": "CMD_SEQ",
  "value": 100
}
```

#### 응답 예시

```json
{
  "success": true,
  "message": "명령 블록 0x00~0x02를 전송했습니다.",
  "wrote": [
    {
      "registerName": "CMD_CODE",
      "address": "0x00",
      "rawValue": 1,
      "name": "DOOR_OPEN",
      "description": "Command code to be sent to the PLC"
    }
  ],
  "connection": {
    "status": "Connected",
    "ipAddress": "192.168.2.1",
    "port": 502,
    "errorMessage": "",
    "unitId": 1
  }
}
```

### GET /api/read

#### 1) 전체 Read 예시

```text
GET /api/read?mode=all
```

#### 2) 개별 Read 예시

```text
GET /api/read?mode=single&registerName=PLC_STATUS
```

#### 응답 예시

```json
{
  "success": true,
  "message": "상태 블록 0x10~0x13을 읽었습니다.",
  "data": {
    "PLC_STATUS": {
      "registerName": "PLC_STATUS",
      "address": "0x10",
      "rawValue": 1,
      "name": "BUSY",
      "description": "PLC Status"
    }
  },
  "connection": {
    "status": "Connected",
    "ipAddress": "192.168.2.1",
    "port": 502,
    "errorMessage": "",
    "unitId": 1
  }
}
```

### GET /api/status

현재 연결 상태를 반환합니다.

### GET /api/logs

화면에 표시할 로그 목록을 반환합니다.

### DELETE /api/logs

로그를 초기화합니다.

## 11. 자주 발생하는 오류와 해결 방법

### 1) "IP 주소 형식이 올바르지 않습니다."

원인:

- IP 입력 형식이 잘못된 경우
- 예: `192.168.2`, `999.1.1.1`, 문자 포함

해결:

- `192.168.2.1`처럼 IPv4 형식으로 다시 입력

### 2) "Port 값은 1~65535 범위의 정수여야 합니다."

원인:

- Port가 비어 있거나 범위를 벗어난 경우

해결:

- 일반적으로 Modbus TCP는 `502` 사용

### 2-1) "Automatic Node.js installation could not start because winget is not available."

원인:

- Windows에 `winget`이 없거나 비활성화된 경우

해결:

- Microsoft App Installer / winget 사용 가능 상태인지 확인
- 또는 https://nodejs.org/ 에서 Node.js LTS를 수동 설치 후 `install.bat` 다시 실행

### 3) "Slave에 연결할 수 없습니다. IP 또는 Port를 확인하세요."

원인:

- PLC 전원이 꺼져 있음
- PC와 PLC가 같은 네트워크에 없음
- IP가 다름
- Port가 다름
- 방화벽 또는 네트워크 차단

해결:

- PLC / 시뮬레이터 실행 여부 확인
- `ping` 테스트
- IP, Port 재확인
- 시뮬레이터가 실제로 Modbus TCP Server 역할인지 확인

### 4) "Slave 응답 시간이 초과되었습니다."

원인:

- 네트워크 지연
- PLC가 요청에 응답하지 않음
- Unit ID 또는 레지스터 주소가 장비와 맞지 않음

해결:

- 장비 응답 상태 확인
- `server.js`의 `MODBUS_UNIT_ID` 값 확인
- Register Map 확인

### 5) "먼저 Slave에 연결하세요."

원인:

- Connect 전에 Read / Write 버튼을 누른 경우

해결:

- 먼저 Connect 실행

### 6) "숫자 입력값이 허용 범위를 벗어났습니다."

원인:

- 0~65535 범위를 벗어난 값 입력

해결:

- 모든 register 값은 unsigned 16-bit 범위로 입력

## 12. ERROR_CODE 테이블 확장 방법

현재 `ERROR_CODE`는 숫자 raw 값만 표시하도록 되어 있습니다.  
나중에 에러 코드를 이름으로 변환하고 싶다면 `server.js` 안의 `REGISTER_DEFINITIONS.ERROR_CODE.valueMap`을 수정하면 됩니다.

현재 구조:

```js
ERROR_CODE: {
  address: 0x13,
  description: "Error code",
  valueMap: null
}
```

예를 들어 아래처럼 바꾸면 됩니다.

```js
ERROR_CODE: {
  address: 0x13,
  description: "Error code",
  valueMap: {
    0: "NO_ERROR",
    1: "DOOR_SENSOR_FAIL",
    2: "CONVEYOR_OVERCURRENT",
    3: "EMERGENCY_SWITCH_ON"
  }
}
```

이렇게 바꾸면 Read 결과와 RX 로그에 숫자와 함께 이름이 표시됩니다.

## 13. Unit ID를 변경해야 하는 경우

일부 PLC 또는 시뮬레이터는 Unit ID가 1이 아닐 수 있습니다.  
이 프로젝트는 기본값으로 `1`을 사용합니다.

변경 위치:

- `server.js`

수정 항목:

```js
const MODBUS_UNIT_ID = 1;
```

필요한 값으로 바꾼 뒤 서버를 다시 시작하면 됩니다.

## 14. 코드 수정 시 먼저 보면 좋은 파일

- 화면을 바꾸고 싶을 때: `public/index.html`, `public/style.css`
- 버튼 동작을 바꾸고 싶을 때: `public/app.js`
- Register Map을 바꾸고 싶을 때: `server.js`
- Modbus 통신 방식이나 예외 처리를 바꾸고 싶을 때: `server.js`

## 15. 참고 사항

- 이 프로젝트는 Holding Register 기준으로 작성되어 있습니다.
- Write는 Holding Register Write 방식 사용
- Read는 Holding Register Read 방식 사용
- 연속 Write: `0x00 ~ 0x02`
- 연속 Read: `0x10 ~ 0x13`
- 서버 콘솔에도 기본 로그가 남으므로 디버깅 시 함께 확인하면 좋습니다.

## 16. 빠른 실행 요약

```bat
install.bat
start.bat
```

브라우저에서:

```text
http://localhost:3000
```

기본 접속 대상:

```text
IP   : 192.168.2.1
Port : 502
```
