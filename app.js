/* =========================================================
   TEXMO HOSTEL HUB 2.0
   FRONTEND APP.JS
   Stable / defensive version
========================================================= */

"use strict";

/* =========================================================
   CONFIG
========================================================= */

const API = "";

/* =========================================================
   GLOBAL STATE
========================================================= */

let currentEmployee = null;

let scannerStream = null;
let scannerTimer = null;
let scannerDetector = null;
let scannerBusy = false;
let jsQRLoaded = false;
let jsQRLoading = false;

let employeeLoading = false;
let employeeRegistering = false;
let hrLoggingIn = false;
let vacateSubmitting = false;
let checkinSubmitting = false;
let leaveSubmitting = false;

let refreshTimer = null;

/* =========================================================
   COMMON HELPERS
========================================================= */

function $(id) {
  return document.getElementById(id);
}

function firstElement(...ids) {
  for (const id of ids) {
    const el = $(id);
    if (el) return el;
  }
  return null;
}

function escapeHtml(value) {
  if (value === null || value === undefined) return "";

  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function safeJsonParse(value, fallback = null) {
  if (!value) return fallback;

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function message(elementOrId, text, type = "info") {
  const el =
    typeof elementOrId === "string"
      ? $(elementOrId)
      : elementOrId;

  if (!el) return;

  el.textContent = text || "";

  el.className =
    "texmo-message " +
    (type === "success"
      ? "success"
      : type === "error"
        ? "error"
        : type === "warning"
          ? "warning"
          : "info");
}

function setText(id, value) {
  const el = $(id);
  if (el) el.textContent = value ?? "";
}

function setHtml(id, html) {
  const el = $(id);
  if (el) el.innerHTML = html || "";
}

function getValue(id) {
  const el = $(id);
  return el ? String(el.value || "").trim() : "";
}

function getSelectValue(id) {
  const el = $(id);
  return el ? String(el.value || "").trim() : "";
}

function setValue(id, value) {
  const el = $(id);
  if (el) el.value = value ?? "";
}

function disableButton(button, disabled = true, text = null) {
  if (!button) return;

  button.disabled = disabled;

  if (text !== null) {
    button.dataset.originalText ??= button.textContent;
    button.textContent = text;
  } else if (!disabled && button.dataset.originalText) {
    button.textContent = button.dataset.originalText;
  }
}

function formatDate(value) {
  if (!value) return "-";

  const raw = String(value);

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [y, m, d] = raw.split("-");
    return `${d}-${m}-${y}`;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return raw;
  }

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

function formatDateTime(value) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function todayISO() {
  const d = new Date();

  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function normalizeId(value) {
  return String(value || "").trim();
}

function getStoredEmployeeId() {
  try {
    return localStorage.getItem("texmo_employee_id") || "";
  } catch {
    return "";
  }
}

function storeEmployeeId(id) {
  try {
    localStorage.setItem(
      "texmo_employee_id",
      normalizeId(id)
    );
  } catch {}
}

function clearStoredEmployee() {
  try {
    localStorage.removeItem("texmo_employee_id");
  } catch {}
}

function isOnline() {
  return navigator.onLine !== false;
}

/* =========================================================
   API HELPER
========================================================= */

async function api(path, options = {}) {
  const config = {
    method: "GET",
    headers: {},
    ...options
  };

  if (!config.headers) {
    config.headers = {};
  }

  if (
    config.body &&
    typeof config.body !== "string" &&
    !(config.body instanceof FormData)
  ) {
    config.headers["Content-Type"] = "application/json";
    config.body = JSON.stringify(config.body);
  }

  let response;

  try {
    response = await fetch(API + path, config);
  } catch (error) {
    throw new Error(
      !isOnline()
        ? "Internet connection unavailable."
        : "Server connection failed. Please try again."
    );
  }

  const contentType =
    response.headers.get("content-type") || "";

  let data = null;

  try {
    if (contentType.includes("application/json")) {
      data = await response.json();
    } else {
      const text = await response.text();

      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }
  } catch {
    data = null;
  }

  if (!response.ok) {
    let errorMessage =
      data &&
      typeof data === "object" &&
      (data.error || data.message);

    if (!errorMessage && typeof data === "string") {
      errorMessage = data;
    }

    throw new Error(
      errorMessage ||
      `Server error (${response.status}).`
    );
  }

  if (
    data &&
    typeof data === "object" &&
    data.success === false
  ) {
    throw new Error(
      data.error ||
      data.message ||
      "Request was not successful."
    );
  }

  return data;
}

/* =========================================================
   SCREEN HELPERS
========================================================= */

function showScreen(id) {
  const screens = document.querySelectorAll(
    ".screen, [data-screen]"
  );

  screens.forEach((screen) => {
    const match =
      screen.id === id ||
      screen.dataset.screen === id;

    if (match) {
      screen.style.display = "";
      screen.classList.add("active");
    } else {
      screen.style.display = "none";
      screen.classList.remove("active");
    }
  });

  const direct = $(id);

  if (direct) {
    direct.style.display = "";
    direct.classList.add("active");
  }
}

/* =========================================================
   EMPLOYEE LOGIN
========================================================= */

async function employeeLogin() {
  if (employeeLoading) return;

  const employeeId = normalizeId(
    getValue("employeeLoginId") ||
    getValue("employeeId") ||
    getValue("loginEmployeeId")
  );

  const msg =
    firstElement(
      "employeeLoginMessage",
      "employeeLoginMsg",
      "loginMessage"
    );

  if (!employeeId) {
    message(
      msg,
      "Please enter Employee ID.",
      "error"
    );
    return;
  }

  employeeLoading = true;

  const button =
    document.activeElement &&
    document.activeElement.tagName === "BUTTON"
      ? document.activeElement
      : null;

  disableButton(
    button,
    true,
    "Checking..."
  );

  message(
    msg,
    "Checking employee details...",
    "info"
  );

  try {
    const employee = await api(
      `/api/employees/${encodeURIComponent(employeeId)}`
    );

    const data =
      employee?.employee ||
      employee?.data ||
      employee;

    if (
      !data ||
      data.success === false
    ) {
      throw new Error(
        employee?.error ||
        "Employee not found."
      );
    }

    currentEmployee = data;

    storeEmployeeId(
      data.employee_id ||
      data.id ||
      employeeId
    );

    showScreen("employeePortal");

    renderEmployee(data);

    await Promise.allSettled([
      loadMyRoom(),
      loadEmployeeLeave(),
      loadEmployeeVacate(),
      loadEmployeeCheckin(),
      loadEmployeeAttendance()
    ]);

    message(
      msg,
      "",
      "info"
    );
  } catch (error) {
    console.error("Employee login error:", error);

    message(
      msg,
      error.message ||
      "Employee login failed.",
      "error"
    );
  } finally {
    employeeLoading = false;
    disableButton(button, false);
  }
}

/* =========================================================
   EMPLOYEE REGISTRATION
========================================================= */

async function registerEmployee() {
  if (employeeRegistering) return;

  const employeeId = normalizeId(
    getValue("employeeId") ||
    getValue("registerEmployeeId")
  );

  const name = getValue(
    "employeeName"
  );

  const department = getValue(
    "employeeDepartment"
  );

  const designation = getValue(
    "employeeDesignation"
  );

  const phone = getValue(
    "employeePhone"
  );

  const shift = getSelectValue(
    "employeeShift"
  ) || getValue("employeeShift");

  const room =
    getSelectValue("employeeRoom") ||
    getValue("employeeRoom");

  const msg =
    firstElement(
      "employeeRegisterMessage",
      "employeeRegistrationMessage",
      "registerMessage"
    );

  if (!employeeId) {
    message(msg, "Employee ID is required.", "error");
    return;
  }

  if (!name) {
    message(msg, "Name is required.", "error");
    return;
  }

  if (!department) {
    message(msg, "Department is required.", "error");
    return;
  }

  if (!phone) {
    message(msg, "Phone number is required.", "error");
    return;
  }

  if (!room) {
    message(msg, "Please select a room.", "error");
    return;
  }

  employeeRegistering = true;

  const button =
    document.activeElement &&
    document.activeElement.tagName === "BUTTON"
      ? document.activeElement
      : null;

  disableButton(
    button,
    true,
    "Registering..."
  );

  message(
    msg,
    "Registering employee...",
    "info"
  );

  try {
    const result = await api(
      "/api/employees/register",
      {
        method: "POST",
        body: {
          employee_id: employeeId,
          name,
          department,
          designation,
          phone,
          shift,
          room
        }
      }
    );

    if (
      result &&
      result.success === false
    ) {
      throw new Error(
        result.error ||
        "Registration failed."
      );
    }

    message(
      msg,
      result?.message ||
      "Employee registered successfully.",
      "success"
    );

    const registeredEmployee =
      result?.employee ||
      result?.data ||
      null;

    if (registeredEmployee) {
      currentEmployee = registeredEmployee;
      storeEmployeeId(
        registeredEmployee.employee_id ||
        employeeId
      );

      setTimeout(() => {
        showScreen("employeePortal");
        renderEmployee(registeredEmployee);

        Promise.allSettled([
          loadMyRoom(),
          loadEmployeeLeave(),
          loadEmployeeVacate(),
          loadEmployeeCheckin()
        ]);
      }, 500);
    }
  } catch (error) {
    console.error(
      "Employee registration error:",
      error
    );

    message(
      msg,
      error.message ||
      "Registration failed.",
      "error"
    );
  } finally {
    employeeRegistering = false;
    disableButton(button, false);
  }
}

/* =========================================================
   EMPLOYEE RESTORE
========================================================= */

async function loadEmployee() {
  const employeeId = getStoredEmployeeId();

  if (!employeeId) return;

  try {
    const result = await api(
      `/api/employees/${encodeURIComponent(employeeId)}`
    );

    const employee =
      result?.employee ||
      result?.data ||
      result;

    if (
      !employee ||
      employee.success === false
    ) {
      clearStoredEmployee();
      return;
    }

    currentEmployee = employee;

    showScreen("employeePortal");

    renderEmployee(employee);

    await Promise.allSettled([
      loadMyRoom(),
      loadEmployeeLeave(),
      loadEmployeeVacate(),
      loadEmployeeCheckin(),
      loadEmployeeAttendance()
    ]);
  } catch (error) {
    console.warn(
      "Automatic employee restore failed:",
      error
    );
  }
}

/* =========================================================
   EMPLOYEE PROFILE
========================================================= */

function renderEmployee(employee) {
  if (!employee) return;

  const id =
    employee.employee_id ||
    employee.id ||
    "";

  const name =
    employee.name ||
    "";

  const department =
    employee.department ||
    "";

  const designation =
    employee.designation ||
    "";

  const phone =
    employee.phone ||
    "";

  const shift =
    employee.shift ||
    "";

  const room =
    employee.room ||
    employee.room_no ||
    employee.room_number ||
    "-";

  setText(
    "employeeProfileId",
    id
  );

  setText(
    "employeeProfileName",
    name
  );

  setText(
    "employeeProfileDepartment",
    department
  );

  setText(
    "employeeProfileDesignation",
    designation
  );

  setText(
    "employeeProfilePhone",
    phone
  );

  setText(
    "employeeProfileShift",
    shift
  );

  setText(
    "employeeProfileRoom",
    room
  );

  const containers = [
    "employeeProfile",
    "employeeDetails",
    "employeePortalProfile"
  ];

  for (const id of containers) {
    const el = $(id);

    if (!el) continue;

    if (
      el.dataset &&
      el.dataset.dynamicProfile === "true"
    ) {
      el.innerHTML = `
        <div class="profile-name">
          ${escapeHtml(name)}
        </div>
        <div>
          ID: ${escapeHtml(id)}
        </div>
        <div>
          Department: ${escapeHtml(department)}
        </div>
        <div>
          Designation: ${escapeHtml(designation)}
        </div>
        <div>
          Shift: ${escapeHtml(shift)}
        </div>
        <div>
          Room: ${escapeHtml(room)}
        </div>
      `;
    }
  }

  createEmployeeQR(
    employee.qr_token ||
    employee.qr ||
    employee.qr_data ||
    id
  );
}

/* =========================================================
   EMPLOYEE QR
========================================================= */

function createEmployeeQR(value) {
  const container =
    firstElement(
      "employeeQR",
      "employeeQr",
      "employeeQRCode",
      "employeeQrCode"
    );

  if (!container) return;

  container.innerHTML = "";

  if (!value) {
    container.textContent =
      "QR unavailable";
    return;
  }

  if (
    typeof window.QRCode === "undefined"
  ) {
    container.textContent =
      "QR library unavailable";
    console.warn(
      "QRCode library is not available in index.html."
    );
    return;
  }

  try {
    new QRCode(container, {
      text: String(value),
      width: 180,
      height: 180,
      correctLevel:
        window.QRCode.CorrectLevel
          ? window.QRCode.CorrectLevel.M
          : 0
    });
  } catch (error) {
    console.error(
      "Employee QR error:",
      error
    );

    container.textContent =
      "Unable to generate QR.";
  }
}

/* =========================================================
   MY ROOM
========================================================= */

async function loadMyRoom() {
  const employeeId =
    currentEmployee?.employee_id ||
    currentEmployee?.id ||
    getStoredEmployeeId();

  if (!employeeId) return;

  try {
    const result = await api(
      `/api/employee-room/${encodeURIComponent(employeeId)}`
    );

    const room =
      result?.room ||
      result?.data ||
      result;

    if (
      result &&
      result.success === false
    ) {
      renderMyRoomError(
        result.error ||
        "Unable to load room."
      );
      return;
    }

    renderMyRoom(room);
  } catch (error) {
    console.error(
      "My room error:",
      error
    );

    renderMyRoomError(
      error.message ||
      "Unable to load room."
    );
  }
}

function renderMyRoom(roomData) {
  const container =
    firstElement(
      "myRoom",
      "employeeMyRoom",
      "roomDetails",
      "employeeRoomDetails"
    );

  if (!container) return;

  if (!roomData) {
    renderMyRoomError(
      "Room details not available."
    );
    return;
  }

  const room =
    roomData.room ||
    roomData.room_no ||
    roomData.room_number ||
    roomData.name ||
    "-";

  const bed =
    roomData.bed_no ||
    roomData.bed ||
    roomData.bed_number ||
    "-";

  const block =
    roomData.block ||
    (
      room !== "-"
        ? String(room).charAt(0)
        : "-"
    );

  const capacity =
    roomData.capacity ??
    "-";

  const occupied =
    roomData.occupied ??
    roomData.occupancy ??
    "-";

  const status =
    roomData.hostel_status ||
    currentEmployee?.hostel_status ||
    "IN";

  container.innerHTML = `
    <div class="room-card">
      <div class="room-title">
        My Room
      </div>

      <div class="room-info">
        <div>
          <span>Block</span>
          <strong>${escapeHtml(block)}</strong>
        </div>

        <div>
          <span>Room</span>
          <strong>${escapeHtml(room)}</strong>
        </div>

        <div>
          <span>Bed</span>
          <strong>${escapeHtml(bed)}</strong>
        </div>

        <div>
          <span>Status</span>
          <strong>${escapeHtml(status)}</strong>
        </div>

        <div>
          <span>Capacity</span>
          <strong>${escapeHtml(capacity)}</strong>
        </div>

        <div>
          <span>Occupied</span>
          <strong>${escapeHtml(occupied)}</strong>
        </div>
      </div>
    </div>
  `;
}

function renderMyRoomError(errorText) {
  const container =
    firstElement(
      "myRoom",
      "employeeMyRoom",
      "roomDetails",
      "employeeRoomDetails"
    );

  if (!container) return;

  container.innerHTML = `
    <div class="room-error">
      ${escapeHtml(
        errorText ||
        "Room details unavailable."
      )}
    </div>
  `;
}

/* =========================================================
   LEAVE
========================================================= */

async function submitEmployeeLeave() {
  if (leaveSubmitting) return;

  const employeeId =
    currentEmployee?.employee_id ||
    currentEmployee?.id ||
    getStoredEmployeeId();

  if (!employeeId) {
    message(
      "employeeLeaveMessage",
      "Please login first.",
      "error"
    );
    return;
  }

  const fromDate =
    getValue("employeeLeaveFrom") ||
    getValue("employeeLeaveStartDate") ||
    getValue("leaveFromDate");

  const toDate =
    getValue("employeeLeaveTo") ||
    getValue("employeeLeaveEndDate") ||
    getValue("leaveToDate");

  const reason =
    getValue("employeeLeaveReason") ||
    getValue("leaveReason");

  const roomVacate =
    firstElement(
      "employeeLeaveRoomVacate",
      "leaveRoomVacate"
    );

  const wantsRoomVacate =
    roomVacate
      ? !!roomVacate.checked
      : false;

  const msg =
    firstElement(
      "employeeLeaveMessage",
      "employeeLeaveMsg",
      "leaveMessage"
    );

  if (!fromDate || !toDate) {
    message(
      msg,
      "Please select leave start and end dates.",
      "error"
    );
    return;
  }

  if (toDate < fromDate) {
    message(
      msg,
      "Leave end date cannot be before start date.",
      "error"
    );
    return;
  }

  leaveSubmitting = true;

  message(
    msg,
    "Submitting leave request...",
    "info"
  );

  try {
    const result = await api(
      "/api/leave",
      {
        method: "POST",
        body: {
          employee_id: employeeId,
          from_date: fromDate,
          to_date: toDate,
          start_date: fromDate,
          end_date: toDate,
          reason,
          room_vacate: wantsRoomVacate
        }
      }
    );

    message(
      msg,
      result?.message ||
      "Leave request submitted successfully.",
      "success"
    );

    await Promise.allSettled([
      loadEmployeeLeave(),
      loadEmployeeVacate()
    ]);
  } catch (error) {
    console.error(
      "Leave submission error:",
      error
    );

    message(
      msg,
      error.message ||
      "Unable to submit leave.",
      "error"
    );
  } finally {
    leaveSubmitting = false;
  }
}

async function loadEmployeeLeave() {
  const employeeId =
    currentEmployee?.employee_id ||
    currentEmployee?.id ||
    getStoredEmployeeId();

  if (!employeeId) return;

  try {
    const result = await api(
      `/api/leave/${encodeURIComponent(employeeId)}`
    );

    const records =
      result?.records ||
      result?.leaves ||
      result?.data ||
      [];

    renderEmployeeLeave(records);
  } catch (error) {
    console.warn(
      "Leave history error:",
      error
    );
  }
}

function renderEmployeeLeave(records) {
  const container =
    firstElement(
      "employeeLeaveHistory",
      "leaveHistory"
    );

  if (!container) return;

  if (!Array.isArray(records) || !records.length) {
    container.innerHTML =
      `<div class="empty-state">No leave records.</div>`;
    return;
  }

  container.innerHTML = records
    .map((item) => {
      const status =
        item.status ||
        item.approval_status ||
        "PENDING";

      return `
        <div class="history-item">
          <strong>
            ${escapeHtml(
              item.reason ||
              "Leave"
            )}
          </strong>

          <div>
            ${escapeHtml(
              formatDate(
                item.from_date ||
                item.start_date
              )
            )}
            →
            ${escapeHtml(
              formatDate(
                item.to_date ||
                item.end_date
              )
            )}
          </div>

          <div>
            Status:
            <strong>
              ${escapeHtml(status)}
            </strong>
          </div>

          ${
            item.room_vacate
              ? `<div>Room Vacate: Yes</div>`
              : ""
          }
        </div>
      `;
    })
    .join("");
}

/* =========================================================
   DIRECT VACATE
========================================================= */

async function submitEmployeeVacate() {
  if (vacateSubmitting) return;

  const employeeId =
    currentEmployee?.employee_id ||
    currentEmployee?.id ||
    getStoredEmployeeId();

  if (!employeeId) {
    message(
      "employeeVacateMessage",
      "Please login first.",
      "error"
    );
    return;
  }

  const vacateDate =
    getValue("employeeVacateDate");

  const returnDate =
    getValue("employeeReturnDate");

  const reason =
    getValue("employeeVacateReason");

  const msg =
    firstElement(
      "employeeVacateMessage",
      "employeeVacateMsg"
    );

  if (!vacateDate) {
    message(
      msg,
      "Please select vacate date.",
      "error"
    );
    return;
  }

  if (!returnDate) {
    message(
      msg,
      "Please select expected return date.",
      "error"
    );
    return;
  }

  if (returnDate < vacateDate) {
    message(
      msg,
      "Return date cannot be before vacate date.",
      "error"
    );
    return;
  }

  vacateSubmitting = true;

  message(
    msg,
    "Submitting room vacate request...",
    "info"
  );

  try {
    const result = await api(
      "/api/vacate",
      {
        method: "POST",
        body: {
          employee_id: employeeId,
          vacate_date: vacateDate,
          return_date: returnDate,
          reason
        }
      }
    );

    message(
      msg,
      result?.message ||
      "Vacate request submitted successfully. HR approval required.",
      "success"
    );

    await Promise.allSettled([
      loadEmployeeVacate(),
      loadMyRoom()
    ]);
  } catch (error) {
    console.error(
      "Vacate submission error:",
      error
    );

    message(
      msg,
      error.message ||
      "Unable to submit vacate request.",
      "error"
    );
  } finally {
    vacateSubmitting = false;
  }
}

async function loadEmployeeVacate() {
  const employeeId =
    currentEmployee?.employee_id ||
    currentEmployee?.id ||
    getStoredEmployeeId();

  if (!employeeId) return;

  try {
    const result = await api(
      `/api/vacate/${encodeURIComponent(employeeId)}`
    );

    const records =
      result?.records ||
      result?.vacates ||
      result?.data ||
      [];

    renderEmployeeVacate(records);
  } catch (error) {
    console.warn(
      "Vacate history error:",
      error
    );
  }
}

function renderEmployeeVacate(records) {
  const container =
    firstElement(
      "employeeVacateHistory",
      "vacateHistory"
    );

  if (!container) return;

  if (!Array.isArray(records) || !records.length) {
    container.innerHTML =
      `<div class="empty-state">No vacate requests.</div>`;
    return;
  }

  container.innerHTML = records
    .map((item) => {
      const status =
        item.status ||
        item.approval_status ||
        "PENDING";

      return `
        <div class="history-item">
          <strong>Room Vacate</strong>

          <div>
            Vacate:
            ${escapeHtml(
              formatDate(
                item.vacate_date
              )
            )}
          </div>

          <div>
            Return:
            ${escapeHtml(
              formatDate(
                item.return_date
              )
            )}
          </div>

          ${
            item.reason
              ? `<div>
                   Reason:
                   ${escapeHtml(item.reason)}
                 </div>`
              : ""
          }

          <div>
            Status:
            <strong>
              ${escapeHtml(status)}
            </strong>
          </div>

          ${
            item.created_at
              ? `<div>
                   Requested:
                   ${escapeHtml(
                     formatDateTime(
                       item.created_at
                     )
                   )}
                 </div>`
              : ""
          }
        </div>
      `;
    })
    .join("");
}

/* =========================================================
   CHECK-IN
========================================================= */

async function submitEmployeeCheckin() {
  if (checkinSubmitting) return;

  const employeeId =
    currentEmployee?.employee_id ||
    currentEmployee?.id ||
    getStoredEmployeeId();

  if (!employeeId) {
    message(
      "employeeCheckinMessage",
      "Please login first.",
      "error"
    );
    return;
  }

  const room =
    getSelectValue("employeeCheckinRoom") ||
    getValue("employeeCheckinRoom") ||
    getValue("checkinRoom");

  const date =
    getValue("employeeCheckinDate") ||
    todayISO();

  const reason =
    getValue("employeeCheckinReason") ||
    getValue("checkinReason");

  const msg =
    firstElement(
      "employeeCheckinMessage",
      "employeeCheckinMsg",
      "checkinMessage"
    );

  checkinSubmitting = true;

  message(
    msg,
    "Submitting check-in request...",
    "info"
  );

  try {
    const result = await api(
      "/api/checkin",
      {
        method: "POST",
        body: {
          employee_id: employeeId,
          room,
          checkin_date: date,
          reason
        }
      }
    );

    message(
      msg,
      result?.message ||
      "Check-in request submitted. HR approval required.",
      "success"
    );

    await loadEmployeeCheckin();
  } catch (error) {
    console.error(
      "Check-in submission error:",
      error
    );

    message(
      msg,
      error.message ||
      "Unable to submit check-in request.",
      "error"
    );
  } finally {
    checkinSubmitting = false;
  }
}

async function loadEmployeeCheckin() {
  const employeeId =
    currentEmployee?.employee_id ||
    currentEmployee?.id ||
    getStoredEmployeeId();

  if (!employeeId) return;

  try {
    const result = await api(
      `/api/checkin/${encodeURIComponent(employeeId)}`
    );

    const records =
      result?.records ||
      result?.checkins ||
      result?.data ||
      [];

    renderEmployeeCheckin(records);
  } catch (error) {
    console.warn(
      "Check-in history error:",
      error
    );
  }
}

function renderEmployeeCheckin(records) {
  const container =
    firstElement(
      "employeeCheckinHistory",
      "checkinHistory"
    );

  if (!container) return;

  if (!Array.isArray(records) || !records.length) {
    container.innerHTML =
      `<div class="empty-state">No check-in requests.</div>`;
    return;
  }

  container.innerHTML = records
    .map((item) => {
      const status =
        item.status ||
        item.approval_status ||
        "PENDING";

      return `
        <div class="history-item">
          <strong>Check-In Request</strong>

          ${
            item.room
              ? `<div>
                   Room:
                   ${escapeHtml(item.room)}
                 </div>`
              : ""
          }

          ${
            item.checkin_date
              ? `<div>
                   Date:
                   ${escapeHtml(
                     formatDate(
                       item.checkin_date
                     )
                   )}
                 </div>`
              : ""
          }

          <div>
            Status:
            <strong>
              ${escapeHtml(status)}
            </strong>
          </div>
        </div>
      `;
    })
    .join("");
}

/* =========================================================
   HR LOGIN
========================================================= */

async function hrLogin() {
  if (hrLoggingIn) return;

  const username =
    getValue("hrUsername") ||
    getValue("hrUser") ||
    getValue("username");

  const password =
    getValue("hrPassword") ||
    getValue("hrPass") ||
    getValue("password");

  const msg =
    firstElement(
      "hrLoginMessage",
      "hrLoginMsg",
      "hrMessage"
    );

  if (!username || !password) {
    message(
      msg,
      "Enter HR username and password.",
      "error"
    );
    return;
  }

  hrLoggingIn = true;

  message(
    msg,
    "Checking HR login...",
    "info"
  );

  try {
    const result = await api(
      "/api/hr/login",
      {
        method: "POST",
        body: {
          username,
          password
        }
      }
    );

    if (
      result &&
      result.success === false
    ) {
      throw new Error(
        result.error ||
        "Invalid HR login."
      );
    }

    try {
      localStorage.setItem(
        "texmo_hr_login",
        "true"
      );
    } catch {}

    showScreen("hrPortal");

    await loadHRDashboard();

    message(
      msg,
      "",
      "info"
    );
  } catch (error) {
    console.error(
      "HR login error:",
      error
    );

    message(
      msg,
      error.message ||
      "HR login failed.",
      "error"
    );
  } finally {
    hrLoggingIn = false;
  }
}

/* =========================================================
   HR DASHBOARD
========================================================= */

async function loadHRDashboard() {
  await Promise.allSettled([
    loadCabDashboard(),
    loadEmployees(),
    loadHRVacates(),
    loadHRCheckins()
  ]);
}

async function loadCabDashboard() {
  try {
    const result = await api(
      "/api/cab/dashboard"
    );

    const data =
      result?.dashboard ||
      result?.data ||
      result;

    if (!data) return;

    const total =
      data.total ??
      data.total_entries ??
      data.count ??
      0;

    const today =
      data.today ??
      data.today_entries ??
      0;

    const cabCount =
      data.cab_count ??
      data.cabs ??
      0;

    setText(
      "cabTotal",
      total
    );

    setText(
      "cabToday",
      today
    );

    setText(
      "cabCount",
      cabCount
    );

    renderCabDashboard(data);
  } catch (error) {
    console.warn(
      "Cab dashboard error:",
      error
    );
  }
}

function renderCabDashboard(data) {
  const container =
    firstElement(
      "cabDashboard",
      "cabDashboardDetails"
    );

  if (!container) return;

  if (
    data &&
    Array.isArray(data.cabs)
  ) {
    container.innerHTML =
      data.cabs
        .map((cab) => `
          <div class="cab-card">
            <strong>
              ${escapeHtml(
                cab.cab_no ||
                cab.cab ||
                cab.name ||
                "Cab"
              )}
            </strong>

            <div>
              Seats:
              ${escapeHtml(
                cab.count ??
                cab.entries ??
                0
              )}
            </div>
          </div>
        `)
        .join("");
  }
}

/* =========================================================
   HR EMPLOYEE LIST
========================================================= */

async function loadEmployees() {
  try {
    const result = await api(
      "/api/employees"
    );

    const employees =
      result?.employees ||
      result?.data ||
      (
        Array.isArray(result)
          ? result
          : []
      );

    renderEmployees(employees);

    return employees;
  } catch (error) {
    console.error(
      "Employee list error:",
      error
    );

    message(
      firstElement(
        "employeeListMessage",
        "employeesMessage"
      ),
      error.message ||
      "Unable to load employees.",
      "error"
    );

    return [];
  }
}

function renderEmployees(employees) {
  const container =
    firstElement(
      "employeeList",
      "employeesList",
      "hrEmployeeList"
    );

  if (!container) return;

  if (
    !Array.isArray(employees) ||
    !employees.length
  ) {
    container.innerHTML =
      `<div class="empty-state">No employees found.</div>`;
    return;
  }

  container.innerHTML = employees
    .map((employee) => `
      <div class="employee-row">

        <div>
          <strong>
            ${escapeHtml(
              employee.name ||
              "-"
            )}
          </strong>

          <small>
            ID:
            ${escapeHtml(
              employee.employee_id ||
              employee.id ||
              "-"
            )}
          </small>
        </div>

        <div>
          ${escapeHtml(
            employee.department ||
            "-"
          )}
        </div>

        <div>
          Room:
          ${escapeHtml(
            employee.room ||
            employee.room_no ||
            "-"
          )}
        </div>

        <div>
          Status:
          ${escapeHtml(
            employee.hostel_status ||
            employee.status ||
            "-"
          )}
        </div>

      </div>
    `)
    .join("");
}

/* =========================================================
   HR VACATE
========================================================= */

async function loadHRVacates() {
  try {
    const result = await api(
      "/api/hr/vacates"
    );

    const records =
      result?.records ||
      result?.vacates ||
      result?.data ||
      (
        Array.isArray(result)
          ? result
          : []
      );

    renderHRVacates(records);
    updateVacateCounts(records);

    return records;
  } catch (error) {
    console.error(
      "HR vacate error:",
      error
    );

    message(
      firstElement(
        "hrVacateMessage",
        "vacateHRMessage"
      ),
      error.message ||
      "Unable to load vacate requests.",
      "error"
    );

    return [];
  }
}

function updateVacateCounts(records) {
  if (!Array.isArray(records)) return;

  const pending = records.filter(
    (x) =>
      String(
        x.status ||
        x.approval_status ||
        ""
      ).toUpperCase() === "PENDING"
  ).length;

  const approved = records.filter(
    (x) =>
      String(
        x.status ||
        x.approval_status ||
        ""
      ).toUpperCase() === "APPROVED"
  ).length;

  const rejected = records.filter(
    (x) =>
      String(
        x.status ||
        x.approval_status ||
        ""
      ).toUpperCase() === "REJECTED"
  ).length;

  setText(
    "hrVacatePendingCount",
    pending
  );

  setText(
    "hrVacateApprovedCount",
    approved
  );

  setText(
    "hrVacateRejectedCount",
    rejected
  );

  setText(
    "vacatePendingCount",
    pending
  );

  setText(
    "vacateApprovedCount",
    approved
  );

  setText(
    "vacateRejectedCount",
    rejected
  );
}

function renderHRVacates(records) {
  const container =
    firstElement(
      "hrVacateList",
      "hrVacates",
      "vacateRequestsList"
    );

  if (!container) return;

  if (
    !Array.isArray(records) ||
    !records.length
  ) {
    container.innerHTML =
      `<div class="empty-state">No room vacate requests.</div>`;
    return;
  }

  container.innerHTML = records
    .map((item) => {
      const status = String(
        item.status ||
        item.approval_status ||
        "PENDING"
      ).toUpperCase();

      const id =
        item.id ??
        item.vacate_id ??
        "";

      const employeeId =
        item.employee_id ??
        "-";

      return `
        <div class="vacate-request">

          <div>
            <strong>
              ${escapeHtml(
                item.name ||
                item.employee_name ||
                "Employee"
              )}
            </strong>
          </div>

          <div>
            Employee ID:
            ${escapeHtml(employeeId)}
          </div>

          <div>
            Room:
            ${escapeHtml(
              item.room ||
              item.room_no ||
              "-"
            )}
          </div>

          <div>
            Vacate:
            ${escapeHtml(
              formatDate(
                item.vacate_date
              )
            )}
          </div>

          <div>
            Return:
            ${escapeHtml(
              formatDate(
                item.return_date
              )
            )}
          </div>

          ${
            item.reason
              ? `<div>
                   Reason:
                   ${escapeHtml(item.reason)}
                 </div>`
              : ""
          }

          <div>
            Status:
            <strong>
              ${escapeHtml(status)}
            </strong>
          </div>

          ${
            status === "PENDING"
              ? `
                <div class="request-actions">
                  <button
                    type="button"
                    onclick="approveHRVacate(${Number(id)})"
                  >
                    Approve
                  </button>

                  <button
                    type="button"
                    onclick="rejectHRVacate(${Number(id)})"
                  >
                    Reject
                  </button>
                </div>
              `
              : ""
          }

        </div>
      `;
    })
    .join("");
}

async function approveHRVacate(id) {
  if (!id) return;

  if (
    !window.confirm(
      "Approve this temporary room vacate request?"
    )
  ) {
    return;
  }

  try {
    const result = await api(
      `/api/hr/vacates/${encodeURIComponent(id)}/approve`,
      {
        method: "POST",
        body: {}
      }
    );

    alert(
      result?.message ||
      "Vacate request approved."
    );

    await Promise.allSettled([
      loadHRVacates(),
      loadEmployees(),
      loadHRDashboard()
    ]);
  } catch (error) {
    console.error(
      "Approve vacate error:",
      error
    );

    alert(
      error.message ||
      "Unable to approve vacate request."
    );
  }
}

async function rejectHRVacate(id) {
  if (!id) return;

  if (
    !window.confirm(
      "Reject this temporary room vacate request?"
    )
  ) {
    return;
  }

  try {
    const result = await api(
      `/api/hr/vacates/${encodeURIComponent(id)}/reject`,
      {
        method: "POST",
        body: {}
      }
    );

    alert(
      result?.message ||
      "Vacate request rejected."
    );

    await loadHRVacates();
  } catch (error) {
    console.error(
      "Reject vacate error:",
      error
    );

    alert(
      error.message ||
      "Unable to reject vacate request."
    );
  }
}

/* =========================================================
   HR CHECK-IN
========================================================= */

async function loadHRCheckins() {
  try {
    const result = await api(
      "/api/hr/checkins"
    );

    const records =
      result?.records ||
      result?.checkins ||
      result?.data ||
      (
        Array.isArray(result)
          ? result
          : []
      );

    renderHRCheckins(records);

    return records;
  } catch (error) {
    console.warn(
      "HR check-in error:",
      error
    );

    return [];
  }
}

function renderHRCheckins(records) {
  const container =
    firstElement(
      "hrCheckinList",
      "hrCheckins",
      "checkinRequestsList"
    );

  if (!container) return;

  if (
    !Array.isArray(records) ||
    !records.length
  ) {
    container.innerHTML =
      `<div class="empty-state">No check-in requests.</div>`;
    return;
  }

  container.innerHTML = records
    .map((item) => {
      const status =
        item.status ||
        item.approval_status ||
        "PENDING";

      return `
        <div class="checkin-request">

          <strong>
            ${escapeHtml(
              item.name ||
              item.employee_name ||
              item.employee_id ||
              "Employee"
            )}
          </strong>

          <div>
            ID:
            ${escapeHtml(
              item.employee_id ||
              "-"
            )}
          </div>

          ${
            item.room
              ? `<div>
                   Requested Room:
                   ${escapeHtml(item.room)}
                 </div>`
              : ""
          }

          ${
            item.checkin_date
              ? `<div>
                   Date:
                   ${escapeHtml(
                     formatDate(
                       item.checkin_date
                     )
                   )}
                 </div>`
              : ""
          }

          <div>
            Status:
            <strong>
              ${escapeHtml(status)}
            </strong>
          </div>

        </div>
      `;
    })
    .join("");
}

/* =========================================================
   SCANNER
========================================================= */

async function startScanner() {
  if (scannerStream) {
    return;
  }

  const video =
    firstElement(
      "scannerVideo",
      "cabScannerVideo",
      "qrScannerVideo"
    );

  const messageEl =
    firstElement(
      "scannerMessage",
      "cabScannerMessage"
    );

  if (!video) {
    message(
      messageEl,
      "Scanner camera area not found.",
      "error"
    );
    return;
  }

  if (
    !navigator.mediaDevices ||
    !navigator.mediaDevices.getUserMedia
  ) {
    message(
      messageEl,
      "Camera is not supported in this browser.",
      "error"
    );
    return;
  }

  scannerBusy = false;

  message(
    messageEl,
    "Starting camera...",
    "info"
  );

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

    video.setAttribute(
      "playsinline",
      "true"
    );

    await video.play();

    if (
      "BarcodeDetector" in window
    ) {
      try {
        scannerDetector =
          new BarcodeDetector({
            formats: [
              "qr_code"
            ]
          });
      } catch {
        scannerDetector = null;
      }
    }

    if (scannerDetector) {
      scanWithBarcodeDetector(
        video,
        messageEl
      );
    } else {
      await loadJsQR();

      if (
        typeof window.jsQR ===
        "function"
      ) {
        scanWithJsQR(
          video,
          messageEl
        );
      } else {
        message(
          messageEl,
          "QR scanner library unavailable.",
          "error"
        );
      }
    }

    message(
      messageEl,
      "Point the camera at the employee QR.",
      "info"
    );
  } catch (error) {
    console.error(
      "Scanner start error:",
      error
    );

    stopScanner();

    message(
      messageEl,
      error.message ||
      "Unable to access camera. Please allow camera permission.",
      "error"
    );
  }
}

function stopScanner() {
  scannerBusy = false;

  if (scannerTimer) {
    clearTimeout(scannerTimer);
    scannerTimer = null;
  }

  if (scannerStream) {
    scannerStream
      .getTracks()
      .forEach((track) => {
        try {
          track.stop();
        } catch {}
      });

    scannerStream = null;
  }

  const video =
    firstElement(
      "scannerVideo",
      "cabScannerVideo",
      "qrScannerVideo"
    );

  if (video) {
    try {
      video.pause();
    } catch {}

    video.srcObject = null;
  }

  scannerDetector = null;
}

async function scanWithBarcodeDetector(
  video,
  messageEl
) {
  if (!scannerDetector) return;

  if (!scannerStream) return;

  try {
    const codes =
      await scannerDetector.detect(
        video
      );

    if (
      codes &&
      codes.length &&
      codes[0].rawValue
    ) {
      await processCabScan(
        codes[0].rawValue
      );
      return;
    }
  } catch (error) {
    console.warn(
      "Barcode detection:",
      error
    );
  }

  scannerTimer = setTimeout(
    () =>
      scanWithBarcodeDetector(
        video,
        messageEl
      ),
    400
  );
}

async function loadJsQR() {
  if (
    typeof window.jsQR ===
    "function"
  ) {
    jsQRLoaded = true;
    return true;
  }

  if (jsQRLoading) {
    return new Promise((resolve) => {
      const started = Date.now();

      const timer =
        setInterval(() => {
          if (
            typeof window.jsQR ===
            "function"
          ) {
            clearInterval(timer);
            jsQRLoaded = true;
            resolve(true);
            return;
          }

          if (
            Date.now() - started >
            10000
          ) {
            clearInterval(timer);
            resolve(false);
          }
        }, 100);
    });
  }

  jsQRLoading = true;

  try {
    await new Promise(
      (resolve, reject) => {
        const script =
          document.createElement(
            "script"
          );

        script.src =
          "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js";

        script.onload = resolve;

        script.onerror = () =>
          reject(
            new Error(
              "Unable to load QR scanner library."
            )
          );

        document.head.appendChild(
          script
        );
      }
    );

    jsQRLoaded =
      typeof window.jsQR ===
      "function";

    return jsQRLoaded;
  } catch (error) {
    console.error(
      "jsQR loading error:",
      error
    );

    jsQRLoaded = false;
    return false;
  } finally {
    jsQRLoading = false;
  }
}

function scanWithJsQR(
  video,
  messageEl
) {
  if (!scannerStream) return;

  const canvas =
    firstElement(
      "scannerCanvas",
      "cabScannerCanvas",
      "qrScannerCanvas"
    );

  if (!canvas) {
    message(
      messageEl,
      "Scanner canvas not found.",
      "error"
    );
    return;
  }

  const context =
    canvas.getContext("2d", {
      willReadFrequently: true
    });

  if (!context) {
    message(
      messageEl,
      "Scanner canvas is unavailable.",
      "error"
    );
    return;
  }

  const width =
    video.videoWidth ||
    640;

  const height =
    video.videoHeight ||
    480;

  if (
    canvas.width !== width
  ) {
    canvas.width = width;
  }

  if (
    canvas.height !== height
  ) {
    canvas.height = height;
  }

  try {
    context.drawImage(
      video,
      0,
      0,
      width,
      height
    );

    const imageData =
      context.getImageData(
        0,
        0,
        width,
        height
      );

    const code =
      window.jsQR(
        imageData.data,
        width,
        height,
        {
          inversionAttempts:
            "attemptBoth"
        }
      );

    if (
      code &&
      code.data
    ) {
      processCabScan(
        code.data
      );
      return;
    }
  } catch (error) {
    console.warn(
      "jsQR scan error:",
      error
    );
  }

  scannerTimer = setTimeout(
    () =>
      scanWithJsQR(
        video,
        messageEl
      ),
    350
  );
}

/* =========================================================
   CAB SCAN
========================================================= */

async function processCabScan(
  qrValue
) {
  if (scannerBusy) return;

  const value =
    String(qrValue || "").trim();

  if (!value) return;

  scannerBusy = true;

  const msg =
    firstElement(
      "scannerMessage",
      "cabScannerMessage"
    );

  message(
    msg,
    "QR detected. Saving cab entry...",
    "info"
  );

  try {
    const result = await api(
      "/api/cab/scan",
      {
        method: "POST",
        body: {
          qr_data: value,
          qr_token: value,
          cab_qr: value,
          scanned_at:
            new Date().toISOString()
        }
      }
    );

    message(
      msg,
      result?.message ||
      "Cab entry saved successfully.",
      "success"
    );

    await Promise.allSettled([
      loadCabDashboard(),
      loadEmployees()
    ]);
  } catch (error) {
    console.error(
      "Cab scan error:",
      error
    );

    message(
      msg,
      error.message ||
      "Unable to save cab scan.",
      "error"
    );
  } finally {
    setTimeout(() => {
      scannerBusy = false;
    }, 1200);
  }
}

/* =========================================================
   EXCEL / CSV DOWNLOAD HELPERS
========================================================= */

async function downloadFile(
  endpoint,
  filename
) {
  try {
    const response =
      await fetch(API + endpoint);

    if (!response.ok) {
      throw new Error(
        `Download failed (${response.status}).`
      );
    }

    const blob =
      await response.blob();

    const url =
      URL.createObjectURL(blob);

    const a =
      document.createElement("a");

    a.href = url;
    a.download =
      filename ||
      "texmo-export.xlsx";

    document.body.appendChild(a);

    a.click();

    a.remove();

    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 1000);
  } catch (error) {
    console.error(
      "Download error:",
      error
    );

    alert(
      error.message ||
      "Unable to download file."
    );
  }
}

function downloadCabExcel() {
  return downloadFile(
    "/api/cab/export",
    "texmo-cab-history.xlsx"
  );
}

function downloadRoomsExcel() {
  return downloadFile(
    "/api/rooms/export",
    "texmo-room-history.xlsx"
  );
}

function downloadShiftsExcel() {
  return downloadFile(
    "/api/shifts/export",
    "texmo-shifts.xlsx"
  );
}

function downloadAttendanceExcel() {
  return downloadFile(
    "/api/attendance/export",
    "texmo-attendance.xlsx"
  );
}

function downloadLeaveExcel() {
  return downloadFile(
    "/api/leave/export",
    "texmo-leave.xlsx"
  );
}

function downloadVacateExcel() {
  return downloadFile(
    "/api/vacate/export",
    "texmo-vacate.xlsx"
  );
}

function downloadFoodExcel() {
  return downloadFile(
    "/api/food/export",
    "texmo-food.xlsx"
  );
}

/* =========================================================
   FOOD QR
========================================================= */

function generateFoodQR() {
  const container =
    firstElement(
      "foodQR",
      "foodQr",
      "foodQRCode",
      "foodQrCode"
    );

  if (!container) return;

  container.innerHTML = "";

  if (
    typeof window.QRCode ===
    "undefined"
  ) {
    container.textContent =
      "QR library unavailable.";
    return;
  }

  const url =
    `${window.location.origin}/food`;

  try {
    new QRCode(container, {
      text: url,
      width: 180,
      height: 180,
      correctLevel:
        window.QRCode.CorrectLevel
          ? window.QRCode.CorrectLevel.M
          : 0
    });
  } catch (error) {
    console.error(
      "Food QR error:",
      error
    );

    container.textContent =
      "Unable to generate food QR.";
  }
}

/* =========================================================
   SHIFT
========================================================= */

async function saveEmployeeShift() {
  const employeeId =
    currentEmployee?.employee_id ||
    currentEmployee?.id ||
    getStoredEmployeeId();

  if (!employeeId) {
    alert(
      "Please login first."
    );
    return;
  }

  const shift =
    getSelectValue(
      "employeeShiftSelect"
    ) ||
    getSelectValue(
      "employeeShift"
    ) ||
    getValue(
      "employeeShiftSelect"
    );

  if (!shift) {
    alert(
      "Please select a shift."
    );
    return;
  }

  try {
    const result = await api(
      "/api/shifts",
      {
        method: "POST",
        body: {
          employee_id: employeeId,
          shift
        }
      }
    );

    alert(
      result?.message ||
      "Shift saved successfully."
    );

    currentEmployee.shift =
      shift;

    renderEmployee(
      currentEmployee
    );
  } catch (error) {
    console.error(
      "Shift save error:",
      error
    );

    alert(
      error.message ||
      "Unable to save shift."
    );
  }
}

/* =========================================================
   ATTENDANCE
========================================================= */

async function loadEmployeeAttendance() {
  const employeeId =
    currentEmployee?.employee_id ||
    currentEmployee?.id ||
    getStoredEmployeeId();

  if (!employeeId) return;

  try {
    const result = await api(
      `/api/attendance/${encodeURIComponent(employeeId)}`
    );

    const records =
      result?.records ||
      result?.attendance ||
      result?.data ||
      [];

    renderEmployeeAttendance(
      records
    );
  } catch (error) {
    console.warn(
      "Attendance error:",
      error
    );
  }
}

function renderEmployeeAttendance(
  records
) {
  const container =
    firstElement(
      "employeeAttendanceHistory",
      "attendanceHistory",
      "employeeAttendance"
    );

  if (!container) return;

  if (
    !Array.isArray(records) ||
    !records.length
  ) {
    container.innerHTML =
      `<div class="empty-state">No attendance records.</div>`;
    return;
  }

  container.innerHTML =
    records
      .map((item) => `
        <div class="history-item">

          <strong>
            ${escapeHtml(
              formatDate(
                item.date ||
                item.attendance_date
              )
            )}
          </strong>

          <div>
            Status:
            ${escapeHtml(
              item.status ||
              "-"
            )}
          </div>

          ${
            item.check_in
              ? `<div>
                   In:
                   ${escapeHtml(
                     formatDateTime(
                       item.check_in
                     )
                   )}
                 </div>`
              : ""
          }

          ${
            item.check_out
              ? `<div>
                   Out:
                   ${escapeHtml(
                     formatDateTime(
                       item.check_out
                     )
                   )}
                 </div>`
              : ""
          }

        </div>
      `)
      .join("");
}

/* =========================================================
   EMPLOYEE TABS
========================================================= */

function texmoEmployeeTab(tabName) {
  if (!tabName) return;

  const buttons =
    document.querySelectorAll(
      "[data-employee-tab]"
    );

  buttons.forEach((button) => {
    button.classList.toggle(
      "active",
      button.dataset.employeeTab ===
      tabName
    );
  });

  const panels =
    document.querySelectorAll(
      "[data-employee-panel]"
    );

  let found = false;

  panels.forEach((panel) => {
    const active =
      panel.dataset.employeePanel ===
      tabName;

    panel.style.display =
      active ? "" : "none";

    panel.classList.toggle(
      "active",
      active
    );

    if (active) {
      found = true;
    }
  });

  const direct =
    $(tabName);

  if (
    !found &&
    direct
  ) {
    document
      .querySelectorAll(
        ".employee-tab-content"
      )
      .forEach((panel) => {
        panel.style.display =
          "none";
      });

    direct.style.display =
      "";
  }

  if (
    tabName === "employeeRoom" ||
    tabName === "room"
  ) {
    loadMyRoom();
  }

  if (
    tabName === "employeeLeave" ||
    tabName === "leave"
  ) {
    loadEmployeeLeave();
  }

  if (
    tabName === "employeeVacate" ||
    tabName === "vacate"
  ) {
    loadEmployeeVacate();
  }

  if (
    tabName === "employeeCheckin" ||
    tabName === "checkin"
  ) {
    loadEmployeeCheckin();
  }

  if (
    tabName === "employeeAttendance" ||
    tabName === "attendance"
  ) {
    loadEmployeeAttendance();
  }

  if (
    tabName === "employeeFood" ||
    tabName === "food"
  ) {
    generateFoodQR();
  }
}

/* =========================================================
   HR TABS
========================================================= */

function texmoHRTab(tabName) {
  if (!tabName) return;

  const buttons =
    document.querySelectorAll(
      "[data-hr-tab]"
    );

  buttons.forEach((button) => {
    button.classList.toggle(
      "active",
      button.dataset.hrTab ===
      tabName
    );
  });

  const panels =
    document.querySelectorAll(
      "[data-hr-panel]"
    );

  let found = false;

  panels.forEach((panel) => {
    const active =
      panel.dataset.hrPanel ===
      tabName;

    panel.style.display =
      active ? "" : "none";

    panel.classList.toggle(
      "active",
      active
    );

    if (active) {
      found = true;
    }
  });

  const direct =
    $(tabName);

  if (
    !found &&
    direct
  ) {
    document
      .querySelectorAll(
        ".hr-tab-content"
      )
      .forEach((panel) => {
        panel.style.display =
          "none";
      });

    direct.style.display =
      "";
  }

  if (
    tabName === "employees" ||
    tabName === "hrEmployees"
  ) {
    loadEmployees();
  }

  if (
    tabName === "cab" ||
    tabName === "hrCab"
  ) {
    loadCabDashboard();
  }

  if (
    tabName === "vacate" ||
    tabName === "hrVacate"
  ) {
    loadHRVacates();
  }

  if (
    tabName === "checkin" ||
    tabName === "hrCheckin"
  ) {
    loadHRCheckins();
  }
}

/* =========================================================
   LOGOUT
========================================================= */

function logout() {
  stopScanner();

  currentEmployee = null;

  clearStoredEmployee();

  try {
    localStorage.removeItem(
      "texmo_hr_login"
    );
  } catch {}

  if (refreshTimer) {
    clearInterval(
      refreshTimer
    );
    refreshTimer = null;
  }

  showScreen(
    "loginScreen"
  );
}

/* =========================================================
   BACKGROUND REFRESH
========================================================= */

function startBackgroundRefresh() {
  if (refreshTimer) {
    clearInterval(
      refreshTimer
    );
  }

  refreshTimer =
    setInterval(async () => {
      if (!currentEmployee) {
        return;
      }

      try {
        const employeeId =
          currentEmployee.employee_id ||
          currentEmployee.id;

        if (!employeeId) {
          return;
        }

        const result =
          await api(
            `/api/employees/${encodeURIComponent(employeeId)}`
          );

        const employee =
          result?.employee ||
          result?.data ||
          result;

        if (
          employee &&
          employee.success !== false
        ) {
          currentEmployee =
            employee;

          renderEmployee(
            employee
          );

          await Promise.allSettled([
            loadMyRoom(),
            loadEmployeeLeave(),
            loadEmployeeVacate(),
            loadEmployeeCheckin()
          ]);
        }
      } catch (error) {
        console.warn(
          "Background refresh:",
          error
        );
      }
    }, 60000);
}

/* =========================================================
   EVENT HELPERS
========================================================= */

function bindClickIfExists(
  id,
  handler
) {
  const el = $(id);

  if (!el) return;

  el.addEventListener(
    "click",
    handler
  );
}

function bindFormIfExists(
  id,
  handler
) {
  const form = $(id);

  if (!form) return;

  form.addEventListener(
    "submit",
    (event) => {
      event.preventDefault();
      handler(event);
    }
  );
}

/* =========================================================
   GLOBAL FUNCTION BINDING
   IMPORTANT FOR INLINE onclick=""
========================================================= */

function bindTexmoFunctions() {
  window.employeeLogin =
    employeeLogin;

  window.registerEmployee =
    registerEmployee;

  window.loadEmployee =
    loadEmployee;

  window.renderEmployee =
    renderEmployee;

  window.createEmployeeQR =
    createEmployeeQR;

  window.loadMyRoom =
    loadMyRoom;

  window.renderMyRoom =
    renderMyRoom;

  window.renderMyRoomError =
    renderMyRoomError;

  window.submitEmployeeLeave =
    submitEmployeeLeave;

  window.loadEmployeeLeave =
    loadEmployeeLeave;

  window.submitEmployeeVacate =
    submitEmployeeVacate;

  window.loadEmployeeVacate =
    loadEmployeeVacate;

  window.submitEmployeeCheckin =
    submitEmployeeCheckin;

  window.loadEmployeeCheckin =
    loadEmployeeCheckin;

  window.hrLogin =
    hrLogin;

  window.loadHRDashboard =
    loadHRDashboard;

  window.loadCabDashboard =
    loadCabDashboard;

  window.loadEmployees =
    loadEmployees;

  window.startScanner =
    startScanner;

  window.stopScanner =
    stopScanner;

  window.processCabScan =
    processCabScan;

  window.logout =
    logout;

  window.texmoEmployeeTab =
    texmoEmployeeTab;

  window.texmoHRTab =
    texmoHRTab;

  window.loadHRVacates =
    loadHRVacates;

  window.approveHRVacate =
    approveHRVacate;

  window.rejectHRVacate =
    rejectHRVacate;

  window.loadHRCheckins =
    loadHRCheckins;

  window.downloadCabExcel =
    downloadCabExcel;

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

  window.generateFoodQR =
    generateFoodQR;

  window.saveEmployeeShift =
    saveEmployeeShift;

  window.loadEmployeeAttendance =
    loadEmployeeAttendance;
}

/* =========================================================
   OPTIONAL EVENT BINDING
   Works in addition to inline onclick
========================================================= */

function bindTexmoEvents() {
  bindFormIfExists(
    "employeeLoginForm",
    employeeLogin
  );

  bindFormIfExists(
    "employeeRegisterForm",
    registerEmployee
  );

  bindFormIfExists(
    "hrLoginForm",
    hrLogin
  );

  bindFormIfExists(
    "employeeLeaveForm",
    submitEmployeeLeave
  );

  bindFormIfExists(
    "employeeVacateForm",
    submitEmployeeVacate
  );

  bindFormIfExists(
    "employeeCheckinForm",
    submitEmployeeCheckin
  );

  bindFormIfExists(
    "hrVacateForm",
    loadHRVacates
  );

  bindClickIfExists(
    "startScannerButton",
    startScanner
  );

  bindClickIfExists(
    "stopScannerButton",
    stopScanner
  );
}

/* =========================================================
   SAFE INITIALIZATION
========================================================= */

async function initializeTexmoApp() {
  try {
    bindTexmoFunctions();

    bindTexmoEvents();

    /* Set date defaults where available */
    const vacateDate =
      $("employeeVacateDate");

    if (
      vacateDate &&
      !vacateDate.value
    ) {
      vacateDate.value =
        todayISO();
    }

    const checkinDate =
      $("employeeCheckinDate");

    if (
      checkinDate &&
      !checkinDate.value
    ) {
      checkinDate.value =
        todayISO();
    }

    /* Food QR can work independently */
    generateFoodQR();

    /* Restore employee session */
    await loadEmployee();

    /* Background refresh */
    startBackgroundRefresh();

  } catch (error) {
    console.error(
      "TEXMO initialization error:",
      error
    );
  }
}

/* =========================================================
   ONLINE / OFFLINE STATUS
========================================================= */

window.addEventListener(
  "online",
  () => {
    console.log(
      "TEXMO: online"
    );
  }
);

window.addEventListener(
  "offline",
  () => {
    console.warn(
      "TEXMO: offline"
    );
  }
);

/* =========================================================
   PAGE START
========================================================= */

if (
  document.readyState ===
  "loading"
) {
  document.addEventListener(
    "DOMContentLoaded",
    initializeTexmoApp,
    {
      once: true
    }
  );
} else {
  initializeTexmoApp();
}