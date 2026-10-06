const VERSION = "TEXMO-HOSTEL-HUB-2.0-POWER";

/*
=========================================================
 TEXMO HOSTEL HUB 2.0 POWER
 CLOUDFLARE WORKERS + D1

 DEPARTMENTS:
   PDN
   PDN2
   MDN
   PDN3

 EMPLOYEE TYPES:
   Employee
   Intern
   New Joiner

 SHIFTS:
   Shift 1
   Shift 2
   Shift 3

 ROOMS:
   A1-A4  -> Employee
   B1-B8  -> Employee
   C1-C8  -> Employee + Intern
   D1-D4  -> New Joiner + Intern

 CAPACITY:
   24 rooms
   8 beds / room
   192 beds

 CAB:
   5 cabs
   20 seats / cab
   100 total seats

 EMPLOYEE QR:
   YES -> CAB + FOOD

 ROOM QR:
   NO
=========================================================
*/

const ALLOWED_DEPARTMENTS = [
  "PDN",
  "PDN2",
  "MDN",
  "PDN3"
];

const ALLOWED_SHIFTS = [
  "Shift 1",
  "Shift 2",
  "Shift 3"
];

const EMPLOYEE_TYPES = [
  "Employee",
  "Intern",
  "New Joiner"
];

const ATTENDANCE_STATUSES = [
  "Present",
  "Absent",
  "Leave",
  "TemporaryOut"
];

const BLOCKS = {
  A: 4,
  B: 8,
  C: 8,
  D: 4
};

const CAB_COUNT = 5;
const CAB_CAPACITY = 20;

const MEALS = [
  "Breakfast",
  "Lunch",
  "Dinner"
];

const MEAL_WINDOWS = {
  Breakfast: ["09:00", "10:00"],
  Lunch: ["11:30", "14:00"],
  Dinner: ["19:30", "21:00"]
};


/* =====================================================
   MAIN WORKER
===================================================== */

export default {

  async fetch(request, env) {

    const url = new URL(request.url);
    const method = request.method.toUpperCase();

    if (method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders()
      });
    }

    try {

      /* =================================================
         SYSTEM
      ================================================= */

      if (
        url.pathname === "/api/health" &&
        method === "GET"
      ) {
        return json({
          ok: true,
          version: VERSION,
          service: "texmo-hostel-hub",
          database: !!env.DB
        });
      }


      if (
        url.pathname === "/api/init" &&
        method === "GET"
      ) {
        return await initializeDatabase(env);
      }


      /* =================================================
         HR AUTH
      ================================================= */

      if (
        url.pathname === "/api/hr/register" &&
        method === "POST"
      ) {
        return await hrRegister(request, env);
      }


      if (
        url.pathname === "/api/hr/login" &&
        method === "POST"
      ) {
        return await hrLogin(request, env);
      }


      if (
        url.pathname === "/api/hr/logout" &&
        method === "POST"
      ) {
        return await logout(request, env, "HR");
      }


      /* =================================================
         HR DASHBOARD
      ================================================= */

      if (
        url.pathname === "/api/hr/dashboard" &&
        method === "GET"
      ) {
        return await hrDashboard(request, env);
      }


      /* =================================================
         HR EMPLOYEES
      ================================================= */

      if (
        url.pathname === "/api/hr/employees" &&
        method === "GET"
      ) {
        return await hrEmployees(request, env);
      }


      if (
        url.pathname === "/api/hr/employees" &&
        method === "POST"
      ) {
        return await hrCreateEmployee(request, env);
      }


      if (
        url.pathname.startsWith("/api/hr/employees/") &&
        method === "PUT"
      ) {

        const employeeId =
          pathLast(url);

        return await hrUpdateEmployee(
          request,
          env,
          employeeId
        );
      }


      if (
        url.pathname.startsWith("/api/hr/employees/") &&
        method === "DELETE"
      ) {

        const employeeId =
          pathLast(url);

        return await hrDeactivateEmployee(
          request,
          env,
          employeeId
        );
      }


      /* =================================================
         HR ROOMS
      ================================================= */

      if (
        url.pathname === "/api/hr/rooms" &&
        method === "GET"
      ) {
        return await hrRooms(request, env);
      }


      if (
        url.pathname === "/api/hr/rooms/allocate" &&
        method === "POST"
      ) {
        return await hrAllocateRoom(request, env);
      }


      if (
        url.pathname === "/api/hr/rooms/vacate" &&
        method === "POST"
      ) {
        return await hrVacateRoom(request, env);
      }


      /* =================================================
         HR LEAVE
      ================================================= */

      if (
        url.pathname === "/api/hr/leave" &&
        method === "GET"
      ) {
        return await hrLeave(request, env);
      }


      if (
        url.pathname.startsWith("/api/hr/leave/") &&
        method === "PUT"
      ) {

        return await hrLeaveDecision(
          request,
          env,
          pathLast(url)
        );
      }


      /* =================================================
         HR VACATE
      ================================================= */

      if (
        url.pathname === "/api/hr/vacate" &&
        method === "GET"
      ) {
        return await hrVacate(request, env);
      }


      if (
        url.pathname.startsWith("/api/hr/vacate/") &&
        method === "PUT"
      ) {

        return await hrVacateDecision(
          request,
          env,
          pathLast(url)
        );
      }


      /* =================================================
         HR TEMPORARY OUT
      ================================================= */

      if (
        url.pathname === "/api/hr/temporary-out" &&
        method === "GET"
      ) {
        return await hrTemporaryOut(
          request,
          env
        );
      }


      if (
        url.pathname.startsWith(
          "/api/hr/temporary-out/"
        ) &&
        method === "PUT"
      ) {

        return await hrTemporaryOutDecision(
          request,
          env,
          pathLast(url)
        );
      }


      /* =================================================
         HR CHECK-IN
      ================================================= */

      if (
        url.pathname === "/api/hr/checkin" &&
        method === "GET"
      ) {
        return await hrCheckins(
          request,
          env
        );
      }


      if (
        url.pathname.startsWith(
          "/api/hr/checkin/"
        ) &&
        method === "PUT"
      ) {

        return await hrCheckinDecision(
          request,
          env,
          pathLast(url)
        );
      }


      /* =================================================
         HR CAB
      ================================================= */

      if (
        url.pathname === "/api/hr/cab" &&
        method === "GET"
      ) {
        return await hrCab(
          request,
          env
        );
      }


      if (
        url.pathname === "/api/hr/cab/scan" &&
        method === "POST"
      ) {
        return await cabScan(
          request,
          env
        );
      }


      /* =================================================
         HR ATTENDANCE
      ================================================= */

      if (
        url.pathname === "/api/hr/attendance" &&
        method === "GET"
      ) {
        return await hrAttendance(
          request,
          env
        );
      }


      if (
        url.pathname === "/api/hr/attendance/mark" &&
        method === "POST"
      ) {
        return await markAttendance(
          request,
          env
        );
      }


      /* =================================================
         HR FOOD
      ================================================= */

      if (
        url.pathname === "/api/hr/food" &&
        method === "GET"
      ) {
        return await hrFood(
          request,
          env
        );
      }


      if (
        url.pathname === "/api/hr/food/scan" &&
        method === "POST"
      ) {
        return await foodScan(
          request,
          env
        );
      }


      /* =================================================
         HR REPORTS
      ================================================= */

      if (
        url.pathname === "/api/hr/reports" &&
        method === "GET"
      ) {
        return await hrReports(
          request,
          env
        );
      }


      /* =================================================
         EMPLOYEE AUTH
      ================================================= */

      if (
        url.pathname === "/api/employee/register" &&
        method === "POST"
      ) {
        return await employeeRegister(
          request,
          env
        );
      }


      if (
        url.pathname === "/api/employee/login" &&
        method === "POST"
      ) {
        return await employeeLogin(
          request,
          env
        );
      }


      if (
        url.pathname === "/api/employee/logout" &&
        method === "POST"
      ) {
        return await logout(
          request,
          env,
          "EMPLOYEE"
        );
      }


      /* =================================================
         EMPLOYEE DASHBOARD
      ================================================= */

      if (
        url.pathname.startsWith(
          "/api/employee/dashboard/"
        ) &&
        method === "GET"
      ) {

        return await employeeDashboard(
          request,
          env,
          pathLast(url)
        );
      }


      /* =================================================
         EMPLOYEE ROOM
      ================================================= */

      if (
        url.pathname.startsWith(
          "/api/employee-room/"
        ) &&
        method === "GET"
      ) {

        return await employeeRoom(
          request,
          env,
          pathLast(url)
        );
      }


      /* =================================================
         EMPLOYEE LEAVE
      ================================================= */

      if (
        url.pathname === "/api/employee/leave" &&
        method === "POST"
      ) {
        return await employeeLeaveRequest(
          request,
          env
        );
      }


      if (
        url.pathname === "/api/employee/leave" &&
        method === "GET"
      ) {
        return await employeeLeaveList(
          request,
          env
        );
      }


      /* =================================================
         EMPLOYEE VACATE
      ================================================= */

      if (
        url.pathname === "/api/employee/vacate" &&
        method === "POST"
      ) {
        return await employeeVacateRequest(
          request,
          env
        );
      }


      if (
        url.pathname === "/api/employee/vacate" &&
        method === "GET"
      ) {
        return await employeeVacateList(
          request,
          env
        );
      }


      /* =================================================
         EMPLOYEE TEMPORARY OUT
      ================================================= */

      if (
        url.pathname ===
          "/api/employee/temporary-out" &&
        method === "POST"
      ) {

        return await employeeTemporaryOut(
          request,
          env
        );
      }


      if (
        url.pathname ===
          "/api/employee/temporary-out" &&
        method === "GET"
      ) {

        return await employeeTemporaryOutList(
          request,
          env
        );
      }


      /* =================================================
         EMPLOYEE CHECK-IN
      ================================================= */

      if (
        url.pathname === "/api/employee/checkin" &&
        method === "POST"
      ) {

        return await employeeCheckin(
          request,
          env
        );
      }


      /* =================================================
         EMPLOYEE QR
         IMPORTANT:
         THIS IS NOT ROOM QR.
      ================================================= */

      if (
        url.pathname.startsWith(
          "/api/employee/qr/"
        ) &&
        method === "GET"
      ) {

        return await employeeQR(
          request,
          env,
          pathLast(url)
        );
      }


      /* =================================================
         EMPLOYEE CAB
      ================================================= */

      if (
        url.pathname === "/api/employee/cab" &&
        method === "GET"
      ) {

        return await employeeCab(
          request,
          env
        );
      }


      /* =================================================
         EMPLOYEE FOOD
      ================================================= */

      if (
        url.pathname === "/api/employee/food" &&
        method === "GET"
      ) {

        return await employeeFood(
          request,
          env
        );
      }


      /* =================================================
         STATIC ASSETS
      ================================================= */

      if (env.ASSETS) {
        return env.ASSETS.fetch(request);
      }


      return json({
        ok: false,
        error: "Route not found"
      }, 404);


    } catch (error) {

      console.error(
        "TEXMO ERROR:",
        error
      );

      return json({
        ok: false,
        error: "Internal server error",
        detail:
          env.ENVIRONMENT === "development"
            ? String(
                error?.message || error
              )
            : undefined
      }, 500);
    }
  }
};


/* =====================================================
   DATABASE INITIALIZATION
===================================================== */

