const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
};

const HR_USER = "hr";
const HR_PASS = "hr@123";

async function initDB(db) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS employees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      department TEXT NOT NULL,
      designation TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      shift TEXT DEFAULT '',
      room TEXT DEFAULT '',
      qr_token TEXT UNIQUE NOT NULL,
      status TEXT DEFAULT 'ACTIVE',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`),

    db.prepare(`CREATE TABLE IF NOT EXISTS cab_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id TEXT NOT NULL,
      employee_name TEXT NOT NULL,
      department TEXT NOT NULL,
      shift TEXT DEFAULT '',
      cab_no TEXT DEFAULT '',
      route TEXT DEFAULT '',
      entry_date TEXT NOT NULL,
      entry_time TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`),

    db.prepare(`CREATE TABLE IF NOT EXISTS rooms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_no TEXT UNIQUE NOT NULL,
      block TEXT DEFAULT '',
      capacity INTEGER DEFAULT 0,
      occupied INTEGER DEFAULT 0
    )`),

    db.prepare(`CREATE TABLE IF NOT EXISTS leave_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id TEXT NOT NULL,
      from_date TEXT NOT NULL,
      to_date TEXT NOT NULL,
      reason TEXT DEFAULT '',
      status TEXT DEFAULT 'PENDING',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`)
  ]);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...CORS,
      "Content-Type": "application/json"
    }
  });
}

async function body(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function token() {
  return crypto.randomUUID();
}

function nowIndia() {
  const d = new Date();

  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(d);

  const time = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(d);

  return { date, time };
}

async function csvResponse(rows) {
  if (!rows.length) {
    return new Response("No records", {
      headers: {
        ...CORS,
        "Content-Type": "text/csv"
      }
    });
  }

  const headers = Object.keys(rows[0]);

  const escape = value => {
    const v = value == null ? "" : String(value);
    return `"${v.replaceAll('"', '""')}"`;
  };

  const csv = [
    headers.map(escape).join(","),
    ...rows.map(row => headers.map(h => escape(row[h])).join(","))
  ].join("\n");

  return new Response(csv, {
    headers: {
      ...CORS,
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=texmo-cab-entries.csv"
    }
  });
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS });
    }

    if (!env.DB) {
      return json({
        success: false,
        error: "D1 database binding DB is missing"
      }, 500);
    }

    try {
      await initDB(env.DB);

      const url = new URL(request.url);
      const path = url.pathname;

      // HOME
      if (path === "/" && request.method === "GET") {
        return json({
          success: true,
          app: "TEXMO Hostel Hub",
          status: "ONLINE",
          version: "1.0"
        });
      }

      // HR LOGIN
      if (path === "/api/hr/login" && request.method === "POST") {
        const data = await body(request);

        if (
          data.username === HR_USER &&
          data.password === HR_PASS
        ) {
          return json({
            success: true,
            role: "HR",
            message: "HR login successful"
          });
        }

        return json({
          success: false,
          error: "Invalid HR login"
        }, 401);
      }

      // EMPLOYEE REGISTRATION
      if (path === "/api/employees/register" && request.method === "POST") {
        const data = await body(request);

        if (
          !data.employee_id ||
          !data.name ||
          !data.department
        ) {
          return json({
            success: false,
            error: "Employee ID, name and department are required"
          }, 400);
        }

        const qrToken = token();

        try {
          await env.DB.prepare(`
            INSERT INTO employees
            (employee_id, name, department, designation, phone, shift, room, qr_token)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(
            data.employee_id,
            data.name,
            data.department,
            data.designation || "",
            data.phone || "",
            data.shift || "",
            data.room || "",
            qrToken
          ).run();

          return json({
            success: true,
            message: "Employee registered",
            employee_id: data.employee_id,
            qr_token: qrToken
          });
        } catch (e) {
          return json({
            success: false,
            error: "Employee ID already exists"
          }, 409);
        }
      }

      // GET EMPLOYEE
      if (
        path.startsWith("/api/employees/") &&
        request.method === "GET"
      ) {
        const employeeId = decodeURIComponent(
          path.replace("/api/employees/", "")
        );

        const result = await env.DB.prepare(`
          SELECT
            employee_id,
            name,
            department,
            designation,
            phone,
            shift,
            room,
            qr_token,
            status,
            created_at
          FROM employees
          WHERE employee_id = ?
        `).bind(employeeId).first();

        if (!result) {
          return json({
            success: false,
            error: "Employee not found"
          }, 404);
        }

        return json({
          success: true,
          employee: result
        });
      }

      // ALL EMPLOYEES
      if (path === "/api/employees" && request.method === "GET") {
        const result = await env.DB.prepare(`
          SELECT
            employee_id,
            name,
            department,
            designation,
            phone,
            shift,
            room,
            status,
            created_at
          FROM employees
          ORDER BY name
        `).all();

        return json({
          success: true,
          employees: result.results || []
        });
      }

      // CAB QR SCAN
      if (path === "/api/cab/scan" && request.method === "POST") {
        const data = await body(request);

        if (!data.qr_token) {
          return json({
            success: false,
            error: "QR token required"
          }, 400);
        }

        const employee = await env.DB.prepare(`
          SELECT
            employee_id,
            name,
            department,
            shift,
            status
          FROM employees
          WHERE qr_token = ?
        `).bind(data.qr_token).first();

        if (!employee) {
          return json({
            success: false,
            error: "Invalid employee QR"
          }, 404);
        }

        if (employee.status !== "ACTIVE") {
          return json({
            success: false,
            error: "Employee is not active"
          }, 403);
        }

        const today = nowIndia();

        // Prevent duplicate boarding for same employee/cab/date
        const duplicate = await env.DB.prepare(`
          SELECT id
          FROM cab_entries
          WHERE employee_id = ?
          AND entry_date = ?
          AND cab_no = ?
          LIMIT 1
        `).bind(
          employee.employee_id,
          today.date,
          data.cab_no || ""
        ).first();

        if (duplicate) {
          return json({
            success: false,
            duplicate: true,
            error: "Employee already entered this cab today"
          }, 409);
        }

        await env.DB.prepare(`
          INSERT INTO cab_entries
          (
            employee_id,
            employee_name,
            department,
            shift,
            cab_no,
            route,
            entry_date,
            entry_time
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          employee.employee_id,
          employee.name,
          employee.department,
          employee.shift || "",
          data.cab_no || "",
          data.route || "",
          today.date,
          today.time
        ).run();

        return json({
          success: true,
          message: "CAB ENTRY SUCCESS",
          entry: {
            employee_id: employee.employee_id,
            name: employee.name,
            department: employee.department,
            shift: employee.shift,
            cab_no: data.cab_no || "",
            route: data.route || "",
            date: today.date,
            time: today.time
          }
        });
      }

      // CAB ENTRIES
      if (path === "/api/cab/entries" && request.method === "GET") {
        const result = await env.DB.prepare(`
          SELECT *
          FROM cab_entries
          ORDER BY id DESC
        `).all();

        return json({
          success: true,
          entries: result.results || []
        });
      }

      // CAB DASHBOARD
      if (path === "/api/cab/dashboard" && request.method === "GET") {
        const today = nowIndia();

        const total = await env.DB.prepare(`
          SELECT COUNT(*) AS count
          FROM cab_entries
          WHERE entry_date = ?
        `).bind(today.date).first();

        const departments = await env.DB.prepare(`
          SELECT department, COUNT(*) AS count
          FROM cab_entries
          WHERE entry_date = ?
          GROUP BY department
          ORDER BY count DESC
        `).bind(today.date).all();

        const cabs = await env.DB.prepare(`
          SELECT cab_no, route, COUNT(*) AS count
          FROM cab_entries
          WHERE entry_date = ?
          GROUP BY cab_no, route
          ORDER BY count DESC
        `).bind(today.date).all();

        const shifts = await env.DB.prepare(`
          SELECT shift, COUNT(*) AS count
          FROM cab_entries
          WHERE entry_date = ?
          GROUP BY shift
          ORDER BY count DESC
        `).bind(today.date).all();

        return json({
          success: true,
          date: today.date,
          total_boarded: total?.count || 0,
          departments: departments.results || [],
          cabs: cabs.results || [],
          shifts: shifts.results || []
        });
      }

      // CAB EXCEL / CSV EXPORT
      if (path === "/api/cab/export" && request.method === "GET") {
        const result = await env.DB.prepare(`
          SELECT
            employee_id AS "Employee ID",
            employee_name AS "Employee Name",
            department AS "Department",
            shift AS "Shift",
            cab_no AS "Cab No",
            route AS "Route",
            entry_date AS "Date",
            entry_time AS "Time"
          FROM cab_entries
          ORDER BY entry_date DESC, entry_time DESC
        `).all();

        return csvResponse(result.results || []);
      }

      // ROOMS
      if (path === "/api/rooms" && request.method === "GET") {
        const result = await env.DB.prepare(`
          SELECT *
          FROM rooms
          ORDER BY block, room_no
        `).all();

        return json({
          success: true,
          rooms: result.results || []
        });
      }

      // ADD ROOM
      if (path === "/api/rooms" && request.method === "POST") {
        const data = await body(request);

        if (!data.room_no) {
          return json({
            success: false,
            error: "Room number required"
          }, 400);
        }

        await env.DB.prepare(`
          INSERT INTO rooms
          (room_no, block, capacity, occupied)
          VALUES (?, ?, ?, ?)
        `).bind(
          data.room_no,
          data.block || "",
          Number(data.capacity || 0),
          Number(data.occupied || 0)
        ).run();

        return json({
          success: true,
          message: "Room added"
        });
      }

      // LEAVE
      if (path === "/api/leave" && request.method === "POST") {
        const data = await body(request);

        if (!data.employee_id || !data.from_date || !data.to_date) {
          return json({
            success: false,
            error: "Employee ID and dates are required"
          }, 400);
        }

        await env.DB.prepare(`
          INSERT INTO leave_records
          (employee_id, from_date, to_date, reason)
          VALUES (?, ?, ?, ?)
        `).bind(
          data.employee_id,
          data.from_date,
          data.to_date,
          data.reason || ""
        ).run();

        return json({
          success: true,
          message: "Leave request submitted"
        });
      }

      return json({
        success: false,
        error: "API route not found"
      }, 404);

    } catch (error) {
      return json({
        success: false,
        error: error.message
      }, 500);
    }
  }
};
