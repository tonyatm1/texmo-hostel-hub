const VERSION = "TEXMO-HOSTEL-HUB-2.0";

/*
=========================================================
TEXMO HOSTEL HUB 2.0
CLOUDFLARE WORKER + D1
STEP 3

Includes:
- D1 initialization
- HR registration
- Secure Master Key validation
- HR login
- Employee registration
- Employee login foundation
- HR dashboard
- Employee dashboard
- Employee room API
- HR employee API
- HR room API

IMPORTANT:
Actual Master Key is NOT stored in this file.

Cloudflare Secret required:
TEXMO_MASTER_KEY

Set it with:
npx wrangler secret put TEXMO_MASTER_KEY

Then enter the same value when prompted.

=========================================================
*/


/* =====================================================
   MAIN WORKER
===================================================== */

export default {

  async fetch(request, env) {

    const url = new URL(request.url);
    const method = request.method.toUpperCase();

    try {

      /*
      ---------------------------------------------------
      API ROUTES
      ---------------------------------------------------
      */

      if (url.pathname === "/api/init") {
        return await initializeDatabase(env);
      }


      /* ================= HR ================= */

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
        url.pathname === "/api/hr/dashboard" &&
        method === "GET"
      ) {
        return await hrDashboard(env);
      }


      if (
        url.pathname === "/api/hr/employees" &&
        method === "GET"
      ) {
        return await hrEmployees(env);
      }


      if (
        url.pathname === "/api/hr/rooms" &&
        method === "GET"
      ) {
        return await hrRooms(env);
      }


      /* ================= EMPLOYEE ================= */

      if (
        url.pathname === "/api/employee/register" &&
        method === "POST"
      ) {
        return await employeeRegister(request, env);
      }


      if (
        url.pathname === "/api/employee/login" &&
        method === "POST"
      ) {
        return await employeeLogin(request, env);
      }


      if (
        url.pathname.startsWith("/api/employee/dashboard/") &&
        method === "GET"
      ) {

        const employeeId =
          decodeURIComponent(
            url.pathname.split("/").pop()
          );

        return await employeeDashboard(
          employeeId,
          env
        );
      }


      if (
        url.pathname.startsWith("/api/employee-room/") &&
        method === "GET"
      ) {

        const employeeId =
          decodeURIComponent(
            url.pathname.split("/").pop()
          );

        return await employeeRoom(
          employeeId,
          env
        );
      }


      /*
      ---------------------------------------------------
      HEALTH CHECK
      ---------------------------------------------------
      */

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


      /*
      ---------------------------------------------------
      STATIC ASSETS
      ---------------------------------------------------
      */

      if (env.ASSETS) {

        return env.ASSETS.fetch(request);

      }


      return json(
        {
          ok: false,
          error: "Route not found"
        },
        404
      );


    } catch (error) {

      console.error(error);

      return json(
        {
          ok: false,
          error: "Internal server error"
        },
        500
      );

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
      error: "D1 binding DB is missing"
    }, 500);

  }


  const statements = [

    /*
    -----------------------------------------------------
    HR
    -----------------------------------------------------
    */

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


    /*
    -----------------------------------------------------
    EMPLOYEES
    -----------------------------------------------------
    */

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


    /*
    -----------------------------------------------------
    ROOMS
    -----------------------------------------------------
    */

    `
    CREATE TABLE IF NOT EXISTS rooms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,

      block TEXT NOT NULL,

      room_no TEXT NOT NULL,

      capacity INTEGER NOT NULL DEFAULT 8,

      UNIQUE(block, room_no)
    )
    `,


    /*
    -----------------------------------------------------
    ROOM BEDS
    -----------------------------------------------------
    */

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


    /*
    -----------------------------------------------------
    CAB
    -----------------------------------------------------
    */

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

      UNIQUE(
        employee_id,
        travel_date
      )
    )
    `,


    /*
    -----------------------------------------------------
    LEAVE
    -----------------------------------------------------
    */

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


    /*
    -----------------------------------------------------
    VACATE
    -----------------------------------------------------
    */

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


    /*
    -----------------------------------------------------
    CHECK-IN
    -----------------------------------------------------
    */

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


  await seedRooms(env);


  return json({
    ok: true,
    message: "TEXMO database initialized successfully",
    version: VERSION
  });

}


/* =====================================================
   ROOM SEEDING
===================================================== */

async function seedRooms(env) {

  const blocks = {

    A: 4,
    B: 8,
    C: 8,
    D: 4

  };


  for (const block of Object.keys(blocks)) {

    const count = blocks[block];


    for (let room = 1; room <= count; room++) {

      const roomNo =
        `${block}${room}`;


      await env.DB
        .prepare(
          `
          INSERT OR IGNORE INTO rooms
          (
            block,
            room_no,
            capacity
          )
          VALUES (?, ?, 8)
          `
        )
        .bind(
          block,
          roomNo
        )
        .run();


      for (
        let bed = 1;
        bed <= 8;
        bed++
      ) {

        await env.DB
          .prepare(
            `
            INSERT OR IGNORE INTO room_beds
            (
              block,
              room_no,
              bed_no
            )
            VALUES (?, ?, ?)
            `
          )
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
   HR REGISTRATION
===================================================== */

async function hrRegister(request, env) {

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
      error: "All HR registration fields are required."
    }, 400);

  }


  if (!/^[0-9]{10}$/.test(phone)) {

    return json({
      ok: false,
      error: "Invalid phone number."
    }, 400);

  }


  if (password.length < 8) {

    return json({
      ok: false,
      error: "Password must contain at least 8 characters."
    }, 400);

  }


  /*
  -------------------------------------------------------
  MASTER KEY SECURITY
  -------------------------------------------------------

  NEVER put the real Master Key inside:

  - index.html
  - app.js
  - GitHub
  - public JavaScript

  It must exist only as Cloudflare Secret:
  TEXMO_MASTER_KEY
  -------------------------------------------------------
  */

  if (!env.TEXMO_MASTER_KEY) {

    return json({
      ok: false,
      error:
        "TEXMO_MASTER_KEY is not configured on the server."
    }, 500);

  }


  if (masterKey !== env.TEXMO_MASTER_KEY) {

    return json({
      ok: false,
      error: "Invalid Master Key."
    }, 403);

  }


  /*
  -------------------------------------------------------
  CHECK DUPLICATE HR
  -------------------------------------------------------
  */

  const existing =
    await env.DB
      .prepare(
        `
        SELECT id
        FROM hr_users
        WHERE hr_id = ?
        LIMIT 1
        `
      )
      .bind(hrId)
      .first();


  if (existing) {

    return json({
      ok: false,
      error: "HR ID already exists."
    }, 409);

  }


  const passwordHash =
    await hashPassword(password);


  await env.DB
    .prepare(
      `
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
      `
    )
    .bind(
      hrId,
      name,
      department,
      designation,
      phone,
      passwordHash
    )
    .run();


  return json({
    ok: true,
    message:
      "HR account created successfully.",
    hr: {
      hrId,
      name,
      department,
      designation
    }
  });

}


/* =====================================================
   HR LOGIN
===================================================== */

async function hrLogin(request, env) {

  const body =
    await readJSON(request);


  const hrId =
    clean(body.hrId);

  const password =
    String(body.password || "");


  if (!hrId || !password) {

    return json({
      ok: false,
      error: "HR ID and password are required."
    }, 400);

  }


  const hr =
    await env.DB
      .prepare(
        `
        SELECT
          id,
          hr_id,
          name,
          department,
          designation,
          phone,
          password_hash,
          active
        FROM hr_users
        WHERE hr_id = ?
        LIMIT 1
        `
      )
      .bind(hrId)
      .first();


  if (!hr || !hr.active) {

    return json({
      ok: false,
      error: "Invalid HR ID or password."
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
      error: "Invalid HR ID or password."
    }, 401);

  }


  return json({
    ok: true,

    message:
      "HR login successful.",

    hr: {
      id: hr.id,
      hrId: hr.hr_id,
      name: hr.name,
      department: hr.department,
      designation: hr.designation,
      phone: hr.phone
    }
  });

}


/* =====================================================
   EMPLOYEE REGISTRATION
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
      error: "All employee fields are required."
    }, 400);

  }


  if (!/^[0-9]{10}$/.test(phone)) {

    return json({
      ok: false,
      error: "Invalid phone number."
    }, 400);

  }


  const existing =
    await env.DB
      .prepare(
        `
        SELECT id
        FROM employees
        WHERE employee_id = ?
        LIMIT 1
        `
      )
      .bind(employeeId)
      .first();


  if (existing) {

    return json({
      ok: false,
      error: "Employee ID already exists."
    }, 409);

  }


  /*
  -------------------------------------------------------
  Initial password
  -------------------------------------------------------

  For now employee ID is used as the initial password.

  This will be replaced by a stronger employee
  authentication flow in the security stage.
  -------------------------------------------------------
  */

  const passwordHash =
    await hashPassword(employeeId);


  await env.DB
    .prepare(
      `
      INSERT INTO employees
      (
        employee_id,
        name,
        department,
        designation,
        phone,
        employee_type,
        shift,
        password_hash
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `
    )
    .bind(
      employeeId,
      name,
      department,
      designation,
      phone,
      employeeType,
      shift,
      passwordHash
    )
    .run();


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
      shift
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
    await env.DB
      .prepare(
        `
        SELECT *
        FROM employees
        WHERE employee_id = ?
        AND active = 1
        LIMIT 1
        `
      )
      .bind(employeeId)
      .first();


  if (!employee) {

    return json({
      ok: false,
      error: "Invalid Employee ID or password."
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
      error: "Invalid Employee ID or password."
    }, 401);

  }


  return json({
    ok: true,

    message:
      "Employee login successful.",

    employee: serializeEmployee(employee)

  });

}


/* =====================================================
   EMPLOYEE DASHBOARD
===================================================== */

async function employeeDashboard(
  employeeId,
  env
) {

  const employee =
    await env.DB
      .prepare(
        `
        SELECT *
        FROM employees
        WHERE employee_id = ?
        LIMIT 1
        `
      )
      .bind(employeeId)
      .first();


  if (!employee) {

    return json({
      ok: false,
      error: "Employee not found."
    }, 404);

  }


  return json({
    ok: true,

    employee:
      serializeEmployee(employee)

  });

}


/* =====================================================
   EMPLOYEE ROOM
===================================================== */

async function employeeRoom(
  employeeId,
  env
) {

  const employee =
    await env.DB
      .prepare(
        `
        SELECT
          employee_id,
          name,
          department,
          block,
          room_no,
          bed_no,
          hostel_status
        FROM employees
        WHERE employee_id = ?
        LIMIT 1
        `
      )
      .bind(employeeId)
      .first();


  if (!employee) {

    return json({
      ok: false,
      error: "Employee not found."
    }, 404);

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

      block:
        employee.block || "",

      room:
        employee.room_no || "",

      bed:
        employee.bed_no ?? "",

      status:
        employee.hostel_status
    }

  });

}


/* =====================================================
   HR DASHBOARD
===================================================== */

async function hrDashboard(env) {

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


  const leaveCount =
    await count(
      env,
      `
      SELECT COUNT(*) AS total
      FROM leave_records
      WHERE status = 'Approved'
      AND date('now')
      BETWEEN date(from_date)
      AND date(to_date)
      `
    );


  const vacatePending =
    await count(
      env,
      `
      SELECT COUNT(*) AS total
      FROM vacate_records
      WHERE status = 'Pending'
      `
    );


  const today =
    todayISO();


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


  return json({

    ok: true,

    dashboard: {

      totalEmployees,

      hostelIn,

      hostelOut,

      cabBoarded,

      leaveCount,

      vacatePending

    }

  });

}


/* =====================================================
   HR EMPLOYEES
===================================================== */

async function hrEmployees(env) {

  const result =
    await env.DB
      .prepare(
        `
        SELECT
          employee_id,
          name,
          department,
          designation,
          phone,
          employee_type,
          shift,
          block,
          room_no,
          bed_no,
          hostel_status,
          active
        FROM employees
        ORDER BY name ASC
        `
      )
      .all();


  return json({
    ok: true,
    employees:
      result.results || []
  });

}


/* =====================================================
   HR ROOMS
===================================================== */

async function hrRooms(env) {

  const rooms =
    await env.DB
      .prepare(
        `
        SELECT
          block,
          room_no,
          capacity
        FROM rooms
        ORDER BY
          block,
          CAST(
            substr(room_no, 2)
            AS INTEGER
          )
        `
      )
      .all();


  const occupied =
    await count(
      env,
      `
      SELECT COUNT(*) AS total
      FROM room_beds
      WHERE employee_id IS NOT NULL
      `
    );


  const available =
    await count(
      env,
      `
      SELECT COUNT(*) AS total
      FROM room_beds
      WHERE employee_id IS NULL
      `
    );


  return json({

    ok: true,

    rooms:
      rooms.results || [],

    occupiedBeds:
      occupied,

    availableBeds:
      available

  });

}


/* =====================================================
   PASSWORD HASHING
===================================================== */

async function hashPassword(password) {

  const encoder =
    new TextEncoder();

  const data =
    encoder.encode(password);


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
    await hashPassword(password);

  return calculated === storedHash;

}


/* =====================================================
   HELPERS
===================================================== */

async function readJSON(request) {

  try {

    return await request.json();

  } catch {

    return {};

  }

}


function clean(value) {

  return String(value ?? "")
    .trim();

}


function bytesToHex(bytes) {

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

  return Number(
    result?.total || 0
  );

}


function serializeEmployee(employee) {

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

    employeeType:
      employee.employee_type,

    shift:
      employee.shift,

    block:
      employee.block || "",

    room:
      employee.room_no || "",

    bed:
      employee.bed_no ?? "",

    hostelStatus:
      employee.hostel_status,

    active:
      Boolean(employee.active)

  };

}


/* =====================================================
   JSON RESPONSE
===================================================== */

function json(
  data,
  status = 200
) {

  return new Response(
    JSON.stringify(data),
    {
      status,

      headers: {
        "Content-Type":
          "application/json; charset=utf-8",

        "Cache-Control":
          "no-store"
      }
    }
  );

}