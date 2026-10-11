const API_BASE = "";

const $ = id => document.getElementById(id);
const STAFF_KEY = "texmo_staff_session";
const PERSON_KEY = "texmo_person_session";

function getStaff() {
  try { return JSON.parse(localStorage.getItem(STAFF_KEY) || "null"); }
  catch { return null; }
}

function getPerson() {
  try { return JSON.parse(localStorage.getItem(PERSON_KEY) || "null"); }
  catch { return null; }
}

function saveSession(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function sessionToken() {
  const s = getStaff() || getPerson();
  return s?.token || s?.session_token || s?.session || "";
}

async function api(path, method = "GET", data = null) {
  const headers = { "Content-Type": "application/json" };
  const token = sessionToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    ...(data !== null ? { body: JSON.stringify(data) } : {})
  });

  let result;
  try { result = await response.json(); }
  catch { throw new Error("Server response JSON format-la illa."); }

  if (!response.ok || result.success === false) {
    throw new Error(result.message || `Request failed (${response.status})`);
  }
  return result;
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;",
    '"': "&quot;", "'": "&#39;"
  })[c]);
}

function message(text) {
  let el = $("appMessage");
  if (!el) {
    el = document.createElement("div");
    el.id = "appMessage";
    el.style.cssText =
      "position:sticky;top:5px;z-index:9999;background:#e9f8ef;color:#126c3b;padding:12px;margin:8px;border-radius:10px;font-weight:600";
    document.body.prepend(el);
  }
  el.textContent = text;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showOnly(id) {
  document.querySelectorAll(".screen").forEach(el => {
    el.classList.toggle("active", el.id === id);
  });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showScreen(id) {
  showOnly(id);
}

function btn(text, action, color = "#147a43") {
  return `<button type="button" onclick="${action}"
    style="background:${color};color:white;border:0;border-radius:9px;padding:11px 14px;margin:4px;font-weight:700">
    ${text}</button>`;
}

function field(id, label, type = "text", required = true) {
  return `<label style="display:block;margin:10px 0;font-weight:600">
    ${label}
    <input id="${id}" type="${type}" ${required ? "required" : ""}
      style="width:100%;box-sizing:border-box;padding:11px;margin-top:5px;border:1px solid #cad9ce;border-radius:9px">
  </label>`;
}

function selectField(id, label, options) {
  return `<label style="display:block;margin:10px 0;font-weight:600">${label}
    <select id="${id}" style="width:100%;padding:11px;margin-top:5px;border:1px solid #cad9ce;border-radius:9px">
      ${options.map(x => `<option value="${escapeHTML(x)}">${escapeHTML(x)}</option>`).join("")}
    </select>
  </label>`;
}

function panel(title, content) {
  return `<section style="background:white;border:1px solid #dce9df;border-radius:14px;padding:15px;margin:10px 0;color:#193c2b">
    <h3>${title}</h3>${content}</section>`;
}

/* ---------------- STAFF LOGIN / REGISTRATION ---------------- */

async function staffRegister(data) {
  return api("/api/staff/register", "POST", data);
}

function bindStaffForms() {
  const login = $("staffLoginForm");
  if (login && !login.dataset.bound) {
    login.dataset.bound = "1";
    login.addEventListener("submit", async e => {
      e.preventDefault();
      try {
        const result = await api("/api/staff/login", "POST", {
          staff_id: $("staffLoginId").value.trim(),
          password: $("staffLoginPassword").value
        });

        const staff = result.staff || result.user;
        if (!staff) throw new Error("Server staff details return pannala.");

        saveSession(STAFF_KEY, {
          ...staff,
          token: result.token || result.session_token || result.session || staff.token
        });
        localStorage.removeItem(PERSON_KEY);
        showStaffPortal();
        message("Welcome, " + (staff.name || staff.staff_id));
      } catch (err) {
        alert(err.message);
      }
    });
  }

  const register = $("staffRegisterForm");
  if (register && !register.dataset.bound) {
    register.dataset.bound = "1";
    register.addEventListener("submit", async e => {
      e.preventDefault();
      const password = $("staffRegisterPassword").value;
      if (password !== $("staffRegisterConfirmPassword").value) {
        alert("Passwords do not match.");
        return;
      }

      try {
        const result = await staffRegister({
          name: $("staffRegisterName").value.trim(),
          staff_id: $("staffRegisterId").value.trim(),
          mobile: $("staffRegisterMobile").value.trim(),
          role: $("staffRegisterRole").value,
          password,
          confirm_password: $("staffRegisterConfirmPassword").value,
          master_key: $("staffMasterKey").value
        });
        alert(result.message || "Registration completed.");
        showOnly("staffLoginScreen");
      } catch (err) {
        alert(err.message);
      }
    });
  }
}

/* ---------------- EMPLOYEE / INTERN REGISTRATION ---------------- */

function addRegistrationForms() {
  [
    { screen: "employeeLoginScreen", type: "EMPLOYEE", label: "Employee" },
    { screen: "internLoginScreen", type: "INTERN", label: "Intern" }
  ].forEach(cfg => {
    const screen = $(cfg.screen);
    if (!screen || $(cfg.type + "RegisterPanel")) return;

    const box = document.createElement("div");
    box.id = cfg.type + "RegisterPanel";
    box.className = "panel";
    box.innerHTML = `
      <h3>${cfg.label} Self Registration</h3>
      <p class="muted">Unmai details enter pannunga. ID unique-a irukkanum.</p>
      <form id="${cfg.type}RegisterForm">
        ${field(cfg.type + "RegId", cfg.type === "EMPLOYEE" ? "Employee ID" : "Intern ID")}
        ${field(cfg.type + "RegName", "Full name")}
        ${field(cfg.type + "RegMobile", "Mobile number", "tel")}
        ${selectField(cfg.type + "RegDepartment", "Department", ["PDN", "PDN2", "PDN3", "MDN"])}
        ${field(cfg.type + "RegDesignation", "Designation", "text", false)}
        ${selectField(cfg.type + "RegShift", "Shift", ["SHIFT 1", "SHIFT 2", "SHIFT 3"])}
        ${field(cfg.type + "RegRoom", "Room number", "text", false)}
        ${field(cfg.type + "RegPassword", "Password (minimum 8 characters)", "password")}
        ${field(cfg.type + "RegConfirm", "Confirm password", "password")}
        <button class="btn full" type="submit">Register ${cfg.label}</button>
      </form>`;
    screen.appendChild(box);

    const form = $(cfg.type + "RegisterForm");
    form.addEventListener("submit", async e => {
      e.preventDefault();

      const password = $(cfg.type + "RegPassword").value;
      if (password.length < 8) {
        alert("Password minimum 8 characters irukkanum.");
        return;
      }
      if (password !== $(cfg.type + "RegConfirm").value) {
        alert("Passwords match aagala.");
        return;
      }

      try {
        const result = await api("/api/person/register", "POST", {
          person_type: cfg.type,
          person_id: $(cfg.type + "RegId").value.trim(),
          name: $(cfg.type + "RegName").value.trim(),
          mobile: $(cfg.type + "RegMobile").value.trim(),
          department: $(cfg.type + "RegDepartment").value,
          designation: $(cfg.type + "RegDesignation").value.trim(),
          shift: $(cfg.type + "RegShift").value,
          room: $(cfg.type + "RegRoom").value.trim(),
          password
        });
        alert(result.message || "Registration completed. Ippo login pannunga.");
        $(cfg.type + "RegForm").reset();
      } catch (err) {
        alert(err.message);
      }
    });
  });
}

function bindPersonForms() {
  [
    { form: "employeeLoginForm", type: "EMPLOYEE", id: "employeeLoginId", pw: "employeeLoginPassword" },
    { form: "internLoginForm", type: "INTERN", id: "internLoginId", pw: "internLoginPassword" }
  ].forEach(cfg => {
    const form = $(cfg.form);
    if (!form || form.dataset.bound) return;
    form.dataset.bound = "1";

    form.addEventListener("submit", async e => {
      e.preventDefault();
      try {
        const result = await api("/api/person/login", "POST", {
          person_type: cfg.type,
          person_id: $(cfg.id).value.trim(),
          password: $(cfg.pw).value
        });

        saveSession(PERSON_KEY, {
          person_type: result.person_type || cfg.type,
          person: result.person || result.user,
          qr_token: result.qr_token,
          token: result.token || result.session_token || result.session
        });
        localStorage.removeItem(STAFF_KEY);
        showPersonPortal();
      } catch (err) {
        alert(err.message);
      }
    });
  });
}

/* ---------------- STAFF PORTAL ---------------- */

function showStaffPortal() {
  const staff = getStaff();
  if (!staff) return showOnly("staffLoginScreen");

  showOnly("staffPortalScreen");
  ["portalStaffName", "portalInfoName"].forEach(id => {
    if ($(id)) $(id).textContent = staff.name || "";
  });
  ["portalStaffRole", "portalInfoRole"].forEach(id => {
    if ($(id)) $(id).textContent = staff.role || "";
  });
  ["portalStaffId", "portalInfoStaffId"].forEach(id => {
    if ($(id)) $(id).textContent = staff.staff_id || "";
  });

  loadDashboard();
}

function staffLogout() {
  localStorage.removeItem(STAFF_KEY);
  showOnly("homeScreen");
}

function portalModule(name) {
  const target = $("portalWorkspace");
  if (!target) return;

  target.innerHTML = `
    ${btn("← Dashboard", "loadDashboard()", "#53665b")}
    <h2>${escapeHTML(name)}</h2><div id="moduleContent">Loading...</div>`;

  const actions = {
    "Employee Management": renderPeople,
    "Room Management": renderRooms,
    "Attendance": renderAttendance,
    "Leave Management": renderRequests,
    "Cab Management": renderCab,
    "Food Management": renderFood,
    "Reports": renderReports
  };
  (actions[name] || (() => {
    $("moduleContent").textContent = "Module not available.";
  }))();
}

async function loadDashboard() {
  const target = $("portalWorkspace");
  if (!target) return;

  target.innerHTML = "<p>Loading dashboard...</p>";
  try {
    const d = await api("/api/dashboard");
    const stats = [
      ["Employees", d.employees],
      ["Interns", d.interns],
      ["Inside Hostel", d.in_hostel],
      ["Out / Leave", d.out_or_leave],
      ["Vacated", d.vacated]
    ];

    target.innerHTML = `
      <h2>Hostel Overview</h2>
      <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px">
        ${stats.map(s => `<div style="background:#eaf7ef;border-radius:12px;padding:14px">
          <div>${escapeHTML(s[0])}</div><strong style="font-size:24px">${escapeHTML(s[1] ?? 0)}</strong>
        </div>`).join("")}
      </div>
      <p>Choose a management module above.</p>`;
  } catch (err) {
    target.innerHTML = `<p>${escapeHTML(err.message)}</p>${btn("Retry", "loadDashboard()")}`;
  }
}

/* ---------------- PEOPLE MANAGEMENT ---------------- */

async function renderPeople() {
  const c = $("moduleContent");
  c.innerHTML = `
    ${selectField("peopleType", "Person type", ["ALL", "EMPLOYEE", "INTERN"])}
    ${selectField("peopleStatus", "Status", ["ALL", "ACTIVE", "RESIGNED"])}
    ${btn("Load People", "loadPeople()")}
    <div id="peopleList"></div>`;
  await loadPeople();
}

async function loadPeople() {
  const list = $("peopleList");
  if (!list) return;
  list.textContent = "Loading...";
  try {
    const type = $("peopleType")?.value || "ALL";
    const status = $("peopleStatus")?.value || "ALL";
    const data = await api(`/api/people?type=${encodeURIComponent(type)}&status=${encodeURIComponent(status)}`);
    const people = data.people || [];

    list.innerHTML = people.length ? people.map(p => `
      <article style="border:1px solid #dce9df;padding:12px;border-radius:12px;margin:9px 0">
        <strong>${escapeHTML(p.name)}</strong>
        <p>${escapeHTML(p.person_id)} · ${escapeHTML(p.person_type)}</p>
        <p>${escapeHTML(p.department)} · ${escapeHTML(p.shift || "-")}</p>
        <p>Room: ${escapeHTML(p.room || "-")}</p>
        <p>Hostel: ${escapeHTML(p.hostel_status)} · ${escapeHTML(p.status)}</p>
        ${btn("Edit", `editPerson('${escapeHTML(p.person_type)}','${escapeHTML(p.person_id)}')`)}
        ${btn("IN", `quickStatus('${escapeHTML(p.person_type)}','${escapeHTML(p.person_id)}','IN')`)}
        ${btn("OUT / LEAVE", `quickStatus('${escapeHTML(p.person_type)}','${escapeHTML(p.person_id)}','OUT/LEAVE')`, "#b87818")}
        ${btn("VACATED", `quickStatus('${escapeHTML(p.person_type)}','${escapeHTML(p.person_id)}','VACATED')`, "#b33c3c")}
        ${btn("Mark Resigned", `deletePerson('${escapeHTML(p.person_type)}','${escapeHTML(p.person_id)}')`, "#53665b")}
      </article>`).join("") : "<p>No records found.</p>";
  } catch (err) {
    list.textContent = err.message;
  }
}

async function editPerson(type, id) {
  const name = prompt("Full name:");
  if (name === null) return;
  const department = prompt("Department: PDN, PDN2, PDN3, MDN");
  if (department === null) return;
  const shift = prompt("Shift: SHIFT 1, SHIFT 2, SHIFT 3");
  if (shift === null) return;
  const room = prompt("Room number:");
  if (room === null) return;
  const designation = prompt("Designation:");
  if (designation === null) return;
  const mobile = prompt("Mobile number:");
  if (mobile === null) return;

  try {
    const result = await api("/api/people/update", "POST", {
      person_type: type, person_id: id, name,
      department: department.toUpperCase(),
      shift: shift.toUpperCase(), room, designation, mobile
    });
    alert(result.message || "Updated.");
    loadPeople();
  } catch (err) { alert(err.message); }
}

async function deletePerson(type, id) {
  if (!confirm(`${id} account-ai resigned status-ku maathava?`)) return;
  try {
    const result = await api("/api/people/delete", "POST", {
      person_type: type, person_id: id
    });
    alert(result.message || "Updated.");
    loadPeople();
  } catch (err) { alert(err.message); }
}

async function quickStatus(type, id, status) {
  try {
    const result = await api("/api/hostel/status", "POST", {
      person_type: type, person_id: id, hostel_status: status
    });
    alert(result.message || "Hostel status updated.");
    loadPeople();
  } catch (err) { alert(err.message); }
}

/* ---------------- ROOMS ---------------- */

async function renderRooms() {
  $("moduleContent").innerHTML = `
    ${field("roomNumber", "Room number, e.g. B1")}
    ${selectField("roomBlock", "Block", ["A", "B", "C", "D"])}
    ${btn("Save Room", "saveRoom()")}
    ${btn("Refresh", "loadRooms()", "#53665b")}
    <div id="roomList"></div>`;
  await loadRooms();
}

async function saveRoom() {
  try {
    const result = await api("/api/rooms", "POST", {
      room_number: $("roomNumber").value.trim(),
      block: $("roomBlock").value
    });
    alert(result.message || "Room saved.");
    loadRooms();
  } catch (err) { alert(err.message); }
}

async function loadRooms() {
  if (!$("roomList")) return;
  try {
    const data = await api("/api/rooms");
    $("roomList").innerHTML = (data.rooms || []).map(r => `
      <p style="padding:10px;border-bottom:1px solid #ddd">
        <strong>${escapeHTML(r.room_number)}</strong> · Block ${escapeHTML(r.block)}
        · Occupied: ${escapeHTML(r.occupied ?? 0)}
      </p>`).join("") || "<p>No rooms found.</p>";
  } catch (err) { $("roomList").textContent = err.message; }
}

/* ---------------- ATTENDANCE ---------------- */

async function renderAttendance() {
  $("moduleContent").innerHTML = `
    ${field("attDate", "Date (YYYY-MM-DD)", "date")}
    ${selectField("attShift", "Shift", ["SHIFT 1", "SHIFT 2", "SHIFT 3"])}
    ${btn("Load People", "loadAttendancePeople()")}
    <div id="attendanceList"></div>`;
  $("attDate").value = new Date().toLocaleDateString("en-CA");
}

async function loadAttendancePeople() {
  const list = $("attendanceList");
  try {
    const data = await api("/api/people?type=ALL&status=ACTIVE");
    const people = data.people || [];
    list.innerHTML = people.map((p, i) => `
      <div style="border-bottom:1px solid #ddd;padding:10px 0">
        <strong>${escapeHTML(p.name)}</strong> (${escapeHTML(p.person_id)})
        ${selectField(`attStatus${i}`, "Attendance", ["PRESENT", "ABSENT", "N/A"])}
        ${btn("Save", `saveAttendance(${i},'${escapeHTML(p.person_type)}','${escapeHTML(p.person_id)}')`)}
      </div>`).join("");
    window._attendancePeople = people;
  } catch (err) { list.textContent = err.message; }
}

async function saveAttendance(index, type, id) {
  const p = window._attendancePeople?.[index];
  if (!p) return;
  try {
    const result = await api("/api/attendance", "POST", {
      person_type: type,
      person_id: id,
      attendance_date: $("attDate").value,
      shift: $("attShift").value,
      attendance_status: $("attStatus" + index).value
    });
    alert(result.message || "Attendance saved.");
  } catch (err) { alert(err.message); }
}

/* ---------------- CAB: HR CAMERA SCANNER ---------------- */

async function renderCab() {
  $("moduleContent").innerHTML = `
    <p>Employee / Intern personal QR-ai HR scan pannunga.</p>
    ${selectField("cabShift", "Shift", ["SHIFT 1", "SHIFT 2", "SHIFT 3"])}
    ${btn("Start QR Scanner", "startScanner('cab')")}
    ${btn("Stop Scanner", "stopScanner()", "#53665b")}
    <video id="scanVideo" playsinline style="width:100%;max-height:300px;background:#111;border-radius:12px"></video>
    ${field("cabManualToken", "Manual QR token (camera work aagala na)", "text", false)}
    ${btn("Submit Cab Scan", "submitCabScan()")}
    ${btn("Refresh Today's Cab Entries", "loadCab()", "#53665b")}
    <div id="cabList"></div>`;
  await loadCab();
}

let scannerStream = null;
let scannerTimer = null;
let scannerMode = "";

async function startScanner(mode) {
  stopScanner();
  if (!navigator.mediaDevices?.getUserMedia) {
    alert("Camera access indha browser-la support aagala. Manual token use pannunga.");
    return;
  }
  try {
    scannerMode = mode;
    scannerStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" }
    });
    const video = $("scanVideo");
    if (!video) return stopScanner();
    video.srcObject = scannerStream;
    await video.play();

    if (!("BarcodeDetector" in window)) {
      alert("QR camera detection indha browser-la support aagala. Manual token option use pannunga.");
      return;
    }
    const detector = new BarcodeDetector({ formats: ["qr_code"] });
    scannerTimer = setInterval(async () => {
      if (!video || video.readyState < 2) return;
      try {
        const codes = await detector.detect(video);
        if (codes.length && codes[0].rawValue) {
          const token = codes[0].rawValue.trim();
          if (scannerMode === "cab" && $("cabManualToken")) $("cabManualToken").value = token;
          if (scannerMode === "food" && $("foodManualToken")) $("foodManualToken").value = token;
          stopScanner();
          message("QR read aayiduchu. Submit button press pannunga.");
        }
      } catch (_) {}
    }, 700);
  } catch (err) {
    alert("Camera open aagala: " + err.message);
  }
}

