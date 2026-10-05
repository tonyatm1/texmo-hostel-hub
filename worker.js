const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
};

const HR_USER = "hr";
const HR_PASS = "hr@123";


// =====================================================
// DATABASE INITIALIZATION
// =====================================================

async function initDB(db) {

  await db.batch([

    // EMPLOYEES
    db.prepare(`
      CREATE TABLE IF NOT EXISTS employees (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        employee_id TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        department TEXT NOT NULL,
        designation TEXT DEFAULT '',
        phone TEXT DEFAULT '',
        shift TEXT DEFAULT '',
        room TEXT DEFAULT '',
        bed_no INTEGER DEFAULT NULL,
        qr_token TEXT UNIQUE NOT NULL,
        status TEXT DEFAULT 'ACTIVE',
        hostel_status TEXT DEFAULT 'IN',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `),

    // CAB
    db.prepare(`
      CREATE TABLE IF NOT EXISTS cab_entries (
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
      )
    `),

    // ROOMS
    db.prepare(`
      CREATE TABLE IF NOT EXISTS rooms (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        room_no TEXT UNIQUE NOT NULL,
        block TEXT DEFAULT '',
        capacity INTEGER DEFAULT 0,
        occupied INTEGER DEFAULT 0
      )
    `),

    // LEAVE
    db.prepare(`
      CREATE TABLE IF NOT EXISTS leave_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        employee_id TEXT NOT NULL,
        from_date TEXT NOT NULL,
        to_date TEXT NOT NULL,
        reason TEXT DEFAULT '',
        room_vacate INTEGER DEFAULT 0,
        status TEXT DEFAULT 'PENDING',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `),

    // ROOM VACATE
    db.prepare(`
      CREATE TABLE IF NOT EXISTS vacate_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        employee_id TEXT NOT NULL,
        room_no TEXT DEFAULT '',
        bed_no INTEGER DEFAULT NULL,
        vacate_date TEXT NOT NULL,
        return_date TEXT NOT NULL,
        reason TEXT DEFAULT '',
        status TEXT DEFAULT 'PENDING',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        approved_at TEXT DEFAULT '',
        returned_at TEXT DEFAULT ''
      )
    `),

    // CHECK-IN REQUEST
    db.prepare(`
      CREATE TABLE IF NOT EXISTS checkin_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        employee_id TEXT NOT NULL,
        requested_room TEXT DEFAULT '',
        requested_bed INTEGER DEFAULT NULL,
        status TEXT DEFAULT 'PENDING',
        requested_at TEXT DEFAULT CURRENT_TIMESTAMP,
        approved_at TEXT DEFAULT '',
        approved_room TEXT DEFAULT '',
        approved_bed INTEGER DEFAULT NULL
      )
    `)
  ]);


  // ---------------------------------------------------
  // SAFE MIGRATION FOR OLD EMPLOYEES TABLE
  // ---------------------------------------------------

  const employeeColumns =
    await db.prepare(`
      PRAGMA table_info(employees)
    `).all();

  const existingEmployeeColumns =
    (employeeColumns.results || [])
      .map(column => column.name);


  if (!existingEmployeeColumns.includes("bed_no")) {

    await db.prepare(`
      ALTER TABLE employees
      ADD COLUMN bed_no INTEGER DEFAULT NULL
    `).run();

  }


  if (!existingEmployeeColumns.includes("hostel_status")) {

    await db.prepare(`
      ALTER TABLE employees
      ADD COLUMN hostel_status TEXT DEFAULT 'IN'
    `).run();

  }


  // ---------------------------------------------------
  // SAFE MIGRATION FOR OLD LEAVE TABLE
  // ---------------------------------------------------

  const leaveColumns =
    await db.prepare(`
      PRAGMA table_info(leave_records)
    `).all();

  const existingLeaveColumns =
    (leaveColumns.results || [])
      .map(column => column.name);


  if (!existingLeaveColumns.includes("room_vacate")) {

    await db.prepare(`
      ALTER TABLE leave_records
      ADD COLUMN room_vacate INTEGER DEFAULT 0
    `).run();

  }
}


// =====================================================
// COMMON HELPERS
// =====================================================

function json(data, status = 200) {

  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        ...CORS,
        "Content-Type": "application/json"
      }
    }
  );
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

  const date =
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(d);


  const time =
    new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    }).format(d);


  return {
    date,
    time
  };

}


// =====================================================
// CSV EXPORT
// =====================================================

