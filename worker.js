const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Master-Key"
};

const DEPARTMENTS = ["PDN", "PDN2", "PDN3", "MDN"];
const SHIFTS = ["SHIFT 1", "SHIFT 2", "SHIFT 3"];
const STATUSES = ["IN", "OUT/LEAVE", "VACATED"];
const ROLES = ["HR", "MANAGEMENT", "ADMIN"];

function response(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" }
  });
}

function fail(message, status = 400) {
  return response({ success: false, message }, status);
}

function jsonBody(request) {
  return request.json().catch(() => ({}));
}

function dateNow() {
  return new Date().toISOString().slice(0, 10);
}

function timeNow() {
  return new Date().toISOString().slice(11, 19);
}

function randomToken() {
  return crypto.randomUUID().replaceAll("-", "") +
    crypto.randomUUID().replaceAll("-", "");
}

function b64url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function fromB64url(value) {
  value = value.replaceAll("-", "+").replaceAll("_", "/");
  value += "=".repeat((4 - value.length % 4) % 4);
  return Uint8Array.from(atob(value), c => c.charCodeAt(0));
}

async function hmac(value, secret) {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  return b64url(new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value))
  ));
}

async function makeSession(payload, secret) {
  const body = b64url(new TextEncoder().encode(JSON.stringify({
    ...payload, exp: Date.now() + 7 * 24 * 60 * 60 * 1000
  })));
  return body + "." + await hmac(body, secret);
}

async function readSession(request, secret) {
  const header = request.headers.get("Authorization") || "";
  const token = header.replace(/^Bearer\s+/i, "");
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  if (await hmac(parts[0], secret) !== parts[1]) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(fromB64url(parts[0])));
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

async function passwordHash(password) {
  const digest = await crypto.subtle.digest(
    "SHA-256", new TextEncoder().encode(password)
  );
  return "sha256:" + [...new Uint8Array(digest)]
    .map(n => n.toString(16).padStart(2, "0")).join("");
}

async function passwordMatches(input, stored) {
  if (!stored) return false;
  if (stored === input) return true; // Supports existing plain-text records.
  return stored === await passwordHash(input);
}

function safePerson(row, type) {
  return {
    person_type: type,
    id: type === "EMPLOYEE" ? row.employee_id : row.intern_id,
    person_id: type === "EMPLOYEE" ? row.employee_id : row.intern_id,
    name: row.name,
    department: row.department,
    designation: row.designation || "",
    mobile: row.mobile,
    shift: row.shift || "",
    room: row.room || "",
    hostel_status: row.hostel_status,
    status: row.status
  };
}

async function ensureExtras(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS hr_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      person_type TEXT NOT NULL,
      person_id TEXT NOT NULL,
      person_name TEXT NOT NULL,
      request_type TEXT NOT NULL,
      from_date TEXT,
      to_date TEXT,
      remarks TEXT,
      status TEXT NOT NULL DEFAULT 'PENDING',
      hr_remarks TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_food_date
    ON food_entries(entry_date, meal_type)
  `).run().catch(() => {});

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_cab_date
    ON cab_entries(entry_date)
  `).run().catch(() => {});

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_requests_status
    ON hr_requests(status, created_at)
  `).run().catch(() => {});

  // Seed missing room records only. Existing room data is never deleted.
  const rooms = [
    ["A1","A"],["A2","A"],["A3","A"],["A4","A"],
    ["B1","B"],["B2","B"],["B3","B"],["B4","B"],
    ["B5","B"],["B6","B"],["B7","B"],["B8","B"],
    ["C1","C"],["C2","C"],["C3","C"],["C4","C"],
    ["C5","C"],["C6","C"],["C7","C"],["C8","C"],
    ["D1","D"],["D2","D"],["D3","D"],["D4","D"]
  ];
  for (const [room, block] of rooms) {
    await db.prepare(
      "INSERT OR IGNORE INTO rooms (room_number, block, status) VALUES (?, ?, 'ACTIVE')"
    ).bind(room, block).run();
  }
}

function isManager(session) {
  return session?.kind === "STAFF" && ROLES.includes(session.role);
}

function isPerson(session) {
  return session?.kind === "PERSON" &&
    ["EMPLOYEE", "INTERN"].includes(session.person_type);
}

async function audit(db, actor, action, targetType = "", targetId = "", details = "") {
  await db.prepare(`
    INSERT INTO audit_logs (actor_type, actor_id, action, target_type, target_id, details)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(
    actor?.kind || "SYSTEM",
    actor?.id || "",
    action,
    targetType,
    String(targetId || ""),
    typeof details === "string" ? details : JSON.stringify(details)
  ).run().catch(() => {});
}

