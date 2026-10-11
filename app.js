
const API_BASE = "";

const $ = (id) => document.getElementById(id);

async function api(path, method = "GET", data = null) {
  const options = { method, headers: { "Content-Type": "application/json" } };
  if (data) options.body = JSON.stringify(data);

  const response = await fetch(`${API_BASE}${path}`, options);
  const result = await response.json();

  if (!response.ok || !result.success) {
    throw new Error(result.message || "Request failed");
  }
  return result;
}

function getStaff() {
  try {
    return JSON.parse(localStorage.getItem("texmo_staff_session") || "null");
  } catch {
    return null;
  }
}

function getPerson() {
  try {
    return JSON.parse(localStorage.getItem("texmo_person_session") || "null");
  } catch {
    return null;
  }
}

function setMessage(message) {
  let el = $("appMessage");
  if (!el) {
    el = document.createElement("div");
    el.id = "appMessage";
    el.style.cssText =
      "position:sticky;top:5px;z-index:9999;background:#e9f8ef;color:#126c3b;padding:12px;margin:8px;border-radius:10px;font-weight:600";
    document.body.prepend(el);
  }
  el.textContent = message;
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;",
    '"': "&quot;", "'": "&#39;"
  })[ch]);
}

async function staffRegister(data) {
  return api("/api/staff/register", "POST", data);
}

async function staffLogin(data) {
  return api("/api/staff/login", "POST", data);
}

function showOnly(screenId) {
  document.querySelectorAll(".screen").forEach(screen => {
    screen.classList.toggle("active", screen.id === screenId);
  });
}

function showScreen(screenId) {
  showOnly(screenId);
}

function bindStaffLogin() {
  const form = $("staffLoginForm");
  if (!form || form.dataset.bound) return;
  form.dataset.bound = "1";

  form.addEventListener("submit", async event => {
    event.preventDefault();
    try {
      const result = await staffLogin({
        staff_id: $("staffLoginId")?.value.trim(),
        password: $("staffLoginPassword")?.value
      });

      localStorage.setItem("texmo_staff_session", JSON.stringify(result.staff));
      showStaffPortal();
      setMessage("Welcome, " + result.staff.name);
    } catch (error) {
      alert(error.message);
    }
  });
}

function bindStaffRegister() {
  const form = $("staffRegisterForm");
  if (!form || form.dataset.bound) return;
  form.dataset.bound = "1";

  form.addEventListener("submit", async event => {
    event.preventDefault();

    const data = {
      name: valueOf(["staffRegisterName", "staffName"]),
      staff_id: valueOf(["staffRegisterId", "staffId"]),
      mobile: valueOf(["staffRegisterMobile", "staffMobile"]),
      password: valueOf(["staffRegisterPassword", "staffPassword"]),
      confirm_password: valueOf(["staffRegisterConfirmPassword", "staffConfirmPassword"]),
      role: valueOf(["staffRegisterRole", "staffRole"]),
      master_key: valueOf(["staffMasterKey", "masterKey"])
    };

    try {
      const result = await staffRegister(data);
      alert(result.message);
      showOnly("staffLoginScreen");
    } catch (error) {
      alert(error.message);
    }
  });
}

function valueOf(ids) {
  for (const id of ids) {
    const element = $(id);
    if (element) return element.value.trim();
  }
  return "";
}

function showStaffPortal() {
  const staff = getStaff();
  if (!staff) {
    showOnly("staffLoginScreen");
    return;
  }

  showOnly("staffPortalScreen");

  const fields = {
    portalStaffName: staff.name,
    portalStaffRole: staff.role,
    portalStaffId: staff.staff_id,
    portalInfoName: staff.name,
    portalInfoRole: staff.role,
    portalInfoStaffId: staff.staff_id
  };

  for (const [id, value] of Object.entries(fields)) {
    if ($(id)) $(id).textContent = value || "";
  }

  addPortalWorkspace();
  loadDashboard();
}

function addPortalWorkspace() {
  if ($("portalWorkspace")) return;

  const portal = $("staffPortalScreen");
  if (!portal) return;

  const workspace = document.createElement("section");
  workspace.id = "portalWorkspace";
  workspace.style.cssText =
    "background:#fff;padding:14px;border-radius:16px;margin:12px 0;color:#163b2a";
  portal.appendChild(workspace);
}

