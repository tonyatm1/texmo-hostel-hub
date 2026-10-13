
/* =========================================================
   TEXMO HOSTEL HUB
   Frontend Application
   Uses the existing Cloudflare Worker and D1 database.
   ========================================================= */

"use strict";

const API_BASE = "";
const TOKEN_KEY = "thh_session_token";
const USER_KEY = "thh_current_user";

const DEPARTMENTS = ["PDN", "PDN2", "PDN3", "MDN"];
const SHIFTS = ["SHIFT 1", "SHIFT 2", "SHIFT 3"];

let currentUser = readStoredUser();
let currentToken = localStorage.getItem(TOKEN_KEY) || "";
let activeSection = "dashboard";

/* -------------------- BASIC HELPERS -------------------- */

function $(id) {
  return document.getElementById(id);
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function readStoredUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || "null");
  } catch {
    return null;
  }
}

function saveSession(data) {
  const token =
    data?.token ||
    data?.session_token ||
    data?.sessionToken ||
    data?.access_token;

  const user =
    data?.user ||
    data?.person ||
    data?.staff ||
    data?.profile ||
    null;

  if (token) {
    currentToken = token;
    localStorage.setItem(TOKEN_KEY, token);
  }

  if (user) {
    currentUser = user;
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }
}

function showMessage(message, type = "info", targetId = "") {
  const target = targetId ? $(targetId) : null;

  if (target) {
    target.textContent = message;
    target.dataset.type = type;
    target.style.color =
      type === "error" ? "#b91c1c" :
      type === "success" ? "#15803d" : "#475569";
    return;
  }

  let toast = $("thhToast");

  if (!toast) {
    toast = document.createElement("div");
    toast.id = "thhToast";
    toast.setAttribute("role", "status");
    Object.assign(toast.style, {
      position: "fixed",
      left: "16px",
      right: "16px",
      bottom: "20px",
      zIndex: "99999",
      padding: "14px 16px",
      borderRadius: "12px",
      background: "#ffffff",
      color: "#1e293b",
      boxShadow: "0 5px 24px #0002",
      fontSize: "14px",
      fontWeight: "600"
    });
    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.style.borderLeft =
    `5px solid ${type === "error" ? "#dc2626" :
      type === "success" ? "#16a34a" : "#2563eb"}`;

  clearTimeout(showMessage.timer);
  showMessage.timer = setTimeout(() => toast.remove(), 4500);
}

function setBusy(button, busy, label = "Please wait...") {
  if (!button) return;

  if (busy) {
    button.dataset.originalText = button.textContent;
    button.disabled = true;
    button.textContent = label;
  } else {
    button.disabled = false;
    button.textContent = button.dataset.originalText || "Submit";
  }
}

async function api(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };

  if (currentToken) {
    headers.Authorization = `Bearer ${currentToken}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    cache: "no-store"
  });

  const text = await response.text();
  let data = {};

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { message: text || "Invalid server response." };
  }

  if (response.status === 401) {
    clearSession();
    showMessage("Session expired. Please log in again.", "error");
  }

  if (!response.ok || data.success === false || data.ok === false) {
    throw new Error(
      data.message || data.error || `Request failed (${response.status})`
    );
  }

  return data;
}

function postJSON(path, body) {
  return api(path, {
    method: "POST",
    body: JSON.stringify(body)
  });
}

function getArray(data, ...keys) {
  if (Array.isArray(data)) return data;

  for (const key of keys) {
    if (Array.isArray(data?.[key])) return data[key];
  }

  return [];
}

function userRole() {
  return String(
    currentUser?.role ||
    currentUser?.user_type ||
    currentUser?.type ||
    ""
  ).toUpperCase();
}

function isManager() {
  return ["HR", "MANAGEMENT", "ADMIN"].includes(userRole());
}

/* -------------------- SCREEN NAVIGATION -------------------- */

function showScreen(screenId) {
  const knownScreens = [
    "homeScreen",
    "staffRegisterScreen",
    "staffLoginScreen",
    "staffPortalScreen",
    "employeeLoginScreen",
    "internLoginScreen"
  ];

  knownScreens.forEach(id => {
    const element = $(id);
    if (!element) return;

    const active = id === screenId;
    element.hidden = !active;
    element.classList.toggle("active", active);
    element.setAttribute("aria-hidden", String(!active));
  });

  const target = $(screenId);
  if (target) {
    target.hidden = false;
    target.classList.add("active");
    target.setAttribute("aria-hidden", "false");
  }
}

function showHome() {
  showScreen("homeScreen");
}

function openStaffLogin() {
  showScreen("staffLoginScreen");
}

function openStaffRegister() {
  showScreen("staffRegisterScreen");
}

function openEmployeeLogin() {
  showScreen("employeeLoginScreen");
}

function openInternLogin() {
  showScreen("internLoginScreen");
}

/* Keep compatibility with existing HTML onclick attributes. */
window.showScreen = showScreen;
window.showHome = showHome;
window.openStaffLogin = openStaffLogin;
window.openStaffRegister = openStaffRegister;
window.openEmployeeLogin = openEmployeeLogin;
window.openInternLogin = openInternLogin;

/* -------------------- LOGIN -------------------- */

async function loginAccount(kind, identifier, password, button, messageId) {
  if (!identifier || !password) {
    showMessage("Enter your ID and password.", "error", messageId);
    return;
  }

  setBusy(button, true, "Signing in...");

  try {
    const data = await postJSON("/api/login", {
      type: kind,
      user_type: kind,
      login_type: kind,
      identifier,
      id: identifier,
      staff_id: identifier,
      employee_id: identifier,
      intern_id: identifier,
      password
    });

    saveSession(data);

    if (!currentToken) {
      throw new Error(
        "Login response did not include a session token. Check worker.js."
      );
    }

    if (!currentUser) {
      try {
        const me = await api("/api/me");
        currentUser = me.user || me.person || me.staff || me;
        localStorage.setItem(USER_KEY, JSON.stringify(currentUser));
      } catch {
        currentUser = {
          id: identifier,
          staff_id: identifier,
          role: kind
        };
        localStorage.setItem(USER_KEY, JSON.stringify(currentUser));
      }
    }

    showScreen("staffPortalScreen");
    await renderPortal();
    showMessage("Login successful.", "success");
  } catch (error) {
    showMessage(error.message || "Login failed.", "error", messageId);
  } finally {
    setBusy(button, false);
  }
}

function bindLoginForms() {
  const staffForm = $("staffLoginForm");
  if (staffForm) {
    staffForm.addEventListener("submit", event => {
      event.preventDefault();

      loginAccount(
        "STAFF",
        $("staffLoginId")?.value.trim(),
        $("staffLoginPassword")?.value,
        staffForm.querySelector('[type="submit"]'),
        "staffLoginMessage"
      );
    });
  }

  const employeeForm = $("employeeLoginForm");
  if (employeeForm) {
    employeeForm.addEventListener("submit", event => {
      event.preventDefault();

      loginAccount(
        "EMPLOYEE",
        $("employeeLoginId")?.value.trim(),
        $("employeeLoginPassword")?.value,
        employeeForm.querySelector('[type="submit"]'),
        "employeeLoginMessage"
      );
    });
  }

  const internForm = $("internLoginForm");
  if (internForm) {
    internForm.addEventListener("submit", event => {
      event.preventDefault();

      loginAccount(
        "INTERN",
        $("internLoginId")?.value.trim(),
        $("internLoginPassword")?.value,
        internForm.querySelector('[type="submit"]'),
        "internLoginMessage"
      );
    });
  }
}

/* -------------------- STAFF REGISTRATION -------------------- */

function bindStaffRegistration() {
  const form = $("staffRegisterForm");
  if (!form) return;

  form.addEventListener("submit", async event => {
    event.preventDefault();

    const name = $("staffRegisterName")?.value.trim();
    const staffId = $("staffRegisterId")?.value.trim();
    const mobile = $("staffRegisterMobile")?.value.trim();
    const role = $("staffRegisterRole")?.value;
    const password = $("staffRegisterPassword")?.value;
    const confirmPassword = $("staffRegisterConfirmPassword")?.value;
    const masterKey = $("staffMasterKey")?.value;

    if (!name || !staffId || !password || !masterKey) {
      showMessage("Complete all required fields.", "error");
      return;
    }

    if (password.length < 8) {
      showMessage("Use a password with at least 8 characters.", "error");
      return;
    }

    if (password !== confirmPassword) {
      showMessage("Passwords do not match.", "error");
      return;
    }

    const button = form.querySelector('[type="submit"]');
    setBusy(button, true, "Registering...");

    try {
      await postJSON("/api/register", {
        type: "STAFF",
        user_type: "STAFF",
        name,
        staff_id: staffId,
        id: staffId,
        mobile,
        role,
        password,
        confirm_password: confirmPassword,
        master_key: masterKey,
        masterKey
      });

      showMessage(
        "Registration submitted. You can now try logging in.",
        "success"
      );

      form.reset();
      showScreen("staffLoginScreen");
    } catch (error) {
      showMessage(error.message || "Registration failed.", "error");
    } finally {
      setBusy(button, false);
    }
  });
}

/* -------------------- LOGOUT -------------------- */

function clearSession() {
  currentToken = "";
  currentUser = null;

  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

function logout() {
  clearSession();
  activeSection = "dashboard";
  showHome();
  showMessage("You have been logged out.", "success");
}

window.logout = logout;

/* -------------------- PORTAL LAYOUT -------------------- */

function ensurePortalLayout() {
  const portal = $("staffPortalScreen");
  if (!portal) return null;

  let workspace = $("portalWorkspace");

  if (!workspace) {
    workspace = document.createElement("main");
    workspace.id = "portalWorkspace";
    portal.appendChild(workspace);
  }

  let header = $("thhDynamicHeader");

  if (!header) {
    header = document.createElement("section");
    header.id = "thhDynamicHeader";
    header.style.cssText =
      "display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;padding:16px;margin:12px 0;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:14px;";

    portal.prepend(header);
  }

  const name =
    currentUser?.name ||
    currentUser?.staff_name ||
    currentUser?.employee_name ||
    "TEXMO User";

  const id =
    currentUser?.staff_id ||
    currentUser?.employee_id ||
    currentUser?.intern_id ||
    currentUser?.id ||
    "";

  header.innerHTML = `
    <div>
      <strong style="font-size:18px;color:#166534">
        ${escapeHTML(name)}
      </strong>
      <div style="font-size:13px;color:#475569;margin-top:4px">
        ${escapeHTML(userRole())} · ${escapeHTML(id)}
      </div>
    </div>
    <button id="thhLogoutButton" type="button"
      style="padding:10px 16px;border:0;border-radius:9px;background:#166534;color:white;font-weight:600">
      Logout
    </button>
  `;

  $("thhLogoutButton").onclick = logout;

  let nav = $("thhNavigation");

  if (!nav) {
    nav = document.createElement("nav");
    nav.id = "thhNavigation";
    nav.setAttribute("aria-label", "Hostel management navigation");
    nav.style.cssText =
      "display:flex;flex-wrap:wrap;gap:8px;margin:12px 0;padding:4px;";
    header.after(nav);
  }

  const sections = [
    ["dashboard", "Dashboard"],
    ["people", "Employees"],
    ["rooms", "Rooms"],
    ["attendance", "Attendance"],
    ["cab", "Cab"],
    ["food", "Food"],
    ["reports", "Reports"],
    ["requests", "Requests"]
  ];

  nav.innerHTML = sections.map(([key, label]) => `
    <button type="button" data-section="${key}"
      style="padding:10px 13px;border:1px solid #d1d5db;border-radius:9px;background:#fff;color:#166534;font-weight:600">
      ${label}
    </button>
  `).join("");

  nav.querySelectorAll("[data-section]").forEach(button => {
    button.addEventListener("click", () => openSection(button.dataset.section));
  });

  return workspace;
}

async function renderPortal() {
  const workspace = ensurePortalLayout();
  if (!workspace) return;

  if (!currentUser) {
    showHome();
    return;
  }

  if (!isManager()) {
    renderEmployeeHome(workspace);
    return;
  }

  await openSection(activeSection);
}

function renderEmployeeHome(workspace) {
  workspace.innerHTML = `
    <section style="padding:18px;border:1px solid #e2e8f0;border-radius:14px;background:#fff">
      <h2>My Hostel Portal</h2>
      <p>Welcome, ${escapeHTML(currentUser?.name || "Employee")}.</p>
      <button type="button" id="myRefreshButton">Refresh my details</button>
      <div id="myAccountDetails" style="margin-top:16px"></div>
      <h3>Update My Shift</h3>
      <form id="myShiftForm">
        <label for="myShift">Shift</label>
        <select id="myShift" required>
          ${SHIFTS.map(s => `<option>${s}</option>`).join("")}
        </select>
        <button type="submit">Update Shift</button>
      </form>
      <h3>My Requests</h3>
      <form id="myRequestForm">
        <label for="myRequestType">Request type</label>
        <select id="myRequestType" required>
          <option value="LEAVE">Leave</option>
          <option value="HOSTEL_OUT">Hostel out</option>
          <option value="OTHER">Other</option>
        </select>
        <label for="myRequestFrom">From date</label>
        <input id="myRequestFrom" type="date" required>
        <label for="myRequestTo">To date</label>
        <input id="myRequestTo" type="date" required>
        <label for="myRequestRemarks">Remarks</label>
        <textarea id="myRequestRemarks" required maxlength="500"></textarea>
        <button type="submit">Submit Request</button>
      </form>
      <div id="myRequestsList" style="margin-top:16px"></div>
    </section>
  `;

  $("myRefreshButton").onclick = loadMyDetails;
  $("myShiftForm").onsubmit = submitMyShift;
  $("myRequestForm").onsubmit = submitMyRequest;

  loadMyDetails();
  loadMyRequests();
}

/* -------------------- SECTION ROUTER -------------------- */

async function openSection(section) {
  if (!isManager()) return;

  activeSection = section;

  const workspace = ensurePortalLayout();
  if (!workspace) return;

  workspace.innerHTML = `
    <section style="padding:18px;background:#fff;border:1px solid #e2e8f0;border-radius:14px">
      <p>Loading ${escapeHTML(section)}...</p>
    </section>
  `;

  try {
    switch (section) {
      case "dashboard":
        await loadDashboard(workspace);
        break;
      case "people":
        await loadPeople(workspace);
        break;
      case "rooms":
        await loadRooms(workspace);
        break;
      case "attendance":
        await loadAttendance(workspace);
        break;
      case "cab":
        await loadCab(workspace);
        break;
      case "food":
        await loadFood(workspace);
        break;
      case "reports":
        await loadReports(workspace);
        break;
      case "requests":
        await loadRequests(workspace);
        break;
      default:
        workspace.innerHTML = "<p>Section not found.</p>";
    }
  } catch (error) {
    workspace.innerHTML = `
      <section style="padding:18px;border:1px solid #fecaca;border-radius:12px">
        <h3>Unable to load ${escapeHTML(section)}</h3>
        <p>${escapeHTML(error.message)}</p>
        <button type="button" onclick="openSection('${section}')">Retry</button>
      </section>
    `;
  }
}

window.openSection = openSection;

/* -------------------- DASHBOARD -------------------- */

async function loadDashboard(workspace) {
  const data = await api("/api/dashboard");
  const stats = data.summary || data.dashboard || data;

  const cards = [
    ["Employees", stats.employees ?? stats.total_employees ?? 0],
    ["Interns", stats.interns ?? stats.total_interns ?? 0],
    ["Rooms", stats.rooms ?? stats.total_rooms ?? 0],
    ["Pending Requests", stats.pending_requests ?? 0],
    ["Cab Entries Today", stats.cab_today ?? 0],
    ["Food Entries Today", stats.food_today ?? 0],
    ["Attendance Today", stats.attendance_today ?? 0]
  ];

  workspace.innerHTML = `
    <h2>Dashboard</h2>
    <p style="color:#64748b">TEXMO Hostel Hub overview</p>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(135px,1fr));gap:12px">
      ${cards.map(([label, value]) => `
        <article style="padding:16px;border:1px solid #d1fae5;background:#f0fdf4;border-radius:12px">
          <div style="font-size:13px;color:#475569">${escapeHTML(label)}</div>
          <strong style="display:block;font-size:26px;color:#166534;margin-top:8px">
            ${escapeHTML(value)}
          </strong>
        </article>
      `).join("")}
    </div>
    <button type="button" id="refreshDashboard" style="margin-top:16px">Refresh Dashboard</button>
  `;

  $("refreshDashboard").onclick = () => openSection("dashboard");
}

/* -------------------- PEOPLE MANAGEMENT -------------------- */

async function loadPeople(workspace) {
  const data = await api("/api/people");
  const people = getArray(data, "people", "employees", "results", "data");

  workspace.innerHTML = `
    <h2>Employee & Intern Management</h2>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">
      <input id="peopleSearch" placeholder="Search ID or name">
      <select id="peopleDepartment">
        <option value="">All departments</option>
        ${DEPARTMENTS.map(d => `<option>${d}</option>`).join("")}
      </select>
      <button type="button" id="peopleReload">Refresh</button>
    </div>
    <div id="peopleTableWrap"></div>
  `;

  function drawPeople() {
    const search = $("peopleSearch").value.toLowerCase();
    const department = $("peopleDepartment").value;

    const filtered = people.filter(person => {
      const matchesSearch = [
        person.name, person.employee_id, person.intern_id,
        person.id, person.department
      ].some(value => String(value || "").toLowerCase().includes(search));

      return matchesSearch &&
        (!department || person.department === department);
    });

    $("peopleTableWrap").innerHTML = `
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse">
          <thead><tr>
            <th align="left">ID</th><th align="left">Name</th>
            <th align="left">Department</th><th align="left">Shift</th>
            <th align="left">Room</th><th align="left">Status</th>
          </tr></thead>
          <tbody>
            ${filtered.map(person => `
              <tr>
                <td>${escapeHTML(person.employee_id || person.intern_id || person.id)}</td>
                <td>${escapeHTML(person.name)}</td>
                <td>${escapeHTML(person.department)}</td>
                <td>${escapeHTML(person.shift)}</td>
                <td>${escapeHTML(person.room)}</td>
                <td>${escapeHTML(person.status || person.hostel_status)}</td>
              </tr>
            `).join("") || `<tr><td colspan="6">No matching records.</td></tr>`}
          </tbody>
        </table>
      </div>
      <p style="color:#64748b;font-size:13px">
        ${filtered.length} record(s)
      </p>
    `;
  }

  $("peopleSearch").addEventListener("input", drawPeople);
  $("peopleDepartment").addEventListener("change", drawPeople);
  $("peopleReload").onclick = () => openSection("people");

  drawPeople();
}

/* -------------------- ROOMS -------------------- */

async function loadRooms(workspace) {
  const data = await api("/api/rooms");
  const rooms = getArray(data, "rooms", "results", "data");

  workspace.innerHTML = `
    <h2>Room Management</h2>
    <div style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse">
        <thead><tr>
          <th align="left">Room</th>
          <th align="left">Block</th>
          <th align="left">Status</th>
        </tr></thead>
        <tbody>
          ${rooms.map(room => `
            <tr>
              <td>${escapeHTML(room.room_number || room.room)}</td>
              <td>${escapeHTML(room.block)}</td>
              <td>${escapeHTML(room.status)}</td>
            </tr>
          `).join("") || `<tr><td colspan="3">No room records returned.</td></tr>`}
        </tbody>
      </table>
    </div>
    <button type="button" id="roomsReload" style="margin-top:12px">Refresh Rooms</button>
  `;

  $("roomsReload").onclick = () => openSection("rooms");
}

/* -------------------- ATTENDANCE -------------------- */

async function loadAttendance(workspace) {
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Kolkata"
  });

  workspace.innerHTML = `
    <h2>Shift Attendance</h2>
    <form id="attendanceFilter" style="display:flex;gap:8px;flex-wrap:wrap">
      <label>Date <input id="attendanceDate" type="date" value="${today}" required></label>
      <label>Shift
        <select id="attendanceShift">
          <option value="">All shifts</option>
          ${SHIFTS.map(s => `<option>${s}</option>`).join("")}
        </select>
      </label>
      <button type="submit">Load Attendance</button>
    </form>
    <div id="attendanceResults" style="margin-top:16px"></div>
  `;

  $("attendanceFilter").onsubmit = async event => {
    event.preventDefault();

    const date = $("attendanceDate").value;
    const shift = $("attendanceShift").value;
    const params = new URLSearchParams({ date });

    if (shift) params.set("shift", shift);

    const result = await api(`/api/attendance?${params}`);
    const rows = getArray(result, "attendance", "records", "results", "data");

    $("attendanceResults").innerHTML = `
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse">
          <thead><tr>
            <th align="left">ID</th><th align="left">Name</th>
            <th align="left">Department</th><th align="left">Shift</th>
            <th align="left">Status</th>
          </tr></thead>
          <tbody>
            ${rows.map(row => `
              <tr>
                <td>${escapeHTML(row.person_id || row.employee_id || row.id)}</td>
                <td>${escapeHTML(row.name)}</td>
                <td>${escapeHTML(row.department)}</td>
                <td>${escapeHTML(row.shift)}</td>
                <td>${escapeHTML(row.attendance_status || row.status || "NOT_RECORDED")}</td>
              </tr>
            `).join("") || `<tr><td colspan="5">No attendance records found.</td></tr>`}
          </tbody>
        </table>
      </div>
      <p style="font-size:13px;color:#64748b">
        Missing records are not automatically confirmed absences.
      </p>
    `;
  };

  $("attendanceFilter").requestSubmit();
}

/* -------------------- CAB -------------------- */

async function loadCab(workspace) {
  workspace.innerHTML = `
    <h2>Cab Entry</h2>
    <p>Scan an active employee QR token to record a cab entry.</p>
    <form id="cabScanForm">
      <label>Employee QR token
        <input id="cabToken" autocomplete="off" required maxlength="500">
      </label>
      <label>Shift
        <select id="cabShift" required>
          ${SHIFTS.map(s => `<option>${s}</option>`).join("")}
        </select>
      </label>
      <button type="submit">Record Cab Entry</button>
    </form>
    <p id="cabScanMessage" role="status"></p>
  `;

  $("cabScanForm").onsubmit = async event => {
    event.preventDefault();

    const button = event.currentTarget.querySelector('[type="submit"]');
    setBusy(button, true, "Recording...");

    try {
      const token = $("cabToken").value.trim();

      const result = await postJSON("/api/cab/scan", {
        token,
        qr_token: token,
        shift: $("cabShift").value
      });

      showMessage(
        result.message || "Cab scan submitted.",
        "success",
        "cabScanMessage"
      );

      $("cabToken").value = "";
    } catch (error) {
      showMessage(error.message, "error", "cabScanMessage");
    } finally {
      setBusy(button, false);
    }
  };
}

/* -------------------- FOOD -------------------- */

async function loadFood(workspace) {
  workspace.innerHTML = `
    <h2>Food Entry</h2>
    <p>Scan a valid food QR code for the applicable meal.</p>
    <form id="foodScanForm">
      <label>Food QR token
        <input id="foodToken" autocomplete="off" required maxlength="500">
      </label>
      <label>Meal
        <select id="foodMeal" required>
          <option value="BREAKFAST">Breakfast</option>
          <option value="LUNCH">Lunch</option>
          <option value="DINNER">Dinner</option>
        </select>
      </label>
      <button type="submit">Record Food Entry</button>
    </form>
    <p id="foodScanMessage" role="status"></p>
  `;

  $("foodScanForm").onsubmit = async event => {
    event.preventDefault();

    const button = event.currentTarget.querySelector('[type="submit"]');
    setBusy(button, true, "Recording...");

    try {
      const token = $("foodToken").value.trim();

      const result = await postJSON("/api/food/scan", {
        token,
        qr_token: token,
        meal_type: $("foodMeal").value
      });

      showMessage(
        result.message || "Food scan submitted.",
        "success",
        "foodScanMessage"
      );

      $("foodToken").value = "";
    } catch (error) {
      showMessage(error.message, "error", "foodScanMessage");
    } finally {
      setBusy(button, false);
    }
  };
}

/* -------------------- REPORTS -------------------- */

async function loadReports(workspace) {
  const month = new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Kolkata"
  }).slice(0, 7);

  workspace.innerHTML = `
    <h2>Reports</h2>
    <form id="reportFilter" style="display:flex;gap:8px;flex-wrap:wrap">
      <label>Month <input id="reportMonth" type="month" value="${month}" required></label>
      <button type="submit">Load Report</button>
    </form>
    <div id="reportResults" style="margin-top:16px"></div>
  `;

  $("reportFilter").onsubmit = async event => {
    event.preventDefault();

    const selectedMonth = $("reportMonth").value;

    try {
      const data = await api(
        `/api/reports?month=${encodeURIComponent(selectedMonth)}`
      );

      const sections = [
        ["Food totals", data.food_totals || data.foodTotals],
        ["Daily food", data.daily_food || data.dailyFood],
        ["Cab daily totals", data.cab_daily || data.cabDaily],
        ["Attendance summary", data.attendance || data.attendance_summary]
      ].filter(([, rows]) => Array.isArray(rows));

      $("reportResults").innerHTML = sections.map(([title, rows], index) => `
        <section style="margin-bottom:18px">
          <h3>${escapeHTML(title)}</h3>
          <button type="button" data-export-section="${index}">Export CSV</button>
          <div style="overflow-x:auto">
            ${renderTable(rows)}
          </div>
        </section>
      `).join("") || `
        <p>Report loaded, but no recognized report arrays were returned.</p>
      `;

      $("reportResults").querySelectorAll("[data-export-section]").forEach(button => {
        button.onclick = () => {
          const section = sections[Number(button.dataset.exportSection)];
          if (section) downloadCSV(section[1], `${selectedMonth}-${section[0]}.csv`);
        };
      });
    } catch (error) {
      $("reportResults").textContent = error.message;
    }
  };

  $("reportFilter").requestSubmit();
}

function renderTable(rows) {
  if (!rows.length) return "<p>No records.</p>";

  const columns = [...new Set(rows.flatMap(row => Object.keys(row)))];

  return `
    <table style="width:100%;border-collapse:collapse">
      <thead><tr>
        ${columns.map(col => `<th align="left">${escapeHTML(col)}</th>`).join("")}
      </tr></thead>
      <tbody>
        ${rows.map(row => `
          <tr>
            ${columns.map(col => `<td>${escapeHTML(row[col])}</td>`).join("")}
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function downloadCSV(rows, filename) {
  if (!rows.length) {
    showMessage("No data to export.", "info");
    return;
  }

  const columns = [...new Set(rows.flatMap(row => Object.keys(row)))];

  const cell = value => {
    let text = String(value ?? "");

    // Reduce the risk of spreadsheet formula injection.
    if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;

    return `"${text.replace(/"/g, '""')}"`;
  };

  const csv = [
    columns.map(cell).join(","),
    ...rows.map(row => columns.map(col => cell(row[col])).join(","))
  ].join("\r\n");

  const blob = new Blob(["\uFEFF" + csv], {
    type: "text/csv;charset=utf-8;"
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename.replace(/[^\w.-]/g, "_");
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

window.downloadCSV = downloadCSV;

/* -------------------- REQUESTS -------------------- */

async function loadRequests(workspace) {
  const data = await api("/api/requests");
  const requests = getArray(data, "requests", "results", "data");

  workspace.innerHTML = `
    <h2>HR Requests</h2>
    <div style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse">
        <thead><tr>
          <th align="left">Person</th>
          <th align="left">Type</th>
          <th align="left">From</th>
          <th align="left">To</th>
          <th align="left">Remarks</th>
          <th align="left">Status</th>
          <th align="left">Action</th>
        </tr></thead>
        <tbody>
          ${requests.map(request => `
            <tr>
              <td>${escapeHTML(request.person_name || request.person_id)}</td>
              <td>${escapeHTML(request.request_type)}</td>
              <td>${escapeHTML(request.from_date)}</td>
              <td>${escapeHTML(request.to_date)}</td>
              <td>${escapeHTML(request.remarks)}</td>
              <td>${escapeHTML(request.status)}</td>
              <td>
                ${String(request.status).toUpperCase() === "PENDING" ? `
                  <button type="button" data-review="${escapeHTML(request.id)}" data-status="APPROVED">Approve</button>
                  <button type="button" data-review="${escapeHTML(request.id)}" data-status="REJECTED">Reject</button>
                ` : ""}
              </td>
            </tr>
          `).join("") || `<tr><td colspan="7">No requests found.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;

  workspace.querySelectorAll("[data-review]").forEach(button => {
    button.onclick = async () => {
      const action = button.dataset.status;

      if (!confirm(`${action} this request?`)) return;

      try {
        await postJSON("/api/requests/review", {
          id: button.dataset.review,
          request_id: button.dataset.review,
          status: action
        });

        showMessage(`Request ${action.toLowerCase()}.`, "success");
        await openSection("requests");
      } catch (error) {
        showMessage(error.message, "error");
      }
    };
  });
}

/* -------------------- EMPLOYEE SELF-SERVICE -------------------- */

async function loadMyDetails() {
  const target = $("myAccountDetails");
  if (!target) return;

  try {
    const data = await api("/api/me");
    const user = data.user || data.person || data.staff || data;

    target.innerHTML = `
      <p><strong>Name:</strong> ${escapeHTML(user.name)}</p>
      <p><strong>ID:</strong> ${escapeHTML(
        user.employee_id || user.intern_id || user.staff_id || user.id
      )}</p>
      <p><strong>Department:</strong> ${escapeHTML(user.department)}</p>
      <p><strong>Shift:</strong> ${escapeHTML(user.shift)}</p>
      <p><strong>Room:</strong> ${escapeHTML(user.room)}</p>
      <p><strong>Hostel status:</strong> ${escapeHTML(user.hostel_status)}</p>
    `;

    if ($("myShift")) $("myShift").value = user.shift || SHIFTS[0];
  } catch (error) {
    target.textContent = error.message;
  }
}

async function submitMyShift(event) {
  event.preventDefault();

  try {
    await postJSON("/api/my/shift", {
      shift: $("myShift").value
    });

    showMessage("Shift update submitted.", "success");
    await loadMyDetails();
  } catch (error) {
    showMessage(error.message, "error");
  }
}

async function submitMyRequest(event) {
  event.preventDefault();

  const fromDate = $("myRequestFrom").value;
  const toDate = $("myRequestTo").value;

  if (toDate < fromDate) {
    showMessage("End date cannot be before start date.", "error");
    return;
  }

  try {
    await postJSON("/api/requests", {
      request_type: $("myRequestType").value,
      from_date: fromDate,
      to_date: toDate,
      remarks: $("myRequestRemarks").value.trim()
    });

    showMessage("Request submitted.", "success");
    $("myRequestForm").reset();
    await loadMyRequests();
  } catch (error) {
    showMessage(error.message, "error");
  }
}

async function loadMyRequests() {
  const target = $("myRequestsList");
  if (!target) return;

  try {
    const data = await api("/api/requests");
    const rows = getArray(data, "requests", "results", "data");

    target.innerHTML = `
      <h4>Request History</h4>
      ${rows.map(row => `
        <article style="padding:12px;margin:8px 0;border:1px solid #e2e8f0;border-radius:10px">
          <strong>${escapeHTML(row.request_type)}</strong>
          <div>${escapeHTML(row.from_date)} to ${escapeHTML(row.to_date)}</div>
          <div>Status: ${escapeHTML(row.status)}</div>
          <div>${escapeHTML(row.remarks)}</div>
        </article>
      `).join("") || "<p>No requests yet.</p>"}
    `;
  } catch (error) {
    target.textContent = error.message;
  }
}

/* -------------------- STARTUP -------------------- */

document.addEventListener("DOMContentLoaded", async () => {
  bindLoginForms();
  bindStaffRegistration();

  if (currentToken && currentUser) {
    try {
      await api("/api/me");
      showScreen("staffPortalScreen");
      await renderPortal();
      return;
    } catch {
      clearSession();
    }
  }

  showHome();
});
