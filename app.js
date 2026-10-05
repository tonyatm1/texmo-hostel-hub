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
    <div class="${
      type === "error"
        ? "error-box"
        : "success-box"
    }">
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
    throw new Error(
      data.error || "Request failed"
    );
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

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("en-IN");
}

function formatDateTime(value) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("en-IN");
}


/* =========================
   SCREEN CONTROL
========================= */

function showScreen(id) {
  document
    .querySelectorAll("main > section")
    .forEach(section => {
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
      `/api/employees/${encodeURIComponent(
        employeeId
      )}`
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

    employee_id:
      getValue(["regEmployeeId"]),

    name:
      getValue(["regName"]),

    department:
      getValue(["regDepartment"]),

    designation:
      getValue(["regDesignation"]),

    phone:
      getValue(["regPhone"]),

    shift:
      getSelectValue(["regShift"]),

    room:
      getValue(["regRoom"])
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

      const loginInput =
        firstElement([
          "employeeLoginId",
          "loginEmployeeId"
        ]);

      if (loginInput) {
        loginInput.value =
          result.employee_id;
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
    localStorage.getItem(
      "texmo_employee_id"
    );

  if (!employeeId) {
    showScreen("employeeLogin");
    return;
  }

  try {

    const data = await api(
      `/api/employees/${encodeURIComponent(
        employeeId
      )}`
    );

    currentEmployee =
      data.employee;

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

  const employee =
    currentEmployee;

  const box =
    firstElement([
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
          <span class="profile-label">
            Employee ID
          </span>

          <span class="profile-value">
            ${escapeHtml(
              employee.employee_id
            )}
          </span>
        </div>

        <div class="profile-row">
          <span class="profile-label">
            Department
          </span>

          <span class="profile-value">
            ${escapeHtml(
              employee.department
            )}
          </span>
        </div>

        <div class="profile-row">
          <span class="profile-label">
            Designation
          </span>

          <span class="profile-value">
            ${escapeHtml(
              employee.designation || "-"
            )}
          </span>
        </div>

        <div class="profile-row">
          <span class="profile-label">
            Phone
          </span>

          <span class="profile-value">
            ${escapeHtml(
              employee.phone || "-"
            )}
          </span>
        </div>

        <div class="profile-row">
          <span class="profile-label">
            Shift
          </span>

          <span class="profile-value">
            ${escapeHtml(
              employee.shift || "-"
            )}
          </span>
        </div>

        <div class="profile-row">
          <span class="profile-label">
            Room
          </span>

          <span class="profile-value">
            ${escapeHtml(
              employee.room || "-"
            )}
          </span>
        </div>

        <div class="profile-row">
          <span class="profile-label">
            Bed
          </span>

          <span class="profile-value">
            ${escapeHtml(
              employee.bed_no || "-"
            )}
          </span>
        </div>

        <div class="profile-row">
          <span class="profile-label">
            Hostel Status
          </span>

          <span class="profile-value">
            <span class="badge">
              ${escapeHtml(
                employee.hostel_status || "IN"
              )}
            </span>
          </span>
        </div>

        <div class="profile-row">
          <span class="profile-label">
            Account Status
          </span>

          <span class="profile-value">
            <span class="badge">
              ${escapeHtml(
                employee.status || "-"
              )}
            </span>
          </span>
        </div>

      </div>
    `;
  }

  createEmployeeQR(
    employee.qr_token
  );
       }
/* =========================
   MY ROOM
========================= */

async function loadMyRoom() {
  if (!currentEmployee) return;

  try {
    const data = await api(
      `/api/employee-room/${encodeURIComponent(currentEmployee.employee_id)}`
    );

    renderMyRoom(data);
  } catch (error) {
    console.error("My Room loading error:", error);
  }
}

function renderMyRoom(data) {
  const target = firstElement([
    "myRoomDetails",
    "employeeRoomDetails",
    "myRoom"
  ]);

  if (!target) return;

  if (!data || !data.employee) {
    target.innerHTML =
      '<div class="empty-box">Room details not available.</div>';
    return;
  }

  const employee = data.employee;
  const room = data.room || {};

  target.innerHTML = `
    <div class="room-card">
      <div class="room-title">🏠 My Room</div>

      <div class="room-info">
        <div>
          <span>Employee ID</span>
          <strong>${escapeHTML(employee.employee_id || "-")}</strong>
        </div>

        <div>
          <span>Name</span>
          <strong>${escapeHTML(employee.name || "-")}</strong>
        </div>

        <div>
          <span>Block</span>
          <strong>${escapeHTML(room.block || "-")}</strong>
        </div>

        <div>
          <span>Room</span>
          <strong>${escapeHTML(room.room_no || "-")}</strong>
        </div>

        <div>
          <span>Bed</span>
          <strong>${escapeHTML(employee.bed_no || "-")}</strong>
        </div>

        <div>
          <span>Status</span>
          <strong>${escapeHTML(employee.hostel_status || "-")}</strong>
        </div>
      </div>
    </div>
  `;
}


/* =========================
   LEAVE
========================= */

async function submitEmployeeLeave() {
  if (!currentEmployee) {
    message("leaveMessage", "Please login first", "error");
    return;
  }

  const fromDate = getValue([
    "leaveFromDate",
    "employeeLeaveFromDate",
    "leaveStartDate"
  ]);

  const toDate = getValue([
    "leaveToDate",
    "employeeLeaveToDate",
    "leaveEndDate"
  ]);

  const reason = getValue([
    "leaveReason",
    "employeeLeaveReason"
  ]);

  const roomVacate = getValue([
    "leaveRoomVacate",
    "roomVacate",
    "employeeRoomVacate"
  ]);

  if (!fromDate || !toDate) {
    message(
      "leaveMessage",
      "Select leave start date and end date",
      "error"
    );
    return;
  }

  try {
    const result = await api("/api/leave", {
      method: "POST",

      body: JSON.stringify({
        employee_id: currentEmployee.employee_id,
        from_date: fromDate,
        to_date: toDate,
        reason: reason,
        room_vacate: roomVacate
      })
    });

    message(
      "leaveMessage",
      result.message || "Leave request submitted."
    );

    await loadEmployeeLeave();

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
    console.error("Leave loading error:", error);
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
      '<div class="empty-box">No leave records found.</div>';
    return;
  }

  target.innerHTML = leaves.map(item => `
    <div class="history-card">

      <div>
        <strong>
          ${escapeHTML(item.from_date || "-")}
          →
          ${escapeHTML(item.to_date || "-")}
        </strong>
      </div>

      <div>
        Reason:
        ${escapeHTML(item.reason || "-")}
      </div>

      <div>
        Room Vacate:
        ${escapeHTML(
          item.room_vacate ? "YES" : "NO"
        )}
      </div>

      <div>
        Status:
        <strong>
          ${escapeHTML(item.status || "PENDING")}
        </strong>
      </div>

    </div>
  `).join("");
}


/* =========================
   DIRECT VACATE
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
    const result = await api("/api/vacate", {
      method: "POST",

      body: JSON.stringify({
        employee_id: currentEmployee.employee_id,
        vacate_date: vacateDate,
        return_date: returnDate,
        reason: reason
      })
    });

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
      '<div class="empty-box">No vacate records found.</div>';
    return;
  }

  target.innerHTML = vacates.map(item => `
    <div class="history-card">

      <div>
        <strong>
          Vacate:
          ${escapeHTML(item.vacate_date || "-")}
        </strong>
      </div>

      <div>
        Return:
        ${escapeHTML(item.return_date || "-")}
      </div>

      <div>
        Reason:
        ${escapeHTML(item.reason || "-")}
      </div>

      <div>
        Status:
        <strong>
          ${escapeHTML(item.status || "PENDING")}
        </strong>
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

  const checkinDate = getValue([
    "checkinDate",
    "employeeCheckinDate"
  ]);

  const requestedRoom = getValue([
    "checkinRoom",
    "employeeCheckinRoom",
    "requestedRoom"
  ]);

  const reason = getValue([
    "checkinReason",
    "employeeCheckinReason"
  ]);

  if (!checkinDate) {
    message(
      "checkinMessage",
      "Select check-in date",
      "error"
    );
    return;
  }

  try {
    const result = await api("/api/checkin", {
      method: "POST",

      body: JSON.stringify({
        employee_id: currentEmployee.employee_id,
        checkin_date: checkinDate,
        requested_room: requestedRoom,
        reason: reason
      })
    });

    message(
      "checkinMessage",
      result.message ||
        "Check-in request submitted."
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
      data.checkins || []
    );

  } catch (error) {
    console.error(
      "Check-in loading error:",
      error
    );
  }
}


function renderEmployeeCheckin(checkins) {
  const target = firstElement([
    "checkinHistory",
    "employeeCheckinHistory",
    "checkinList"
  ]);

  if (!target) return;

  if (!checkins.length) {
    target.innerHTML =
      '<div class="empty-box">No check-in records found.</div>';
    return;
  }

  target.innerHTML = checkins.map(item => `
    <div class="history-card">

      <div>
        <strong>
          Check-in:
          ${escapeHTML(item.checkin_date || "-")}
        </strong>
      </div>

      <div>
        Requested Room:
        ${escapeHTML(item.requested_room || "-")}
      </div>

      <div>
        Reason:
        ${escapeHTML(item.reason || "-")}
      </div>

      <div>
        Status:
        <strong>
          ${escapeHTML(item.status || "PENDING")}
        </strong>
      </div>

    </div>
  `).join("");
}


/* =========================
   HR LOGIN
========================= */

async function hrLogin() {
  const username = getValue([
    "hrUsername",
    "hrUser",
    "username"
  ]);

  const password = getValue([
    "hrPassword",
    "hrPass",
    "password"
  ]);

  if (!username || !password) {
    message(
      "hrLoginMessage",
      "Enter HR username and password",
      "error"
    );
    return;
  }

  try {
    const result = await api("/api/hr/login", {
      method: "POST",

      body: JSON.stringify({
        username: username,
        password: password
      })
    });

    if (!result.success) {
      throw new Error(
        result.message || "Invalid HR login"
      );
    }

    showScreen("hrPortal");

    await loadDashboard();

    await loadHRVacates();

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
    const data = await api(
      "/api/hr/dashboard"
    );

    updateText(
      "totalEmployees",
      data.totalEmployees ?? 0
    );

    updateText(
      "activeEmployees",
      data.activeEmployees ?? 0
    );

    updateText(
      "hostelInCount",
      data.hostelIn ?? 0
    );

    updateText(
      "hostelOutCount",
      data.hostelOut ?? 0
    );

    if (data.rooms) {
      renderRoomDashboard(data.rooms);
    }

  } catch (error) {
    console.error(
      "Dashboard loading error:",
      error
    );
  }
}


function renderRoomDashboard(rooms) {
  const target = firstElement([
    "roomDashboard",
    "hrRoomDashboard",
    "roomCards"
  ]);

  if (!target) return;

  if (!rooms || !rooms.length) {
    target.innerHTML =
      '<div class="empty-box">No room data available.</div>';
    return;
  }

  target.innerHTML = rooms.map(room => `
    <div class="room-dashboard-card">

      <div class="room-title">
        ${escapeHTML(room.room_no || "-")}
      </div>

      <div>
        Block:
        ${escapeHTML(room.block || "-")}
      </div>

      <div>
        Occupancy:
        <strong>
          ${room.occupied ?? 0}/${room.capacity ?? 0}
        </strong>
      </div>

      <div>
        Available:
        <strong>
          ${
            Math.max(
              0,
              (room.capacity || 0) -
              (room.occupied || 0)
            )
          }
        </strong>
      </div>

    </div>
  `).join("");
}


/* =========================
   HR VACATE MANAGEMENT
========================= */

async function loadHRVacates() {
  try {
    const data = await api(
      "/api/hr/vacates"
    );

    renderHRVacates(
      data.vacates || []
    );

  } catch (error) {
    console.error(
      "HR vacate loading error:",
      error
    );
  }
}


function renderHRVacates(vacates) {
  const pending = vacates.filter(
    item => item.status === "PENDING"
  );

  const approved = vacates.filter(
    item => item.status === "APPROVED"
  );

  const returned = vacates.filter(
    item => item.status === "RETURNED"
  );

  const today = new Date();

  const overdue = vacates.filter(item => {
    if (!item.vacate_date) return false;

    const start = new Date(
      item.vacate_date
    );

    const diff =
      Math.floor(
        (today - start) /
        (1000 * 60 * 60 * 24)
      );

    return (
      diff >= 5 &&
      item.status === "APPROVED"
    );
  });

  updateText(
    "pendingVacateCount",
    pending.length
  );

  updateText(
    "approvedVacateCount",
    approved.length
  );

  updateText(
    "returnedVacateCount",
    returned.length
  );

  updateText(
    "overdueVacateCount",
    overdue.length
  );

  const target = firstElement([
    "hrVacateList",
    "vacateManagementList",
    "hrVacates"
  ]);

  if (!target) return;

  if (!vacates.length) {
    target.innerHTML =
      '<div class="empty-box">Vacate records will appear here.</div>';
    return;
  }

  target.innerHTML = vacates.map(item => `
    <div class="hr-vacate-card">

      <div class="vacate-header">
        <strong>
          ${escapeHTML(
            item.employee_id || "-"
          )}
        </strong>

        <span class="status-badge">
          ${escapeHTML(
            item.status || "PENDING"
          )}
        </span>
      </div>

      <div>
        Name:
        ${escapeHTML(
          item.employee_name || "-"
        )}
      </div>

      <div>
        Department:
        ${escapeHTML(
          item.department || "-"
        )}
      </div>

      <div>
        Vacate Date:
        ${escapeHTML(
          item.vacate_date || "-"
        )}
      </div>

      <div>
        Return Date:
        ${escapeHTML(
          item.return_date || "-"
        )}
      </div>

      <div>
        Reason:
        ${escapeHTML(
          item.reason || "-"
        )}
      </div>

      ${
        item.status === "PENDING"
          ? `
            <div class="action-row">

              <button
                class="green"
                onclick="approveHRVacate(${item.id})">
                ✅ Approve
              </button>

              <button
                class="red"
                onclick="rejectHRVacate(${item.id})">
                ❌ Reject
              </button>

            </div>
          `
          : ""
      }

    </div>
  `).join("");
}


async function approveHRVacate(id) {
  if (!id) return;

  try {
    const result = await api(
      `/api/hr/vacates/${id}/approve`,
      {
        method: "POST"
      }
    );

    alert(
      result.message ||
      "Vacate approved."
    );

    await loadHRVacates();
    await loadDashboard();

  } catch (error) {
    alert(error.message);
  }
}


async function rejectHRVacate(id) {
  if (!id) return;

  try {
    const result = await api(
      `/api/hr/vacates/${id}/reject`,
      {
        method: "POST"
      }
    );

    alert(
      result.message ||
      "Vacate rejected."
    );

    await loadHRVacates();

  } catch (error) {
    alert(error.message);
  }
}


/* =========================
   HR CHECK-IN MANAGEMENT
========================= */

async function loadHRCheckins() {
  try {
    const data = await api(
      "/api/hr/checkins"
    );

    renderHRCheckins(
      data.checkins || []
    );

  } catch (error) {
    console.error(
      "HR check-in loading error:",
      error
    );
  }
}


function renderHRCheckins(checkins) {
  const target = firstElement([
    "hrCheckinList",
    "checkinManagementList",
    "hrCheckins"
  ]);

  if (!target) return;

  if (!checkins.length) {
    target.innerHTML =
      '<div class="empty-box">No check-in requests found.</div>';
    return;
  }

  target.innerHTML = checkins.map(item => `
    <div class="hr-checkin-card">

      <div class="vacate-header">
        <strong>
          ${escapeHTML(
            item.employee_id || "-"
          )}
        </strong>

        <span class="status-badge">
          ${escapeHTML(
            item.status || "PENDING"
          )}
        </span>
      </div>

      <div>
        Name:
        ${escapeHTML(
          item.employee_name || "-"
        )}
      </div>

      <div>
        Requested Room:
        ${escapeHTML(
          item.requested_room || "-"
        )}
      </div>

      <div>
        Check-in Date:
        ${escapeHTML(
          item.checkin_date || "-"
        )}
      </div>

      <div>
        Reason:
        ${escapeHTML(
          item.reason || "-"
        )}
      </div>

      ${
        item.status === "PENDING"
          ? `
            <div class="action-row">

              <button
                class="green"
                onclick="approveHRCheckin(${item.id})">
                ✅ Approve
              </button>

              <button
                class="red"
                onclick="rejectHRCheckin(${item.id})">
                ❌ Reject
              </button>

            </div>
          `
          : ""
      }

    </div>
  `).join("");
}


async function approveHRCheckin(id) {
  if (!id) return;

  try {
    const result = await api(
      `/api/hr/checkins/${id}/approve`,
      {
        method: "POST"
      }
    );

    alert(
      result.message ||
      "Check-in approved."
    );

    await loadHRCheckins();
    await loadDashboard();

  } catch (error) {
    alert(error.message);
  }
}


async function rejectHRCheckin(id) {
  if (!id) return;

  try {
    const result = await api(
      `/api/hr/checkins/${id}/reject`,
      {
        method: "POST"
      }
    );

    alert(
      result.message ||
      "Check-in rejected."
    );

    await loadHRCheckins();

  } catch (error) {
    alert(error.message);
  }
}
/* =========================
   CAB QR SCANNER
========================= */

async function startCabScanner() {
  if (scannerBusy) return;

  scannerBusy = true;

  const video = document.getElementById(
    "cabScannerVideo"
  );

  if (!video) {
    scannerBusy = false;
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

    scannerDetector = null;

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
      } catch (error) {
        console.error(
          "BarcodeDetector error:",
          error
        );
      }
    }

    if (!scannerDetector) {
      await loadJSQR();
    }

    scanCabFrame();

  } catch (error) {
    scannerBusy = false;

    message(
      "cabScannerMessage",
      error.message ||
        "Camera permission required.",
      "error"
    );
  }
}


async function loadJSQR() {
  if (jsQRLoaded) return;

  return new Promise(
    (resolve, reject) => {

      const script =
        document.createElement(
          "script"
        );

      script.src =
        "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js";

      script.onload = () => {
        jsQRLoaded = true;
        resolve();
      };

      script.onerror = () => {
        reject(
          new Error(
            "Unable to load QR scanner."
          )
        );
      };

      document.head.appendChild(
        script
      );
    }
  );
}


async function scanCabFrame() {
  if (!scannerBusy) return;

  const video =
    document.getElementById(
      "cabScannerVideo"
    );

  if (!video) {
    stopCabScanner();
    return;
  }

  try {

    if (
      scannerDetector &&
      video.readyState >= 2
    ) {

      const codes =
        await scannerDetector.detect(
          video
        );

      if (codes.length) {

        const value =
          codes[0].rawValue;

        if (value) {
          await processCabQR(value);
          return;
        }
      }

    } else if (
      window.jsQR &&
      video.readyState >= 2
    ) {

      const canvas =
        document.createElement(
          "canvas"
        );

      canvas.width =
        video.videoWidth;

      canvas.height =
        video.videoHeight;

      const ctx =
        canvas.getContext(
          "2d"
        );

      ctx.drawImage(
        video,
        0,
        0,
        canvas.width,
        canvas.height
      );

      const imageData =
        ctx.getImageData(
          0,
          0,
          canvas.width,
          canvas.height
        );

      const code =
        window.jsQR(
          imageData.data,
          imageData.width,
          imageData.height
        );

      if (code && code.data) {
        await processCabQR(
          code.data
        );
        return;
      }
    }

  } catch (error) {
    console.error(
      "QR scan error:",
      error
    );
  }

  scannerTimer =
    requestAnimationFrame(
      scanCabFrame
    );
}


function stopCabScanner() {
  scannerBusy = false;

  if (scannerTimer) {
    cancelAnimationFrame(
      scannerTimer
    );

    scannerTimer = null;
  }

  if (scannerStream) {

    scannerStream
      .getTracks()
      .forEach(track =>
        track.stop()
      );

    scannerStream = null;
  }

  const video =
    document.getElementById(
      "cabScannerVideo"
    );

  if (video) {
    video.srcObject = null;
  }
}


async function processCabQR(value) {
  stopCabScanner();

  if (!value) return;

  let employeeId =
    String(value).trim();

  try {
    const parsed =
      JSON.parse(value);

    employeeId =
      parsed.employee_id ||
      parsed.employeeId ||
      parsed.id ||
      employeeId;

  } catch (error) {
    // Normal text QR
  }

  try {

    const result =
      await api(
        "/api/cab/scan",
        {
          method: "POST",

          body: JSON.stringify({
            employee_id:
              employeeId
          })
        }
      );

    message(
      "cabScannerMessage",
      result.message ||
        "Employee added to cab."
    );

    await loadCabDashboard();

  } catch (error) {

    message(
      "cabScannerMessage",
      error.message,
      "error"
    );
  }
}


/* =========================
   CAB DASHBOARD
========================= */

async function loadCabDashboard() {
  try {

    const data =
      await api(
        "/api/cab/dashboard"
      );

    renderCabDashboard(
      data
    );

  } catch (error) {

    console.error(
      "Cab dashboard error:",
      error
    );
  }
}


function renderCabDashboard(data) {

  const target =
    firstElement([
      "cabDashboard",
      "cabEntries",
      "cabList"
    ]);

  if (!target) return;

  const entries =
    data.entries ||
    data.cabs ||
    [];

  if (!entries.length) {

    target.innerHTML =
      '<div class="empty-box">No cab entries found.</div>';

    return;
  }

  target.innerHTML =
    entries.map(item => `
      <div class="cab-card">

        <div>
          <strong>
            Cab ${escapeHTML(
              item.cab_no ||
              item.cab_number ||
              "-"
            )}
          </strong>
        </div>

        <div>
          Employee:
          ${escapeHTML(
            item.employee_id ||
            "-"
          )}
        </div>

        <div>
          Name:
          ${escapeHTML(
            item.employee_name ||
            item.name ||
            "-"
          )}
        </div>

        <div>
          Department:
          ${escapeHTML(
            item.department ||
            "-"
          )}
        </div>

        <div>
          Date:
          ${escapeHTML(
            item.entry_date ||
            item.date ||
            "-"
          )}
        </div>

        <div>
          Time:
          ${escapeHTML(
            item.entry_time ||
            item.time ||
            "-"
          )}
        </div>

      </div>
    `).join("");
}


/* =========================
   HR EMPLOYEES
========================= */

async function loadHREmployees() {

  try {

    const data =
      await api(
        "/api/employees"
      );

    renderHREmployees(
      data.employees ||
      []
    );

  } catch (error) {

    console.error(
      "Employee loading error:",
      error
    );
  }
}


function renderHREmployees(
  employees
) {

  const target =
    firstElement([
      "hrEmployeeList",
      "employeeManagementList",
      "employeesList"
    ]);

  if (!target) return;

  if (!employees.length) {

    target.innerHTML =
      '<div class="empty-box">No employees found.</div>';

    return;
  }

  target.innerHTML =
    employees.map(item => `
      <div class="employee-card">

        <div class="employee-header">

          <strong>
            ${escapeHTML(
              item.employee_id ||
              "-"
            )}
          </strong>

          <span>
            ${escapeHTML(
              item.hostel_status ||
              "IN"
            )}
          </span>

        </div>

        <div>
          Name:
          ${escapeHTML(
            item.name ||
            "-"
          )}
        </div>

        <div>
          Department:
          ${escapeHTML(
            item.department ||
            "-"
          )}
        </div>

        <div>
          Designation:
          ${escapeHTML(
            item.designation ||
            "-"
          )}
        </div>

        <div>
          Room:
          ${escapeHTML(
            item.room_no ||
            "-"
          )}
        </div>

        <div>
          Bed:
          ${escapeHTML(
            item.bed_no ||
            "-"
          )}
        </div>

      </div>
    `).join("");
}


/* =========================
   EXPORTS
========================= */

async function downloadCabExcel() {

  try {

    const response =
      await fetch(
        `${API}/api/cab/export`
      );

    if (!response.ok) {
      throw new Error(
        "Cab export failed."
      );
    }

    const blob =
      await response.blob();

    const url =
      URL.createObjectURL(
        blob
      );

    const link =
      document.createElement(
        "a"
      );

    link.href = url;

    link.download =
      `texmo-cab-${todayString()}.csv`;

    document.body.appendChild(
      link
    );

    link.click();

    link.remove();

    URL.revokeObjectURL(
      url
    );

  } catch (error) {

    alert(error.message);
  }
}


async function downloadVacateExcel() {

  try {

    const response =
      await fetch(
        `${API}/api/hr/vacates/export`
      );

    if (!response.ok) {
      throw new Error(
        "Vacate export failed."
      );
    }

    const blob =
      await response.blob();

    const url =
      URL.createObjectURL(
        blob
      );

    const link =
      document.createElement(
        "a"
      );

    link.href = url;

    link.download =
      `texmo-vacate-${todayString()}.csv`;

    document.body.appendChild(
      link
    );

    link.click();

    link.remove();

    URL.revokeObjectURL(
      url
    );

  } catch (error) {

    alert(error.message);
  }
}


/* =========================
   FOOD QR
========================= */

function generateFoodQR() {

  if (!currentEmployee) {

    message(
      "foodQRMessage",
      "Please login first",
      "error"
    );

    return;
  }

  const target =
    firstElement([
      "foodQR",
      "foodQRCode",
      "employeeFoodQR"
    ]);

  if (!target) return;

  const qrText =
    JSON.stringify({
      employee_id:
        currentEmployee.employee_id,

      name:
        currentEmployee.name,

      type:
        "FOOD"
    });

  target.innerHTML = `
    <div class="qr-box">

      <div class="qr-data">
        ${escapeHTML(qrText)}
      </div>

      <div>
        Employee Food QR
      </div>

    </div>
  `;

  message(
    "foodQRMessage",
    "Food QR generated."
  );
}


/* =========================
   EMPLOYEE SHIFT
========================= */

async function saveEmployeeShift() {

  if (!currentEmployee) {

    message(
      "shiftMessage",
      "Please login first",
      "error"
    );

    return;
  }

  const shift =
    getValue([
      "employeeShift",
      "shiftSelect",
      "shift"
    ]);

  if (!shift) {

    message(
      "shiftMessage",
      "Select shift",
      "error"
    );

    return;
  }

  try {

    const result =
      await api(
        "/api/employee/shift",
        {
          method: "POST",

          body: JSON.stringify({
            employee_id:
              currentEmployee.employee_id,

            shift:
              shift
          })
        }
      );

    message(
      "shiftMessage",
      result.message ||
        "Shift saved."
    );

    currentEmployee.shift =
      shift;

  } catch (error) {

    message(
      "shiftMessage",
      error.message,
      "error"
    );
  }
       }
/* =========================
   EMPLOYEE TAB CONTROL
========================= */

function texmoEmployeeTab(tab) {

  const sections = [
    "employeeHome",
    "employeeProfile",
    "employeeRoom",
    "employeeLeave",
    "employeeVacate",
    "employeeCheckin",
    "employeeCab",
    "employeeFood",
    "employeeShift"
  ];

  sections.forEach(id => {
    const element =
      document.getElementById(id);

    if (element) {
      element.style.display =
        "none";
    }
  });

  const target =
    document.getElementById(
      `employee${capitalize(tab)}`
    );

  if (target) {
    target.style.display =
      "block";
  }

  if (tab === "room") {
    loadMyRoom();
  }

  if (tab === "leave") {
    loadEmployeeLeave();
  }

  if (tab === "vacate") {
    loadEmployeeVacate();
  }

  if (tab === "checkin") {
    loadEmployeeCheckin();
  }

  if (tab === "cab") {
    loadCabDashboard();
  }
}


/* =========================
   HR TAB CONTROL
========================= */

function texmoHRTab(tab) {

  const sections = [
    "hrDashboard",
    "hrEmployees",
    "hrRooms",
    "hrVacate",
    "hrCheckin",
    "hrCab",
    "hrReports"
  ];

  sections.forEach(id => {

    const element =
      document.getElementById(id);

    if (element) {
      element.style.display =
        "none";
    }

  });

  const target =
    firstElement([
      `hr${capitalize(tab)}`,
      `hr${tab}`,
      tab
    ]);

  if (target) {
    target.style.display =
      "block";
  }

  if (
    tab === "dashboard" ||
    tab === "home"
  ) {
    loadDashboard();
  }

  if (
    tab === "employees" ||
    tab === "employee"
  ) {
    loadHREmployees();
  }

  if (
    tab === "vacate" ||
    tab === "hrVacate"
  ) {
    loadHRVacates();
  }

  if (
    tab === "checkin" ||
    tab === "hrCheckin"
  ) {
    loadHRCheckins();
  }

  if (
    tab === "cab" ||
    tab === "hrCab"
  ) {
    loadCabDashboard();
  }
}


/* =========================
   ATTENDANCE
========================= */

async function markAttendance(type) {

  if (!currentEmployee) {

    message(
      "attendanceMessage",
      "Please login first",
      "error"
    );

    return;
  }

  if (
    type !== "IN" &&
    type !== "OUT"
  ) {

    message(
      "attendanceMessage",
      "Invalid attendance type",
      "error"
    );

    return;
  }

  try {

    const result =
      await api(
        "/api/attendance",
        {
          method: "POST",

          body: JSON.stringify({
            employee_id:
              currentEmployee.employee_id,

            type:
              type
          })
        }
      );

    message(
      "attendanceMessage",
      result.message ||
        `Attendance ${type} marked.`
    );

  } catch (error) {

    message(
      "attendanceMessage",
      error.message,
      "error"
    );
  }
}


/* =========================
   LOGOUT
========================= */

function employeeLogout() {

  currentEmployee = null;

  localStorage.removeItem(
    "texmo_employee"
  );

  showScreen(
    "employeeLogin"
  );
}


function hrLogout() {

  localStorage.removeItem(
    "texmo_hr"
  );

  showScreen(
    "hrLogin"
  );
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

  window.loadEmployeeLeave =
    loadEmployeeLeave;

  window.loadEmployeeVacate =
    loadEmployeeVacate;

  window.loadEmployeeCheckin =
    loadEmployeeCheckin;

  window.loadMyRoom =
    loadMyRoom;

  window.hrLogin =
    hrLogin;

  window.loadDashboard =
    loadDashboard;

  window.loadHRVacates =
    loadHRVacates;

  window.approveHRVacate =
    approveHRVacate;

  window.rejectHRVacate =
    rejectHRVacate;

  window.loadHRCheckins =
    loadHRCheckins;

  window.approveHRCheckin =
    approveHRCheckin;

  window.rejectHRCheckin =
    rejectHRCheckin;

  window.startCabScanner =
    startCabScanner;

  window.stopCabScanner =
    stopCabScanner;

  window.loadCabDashboard =
    loadCabDashboard;

  window.downloadCabExcel =
    downloadCabExcel;

  window.downloadVacateExcel =
    downloadVacateExcel;

  window.generateFoodQR =
    generateFoodQR;

  window.saveEmployeeShift =
    saveEmployeeShift;

  window.texmoEmployeeTab =
    texmoEmployeeTab;

  window.texmoHRTab =
    texmoHRTab;

  window.markAttendance =
    markAttendance;

  window.employeeLogout =
    employeeLogout;

  window.hrLogout =
    hrLogout;
}


/* =========================
   AUTO REFRESH
========================= */

let texmoRefreshTimer = null;

function startTexmoAutoRefresh() {

  if (texmoRefreshTimer) {
    clearInterval(
      texmoRefreshTimer
    );
  }

  texmoRefreshTimer =
    setInterval(
      async () => {

        try {

          const employeePortal =
            document.getElementById(
              "employeePortal"
            );

          const hrPortal =
            document.getElementById(
              "hrPortal"
            );

          if (
            currentEmployee &&
            employeePortal &&
            employeePortal.style.display !==
              "none"
          ) {

            await loadMyRoom();
            await loadEmployeeLeave();
            await loadEmployeeVacate();
            await loadEmployeeCheckin();

          }

          if (
            hrPortal &&
            hrPortal.style.display !==
              "none"
          ) {

            await loadDashboard();
            await loadHRVacates();
            await loadHRCheckins();

          }

        } catch (error) {

          console.error(
            "Auto refresh error:",
            error
          );

        }

      },
      30000
    );
}


/* =========================
   PAGE START
========================= */

document.addEventListener(
  "DOMContentLoaded",
  async () => {

    try {

      bindTexmoFunctions();

      startTexmoAutoRefresh();

      const savedEmployee =
        localStorage.getItem(
          "texmo_employee"
        );

      if (savedEmployee) {

        try {

          currentEmployee =
            JSON.parse(
              savedEmployee
            );

        } catch (error) {

          localStorage.removeItem(
            "texmo_employee"
          );

          currentEmployee = null;
        }
      }

      const savedHR =
        localStorage.getItem(
          "texmo_hr"
        );

      if (savedHR) {

        showScreen(
          "hrPortal"
        );

        await loadDashboard();
        await loadHRVacates();
        await loadHRCheckins();

      } else if (currentEmployee) {

        showScreen(
          "employeePortal"
        );

        await loadMyRoom();
        await loadEmployeeLeave();
        await loadEmployeeVacate();
        await loadEmployeeCheckin();

      } else {

        showScreen(
          "employeeLogin"
        );
      }

    } catch (error) {

      console.error(
        "TEXMO initialization error:",
        error
      );

    }

  }
);