async function initializeDatabase(env) {

  if (!env.DB) {

    return json({
      ok: false,
      error:
        "D1 binding DB is missing"
    }, 500);
  }


  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `).run();


  await createBaseTables(env);

  await migrateEmployees(env);

  await migrateRooms(env);

  await migrateCab(env);

  await createPowerTables(env);

  await seedRooms(env);

  await ensureEmployeeQRs(env);

  await normalizeDepartments(env);


  return json({
    ok: true,
    message:
      "TEXMO POWER database initialized successfully.",
    version: VERSION,
    departments:
      ALLOWED_DEPARTMENTS,
    shifts:
      ALLOWED_SHIFTS,
    rooms: 24,
    beds: 192,
    cabs: 5,
    seatsPerCab: 20,
    totalCabSeats: 100,
    roomQR: false,
    employeeQR: true
  });
}


/* =====================================================
   BASE TABLES
===================================================== */

async function createBaseTables(env) {

  const statements = [

    `
    CREATE TABLE IF NOT EXISTS hr_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hr_id TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      department TEXT NOT NULL,
      designation TEXT NOT NULL,
      phone TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
    `,

    `
    CREATE TABLE IF NOT EXISTS employees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      department TEXT NOT NULL,
      designation TEXT NOT NULL,
      phone TEXT NOT NULL,
      employee_type TEXT NOT NULL DEFAULT 'Employee',
      shift TEXT NOT NULL DEFAULT '',
      password_hash TEXT NOT NULL DEFAULT '',
      block TEXT DEFAULT '',
      room_no TEXT DEFAULT '',
      bed_no INTEGER DEFAULT NULL,
      hostel_status TEXT NOT NULL DEFAULT 'OUT',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
    `,

    `
    CREATE TABLE IF NOT EXISTS rooms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      block TEXT NOT NULL,
      room_no TEXT NOT NULL,
      capacity INTEGER NOT NULL DEFAULT 8,
      UNIQUE(block, room_no)
    )
    `,

    `
    CREATE TABLE IF NOT EXISTS room_beds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      block TEXT NOT NULL,
      room_no TEXT NOT NULL,
      bed_no INTEGER NOT NULL,
      employee_id TEXT DEFAULT NULL,
      UNIQUE(block, room_no, bed_no)
    )
    `,

    `
    CREATE TABLE IF NOT EXISTS cab_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id TEXT NOT NULL,
      employee_name TEXT NOT NULL,
      department TEXT NOT NULL,
      cab_no INTEGER NOT NULL,
      seat_no INTEGER NOT NULL,
      travel_date TEXT NOT NULL,
      boarded_at TEXT NOT NULL,
      UNIQUE(employee_id, travel_date)
    )
    `,

    `
    CREATE TABLE IF NOT EXISTS leave_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id TEXT NOT NULL,
      from_date TEXT NOT NULL,
      to_date TEXT NOT NULL,
      reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Pending',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
    `,

    `
    CREATE TABLE IF NOT EXISTS vacate_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id TEXT NOT NULL,
      vacate_date TEXT NOT NULL,
      return_date TEXT,
      reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Pending',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
    `,

    `
    CREATE TABLE IF NOT EXISTS checkin_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id TEXT NOT NULL,
      requested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      status TEXT NOT NULL DEFAULT 'Pending',
      approved_at TEXT
    )
    `
  ];


  for (const sql of statements) {
    await env.DB
      .prepare(sql)
      .run();
  }
}


/* =====================================================
   EMPLOYEE MIGRATION
===================================================== */

async function migrateEmployees(env) {

  const columns =
    await tableColumns(
      env,
      "employees"
    );


  const migrations = [

    [
      "aadhaar_no",
      `
      ALTER TABLE employees
      ADD COLUMN aadhaar_no TEXT DEFAULT ''
      `
    ],

    [
      "native_address",
      `
      ALTER TABLE employees
      ADD COLUMN native_address TEXT DEFAULT ''
      `
    ],

    [
      "doj",
      `
      ALTER TABLE employees
      ADD COLUMN doj TEXT DEFAULT ''
      `
    ],

    [
      "qr_id",
      `
      ALTER TABLE employees
      ADD COLUMN qr_id TEXT DEFAULT ''
      `
    ],

    [
      "temporary_out_status",
      `
      ALTER TABLE employees
      ADD COLUMN temporary_out_status TEXT DEFAULT 'NO'
      `
    ],

    [
      "expected_return_date",
      `
      ALTER TABLE employees
      ADD COLUMN expected_return_date TEXT DEFAULT ''
      `
    ],

    [
      "last_checkin_at",
      `
      ALTER TABLE employees
      ADD COLUMN last_checkin_at TEXT DEFAULT ''
      `
    ],

    [
      "last_checkout_at",
      `
      ALTER TABLE employees
      ADD COLUMN last_checkout_at TEXT DEFAULT ''
      `
    ]
  ];


  for (
    const [name, sql]
    of migrations
  ) {

    if (!columns.has(name)) {
      await env.DB
        .prepare(sql)
        .run();
    }
  }
}


/* =====================================================
   ROOM MIGRATION
===================================================== */

async function migrateRooms(env) {

  const columns =
    await tableColumns(
      env,
      "rooms"
    );


  if (!columns.has("eligibility")) {

    await env.DB.prepare(`
      ALTER TABLE rooms
      ADD COLUMN eligibility
      TEXT DEFAULT 'EMPLOYEE'
    `).run();
  }


  await env.DB.prepare(`
    UPDATE rooms
    SET eligibility = 'EMPLOYEE'
    WHERE block IN ('A','B')
  `).run();


  await env.DB.prepare(`
    UPDATE rooms
    SET eligibility = 'EMPLOYEE,INTERN'
    WHERE block = 'C'
  `).run();


  await env.DB.prepare(`
    UPDATE rooms
    SET eligibility = 'NEW_JOINER,INTERN'
    WHERE block = 'D'
  `).run();
}


/* =====================================================
   CAB MIGRATION
===================================================== */

async function migrateCab(env) {

  const columns =
    await tableColumns(
      env,
      "cab_entries"
    );


  const migrations = [

    [
      "shift",
      `
      ALTER TABLE cab_entries
      ADD COLUMN shift TEXT DEFAULT ''
      `
    ],

    [
      "status",
      `
      ALTER TABLE cab_entries
      ADD COLUMN status TEXT DEFAULT 'Boarded'
      `
    ],

    [
      "scan_source",
      `
      ALTER TABLE cab_entries
      ADD COLUMN scan_source TEXT DEFAULT 'QR'
      `
    ],

    [
      "created_at",
      `
      ALTER TABLE cab_entries
      ADD COLUMN created_at TEXT
      DEFAULT CURRENT_TIMESTAMP
      `
    ]
  ];


  for (
    const [name, sql]
    of migrations
  ) {

    if (!columns.has(name)) {

      await env.DB
        .prepare(sql)
        .run();
    }
  }
}


/* =====================================================
   POWER TABLES
===================================================== */

async function createPowerTables(env) {

  const statements = [

    `
    CREATE TABLE IF NOT EXISTS attendance_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id TEXT NOT NULL,
      attendance_date TEXT NOT NULL,
      shift TEXT NOT NULL,
      status TEXT NOT NULL,
      check_in_time TEXT DEFAULT '',
      check_out_time TEXT DEFAULT '',
      source TEXT DEFAULT 'HR',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(
        employee_id,
        attendance_date,
        shift
      )
    )
    `,

    `
    CREATE TABLE IF NOT EXISTS food_scan_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id TEXT NOT NULL,
      scan_date TEXT NOT NULL,
      meal TEXT NOT NULL,
      scanned_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Served',
      scan_source TEXT DEFAULT 'QR',
      UNIQUE(
        employee_id,
        scan_date,
        meal
      )
    )
    `,

    `
    CREATE TABLE IF NOT EXISTS temporary_out_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id TEXT NOT NULL,
      from_date TEXT NOT NULL,
      expected_return_date TEXT NOT NULL,
      actual_return_date TEXT DEFAULT '',
      reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Pending',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      approved_at TEXT DEFAULT ''
    )
    `,

    `
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_type TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      action TEXT NOT NULL,
      target_type TEXT DEFAULT '',
      target_id TEXT DEFAULT '',
      details TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
    `,

    `
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT NOT NULL UNIQUE,
      actor_type TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      expires_at TEXT NOT NULL
    )
    `
  ];


  for (const sql of statements) {

    await env.DB
      .prepare(sql)
      .run();
  }
}


/* =====================================================
   ROOM SEED
===================================================== */

async function seedRooms(env) {

  for (
    const block of
    Object.keys(BLOCKS)
  ) {

    const roomCount =
      BLOCKS[block];


    for (
      let room = 1;
      room <= roomCount;
      room++
    ) {

      const roomNo =
        `${block}${room}`;


      let eligibility =
        "EMPLOYEE";


      if (block === "C") {
        eligibility =
          "EMPLOYEE,INTERN";
      }


      if (block === "D") {
        eligibility =
          "NEW_JOINER,INTERN";
      }


      await env.DB.prepare(`
        INSERT OR IGNORE INTO rooms
        (
          block,
          room_no,
          capacity,
          eligibility
        )
        VALUES (?, ?, 8, ?)
      `)
        .bind(
          block,
          roomNo,
          eligibility
        )
        .run();


      for (
        let bed = 1;
        bed <= 8;
        bed++
      ) {

        await env.DB.prepare(`
          INSERT OR IGNORE INTO room_beds
          (
            block,
            room_no,
            bed_no
          )
          VALUES (?, ?, ?)
        `)
          .bind(
            block,
            roomNo,
            bed
          )
          .run();
      }
    }
  }
}


/* =====================================================
   QR GENERATION
===================================================== */

async function ensureEmployeeQRs(env) {

  const result =
    await env.DB.prepare(`
      SELECT employee_id
      FROM employees
      WHERE qr_id IS NULL
         OR qr_id = ''
    `).all();


  for (
    const row of
    result.results || []
  ) {

    const qrId =
      await generateUniqueQR(env);


    await env.DB.prepare(`
      UPDATE employees
      SET
        qr_id = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE employee_id = ?
    `)
      .bind(
        qrId,
        row.employee_id
      )
      .run();
  }
}


async function generateUniqueQR(env) {

  for (let i = 0; i < 10; i++) {

    const random =
      crypto.randomUUID()
        .replace(/-/g, "")
        .slice(0, 20)
        .toUpperCase();


    const qrId =
      `TEXMO-${random}`;


    const existing =
      await env.DB.prepare(`
        SELECT id
        FROM employees
        WHERE qr_id = ?
        LIMIT 1
      `)
        .bind(qrId)
        .first();


    if (!existing) {
      return qrId;
    }
  }


  throw new Error(
    "Unable to generate unique Employee QR."
  );
}


/* =====================================================
   DEPARTMENT NORMALIZATION
===================================================== */

async function normalizeDepartments(env) {

  /*
   Existing records are preserved.

   New employee/HR registration is strictly
   restricted to:

      PDN
      PDN2
      MDN
      PDN3
  */

  return true;
}


/* =====================================================
   HR REGISTER
===================================================== */

async function hrRegister(
  request,
  env
) {

  const body =
    await readJSON(request);


  const name =
    clean(body.name);

  const hrId =
    clean(body.hrId);

  const department =
    clean(body.department);

  const designation =
    clean(body.designation);

  const phone =
    clean(body.phone);

  const password =
    String(body.password || "");

  const masterKey =
    String(body.masterKey || "");


  if (
    !name ||
    !hrId ||
    !department ||
    !designation ||
    !phone ||
    !password ||
    !masterKey
  ) {

    return json({
      ok: false,
      error:
        "All HR registration fields are required."
    }, 400);
  }


  if (
    !ALLOWED_DEPARTMENTS
      .includes(department)
  ) {

    return json({
      ok: false,
      error:
        "Department must be PDN, PDN2, MDN or PDN3."
    }, 400);
  }


  if (!/^[0-9]{10}$/.test(phone)) {

    return json({
      ok: false,
      error:
        "Invalid phone number."
    }, 400);
  }


  if (password.length < 8) {

    return json({
      ok: false,
      error:
        "Password must contain at least 8 characters."
    }, 400);
  }


  if (!env.TEXMO_MASTER_KEY) {

    return json({
      ok: false,
      error:
        "TEXMO_MASTER_KEY is not configured."
    }, 500);
  }


  if (
    masterKey !==
    env.TEXMO_MASTER_KEY
  ) {

    return json({
      ok: false,
      error:
        "Invalid Master Key."
    }, 403);
  }


  const existing =
    await env.DB.prepare(`
      SELECT id
      FROM hr_users
      WHERE hr_id = ?
      LIMIT 1
    `)
      .bind(hrId)
      .first();


  if (existing) {

    return json({
      ok: false,
      error:
        "HR ID already exists."
    }, 409);
  }


  const passwordHash =
    await hashPassword(password);


  await env.DB.prepare(`
    INSERT INTO hr_users
    (
      hr_id,
      name,
      department,
      designation,
      phone,
      password_hash
    )
    VALUES (?, ?, ?, ?, ?, ?)
  `)
    .bind(
      hrId,
      name,
      department,
      designation,
      phone,
      passwordHash
    )
    .run();


  await audit(
    env,
    "HR",
    hrId,
    "HR_REGISTER",
    "HR",
    hrId,
    "HR account created"
  );


  return json({
    ok: true,
    message:
      "HR account created successfully."
  });
}


/* =====================================================
   HR LOGIN
===================================================== */

async function hrLogin(
  request,
  env
) {

  const body =
    await readJSON(request);


  const hrId =
    clean(body.hrId);

  const password =
    String(body.password || "");


  if (!hrId || !password) {

    return json({
      ok: false,
      error:
        "HR ID and password are required."
    }, 400);
  }


  const hr =
    await env.DB.prepare(`
      SELECT *
      FROM hr_users
      WHERE hr_id = ?
      LIMIT 1
    `)
      .bind(hrId)
      .first();


  if (!hr || !hr.active) {

    return json({
      ok: false,
      error:
        "Invalid HR ID or password."
    }, 401);
  }


  const valid =
    await verifyPassword(
      password,
      hr.password_hash
    );


  if (!valid) {

    return json({
      ok: false,
      error:
        "Invalid HR ID or password."
    }, 401);
  }


  const token =
    await createSession(
      env,
      "HR",
      hr.hr_id
    );


  return json({
    ok: true,
    message:
      "HR login successful.",
    token,
    hr: {
      id: hr.id,
      hrId: hr.hr_id,
      name: hr.name,
      department: hr.department,
      designation: hr.designation,
      phone: hr.phone,
      role: "HR"
    }
  });
}


/* =====================================================
   EMPLOYEE REGISTER
===================================================== */

async function employeeRegister(
  request,
  env
) {

  const body =
    await readJSON(request);


  const employeeId =
    clean(body.employeeId);

  const name =
    clean(body.name);

  const department =
    clean(body.department);

  const designation =
    clean(body.designation);

  const phone =
    clean(body.phone);

  const employeeType =
    clean(body.employeeType);

  const shift =
    clean(body.shift);

  const aadhaar =
    clean(
      body.aadhaar ??
      body.aadhaarNo
    );

  const nativeAddress =
    clean(
      body.nativeAddress
    );

  const doj =
    clean(body.doj);


  if (
    !employeeId ||
    !name ||
    !department ||
    !designation ||
    !phone ||
    !employeeType ||
    !shift
  ) {

    return json({
      ok: false,
      error:
        "All employee registration fields are required."
    }, 400);
  }


  if (
    !ALLOWED_DEPARTMENTS
      .includes(department)
  ) {

    return json({
      ok: false,
      error:
        "Department must be PDN, PDN2, MDN or PDN3."
    }, 400);
  }


  if (
    !EMPLOYEE_TYPES
      .includes(employeeType)
  ) {

    return json({
      ok: false,
      error:
        "Invalid employee type."
    }, 400);
  }


  if (
    !ALLOWED_SHIFTS
      .includes(shift)
  ) {

    return json({
      ok: false,
      error:
        "Invalid shift."
    }, 400);
  }


  if (!/^[0-9]{10}$/.test(phone)) {

    return json({
      ok: false,
      error:
        "Invalid phone number."
    }, 400);
  }


  if (
    aadhaar &&
    !/^[0-9]{12}$/.test(aadhaar)
  ) {

    return json({
      ok: false,
      error:
        "Invalid Aadhaar number."
    }, 400);
  }


  const existing =
    await env.DB.prepare(`
      SELECT id
      FROM employees
      WHERE employee_id = ?
      LIMIT 1
    `)
      .bind(employeeId)
      .first();


  if (existing) {

    return json({
      ok: false,
      error:
        "Employee ID already exists."
    }, 409);
  }


  const passwordHash =
    await hashPassword(
      employeeId
    );


  const qrId =
    await generateUniqueQR(env);


  await env.DB.prepare(`
    INSERT INTO employees
    (
      employee_id,
      name,
      department,
      designation,
      phone,
      employee_type,
      shift,
      password_hash,
      aadhaar_no,
      native_address,
      doj,
      qr_id
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
    .bind(
      employeeId,
      name,
      department,
      designation,
      phone,
      employeeType,
      shift,
      passwordHash,
      aadhaar,
      nativeAddress,
      doj,
      qrId
    )
    .run();


  await audit(
    env,
    "EMPLOYEE",
    employeeId,
    "EMPLOYEE_REGISTER",
    "EMPLOYEE",
    employeeId,
    "Employee registered"
  );


  return json({
    ok: true,
    message:
      "Employee registered successfully.",
    employee: {
      employeeId,
      name,
      department,
      designation,
      employeeType,
      shift,
      qrId
    }
  });
}