function portalModule(moduleName) {
  addPortalWorkspace();
  const workspace = $("portalWorkspace");
  if (!workspace) return;

  const views = {
    "Employee Management": renderPeople,
    "Room Management": renderRooms,
    "Cab Management": renderCab,
    "Attendance": renderAttendance,
    "Leave Management": renderLeave,
    "Reports": renderReports,
    "Food Management": renderFood
  };

  workspace.innerHTML = `
    <button type="button" id="moduleBack"
      style="${buttonStyle("#53665b")}">← Dashboard</button>
    <h3>${escapeHTML(moduleName)}</h3>
    <div id="moduleContent">Loading...</div>
  `;

  $("moduleBack").onclick = () => {
    workspace.innerHTML = "";
    loadDashboard();
  };

  const render = views[moduleName];
  if (render) render();
  else $("moduleContent").textContent = "Module not available.";
}

function buttonStyle(color = "#198754") {
  return `background:${color};color:white;border:0;border-radius:9px;padding:10px 13px;margin:4px;cursor:pointer;font-weight:600`;
}

function inputStyle() {
  return "width:100%;box-sizing:border-box;padding:10px;margin:5px 0;border:1px solid #cbd9cf;border-radius:8px";
}

function selectHTML(id, options, label = "") {
  return `<label>${escapeHTML(label)}<select id="${id}" style="${inputStyle()}">
    ${options.map(x => `<option value="${escapeHTML(x)}">${escapeHTML(x)}</option>`).join("")}
  </select></label>`;
}

function inputHTML(id, placeholder, type = "text") {
  return `<input id="${id}" type="${type}" placeholder="${escapeHTML(placeholder)}" style="${inputStyle()}">`;
}

function moduleContent() {
  return $("moduleContent");
}

async function loadDashboard() {
  const target = $("portalWorkspace");
  if (!target) return;

  try {
    const d = await api("/api/dashboard");
    target.innerHTML = `
      <h3>Hostel Overview</h3>
      <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px">
        ${statCard("Employees", d.employees)}
        ${statCard("Interns", d.interns)}
        ${statCard("Inside Hostel", d.in_hostel)}
        ${statCard("Out / Leave", d.out_or_leave)}
        ${statCard("Vacated", d.vacated)}
      </div>
      <div style="margin-top:10px">
        <button style="${buttonStyle()}" onclick="portalModule('Employee Management')">People</button>
        <button style="${buttonStyle()}" onclick="portalModule('Room Management')">Rooms</button>
        <button style="${buttonStyle()}" onclick="portalModule('Attendance')">Attendance</button>
        <button style="${buttonStyle()}" onclick="portalModule('Leave Management')">Leave / OUT</button>
        <button style="${buttonStyle()}" onclick="portalModule('Cab Management')">Cab</button>
        <button style="${buttonStyle()}" onclick="portalModule('Food Management')">Food</button>
        <button style="${buttonStyle()}" onclick="portalModule('Reports')">Reports</button>
      </div>`;
  } catch (error) {
    target.innerHTML = `<p>${escapeHTML(error.message)}</p>
      <button style="${buttonStyle()}" onclick="loadDashboard()">Retry</button>`;
  }
}

function statCard(label, value) {
  return `<div style="padding:14px;background:#eaf7ef;border-radius:12px">
    <div style="font-size:13px">${escapeHTML(label)}</div>
    <strong style="font-size:24px">${escapeHTML(value)}</strong>
  </div>`;
}

