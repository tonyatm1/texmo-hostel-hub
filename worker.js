
const VERSION = "TEXMO-HOSTEL-HUB-5.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization"
};

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });

const fail = (message, status = 400) =>
  json({ success: false, message }, status);

const nowIndia = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());

  const p = Object.fromEntries(parts.map(x => [x.type, x.value]));
  const date = `${p.year}-${p.month}-${p.day}`;
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).format(new Date());

  return { date, time };
};

const randomToken = () => crypto.randomUUID() + crypto.randomUUID();

const encode64 = bytes => {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const decode64 = value => {
  const s = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(s + "=".repeat((4 - s.length % 4) % 4));
  return Uint8Array.from(binary, c => c.charCodeAt(0));
};

async function passwordHash(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits({
    name: "PBKDF2",
    salt,
    iterations: 150000,
    hash: "SHA-256"
  }, key, 256);

  return `pbkdf2$${encode64(salt)}$${encode64(new Uint8Array(bits))}`;
}

async function passwordVerify(password, stored) {
  if (!stored) return false;

  // Allow existing legacy passwords to log in once, then upgrade the hash.
  if (!stored.startsWith("pbkdf2$")) {
    return password === stored;
  }

  try {
    const [, saltText, hashText] = stored.split("$");
    const salt = decode64(saltText);
    const expected = decode64(hashText);
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(password),
      "PBKDF2",
      false,
      ["deriveBits"]
    );
    const bits = new Uint8Array(await crypto.subtle.deriveBits({
      name: "PBKDF2",
      salt,
      iterations: 150000,
      hash: "SHA-256"
    }, key, 256));

    if (bits.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < bits.length; i++) diff |= bits[i] ^ expected[i];
    return diff === 0;
  } catch {
    return false;
  }
}

async function signingKey(env) {
  const secret = env.TEXMO_MASTER_KEY;
  if (!secret || secret.length < 16) {
    throw new Error("TEXMO_MASTER_KEY secret is missing or too short.");
  }

  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

async function makeSession(env, claims) {
  const payload = encode64(new TextEncoder().encode(JSON.stringify({
    ...claims,
    exp: Date.now() + 12 * 60 * 60 * 1000
  })));

  const key = await signingKey(env);
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload)
  );

  return `${payload}.${encode64(new Uint8Array(sig))}`;
}

async function readSession(request, env) {
  const auth = request.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token || !token.includes(".")) return null;

  try {
    const [payload, signature] = token.split(".");
    const key = await signingKey(env);
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      decode64(signature),
      new TextEncoder().encode(payload)
    );
    if (!valid) return null;

    const claims = JSON.parse(new TextDecoder().decode(decode64(payload)));
    if (!claims.exp || claims.exp < Date.now()) return null;
    return claims;
  } catch {
    return null;
  }
}

