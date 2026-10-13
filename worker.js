const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Master-Key"
};

const DEPARTMENTS = ["PDN", "PDN2", "PDN3", "MDN"];
const SHIFTS = ["SHIFT 1", "SHIFT 2", "SHIFT 3"];
const STATUSES = ["IN", "OUT/LEAVE", "VACATED"];
const ROLES = ["HR", "MANAGEMENT", "ADMIN"];
const MEALS = ["BREAKFAST", "LUNCH", "DINNER"];

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

// All application dates and times use India Standard Time.
function indiaParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);

  return Object.fromEntries(parts.map(p => [p.type, p.value]));
}

function dateNow() {
  const p = indiaParts();
  return `${p.year}-${p.month}-${p.day}`;
}

function timeNow() {
  const p = indiaParts();
  return `${p.hour}:${p.minute}:${p.second}`;
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) &&
    d.toISOString().slice(0, 10) === value;
}

function normalizeShift(value) {
  const s = String(value || "").trim().toUpperCase().replace(/\s+/g, " ");

  if (["S1", "SHIFT1", "SHIFT 1", "1"].includes(s)) return "SHIFT 1";
  if (["S2", "SHIFT2", "SHIFT 2", "2"].includes(s)) return "SHIFT 2";
  if (["S3", "SHIFT3", "SHIFT 3", "3"].includes(s)) return "SHIFT 3";

  return "";
}

function randomToken() {
  return crypto.randomUUID().replaceAll("-", "") +
    crypto.randomUUID().replaceAll("-", "");
}

function b64url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);

  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

function fromB64url(value) {
  value = value.replaceAll("-", "+").replaceAll("_", "/");
  value += "=".repeat((4 - value.length % 4) % 4);

  return Uint8Array.from(atob(value), c => c.charCodeAt(0));
}

async function hmac(value, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  return b64url(new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value))
  ));
}

async function makeSession(payload, secret) {
  const body = b64url(new TextEncoder().encode(JSON.stringify({
    ...payload,
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000
  })));

  return body + "." + await hmac(body, secret);
}

async function readSession(request, secret) {
  const token = (request.headers.get("Authorization") || "")
    .replace(/^Bearer\s+/i, "");

  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const expected = await hmac(parts[0], secret);

  if (expected.length !== parts[1].length) return null;

  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ parts[1].charCodeAt(i);
  }

  if (diff !== 0) return null;

  try {
    const payload = JSON.parse(
      new TextDecoder().decode(fromB64url(parts[0]))
    );

    return payload.exp && payload.exp >= Date.now() ? payload : null;
  } catch {
    return null;
  }
}

async function passwordHash(password) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(password)
  );

  return "sha256:" + [...new Uint8Array(digest)]
    .map(n => n.toString(16).padStart(2, "0"))
    .join("");
}

