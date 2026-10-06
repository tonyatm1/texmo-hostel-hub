/* =========================================================
   TEXMO HOSTEL HUB 2.0
   FRONTEND APP.JS
   A1 Stable / Defensive / Mobile Friendly Version

   IMPORTANT:
   - Backend API routes are kept compatible with current Worker.js.
   - Employment status and hostel status are treated separately.
   - INACTIVE employee != hostel OUT employee.
========================================================= */

"use strict";

/* =========================================================
   CONFIG
========================================================= */

const API = "";

const API_TIMEOUT_MS = 15000;
const EMPLOYEE_REFRESH_MS = 60000;
const HR_REFRESH_MS = 90000;
const QR_DUPLICATE_WINDOW_MS = 5000;

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

let lastScannedValue = "";
let lastScannedAt = 0;

let employeeLoading = false;
let employeeRegistering = false;
let hrLoggingIn = false;
let vacateSubmitting = false;
let checkinSubmitting = false;
let leaveSubmitting = false;
let shiftSubmitting = false;

let refreshTimer = null;
let hrRefreshTimer = null;

let appInitialized = false;

let previousEmployeeInactive = null;

let hrEmployeeCache = [];

/* =========================================================
   COMMON HELPERS
========================================================= */

function $(id) {
  return document.getElementById(id);
}

function firstElement(...ids) {
  for (const id of ids) {
    const el = $(id);

    if (el) {
      return el;
    }
  }

  return null;
}

function escapeHtml(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function safeJsonParse(value, fallback = null) {
  if (!value) {
    return fallback;
  }

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

  if (!el) {
    return;
  }

  el.textContent = text || "";

  el.className =
    "texmo-message " +
    (
      type === "success"
        ? "success"
        : type === "error"
          ? "error"
          : type === "warning"
            ? "warning"
            : "info"
    );
}

function setText(id, value) {
  const el = $(id);

  if (el) {
    el.textContent =
      value === null ||
      value === undefined
        ? ""
        : String(value);
  }
}

function setHtml(id, html) {
  const el = $(id);

  if (el) {
    el.innerHTML = html || "";
  }
}

function getValue(id) {
  const el = $(id);

  return el
    ? String(el.value || "").trim()
    : "";
}

function getSelectValue(id) {
  const el = $(id);

  return el
    ? String(el.value || "").trim()
    : "";
}

function setValue(id, value) {
  const el = $(id);

  if (el) {
    el.value =
      value === null ||
      value === undefined
        ? ""
        : value;
  }
}

function disableButton(
  button,
  disabled = true,
  temporaryText = null
) {
  if (!button) {
    return;
  }

  if (
    !button.dataset.defaultText
  ) {
    button.dataset.defaultText =
      button.textContent;
  }

  button.disabled = !!disabled;

  if (temporaryText !== null) {
    button.textContent =
      temporaryText;
  } else if (
    !disabled &&
    button.dataset.defaultText
  ) {
    button.textContent =
      button.dataset.defaultText;
  }
}

function formatDate(value) {
  if (!value) {
    return "-";
  }

  const raw = String(value);

  if (
    /^\d{4}-\d{2}-\d{2}$/.test(raw)
  ) {
    const [
      year,
      month,
      day
    ] = raw.split("-");

    return `${day}-${month}-${year}`;
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return raw;
  }

  return date.toLocaleDateString(
    "en-IN",
    {
      day: "2-digit",
      month: "short",
      year: "numeric"
    }
  );
}

function formatDateTime(value) {
  if (!value) {
    return "-";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return String(value);
  }

  return date.toLocaleString(
    "en-IN",
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }
  );
}

