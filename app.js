const API = "";

let currentEmployee = null;
let scannerStream = null;
let scannerTimer = null;
let scannerDetector = null;
let scannerBusy = false;
let jsQRLoaded = false;

/* =========================
   COMMON HELPERS
========================= */

function $(id) {
  return document.getElementById(id);
}

function firstElement(ids) {
  for (const id of ids) {
    const el = $(id);
    if (el) return el;
  }
  return null;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function message(id, text, type = "success") {
  const box = $(id);
  if (!box) return;

  box.innerHTML = `
    <div class="${type === "error" ? "error-box" : "success-box"}">
      ${escapeHtml(text)}
    </div>
  `;
}

async function api(path, options = {}) {
  const response = await fetch(API + path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  const data = await response.json().catch(() => ({
    success: false,
    error: "Invalid server response"
  }));

  if (!response.ok && data.success !== true) {
    throw new Error(data.error || "Request failed");
  }

  return data;
}

function getValue(ids) {
  const el = firstElement(ids);
  return el ? el.value.trim() : "";
}

function getSelectValue(ids) {
  const el = firstElement(ids);
  return el ? el.value : "";
}

function setText(ids, value) {
  const el = firstElement(ids);
  if (el) el.textContent = value ?? "-";
}

function formatDate(value) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString("en-IN");
}

function formatDateTime(value) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString("en-IN");
}


/* =========================
   SCREEN CONTROL
========================= */

function showScreen(id) {
  document.querySelectorAll("main > section").forEach(section => {
    section.classList.add("hidden");
  });

  const screen = $(id);

  if (screen) {
    screen.classList.remove("hidden");

    window.scrollTo({
      top: 0,
      behavior: "smooth"
    });
  }
}


/* =========================
   EMPLOYEE LOGIN
========================= */

async function employeeLogin() {
  const employeeId = getValue([
    "employeeLoginId",
    "loginEmployeeId"
  ]);

  if (!employeeId) {
    message(
      "employeeLoginMessage",
      "Enter Employee ID",
      "error"
    );
    return;
  }

  try {
    const data = await api(
      `/api/employees/${encodeURIComponent(employeeId)}`
    );

    currentEmployee = data.employee;

    localStorage.setItem(
      "texmo_employee_id",
      currentEmployee.employee_id
    );

    showScreen("employeePortal");

    renderEmployee();

    await loadMyRoom();
    await loadEmployeeLeave();
    await loadEmployeeVacate();
    await loadEmployeeCheckin();

  } catch (error) {
    message(
      "employeeLoginMessage",
      error.message,
      "error"
    );
  }
}


/* =========================
   EMPLOYEE REGISTRATION
========================= */

async function registerEmployee() {
  const data = {
    employee_id: getValue([
      "regEmployeeId"
    ]),

    name: getValue([
      "regName"
    ]),

    department: getValue([
      "regDepartment"
    ]),

    designation: getValue([
      "regDesignation"
    ]),

    phone: getValue([
      "regPhone"
    ]),

    shift: getSelectValue([
      "regShift"
    ]),

    room: getValue([
      "regRoom"
    ])
  };

  if (
    !data.employee_id ||
    !data.name ||
    !data.department
  ) {
    message(
      "registerMessage",
      "Employee ID, Name and Department are required",
      "error"
    );
    return;
  }

  try {
    const result = await api(
      "/api/employees/register",
      {
        method: "POST",
        body: JSON.stringify(data)
      }
    );

    message(
      "registerMessage",
      "Registration successful. Employee ID: " +
      result.employee_id
    );

    setTimeout(() => {
      const loginInput = firstElement([
        "employeeLoginId",
        "loginEmployeeId"
      ]);

      if (loginInput) {
        loginInput.value = result.employee_id;
      }

      showScreen("employeeLogin");

    }, 1000);

  } catch (error) {
    message(
      "registerMessage",
      error.message,
      "error"
    );
  }
}


/* =========================
   LOAD EMPLOYEE
========================= */

async function loadEmployee() {
  const employeeId =
    localStorage.getItem("texmo_employee_id");

  if (!employeeId) {
    showScreen("employeeLogin");
    return;
  }

  try {
    const data = await api(
      `/api/employees/${encodeURIComponent(employeeId)}`
    );

    currentEmployee = data.employee;

    renderEmployee();

    await loadMyRoom();
    await loadEmployeeLeave();
    await loadEmployeeVacate();
    await loadEmployeeCheckin();

  } catch (error) {

    localStorage.removeItem(
      "texmo_employee_id"
    );

    currentEmployee = null;

    message(
      "employeeLoginMessage",
      error.message,
      "error"
    );

    showScreen("employeeLogin");
  }
}


