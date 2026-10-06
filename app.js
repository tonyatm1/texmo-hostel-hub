const API_BASE = "";

let currentEmployee = null;
let currentHR = null;

/* =========================================================
   TEXMO HOSTEL HUB 2.0
   FRESH FRONTEND CONTROLLER
   =========================================================

   Current stage:
   - Home navigation
   - Employee login foundation
   - Employee registration
   - HR registration
   - HR login
   - Employee portal
   - HR portal
   - API-ready structure

   Next backend stages:
   1. HR registration + Master Key verification
   2. HR authentication/session
   3. Employee authentication
   4. D1 employee data
   5. Hostel/room allocation
   6. Cab QR
   7. Leave/vacate/check-in
   8. Food
   9. Shift
   10. Attendance
   11. Reports/Excel
   12. Security + audit
   ========================================================= */


/* =========================================================
   COMMON HELPERS
   ========================================================= */

function getElement(id) {
  return document.getElementById(id);
}


function showMessage(id, message, type = "success") {
  const box = getElement(id);

  if (!box) return;

  box.textContent = message;
  box.className = "message show " + type;
}


function clearMessage(id) {
  const box = getElement(id);

  if (!box) return;

  box.textContent = "";
  box.className = "message";
}


function valueOf(id) {
  const element = getElement(id);

  return element ? element.value.trim() : "";
}


async function apiRequest(path, options = {}) {

  const config = {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  };

  if (options.body !== undefined) {
    config.body = JSON.stringify(options.body);
  }

  const response = await fetch(API_BASE + path, config);

  let data = {};

  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (!response.ok) {

    const message =
      data.message ||
      data.error ||
      `Request failed (${response.status})`;

    throw new Error(message);
  }

  return data;
}


/* =========================================================
   SCREEN NAVIGATION
   ========================================================= */

function showScreen(screenId) {

  const screens =
    document.querySelectorAll(".screen");

  screens.forEach(screen => {
    screen.classList.remove("active");
  });

  const target =
    getElement(screenId);

  if (target) {

    target.classList.add("active");

    window.scrollTo({
      top: 0,
      behavior: "smooth"
    });

  }
}


/* Backward compatibility for old code */
window.showScreen = showScreen;


/* =========================================================
   EMPLOYEE LOGIN
   ========================================================= */

async function employeeLogin() {

  clearMessage("employeeLoginMessage");

  const employeeId =
    valueOf("employeeLoginId");

  const password =
    valueOf("employeeLoginPassword");

  if (!employeeId) {

    showMessage(
      "employeeLoginMessage",
      "Employee ID enter pannunga.",
      "error"
    );

    return;
  }

  if (!password) {

    showMessage(
      "employeeLoginMessage",
      "Password enter pannunga.",
      "error"
    );

    return;
  }


  /*
   * Backend endpoint will be enabled in worker.js.
   *
   * POST /api/employee/login
   */

  try {

    const result =
      await apiRequest("/api/employee/login", {
        method: "POST",
        body: {
          employeeId,
          password
        }
      });


    currentEmployee =
      result.employee || result;


    const welcome =
      getElement("employeeWelcome");

    if (welcome) {

      welcome.textContent =
        `Welcome ${currentEmployee.name || employeeId}`;

    }


    showScreen("employeePortal");

    await loadEmployeeDashboard();

  } catch (error) {

    showMessage(
      "employeeLoginMessage",
      error.message ||
        "Employee login failed.",
      "error"
    );

  }

}


/* =========================================================
   EMPLOYEE REGISTRATION
   ========================================================= */