async function getPerson(db, type, id) {
  if (type === "EMPLOYEE") {
    return db.prepare("SELECT * FROM employees WHERE employee_id = ?")
      .bind(id).first();
  }
  if (type === "INTERN") {
    return db.prepare("SELECT * FROM interns WHERE intern_id = ?")
      .bind(id).first();
  }
  return null;
}

async function createPersonQR(db, type, id) {
  const old = await db.prepare(`
    SELECT token FROM qr_tokens
    WHERE qr_type = 'EMPLOYEE' AND person_type = ? AND person_id = ?
    AND status = 'ACTIVE' LIMIT 1
  `).bind(type, id).first();

  if (old) return old.token;

  const token = randomToken();
  await db.prepare(`
    INSERT INTO qr_tokens (token, qr_type, person_type, person_id, status)
    VALUES (?, 'EMPLOYEE', ?, ?, 'ACTIVE')
  `).bind(token, type, id).run();
  return token;
}

async function api(request, env) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  if (!env.DB) return fail("D1 binding DB is missing.", 500);
  if (!env.TEXMO_MASTER_KEY || env.TEXMO_MASTER_KEY.length < 16) {
    return fail("TEXMO_MASTER_KEY secret missing or shorter than 16 characters.", 500);
  }

  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const method = request.method;
  const db = env.DB;

  try {
    await ensureExtras(db);

    // Health check
    if (path === "/api/health" && method === "GET") {
      return response({ success: true, service: "TEXMO Hostel Hub", database: "connected" });
    }

    // Public login
    if (path === "/api/login" && method === "POST") {
      const b = await jsonBody(request);
      const id = String(b.id || b.staff_id || b.employee_id || b.intern_id || "").trim();
      const password = String(b.password || "");
      const type = String(b.type || b.kind || "STAFF").toUpperCase();

      if (!id || !password) return fail("Enter your ID and password.");

      if (["STAFF", "HR", "MANAGEMENT", "ADMIN"].includes(type)) {
        const staff = await db.prepare(`
          SELECT * FROM staff WHERE staff_id = ? AND status = 'ACTIVE' LIMIT 1
        `).bind(id).first();

        if (!staff || !(await passwordMatches(password, staff.password))) {
          return fail("Incorrect Staff ID or password.", 401);
        }

        const user = {
          kind: "STAFF", id: staff.staff_id, staff_id: staff.staff_id,
          name: staff.name, role: staff.role, mobile: staff.mobile
        };
        return response({
          success: true,
          token: await makeSession(user, env.TEXMO_MASTER_KEY),
          user
        });
      }

      const personType = type === "INTERN" ? "INTERN" : "EMPLOYEE";
      const table = personType === "INTERN" ? "interns" : "employees";
      const idColumn = personType === "INTERN" ? "intern_id" : "employee_id";
      const person = await db.prepare(
        `SELECT * FROM ${table} WHERE ${idColumn} = ? AND status = 'ACTIVE' LIMIT 1`
      ).bind(id).first();

      if (!person || !(await passwordMatches(password, person.password))) {
        return fail("Incorrect ID or password.", 401);
      }

      const qr = await createPersonQR(db, personType, id);
      const user = safePerson(person, personType);
      return response({
        success: true,
        token: await makeSession({
          kind: "PERSON", person_type: personType, id, role: "PERSON"
        }, env.TEXMO_MASTER_KEY),
        qr_token: qr,
        user
      });
    }

    // Person / staff registration
    if (path === "/api/register" && method === "POST") {
      const b = await jsonBody(request);
      const type = String(b.type || b.person_type || "EMPLOYEE").toUpperCase();
      const name = String(b.name || "").trim();
      const id = String(b.id || b.staff_id || b.employee_id || b.intern_id || "").trim();
      const mobile = String(b.mobile || "").trim();
      const password = String(b.password || "");
      const department = String(b.department || "").toUpperCase();
      const masterKey = request.headers.get("X-Master-Key") || b.master_key || "";

      if (!name || !id || !mobile || password.length < 4) {
        return fail("Name, ID, mobile and password (minimum 4 characters) are required.");
      }

      if (["STAFF", "HR", "MANAGEMENT", "ADMIN"].includes(type)) {
        if (masterKey !== env.TEXMO_MASTER_KEY) return fail("Invalid HR master key.", 403);
        if (!ROLES.includes(type)) return fail("Invalid staff role.");

        const existingStaff = await db.prepare(
          "SELECT staff_id FROM staff WHERE staff_id = ?"
        ).bind(id).first();
        if (existingStaff) return fail("This Staff ID is already registered.");

        await db.prepare(`
          INSERT INTO staff (name, staff_id, mobile, password, role, status)
          VALUES (?, ?, ?, ?, ?, 'ACTIVE')
        `).bind(name, id, mobile, await passwordHash(password), type).run();
        await audit(db, { kind: "SYSTEM", id: "registration" }, "STAFF_REGISTERED", "staff", id);
        return response({ success: true, message: "Staff account created." });
      }

      if (!DEPARTMENTS.includes(department)) {
        return fail("Department must be PDN, PDN2, PDN3 or MDN.");
      }

      const personType = type === "INTERN" ? "INTERN" : "EMPLOYEE";
      const table = personType === "INTERN" ? "interns" : "employees";
      const idColumn = personType === "INTERN" ? "intern_id" : "employee_id";
      const existing = await db.prepare(
        `SELECT ${idColumn} FROM ${table} WHERE ${idColumn} = ?`
      ).bind(id).first();
      if (existing) return fail("This ID is already registered.");

      await db.prepare(`
        INSERT INTO ${table}
          (${idColumn}, name, department, designation, mobile, password, shift, room, hostel_status, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'IN', 'ACTIVE')
      `).bind(
        id, name, department, String(b.designation || ""),
        mobile, await passwordHash(password),
        String(b.shift || ""), String(b.room || "")
      ).run();

      await createPersonQR(db, personType, id);
      await audit(db, { kind: "SYSTEM", id: "registration" }, "PERSON_REGISTERED", personType, id);
      return response({ success: true, message: "Account created. Please log in." });
    }

    const session = await readSession(request, env.TEXMO_MASTER_KEY);

    // Session profile
    if (path === "/api/me" && method === "GET") {
      if (!session) return fail("Please log in again.", 401);
      if (isManager(session)) return response({ success: true, user: session });
      if (isPerson(session)) {
        const person = await getPerson(db, session.person_type, session.id);
        if (!person) return fail("Account not found.", 404);
        const qr = await createPersonQR(db, session.person_type, session.id);
        return response({
          success: true, user: safePerson(person, session.person_type), qr_token: qr
        });
      }
      return fail("Invalid session.", 401);
    }

    if (!session) return fail("Please log in.", 401);

    // Person updates their own shift only
    if (path === "/api/my/shift" && method === "POST") {
      if (!isPerson(session)) return fail("Employee/Intern login required.", 403);
      const b = await jsonBody(request);
      const shift = String(b.shift || "").toUpperCase();
      if (!SHIFTS.includes(shift)) return fail("Select SHIFT 1, SHIFT 2 or SHIFT 3.");
      const table = session.person_type === "INTERN" ? "interns" : "employees";
      const col = session.person_type === "INTERN" ? "intern_id" : "employee_id";
      await db.prepare(`UPDATE ${table} SET shift = ? WHERE ${col} = ?`)
        .bind(shift, session.id).run();
      return response({ success: true, message: "Shift updated." });
    }

    // HR requests list
    if (path === "/api/requests" && method === "GET") {
      if (isPerson(session)) {
        const rows = await db.prepare(`
          SELECT * FROM hr_requests WHERE person_type = ? AND person_id = ?
          ORDER BY id DESC LIMIT 100
        `).bind(session.person_type, session.id).all();
        return response({ success: true, requests: rows.results || [] });
      }
      if (!isManager(session)) return fail("Access denied.", 403);
      const status = url.searchParams.get("status");
      const rows = status
        ? await db.prepare("SELECT * FROM hr_requests WHERE status = ? ORDER BY id DESC LIMIT 500").bind(status).all()
        : await db.prepare("SELECT * FROM hr_requests ORDER BY id DESC LIMIT 500").all();
      return response({ success: true, requests: rows.results || [] });
    }

    // Submit HR request
    if (path === "/api/requests" && method === "POST") {
      if (!isPerson(session)) return fail("Employee/Intern login required.", 403);
      const b = await jsonBody(request);
      const allowed = ["LEAVE", "TEMPORARY OUT", "RETURN", "VACATE"];
      const requestType = String(b.request_type || b.type || "").toUpperCase();
      if (!allowed.includes(requestType)) return fail("Invalid request type.");

      const person = await getPerson(db, session.person_type, session.id);
      if (!person || person.status !== "ACTIVE") return fail("Active account not found.", 403);

      await db.prepare(`
        INSERT INTO hr_requests
          (person_type, person_id, person_name, request_type, from_date, to_date, remarks, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING')
      `).bind(
        session.person_type, session.id, person.name, requestType,
        String(b.from_date || ""), String(b.to_date || ""),
        String(b.remarks || "")
      ).run();

      await audit(db, session, "REQUEST_SUBMITTED", "request", "", requestType);
      return response({ success: true, message: "Request sent to HR." });
    }

    // HR approves / rejects requests
    if (path === "/api/requests/review" && method === "POST") {
      if (!isManager(session)) return fail("Management access required.", 403);
      const b = await jsonBody(request);
      const id = Number(b.id || b.request_id);
      const decision = String(b.status || "").toUpperCase();
      if (!id || !["APPROVED", "REJECTED"].includes(decision)) {
        return fail("Request ID and APPROVED/REJECTED status are required.");
      }

      const req = await db.prepare("SELECT * FROM hr_requests WHERE id = ?").bind(id).first();
      if (!req) return fail("Request not found.", 404);

      await db.prepare(`
        UPDATE hr_requests SET status = ?, hr_remarks = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(decision, String(b.hr_remarks || b.remarks || ""), id).run();

      if (decision === "APPROVED") {
        const table = req.person_type === "INTERN" ? "interns" : "employees";
        const col = req.person_type === "INTERN" ? "intern_id" : "employee_id";
        let newStatus = null;
        if (req.request_type === "LEAVE" || req.request_type === "TEMPORARY OUT") newStatus = "OUT/LEAVE";
        if (req.request_type === "RETURN") newStatus = "IN";
        if (req.request_type === "VACATE") newStatus = "VACATED";

        if (newStatus) {
          await db.prepare(`UPDATE ${table} SET hostel_status = ? WHERE ${col} = ?`)
            .bind(newStatus, req.person_id).run();
          await db.prepare(`
            INSERT INTO hostel_status_history
              (person_type, person_id, status, out_date, return_date, remarks)
            VALUES (?, ?, ?, ?, ?, ?)
          `).bind(
            req.person_type, req.person_id, newStatus,
            newStatus === "OUT/LEAVE" ? (req.from_date || dateNow()) : null,
            newStatus === "IN" ? dateNow() : (req.to_date || null),
            String(b.hr_remarks || b.remarks || req.remarks || "")
          ).run();
        }
      }

      await audit(db, session, "REQUEST_" + decision, "request", id);
      return response({ success: true, message: "Request " + decision.toLowerCase() + "." });
    }

    // Dashboard
    if (path === "/api/dashboard" || path === "/api/summary") {
      if (!isManager(session)) return fail("Management access required.", 403);
      const [employees, interns, rooms, pending, cab, food, attendance] = await Promise.all([
        db.prepare("SELECT * FROM employees ORDER BY name").all(),
        db.prepare("SELECT * FROM interns ORDER BY name").all(),
        db.prepare("SELECT * FROM rooms ORDER BY block, room_number").all(),
        db.prepare("SELECT COUNT(*) AS n FROM hr_requests WHERE status = 'PENDING'").first(),
        db.prepare("SELECT COUNT(*) AS n FROM cab_entries WHERE entry_date = ?").bind(dateNow()).first(),
        db.prepare("SELECT COUNT(*) AS n FROM food_entries WHERE entry_date = ?").bind(dateNow()).first(),
        db.prepare("SELECT COUNT(*) AS n FROM shift_attendance WHERE attendance_date = ?").bind(dateNow()).first()
      ]);
      return response({
        success: true,
        employees: (employees.results || []).map(r => safePerson(r, "EMPLOYEE")),
        interns: (interns.results || []).map(r => safePerson(r, "INTERN")),
        rooms: rooms.results || [],
        pending_requests: pending?.n || 0,
        cab_today: cab?.n || 0,
        food_today: food?.n || 0,
        attendance_today: attendance?.n || 0
      });
    }

    // Full people list and edit
    if (path === "/api/people" && method === "GET") {
      if (!isManager(session)) return fail("Management access required.", 403);
      const [e, i] = await Promise.all([
        db.prepare("SELECT * FROM employees ORDER BY name").all(),
        db.prepare("SELECT * FROM interns ORDER BY name").all()
      ]);
      return response({
        success: true,
        employees: (e.results || []).map(r => safePerson(r, "EMPLOYEE")),
        interns: (i.results || []).map(r => safePerson(r, "INTERN"))
      });
    }

    if (path === "/api/people/update" && method === "POST") {
      if (!isManager(session)) return fail("Management access required.", 403);
      const b = await jsonBody(request);
      const type = String(b.person_type || b.type || "EMPLOYEE").toUpperCase();
      const id = String(b.person_id || b.id || "").trim();
      if (!id || !["EMPLOYEE", "INTERN"].includes(type)) return fail("Person type and ID required.");

      const department = String(b.department || "").toUpperCase();
      if (department && !DEPARTMENTS.includes(department)) return fail("Invalid department.");
      if (b.hostel_status && !STATUSES.includes(String(b.hostel_status).toUpperCase())) return fail("Invalid hostel status.");

      const table = type === "INTERN" ? "interns" : "employees";
      const col = type === "INTERN" ? "intern_id" : "employee_id";
      const current = await getPerson(db, type, id);
      if (!current) return fail("Person not found.", 404);

      await db.prepare(`
        UPDATE ${table} SET
          name = ?, department = ?, designation = ?, mobile = ?, shift = ?, room = ?,
          hostel_status = ?, status = ?
        WHERE ${col} = ?
      `).bind(
        String(b.name ?? current.name),
        department || current.department,
        String(b.designation ?? current.designation ?? ""),
        String(b.mobile ?? current.mobile),
        String(b.shift ?? current.shift ?? ""),
        String(b.room ?? current.room ?? ""),
        String(b.hostel_status ?? current.hostel_status),
        String(b.status ?? current.status),
        id
      ).run();

      if (b.password) {
        await db.prepare(`UPDATE ${table} SET password = ? WHERE ${col} = ?`)
          .bind(await passwordHash(String(b.password)), id).run();
      }
      await audit(db, session, "PERSON_UPDATED", type, id);
      return response({ success: true, message: "Record updated." });
    }

    if (path === "/api/people/delete" && method === "POST") {
      if (!isManager(session)) return fail("Management access required.", 403);
      const b = await jsonBody(request);
      const type = String(b.person_type || b.type || "EMPLOYEE").toUpperCase();
      const id = String(b.person_id || b.id || "").trim();
      if (!id || !["EMPLOYEE", "INTERN"].includes(type)) return fail("Person type and ID required.");
      const table = type === "INTERN" ? "interns" : "employees";
      const col = type === "INTERN" ? "intern_id" : "employee_id";
      await db.prepare(`UPDATE ${table} SET status = 'RESIGNED' WHERE ${col} = ?`).bind(id).run();
      await audit(db, session, "PERSON_MARKED_RESIGNED", type, id);
      return response({ success: true, message: "Record marked RESIGNED. Historical data retained." });
    }

    // Rooms: update room metadata only, never enforce a fixed bed count
    if (path === "/api/rooms" && method === "GET") {
      if (!isManager(session)) return fail("Management access required.", 403);
      const rows = await db.prepare("SELECT * FROM rooms ORDER BY block, room_number").all();
      return response({ success: true, rooms: rows.results || [] });
    }

    if (path === "/api/rooms/update" && method === "POST") {
      if (!isManager(session)) return fail("Management access required.", 403);
      const b = await jsonBody(request);
      if (!b.room_number) return fail("Room number required.");
      await db.prepare("UPDATE rooms SET status = ? WHERE room_number = ?")
        .bind(String(b.status || "ACTIVE"), String(b.room_number)).run();
      return response({ success: true, message: "Room updated." });
    }

    // Food QR: HR creates/reuses one active food QR token
    if (path === "/api/food/qr" && method === "GET") {
      if (!isManager(session)) return fail("Management access required.", 403);
      let item = await db.prepare(`
        SELECT qr_token FROM food_qr_config WHERE status = 'ACTIVE' ORDER BY id DESC LIMIT 1
      `).first();
      if (!item) {
        const token = randomToken();
        await db.prepare("INSERT INTO food_qr_config (qr_token, status) VALUES (?, 'ACTIVE')")
          .bind(token).run();
        item = { qr_token: token };
      }
      return response({ success: true, qr_token: item.qr_token });
    }

    // Scan employee QR to record cab entry
    if (path === "/api/cab/scan" && method === "POST") {
      if (!isManager(session)) return fail("HR/Management login required.", 403);
      const b = await jsonBody(request);
      const token = String(b.qr_token || b.token || "").trim();
      if (!token) return fail("Scan an employee QR first.");

      const qr = await db.prepare(`
        SELECT * FROM qr_tokens WHERE token = ? AND qr_type = 'EMPLOYEE' AND status = 'ACTIVE'
      `).bind(token).first();
      if (!qr) return fail("Invalid or inactive employee QR.", 404);

      const p = await getPerson(db, qr.person_type, qr.person_id);
      if (!p || p.status !== "ACTIVE") return fail("Active person not found.", 404);

      const d = dateNow(), t = timeNow();
      await db.prepare(`
        INSERT INTO cab_entries
          (person_type, person_id, name, department, shift, room, entry_date, entry_time)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        qr.person_type, qr.person_id, p.name, p.department,
        p.shift || "", p.room || "", d, t
      ).run();
      await audit(db, session, "CAB_SCAN", qr.person_type, qr.person_id);
      return response({
        success: true, message: "Cab entry saved.",
        entry: { name: p.name, id: qr.person_id, department: p.department, shift: p.shift || "", room: p.room || "", date: d, time: t }
      });
    }

    // Employee scans HR food QR and selects meal
    if (path === "/api/food/scan" && method === "POST") {
      if (!isPerson(session)) return fail("Employee/Intern login required.", 403);
      const b = await jsonBody(request);
      const token = String(b.qr_token || b.token || "").trim();
      const meal = String(b.meal_type || "").toUpperCase();
      if (!["BREAKFAST", "LUNCH", "DINNER"].includes(meal)) return fail("Select Breakfast, Lunch or Dinner.");

      const validQR = await db.prepare(`
        SELECT id FROM food_qr_config WHERE qr_token = ? AND status = 'ACTIVE'
        UNION ALL
        SELECT id FROM qr_tokens WHERE token = ? AND qr_type = 'FOOD' AND status = 'ACTIVE'
        LIMIT 1
      `).bind(token, token).first();
      if (!validQR) return fail("Invalid or inactive food QR.", 403);

      const p = await getPerson(db, session.person_type, session.id);
      if (!p || p.status !== "ACTIVE") return fail("Active person not found.", 404);

      const existing = await db.prepare(`
        SELECT id FROM food_entries
        WHERE person_type = ? AND person_id = ? AND meal_type = ? AND entry_date = ?
        LIMIT 1
      `).bind(session.person_type, session.id, meal, dateNow()).first();
      if (existing) return fail("Already recorded for this meal today.");

      await db.prepare(`
        INSERT INTO food_entries (person_type, person_id, name, department, meal_type, entry_date, entry_time)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(
        session.person_type, session.id, p.name, p.department, meal, dateNow(), timeNow()
      ).run();
      await audit(db, session, "FOOD_SCAN", "food", session.id, meal);
      return response({ success: true, message: meal + " recorded successfully." });
    }

    // Attendance: management records PRESENT / ABSENT / N/A
    if (path === "/api/attendance" && method === "GET") {
      if (!isManager(session)) return fail("Management access required.", 403);
      const date = url.searchParams.get("date") || dateNow();
      const rows = await db.prepare(`
        SELECT * FROM shift_attendance WHERE attendance_date = ?
        ORDER BY department, person_id
      `).bind(date).all();
      return response({ success: true, attendance: rows.results || [], date });
    }

    if (path === "/api/attendance" && method === "POST") {
      if (!isManager(session)) return fail("Management access required.", 403);
      const b = await jsonBody(request);
      const type = String(b.person_type || "EMPLOYEE").toUpperCase();
      const id = String(b.person_id || "").trim();
      const shift = String(b.shift || "").toUpperCase();
      const status = String(b.attendance_status || b.status || "").toUpperCase();
      const date = String(b.attendance_date || dateNow());
      if (!["EMPLOYEE", "INTERN"].includes(type) || !id) return fail("Person type and ID required.");
      if (!SHIFTS.includes(shift) || !["PRESENT", "ABSENT", "N/A"].includes(status)) return fail("Invalid shift or attendance status.");
      const p = await getPerson(db, type, id);
      if (!p) return fail("Person not found.", 404);

      const old = await db.prepare(`
        SELECT id FROM shift_attendance
        WHERE person_type = ? AND person_id = ? AND attendance_date = ? AND shift = ?
        LIMIT 1
      `).bind(type, id, date, shift).first();

      if (old) {
        await db.prepare(`
          UPDATE shift_attendance SET attendance_status = ?, department = ?, room = ?
          WHERE id = ?
        `).bind(status, p.department, p.room || "", old.id).run();
      } else {
        await db.prepare(`
          INSERT INTO shift_attendance
            (person_type, person_id, attendance_date, shift, attendance_status, department, room)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).bind(type, id, date, shift, status, p.department, p.room || "").run();
      }
      return response({ success: true, message: "Attendance saved." });
    }

    // Reports and meal totals
    if (path === "/api/reports" && method === "GET") {
      if (!isManager(session)) return fail("Management access required.", 403);
      const month = url.searchParams.get("month") || dateNow().slice(0, 7);
      const [food, dailyFood, cab, attendance] = await Promise.all([
        db.prepare(`
          SELECT meal_type, COUNT(*) AS total FROM food_entries
          WHERE substr(entry_date, 1, 7) = ? GROUP BY meal_type
        `).bind(month).all(),
        db.prepare(`
          SELECT entry_date, meal_type, COUNT(*) AS total FROM food_entries
          WHERE substr(entry_date, 1, 7) = ?
          GROUP BY entry_date, meal_type ORDER BY entry_date, meal_type
        `).bind(month).all(),
        db.prepare(`
          SELECT entry_date, COUNT(*) AS total FROM cab_entries
          WHERE substr(entry_date, 1, 7) = ? GROUP BY entry_date ORDER BY entry_date
        `).bind(month).all(),
        db.prepare(`
          SELECT attendance_date, shift, attendance_status, COUNT(*) AS total
          FROM shift_attendance WHERE substr(attendance_date, 1, 7) = ?
          GROUP BY attendance_date, shift, attendance_status
          ORDER BY attendance_date, shift
        `).bind(month).all()
      ]);
      return response({
        success: true, month,
        food: food.results || [],
        daily_food: dailyFood.results || [],
        cab: cab.results || [],
        attendance: attendance.results || []
      });
    }

    // CSV data exports. Frontend creates the downloadable file.
    if (path === "/api/export" && method === "GET") {
      if (!isManager(session)) return fail("Management access required.", 403);
      const type = String(url.searchParams.get("type") || "employees").toLowerCase();
      const allowed = {
        employees: "SELECT * FROM employees ORDER BY name",
        interns: "SELECT * FROM interns ORDER BY name",
        rooms: "SELECT * FROM rooms ORDER BY block, room_number",
        food: "SELECT * FROM food_entries ORDER BY id DESC LIMIT 10000",
        cab: "SELECT * FROM cab_entries ORDER BY id DESC LIMIT 10000",
        attendance: "SELECT * FROM shift_attendance ORDER BY id DESC LIMIT 10000",
        requests: "SELECT * FROM hr_requests ORDER BY id DESC LIMIT 10000"
      };
      if (!allowed[type]) return fail("Unsupported export type.");
      const rows = await db.prepare(allowed[type]).all();
      return response({ success: true, rows: rows.results || [] });
    }

    // Recent history for HR
    if (path === "/api/history" && method === "GET") {
      if (!isManager(session)) return fail("Management access required.", 403);
      const id = url.searchParams.get("person_id");
      const rows = id
        ? await db.prepare("SELECT * FROM hostel_status_history WHERE person_id = ? ORDER BY id DESC LIMIT 200").bind(id).all()
        : await db.prepare("SELECT * FROM hostel_status_history ORDER BY id DESC LIMIT 500").all();
      return response({ success: true, history: rows.results || [] });
    }

    // Cleanup old transactional records only. People and rooms are never removed.
    if (path === "/api/admin/cleanup" && method === "POST") {
      if (!isManager(session)) return fail("Management access required.", 403);
      await Promise.all([
        db.prepare("DELETE FROM cab_entries WHERE entry_date < date('now','-1 month')").run(),
        db.prepare("DELETE FROM food_entries WHERE entry_date < date('now','-1 month')").run(),
        db.prepare("DELETE FROM shift_attendance WHERE attendance_date < date('now','-1 month')").run()
      ]);
      await audit(db, session, "AUTO_CLEANUP", "records", "", "Records older than one month removed");
      return response({ success: true, message: "Old cab, food and attendance records cleaned." });
    }

    return fail("API route not found: " + method + " " + path, 404);
  } catch (error) {
    return response({
      success: false,
      message: "Server error.",
      detail: String(error?.message || error)
    }, 500);
  }
}

export default {
  async fetch(request, env) {
    return api(request, env);
  },

  async scheduled(controller, env, ctx) {
    if (!env.DB) return;
    ctx.waitUntil(Promise.all([
      env.DB.prepare("DELETE FROM cab_entries WHERE entry_date < date('now','-1 month')").run(),
      env.DB.prepare("DELETE FROM food_entries WHERE entry_date < date('now','-1 month')").run(),
      env.DB.prepare("DELETE FROM shift_attendance WHERE attendance_date < date('now','-1 month')").run()
    ]));
  }
};