/* =========================
   EMPLOYEE PROFILE
========================= */

function renderEmployee() {
  if (!currentEmployee) return;

  const employee = currentEmployee;

  const box = firstElement([
    "employeeDetails",
    "employeeProfile",
    "profileDetails"
  ]);

  if (box) {
    box.innerHTML = `
      <div class="employee-card">

        <strong class="profile-name">
          ${escapeHtml(employee.name)}
        </strong>

        <div class="profile-row">
          <span class="profile-label">Employee ID</span>
          <span class="profile-value">
            ${escapeHtml(employee.employee_id)}
          </span>
        </div>

        <div class="profile-row">
          <span class="profile-label">Department</span>
          <span class="profile-value">
            ${escapeHtml(employee.department)}
          </span>
        </div>

        <div class="profile-row">
          <span class="profile-label">Designation</span>
          <span class="profile-value">
            ${escapeHtml(employee.designation || "-")}
          </span>
        </div>

        <div class="profile-row">
          <span class="profile-label">Phone</span>
          <span class="profile-value">
            ${escapeHtml(employee.phone || "-")}
          </span>
        </div>

        <div class="profile-row">
          <span class="profile-label">Shift</span>
          <span class="profile-value">
            ${escapeHtml(employee.shift || "-")}
          </span>
        </div>

        <div class="profile-row">
          <span class="profile-label">Room</span>
          <span class="profile-value">
            ${escapeHtml(employee.room || "-")}
          </span>
        </div>

        <div class="profile-row">
          <span class="profile-label">Bed</span>
          <span class="profile-value">
            ${escapeHtml(employee.bed_no || "-")}
          </span>
        </div>

        <div class="profile-row">
          <span class="profile-label">Hostel Status</span>
          <span class="profile-value">
            <span class="badge">
              ${escapeHtml(employee.hostel_status || "IN")}
            </span>
          </span>
        </div>

        <div class="profile-row">
          <span class="profile-label">Account Status</span>
          <span class="profile-value">
            <span class="badge">
              ${escapeHtml(employee.status || "-")}
            </span>
          </span>
        </div>

      </div>
    `;
  }

  createEmployeeQR(employee.qr_token);
}


/* =========================
   EMPLOYEE QR
========================= */

function createEmployeeQR(token) {
  const box = firstElement([
    "qrcode",
    "employeeQRCode"
  ]);

  if (!box) return;

  box.innerHTML = "";

  if (!token) {
    box.innerHTML =
      `<p class="small">QR not available</p>`;
    return;
  }

  if (typeof QRCode === "undefined") {

    box.innerHTML =
      `<p class="small">QR library loading...</p>`;

    setTimeout(() => {
      if (typeof QRCode !== "undefined") {
        createEmployeeQR(token);
      }
    }, 800);

    return;
  }

  new QRCode(box, {
    text: token,
    width: 220,
    height: 220,
    correctLevel: QRCode.CorrectLevel.M
  });
}


/* =========================
   MY ROOM
========================= */

async function loadMyRoom() {

  if (!currentEmployee) return;

  try {

    const data = await api(
      `/api/employee-room/${encodeURIComponent(
        currentEmployee.employee_id
      )}`
    );

    renderMyRoom(data);

  } catch (error) {

    renderMyRoomError(error.message);
  }
}


