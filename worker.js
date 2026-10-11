
const VERSION = "TEXMO-HOSTEL-HUB-4.1";

const DEPARTMENTS = ["PDN", "PDN2", "PDN3", "MDN"];
const SHIFTS = ["SHIFT 1", "SHIFT 2", "SHIFT 3"];
const ROLES = ["HR", "MANAGEMENT", "ADMIN"];
const PERSON_TYPES = ["EMPLOYEE", "INTERN"];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    try {
      if (!env.DB) {
        return json({ success: false, message: "DB binding missing" }, 500);
      }

      if (path === "/" && request.method === "GET") {
        return json({
          success: true,
          message: "TEXMO Hostel Hub online",
          version: VERSION
        });
      }

      if (path === "/api/db-test" && request.method === "GET") {
        const result = await env.DB.prepare("SELECT 1 AS test").first();
        return json({ success: true, result });
      }

      if (path === "/api/staff/register" && request.method === "POST") {
        return await staffRegister(request, env);
      }

      if (path === "/api/staff/login" && request.method === "POST") {
        return await staffLogin(request, env);
      }

      if (path === "/api/person/register" && request.method === "POST") {
        return await personRegister(request, env);
      }

      if (path === "/api/person/login" && request.method === "POST") {
        return await personLogin(request, env);
      }

      if (path === "/api/dashboard" && request.method === "GET") {
        return await dashboard(env);
      }

      if (path === "/api/people" && request.method === "GET") {
        return await listPeople(url, env);
      }

      if (path === "/api/people" && request.method === "POST") {
        return await createPerson(request, env);
      }

      if (path === "/api/people/update" && request.method === "POST") {
        return await updatePerson(request, env);
      }

      if (path === "/api/people/delete" && request.method === "POST") {
        return await deletePerson(request, env);
      }

      if (path === "/api/hostel/status" && request.method === "POST") {
        return await updateHostelStatus(request, env);
      }

      if (path === "/api/shift/update" && request.method === "POST") {
        return await updateShift(request, env);
      }

      if (path === "/api/attendance" && request.method === "GET") {
        return await getAttendance(url, env);
      }

      if (path === "/api/attendance" && request.method === "POST") {
        return await saveAttendance(request, env);
      }

      if (path === "/api/rooms" && request.method === "GET") {
        return await getRooms(env);
      }

      if (path === "/api/rooms" && request.method === "POST") {
        return await saveRoom(request, env);
      }

      if (path === "/api/cab" && request.method === "GET") {
        return await getCabEntries(url, env);
      }

      if (path === "/api/cab" && request.method === "POST") {
        return await saveCabEntry(request, env);
      }

      if (path === "/api/food" && request.method === "GET") {
        return await getFoodEntries(url, env);
      }

      if (path === "/api/food" && request.method === "POST") {
        return await saveFoodEntry(request, env);
      }

      if (path === "/api/food/config" && request.method === "POST") {
        return await saveFoodConfig(request, env);
      }

      if (path === "/api/reports" && request.method === "GET") {
        return await getReports(env);
      }

      if (path === "/api/cleanup" && request.method === "POST") {
        return await cleanupOldEntries(env);
      }

      return json({ success: false, message: "API route not found" }, 404);
    } catch (error) {
      return json({
        success: false,
        message: "Server error",
        error: error.message
      }, 500);
    }
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(cleanupOldEntries(env));
  }
};

async function staffRegister(request, env) {
  const b = await request.json();
  const name = str(b.name);
  const staff_id = str(b.staff_id);
  const mobile = str(b.mobile);
  const password = String(b.password || "");
  const role = str(b.role).toUpperCase();
  const master_key = String(b.master_key || "");

  if (!name || !staff_id || !mobile || !password || !role || !master_key) {
    return json({ success: false, message: "All fields are required" }, 400);
  }

  if (password.length < 8) {
    return json({ success: false, message: "Password must be at least 8 characters" }, 400);
  }

  if (!ROLES.includes(role)) {
    return json({ success: false, message: "Invalid role" }, 400);
  }

  if (!env.TEXMO_MASTER_KEY || master_key !== env.TEXMO_MASTER_KEY) {
    return json({ success: false, message: "Invalid Master Key" }, 401);
  }

  try {
    await env.DB.prepare(`
      INSERT INTO staff (name, staff_id, mobile, password, role)
      VALUES (?, ?, ?, ?, ?)
    `).bind(name, staff_id, mobile, password, role).run();

    return json({ success: true, message: "Staff registered successfully" }, 201);
  } catch (e) {
    if (String(e.message).includes("UNIQUE")) {
      return json({ success: false, message: "Staff ID already exists" }, 409);
    }
    throw e;
  }
}

