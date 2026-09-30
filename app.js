const API = "";

let currentEmployee = null;
let scannerStream = null;
let scannerTimer = null;

function showScreen(id) {
  document.querySelectorAll("main > section").forEach(section => {
    section.classList.add("hidden");
  });

  const screen = document.getElementById(id);
  if (screen) screen.classList.remove("hidden");
}

function message(id, text, type = "success") {
  const box = document.getElementById(id);

  if (!box) return;

  box.innerHTML = `
    <div class="${type === "error" ? "error-box" : "success-box"}">
      ${escapeHtml(text)}
    </div>
  `;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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


// =========================
// EMPLOYEE
// =========================

async function employeeLogin() {
  const employeeId =
    document.getElementById("employeeLoginId").value.trim();

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
  } catch (error) {
    message(
      "employeeLoginMessage",
      error.message,
      "error"
    );
  }
}


async function registerEmployee() {
  const data = {
    employee_id:
      document.getElementById("regEmployeeId").value.trim(),

    name:
      document.getElementById("regName").value.trim(),

    department:
      document.getElementById("regDepartment").value.trim(),

    designation:
      document.getElementById("regDesignation").value.trim(),

    phone:
      document.getElementById("regPhone").value.trim(),

    shift:
      document.getElementById("regShift").value,

    room:
      document.getElementById("regRoom").value.trim()
  };

  if (!data.employee_id || !data.name || !data.department) {
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
      document.getElementById("employeeLoginId").value =
        result.employee_id;

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

  } catch (error) {
    message(
      "employeeLoginMessage",
      error.message,
      "error"
    );

    showScreen("employeeLogin");
  }
}


function renderEmployee() {
  if (!currentEmployee) return;

  const employee = currentEmployee;

  document.getElementById("employeeDetails").innerHTML = `
    <div class="employee-card">
      <strong>${escapeHtml(employee.name)}</strong>

      <div class="small">
        Employee ID: ${escapeHtml(employee.employee_id)}<br>
        Department: ${escapeHtml(employee.department)}<br>
        Designation: ${escapeHtml(employee.designation || "-")}<br>
        Phone: ${escapeHtml(employee.phone || "-")}<br>
        Shift: ${escapeHtml(employee.shift || "-")}<br>
        Room: ${escapeHtml(employee.room || "-")}<br>
        Status:
        <span class="badge">
          ${escapeHtml(employee.status)}
        </span>
      </div>
    </div>
  `;

  createEmployeeQR(employee.qr_token);
}


function createEmployeeQR(token) {
  const box = document.getElementById("qrcode");

  box.innerHTML = "";

  if (!token) {
    box.innerHTML =
      `<p class="small">QR not available</p>`;
    return;
  }

  if (typeof QRCode === "undefined") {
    box.innerHTML =
      `<p class="small">QR library loading...</p>`;
    return;
  }

  new QRCode(box, {
    text: token,
    width: 220,
    height: 220,
    correctLevel: QRCode.CorrectLevel.M
  });
}


// =========================
// HR
// =========================

async function hrLogin() {
  const username =
    document.getElementById("hrUsername").value.trim();

  const password =
    document.getElementById("hrPassword").value;

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

    loadDashboard();

  } catch (error) {
    message(
      "hrLoginMessage",
      error.message,
      "error"
    );
  }
}


async function loadDashboard() {
  try {
    const data =
      await api("/api/cab/dashboard");

    document.getElementById("totalBoarded").textContent =
      data.total_boarded || 0;

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

    document.getElementById("totalEmployees").textContent =
      employees.employees?.length || 0;

  } catch (error) {
    console.error(error);
  }
}


// =========================
// DASHBOARD STATS
// =========================

function renderDepartmentStats(items) {
  const box =
    document.getElementById("departmentStats");

  if (!items.length) {
    box.innerHTML =
      `<p class="small">No cab entries today.</p>`;
    return;
  }

  box.innerHTML = items.map(item => `
    <div class="employee-card">
      <strong>${escapeHtml(item.department)}</strong>
      <span class="small">
        Employees boarded: ${escapeHtml(item.count)}
      </span>
    </div>
  `).join("");
}


function renderCabStats(items) {
  const box =
    document.getElementById("cabStats");

  if (!items.length) {
    box.innerHTML =
      `<p class="small">No cab entries today.</p>`;
    return;
  }

  box.innerHTML = items.map(item => `
    <div class="employee-card">
      <strong>
        ${escapeHtml(item.cab_no || "Cab")}
      </strong>

      <span class="small">
        Route: ${escapeHtml(item.route || "-")}<br>
        Employees: ${escapeHtml(item.count)}
      </span>
    </div>
  `).join("");
}


function renderShiftStats(items) {
  const box =
    document.getElementById("shiftStats");

  if (!items.length) {
    box.innerHTML =
      `<p class="small">No shift entries today.</p>`;
    return;
  }

  box.innerHTML = items.map(item => `
    <div class="employee-card">
      <strong>${escapeHtml(item.shift || "Not assigned")}</strong>
      <span class="small">
        Employees: ${escapeHtml(item.count)}
      </span>
    </div>
  `).join("");
}