function renderMyRoom(data) {

  const room = data.room || {};

  /*
    IMPORTANT:
    HTML uses #myRoomDetails.
    This ID must be included here.
  */

  const target = firstElement([
    "myRoomDetails",
    "myRoomContent",
    "employeeRoomContent",
    "roomDetails",
    "myRoom",
    "employeeRoom"
  ]);

  if (!target) return;

  const members = data.members || [];

  const status =
    data.hostel_status ||
    currentEmployee?.hostel_status ||
    "IN";

  target.innerHTML = `

    <div class="employee-card">

      <h3>My Room</h3>

      <div class="profile-row">
        <span class="profile-label">Block</span>
        <span class="profile-value">
          ${escapeHtml(room.block || "-")}
        </span>
      </div>

      <div class="profile-row">
        <span class="profile-label">Room</span>
        <span class="profile-value">
          ${escapeHtml(
            room.room_no ||
            currentEmployee?.room ||
            "-"
          )}
        </span>
      </div>

      <div class="profile-row">
        <span class="profile-label">My Bed</span>
        <span class="profile-value">
          ${escapeHtml(
            data.employee_bed ||
            currentEmployee?.bed_no ||
            "-"
          )}
        </span>
      </div>

      <div class="profile-row">
        <span class="profile-label">Capacity</span>
        <span class="profile-value">
          ${escapeHtml(room.capacity || 0)}
        </span>
      </div>

      <div class="profile-row">
        <span class="profile-label">Occupied</span>
        <span class="profile-value">
          ${escapeHtml(room.occupied || 0)}
          / ${escapeHtml(room.capacity || 0)}
        </span>
      </div>

      <div class="profile-row">
        <span class="profile-label">Available Beds</span>
        <span class="profile-value">
          ${escapeHtml(room.available || 0)}
        </span>
      </div>

      <div class="profile-row">
        <span class="profile-label">Hostel Status</span>
        <span class="profile-value">
          <span class="badge">
            ${escapeHtml(status)}
          </span>
        </span>
      </div>

    </div>

    <div class="employee-card">

      <h3>Room Members</h3>

      ${
        members.length
          ? members.map(member => `
              <div class="profile-row">

                <span class="profile-label">
                  ${escapeHtml(member.bed_no || "-")}
                </span>

                <span class="profile-value">
                  ${escapeHtml(member.name)}
                  <small>
                    (${escapeHtml(member.employee_id)})
                  </small>
                </span>

              </div>
            `).join("")
          : `
            <p class="small">
              No active members found.
            </p>
          `
      }

    </div>
  `;
}


function renderMyRoomError(error) {

  /*
    IMPORTANT:
    HTML uses #myRoomDetails.
    Error rendering must use the same target.
  */

  const target = firstElement([
    "myRoomDetails",
    "myRoomContent",
    "employeeRoomContent",
    "roomDetails",
    "myRoom",
    "employeeRoom"
  ]);

  if (!target) return;

  target.innerHTML = `
    <div class="error-box">
      ${escapeHtml(error)}
    </div>
  `;
}


/* =========================
   LEAVE
========================= */

async function submitEmployeeLeave() {

  if (!currentEmployee) {
    message(
      "leaveMessage",
      "Please login first",
      "error"
    );
    return;
  }

  const startDate = getValue([
    "leaveStartDate",
    "employeeLeaveStart",
    "leaveFrom"
  ]);

  const endDate = getValue([
    "leaveEndDate",
    "employeeLeaveEnd",
    "leaveTo"
  ]);

  const reason = getValue([
    "leaveReason",
    "employeeLeaveReason"
  ]);

  const roomVacateCheckbox = firstElement([
    "leaveRoomVacate",
    "roomVacate",
    "vacateRoomWithLeave"
  ]);

  const roomVacate =
    roomVacateCheckbox
      ? roomVacateCheckbox.checked
      : false;

  if (!startDate || !endDate) {

    message(
      "leaveMessage",
      "Select leave start and end date",
      "error"
    );

    return;
  }

  try {

    const result = await api(
      "/api/leave",
      {
        method: "POST",
        body: JSON.stringify({
          employee_id:
            currentEmployee.employee_id,

          start_date: startDate,

          end_date: endDate,

          reason: reason,

          room_vacate:
            roomVacate
        })
      }
    );

    message(
      "leaveMessage",
      result.message ||
      "Leave request submitted successfully."
    );

    await loadEmployeeLeave();

    if (roomVacate) {
      await loadEmployeeVacate();
    }

  } catch (error) {

    message(
      "leaveMessage",
      error.message,
      "error"
    );
  }
}


async function loadEmployeeLeave() {

  if (!currentEmployee) return;

  try {

    const data = await api(
      `/api/leave/${encodeURIComponent(
        currentEmployee.employee_id
      )}`
    );

    renderEmployeeLeave(data.leaves || []);

  } catch (error) {

    console.error(
      "Leave loading error:",
      error
    );
  }
}