/* =====================================================
   EMPLOYEE LOGIN
===================================================== */

async function employeeLogin(
  request,
  env
) {

  const body =
    await readJSON(request);


  const employeeId =
    clean(body.employeeId);

  const password =
    String(body.password || "");


  if (!employeeId || !password) {

    return json({
      ok: false,
      error:
        "Employee ID and password are required."
    }, 400);
  }


  const employee =
    await env.DB.prepare(`
      SELECT *
      FROM employees
      WHERE employee_id = ?
      AND active = 1
      LIMIT 1
    `)
      .bind(employeeId)
      .first();


  if (!employee) {

    return json({
      ok: false,
      error:
        "Invalid Employee ID or password."
    }, 401);
  }


  const valid =
    await verifyPassword(
      password,
      employee.password_hash
    );


  if (!valid) {

    return json({
      ok: false,
      error:
        "Invalid Employee ID or password."
    }, 401);
  }


  const token =
    await createSession(
      env,
      "EMPLOYEE",
      employee.employee_id
    );


  return json({
    ok: true,
    message:
      "Employee login successful.",
    token,
    employee:
      serializeEmployee(employee)
  });
}


/* =====================================================
   EMPLOYEE DASHBOARD
===================================================== */

async function employeeDashboard(
  request,
  env,
  employeeId
) {

  const auth =
    await requireAuth(
      request,
      env,
      "EMPLOYEE"
    );


  if (!auth.ok) {
    return auth.response;
  }


  if (
    auth.actorId !==
    employeeId
  ) {

    return json({
      ok: false,
      error:
        "You can access only your own dashboard."
    }, 403);
  }


  const employee =
    await env.DB.prepare(`
      SELECT *
      FROM employees
      WHERE employee_id = ?
      LIMIT 1
    `)
      .bind(employeeId)
      .first();


  if (!employee) {

    return json({
      ok: false,
      error:
        "Employee not found."
    }, 404);
  }


  const today =
    todayISO();


  const cab =
    await env.DB.prepare(`
      SELECT
        cab_no,
        seat_no,
        travel_date,
        shift,
        boarded_at,
        status
      FROM cab_entries
      WHERE employee_id = ?
      AND travel_date = ?
      LIMIT 1
    `)
      .bind(
        employeeId,
        today
      )
      .first();


  const temporaryOut =
    await env.DB.prepare(`
      SELECT *
      FROM temporary_out_records
      WHERE employee_id = ?
      ORDER BY id DESC
      LIMIT 1
    `)
      .bind(employeeId)
      .first();


  return json({
    ok: true,
    employee:
      serializeEmployee(employee),
    today: {
      date: today,
      cab: cab || null,
      temporaryOut:
        temporaryOut || null
    }
  });
}


/* =====================================================
   EMPLOYEE ROOM
===================================================== */

async function employeeRoom(
  request,
  env,
  employeeId
) {

  const auth =
    await requireAuth(
      request,
      env,
      "EMPLOYEE"
    );


  if (!auth.ok) {
    return auth.response;
  }


  if (
    auth.actorId !==
    employeeId
  ) {

    return json({
      ok: false,
      error:
        "You can access only your own room."
    }, 403);
  }


  const employee =
    await env.DB.prepare(`
      SELECT
        employee_id,
        name,
        department,
        employee_type,
        block,
        room_no,
        bed_no,
        hostel_status
      FROM employees
      WHERE employee_id = ?
      LIMIT 1
    `)
      .bind(employeeId)
      .first();


  if (!employee) {

    return json({
      ok: false,
      error:
        "Employee not found."
    }, 404);
  }


  let beds = [];


  if (
    employee.block &&
    employee.room_no
  ) {

    const result =
      await env.DB.prepare(`
        SELECT
          bed_no,
          employee_id
        FROM room_beds
        WHERE block = ?
        AND room_no = ?
        ORDER BY bed_no
      `)
        .bind(
          employee.block,
          employee.room_no
        )
        .all();


    beds =
      result.results || [];
  }


  return json({
    ok: true,
    room: {
      employeeId:
        employee.employee_id,
      name:
        employee.name,
      department:
        employee.department,
      employeeType:
        employee.employee_type,
      block:
        employee.block || "",
      room:
        employee.room_no || "",
      bed:
        employee.bed_no ?? "",
      status:
        employee.hostel_status,
      beds
    }
  });
}


/* =====================================================
   HR DASHBOARD
===================================================== */

async function hrDashboard(
  request,
  env
) {

  const auth =
    await requireAuth(
      request,
      env,
      "HR"
    );


  if (!auth.ok) {
    return auth.response;
  }


  const today =
    todayISO();


  const totalEmployees =
    await count(
      env,
      `
      SELECT COUNT(*) AS total
      FROM employees
      WHERE active = 1
      `
    );


  const hostelIn =
    await count(
      env,
      `
      SELECT COUNT(*) AS total
      FROM employees
      WHERE active = 1
      AND hostel_status = 'IN'
      `
    );


  const hostelOut =
    await count(
      env,
      `
      SELECT COUNT(*) AS total
      FROM employees
      WHERE active = 1
      AND hostel_status = 'OUT'
      `
    );


  const pendingLeave =
    await count(
      env,
      `
      SELECT COUNT(*) AS total
      FROM leave_records
      WHERE status = 'Pending'
      `
    );


  const activeLeave =
    await count(
      env,
      `
      SELECT COUNT(*) AS total
      FROM leave_records
      WHERE status = 'Approved'
      AND date(?) BETWEEN
          date(from_date)
          AND date(to_date)
      `,
      [today]
    );


  const pendingVacate =
    await count(
      env,
      `
      SELECT COUNT(*) AS total
      FROM vacate_records
      WHERE status = 'Pending'
      `
    );


  const pendingTemporaryOut =
    await count(
      env,
      `
      SELECT COUNT(*) AS total
      FROM temporary_out_records
      WHERE status = 'Pending'
      `
    );


  const activeTemporaryOut =
    await count(
      env,
      `
      SELECT COUNT(*) AS total
      FROM temporary_out_records
      WHERE status = 'Approved'
      AND (
        actual_return_date = ''
        OR actual_return_date IS NULL
      )
      `
    );


  const overdue =
    await count(
      env,
      `
      SELECT COUNT(*) AS total
      FROM temporary_out_records
      WHERE status = 'Approved'
      AND date(expected_return_date) < date(?)
      AND (
        actual_return_date = ''
        OR actual_return_date IS NULL
      )
      `,
      [today]
    );


  const cabBoarded =
    await count(
      env,
      `
      SELECT COUNT(*) AS total
      FROM cab_entries
      WHERE travel_date = ?
      `,
      [today]
    );


  const presentToday =
    await count(
      env,
      `
      SELECT COUNT(*) AS total
      FROM attendance_logs
      WHERE attendance_date = ?
      AND status = 'Present'
      `,
      [today]
    );


  const absentToday =
    await count(
      env,
      `
      SELECT COUNT(*) AS total
      FROM attendance_logs
      WHERE attendance_date = ?
      AND status = 'Absent'
      `,
      [today]
    );


  const occupiedBeds =
    await count(
      env,
      `
      SELECT COUNT(*) AS total
      FROM room_beds
      WHERE employee_id IS NOT NULL
      `
    );


  return json({
    ok: true,
    dashboard: {
      date: today,
      totalEmployees,
      hostelIn,
      hostelOut,
      pendingLeave,
      activeLeave,
      pendingVacate,
      pendingTemporaryOut,
      activeTemporaryOut,
      overdue,
      cabBoarded,
      presentToday,
      absentToday,
      occupiedBeds,
      availableBeds:
        192 - occupiedBeds
    }
  });
}


/* =====================================================
   HR EMPLOYEE LIST
===================================================== */