async function passwordMatches(input, stored) {
  if (!stored) return false;

  // Retains compatibility with existing password records.
  if (stored === input) return true;

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

function personTable(type) {
  return type === "INTERN"
    ? { table: "interns", col: "intern_id" }
    : { table: "employees", col: "employee_id" };
}

function isManager(session) {
  return session?.kind === "STAFF" &&
    ROLES.includes(session.role);
}

function isPerson(session) {
  return session?.kind === "PERSON" &&
    ["EMPLOYEE", "INTERN"].includes(session.person_type);
}

async function audit(db, actor, action, targetType = "", targetId = "", details = "") {
  await db.prepare(`
    INSERT INTO audit_logs
      (actor_type, actor_id, action, target_type, target_id, details)
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
    return db.prepare(
      "SELECT * FROM employees WHERE employee_id = ?"
    ).bind(id).first();
  }

  if (type === "INTERN") {
    return db.prepare(
      "SELECT * FROM interns WHERE intern_id = ?"
    ).bind(id).first();
  }

  return null;
}

async function createPersonQR(db, type, id) {
  const old = await db.prepare(`
    SELECT token FROM qr_tokens
    WHERE qr_type = 'EMPLOYEE'
      AND person_type = ?
      AND person_id = ?
      AND status = 'ACTIVE'
    LIMIT 1
  `).bind(type, id).first();

  if (old) return old.token;

  const token = randomToken();

  await db.prepare(`
    INSERT INTO qr_tokens
      (token, qr_type, person_type, person_id, status)
    VALUES (?, 'EMPLOYEE', ?, ?, 'ACTIVE')
  `).bind(token, type, id).run();

  return token;
}

// Run safe, repeatable schema preparation. Never reset the database.
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

  // Separate unique guards protect legacy tables without deleting old rows.
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS cab_scan_guard (
      person_type TEXT NOT NULL,
      person_id TEXT NOT NULL,
      entry_date TEXT NOT NULL,
      shift_key TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (person_type, person_id, entry_date, shift_key)
    )
  `).run();

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS food_scan_guard (
      person_type TEXT NOT NULL,
      person_id TEXT NOT NULL,
      entry_date TEXT NOT NULL,
      meal_type TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (person_type, person_id, entry_date, meal_type)
    )
  `).run();

  // Backfill guards from existing records. Existing records are not removed.
  await db.prepare(`
    INSERT OR IGNORE INTO cab_scan_guard
      (person_type, person_id, entry_date, shift_key)
    SELECT DISTINCT
      person_type,
      person_id,
      entry_date,
      CASE
        WHEN UPPER(REPLACE(TRIM(COALESCE(shift,'')), ' ', ''))
          IN ('S1','SHIFT1','1') THEN 'SHIFT 1'
        WHEN UPPER(REPLACE(TRIM(COALESCE(shift,'')), ' ', ''))
          IN ('S2','SHIFT2','2') THEN 'SHIFT 2'
        WHEN UPPER(REPLACE(TRIM(COALESCE(shift,'')), ' ', ''))
          IN ('S3','SHIFT3','3') THEN 'SHIFT 3'
        ELSE 'UNASSIGNED'
      END
    FROM cab_entries
  `).run();

  await db.prepare(`
    INSERT OR IGNORE INTO food_scan_guard
      (person_type, person_id, entry_date, meal_type)
    SELECT DISTINCT person_type, person_id, entry_date, meal_type
    FROM food_entries
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

  const rooms = [
    ["A1","A"],["A2","A"],["A3","A"],["A4","A"],
    ["B1","B"],["B2","B"],["B3","B"],["B4","B"],
    ["B5","B"],["B6","B"],["B7","B"],["B8","B"],
    ["C1","C"],["C2","C"],["C3","C"],["C4","C"],
    ["C5","C"],["C6","C"],["C7","C"],["C8","C"],
    ["D1","D"],["D2","D"],["D3","D"],["D4","D"]
  ];

  for (const [room, block] of rooms) {
    await db.prepare(`
      INSERT OR IGNORE INTO rooms (room_number, block, status)
      VALUES (?, ?, 'ACTIVE')
    `).bind(room, block).run();
  }
}

async function deletePersonPermanently(db, session, type, id) {
  const person = await getPerson(db, type, id);
  if (!person) return false;

  // Keep an audit entry before deleting linked operational records.
  await audit(
    db, session, "PERSON_PERMANENTLY_DELETED",
    type, id, "Authorized permanent deletion"
  );

  const t = personTable(type);

  await db.batch([
    db.prepare(
      "DELETE FROM cab_scan_guard WHERE person_type = ? AND person_id = ?"
    ).bind(type, id),
    db.prepare(
      "DELETE FROM food_scan_guard WHERE person_type = ? AND person_id = ?"
    ).bind(type, id),
    db.prepare(
      "DELETE FROM cab_entries WHERE person_type = ? AND person_id = ?"
    ).bind(type, id),
    db.prepare(
      "DELETE FROM food_entries WHERE person_type = ? AND person_id = ?"
    ).bind(type, id),
    db.prepare(
      "DELETE FROM shift_attendance WHERE person_type = ? AND person_id = ?"
    ).bind(type, id),
    db.prepare(
      "DELETE FROM hr_requests WHERE person_type = ? AND person_id = ?"
    ).bind(type, id),
    db.prepare(
      "DELETE FROM hostel_status_history WHERE person_type = ? AND person_id = ?"
    ).bind(type, id),
    db.prepare(
      "DELETE FROM qr_tokens WHERE person_type = ? AND person_id = ?"
    ).bind(type, id),
    db.prepare(`DELETE FROM ${t.table} WHERE ${t.col} = ?`).bind(id)
  ]);

  return true;
}

async function api(request, env) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  if (!env.DB) return fail("D1 binding DB is missing.", 500);

  if (!env.TEXMO_MASTER_KEY || env.TEXMO_MASTER_KEY.length < 16) {
    return fail(
      "TEXMO_MASTER_KEY secret missing or shorter than 16 characters.",
      500
    );
  }

  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const method = request.method;
  const db = env.DB;

  try {
    await ensureExtras(db);

    if (path === "/api/health" && method === "GET") {
      return response({
        success: true,
        service: "TEXMO Hostel Hub",
        database: "connected",
        timezone: "Asia/Kolkata"
      });
    }

    // LOGIN
    if (path === "/api/login" && method === "POST") {
      const b = await jsonBody(request);
      const id = String(
        b.id || b.staff_id || b.employee_id || b.intern_id || ""
      ).trim();
      const password = String(b.password || "");
      const type = String(b.type || b.kind || "STAFF").toUpperCase();

      if (!id || !password) return fail("Enter your ID and password.");

      if (["STAFF", "HR", "MANAGEMENT", "ADMIN"].includes(type)) {
        const staff = await db.prepare(`
          SELECT * FROM staff
          WHERE staff_id = ? AND status = 'ACTIVE'
          LIMIT 1
        `).bind(id).first();

        if (!staff || !(await passwordMatches(password, staff.password))) {
          return fail("Incorrect Staff ID or password.", 401);
        }

        const user = {
          kind: "STAFF",
          id: staff.staff_id,
          staff_id: staff.staff_id,
          name: staff.name,
          role: staff.role,
          mobile: staff.mobile
        };

        return response({
          success: true,
          token: await makeSession(user, env.TEXMO_MASTER_KEY),
          user
        });
      }

      const personType = type === "INTERN" ? "INTERN" : "EMPLOYEE";
      const t = personTable(personType);

      const person = await db.prepare(`
        SELECT * FROM ${t.table}
        WHERE ${t.col} = ? AND status = 'ACTIVE'
        LIMIT 1
      `).bind(id).first();

      if (!person || !(await passwordMatches(password, person.password))) {
        return fail("Incorrect ID or password.", 401);
      }

      const qr = await createPersonQR(db, personType, id);

      return response({
        success: true,
        token: await makeSession({
          kind: "PERSON",
          person_type: personType,
          id,
          role: "PERSON"
        }, env.TEXMO_MASTER_KEY),
        qr_token: qr,
        user: safePerson(person, personType)
      });
    }

    // REGISTRATION
    if (path === "/api/register" && method === "POST") {
      const b = await jsonBody(request);
      const type = String(b.type || b.person_type || "EMPLOYEE").toUpperCase();
      const name = String(b.name || "").trim();
      const id = String(
        b.id || b.staff_id || b.employee_id || b.intern_id || ""
      ).trim();
      const mobile = String(b.mobile || "").trim();
      const password = String(b.password || "");
      const department = String(b.department || "").toUpperCase();
      const masterKey = request.headers.get("X-Master-Key") || b.master_key || "";

      if (!name || !id || !mobile || password.length < 4) {
        return fail("Name, ID, mobile and password (minimum 4 characters) are required.");
      }

      if (["STAFF", "HR", "MANAGEMENT", "ADMIN"].includes(type)) {
        if (masterKey !== env.TEXMO_MASTER_KEY) {
          return fail("Invalid HR master key.", 403);
        }

        if (!ROLES.includes(type)) return fail("Invalid staff role.");

        await db.prepare(`
          INSERT INTO staff (name, staff_id, mobile, password, role, status)
          VALUES (?, ?, ?, ?, ?, 'ACTIVE')
        `).bind(name, id, mobile, await passwordHash(password), type).run();

        await audit(
          db, { kind: "SYSTEM", id: "registration" },
          "STAFF_REGISTERED", "staff", id
        );

        return response({ success: true, message: "Staff account created." });
      }

      if (!DEPARTMENTS.includes(department)) {
        return fail("Department must be PDN, PDN2, PDN3 or MDN.");
      }

      const personType = type === "INTERN" ? "INTERN" : "EMPLOYEE";
      const t = personTable(personType);

      const existing = await db.prepare(
        `SELECT ${t.col} FROM ${t.table} WHERE ${t.col} = ?`
      ).bind(id).first();

      if (existing) return fail("This ID is already registered.");

      const shift = normalizeShift(b.shift);

      await db.prepare(`
        INSERT INTO ${t.table}
          (${t.col}, name, department, designation, mobile, password,
           shift, room, hostel_status, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'IN', 'ACTIVE')
      `).bind(
        id, name, department, String(b.designation || ""),
        mobile, await passwordHash(password), shift, String(b.room || "")
      ).run();

      await createPersonQR(db, personType, id);
      await audit(
        db, { kind: "SYSTEM", id: "registration" },
        "PERSON_REGISTERED", personType, id
      );

      return response({
        success: true,
        message: "Account created. Please log in."
      });
    }

    const session = await readSession(request, env.TEXMO_MASTER_KEY);

    // CURRENT PROFILE
    if (path === "/api/me" && method === "GET") {
      if (!session) return fail("Please log in again.", 401);
      if (isManager(session)) return response({ success: true, user: session });

      if (isPerson(session)) {
        const p = await getPerson(db, session.person_type, session.id);
        if (!p || p.status !== "ACTIVE") return fail("Account not found.", 404);

        return response({
          success: true,
          user: safePerson(p, session.person_type),
          qr_token: await createPersonQR(db, session.person_type, session.id)
        });
      }

      return fail("Invalid session.", 401);
    }

    if (!session) return fail("Please log in.", 401);

    // EMPLOYEE SELF-SERVICE SHIFT
    if (path === "/api/my/shift" && method === "POST") {
      if (!isPerson(session)) return fail("Employee/Intern login required.", 403);

      const b = await jsonBody(request);
      const shift = normalizeShift(b.shift);

      if (!shift) return fail("Select SHIFT 1, SHIFT 2 or SHIFT 3.");

      const t = personTable(session.person_type);

      await db.prepare(
        `UPDATE ${t.table} SET shift = ? WHERE ${t.col} = ?`
      ).bind(shift, session.id).run();

      return response({ success: true, message: "Shift updated." });
    }

    // REQUESTS
    if (path === "/api/requests" && method === "GET") {
      if (isPerson(session)) {
        const rows = await db.prepare(`
          SELECT * FROM hr_requests
          WHERE person_type = ? AND person_id = ?
          ORDER BY id DESC LIMIT 100
        `).bind(session.person_type, session.id).all();

        return response({ success: true, requests: rows.results || [] });
      }

      if (!isManager(session)) return fail("Access denied.", 403);

      const status = url.searchParams.get("status");
      const rows = status
        ? await db.prepare(
            "SELECT * FROM hr_requests WHERE status = ? ORDER BY id DESC LIMIT 500"
          ).bind(status).all()
        : await db.prepare(
            "SELECT * FROM hr_requests ORDER BY id DESC LIMIT 500"
          ).all();

      return response({ success: true, requests: rows.results || [] });
    }

    if (path === "/api/requests" && method === "POST") {
      if (!isPerson(session)) return fail("Employee/Intern login required.", 403);

      const b = await jsonBody(request);
      const requestType = String(b.request_type || b.type || "").toUpperCase();

      if (!["LEAVE", "TEMPORARY OUT", "RETURN", "VACATE"].includes(requestType)) {
        return fail("Invalid request type.");
      }

      const p = await getPerson(db, session.person_type, session.id);
      if (!p || p.status !== "ACTIVE") return fail("Active account not found.", 403);

      await db.prepare(`
        INSERT INTO hr_requests
          (person_type, person_id, person_name, request_type,
           from_date, to_date, remarks, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING')
      `).bind(
        session.person_type, session.id, p.name, requestType,
        String(b.from_date || ""), String(b.to_date || ""),
        String(b.remarks || "")
      ).run();

      await audit(db, session, "REQUEST_SUBMITTED", "request", "", requestType);

      return response({ success: true, message: "Request sent to HR." });
    }

    if (path === "/api/requests/review" && method === "POST") {
      if (!isManager(session)) return fail("Management access required.", 403);

      const b = await jsonBody(request);
      const id = Number(b.id || b.request_id);
      const decision = String(b.status || "").toUpperCase();

      if (!id || !["APPROVED", "REJECTED"].includes(decision)) {
        return fail("Request ID and APPROVED/REJECTED status are required.");
      }

      const req = await db.prepare(
        "SELECT * FROM hr_requests WHERE id = ?"
      ).bind(id).first();

      if (!req) return fail("Request not found.", 404);

      await db.prepare(`
        UPDATE hr_requests
        SET status = ?, hr_remarks = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(decision, String(b.hr_remarks || b.remarks || ""), id).run();

      if (decision === "APPROVED") {
        const t = personTable(req.person_type);
        let newStatus = null;

        if (["LEAVE", "TEMPORARY OUT"].includes(req.request_type)) newStatus = "OUT/LEAVE";
        if (req.request_type === "RETURN") newStatus = "IN";
        if (req.request_type === "VACATE") newStatus = "VACATED";

        if (newStatus) {
          await db.prepare(
            `UPDATE ${t.table} SET hostel_status = ? WHERE ${t.col} = ?`
          ).bind(newStatus, req.person_id).run();

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

      return response({
        success: true,
        message: "Request " + decision.toLowerCase() + "."
      });
    }

    // DASHBOARD
    if (path === "/api/dashboard" || path === "/api/summary") {
      if (!isManager(session)) return fail("Management access required.", 403);

      const d = dateNow();

      const [employees, interns, rooms, pending, cab, food, attendance] =
        await Promise.all([
          db.prepare("SELECT * FROM employees ORDER BY name").all(),
          db.prepare("SELECT * FROM interns ORDER BY name").all(),
          db.prepare("SELECT * FROM rooms ORDER BY block, room_number").all(),
          db.prepare("SELECT COUNT(*) AS n FROM hr_requests WHERE status = 'PENDING'").first(),
          db.prepare("SELECT COUNT(*) AS n FROM cab_entries WHERE entry_date = ?").bind(d).first(),
          db.prepare("SELECT COUNT(*) AS n FROM food_entries WHERE entry_date = ?").bind(d).first(),
          db.prepare("SELECT COUNT(*) AS n FROM shift_attendance WHERE attendance_date = ?").bind(d).first()
        ]);

      return response({
        success: true,
        employees: (employees.results || []).map(r => safePerson(r, "EMPLOYEE")),
        interns: (interns.results || []).map(r => safePerson(r, "INTERN")),
        rooms: rooms.results || [],
        pending_requests: pending?.n || 0,
        cab_today: cab?.n || 0,
        food_today: food?.n || 0,
        attendance_today: attendance?.n || 0,
        date: d
      });
    }

    // PEOPLE LIST
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

    // EDIT PEOPLE
    if (path === "/api/people/update" && method === "POST") {
      if (!isManager(session)) return fail("Management access required.", 403);

      const b = await jsonBody(request);
      const type = String(b.person_type || b.type || "EMPLOYEE").toUpperCase();
      const id = String(b.person_id || b.id || "").trim();

      if (!id || !["EMPLOYEE", "INTERN"].includes(type)) {
        return fail("Person type and ID required.");
      }

      const department = String(b.department || "").toUpperCase();
      if (department && !DEPARTMENTS.includes(department)) {
        return fail("Invalid department.");
      }

      const hostelStatus = String(b.hostel_status || "").toUpperCase();
      if (hostelStatus && !STATUSES.includes(hostelStatus)) {
        return fail("Invalid hostel status.");
      }

      const t = personTable(type);
      const current = await getPerson(db, type, id);
      if (!current) return fail("Person not found.", 404);

      const shift = b.shift === undefined
        ? (current.shift || "")
        : (b.shift ? normalizeShift(b.shift) : "");

      if (b.shift && !shift) return fail("Invalid shift.");

      const status = String(b.status ?? current.status).toUpperCase();
      if (!["ACTIVE", "RESIGNED"].includes(status)) {
        return fail("Status must be ACTIVE or RESIGNED.");
      }

      await db.prepare(`
        UPDATE ${t.table}
        SET name = ?, department = ?, designation = ?, mobile = ?,
            shift = ?, room = ?, hostel_status = ?, status = ?
        WHERE ${t.col} = ?
      `).bind(
        String(b.name ?? current.name),
        department || current.department,
        String(b.designation ?? current.designation ?? ""),
        String(b.mobile ?? current.mobile),
        shift,
        String(b.room ?? current.room ?? ""),
        hostelStatus || current.hostel_status,
        status,
        id
      ).run();

      if (b.password) {
        await db.prepare(
          `UPDATE ${t.table} SET password = ? WHERE ${t.col} = ?`
        ).bind(await passwordHash(String(b.password)), id).run();
      }

      await audit(db, session, "PERSON_UPDATED", type, id);

      return response({ success: true, message: "Record updated." });
    }

    // RESIGN OR EXPLICIT PERMANENT DELETE
    if (path === "/api/people/delete" && method === "POST") {
      if (!isManager(session)) return fail("Management access required.", 403);

      const b = await jsonBody(request);
      const type = String(b.person_type || b.type || "EMPLOYEE").toUpperCase();
      const id = String(b.person_id || b.id || "").trim();

      if (!id || !["EMPLOYEE", "INTERN"].includes(type)) {
        return fail("Person type and ID required.");
      }

      if (b.confirm_delete === true) {
        const deleted = await deletePersonPermanently(db, session, type, id);

        if (!deleted) return fail("Person not found.", 404);

        return response({
          success: true,
          message: "Person and linked operational records permanently deleted."
        });
      }

      const t = personTable(type);
      const result = await db.prepare(
        `UPDATE ${t.table} SET status = 'RESIGNED' WHERE ${t.col} = ?`
      ).bind(id).run();

      if (!(result.meta?.changes > 0)) return fail("Person not found.", 404);

      await audit(db, session, "PERSON_MARKED_RESIGNED", type, id);

      return response({
        success: true,
        message: "Record marked RESIGNED. Historical data retained."
      });
    }

    // STAFF DELETION: ADMIN only; protect own and last ADMIN account.
    if (path === "/api/staff/delete" && method === "POST") {
      if (!isManager(session)) return fail("Management access required.", 403);
      if (session.role !== "ADMIN") return fail("Only ADMIN can delete staff accounts.", 403);

      const b = await jsonBody(request);
      const id = String(b.staff_id || b.id || "").trim();

      if (!id) return fail("Staff ID required.");
      if (id === session.id) return fail("You cannot delete your own staff account.", 403);

      const target = await db.prepare(`
        SELECT staff_id, role, status FROM staff
        WHERE staff_id = ? AND status = 'ACTIVE'
      `).bind(id).first();

      if (!target) return fail("Active staff account not found.", 404);

      if (target.role === "ADMIN") {
        const admins = await db.prepare(`
          SELECT COUNT(*) AS n FROM staff
          WHERE role = 'ADMIN' AND status = 'ACTIVE'
        `).first();

        if ((admins?.n || 0) <= 1) {
          return fail("Cannot delete the last active ADMIN account.", 403);
        }
      }

      await audit(db, session, "STAFF_PERMANENTLY_DELETED", "staff", id);
      await db.prepare("DELETE FROM staff WHERE staff_id = ?").bind(id).run();

      return response({ success: true, message: "Staff account permanently deleted." });
    }

    // ROOMS
    if (path === "/api/rooms" && method === "GET") {
      if (!isManager(session)) return fail("Management access required.", 403);

      const rows = await db.prepare(
        "SELECT * FROM rooms ORDER BY block, room_number"
      ).all();

      return response({ success: true, rooms: rows.results || [] });
    }

    if (path === "/api/rooms/update" && method === "POST") {
      if (!isManager(session)) return fail("Management access required.", 403);

      const b = await jsonBody(request);
      const room = String(b.room_number || "").trim();
      const status = String(b.status || "ACTIVE").toUpperCase();

      if (!room) return fail("Room number required.");
      if (!["ACTIVE", "INACTIVE"].includes(status)) return fail("Invalid room status.");

      const result = await db.prepare(
        "UPDATE rooms SET status = ? WHERE room_number = ?"
      ).bind(status, room).run();

      if (!(result.meta?.changes > 0)) return fail("Room not found.", 404);

      return response({ success: true, message: "Room updated." });
    }

    // FOOD QR
    if (path === "/api/food/qr" && method === "GET") {
      if (!isManager(session)) return fail("Management access required.", 403);

      let item = await db.prepare(`
        SELECT qr_token FROM food_qr_config
        WHERE status = 'ACTIVE' ORDER BY id DESC LIMIT 1
      `).first();

      if (!item) {
        const token = randomToken();

        await db.prepare(`
          INSERT INTO food_qr_config (qr_token, status)
          VALUES (?, 'ACTIVE')
        `).bind(token).run();

        item = { qr_token: token };
      }

      return response({ success: true, qr_token: item.qr_token });
    }

    // CAB SCAN WITH DUPLICATE PROTECTION
    if (path === "/api/cab/scan" && method === "POST") {
      if (!isManager(session)) return fail("HR/Management login required.", 403);

      const b = await jsonBody(request);
      const token = String(b.qr_token || b.token || "").trim();

      if (!token) return fail("Scan an employee QR first.");

      const qr = await db.prepare(`
        SELECT * FROM qr_tokens
        WHERE token = ? AND qr_type = 'EMPLOYEE' AND status = 'ACTIVE'
      `).bind(token).first();

      if (!qr) return fail("Invalid or inactive employee QR.", 404);

      const p = await getPerson(db, qr.person_type, qr.person_id);
      if (!p || p.status !== "ACTIVE") return fail("Active person not found.", 404);

      const shift = normalizeShift(p.shift);
      const shiftKey = shift || "UNASSIGNED";
      const d = dateNow();
      const t = timeNow();

      // Unique guard makes repeated scans return a duplicate response.
      const guard = await db.prepare(`
        INSERT OR IGNORE INTO cab_scan_guard
          (person_type, person_id, entry_date, shift_key)
        VALUES (?, ?, ?, ?)
      `).bind(qr.person_type, qr.person_id, d, shiftKey).run();

      if (!(guard.meta?.changes > 0)) {
        return fail(
          `Duplicate cab scan blocked. ${p.name} already has an entry for ${d}, ${shift || "unassigned shift"}.`,
          409
        );
      }

      try {
        await db.prepare(`
          INSERT INTO cab_entries
            (person_type, person_id, name, department, shift, room, entry_date, entry_time)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          qr.person_type, qr.person_id, p.name, p.department,
          shift, p.room || "", d, t
        ).run();
      } catch (error) {
        await db.prepare(`
          DELETE FROM cab_scan_guard
          WHERE person_type = ? AND person_id = ?
            AND entry_date = ? AND shift_key = ?
        `).bind(qr.person_type, qr.person_id, d, shiftKey).run();

        throw error;
      }

      await audit(db, session, "CAB_SCAN", qr.person_type, qr.person_id, {
        date: d,
        shift
      });

      return response({
        success: true,
        message: "Cab entry saved.",
        entry: {
          name: p.name,
          id: qr.person_id,
          department: p.department,
          shift,
          room: p.room || "",
          date: d,
          time: t
        }
      });
    }

    // FOOD SCAN WITH DUPLICATE PROTECTION
    if (path === "/api/food/scan" && method === "POST") {
      if (!isPerson(session)) return fail("Employee/Intern login required.", 403);

      const b = await jsonBody(request);
      const token = String(b.qr_token || b.token || "").trim();
      const meal = String(b.meal_type || "").toUpperCase();

      if (!token) return fail("Scan or enter the Food QR token.");
      if (!MEALS.includes(meal)) return fail("Select Breakfast, Lunch or Dinner.");

      const validQR = await db.prepare(`
        SELECT id FROM food_qr_config
        WHERE qr_token = ? AND status = 'ACTIVE'
        UNION ALL
        SELECT id FROM qr_tokens
        WHERE token = ? AND qr_type = 'FOOD' AND status = 'ACTIVE'
        LIMIT 1
      `).bind(token, token).first();

      if (!validQR) return fail("Invalid or inactive food QR.", 403);

      const p = await getPerson(db, session.person_type, session.id);
      if (!p || p.status !== "ACTIVE") return fail("Active person not found.", 404);

      const d = dateNow();
      const t = timeNow();

      const guard = await db.prepare(`
        INSERT OR IGNORE INTO food_scan_guard
          (person_type, person_id, entry_date, meal_type)
        VALUES (?, ?, ?, ?)
      `).bind(session.person_type, session.id, d, meal).run();

      if (!(guard.meta?.changes > 0)) {
        return fail("Already recorded for this meal today.", 409);
      }

      try {
        await db.prepare(`
          INSERT INTO food_entries
            (person_type, person_id, name, department, meal_type, entry_date, entry_time)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).bind(
          session.person_type, session.id, p.name, p.department, meal, d, t
        ).run();
      } catch (error) {
        await db.prepare(`
          DELETE FROM food_scan_guard
          WHERE person_type = ? AND person_id = ?
            AND entry_date = ? AND meal_type = ?
        `).bind(session.person_type, session.id, d, meal).run();

        throw error;
      }

      await audit(db, session, "FOOD_SCAN", "food", session.id, meal);

      return response({
        success: true,
        message: meal + " recorded successfully."
      });
    }

    // ATTENDANCE
    if (path === "/api/attendance" && method === "GET") {
      if (!isManager(session)) return fail("Management access required.", 403);

      const date = url.searchParams.get("date") || dateNow();
      if (!validDate(date)) return fail("Date must be YYYY-MM-DD.");

      const rows = await db.prepare(`
        SELECT * FROM shift_attendance
        WHERE attendance_date = ?
        ORDER BY department, person_id
      `).bind(date).all();

      return response({
        success: true,
        attendance: rows.results || [],
        date
      });
    }

    if (path === "/api/attendance" && method === "POST") {
      if (!isManager(session)) return fail("Management access required.", 403);

      const b = await jsonBody(request);
      const type = String(b.person_type || "EMPLOYEE").toUpperCase();
      const id = String(b.person_id || "").trim();
      const shift = normalizeShift(b.shift);
      const status = String(b.attendance_status || b.status || "").toUpperCase();
      const date = String(b.attendance_date || dateNow());

      if (!["EMPLOYEE", "INTERN"].includes(type) || !id) {
        return fail("Person type and ID required.");
      }

      if (!shift || !["PRESENT", "ABSENT", "N/A"].includes(status)) {
        return fail("Invalid shift or attendance status.");
      }

      if (!validDate(date)) return fail("Date must be YYYY-MM-DD.");

      const p = await getPerson(db, type, id);
      if (!p) return fail("Person not found.", 404);

      const old = await db.prepare(`
        SELECT id FROM shift_attendance
        WHERE person_type = ? AND person_id = ?
          AND attendance_date = ? AND shift = ?
        LIMIT 1
      `).bind(type, id, date, shift).first();

      if (old) {
        await db.prepare(`
          UPDATE shift_attendance
          SET attendance_status = ?, department = ?, room = ?
          WHERE id = ?
        `).bind(status, p.department, p.room || "", old.id).run();
      } else {
        await db.prepare(`
          INSERT INTO shift_attendance
            (person_type, person_id, attendance_date, shift,
             attendance_status, department, room)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).bind(type, id, date, shift, status, p.department, p.room || "").run();
      }

      await audit(db, session, "ATTENDANCE_SAVED", type, id, {
        date, shift, status
      });

      return response({ success: true, message: "Attendance saved." });
    }

    // REPORTS: month summary + shift/department filters + weekly employee detail.
    if (path === "/api/reports" && method === "GET") {
      if (!isManager(session)) return fail("Management access required.", 403);

      const month = url.searchParams.get("month") || dateNow().slice(0, 7);
      const date = url.searchParams.get("date") || "";
      const shiftInput = url.searchParams.get("shift") || "";
      const department = (url.searchParams.get("department") || "").toUpperCase();
      const weekStart = url.searchParams.get("week_start") || "";

      if (!/^\d{4}-\d{2}$/.test(month)) return fail("Month must be YYYY-MM.");
      if (date && !validDate(date)) return fail("Date must be YYYY-MM-DD.");
      if (weekStart && !validDate(weekStart)) return fail("week_start must be YYYY-MM-DD.");

      const shift = shiftInput ? normalizeShift(shiftInput) : "";
      if (shiftInput && !shift) return fail("Invalid shift filter.");
      if (department && !DEPARTMENTS.includes(department)) {
        return fail("Invalid department filter.");
      }

      const [food, dailyFood, cab, attendance, cabShift] = await Promise.all([
        db.prepare(`
          SELECT meal_type, COUNT(*) AS total
          FROM food_entries
          WHERE substr(entry_date, 1, 7) = ?
          GROUP BY meal_type
        `).bind(month).all(),

        db.prepare(`
          SELECT entry_date, meal_type, COUNT(*) AS total
          FROM food_entries
          WHERE substr(entry_date, 1, 7) = ?
          GROUP BY entry_date, meal_type
          ORDER BY entry_date, meal_type
        `).bind(month).all(),

        db.prepare(`
          SELECT entry_date, COUNT(*) AS total
          FROM cab_entries
          WHERE substr(entry_date, 1, 7) = ?
          GROUP BY entry_date
          ORDER BY entry_date
        `).bind(month).all(),

        db.prepare(`
          SELECT attendance_date, shift, attendance_status, COUNT(*) AS total
          FROM shift_attendance
          WHERE substr(attendance_date, 1, 7) = ?
          GROUP BY attendance_date, shift, attendance_status
          ORDER BY attendance_date, shift
        `).bind(month).all(),

        db.prepare(`
          SELECT entry_date AS date,
            CASE
              WHEN UPPER(REPLACE(TRIM(COALESCE(shift,'')), ' ', ''))
                IN ('S1','SHIFT1','1') THEN 'SHIFT 1'
              WHEN UPPER(REPLACE(TRIM(COALESCE(shift,'')), ' ', ''))
                IN ('S2','SHIFT2','2') THEN 'SHIFT 2'
              WHEN UPPER(REPLACE(TRIM(COALESCE(shift,'')), ' ', ''))
                IN ('S3','SHIFT3','3') THEN 'SHIFT 3'
              ELSE 'UNASSIGNED'
            END AS shift,
            department,
            COUNT(*) AS cab_count
          FROM cab_entries
          WHERE substr(entry_date, 1, 7) = ?
          GROUP BY entry_date, shift, department
          ORDER BY entry_date, shift, department
        `).bind(month).all()
      ]);

      // Daily attendance detail when date/shift/department filters are supplied.
      let attendanceDetail = [];
      if (date || shift || department) {
        const conditions = [];
        const args = [];

        if (date) {
          conditions.push("attendance_date = ?");
          args.push(date);
        } else {
          conditions.push("substr(attendance_date, 1, 7) = ?");
          args.push(month);
        }

        if (shift) {
          conditions.push("shift = ?");
          args.push(shift);
        }

        if (department) {
          conditions.push("department = ?");
          args.push(department);
        }

        const rows = await db.prepare(`
          SELECT * FROM shift_attendance
          WHERE ${conditions.join(" AND ")}
          ORDER BY attendance_date, shift, department, person_id
        `).bind(...args).all();

        attendanceDetail = rows.results || [];
      }

      // Compare cab scans with recorded PRESENT attendance, without creating records.
      const cabVsAttendance = [];

      for (const c of (cabShift.results || [])) {
        if (shift && c.shift !== shift) continue;
        if (department && c.department !== department) continue;

        const attendanceRow = await db.prepare(`
          SELECT COUNT(*) AS total
          FROM shift_attendance
          WHERE attendance_date = ?
            AND shift = ?
            AND attendance_status = 'PRESENT'
            AND (? = '' OR department = ?)
        `).bind(
          c.date, c.shift, c.department || "", c.department || ""
        ).first();

        cabVsAttendance.push({
          date: c.date,
          shift: c.shift,
          department: c.department,
          cab_count: c.cab_count,
          attendance_present_count: attendanceRow?.total || 0,
          difference: c.cab_count - (attendanceRow?.total || 0)
        });
      }

      // Weekly person-level rows. No attendance record is labelled NOT RECORDED,
      // never automatically ABSENT.
      let weeklyPeople = [];

      if (weekStart) {
        const rows = await db.prepare(`
          SELECT p.person_type, p.person_id, p.name, p.department,
                 p.shift AS current_shift, p.room, p.hostel_status,
                 p.account_status, a.attendance_date, a.shift AS attendance_shift,
                 a.attendance_status
          FROM (
            SELECT 'EMPLOYEE' AS person_type, employee_id AS person_id,
                   name, department, shift, room, hostel_status, status AS account_status
            FROM employees
            UNION ALL
            SELECT 'INTERN', intern_id, name, department,
                   shift, room, hostel_status, status
            FROM interns
          ) p
          LEFT JOIN shift_attendance a
            ON a.person_type = p.person_type
            AND a.person_id = p.person_id
            AND a.attendance_date >= ?
            AND a.attendance_date < date(?, '+7 days')
          ORDER BY p.department, p.name, a.attendance_date
        `).bind(weekStart, weekStart).all();

        weeklyPeople = (rows.results || []).map(r => ({
          ...r,
          day_status: !r.attendance_date
            ? "NOT RECORDED"
            : r.attendance_status === "PRESENT"
              ? "PRESENT"
              : r.attendance_status === "ABSENT"
                ? "ABSENT"
                : r.attendance_status === "N/A"
                  ? "N/A"
                  : "NOT RECORDED"
        }));
      }

      return response({
        success: true,
        month,
        date: date || null,
        shift: shift || null,
        department: department || null,
        week_start: weekStart || null,
        food: food.results || [],
        daily_food: dailyFood.results || [],
        cab: cab.results || [],
        attendance: attendance.results || [],
        cab_shift: cabShift.results || [],
        cab_vs_attendance: cabVsAttendance,
        attendance_detail: attendanceDetail,
        weekly_people: weeklyPeople
      });
    }

    // EXPORT DATA
    if (path === "/api/export" && method === "GET") {
      if (!isManager(session)) return fail("Management access required.", 403);

      const type = String(url.searchParams.get("type") || "employees").toLowerCase();
      const date = url.searchParams.get("date") || "";
      const month = url.searchParams.get("month") || "";
      const shiftInput = url.searchParams.get("shift") || "";
      const department = (url.searchParams.get("department") || "").toUpperCase();

      const allowed = {
        employees: "SELECT * FROM employees ORDER BY name",
        interns: "SELECT * FROM interns ORDER BY name",
        rooms: "SELECT * FROM rooms ORDER BY block, room_number",
        food: "SELECT * FROM food_entries ORDER BY id DESC LIMIT 10000",
        cab: "SELECT * FROM cab_entries ORDER BY id DESC LIMIT 10000",
        attendance: "SELECT * FROM shift_attendance ORDER BY id DESC LIMIT 10000",
        requests: "SELECT * FROM hr_requests ORDER BY id DESC LIMIT 10000",
        staff: "SELECT staff_id, name, mobile, role, status, created_at FROM staff ORDER BY name"
      };

      if (!allowed[type]) return fail("Unsupported export type.");
      if (date && !validDate(date)) return fail("Date must be YYYY-MM-DD.");
      if (month && !/^\d{4}-\d{2}$/.test(month)) return fail("Month must be YYYY-MM.");

      if (type === "cab" && date) {
        const rows = await db.prepare(`
          SELECT * FROM cab_entries WHERE entry_date = ?
          ORDER BY shift, department, name
        `).bind(date).all();

        return response({ success: true, type, filters: { date }, rows: rows.results || [] });
      }

      if (type === "attendance" && date) {
        const rows = await db.prepare(`
          SELECT * FROM shift_attendance WHERE attendance_date = ?
          ORDER BY shift, department, person_id
        `).bind(date).all();

        return response({ success: true, type, filters: { date }, rows: rows.results || [] });
      }

      if (type === "attendance" && month) {
        const rows = await db.prepare(`
          SELECT * FROM shift_attendance
          WHERE substr(attendance_date, 1, 7) = ?
          ORDER BY attendance_date, shift, department, person_id
        `).bind(month).all();

        return response({ success: true, type, filters: { month }, rows: rows.results || [] });
      }

      const result = await db.prepare(allowed[type]).all();
      let rows = result.results || [];

      if (shiftInput && ["cab", "attendance"].includes(type)) {
        const wanted = normalizeShift(shiftInput);
        if (!wanted) return fail("Invalid shift filter.");

        rows = rows.filter(r => normalizeShift(r.shift) === wanted);
      }

      if (department && ["cab", "attendance"].includes(type)) {
        if (!DEPARTMENTS.includes(department)) return fail("Invalid department filter.");
        rows = rows.filter(r => String(r.department || "").toUpperCase() === department);
      }

      return response({ success: true, type, rows });
    }

    // HOSTEL HISTORY
    if (path === "/api/history" && method === "GET") {
      if (!isManager(session)) return fail("Management access required.", 403);

      const id = url.searchParams.get("person_id");
      const rows = id
        ? await db.prepare(`
            SELECT * FROM hostel_status_history
            WHERE person_id = ? ORDER BY id DESC LIMIT 200
          `).bind(id).all()
        : await db.prepare(`
            SELECT * FROM hostel_status_history
            ORDER BY id DESC LIMIT 500
          `).all();

      return response({ success: true, history: rows.results || [] });
    }

    // Cleanup deliberately disabled until a verified weekly export workflow exists.
    if (path === "/api/admin/cleanup" && method === "POST") {
      if (!isManager(session)) return fail("Management access required.", 403);

      await audit(
        db, session, "CLEANUP_BLOCKED", "records", "",
        "Cleanup disabled pending verified weekly export workflow"
      );

      return response({
        success: false,
        cleanup_disabled: true,
        message: "Cleanup is disabled to protect records. Export and verify reports before cleanup."
      }, 409);
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
    // No scheduled deletion. Cab, food and attendance data are preserved.
    return;
  }
};