function renderEmployeeLeave(leaves) {

  const target = firstElement([
    "leaveHistory",
    "employeeLeaveHistory",
    "leaveList"
  ]);

  if (!target) return;

  if (!leaves.length) {

    target.innerHTML =
      `<p class="small">No leave records.</p>`;

    return;
  }

  target.innerHTML = leaves.map(item => `
    <div class="employee-card">

      <div class="profile-row">
        <span class="profile-label">From</span>
        <span class="profile-value">
          ${escapeHtml(formatDate(item.start_date))}
        </span>
      </div>

      <div class="profile-row">
        <span class="profile-label">To</span>
        <span class="profile-value">
          ${escapeHtml(formatDate(item.end_date))}
        </span>
      </div>

      <div class="profile-row">
        <span class="profile-label">Reason</span>
        <span class="profile-value">
          ${escapeHtml(item.reason || "-")}
        </span>
      </div>

      <div class="profile-row">
        <span class="profile-label">Room Vacate</span>
        <span class="profile-value">
          ${item.room_vacate ? "YES" : "NO"}
        </span>
      </div>

      <div class="profile-row">
        <span class="profile-label">Status</span>
        <span class="profile-value">
          <span class="badge">
            ${escapeHtml(item.status || "PENDING")}
          </span>
        </span>
      </div>

    </div>
  `).join("");
}


/* =========================
   DIRECT ROOM VACATE
========================= */

async function submitEmployeeVacate() {

  if (!currentEmployee) {
    message(
      "vacateMessage",
      "Please login first",
      "error"
    );
    return;
  }

  const vacateDate = getValue([
    "vacateDate",
    "employeeVacateDate",
    "vacateStartDate"
  ]);

  const returnDate = getValue([
    "returnDate",
    "employeeReturnDate",
    "vacateReturnDate"
  ]);

  const reason = getValue([
    "vacateReason",
    "employeeVacateReason"
  ]);

  if (!vacateDate || !returnDate) {

    message(
      "vacateMessage",
      "Select vacate date and return date",
      "error"
    );

    return;
  }

  try {

    const result = await api(
      "/api/vacate",
      {
        method: "POST",
        body: JSON.stringify({
          employee_id:
            currentEmployee.employee_id,

          vacate_date:
            vacateDate,

          return_date:
            returnDate,

          reason:
            reason
        })
      }
    );

    message(
      "vacateMessage",
      result.message ||
      "Room vacate request submitted."
    );

    await loadEmployeeVacate();

  } catch (error) {

    message(
      "vacateMessage",
      error.message,
      "error"
    );
  }
}


async function loadEmployeeVacate() {

  if (!currentEmployee) return;

  try {

    const data = await api(
      `/api/vacate/${encodeURIComponent(
        currentEmployee.employee_id
      )}`
    );

    renderEmployeeVacate(
      data.vacates || []
    );

  } catch (error) {

    console.error(
      "Vacate loading error:",
      error
    );
  }
}


function renderEmployeeVacate(vacates) {

  const target = firstElement([
    "vacateHistory",
    "employeeVacateHistory",
    "vacateList"
  ]);

  if (!target) return;

  if (!vacates.length) {

    target.innerHTML =
      `<p class="small">No room vacate records.</p>`;

    return;
  }

  target.innerHTML = vacates.map(item => `
    <div class="employee-card">

      <div class="profile-row">
        <span class="profile-label">Vacate Date</span>
        <span class="profile-value">
          ${escapeHtml(formatDate(item.vacate_date))}
        </span>
      </div>

      <div class="profile-row">
        <span class="profile-label">Return Date</span>
        <span class="profile-value">
          ${escapeHtml(formatDate(item.return_date))}
        </span>
      </div>

      <div class="profile-row">
        <span class="profile-label">Reason</span>
        <span class="profile-value">
          ${escapeHtml(item.reason || "-")}
        </span>
      </div>

      <div class="profile-row">
        <span class="profile-label">Status</span>
        <span class="profile-value">
          <span class="badge">
            ${escapeHtml(item.status || "PENDING")}
          </span>
        </span>
      </div>

    </div>
  `).join("");
}


/* =========================
   CHECK-IN
========================= */

async function submitEmployeeCheckin() {

  if (!currentEmployee) {
    message(
      "checkinMessage",
      "Please login first",
      "error"
    );
    return;
  }

  const requestedRoom = getValue([
    "checkinRoom",
    "employeeCheckinRoom"
  ]);

  try {

    const result = await api(
      "/api/checkin",
      {
        method: "POST",
        body: JSON.stringify({
          employee_id:
            currentEmployee.employee_id,

          requested_room:
            requestedRoom || null
        })
      }
    );

    message(
      "checkinMessage",
      result.message ||
      "Check-In request sent to HR."
    );

    await loadEmployeeCheckin();

  } catch (error) {

    message(
      "checkinMessage",
      error.message,
      "error"
    );
  }
}