function stopScanner() {
  if (scannerTimer) clearInterval(scannerTimer);
  scannerTimer = null;
  if (scannerStream) scannerStream.getTracks().forEach(t => t.stop());
  scannerStream = null;
  const video = $("scanVideo");
  if (video) video.srcObject = null;
}

async function submitCabScan() {
  const qr = $("cabManualToken")?.value.trim();
  if (!qr) return alert("QR scan pannunga illa token enter pannunga.");
  try {
    const result = await api("/api/cab/scan", "POST", {
      qr_token: qr,
      shift: $("cabShift").value
    });
    alert(result.message || "Cab entry recorded.");
    $("cabManualToken").value = "";
    loadCab();
  } catch (err) { alert(err.message); }
}

async function loadCab() {
  const list = $("cabList");
  if (!list) return;
  try {
    const data = await api("/api/cab");
    list.innerHTML = (data.entries || []).map(e => `
      <p style="border-bottom:1px solid #ddd;padding:8px">
        ${escapeHTML(e.entry_time)} · ${escapeHTML(e.name)} ·
        ${escapeHTML(e.person_id)} · ${escapeHTML(e.department)} ·
        ${escapeHTML(e.shift || "-")} · Room ${escapeHTML(e.room || "-")}
      </p>`).join("") || "<p>No cab entries today.</p>";
  } catch (err) { list.textContent = err.message; }
}