async function hrEmployees(
  request,
  env
) {

  const auth =
    await requireAuth(
      request,
      env,
      "HR"
    );


  if (!auth.ok) {
    return auth.response;
  }


  const url =
    new URL(request.url);


  const department =
    clean(
      url.searchParams.get(
        "department"
      )
    );


  const search =
    clean(
      url.searchParams.get(
        "search"
      )
    );


  let sql = `
    SELECT
      employee_id,
      name,
      department,
      designation,
      phone,
      aadhaar_no,
      native_address,
      doj,
      employee_type,
      shift,
      block,
      room_no,
      bed_no,
      qr_id,
      hostel_status,
      temporary_out_status,
      expected_return_date,
      active
    FROM employees
    WHERE 1 = 1
  `;


  const params = [];


  if (department) {

    if (
      !ALLOWED_DEPARTMENTS
        .includes(department)
    ) {

      return json({
        ok: false,
        error:
          "Invalid department."
      }, 400);
    }


    sql += `
      AND department = ?
    `;

    params.push(
      department
    );
  }


  if (search) {

    sql += `
      AND (
        employee_id LIKE ?
        OR name LIKE ?
        OR phone LIKE ?
      )
    `;


    const pattern =
      `%${search}%`;


    params.push(
      pattern,
      pattern,
      pattern
    );
  }


  sql += `
    ORDER BY name ASC
  `;


  const result =
    await env.DB
      .prepare(sql)
      .bind(...params)
      .all();


  return json({
    ok: true,
    employees:
      result.results || []
  });
}


/* =====================================================
   HR CREATE EMPLOYEE
===================================================== */

async function hrCreateEmployee(
  request,
  env
) {

  const auth =
    await requireAuth(
      request,
      env,
      "HR"
    );


  if (!auth.ok) {
    return auth.response;
  }


  return await employeeRegister(
    request,
    env,
    true
  );
}


/* =====================================================
   HR UPDATE EMPLOYEE
===================================================== */

async function hrUpdateEmployee(
  request,
  env,
  employeeId
) {

  const auth =
    await requireAuth(
      request,
      env,
      "HR"
    );


  if (!auth.ok) {
    return auth.response;
  }


  const body =
    await readJSON(request);


  const employee =
    await env.DB.prepare(`
      SELECT *
      FROM employees
      WHERE employee_id = ?
      LIMIT 1
    `)
      .bind(employeeId)
      .first();


  if (!employee) {

    return json({
      ok: false,
      error:
        "Employee not found."
    }, 404);
  }


  const name =
    body.name !== undefined
      ? clean(body.name)
      : null;


  const department =
    body.department !== undefined
      ? clean(body.department)
      : null;


  const designation =
    body.designation !== undefined
      ? clean(body.designation)
      : null;


  const phone =
    body.phone !== undefined
      ? clean(body.phone)
      : null;


  const aadhaar =
    body.aadhaar !== undefined ||
    body.aadhaarNo !== undefined
      ? clean(
          body.aadhaar ??
          body.aadhaarNo
        )
      : null;


  const nativeAddress =
    body.nativeAddress !== undefined
      ? clean(body.nativeAddress)
      : null;


  const doj =
    body.doj !== undefined
      ? clean(body.doj)
      : null;


  const employeeType =
    body.employeeType !== undefined
      ? clean(body.employeeType)
      : null;


  const shift =
    body.shift !== undefined
      ? clean(body.shift)
      : null;


  if (
    department &&
    !ALLOWED_DEPARTMENTS
      .includes(department)
  ) {

    return json({
      ok: false,
      error:
        "Department must be PDN, PDN2, MDN or PDN3."
    }, 400);
  }


  if (
    employeeType &&
    !EMPLOYEE_TYPES
      .includes(employeeType)
  ) {

    return json({
      ok: false,
      error:
        "Invalid employee type."
    }, 400);
  }


  if (
    shift &&
    !ALLOWED_SHIFTS
      .includes(shift)
  ) {

    return json({
      ok: false,
      error:
        "Invalid shift."
    }, 400);
  }


  if (
    phone &&
    !/^[0-9]{10}$/.test(phone)
  ) {

    return json({
      ok: false,
      error:
        "Invalid phone number."
    }, 400);
  }


  if (
    aadhaar &&
    !/^[0-9]{12}$/.test(aadhaar)
  ) {

    return json({
      ok: false,
      error:
        "Invalid Aadhaar number."
    }, 400);
  }


  await env.DB.prepare(`
    UPDATE employees
    SET
      name = COALESCE(?, name),
      department = COALESCE(?, department),
      designation = COALESCE(?, designation),
      phone = COALESCE(?, phone),
      aadhaar_no = COALESCE(?, aadhaar_no),
      native_address = COALESCE(?, native_address),
      doj = COALESCE(?, doj),
      employee_type = COALESCE(?, employee_type),
      shift = COALESCE(?, shift),
      updated_at = CURRENT_TIMESTAMP
    WHERE employee_id = ?
  `)
    .bind(
      nullable(name),
      nullable(department),
      nullable(designation),
      nullable(phone),
      nullable(aadhaar),
      nullable(nativeAddress),
      nullable(doj),
      nullable(employeeType),
      nullable(shift),
      employeeId
    )
    .run();


  await audit(
    env,
    "HR",
    auth.actorId,
    "EMPLOYEE_UPDATE",
    "EMPLOYEE",
    employeeId,
    JSON.stringify(body)
  );


  return json({
    ok: true,
    message:
      "Employee updated successfully."
  });
}


/* =====================================================
   HR DEACTIVATE
===================================================== */

async function hrDeactivateEmployee(
  request,
  env,
  employeeId
) {

  const auth =
    await requireAuth(
      request,
      env,
      "HR"
    );


  if (!auth.ok) {
    return auth.response;
  }


  const employee =
    await env.DB.prepare(`
      SELECT *
      FROM employees
      WHERE employee_id = ?
      LIMIT 1
    `)
      .bind(employeeId)
      .first();


  if (!employee) {

    return json({
      ok: false,
      error:
        "Employee not found."
    }, 404);
  }


  await releaseEmployeeRoom(
    env,
    employeeId
  );


  await env.DB.prepare(`
    UPDATE employees
    SET
      active = 0,
      hostel_status = 'OUT',
      temporary_out_status = 'NO',
      updated_at = CURRENT_TIMESTAMP
    WHERE employee_id = ?
  `)
    .bind(employeeId)
    .run();


  await audit(
    env,
    "HR",
    auth.actorId,
    "EMPLOYEE_DEACTIVATE",
    "EMPLOYEE",
    employeeId,
    "Employee deactivated"
  );


  return json({
    ok: true,
    message:
      "Employee deactivated."
  });
}


/* =====================================================
   HR ROOMS
===================================================== */

async function hrRooms(
  request,
  env
) {

  const auth =
    await requireAuth(
      request,
      env,
      "HR"
    );


  if (!auth.ok) {
    return auth.response;
  }


  const result =
    await env.DB.prepare(`
      SELECT
        r.block,
        r.room_no,
        r.capacity,
        r.eligibility,
        COUNT(
          CASE
            WHEN b.employee_id IS NOT NULL
            THEN 1
          END
        ) AS occupied,
        (
          r.capacity -
          COUNT(
            CASE
              WHEN b.employee_id IS NOT NULL
              THEN 1
            END
          )
        ) AS vacant
      FROM rooms r
      LEFT JOIN room_beds b
        ON r.block = b.block
       AND r.room_no = b.room_no
      GROUP BY
        r.id,
        r.block,
        r.room_no,
        r.capacity,
        r.eligibility
      ORDER BY
        r.block,
        CAST(
          substr(r.room_no, 2)
          AS INTEGER
        )
    `)
      .all();


  const occupiedBeds =
    await count(
      env,
      `
      SELECT COUNT(*) AS total
      FROM room_beds
      WHERE employee_id IS NOT NULL
      `
    );


  return json({
    ok: true,
    rooms:
      result.results || [],
    occupiedBeds,
    availableBeds:
      192 - occupiedBeds,
    totalBeds: 192
  });
}


/* =====================================================
   ROOM ALLOCATION
===================================================== */

async function hrAllocateRoom(
  request,
  env
) {

  const auth =
    await requireAuth(
      request,
      env,
      "HR"
    );


  if (!auth.ok) {
    return auth.response;
  }


  const body =
    await readJSON(request);


  const employeeId =
    clean(body.employeeId);


  const requestedBlock =
    clean(body.block);


  if (!employeeId) {

    return json({
      ok: false,
      error:
        "Employee ID is required."
    }, 400);
  }


  const employee =
    await env.DB.prepare(`
      SELECT *
      FROM employees
      WHERE employee_id = ?
      AND active = 1
      LIMIT 1
    `)
      .bind(employeeId)
      .first();


  if (!employee) {

    return json({
      ok: false,
      error:
        "Employee not found."
    }, 404);
  }


  if (
    employee.block &&
    employee.room_no &&
    employee.bed_no
  ) {

    return json({
      ok: false,
      error:
        "Employee already has a room. Vacate/change room first."
    }, 409);
  }


  if (
    requestedBlock &&
    !["A","B","C","D"]
      .includes(requestedBlock)
  ) {

    return json({
      ok: false,
      error:
        "Invalid block."
    }, 400);
  }


  const room =
    await findAvailableRoom(
      env,
      employee,
      requestedBlock
    );


  if (!room) {

    return json({
      ok: false,
      error:
        "No eligible vacant bed available."
    }, 409);
  }


  await env.DB.prepare(`
    UPDATE room_beds
    SET employee_id = ?
    WHERE block = ?
      AND room_no = ?
      AND bed_no = ?
      AND employee_id IS NULL
  `)
    .bind(
      employeeId,
      room.block,
      room.room_no,
      room.bed_no
    )
    .run();


  await env.DB.prepare(`
    UPDATE employees
    SET
      block = ?,
      room_no = ?,
      bed_no = ?,
      hostel_status = 'IN',
      temporary_out_status = 'NO',
      expected_return_date = '',
      updated_at = CURRENT_TIMESTAMP
    WHERE employee_id = ?
  `)
    .bind(
      room.block,
      room.room_no,
      room.bed_no,
      employeeId
    )
    .run();


  await audit(
    env,
    "HR",
    auth.actorId,
    "ROOM_ALLOCATE",
    "EMPLOYEE",
    employeeId,
    `${room.room_no}/Bed-${room.bed_no}`
  );


  return json({
    ok: true,
    message:
      "Room allocated successfully.",
    allocation: {
      block:
        room.block,
      room:
        room.room_no,
      bed:
        room.bed_no
    }
  });
}


/* =====================================================
   FIND AVAILABLE ROOM
===================================================== */

async function findAvailableRoom(
  env,
  employee,
  requestedBlock = ""
) {

  const blocks =
    requestedBlock
      ? [requestedBlock]
      : ["A","B","C","D"];


  for (
    const block of blocks
  ) {

    const rooms =
      await env.DB.prepare(`
        SELECT
          block,
          room_no,
          capacity,
          eligibility
        FROM rooms
        WHERE block = ?
        ORDER BY
          CAST(
            substr(room_no, 2)
            AS INTEGER
          )
      `)
        .bind(block)
        .all();


    for (
      const room of
      rooms.results || []
    ) {

      if (
        !roomEligible(
          employee.employee_type,
          room.eligibility
        )
      ) {
        continue;
      }


      const bed =
        await env.DB.prepare(`
          SELECT
            bed_no
          FROM room_beds
          WHERE block = ?
          AND room_no = ?
          AND employee_id IS NULL
          ORDER BY bed_no ASC
          LIMIT 1
        `)
          .bind(
            room.block,
            room.room_no
          )
          .first();


      if (bed) {

        return {
          block:
            room.block,
          room_no:
            room.room_no,
          bed_no:
            bed.bed_no
        };
      }
    }
  }


  return null;
}


/* =====================================================
   ROOM ELIGIBILITY
===================================================== */

function roomEligible(
  employeeType,
  eligibility
) {

  const allowed =
    String(
      eligibility || ""
    )
      .split(",")
      .map(
        x => x.trim()
      );


  if (
    employeeType === "Employee"
  ) {
    return allowed.includes(
      "EMPLOYEE"
    );
  }


  if (
    employeeType === "Intern"
  ) {
    return allowed.includes(
      "INTERN"
    );
  }


  if (
    employeeType === "New Joiner"
  ) {
    return allowed.includes(
      "NEW_JOINER"
    );
  }


  return false;
}


/* =====================================================
   DIRECT ROOM VACATE
===================================================== */