async function renderPeople() {
  const content = moduleContent();
  content.innerHTML = `
    <div style="display:grid;gap:6px">
      ${selectHTML("personType", ["ALL", "EMPLOYEE", "INTERN"], "Person type")}
      ${selectHTML("personStatus", ["ALL", "ACTIVE", "RESIGNED"], "Status")}
      <button style="${buttonStyle()}" onclick="loadPeople()">Load People</button>
      <h4>Add Employee / Intern</h4>
      ${selectHTML("newType", ["EMPLOYEE", "INTERN"], "Registration type")}
      ${inputHTML("newId", "Employee ID / Intern ID")}
      ${inputHTML("newName", "Full name")}
      ${selectHTML("newDepartment", ["PDN", "PDN2", "PDN3", "MDN"], "Department")}
      ${inputHTML("newDesignation", "Designation")}
      ${inputHTML("newMobile", "Mobile number", "tel")}
      ${inputHTML("newPassword", "Password (minimum 8 characters)", "password")}
      ${selectHTML("newShift", ["SHIFT 1", "SHIFT 2", "SHIFT 3"], "Shift")}
      ${inputHTML("newRoom", "Room number")}
      <button style="${buttonStyle()}" onclick="addPerson()">Save Person</button>
      <div id="peopleList"></div>
    </div>`;
  await loadPeople();
}

async function loadPeople() {
  const list = $("peopleList");
  if (!list) return;

  list.textContent = "Loading people...";
  try {
    const type = $("personType")?.value || "ALL";
    const status = $("personStatus")?.value || "ALL";
    const data = await api(`/api/people?type=${encodeURIComponent(type)}&status=${encodeURIComponent(status)}`);

    if (!data.people.length) {
      list.innerHTML = "<p>No records found.</p>";
      return;
    }

    list.innerHTML = data.people.map(p => `
      <article style="border:1px solid #d9e6dc;padding:10px;border-radius:10px;margin:8px 0">
        <strong>${escapeHTML(p.name)}</strong>
        <div>${escapeHTML(p.person_id)} · ${escapeHTML(p.person_type)}</div>
        <div>${escapeHTML(p.department)} · ${escapeHTML(p.shift || "No shift")}</div>
        <div>Room: ${escapeHTML(p.room || "Not allocated")}</div>
        <div>Hostel: ${escapeHTML(p.hostel_status)} · ${escapeHTML(p.status)}</div>
        <button style="${buttonStyle()}" onclick="editPerson('${escapeHTML(p.person_type)}','${escapeHTML(p.person_id)}')">Edit</button>
        <button style="${buttonStyle("#a94442")}" onclick="deletePerson('${escapeHTML(p.person_type)}','${escapeHTML(p.person_id)}')">Delete</button>
        <button style="${buttonStyle("#53665b")}" onclick="quickStatus('${escapeHTML(p.person_type)}','${escapeHTML(p.person_id)}','IN')">IN</button>
        <button style="${buttonStyle("#b87818")}" onclick="quickStatus('${escapeHTML(p.person_type)}','${escapeHTML(p.person_id)}','OUT/LEAVE')">OUT / LEAVE</button>
        <button style="${buttonStyle("#a94442")}" onclick="quickStatus('${escapeHTML(p.person_type)}','${escapeHTML(p.person_id)}','VACATED')">Vacated</button>
      </article>`).join("");
  } catch (error) {
    list.textContent = error.message;
  }
}

async function addPerson() {
  try {
    const result = await api("/api/person/register", "POST", {
      person_type: $("newType").value,
      person_id: $("newId").value.trim(),
      name: $("newName").value.trim(),
      department: $("newDepartment").value,
      designation: $("newDesignation").value.trim(),
      mobile: $("newMobile").value.trim(),
      password: $("newPassword").value,
      shift: $("newShift").value,
      room: $("newRoom").value.trim()
    });
    alert(result.message);
    await loadPeople();
  } catch (error) {
    alert(error.message);
  }
}

async function editPerson(type, id) {
  const name = prompt("New full name:");
  if (name === null) return;

  const department = prompt("Department: PDN, PDN2, PDN3 or MDN");
  if (department === null) return;

  const shift = prompt("Shift: SHIFT 1, SHIFT 2 or SHIFT 3");
  if (shift === null) return;

  const room = prompt("Room number:");
  if (room === null) return;

  const designation = prompt("Designation (leave blank if none):");
  if (designation === null) return;

  const mobile = prompt("Mobile number:");
  if (mobile === null) return;

  try {
    const result = await api("/api/people/update", "POST", {
      person_type: type,
      person_id: id,
      name,
      department: department.toUpperCase(),
      shift: shift.toUpperCase(),
      room,
      designation,
      mobile
    });
    alert(result.message);
    await loadPeople();
  } catch (error) {
    alert(error.message);
  }
}

