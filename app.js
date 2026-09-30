const API = "";

let currentEmployee = null;
let scannerStream = null;
let scannerTimer = null;
let scannerDetector = null;
let jsQRLoaded = false;
let scannerBusy = false;


// =========================
// COMMON
// =========================

function showScreen(id) {
  document.querySelectorAll("main > section").forEach(section => {
    section.classList.add("hidden");
  });

  const screen = document.getElementById(id);

  if (screen) {
    screen.classList.remove("hidden");
    window.scrollTo({
      top: 0,
      behavior: "smooth"
    });
  }
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
    throw new Error(
      data.error || "Request failed"
    );
  }

  return data;
}


// =========================
// EMPLOYEE LOGIN
// =========================

async function employeeLogin() {

  const employeeId =
    document
      .getElementById("employeeLoginId")
      .value
      .trim();

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


// =========================
// EMPLOYEE REGISTRATION
// =========================

async function registerEmployee() {

  const data = {

    employee_id:
      document
        .getElementById("regEmployeeId")
        .value
        .trim(),

    name:
      document
        .getElementById("regName")
        .value
        .trim(),

    department:
      document
        .getElementById("regDepartment")
        .value
        .trim(),

    designation:
      document
        .getElementById("regDesignation")
        .value
        .trim(),

    phone:
      document
        .getElementById("regPhone")
        .value
        .trim(),

    shift:
      document
        .getElementById("regShift")
        .value,

    room:
      document
        .getElementById("regRoom")
        .value
        .trim()
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
        document.getElementById("employeeLoginId");

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


// =========================
// LOAD EMPLOYEE
// =========================

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
      `/api/employees/${encodeURIComponent(employeeId)}`
    );

    currentEmployee =
      data.employee;

    renderEmployee();

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


// =========================
// EMPLOYEE PROFILE
// =========================

function renderEmployee() {

  if (!currentEmployee) return;

  const employee =
    currentEmployee;


  const box =
    document.getElementById(
      "employeeDetails"
    );

  if (!box) return;


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
          ${escapeHtml(employee.employee_id)}
        </span>
      </div>


      <div class="profile-row">
        <span class="profile-label">
          Department
        </span>

        <span class="profile-value">
          ${escapeHtml(employee.department)}
        </span>
      </div>


      <div class="profile-row">
        <span class="profile-label">
          Designation
        </span>

        <span class="profile-value">
          ${escapeHtml(employee.designation || "-")}
        </span>
      </div>


      <div class="profile-row">
        <span class="profile-label">
          Phone
        </span>

        <span class="profile-value">
          ${escapeHtml(employee.phone || "-")}
        </span>
      </div>


      <div class="profile-row">
        <span class="profile-label">
          Shift
        </span>

        <span class="profile-value">
          ${escapeHtml(employee.shift || "-")}
        </span>
      </div>


      <div class="profile-row">
        <span class="profile-label">
          Room
        </span>

        <span class="profile-value">
          ${escapeHtml(employee.room || "-")}
        </span>
      </div>


      <div class="profile-row">
        <span class="profile-label">
          Status
        </span>

        <span class="profile-value">
          <span class="badge">
            ${escapeHtml(employee.status)}
          </span>
        </span>
      </div>

    </div>
  `;


  createEmployeeQR(
    employee.qr_token
  );
}


// =========================
// EMPLOYEE QR
// =========================

function createEmployeeQR(token) {

  const box =
    document.getElementById(
      "qrcode"
    );


  if (!box) return;


  box.innerHTML = "";


  if (!token) {

    box.innerHTML =
      `<p class="small">QR not available</p>`;

    return;
  }


  if (
    typeof QRCode ===
    "undefined"
  ) {

    box.innerHTML =
      `<p class="small">
        QR library loading...
      </p>`;

    setTimeout(() => {

      if (
        typeof QRCode !==
        "undefined"
      ) {
        createEmployeeQR(token);
      }

    }, 800);

    return;
  }


  new QRCode(box, {

    text: token,

    width: 220,

    height: 220,

    correctLevel:
      QRCode.CorrectLevel.M
  });
}


// =========================
// HR LOGIN
// =========================

async function hrLogin() {

  const username =
    document
      .getElementById("hrUsername")
      .value
      .trim();


  const password =
    document
      .getElementById("hrPassword")
      .value;


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


    showScreen(
      "hrPortal"
    );


    loadDashboard();


  } catch (error) {

    message(
      "hrLoginMessage",
      error.message,
      "error"
    );
  }
}


// =========================
// HR DASHBOARD
// =========================

async function loadDashboard() {

  try {

    const data =
      await api(
        "/api/cab/dashboard"
      );


    const totalBoarded =
      document.getElementById(
        "totalBoarded"
      );

    if (totalBoarded) {

      totalBoarded.textContent =
        data.total_boarded || 0;
    }


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
      await api(
        "/api/employees"
      );


    const totalEmployees =
      document.getElementById(
        "totalEmployees"
      );


    if (totalEmployees) {

      totalEmployees.textContent =
        employees.employees?.length || 0;
    }


  } catch (error) {

    console.error(
      "Dashboard error:",
      error
    );
  }
}


// =========================
// DEPARTMENT STATS
// =========================

function renderDepartmentStats(
  items
) {

  const box =
    document.getElementById(
      "departmentStats"
    );


  if (!box) return;


  if (!items.length) {

    box.innerHTML =
      `<p class="small">
        No cab entries today.
      </p>`;

    return;
  }


  box.innerHTML =
    items.map(item => `

      <div class="stat-row">

        <div>

          <div class="stat-row-name">
            ${escapeHtml(
              item.department ||
              "Not assigned"
            )}
          </div>

          <div class="small">
            Employees boarded
          </div>

        </div>

        <div class="stat-row-count">
          ${escapeHtml(item.count)}
        </div>

      </div>

    `).join("");
}


// =========================
// CAB STATS
// =========================

function renderCabStats(
  items
) {

  const box =
    document.getElementById(
      "cabStats"
    );


  if (!box) return;


  if (!items.length) {

    box.innerHTML =
      `<p class="small">
        No cab entries today.
      </p>`;

    return;
  }


  box.innerHTML =
    items.map(item => `

      <div class="stat-row">

        <div>

          <div class="stat-row-name">
            🚐 ${escapeHtml(
              item.cab_no ||
              "Cab"
            )}
          </div>

          <div class="small">
            Route:
            ${escapeHtml(
              item.route ||
              "-"
            )}
          </div>

        </div>

        <div class="stat-row-count">
          ${escapeHtml(item.count)}
        </div>

      </div>

    `).join("");
}


// =========================
// SHIFT STATS
// =========================

function renderShiftStats(
  items
) {

  const box =
    document.getElementById(
      "shiftStats"
    );


  if (!box) return;


  if (!items.length) {

    box.innerHTML =
      `<p class="small">
        No shift entries today.
      </p>`;

    return;
  }


  box.innerHTML =
    items.map(item => `

      <div class="stat-row">

        <div>

          <div class="stat-row-name">
            🕐 ${escapeHtml(
              item.shift ||
              "Not assigned"
            )}
          </div>

          <div class="small">
            Employees boarded
          </div>

        </div>

        <div class="stat-row-count">
          ${escapeHtml(item.count)}
        </div>

      </div>

    `).join("");
}


// =========================
// QR SCANNER
// =========================

async function startScanner() {

  const video =
    document.getElementById(
      "scannerVideo"
    );


  const messageBox =
    document.getElementById(
      "scanMessage"
    );


  if (!video) return;


  if (
    !navigator.mediaDevices ||
    !navigator.mediaDevices.getUserMedia
  ) {

    message(
      "scanMessage",
      "Camera is not available in this browser.",
      "error"
    );

    return;
  }


  try {

    stopScanner();


    scannerBusy = false;


    scannerStream =
      await navigator.mediaDevices
        .getUserMedia({

          video: {
            facingMode: {
              ideal: "environment"
            },

            width: {
              ideal: 1280
            },

            height: {
              ideal: 720
            }
          },

          audio: false

        });


    video.srcObject =
      scannerStream;


    video.classList.remove(
      "hidden"
    );


    const stopButton =
      document.getElementById(
        "stopScannerBtn"
      );


    if (stopButton) {

      stopButton.classList.remove(
        "hidden"
      );
    }


    await video.play();


    messageBox.innerHTML = `

      <div class="success-box">

        <strong>
          📷 Scanner Ready
        </strong>

        <br>

        Show the employee QR inside
        the camera frame.

      </div>

    `;


    if (
      "BarcodeDetector" in window
    ) {

      try {

        scannerDetector =
          new BarcodeDetector({
            formats: ["qr_code"]
          });


        scanFrame(
          scannerDetector
        );

        return;

      } catch (error) {

        console.log(
          "BarcodeDetector unavailable:",
          error
        );
      }
    }


    await loadJsQR();


    scanFrameWithJsQR();


  } catch (error) {

    console.error(
      "Scanner error:",
      error
    );


    stopScanner();


    message(
      "scanMessage",
      "Camera permission required. Please allow camera access and try again.",
      "error"
    );
  }
}


// =========================
// LOAD JSQR FALLBACK
// =========================

function loadJsQR() {

  return new Promise(
    (resolve, reject) => {

      if (
        typeof jsQR !==
        "undefined"
      ) {

        jsQRLoaded = true;

        resolve();

        return;
      }


      const existing =
        document.querySelector(
          'script[data-jsqr="true"]'
        );


      if (existing) {

        existing.addEventListener(
          "load",
          () => {
            jsQRLoaded = true;
            resolve();
          }
        );

        existing.addEventListener(
          "error",
          reject
        );

        return;
      }


      const script =
        document.createElement(
          "script"
        );


      script.src =
        "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js";


      script.async = true;


      script.dataset.jsqr =
        "true";


      script.onload = () => {

        jsQRLoaded = true;

        resolve();
      };


      script.onerror = () => {

        reject(
          new Error(
            "QR scanner library could not load"
          )
        );
      };


      document.head.appendChild(
        script
      );
    }
  );
}


// =========================
// BARCODE DETECTOR SCAN
// =========================

async function scanFrame(
  detector
) {

  if (!scannerStream) {
    return;
  }


  const video =
    document.getElementById(
      "scannerVideo"
    );


  try {

    if (
      video.readyState >= 2
    ) {

      const codes =
        await detector.detect(
          video
        );


      if (
        codes &&
        codes.length > 0 &&
        codes[0].rawValue
      ) {

        await handleDetectedQR(
          codes[0].rawValue
        );

        return;
      }
    }

  } catch (error) {

    console.error(
      "Barcode scan error:",
      error
    );
  }


  scannerTimer =
    requestAnimationFrame(
      () =>
        scanFrame(detector)
    );
}


// =========================
// JSQR SCAN
// =========================

async function scanFrameWithJsQR() {

  if (!scannerStream) {
    return;
  }


  const video =
    document.getElementById(
      "scannerVideo"
    );


  if (
    !jsQRLoaded ||
    typeof jsQR ===
      "undefined"
  ) {

    scannerTimer =
      requestAnimationFrame(
        scanFrameWithJsQR
      );

    return;
  }


  try {

    if (
      video.readyState < 2
    ) {

      scannerTimer =
        requestAnimationFrame(
          scanFrameWithJsQR
        );

      return;
    }


    const canvas =
      document.createElement(
        "canvas"
      );


    const width =
      video.videoWidth ||
      640;


    const height =
      video.videoHeight ||
      480;


    canvas.width =
      width;


    canvas.height =
      height;


    const context =
      canvas.getContext(
        "2d",
        {
          willReadFrequently: true
        }
      );


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
      jsQR(
        imageData.data,
        imageData.width,
        imageData.height,
        {
          inversionAttempts:
            "attemptBoth"
        }
      );


    if (
      code &&
      code.data
    ) {

      await handleDetectedQR(
        code.data
      );

      return;
    }

  } catch (error) {

    console.error(
      "jsQR scan error:",
      error
    );
  }


  scannerTimer =
    requestAnimationFrame(
      scanFrameWithJsQR
    );
}


// =========================
// QR DETECTED
// =========================

async function handleDetectedQR(
  qrToken
) {

  if (
    scannerBusy ||
    !scannerStream
  ) {

    return;
  }


  scannerBusy = true;


  try {

    await processCabScan(
      qrToken
    );

  } finally {

    stopScanner();
  }
}


// =========================
// PROCESS CAB ENTRY
// =========================

async function processCabScan(
  qrToken
) {

  const cabNo =
    document
      .getElementById(
        "scanCabNo"
      )
      .value
      .trim();


  const route =
    document
      .getElementById(
        "scanRoute"
      )
      .value
      .trim();


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

          body:
            JSON.stringify({
              qr_token: qrToken,
              cab_no: cabNo,
              route: route
            })
        }
      );


    const e =
      data.entry;


    document.getElementById(
      "scanMessage"
    ).innerHTML = `

      <div class="success-box">

        <strong>
          ✓ CAB ENTRY SUCCESS
        </strong>

        <br><br>

        <strong>
          ${escapeHtml(e.name)}
        </strong>

        <br>

        Employee ID:
        ${escapeHtml(e.employee_id)}

        <br>

        Department:
        ${escapeHtml(e.department)}

        <br>

        Shift:
        ${escapeHtml(
          e.shift || "-"
        )}

        <br>

        Cab:
        ${escapeHtml(e.cab_no)}

        <br>

        Route:
        ${escapeHtml(
          e.route || "-"
        )}

        <br>

        Date:
        ${escapeHtml(e.date)}

        <br>

        Time:
        ${escapeHtml(e.time)}

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


// =========================
// STOP SCANNER
// =========================

function stopScanner() {

  if (scannerTimer) {

    cancelAnimationFrame(
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


  scannerDetector = null;

  scannerBusy = false;


  const video =
    document.getElementById(
      "scannerVideo"
    );


  if (video) {

    video.pause();

    video.srcObject = null;

    video.classList.add(
      "hidden"
    );
  }


  const stopButton =
    document.getElementById(
      "stopScannerBtn"
    );


  if (stopButton) {

    stopButton.classList.add(
      "hidden"
    );
  }
}


// =========================
// EMPLOYEE TABLE
// =========================

async function loadEmployees() {

  try {

    const data =
      await api(
        "/api/employees"
      );


    const employees =
      data.employees || [];


    const box =
      document.getElementById(
        "employeeTable"
      );


    if (!box) return;


    if (!employees.length) {

      box.innerHTML =
        `<p class="small">
          No employees found.
        </p>`;

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

            ${employees.map(
              e => `

              <tr>

                <td>
                  ${escapeHtml(
                    e.employee_id
                  )}
                </td>

                <td>
                  ${escapeHtml(
                    e.name
                  )}
                </td>

                <td>
                  ${escapeHtml(
                    e.department
                  )}
                </td>

                <td>
                  ${escapeHtml(
                    e.shift || "-"
                  )}
                </td>

                <td>
                  ${escapeHtml(
                    e.room || "-"
                  )}
                </td>

                <td>
                  ${escapeHtml(
                    e.status
                  )}
                </td>

              </tr>

            `
            ).join("")}

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
    API +
    "/api/cab/export",
    "_blank"
  );
}


// =========================
// LOGOUT
// =========================

function logout() {

  stopScanner();


  currentEmployee =
    null;


  localStorage.removeItem(
    "texmo_employee_id"
  );


  localStorage.removeItem(
    "texmo_hr_login"
  );


  showScreen(
    "homeScreen"
  );
}


// =========================
// AUTO LOGIN
// =========================

window.addEventListener(
  "DOMContentLoaded",
  () => {

    const employeeId =
      localStorage.getItem(
        "texmo_employee_id"
      );


    const hr =
      localStorage.getItem(
        "texmo_hr_login"
      );


    if (employeeId) {

      loadEmployee();

    } else if (
      hr === "true"
    ) {

      showScreen(
        "hrPortal"
      );

      loadDashboard();

    } else {

      showScreen(
        "homeScreen"
      );
    }

  }
);