async function hrVacateRoom(
  request,
  env
) {

  const auth =
    await requireAuth(
      request,
      env,
      "HR"
    );


  if (!auth.ok) {
    return auth.response;
  }


  const body =
    await readJSON(request);


  const employeeId =
    clean(body.employeeId);


  if (!employeeId) {

    return json({
      ok: false,
      error:
        "Employee ID is required."
    }, 400);
  }


  const released =
    await releaseEmployeeRoom(
      env,
      employeeId
    );


  if (!released) {

    return json({
      ok: false,
      error:
        "Employee not found."
    }, 404);
  }


  await env.DB.prepare(`
    UPDATE employees
    SET
      hostel_status = 'OUT',
      temporary_out_status = 'NO',
      expected_return_date = '',
      updated_at = CURRENT_TIMESTAMP
    WHERE employee_id = ?
  `)
    .bind(employeeId)
    .run();


  await audit(
    env,
    "HR",
    auth.actorId,
    "ROOM_VACATE",
    "EMPLOYEE",
    employeeId,
    "Room vacated"
  );


  return json({
    ok: true,
    message:
      "Room vacated successfully."
  });
}


/* =====================================================
   RELEASE ROOM
===================================================== */

async function releaseEmployeeRoom(
  env,
  employeeId
) {

  const employee =
    await env.DB.prepare(`
      SELECT
        employee_id,
        block,
        room_no,
        bed_no
      FROM employees
      WHERE employee_id = ?
      LIMIT 1
    `)
      .bind(employeeId)
      .first();


  if (!employee) {
    return false;
  }


  if (
    employee.block &&
    employee.room_no &&
    employee.bed_no
  ) {

    await env.DB.prepare(`
      UPDATE room_beds
      SET employee_id = NULL
      WHERE block = ?
      AND room_no = ?
      AND bed_no = ?
      AND employee_id = ?
    `)
      .bind(
        employee.block,
        employee.room_no,
        employee.bed_no,
        employeeId
      )
      .run();
  }


  await env.DB.prepare(`
    UPDATE employees
    SET
      block = '',
      room_no = '',
      bed_no = NULL,
      updated_at = CURRENT_TIMESTAMP
    WHERE employee_id = ?
  `)
    .bind(employeeId)
    .run();


  return true;
}


/* =====================================================
   RESTORE EMPLOYEE ROOM
===================================================== */

async function restoreEmployeeRoom(
  env,
  employeeId
) {

  const employee =
    await env.DB.prepare(`
      SELECT *
      FROM employees
      WHERE employee_id = ?
      AND active = 1
      LIMIT 1
    `)
      .bind(employeeId)
      .first();


  if (!employee) {
    return false;
  }


  if (
    employee.block &&
    employee.room_no &&
    employee.bed_no
  ) {

    await env.DB.prepare(`
      UPDATE room_beds
      SET employee_id = ?
      WHERE block = ?
      AND room_no = ?
      AND bed_no = ?
      AND employee_id IS NULL
    `)
      .bind(
        employeeId,
        employee.block,
        employee.room_no,
        employee.bed_no
      )
      .run();


    const occupied =
      await env.DB.prepare(`
        SELECT employee_id
        FROM room_beds
        WHERE block = ?
        AND room_no = ?
        AND bed_no = ?
      `)
        .bind(
          employee.block,
          employee.room_no,
          employee.bed_no
        )
        .first();


    if (
      occupied &&
      occupied.employee_id ===
        employeeId
    ) {

      await env.DB.prepare(`
        UPDATE employees
        SET
          hostel_status = 'IN',
          temporary_out_status = 'NO',
          expected_return_date = '',
          last_checkin_at =
            CURRENT_TIMESTAMP,
          updated_at =
            CURRENT_TIMESTAMP
        WHERE employee_id = ?
      `)
        .bind(employeeId)
        .run();


      return true;
    }
  }


  const room =
    await findAvailableRoom(
      env,
      employee,
      ""
    );


  if (!room) {
    return false;
  }


  await env.DB.prepare(`
    UPDATE room_beds
    SET employee_id = ?
    WHERE block = ?
    AND room_no = ?
    AND bed_no = ?
    AND employee_id IS NULL
  `)
    .bind(
      employeeId,
      room.block,
      room.room_no,
      room.bed_no
    )
    .run();


  await env.DB.prepare(`
    UPDATE employees
    SET
      block = ?,
      room_no = ?,
      bed_no = ?,
      hostel_status = 'IN',
      temporary_out_status = 'NO',
      expected_return_date = '',
      last_checkin_at =
        CURRENT_TIMESTAMP,
      updated_at =
        CURRENT_TIMESTAMP
    WHERE employee_id = ?
  `)
    .bind(
      room.block,
      room.room_no,
      room.bed_no,
      employeeId
    )
    .run();


  return true;
}


/* =====================================================
   EMPLOYEE LEAVE REQUEST
===================================================== */

async function employeeLeaveRequest(
  request,
  env
) {

  const auth =
    await requireAuth(
      request,
      env,
      "EMPLOYEE"
    );


  if (!auth.ok) {
    return auth.response;
  }


  const body =
    await readJSON(request);


  const fromDate =
    clean(body.fromDate);

  const toDate =
    clean(body.toDate);

  const reason =
    clean(body.reason);


  if (
    !fromDate ||
    !toDate ||
    !reason
  ) {

    return json({
      ok: false,
      error:
        "From date, to date and reason are required."
    }, 400);
  }


  if (
    !validDate(fromDate) ||
    !validDate(toDate)
  ) {

    return json({
      ok: false,
      error:
        "Invalid date."
    }, 400);
  }


  if (
    compareDates(
      fromDate,
      toDate
    ) > 0
  ) {

    return json({
      ok: false,
      error:
        "Invalid leave date range."
    }, 400);
  }


  await env.DB.prepare(`
    INSERT INTO leave_records
    (
      employee_id,
      from_date,
      to_date,
      reason,
      status
    )
    VALUES (?, ?, ?, ?, 'Pending')
  `)
    .bind(
      auth.actorId,
      fromDate,
      toDate,
      reason
    )
    .run();


  await audit(
    env,
    "EMPLOYEE",
    auth.actorId,
    "LEAVE_REQUEST",
    "LEAVE",
    auth.actorId,
    reason
  );


  return json({
    ok: true,
    message:
      "Leave request submitted."
  });
}


/* =====================================================
   EMPLOYEE LEAVE LIST
===================================================== */

async function employeeLeaveList(
  request,
  env
) {

  const auth =
    await requireAuth(
      request,
      env,
      "EMPLOYEE"
    );


  if (!auth.ok) {
    return auth.response;
  }


  const result =
    await env.DB.prepare(`
      SELECT *
      FROM leave_records
      WHERE employee_id = ?
      ORDER BY id DESC
    `)
      .bind(
        auth.actorId
      )
      .all();


  return json({
    ok: true,
    leaves:
      result.results || []
  });
}


/* =====================================================
   HR LEAVE LIST
===================================================== */

async function hrLeave(
  request,
  env
) {

  const auth =
    await requireAuth(
      request,
      env,
      "HR"
    );


  if (!auth.ok) {
    return auth.response;
  }


  const result =
    await env.DB.prepare(`
      SELECT
        l.*,
        e.name,
        e.department,
        e.shift,
        e.employee_type
      FROM leave_records l
      LEFT JOIN employees e
        ON e.employee_id =
           l.employee_id
      ORDER BY l.id DESC
    `)
      .all();


  return json({
    ok: true,
    leaves:
      result.results || []
  });
}


/* =====================================================
   HR LEAVE DECISION
===================================================== */

async function hrLeaveDecision(
  request,
  env,
  id
) {

  const auth =
    await requireAuth(
      request,
      env,
      "HR"
    );


  if (!auth.ok) {
    return auth.response;
  }


  const body =
    await readJSON(request);


  const status =
    clean(body.status);


  if (
    ![
      "Approved",
      "Rejected"
    ].includes(status)
  ) {

    return json({
      ok: false,
      error:
        "Status must be Approved or Rejected."
    }, 400);
  }


  const result =
    await env.DB.prepare(`
      UPDATE leave_records
      SET status = ?
      WHERE id = ?
    `)
      .bind(
        status,
        id
      )
      .run();


  if (
    !result.success
  ) {

    return json({
      ok: false,
      error:
        "Unable to update leave."
    }, 500);
  }


  await audit(
    env,
    "HR",
    auth.actorId,
    `LEAVE_${status.toUpperCase()}`,
    "LEAVE",
    id,
    ""
  );


  return json({
    ok: true,
    message:
      `Leave ${status.toLowerCase()}.`
  });
}


/* =====================================================
   EMPLOYEE VACATE REQUEST
===================================================== */

async function employeeVacateRequest(
  request,
  env
) {

  const auth =
    await requireAuth(
      request,
      env,
      "EMPLOYEE"
    );


  if (!auth.ok) {
    return auth.response;
  }


  const body =
    await readJSON(request);


  const vacateDate =
    clean(body.vacateDate);

  const returnDate =
    clean(
      body.returnDate ??
      body.expectedReturnDate
    );

  const reason =
    clean(body.reason);


  if (
    !vacateDate ||
    !reason
  ) {

    return json({
      ok: false,
      error:
        "Vacate date and reason are required."
    }, 400);
  }


  if (
    returnDate &&
    compareDates(
      vacateDate,
      returnDate
    ) > 0
  ) {

    return json({
      ok: false,
      error:
        "Return date cannot be before vacate date."
    }, 400);
  }


  await env.DB.prepare(`
    INSERT INTO vacate_records
    (
      employee_id,
      vacate_date,
      return_date,
      reason,
      status
    )
    VALUES (?, ?, ?, ?, 'Pending')
  `)
    .bind(
      auth.actorId,
      vacateDate,
      returnDate || null,
      reason
    )
    .run();


  await audit(
    env,
    "EMPLOYEE",
    auth.actorId,
    "VACATE_REQUEST",
    "VACATE",
    auth.actorId,
    reason
  );


  return json({
    ok: true,
    message:
      "Vacate request submitted."
  });
}


/* =====================================================
   EMPLOYEE VACATE LIST
===================================================== */

async function employeeVacateList(
  request,
  env
) {

  const auth =
    await requireAuth(
      request,
      env,
      "EMPLOYEE"
    );


  if (!auth.ok) {
    return auth.response;
  }


  const result =
    await env.DB.prepare(`
      SELECT *
      FROM vacate_records
      WHERE employee_id = ?
      ORDER BY id DESC
    `)
      .bind(
        auth.actorId
      )
      .all();


  return json({
    ok: true,
    vacates:
      result.results || []
  });
}


/* =====================================================
   HR VACATE
===================================================== */

async function hrVacate(
  request,
  env
) {

  const auth =
    await requireAuth(
      request,
      env,
      "HR"
    );


  if (!auth.ok) {
    return auth.response;
  }


  const result =
    await env.DB.prepare(`
      SELECT
        v.*,
        e.name,
        e.department,
        e.shift,
        e.employee_type,
        e.block,
        e.room_no,
        e.bed_no
      FROM vacate_records v
      LEFT JOIN employees e
        ON e.employee_id =
           v.employee_id
      ORDER BY v.id DESC
    `)
      .all();


  return json({
    ok: true,
    vacates:
      result.results || []
  });
}


/* =====================================================
   HR VACATE DECISION
===================================================== */

async function hrVacateDecision(
  request,
  env,
  id
) {

  const auth =
    await requireAuth(
      request,
      env,
      "HR"
    );


  if (!auth.ok) {
    return auth.response;
  }


  const body =
    await readJSON(request);


  const status =
    clean(body.status);


  const record =
    await env.DB.prepare(`
      SELECT *
      FROM vacate_records
      WHERE id = ?
      LIMIT 1
    `)
      .bind(id)
      .first();


  if (!record) {

    return json({
      ok: false,
      error:
        "Vacate request not found."
    }, 404);
  }


  if (
    ![
      "Approved",
      "Rejected"
    ].includes(status)
  ) {

    return json({
      ok: false,
      error:
        "Status must be Approved or Rejected."
    }, 400);
  }


  await env.DB.prepare(`
    UPDATE vacate_records
    SET status = ?
    WHERE id = ?
  `)
    .bind(
      status,
      id
    )
    .run();


  if (
    status === "Approved"
  ) {

    await releaseEmployeeRoom(
      env,
      record.employee_id
    );


    await env.DB.prepare(`
      UPDATE employees
      SET
        hostel_status = 'OUT',
        temporary_out_status = 'NO',
        expected_return_date = '',
        last_checkout_at =
          CURRENT_TIMESTAMP,
        updated_at =
          CURRENT_TIMESTAMP
      WHERE employee_id = ?
    `)
      .bind(
        record.employee_id
      )
      .run();
  }


  await audit(
    env,
    "HR",
    auth.actorId,
    `VACATE_${status.toUpperCase()}`,
    "VACATE",
    id,
    ""
  );


  return json({
    ok: true,
    message:
      `Vacate ${status.toLowerCase()}.`
  });
}