/* ---------------- FOOD QR DISPLAY / REPORT ---------------- */

async function renderFood() {
  $("moduleContent").innerHTML = `
    <p>HR indha Food QR-ai display pannunga. Employee / Intern avanga portal-la scan pannuvaanga.</p>
    ${btn("Generate / Load Food QR", "loadFoodQR()")}
    <div id="foodQrDisplay"></div>
    <hr>
    <h3>Food Entries</h3>
    ${btn("Refresh Food Entries", "loadFood()", "#53665b")}
    <div id="foodList"></div>`;
  await loadFoodQR();
  await loadFood();
}

async function loadFoodQR() {
  const target = $("foodQrDisplay");
  if (!target) return;
  target.textContent = "Loading food QR...";
  try {
    const data = await api("/api/food/qr");
    const token = data.food_token || data.qr_token || data.token;
    if (!token) {
      target.innerHTML = "<p>Worker food QR token return pannala. Worker response check thevai.</p>";
      return;
    }
    window._texmoFoodToken = token;
    target.innerHTML = `
      <div style="text-align:center;padding:12px;border:1px solid #ddd;border-radius:12px">
        <p><strong>FOOD SCAN QR</strong></p>
        <img alt="Food QR code"
          src="https://quickchart.io/qr?size=240&text=${encodeURIComponent(token)}"
          style="width:240px;max-width:100%;height:auto">
        <p>Breakfast / Lunch / Dinner selection employee portal-la varum.</p>
      </div>`;
  } catch (err) {
    target.textContent = err.message;
  }
}