async function bodyOf(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

async function ensureRequestsTable(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS hr_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      person_type TEXT NOT NULL CHECK(person_type IN ('EMPLOYEE','INTERN')),
      person_id TEXT NOT NULL,
      name TEXT NOT NULL,
      request_type TEXT NOT NULL,
      from_date TEXT,
      to_date TEXT,
      remarks TEXT,
      status TEXT NOT NULL DEFAULT 'PENDING'
        CHECK(status IN ('PENDING','APPROVED','REJECTED')),
      hr_remarks TEXT,
      reviewed_by TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function audit(db, actorType, actorId, action, targetType, targetId, details = "") {
  try {
    await db.prepare(`
      INSERT INTO audit_logs
      (actor_type, actor_id, action, target_type, target_id, details)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      actorType, actorId || null, action, targetType || null,
      targetId == null ? null : String(targetId), details
    ).run();
  } catch {
    // Audit logging must not break the main operation.
  }
}

async function createPersonQr(db, personType, personId) {
  const existing = await db.prepare(`
    SELECT token FROM qr_tokens
    WHERE qr_type='EMPLOYEE' AND person_type=? AND person_id=?
      AND status='ACTIVE' LIMIT 1
  `).bind(personType, personId).first();

  if (existing) return existing.token;

  const token = randomToken();
  await db.prepare(`
    INSERT INTO qr_tokens (token, qr_type, person_type, person_id, status)
    VALUES (?, 'EMPLOYEE', ?, ?, 'ACTIVE')
  `).bind(token, personType, personId).run();

  return token;
}

async function getPerson(db, personType, personId) {
  const table = personType === "INTERN" ? "interns" : "employees";
  const idColumn = personType === "INTERN" ? "intern_id" : "employee_id";

  return db.prepare(`
    SELECT id, ${idColumn} AS person_id, name, department, designation,
           mobile, shift, room, hostel_status, status
    FROM ${table} WHERE ${idColumn}=? LIMIT 1
  `).bind(personId).first();
}

function isManager(session) {
  return session && session.kind === "STAFF" &&
    ["HR", "MANAGEMENT", "ADMIN"].includes(session.role);
}

function isPerson(session) {
  return session && session.kind === "PERSON" &&
    ["EMPLOYEE", "INTERN"].includes(session.personType);
}

async function requireStaff(request, env) {
  const session = await readSession(request, env);
  return isManager(session) ? session : null;
}

async function requirePerson(request, env) {
  const session = await readSession(request, env);
  return isPerson(session) ? session : null;
}

async function handle(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  if (method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const db = env.DB;
  if (!db) return fail("D1 binding DB is missing.", 500);

  try {
    await ensureRequestsTable(db);

    if (method === "GET" && path === "/") {
      return json({
        success: true,
        app: "TEXMO Hostel Hub",
        version: VERSION,
        status: "online"
      });
    }

    if (method === "GET" && path === "/api/db-test") {
      const result = await db.prepare("SELECT 1 AS ok").first();
      return json({ success: result?.ok === 1, version: VERSION });
    }

    // STAFF REGISTRATION
    if (method === "POST" && path === "/api/staff/register") {
      const b = await bodyOf(request);
      const name = String(b.name || "").trim();
      const staffId = String(b.staff_id || b.staffId || "").trim();
      const mobile = String(b.mobile || "").trim();
      const password = String(b.password || "");
      const role = String(b.role || "").toUpperCase();
      const masterKey = String(b.master_key || b.masterKey || "");

      if (!name || !staffId || !mobile || password.length < 8) {
        return fail("Name, Staff ID, mobile and password (minimum 8 characters) are required.");
      }
      if (!["HR", "MANAGEMENT", "ADMIN"].includes(role)) {
        return fail("Invalid staff role.");
      }
      if (!env.TEXMO_MASTER_KEY || masterKey !== env.TEXMO_MASTER_KEY) {
        return fail("Invalid master key.", 403);
      }

      const exists = await db.prepare(
        "SELECT id FROM staff WHERE staff_id=? LIMIT 1"
      ).bind(staffId).first();
      if (exists) return fail("Staff ID already registered.", 409);

      await db.prepare(`
        INSERT INTO staff (name, staff_id, mobile, password, role, status)
        VALUES (?, ?, ?, ?, ?, 'ACTIVE')
      `).bind(name, staffId, mobile, await passwordHash(password), role).run();

      await audit(db, "STAFF", staffId, "REGISTER", "STAFF", staffId);
      return json({ success: true, message: "Staff registered successfully." });
    }

    // STAFF LOGIN
    if (method === "POST" && path === "/api/staff/login") {
      const b = await bodyOf(request);
      const staffId = String(b.staff_id || b.staffId || "").trim();
      const password = String(b.password || "");

      const staff = await db.prepare(`
        SELECT staff_id, name, mobile, password, role, status
        FROM staff WHERE staff_id=? LIMIT 1
      `).bind(staffId).first();

      if (!staff || staff.status !== "ACTIVE" ||
          !(await passwordVerify(password, staff.password))) {
        return fail("Incorrect Staff ID or password.", 401);
      }

      if (!staff.password.startsWith("pbkdf2$")) {
        await db.prepare("UPDATE staff SET password=? WHERE staff_id=?")
          .bind(await passwordHash(password), staffId).run();
      }

      const token = await makeSession(env, {
        kind: "STAFF", staffId: staff.staff_id, name: staff.name, role: staff.role
      });

      return json({
        success: true,
        token,
        user: {
          name: staff.name, id: staff.staff_id, role: staff.role, kind: "STAFF"
        }
      });
    }

    // EMPLOYEE / INTERN SELF-REGISTRATION
    if (method === "POST" && path === "/api/person/register") {
      const b = await bodyOf(request);
      const personType = String(b.person_type || b.personType || "EMPLOYEE").toUpperCase();
      const personId = String(b.person_id || b.personId || b.employee_id || b.intern_id || "").trim();
      const name = String(b.name || "").trim();
      const mobile = String(b.mobile || "").trim();
      const department = String(b.department || "").toUpperCase().trim();
      const password = String(b.password || "");
      const shift = String(b.shift || "").trim();

      if (!["EMPLOYEE", "INTERN"].includes(personType)) return fail("Invalid account type.");
      if (!personId || !name || !mobile || password.length < 8) {
        return fail("ID, name, mobile and password (minimum 8 characters) are required.");
      }
      if (!["PDN", "PDN2", "PDN3", "MDN"].includes(department)) {
        return fail("Select a valid department.");
      }

      const table = personType === "INTERN" ? "interns" : "employees";
      const idColumn = personType === "INTERN" ? "intern_id" : "employee_id";
      const exists = await db.prepare(
        `SELECT id FROM ${table} WHERE ${idColumn}=? LIMIT 1`
      ).bind(personId).first();

      if (exists) return fail("This ID is already registered. Please log in or contact HR.", 409);

      await db.prepare(`
        INSERT INTO ${table}
          (${idColumn}, name, department, mobile, password, shift, hostel_status, status)
        VALUES (?, ?, ?, ?, ?, ?, 'IN', 'ACTIVE')
      `).bind(
        personId, name, department, mobile, await passwordHash(password), shift || null
      ).run();

      const qr = await createPersonQr(db, personType, personId);
      await audit(db, personType, personId, "SELF_REGISTER", personType, personId);

      return json({
        success: true,
        message: "Registration successful. You can now log in.",
        qr_token: qr
      });
    }

    // EMPLOYEE / INTERN LOGIN
    if (method === "POST" && path === "/api/person/login") {
      const b = await bodyOf(request);
      const personType = String(b.person_type || b.personType || "EMPLOYEE").toUpperCase();
      const personId = String(b.person_id || b.personId || b.employee_id || b.intern_id || "").trim();
      const password = String(b.password || "");

      if (!["EMPLOYEE", "INTERN"].includes(personType)) return fail("Invalid account type.");

      const table = personType === "INTERN" ? "interns" : "employees";
      const idColumn = personType === "INTERN" ? "intern_id" : "employee_id";
      const person = await db.prepare(`
        SELECT ${idColumn} AS person_id, name, password, status
        FROM ${table} WHERE ${idColumn}=? LIMIT 1
      `).bind(personId).first();

      if (!person || person.status !== "ACTIVE" ||
          !(await passwordVerify(password, person.password))) {
        return fail("Incorrect ID or password, or account inactive.", 401);
      }

      if (!person.password.startsWith("pbkdf2$")) {
        await db.prepare(`UPDATE ${table} SET password=? WHERE ${idColumn}=?`)
          .bind(await passwordHash(password), personId).run();
      }

      const qr = await createPersonQr(db, personType, personId);
      const token = await makeSession(env, {
        kind: "PERSON",
        personType,
        personId: person.person_id,
        name: person.name
      });

      return json({
        success: true,
        token,
        qr_token: qr,
        user: {
          name: person.name,
          id: person.person_id,
          kind: personType
        }
      });
    }

    // ALL ROUTES BELOW REQUIRE A VALID SESSION.

    if (method === "GET" && path === "/api/me") {
      const personSession = await requirePerson(request, env);
      if (personSession) {
        const person = await getPerson(db, personSession.personType, personSession.personId);
        if (!person) return fail("Account not found.", 404);
        return json({ success: true, user: person, qr_token: await createPersonQr(
          db, personSession.personType, personSession.personId
        ) });
      }

      const staffSession = await requireStaff(request, env);
      if (staffSession) return json({ success: true, user: staffSession });
      return fail("Please log in again.", 401);
    }

    // STAFF-ONLY ROUTES
    const staff = await requireStaff(request, env);

    if (method === "GET" && path === "/api/dashboard") {
      if (!staff) return fail("Staff login required.", 401);

      const [employees, interns, rooms, requests, cab, food] = await Promise.all([
        db.prepare("SELECT COUNT(*) AS n FROM employees WHERE status='ACTIVE'").first(),
        db.prepare("SELECT COUNT(*) AS n FROM interns WHERE status='ACTIVE'").first(),
        db.prepare("SELECT COUNT(*) AS n FROM rooms WHERE status='ACTIVE'").first(),
        db.prepare("SELECT COUNT(*) AS n FROM hr_requests WHERE status='PENDING'").first(),
        db.prepare("SELECT COUNT(*) AS n FROM cab_entries WHERE entry_date=?").bind(nowIndia().date).first(),
        db.prepare("SELECT COUNT(*) AS n FROM food_entries WHERE entry_date=?").bind(nowIndia().date).first()
      ]);

      return json({
        success: true,
        employees: employees.n,
        interns: interns.n,
        rooms: rooms.n,
        pending_requests: requests.n,
        cab_today: cab.n,
        food_today: food.n
      });
    }

    if (method === "GET" && path === "/api/people") {
      if (!staff) return fail("Staff login required.", 401);

      const employees = await db.prepare(`
        SELECT employee_id AS person_id, name, department, designation, mobile,
               shift, room, hostel_status, status, 'EMPLOYEE' AS person_type
        FROM employees ORDER BY name
      `).all();

      const interns = await db.prepare(`
        SELECT intern_id AS person_id, name, department, designation, mobile,
               shift, room, hostel_status, status, 'INTERN' AS person_type
        FROM interns ORDER BY name
      `).all();

      return json({ success: true, people: [...employees.results, ...interns.results] });
    }

    if (method === "POST" && path === "/api/people") {
      if (!staff) return fail("Staff login required.", 401);
      const b = await bodyOf(request);
      const personType = String(b.person_type || "EMPLOYEE").toUpperCase();
      const personId = String(b.person_id || "").trim();
      const name = String(b.name || "").trim();
      const department = String(b.department || "").toUpperCase();
      const mobile = String(b.mobile || "").trim();

      if (!["EMPLOYEE", "INTERN"].includes(personType) ||
          !personId || !name || !mobile ||
          !["PDN", "PDN2", "PDN3", "MDN"].includes(department)) {
        return fail("Check person type, ID, name, mobile and department.");
      }

      const table = personType === "INTERN" ? "interns" : "employees";
      const idColumn = personType === "INTERN" ? "intern_id" : "employee_id";
      const exists = await db.prepare(
        `SELECT id FROM ${table} WHERE ${idColumn}=?`
      ).bind(personId).first();
      if (exists) return fail("ID already exists.", 409);

      const password = String(b.password || randomToken());
      await db.prepare(`
        INSERT INTO ${table}
        (${idColumn}, name, department, designation, mobile, password, shift, room,
         hostel_status, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'IN', 'ACTIVE')
      `).bind(
        personId, name, department, b.designation || null, mobile,
        await passwordHash(password), b.shift || null, b.room || null
      ).run();

      await createPersonQr(db, personType, personId);
      await audit(db, staff.role, staff.staffId, "CREATE_PERSON", personType, personId);
      return json({ success: true, message: "Person added." });
    }

    if (method === "POST" && path === "/api/people/update") {
      if (!staff) return fail("Staff login required.", 401);
      const b = await bodyOf(request);
      const personType = String(b.person_type || "EMPLOYEE").toUpperCase();
      const personId = String(b.person_id || "").trim();
      if (!["EMPLOYEE", "INTERN"].includes(personType) || !personId) return fail("Invalid person.");

      const table = personType === "INTERN" ? "interns" : "employees";
      const idColumn = personType === "INTERN" ? "intern_id" : "employee_id";
      const current = await db.prepare(
        `SELECT id FROM ${table} WHERE ${idColumn}=?`
      ).bind(personId).first();
      if (!current) return fail("Person not found.", 404);

      const allowed = ["name", "department", "designation", "mobile", "shift", "room", "hostel_status", "status"];
      const sets = [];
      const values = [];
      for (const key of allowed) {
        if (b[key] !== undefined) {
          sets.push(`${key}=?`);
          values.push(b[key]);
        }
      }
      if (!sets.length) return fail("No fields to update.");
      if (b.department !== undefined &&
          !["PDN", "PDN2", "PDN3", "MDN"].includes(String(b.department).toUpperCase())) {
        return fail("Invalid department.");
      }
      if (b.hostel_status !== undefined &&
          !["IN", "OUT/LEAVE", "VACATED"].includes(b.hostel_status)) {
        return fail("Invalid hostel status.");
      }
      if (b.status !== undefined && !["ACTIVE", "RESIGNED"].includes(b.status)) {
        return fail("Invalid person status.");
      }

      values.push(personId);
      await db.prepare(`UPDATE ${table} SET ${sets.join(", ")} WHERE ${idColumn}=?`)
        .bind(...values).run();
      await audit(db, staff.role, staff.staffId, "UPDATE_PERSON", personType, personId);
      return json({ success: true, message: "Person updated." });
    }

    if (method === "POST" && path === "/api/people/delete") {
      if (!staff) return fail("Staff login required.", 401);
      const b = await bodyOf(request);
      const type = String(b.person_type || "EMPLOYEE").toUpperCase();
      const id = String(b.person_id || "").trim();
      if (!["EMPLOYEE", "INTERN"].includes(type) || !id) return fail("Invalid person.");

      const table = type === "INTERN" ? "interns" : "employees";
      const idColumn = type === "INTERN" ? "intern_id" : "employee_id";
      await db.prepare(`UPDATE ${table} SET status='RESIGNED' WHERE ${idColumn}=?`)
        .bind(id).run();
      await db.prepare(`
        UPDATE qr_tokens SET status='INACTIVE'
        WHERE person_type=? AND person_id=? AND qr_type='EMPLOYEE'
      `).bind(type, id).run();

      await audit(db, staff.role, staff.staffId, "RESIGN_PERSON", type, id);
      return json({ success: true, message: "Person marked resigned." });
    }

    if (method === "POST" && path === "/api/hostel/status") {
      if (!staff) return fail("Staff login required.", 401);
      const b = await bodyOf(request);
      const type = String(b.person_type || "EMPLOYEE").toUpperCase();
      const id = String(b.person_id || "").trim();
      const status = String(b.status || "").toUpperCase();

      if (!["EMPLOYEE", "INTERN"].includes(type) ||
          !["IN", "OUT/LEAVE", "VACATED"].includes(status)) {
        return fail("Invalid hostel status.");
      }

      const table = type === "INTERN" ? "interns" : "employees";
      const idColumn = type === "INTERN" ? "intern_id" : "employee_id";
      const person = await db.prepare(
        `SELECT name FROM ${table} WHERE ${idColumn}=?`
      ).bind(id).first();
      if (!person) return fail("Person not found.", 404);

      const { date } = nowIndia();
      await db.prepare(`UPDATE ${table} SET hostel_status=? WHERE ${idColumn}=?`)
        .bind(status, id).run();
      await db.prepare(`
        INSERT INTO hostel_status_history
        (person_type, person_id, status, out_date, return_date, remarks)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(
        type, id, status,
        status === "OUT/LEAVE" ? date : null,
        status === "IN" ? date : null,
        b.remarks || null
      ).run();

      return json({ success: true });
    }

    if (method === "POST" && path === "/api/shift/update") {
      const personSession = await requirePerson(request, env);
      const b = await bodyOf(request);
      const type = personSession ? personSession.personType :
        String(b.person_type || "EMPLOYEE").toUpperCase();
      const id = personSession ? personSession.personId : String(b.person_id || "").trim();
      const shift = String(b.shift || "").toUpperCase();

      if (!personSession && !staff) return fail("Login required.", 401);
      if (personSession && b.person_id && b.person_id !== personSession.personId) {
        return fail("You can update only your own shift.", 403);
      }
      if (!["SHIFT 1", "SHIFT 2", "SHIFT 3"].includes(shift)) {
        return fail("Invalid shift.");
      }

      const table = type === "INTERN" ? "interns" : "employees";
      const idColumn = type === "INTERN" ? "intern_id" : "employee_id";
      const result = await db.prepare(`UPDATE ${table} SET shift=? WHERE ${idColumn}=?`)
        .bind(shift, id).run();
      if (!result.meta.changes) return fail("Person not found.", 404);

      return json({ success: true, message: "Shift updated." });
    }

    if (method === "GET" && path === "/api/rooms") {
      if (!staff) return fail("Staff login required.", 401);
      const rows = await db.prepare("SELECT * FROM rooms ORDER BY room_number").all();
      return json({ success: true, rooms: rows.results });
    }

    if (method === "POST" && path === "/api/rooms") {
      if (!staff) return fail("Staff login required.", 401);
      const b = await bodyOf(request);
      const room = String(b.room_number || b.room || "").toUpperCase().trim();
      if (!/^[A-D][1-8]$/.test(room) ||
          (room.startsWith("A") && Number(room.slice(1)) > 4) ||
          (room.startsWith("D") && Number(room.slice(1)) > 4)) {
        return fail("Room must be A1-A4, B1-B8, C1-C8 or D1-D4.");
      }

      const block = room[0];
      const status = b.status === "INACTIVE" ? "INACTIVE" : "ACTIVE";
      try {
        await db.prepare(`
          INSERT INTO rooms (room_number, block, status) VALUES (?, ?, ?)
          ON CONFLICT(room_number) DO UPDATE SET block=excluded.block, status=excluded.status
        `).bind(room, block, status).run();
      } catch {
        return fail("Could not save room.", 500);
      }
      return json({ success: true });
    }

    // HR SCANS A PERSON'S QR FOR CAB ENTRY.
    if (method === "POST" && path === "/api/cab/scan") {
      if (!staff) return fail("HR login required.", 401);
      const b = await bodyOf(request);
      const personQr = String(b.person_qr || b.qr_token || "").trim();
      if (!personQr) return fail("Scan the employee/intern QR first.");

      const qr = await db.prepare(`
        SELECT person_type, person_id FROM qr_tokens
        WHERE token=? AND qr_type='EMPLOYEE' AND status='ACTIVE' LIMIT 1
      `).bind(personQr).first();
      if (!qr) return fail("Invalid or inactive person QR.", 404);

      const person = await getPerson(db, qr.person_type, qr.person_id);
      if (!person || person.status !== "ACTIVE") return fail("Active person not found.", 404);

      const { date, time } = nowIndia();
      await db.prepare(`
        INSERT INTO cab_entries
        (person_type, person_id, name, department, shift, room, entry_date, entry_time)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        qr.person_type, qr.person_id, person.name, person.department,
        person.shift || null, person.room || null, date, time
      ).run();

      await audit(db, staff.role, staff.staffId, "CAB_SCAN", qr.person_type, qr.person_id);
      return json({
        success: true,
        message: "Cab entry saved.",
        entry: {
          name: person.name, id: qr.person_id, department: person.department,
          shift: person.shift, room: person.room, date, time
        }
      });
    }

    if (method === "GET" && path === "/api/cab") {
      if (!staff) return fail("Staff login required.", 401);
      const date = url.searchParams.get("date") || nowIndia().date;
      const rows = await db.prepare(`
        SELECT * FROM cab_entries WHERE entry_date=?
        ORDER BY entry_time DESC
      `).bind(date).all();
      return json({ success: true, entries: rows.results });
    }

    // FOOD QR: HR DISPLAYS THIS QR; EMPLOYEES/INTERNS SCAN IT.
    if (method === "GET" && path === "/api/food/qr") {
      if (!staff) return fail("Staff login required.", 401);
      let config = await db.prepare(`
        SELECT qr_token FROM food_qr_config WHERE status='ACTIVE' ORDER BY id DESC LIMIT 1
      `).first();

      if (!config) {
        const token = randomToken();
        await db.prepare(`
          INSERT INTO food_qr_config (qr_token, status) VALUES (?, 'ACTIVE')
        `).bind(token).run();
        config = { qr_token: token };
      }

      return json({
        success: true,
        qr_token: config.qr_token,
        scan_url: `${url.origin}/?food=${encodeURIComponent(config.qr_token)}`
      });
    }

    if (method === "POST" && path === "/api/food/scan") {
      const personSession = await requirePerson(request, env);
      if (!personSession) return fail("Employee/intern login required.", 401);

      const b = await bodyOf(request);
      const foodToken = String(b.food_token || b.qr_token || "").trim();
      const meal = String(b.meal_type || "").toUpperCase();
      if (!foodToken) return fail("Scan the active food QR.");
      if (!["BREAKFAST", "LUNCH", "DINNER"].includes(meal)) {
        return fail("Select Breakfast, Lunch or Dinner.");
      }

      const config = await db.prepare(`
        SELECT id FROM food_qr_config
        WHERE qr_token=? AND status='ACTIVE' LIMIT 1
      `).bind(foodToken).first();
      if (!config) return fail("Invalid or inactive food QR.", 403);

      const person = await getPerson(
        db, personSession.personType, personSession.personId
      );
      if (!person || person.status !== "ACTIVE") return fail("Account is inactive.", 403);

      const { date, time } = nowIndia();
      const duplicate = await db.prepare(`
        SELECT id FROM food_entries
        WHERE person_type=? AND person_id=? AND meal_type=? AND entry_date=?
        LIMIT 1
      `).bind(personSession.personType, personSession.personId, meal, date).first();

      if (duplicate) {
        return fail(`Your ${meal.toLowerCase()} entry is already recorded today.`, 409);
      }

      await db.prepare(`
        INSERT INTO food_entries
        (person_type, person_id, name, department, meal_type, entry_date, entry_time)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(
        personSession.personType, personSession.personId, person.name,
        person.department, meal, date, time
      ).run();

      await audit(
        db, personSession.personType, personSession.personId,
        "FOOD_SCAN", "FOOD", meal
      );

      return json({
        success: true,
        message: `${meal} entry saved.`,
        entry: {
          name: person.name, id: personSession.personId,
          count: 1, meal, date, time
        }
      });
    }

    if (method === "GET" && path === "/api/food") {
      if (!staff) return fail("Staff login required.", 401);
      const date = url.searchParams.get("date") || nowIndia().date;
      const rows = await db.prepare(`
        SELECT * FROM food_entries WHERE entry_date=?
        ORDER BY entry_time DESC
      `).bind(date).all();

      const counts = await db.prepare(`
        SELECT meal_type, COUNT(*) AS count
        FROM food_entries WHERE entry_date=?
        GROUP BY meal_type
      `).bind(date).all();

      return json({ success: true, entries: rows.results, counts: counts.results });
    }

    if (method === "GET" && path === "/api/reports") {
      if (!staff) return fail("Staff login required.", 401);
      const month = url.searchParams.get("month") || nowIndia().date.slice(0, 7);

      const food = await db.prepare(`
        SELECT meal_type, COUNT(*) AS count
        FROM food_entries WHERE substr(entry_date,1,7)=?
        GROUP BY meal_type
      `).bind(month).all();

      const cab = await db.prepare(`
        SELECT COUNT(*) AS count FROM cab_entries
        WHERE substr(entry_date,1,7)=?
      `).bind(month).first();

      const attendance = await db.prepare(`
        SELECT attendance_status, COUNT(*) AS count
        FROM shift_attendance WHERE substr(attendance_date,1,7)=?
        GROUP BY attendance_status
      `).bind(month).all();

      const dailyFood = await db.prepare(`
        SELECT entry_date, meal_type, COUNT(*) AS count
        FROM food_entries WHERE substr(entry_date,1,7)=?
        GROUP BY entry_date, meal_type
        ORDER BY entry_date
      `).bind(month).all();

      return json({
        success: true, month, food: food.results,
        daily_food: dailyFood.results, cab_total: cab.count,
        attendance: attendance.results
      });
    }

    // HR REQUESTS: PERSON CREATES, STAFF REVIEWS.
    if (method === "POST" && path === "/api/requests") {
      const personSession = await requirePerson(request, env);
      if (!personSession) return fail("Employee/intern login required.", 401);

      const b = await bodyOf(request);
      const requestType = String(b.request_type || "").toUpperCase();
      const allowed = ["LEAVE", "VACATE", "TEMPORARY_OUT", "RETURN", "OTHER"];
      if (!allowed.includes(requestType)) return fail("Invalid request type.");

      const person = await getPerson(db, personSession.personType, personSession.personId);
      if (!person || person.status !== "ACTIVE") return fail("Account is inactive.", 403);

      await db.prepare(`
        INSERT INTO hr_requests
        (person_type, person_id, name, request_type, from_date, to_date, remarks)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(
        personSession.personType, personSession.personId, person.name,
        requestType, b.from_date || null, b.to_date || null,
        String(b.remarks || "").slice(0, 1000) || null
      ).run();

      return json({ success: true, message: "Request sent to HR." });
    }

    if (method === "GET" && path === "/api/requests") {
      const personSession = await requirePerson(request, env);
      if (personSession) {
        const rows = await db.prepare(`
          SELECT * FROM hr_requests WHERE person_type=? AND person_id=?
          ORDER BY id DESC
        `).bind(personSession.personType, personSession.personId).all();
        return json({ success: true, requests: rows.results });
      }

      if (!staff) return fail("Login required.", 401);
      const status = url.searchParams.get("status");
      const rows = status
        ? await db.prepare("SELECT * FROM hr_requests WHERE status=? ORDER BY id DESC")
            .bind(status).all()
        : await db.prepare("SELECT * FROM hr_requests ORDER BY id DESC").all();

      return json({ success: true, requests: rows.results });
    }

    if (method === "POST" && path === "/api/requests/review") {
      if (!staff) return fail("HR login required.", 401);
      const b = await bodyOf(request);
      const id = Number(b.id);
      const status = String(b.status || "").toUpperCase();
      if (!id || !["APPROVED", "REJECTED"].includes(status)) {
        return fail("Request ID and approval decision are required.");
      }

      const req = await db.prepare("SELECT * FROM hr_requests WHERE id=?")
        .bind(id).first();
      if (!req) return fail("Request not found.", 404);

      await db.prepare(`
        UPDATE hr_requests SET status=?, hr_remarks=?, reviewed_by=?,
          updated_at=CURRENT_TIMESTAMP WHERE id=?
      `).bind(
        status, String(b.hr_remarks || "").slice(0, 1000),
        staff.staffId, id
      ).run();

      // Change hostel status only after an approved request.
      if (status === "APPROVED" &&
          ["LEAVE", "VACATE", "TEMPORARY_OUT", "RETURN"].includes(req.request_type)) {
        const table = req.person_type === "INTERN" ? "interns" : "employees";
        const idColumn = req.person_type === "INTERN" ? "intern_id" : "employee_id";
        const newStatus = req.request_type === "VACATE" ? "VACATED" :
          req.request_type === "RETURN" ? "IN" : "OUT/LEAVE";

        await db.prepare(`UPDATE ${table} SET hostel_status=? WHERE ${idColumn}=?`)
          .bind(newStatus, req.person_id).run();

        const { date } = nowIndia();
        await db.prepare(`
          INSERT INTO hostel_status_history
          (person_type, person_id, status, out_date, return_date, remarks)
          VALUES (?, ?, ?, ?, ?, ?)
        `).bind(
          req.person_type, req.person_id, newStatus,
          newStatus === "OUT/LEAVE" ? date : null,
          newStatus === "IN" ? date : null,
          b.hr_remarks || req.remarks || null
        ).run();
      }

      await audit(db, staff.role, staff.staffId, "REVIEW_REQUEST", "HR_REQUEST", id, status);
      return json({ success: true, message: `Request ${status.toLowerCase()}.` });
    }

    if (method === "GET" && path === "/api/attendance") {
      if (!staff) return fail("Staff login required.", 401);
      const date = url.searchParams.get("date") || nowIndia().date;
      const rows = await db.prepare(`
        SELECT * FROM shift_attendance WHERE attendance_date=?
        ORDER BY department, person_id
      `).bind(date).all();
      return json({ success: true, entries: rows.results });
    }

    if (method === "POST" && path === "/api/attendance") {
      if (!staff) return fail("Staff login required.", 401);
      const b = await bodyOf(request);
      const type = String(b.person_type || "EMPLOYEE").toUpperCase();
      const id = String(b.person_id || "").trim();
      const shift = String(b.shift || "").toUpperCase();
      const status = String(b.attendance_status || b.status || "").toUpperCase();
      const date = String(b.attendance_date || nowIndia().date);

      if (!["EMPLOYEE", "INTERN"].includes(type) ||
          !["SHIFT 1", "SHIFT 2", "SHIFT 3"].includes(shift) ||
          !["PRESENT", "ABSENT", "N/A"].includes(status) || !id) {
        return fail("Invalid attendance details.");
      }

      const person = await getPerson(db, type, id);
      if (!person) return fail("Person not found.", 404);

      await db.prepare(`
        INSERT INTO shift_attendance
        (person_type, person_id, attendance_date, shift, attendance_status, department, room)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(
        type, id, date, shift, status, person.department, person.room
      ).run();

      return json({ success: true });
    }

    if (method === "POST" && path === "/api/cleanup") {
      if (!staff) return fail("Staff login required.", 401);
      const result = await cleanupOldRecords(db);
      return json({ success: true, deleted: result });
    }

    return fail("Route not found.", 404);
  } catch (error) {
    return json({
      success: false,
      message: "Server error.",
      detail: String(error?.message || error)
    }, 500);
  }
}

async function cleanupOldRecords(db) {
  const result = {};
  for (const table of ["cab_entries", "food_entries", "shift_attendance"]) {
    const dateColumn = table === "shift_attendance" ? "attendance_date" : "entry_date";
    const r = await db.prepare(`
      DELETE FROM ${table}
      WHERE ${dateColumn} < date('now','-1 month')
    `).run();
    result[table] = r.meta?.changes || 0;
  }
  return result;
}

export default {
  async fetch(request, env) {
    return handle(request, env);
  },

  async scheduled(controller, env, ctx) {
    ctx.waitUntil(cleanupOldRecords(env.DB));
  }
};