async function loadEmployeeCheckin() {

  if (!currentEmployee) return;

  try {

    const data = await api(
      `/api/checkin/${encodeURIComponent(
        currentEmployee.employee_id
      )}`
    );

    renderEmployeeCheckin(
      data.requests || []
    );

  } catch (error) {

    console.error(
      "Check-in loading error:",
      error
    );
  }
}


function renderEmployeeCheckin(requests) {

  const target = firstElement([
    "checkinHistory",
    "employeeCheckinHistory",
    "checkinList"
  ]);

  if (!target) return;

  if (!requests.length) {

    target.innerHTML =
      `<p class="small">No Check-In requests.</p>`;

    return;
  }

  target.innerHTML = requests.map(item => `
    <div class="employee-card">

      <div class="profile-row">
        <span class="profile-label">Requested</span>
        <span class="profile-value">
          ${escapeHtml(formatDateTime(item.created_at))}
        </span>
      </div>

      <div class="profile-row">
        <span class="profile-label">Requested Room</span>
        <span class="profile-value">
          ${escapeHtml(item.requested_room || "Original Room")}
        </span>
      </div>

      <div class="profile-row">
        <span class="profile-label">Status</span>
        <span class="profile-value">
          <span class="badge">
            ${escapeHtml(item.status || "PENDING")}
          </span>
        </span>
      </div>

      ${
        item.hr_note
          ? `
            <div class="profile-row">
              <span class="profile-label">HR Note</span>
              <span class="profile-value">
                ${escapeHtml(item.hr_note)}
              </span>
            </div>
          `
          : ""
      }

    </div>
  `).join("");
}


/* =========================
   HR LOGIN
   TEMPORARY VERSION
========================= */

async function hrLogin() {

  const username = getValue([
    "hrUsername"
  ]);

  const password =
    firstElement(["hrPassword"])?.value || "";

  if (!username || !password) {

    message(
      "hrLoginMessage",
      "Enter username and password",
      "error"
    );

    return;
  }

  try {

    await api(
      "/api/hr/login",
      {
        method: "POST",

        body: JSON.stringify({
          username,
          password
        })
      }
    );

    localStorage.setItem(
      "texmo_hr_login",
      "true"
    );

    showScreen("hrPortal");

    await loadDashboard();

  } catch (error) {

    message(
      "hrLoginMessage",
      error.message,
      "error"
    );
  }
}


/* =========================
   HR DASHBOARD
========================= */

async function loadDashboard() {

  try {

    const data =
      await api("/api/cab/dashboard");

    setText(
      ["totalBoarded"],
      data.total_boarded || 0
    );

    renderDepartmentStats(
      data.departments || []
    );

    renderCabStats(
      data.cabs || []
    );

    renderShiftStats(
      data.shifts || []
    );

    const employees =
      await api("/api/employees");

    setText(
      ["totalEmployees"],
      employees.employees?.length || 0
    );

  } catch (error) {

    console.error(
      "Dashboard error:",
      error
    );
  }
}


function renderDepartmentStats(items) {

  const target = firstElement([
    "departmentStats",
    "hrDepartmentStats"
  ]);

  if (!target) return;

  target.innerHTML = items.map(item => `
    <div class="stat-card">
      <strong>
        ${escapeHtml(item.department || "-")}
      </strong>
      <span>
        ${escapeHtml(item.count || 0)}
      </span>
    </div>
  `).join("");
}


function renderCabStats(items) {

  const target = firstElement([
    "cabStats",
    "hrCabStats"
  ]);

  if (!target) return;

  target.innerHTML = items.map(item => `
    <div class="stat-card">
      <strong>
        ${escapeHtml(item.cab || "-")}
      </strong>
      <span>
        ${escapeHtml(item.count || 0)}
      </span>
    </div>
  `).join("");
}


function renderShiftStats(items) {

  const target = firstElement([
    "shiftStats",
    "hrShiftStats"
  ]);

  if (!target) return;

  target.innerHTML = items.map(item => `
    <div class="stat-card">
      <strong>
        ${escapeHtml(item.shift || "-")}
      </strong>
      <span>
        ${escapeHtml(item.count || 0)}
      </span>
    </div>
  `).join("");
}