async function loadFood() {
  const list = $("foodList");
  if (!list) return;
  try {
    const data = await api("/api/food");
    list.innerHTML = (data.entries || []).map(e => `
      <p style="border-bottom:1px solid #ddd;padding:8px">
        ${escapeHTML(e.entry_date)} ${escapeHTML(e.entry_time)} ·
        ${escapeHTML(e.name)} (${escapeHTML(e.person_id)}) ·
        ${escapeHTML(e.meal_type)}
      </p>`).join("") || "<p>No food entries found.</p>";
  } catch (err) { list.textContent = err.message; }
}

/* ---------------- HR REQUESTS ---------------- */

async function renderRequests() {
  $("moduleContent").innerHTML = `
    <p>Employee / Intern leave, temporary OUT, return, vacate requests inga review pannalaam.</p>
    ${btn("Load HR Requests", "loadRequests()")}
    <div id="requestList"></div>`;
  await loadRequests();
}

async function loadRequests() {
  const list = $("requestList");
  if (!list) return;
  try {
    const data = await api("/api/requests");
    const requests = data.requests || [];
    list.innerHTML = requests.map(r => `
      <article style="border:1px solid #dce9df;border-radius:12px;padding:12px;margin:8px 0">
        <strong>${escapeHTML(r.name || r.person_id || "Request")}</strong>
        <p>ID: ${escapeHTML(r.person_id)} · ${escapeHTML(r.person_type)}</p>
        <p>Type: ${escapeHTML(r.request_type)} · Status: ${escapeHTML(r.status)}</p>
        <p>${escapeHTML(r.remarks || r.reason || "")}</p>
        ${String(r.status || "").toUpperCase() === "PENDING" ? `
          ${btn("Approve", `reviewRequest(${Number(r.id)},'APPROVED')`)}
          ${btn("Reject", `reviewRequest(${Number(r.id)},'REJECTED')`, "#b33c3c")}
        ` : ""}
      </article>`).join("") || "<p>No requests found.</p>";
  } catch (err) { list.textContent = err.message; }
}

