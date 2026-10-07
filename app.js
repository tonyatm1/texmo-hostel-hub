const API_BASE = "";

async function staffRegister(data) {
  const response = await fetch(`${API_BASE}/api/staff/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(data)
  });

  return await response.json();
}

function showMessage(type) {
  alert(type + " will be connected in the next step.");
}

document.addEventListener("DOMContentLoaded", () => {
  console.log("TEXMO Hostel Hub app.js loaded successfully.");
});