async function csvResponse(rows) {

  if (!rows.length) {

    return new Response(
      "No records",
      {
        headers: {
          ...CORS,
          "Content-Type": "text/csv"
        }
      }
    );

  }


  const headers =
    Object.keys(rows[0]);


  const escape =
    value => {

      const v =
        value == null
          ? ""
          : String(value);

      return `"${v.replaceAll('"', '""')}"`;

    };


  const csv = [

    headers
      .map(escape)
      .join(","),

    ...rows.map(
      row =>
        headers
          .map(
            h => escape(row[h])
          )
          .join(",")
    )

  ].join("\n");


  return new Response(
    csv,
    {
      headers: {
        ...CORS,
        "Content-Type":
          "text/csv; charset=utf-8",
        "Content-Disposition":
          "attachment; filename=texmo-hostel-export.csv"
      }
    }
  );
}


// =====================================================
// ROOM RULES
// =====================================================

function roomEligibility(
  block,
  department
) {

  const b =
    String(block || "")
      .toUpperCase()
      .trim();

  const d =
    String(department || "")
      .toLowerCase()
      .trim();


  // A BLOCK = EMPLOYEE ONLY
  if (b === "A") {

    return d !== "internship" &&
           d !== "new joiner";

  }


  // B BLOCK = EMPLOYEE ONLY
  if (b === "B") {

    return d !== "internship" &&
           d !== "new joiner";

  }


  // C BLOCK = EMPLOYEE + INTERNSHIP
  if (b === "C") {

    return true;

  }


  // D BLOCK = NEW JOINER + INTERNSHIP
  if (b === "D") {

    return (
      d === "internship" ||
      d === "new joiner"
    );

  }


  return false;

}


// =====================================================
// ROOM OCCUPANCY
// =====================================================

async function getRoomOccupancy(
  db,
  roomNo
) {

  const result =
    await db.prepare(`
      SELECT COUNT(*) AS count
      FROM employees
      WHERE room = ?
      AND hostel_status = 'IN'
      AND status = 'ACTIVE'
    `)
    .bind(roomNo)
    .first();


  return Number(
    result?.count || 0
  );

}


// =====================================================
// FIND AVAILABLE BED
// =====================================================

async function findAvailableBed(
  db,
  roomNo,
  capacity
) {

  const result =
    await db.prepare(`
      SELECT bed_no
      FROM employees
      WHERE room = ?
      AND hostel_status = 'IN'
      AND status = 'ACTIVE'
      AND bed_no IS NOT NULL
      ORDER BY bed_no
    `)
    .bind(roomNo)
    .all();


  const used =
    new Set(
      (result.results || [])
        .map(row =>
          Number(row.bed_no)
        )
    );


  for (
    let bed = 1;
    bed <= Number(capacity);
    bed++
  ) {

    if (!used.has(bed)) {

      return bed;

    }

  }


  return null;

}


// =====================================================
// HOME
// =====================================================

