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
    console.error("staffLoginForm not found.");
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

        const result =
          await staffLogin({
            staff_id,
            password
          });


        console.log(
          "LOGIN RESULT:",
          result
        );


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
        // SAVE SESSION
        // =================================================

        localStorage.setItem(
          "texmo_staff_session",
          JSON.stringify(result.staff)
        );


        // =================================================
        // STAFF DETAILS
        // =================================================

        const staff =
          result.staff || {};


        const name =
          staff.name || "Staff";

        const role =
          staff.role || "STAFF";

        const id =
          staff.staff_id || staff_id;


        // =================================================
        // PUT STAFF DETAILS INTO PORTAL
        // =================================================

        const nameElement =
          document.getElementById(
            "portalStaffName"
          );

        const roleElement =
          document.getElementById(
            "portalStaffRole"
          );

        const idElement =
          document.getElementById(
            "portalStaffId"
          );


        const infoNameElement =
          document.getElementById(
            "portalInfoName"
          );

        const infoRoleElement =
          document.getElementById(
            "portalInfoRole"
          );

        const infoIdElement =
          document.getElementById(
            "portalInfoStaffId"
          );


        if (nameElement) {
          nameElement.textContent = name;
        }


        if (roleElement) {
          roleElement.textContent = role;
        }


        if (idElement) {
          idElement.textContent = id;
        }


        if (infoNameElement) {
          infoNameElement.textContent = name;
        }


        if (infoRoleElement) {
          infoRoleElement.textContent = role;
        }


        if (infoIdElement) {
          infoIdElement.textContent = id;
        }


        // =================================================
        // OPEN STAFF PORTAL
        // =================================================

        const portal =
          document.getElementById(
            "staffPortalScreen"
          );


        if (!portal) {

          alert(
            "Staff Portal section not found in Index.html."
          );

          console.error(
            "staffPortalScreen NOT FOUND"
          );

          return;
        }


        // Hide every screen

        document
          .querySelectorAll(".screen")
          .forEach(function (screen) {

            screen.classList.remove("active");

          });


        // Show portal

        portal.classList.add("active");


        window.scrollTo(0, 0);


        console.log(
          "STAFF PORTAL OPENED SUCCESSFULLY"
        );

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
  function () {

    console.log(
      "TEXMO Hostel Hub app.js loaded successfully."
    );

    setupStaffLogin();

  }
);