// =========================
// QR SCANNER
// =========================

async function startScanner() {
  const video =
    document.getElementById("scannerVideo");

  const messageBox =
    document.getElementById("scanMessage");

  try {
    if (!("BarcodeDetector" in window)) {
      message(
        "scanMessage",
        "QR scanner is not supported in this browser. Use Chrome on Android.",
        "error"
      );
      return;
    }

    const detector =
      new BarcodeDetector({
        formats: ["qr_code"]
      });

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

    video.classList.remove("hidden");

    document
      .getElementById("stopScannerBtn")
      .classList.remove("hidden");

    await video.play();

    messageBox.innerHTML = `
      <div class="success-box">
        Scanner ready. Show employee QR.
      </div>
    `;

    scanFrame(detector);

  } catch (error) {
    console.error(error);

    message(
      "scanMessage",
      "Camera permission required.",
      "error"
    );
  }
}


async function scanFrame(detector) {
  if (!scannerStream) return;

  const video =
    document.getElementById("scannerVideo");

  try {
    const codes =
      await detector.detect(video);

    if (codes.length > 0) {
      const qrToken =
        codes[0].rawValue;

      await processCabScan(qrToken);

      stopScanner();

      return;
    }
  } catch (error) {
    console.error(error);
  }

  scannerTimer =
    requestAnimationFrame(() =>
      scanFrame(detector)
    );
}


async function processCabScan(qrToken) {
  const cabNo =
    document.getElementById("scanCabNo").value.trim();

  const route =
    document.getElementById("scanRoute").value.trim();

  if (!cabNo) {
    message(
      "scanMessage",
      "Enter Cab Number before scanning.",
      "error"
    );
    return;
  }

  try {
    const data =
      await api(
        "/api/cab/scan",
        {
          method: "POST",
          body: JSON.stringify({
            qr_token: qrToken,
            cab_no: cabNo,
            route
          })
        }
      );

    const e = data.entry;

    document.getElementById("scanMessage").innerHTML = `
      <div class="success-box">
        <strong>✓ CAB ENTRY SUCCESS</strong><br><br>
        Employee: ${escapeHtml(e.name)}<br>
        ID: ${escapeHtml(e.employee_id)}<br>
        Department: ${escapeHtml(e.department)}<br>
        Shift: ${escapeHtml(e.shift || "-")}<br>
        Cab: ${escapeHtml(e.cab_no)}<br>
        Date: ${escapeHtml(e.date)}<br>
        Time: ${escapeHtml(e.time)}
      </div>
    `;

    loadDashboard();

  } catch (error) {
    message(
      "scanMessage",
      error.message,
      "error"
    );
  }
}


function stopScanner() {
  if (scannerTimer) {
    cancelAnimationFrame(scannerTimer);
    scannerTimer = null;
  }

  if (scannerStream) {
    scannerStream
      .getTracks()
      .forEach(track => track.stop());

    scannerStream = null;
  }

  const video =
    document.getElementById("scannerVideo");

  if (video) {
    video.pause();
    video.srcObject = null;
    video.classList.add("hidden");
  }

  const stopButton =
    document.getElementById("stopScannerBtn");

  if (stopButton) {
    stopButton.classList.add("hidden");
  }
}


// =========================
// EMPLOYEE TABLE
// =========================

async function loadEmployees() {
  try {
    const data =
      await api("/api/employees");

    const employees =
      data.employees || [];

    const box =
      document.getElementById("employeeTable");

    if (!employees.length) {
      box.innerHTML =
        `<p class="small">No employees found.</p>`;
      return;
    }

    box.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Name</th>
              <th>Department</th>
              <th>Shift</th>
              <th>Room</th>
              <th>Status</th>
            </tr>
          </thead>

          <tbody>
            ${employees.map(e => `
              <tr>
                <td>${escapeHtml(e.employee_id)}</td>
                <td>${escapeHtml(e.name)}</td>
                <td>${escapeHtml(e.department)}</td>
                <td>${escapeHtml(e.shift || "-")}</td>
                <td>${escapeHtml(e.room || "-")}</td>
                <td>${escapeHtml(e.status)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;

  } catch (error) {
    message(
      "employeeTable",
      error.message,
      "error"
    );
  }
}


// =========================
// EXPORT
// =========================

function downloadCabExcel() {
  window.open(
    API + "/api/cab/export",
    "_blank"
  );
}


// =========================
// LOGOUT
// =========================

function logout() {
  stopScanner();

  currentEmployee = null;

  localStorage.removeItem(
    "texmo_employee_id"
  );

  localStorage.removeItem(
    "texmo_hr_login"
  );

  showScreen("homeScreen");
}


// =========================
// AUTO LOGIN
// =========================

window.addEventListener("DOMContentLoaded", () => {

  const employeeId =
    localStorage.getItem("texmo_employee_id");

  const hr =
    localStorage.getItem("texmo_hr_login");

  if (employeeId) {
    loadEmployee();
  } else if (hr === "true") {
    showScreen("hrPortal");
    loadDashboard();
  } else {
    showScreen("homeScreen");
  }

});