export default {

  async fetch(request, env) {

    if (
      request.method === "OPTIONS"
    ) {

      return new Response(
        null,
        {
          headers: CORS
        }
      );

    }


    if (!env.DB) {

      return json(
        {
          success: false,
          error:
            "D1 database binding DB is missing"
        },
        500
      );

    }


    try {

      await initDB(env.DB);


      const url =
        new URL(request.url);

      const path =
        url.pathname;


      // =================================================
      // HOME
      // =================================================

      if (
        path === "/" &&
        request.method === "GET"
      ) {

        return json({
          success: true,
          app: "TEXMO Hostel Hub",
          status: "ONLINE",
          version: "2.0"
        });

      }


      // =================================================
      // HR LOGIN
      // TEMPORARY - FINAL LOGIN LATER
      // =================================================

      if (
        path === "/api/hr/login" &&
        request.method === "POST"
      ) {

        const data =
          await body(request);


        if (
          data.username === HR_USER &&
          data.password === HR_PASS
        ) {

          return json({
            success: true,
            role: "HR",
            message:
              "HR login successful"
          });

        }


        return json(
          {
            success: false,
            error:
              "Invalid HR login"
          },
          401
        );

      }


      // =================================================
      // EMPLOYEE REGISTRATION
      // =================================================

      if (
        path === "/api/employees/register" &&
        request.method === "POST"
      ) {

        const data =
          await body(request);


        if (
          !data.employee_id ||
          !data.name ||
          !data.department
        ) {

          return json(
            {
              success: false,
              error:
                "Employee ID, name and department are required"
            },
            400
          );

        }


        // -----------------------------------------------
        // ROOM VALIDATION
        // -----------------------------------------------

        let room = null;
        let bedNo = null;


        if (data.room) {

          room =
            await env.DB.prepare(`
              SELECT *
              FROM rooms
              WHERE room_no = ?
            `)
            .bind(data.room.trim())
            .first();


          if (!room) {

            return json(
              {
                success: false,
                error:
                  "Selected room does not exist"
              },
              400
            );

          }


          if (
            !roomEligibility(
              room.block,
              data.department
            )
          ) {

            return json(
              {
                success: false,
                error:
                  `Room ${room.room_no} is not allowed for this employee type`
              },
              400
            );

          }


          const occupied =
            await getRoomOccupancy(
              env.DB,
              room.room_no
            );


          if (
            occupied >=
            Number(room.capacity)
          ) {

            return json(
              {
                success: false,
                error:
                  `Room ${room.room_no} is FULL`
              },
              409
            );

          }


          bedNo =
            await findAvailableBed(
              env.DB,
              room.room_no,
              room.capacity
            );


          if (!bedNo) {

            return json(
              {
                success: false,
                error:
                  `No bed available in ${room.room_no}`
              },
              409
            );

          }

        }


        const qrToken =
          token();


        try {

          await env.DB.prepare(`
            INSERT INTO employees
            (
              employee_id,
              name,
              department,
              designation,
              phone,
              shift,
              room,
              bed_no,
              qr_token,
              status,
              hostel_status
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `)
          .bind(

            data.employee_id,
            data.name,
            data.department,
            data.designation || "",
            data.phone || "",
            data.shift || "",
            room?.room_no || "",
            bedNo,
            qrToken,
            "ACTIVE",
            "IN"

          )
          .run();


          return json({

            success: true,

            message:
              "Employee registered",

            employee_id:
              data.employee_id,

            qr_token:
              qrToken,

            room:
              room?.room_no || "",

            bed_no:
              bedNo

          });

        } catch (e) {

          return json(
            {
              success: false,
              error:
                "Employee ID already exists"
            },
            409
          );

        }

      }


      // =================================================
      // GET EMPLOYEE
      // =================================================

      if (
        path.startsWith(
          "/api/employees/"
        ) &&
        request.method === "GET"
      ) {

        const employeeId =
          decodeURIComponent(
            path.replace(
              "/api/employees/",
              ""
            )
          );


        const result =
          await env.DB.prepare(`
            SELECT
              employee_id,
              name,
              department,
              designation,
              phone,
              shift,
              room,
              bed_no,
              qr_token,
              status,
              hostel_status,
              created_at
            FROM employees
            WHERE employee_id = ?
          `)
          .bind(employeeId)
          .first();


        if (!result) {

          return json(
            {
              success: false,
              error:
                "Employee not found"
            },
            404
          );

        }


        return json({
          success: true,
          employee: result
        });

      }


      // =================================================
      // ALL EMPLOYEES
      // =================================================

      if (
        path === "/api/employees" &&
        request.method === "GET"
      ) {

        const result =
          await env.DB.prepare(`
            SELECT
              employee_id,
              name,
              department,
              designation,
              phone,
              shift,
              room,
              bed_no,
              status,
              hostel_status,
              created_at
            FROM employees
            ORDER BY name
          `)
          .all();


        return json({
          success: true,
          employees:
            result.results || []
        });

      }


      // =================================================
      // MY ROOM
      // =================================================

      if (
        path.startsWith(
          "/api/employee-room/"
        ) &&
        request.method === "GET"
      ) {

        const employeeId =
          decodeURIComponent(
            path.replace(
              "/api/employee-room/",
              ""
            )
          );


        const employee =
          await env.DB.prepare(`
            SELECT
              employee_id,
              name,
              department,
              room,
              bed_no,
              hostel_status
            FROM employees
            WHERE employee_id = ?
          `)
          .bind(employeeId)
          .first();


        if (!employee) {

          return json(
            {
              success: false,
              error:
                "Employee not found"
            },
            404
          );

        }


        if (!employee.room) {

          return json({
            success: true,
            has_room: false,
            employee
          });

        }


        const room =
          await env.DB.prepare(`
            SELECT *
            FROM rooms
            WHERE room_no = ?
          `)
          .bind(employee.room)
          .first();


        const members =
          await env.DB.prepare(`
            SELECT
              employee_id,
              name,
              department,
              bed_no,
              hostel_status
            FROM employees
            WHERE room = ?
            AND status = 'ACTIVE'
            ORDER BY bed_no
          `)
          .bind(employee.room)
          .all();


        const occupied =
          await getRoomOccupancy(
            env.DB,
            employee.room
          );


        return json({

          success: true,

          has_room: true,

          room: {

            room_no:
              room?.room_no ||
              employee.room,

            block:
              room?.block || "",

            capacity:
              Number(
                room?.capacity || 0
              ),

            occupied,

            available:
              Math.max(
                0,
                Number(
                  room?.capacity || 0
                ) - occupied
              ),

            employee_bed:
              employee.bed_no

          },

          employee,

          members:
            members.results || []

        });

      }


      // =================================================
      // CAB QR SCAN
      // =================================================

      if (
        path === "/api/cab/scan" &&
        request.method === "POST"
      ) {

        const data =
          await body(request);


        if (!data.qr_token) {

          return json(
            {
              success: false,
              error:
                "QR token required"
            },
            400
          );

        }


        const employee =
          await env.DB.prepare(`
            SELECT
              employee_id,
              name,
              department,
              shift,
              status
            FROM employees
            WHERE qr_token = ?
          `)
          .bind(data.qr_token)
          .first();


        if (!employee) {

          return json(
            {
              success: false,
              error:
                "Invalid employee QR"
            },
            404
          );

        }


        if (
          employee.status !==
          "ACTIVE"
        ) {

          return json(
            {
              success: false,
              error:
                "Employee is not active"
            },
            403
          );

        }


        const today =
          nowIndia();


        const duplicate =
          await env.DB.prepare(`
            SELECT id
            FROM cab_entries
            WHERE employee_id = ?
            AND entry_date = ?
            AND cab_no = ?
            LIMIT 1
          `)
          .bind(
            employee.employee_id,
            today.date,
            data.cab_no || ""
          )
          .first();


        if (duplicate) {

          return json(
            {
              success: false,
              duplicate: true,
              error:
                "Employee already entered this cab today"
            },
            409
          );

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
        `)
        .bind(
          employee.employee_id,
          employee.name,
          employee.department,
          employee.shift || "",
          data.cab_no || "",
          data.route || "",
          today.date,
          today.time
        )
        .run();


        return json({

          success: true,

          message:
            "CAB ENTRY SUCCESS",

          entry: {

            employee_id:
              employee.employee_id,

            name:
              employee.name,

            department:
              employee.department,

            shift:
              employee.shift,

            cab_no:
              data.cab_no || "",

            route:
              data.route || "",

            date:
              today.date,

            time:
              today.time

          }

        });

      }


      // =================================================
      // CAB ENTRIES
      // =================================================

      if (
        path === "/api/cab/entries" &&
        request.method === "GET"
      ) {

        const result =
          await env.DB.prepare(`
            SELECT *
            FROM cab_entries
            ORDER BY id DESC
          `)
          .all();


        return json({
          success: true,
          entries:
            result.results || []
        });

      }


      // =================================================
      // CAB DASHBOARD
      // =================================================

      if (
        path === "/api/cab/dashboard" &&
        request.method === "GET"
      ) {

        const today =
          nowIndia();


        const total =
          await env.DB.prepare(`
            SELECT COUNT(*) AS count
            FROM cab_entries
            WHERE entry_date = ?
          `)
          .bind(today.date)
          .first();


        const departments =
          await env.DB.prepare(`
            SELECT
              department,
              COUNT(*) AS count
            FROM cab_entries
            WHERE entry_date = ?
            GROUP BY department
            ORDER BY count DESC
          `)
          .bind(today.date)
          .all();


        const cabs =
          await env.DB.prepare(`
            SELECT
              cab_no,
              route,
              COUNT(*) AS count
            FROM cab_entries
            WHERE entry_date = ?
            GROUP BY cab_no, route
            ORDER BY count DESC
          `)
          .bind(today.date)
          .all();


        const shifts =
          await env.DB.prepare(`
            SELECT
              shift,
              COUNT(*) AS count
            FROM cab_entries
            WHERE entry_date = ?
            GROUP BY shift
            ORDER BY count DESC
          `)
          .bind(today.date)
          .all();


        return json({

          success: true,

          date:
            today.date,

          total_boarded:
            total?.count || 0,

          departments:
            departments.results || [],

          cabs:
            cabs.results || [],

          shifts:
            shifts.results || []

        });

      }


      // =================================================
      // CAB EXPORT
      // =================================================

      if (
        path === "/api/cab/export" &&
        request.method === "GET"
      ) {

        const result =
          await env.DB.prepare(`
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
          `)
          .all();


        return csvResponse(
          result.results || []
        );

      }


      // =================================================
      // ROOMS
      // =================================================

      if (
        path === "/api/rooms" &&
        request.method === "GET"
      ) {

        const result =
          await env.DB.prepare(`
            SELECT *
            FROM rooms
            ORDER BY block, room_no
          `)
          .all();


        const rooms =
          await Promise.all(
            (result.results || [])
              .map(async room => {

                const occupied =
                  await getRoomOccupancy(
                    env.DB,
                    room.room_no
                  );


                return {

                  ...room,

                  occupied,

                  available:
                    Math.max(
                      0,
                      Number(
                        room.capacity
                      ) - occupied
                    ),

                  full:
                    occupied >=
                    Number(
                      room.capacity
                    )

                };

              })
          );


        return json({
          success: true,
          rooms
        });

      }


      // =================================================
      // ADD ROOM
      // =================================================

      if (
        path === "/api/rooms" &&
        request.method === "POST"
      ) {

        const data =
          await body(request);


        if (!data.room_no) {

          return json(
            {
              success: false,
              error:
                "Room number required"
            },
            400
          );

        }


        const capacity =
          Number(
            data.capacity || 0
          );


        if (capacity <= 0) {

          return json(
            {
              success: false,
              error:
                "Room capacity must be greater than 0"
            },
            400
          );

        }


        await env.DB.prepare(`
          INSERT INTO rooms
          (
            room_no,
            block,
            capacity,
            occupied
          )
          VALUES (?, ?, ?, 0)
        `)
        .bind(
          data.room_no.trim(),
          data.block || "",
          capacity
        )
        .run();


        return json({
          success: true,
          message:
            "Room added"
        });

      }


      // =================================================
      // LEAVE REQUEST
      // =================================================

      if (
        path === "/api/leave" &&
        request.method === "POST"
      ) {

        const data =
          await body(request);


        if (
          !data.employee_id ||
          !data.from_date ||
          !data.to_date
        ) {

          return json(
            {
              success: false,
              error:
                "Employee ID and dates are required"
            },
            400
          );

        }


        const employee =
          await env.DB.prepare(`
            SELECT
              employee_id,
              room,
              bed_no,
              status,
              hostel_status
            FROM employees
            WHERE employee_id = ?
          `)
          .bind(data.employee_id)
          .first();


        if (!employee) {

          return json(
            {
              success: false,
              error:
                "Employee not found"
            },
            404
          );

        }


        const roomVacate =
          data.room_vacate === true ||
          data.room_vacate === 1 ||
          data.room_vacate === "1" ||
          data.room_vacate === "YES";


        const leaveResult =
          await env.DB.prepare(`
            INSERT INTO leave_records
            (
              employee_id,
              from_date,
              to_date,
              reason,
              room_vacate,
              status
            )
            VALUES (?, ?, ?, ?, ?, 'PENDING')
          `)
          .bind(
            data.employee_id,
            data.from_date,
            data.to_date,
            data.reason || "",
            roomVacate ? 1 : 0
          )
          .run();


        // -----------------------------------------------
        // IF ROOM VACATE SELECTED
        // CREATE SEPARATE VACATE REQUEST
        // -----------------------------------------------

        let vacateId = null;


        if (
          roomVacate
        ) {

          const vacate =
            await env.DB.prepare(`
              INSERT INTO vacate_records
              (
                employee_id,
                room_no,
                bed_no,
                vacate_date,
                return_date,
                reason,
                status
              )
              VALUES (?, ?, ?, ?, ?, ?, 'PENDING')
            `)
            .bind(
              data.employee_id,
              employee.room || "",
              employee.bed_no,
              data.from_date,
              data.to_date,
              data.reason || ""
            )
            .run();


          vacateId =
            vacate.meta?.last_row_id ||
            null;

        }


        return json({

          success: true,

          message:
            roomVacate
              ? "Leave + Room Vacate request submitted for HR approval"
              : "Leave request submitted for HR approval",

          leave_id:
            leaveResult.meta?.last_row_id ||
            null,

          vacate_id:
            vacateId

        });

      }


      // =================================================
      // GET EMPLOYEE LEAVE HISTORY
      // =================================================

      if (
        path.startsWith(
          "/api/leave/"
        ) &&
        request.method === "GET"
      ) {

        const employeeId =
          decodeURIComponent(
            path.replace(
              "/api/leave/",
              ""
            )
          );


        const result =
          await env.DB.prepare(`
            SELECT *
            FROM leave_records
            WHERE employee_id = ?
            ORDER BY id DESC
          `)
          .bind(employeeId)
          .all();


        return json({
          success: true,
          leaves:
            result.results || []
        });

      }


      // =================================================
      // VACATE REQUEST DIRECT
      // =================================================

      if (
        path === "/api/vacate" &&
        request.method === "POST"
      ) {

        const data =
          await body(request);


        if (
          !data.employee_id ||
          !data.vacate_date ||
          !data.return_date
        ) {

          return json(
            {
              success: false,
              error:
                "Employee ID, vacate date and return date are required"
            },
            400
          );

        }


        const employee =
          await env.DB.prepare(`
            SELECT
              employee_id,
              room,
              bed_no,
              hostel_status
            FROM employees
            WHERE employee_id = ?
          `)
          .bind(data.employee_id)
          .first();


        if (!employee) {

          return json(
            {
              success: false,
              error:
                "Employee not found"
            },
            404
          );

        }


        const result =
          await env.DB.prepare(`
            INSERT INTO vacate_records
            (
              employee_id,
              room_no,
              bed_no,
              vacate_date,
              return_date,
              reason,
              status
            )
            VALUES (?, ?, ?, ?, ?, ?, 'PENDING')
          `)
          .bind(
            data.employee_id,
            employee.room || "",
            employee.bed_no,
            data.vacate_date,
            data.return_date,
            data.reason || ""
          )
          .run();


        return json({

          success: true,

          message:
            "Room vacate request submitted for HR approval",

          vacate_id:
            result.meta?.last_row_id ||
            null

        });

      }


      // =================================================
      // EMPLOYEE VACATE HISTORY
      // =================================================

      if (
        path.startsWith(
          "/api/vacate/"
        ) &&
        request.method === "GET"
      ) {

        const employeeId =
          decodeURIComponent(
            path.replace(
              "/api/vacate/",
              ""
            )
          );


        const result =
          await env.DB.prepare(`
            SELECT *
            FROM vacate_records
            WHERE employee_id = ?
            ORDER BY id DESC
          `)
          .bind(employeeId)
          .all();


        return json({
          success: true,
          vacates:
            result.results || []
        });

      }


      // =================================================
      // HR - VACATE REQUESTS
      // =================================================

      if (
        path === "/api/hr/vacates" &&
        request.method === "GET"
      ) {

        const result =
          await env.DB.prepare(`
            SELECT
              v.*,
              e.name,
              e.department
            FROM vacate_records v
            LEFT JOIN employees e
              ON e.employee_id = v.employee_id
            ORDER BY v.id DESC
          `)
          .all();


        return json({
          success: true,
          vacates:
            result.results || []
        });

      }


      // =================================================
      // HR - APPROVE VACATE
      // =================================================

      if (
        path === "/api/hr/vacates/approve" &&
        request.method === "POST"
      ) {

        const data =
          await body(request);


        if (!data.vacate_id) {

          return json(
            {
              success: false,
              error:
                "Vacate ID required"
            },
            400
          );

        }


        const requestData =
          await env.DB.prepare(`
            SELECT *
            FROM vacate_records
            WHERE id = ?
          `)
          .bind(data.vacate_id)
          .first();


        if (!requestData) {

          return json(
            {
              success: false,
              error:
                "Vacate request not found"
            },
            404
          );

        }


        if (
          requestData.status !==
          "PENDING"
        ) {

          return json(
            {
              success: false,
              error:
                "Request already processed"
            },
            409
          );

        }


        await env.DB.batch([

          env.DB.prepare(`
            UPDATE vacate_records
            SET
              status = 'APPROVED',
              approved_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `)
          .bind(data.vacate_id),


          env.DB.prepare(`
            UPDATE employees
            SET
              hostel_status = 'OUT'
            WHERE employee_id = ?
          `)
          .bind(
            requestData.employee_id
          )

        ]);


        return json({

          success: true,

          message:
            "Room vacate approved",

          employee_id:
            requestData.employee_id

        });

      }


      // =================================================
      // HR - REJECT VACATE
      // =================================================

      if (
        path === "/api/hr/vacates/reject" &&
        request.method === "POST"
      ) {

        const data =
          await body(request);


        if (!data.vacate_id) {

          return json(
            {
              success: false,
              error:
                "Vacate ID required"
            },
            400
          );

        }


        await env.DB.prepare(`
          UPDATE vacate_records
          SET status = 'REJECTED'
          WHERE id = ?
          AND status = 'PENDING'
        `)
        .bind(
          data.vacate_id
        )
        .run();


        return json({

          success: true,

          message:
            "Room vacate rejected"

        });

      }


      // =================================================
      // CHECK-IN REQUEST
      // =================================================

      if (
        path === "/api/checkin" &&
        request.method === "POST"
      ) {

        const data =
          await body(request);


        if (!data.employee_id) {

          return json(
            {
              success: false,
              error:
                "Employee ID required"
            },
            400
          );

        }


        const employee =
          await env.DB.prepare(`
            SELECT
              employee_id,
              room,
              bed_no,
              hostel_status
            FROM employees
            WHERE employee_id = ?
          `)
          .bind(data.employee_id)
          .first();


        if (!employee) {

          return json(
            {
              success: false,
              error:
                "Employee not found"
            },
            404
          );

        }


        if (
          employee.hostel_status ===
          "IN"
        ) {

          return json(
            {
              success: false,
              error:
                "Employee is already checked in"
            },
            409
          );

        }


        const pending =
          await env.DB.prepare(`
            SELECT id
            FROM checkin_requests
            WHERE employee_id = ?
            AND status = 'PENDING'
            LIMIT 1
          `)
          .bind(
            data.employee_id
          )
          .first();


        if (pending) {

          return json(
            {
              success: false,
              error:
                "Check-In request already pending"
            },
            409
          );

        }


        const result =
          await env.DB.prepare(`
            INSERT INTO checkin_requests
            (
              employee_id,
              requested_room,
              requested_bed,
              status
            )
            VALUES (?, ?, ?, 'PENDING')
          `)
          .bind(
            data.employee_id,
            employee.room || "",
            employee.bed_no
          )
          .run();


        // IMPORTANT:
        // employee remains OUT until HR approval.


        return json({

          success: true,

          message:
            "Check-In request submitted for HR approval",

          checkin_id:
            result.meta?.last_row_id ||
            null

        });

      }


      // =================================================
      // EMPLOYEE CHECK-IN STATUS
      // =================================================

      if (
        path.startsWith(
          "/api/checkin/"
        ) &&
        request.method === "GET"
      ) {

        const employeeId =
          decodeURIComponent(
            path.replace(
              "/api/checkin/",
              ""
            )
          );


        const result =
          await env.DB.prepare(`
            SELECT *
            FROM checkin_requests
            WHERE employee_id = ?
            ORDER BY id DESC
            LIMIT 10
          `)
          .bind(employeeId)
          .all();


        return json({
          success: true,
          requests:
            result.results || []
        });

      }


      // =================================================
      // HR - CHECK-IN REQUESTS
      // =================================================

      if (
        path === "/api/hr/checkins" &&
        request.method === "GET"
      ) {

        const result =
          await env.DB.prepare(`
            SELECT
              c.*,
              e.name,
              e.department
            FROM checkin_requests c
            LEFT JOIN employees e
              ON e.employee_id = c.employee_id
            ORDER BY c.id DESC
          `)
          .all();


        return json({
          success: true,
          checkins:
            result.results || []
        });

      }


      // =================================================
      // HR - APPROVE CHECK-IN
      // =================================================

      if (
        path === "/api/hr/checkins/approve" &&
        request.method === "POST"
      ) {

        const data =
          await body(request);


        if (!data.checkin_id) {

          return json(
            {
              success: false,
              error:
                "Check-In ID required"
            },
            400
          );

        }


        const requestData =
          await env.DB.prepare(`
            SELECT *
            FROM checkin_requests
            WHERE id = ?
          `)
          .bind(data.checkin_id)
          .first();


        if (!requestData) {

          return json(
            {
              success: false,
              error:
                "Check-In request not found"
            },
            404
          );

        }


        if (
          requestData.status !==
          "PENDING"
        ) {

          return json(
            {
              success: false,
              error:
                "Request already processed"
            },
            409
          );

        }


        const employee =
          await env.DB.prepare(`
            SELECT
              employee_id,
              room,
              bed_no,
              hostel_status,
              department
            FROM employees
            WHERE employee_id = ?
          `)
          .bind(
            requestData.employee_id
          )
          .first();


        if (!employee) {

          return json(
            {
              success: false,
              error:
                "Employee not found"
            },
            404
          );

        }


        // ------------------------------------------------
        // HR CAN SEND ANOTHER ROOM
        // If not supplied, old room is preferred.
        // ------------------------------------------------

        const targetRoom =
          (
            data.room ||
            requestData.requested_room ||
            employee.room ||
            ""
          ).trim();


        if (!targetRoom) {

          return json(
            {
              success: false,
              error:
                "Room allocation required"
            },
            400
          );

        }


        const room =
          await env.DB.prepare(`
            SELECT *
            FROM rooms
            WHERE room_no = ?
          `)
          .bind(targetRoom)
          .first();


        if (!room) {

          return json(
            {
              success: false,
              error:
                "Selected room not found"
            },
            404
          );

        }


        if (
          !roomEligibility(
            room.block,
            employee.department
          )
        ) {

          return json(
            {
              success: false,
              error:
                "This room is not allowed for this employee type"
            },
            400
          );

        }


        const occupied =
          await getRoomOccupancy(
            env.DB,
            targetRoom
          );


        let targetBed =
          null;


        // If old bed is still available,
        // restore same bed.
        if (
          targetRoom === employee.room &&
          employee.bed_no &&
          employee.bed_no <=
            Number(room.capacity)
        ) {

          const bedTaken =
            await env.DB.prepare(`
              SELECT employee_id
              FROM employees
              WHERE room = ?
              AND bed_no = ?
              AND hostel_status = 'IN'
              AND status = 'ACTIVE'
              AND employee_id != ?
              LIMIT 1
            `)
            .bind(
              targetRoom,
              employee.bed_no,
              employee.employee_id
            )
            .first();


          if (!bedTaken) {

            targetBed =
              Number(employee.bed_no);

          }

        }


        // Otherwise find a new bed.
        if (!targetBed) {

          if (
            occupied >=
            Number(room.capacity)
          ) {

            return json(
              {
                success: false,
                error:
                  `Room ${targetRoom} is FULL`
              },
              409
            );

          }


          targetBed =
            await findAvailableBed(
              env.DB,
              targetRoom,
              room.capacity
            );


          if (!targetBed) {

            return json(
              {
                success: false,
                error:
                  "No bed available"
              },
              409
            );

          }

        }


        // ------------------------------------------------
        // APPROVE CHECK-IN
        // ------------------------------------------------

        await env.DB.batch([

          env.DB.prepare(`
            UPDATE employees
            SET
              room = ?,
              bed_no = ?,
              hostel_status = 'IN'
            WHERE employee_id = ?
          `)
          .bind(
            targetRoom,
            targetBed,
            employee.employee_id
          ),


          env.DB.prepare(`
            UPDATE checkin_requests
            SET
              status = 'APPROVED',
              approved_at = CURRENT_TIMESTAMP,
              approved_room = ?,
              approved_bed = ?
            WHERE id = ?
          `)
          .bind(
            targetRoom,
            targetBed,
            requestData.id
          ),


          env.DB.prepare(`
            UPDATE vacate_records
            SET
              status = 'RETURNED',
              returned_at = CURRENT_TIMESTAMP
            WHERE employee_id = ?
            AND status = 'APPROVED'
          `)
          .bind(
            employee.employee_id
          )

        ]);


        return json({

          success: true,

          message:
            "Check-In approved",

          employee_id:
            employee.employee_id,

          room:
            targetRoom,

          bed_no:
            targetBed

        });

      }


      // =================================================
      // HR - REJECT CHECK-IN
      // =================================================

      if (
        path === "/api/hr/checkins/reject" &&
        request.method === "POST"
      ) {

        const data =
          await body(request);


        if (!data.checkin_id) {

          return json(
            {
              success: false,
              error:
                "Check-In ID required"
            },
            400
          );

        }


        await env.DB.prepare(`
          UPDATE checkin_requests
          SET status = 'REJECTED'
          WHERE id = ?
          AND status = 'PENDING'
        `)
        .bind(
          data.checkin_id
        )
        .run();


        return json({

          success: true,

          message:
            "Check-In rejected"

        });

      }


      // =================================================
      // API NOT FOUND
      // =================================================

      return json(
        {
          success: false,
          error:
            "API route not found"
        },
        404
      );


    } catch (error) {

      console.error(
        "Worker error:",
        error
      );


      return json(
        {
          success: false,
          error:
            error.message
        },
        500
      );

    }

  }

};