async function reviewRequest(id, status) {
  const remarks = prompt("HR remarks (optional):") || "";
  try {
    const result = await api("/api/requests/review", "POST", {
      request_id: id,
      status,
      remarks
    });
    alert(result.message || "Request reviewed.");
    loadRequests();
  } catch (err) { alert(err.message); }
}

/* ---------------- REPORTS / CSV ---------------- */

async function renderReports() {
  $("moduleContent").innerHTML = `
    ${btn("Generate Report", "loadReports()")}
    ${btn("Export People CSV", "exportPeopleCSV()", "#53665b")}
    <div id="reportList"></div>`;
  await loadReports();
}

async function loadReports() {
  const list = $("reportList");
  if (!list) return;
  try {
    const d = await api("/api/reports");
    list.innerHTML = `
      <h3>Cab Today: ${escapeHTML(d.cab_today ?? 0)}</h3>
      <h3>Employees by Department</h3>
      ${(d.employee_departments || []).map(x =>
        `<p>${escapeHTML(x.department)}: ${escapeHTML(x.total)}</p>`).join("")}
      <h3>Food Today</h3>
      ${(d.food_today || []).map(x =>
        `<p>${escapeHTML(x.meal_type)}: ${escapeHTML(x.total)}</p>`).join("")}
      <h3>Attendance Today</h3>
      ${(d.attendance_today || []).map(x =>
        `<p>${escapeHTML(x.attendance_status)}: ${escapeHTML(x.total)}</p>`).join("")}`;
  } catch (err) { list.textContent = err.message; }
}