async function registerEmployee() {

  clearMessage("employeeRegisterMessage");

  const employeeId =
    valueOf("employeeRegId");

  const name =
    valueOf("employeeRegName");

  const department =
    valueOf("employeeRegDepartment");

  const designation =
    valueOf("employeeRegDesignation");

  const phone =
    valueOf("employeeRegPhone");

  const employeeType =
    valueOf("employeeRegType");

  const shift =
    valueOf("employeeRegShift");


  if (!employeeId) {
    showMessage(
      "employeeRegisterMessage",
      "Employee ID required.",
      "error"
    );
    return;
  }


  if (!name) {
    showMessage(
      "employeeRegisterMessage",
      "Employee name required.",
      "error"
    );
    return;
  }


  if (!department) {
    showMessage(
      "employeeRegisterMessage",
      "Department select pannunga.",
      "error"
    );
    return;
  }


  if (!designation) {
    showMessage(
      "employeeRegisterMessage",
      "Designation required.",
      "error"
    );
    return;
  }


  if (!/^[0-9]{10}$/.test(phone)) {

    showMessage(
      "employeeRegisterMessage",
      "Valid 10-digit phone number enter pannunga.",
      "error"
    );

    return;
  }


  if (!employeeType) {
    showMessage(
      "employeeRegisterMessage",
      "Employee type select pannunga.",
      "error"
    );
    return;
  }


  if (!shift) {
    showMessage(
      "employeeRegisterMessage",
      "Shift select pannunga.",
      "error"
    );
    return;
  }


  try {

    const result =
      await apiRequest("/api/employee/register", {
        method: "POST",
        body: {
          employeeId,
          name,
          department,
          designation,
          phone,
          employeeType,
          shift
        }
      });


    showMessage(
      "employeeRegisterMessage",
      result.message ||
        "Employee registered successfully.",
      "success"
    );


  } catch (error) {

    showMessage(
      "employeeRegisterMessage",
      error.message ||
        "Employee registration failed.",
      "error"
    );

  }

}


/* =========================================================
   HR REGISTRATION
   ========================================================= */

async function registerHR() {

  clearMessage("hrRegisterMessage");


  const name =
    valueOf("hrRegName");

  const hrId =
    valueOf("hrRegId");

  const department =
    valueOf("hrRegDepartment");

  const designation =
    valueOf("hrRegDesignation");

  const phone =
    valueOf("hrRegPhone");

  const password =
    valueOf("hrRegPassword");

  const masterKey =
    valueOf("hrRegMasterKey");


  if (!name) {

    showMessage(
      "hrRegisterMessage",
      "HR name required.",
      "error"
    );

    return;
  }


  if (!hrId) {

    showMessage(
      "hrRegisterMessage",
      "HR ID required.",
      "error"
    );

    return;
  }


  if (!department) {

    showMessage(
      "hrRegisterMessage",
      "Department select pannunga.",
      "error"
    );

    return;
  }


  if (!designation) {

    showMessage(
      "hrRegisterMessage",
      "Designation required.",
      "error"
    );

    return;
  }


  if (!/^[0-9]{10}$/.test(phone)) {

    showMessage(
      "hrRegisterMessage",
      "Valid 10-digit phone number enter pannunga.",
      "error"
    );

    return;
  }


  if (password.length < 8) {

    showMessage(
      "hrRegisterMessage",
      "Password minimum 8 characters irukkanum.",
      "error"
    );

    return;
  }


  if (!masterKey) {

    showMessage(
      "hrRegisterMessage",
      "Final Master Key required.",
      "error"
    );

    return;
  }


  /*
   * IMPORTANT:
   *
   * Master Key is NEVER stored in this frontend.
   *
   * It is sent over HTTPS to:
   *
   * POST /api/hr/register
   *
   * worker.js will validate it against the server-side secret.
   */

  try {

    const result =
      await apiRequest("/api/hr/register", {
        method: "POST",
        body: {
          name,
          hrId,
          department,
          designation,
          phone,
          password,
          masterKey
        }
      });


    showMessage(
      "hrRegisterMessage",
      result.message ||
        "HR account created successfully.",
      "success"
    );


    /*
     * Clear sensitive fields after successful request.
     */

    const masterInput =
      getElement("hrRegMasterKey");

    const passwordInput =
      getElement("hrRegPassword");

    if (masterInput) {
      masterInput.value = "";
    }

    if (passwordInput) {
      passwordInput.value = "";
    }


  } catch (error) {

    showMessage(
      "hrRegisterMessage",
      error.message ||
        "HR registration failed.",
      "error"
    );

  }

}


/* =========================================================
   HR LOGIN
   ========================================================= */

