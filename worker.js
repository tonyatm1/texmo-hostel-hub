
const VERSION = "TEXMO-HOSTEL-HUB-4.0";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: corsHeaders()
      });
    }

    try {
      if (!env.DB) {
        return jsonResponse({
          success: false,
          message: "Database binding DB is missing"
        }, 500);
      }

      if (url.pathname === "/" && request.method === "GET") {
        return jsonResponse({
          success: true,
          message: "TEXMO Hostel Hub is online",
          version: VERSION,
          database: "Connected"
        });
      }

      if (url.pathname === "/api/db-test" && request.method === "GET") {
        const result = await env.DB
          .prepare("SELECT 1 AS test")
          .first();

        return jsonResponse({
          success: true,
          message: "Database connected",
          result
        });
      }

      if (url.pathname === "/api/staff/register" && request.method === "POST") {
        return await staffRegister(request, env);
      }

      if (url.pathname === "/api/staff/login" && request.method === "POST") {
        return await staffLogin(request, env);
      }

      return jsonResponse({
        success: false,
        message: "API route not found"
      }, 404);

    } catch (error) {
      return jsonResponse({
        success: false,
        message: "Server error",
        error: error.message
      }, 500);
    }
  }
};

async function staffRegister(request, env) {
  const body = await request.json();

  const name = String(body.name || "").trim();
  const staff_id = String(body.staff_id || "").trim();
  const mobile = String(body.mobile || "").trim();
  const password = String(body.password || "");
  const confirm_password = String(body.confirm_password || "");
  const role = String(body.role || "").toUpperCase();
  const master_key = String(body.master_key || "");

  if (!name || !staff_id || !mobile || !password ||
      !confirm_password || !role || !master_key) {
    return jsonResponse({
      success: false,
      message: "All fields are required"
    }, 400);
  }

  if (password.length < 8) {
    return jsonResponse({
      success: false,
      message: "Password must contain at least 8 characters"
    }, 400);
  }

  if (password !== confirm_password) {
    return jsonResponse({
      success: false,
      message: "Passwords do not match"
    }, 400);
  }

  if (!["HR", "MANAGEMENT", "ADMIN"].includes(role)) {
    return jsonResponse({
      success: false,
      message: "Invalid staff role"
    }, 400);
  }

  if (!env.TEXMO_MASTER_KEY ||
      master_key !== env.TEXMO_MASTER_KEY) {
    return jsonResponse({
      success: false,
      message: "Invalid Master Key"
    }, 401);
  }

  try {
    await env.DB.prepare(`
      INSERT INTO staff
        (name, staff_id, mobile, password, role)
      VALUES (?, ?, ?, ?, ?)
    `).bind(
      name, staff_id, mobile, password, role
    ).run();

    return jsonResponse({
      success: true,
      message: "Staff registered successfully"
    }, 201);

  } catch (error) {
    if (String(error.message).includes("UNIQUE")) {
      return jsonResponse({
        success: false,
        message: "Staff ID already exists"
      }, 409);
    }
    throw error;
  }
}

async function staffLogin(request, env) {
  const body = await request.json();
  const staff_id = String(body.staff_id || "").trim();
  const password = String(body.password || "");

  if (!staff_id || !password) {
    return jsonResponse({
      success: false,
      message: "Staff ID and password are required"
    }, 400);
  }

  const staff = await env.DB.prepare(`
    SELECT id, name, staff_id, mobile, role, status
    FROM staff
    WHERE staff_id = ?
      AND password = ?
      AND status = 'ACTIVE'
    LIMIT 1
  `).bind(staff_id, password).first();

  if (!staff) {
    return jsonResponse({
      success: false,
      message: "Invalid Staff ID or password"
    }, 401);
  }

  return jsonResponse({
    success: true,
    message: "Staff login successful",
    staff
  });
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods":
      "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization"
  };
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders()
    }
  });
}
