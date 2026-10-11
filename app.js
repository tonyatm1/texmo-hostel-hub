
(() => {
  "use strict";

  const API = "";
  const $ = (s, root = document) => root.querySelector(s);
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
  }[c]));
  let token = localStorage.getItem("thh_token") || "";
  let user = null;
  let activeTab = "Dashboard";
  let cameraStream = null;
  let cameraMode = "cab";
  let cachedPeople = { employees: [], interns: [] };

  const css = `
  :root{--green:#087f43;--deep:#075c34;--light:#eaf8ef;--ink:#172b21;--muted:#64756a;--line:#dce9df;--white:#fff;--red:#b42318}
  *{box-sizing:border-box}body{margin:0;background:#f3f8f4;color:var(--ink);font:15px/1.45 system-ui,-apple-system,Segoe UI,sans-serif}
  button,input,select,textarea{font:inherit}button{cursor:pointer;border:0;border-radius:10px;padding:11px 15px;background:var(--green);color:#fff;font-weight:650}
  button:hover{filter:brightness(.96)}button.secondary{background:#e7f3eb;color:var(--deep)}button.danger{background:#b42318}button.small{padding:7px 10px;font-size:13px}
  input,select,textarea{width:100%;padding:11px 12px;border:1px solid #cbd9ce;border-radius:10px;background:#fff;color:#172b21;outline-color:var(--green)}
  textarea{min-height:78px;resize:vertical}label{display:block;font-weight:650;font-size:13px;margin:0 0 6px}
  .field{margin-bottom:13px;min-width:0}.formgrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
  .shell{min-height:100vh}.top{background:linear-gradient(120deg,#075c34,#0b9a50);color:#fff;padding:20px max(16px,calc((100% - 1200px)/2));display:flex;align-items:center;justify-content:space-between;gap:12px}
  .brand{font-size:21px;font-weight:850;letter-spacing:.2px}.sub{opacity:.86;font-size:12px}.top button{background:#fff;color:#075c34}
  .wrap{max-width:1200px;margin:auto;padding:18px}.nav{display:flex;gap:8px;overflow-x:auto;padding:4px 0 14px}
  .nav button{white-space:nowrap;background:#e4eee7;color:#345343}.nav button.on{background:#087f43;color:#fff}
  .grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:13px}.cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
  .card{background:#fff;border:1px solid var(--line);border-radius:16px;padding:17px;box-shadow:0 3px 12px #143f1f08;min-width:0}
  .stat{font-size:28px;font-weight:850;color:var(--green);margin:7px 0}.muted{color:var(--muted);font-size:13px}.title{font-size:19px;font-weight:800;margin:0 0 12px}
  .actions{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}.tablewrap{overflow:auto}table{border-collapse:collapse;width:100%;min-width:600px;font-size:13px}th,td{text-align:left;padding:10px;border-bottom:1px solid #e6eee8;vertical-align:top}th{background:#f0f7f2;color:#355541}
  .pill{display:inline-block;border-radius:100px;padding:4px 8px;background:#e7f3eb;color:#075c34;font-size:11px;font-weight:750}.pill.red{background:#ffeded;color:#a51d18}.pill.amber{background:#fff3d9;color:#845600}
  .msg{margin:10px 0;padding:11px 13px;border-radius:10px;background:#e7f3eb;color:#075c34}.msg.error{background:#ffeded;color:#a51d18}
  .auth{max-width:470px;margin:5vh auto;padding:20px}.logo{font-size:31px;font-weight:900;color:#087f43}.hint{font-size:12px;color:#64756a;margin:8px 0}
  .qr{width:min(270px,100%);aspect-ratio:1;object-fit:contain;background:white;border:1px solid var(--line);border-radius:12px}
  video{width:100%;max-height:360px;background:#111;border-radius:12px}.hidden{display:none!important}.foot{text-align:center;color:#728378;padding:22px;font-size:12px}
  @media(max-width:800px){.grid{grid-template-columns:repeat(2,minmax(0,1fr))}.wrap{padding:12px}.top{padding:15px}.cards{grid-template-columns:1fr}}
  @media(max-width:430px){.formgrid{grid-template-columns:1fr}.grid{gap:8px}.stat{font-size:24px}.card{padding:13px}.brand{font-size:18px}}
  `;

  document.head.insertAdjacentHTML("beforeend", `<style>${css}</style>`);
  document.body.innerHTML = `<div id="thh-root"></div>`;

  async function api(path, options = {}) {
    const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
    if (token) headers.Authorization = "Bearer " + token;
    const res = await fetch(API + path, { ...options, headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) throw new Error(data.message || data.detail || "Request failed");
    return data;
  }

  function say(message, error = false) {
    const box = $("#notice");
    if (!box) { alert(message); return; }
    box.className = "msg" + (error ? " error" : "");
    box.textContent = message;
    box.classList.remove("hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function field(label, name, type = "text", value = "", required = false) {
    return `<div class="field"><label for="${esc(name)}">${esc(label)}</label>
      <input id="${esc(name)}" name="${esc(name)}" type="${esc(type)}" value="${esc(value)}" ${required ? "required" : ""}></div>`;
  }

  function selectField(label, name, options, value = "") {
    return `<div class="field"><label for="${esc(name)}">${esc(label)}</label><select id="${esc(name)}" name="${esc(name)}">
      ${options.map(o => `<option value="${esc(o)}" ${o === value ? "selected" : ""}>${esc(o || "Select")}</option>`).join("")}
    </select></div>`;
  }

  function root(html) { $("#thh-root").innerHTML = html; }

  function loginScreen(register = false) {
    stopCamera();
    root(`<main class="auth">
      <section class="card">
        <div class="logo">THH</div><div class="title">TEXMO HOSTEL HUB</div>
        <p class="muted">Hostel Management System</p>
        <div id="notice" class="hidden"></div>
        <div class="field"><label>Portal</label><select id="accountType">
          <option value="STAFF">HR / Management / Admin</option>
          <option value="EMPLOYEE">Employee</option><option value="INTERN">Intern</option>
        </select></div>
        <form id="authForm">
          ${field("Staff ID / Employee ID / Intern ID", "loginId", "text", "", true)}
          ${field("Password", "loginPassword", "password", "", true)}
          <div id="registerFields" class="${register ? "" : "hidden"}">
            ${field("Full name", "regName")}
            ${field("Mobile number", "regMobile", "tel")}
            ${field("Department (PDN / PDN2 / PDN3 / MDN)", "regDepartment")}
            ${field("Designation", "regDesignation")}
            ${field("Shift (SHIFT 1 / SHIFT 2 / SHIFT 3)", "regShift")}
            ${field("Room", "regRoom")}
            ${field("HR master key (staff registration only)", "masterKey", "password")}
            <div class="field"><label>Staff role (staff registration only)</label>
              <select id="regRole"><option>HR</option><option>MANAGEMENT</option><option>ADMIN</option></select></div>
          </div>
          <button id="authSubmit" type="submit" style="width:100%">${register ? "Create account" : "Log in"}</button>
        </form>
        <div class="actions"><button id="toggleRegister" class="secondary" style="width:100%">${register ? "Back to login" : "New account / Staff registration"}</button></div>
        <p class="hint">Staff registration requires the authorized master key. No password recovery is enabled.</p>
      </section>
      <div class="foot">TEXMO HOSTEL HUB · Secure access</div>
    </main>`);

    $("#toggleRegister").onclick = () => loginScreen(!register);
    $("#accountType").onchange = () => {
      const type = $("#accountType").value;
      $("#regDepartment").placeholder = "PDN / PDN2 / PDN3 / MDN";
      $("#registerFields").classList.toggle("hidden", !register);
      $("#regRole").closest(".field").classList.toggle("hidden", !["STAFF","HR","MANAGEMENT","ADMIN"].includes(type));
      $("#masterKey").closest(".field").classList.toggle("hidden", !["STAFF","HR","MANAGEMENT","ADMIN"].includes(type));
    };

    $("#authForm").onsubmit = async e => {
      e.preventDefault();
      const type = $("#accountType").value;
      const id = $("#loginId").value.trim();
      const password = $("#loginPassword").value;
      try {
        if (register) {
          const isStaff = ["STAFF","HR","MANAGEMENT","ADMIN"].includes(type);
          const payload = {
            type: isStaff ? $("#regRole").value : type,
            id, password,
            name: $("#regName").value.trim(),
            mobile: $("#regMobile").value.trim(),
            department: $("#regDepartment").value.trim().toUpperCase(),
            designation: $("#regDesignation").value.trim(),
            shift: $("#regShift").value.trim().toUpperCase(),
            room: $("#regRoom").value.trim()
          };
          await api("/api/register", {
            method: "POST",
            headers: { "X-Master-Key": $("#masterKey").value },
            body: JSON.stringify(payload)
          });
          loginScreen(false);
          say("Account created. Login using your ID and password.");
          return;
        }

        const result = await api("/api/login", {
          method: "POST", body: JSON.stringify({ type, id, password })
        });
        token = result.token;
        user = result.user;
        localStorage.setItem("thh_token", token);
        await enterPortal();
      } catch (err) { say(err.message, true); }
    };
    $("#accountType").dispatchEvent(new Event("change"));
  }

  async function enterPortal() {
    try {
      const result = await api("/api/me");
      user = result.user || user;
      if (user.kind === "STAFF") await renderManager();
      else await renderPerson(result);
    } catch (err) {
      localStorage.removeItem("thh_token");
      token = "";
      user = null;
      loginScreen();
      say(err.message, true);
    }
  }

  function header() {
    return `<header class="top"><div><div class="brand">TEXMO HOSTEL HUB</div>
      <div class="sub">${esc(user?.name || "")} · ${esc(user?.role || user?.person_type || "")}</div></div>
      <button id="logout">Logout</button></header><div class="wrap"><div id="notice" class="hidden"></div>
      <nav class="nav" id="nav"></nav><main id="page"></main></div><div class="foot">TEXMO HOSTEL HUB · Staff and Hostel Portal</div>`;
  }

  function setShell(tabs) {
    root(header());
    $("#logout").onclick = logout;
    $("#nav").innerHTML = tabs.map(t =>
      `<button data-tab="${esc(t)}" class="${t === activeTab ? "on" : ""}">${esc(t)}</button>`
    ).join("");
    $("#nav").querySelectorAll("button").forEach(b => b.onclick = () => {
      activeTab = b.dataset.tab;
      $("#nav").querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b));
      renderTab();
    });
  }

  function logout() {
    stopCamera();
    token = ""; user = null; activeTab = "Dashboard";
    localStorage.removeItem("thh_token");
    loginScreen();
  }
  window.logout = logout;

  async function renderManager() {
    activeTab = "Dashboard";
    setShell(["Dashboard","People","Rooms","Food QR","Cab Scanner","Attendance","Requests","Reports"]);
    await renderTab();
  }

  async function renderPerson(profile) {
    activeTab = "Profile";
    setShell(["Profile","My QR","Food Scanner","Requests to HR"]);
    await renderTab(profile);
  }

  async function renderTab(profile) {
    stopCamera();
    const page = $("#page");
    if (!page) return;
    page.innerHTML = `<section class="card">Loading...</section>`;
    try {
      if (user.kind === "STAFF") {
        switch (activeTab) {
          case "Dashboard": return await dashboard();
          case "People": return await peoplePage();
          case "Rooms": return await roomsPage();
          case "Food QR": return await foodQRPage();
          case "Cab Scanner": return cabPage();
          case "Attendance": return await attendancePage();
          case "Requests": return await requestsPage();
          case "Reports": return await reportsPage();
        }
      } else {
        switch (activeTab) {
          case "Profile": return await profilePage(profile);
          case "My QR": return await myQRPage(profile);
          case "Food Scanner": return foodScanPage();
          case "Requests to HR": return await personRequestsPage();
        }
      }
    } catch (err) {
      page.innerHTML = `<section class="card"><div class="msg error">${esc(err.message)}</div><button onclick="location.reload()">Reload</button></section>`;
    }
  }

  async function dashboard() {
    const d = await api("/api/dashboard");
    const people = [...d.employees, ...d.interns];
    $("#page").innerHTML = `
      <h2 class="title">Operations Dashboard</h2>
      <div class="grid">
        ${stat("Employees", d.employees.length)}${stat("Interns", d.interns.length)}
        ${stat("Rooms", d.rooms.length)}${stat("Pending HR", d.pending_requests)}
        ${stat("Food scans today", d.food_today)}${stat("Cab entries today", d.cab_today)}
        ${stat("Attendance entries today", d.attendance_today)}
        ${stat("Currently IN", people.filter(p=>p.hostel_status==="IN"&&p.status==="ACTIVE").length)}
      </div>
      <section class="card" style="margin-top:14px"><h3 class="title">Quick access</h3>
      <div class="actions">${["People","Rooms","Food QR","Cab Scanner","Attendance","Requests","Reports"].map(t=>`<button class="secondary" data-go="${t}">${t}</button>`).join("")}</div>
      <p class="muted">Employee and Intern records · Hostel status · Meals · Cab · Shift attendance · HR approvals</p></section>`;
    $("#page").querySelectorAll("[data-go]").forEach(b => b.onclick = () => {
      activeTab = b.dataset.go;
      $("#nav").querySelectorAll("button").forEach(x => x.classList.toggle("on", x.dataset.tab === activeTab));
      renderTab();
    });
  }

  function stat(label, value) {
    return `<section class="card"><div class="muted">${esc(label)}</div><div class="stat">${esc(value)}</div></section>`;
  }

  async function peoplePage() {
    cachedPeople = await api("/api/people");
    const all = [
      ...cachedPeople.employees.map(p=>({...p,person_type:"EMPLOYEE"})),
      ...cachedPeople.interns.map(p=>({...p,person_type:"INTERN"}))
    ];
    $("#page").innerHTML = `<h2 class="title">People Management</h2>
      <section class="card"><div class="formgrid">
      ${selectField("Person type","filterType",["ALL","EMPLOYEE","INTERN"])}
      ${selectField("Status","filterStatus",["ALL","ACTIVE","RESIGNED"])}
      </div><div class="field"><label>Search name / ID / department</label><input id="peopleSearch" placeholder="Search records"></div>
      <div class="tablewrap"><table><thead><tr><th>Type / ID</th><th>Name</th><th>Department</th><th>Room / Shift</th><th>Hostel status</th><th>Record status</th><th>Action</th></tr></thead><tbody id="peopleRows"></tbody></table></div>
      </section>`;
    const draw = () => {
      const q = $("#peopleSearch").value.toLowerCase();
      const type = $("#filterType").value, status = $("#filterStatus").value;
      $("#peopleRows").innerHTML = all.filter(p =>
        (type==="ALL"||p.person_type===type) && (status==="ALL"||p.status===status) &&
        [p.id,p.name,p.department,p.room].join(" ").toLowerCase().includes(q)
      ).map(p=>`<tr><td>${esc(p.person_type)}<br>${esc(p.id)}</td><td>${esc(p.name)}<br>${esc(p.mobile)}</td>
      <td>${esc(p.department)}</td><td>${esc(p.room)}<br>${esc(p.shift)}</td>
      <td>${esc(p.hostel_status)}</td><td>${esc(p.status)}</td>
      <td><button class="small" data-edit="${esc(p.person_type)}|${esc(p.id)}">Edit</button>
      <button class="small secondary" data-resign="${esc(p.person_type)}|${esc(p.id)}">Resign</button></td></tr>`).join("") || `<tr><td colspan="7">No records found.</td></tr>`;
      $("#peopleRows").querySelectorAll("[data-edit]").forEach(b=>b.onclick=()=>editPerson(...b.dataset.edit.split("|")));
      $("#peopleRows").querySelectorAll("[data-resign]").forEach(b=>b.onclick=()=>resignPerson(...b.dataset.resign.split("|")));
    };
    $("#peopleSearch").oninput = draw; $("#filterType").onchange = draw; $("#filterStatus").onchange = draw; draw();
    $("#page").insertAdjacentHTML("beforeend", `<section class="card" style="margin-top:14px"><h3 class="title">Download records</h3><div class="actions">
      <button data-export="employees">Employees CSV</button><button data-export="interns">Interns CSV</button><button data-export="requests">Requests CSV</button>
      </div></section>`);
    $("#page").querySelectorAll("[data-export]").forEach(b=>b.onclick=()=>exportCSV(b.dataset.export));
  }

  async function editPerson(type, id) {
    const list = type === "INTERN" ? cachedPeople.interns : cachedPeople.employees;
    const p = list.find(x=>x.id===id);
    if (!p) return;
    $("#page").insertAdjacentHTML("afterbegin", `<section class="card" id="editBox"><h3 class="title">Edit ${esc(p.name)}</h3>
      <form id="editForm"><div class="formgrid">
      ${field("Name","eName","text",p.name,true)}${field("Mobile","eMobile","tel",p.mobile,true)}
      ${selectField("Department","eDept",["PDN","PDN2","PDN3","MDN"],p.department)}
      ${field("Designation","eDesignation","text",p.designation)}
      ${selectField("Shift","eShift",["","SHIFT 1","SHIFT 2","SHIFT 3"],p.shift)}
      ${field("Room","eRoom","text",p.room)}
      ${selectField("Hostel status","eHostel",["IN","OUT/LEAVE","VACATED"],p.hostel_status)}
      ${selectField("Record status","eStatus",["ACTIVE","RESIGNED"],p.status)}
      ${field("New password (optional)","ePassword","password")}
      </div><div class="actions"><button>Save changes</button><button type="button" class="secondary" id="cancelEdit">Cancel</button></div></form></section>`);
    $("#cancelEdit").onclick=()=>$("#editBox").remove();
    $("#editForm").onsubmit=async e=>{
      e.preventDefault();
      try{
        const body={person_type:type,person_id:id,name:$("#eName").value,mobile:$("#eMobile").value,department:$("#eDept").value,designation:$("#eDesignation").value,shift:$("#eShift").value,room:$("#eRoom").value,hostel_status:$("#eHostel").value,status:$("#eStatus").value,password:$("#ePassword").value};
        await api("/api/people/update",{method:"POST",body:JSON.stringify(body)});
        say("Record updated."); await peoplePage();
      }catch(err){say(err.message,true);}
    };
    $("#editBox").scrollIntoView({behavior:"smooth"});
  }

  async function resignPerson(type,id) {
    if(!confirm(`Mark ${id} as RESIGNED? Historical data will remain.`)) return;
    try{await api("/api/people/delete",{method:"POST",body:JSON.stringify({person_type:type,person_id:id})});say("Record marked RESIGNED.");await peoplePage();}
    catch(e){say(e.message,true);}
  }

  async function roomsPage() {
    const d=await api("/api/rooms");
    $("#page").innerHTML=`<h2 class="title">Rooms</h2><section class="card"><p class="muted">Room occupancy is not restricted to a fixed bed count.</p>
    <div class="tablewrap"><table><thead><tr><th>Room</th><th>Block</th><th>Occupants currently IN</th><th>Room status</th><th>Action</th></tr></thead><tbody>
    ${d.rooms.map(r=>{const people=[...cachedPeople.employees,...cachedPeople.interns];const count=people.filter(p=>p.room===r.room_number&&p.hostel_status==="IN"&&p.status==="ACTIVE").length;return `<tr><td>${esc(r.room_number)}</td><td>${esc(r.block)}</td><td>${count}</td><td>${esc(r.status)}</td><td><button class="small" data-room="${esc(r.room_number)}" data-status="${esc(r.status)}">Toggle status</button></td></tr>`}).join("")}
    </tbody></table></div></section>`;
    $("#page").querySelectorAll("[data-room]").forEach(b=>b.onclick=async()=>{try{await api("/api/rooms/update",{method:"POST",body:JSON.stringify({room_number:b.dataset.room,status:b.dataset.status==="ACTIVE"?"INACTIVE":"ACTIVE"})});await roomsPage();}catch(e){say(e.message,true);}});
  }

  async function foodQRPage() {
    const d=await api("/api/food/qr");
    $("#page").innerHTML=`<h2 class="title">Food QR</h2><section class="card">
      <p>Employees and Interns scan this QR from their Food Scanner tab, then select their meal.</p>
      <img class="qr" alt="Food QR code" src="https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(d.qr_token)}">
      <p class="muted">Keep this QR inside the authorized food counter. The token is active until disabled in the database.</p>
      <div class="actions"><button id="copyFood" class="secondary">Copy food QR token</button><button id="foodRefresh">Refresh</button></div></section>`;
    $("#copyFood").onclick=()=>copyText(d.qr_token);
    $("#foodRefresh").onclick=()=>foodQRPage();
  }

  function cabPage() {
    $("#page").innerHTML=`<h2 class="title">Cab Scanner</h2><section class="card">
      <p>Scan an Employee/Intern My QR code to save name, ID, department, shift, room, date and time.</p>
      <div class="actions"><button id="startCab">Start camera</button><button class="secondary" id="stopCab">Stop camera</button></div>
      <video id="camera" autoplay playsinline class="hidden"></video><div id="scanStatus" class="msg">Camera not started.</div>
      <div class="field"><label>Or enter QR token manually</label><input id="manualQR" placeholder="Paste scanned QR token"></div>
      <button id="submitCab">Save cab entry</button><div id="scanResult"></div></section>`;
    $("#startCab").onclick=()=>startCamera("cab");
    $("#stopCab").onclick=stopCamera;
    $("#submitCab").onclick=()=>submitCab($("#manualQR").value.trim());
  }

  async function startCamera(mode) {
    cameraMode=mode;
    const video=$("#camera");
    if(!video){say("Scanner panel not available.",true);return;}
    if(!("BarcodeDetector" in window)){say("QR camera scanning is not supported in this browser. Use a QR scanner app and paste the token.",true);return;}
    try{
      stopCamera();
      cameraStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:"environment"},audio:false});
      video.srcObject=cameraStream;video.classList.remove("hidden");
      const detector=new BarcodeDetector({formats:["qr_code"]});
      $("#scanStatus").textContent="Camera active. Point it at the QR.";
      const scan=async()=>{
        if(!cameraStream||!video.isConnected)return;
        try{
          const codes=await detector.detect(video);
          if(codes.length&&codes[0].rawValue){
            const value=codes[0].rawValue;
            if(cameraMode==="cab"){ $("#manualQR").value=value; await submitCab(value); }
            else { $("#foodToken").value=value; stopCamera(); }
            return;
          }
        }catch{}
        if(cameraStream) requestAnimationFrame(scan);
      };
      video.onloadeddata=()=>requestAnimationFrame(scan);
    }catch(e){say("Camera permission failed: "+e.message,true);}
  }

  function stopCamera() {
    if(cameraStream){cameraStream.getTracks().forEach(t=>t.stop());cameraStream=null;}
    const v=$("#camera");if(v){v.srcObject=null;v.classList.add("hidden");}
  }

  async function submitCab(qr_token) {
    if(!qr_token){say("Scan or enter an employee QR token.",true);return;}
    try{
      const d=await api("/api/cab/scan",{method:"POST",body:JSON.stringify({qr_token})});
      $("#scanResult").innerHTML=`<div class="msg">Saved: ${esc(d.entry.name)} · ${esc(d.entry.id)} · ${esc(d.entry.date)} ${esc(d.entry.time)}</div>`;
      $("#manualQR").value="";
    }catch(e){say(e.message,true);}
  }

  async function attendancePage() {
    const people=await api("/api/people");
    cachedPeople=people;
    const all=[...people.employees.map(p=>({...p,person_type:"EMPLOYEE"})),...people.interns.map(p=>({...p,person_type:"INTERN"}))].filter(p=>p.status==="ACTIVE");
    $("#page").innerHTML=`<h2 class="title">Shift Attendance</h2><section class="card">
      <form id="attendanceForm"><div class="formgrid">
      ${selectField("Person","attPerson",all.map(p=>p.person_type+"|"+p.id+"|"+p.name))}
      ${selectField("Shift","attShift",["SHIFT 1","SHIFT 2","SHIFT 3"])}
      ${selectField("Attendance","attStatus",["PRESENT","ABSENT","N/A"])}
      ${field("Date","attDate","date",new Date().toISOString().slice(0,10),true)}
      </div><button>Save attendance</button></form></section>
      <section class="card" style="margin-top:14px"><h3 class="title">View records</h3>
      <div class="field"><label>Date</label><input id="attViewDate" type="date" value="${new Date().toISOString().slice(0,10)}"></div>
      <button id="loadAttendance">Load attendance</button><div id="attRows"></div></section>`;
    $("#attPerson").innerHTML=all.map(p=>`<option value="${esc(p.person_type+"|"+p.id)}">${esc(p.name+" · "+p.id+" · "+p.department)}</option>`).join("");
    $("#attendanceForm").onsubmit=async e=>{e.preventDefault();const [person_type,person_id]=$("#attPerson").value.split("|");try{await api("/api/attendance",{method:"POST",body:JSON.stringify({person_type,person_id,shift:$("#attShift").value,attendance_status:$("#attStatus").value,attendance_date:$("#attDate").value})});say("Attendance saved.");}catch(err){say(err.message,true);}};
    $("#loadAttendance").onclick=async()=>{try{const d=await api("/api/attendance?date="+encodeURIComponent($("#attViewDate").value));$("#attRows").innerHTML=table(d.attendance,["person_id","person_type","department","room","shift","attendance_status","attendance_date"]);}catch(e){say(e.message,true);}};
  }

  async function requestsPage() {
    const d=await api("/api/requests");
    $("#page").innerHTML=`<h2 class="title">Requests to HR</h2><section class="card">
      <div class="tablewrap"><table><thead><tr><th>ID / Person</th><th>Request</th><th>Dates</th><th>Remarks</th><th>Status</th><th>HR response</th><th>Action</th></tr></thead><tbody>
      ${d.requests.map(r=>`<tr><td>${esc(r.id)}<br>${esc(r.person_name)}<br>${esc(r.person_id)}</td><td>${esc(r.request_type)}</td>
      <td>${esc(r.from_date)}<br>${esc(r.to_date)}</td><td>${esc(r.remarks)}</td><td>${esc(r.status)}</td><td>${esc(r.hr_remarks)}</td>
      <td>${r.status==="PENDING"?`<button class="small" data-review="${r.id}|APPROVED">Approve</button> <button class="small danger" data-review="${r.id}|REJECTED">Reject</button>`:"Completed"}</td></tr>`).join("")}
      </tbody></table></div></section>`;
    $("#page").querySelectorAll("[data-review]").forEach(b=>b.onclick=async()=>{const [id,status]=b.dataset.review.split("|");const remarks=prompt("HR remarks (optional):")||"";try{await api("/api/requests/review",{method:"POST",body:JSON.stringify({id,status,hr_remarks:remarks})});say("Request "+status.toLowerCase()+".");await requestsPage();}catch(e){say(e.message,true);}});
  }

  async function profilePage(profile) {
    const d=profile||await api("/api/me");
    const p=d.user||user;
    $("#page").innerHTML=`<h2 class="title">My Profile</h2><section class="card"><div class="grid">
      ${stat("Name",p.name)}${stat("ID",p.id||p.person_id)}${stat("Department",p.department)}${stat("Hostel status",p.hostel_status)}
      </div><div class="formgrid" style="margin-top:14px">
      <div><label>Mobile</label><input value="${esc(p.mobile)}" readonly></div>
      <div><label>Designation</label><input value="${esc(p.designation)}" readonly></div>
      <div><label>Room</label><input value="${esc(p.room)}" readonly></div>
      <div class="field"><label>My shift</label><select id="myShift"><option value="">Select shift</option><option>SHIFT 1</option><option>SHIFT 2</option><option>SHIFT 3</option></select></div>
      </div><button id="saveShift">Update my shift</button>
      <p class="muted">You can update only your own shift. Contact HR for other profile changes.</p></section>`;
    $("#myShift").value=p.shift||"";
    $("#saveShift").onclick=async()=>{try{await api("/api/my/shift",{method:"POST",body:JSON.stringify({shift:$("#myShift").value})});say("Shift updated.");}catch(e){say(e.message,true);}};
  }

  async function myQRPage(profile) {
    const d=profile||await api("/api/me");
    const p=d.user||user;
    if(!d.qr_token){const fresh=await api("/api/me");d.qr_token=fresh.qr_token;}
    $("#page").innerHTML=`<h2 class="title">My QR</h2><section class="card">
      <p>Show this QR to authorized HR for cab entry.</p>
      <img class="qr" alt="My employee QR" src="https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(d.qr_token)}">
      <p><strong>${esc(p.name)}</strong><br>${esc(p.id||p.person_id)} · ${esc(p.department)}</p>
      <button class="secondary" id="copyMyQR">Copy QR token</button></section>`;
    $("#copyMyQR").onclick=()=>copyText(d.qr_token);
  }

  function foodScanPage() {
    $("#page").innerHTML=`<h2 class="title">Food Scanner</h2><section class="card">
      <p>Scan the QR displayed by HR, then choose your meal.</p>
      <div class="actions"><button id="startFood">Scan food QR</button><button id="stopFood" class="secondary">Stop camera</button></div>
      <video id="camera" autoplay playsinline class="hidden"></video>
      <div class="field"><label>Food QR token</label><input id="foodToken" placeholder="Scan QR or paste token"></div>
      ${selectField("Meal","mealType",["BREAKFAST","LUNCH","DINNER"])}
      <button id="submitFood">Record my meal</button></section>`;
    $("#startFood").onclick=()=>startCamera("food");
    $("#stopFood").onclick=stopCamera;
    $("#submitFood").onclick=async()=>{
      try{await api("/api/food/scan",{method:"POST",body:JSON.stringify({qr_token:$("#foodToken").value.trim(),meal_type:$("#mealType").value})});say("Meal recorded successfully.");$("#foodToken").value="";}
      catch(e){say(e.message,true);}
    };
  }

  async function personRequestsPage() {
    const d=await api("/api/requests");
    $("#page").innerHTML=`<h2 class="title">Requests to HR</h2><section class="card">
      <form id="requestForm">${selectField("Request type","reqType",["LEAVE","TEMPORARY OUT","RETURN","VACATE"])}
      <div class="formgrid">${field("From date","reqFrom","date")}${field("To date","reqTo","date")}</div>
      <div class="field"><label>Remarks</label><textarea id="reqRemarks" placeholder="Add a short note for HR"></textarea></div>
      <button>Submit request</button></form></section>
      <section class="card" style="margin-top:14px"><h3 class="title">My request history</h3>
      <div class="tablewrap"><table><thead><tr><th>Type</th><th>Dates</th><th>Remarks</th><th>Status</th><th>HR response</th></tr></thead><tbody>
      ${d.requests.map(r=>`<tr><td>${esc(r.request_type)}</td><td>${esc(r.from_date)}<br>${esc(r.to_date)}</td><td>${esc(r.remarks)}</td><td>${esc(r.status)}</td><td>${esc(r.hr_remarks)}</td></tr>`).join("")||`<tr><td colspan="5">No requests yet.</td></tr>`}
      </tbody></table></div></section>`;
    $("#requestForm").onsubmit=async e=>{e.preventDefault();try{await api("/api/requests",{method:"POST",body:JSON.stringify({request_type:$("#reqType").value,from_date:$("#reqFrom").value,to_date:$("#reqTo").value,remarks:$("#reqRemarks").value})});say("Request sent to HR.");await personRequestsPage();}catch(err){say(err.message,true);}};
  }

  async function reportsPage() {
    const month=new Date().toISOString().slice(0,7);
    $("#page").innerHTML=`<h2 class="title">Reports & Export</h2><section class="card">
      <div class="field"><label>Report month</label><input id="reportMonth" type="month" value="${month}"></div>
      <div class="actions"><button id="loadReport">Load report</button><button class="secondary" data-export="food">Food CSV</button><button class="secondary" data-export="cab">Cab CSV</button><button class="secondary" data-export="attendance">Attendance CSV</button><button class="secondary" data-export="requests">Requests CSV</button></div>
      <div id="reportData"></div></section>`;
    $("#loadReport").onclick=async()=>{
      try{const d=await api("/api/reports?month="+encodeURIComponent($("#reportMonth").value));
        $("#reportData").innerHTML=`<h3>Meal totals</h3>${table(d.food,["meal_type","total"])}<h3>Daily meals</h3>${table(d.daily_food,["entry_date","meal_type","total"])}<h3>Cab totals</h3>${table(d.cab,["entry_date","total"])}<h3>Attendance</h3>${table(d.attendance,["attendance_date","shift","attendance_status","total"])}`;
      }catch(e){say(e.message,true);}
    };
    $("#page").querySelectorAll("[data-export]").forEach(b=>b.onclick=()=>exportCSV(b.dataset.export));
    $("#loadReport").click();
  }

  function table(rows, cols) {
    if(!rows?.length)return `<p class="muted">No records found.</p>`;
    return `<div class="tablewrap"><table><thead><tr>${cols.map(c=>`<th>${esc(c.replaceAll("_"," "))}</th>`).join("")}</tr></thead><tbody>${rows.map(r=>`<tr>${cols.map(c=>`<td>${esc(r[c])}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  }

  async function exportCSV(type) {
    try{
      const d=await api("/api/export?type="+encodeURIComponent(type));
      const rows=d.rows||[];
      if(!rows.length){say("No records to export.");return;}
      const cols=[...new Set(rows.flatMap(r=>Object.keys(r)))];
      const csv=[cols,...rows.map(r=>cols.map(c=>r[c]??""))]
        .map(row=>row.map(v=>`"${String(v).replaceAll('"','""')}"`).join(",")).join("\r\n");
      const blob=new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8"});
      const a=document.createElement("a");a.href=URL.createObjectURL(blob);
      a.download=`texmo-${type}-${new Date().toISOString().slice(0,10)}.csv`;
      a.click();URL.revokeObjectURL(a.href);
    }catch(e){say(e.message,true);}
  }

  async function copyText(value) {
    try{await navigator.clipboard.writeText(value);say("Copied.");}
    catch{prompt("Copy this token:",value);}
  }

  if(token) {
    enterPortal();
  } else {
    loginScreen();
  }
})();
