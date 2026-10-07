const API_BASE = "";


// =========================================================
// STAFF REGISTRATION
// =========================================================

async function staffRegister(data) {

  const response = await fetch(
    `${API_BASE}/api/staff/register`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(data)
    }
  );

  return await response.json();
}


// =========================================================
// STAFF LOGIN
// =========================================================

async function staffLogin(data) {

  const response = await fetch(
    `${API_BASE}/api/staff/login`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(data)
    }
  );

  return await response.json();
}


// =========================================================
// STAFF LOGIN FORM HANDLER
// =========================================================

function setupStaffLogin() {

  const form =
    document.getElementById("staffLoginForm");

  if (!form) {
    return;
  }


  form.addEventListener(
    "submit",
    async function (event) {

      event.preventDefault();


      const staffIdInput =
        document.getElementById("staffLoginId");

      const passwordInput =
        document.getElementById("staffLoginPassword");


      if (!staffIdInput || !passwordInput) {

        alert(
          "Staff login fields not found."
        );

        return;
      }


      const staff_id =
        staffIdInput.value.trim();

      const password =
        passwordInput.value;


      if (!staff_id || !password) {

        alert(
          "Please enter Staff ID and Password."
        );

        return;
      }


      try {

        // =================================================
        // LOGIN API
        // =================================================

        const result =
          await staffLogin({
            staff_id,
            password
          });


        // =================================================
        // LOGIN FAILED
        // =================================================

        if (!result.success) {

          alert(
            result.message ||
            "Staff login failed."
          );

          return;
        }


        // =================================================
        // SAVE STAFF SESSION
        // =================================================

        localStorage.setItem(
          "texmo_staff_session",
          JSON.stringify(result.staff)
        );


        console.log(
          "Staff login successful:",
          result.staff
        );


        // =================================================
        // LOAD STAFF DETAILS INTO PORTAL
        // =================================================

        const portalStaffName =
          document.getElementById(
            "portalStaffName"
          );

        const portalStaffRole =
          document.getElementById(
            "portalStaffRole"
          );

        const portalStaffId =
          document.getElementById(
            "portalStaffId"
          );


        const portalInfoName =
          document.getElementById(
            "portalInfoName"
          );

        const portalInfoRole =
          document.getElementById(
            "portalInfoRole"
          );

        const portalInfoStaffId =
          document.getElementById(
            "portalInfoStaffId"
          );


        if (portalStaffName) {

          portalStaffName.textContent =
            result.staff.name || "Staff";

        }


        if (portalStaffRole) {

          portalStaffRole.textContent =
            result.staff.role || "STAFF";

        }


        if (portalStaffId) {

          portalStaffId.textContent =
            result.staff.staff_id || "-";

        }


        if (portalInfoName) {

          portalInfoName.textContent =
            result.staff.name || "-";

        }


        if (portalInfoRole) {

          portalInfoRole.textContent =
            result.staff.role || "-";

        }


        if (portalInfoStaffId) {

          portalInfoStaffId.textContent =
            result.staff.staff_id || "-";

        }


        // =================================================
        // GO TO STAFF PORTAL
        // =================================================

        showScreen("staffPortalScreen");


      } catch (error) {

        console.error(
          "Staff login error:",
          error
        );


        alert(
          "Unable to connect to TEXMO server. Please try again."
        );

      }

    }
  );

}


// =========================================================
// PAGE LOAD
// =========================================================

document.addEventListener(
  "DOMContentLoaded",
  () => {

    console.log(
      "TEXMO Hostel Hub app.js loaded successfully."
    );


    setupStaffLogin();

  }
);