async function deletePerson(type, id) {
  if (!confirm(`Permanently delete ${id}?`)) return;
  try {
    const result = await api("/api/people/delete", "POST", {
      person_type: type,
      person_id: id
    });
    alert(result.message);
    await loadPeople();
  } catch (error) {
    alert(error.message);
  }
}

async function quickStatus(type, id, status) {
  try {
    const result = await api("/api/hostel/status", "POST", {
      person_type: type,
      person_id: id,
      hostel_status: status
    });
    alert(result.message);
    await loadPeople();
  } catch (error) {
    alert(error.message);
  }
}

async function renderRooms() {
  const content = moduleContent();
  content.innerHTML = `
    <h4>Add / Update Room</h4>
    ${inputHTML("roomNumber", "Room number, e.g. B1")}
    ${selectHTML("roomBlock", ["A", "B", "C", "D"], "Block")}
    <button style="${buttonStyle()}" onclick="saveRoom()">Save Room</button>
    <button style="${buttonStyle("#53665b")}" onclick="loadRooms()">Refresh Rooms</button>
    <div id="roomList"></div>`;
  await loadRooms();
}

async function saveRoom() {
  try {
    const result = await api("/api/rooms", "POST", {
      room_number: $("roomNumber").value.trim(),
      block: $("roomBlock").value
    });
    alert(result.message);
    await loadRooms();
  } catch (error) {
    alert(error.message);
  }
}

async function loadRooms() {
  const list = $("roomList");
  if (!list) return;
  try {
    const data = await api("/api/rooms");
    list.innerHTML = data.rooms.map(r => `
      <div style="padding:10px;border-bottom:1px solid #ddd">
        <strong>${escapeHTML(r.room_number)}</strong>
        · Block ${escapeHTML(r.block)}
        · Occupied: ${escapeHTML(r.occupied)}
      </div>`).join("") || "<p>No rooms added yet.</p>";
  } catch (error) {
    list.textContent = error.message;
  }
}

async function renderLeave() {
  const content = moduleContent();
  content.innerHTML = `
    <p>Manage IN, OUT/LEAVE and VACATED status in People Management.</p>
    <button style="${buttonStyle()}" onclick="portalModule('Employee Management')">Open People Management</button>`;
}

async function renderAttendance() {
  const content = moduleContent();
  content.innerHTML = `
    ${inputHTML("attendanceDate", "Attendance date (YYYY-MM-DD)")}
    ${selectHTML("attendanceShift", ["SHIFT 1", "SHIFT 2", "SHIFT 3"], "Shift")}
    <button style="${buttonStyle()}" onclick="loadAttendancePeople()">Load Active People</button>
    <div id="attendanceList"></div>`;
  $("attendanceDate").value = new Date().toISOString().slice(0, 10);
}

async function loadAttendancePeople() {
  const list = $("attendanceList");
  if (!list) return;

  try {
    const data = await api("/api/people?type=ALL&status=ACTIVE");
    const date = $("attendanceDate").value;
    const shift = $("attendanceShift").value;

    list.innerHTML = data.people.map(p => `
      <div style="padding:10px;border-bottom:1px solid #ddd">
        <strong>${escapeHTML(p.name)}</strong> (${escapeHTML(p.person_id)})
        <div>${escapeHTML(p.department)} · Room ${escapeHTML(p.room || "-")}</div>
        ${selectHTML(`att_${p.person_type}_${p.person_id}`, ["PRESENT", "ABSENT", "N/A"], "Status")}
        <button style="${buttonStyle()}" onclick="saveOneAttendance('${escapeHTML(p.person_type)}','${escapeHTML(p.person_id)}','${date}','${shift}')">Save Attendance</button>
      </div>`).join("");
  } catch (error) {
    list.textContent = error.message;
  }
}

async function saveOneAttendance(type, id, date, shift) {
  const select = $(`att_${type}_${id}`);
  try {
    const result = await api("/api/attendance", "POST", {
      person_type: type,
      person_id: id,
      attendance_date: date,
      shift,
      attendance_status: select.value
    });
    alert(result.message);
  } catch (error) {
    alert(error.message);
  }
}