/* =========================
   CAB QR SCANNER
========================= */

async function startScanner() {

  if (scannerStream) {
    return;
  }

  const video = firstElement([
    "scannerVideo",
    "qrVideo",
    "cabScannerVideo"
  ]);

  if (!video) {
    alert("Scanner video not found");
    return;
  }

  try {

    scannerStream =
      await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: {
            ideal: "environment"
          }
        },
        audio: false
      });

    video.srcObject = scannerStream;

    await video.play();

    if (
      "BarcodeDetector" in window
    ) {

      try {

        scannerDetector =
          new BarcodeDetector({
            formats: ["qr_code"]
          });

        scannerTimer =
          setInterval(
            () => scanFrame(scannerDetector),
            500
          );

        return;

      } catch (error) {

        console.log(
          "BarcodeDetector unavailable",
          error
        );
      }
    }

    await loadJsQR();

    scannerTimer =
      setInterval(
        scanFrameWithJsQR,
        500
      );

  } catch (error) {

    console.error(
      "Scanner error:",
      error
    );

    alert(
      "Camera permission required."
    );
  }
}


async function scanFrame(detector) {

  if (scannerBusy) return;

  const video =
    firstElement([
      "scannerVideo",
      "qrVideo",
      "cabScannerVideo"
    ]);

  if (!video || video.readyState < 2) {
    return;
  }

  scannerBusy = true;

  try {

    const codes =
      await detector.detect(video);

    if (codes && codes.length) {

      const value =
        codes[0].rawValue;

      if (value) {
        await handleDetectedQR(value);
      }
    }

  } catch (error) {

    console.error(
      "Barcode scan error:",
      error
    );

  } finally {

    scannerBusy = false;
  }
}


async function loadJsQR() {

  if (typeof jsQR !== "undefined") {
    return;
  }

  if (jsQRLoaded) {
    return;
  }

  jsQRLoaded = true;

  await new Promise((resolve, reject) => {

    const script =
      document.createElement("script");

    script.src =
      "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js";

    script.onload = resolve;
    script.onerror = reject;

    document.head.appendChild(script);
  });
}


async function scanFrameWithJsQR() {

  if (scannerBusy) return;

  if (typeof jsQR === "undefined") {
    return;
  }

  const video =
    firstElement([
      "scannerVideo",
      "qrVideo",
      "cabScannerVideo"
    ]);

  const canvas =
    firstElement([
      "scannerCanvas",
      "qrCanvas",
      "cabScannerCanvas"
    ]);

  if (!video || !canvas) {
    return;
  }

  if (video.readyState < 2) {
    return;
  }

  scannerBusy = true;

  try {

    const width =
      video.videoWidth;

    const height =
      video.videoHeight;

    if (!width || !height) {
      return;
    }

    canvas.width = width;
    canvas.height = height;

    const ctx =
      canvas.getContext("2d", {
        willReadFrequently: true
      });

    ctx.drawImage(
      video,
      0,
      0,
      width,
      height
    );

    const imageData =
      ctx.getImageData(
        0,
        0,
        width,
        height
      );

    const code =
      jsQR(
        imageData.data,
        width,
        height
      );

    if (code?.data) {
      await handleDetectedQR(code.data);
    }

  } catch (error) {

    console.error(
      "jsQR error:",
      error
    );

  } finally {

    scannerBusy = false;
  }
}


async function handleDetectedQR(qrToken) {
  await processCabScan(qrToken);
}


async function processCabScan(qrToken) {

  try {

    const result =
      await api(
        "/api/cab/scan",
        {
          method: "POST",

          body: JSON.stringify({
            qr_token: qrToken
          })
        }
      );

    const target =
      firstElement([
        "scannerMessage",
        "cabScannerMessage",
        "scanMessage"
      ]);

    if (target) {

      target.innerHTML = `
        <div class="success-box">

          <strong>
            Cab Entry Successful
          </strong>

          <br>

          Employee:
          ${escapeHtml(
            result.employee?.name ||
            result.name ||
            "-"
          )}

          <br>

          Shift:
          ${escapeHtml(
            result.shift || "-"
          )}

          <br>

          Cab:
          ${escapeHtml(
            result.cab || "-"
          )}

        </div>
      `;
    }

    if (navigator.vibrate) {
      navigator.vibrate(150);
    }

    await loadDashboard();

  } catch (error) {

    const target =
      firstElement([
        "scannerMessage",
        "cabScannerMessage",
        "scanMessage"
      ]);

    if (target) {

      target.innerHTML = `
        <div class="error-box">
          ${escapeHtml(error.message)}
        </div>
      `;
    }
  }
}