async function exportPeopleCSV() {
  try {
    const data = await api("/api/people?type=ALL&status=ALL");
    const cols = [
      "person_type", "person_id", "name", "department", "designation",
      "mobile", "shift", "room", "hostel_status", "status"
    ];
    const csv = [
      cols.join(","),
      ...(data.people || []).map(p => cols.map(c =>
        `"${String(p[c] ?? "").replace(/"/g, '""')}"`
      ).join(","))
    ].join("\r\n");

    const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], {
      type: "text/csv;charset=utf-8;"
    }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "texmo-hostel-people.csv";
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) { alert(err.message); }
}

/* ---------------- EMPLOYEE / INTERN PORTAL: FOUR TABS ---------------- */

function showPersonPortal() {
  const session = getPerson();
  if (!session?.person) return showOnly("homeScreen");

  let portal = $("personPortalScreen");
  if (!portal) {
    portal = document.createElement("section");
    portal.id = "personPortalScreen";
    portal.className = "screen";
    portal.style.cssText = "max-width:760px;margin:18px auto;padding:12px";
    document.querySelector("main.container")?.appendChild(portal);
  }

  const p = session.person;
  portal.innerHTML = `
    <div class="panel">
      <span class="badge">${escapeHTML(session.person_type)} PORTAL</span>
      <h2>Welcome, ${escapeHTML(p.name)}</h2>
      <p class="muted">ID: ${escapeHTML(p.person_id)}</p>
      <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:15px 0">
        <button class="btn" onclick="personTab('profile')">👤 Profile</button>
        <button class="btn" onclick="personTab('qr')">▦ My QR</button>
        <button class="btn" onclick="personTab('food')">🍽️ Food Scanner</button>
        <button class="btn" onclick="personTab('requests')">📝 Requests to HR</button>
      </div>
      <div id="personTabContent"></div>
      ${btn("Logout", "personLogout()", "#b33c3c")}
    </div>`;
  showOnly("personPortalScreen");
  personTab("profile");
}