/* =====================================================
   TEMPORARY OUT
===================================================== */

async function employeeTemporaryOut(
  request,
  env
) {

  const auth =
    await requireAuth(
      request,
      env,
      "EMPLOYEE"
    );


  if (!auth.ok) {
    return auth.response;
  }


  const body =
    await readJSON(request);


  const fromDate =
    clean(body.fromDate);

  const expectedReturnDate =
    clean(
      body.expectedReturnDate
    );

  const reason =
    clean(body.reason);


  if (
    !fromDate ||
    !expectedReturnDate ||
    !reason
  ) {

    return json({
      ok: false,
      error:
        "From date, expected return date and reason are required."
    }, 400);
  }


  if (
    !validDate(fromDate) ||
    !validDate(expectedReturnDate)
  ) {

    return json({
      ok: false,
      error:
        "Invalid date."
    }, 400);
  }


  if (
    compareDates(
      fromDate,
      expectedReturnDate
    ) > 0
  ) {

    return json({
      ok: false,
      error:
        "Expected return date cannot be before from date."
    }, 400);
  }


  await env.DB.prepare(`
    INSERT INTO temporary_out_records
    (
      employee_id,
      from_date,
      expected_return_date,
      reason,
      status
    )
    VALUES (?, ?, ?, ?, 'Pending')
  `)
    .bind(
      auth.actorId,
      fromDate,
      expectedReturnDate,
      reason
    )
    .run();


  await audit(
    env,
    "EMPLOYEE",
    auth.actorId,
    "TEMPORARY_OUT_REQUEST",
    "TEMPORARY_OUT",
    auth.actorId,
    reason
  );


  return json({
    ok: true,
    message:
      "Temporary hometown request submitted."
  });
}


/* =====================================================
   EMPLOYEE TEMPORARY OUT LIST
===================================================== */

async function employeeTemporaryOutList(
  request,
  env
) {

  const auth =
    await requireAuth(
      request,
      env,
      "EMPLOYEE"
    );


  if (!auth.ok) {
    return auth.response;
  }


  const result =
    await env.DB.prepare(`
      SELECT *
      FROM temporary_out_records
      WHERE employee_id = ?
      ORDER BY id DESC
    `)
      .bind(
        auth.actorId
      )
      .all();


  return json({
    ok: true,
    temporaryOut:
      result.results || []
  });
}


/* =====================================================
   HR TEMPORARY OUT
===================================================== */

async function hrTemporaryOut(
  request,
  env
) {

  const auth =
    await requireAuth(
      request,
      env,
      "HR"
    );


  if (!auth.ok) {
    return auth.response;
  }


  const today =
    todayISO();


  const result =
    await env.DB.prepare(`
      SELECT
        t.*,
        e.name,
        e.department,
        e.shift,
        e.employee_type,
        e.block,
        e.room_no,
        e.bed_no,
        CASE
          WHEN
            t.status = 'Approved'
            AND date(t.expected_return_date)
              < date(?)
            AND (
              t.actual_return_date = ''
              OR t.actual_return_date IS NULL
            )
          THEN 1
          ELSE 0
        END AS overdue
      FROM temporary_out_records t
      LEFT JOIN employees e
        ON e.employee_id =
           t.employee_id
      ORDER BY t.id DESC
    `)
      .bind(today)
      .all();


  return json({
    ok: true,
    temporaryOut:
      result.results || []
  });
}


/* =====================================================
   HR TEMPORARY OUT DECISION
===================================================== */

async function hrTemporaryOutDecision(
  request,
  env,
  id
) {

  const auth =
    await requireAuth(
      request,
      env,
      "HR"
    );


  if (!auth.ok) {
    return auth.response;
  }


  const body =
    await readJSON(request);


  const status =
    clean(body.status);


  const record =
    await env.DB.prepare(`
      SELECT *
      FROM temporary_out_records
      WHERE id = ?
      LIMIT 1
    `)
      .bind(id)
      .first();


  if (!record) {

    return json({
      ok: false,
      error:
        "Temporary Out request not found."
    }, 404);
  }


  if (
    ![
      "Approved",
      "Rejected",
      "Returned"
    ].includes(status)
  ) {

    return json({
      ok: false,
      error:
        "Invalid status."
    }, 400);
  }


  if (
    status === "Approved"
  ) {

    await env.DB.prepare(`
      UPDATE temporary_out_records
      SET
        status = 'Approved',
        approved_at =
          CURRENT_TIMESTAMP
      WHERE id = ?
    `)
      .bind(id)
      .run();


    await env.DB.prepare(`
      UPDATE employees
      SET
        temporary_out_status = 'YES',
        expected_return_date = ?,
        hostel_status = 'OUT',
        last_checkout_at =
          CURRENT_TIMESTAMP,
        updated_at =
          CURRENT_TIMESTAMP
      WHERE employee_id = ?
    `)
      .bind(
        record.expected_return_date,
        record.employee_id
      )
      .run();
  }


  if (
    status === "Rejected"
  ) {

    await env.DB.prepare(`
      UPDATE temporary_out_records
      SET status = 'Rejected'
      WHERE id = ?
    `)
      .bind(id)
      .run();
  }


  if (
    status === "Returned"
  ) {

    const restored =
      await restoreEmployeeRoom(
        env,
        record.employee_id
      );


    if (!restored) {

      return json({
        ok: false,
        error:
          "No eligible room/bed available for check-in."
      }, 409);
    }


    await env.DB.prepare(`
      UPDATE temporary_out_records
      SET
        status = 'Returned',
        actual_return_date = ?
      WHERE id = ?
    `)
      .bind(
        todayISO(),
        id
      )
      .run();
  }


  await audit(
    env,
    "HR",
    auth.actorId,
    `TEMPORARY_OUT_${status.toUpperCase()}`,
    "TEMPORARY_OUT",
    id,
    ""
  );


  return json({
    ok: true,
    message:
      `Temporary Out ${status.toLowerCase()}.`
  });
}


/* =====================================================
   EMPLOYEE CHECK-IN
===================================================== */

async function employeeCheckin(
  request,
  env
) {

  const auth =
    await requireAuth(
      request,
      env,
      "EMPLOYEE"
    );


  if (!auth.ok) {
    return auth.response;
  }


  const pending =
    await env.DB.prepare(`
      SELECT id
      FROM checkin_requests
      WHERE employee_id = ?
      AND status = 'Pending'
      LIMIT 1
    `)
      .bind(
        auth.actorId
      )
      .first();


  if (pending) {

    return json({
      ok: false,
      error:
        "A check-in request is already pending."
    }, 409);
  }


  await env.DB.prepare(`
    INSERT INTO checkin_requests
    (
      employee_id,
      status
    )
    VALUES (?, 'Pending')
  `)
    .bind(
      auth.actorId
    )
    .run();


  return json({
    ok: true,
    message:
      "Check-in request submitted."
  });
}


/* =====================================================
   HR CHECK-IN LIST
===================================================== */

async function hrCheckins(
  request,
  env
) {

  const auth =
    await requireAuth(
      request,
      env,
      "HR"
    );


  if (!auth.ok) {
    return auth.response;
  }


  const result =
    await env.DB.prepare(`
      SELECT
        c.*,
        e.name,
        e.department,
        e.shift,
        e.employee_type,
        e.block,
        e.room_no,
        e.bed_no
      FROM checkin_requests c
      LEFT JOIN employees e
        ON e.employee_id =
           c.employee_id
      ORDER BY c.id DESC
    `)
      .all();


  return json({
    ok: true,
    checkins:
      result.results || []
  });
}


/* =====================================================
   HR CHECK-IN DECISION
===================================================== */

async function hrCheckinDecision(
  request,
  env,
  id
) {

  const auth =
    await requireAuth(
      request,
      env,
      "HR"
    );


  if (!auth.ok) {
    return auth.response;
  }


  const body =
    await readJSON(request);


  const status =
    clean(body.status);


  if (
    ![
      "Approved",
      "Rejected"
    ].includes(status)
  ) {

    return json({
      ok: false,
      error:
        "Invalid check-in status."
    }, 400);
  }


  const requestRow =
    await env.DB.prepare(`
      SELECT *
      FROM checkin_requests
      WHERE id = ?
      LIMIT 1
    `)
      .bind(id)
      .first();


  if (!requestRow) {

    return json({
      ok: false,
      error:
        "Check-in request not found."
    }, 404);
  }


  await env.DB.prepare(`
    UPDATE checkin_requests
    SET
      status = ?,
      approved_at =
        CASE
          WHEN ? = 'Approved'
          THEN CURRENT_TIMESTAMP
          ELSE approved_at
        END
    WHERE id = ?
  `)
    .bind(
      status,
      status,
      id
    )
    .run();


  if (
    status === "Approved"
  ) {

    const restored =
      await restoreEmployeeRoom(
        env,
        requestRow.employee_id
      );


    if (!restored) {

      return json({
        ok: false,
        error:
          "Check-in approved but no eligible room/bed is available."
      }, 409);
    }
  }


  await audit(
    env,
    "HR",
    auth.actorId,
    `CHECKIN_${status.toUpperCase()}`,
    "CHECKIN",
    id,
    ""
  );


  return json({
    ok: true,
    message:
      `Check-in ${status.toLowerCase()}.`
  });
}


/* =====================================================
   EMPLOYEE QR
===================================================== */

async function employeeQR(
  request,
  env,
  employeeId
) {

  const auth =
    await requireAuth(
      request,
      env,
      "EMPLOYEE"
    );


  if (!auth.ok) {
    return auth.response;
  }


  if (
    auth.actorId !==
    employeeId
  ) {

    return json({
      ok: false,
      error:
        "You can access only your own QR."
    }, 403);
  }


  const employee =
    await env.DB.prepare(`
      SELECT
        employee_id,
        name,
        department,
        designation,
        employee_type,
        shift,
        qr_id
      FROM employees
      WHERE employee_id = ?
      AND active = 1
      LIMIT 1
    `)
      .bind(employeeId)
      .first();


  if (!employee) {

    return json({
      ok: false,
      error:
        "Employee not found."
    }, 404);
  }


  return json({
    ok: true,
    qr: {
      qrId:
        employee.qr_id,
      employeeId:
        employee.employee_id,
      name:
        employee.name,
      department:
        employee.department,
      designation:
        employee.designation,
      employeeType:
        employee.employee_type,
      shift:
        employee.shift
    }
  });
}


/* =====================================================
   CAB QR SCAN
===================================================== */

async function cabScan(
  request,
  env
) {

  const auth =
    await requireAuth(
      request,
      env,
      "HR"
    );


  if (!auth.ok) {
    return auth.response;
  }


  const body =
    await readJSON(request);


  const qrId =
    clean(body.qrId);


  const cabNo =
    Number(body.cabNo);


  const travelDate =
    clean(body.travelDate)
    || todayISO();


  if (!qrId) {

    return json({
      ok: false,
      error:
        "Employee QR ID is required."
    }, 400);
  }


  if (
    !Number.isInteger(cabNo) ||
    cabNo < 1 ||
    cabNo > CAB_COUNT
  ) {

    return json({
      ok: false,
      error:
        "Cab must be between 1 and 5."
    }, 400);
  }


  const employee =
    await env.DB.prepare(`
      SELECT *
      FROM employees
      WHERE qr_id = ?
      AND active = 1
      LIMIT 1
    `)
      .bind(qrId)
      .first();


  if (!employee) {

    return json({
      ok: false,
      error:
        "Employee QR not found."
    }, 404);
  }


  /*
    Cab restriction:
    Only the four approved departments.
  */

  if (
    !ALLOWED_DEPARTMENTS
      .includes(employee.department)
  ) {

    return json({
      ok: false,
      error:
        "Employee department is not allowed for cab."
    }, 403);
  }


  const existing =
    await env.DB.prepare(`
      SELECT id
      FROM cab_entries
      WHERE employee_id = ?
      AND travel_date = ?
      LIMIT 1
    `)
      .bind(
        employee.employee_id,
        travelDate
      )
      .first();


  if (existing) {

    return json({
      ok: false,
      error:
        "Employee already has a cab entry for this date."
    }, 409);
  }


  const seat =
    await nextCabSeat(
      env,
      cabNo,
      travelDate
    );


  if (!seat) {

    return json({
      ok: false,
      error:
        `Cab ${cabNo} is full.`
    }, 409);
  }


  await env.DB.prepare(`
    INSERT INTO cab_entries
    (
      employee_id,
      employee_name,
      department,
      cab_no,
      seat_no,
      travel_date,
      boarded_at,
      shift,
      status,
      scan_source
    )
    VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, 'Boarded', 'QR'
    )
  `)
    .bind(
      employee.employee_id,
      employee.name,
      employee.department,
      cabNo,
      seat,
      travelDate,
      new Date().toISOString(),
      employee.shift
    )
    .run();


  await audit(
    env,
    "HR",
    auth.actorId,
    "CAB_QR_SCAN",
    "EMPLOYEE",
    employee.employee_id,
    `Cab ${cabNo}, Seat ${seat}`
  );


  return json({
    ok: true,
    message:
      "Cab entry recorded.",
    cab: {
      cabNo,
      seatNo: seat,
      travelDate,
      shift:
        employee.shift
    },
    employee: {
      employeeId:
        employee.employee_id,
      name:
        employee.name,
      department:
        employee.department
    }
  });
}