async function hrLogin() {

  clearMessage("hrLoginMessage");


  const hrId =
    valueOf("hrLoginId");

  const password =
    valueOf("hrLoginPassword");


  if (!hrId) {

    showMessage(
      "hrLoginMessage",
      "HR ID enter pannunga.",
      "error"
    );

    return;
  }


  if (!password) {

    showMessage(
      "hrLoginMessage",
      "Password enter pannunga.",
      "error"
    );

    return;
  }


  try {

    const result =
      await apiRequest("/api/hr/login", {
        method: "POST",
        body: {
          hrId,
          password
        }
      });


    currentHR =
      result.hr || result;


    const welcome =
      getElement("hrWelcome");

    if (welcome) {

      welcome.textContent =
        `Authorized HR • ${currentHR.name || hrId}`;

    }


    showScreen("hrPortal");

    await loadHRDashboard();


  } catch (error) {

    showMessage(
      "hrLoginMessage",
      error.message ||
        "HR login failed.",
      "error"
    );

  }

}


/* =========================================================
   EMPLOYEE PORTAL TABS
   ========================================================= */

function employeeTab(tabId) {

  const portal =
    getElement("employeePortal");

  if (!portal) return;


  const contents =
    portal.querySelectorAll(".tab-content");

  const tabs =
    portal.querySelectorAll(".tab");


  contents.forEach(item => {
    item.classList.remove("active");
  });


  tabs.forEach(item => {
    item.classList.remove("active");
  });


  const target =
    getElement(tabId);

  if (target) {
    target.classList.add("active");
  }


  tabs.forEach(button => {

    const action =
      button.getAttribute("onclick") || "";

    if (action.includes(`'${tabId}'`)) {

      button.classList.add("active");

    }

  });


  /*
   * Lazy-load tab data.
   */

  if (tabId === "employeeRoom") {
    loadEmployeeRoom();
  }

  if (tabId === "employeeCab") {
    loadEmployeeCab();
  }

  if (tabId === "employeeLeave") {
    loadEmployeeLeave();
  }

  if (tabId === "employeeFood") {
    loadEmployeeFood();
  }

}


window.employeeTab = employeeTab;


/* =========================================================
   HR PORTAL TABS
   ========================================================= */

function hrTab(tabId) {

  const portal =
    getElement("hrPortal");

  if (!portal) return;


  const contents =
    portal.querySelectorAll(".tab-content");

  const tabs =
    portal.querySelectorAll(".tab");


  contents.forEach(item => {
    item.classList.remove("active");
  });


  tabs.forEach(item => {
    item.classList.remove("active");
  });


  const target =
    getElement(tabId);

  if (target) {
    target.classList.add("active");
  }


  tabs.forEach(button => {

    const action =
      button.getAttribute("onclick") || "";

    if (action.includes(`'${tabId}'`)) {

      button.classList.add("active");

    }

  });


  /*
   * Lazy-load HR modules.
   */

  if (tabId === "hrDashboard") {
    loadHRDashboard();
  }

  if (tabId === "hrCab") {
    loadHRCab();
  }

  if (tabId === "hrEmployees") {
    loadHREmployees();
  }

  if (tabId === "hrRooms") {
    loadHRRooms();
  }

  if (tabId === "hrLeave") {
    loadHRLeave();
  }

}


window.hrTab = hrTab;


/* =========================================================
   EMPLOYEE DASHBOARD
   ========================================================= */

async function loadEmployeeDashboard() {

  if (!currentEmployee) return;


  /*
   * Future API:
   *
   * GET /api/employee/dashboard/:employeeId
   */

  try {

    const id =
      encodeURIComponent(
        currentEmployee.employeeId ||
        currentEmployee.id
      );


    const result =
      await apiRequest(
        `/api/employee/dashboard/${id}`
      );


    const data =
      result.employee ||
      result;


    currentEmployee = {
      ...currentEmployee,
      ...data
    };


    updateEmployeeSummary();


  } catch {

    /*
     * Dashboard can still open even when
     * backend endpoint is not created yet.
     */

    updateEmployeeSummary();

  }

}


function updateEmployeeSummary() {

  if (!currentEmployee) return;


  const room =
    currentEmployee.room ||
    currentEmployee.room_no ||
    "-";


  const bed =
    currentEmployee.bed ||
    currentEmployee.bed_no ||
    "-";


  const status =
    currentEmployee.hostelStatus ||
    currentEmployee.hostel_status ||
    "OUT";


  const cab =
    currentEmployee.cab ||
    currentEmployee.cabName ||
    "-";


  const roomValue =
    getElement("employeeRoomValue");

  const bedValue =
    getElement("employeeBedValue");

  const statusValue =
    getElement("employeeHostelStatus");

  const cabValue =
    getElement("employeeCabValue");


  if (roomValue) {
    roomValue.textContent = room;
  }

  if (bedValue) {
    bedValue.textContent = bed;
  }

  if (statusValue) {
    statusValue.textContent = status;
  }

  if (cabValue) {
    cabValue.textContent = cab;
  }

}