function stopScanner() {

  if (scannerTimer) {

    clearInterval(
      scannerTimer
    );

    scannerTimer = null;
  }

  if (scannerStream) {

    scannerStream
      .getTracks()
      .forEach(track => {
        track.stop();
      });

    scannerStream = null;
  }

  const video =
    firstElement([
      "scannerVideo",
      "qrVideo",
      "cabScannerVideo"
    ]);

  if (video) {
    video.srcObject = null;
  }

  scannerDetector = null;
  scannerBusy = false;
}


/* =========================
   HR EMPLOYEES
========================= */

async function loadEmployees() {

  try {

    const data =
      await api("/api/employees");

    const employees =
      data.employees || [];

    const target =
      firstElement([
        "employeesTableBody",
        "employeeTableBody",
        "hrEmployeesList",
        "employeesList"
      ]);

    if (!target) return;

    target.innerHTML =
      employees.map(employee => `
        <tr>

          <td>
            ${escapeHtml(employee.employee_id)}
          </td>

          <td>
            ${escapeHtml(employee.name)}
          </td>

          <td>
            ${escapeHtml(employee.department || "-")}
          </td>

          <td>
            ${escapeHtml(employee.shift || "-")}
          </td>

          <td>
            ${escapeHtml(employee.room || "-")}
          </td>

          <td>
            ${escapeHtml(employee.bed_no || "-")}
          </td>

          <td>
            ${escapeHtml(
              employee.hostel_status || "IN"
            )}
          </td>

        </tr>
      `).join("");

  } catch (error) {

    console.error(
      "Employees loading error:",
      error
    );
  }
}


/* =========================
   EXPORTS
========================= */

function downloadCabExcel() {
  window.open(
    API + "/api/cab/export",
    "_blank"
  );
}

function downloadRoomsExcel() {
  window.open(
    API + "/api/rooms/export",
    "_blank"
  );
}

function downloadShiftsExcel() {
  window.open(
    API + "/api/shifts/export",
    "_blank"
  );
}

function downloadAttendanceExcel() {
  window.open(
    API + "/api/attendance/export",
    "_blank"
  );
}

function downloadLeaveExcel() {
  window.open(
    API + "/api/leave/export",
    "_blank"
  );
}

function downloadVacateExcel() {
  window.open(
    API + "/api/vacate/export",
    "_blank"
  );
}

function downloadFoodExcel() {
  window.open(
    API + "/api/food/export",
    "_blank"
  );
}


/* =========================
   FOOD QR
========================= */

function generateFoodQR() {

  const box =
    firstElement([
      "foodQRCode",
      "foodQrCode",
      "foodQR"
    ]);

  if (!box) return;

  box.innerHTML = "";

  if (typeof QRCode === "undefined") {

    box.innerHTML =
      `<p class="small">QR library loading...</p>`;

    setTimeout(
      generateFoodQR,
      800
    );

    return;
  }

  const foodUrl =
    window.location.origin +
    "/food";

  new QRCode(box, {
    text: foodUrl,
    width: 240,
    height: 240,
    correctLevel:
      QRCode.CorrectLevel.M
  });
}


/* =========================
   EMPLOYEE SHIFT
========================= */

async function saveEmployeeShift() {

  const shift =
    getSelectValue([
      "employeeShift",
      "editEmployeeShift",
      "shiftSelect"
    ]);

  const date =
    getValue([
      "employeeShiftDate",
      "shiftDate"
    ]);

  if (!shift || !date) {

    message(
      "shiftMessage",
      "Select date and shift",
      "error"
    );

    return;
  }

  if (!currentEmployee) {

    message(
      "shiftMessage",
      "Please login first",
      "error"
    );

    return;
  }

  try {

    const result =
      await api(
        "/api/shifts",
        {
          method: "POST",

          body: JSON.stringify({
            employee_id:
              currentEmployee.employee_id,

            date,

            shift
          })
        }
      );

    message(
      "shiftMessage",
      result.message ||
      "Shift saved successfully."
    );

  } catch (error) {

    message(
      "shiftMessage",
      error.message,
      "error"
    );
  }
}


/* =========================
   EMPLOYEE TAB HELPER
========================= */