/* =====================================================
   NEXT CAB SEAT
===================================================== */

async function nextCabSeat(
  env,
  cabNo,
  travelDate
) {

  const result =
    await env.DB.prepare(`
      SELECT seat_no
      FROM cab_entries
      WHERE cab_no = ?
      AND travel_date = ?
      ORDER BY seat_no ASC
    `)
      .bind(
        cabNo,
        travelDate
      )
      .all();


  const used =
    new Set(
      (result.results || [])
        .map(
          row =>
            Number(row.seat_no)
        )
    );


  for (
    let seat = 1;
    seat <= CAB_CAPACITY;
    seat++
  ) {

    if (!used.has(seat)) {
      return seat;
    }
  }


  return null;
}


/* =====================================================
   HR CAB
===================================================== */

async function hrCab(
  request,
  env
) {

  const auth =
    await requireAuth(
      request,
      env,
      "HR"
    );


  if (!auth.ok) {
    return auth.response;
  }


  const url =
    new URL(request.url);


  const date =
    clean(
      url.searchParams.get(
        "date"
      )
    ) || todayISO();


  const entries =
    await env.DB.prepare(`
      SELECT *
      FROM cab_entries
      WHERE travel_date = ?
      ORDER BY
        cab_no,
        seat_no
    `)
      .bind(date)
      .all();


  const rows =
    entries.results || [];


  const cabs = [];


  for (
    let cab = 1;
    cab <= CAB_COUNT;
    cab++
  ) {

    const cabRows =
      rows.filter(
        row =>
          Number(row.cab_no) ===
          cab
      );


    cabs.push({
      cabNo: cab,
      capacity:
        CAB_CAPACITY,
      occupied:
        cabRows.length,
      available:
        CAB_CAPACITY -
        cabRows.length,
      full:
        cabRows.length >=
        CAB_CAPACITY
    });
  }


  const shifts = {};


  for (
    const entry of rows
  ) {

    const shift =
      entry.shift ||
      "Unknown";


    shifts[shift] =
      (shifts[shift] || 0) + 1;
  }


  return json({
    ok: true,
    date,
    capacity:
      CAB_COUNT *
      CAB_CAPACITY,
    totalEntries:
      rows.length,
    available:
      CAB_COUNT *
        CAB_CAPACITY -
      rows.length,
    cabs,
    shifts,
    entries: rows
  });
}


/* =====================================================
   EMPLOYEE CAB
===================================================== */

async function employeeCab(
  request,
  env
) {

  const auth =
    await requireAuth(
      request,
      env,
      "EMPLOYEE"
    );


  if (!auth.ok) {
    return auth.response;
  }


  const url =
    new URL(request.url);


  const date =
    clean(
      url.searchParams.get(
        "date"
      )
    ) || todayISO();


  const result =
    await env.DB.prepare(`
      SELECT
        cab_no,
        seat_no,
        travel_date,
        boarded_at,
        shift,
        status
      FROM cab_entries
      WHERE employee_id = ?
      AND travel_date = ?
      LIMIT 1
    `)
      .bind(
        auth.actorId,
        date
      )
      .first();


  return json({
    ok: true,
    entry:
      result || null
  });
}


/* =====================================================
   ATTENDANCE MARK
===================================================== */

async function markAttendance(
  request,
  env
) {

  const auth =
    await requireAuth(
      request,
      env,
      "HR"
    );


  if (!auth.ok) {
    return auth.response;
  }


  const body =
    await readJSON(request);


  const employeeId =
    clean(body.employeeId);


  const attendanceDate =
    clean(body.date)
    || todayISO();


  const shift =
    clean(body.shift);


  const status =
    clean(body.status);


  if (
    !employeeId ||
    !shift ||
    !status
  ) {

    return json({
      ok: false,
      error:
        "Employee, date, shift and status are required."
    }, 400);
  }


  if (
    !ALLOWED_SHIFTS
      .includes(shift)
  ) {

    return json({
      ok: false,
      error:
        "Invalid shift."
    }, 400);
  }


  if (
    !ATTENDANCE_STATUSES
      .includes(status)
  ) {

    return json({
      ok: false,
      error:
        "Invalid attendance status."
    }, 400);
  }


  const employee =
    await env.DB.prepare(`
      SELECT employee_id
      FROM employees
      WHERE employee_id = ?
      AND active = 1
      LIMIT 1
    `)
      .bind(employeeId)
      .first();


  if (!employee) {

    return json({
      ok: false,
      error:
        "Employee not found."
    }, 404);
  }


  await env.DB.prepare(`
    INSERT INTO attendance_logs
    (
      employee_id,
      attendance_date,
      shift,
      status,
      check_in_time,
      source
    )
    VALUES (?, ?, ?, ?, ?, 'HR')
    ON CONFLICT(
      employee_id,
      attendance_date,
      shift
    )
    DO UPDATE SET
      status =
        excluded.status,
      check_in_time =
        excluded.check_in_time
  `)
    .bind(
      employeeId,
      attendanceDate,
      shift,
      status,
      status === "Present"
        ? new Date().toISOString()
        : ""
    )
    .run();


  await audit(
    env,
    "HR",
    auth.actorId,
    "ATTENDANCE_MARK",
    "EMPLOYEE",
    employeeId,
    `${attendanceDate} / ${shift} / ${status}`
  );


  return json({
    ok: true,
    message:
      "Attendance updated."
  });
}


/* =====================================================
   HR ATTENDANCE
===================================================== */

async function hrAttendance(
  request,
  env
) {

  const auth =
    await requireAuth(
      request,
      env,
      "HR"
    );


  if (!auth.ok) {
    return auth.response;
  }


  const url =
    new URL(request.url);


  const date =
    clean(
      url.searchParams.get(
        "date"
      )
    ) || todayISO();


  const shift =
    clean(
      url.searchParams.get(
        "shift"
      )
    );


  if (
    shift &&
    !ALLOWED_SHIFTS
      .includes(shift)
  ) {

    return json({
      ok: false,
      error:
        "Invalid shift."
    }, 400);
  }


  let sql = `
    SELECT
      e.employee_id,
      e.name,
      e.department,
      e.designation,
      e.employee_type,
      e.shift,
      e.hostel_status,
      a.attendance_date,
      a.status AS attendance_status,
      a.check_in_time,
      a.check_out_time
    FROM employees e
    LEFT JOIN attendance_logs a
      ON a.employee_id =
         e.employee_id
     AND a.attendance_date = ?
     AND a.shift =
         e.shift
    WHERE e.active = 1
  `;


  const params = [date];


  if (shift) {

    sql += `
      AND e.shift = ?
    `;

    params.push(shift);
  }


  sql += `
    ORDER BY
      e.shift,
      e.department,
      e.name
  `;


  const result =
    await env.DB
      .prepare(sql)
      .bind(...params)
      .all();


  const rows =
    result.results || [];


  const summary = {
    total: rows.length,
    present: 0,
    absent: 0,
    leave: 0,
    temporaryOut: 0,
    notMarked: 0
  };


  for (
    const row of rows
  ) {

    const status =
      row.attendance_status;


    if (status === "Present") {
      summary.present++;
    } else if (
      status === "Absent"
    ) {
      summary.absent++;
    } else if (
      status === "Leave"
    ) {
      summary.leave++;
    } else if (
      status === "TemporaryOut"
    ) {
      summary.temporaryOut++;
    } else {
      summary.notMarked++;
    }
  }


  return json({
    ok: true,
    date,
    shift:
      shift || "All",
    summary,
    attendance:
      rows
  });
}


/* =====================================================
   FOOD SCAN
===================================================== */

async function foodScan(
  request,
  env
) {

  const auth =
    await requireAuth(
      request,
      env,
      "HR"
    );


  if (!auth.ok) {
    return auth.response;
  }


  const body =
    await readJSON(request);


  const qrId =
    clean(body.qrId);


  const meal =
    clean(body.meal);


  const scanDate =
    clean(body.date)
    || todayISO();


  if (!qrId || !meal) {

    return json({
      ok: false,
      error:
        "Employee QR ID and meal are required."
    }, 400);
  }


  if (
    !MEALS.includes(meal)
  ) {

    return json({
      ok: false,
      error:
        "Meal must be Breakfast, Lunch or Dinner."
    }, 400);
  }


  const employee =
    await env.DB.prepare(`
      SELECT
        employee_id,
        name,
        department,
        designation,
        employee_type,
        shift,
        qr_id
      FROM employees
      WHERE qr_id = ?
      AND active = 1
      LIMIT 1
    `)
      .bind(qrId)
      .first();


  if (!employee) {

    return json({
      ok: false,
      error:
        "Employee QR not found."
    }, 404);
  }


  if (
    !ALLOWED_DEPARTMENTS
      .includes(employee.department)
  ) {

    return json({
      ok: false,
      error:
        "Employee department is not allowed."
    }, 403);
  }


  const existing =
    await env.DB.prepare(`
      SELECT id
      FROM food_scan_logs
      WHERE employee_id = ?
      AND scan_date = ?
      AND meal = ?
      LIMIT 1
    `)
      .bind(
        employee.employee_id,
        scanDate,
        meal
      )
      .first();


  if (existing) {

    return json({
      ok: false,
      error:
        `${meal} already scanned for this employee today.`
    }, 409);
  }


  await env.DB.prepare(`
    INSERT INTO food_scan_logs
    (
      employee_id,
      scan_date,
      meal,
      scanned_at,
      status,
      scan_source
    )
    VALUES (?, ?, ?, ?, 'Served', 'QR')
  `)
    .bind(
      employee.employee_id,
      scanDate,
      meal,
      new Date().toISOString()
    )
    .run();


  await audit(
    env,
    "HR",
    auth.actorId,
    "FOOD_QR_SCAN",
    "EMPLOYEE",
    employee.employee_id,
    meal
  );


  return json({
    ok: true,
    message:
      `${meal} food entry recorded.`,
    food: {
      employeeId:
        employee.employee_id,
      name:
        employee.name,
      department:
        employee.department,
      meal,
      date:
        scanDate,
      scannedAt:
        new Date().toISOString()
    }
  });
}


/* =====================================================
   HR FOOD
===================================================== */

async function hrFood(
  request,
  env
) {

  const auth =
    await requireAuth(
      request,
      env,
      "HR"
    );


  if (!auth.ok) {
    return auth.response;
  }


  const url =
    new URL(request.url);


  const date =
    clean(
      url.searchParams.get(
        "date"
      )
    ) || todayISO();


  const meal =
    clean(
      url.searchParams.get(
        "meal"
      )
    );


  let sql = `
    SELECT
      f.*,
      e.name,
      e.department,
      e.shift,
      e.employee_type
    FROM food_scan_logs f
    LEFT JOIN employees e
      ON e.employee_id =
         f.employee_id
    WHERE f.scan_date = ?
  `;


  const params = [date];


  if (meal) {

    if (
      !MEALS.includes(meal)
    ) {

      return json({
        ok: false,
        error:
          "Invalid meal."
      }, 400);
    }


    sql += `
      AND f.meal = ?
    `;

    params.push(meal);
  }


  sql += `
    ORDER BY
      f.meal,
      f.scanned_at DESC
  `;


  const result =
    await env.DB
      .prepare(sql)
      .bind(...params)
      .all();


  const rows =
    result.results || [];


  const summary = {
    Breakfast: 0,
    Lunch: 0,
    Dinner: 0,
    Total: rows.length
  };


  for (
    const row of rows
  ) {

    if (
      summary[row.meal] !==
      undefined
    ) {
      summary[row.meal]++;
    }
  }


  return json({
    ok: true,
    date,
    meal:
      meal || "All",
    summary,
    entries:
      rows
  });
}