/* =========================================================
   EMPLOYEE ROOM
   ========================================================= */

async function loadEmployeeRoom() {

  const box =
    getElement("employeeRoomDetails");

  if (!box) return;


  if (!currentEmployee) {

    box.textContent =
      "Employee login required.";

    return;

  }


  box.textContent =
    "Loading room details...";


  try {

    const id =
      encodeURIComponent(
        currentEmployee.employeeId ||
        currentEmployee.id
      );


    const result =
      await apiRequest(
        `/api/employee-room/${id}`
      );


    const room =
      result.room ||
      result;


    box.innerHTML = `
      <div class="employee-box">
        <strong>
          Room ${escapeHTML(room.room || room.room_no || "-")}
        </strong>

        <span>
          Block: ${escapeHTML(room.block || "-")}
        </span>

        <span>
          Bed: ${escapeHTML(String(room.bed || room.bed_no || "-"))}
        </span>

        <span>
          Status: ${escapeHTML(room.status || "Allocated")}
        </span>
      </div>
    `;


  } catch (error) {

    box.textContent =
      error.message ||
      "Room details unavailable.";

  }

}


/* =========================================================
   EMPLOYEE CAB
   ========================================================= */

async function loadEmployeeCab() {

  const box =
    getElement("employeeCabDetails");

  if (!box) return;


  if (!currentEmployee) {

    box.textContent =
      "Employee login required.";

    return;

  }


  box.innerHTML = `
    <div class="employee-box">
      <strong>Cab Service</strong>
      <span>
        Your cab QR and today's boarding details
        will appear here.
      </span>
    </div>
  `;

}


/* =========================================================
   EMPLOYEE LEAVE
   ========================================================= */

async function loadEmployeeLeave() {

  const box =
    getElement("employeeLeaveDetails");

  if (!box) return;


  box.innerHTML = `
    <div class="employee-box">
      <strong>Leave Management</strong>
      <span>
        Apply leave, view history and track approval status.
      </span>
    </div>
  `;

}


/* =========================================================
   EMPLOYEE FOOD
   ========================================================= */

async function loadEmployeeFood() {

  const box =
    getElement("employeeFoodDetails");

  if (!box) return;


  box.innerHTML = `
    <div class="employee-box">
      <strong>Today's Food</strong>
      <span>
        Breakfast • Lunch • Dinner
      </span>
    </div>
  `;

}


/* =========================================================
   HR DASHBOARD
   ========================================================= */

async function loadHRDashboard() {

  try {

    const result =
      await apiRequest("/api/hr/dashboard");


    const data =
      result.dashboard ||
      result;


    setText(
      "hrTotalEmployees",
      data.totalEmployees ?? 0
    );

    setText(
      "hrHostelIn",
      data.hostelIn ?? 0
    );

    setText(
      "hrHostelOut",
      data.hostelOut ?? 0
    );

    setText(
      "hrCabBoarded",
      data.cabBoarded ?? 0
    );

    setText(
      "hrLeaveCount",
      data.leaveCount ?? 0
    );

    setText(
      "hrVacatePending",
      data.vacatePending ?? 0
    );


  } catch {

    /*
     * Backend module will be connected next.
     */

  }

}


/* =========================================================
   HR CAB
   ========================================================= */

async function loadHRCab() {

  const box =
    getElement("hrCabDetails");

  if (!box) return;


  box.innerHTML = `
    <div class="employee-box">
      <strong>Cab Control Centre</strong>

      <span>
        5 Cabs • 20 Seats each • 100 passengers maximum/day
      </span>

      <span>
        QR scan will verify employee and automatically
        add the passenger to the selected cab.
      </span>
    </div>
  `;

}


/* =========================================================
   HR EMPLOYEES
   ========================================================= */

let hrEmployeesCache = [];