async function renderCab() {
  const content = moduleContent();
  content.innerHTML = `
    <h4>Record Cab Entry</h4>
    ${selectHTML("cabType", ["EMPLOYEE", "INTERN"], "Person type")}
    ${inputHTML("cabPersonId", "Employee ID / Intern ID")}
    ${selectHTML("cabShift", ["SHIFT 1", "SHIFT 2", "SHIFT 3"], "Shift")}
    <button style="${buttonStyle()}" onclick="saveCab()">Save Cab Entry</button>
    <h4>Today's Entries</h4>
    <button style="${buttonStyle("#53665b")}" onclick="loadCab()">Refresh</button>
    <div id="cabList"></div>`;
  await loadCab();
}

async function saveCab() {
  try {
    const result = await api("/api/cab", "POST", {
      person_type: $("cabType").value,
      person_id: $("cabPersonId").value.trim(),
      shift: $("cabShift").value
    });
    alert(result.message);
    await loadCab();
  } catch (error) {
    alert(error.message);
  }
}

async function loadCab() {
  const list = $("cabList");
  if (!list) return;
  try {
    const data = await api("/api/cab");
    list.innerHTML = data.entries.map(e => `
      <div style="padding:8px;border-bottom:1px solid #ddd">
        ${escapeHTML(e.entry_time)} · ${escapeHTML(e.name)} ·
        ${escapeHTML(e.department)} · ${escapeHTML(e.shift || "-")} ·
        Room ${escapeHTML(e.room || "-")}
      </div>`).join("") || "<p>No cab entries today.</p>";
  } catch (error) {
    list.textContent = error.message;
  }
}

async function renderFood() {
  const content = moduleContent();
  content.innerHTML = `
    <h4>Food Entry</h4>
    ${inputHTML("foodQrToken", "Active food QR token")}
    ${selectHTML("foodType", ["EMPLOYEE", "INTERN"], "Person type")}
    ${inputHTML("foodPersonId", "Employee ID / Intern ID")}
    ${selectHTML("foodMeal", ["BREAKFAST", "LUNCH", "DINNER"], "Meal")}
    <button style="${buttonStyle()}" onclick="saveFood()">Save Food Entry</button>
    <h4>Today's Entries</h4>
    <button style="${buttonStyle("#53665b")}" onclick="loadFood()">Refresh</button>
    <div id="foodList"></div>`;
  await loadFood();
}

async function saveFood() {
  try {
    const result = await api("/api/food", "POST", {
      qr_token: $("foodQrToken").value.trim(),
      person_type: $("foodType").value,
      person_id: $("foodPersonId").value.trim(),
      meal_type: $("foodMeal").value
    });
    alert(result.message);
    await loadFood();
  } catch (error) {
    alert(error.message);
  }
}

async function loadFood() {
  const list = $("foodList");
  if (!list) return;
  try {
    const data = await api("/api/food");
    list.innerHTML = data.entries.map(e => `
      <div style="padding:8px;border-bottom:1px solid #ddd">
        ${escapeHTML(e.entry_time)} · ${escapeHTML(e.name)} ·
        ${escapeHTML(e.department)} · ${escapeHTML(e.meal_type)}
      </div>`).join("") || "<p>No food entries today.</p>";
  } catch (error) {
    list.textContent = error.message;
  }
}

async function renderReports() {
  const content = moduleContent();
  content.innerHTML = `
    <button style="${buttonStyle()}" onclick="loadReports()">Generate Report</button>
    <button style="${buttonStyle("#53665b")}" onclick="exportPeopleCSV()">Export People CSV</button>
    <div id="reportList"></div>`;
  await loadReports();
}

async function loadReports() {
  const list = $("reportList");
  if (!list) return;

  try {
    const data = await api("/api/reports");
    list.innerHTML = `
      <h4>Cab Today: ${escapeHTML(data.cab_today)}</h4>
      <h4>Employees by Department</h4>
      ${data.employee_departments.map(x => `<p>${escapeHTML(x.department)}: ${escapeHTML(x.total)}</p>`).join("")}
      <h4>Food Today</h4>
      ${data.food_today.map(x => `<p>${escapeHTML(x.meal_type)}: ${escapeHTML(x.total)}</p>`).join("")}
      <h4>Attendance Today</h4>
      ${data.attendance_today.map(x => `<p>${escapeHTML(x.attendance_status)}: ${escapeHTML(x.total)}</p>`).join("")}`;
  } catch (error) {
    list.textContent = error.message;
  }
}