function personTab(tab) {
  const s = getPerson();
  if (!s?.person) return;
  const p = s.person;
  const target = $("personTabContent");
  if (!target) return;

  if (tab === "profile") {
    target.innerHTML = `
      <h3>My Profile</h3>
      ${["name", "person_id", "department", "designation", "mobile", "shift", "room", "hostel_status"].map(k =>
        `<div style="padding:9px;border-bottom:1px solid #eee"><strong>${escapeHTML(k.replace("_", " "))}:</strong> ${escapeHTML(p[k] || "-")}</div>`
      ).join("")}
      ${selectField("myShift", "My Shift", ["SHIFT 1", "SHIFT 2", "SHIFT 3"])}
      ${btn("Update Shift", "updateMyShift()")}
    `;
    $("myShift").value = p.shift || "SHIFT 1";
  }

  if (tab === "qr") {
    const token = s.qr_token || p.qr_token || "";
    target.innerHTML = `
      <h3>My Personal QR</h3>
      ${token ? `<img alt="Personal QR code"
        src="https://quickchart.io/qr?size=240&text=${encodeURIComponent(token)}"
        style="display:block;width:240px;max-width:100%;margin:10px auto">`
        : "<p>Personal QR token login response-la kidaikkala. Worker response check thevai.</p>"}
      <p class="muted">Cab entry-kku HR indha QR-ai scan pannuvaanga.</p>`;
  }

  if (tab === "food") {
    target.innerHTML = `
      <h3>Food Scanner</h3>
      <p>HR display pannura food QR-ai scan pannunga.</p>
      ${selectField("foodMealChoice", "Meal", ["BREAKFAST", "LUNCH", "DINNER"])}
      ${btn("Start Food QR Scanner", "startScanner('food')")}
      ${btn("Stop Scanner", "stopScanner()", "#53665b")}
      <video id="scanVideo" playsinline style="width:100%;max-height:300px;background:#111;border-radius:12px"></video>
      ${field("foodManualToken", "Scanned food QR token", "text", false)}
      ${btn("Submit Food Entry", "submitFoodScan()")}`;
  }

  if (tab === "requests") {
    target.innerHTML = `
      <h3>Requests to HR</h3>
      ${selectField("requestType", "Request type", ["LEAVE", "TEMPORARY_OUT", "RETURN", "VACATE"])}
      ${field("requestStart", "From date", "date", false)}
      ${field("requestEnd", "To date", "date", false)}
      ${field("requestReason", "Reason / remarks", "text", true)}
      ${btn("Submit Request", "submitRequest()")}
      ${btn("My Requests", "loadMyRequests()", "#53665b")}
      <div id="myRequestList"></div>`;
  }
}