/* =====================================================
   EMPLOYEE FOOD
===================================================== */

async function employeeFood(
  request,
  env
) {

  const auth =
    await requireAuth(
      request,
      env,
      "EMPLOYEE"
    );


  if (!auth.ok) {
    return auth.response;
  }


  const url =
    new URL(request.url);


  const date =
    clean(
      url.searchParams.get(
        "date"
      )
    ) || todayISO();


  const result =
    await env.DB.prepare(`
      SELECT
        meal,
        scan_date,
        scanned_at,
        status
      FROM food_scan_logs
      WHERE employee_id = ?
      AND scan_date = ?
      ORDER BY scanned_at
    `)
      .bind(
        auth.actorId,
        date
      )
      .all();


  return json({
    ok: true,
    date,
    meals:
      result.results || [],
    mealWindows:
      MEAL_WINDOWS
  });
}


/* =====================================================
   HR REPORTS
===================================================== */

async function hrReports(
  request,
  env
) {

  const auth =
    await requireAuth(
      request,
      env,
      "HR"
    );


  if (!auth.ok) {
    return auth.response;
  }


  const url =
    new URL(request.url);


  const type =
    clean(
      url.searchParams.get(
        "type"
      )
    ) || "employees";


  const date =
    clean(
      url.searchParams.get(
        "date"
      )
    ) || todayISO();


  let result;


  if (
    type === "employees"
  ) {

    result =
      await env.DB.prepare(`
        SELECT
          employee_id,
          name,
          department,
          designation,
          phone,
          aadhaar_no,
          native_address,
          doj,
          employee_type,
          shift,
          block,
          room_no,
          bed_no,
          qr_id,
          hostel_status,
          active,
          created_at
        FROM employees
        ORDER BY name
      `)
        .all();

  } else if (
    type === "rooms"
  ) {

    result =
      await env.DB.prepare(`
        SELECT
          r.block,
          r.room_no,
          r.capacity,
          r.eligibility,
          b.bed_no,
          b.employee_id
        FROM rooms r
        LEFT JOIN room_beds b
          ON b.block = r.block
         AND b.room_no = r.room_no
        ORDER BY
          r.block,
          CAST(
            substr(r.room_no, 2)
            AS INTEGER
          ),
          b.bed_no
      `)
        .all();

  } else if (
    type === "cab"
  ) {

    result =
      await env.DB.prepare(`
        SELECT *
        FROM cab_entries
        WHERE travel_date = ?
        ORDER BY
          cab_no,
          seat_no
      `)
        .bind(date)
        .all();

  } else if (
    type === "attendance"
  ) {

    result =
      await env.DB.prepare(`
        SELECT
          a.*,
          e.name,
          e.department,
          e.designation,
          e.employee_type
        FROM attendance_logs a
        LEFT JOIN employees e
          ON e.employee_id =
             a.employee_id
        WHERE a.attendance_date = ?
        ORDER BY
          a.shift,
          e.name
      `)
        .bind(date)
        .all();

  } else if (
    type === "leave"
  ) {

    result =
      await env.DB.prepare(`
        SELECT
          l.*,
          e.name,
          e.department,
          e.shift
        FROM leave_records l
        LEFT JOIN employees e
          ON e.employee_id =
             l.employee_id
        ORDER BY l.id DESC
      `)
        .all();

  } else if (
    type === "vacate"
  ) {

    result =
      await env.DB.prepare(`
        SELECT
          v.*,
          e.name,
          e.department,
          e.shift
        FROM vacate_records v
        LEFT JOIN employees e
          ON e.employee_id =
             v.employee_id
        ORDER BY v.id DESC
      `)
        .all();

  } else if (
    type === "temporary-out"
  ) {

    result =
      await env.DB.prepare(`
        SELECT
          t.*,
          e.name,
          e.department,
          e.shift
        FROM temporary_out_records t
        LEFT JOIN employees e
          ON e.employee_id =
             t.employee_id
        ORDER BY t.id DESC
      `)
        .all();

  } else if (
    type === "food"
  ) {

    result =
      await env.DB.prepare(`
        SELECT
          f.*,
          e.name,
          e.department,
          e.shift
        FROM food_scan_logs f
        LEFT JOIN employees e
          ON e.employee_id =
             f.employee_id
        WHERE f.scan_date = ?
        ORDER BY
          f.meal,
          f.scanned_at
      `)
        .bind(date)
        .all();

  } else if (
    type === "audit"
  ) {

    result =
      await env.DB.prepare(`
        SELECT *
        FROM audit_logs
        ORDER BY id DESC
        LIMIT 1000
      `)
        .all();

  } else {

    return json({
      ok: false,
      error:
        "Invalid report type."
    }, 400);
  }


  return json({
    ok: true,
    report:
      type,
    date,
    rows:
      result.results || []
  });
}


/* =====================================================
   SESSION CREATE
===================================================== */

async function createSession(
  env,
  actorType,
  actorId
) {

  const token =
    crypto.randomUUID()
    .replace(/-/g, "")
    +
    crypto.randomUUID()
    .replace(/-/g, "");


  const expires =
    new Date(
      Date.now() +
      8 * 60 * 60 * 1000
    )
      .toISOString();


  await env.DB.prepare(`
    INSERT INTO sessions
    (
      token,
      actor_type,
      actor_id,
      expires_at
    )
    VALUES (?, ?, ?, ?)
  `)
    .bind(
      token,
      actorType,
      actorId,
      expires
    )
    .run();


  return token;
}


/* =====================================================
   AUTH CHECK
===================================================== */

async function requireAuth(
  request,
  env,
  requiredType
) {

  const header =
    request.headers.get(
      "Authorization"
    ) || "";


  if (
    !header.startsWith(
      "Bearer "
    )
  ) {

    return {
      ok: false,
      response:
        json({
          ok: false,
          error:
            "Authentication required."
        }, 401)
    };
  }


  const token =
    header
      .slice(7)
      .trim();


  if (!token) {

    return {
      ok: false,
      response:
        json({
          ok: false,
          error:
            "Authentication required."
        }, 401)
    };
  }


  const session =
    await env.DB.prepare(`
      SELECT
        id,
        token,
        actor_type,
        actor_id,
        expires_at
      FROM sessions
      WHERE token = ?
      LIMIT 1
    `)
      .bind(token)
      .first();


  if (!session) {

    return {
      ok: false,
      response:
        json({
          ok: false,
          error:
            "Invalid session."
        }, 401)
    };
  }


  if (
    session.actor_type !==
    requiredType
  ) {

    return {
      ok: false,
      response:
        json({
          ok: false,
          error:
            "Access denied."
        }, 403)
    };
  }


  if (
    new Date(
      session.expires_at
    ).getTime() <=
    Date.now()
  ) {

    await env.DB.prepare(`
      DELETE FROM sessions
      WHERE token = ?
    `)
      .bind(token)
      .run();


    return {
      ok: false,
      response:
        json({
          ok: false,
          error:
            "Session expired."
        }, 401)
    };
  }


  return {
    ok: true,
    token,
    actorId:
      session.actor_id
  };
}


/* =====================================================
   LOGOUT
===================================================== */

async function logout(
  request,
  env,
  actorType
) {

  const header =
    request.headers.get(
      "Authorization"
    ) || "";


  const token =
    header.startsWith("Bearer ")
      ? header.slice(7).trim()
      : "";


  if (!token) {

    return json({
      ok: true,
      message:
        `${actorType} logged out.`
    });
  }


  await env.DB.prepare(`
    DELETE FROM sessions
    WHERE token = ?
    AND actor_type = ?
  `)
    .bind(
      token,
      actorType
    )
    .run();


  return json({
    ok: true,
    message:
      `${actorType} logged out successfully.`
  });
}


/* =====================================================
   AUDIT
===================================================== */

async function audit(
  env,
  actorType,
  actorId,
  action,
  targetType = "",
  targetId = "",
  details = ""
) {

  try {

    await env.DB.prepare(`
      INSERT INTO audit_logs
      (
        actor_type,
        actor_id,
        action,
        target_type,
        target_id,
        details
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `)
      .bind(
        actorType,
        actorId,
        action,
        targetType,
        String(targetId),
        String(details)
      )
      .run();

  } catch (error) {

    console.error(
      "AUDIT ERROR:",
      error
    );
  }
}


/* =====================================================
   TABLE COLUMNS
===================================================== */

async function tableColumns(
  env,
  tableName
) {

  const result =
    await env.DB.prepare(
      `PRAGMA table_info(${tableName})`
    ).all();


  return new Set(
    (result.results || [])
      .map(
        row =>
          row.name
      )
  );
}


/* =====================================================
   PASSWORD HASH
===================================================== */

async function hashPassword(
  password
) {

  const encoder =
    new TextEncoder();


  const data =
    encoder.encode(
      String(password)
    );


  const hash =
    await crypto.subtle.digest(
      "SHA-256",
      data
    );


  return bytesToHex(
    new Uint8Array(hash)
  );
}


async function verifyPassword(
  password,
  storedHash
) {

  const calculated =
    await hashPassword(
      password
    );


  return (
    calculated ===
    storedHash
  );
}


/* =====================================================
   SERIALIZE EMPLOYEE
===================================================== */

function serializeEmployee(
  employee
) {

  return {

    id:
      employee.id,

    employeeId:
      employee.employee_id,

    name:
      employee.name,

    department:
      employee.department,

    designation:
      employee.designation,

    phone:
      employee.phone,

    aadhaar:
      employee.aadhaar_no ||
      "",

    nativeAddress:
      employee.native_address ||
      "",

    doj:
      employee.doj ||
      "",

    employeeType:
      employee.employee_type,

    shift:
      employee.shift,

    block:
      employee.block ||
      "",

    room:
      employee.room_no ||
      "",

    bed:
      employee.bed_no ??
      "",

    qrId:
      employee.qr_id ||
      "",

    hostelStatus:
      employee.hostel_status,

    temporaryOutStatus:
      employee.temporary_out_status ||
      "NO",

    expectedReturnDate:
      employee.expected_return_date ||
      "",

    active:
      Boolean(
        employee.active
      )
  };
}


/* =====================================================
   HELPERS
===================================================== */

async function readJSON(
  request
) {

  try {

    return await request.json();

  } catch {

    return {};
  }
}


function clean(value) {

  return String(
    value ?? ""
  ).trim();
}


function nullable(value) {

  if (
    value === undefined ||
    value === null
  ) {
    return null;
  }


  const text =
    String(value).trim();


  return text === ""
    ? null
    : text;
}


function bytesToHex(
  bytes
) {

  return Array.from(bytes)
    .map(
      byte =>
        byte
          .toString(16)
          .padStart(2, "0")
    )
    .join("");
}


function todayISO() {

  return new Date()
    .toISOString()
    .slice(0, 10);
}


function validDate(value) {

  if (
    !/^\d{4}-\d{2}-\d{2}$/
      .test(value)
  ) {
    return false;
  }


  const date =
    new Date(
      `${value}T00:00:00Z`
    );


  return (
    !Number.isNaN(
      date.getTime()
    ) &&
    date
      .toISOString()
      .slice(0, 10) ===
      value
  );
}


function compareDates(
  a,
  b
) {

  return String(a)
    .localeCompare(
      String(b)
    );
}


function countValue(
  value
) {

  return Number(
    value || 0
  );
}


async function count(
  env,
  sql,
  params = []
) {

  const result =
    await env.DB
      .prepare(sql)
      .bind(...params)
      .first();


  return countValue(
    result?.total
  );
}


function pathLast(url) {

  return decodeURIComponent(
    url.pathname
      .split("/")
      .filter(Boolean)
      .pop() || ""
  );
}


function corsHeaders() {

  return {

    "Access-Control-Allow-Origin":
      "*",

    "Access-Control-Allow-Methods":
      "GET,POST,PUT,DELETE,OPTIONS",

    "Access-Control-Allow-Headers":
      "Content-Type, Authorization"
  };
}


/* =====================================================
   JSON RESPONSE
===================================================== */

function json(
  data,
  status = 200
) {

  const headers = {
    "Content-Type":
      "application/json; charset=utf-8",

    "Cache-Control":
      "no-store",

    ...corsHeaders()
  };


  return new Response(
    JSON.stringify(data),
    {
      status,
      headers
    }
  );
}