async function staffLogin(request, env) {
  const b = await request.json();
  const staff_id = str(b.staff_id);
  const password = String(b.password || "");

  if (!staff_id || !password) {
    return json({ success: false, message: "Enter Staff ID and password" }, 400);
  }

  const staff = await env.DB.prepare(`
    SELECT id, name, staff_id, mobile, role, status
    FROM staff
    WHERE staff_id = ? AND password = ? AND status = 'ACTIVE'
    LIMIT 1
  `).bind(staff_id, password).first();

  if (!staff) {
    return json({ success: false, message: "Invalid Staff ID or password" }, 401);
  }

  return json({ success: true, message: "Login successful", staff });
}

async function personRegister(request, env) {
  const b = await request.json();
  const type = str(b.person_type).toUpperCase();
  const id = str(b.person_id);
  const name = str(b.name);
  const department = str(b.department).toUpperCase();
  const mobile = str(b.mobile);
  const password = String(b.password || "");
  const designation = str(b.designation);
  const shift = str(b.shift).toUpperCase();
  const room = str(b.room).toUpperCase();

  if (!PERSON_TYPES.includes(type)) {
    return json({ success: false, message: "Choose Employee or Internship" }, 400);
  }

  if (!id || !name || !department || !mobile || !password) {
    return json({ success: false, message: "Fill all required fields" }, 400);
  }

  if (!DEPARTMENTS.includes(department)) {
    return json({ success: false, message: "Invalid department" }, 400);
  }

  if (password.length < 8) {
    return json({ success: false, message: "Password must be at least 8 characters" }, 400);
  }

  if (shift && !SHIFTS.includes(shift)) {
    return json({ success: false, message: "Invalid shift" }, 400);
  }

  const table = type === "EMPLOYEE" ? "employees" : "interns";
  const idColumn = type === "EMPLOYEE" ? "employee_id" : "intern_id";

  try {
    await env.DB.prepare(`
      INSERT INTO ${table}
      (${idColumn}, name, department, designation, mobile, password, shift, room)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(id, name, department, designation, mobile, password, shift || null, room || null).run();

    await env.DB.prepare(`
      INSERT INTO qr_tokens (token, qr_type, person_type, person_id)
      VALUES (?, 'EMPLOYEE', ?, ?)
    `).bind(crypto.randomUUID(), type, id).run();

    await logAudit(env, "PERSON", id, "REGISTER", type, id, { name, department });

    return json({ success: true, message: "Registration successful" }, 201);
  } catch (e) {
    if (String(e.message).includes("UNIQUE")) {
      return json({ success: false, message: "ID already registered" }, 409);
    }
    throw e;
  }
}

async function personLogin(request, env) {
  const b = await request.json();
  const type = str(b.person_type).toUpperCase();
  const id = str(b.person_id);
  const password = String(b.password || "");

  if (!PERSON_TYPES.includes(type) || !id || !password) {
    return json({ success: false, message: "Enter ID and password" }, 400);
  }

  const table = type === "EMPLOYEE" ? "employees" : "interns";
  const idColumn = type === "EMPLOYEE" ? "employee_id" : "intern_id";

  const person = await env.DB.prepare(`
    SELECT id, ${idColumn} AS person_id, name, department, designation,
           mobile, shift, room, hostel_status, status
    FROM ${table}
    WHERE ${idColumn} = ? AND password = ? AND status = 'ACTIVE'
    LIMIT 1
  `).bind(id, password).first();

  if (!person) {
    return json({ success: false, message: "Invalid ID or password" }, 401);
  }

  const qr = await env.DB.prepare(`
    SELECT token FROM qr_tokens
    WHERE person_type = ? AND person_id = ? AND qr_type = 'EMPLOYEE'
      AND status = 'ACTIVE'
    LIMIT 1
  `).bind(type, id).first();

  return json({
    success: true,
    message: "Login successful",
    person_type: type,
    person,
    qr_token: qr ? qr.token : null
  });
}

async function dashboard(env) {
  const queries = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) AS n FROM employees WHERE status='ACTIVE'").first(),
    env.DB.prepare("SELECT COUNT(*) AS n FROM interns WHERE status='ACTIVE'").first(),
    env.DB.prepare("SELECT COUNT(*) AS n FROM employees WHERE hostel_status='IN' AND status='ACTIVE'").first(),
    env.DB.prepare("SELECT COUNT(*) AS n FROM interns WHERE hostel_status='IN' AND status='ACTIVE'").first(),
    env.DB.prepare("SELECT COUNT(*) AS n FROM employees WHERE hostel_status='OUT/LEAVE' AND status='ACTIVE'").first(),
    env.DB.prepare("SELECT COUNT(*) AS n FROM interns WHERE hostel_status='OUT/LEAVE' AND status='ACTIVE'").first(),
    env.DB.prepare("SELECT COUNT(*) AS n FROM employees WHERE hostel_status='VACATED'").first(),
    env.DB.prepare("SELECT COUNT(*) AS n FROM interns WHERE hostel_status='VACATED'").first()
  ]);

  return json({
    success: true,
    employees: queries[0].n,
    interns: queries[1].n,
    in_hostel: queries[2].n + queries[3].n,
    out_or_leave: queries[4].n + queries[5].n,
    vacated: queries[6].n + queries[7].n
  });
}

async function listPeople(url, env) {
  const type = str(url.searchParams.get("type") || "ALL").toUpperCase();
  const status = str(url.searchParams.get("status") || "ALL").toUpperCase();
  const output = [];

  if (type === "ALL" || type === "EMPLOYEE") {
    const rows = await env.DB.prepare(`
      SELECT id, employee_id AS person_id, name, department, designation,
             mobile, shift, room, hostel_status, status, created_at,
             'EMPLOYEE' AS person_type
      FROM employees
      WHERE (? = 'ALL' OR status = ?)
      ORDER BY name
    `).bind(status, status).all();
    output.push(...rows.results);
  }

  if (type === "ALL" || type === "INTERN") {
    const rows = await env.DB.prepare(`
      SELECT id, intern_id AS person_id, name, department, designation,
             mobile, shift, room, hostel_status, status, created_at,
             'INTERN' AS person_type
      FROM interns
      WHERE (? = 'ALL' OR status = ?)
      ORDER BY name
    `).bind(status, status).all();
    output.push(...rows.results);
  }

  return json({ success: true, people: output });
}

async function createPerson(request, env) {
  return personRegister(request, env);
}

async function updatePerson(request, env) {
  const b = await request.json();
  const type = str(b.person_type).toUpperCase();
  const id = str(b.person_id);

  if (!PERSON_TYPES.includes(type) || !id) {
    return json({ success: false, message: "Person type and ID required" }, 400);
  }

  const table = type === "EMPLOYEE" ? "employees" : "interns";
  const idColumn = type === "EMPLOYEE" ? "employee_id" : "intern_id";
  const fields = ["name", "department", "designation", "mobile", "shift", "room", "hostel_status", "status"];
  const updates = [];
  const values = [];

  for (const field of fields) {
    if (b[field] !== undefined) {
      const value = field === "department" ? str(b[field]).toUpperCase()
        : field === "shift" ? str(b[field]).toUpperCase()
        : field === "room" ? str(b[field]).toUpperCase()
        : field === "hostel_status" ? str(b[field]).toUpperCase()
        : field === "status" ? str(b[field]).toUpperCase()
        : b[field];

      if (field === "department" && !DEPARTMENTS.includes(value)) {
        return json({ success: false, message: "Invalid department" }, 400);
      }
      if (field === "shift" && value && !SHIFTS.includes(value)) {
        return json({ success: false, message: "Invalid shift" }, 400);
      }
      if (field === "hostel_status" && !["IN", "OUT/LEAVE", "VACATED"].includes(value)) {
        return json({ success: false, message: "Invalid hostel status" }, 400);
      }
      if (field === "status" && !["ACTIVE", "RESIGNED"].includes(value)) {
        return json({ success: false, message: "Invalid person status" }, 400);
      }

      updates.push(`${field} = ?`);
      values.push(value || null);
    }
  }

  if (b.password) {
    updates.push("password = ?");
    values.push(String(b.password));
  }

  if (!updates.length) {
    return json({ success: false, message: "No fields to update" }, 400);
  }

  values.push(id);

  await env.DB.prepare(`
    UPDATE ${table} SET ${updates.join(", ")}
    WHERE ${idColumn} = ?
  `).bind(...values).run();

  await logAudit(env, "STAFF", null, "UPDATE_PERSON", type, id, b);

  return json({ success: true, message: "Person updated" });
}

async function deletePerson(request, env) {
  const b = await request.json();
  const type = str(b.person_type).toUpperCase();
  const id = str(b.person_id);

  if (!PERSON_TYPES.includes(type) || !id) {
    return json({ success: false, message: "Person type and ID required" }, 400);
  }

  const table = type === "EMPLOYEE" ? "employees" : "interns";
  const idColumn = type === "EMPLOYEE" ? "employee_id" : "intern_id";

  await env.DB.prepare(`DELETE FROM ${table} WHERE ${idColumn} = ?`).bind(id).run();
  await env.DB.prepare(`
    UPDATE qr_tokens SET status = 'INACTIVE'
    WHERE person_type = ? AND person_id = ?
  `).bind(type, id).run();

  await logAudit(env, "STAFF", null, "DELETE_PERSON", type, id, {});
  return json({ success: true, message: "Person deleted" });
}

async function updateHostelStatus(request, env) {
  const b = await request.json();
  const type = str(b.person_type).toUpperCase();
  const id = str(b.person_id);
  const status = str(b.hostel_status).toUpperCase();

  if (!PERSON_TYPES.includes(type) || !id ||
      !["IN", "OUT/LEAVE", "VACATED"].includes(status)) {
    return json({ success: false, message: "Invalid person or status" }, 400);
  }

  const table = type === "EMPLOYEE" ? "employees" : "interns";
  const idColumn = type === "EMPLOYEE" ? "employee_id" : "intern_id";

  const person = await env.DB.prepare(`
    SELECT name FROM ${table} WHERE ${idColumn} = ?
  `).bind(id).first();

  if (!person) return json({ success: false, message: "Person not found" }, 404);

  await env.DB.prepare(`
    UPDATE ${table} SET hostel_status = ? WHERE ${idColumn} = ?
  `).bind(status, id).run();

  await env.DB.prepare(`
    INSERT INTO hostel_status_history
      (person_type, person_id, status, out_date, return_date, remarks)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(
    type, id, status,
    status === "OUT/LEAVE" ? new Date().toISOString().slice(0, 10) : null,
    status === "IN" ? new Date().toISOString().slice(0, 10) : null,
    str(b.remarks) || null
  ).run();

  await logAudit(env, "STAFF", null, "HOSTEL_STATUS", type, id, { status });
  return json({ success: true, message: "Hostel status updated" });
}

async function updateShift(request, env) {
  const b = await request.json();
  const type = str(b.person_type).toUpperCase();
  const id = str(b.person_id);
  const shift = str(b.shift).toUpperCase();

  if (!PERSON_TYPES.includes(type) || !id || !SHIFTS.includes(shift)) {
    return json({ success: false, message: "Invalid shift details" }, 400);
  }

  const table = type === "EMPLOYEE" ? "employees" : "interns";
  const idColumn = type === "EMPLOYEE" ? "employee_id" : "intern_id";

  await env.DB.prepare(`
    UPDATE ${table} SET shift = ? WHERE ${idColumn} = ?
  `).bind(shift, id).run();

  return json({ success: true, message: "Shift updated" });
}

async function getAttendance(url, env) {
  const date = str(url.searchParams.get("date")) || new Date().toISOString().slice(0, 10);
  const rows = await env.DB.prepare(`
    SELECT * FROM shift_attendance
    WHERE attendance_date = ?
    ORDER BY department, person_id
  `).bind(date).all();

  return json({ success: true, attendance: rows.results });
}

async function saveAttendance(request, env) {
  const b = await request.json();
  const type = str(b.person_type).toUpperCase();
  const id = str(b.person_id);
  const date = str(b.attendance_date) || new Date().toISOString().slice(0, 10);
  const shift = str(b.shift).toUpperCase();
  const status = str(b.attendance_status).toUpperCase();

  if (!PERSON_TYPES.includes(type) || !id ||
      !SHIFTS.includes(shift) ||
      !["PRESENT", "ABSENT", "N/A"].includes(status)) {
    return json({ success: false, message: "Invalid attendance details" }, 400);
  }

  const table = type === "EMPLOYEE" ? "employees" : "interns";
  const idColumn = type === "EMPLOYEE" ? "employee_id" : "intern_id";
  const person = await env.DB.prepare(`
    SELECT department, room FROM ${table} WHERE ${idColumn} = ?
  `).bind(id).first();

  if (!person) return json({ success: false, message: "Person not found" }, 404);

  await env.DB.prepare(`
    DELETE FROM shift_attendance
    WHERE person_type = ? AND person_id = ? AND attendance_date = ? AND shift = ?
  `).bind(type, id, date, shift).run();

  await env.DB.prepare(`
    INSERT INTO shift_attendance
      (person_type, person_id, attendance_date, shift, attendance_status, department, room)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(type, id, date, shift, status, person.department, person.room).run();

  return json({ success: true, message: "Attendance saved" });
}

async function getRooms(env) {
  const rooms = await env.DB.prepare(`
    SELECT r.*,
      (SELECT COUNT(*) FROM employees e
       WHERE e.room = r.room_number AND e.status = 'ACTIVE'
         AND e.hostel_status = 'IN') +
      (SELECT COUNT(*) FROM interns i
       WHERE i.room = r.room_number AND i.status = 'ACTIVE'
         AND i.hostel_status = 'IN') AS occupied
    FROM rooms r
    ORDER BY block, room_number
  `).all();

  return json({ success: true, rooms: rooms.results });
}

async function saveRoom(request, env) {
  const b = await request.json();
  const room_number = str(b.room_number).toUpperCase();
  const block = str(b.block).toUpperCase();

  if (!room_number || !block) {
    return json({ success: false, message: "Room number and block required" }, 400);
  }

  await env.DB.prepare(`
    INSERT INTO rooms (room_number, block)
    VALUES (?, ?)
    ON CONFLICT(room_number) DO UPDATE SET block = excluded.block
  `).bind(room_number, block).run();

  return json({ success: true, message: "Room saved" });
}

async function getCabEntries(url, env) {
  const date = str(url.searchParams.get("date")) || new Date().toISOString().slice(0, 10);
  const rows = await env.DB.prepare(`
    SELECT * FROM cab_entries WHERE entry_date = ?
    ORDER BY entry_time DESC
  `).bind(date).all();

  return json({ success: true, entries: rows.results });
}

async function saveCabEntry(request, env) {
  const b = await request.json();
  const type = str(b.person_type).toUpperCase();
  const id = str(b.person_id);
  const shift = str(b.shift).toUpperCase();

  if (!PERSON_TYPES.includes(type) || !id) {
    return json({ success: false, message: "Valid person details required" }, 400);
  }

  const table = type === "EMPLOYEE" ? "employees" : "interns";
  const idColumn = type === "EMPLOYEE" ? "employee_id" : "intern_id";
  const person = await env.DB.prepare(`
    SELECT name, department, room FROM ${table}
    WHERE ${idColumn} = ? AND status = 'ACTIVE'
  `).bind(id).first();

  if (!person) return json({ success: false, message: "Active person not found" }, 404);

  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const time = now.toISOString().slice(11, 19);

  await env.DB.prepare(`
    INSERT INTO cab_entries
      (person_type, person_id, name, department, shift, room, entry_date, entry_time)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    type, id, person.name, person.department,
    SHIFTS.includes(shift) ? shift : null,
    person.room, date, time
  ).run();

  return json({ success: true, message: "Cab entry saved", entry_date: date, entry_time: time });
}

async function getFoodEntries(url, env) {
  const date = str(url.searchParams.get("date")) || new Date().toISOString().slice(0, 10);
  const rows = await env.DB.prepare(`
    SELECT * FROM food_entries WHERE entry_date = ?
    ORDER BY entry_time DESC
  `).bind(date).all();

  return json({ success: true, entries: rows.results });
}

async function saveFoodEntry(request, env) {
  const b = await request.json();
  const token = str(b.qr_token);
  const meal = str(b.meal_type).toUpperCase();

  if (!token || !["BREAKFAST", "LUNCH", "DINNER"].includes(meal)) {
    return json({ success: false, message: "QR token and valid meal type required" }, 400);
  }

  const foodToken = await env.DB.prepare(`
    SELECT id FROM food_qr_config WHERE qr_token = ? AND status = 'ACTIVE'
  `).bind(token).first();

  if (!foodToken) {
    return json({ success: false, message: "Invalid food QR token" }, 401);
  }

  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const time = now.toISOString().slice(11, 19);

  const type = str(b.person_type).toUpperCase();
  const id = str(b.person_id);
  if (!PERSON_TYPES.includes(type) || !id) {
    return json({ success: false, message: "Person details required" }, 400);
  }

  const table = type === "EMPLOYEE" ? "employees" : "interns";
  const idColumn = type === "EMPLOYEE" ? "employee_id" : "intern_id";
  const person = await env.DB.prepare(`
    SELECT name, department FROM ${table}
    WHERE ${idColumn} = ? AND status = 'ACTIVE'
  `).bind(id).first();

  if (!person) return json({ success: false, message: "Active person not found" }, 404);

  const duplicate = await env.DB.prepare(`
    SELECT id FROM food_entries
    WHERE person_type = ? AND person_id = ? AND meal_type = ? AND entry_date = ?
  `).bind(type, id, meal, date).first();

  if (duplicate) {
    return json({ success: false, message: "This meal is already recorded today" }, 409);
  }

  await env.DB.prepare(`
    INSERT INTO food_entries
      (person_type, person_id, name, department, meal_type, entry_date, entry_time)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(type, id, person.name, person.department, meal, date, time).run();

  return json({ success: true, message: "Food entry saved", entry_date: date, entry_time: time });
}

async function saveFoodConfig(request, env) {
  const b = await request.json();
  const token = str(b.qr_token);
  const status = str(b.status || "ACTIVE").toUpperCase();

  if (!token || !["ACTIVE", "INACTIVE"].includes(status)) {
    return json({ success: false, message: "Valid QR token and status required" }, 400);
  }

  await env.DB.prepare(`
    INSERT INTO food_qr_config (qr_token, status)
    VALUES (?, ?)
    ON CONFLICT(qr_token) DO UPDATE SET status = excluded.status
  `).bind(token, status).run();

  return json({ success: true, message: "Food QR configuration saved" });
}

async function getReports(env) {
  const [people, rooms, food, cab, attendance] = await Promise.all([
    env.DB.prepare(`
      SELECT department, COUNT(*) AS total
      FROM employees WHERE status = 'ACTIVE' GROUP BY department
    `).all(),
    env.DB.prepare(`
      SELECT block, COUNT(*) AS total FROM rooms GROUP BY block
    `).all(),
    env.DB.prepare(`
      SELECT meal_type, COUNT(*) AS total FROM food_entries
      WHERE entry_date = date('now') GROUP BY meal_type
    `).all(),
    env.DB.prepare(`
      SELECT COUNT(*) AS total FROM cab_entries
      WHERE entry_date = date('now')
    `).first(),
    env.DB.prepare(`
      SELECT attendance_status, COUNT(*) AS total
      FROM shift_attendance WHERE attendance_date = date('now')
      GROUP BY attendance_status
    `).all()
  ]);

  return json({
    success: true,
    employee_departments: people.results,
    rooms_by_block: rooms.results,
    food_today: food.results,
    cab_today: cab.total,
    attendance_today: attendance.results
  });
}

async function cleanupOldEntries(env) {
  await Promise.all([
    env.DB.prepare("DELETE FROM cab_entries WHERE entry_date < date('now', '-1 month')").run(),
    env.DB.prepare("DELETE FROM food_entries WHERE entry_date < date('now', '-1 month')").run(),
    env.DB.prepare("DELETE FROM shift_attendance WHERE attendance_date < date('now', '-1 month')").run()
  ]);

  return json({ success: true, message: "Old records cleaned" });
}

async function logAudit(env, actorType, actorId, action, targetType, targetId, details) {
  await env.DB.prepare(`
    INSERT INTO audit_logs (actor_type, actor_id, action, target_type, target_id, details)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(
    actorType, actorId, action, targetType, targetId,
    JSON.stringify(details || {})
  ).run();
}

function str(value) {
  return String(value ?? "").trim();
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders()
    }
  });
}