function todayISO() {
  const date =
    new Date();

  const year =
    date.getFullYear();

  const month =
    String(
      date.getMonth() + 1
    ).padStart(2, "0");

  const day =
    String(
      date.getDate()
    ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function normalizeId(value) {
  return String(
    value || ""
  ).trim();
}

function getStoredEmployeeId() {
  try {
    return (
      localStorage.getItem(
        "texmo_employee_id"
      ) || ""
    );
  } catch {
    return "";
  }
}

function storeEmployeeId(id) {
  const normalized =
    normalizeId(id);

  if (!normalized) {
    return;
  }

  try {
    localStorage.setItem(
      "texmo_employee_id",
      normalized
    );
  } catch {}
}

function clearStoredEmployee() {
  try {
    localStorage.removeItem(
      "texmo_employee_id"
    );
  } catch {}
}

function isOnline() {
  return navigator.onLine !== false;
}

/* =========================================================
   DATA NORMALIZATION
========================================================= */

function extractEmployee(result) {
  if (!result) {
    return null;
  }

  if (
    result.employee &&
    typeof result.employee === "object"
  ) {
    return result.employee;
  }

  if (
    result.data &&
    typeof result.data === "object" &&
    !Array.isArray(result.data)
  ) {
    return result.data;
  }

  if (
    typeof result === "object" &&
    !Array.isArray(result)
  ) {
    return result;
  }

  return null;
}

function getEmployeeId(employee) {
  return normalizeId(
    employee?.employee_id ||
    employee?.employeeId ||
    employee?.id ||
    ""
  );
}

function getEmployeeName(employee) {
  return String(
    employee?.name ||
    employee?.employee_name ||
    employee?.full_name ||
    ""
  ).trim();
}

/* =========================================================
   EMPLOYEE STATUS
   IMPORTANT:
   hostel_status = OUT is NOT employment inactive.
========================================================= */

function isEmployeeInactive(employee) {
  if (!employee) {
    return false;
  }

  /*
    Explicit boolean fields have highest priority.
  */

  const booleanFields = [
    "active",
    "is_active",
    "employee_active",
    "enabled"
  ];

  for (
    const field of booleanFields
  ) {
    if (
      employee[field] === false ||
      employee[field] === 0 ||
      employee[field] === "0"
    ) {
      return true;
    }

    if (
      employee[field] === true ||
      employee[field] === 1 ||
      employee[field] === "1"
    ) {
      return false;
    }
  }

  /*
    Employment-related status fields only.

    DO NOT use hostel_status here.
    hostel_status = OUT simply means employee
    currently does not occupy the hostel.
  */

  const employmentStatus =
    String(
      employee.employee_status ||
      employee.employment_status ||
      employee.employmentStatus ||
      employee.status ||
      ""
    )
      .trim()
      .toLowerCase();

  const inactiveStatuses = new Set([
    "inactive",
    "terminated",
    "resigned",
    "blocked",
    "disabled",
    "deactivated",
    "left",
    "ex-employee",
    "ex employee",
    "former employee"
  ]);

  if (
    inactiveStatuses.has(
      employmentStatus
    )
  ) {
    return true;
  }

  return false;
}

function getEmployeeStatusLabel(employee) {
  return isEmployeeInactive(employee)
    ? "INACTIVE"
    : "ACTIVE";
}

function getEmployeeStatusClass(employee) {
  return isEmployeeInactive(employee)
    ? "inactive"
    : "active";
}

/* =========================================================
   EMPLOYEE ACTION ACCESS CONTROL
========================================================= */

function applyEmployeeAccessState(
  employee = currentEmployee
) {
  const inactive =
    isEmployeeInactive(employee);

  const portal =
    firstElement(
      "employeePortal",
      "employeeDashboard"
    );

  /*
    Banner
  */

  let banner =
    firstElement(
      "employeeInactiveBanner"
    );

  if (
    inactive &&
    portal &&
    !banner
  ) {
    banner =
      document.createElement(
        "div"
      );

    banner.id =
      "employeeInactiveBanner";

    banner.className =
      "texmo-message warning";

    banner.setAttribute(
      "role",
      "status"
    );

    banner.textContent =
      "Employee account is INACTIVE. Please contact HR for assistance.";

    portal.prepend(
      banner
    );
  }

  if (
    banner
  ) {
    banner.style.display =
      inactive
        ? ""
        : "none";
  }

  /*
    Update status labels if available.
  */

  const statusElements = [
    "employeeProfileStatus",
    "employeeStatus",
    "employeeAccountStatus"
  ];

  statusElements.forEach(
    (id) => {
      const el = $(id);

      if (!el) {
        return;
      }

      el.textContent =
        getEmployeeStatusLabel(
          employee
        );

      el.dataset.status =
        getEmployeeStatusClass(
          employee
        );
    }
  );

  /*
    Disable actual employee action forms.

    Navigation buttons are NOT disabled.
    Historical data remains viewable.
  */

  if (portal) {
    const forms =
      portal.querySelectorAll(
        "form"
      );

    forms.forEach(
      (form) => {
        form
          .querySelectorAll(
            "input, select, textarea, button"
          )
          .forEach(
            (control) => {
              control.disabled =
                inactive;
            }
          );
      }
    );

    const actionSelectors = [
      "[data-employee-action]",
      ".employee-action"
    ];

    actionSelectors.forEach(
      (selector) => {
        portal
          .querySelectorAll(
            selector
          )
          .forEach(
            (control) => {
              control.disabled =
                inactive;
            }
          );
      }
    );
  }
}

function employeeActionAllowed(
  messageId = null
) {
  if (
    isEmployeeInactive(
      currentEmployee
    )
  ) {
    message(
      messageId,
      "Employee account is INACTIVE. Please contact HR.",
      "warning"
    );

    return false;
  }

  return true;
}

/* =========================================================
   API HELPER
========================================================= */

async function api(
  path,
  options = {},
  timeoutMs = API_TIMEOUT_MS
) {
  const config = {
    method: "GET",
    headers: {
      Accept: "application/json"
    },
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
    config.headers[
      "Content-Type"
    ] = "application/json";

    config.body =
      JSON.stringify(
        config.body
      );
  }

  const controller =
    new AbortController();

  const externalSignal =
    config.signal;

  config.signal =
    controller.signal;

  let timeoutTimer = null;

  try {
    timeoutTimer =
      setTimeout(
        () => {
          controller.abort();
        },
        timeoutMs
      );

    if (
      !isOnline()
    ) {
      throw new Error(
        "Internet connection unavailable."
      );
    }

    if (
      externalSignal
    ) {
      if (
        externalSignal.aborted
      ) {
        controller.abort();
      } else {
        externalSignal.addEventListener(
          "abort",
          () => {
            controller.abort();
          },
          {
            once: true
          }
        );
      }
    }

    let response;

    try {
      response =
        await fetch(
          API + path,
          config
        );
    } catch (error) {
      if (
        error?.name ===
        "AbortError"
      ) {
        throw new Error(
          "Request timed out. Please try again."
        );
      }

      throw new Error(
        !isOnline()
          ? "Internet connection unavailable."
          : "Server connection failed. Please try again."
      );
    }

    const contentType =
      response.headers.get(
        "content-type"
      ) || "";

    let data = null;

    try {
      if (
        contentType.includes(
          "application/json"
        )
      ) {
        data =
          await response.json();
      } else {
        const text =
          await response.text();

        if (text) {
          try {
            data =
              JSON.parse(text);
          } catch {
            data = text;
          }
        }
      }
    } catch {
      data = null;
    }

    if (!response.ok) {
      let errorMessage =
        data &&
        typeof data === "object" &&
        (
          data.error ||
          data.message
        );

      if (
        !errorMessage &&
        typeof data === "string"
      ) {
        errorMessage =
          data;
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
  } finally {
    if (timeoutTimer) {
      clearTimeout(
        timeoutTimer
      );
    }
  }
}

/* =========================================================
   SCREEN HELPERS
========================================================= */

function showScreen(id) {
  if (!id) {
    return;
  }

  const screens =
    document.querySelectorAll(
      ".screen, [data-screen], main > section"
    );

  screens.forEach(
    (screen) => {
      const match =
        screen.id === id ||
        screen.dataset.screen === id;

      if (match) {
        screen.style.display =
          "";

        screen.classList.add(
          "active"
        );
      } else {
        screen.style.display =
          "none";

        screen.classList.remove(
          "active"
        );
      }
    }
  );

  const direct =
    $(id);

  if (direct) {
    direct.style.display =
      "";

    direct.classList.add(
      "active"
    );
  }
}

/* =========================================================
   EMPLOYEE LOGIN
========================================================= */

async function employeeLogin() {
  if (employeeLoading) {
    return;
  }

  const employeeId =
    normalizeId(
      getValue(
        "employeeLoginId"
      ) ||
      getValue(
        "employeeId"
      ) ||
      getValue(
        "loginEmployeeId"
      ) ||
      getValue(
        "loginId"
      )
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
    document.activeElement.tagName ===
      "BUTTON"
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
    const result =
      await api(
        `/api/employees/${encodeURIComponent(employeeId)}`
      );

    const employee =
      extractEmployee(
        result
      );

    if (
      !employee ||
      getEmployeeId(
        employee
      ) === ""
    ) {
      throw new Error(
        result?.error ||
        result?.message ||
        "Employee not found."
      );
    }

    currentEmployee =
      employee;

    storeEmployeeId(
      getEmployeeId(
        employee
      ) ||
      employeeId
    );

    showScreen(
      "employeePortal"
    );

    renderEmployee(
      employee
    );

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
    console.error(
      "Employee login error:",
      error
    );

    message(
      msg,
      error.message ||
      "Employee login failed.",
      "error"
    );
  } finally {
    employeeLoading = false;

    disableButton(
      button,
      false
    );
  }
}

/* =========================================================
   EMPLOYEE REGISTRATION
========================================================= */

async function registerEmployee() {
  if (employeeRegistering) {
    return;
  }

  /*
    Support old + current HTML IDs.
  */

  const employeeId =
    normalizeId(
      getValue("employeeId") ||
      getValue(
        "registerEmployeeId"
      ) ||
      getValue(
        "regEmployeeId"
      )
    );

  const name =
    getValue(
      "employeeName"
    ) ||
    getValue(
      "regName"
    );

  const department =
    getValue(
      "employeeDepartment"
    ) ||
    getValue(
      "regDepartment"
    );

  const designation =
    getValue(
      "employeeDesignation"
    ) ||
    getValue(
      "regDesignation"
    );

  const phone =
    getValue(
      "employeePhone"
    ) ||
    getValue(
      "regPhone"
    );

  const shift =
    getSelectValue(
      "employeeShift"
    ) ||
    getValue(
      "employeeShift"
    ) ||
    getSelectValue(
      "regShift"
    ) ||
    getValue(
      "regShift"
    );

  const room =
    getSelectValue(
      "employeeRoom"
    ) ||
    getValue(
      "employeeRoom"
    ) ||
    getSelectValue(
      "regRoom"
    ) ||
    getValue(
      "regRoom"
    );

  const msg =
    firstElement(
      "employeeRegisterMessage",
      "employeeRegistrationMessage",
      "registerMessage"
    );

  if (!employeeId) {
    message(
      msg,
      "Employee ID is required.",
      "error"
    );

    return;
  }

  if (!name) {
    message(
      msg,
      "Name is required.",
      "error"
    );

    return;
  }

  if (!department) {
    message(
      msg,
      "Department is required.",
      "error"
    );

    return;
  }

  if (!phone) {
    message(
      msg,
      "Phone number is required.",
      "error"
    );

    return;
  }

  if (!room) {
    message(
      msg,
      "Please select a room.",
      "error"
    );

    return;
  }

  employeeRegistering = true;

  const button =
    document.activeElement &&
    document.activeElement.tagName ===
      "BUTTON"
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
    const result =
      await api(
        "/api/employees/register",
        {
          method: "POST",
          body: {
            employee_id:
              employeeId,
            name,
            department,
            designation,
            phone,
            shift,
            room
          }
        }
      );

    const registeredEmployee =
      extractEmployee(
        result
      );

    message(
      msg,
      result?.message ||
      "Employee registered successfully.",
      "success"
    );

    /*
      If backend returned employee object,
      use it immediately.
    */

    if (
      registeredEmployee &&
      getEmployeeId(
        registeredEmployee
      )
    ) {
      currentEmployee =
        registeredEmployee;

      storeEmployeeId(
        getEmployeeId(
          registeredEmployee
        )
      );

      setTimeout(
        async () => {
          showScreen(
            "employeePortal"
          );

          renderEmployee(
            registeredEmployee
          );

          await Promise.allSettled([
            loadMyRoom(),
            loadEmployeeLeave(),
            loadEmployeeVacate(),
            loadEmployeeCheckin(),
            loadEmployeeAttendance()
          ]);
        },
        400
      );

      return;
    }

    /*
      Backend may return only success/message.
      Reload employee by ID.
    */

    storeEmployeeId(
      employeeId
    );

    setTimeout(
      async () => {
        try {
          await loadEmployee();
        } catch {}
      },
      400
    );
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

    disableButton(
      button,
      false
    );
  }
}

/* =========================================================
   EMPLOYEE RESTORE
========================================================= */

async function loadEmployee() {
  const employeeId =
    getStoredEmployeeId();

  if (!employeeId) {
    return;
  }

  try {
    const result =
      await api(
        `/api/employees/${encodeURIComponent(employeeId)}`
      );

    const employee =
      extractEmployee(
        result
      );

    if (
      !employee ||
      !getEmployeeId(
        employee
      )
    ) {
      clearStoredEmployee();
      return;
    }

    currentEmployee =
      employee;

    showScreen(
      "employeePortal"
    );

    renderEmployee(
      employee
    );

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

function renderEmployee(
  employee
) {
  if (!employee) {
    return;
  }

  const id =
    getEmployeeId(
      employee
    );

  const name =
    getEmployeeName(
      employee
    );

  const department =
    String(
      employee.department ||
      ""
    );

  const designation =
    String(
      employee.designation ||
      ""
    );

  const phone =
    String(
      employee.phone ||
      employee.mobile ||
      ""
    );

  const shift =
    String(
      employee.shift ||
      ""
    );

  const room =
    String(
      employee.room ||
      employee.room_no ||
      employee.room_number ||
      "-"
    );

  const employmentStatus =
    getEmployeeStatusLabel(
      employee
    );

  const hostelStatus =
    String(
      employee.hostel_status ||
      "-"
    );

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

  setText(
    "employeeProfileStatus",
    employmentStatus
  );

  setText(
    "employeeStatus",
    employmentStatus
  );

  setText(
    "employeeAccountStatus",
    employmentStatus
  );

  setText(
    "employeeHostelStatus",
    hostelStatus
  );

  /*
    Dynamic profile fallback.
  */

  const containers = [
    "employeeProfile",
    "employeeDetails",
    "employeePortalProfile"
  ];

  for (
    const containerId
    of containers
  ) {
    const el =
      $(containerId);

    if (!el) {
      continue;
    }

    if (
      el.dataset &&
      el.dataset.dynamicProfile ===
        "true"
    ) {
      el.innerHTML = `
        <div class="profile-name">
          ${escapeHtml(name)}
        </div>

        <div>
          ID:
          ${escapeHtml(id)}
        </div>

        <div>
          Department:
          ${escapeHtml(department)}
        </div>

        <div>
          Designation:
          ${escapeHtml(designation)}
        </div>

        <div>
          Shift:
          ${escapeHtml(shift)}
        </div>

        <div>
          Room:
          ${escapeHtml(room)}
        </div>

        <div>
          Employee Status:
          <strong>
            ${escapeHtml(
              employmentStatus
            )}
          </strong>
        </div>

        <div>
          Hostel Status:
          ${escapeHtml(
            hostelStatus
          )}
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

  /*
    Detect status transition.
  */

  const inactive =
    isEmployeeInactive(
      employee
    );

  if (
    previousEmployeeInactive !==
      null &&
    previousEmployeeInactive !==
      inactive
  ) {
    if (inactive) {
      console.warn(
        "TEXMO: Employee became INACTIVE."
      );
    } else {
      console.log(
        "TEXMO: Employee became ACTIVE."
      );
    }
  }

  previousEmployeeInactive =
    inactive;

  applyEmployeeAccessState(
    employee
  );
}

/* =========================================================
   EMPLOYEE QR
========================================================= */

function createEmployeeQR(
  value
) {
  const container =
    firstElement(
      "employeeQR",
      "employeeQr",
      "employeeQRCode",
      "employeeQrCode"
    );

  if (!container) {
    return;
  }

  container.innerHTML = "";

  if (!value) {
    container.textContent =
      "QR unavailable";

    return;
  }

  if (
    typeof window.QRCode ===
    "undefined"
  ) {
    container.textContent =
      "QR library unavailable.";

    console.warn(
      "QRCode library is not available."
    );

    return;
  }

  try {
    new QRCode(
      container,
      {
        text: String(value),
        width: 180,
        height: 180,
        correctLevel:
          window.QRCode.CorrectLevel
            ? window.QRCode
                .CorrectLevel.M
            : 0
      }
    );
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
    getEmployeeId(
      currentEmployee
    ) ||
    getStoredEmployeeId();

  if (!employeeId) {
    return;
  }

  try {
    const result =
      await api(
        `/api/employee-room/${encodeURIComponent(employeeId)}`
      );

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

    const room =
      result?.room ||
      result?.data ||
      result;

    renderMyRoom(
      room
    );
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

function renderMyRoom(
  roomData
) {
  const container =
    firstElement(
      "myRoom",
      "employeeMyRoom",
      "roomDetails",
      "employeeRoomDetails"
    );

  if (!container) {
    return;
  }

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
    Number.isFinite(
      Number(
        roomData.capacity
      )
    )
      ? Number(
          roomData.capacity
        )
      : "-";

  const occupied =
    Number.isFinite(
      Number(
        roomData.occupied ??
        roomData.occupancy
      )
    )
      ? Number(
          roomData.occupied ??
          roomData.occupancy
        )
      : "-";

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
          <strong>
            ${escapeHtml(block)}
          </strong>
        </div>

        <div>
          <span>Room</span>
          <strong>
            ${escapeHtml(room)}
          </strong>
        </div>

        <div>
          <span>Bed</span>
          <strong>
            ${escapeHtml(bed)}
          </strong>
        </div>

        <div>
          <span>Status</span>
          <strong>
            ${escapeHtml(status)}
          </strong>
        </div>

        <div>
          <span>Capacity</span>
          <strong>
            ${escapeHtml(capacity)}
          </strong>
        </div>

        <div>
          <span>Occupied</span>
          <strong>
            ${escapeHtml(occupied)}
          </strong>
        </div>

      </div>
    </div>
  `;
}

function renderMyRoomError(
  errorText
) {
  const container =
    firstElement(
      "myRoom",
      "employeeMyRoom",
      "roomDetails",
      "employeeRoomDetails"
    );

  if (!container) {
    return;
  }

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
  if (leaveSubmitting) {
    return;
  }

  const msg =
    firstElement(
      "employeeLeaveMessage",
      "employeeLeaveMsg",
      "leaveMessage"
    );

  if (
    !employeeActionAllowed(
      msg
    )
  ) {
    return;
  }

  const employeeId =
    getEmployeeId(
      currentEmployee
    ) ||
    getStoredEmployeeId();

  if (!employeeId) {
    message(
      msg,
      "Please login first.",
      "error"
    );

    return;
  }

  const fromDate =
    getValue(
      "employeeLeaveFrom"
    ) ||
    getValue(
      "employeeLeaveStartDate"
    ) ||
    getValue(
      "leaveFromDate"
    );

  const toDate =
    getValue(
      "employeeLeaveTo"
    ) ||
    getValue(
      "employeeLeaveEndDate"
    ) ||
    getValue(
      "leaveToDate"
    );

  const reason =
    getValue(
      "employeeLeaveReason"
    ) ||
    getValue(
      "leaveReason"
    );

  const roomVacate =
    firstElement(
      "employeeLeaveRoomVacate",
      "leaveRoomVacate"
    );

  const wantsRoomVacate =
    roomVacate
      ? !!roomVacate.checked
      : false;

  if (
    !fromDate ||
    !toDate
  ) {
    message(
      msg,
      "Please select leave start and end dates.",
      "error"
    );

    return;
  }

  if (
    toDate < fromDate
  ) {
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
    const result =
      await api(
        "/api/leave",
        {
          method: "POST",
          body: {
            employee_id:
              employeeId,

            from_date:
              fromDate,

            to_date:
              toDate,

            start_date:
              fromDate,

            end_date:
              toDate,

            reason,

            room_vacate:
              wantsRoomVacate
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
    getEmployeeId(
      currentEmployee
    ) ||
    getStoredEmployeeId();

  if (!employeeId) {
    return;
  }

  try {
    const result =
      await api(
        `/api/leave/${encodeURIComponent(employeeId)}`
      );

    const records =
      result?.records ||
      result?.leaves ||
      result?.data ||
      [];

    renderEmployeeLeave(
      records
    );
  } catch (error) {
    console.warn(
      "Leave history error:",
      error
    );
  }
}

function renderEmployeeLeave(
  records
) {
  const container =
    firstElement(
      "employeeLeaveHistory",
      "leaveHistory"
    );

  if (!container) {
    return;
  }

  if (
    !Array.isArray(records) ||
    !records.length
  ) {
    container.innerHTML =
      `<div class="empty-state">No leave records.</div>`;

    return;
  }

  container.innerHTML =
    records
      .map(
        (item) => {
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

                &rarr;

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
                  ${escapeHtml(
                    status
                  )}
                </strong>
              </div>

              ${
                item.room_vacate
                  ? `
                    <div>
                      Room Vacate: Yes
                    </div>
                  `
                  : ""
              }

            </div>
          `;
        }
      )
      .join("");
}

/* =========================================================
   DIRECT VACATE
========================================================= */

async function submitEmployeeVacate() {
  if (vacateSubmitting) {
    return;
  }

  const msg =
    firstElement(
      "employeeVacateMessage",
      "employeeVacateMsg"
    );

  if (
    !employeeActionAllowed(
      msg
    )
  ) {
    return;
  }

  const employeeId =
    getEmployeeId(
      currentEmployee
    ) ||
    getStoredEmployeeId();

  if (!employeeId) {
    message(
      msg,
      "Please login first.",
      "error"
    );

    return;
  }

  const vacateDate =
    getValue(
      "employeeVacateDate"
    );

  const returnDate =
    getValue(
      "employeeReturnDate"
    );

  const reason =
    getValue(
      "employeeVacateReason"
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

  if (
    returnDate < vacateDate
  ) {
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
    const result =
      await api(
        "/api/vacate",
        {
          method: "POST",
          body: {
            employee_id:
              employeeId,

            vacate_date:
              vacateDate,

            return_date:
              returnDate,

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
    getEmployeeId(
      currentEmployee
    ) ||
    getStoredEmployeeId();

  if (!employeeId) {
    return;
  }

  try {
    const result =
      await api(
        `/api/vacate/${encodeURIComponent(employeeId)}`
      );

    const records =
      result?.records ||
      result?.vacates ||
      result?.data ||
      [];

    renderEmployeeVacate(
      records
    );
  } catch (error) {
    console.warn(
      "Vacate history error:",
      error
    );
  }
}

function renderEmployeeVacate(
  records
) {
  const container =
    firstElement(
      "employeeVacateHistory",
      "vacateHistory"
    );

  if (!container) {
    return;
  }

  if (
    !Array.isArray(records) ||
    !records.length
  ) {
    container.innerHTML =
      `<div class="empty-state">No vacate requests.</div>`;

    return;
  }

  container.innerHTML =
    records
      .map(
        (item) => {
          const status =
            item.status ||
            item.approval_status ||
            "PENDING";

          return `
            <div class="history-item">

              <strong>
                Room Vacate
              </strong>

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
                  ? `
                    <div>
                      Reason:
                      ${escapeHtml(
                        item.reason
                      )}
                    </div>
                  `
                  : ""
              }

              <div>
                Status:
                <strong>
                  ${escapeHtml(
                    status
                  )}
                </strong>
              </div>

              ${
                item.created_at
                  ? `
                    <div>
                      Requested:
                      ${escapeHtml(
                        formatDateTime(
                          item.created_at
                        )
                      )}
                    </div>
                  `
                  : ""
              }

            </div>
          `;
        }
      )
      .join("");
}

/* =========================================================
   CHECK-IN
========================================================= */

async function submitEmployeeCheckin() {
  if (checkinSubmitting) {
    return;
  }

  const msg =
    firstElement(
      "employeeCheckinMessage",
      "employeeCheckinMsg",
      "checkinMessage"
    );

  if (
    !employeeActionAllowed(
      msg
    )
  ) {
    return;
  }

  const employeeId =
    getEmployeeId(
      currentEmployee
    ) ||
    getStoredEmployeeId();

  if (!employeeId) {
    message(
      msg,
      "Please login first.",
      "error"
    );

    return;
  }

  const room =
    getSelectValue(
      "employeeCheckinRoom"
    ) ||
    getValue(
      "employeeCheckinRoom"
    ) ||
    getValue(
      "checkinRoom"
    );

  const date =
    getValue(
      "employeeCheckinDate"
    ) ||
    todayISO();

  const reason =
    getValue(
      "employeeCheckinReason"
    ) ||
    getValue(
      "checkinReason"
    );

  checkinSubmitting = true;

  message(
    msg,
    "Submitting check-in request...",
    "info"
  );

  try {
    const result =
      await api(
        "/api/checkin",
        {
          method: "POST",
          body: {
            employee_id:
              employeeId,

            room,

            checkin_date:
              date,

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
    getEmployeeId(
      currentEmployee
    ) ||
    getStoredEmployeeId();

  if (!employeeId) {
    return;
  }

  try {
    const result =
      await api(
        `/api/checkin/${encodeURIComponent(employeeId)}`
      );

    const records =
      result?.records ||
      result?.checkins ||
      result?.data ||
      [];

    renderEmployeeCheckin(
      records
    );
  } catch (error) {
    console.warn(
      "Check-in history error:",
      error
    );
  }
}

function renderEmployeeCheckin(
  records
) {
  const container =
    firstElement(
      "employeeCheckinHistory",
      "checkinHistory"
    );

  if (!container) {
    return;
  }

  if (
    !Array.isArray(records) ||
    !records.length
  ) {
    container.innerHTML =
      `<div class="empty-state">No check-in requests.</div>`;

    return;
  }

  container.innerHTML =
    records
      .map(
        (item) => {
          const status =
            item.status ||
            item.approval_status ||
            "PENDING";

          return `
            <div class="history-item">

              <strong>
                Check-In Request
              </strong>

              ${
                item.room
                  ? `
                    <div>
                      Room:
                      ${escapeHtml(
                        item.room
                      )}
                    </div>
                  `
                  : ""
              }

              ${
                item.checkin_date
                  ? `
                    <div>
                      Date:
                      ${escapeHtml(
                        formatDate(
                          item.checkin_date
                        )
                      )}
                    </div>
                  `
                  : ""
              }

              <div>
                Status:
                <strong>
                  ${escapeHtml(
                    status
                  )}
                </strong>
              </div>

            </div>
          `;
        }
      )
      .join("");
}

/* =========================================================
   HR LOGIN
========================================================= */

async function hrLogin() {
  if (hrLoggingIn) {
    return;
  }

  const username =
    getValue(
      "hrUsername"
    ) ||
    getValue(
      "hrUser"
    ) ||
    getValue(
      "username"
    );

  const password =
    getValue(
      "hrPassword"
    ) ||
    getValue(
      "hrPass"
    ) ||
    getValue(
      "password"
    );

  const msg =
    firstElement(
      "hrLoginMessage",
      "hrLoginMsg",
      "hrMessage"
    );

  if (
    !username ||
    !password
  ) {
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
    const result =
      await api(
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

    showScreen(
      "hrPortal"
    );

    await loadHRDashboard();

    startHRBackgroundRefresh();

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

/* =========================================================
   CAB DASHBOARD
========================================================= */

async function loadCabDashboard() {
  try {
    const result =
      await api(
        "/api/cab/dashboard"
      );

    const data =
      result?.dashboard ||
      result?.data ||
      result;

    if (!data) {
      return;
    }

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
      data.cabs?.length ??
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

    renderCabDashboard(
      data
    );
  } catch (error) {
    console.warn(
      "Cab dashboard error:",
      error
    );
  }
}

function renderCabDashboard(
  data
) {
  const container =
    firstElement(
      "cabDashboard",
      "cabDashboardDetails"
    );

  if (!container) {
    return;
  }

  if (
    data &&
    Array.isArray(
      data.cabs
    )
  ) {
    container.innerHTML =
      data.cabs
        .map(
          (cab) => `
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
          `
        )
        .join("");
  }
}

/* =========================================================
   HR EMPLOYEE LIST
========================================================= */

async function loadEmployees() {
  try {
    const result =
      await api(
        "/api/employees"
      );

    const employees =
      result?.employees ||
      (
        Array.isArray(
          result?.data
        )
          ? result.data
          : result?.data &&
            typeof result.data ===
              "object"
            ? [result.data]
            : Array.isArray(
                result
              )
              ? result
              : []
      );

    hrEmployeeCache =
      Array.isArray(
        employees
      )
        ? employees
        : [];

    renderEmployees(
      hrEmployeeCache
    );

    updateHREmployeeCounts(
      hrEmployeeCache
    );

    return hrEmployeeCache;
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

function updateHREmployeeCounts(
  employees
) {
  if (
    !Array.isArray(
      employees
    )
  ) {
    return;
  }

  const active =
    employees.filter(
      (employee) =>
        !isEmployeeInactive(
          employee
        )
    ).length;

  const inactive =
    employees.filter(
      (employee) =>
        isEmployeeInactive(
          employee
        )
    ).length;

  setText(
    "activeEmployeesCount",
    active
  );

  setText(
    "inactiveEmployeesCount",
    inactive
  );

  setText(
    "hrActiveEmployees",
    active
  );

  setText(
    "hrInactiveEmployees",
    inactive
  );

  setText(
    "totalEmployeesCount",
    employees.length
  );
}

function getHRFilterValues() {
  const search =
    (
      getValue(
        "employeeSearch"
      ) ||
      getValue(
        "hrEmployeeSearch"
      ) ||
      ""
    ).toLowerCase();

  const status =
    (
      getSelectValue(
        "employeeStatusFilter"
      ) ||
      getSelectValue(
        "hrEmployeeStatusFilter"
      ) ||
      "ALL"
    ).toUpperCase();

  return {
    search,
    status
  };
}

function filterHREmployees() {
  if (
    !Array.isArray(
      hrEmployeeCache
    )
  ) {
    return;
  }

  const {
    search,
    status
  } =
    getHRFilterValues();

  const filtered =
    hrEmployeeCache.filter(
      (employee) => {
        const employeeStatus =
          getEmployeeStatusLabel(
            employee
          );

        if (
          status !== "ALL" &&
          employeeStatus !==
            status
        ) {
          return false;
        }

        if (!search) {
          return true;
        }

        const haystack =
          [
            employee.name,
            employee.employee_name,
            employee.employee_id,
            employee.id,
            employee.department,
            employee.designation,
            employee.room,
            employee.room_no,
            employee.phone
          ]
            .map(
              (value) =>
                String(
                  value || ""
                ).toLowerCase()
            )
            .join(" ");

        return haystack.includes(
          search
        );
      }
    );

  renderEmployees(
    filtered
  );
}

function renderEmployees(
  employees
) {
  const container =
    firstElement(
      "employeeList",
      "employeesList",
      "hrEmployeeList"
    );

  if (!container) {
    return;
  }

  if (
    !Array.isArray(
      employees
    ) ||
    !employees.length
  ) {
    container.innerHTML =
      `<div class="empty-state">No employees found.</div>`;

    return;
  }

  container.innerHTML =
    employees
      .map(
        (employee) => {
          const inactive =
            isEmployeeInactive(
              employee
            );

          const employmentStatus =
            getEmployeeStatusLabel(
              employee
            );

          const hostelStatus =
            employee.hostel_status ||
            "-";

          return `
            <div class="employee-row">

              <div>
                <strong>
                  ${escapeHtml(
                    employee.name ||
                    employee.employee_name ||
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
                Employment:
                <strong
                  data-status="${
                    inactive
                      ? "inactive"
                      : "active"
                  }"
                >
                  ${escapeHtml(
                    employmentStatus
                  )}
                </strong>
              </div>

              <div>
                Hostel:
                ${escapeHtml(
                  hostelStatus
                )}
              </div>

            </div>
          `;
        }
      )
      .join("");
}

/* =========================================================
   HR VACATE
========================================================= */

async function loadHRVacates() {
  try {
    const result =
      await api(
        "/api/hr/vacates"
      );

    const records =
      result?.records ||
      result?.vacates ||
      result?.data ||
      (
        Array.isArray(
          result
        )
          ? result
          : []
      );

    renderHRVacates(
      records
    );

    updateVacateCounts(
      records
    );

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

function updateVacateCounts(
  records
) {
  if (
    !Array.isArray(
      records
    )
  ) {
    return;
  }

  const getStatus =
    (item) =>
      String(
        item.status ||
        item.approval_status ||
        "PENDING"
      )
        .trim()
        .toUpperCase();

  const pending =
    records.filter(
      (item) =>
        getStatus(item) ===
        "PENDING"
    ).length;

  const approved =
    records.filter(
      (item) =>
        getStatus(item) ===
        "APPROVED"
    ).length;

  const rejected =
    records.filter(
      (item) =>
        getStatus(item) ===
        "REJECTED"
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

function renderHRVacates(
  records
) {
  const container =
    firstElement(
      "hrVacateList",
      "hrVacates",
      "vacateRequestsList"
    );

  if (!container) {
    return;
  }

  if (
    !Array.isArray(
      records
    ) ||
    !records.length
  ) {
    container.innerHTML =
      `<div class="empty-state">No room vacate requests.</div>`;

    return;
  }

  container.innerHTML =
    records
      .map(
        (item) => {
          const status =
            String(
              item.status ||
              item.approval_status ||
              "PENDING"
            )
              .trim()
              .toUpperCase();

          const id =
            Number(
              item.id ??
              item.vacate_id ??
              0
            );

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
                ${escapeHtml(
                  employeeId
                )}
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
                  ? `
                    <div>
                      Reason:
                      ${escapeHtml(
                        item.reason
                      )}
                    </div>
                  `
                  : ""
              }

              <div>
                Status:
                <strong>
                  ${escapeHtml(
                    status
                  )}
                </strong>
              </div>

              ${
                status ===
                  "PENDING" &&
                id > 0
                  ? `
                    <div class="request-actions">

                      <button
                        type="button"
                        onclick="approveHRVacate(${id})"
                      >
                        Approve
                      </button>

                      <button
                        type="button"
                        onclick="rejectHRVacate(${id})"
                      >
                        Reject
                      </button>

                    </div>
                  `
                  : ""
              }

            </div>
          `;
        }
      )
      .join("");
}

async function approveHRVacate(
  id
) {
  const numericId =
    Number(id);

  if (
    !Number.isInteger(
      numericId
    ) ||
    numericId <= 0
  ) {
    return;
  }

  if (
    !window.confirm(
      "Approve this temporary room vacate request?"
    )
  ) {
    return;
  }

  try {
    const result =
      await api(
        `/api/hr/vacates/${encodeURIComponent(numericId)}/approve`,
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
      loadCabDashboard()
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

async function rejectHRVacate(
  id
) {
  const numericId =
    Number(id);

  if (
    !Number.isInteger(
      numericId
    ) ||
    numericId <= 0
  ) {
    return;
  }

  if (
    !window.confirm(
      "Reject this temporary room vacate request?"
    )
  ) {
    return;
  }

  try {
    const result =
      await api(
        `/api/hr/vacates/${encodeURIComponent(numericId)}/reject`,
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
    const result =
      await api(
        "/api/hr/checkins"
      );

    const records =
      result?.records ||
      result?.checkins ||
      result?.data ||
      (
        Array.isArray(
          result
        )
          ? result
          : []
      );

    renderHRCheckins(
      records
    );

    return records;
  } catch (error) {
    console.warn(
      "HR check-in error:",
      error
    );

    return [];
  }
}

function renderHRCheckins(
  records
) {
  const container =
    firstElement(
      "hrCheckinList",
      "hrCheckins",
      "checkinRequestsList"
    );

  if (!container) {
    return;
  }

  if (
    !Array.isArray(
      records
    ) ||
    !records.length
  ) {
    container.innerHTML =
      `<div class="empty-state">No check-in requests.</div>`;

    return;
  }

  container.innerHTML =
    records
      .map(
        (item) => {
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
                  ? `
                    <div>
                      Requested Room:
                      ${escapeHtml(
                        item.room
                      )}
                    </div>
                  `
                  : ""
              }

              ${
                item.checkin_date
                  ? `
                    <div>
                      Date:
                      ${escapeHtml(
                        formatDate(
                          item.checkin_date
                        )
                      )}
                    </div>
                  `
                  : ""
              }

              ${
                item.reason
                  ? `
                    <div>
                      Reason:
                      ${escapeHtml(
                        item.reason
                      )}
                    </div>
                  `
                  : ""
              }

              <div>
                Status:
                <strong>
                  ${escapeHtml(
                    status
                  )}
                </strong>
              </div>

            </div>
          `;
        }
      )
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

  scannerBusy =
    false;

  lastScannedValue =
    "";

  lastScannedAt =
    0;

  message(
    messageEl,
    "Starting camera...",
    "info"
  );

  try {
    scannerStream =
      await navigator.mediaDevices.getUserMedia(
        {
          video: {
            facingMode: {
              ideal:
                "environment"
            }
          },
          audio: false
        }
      );

    video.srcObject =
      scannerStream;

    video.setAttribute(
      "playsinline",
      "true"
    );

    video.muted =
      true;

    await video.play();

    if (
      "BarcodeDetector" in
      window
    ) {
      try {
        scannerDetector =
          new BarcodeDetector(
            {
              formats: [
                "qr_code"
              ]
            }
          );
      } catch {
        scannerDetector =
          null;
      }
    }

    if (
      scannerDetector
    ) {
      scanWithBarcodeDetector(
        video,
        messageEl
      );
    } else {
      const loaded =
        await loadJsQR();

      if (
        loaded &&
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
  scannerBusy =
    false;

  if (scannerTimer) {
    clearTimeout(
      scannerTimer
    );

    scannerTimer =
      null;
  }

  if (scannerStream) {
    scannerStream
      .getTracks()
      .forEach(
        (track) => {
          try {
            track.stop();
          } catch {}
        }
      );

    scannerStream =
      null;
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

    video.srcObject =
      null;
  }

  scannerDetector =
    null;

  lastScannedValue =
    "";

  lastScannedAt =
    0;
}

async function scanWithBarcodeDetector(
  video,
  messageEl
) {
  if (
    !scannerDetector ||
    !scannerStream
  ) {
    return;
  }

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

  if (
    scannerStream
  ) {
    scannerTimer =
      setTimeout(
        () =>
          scanWithBarcodeDetector(
            video,
            messageEl
          ),
        400
      );
  }
}

async function loadJsQR() {
  if (
    typeof window.jsQR ===
      "function"
  ) {
    jsQRLoaded =
      true;

    return true;
  }

  if (jsQRLoading) {
    return new Promise(
      (resolve) => {
        const started =
          Date.now();

        const timer =
          setInterval(
            () => {
              if (
                typeof window.jsQR ===
                  "function"
              ) {
                clearInterval(
                  timer
                );

                jsQRLoaded =
                  true;

                resolve(
                  true
                );

                return;
              }

              if (
                Date.now() -
                  started >
                10000
              ) {
                clearInterval(
                  timer
                );

                resolve(
                  false
                );
              }
            },
            100
          );
      }
    );
  }

  jsQRLoading =
    true;

  try {
    await new Promise(
      (
        resolve,
        reject
      ) => {
        const existing =
          document.querySelector(
            'script[data-texmo-jsqr="true"]'
          );

        if (existing) {
          existing.addEventListener(
            "load",
            resolve,
            {
              once: true
            }
          );

          existing.addEventListener(
            "error",
            reject,
            {
              once: true
            }
          );

          return;
        }

        const script =
          document.createElement(
            "script"
          );

        script.src =
          "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js";

        script.async =
          true;

        script.dataset.texmoJsqr =
          "true";

        script.onload =
          resolve;

        script.onerror =
          () =>
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

    jsQRLoaded =
      false;

    return false;
  } finally {
    jsQRLoading =
      false;
  }
}

function scanWithJsQR(
  video,
  messageEl
) {
  if (!scannerStream) {
    return;
  }

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
    canvas.getContext(
      "2d",
      {
        willReadFrequently:
          true
      }
    );

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
    canvas.width !==
    width
  ) {
    canvas.width =
      width;
  }

  if (
    canvas.height !==
    height
  ) {
    canvas.height =
      height;
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

  if (
    scannerStream
  ) {
    scannerTimer =
      setTimeout(
        () =>
          scanWithJsQR(
            video,
            messageEl
          ),
        350
      );
  }
}

/* =========================================================
   CAB SCAN
========================================================= */

async function processCabScan(
  qrValue
) {
  const value =
    String(
      qrValue || ""
    ).trim();

  if (!value) {
    return;
  }

  const now =
    Date.now();

  /*
    Prevent same QR from being submitted repeatedly
    when camera sees it for multiple frames.
  */

  if (
    value ===
      lastScannedValue &&
    now -
      lastScannedAt <
      QR_DUPLICATE_WINDOW_MS
  ) {
    return;
  }

  if (scannerBusy) {
    return;
  }

  lastScannedValue =
    value;

  lastScannedAt =
    now;

  scannerBusy =
    true;

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
    const result =
      await api(
        "/api/cab/scan",
        {
          method: "POST",
          body: {
            qr_data:
              value,

            qr_token:
              value,

            cab_qr:
              value,

            scanned_at:
              new Date()
                .toISOString()
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
    setTimeout(
      () => {
        scannerBusy =
          false;
      },
      1200
    );
  }
}

/* =========================================================
   FILE DOWNLOAD HELPERS
========================================================= */

function getFilenameFromDisposition(
  disposition
) {
  if (!disposition) {
    return "";
  }

  const utfMatch =
    disposition.match(
      /filename\*=UTF-8''([^;]+)/i
    );

  if (
    utfMatch &&
    utfMatch[1]
  ) {
    try {
      return decodeURIComponent(
        utfMatch[1]
      );
    } catch {
      return utfMatch[1];
    }
  }

  const normalMatch =
    disposition.match(
      /filename="?([^"]+)"?/i
    );

  return normalMatch
    ? normalMatch[1]
    : "";
}

function inferDownloadExtension(
  contentType,
  fallbackFilename
) {
  const type =
    String(
      contentType || ""
    ).toLowerCase();

  if (
    type.includes(
      "text/csv"
    )
  ) {
    return "csv";
  }

  if (
    type.includes(
      "spreadsheet"
    ) ||
    type.includes(
      "excel"
    ) ||
    type.includes(
      "openxmlformats-officedocument.spreadsheetml"
    )
  ) {
    return "xlsx";
  }

  const match =
    String(
      fallbackFilename || ""
    ).match(
      /\.([a-z0-9]+)$/i
    );

  return match
    ? match[1]
    : "xlsx";
}

function ensureDownloadExtension(
  filename,
  extension
) {
  const clean =
    String(
      filename ||
      "texmo-export"
    ).trim();

  if (
    /\.[a-z0-9]+$/i.test(
      clean
    )
  ) {
    return clean;
  }

  return `${clean}.${extension}`;
}

async function downloadFile(
  endpoint,
  filename
) {
  try {
    if (!isOnline()) {
      throw new Error(
        "Internet connection unavailable."
      );
    }

    const response =
      await fetch(
        API + endpoint,
        {
          method: "GET",
          headers: {
            Accept:
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,application/octet-stream"
          }
        }
      );

    if (!response.ok) {
      throw new Error(
        `Download failed (${response.status}).`
      );
    }

    const contentType =
      response.headers.get(
        "content-type"
      ) || "";

    const disposition =
      response.headers.get(
        "content-disposition"
      ) || "";

    const serverFilename =
      getFilenameFromDisposition(
        disposition
      );

    const extension =
      inferDownloadExtension(
        contentType,
        serverFilename ||
        filename
      );

    let finalFilename =
      serverFilename ||
      filename ||
      "texmo-export";

    finalFilename =
      ensureDownloadExtension(
        finalFilename,
        extension
      );

    const blob =
      await response.blob();

    const url =
      URL.createObjectURL(
        blob
      );

    const anchor =
      document.createElement(
        "a"
      );

    anchor.href =
      url;

    anchor.download =
      finalFilename;

    anchor.style.display =
      "none";

    document.body.appendChild(
      anchor
    );

    anchor.click();

    anchor.remove();

    setTimeout(
      () => {
        URL.revokeObjectURL(
          url
        );
      },
      1000
    );
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

  if (!container) {
    return;
  }

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
    new QRCode(
      container,
      {
        text: url,
        width: 180,
        height: 180,
        correctLevel:
          window.QRCode.CorrectLevel
            ? window.QRCode
                .CorrectLevel.M
            : 0
      }
    );
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
  if (shiftSubmitting) {
    return;
  }

  if (
    !employeeActionAllowed()
  ) {
    alert(
      "Employee account is INACTIVE. Please contact HR."
    );

    return;
  }

  const employeeId =
    getEmployeeId(
      currentEmployee
    ) ||
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
    ) ||
    getValue(
      "employeeShift"
    );

  if (!shift) {
    alert(
      "Please select a shift."
    );

    return;
  }

  shiftSubmitting =
    true;

  try {
    const result =
      await api(
        "/api/shifts",
        {
          method: "POST",
          body: {
            employee_id:
              employeeId,

            shift
          }
        }
      );

    alert(
      result?.message ||
      "Shift saved successfully."
    );

    if (
      currentEmployee
    ) {
      currentEmployee.shift =
        shift;

      renderEmployee(
        currentEmployee
      );
    }
  } catch (error) {
    console.error(
      "Shift save error:",
      error
    );

    alert(
      error.message ||
      "Unable to save shift."
    );
  } finally {
    shiftSubmitting =
      false;
  }
}

/* =========================================================
   ATTENDANCE
========================================================= */

async function loadEmployeeAttendance() {
  const employeeId =
    getEmployeeId(
      currentEmployee
    ) ||
    getStoredEmployeeId();

  if (!employeeId) {
    return;
  }

  try {
    const result =
      await api(
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

  if (!container) {
    return;
  }

  if (
    !Array.isArray(
      records
    ) ||
    !records.length
  ) {
    container.innerHTML =
      `<div class="empty-state">No attendance records.</div>`;

    return;
  }

  container.innerHTML =
    records
      .map(
        (item) => `
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
                ? `
                  <div>
                    In:
                    ${escapeHtml(
                      formatDateTime(
                        item.check_in
                      )
                    )}
                  </div>
                `
                : ""
            }

            ${
              item.check_out
                ? `
                  <div>
                    Out:
                    ${escapeHtml(
                      formatDateTime(
                        item.check_out
                      )
                    )}
                  </div>
                `
                : ""
            }

          </div>
        `
      )
      .join("");
}

/* =========================================================
   EMPLOYEE TABS
========================================================= */

function texmoEmployeeTab(
  tabName
) {
  if (!tabName) {
    return;
  }

  const buttons =
    document.querySelectorAll(
      "[data-employee-tab]"
    );

  buttons.forEach(
    (button) => {
      button.classList.toggle(
        "active",
        button.dataset.employeeTab ===
          tabName
      );
    }
  );

  const panels =
    document.querySelectorAll(
      "[data-employee-panel]"
    );

  let found =
    false;

  panels.forEach(
    (panel) => {
      const active =
        panel.dataset.employeePanel ===
        tabName;

      panel.style.display =
        active
          ? ""
          : "none";

      panel.classList.toggle(
        "active",
        active
      );

      if (active) {
        found =
          true;
      }
    }
  );

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
      .forEach(
        (panel) => {
          panel.style.display =
            "none";
        }
      );

    direct.style.display =
      "";
  }

  if (
    tabName ===
      "employeeRoom" ||
    tabName ===
      "room"
  ) {
    loadMyRoom();
  }

  if (
    tabName ===
      "employeeLeave" ||
    tabName ===
      "leave"
  ) {
    loadEmployeeLeave();
  }

  if (
    tabName ===
      "employeeVacate" ||
    tabName ===
      "vacate"
  ) {
    loadEmployeeVacate();
  }

  if (
    tabName ===
      "employeeCheckin" ||
    tabName ===
      "checkin"
  ) {
    loadEmployeeCheckin();
  }

  if (
    tabName ===
      "employeeAttendance" ||
    tabName ===
      "attendance"
  ) {
    loadEmployeeAttendance();
  }

  if (
    tabName ===
      "employeeFood" ||
    tabName ===
      "food"
  ) {
    generateFoodQR();
  }
}

/* =========================================================
   HR TABS
========================================================= */

function texmoHRTab(
  tabName
) {
  if (!tabName) {
    return;
  }

  const buttons =
    document.querySelectorAll(
      "[data-hr-tab]"
    );

  buttons.forEach(
    (button) => {
      button.classList.toggle(
        "active",
        button.dataset.hrTab ===
          tabName
      );
    }
  );

  const panels =
    document.querySelectorAll(
      "[data-hr-panel]"
    );

  let found =
    false;

  panels.forEach(
    (panel) => {
      const active =
        panel.dataset.hrPanel ===
        tabName;

      panel.style.display =
        active
          ? ""
          : "none";

      panel.classList.toggle(
        "active",
        active
      );

      if (active) {
        found =
          true;
      }
    }
  );

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
      .forEach(
        (panel) => {
          panel.style.display =
            "none";
        }
      );

    direct.style.display =
      "";
  }

  if (
    tabName ===
      "employees" ||
    tabName ===
      "hrEmployees"
  ) {
    loadEmployees();
  }

  if (
    tabName ===
      "cab" ||
    tabName ===
      "hrCab"
  ) {
    loadCabDashboard();
  }

  if (
    tabName ===
      "vacate" ||
    tabName ===
      "hrVacate"
  ) {
    loadHRVacates();
  }

  if (
    tabName ===
      "checkin" ||
    tabName ===
      "hrCheckin"
  ) {
    loadHRCheckins();
  }
}

/* =========================================================
   LOGOUT
========================================================= */

function logout() {
  stopScanner();

  currentEmployee =
    null;

  previousEmployeeInactive =
    null;

  hrEmployeeCache =
    [];

  clearStoredEmployee();

  try {
    localStorage.removeItem(
      "texmo_hr_login"
    );
  } catch {}

  stopBackgroundRefresh();

  stopHRBackgroundRefresh();

  showScreen(
    "loginScreen"
  );
}

/* =========================================================
   BACKGROUND REFRESH
========================================================= */

function stopBackgroundRefresh() {
  if (
    refreshTimer
  ) {
    clearInterval(
      refreshTimer
    );

    refreshTimer =
      null;
  }
}

function startBackgroundRefresh() {
  stopBackgroundRefresh();

  refreshTimer =
    setInterval(
      async () => {
        if (
          !currentEmployee ||
          !isOnline()
        ) {
          return;
        }

        const employeeId =
          getEmployeeId(
            currentEmployee
          );

        if (!employeeId) {
          return;
        }

        try {
          const result =
            await api(
              `/api/employees/${encodeURIComponent(employeeId)}`
            );

          const employee =
            extractEmployee(
              result
            );

          if (
            employee &&
            getEmployeeId(
              employee
            )
          ) {
            currentEmployee =
              employee;

            renderEmployee(
              employee
            );

            /*
              Historical/current status data
              remains refreshable.
            */

            await Promise.allSettled([
              loadMyRoom(),
              loadEmployeeLeave(),
              loadEmployeeVacate(),
              loadEmployeeCheckin()
            ]);
          }
        } catch (error) {
          console.warn(
            "Employee background refresh:",
            error
          );
        }
      },
      EMPLOYEE_REFRESH_MS
    );
}

function stopHRBackgroundRefresh() {
  if (
    hrRefreshTimer
  ) {
    clearInterval(
      hrRefreshTimer
    );

    hrRefreshTimer =
      null;
  }
}

function startHRBackgroundRefresh() {
  stopHRBackgroundRefresh();

  hrRefreshTimer =
    setInterval(
      async () => {
        if (
          !isOnline()
        ) {
          return;
        }

        const hrPortal =
          firstElement(
            "hrPortal"
          );

        /*
          If HR portal exists but is hidden,
          avoid unnecessary requests.
        */

        if (
          hrPortal &&
          hrPortal.style.display ===
            "none"
        ) {
          return;
        }

        await Promise.allSettled([
          loadCabDashboard(),
          loadEmployees(),
          loadHRVacates(),
          loadHRCheckins()
        ]);
      },
      HR_REFRESH_MS
    );
}

/* =========================================================
   EVENT HELPERS
========================================================= */

function bindClickIfExists(
  id,
  handler
) {
  const el =
    $(id);

  if (!el) {
    return;
  }

  el.addEventListener(
    "click",
    handler
  );
}

function bindFormIfExists(
  id,
  handler
) {
  const form =
    $(id);

  if (!form) {
    return;
  }

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
   Required for inline onclick=""
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

  window.renderEmployees =
    renderEmployees;

  window.filterHREmployees =
    filterHREmployees;

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

  window.downloadFile =
    downloadFile;

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

  /*
    Useful for debugging from browser console.
  */

  window.isEmployeeInactive =
    isEmployeeInactive;

  window.applyEmployeeAccessState =
    applyEmployeeAccessState;
}

/* =========================================================
   OPTIONAL EVENT BINDING
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

  /*
    Live HR employee filtering,
    only if those fields exist.
  */

  const searchInput =
    firstElement(
      "employeeSearch",
      "hrEmployeeSearch"
    );

  if (searchInput) {
    searchInput.addEventListener(
      "input",
      filterHREmployees
    );
  }

  const statusFilter =
    firstElement(
      "employeeStatusFilter",
      "hrEmployeeStatusFilter"
    );

  if (statusFilter) {
    statusFilter.addEventListener(
      "change",
      filterHREmployees
    );
  }
}

/* =========================================================
   DATE DEFAULTS
========================================================= */

function initializeDateDefaults() {
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
}

/* =========================================================
   ONLINE / OFFLINE STATUS
========================================================= */

function updateConnectionStatus() {
  const online =
    isOnline();

  const elements = [
    "connectionStatus",
    "networkStatus",
    "texmoConnectionStatus"
  ];

  elements.forEach(
    (id) => {
      const el =
        $(id);

      if (!el) {
        return;
      }

      el.textContent =
        online
          ? "ONLINE"
          : "OFFLINE";

      el.dataset.status =
        online
          ? "online"
          : "offline";
    }
  );
}

window.addEventListener(
  "online",
  () => {
    console.log(
      "TEXMO: online"
    );

    updateConnectionStatus();

    /*
      Refresh immediately after connection
      comes back.
    */

    if (
      currentEmployee
    ) {
      loadEmployee();
    }
  }
);

window.addEventListener(
  "offline",
  () => {
    console.warn(
      "TEXMO: offline"
    );

    updateConnectionStatus();
  }
);

/* =========================================================
   SAFE INITIALIZATION
========================================================= */

async function initializeTexmoApp() {
  if (appInitialized) {
    return;
  }

  appInitialized =
    true;

  try {
    bindTexmoFunctions();

    bindTexmoEvents();

    initializeDateDefaults();

    updateConnectionStatus();

    /*
      Food QR can work independently.
    */

    generateFoodQR();

    /*
      Restore employee session if available.
    */

    await loadEmployee();

    /*
      Start employee refresh.
    */

    startBackgroundRefresh();

    /*
      HR login intentionally remains explicit.
      We do NOT auto-login HR merely from localStorage.
    */

  } catch (error) {
    console.error(
      "TEXMO initialization error:",
      error
    );
  }
}

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