async function loadHREmployees() {

  const list =
    getElement("hrEmployeeList");

  if (!list) return;


  list.innerHTML =
    "<div class='employee-box'><span>Loading employees...</span></div>";


  try {

    const result =
      await apiRequest("/api/hr/employees");


    hrEmployeesCache =
      result.employees ||
      result ||
      [];


    renderHREmployees(
      hrEmployeesCache
    );


  } catch {

    list.innerHTML = `
      <div class="employee-box">
        <strong>Employee module ready</strong>
        <span>
          D1 employee API will be connected in the Worker stage.
        </span>
      </div>
    `;

  }

}


function renderHREmployees(employees) {

  const list =
    getElement("hrEmployeeList");

  if (!list) return;


  if (!Array.isArray(employees) ||
      employees.length === 0) {

    list.innerHTML = `
      <div class="employee-box">
        <strong>No employees found</strong>
        <span>Employee records will appear here.</span>
      </div>
    `;

    return;

  }


  list.innerHTML =
    employees.map(employee => `

      <div class="employee-box">

        <strong>
          ${escapeHTML(
            employee.name || "-"
          )}
        </strong>

        <span>
          ID:
          ${escapeHTML(
            String(
              employee.employeeId ||
              employee.employee_id ||
              employee.id ||
              "-"
            )
          )}
        </span>

        <span>
          Department:
          ${escapeHTML(
            employee.department || "-"
          )}
        </span>

        <span>
          Designation:
          ${escapeHTML(
            employee.designation || "-"
          )}
        </span>

      </div>

    `).join("");

}


function filterHREmployees() {

  const search =
    valueOf("hrEmployeeSearch")
      .toLowerCase();


  if (!search) {

    renderHREmployees(
      hrEmployeesCache
    );

    return;

  }


  const filtered =
    hrEmployeesCache.filter(employee => {

      const text = [
        employee.name,
        employee.employeeId,
        employee.employee_id,
        employee.department,
        employee.designation
      ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();


      return text.includes(search);

    });


  renderHREmployees(filtered);

}


window.filterHREmployees =
  filterHREmployees;


/* =========================================================
   HR ROOMS
   ========================================================= */

async function loadHRRooms() {

  const list =
    getElement("hrRoomList");

  if (!list) return;


  try {

    const result =
      await apiRequest("/api/hr/rooms");


    const data =
      result.rooms ||
      result;


    if (data && !Array.isArray(data)) {

      setText(
        "hrOccupiedBeds",
        data.occupiedBeds ?? 0
      );

      setText(
        "hrAvailableBeds",
        data.availableBeds ?? 0
      );

    }


  } catch {

    list.innerHTML = `
      <div class="employee-box">
        <strong>Room Management Ready</strong>
        <span>
          A1-A4 • B1-B8 • C1-C8 • D1-D4
        </span>

        <span>
          Capacity: 8 beds per room
        </span>
      </div>
    `;

  }

}


/* =========================================================
   HR LEAVE
   ========================================================= */

async function loadHRLeave() {

  const list =
    getElement("hrLeaveList");

  if (!list) return;


  list.innerHTML = `
    <div class="employee-box">
      <strong>Leave Approvals</strong>

      <span>
        Pending leave requests will appear here.
      </span>

      <span>
        HR approval will be protected by authentication
        in the final Worker implementation.
      </span>
    </div>
  `;

}


/* =========================================================
   UTILITY
   ========================================================= */

function setText(id, value) {

  const element =
    getElement(id);

  if (!element) return;

  element.textContent =
    String(value ?? "");

}


function escapeHTML(value) {

  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

}


/* =========================================================
   LOGOUT
   ========================================================= */

function logout() {

  currentEmployee = null;
  currentHR = null;

  showScreen("homeScreen");

}


window.logout = logout;


/* =========================================================
   GLOBAL EXPORTS
   =========================================================
   HTML onclick handlers need these functions available
   on window.
   ========================================================= */

window.employeeLogin = employeeLogin;
window.hrLogin = hrLogin;
window.registerEmployee = registerEmployee;
window.registerHR = registerHR;
window.loadEmployeeDashboard = loadEmployeeDashboard;
window.loadHRDashboard = loadHRDashboard;


/* =========================================================
   INITIALIZATION
   ========================================================= */

(function initializeTexmo() {

  /*
   * Make sure app starts at Home.
   */

  showScreen("homeScreen");

  console.log(
    "TEXMO HOSTEL HUB 2.0 • Frontend initialized"
  );

})();