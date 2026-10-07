const VERSION = "TEXMO-HOSTEL-HUB-3.2";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: corsHeaders()
      });
    }

    try {
      // HEALTH CHECK
      if (url.pathname === "/" && request.method === "GET") {
        return jsonResponse({
          success: true,
          message: "TEXMO Hostel Hub is online",
          version: VERSION,
          database: env.DB ? "Connected" : "Not connected"
        });
      }

      // DATABASE TEST
      if (
        url.pathname === "/api/db-test" &&
        request.method === "GET"
      ) {
        if (!env.DB) {
          return jsonResponse({
            success: false,
            message: "D1 database binding not found"
          }, 500);
        }

        const result = await env.DB
          .prepare("SELECT 1 AS test")
          .first();

        return jsonResponse({
          success: true,
          message: "D1 database connected successfully",
          result
        });
      }

      // MASTER KEY ENVIRONMENT TEST
      // Does NOT reveal the actual Master Key.
      if (
        url.pathname === "/api/master-key-test" &&
        request.method === "GET"
      ) {
        return jsonResponse({
          success: true,
          configured: !!env.TEXMO_MASTER_KEY,
          length: env.TEXMO_MASTER_KEY
            ? env.TEXMO_MASTER_KEY.length
            : 0
        });
      }

      // STAFF REGISTRATION
      if (
        url.pathname === "/api/staff/register" &&
        request.method === "POST"
      ) {
        return await staffRegister(request, env);
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


// STAFF REGISTRATION
async function staffRegister(request, env) {
  const body = await request.json();

  const {
    name,
    staff_id,
    mobile,
    password,
    confirm_password,
    role,
    master_key
  } = body;

  if (
    !name ||
    !staff_id ||
    !mobile ||
    !password ||
    !confirm_password ||
    !role ||
    !master_key
  ) {
    return jsonResponse({
      success: false,
      message: "All fields are required"
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

  if (master_key !== env.TEXMO_MASTER_KEY) {
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
    `)
      .bind(
        name,
        staff_id,
        mobile,
        password,
        role
      )
      .run();

    return jsonResponse({
      success: true,
      message: "Staff registered successfully"
    });

  } catch (error) {
    if (error.message.includes("UNIQUE")) {
      return jsonResponse({
        success: false,
        message: "Staff ID already exists"
      }, 409);
    }

    throw error;
  }
}


// CORS
function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods":
      "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization"
  };
}


// JSON RESPONSE
function jsonResponse(data, status = 200) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders()
      }
    }
  );
}