async function exportPeopleCSV() {
  try {
    const data = await api("/api/people?type=ALL&status=ALL");
    const columns = [
      "person_type", "person_id", "name", "department",
      "designation", "mobile", "shift", "room", "hostel_status", "status"
    ];

    const csv = [
      columns.join(","),
      ...data.people.map(p => columns.map(c =>
        `"${String(p[c] ?? "").replace(/"/g, '""')}"`
      ).join(","))
    ].join("\r\n");

    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "texmo-hostel-people.csv";
    a.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    alert(error.message);
  }
}

async function personLogin(type, id, password) {
  return api("/api/person/login", "POST", {
    person_type: type,
    person_id: id,
    password
  });
}

function bindPersonForms() {
  const configs = [
    { form: "employeeLoginForm", type: "EMPLOYEE", id: "employeeLoginId", password: "employeeLoginPassword" },
    { form: "internLoginForm", type: "INTERN", id: "internLoginId", password: "internLoginPassword" }
  ];

  for (const config of configs) {
    const form = $(config.form);
    if (!form || form.dataset.bound) continue;
    form.dataset.bound = "1";

    form.addEventListener("submit", async event => {
      event.preventDefault();
      try {
        const result = await personLogin(
          config.type,
          $(config.id)?.value.trim(),
          $(config.password)?.value
        );

        localStorage.setItem("texmo_person_session", JSON.stringify({
          person_type: result.person_type,
          person: result.person,
          qr_token: result.qr_token
        }));

        showPersonPortal();
      } catch (error) {
        alert(error.message);
      }
    });
  }
}

function showPersonPortal() {
  const session = getPerson();
  if (!session) return;

  let portal = $("personPortalScreen");
  if (!portal) {
    portal = document.createElement("section");
    portal.id = "personPortalScreen";
    portal.className = "screen";
    document.body.appendChild(portal);
  }

  const p = session.person;
  portal.innerHTML = `
    <div style="background:#fff;padding:20px;border-radius:16px;color:#17452d">
      <h2>TEXMO Hostel Hub</h2>
      <h3>Welcome, ${escapeHTML(p.name)}</h3>
      <p>ID: ${escapeHTML(p.person_id)}</p>
      <p>Department: ${escapeHTML(p.department)}</p>
      <p>Shift: ${escapeHTML(p.shift || "-")}</p>
      <p>Room: ${escapeHTML(p.room || "-")}</p>
      <p>Hostel status: ${escapeHTML(p.hostel_status)}</p>
      <h4>Update My Shift</h4>
      ${selectHTML("myShift", ["SHIFT 1", "SHIFT 2", "SHIFT 3"], "Select shift")}
      <button style="${buttonStyle()}" onclick="updateMyShift()">Save Shift</button>
      <h4>My QR Token</h4>
      <p style="overflow-wrap:anywhere">${escapeHTML(session.qr_token || "QR not generated")}</p>
      <button style="${buttonStyle("#a94442")}" onclick="personLogout()">Logout</button>
    </div>`;

  showOnly("personPortalScreen");
  $("myShift").value = p.shift || "SHIFT 1";
}

async function updateMyShift() {
  const session = getPerson();
  if (!session) return;

  try {
    const result = await api("/api/shift/update", "POST", {
      person_type: session.person_type,
      person_id: session.person.person_id,
      shift: $("myShift").value
    });
    session.person.shift = $("myShift").value;
    localStorage.setItem("texmo_person_session", JSON.stringify(session));
    alert(result.message);
    showPersonPortal();
  } catch (error) {
    alert(error.message);
  }
}

function personLogout() {
  localStorage.removeItem("texmo_person_session");
  showOnly("homeScreen");
}

function staffLogout() {
  localStorage.removeItem("texmo_staff_session");
  showOnly("homeScreen");
}

document.addEventListener("DOMContentLoaded", () => {
  bindStaffLogin();
  bindStaffRegister();
  bindPersonForms();

  if (getStaff()) showStaffPortal();
  else if (getPerson()) showPersonPortal();
});