function texmoEmployeeTab(tab) {

  if (
    tab === "room" ||
    tab === "myroom"
  ) {
    loadMyRoom();
  }

  if (tab === "leave") {
    loadEmployeeLeave();
  }

  if (tab === "vacate") {
    loadEmployeeVacate();
    loadEmployeeCheckin();
  }

  if (tab === "attendance") {
    loadEmployeeAttendance();
  }

  if (tab === "food") {
    generateFoodQR();
  }
}


/* =========================
   EMPLOYEE ATTENDANCE
========================= */

async function loadEmployeeAttendance() {

  if (!currentEmployee) return;

  try {

    const data =
      await api(
        `/api/attendance/${encodeURIComponent(
          currentEmployee.employee_id
        )}`
      );

    renderEmployeeAttendance(
      data.attendance || []
    );

  } catch (error) {

    console.log(
      "Attendance API not ready yet:",
      error.message
    );
  }
}


function renderEmployeeAttendance(records) {

  const target =
    firstElement([
      "attendanceHistory",
      "employeeAttendanceHistory",
      "attendanceList"
    ]);

  if (!target) return;

  if (!records.length) {

    target.innerHTML =
      `<p class="small">No attendance records.</p>`;

    return;
  }

  target.innerHTML =
    records.map(item => `
      <div class="employee-card">

        <div class="profile-row">
          <span class="profile-label">Date</span>
          <span class="profile-value">
            ${escapeHtml(formatDate(item.date))}
          </span>
        </div>

        <div class="profile-row">
          <span class="profile-label">Shift</span>
          <span class="profile-value">
            ${escapeHtml(item.shift || "-")}
          </span>
        </div>

        <div class="profile-row">
          <span class="profile-label">Status</span>
          <span class="profile-value">
            <span class="badge">
              ${escapeHtml(item.status || "-")}
            </span>
          </span>
        </div>

      </div>
    `).join("");
}


/* =========================
   LOGOUT
========================= */

function logout() {

  localStorage.removeItem(
    "texmo_employee_id"
  );

  localStorage.removeItem(
    "texmo_hr_login"
  );

  currentEmployee = null;

  stopScanner();

  showScreen("home");
}


/* =========================
   GLOBAL FUNCTION BINDING
========================= */

function bindTexmoFunctions() {

  window.submitEmployeeLeave =
    submitEmployeeLeave;

  window.submitEmployeeVacate =
    submitEmployeeVacate;

  window.submitEmployeeCheckin =
    submitEmployeeCheckin;

  window.saveEmployeeShift =
    saveEmployeeShift;

  window.generateFoodQR =
    generateFoodQR;

  window.downloadRoomsExcel =
    downloadRoomsExcel;

  window.downloadShiftsExcel =
    downloadShiftsExcel;

  window.downloadAttendanceExcel =
    downloadAttendanceExcel;

  window.downloadLeaveExcel =
    downloadLeaveExcel;

  window.downloadVacateExcel =
    downloadVacateExcel;

  window.downloadFoodExcel =
    downloadFoodExcel;
}


/* =========================
   PAGE START
========================= */

window.addEventListener(
  "DOMContentLoaded",
  async () => {

    bindTexmoFunctions();

    const employeeId =
      localStorage.getItem(
        "texmo_employee_id"
      );

    if (employeeId) {

      try {

        const data =
          await api(
            `/api/employees/${encodeURIComponent(
              employeeId
            )}`
          );

        currentEmployee =
          data.employee;

        showScreen(
          "employeePortal"
        );

        renderEmployee();

        await loadMyRoom();
        await loadEmployeeLeave();
        await loadEmployeeVacate();
        await loadEmployeeCheckin();

      } catch (error) {

        localStorage.removeItem(
          "texmo_employee_id"
        );

        currentEmployee = null;
      }

    }

    const foodBox =
      firstElement([
        "foodQRCode",
        "foodQrCode",
        "foodQR"
      ]);

    if (foodBox) {
      generateFoodQR();
    }
  }
);


/* =========================
   AUTO REFRESH
========================= */

setInterval(
  async () => {

    if (!currentEmployee) return;

    try {

      const data =
        await api(
          `/api/employees/${encodeURIComponent(
            currentEmployee.employee_id
          )}`
        );

      currentEmployee =
        data.employee;

      renderEmployee();

      await loadMyRoom();

    } catch (error) {

      console.log(
        "Background refresh:",
        error.message
      );
    }

  },
  60000
);