async function updateMyShift() {
  const s = getPerson();
  if (!s?.person) return;
  try {
    const shift = $("myShift").value;
    const result = await api("/api/shift/update", "POST", {
      person_type: s.person_type,
      person_id: s.person.person_id,
      shift
    });
    s.person.shift = shift;
    saveSession(PERSON_KEY, s);
    alert(result.message || "Shift updated.");
    showPersonPortal();
  } catch (err) { alert(err.message); }
}

async function submitFoodScan() {
  const s = getPerson();
  const foodToken = $("foodManualToken")?.value.trim();
  if (!foodToken) return alert("Food QR-ai scan pannunga.");

  try {
    const result = await api("/api/food/scan", "POST", {
      food_token: foodToken,
      meal_type: $("foodMealChoice").value
    });
    alert(result.message || "Food entry recorded.");
    $("foodManualToken").value = "";
  } catch (err) { alert(err.message); }
}

async function submitRequest() {
  const s = getPerson();
  if (!s?.person) return;
  try {
    const result = await api("/api/requests", "POST", {
      person_type: s.person_type,
      person_id: s.person.person_id,
      request_type: $("requestType").value,
      start_date: $("requestStart").value,
      end_date: $("requestEnd").value,
      remarks: $("requestReason").value.trim()
    });
    alert(result.message || "Request sent to HR.");
    loadMyRequests();
  } catch (err) { alert(err.message); }
}

async function loadMyRequests() {
  const target = $("myRequestList");
  if (!target) return;
  try {
    const data = await api("/api/requests");
    const s = getPerson();
    const mine = (data.requests || []).filter(r =>
      r.person_id === s?.person?.person_id &&
      r.person_type === s?.person_type
    );
    target.innerHTML = mine.map(r => `
      <p style="padding:9px;border-bottom:1px solid #ddd">
        ${escapeHTML(r.request_type)} · ${escapeHTML(r.status)} ·
        ${escapeHTML(r.remarks || "")}
      </p>`).join("") || "<p>Innum requests illa.</p>";
  } catch (err) { target.textContent = err.message; }
}

function personLogout() {
  stopScanner();
  localStorage.removeItem(PERSON_KEY);
  showOnly("homeScreen");
}

/* ---------------- STARTUP ---------------- */

document.addEventListener("DOMContentLoaded", () => {
  bindStaffForms();
  bindPersonForms();
  addRegistrationForms();

  if (getStaff()) showStaffPortal();
  else if (getPerson()) showPersonPortal();
});
