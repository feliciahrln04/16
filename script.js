(() => {
  "use strict";

  const USERS = Object.freeze({
    qc:    { password: "QC123", role: "QC" },
    qa:    { password: "QA123", role: "QA" },
    admin: { password: "Admin123", role: "Admin" }
  });

  const URS = [
    {id:"URS-001",text:"System shall authenticate authorized users.",criteria:"Authorized credentials authenticate successfully and unauthorized credentials are rejected."},
    {id:"URS-002",text:"System shall allow UV wavelength configuration within 190–600 nm.",criteria:"Wavelength 190–600 nm is accepted; values outside the range are rejected."},
    {id:"URS-003",text:"System shall record audit trail events.",criteria:"A timestamped audit trail record is created with user and action details."},
    {id:"URS-004",text:"System shall support electronic signature for approval.",criteria:"Valid QA credentials are required to create an approval signature."},
    {id:"URS-005",text:"System shall preserve analytical calculation results.",criteria:"A completed analytical calculation remains available after navigation."}
  ];

  const VALIDATION_CASES = [
    {id:"IQ-001",phase:"IQ",title:"System identification",objective:"Verify the HPLC-UV CSV system is uniquely identified.",input:"System ID = HPLC-UV-001; Software Version = 1.0.0",criteria:"System ID HPLC-UV-001 and software version 1.0.0 are displayed.",evaluate:d=>d.actual.includes("HPLC-UV-001")&&d.actual.includes("1.0.0")},
    {id:"IQ-002",phase:"IQ",title:"User authentication configuration",objective:"Verify role-based user authentication is configured.",input:"QC, QA and Admin accounts",criteria:"Only configured credentials can authenticate and each account has a defined role.",evaluate:d=>Object.keys(USERS).length===3 && USERS.qc.role==="QC" && USERS.qa.role==="QA" && USERS.admin.role==="Admin" && d.actual.toLowerCase().includes("configured")},
    {id:"IQ-003",phase:"IQ",title:"Instrument configuration",objective:"Verify HPLC pump, autosampler, column oven and UV detector modules are available.",input:"Instrument module configuration",criteria:"All four HPLC-UV modules are present and configurable.",evaluate:d=>Boolean($("pumpFlow")&&$("injectionVolume")&&$("ovenTemp")&&$("uvWavelength"))&&d.actual.toLowerCase().includes("available")},
    {id:"OQ-001",phase:"OQ",title:"Authorized login",objective:"Verify authorized login works.",input:"Username = qc; Password = QC123",criteria:"Authorized QC credentials are accepted.",evaluate:d=>d.actual.toLowerCase().includes("authenticated")},
    {id:"OQ-002",phase:"OQ",title:"Unauthorized login",objective:"Verify unauthorized credentials are rejected.",input:"Invalid username/password",criteria:"Invalid credentials are rejected and access is not granted.",evaluate:d=>d.actual.toLowerCase().includes("rejected")||d.actual.toLowerCase().includes("denied")},
    {id:"OQ-003",phase:"OQ",title:"Positive wavelength",objective:"Verify an in-range wavelength is accepted.",input:"243 nm",criteria:"243 nm is accepted because it is within 190–600 nm.",evaluate:d=>isValidWavelength(243)&&d.actual.toLowerCase().includes("accepted")},
    {id:"OQ-004",phase:"OQ",title:"Negative wavelength",objective:"Verify an out-of-range wavelength is rejected.",input:"601 nm",criteria:"601 nm is rejected because it is outside 190–600 nm.",evaluate:d=>!isValidWavelength(601)&&d.actual.toLowerCase().includes("rejected")},
    {id:"OQ-005",phase:"OQ",title:"Boundary wavelength",objective:"Verify lower and upper wavelength boundaries.",input:"190 nm, 600 nm, 189 nm and 601 nm",criteria:"190 and 600 nm are accepted; 189 and 601 nm are rejected.",evaluate:d=>isValidWavelength(190)&&isValidWavelength(600)&&!isValidWavelength(189)&&!isValidWavelength(601)&&d.actual.includes("190")&&d.actual.includes("600")},
    {id:"OQ-006",phase:"OQ",title:"Calculation verification",objective:"Verify the analytical calculation formula.",input:"Sample area 985000; Standard area 1000000; Standard concentration 10 µg/mL",criteria:"Assay calculation returns 98.50%.",evaluate:d=>d.actual.includes("98.50")},
    {id:"OQ-007",phase:"OQ",title:"Audit trail verification",objective:"Verify user actions are recorded.",input:"Perform a controlled user action",criteria:"A timestamped audit event records the user, role, action and details.",evaluate:()=>getAudit().length>0},
    {id:"OQ-008",phase:"OQ",title:"Electronic signature verification",objective:"Verify controlled electronic signature credentials.",input:"QA credentials",criteria:"Valid QA credentials are required for an approval signature.",evaluate:d=>d.actual.toLowerCase().includes("signature")&&USERS.qa.password==="QA123"},
    {id:"OQ-009",phase:"OQ",title:"Sequence verification",objective:"Verify manually entered sequence injections are retained and executable.",input:"At least one completed injection",criteria:"Sequence contains manually entered injection data and Run Sequence changes status to Completed.",evaluate:()=>state.sequence.length>0&&state.sequence.every(x=>x.status==="Completed")},
    {id:"OQ-010",phase:"OQ",title:"Data preservation verification",objective:"Verify chromatogram and result data persist after navigation.",input:"Run Sequence and navigate away and back",criteria:"Stored chromatogram data remains available after navigation.",evaluate:()=>Object.keys(getChromatograms()).length>0},
    {id:"PQ-001",phase:"PQ",title:"Complete HPLC-UV workflow",objective:"Verify the routine workflow from sequence to result.",input:"Sequence → Run Sequence → Chromatogram → Data Review",criteria:"A completed sequence produces stored chromatogram data and analytical results.",evaluate:()=>state.sequence.some(x=>x.status==="Completed")&&Object.keys(getChromatograms()).length>0},
    {id:"PQ-002",phase:"PQ",title:"Analytical result verification",objective:"Verify peak results are available from stored chromatogram data.",input:"Stored chromatogram with analytical peaks",criteria:"Peak results are displayed from the same stored chromatogram dataset.",evaluate:()=>Object.values(getChromatograms()).some(x=>Array.isArray(x.peaks)&&x.peaks.length>0)},
    {id:"PQ-003",phase:"PQ",title:"Data review workflow",objective:"Verify analytical results can be reviewed and QA information is recorded.",input:"Data Review record",criteria:"Review status and QA review information are recorded without altering original QC data.",evaluate:()=>Boolean(state.dataReview)},
    {id:"PQ-004",phase:"PQ",title:"Validation report generation",objective:"Verify the validation report retrieves current validation status.",input:"CSV Validation Center results",criteria:"Validation Report reflects current IQ/OQ/PQ status and approval workflow.",evaluate:d=>Boolean($("reportStatus"))&&d.actual.toLowerCase().includes("report")}
  ];

  const APP_VERSION = "CSV-2026-09-12-v4";
  if(localStorage.getItem("hplc_app_version")!==APP_VERSION){
    localStorage.removeItem("hplc_validation");
    localStorage.removeItem("hplc_validation_reviews");
    localStorage.removeItem("hplc_validation_history");
    localStorage.removeItem("hplc_urs");
    localStorage.removeItem("hplc_report");
    localStorage.removeItem("hplc_data_review");
    localStorage.setItem("hplc_app_version",APP_VERSION);
  }

  const state = {
    user: null,
    sequence: JSON.parse(localStorage.getItem("hplc_sequence") || "[]"),
    methods: JSON.parse(localStorage.getItem("hplc_methods") || "[]"),
    validation: Object.fromEntries(Object.entries(JSON.parse(localStorage.getItem("hplc_validation") || "{}")).filter(([id,v])=>VALIDATION_CASES.some(t=>t.id===id) && v && v.executedAt)),
    validationReviews: JSON.parse(localStorage.getItem("hplc_validation_reviews") || "{}"),
    validationHistory: JSON.parse(localStorage.getItem("hplc_validation_history") || "{}"),
    customValidationCases: JSON.parse(localStorage.getItem("hplc_custom_validation_cases") || "[]"),
    validationOverrides: JSON.parse(localStorage.getItem("hplc_validation_overrides") || "{}"),
    deletedValidationCases: JSON.parse(localStorage.getItem("hplc_deleted_validation_cases") || "[]"),
    urs: JSON.parse(localStorage.getItem("hplc_urs") || "{}"),
    customURS: JSON.parse(localStorage.getItem("hplc_custom_urs") || "[]"),
    ursOverrides: JSON.parse(localStorage.getItem("hplc_urs_overrides") || "{}"),
    deletedURS: JSON.parse(localStorage.getItem("hplc_deleted_urs") || "[]"),
    dataReview: JSON.parse(localStorage.getItem("hplc_data_review") || "null"),
    report: JSON.parse(localStorage.getItem("hplc_report") || "null")
  };

  let ursSelectedId = null;
  let ursPage = 1;
  const URS_PAGE_SIZE = 10;
  let validationSelectedId = null;
  let validationPage = 1;
  const VALIDATION_PAGE_SIZE = 10;
  let auditPage = 1;
  const AUDIT_PAGE_SIZE = 10;
  let auditFilteredRows = [];
  let auditSelectedIndex = null;

  const $ = (id) => document.getElementById(id);

  function now() {
    return new Date().toLocaleString("en-GB", {dateStyle:"medium", timeStyle:"medium"});
  }

  function showToast(message) {
    const toast = $("toast");
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove("show"), 2400);
  }

  function getAudit() {
    try { return JSON.parse(localStorage.getItem("hplc_audit") || "[]"); }
    catch { return []; }
  }

  function changeReportZoom(delta){const el=$("reportZoomLabel");if(!el)return;let v=parseInt(el.textContent)||100;v=Math.max(50,Math.min(150,v+delta));el.textContent=v+"%";document.querySelector('.report-paper')?.style.setProperty('transform',`scale(${v/100})`);document.querySelector('.report-paper')?.style.setProperty('transform-origin','top center');}

  function addAudit(action, details) {
    const audit = getAudit();
    audit.unshift({
      time: now(),
      user: state.user?.username || "system",
      role: state.user?.role || "System",
      action,
      details
    });
    localStorage.setItem("hplc_audit", JSON.stringify(audit.slice(0,100)));
    renderAudit();
    updateDashboard();
  }

  function getAttachments() {
    try { return JSON.parse(localStorage.getItem("hplc_attachments") || "[]").filter(x=>x&&x.blobKey); }
    catch { return []; }
  }

  function saveAttachments(items) {
    localStorage.setItem("hplc_attachments", JSON.stringify(items));
  }


  // Reusable file subsystem: metadata in localStorage, binary content in IndexedDB.
  const FILE_DB_NAME="hplc_csv_file_store", FILE_DB_VERSION=1, FILE_STORE="files", MAX_FILE_SIZE=10*1024*1024;
  const ALLOWED_EXTENSIONS=["pdf","csv","xlsx","xls","docx","doc","png","jpg","jpeg"];
  let fileDbPromise=null;
  function openFileDb(){
    if(fileDbPromise)return fileDbPromise;
    fileDbPromise=new Promise((resolve,reject)=>{const req=indexedDB.open(FILE_DB_NAME,FILE_DB_VERSION);req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(FILE_STORE))req.result.createObjectStore(FILE_STORE,{keyPath:"id"});};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
    return fileDbPromise;
  }
  async function storeFileBlob(id,file){const db=await openFileDb();return new Promise((resolve,reject)=>{const tx=db.transaction(FILE_STORE,"readwrite");tx.objectStore(FILE_STORE).put({id,blob:file});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}
  async function readFileBlob(id){const db=await openFileDb();return new Promise((resolve,reject)=>{const tx=db.transaction(FILE_STORE,"readonly"),req=tx.objectStore(FILE_STORE).get(id);req.onsuccess=()=>resolve(req.result?.blob||null);req.onerror=()=>reject(req.error);});}
  async function removeFileBlob(id){if(!id)return;const db=await openFileDb();return new Promise((resolve,reject)=>{const tx=db.transaction(FILE_STORE,"readwrite");tx.objectStore(FILE_STORE).delete(id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}
  function fileExtension(name){return String(name||"").split(".").pop().toLowerCase();}
  function fileTypeLabel(file){const ext=fileExtension(file?.name);return ext?ext.toUpperCase():((file?.type||"FILE").split("/").pop()||"FILE").toUpperCase();}
  function formatFileSize(bytes){const n=Number(bytes)||0;if(n<1024)return `${n} B`;if(n<1048576)return `${Math.round(n/1024)} KB`;return `${(n/1048576).toFixed(2)} MB`;}
  function fileIconName(file){const ext=fileExtension(file?.name);if(ext==="pdf")return"file-text";if(["csv","xls","xlsx"].includes(ext))return"table-2";if(["png","jpg","jpeg"].includes(ext))return"image";if(["doc","docx"].includes(ext))return"file-text";return"file";}
  function validateSelectedFile(file){const ext=fileExtension(file.name);if(!ALLOWED_EXTENSIONS.includes(ext))return`Unsupported file type: .${ext||"unknown"}`;if(file.size>MAX_FILE_SIZE)return`${file.name} exceeds the 10 MB limit.`;return"";}
  function getAttachmentMeta(id){return getAttachments().find(x=>x.id===id);}
  function canDeleteAttachment(meta){if(currentIsAdmin())return true;if(!isQC())return false;return String(meta?.role||"").toUpperCase()==="QC";}
  async function attachFiles(files,{activity="Other",recordType="general",recordId="",status="Uploaded"}={}){
    if(!(isQC()||currentIsAdmin())){showToast("Only QC or Admin can upload files.");return[];}
    const list=Array.from(files||[]),items=getAttachments(),created=[];if(!list.length)return[];
    for(const file of list){const error=validateSelectedFile(file);if(error){showToast(error);continue;}const id=`ATT-${Date.now()}-${Math.random().toString(36).slice(2,9)}`;await storeFileBlob(id,file);const meta={id,name:file.name,type:file.type||fileTypeLabel(file),extension:fileExtension(file.name),size:file.size,activity,recordType,recordId,status,user:actorLabel(),role:state.user?.role||"System",time:now(),blobKey:id};items.unshift(meta);created.push(meta);addAudit("File uploaded",`${actorLabel()} | ${file.name} uploaded`,{module:activity,actionType:"Created",recordId:recordId||activity,newValue:file.name});addAudit("File attached",`${actorLabel()} | ${file.name} attached to ${recordId||activity}`,{module:activity,actionType:"Created",recordId:recordId||activity,newValue:file.name});}
    saveAttachments(items);return created;
  }
  async function openStoredAttachment(id,mode="view"){
    const meta=getAttachmentMeta(id);if(!meta?.blobKey){showToast("Stored file data is unavailable.");return;}try{const blob=await readFileBlob(meta.blobKey);if(!blob){showToast("Stored file data is unavailable.");return;}const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;if(mode==="download"){a.download=meta.name;document.body.appendChild(a);a.click();a.remove();}else{const w=window.open(url,"_blank");if(!w){a.download=meta.name;document.body.appendChild(a);a.click();a.remove();}}setTimeout(()=>URL.revokeObjectURL(url),30000);addAudit("File downloaded",`${actorLabel()} | ${meta.name} viewed/downloaded`,{module:meta.activity,actionType:"Downloaded",recordId:meta.recordId||meta.activity,newValue:meta.name});}catch{showToast("Unable to open the stored file.");}}
  async function deleteAttachmentById(id){const meta=getAttachmentMeta(id);if(!meta)return;if(!canDeleteAttachment(meta)){showToast("You do not have permission to delete this file.");return;}
    showModal(`<div class="delete-modal-icon"><i data-lucide="triangle-alert"></i></div><h3>Delete File?</h3><p class="muted center">Are you sure you want to delete <b>${escapeHtml(meta.name)}</b>?</p><p class="muted center">This action cannot be undone.</p><div class="modal-actions"><button class="secondary close-modal">Cancel</button><button class="danger-button" id="confirmDeleteAttachment"><i data-lucide="trash-2"></i> Delete</button></div>`);
    $("confirmDeleteAttachment")?.addEventListener("click",async()=>{await removeFileBlob(meta.blobKey);saveAttachments(getAttachments().filter(x=>x.id!==id));addAudit("File deleted",`${actorLabel()} | ${meta.name} removed from ${meta.recordId||meta.activity}`,{module:meta.activity,actionType:"Deleted",recordId:meta.recordId||meta.activity,previousValue:meta.name,newValue:"Deleted"});closeModal();renderAttachments();renderMethodAttachments();renderReportAttachmentList();renderSequenceAttachments();renderAssayAttachments();showToast("File deleted successfully.");});refreshIcons();
  }
  function renameAttachmentById(id){const meta=getAttachmentMeta(id);if(!meta)return;if(!canDeleteAttachment(meta)){showToast("You do not have permission to rename this file.");return;}const ext=fileExtension(meta.name);const base=meta.name.replace(/\.[^.]+$/,'');showModal(`<h3>Rename File</h3><p class="muted">Rename the controlled evidence file. The file type extension will be preserved.</p><label>File Name <span class="required">*</span></label><input id="renameAttachmentInput" value="${escapeHtml(base)}"><div id="renameAttachmentError" class="error-message"></div><div class="modal-actions"><button class="secondary close-modal">Cancel</button><button class="primary" id="saveAttachmentRename">Save Changes</button></div>`);$("saveAttachmentRename")?.addEventListener("click",()=>{const next=$("renameAttachmentInput").value.trim();if(!next){$("renameAttachmentError").textContent="File name is required.";return;}const safe=next.replace(/[\\/:*?"<>|]/g,'-');const finalName=`${safe}.${ext}`;const items=getAttachments();const target=items.find(x=>x.id===id);if(!target)return;const previous=target.name;target.name=finalName;saveAttachments(items);addAudit("File renamed",`${actorLabel()} | ${previous} renamed to ${finalName}`,{module:target.activity,actionType:"Updated",recordId:target.recordId||target.activity,previousValue:previous,newValue:finalName});closeModal();renderAttachments();renderMethodAttachments();renderReportAttachmentList();renderSequenceAttachments();renderAssayAttachments();showToast("File renamed successfully.");});}

  function pendingRows(files){return Array.from(files||[]).map((f,i)=>`<div class="pending-file-row"><span class="file-type-icon"><i data-lucide="${fileIconName(f)}"></i></span><div><b>${escapeHtml(f.name)}</b><small>${escapeHtml(fileTypeLabel(f))} · ${formatFileSize(f.size)}</small></div><span class="file-pending-status">Selected</span><button class="icon-button pending-remove" type="button" data-pending-index="${i}" aria-label="Remove selected file"><i data-lucide="x"></i></button></div>`).join("");}
  function refreshIcons(){if(window.lucide?.createIcons)window.lucide.createIcons({attrs:{"stroke-width":1.8}});}
  function applySidebarIcons(){const icons={dashboard:"layout-dashboard",method:"flask-conical",sequence:"list-checks",instrument:"microscope",chromatogram:"chart-line","data-review":"clipboard-check",urs:"file-check",validation:"badge-check",report:"file-text",attachments:"paperclip",audit:"history",admin:"settings"};document.querySelectorAll(".nav-item[data-section]").forEach(b=>{if(!b.querySelector("svg")&&!b.querySelector("i")){const i=document.createElement("i");i.setAttribute("data-lucide",icons[b.dataset.section]||"circle");b.prepend(i);}});const out=$("logoutBtn");if(out&&!out.querySelector("svg")&&!out.querySelector("i")){const i=document.createElement("i");i.setAttribute("data-lucide","log-out");out.prepend(i);}refreshIcons();}

  function getCurrentUser() {
    return state.user;
  }

  function isValidWavelength(value) {
    const n = Number(value);
    return Number.isFinite(n) && n >= 190 && n <= 600;
  }

  function renderDashboardActivity() {
    const audit = getAudit();
    const el = $("recentActivity");
    if (el) {
      if (!audit.length) el.innerHTML = '<div class="activity-item">No activity recorded yet.</div>';
      else el.innerHTML = audit.slice(0,5).map(a =>
        `<div class="activity-item"><b>${escapeHtml(a.action)}</b><br>${escapeHtml(a.details)}<br><span class="muted">${escapeHtml(a.time)}</span></div>`
      ).join("");
    }
    const body = $("dashboardRecentBody");
    if (!body) return;
    if (!audit.length) {
      body.innerHTML = '<tr><td colspan="4" class="dashboard-empty">No activity recorded yet.</td></tr>';
      return;
    }
    body.innerHTML = audit.slice(0,5).map(a => `<tr><td>${escapeHtml(a.time)}</td><td>${escapeHtml(String(a.user||"system").toUpperCase())}</td><td>${escapeHtml(a.action)}</td><td>${escapeHtml(a.details)}</td></tr>`).join("");
  }

  function renderDashboardCharts(cases) {
    const total = cases.length || 1;
    const vals = cases.map(t => state.validation[t.id]).filter(Boolean);
    const executed = vals.filter(x => x?.executedAt).length;
    const pendingExecution = total - executed;
    const pendingReview = vals.filter(x => x?.reviewStatus === "Pending QA Review").length;
    const approved = vals.filter(x => x?.reviewStatus === "Approved").length;
    const failed = vals.filter(x => x?.testResult === "FAIL").length;
    const pct = n => Math.round((n/total)*100);

    $("dashTotalTests").textContent = cases.length;
    $("dashPendingExecution").textContent = pendingExecution;
    $("dashPendingReview").textContent = pendingReview;
    $("dashApproved").textContent = approved;
    $("dashFailed").textContent = failed;
    $("dashOverallProgress").textContent = `${pct(executed)}%`;
    $("dashProgressBar").style.width = `${pct(executed)}%`;
    $("donutTotal").textContent = cases.length;
    $("donutPending").textContent = `${pendingExecution} (${pct(pendingExecution)}%)`;
    $("donutReview").textContent = `${pendingReview} (${pct(pendingReview)}%)`;
    $("donutApproved").textContent = `${approved} (${pct(approved)}%)`;
    $("donutFailed").textContent = `${failed} (${pct(failed)}%)`;

    const phases = ["IQ","OQ","PQ"];
    phases.forEach((phase, i) => {
      const phaseCases = cases.filter(t=>t.phase===phase);
      const phaseExecuted = phaseCases.filter(t=>state.validation[t.id]?.executedAt).length;
      const remaining = phaseCases.length-phaseExecuted;
      const col = document.querySelectorAll("#validationBarChart .bar-col")[i];
      if (!col) return;
      const stack=col.querySelector(".bar-stack"), done=col.querySelector("i"), rem=col.querySelector("b");
      const donePct=phaseCases.length?phaseExecuted/phaseCases.length*100:0;
      const remPct=phaseCases.length?remaining/phaseCases.length*100:0;
      done.style.height=`${donePct}%`; rem.style.height=`${remPct}%`;
    });

    const segments = [
      [pendingExecution, "#e7edf7"],
      [pendingReview, "#4f78c9"],
      [approved, "#39a96b"],
      [failed, "#c62828"]
    ];
    let cursor=0;
    const parts=[];
    segments.forEach(([n,c])=>{ if(!n)return; const start=cursor; cursor+=n/total*360; parts.push(`${c} ${start}deg ${cursor}deg`); });
    $("statusDonut").style.background = parts.length ? `conic-gradient(${parts.join(",")})` : "conic-gradient(#e7edf7 0 360deg)";
  }

  function renderDashboardTasks(cases) {
    const body=$("dashboardTasksBody");
    if(!body) return;
    const tasks=[];
    cases.filter(t=>!state.validation[t.id]?.executedAt).slice(0,5).forEach((t,idx)=>tasks.push({task:`Execute ${t.id}`,module:"CSV Validation Center",priority:idx<2?"High":"Medium",due:"15 Sep 2026"}));
    if (tasks.length===0 && isQA()) {
      cases.filter(t=>state.validation[t.id]?.reviewStatus==="Pending QA Review").slice(0,5).forEach(t=>tasks.push({task:`Review ${t.id}`,module:"CSV Validation Center",priority:"High",due:"15 Sep 2026"}));
    }
    if(!tasks.length) tasks.push({task:"No pending task",module:"—",priority:"Low",due:"—"});
    body.innerHTML=tasks.map(t=>`<tr><td><span class="task-mark"><i data-lucide="file-check-2"></i></span>${escapeHtml(t.task)}</td><td>${escapeHtml(t.module)}</td><td><span class="priority ${t.priority.toLowerCase()}">${escapeHtml(t.priority)}</span></td><td>${escapeHtml(t.due)}</td></tr>`).join("");
  }

  function updateDashboard() {
    const cases = typeof getValidationCases === "function" ? getValidationCases() : VALIDATION_CASES;
    const total = cases.length || 0;
    const executed = cases.filter(t=>state.validation[t.id]?.executedAt).length;
    const progress = total ? Math.round(executed/total*100) : 0;
    const audit = getAudit();
    if ($("auditCount")) $("auditCount").textContent = audit.length;
    if ($("attachmentCount")) $("attachmentCount").textContent = getAttachments().length;
    if ($("validationProgress")) $("validationProgress").textContent = `${progress}%`;
    renderDashboardActivity();
    if ($("dashTotalTests")) renderDashboardCharts(cases);
    if ($("dashboardTasksBody")) renderDashboardTasks(cases);
    if ($("dashboardUserName")) $("dashboardUserName").textContent = fullRole();
    if ($("dashboardWelcome")) {
      const roleName = state.user?.role === "QA" ? "QA" : state.user?.role === "Admin" ? "Admin" : state.user?.role === "QC" ? "QC" : "User";
      $("dashboardWelcome").textContent = `Welcome back, ${roleName}. Here’s an overview of the HPLC-UV CSV validation status.`;
    }
    const nextPending = cases.find(t=>!state.validation[t.id]?.executedAt);
    if ($("dashboardNextAction")) {
      $("dashboardNextAction").textContent = nextPending ? `You have ${cases.filter(t=>!state.validation[t.id]?.executedAt).length} validation test(s) pending execution.` : "All validation tests have been executed.";
      $("dashboardNextDetail").textContent = nextPending ? `Start with ${nextPending.id} to begin the validation process.` : "Continue with QA review and validation report activities.";
    }
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function showSection(id) {
    document.querySelectorAll(".page-section").forEach(section => section.classList.add("hidden"));
    const target = $(id);
    if (target) target.classList.remove("hidden");

    document.querySelectorAll(".nav-item").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.section === id);
    });

    const title = document.querySelector(`[data-section="${id}"]`);
    const pageTitles={dashboard:"Dashboard",method:"Analytical Method",sequence:"Sequence",instrument:"Instrument",chromatogram:"Chromatogram","data-review":"Assay / Data Review",urs:"URS",validation:"CSV Validation",report:"Validation Report",attachments:"Attachments",audit:"Audit Trail",admin:"Administration"};
    $("pageTitle").textContent = pageTitles[id] || (title ? title.textContent : "Dashboard");
    document.body.classList.toggle("dashboard-only", id === "dashboard");
    applySidebarIcons();refreshIcons();window.scrollTo({top:0, behavior:"smooth"});
    if (id === "audit") renderAudit();
    if (id === "attachments") renderAttachments();
    if (id === "validation") renderValidation();
    if (id === "report") renderReport();
    if (id === "sequence") renderSequence();
    if (id === "method") { renderMethodLibrary(); setMethodEditMode(isQC() || isAdmin()); renderMethodSuitability(); }
    if (id === "urs") renderURS();
    if (id === "chromatogram") renderChromatogram();
    if (id === "data-review") renderDataReview();
    if (id === "dashboard") updateDashboard();
  }

  function performLogin(username, password) {
    const account = USERS[username];
    if (!account || account.password !== password) {
      $("loginMessage").textContent = "Username atau password salah.";
      return false;
    }

    state.user = {username, role:account.role};
    sessionStorage.setItem("hplc_user", JSON.stringify(state.user));
    $("loginScreen").classList.add("hidden");
    $("appScreen").classList.remove("hidden");
    $("userBadge").innerHTML = `<b>${escapeHtml(fullRole())}</b><br><span>${escapeHtml(displayUsername(username))}</span>`;
    $("loginMessage").textContent = "";
    addAudit("Login", "User successfully signed in");
    showSection("dashboard");
    showToast(`Welcome, ${username}`);
    return true;
  }

  function performLogout() {
    if (state.user) addAudit("Logout", "User signed out");
    state.user = null;
    sessionStorage.removeItem("hplc_user");
    $("appScreen").classList.add("hidden");
    $("loginScreen").classList.remove("hidden");
    $("passwordInput").value = "";
    $("loginMessage").textContent = "";
  }

  function renderSequence(){
    $("sequenceBody").innerHTML=state.sequence.length?state.sequence.map((s,i)=>{
      const methodId=s.methodId||"",methodName=s.method||"";
      const options=methodOptions(methodId,methodName);
      return `<tr><td>${i+1}</td><td>${escapeHtml(s.sample)}</td><td>${escapeHtml(s.type)}</td><td>${escapeHtml(s.vial)}</td><td><select class="sequence-inline-input" data-seq-field="method" data-seq-index="${i}">${options}</select></td><td><input class="sequence-inline-input" data-seq-field="volume" data-seq-index="${i}" type="number" min="0.1" step="0.1" value="${escapeHtml(String(s.volume??10))}"></td><td><span class="case-status ${s.status==="Completed"?"pass":""}">${escapeHtml(s.status||"Ready")}</span></td><td><button type="button" class="secondary sequence-save" data-seq-index="${i}">Save</button> <button type="button" class="secondary sequence-delete" data-seq-index="${i}">Delete</button></td></tr>`;
    }).join(""):'<tr><td colspan="8" class="muted">No injections added. Click Add Injection to build the sequence.</td></tr>';
    document.querySelectorAll(".sequence-save").forEach(b=>b.addEventListener("click",()=>saveSequenceRow(Number(b.dataset.seqIndex))));
    document.querySelectorAll(".sequence-delete").forEach(b=>b.addEventListener("click",()=>deleteSequenceRow(Number(b.dataset.seqIndex))));
  }

  function auditModule(a){
    if(a.module)return a.module;
    const action=String(a.action||"").toLowerCase(),details=String(a.details||"").toLowerCase();
    if(action==="login"||action==="logout"||action.includes("authentication"))return "Authentication";
    if(action.includes("method")||action.includes("gradient"))return "Analytical Method";
    if(action.includes("sequence"))return "Sequence";
    if(action.includes("detector")||action.includes("instrument")||action.includes("pump")||action.includes("oven"))return "Instrument";
    if(action.includes("chromatogram"))return "Chromatogram";
    if(action.includes("assay")||action.includes("data review")||action.includes("calculation"))return "Assay / Data Review";
    if(action.includes("urs"))return "URS";
    if(action.includes("validation test")||action.includes("validation"))return "CSV Validation";
    if(action.includes("report"))return "Validation Report";
    if(action.includes("attachment"))return "Attachments";
    if(action.includes("audit"))return "Audit Trail";
    if(action.includes("user")||action.includes("admin"))return "Administration";
    if(details.includes("urs-"))return "URS";
    if(details.includes("iq-")||details.includes("oq-")||details.includes("pq-"))return "CSV Validation";
    return "System";
  }

  function auditActionType(a){
    if(a.actionType)return a.actionType;
    const action=String(a.action||"").toLowerCase();
    if(action==="login")return "Login";
    if(action==="logout")return "Logout";
    if(action.includes("approved")||action.includes("approve"))return "Approved";
    if(action.includes("reject")||action.includes("revision"))return "Rejected";
    if(action.includes("submit"))return "Submitted";
    if(action.includes("delete"))return "Deleted";
    if(action.includes("create")||action.includes("add"))return "Created";
    if(action.includes("modify")||action.includes("update")||action.includes("edit")||action.includes("change"))return "Modified";
    if(action.includes("comment")||action.includes("review"))return "Commented";
    if(action.includes("download")||action.includes("export")||action.includes("print"))return "Downloaded";
    if(action.includes("execute")||action.includes("run")||action.includes("test"))return "Executed";
    if(action.includes("signature")||action.includes("sign"))return "Signed";
    return "Activity";
  }

  function auditRecordId(a){
    if(a.recordId)return a.recordId;
    if(a.testId)return a.testId;
    const text=`${a.action||""} ${a.details||""}`;
    const match=text.match(/\b(?:URS|IQ|OQ|PQ|VR|AM|SQ|CH|ATT|AR)-\d{3}\b/i);
    return match?match[0].toUpperCase():"—";
  }

  function auditUserLabel(a){return a.user?String(a.user).toUpperCase():"SYSTEM";}
  function auditBadgeClass(type){return String(type||"").toLowerCase().replace(/[^a-z]+/g,"-");}

  function auditDateValue(time){
    const d=new Date(time);
    if(!Number.isNaN(d.getTime()))return d;
    const parsed=Date.parse(String(time||""));
    return Number.isNaN(parsed)?null:new Date(parsed);
  }

  function populateAuditUsers(){
    const select=$("auditUserFilter");if(!select)return;
    const current=select.value;
    const users=[...new Set(getAudit().map(a=>String(a.user||"").toUpperCase()).filter(Boolean))].sort();
    select.innerHTML='<option value="">All Users</option>'+users.map(u=>`<option value="${escapeHtml(u)}">${escapeHtml(u)}</option>`).join("");
    if(users.includes(current))select.value=current;
  }

  function getFilteredAuditRows(){
    const all=getAudit();
    const user=($("auditUserFilter")?.value||"").toUpperCase();
    const role=$("auditRoleFilter")?.value||"",module=$("auditModuleFilter")?.value||"",action=$("auditActionFilter")?.value||"";
    const record=($("auditRecordSearch")?.value||"").trim().toLowerCase();
    const from=$("auditDateFrom")?.value?new Date(`${$("auditDateFrom").value}T00:00:00`):null;
    const to=$("auditDateTo")?.value?new Date(`${$("auditDateTo").value}T23:59:59`):null;
    return all.map((a,originalIndex)=>({...a,originalIndex})).filter(a=>{
      const d=a.time?auditDateValue(a.time):null;
      return (!user||auditUserLabel(a)===user)&&(!role||String(a.role||"")===role)&&(!module||auditModule(a)===module)&&
        (!action||auditActionType(a)===action)&&(!record||`${auditRecordId(a)} ${a.details||""}`.toLowerCase().includes(record))&&
        (!from||!d||d>=from)&&(!to||!d||d<=to);
    });
  }

  function renderAudit(){
    populateAuditUsers();
    auditFilteredRows=getFilteredAuditRows();
    const totalPages=Math.max(1,Math.ceil(auditFilteredRows.length/AUDIT_PAGE_SIZE));
    auditPage=Math.min(Math.max(auditPage,1),totalPages);
    const start=(auditPage-1)*AUDIT_PAGE_SIZE,rows=auditFilteredRows.slice(start,start+AUDIT_PAGE_SIZE),body=$("auditBody");

    if(body){
      body.innerHTML=rows.length?rows.map((a,i)=>{
        const type=auditActionType(a),module=auditModule(a),recordId=auditRecordId(a),idx=start+i;
        return `<tr class="audit-row" data-audit-index="${idx}">
          <td>${idx+1}</td><td>${escapeHtml(a.time||"—")}</td><td><b>${escapeHtml(auditUserLabel(a))}</b></td>
          <td>${escapeHtml(a.role||"System")}</td><td>${escapeHtml(module)}</td>
          <td><span class="audit-action-badge ${auditBadgeClass(type)}">${escapeHtml(type)}</span></td>
          <td><b>${escapeHtml(recordId)}</b></td><td>${escapeHtml(a.details||"—")}</td>
          <td><button class="audit-open-btn" type="button" data-audit-index="${idx}" aria-label="View audit details"><i data-lucide="chevron-right"></i></button></td>
        </tr>`;
      }).join(""):'<tr><td colspan="9"><div class="audit-no-results">No matching audit records.</div></td></tr>';

      body.querySelectorAll(".audit-row").forEach(row=>row.addEventListener("click",()=>openAuditDetails(Number(row.dataset.auditIndex))));
      body.querySelectorAll(".audit-open-btn").forEach(btn=>btn.addEventListener("click",e=>{e.stopPropagation();openAuditDetails(Number(btn.dataset.auditIndex));}));
    }

    const first=auditFilteredRows.length?start+1:0,last=Math.min(start+AUDIT_PAGE_SIZE,auditFilteredRows.length);
    if($("auditSearchCount"))$("auditSearchCount").textContent=`Showing ${first}–${last} of ${auditFilteredRows.length} records`;
    if($("auditShowingText"))$("auditShowingText").textContent=`Showing ${first}–${last} of ${auditFilteredRows.length} records`;
    if($("auditPageNumber"))$("auditPageNumber").textContent=String(auditPage);
    if($("auditPrevBtn"))$("auditPrevBtn").disabled=auditPage<=1;
    if($("auditNextBtn"))$("auditNextBtn").disabled=auditPage>=totalPages;
  }

  function openAuditDetails(index){
    const record=auditFilteredRows[index];if(!record)return;
    auditSelectedIndex=index;
    const panel=$("auditDetailsPanel"),content=$("auditDetailsContent");if(!panel||!content)return;
    const type=auditActionType(record),module=auditModule(record),recordId=auditRecordId(record);
    const signature=record.signature||record.electronicSignature;
    content.innerHTML=`
      <div class="audit-detail-status ${auditBadgeClass(type)}">${escapeHtml(type)}</div>
      <div class="audit-detail-grid">
        <div><span>Date &amp; Time</span><b>${escapeHtml(record.time||"—")}</b></div>
        <div><span>User</span><b>${escapeHtml(auditUserLabel(record))}</b></div>
        <div><span>Role</span><b>${escapeHtml(record.role||"System")}</b></div>
        <div><span>Module</span><b>${escapeHtml(module)}</b></div>
        <div><span>Action</span><b>${escapeHtml(record.action||"—")}</b></div>
        <div><span>Record ID</span><b>${escapeHtml(recordId)}</b></div>
      </div>
      <div class="audit-detail-section"><h4>Details</h4><div class="audit-value-box">${escapeHtml(record.details||"—")}</div></div>
      ${record.previousValue!==undefined?`<div class="audit-detail-section"><h4>Previous Value</h4><div class="audit-value-box previous">${escapeHtml(formatAuditValue(record.previousValue))}</div></div>`:""}
      ${record.newValue!==undefined?`<div class="audit-detail-section"><h4>New Value</h4><div class="audit-value-box new">${escapeHtml(formatAuditValue(record.newValue))}</div></div>`:""}
      ${signature?`<div class="audit-detail-section"><h4>Electronic Signature</h4><div class="audit-signature-box"><span class="audit-signature-mark"><i data-lucide="check"></i></span><b>${escapeHtml(String(signature))}</b></div></div>`:""}
    `;
    panel.classList.add("is-open");
    document.querySelectorAll(".audit-row").forEach(r=>r.classList.remove("selected"));
    document.querySelector(`.audit-row[data-audit-index="${index}"]`)?.classList.add("selected");
  }

  function formatAuditValue(value){
    if(value===null||value===undefined||value==="")return "—";
    if(typeof value==="object"){try{return JSON.stringify(value,null,2);}catch{return String(value);}}
    return String(value);
  }

  function resetAuditFilters(){
    const d=new Date();
    if($("auditDateFrom"))$("auditDateFrom").value=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-01`;
    if($("auditDateTo"))$("auditDateTo").value=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
    if($("auditUserFilter"))$("auditUserFilter").value="";
    if($("auditRoleFilter"))$("auditRoleFilter").value="";
    if($("auditModuleFilter"))$("auditModuleFilter").value="";
    if($("auditActionFilter"))$("auditActionFilter").value="";
    if($("auditRecordSearch"))$("auditRecordSearch").value="";
    auditPage=1;auditSelectedIndex=null;renderAudit();$("auditDetailsPanel")?.classList.remove("is-open");
  }

  function exportAuditTrail(){
    const rows=auditFilteredRows;
    const csvRows=[["No.","Date & Time","User","Role","Module","Action Type","Record ID","Details","Previous Value","New Value"],
      ...rows.map((a,i)=>[i+1,a.time||"",auditUserLabel(a),a.role||"",auditModule(a),auditActionType(a),auditRecordId(a),a.details||"",formatAuditValue(a.previousValue),formatAuditValue(a.newValue)])];
    const csv=csvRows.map(row=>row.map(csvCell).join(",")).join("\\n");
    downloadText("HPLC-UV_Audit_Trail.csv",csv);
    addAudit("Audit trail exported",`Exported ${rows.length} audit record(s)`,{module:"Audit Trail",actionType:"Downloaded"});
    showToast("Audit Trail exported.");
  }

  function renderValidationLegacyRemoved() { /* validation workflow is implemented below */ }

  function renderReport() {
    const phases = ["IQ","OQ","PQ"];
    phases.forEach(phase => {
      const tests = VALIDATION_CASES.filter(c=>c.phase===phase);
      const results = tests.map(c=>state.validation[c.id]);
      const complete = results.length && results.every(Boolean);
      const pass = complete && results.every(r=>r.pass);
      $(phase.toLowerCase()+"Status").textContent = pass ? "PASS" : (complete ? "FAIL" : "PENDING");
    });
    const allComplete = VALIDATION_CASES.every(c=>state.validation[c.id]);
    const allPass = allComplete && VALIDATION_CASES.every(c=>state.validation[c.id].pass);
    $("reportStatus").textContent = allPass ? "VALIDATED" : "DRAFT";
    const signature = JSON.parse(localStorage.getItem("hplc_signature") || "null");
    $("signatureResult").innerHTML = signature
      ? `<div class="pass-box"><b>Signed</b><br>${escapeHtml(signature.user)} · ${escapeHtml(signature.role)} · ${escapeHtml(signature.time)}</div>`
      : "";
  }

  function createChromatogram() {
    const points = [];
    for (let x=0;x<=900;x+=5) {
      let y = 260;
      y -= 155*Math.exp(-Math.pow((x-420)/42,2));
      y -= 20*Math.exp(-Math.pow((x-525)/28,2));
      y -= 8*Math.sin(x/28);
      points.push(`${x},${Math.max(10,y).toFixed(1)}`);
    }
    $("chromLine").setAttribute("points", points.join(" "));
  }

  
const DEFAULT_ADMIN_USERS=[
{username:"qa-001",fullName:"Alya Putri",email:"alya@company.com",role:"QA",status:"Active",lastLogin:"12 Sep 2026, 14:23"},
{username:"qc-001",fullName:"Bima Santoso",email:"bima@company.com",role:"QC",status:"Active",lastLogin:"12 Sep 2026, 10:15"},
{username:"qc-002",fullName:"Citra Dewi",email:"citra@company.com",role:"QC",status:"Active",lastLogin:"11 Sep 2026, 16:40"},
{username:"admin-001",fullName:"Dimas Pratama",email:"dimas@company.com",role:"Admin",status:"Active",lastLogin:"12 Sep 2026, 09:12"},
{username:"qa-002",fullName:"Fahira Ananda",email:"fahira@company.com",role:"QA",status:"Inactive",lastLogin:"5 Sep 2026, 11:02"},
{username:"qc-003",fullName:"Gilang Ramadhan",email:"gilang@company.com",role:"QC",status:"Active",lastLogin:"3 Sep 2026, 15:45"},
{username:"admin-002",fullName:"Hana Lestari",email:"hana@company.com",role:"Admin",status:"Active",lastLogin:"2 Sep 2026, 13:20"},
{username:"qa-003",fullName:"Ivan Kurniawan",email:"ivan@company.com",role:"QA",status:"Active",lastLogin:"1 Sep 2026, 09:10"},
{username:"qc-004",fullName:"Jasmine Putri",email:"jasmine@company.com",role:"QC",status:"Active",lastLogin:"31 Aug 2026, 14:37"},
{username:"admin-003",fullName:"Kevin Wijaya",email:"kevin@company.com",role:"Admin",status:"Active",lastLogin:"29 Aug 2026, 11:25"}];
let adminUsers=JSON.parse(localStorage.getItem("hplc_admin_users")||"null")||DEFAULT_ADMIN_USERS,adminUserPage=1,adminEditingUsername=null;
const ADMIN_USER_PAGE_SIZE=10;
function currentIsAdmin(){return String(state.user?.role||"").toLowerCase()==="admin";}
function renderAdmin(){
const canEdit=currentIsAdmin();
document.querySelectorAll(".admin-write-control").forEach(el=>{el.disabled=!canEdit;el.classList.toggle("is-readonly",!canEdit);});
const q=($("adminUserSearch")?.value||"").toLowerCase(),role=$("adminRoleFilter")?.value||"",status=$("adminStatusFilter")?.value||"";
const filtered=adminUsers.filter(u=>(!q||`${u.username} ${u.fullName} ${u.email} ${u.role}`.toLowerCase().includes(q))&&(!role||u.role===role)&&(!status||u.status===status));
const pages=Math.max(1,Math.ceil(filtered.length/ADMIN_USER_PAGE_SIZE));adminUserPage=Math.min(Math.max(1,adminUserPage),pages);
const start=(adminUserPage-1)*ADMIN_USER_PAGE_SIZE,rows=filtered.slice(start,start+ADMIN_USER_PAGE_SIZE);
const body=$("adminUsersBody");
if(body)body.innerHTML=rows.map((u,i)=>`<tr><td><input type="checkbox" disabled></td><td>${start+i+1}</td><td><b>${escapeHtml(u.username)}</b></td><td>${escapeHtml(u.fullName)}</td><td>${escapeHtml(u.email)}</td><td><span class="admin-role-badge ${u.role.toLowerCase()}">${escapeHtml(u.role==="Admin"?"Administrator":u.role==="QA"?"Quality Assurance":"Quality Control")}</span></td><td><span class="admin-status-badge ${u.status.toLowerCase()}">${escapeHtml(u.status)}</span></td><td>${escapeHtml(u.lastLogin||"—")}</td><td><button class="admin-edit-btn admin-write-control" data-admin-edit="${escapeHtml(u.username)}" type="button" ${canEdit?"":"disabled"}><i data-lucide="pencil"></i></button><button class="admin-more-btn admin-write-control" type="button" ${canEdit?"":"disabled"}><i data-lucide="more-vertical"></i></button></td></tr>`).join("");
body?.querySelectorAll("[data-admin-edit]").forEach(b=>b.addEventListener("click",()=>openAdminEditor(b.dataset.adminEdit)));
$("adminUserCount").textContent=`Showing ${rows.length?start+1:0}–${start+rows.length} of ${filtered.length} users`;$("adminUserPage").textContent=String(adminUserPage);
$("adminPrevUsers").disabled=adminUserPage<=1;$("adminNextUsers").disabled=adminUserPage>=pages;
}
function openAdminEditor(username=null){
if(!currentIsAdmin()){showToast("Administration is view-only for QC and QA.");return;}
adminEditingUsername=username;const u=adminUsers.find(x=>x.username===username);
$("adminEditorTitle").textContent=u?"Edit User":"Add New User";$("adminEditorSubtitle").textContent=u?"Update the selected user account.":"Fill in the information below to create a new user.";
$("adminUsername").value=u?.username||"";$("adminUsername").disabled=!!u;$("adminFullName").value=u?.fullName||"";$("adminEmail").value=u?.email||"";$("adminPassword").value="";$("adminPasswordConfirm").value="";$("adminUserRole").value=u?.role||"";$("adminNotes").value=u?.notes||"";
document.querySelectorAll('input[name="adminStatus"]').forEach(r=>r.checked=r.value===(u?.status||"Active"));$("adminUserEditor").classList.add("open");
}
function closeAdminEditor(){adminEditingUsername=null;$("adminUserEditor")?.classList.remove("open");$("adminUserForm")?.reset();$("adminUsername").disabled=false;}
function saveAdminUser(e){
e.preventDefault();if(!currentIsAdmin()){showToast("Only Admin can edit users.");return;}
const username=$("adminUsername").value.trim().toLowerCase(),fullName=$("adminFullName").value.trim(),email=$("adminEmail").value.trim(),role=$("adminUserRole").value,status=document.querySelector('input[name="adminStatus"]:checked')?.value||"Active",pass=$("adminPassword").value,confirm=$("adminPasswordConfirm").value;
if(!username||!fullName||!email||!role){showToast("Please complete all required fields.");return;}
if(!adminEditingUsername&&!pass){showToast("Password is required for a new user.");return;}
if(pass&&(pass.length<8||pass!==confirm)){showToast("Password must be at least 8 characters and match confirmation.");return;}
const editing=!!adminEditingUsername;
if(editing){const u=adminUsers.find(x=>x.username===adminEditingUsername);Object.assign(u,{fullName,email,role,status,notes:$("adminNotes").value});}
else{if(adminUsers.some(x=>x.username===username)){showToast("Username already exists.");return;}adminUsers.push({username,fullName,email,role,status,lastLogin:"—",notes:$("adminNotes").value});}
localStorage.setItem("hplc_admin_users",JSON.stringify(adminUsers));addAudit(editing?"User modified":"User created",`${editing?adminEditingUsername:username} account ${editing?"updated":"created"}`,{module:"Administration",actionType:editing?"Modified":"Created",recordId:`USR-${String(adminUsers.length).padStart(3,"0")}`});closeAdminEditor();renderAdmin();showToast(editing?"User updated.":"User created.");
}
function initAdminControls(){
$("adminAddUserBtn")?.addEventListener("click",()=>openAdminEditor());$("adminCloseEditor")?.addEventListener("click",closeAdminEditor);$("adminCancelUser")?.addEventListener("click",closeAdminEditor);$("adminUserForm")?.addEventListener("submit",saveAdminUser);
["adminUserSearch","adminRoleFilter","adminStatusFilter"].forEach(id=>$(id)?.addEventListener("input",()=>{adminUserPage=1;renderAdmin();}));
$("adminPrevUsers")?.addEventListener("click",()=>{if(adminUserPage>1){adminUserPage--;renderAdmin();}});$("adminNextUsers")?.addEventListener("click",()=>{adminUserPage++;renderAdmin();});
document.querySelectorAll(".admin-tab").forEach(btn=>btn.addEventListener("click",()=>{document.querySelectorAll(".admin-tab").forEach(x=>x.classList.remove("active"));btn.classList.add("active");const map={users:"adminUsersTab",roles:"adminRolesTab",config:"adminConfigTab","audit-settings":"adminAuditSettingsTab",master:"adminMasterTab",backup:"adminBackupTab"};document.querySelectorAll(".admin-tab-panel").forEach(x=>x.classList.add("hidden"));$(map[btn.dataset.adminTab])?.classList.remove("hidden");renderAdmin();}));
$("adminBackupBtn")?.addEventListener("click",()=>{if(!currentIsAdmin())return showToast("Only Admin can create backups.");downloadText("HPLC-UV_CSV_Backup.json",JSON.stringify({audit:getAudit(),attachments:JSON.parse(localStorage.getItem("hplc_attachments")||"[]"),validation:JSON.parse(localStorage.getItem("hplc_validation")||"[]")},null,2));addAudit("Backup created","CSV system backup exported.",{module:"Administration",actionType:"Downloaded"});});
$("adminRestoreBtn")?.addEventListener("click",()=>showToast(currentIsAdmin()?"Restore workflow ready for backup file.":"Only Admin can restore backups."));renderAdmin();
}


const DEFAULT_METHOD={
id:"AM-001",product:"Paracetamol Tablet 500 mg",title:"Assay of Paracetamol Tablet",category:"Assay",
description:"HPLC method for the quantitative determination of paracetamol in tablet dosage form using UV detection.",
reference:"In-house method based on USP <621> and company method development report.",
column:"C18, 250 mm × 4.6 mm, 5 µm",columnTemp:"30",injection:"20",flow:"1.0",runTime:"15",
mobileA:"Water",mobileB:"Acetonitrile",elution:"Gradient",wavelength:"243",sampleTemp:"25",
notes:"This method is intended for routine quality control analysis. System suitability criteria must be met before sample analysis.",
version:"1.0.0",modified:"12 Sep 2026, 10:15",modifiedBy:"QC-001",
gradient:[["0","95","5"],["5","80","20"],["10","60","40"],["12","60","40"],["12.1","95","5"],["15","95","5"]],
attachments:[]
};
let methodData=JSON.parse(localStorage.getItem("hplc_method")||"null")||DEFAULT_METHOD;
let methodEditMode=false;

function initEvents() {
    $("downloadReportBtn")?.addEventListener("click", () => {
      addAudit("Validation report downloaded", "Validation report opened for PDF export");
      window.print();
    });

    $("logoutBtn")?.addEventListener("click", performLogout);

    document.querySelectorAll(".nav-item").forEach(btn => {
      btn.addEventListener("click", () => showSection(btn.dataset.section));
    });

    document.querySelectorAll("[data-go]").forEach(btn => {
      btn.addEventListener("click", () => showSection(btn.dataset.go));
    });

    $("saveMethodBtn")?.addEventListener("click", () => {
      const wavelength = $("methodWavelength").value;
      if (!isValidWavelength(wavelength)) {
        showToast("Wavelength harus 190–600 nm.");
        return;
      }
      addAudit("Method saved", `Method ${$("methodName").value} saved at ${wavelength} nm`);
      showToast("Method berhasil disimpan.");
    });

    $("addSequenceBtn")?.addEventListener("click", () => {
      const n = state.sequence.length + 1;
      state.sequence.push({sample:`SMP-${String(n).padStart(3,"0")}`,type:"Sample",vial:String(n).padStart(2,"0"),status:"Ready"});
      renderSequence();
      addAudit("Sequence updated", "New sample injection added");
    });

    $("runSequenceBtn")?.addEventListener("click", () => {
      state.sequence = state.sequence.map(s=>({...s,status:"Completed"}));
      renderSequence();
      addAudit("Sequence executed", `${state.sequence.length} injections completed`);
      showToast("Sequence completed.");
    });

    $("pumpFlow")?.addEventListener("input", () => {
      const flow = Number($("pumpFlow").value) || 0;
      $("pressureValue").textContent = `${Math.round(105 + flow*7)} bar`;
    });

    $("ovenTemp")?.addEventListener("input", () => $("ovenValue").textContent = `${$("ovenTemp").value} °C`);

    $("uvWavelength")?.addEventListener("input", () => {
      const value = $("uvWavelength").value;
      $("uvRange").textContent = isValidWavelength(value) ? "Valid wavelength" : "Invalid: accepted range is 190–600 nm";
      $("uvRange").className = isValidWavelength(value) ? "module-value pass" : "module-value fail";
    });

    $("verifyDetectorBtn")?.addEventListener("click", () => {
      const value = $("detectorTestValue").value;
      const result = $("detectorResult");
      if (isValidWavelength(value)) {
        result.className = "result-box pass-box";
        result.innerHTML = `<b>PASS</b> — ${escapeHtml(value)} nm is within 190–600 nm.`;
        addAudit("Detector verification", `Wavelength ${value} nm accepted`);
      } else {
        result.className = "result-box fail-box";
        result.innerHTML = `<b>FAIL</b> — ${escapeHtml(value || "blank")} nm is outside 190–600 nm.`;
        addAudit("Detector verification", `Wavelength ${value || "blank"} nm rejected`);
      }
    });

    $("calculateBtn")?.addEventListener("click", () => {
      const sample = Number($("sampleArea").value);
      const standard = Number($("standardArea").value);
      const stdConc = Number($("standardConc").value);
      if (!sample || !standard || !stdConc) return;
      const concentration = (sample/standard)*stdConc;
      const assay = (concentration/stdConc)*100;
      $("calculationResult").innerHTML = `<b>Sample concentration:</b> ${concentration.toFixed(3)} µg/mL<br><b>Assay:</b> ${assay.toFixed(2)}%`;
      addAudit("Calculation performed", `Assay result ${assay.toFixed(2)}%`);
    });

    $("reviewResultBtn")?.addEventListener("click", () => {
      addAudit("Data review", "Analytical result marked as reviewed");
      showToast("Result marked as reviewed.");
    });

    $("attachmentInput")?.addEventListener("change",e=>{mainPendingFiles=[...mainPendingFiles,...Array.from(e.target.files||[])];mainPendingFiles.forEach(f=>addAudit("File selected",`${actorLabel()} | ${f.name} selected for attachment`));e.target.value="";renderMainPending();});
    $("attachmentDropzone")?.addEventListener("click",()=>$("attachmentInput").click());
    $("attachmentDropzone")?.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){$("attachmentInput").click();e.preventDefault();}});
    $("attachmentDropzone")?.addEventListener("dragover",e=>{e.preventDefault();$("attachmentDropzone").classList.add("drag-over");});
    $("attachmentDropzone")?.addEventListener("dragleave",()=>$("attachmentDropzone").classList.remove("drag-over"));
    $("attachmentDropzone")?.addEventListener("drop",e=>{e.preventDefault();$("attachmentDropzone").classList.remove("drag-over");const files=Array.from(e.dataTransfer.files||[]);mainPendingFiles=[...mainPendingFiles,...files];files.forEach(f=>addAudit("File selected",`${actorLabel()} | ${f.name} selected for attachment`));renderMainPending();});
    $("addAttachmentBtn")?.addEventListener("click",attachMainPending);
    $("attachmentActivity")?.addEventListener("change",renderMainPending);
    $("sequenceChooseFilesBtn")?.addEventListener("click",openSequenceAttachmentModal);
    $("sequenceDropzone")?.addEventListener("click",e=>{if(e.target.closest("button"))return;$("sequenceAttachmentInput").click();});
    $("sequenceDropzone")?.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){$("sequenceAttachmentInput").click();e.preventDefault();}});
    $("sequenceAttachmentInput")?.addEventListener("change",e=>{if(!(isQC()||currentIsAdmin())){showToast("Only QC or Admin can upload sequence attachments.");e.target.value="";return;}window._sequencePendingFiles=[...(window._sequencePendingFiles||[]),...Array.from(e.target.files||[])];e.target.value="";window._sequencePendingFiles.forEach(f=>addAudit("File selected",`${actorLabel()} | ${f.name} selected for SEQ-001`));renderSequencePendingFiles();});
    $("assayChooseFilesBtn")?.addEventListener("click",openAssayAttachmentModal);
    $("assayDropzone")?.addEventListener("click",e=>{if(e.target.closest("button"))return;$("assayAttachmentInput").click();});
    $("assayAttachmentInput")?.addEventListener("change",e=>{if(!(isQC()||currentIsAdmin())){showToast("Only QC or Admin can upload assay attachments.");e.target.value="";return;}window._assayPendingFiles=[...(window._assayPendingFiles||[]),...Array.from(e.target.files||[])];e.target.value="";window._assayPendingFiles.forEach(f=>addAudit("File selected",`${actorLabel()} | ${f.name} selected for Assay / Data Review`));renderAssayPendingFiles();});
    $("reportChooseFilesBtn")?.addEventListener("click",()=>$("reportAttachmentInput").click());
    $("reportAttachmentInput")?.addEventListener("change",e=>{if(!(isQC()||currentIsAdmin())){showToast("Only QC or Admin can upload report attachments.");e.target.value="";return;}window._reportPendingFiles=[...(window._reportPendingFiles||[]),...Array.from(e.target.files||[])];e.target.value="";window._reportPendingFiles.forEach(f=>addAudit("File selected",`${actorLabel()} | ${f.name} selected for Validation Report`));renderReportPendingFiles();});
    $("reportPendingFiles")?.addEventListener("click",async e=>{const b=e.target.closest(".pending-remove");if(!b)return;(window._reportPendingFiles||[]).splice(Number(b.dataset.pendingIndex),1);renderReportPendingFiles();});

    $("signReportBtn")?.addEventListener("click", () => {
      const password = $("signaturePassword").value;
      const account = USERS[state.user.username];
      if (!account || account.password !== password) {
        $("signatureResult").innerHTML = '<div class="fail-box"><b>Signature rejected.</b> Password tidak sesuai.</div>';
        return;
      }
      const signature = {user:state.user.username,role:$("signatureRole").value,time:now()};
      localStorage.setItem("hplc_signature", JSON.stringify(signature));
      $("signaturePassword").value = "";
      addAudit("Electronic signature", `${signature.role} signed validation report`);
      renderReport();
      showToast("Validation report signed.");
    });
  }

  function restoreSession() {
    try {
      const saved = JSON.parse(sessionStorage.getItem("hplc_user") || "null");
      if (saved && USERS[saved.username] && USERS[saved.username].role === saved.role) {
        state.user = saved;
        $("loginScreen").classList.add("hidden");
        $("appScreen").classList.remove("hidden");
        $("userBadge").innerHTML = `<b>${escapeHtml(saved.username)}</b><br><span>${escapeHtml(saved.role)}</span>`;
      }
    } catch {}
  }


  function saveMethods(){localStorage.setItem("hplc_methods",JSON.stringify(state.methods));}
  function getMethodById(id){return state.methods.find(m=>m.id===id)||null;}
  function normalizeMethod(m){
    return {
      ...m,
      version:Number(m.version)||1,
      elutionMode:m.elutionMode||"Isocratic",
      mobilePhase1:m.mobilePhase1||"",
      mobilePhase2:m.mobilePhase2||"",
      mobilePhaseAPercent:m.mobilePhaseAPercent??70,
      mobilePhaseBPercent:m.mobilePhaseBPercent??30,
      columnTemperature:m.columnTemperature??30,
      gradientProgram:Array.isArray(m.gradientProgram)?m.gradientProgram:[]
    };
  }
  function methodComparable(m){
    const n=normalizeMethod(m);
    return JSON.stringify({name:n.name,column:n.column,elutionMode:n.elutionMode,mobilePhase1:n.mobilePhase1,mobilePhase2:n.mobilePhase2,mobilePhaseAPercent:Number(n.mobilePhaseAPercent),mobilePhaseBPercent:Number(n.mobilePhaseBPercent),flowRate:Number(n.flowRate),injectionVolume:Number(n.injectionVolume),columnTemperature:Number(n.columnTemperature),runningTime:Number(n.runningTime),wavelength:Number(n.wavelength),gradientProgram:n.gradientProgram});
  }
  function clearMethodForm(){
    if($('savedMethodSelect')) $('savedMethodSelect').value="";
    if($('methodName')) $('methodName').value="";
    if($('columnName')) $('columnName').value="";
    if($('elutionMode')) $('elutionMode').value="Isocratic";
    if($('mobilePhase1')) $('mobilePhase1').value="Water";
    if($('mobilePhase2')) $('mobilePhase2').value="Acetonitrile";
    if($('mobilePhaseAPercent')) $('mobilePhaseAPercent').value="70";
    if($('mobilePhaseBPercent')) $('mobilePhaseBPercent').value="30";
    if($('injectionVolume')) $('injectionVolume').value="10";
    if($('columnTemperature')) $('columnTemperature').value="30";
    if($('runningTime')) $('runningTime').value="15";
    if($('flowRate')) $('flowRate').value="1.0";
    if($('methodWavelength')) $('methodWavelength').value="243";
    if($('methodStatus')) $('methodStatus').value="Draft";
    if($('gradientValidationMessage')) $('gradientValidationMessage').textContent="";
    renderGradientProgram([]);
    updateElutionModeUI();
    updateMethodApprovalUI();
    if($('methodSaveMessage')) $('methodSaveMessage').textContent="New method form ready.";
  }
  function populateMethodForm(id){
    const m=normalizeMethod(getMethodById(id)); if(!m)return;
    $('savedMethodSelect').value=m.id;
    $('methodName').value=m.name||"";
    $('columnName').value=m.column||"";
    $('elutionMode').value=m.elutionMode||"Isocratic";
    $('mobilePhase1').value=m.mobilePhase1||"";
    $('mobilePhase2').value=m.mobilePhase2||"";
    $('mobilePhaseAPercent').value=m.mobilePhaseAPercent??70;
    $('mobilePhaseBPercent').value=m.mobilePhaseBPercent??30;
    $('flowRate').value=m.flowRate??1;
    $('injectionVolume').value=m.injectionVolume??10;
    $('columnTemperature').value=m.columnTemperature??30;
    $('runningTime').value=m.runningTime??15;
    $('methodWavelength').value=m.wavelength??243;
    $('methodStatus').value=m.status||"Draft";
    renderGradientProgram(m.gradientProgram||[]);
    updateElutionModeUI();
    updateMethodApprovalUI();
    if($('methodSaveMessage')) $('methodSaveMessage').textContent=`Loaded: ${m.name} · v${m.version||1} · ${m.status||"Draft"}`;
  }
  function renderMethodLibrary(){
    const select=$('savedMethodSelect'); if(!select)return;
    const current=select.value;
    select.innerHTML='<option value="">Select saved method</option>'+state.methods.map(m=>{const n=normalizeMethod(m);return `<option value="${escapeHtml(n.id)}">${escapeHtml(n.name)} · v${n.version||1} — ${escapeHtml(n.status||"Draft")}</option>`;}).join("");
    if(current&&state.methods.some(m=>m.id===current)) select.value=current;
  }
  function getGradientRowsFromUI(){
    return Array.from(document.querySelectorAll("#gradientProgramBody tr")).map(tr=>({
      time:Number(tr.querySelector('[data-gradient="time"]')?.value),
      a:Number(tr.querySelector('[data-gradient="a"]')?.value),
      b:Number(tr.querySelector('[data-gradient="b"]')?.value),
      flow:Number(tr.querySelector('[data-gradient="flow"]')?.value)
    }));
  }
  function renderGradientProgram(rows=[]){
    const body=$('gradientProgramBody'); if(!body)return;
    body.innerHTML=rows.length?rows.map((r,i)=>`<tr><td><input data-gradient="time" type="number" min="0" step="0.1" value="${escapeHtml(String(r.time??0))}"></td><td><input data-gradient="a" type="number" min="0" max="100" step="0.1" value="${escapeHtml(String(r.a??0))}"></td><td><input data-gradient="b" type="number" min="0" max="100" step="0.1" value="${escapeHtml(String(r.b??0))}"></td><td><input data-gradient="flow" type="number" min="0.0001" step="0.1" value="${escapeHtml(String(r.flow??1))}"></td><td><button type="button" class="secondary gradient-delete" data-gradient-index="${i}">Delete</button></td></tr>`).join(""):'<tr><td colspan="5" class="muted">No gradient points added. Click + Add Row.</td></tr>';
    body.querySelectorAll('.gradient-delete').forEach(btn=>btn.addEventListener('click',()=>{
      const rows=getGradientRowsFromUI();rows.splice(Number(btn.dataset.gradientIndex),1);renderGradientProgram(rows);validateGradientProgram(false);
    }));
  }
  function updateElutionModeUI(){
    const mode=$('elutionMode')?.value||"Isocratic";
    $('gradientProgramSection')?.classList.toggle('hidden',mode!=="Gradient");
    $('isocraticFields')?.classList.toggle('hidden',mode!=="Isocratic");
    if($('gradientValidationMessage')&&mode!=="Gradient") $('gradientValidationMessage').textContent="";
  }
  function validateGradientProgram(show=true){
    const mode=$('elutionMode')?.value||"Isocratic";
    if(mode!=="Gradient")return true;
    const rows=getGradientRowsFromUI(),msg=$('gradientValidationMessage');
    let error="";
    if(rows.length<2) error="Minimal 2 gradient points diperlukan sebelum program dapat disimpan.";
    for(let i=0;i<rows.length&&!error;i++){
      const r=rows[i];
      if(!Number.isFinite(r.time)||!Number.isFinite(r.a)||!Number.isFinite(r.b)||!Number.isFinite(r.flow)) error=`Gradient row ${i+1}: semua nilai harus berupa angka.`;
      else if(r.a<0||r.a>100||r.b<0||r.b>100) error=`Gradient row ${i+1}: %A dan %B harus 0–100%.`;
      else if(Math.abs(r.a+r.b-100)>0.0001) error=`Gradient row ${i+1}: %A + %B harus = 100%.`;
      else if(r.flow<=0) error=`Gradient row ${i+1}: Flow Rate harus positif.`;
      else if(i>0&&r.time<=rows[i-1].time) error="Time gradient harus tersusun ascending.";
    }
    if(show&&msg)msg.textContent=error;
    return !error;
  }
  function getCurrentMethodFromForm(){
    const mode=$('elutionMode')?.value||"Isocratic";
    return {
      name:$('methodName')?.value.trim()||"",
      column:$('columnName')?.value.trim()||"",
      elutionMode:mode,
      mobilePhase1:$('mobilePhase1')?.value.trim()||"",
      mobilePhase2:$('mobilePhase2')?.value.trim()||"",
      mobilePhaseAPercent:Number($('mobilePhaseAPercent')?.value),
      mobilePhaseBPercent:Number($('mobilePhaseBPercent')?.value),
      injectionVolume:Number($('injectionVolume')?.value),
      runningTime:Number($('runningTime')?.value),
      columnTemperature:Number($('columnTemperature')?.value),
      flowRate:Number($('flowRate')?.value),
      wavelength:Number($('methodWavelength')?.value),
      gradientProgram:getGradientRowsFromUI(),
      status:$('methodStatus')?.value||"Draft"
    };
  }
  function saveMethodRecord(){
    if(!canOperate()){showToast("QA tidak dapat mengubah Method.");return;}
    const m=getCurrentMethodFromForm();
    if(!m.name){showToast("Method name wajib diisi.");return;}
    if(!m.column){showToast("Column wajib diisi.");return;}
    if(!m.mobilePhase1||!m.mobilePhase2){showToast("Mobile Phase A dan B wajib diisi.");return;}
    if(m.elutionMode==="Isocratic"){
      if(!Number.isFinite(m.mobilePhaseAPercent)||!Number.isFinite(m.mobilePhaseBPercent)||m.mobilePhaseAPercent<0||m.mobilePhaseBPercent<0||Math.abs(m.mobilePhaseAPercent+m.mobilePhaseBPercent-100)>0.0001){showToast("Untuk Isocratic, %A + %B harus = 100%.");return;}
      m.gradientProgram=[];
    }else if(!validateGradientProgram(true)){showToast("Gradient Program belum valid.");return;}
    if(!Number.isFinite(m.injectionVolume)||m.injectionVolume<=0){showToast("Injection Volume harus diisi dengan benar.");return;}
    if(!Number.isFinite(m.runningTime)||m.runningTime<=0){showToast("Run Time harus diisi dengan benar.");return;}
    if(!Number.isFinite(m.columnTemperature)){showToast("Column Temperature harus diisi.");return;}
    if(!Number.isFinite(m.flowRate)||m.flowRate<=0){showToast("Flow rate harus diisi dengan benar.");return;}
    if(!isValidWavelength(m.wavelength)){showToast("Wavelength harus 190–600 nm.");return;}
    if(m.status==="Approved"&&isQC()){showToast("QC tidak dapat langsung menetapkan Method menjadi Approved. Submit untuk QA Approval.");return;}
    const selectedId=$('savedMethodSelect')?.value;
    let record=selectedId?getMethodById(selectedId):null;
    const timestamp=now();
    if(record&&normalizeMethod(record).status==="Approved"){
      const old=normalizeMethod(record),nextVersion=(Number(old.version)||1)+1;
      record={id:`M-${String(state.methods.length+1).padStart(3,"0")}`,...m,version:nextVersion,status:"Draft",previousVersionId:old.id,createdAt:timestamp,createdBy:actorLabel()};
      state.methods.push(record);
      addAudit("Method new version created",`${record.name} v${nextVersion} created from approved ${old.id} v${old.version}`,{previousValue:methodComparable(old),newValue:methodComparable(record)});
    }else if(record){
      const old=normalizeMethod(record);
      const changed=methodComparable(old)!==methodComparable(m);
      if(old.status==="Pending Approval"&&isQC()&&changed){showToast("Method yang sudah Pending Approval tidak dapat diedit. Buat New Method/version untuk perubahan.");return;}
      Object.assign(record,m,{version:old.version||1,updatedAt:timestamp,updatedBy:actorLabel()});
      addAudit("Method updated",`${record.name} (${record.id}) updated`,{previousValue:methodComparable(old),newValue:methodComparable(record)});
    }else{
      record={id:`M-${String(state.methods.length+1).padStart(3,"0")}`,...m,version:1,createdAt:timestamp,createdBy:actorLabel()};state.methods.push(record);
      addAudit("Method created",`${record.name} (${record.id}) created · Status ${record.status}`);
    }
    saveMethods();renderMethodLibrary();$('savedMethodSelect').value=record.id;
    if($('methodSaveMessage')) $('methodSaveMessage').textContent=`Saved: ${record.name} · v${record.version||1} · ${record.status}`;
    renderSequence();updateMethodApprovalUI();showToast(`Method ${record.name} berhasil disimpan.`);
  }
  function updateMethodApprovalUI(){
    const selectedId=$('savedMethodSelect')?.value,record=selectedId?normalizeMethod(getMethodById(selectedId)):null,qa=isQA();
    const status=$('methodStatus');
    if(status){const approved=status.querySelector('option[value="Approved"]')||Array.from(status.options).find(o=>o.value==="Approved");if(approved)approved.disabled=!qa;}
    const btn=$('methodQAApproveBtn');if(btn)btn.classList.toggle('hidden',!(qa&&record&&record.status==="Pending Approval"));
  }
  function approveMethodAsQA(){
    if(!isQA()){showToast("Hanya QA yang dapat approve Method.");return;}
    const id=$('savedMethodSelect')?.value,record=id?getMethodById(id):null;
    if(!record||normalizeMethod(record).status!=="Pending Approval"){showToast("Pilih Method dengan status Pending Approval.");return;}
    const comment=prompt("QA review comment:","");
    if(comment===null)return;
    const pw=prompt("Masukkan password QA untuk electronic signature:");
    if(pw!==USERS.qa.password){showToast("Password QA tidak sesuai.");return;}
    const old=record.status;record.status="Approved";record.review={reviewer:actorLabel(),reviewedAt:now(),comment:comment.trim()||"Approved",signature:`${actorLabel()} · ${now()}`};
    saveMethods();addAudit("QA approved Method",`${record.id} · ${record.name}`,{previousValue:old,newValue:"Approved"});renderMethodLibrary();populateMethodForm(record.id);showToast("Method approved by QA.");
  }

  // Controlled workflow additions
  function isQC(){return state.user?.role==="QC";}
  function isQA(){return state.user?.role==="QA";}
  function isAdmin(){return state.user?.role==="Admin";}
  function canOperate(){return isQC()||state.user?.role==="Admin";}
  function fullRole(){return state.user?.role==="QC"?"Quality Control":state.user?.role==="QA"?"Quality Assurance":state.user?.role==="Admin"?"Administrator":"System";}
  function displayUsername(username){return username?String(username).toUpperCase():"";}
  function actorLabel(){return state.user?`${fullRole()} (${displayUsername(state.user.username)})`:"System";}
  function getChromatograms(){try{return JSON.parse(localStorage.getItem("hplc_chromatograms")||"{}");}catch{return{};}}
  function saveChromatograms(x){localStorage.setItem("hplc_chromatograms",JSON.stringify(x));}

  function renderUserBadge(){
    $("userBadge").innerHTML=`<b>${escapeHtml(fullRole())}</b><br><span>${escapeHtml(displayUsername(state.user?.username||""))}</span>`;
  }

  function getAllURS(){
    return [...URS, ...state.customURS]
      .filter(u=>!state.deletedURS.includes(u.id))
      .map(u=>state.ursOverrides[u.id]?{...u,...state.ursOverrides[u.id]}:u);
  }

  function nextURSId(){
    const nums=getAllURS().map(u=>String(u.id).match(/^URS-(\d+)$/)).filter(Boolean).map(m=>Number(m[1]));
    return `URS-${String(Math.max(0,...nums)+1).padStart(3,"0")}`;
  }

  function getURSCategory(id){
    const map={"URS-001":"Security","URS-002":"Instrument","URS-003":"Data Integrity","URS-004":"Security","URS-005":"Data Integrity"};
    return state.ursOverrides[id]?.category || getAllURS().find(x=>x.id===id)?.category || map[id] || "Functionality";
  }
  function getURSReviewLabel(r){
    if(!r?.executedAt) return "Not Tested";
    if(r.reviewStatus==="Pending QA Review") return "Pending QA Review";
    if(r.reviewStatus==="Approved") return "Approved";
    if(r.reviewStatus==="Rejected") return "Rejected";
    return "In Progress";
  }
  function getURSDisplayStatus(r){
    if(!r?.executedAt) return "NOT TESTED";
    if(r.testResult==="PASS") return "PASS";
    if(r.testResult==="FAIL") return "FAIL";
    return "IN PROGRESS";
  }
  function renderURS(){
    const body=$("ursModernBody"), detail=$("ursDetail");
    if(!body||!detail) return;
    const all=getAllURS();
    const counts={all:all.length,notTested:0,inProgress:0,passed:0,failed:0,pendingQA:0};
    all.forEach(u=>{const r=state.urs[u.id]||{}; const s=getURSDisplayStatus(r); if(s==="NOT TESTED")counts.notTested++; if(s==="IN PROGRESS")counts.inProgress++; if(s==="PASS")counts.passed++; if(s==="FAIL")counts.failed++; if(r.reviewStatus==="Pending QA Review")counts.pendingQA++;});
    $("ursTabs").innerHTML=`<button class="urs-tab active" data-urs-filter="">All (${counts.all})</button><button class="urs-tab" data-urs-filter="NOT TESTED">Not Tested (${counts.notTested})</button><button class="urs-tab" data-urs-filter="IN PROGRESS">In Progress (${counts.inProgress})</button><button class="urs-tab" data-urs-filter="PASS">Passed (${counts.passed})</button><button class="urs-tab" data-urs-filter="FAIL">Failed (${counts.failed})</button><button class="urs-tab" data-urs-filter="PENDING QA">Pending QA (${counts.pendingQA})</button>`;

    const q=($("ursSearch")?.value||"").trim().toLowerCase(), cat=$("ursCategoryFilter")?.value||"", stat=$("ursStatusFilter")?.value||"";
    let filtered=all.filter(u=>{const r=state.urs[u.id]||{};const hay=`${u.id} ${u.text} ${u.criteria}`.toLowerCase();return (!q||hay.includes(q))&&(!cat||getURSCategory(u.id)===cat)&&(!stat||getURSDisplayStatus(r)===stat||(stat==="PENDING QA"&&r.reviewStatus==="Pending QA Review"));});
    const maxPage=Math.max(1,Math.ceil(filtered.length/URS_PAGE_SIZE)); if(ursPage>maxPage)ursPage=maxPage; const start=(ursPage-1)*URS_PAGE_SIZE; const shown=filtered.slice(start,start+URS_PAGE_SIZE);
    if(!ursSelectedId||!filtered.some(u=>u.id===ursSelectedId)) ursSelectedId=shown[0]?.id||all[0]?.id||null;
    body.innerHTML=shown.length?shown.map((u,i)=>{const r=state.urs[u.id]||{}, status=getURSDisplayStatus(r), review=getURSReviewLabel(r), selected=u.id===ursSelectedId, cls=status==="PASS"?"pass":status==="FAIL"?"fail":status==="IN PROGRESS"?"in-progress":"not-tested"; const updated=r.executedAt||"—"; return `<tr class="${selected?'selected':''}" data-urs-row="${escapeHtml(u.id)}"><td><input type="checkbox" class="urs-row-check" data-id="${escapeHtml(u.id)}"></td><td><button type="button" class="urs-id-link" data-select-urs="${escapeHtml(u.id)}">${escapeHtml(u.id)}</button></td><td><div class="urs-requirement-cell">${escapeHtml(u.text)}</div></td><td><span class="urs-category ${getURSCategory(u.id).toLowerCase().replace(/\s+/g,'-')}">${escapeHtml(getURSCategory(u.id))}</span></td><td><span class="urs-modern-status ${cls}">${status==="PASS"?'<i data-lucide="check"></i> Passed':status==="FAIL"?'<i data-lucide="x"></i> Failed':status==="IN PROGRESS"?'<i data-lucide="clock-3"></i> In Progress':'Not Tested'}</span></td><td>${escapeHtml(updated)}</td><td><button type="button" class="urs-more" data-select-urs="${escapeHtml(u.id)}"><i data-lucide="more-vertical"></i></button></td></tr>`;}).join(""):`<tr><td colspan="7" class="muted urs-empty">No URS matches the current filters.</td></tr>`;
    $("ursShowingText").textContent=filtered.length?`Showing ${start+1}–${Math.min(start+URS_PAGE_SIZE,filtered.length)} of ${filtered.length} requirements`:"Showing 0 requirements";
    $("ursPageOne").textContent=String(ursPage); $("ursPrevPage").disabled=ursPage<=1; $("ursNextPage").disabled=ursPage>=maxPage;
    document.querySelectorAll("[data-select-urs]").forEach(b=>b.addEventListener("click",()=>{ursSelectedId=b.dataset.selectUrs;renderURS();}));
    document.querySelectorAll(".urs-tab").forEach(b=>b.addEventListener("click",()=>{document.querySelectorAll(".urs-tab").forEach(x=>x.classList.remove("active"));b.classList.add("active");$("ursStatusFilter").value=b.dataset.ursFilter==="PENDING QA"?"PENDING QA":b.dataset.ursFilter;ursPage=1;renderURS();}));
    $("ursPrevPage").onclick=()=>{if(ursPage>1){ursPage--;renderURS();}}; $("ursNextPage").onclick=()=>{if(ursPage<maxPage){ursPage++;renderURS();}};
    renderURSDetail(ursSelectedId);refreshIcons();
  }
  function renderURSDetail(id){
    const detail=$("ursDetail"); if(!detail)return; const u=getAllURS().find(x=>x.id===id); if(!u){detail.innerHTML='<div class="urs-detail-empty">Select a URS to view details.</div>';return;}
    const r=state.urs[id]||{}, status=getURSDisplayStatus(r), review=getURSReviewLabel(r), cls=status==="PASS"?"pass":status==="FAIL"?"fail":status==="IN PROGRESS"?"in-progress":"not-tested", qa=r.qaReview||null;
    const canEditDelete=isQC()&&review!=="Pending QA Review"&&review!=="Approved";
    const action=!r.executedAt?"Test":review==="Pending QA Review"?(isQA()?"Review":"Submit for QA Review"):review==="Rejected"?(isQC()?"Retest":"Review"):review==="Approved"?"View":"Test";
    detail.innerHTML=`<div class="urs-detail-head"><div><h3>${escapeHtml(u.id)}</h3><p>${escapeHtml(u.text)}</p></div><span class="urs-modern-status ${cls}">${status==="PASS"?'<i data-lucide="check"></i> Passed':status==="FAIL"?'<i data-lucide="x"></i> Failed':status==="IN PROGRESS"?'<i data-lucide="clock-3"></i> In Progress':'Not Tested'}</span></div><div class="urs-meta-grid"><div><span>Category</span><b>${escapeHtml(getURSCategory(id))}</b></div><div><span>Priority</span><b>High</b></div><div><span>Version</span><b>v1.0</b></div><div><span>Created Date</span><b>12 Sep 2026</b></div></div><h4>Acceptance Criteria</h4><div class="urs-detail-box">${escapeHtml(u.criteria)}</div><h4>Verification Method</h4><div class="urs-detail-box">Functional Testing</div>${r.actual?`<h4>Actual Result</h4><div class="urs-detail-box">${escapeHtml(r.actual)}</div>`:""}${r.evidence?`<h4>Validation Evidence</h4><div class="urs-evidence-row"><span><i data-lucide="file-text"></i> ${escapeHtml(r.evidence)}</span></div>`:""}<div class="urs-detail-actions">${canEditDelete?`<button type="button" class="secondary" id="detailEditURS">Edit</button><button type="button" class="secondary danger-action" id="detailDeleteURS">Delete</button>`:""}<button type="button" class="primary" id="detailTestURS" ${isQC()||isQA()||isAdmin()?"":"disabled"}>${escapeHtml(action)}</button></div><div class="urs-review-section"><h4>Review</h4><div class="urs-review-row"><span>Review Status</span><b>${escapeHtml(review)}</b></div><div class="urs-review-row"><span>Reviewed by</span><b>${escapeHtml(qa?.reviewer||"—")}</b></div><div class="urs-review-row"><span>Review Date & Time</span><b>${escapeHtml(qa?.reviewedAt||"—")}</b></div><div class="urs-review-row"><span>QA Comment</span><b>${escapeHtml(qa?.comment||"—")}</b></div><div class="urs-review-row"><span>Electronic Signature</span><b>${escapeHtml(qa?.signature||"—")}</b></div></div>`;
    if($("detailEditURS"))$("detailEditURS").onclick=()=>openEditURSModal(id); if($("detailDeleteURS"))$("detailDeleteURS").onclick=()=>deleteURS(id); if($("detailTestURS"))$("detailTestURS").onclick=()=>handleURSAction(id);
  }
  function openEditURSModal(id){
    if(!isQC()){showToast("Hanya QC yang dapat mengedit URS.");return;}
    const u=getAllURS().find(x=>x.id===id),r=state.urs[id]||{}; if(!u)return;
    if(r.reviewStatus==="Pending QA Review"||r.reviewStatus==="Approved"){showToast("URS yang sudah diajukan atau disetujui QA tidak dapat diedit.");return;}
    showModal(`<h3>Edit URS</h3><p class="muted">Update the requirement definition and verification criteria.</p><label>Requirement ID</label><input id="editURSId" value="${escapeHtml(u.id)}" readonly><label>Requirement Description <span class="required">*</span></label><textarea id="editURSRequirement">${escapeHtml(u.text)}</textarea><div class="form-grid-3"><div><label>Category</label><select id="editURSCategory"><option>Security</option><option>Instrument</option><option>Data Integrity</option><option>Functionality</option></select></div><div><label>Priority <span class="required">*</span></label><select id="editURSPriority"><option>High</option><option>Medium</option><option>Low</option></select></div><div><label>Version <span class="required">*</span></label><input id="editURSVersion" value="${escapeHtml(u.version||"v1.0")}"></div></div><label>Acceptance Criteria <span class="required">*</span></label><textarea id="editURSCriteria">${escapeHtml(u.criteria)}</textarea><label>Verification Method</label><select id="editURSVerification"><option>Functional Testing</option><option>Configuration Verification</option><option>Document Review</option></select><div id="editURSError" class="error-message"></div><div class="modal-actions"><button class="secondary close-modal">Cancel</button><button class="primary" id="saveEditedURS">Save Changes</button></div>`);
    $("editURSCategory").value=getURSCategory(id);$("editURSPriority").value=u.priority||"High";$("editURSVerification").value=u.verification||"Functional Testing";
    $("saveEditedURS")?.addEventListener("click",()=>{const text=$("editURSRequirement").value.trim(),criteria=$("editURSCriteria").value.trim();if(!text||!criteria){$("editURSError").textContent="Requirement Description dan Acceptance Criteria wajib diisi.";return;}state.ursOverrides[id]={text,criteria,category:$("editURSCategory").value,priority:$("editURSPriority").value,version:$("editURSVersion").value.trim()||"v1.0",verification:$("editURSVerification").value};localStorage.setItem("hplc_urs_overrides",JSON.stringify(state.ursOverrides));addAudit("URS Modified",`${id} | URS definition modified by QC`,{testId:id,newValue:JSON.stringify(state.ursOverrides[id])});closeModal();renderURS();showToast(`${id} updated.`);});
  }
  function deleteURS(id){
    if(!isQC()){showToast("Hanya QC yang dapat menghapus URS.");return;}const u=getAllURS().find(x=>x.id===id),r=state.urs[id]||{};if(!u)return;if(r.reviewStatus==="Pending QA Review"||r.reviewStatus==="Approved"){showToast("URS yang sudah diajukan atau disetujui QA tidak dapat dihapus.");return;}
    showModal(`<div class="confirm-icon danger"><i data-lucide="triangle-alert"></i></div><h3>Delete URS</h3><p>Are you sure you want to delete <b>${escapeHtml(id)}</b>?</p><p class="muted">This action cannot be undone.</p><div class="modal-actions"><button class="secondary close-modal">Cancel</button><button class="primary danger-btn" id="confirmDeleteURS">Delete</button></div>`);
    $("confirmDeleteURS")?.addEventListener("click",()=>{state.deletedURS=[...new Set([...state.deletedURS,id])];localStorage.setItem("hplc_deleted_urs",JSON.stringify(state.deletedURS));addAudit("URS Deleted",`${id} | URS deleted by QC`,{testId:id,previousValue:"Active",newValue:"Deleted"});closeModal();renderURS();updateDashboard();showToast("URS deleted successfully.");});
  }
  function openAddURSModal(){
    if(!isQC()){showToast("Hanya QC yang dapat menambahkan URS.");return;}const id=nextURSId();
    showModal(`<h3>Add New URS</h3><p class="muted">Create a new user requirement for the HPLC-UV CSV system.</p><label>Requirement ID <span class="required">*</span></label><input id="newURSId" value="${id}" readonly><label>Requirement Description <span class="required">*</span></label><textarea id="newURSRequirement" placeholder="System shall ..."></textarea><div class="form-grid-3"><div><label>Category</label><select id="newURSCategory"><option>Data Integrity</option><option>Security</option><option>Instrument</option><option>Functionality</option></select></div><div><label>Priority <span class="required">*</span></label><select id="newURSPriority"><option>High</option><option>Medium</option><option>Low</option></select></div><div><label>Version <span class="required">*</span></label><input id="newURSVersion" value="v1.0"></div></div><label>Acceptance Criteria <span class="required">*</span></label><textarea id="newURSCriteria" placeholder="Define measurable acceptance criteria..."></textarea><label>Verification Method</label><select id="newURSVerification"><option>Functional Testing</option><option>Configuration Verification</option><option>Document Review</option></select><div id="newURSError" class="error-message"></div><div class="modal-actions"><button class="secondary close-modal">Cancel</button><button class="primary" id="saveNewURS">Save</button></div>`);
    $("saveNewURS")?.addEventListener("click",()=>{const text=$("newURSRequirement").value.trim(),criteria=$("newURSCriteria").value.trim();if(!text||!criteria){$("newURSError").textContent="Please complete all required fields.";return;}const record={id,text,criteria,category:$("newURSCategory").value,priority:$("newURSPriority").value,version:$("newURSVersion").value.trim()||"v1.0",verification:$("newURSVerification").value,createdDate:now()};state.customURS.push(record);localStorage.setItem("hplc_custom_urs",JSON.stringify(state.customURS));state.urs[id]={reviewStatus:"Not Tested"};localStorage.setItem("hplc_urs",JSON.stringify(state.urs));addAudit("URS created",`${id} | Requirement added by QC`,{testId:id,previousValue:"N/A",newValue:"NOT TESTED"});closeModal();renderURS();updateDashboard();showToast("URS added successfully.");});
  }
  function handleURSAction(id){const r=state.urs[id]||{};if(!r.executedAt){openURSStartModal(id);return;}if(r.reviewStatus==="Pending QA Review"){isQA()?openURSReview(id):submitURSForQA(id);return;}if(r.reviewStatus==="Rejected"){isQC()?openURSStartModal(id):openURSReview(id);return;}if(isQC())openURSStartModal(id);else if(isQA())openURSReview(id);}
  function openURSStartModal(id){if(!isQC()){showToast("Hanya QC yang dapat menguji URS.");return;}const u=getAllURS().find(x=>x.id===id);if(!u)return;showModal(`<div class="confirm-icon info"><i data-lucide="clipboard-check"></i></div><h3>Start Verification Test</h3><h3>${escapeHtml(u.id)}</h3><p>${escapeHtml(u.text)}</p><div class="info-box">This will open the verification test form. You can record test results, upload evidence, and mark the status.</div><div class="modal-actions"><button class="secondary close-modal">Cancel</button><button class="primary" id="startURSTest">Start Test</button></div>`);$("startURSTest")?.addEventListener("click",()=>{closeModal();openURSModal(id);});}
  function openURSModal(id){
    window._ursPendingFiles=[];if(!isQC()){showToast("Hanya QC yang dapat menguji URS.");return;}const u=getAllURS().find(x=>x.id===id),existing=state.urs[id]||{};if(!u)return;
    showModal(`<div class="test-execution-layout"><div class="test-stepper"><div class="step active"><b>1</b><span>Test Execution</span><small>Provide test result and evidence</small></div><div class="step"><b>2</b><span>Review & Approval</span><small>Submit form for QA review</small></div></div><div class="test-form-main"><h3>Test URS <span class="badge">${escapeHtml(u.id)}</span></h3><p class="muted">${escapeHtml(u.text)}</p><label>Test Procedure</label><textarea id="ursProcedure">${escapeHtml(existing.procedure||`Verify ${u.text.toLowerCase()}`)}</textarea><label>Test Result <span class="required">*</span></label><select id="ursTestResult"><option value="">Select result</option><option value="PASS" ${existing.testResult==="PASS"?"selected":""}>Pass</option><option value="FAIL" ${existing.testResult==="FAIL"?"selected":""}>Fail</option></select><label>Actual Result / Remarks <span class="required">*</span></label><textarea id="ursActual" placeholder="Enter the observed actual result...">${escapeHtml(existing.actual||"")}</textarea><label>Attachments</label><input id="ursEvidenceFile" type="file" multiple accept=".pdf,.csv,.xlsx,.docx,.png,.jpg,.jpeg"><div id="ursPendingFiles" class="pending-file-list"></div><div class="urs-requirement-side"><b>Requirement Details</b><p>Category: ${escapeHtml(getURSCategory(id))}</p><p>Priority: ${escapeHtml(u.priority||"High")}</p><p>Version: ${escapeHtml(u.version||"v1.0")}</p><p>Acceptance Criteria: ${escapeHtml(u.criteria)}</p><p>Verification Method: ${escapeHtml(u.verification||"Functional Testing")}</p></div><div id="ursError" class="error-message"></div><div class="modal-actions"><button class="secondary close-modal">Cancel</button><button class="primary" id="saveURSTest">Save Result</button></div></div></div>`);
    $("ursEvidenceFile")?.addEventListener("change",e=>{window._ursPendingFiles=Array.from(e.target.files||[]);$("ursPendingFiles").innerHTML=pendingRows(window._ursPendingFiles);$("ursPendingFiles").querySelectorAll(".pending-remove").forEach(b=>b.addEventListener("click",()=>{window._ursPendingFiles.splice(Number(b.dataset.pendingIndex),1);e.target.value="";$("ursPendingFiles").innerHTML=pendingRows(window._ursPendingFiles);refreshIcons();}));refreshIcons();});
    $("saveURSTest")?.addEventListener("click",async()=>{const actual=$("ursActual").value.trim(),result=$("ursTestResult").value;if(!actual||!result){$("ursError").textContent="Please complete all required fields.";return;}const files=Array.from(window._ursPendingFiles||[]),previous=state.urs[id]||{};state.urs[id]={...previous,status:result,testResult:result,reviewStatus:"Not Submitted",actual,procedure:$("ursProcedure").value.trim(),evidence:previous.evidence||"",executedBy:actorLabel(),executedAt:now(),qaReview:null};localStorage.setItem("hplc_urs",JSON.stringify(state.urs));addAudit("URS test executed",`${id} | Result ${result}`,{testId:id,previousValue:previous?.testResult||"NOT TESTED",newValue:result});addAudit("URS actual result recorded",`${id} | Actual Result recorded by QC`,{testId:id,newValue:actual});if(files.length){const created=await attachFiles(files,{activity:"URS",recordType:"urs",recordId:id});if(created[0]){state.urs[id].evidence=created[0].name;localStorage.setItem("hplc_urs",JSON.stringify(state.urs));}}closeModal();renderURS();updateDashboard();showToast("Test result saved successfully.");});
  }
  function submitURSForQA(id){
    if(!isQC()){showToast("Hanya QC yang dapat submit URS ke QA.");return;}
    const r=state.urs[id];
    if(!r?.executedAt||!r.testResult){return;}
    r.reviewStatus="Pending QA Review";r.submittedBy=actorLabel();r.submittedAt=now();
    localStorage.setItem("hplc_urs",JSON.stringify(state.urs));
    addAudit("URS submitted for QA Review",`${id} submitted for QA review`,{testId:id,previousValue:"Not Submitted",newValue:"Pending QA Review"});
    renderURS();showToast(`${id} submitted for QA review.`);
  }

  function openURSReview(id){
    const ev=state.urs[id]?.evidence;if(ev)addAudit("QA reviewed evidence",`${id} | QA reviewed evidence ${ev}`);
    if(!isQA()){showToast("Hanya QA yang dapat review URS.");return;}
    const u=getAllURS().find(x=>x.id===id),r=state.urs[id];
    showModal(`<h3>QA Review — ${u.id}</h3><p><b>Requirement:</b> ${escapeHtml(u.text)}</p><p><b>Acceptance:</b> ${escapeHtml(u.criteria)}</p><p><b>Actual Result:</b> ${escapeHtml(r.actual)}</p><p><b>QC Test Result:</b> <span class="case-status ${r.testResult==="PASS"?"pass":"fail"}">${escapeHtml(r.testResult)}</span></p><p><b>Evidence:</b> ${escapeHtml(r.evidence||"None")}</p><p><b>Executed by:</b> ${escapeHtml(r.executedBy)} · ${escapeHtml(r.executedAt)}</p><label>QA Review Comment <span class="required">*</span></label><textarea id="ursQAComment" placeholder="Enter review comment..."></textarea><label>QA password for electronic signature</label><input id="ursQAPassword" type="password" placeholder="Enter QA password"><div id="ursQAError" class="error-message"></div><div class="modal-actions"><button class="secondary close-modal">Cancel</button><button class="secondary" id="rejectURS">Reject</button><button class="primary" id="approveURS">Approve & Sign</button></div>`);
    const finish=approved=>{
      const comment=$("ursQAComment").value.trim(),pw=$("ursQAPassword").value;
      if(!comment){$("ursQAError").textContent="QA review comment wajib diisi.";return;}
      if(approved&&pw!==USERS.qa.password){$("ursQAError").textContent="Password QA tidak sesuai.";return;}
      const reviewAt=now();
      r.qaReview={reviewer:actorLabel(),reviewedAt:reviewAt,action:approved?"Approved":"Rejected",comment,signature:approved?`${actorLabel()} · ${reviewAt}`:null};
      r.reviewStatus=approved?"Approved":"Rejected";
      localStorage.setItem("hplc_urs",JSON.stringify(state.urs));
      addAudit(approved?"QA approved URS":"QA rejected URS",`${id} | Original Test Result ${r.testResult} | ${approved?"Approved":"Rejected"}`,{testId:id,previousValue:"Pending QA Review",newValue:r.reviewStatus});
      addAudit("QA review comment recorded",`${id} | ${comment}`,{testId:id,newValue:comment});
      if(approved)addAudit("QA electronic signature",`${id} | QA signed URS approval`,{testId:id,newValue:"Electronic signature recorded"});
      closeModal();renderURS();showToast(approved?`${id} approved.`:`${id} rejected.`);
    };
    $("approveURS")?.addEventListener("click",()=>finish(true));$("rejectURS")?.addEventListener("click",()=>finish(false));
  }

  function methodOptions(selectedId, fallbackName){
    let options='<option value="">Select saved method</option>';
    options+=state.methods.map(m=>`<option value="${escapeHtml(m.id)}" ${selectedId===m.id?"selected":""}>${escapeHtml(m.name)} — ${escapeHtml(m.status||"Draft")}</option>`).join("");
    if(!selectedId && fallbackName && !state.methods.some(m=>m.name===fallbackName)) options+=`<option value="__legacy__" selected>${escapeHtml(fallbackName)}</option>`;
    return options;
  }
  function renderSequence(){
    const fallbackMethod=$('methodName')?.value||'';
    const fallbackVolume=Number($('injectionVolume')?.value)||10;
    const rows=state.sequence||[];
    $('sequenceBody').innerHTML=rows.length?rows.map((s,i)=>{
      const methodName=s.method||fallbackMethod, volume=s.volume??fallbackVolume;
      const expectedRT=s.type==='Blank'?'—':(s.expectedRT??'4.8');
      const status=s.status==='Completed'?'Completed':'Pending';
      return `<tr><td><input type="checkbox" class="sequence-row-check" data-seq-index="${i}"></td><td>${i+1}</td><td>${escapeHtml(s.sample)}</td><td>${escapeHtml(s.type)}</td><td>${escapeHtml(s.vial)}</td><td>${escapeHtml(String(volume))}</td><td>${escapeHtml(methodName)}</td><td>${escapeHtml(String(expectedRT))}</td><td><span class="case-status ${status==='Completed'?'pass':''}">${status}</span></td></tr>`;
    }).join(''):'<tr><td colspan="9" class="muted">No injections added. Click Add Injection to build the sequence.</td></tr>';
    const showing=$('sequenceShowingText'); if(showing){ const total=rows.length; showing.textContent=total?`Showing 1–${total} of ${total} injections`:'Showing 0–0 of 0 injections'; }
    document.querySelectorAll('.sequence-row-check').forEach(c=>c.addEventListener('change',()=>{const all=[...document.querySelectorAll('.sequence-row-check')];if($('sequenceSelectAll'))$('sequenceSelectAll').checked=all.length>0&&all.every(x=>x.checked);}));
    renderSequenceMeta();
  }

  function renderSequenceMeta(){
    const rows=state.sequence||[], first=rows[0];
    const method=first?.methodId?getMethodById(first.methodId):null;
    const methodName=first?.method||method?.name||$("methodName")?.value||"Assay by HPLC-UV";
    const completed=rows.filter(x=>x.status==="Completed").length, failed=rows.filter(x=>x.status==="Failed").length;
    const executed=completed+failed, createdBy=first?.createdBy||actorLabel(), createdAt=first?.createdAt||"—";
    if($("sequenceMethodInfo")){ $("sequenceMethodInfo").innerHTML=state.methods.map(m=>`<option value="${escapeHtml(m.id)}" ${m.id===first?.methodId?"selected":""}>${escapeHtml(m.name)} (${escapeHtml(m.status||"Draft")})</option>`).join("")||`<option>${escapeHtml(methodName)}</option>`; }
    if($("sequenceCreatedBy")) $("sequenceCreatedBy").value=displayUsername(state.user?.username||"qc");
    if($("sequenceCreationDate")) $("sequenceCreationDate").value=createdAt;
    if($("sequenceSettingsMethod")) $("sequenceSettingsMethod").textContent=methodName;
    if($("sequenceSettingsVolume")) $("sequenceSettingsVolume").textContent=`${first?.volume??Number($("injectionVolume")?.value||10)} µL`;
    if($("sequenceSettingsFlow")) $("sequenceSettingsFlow").textContent=`${method?.flowRate??Number($("flowRate")?.value||1)} mL/min`;
    if($("sequenceSettingsWavelength")) $("sequenceSettingsWavelength").textContent=`${method?.wavelength??Number($("methodWavelength")?.value||243)} nm`;
    if($("sequenceTotal")) $("sequenceTotal").textContent=rows.length;
    if($("sequenceEstimatedTime")) $("sequenceEstimatedTime").textContent=rows.length?`~ ${Math.max(15, rows.length*15)} min`:"~ 0 min";
    if($("sequenceExecuted")) $("sequenceExecuted").textContent=executed;
    if($("sequenceCompleted")) $("sequenceCompleted").textContent=completed;
    if($("sequenceFailed")) $("sequenceFailed").textContent=failed;
    if($("sequenceCreatedByStatus")) $("sequenceCreatedByStatus").textContent=displayUsername(String(createdBy).toLowerCase());
    if($("sequenceCreatedAtStatus")) $("sequenceCreatedAtStatus").textContent=createdAt;
    if($("sequenceModifiedAtStatus")) $("sequenceModifiedAtStatus").textContent=createdAt;
    if($("sequenceStatusBadge")) $("sequenceStatusBadge").textContent=rows.length&&completed===rows.length?"COMPLETED":"DRAFT";
    const logs=getAudit().filter(a=>String(a.action||"").toLowerCase().includes("sequence")).slice(0,4);
    if($("sequenceRunLog")) $("sequenceRunLog").innerHTML=logs.length?logs.map(a=>`<div class="sequence-log-item"><b>${escapeHtml(a.action)}</b><span>${escapeHtml(a.time)}</span><small>${escapeHtml(a.details||"")}</small></div>`).join(""): '<div class="sequence-empty-log"><span><i data-lucide="info"></i></span><b>No run history yet.</b><small>Run the sequence to see execution details.</small></div>';
  }

  function getMethodByIdByName(name){return state.methods.find(m=>m.name===name)||null;}

  function openSequenceModal(editIndex=null){
    if(!canOperate()){showToast('Hanya QC yang dapat membuat atau mengubah sequence.');return;}
    if(!state.methods.length){showToast('Buat dan simpan Method terlebih dahulu di Method & URS.');return;}
    const editing=editIndex!==null && state.sequence[editIndex], row=editing?state.sequence[editIndex]:{};
    const defaultMethodId=row.methodId||state.methods[0]?.id||'';
    showModal(`<div class="sequence-modal sequence-add-modal"><div class="sequence-modal-head"><h3>${editing?'Edit Injection':'Add Injection'}</h3><button class="icon-button close-modal" type="button" aria-label="Close">×</button></div><div class="sequence-modal-form"><label>Sample ID <span class="required">*</span><input id="seqSample" value="${escapeHtml(row.sample||'SAMPLE-001')}" placeholder="Enter Sample ID"></label><label>Sample Type <span class="required">*</span><select id="seqType"><option value="">Select type</option><option ${row.type==='Standard'?'selected':''}>Standard</option><option ${row.type==='Sample'||!row.type?'selected':''}>Sample</option><option ${row.type==='Blank'?'selected':''}>Blank</option></select></label><label>Vial Position <span class="required">*</span><input id="seqVial" value="${escapeHtml(row.vial||'02')}" placeholder="02"></label><label>Injection Volume (µL) <span class="required">*</span><input id="seqVolume" type="number" min="0.1" step="0.1" value="${escapeHtml(String(row.volume??10))}"></label><label>Method <span class="required">*</span><select id="seqMethod">${methodOptions(defaultMethodId,'')}</select></label><label>Expected RT (min)<input id="seqExpectedRT" type="number" step="0.1" value="${escapeHtml(String(row.expectedRT??(row.type==='Blank'?'':5.8))) }"></label></div><div id="seqError" class="error-message"></div><div class="modal-actions sequence-modal-actions"><button class="secondary close-modal" type="button">Cancel</button><button class="primary" id="saveSequenceInjection" type="button">${editing?'Save Changes':'Add Injection'}</button></div></div>`);
    $('saveSequenceInjection')?.addEventListener('click',()=>{const sample=$('seqSample').value.trim(),type=$('seqType').value,vial=$('seqVial').value.trim(),methodId=$('seqMethod').value,volume=Number($('seqVolume').value),expected=$('seqExpectedRT').value===''?null:Number($('seqExpectedRT').value),m=getMethodById(methodId);if(!sample||!type||!vial||!m||!Number.isFinite(volume)||volume<=0||expected!==null&&(!Number.isFinite(expected)||expected<0)){$('seqError').textContent='Sample ID, Sample Type, Vial, Method, dan Injection Volume wajib diisi dengan benar.';return;}const data={sample,type,vial,methodId:m.id,method:m.name,volume,expectedRT:type==='Blank'?null:(expected??5.8),status:editing?(row.status||'Pending'):'Pending',createdBy:editing?row.createdBy:actorLabel(),createdAt:editing?row.createdAt:now()};if(editing)state.sequence[editIndex]={...row,...data};else state.sequence.push(data);saveSequence();addAudit(editing?'Sequence injection edited':'Sequence injection added',`${sample} ${editing?'updated':'added'} in SEQ-001`,{module:'Sequence',actionType:editing?'Updated':'Created',recordId:'SEQ-001'});closeModal();renderSequence();showToast(editing?'Injection updated successfully.':'Injection added successfully.');});
    refreshIcons();
  }

  function saveSequenceRow(index){
    if(!canOperate()){showToast("Hanya QC yang dapat menyimpan perubahan sequence.");return;}
    const row=state.sequence[index]; if(!row)return;
    const methodEl=document.querySelector(`[data-seq-field="method"][data-seq-index="${index}"]`),volumeEl=document.querySelector(`[data-seq-field="volume"][data-seq-index="${index}"]`);
    const method=getMethodById(methodEl?.value),volume=Number(volumeEl?.value);
    if(!method||!Number.isFinite(volume)||volume<=0){showToast("Method tersimpan dan Volume harus diisi dengan benar.");return;}
    const previous=`Method ${row.method||"—"}, Volume ${row.volume??"—"} µL`;
    row.methodId=method.id;row.method=method.name;row.volume=volume;row.methodStatus=method.status;row.methodDetails={column:method.column,injectionVolume:method.injectionVolume,runningTime:method.runningTime,mobilePhase1:method.mobilePhase1,mobilePhase2:method.mobilePhase2,flowRate:method.flowRate,wavelength:method.wavelength};
    localStorage.setItem("hplc_sequence",JSON.stringify(state.sequence));
    addAudit("Sequence row saved",`Injection ${row.sample} updated`,{previousValue:previous,newValue:`Method ${method.name}, Volume ${volume} µL`});
    renderSequence();showToast(`Injection ${row.sample} berhasil disimpan.`);
  }

  function deleteSequenceRow(index){
    if(!canOperate()){showToast("Hanya QC yang dapat menghapus sequence.");return;}
    const row=state.sequence[index];
    if(!row)return;
    if(!window.confirm(`Hapus injection ${row.sample}?`))return;
    state.sequence.splice(index,1);
    localStorage.setItem("hplc_sequence",JSON.stringify(state.sequence));
    const all=getChromatograms();delete all[row.sample];saveChromatograms(all);
    addAudit("Sequence row deleted",`Injection ${row.sample} deleted from sequence`);
    renderSequence();renderChromatogram();showToast(`Injection ${row.sample} berhasil dihapus.`);
  }


  function getSelectedSequenceIndexes(){return [...document.querySelectorAll('.sequence-row-check:checked')].map(c=>Number(c.dataset.seqIndex)).filter(Number.isInteger);}
  function openEditSelectedSequence(){if(!canOperate()){showToast('QA hanya dapat melihat sequence.');return;}const idx=getSelectedSequenceIndexes();if(idx.length!==1){showToast('Pilih tepat 1 injection untuk diedit.');return;}openSequenceModal(idx[0]);}
  function openDeleteSequenceModal(){if(!canOperate()){showToast('QA hanya dapat melihat sequence.');return;}const idx=getSelectedSequenceIndexes();if(!idx.length){showToast('Pilih injection yang ingin dihapus terlebih dahulu.');return;}showModal(`<div class="delete-modal-icon"><i data-lucide="triangle-alert"></i></div><h3>Delete Injection(s)</h3><p>Are you sure you want to delete ${idx.length} selected injection${idx.length>1?'s':''}?</p><div class="modal-actions"><button class="secondary close-modal">Cancel</button><button class="danger-button" id="confirmSequenceDelete">Delete</button></div>`);$('confirmSequenceDelete')?.addEventListener('click',()=>{[...idx].sort((a,b)=>b-a).forEach(i=>state.sequence.splice(i,1));saveSequence();renderSequence();addAudit('Sequence injection deleted',`${idx.length} injection(s) deleted from SEQ-001`,{module:'Sequence',actionType:'Deleted',recordId:'SEQ-001'});closeModal();showToast('Injection(s) deleted successfully.');});}
  function openSequencePreviewModal(){const rows=state.sequence||[];if(!rows.length){showToast('No injections available for preview.');return;}showModal(`<h3>Sequence Preview</h3><div class="table-wrap modal-table-wrap"><table class="sequence-rich-table"><thead><tr><th>#</th><th>Sample ID</th><th>Type</th><th>Vial</th><th>Inj. Vol. (µL)</th><th>Method</th><th>Expected RT (min)</th></tr></thead><tbody>${rows.map((s,i)=>`<tr><td>${i+1}</td><td>${escapeHtml(s.sample)}</td><td>${escapeHtml(s.type)}</td><td>${escapeHtml(s.vial)}</td><td>${escapeHtml(String(s.volume??10))}</td><td>${escapeHtml(s.method||'—')}</td><td>${escapeHtml(String(s.expectedRT??'—'))}</td></tr>`).join('')}</tbody></table></div><div class="modal-actions"><button class="secondary close-modal">Close</button><button class="primary" id="printSequencePreview">Print Preview</button></div>`);$('printSequencePreview')?.addEventListener('click',()=>window.print());}
  function openRunSequenceModal(){if(!canOperate()){showToast('Hanya QC yang dapat menjalankan sequence.');return;}if(!state.sequence.length){showToast('Tambahkan injection terlebih dahulu.');return;}showModal(`<div class="run-modal-icon"><i data-lucide="play"></i></div><h3>Run Sequence</h3><p>Total injections: <b>${state.sequence.length}</b></p><p>Do you want to start the sequence run?</p><div class="modal-actions"><button class="secondary close-modal">Cancel</button><button class="primary" id="confirmRunSequence">Start Run</button></div>`);$('confirmRunSequence')?.addEventListener('click',()=>{closeModal();runSequence();});}
  function openSequenceRunLogModal(){const logs=getAudit().filter(a=>String(a.action||'').toLowerCase().includes('sequence'));showModal(`<h3>Run Log</h3><div class="table-wrap modal-table-wrap"><table><thead><tr><th>DATE/TIME</th><th>USER</th><th>ACTION</th><th>DETAILS</th></tr></thead><tbody>${logs.length?logs.slice(0,20).map(a=>`<tr><td>${escapeHtml(a.time||'—')}</td><td>${escapeHtml(a.user||actorLabel())}</td><td>${escapeHtml(a.action||'—')}</td><td>${escapeHtml(a.details||'—')}</td></tr>`).join(''):'<tr><td colspan="4" class="muted">No run history yet.</td></tr>'}</tbody></table></div><div class="modal-actions"><button class="secondary close-modal">Close</button></div>`);}
  function loadSequenceTemplate(){if(!canOperate()){showToast('QA hanya dapat melihat sequence.');return;}if(!state.methods.length){showToast('Simpan Analytical Method terlebih dahulu.');return;}const method=state.methods[0];state.sequence=[{sample:'STD-001',type:'Standard',vial:'1',volume:10,methodId:method.id,method:method.name,expectedRT:4.8,status:'Pending',createdBy:actorLabel(),createdAt:now()},{sample:'SMP-001',type:'Sample',vial:'2',volume:10,methodId:method.id,method:method.name,expectedRT:4.8,status:'Pending',createdBy:actorLabel(),createdAt:now()},{sample:'BLK-001',type:'Blank',vial:'3',volume:10,methodId:method.id,method:method.name,expectedRT:null,status:'Pending',createdBy:actorLabel(),createdAt:now()}];saveSequence();renderSequence();addAudit('Sequence template loaded','3 injection template loaded into SEQ-001');showToast('Sequence template loaded successfully.');}
  function openImportSequenceModal(){if(!canOperate()){showToast('QA hanya dapat melihat sequence.');return;}showModal(`<h3>Import Injections</h3><div class="upload-modal-drop" id="sequenceImportDrop"><i data-lucide="upload"></i><b>Drag and drop your file here</b><span>or <u>browse files</u></span><small>Supported formats: CSV, XLSX (Max 10 MB/file)</small></div><input id="sequenceImportInput" type="file" hidden accept=".csv,.xlsx,.xls"><div id="sequenceImportFile" class="pending-file-list"></div><div class="modal-actions"><button class="secondary close-modal">Cancel</button><button class="primary" id="confirmSequenceImport">Import</button></div>`);const input=$('sequenceImportInput');$('sequenceImportDrop')?.addEventListener('click',()=>input.click());input?.addEventListener('change',()=>{const f=input.files?.[0];if(f){$('sequenceImportFile').innerHTML=`<div class="pending-file"><i data-lucide="file-spreadsheet"></i><span><b>${escapeHtml(f.name)}</b><small>${formatFileSize(f.size)}</small></span><div class="upload-progress"><i></i></div></div>`;refreshIcons();}});$('confirmSequenceImport')?.addEventListener('click',()=>{const f=input.files?.[0];if(!f){showToast('Choose a CSV or XLSX file first.');return;}if(!state.methods.length){showToast('Simpan Analytical Method terlebih dahulu.');return;}const method=state.methods[0];const add=(items)=>{state.sequence.push(...items);saveSequence();renderSequence();addAudit('Sequence imported',`${f.name} imported into SEQ-001`);closeModal();showToast('Injections imported successfully.');};if(f.name.toLowerCase().endsWith('.csv')){const reader=new FileReader();reader.onload=()=>{const lines=String(reader.result).split(/\r?\n/).filter(Boolean);const parsed=lines.slice(1).map((line,i)=>{const c=line.split(',');return {sample:c[0]||`SMP-${String(i+1).padStart(3,'0')}`,type:c[1]||'Sample',vial:c[2]||String(i+1),volume:Number(c[3])||10,methodId:method.id,method:method.name,expectedRT:Number(c[4])||4.8,status:'Pending',createdBy:actorLabel(),createdAt:now()};});add(parsed.length?parsed:[{sample:'SMP-001',type:'Sample',vial:String(state.sequence.length+1),volume:10,methodId:method.id,method:method.name,expectedRT:4.8,status:'Pending',createdBy:actorLabel(),createdAt:now()}]);};reader.readAsText(f);}else{add([{sample:'SMP-001',type:'Sample',vial:String(state.sequence.length+1),volume:10,methodId:method.id,method:method.name,expectedRT:4.8,status:'Pending',createdBy:actorLabel(),createdAt:now()}]);}});}
  function openSequenceAttachmentModal(){
    if(!(isQC()||currentIsAdmin())){showToast('Only QC or Admin can upload sequence attachments.');return;}
    showModal(`<div class="sequence-modal sequence-upload-modal"><div class="sequence-modal-head"><h3>Upload Attachments</h3><button class="icon-button close-modal" type="button" aria-label="Close">×</button></div><div class="sequence-modal-drop" id="sequenceModalDrop"><i data-lucide="upload"></i><b>Choose Files</b><span>Drag & drop files here or click to browse</span><small>Supported formats: PDF, CSV, XLSX, DOCX, PNG, JPG (Max 10 MB/file)</small></div><input id="sequenceModalFile" type="file" hidden multiple accept=".pdf,.csv,.xlsx,.docx,.png,.jpg,.jpeg"><div id="sequenceModalSelected" class="pending-file-list"></div><div class="modal-actions sequence-modal-actions"><button class="secondary close-modal" type="button">Cancel</button><button class="primary" id="uploadSequenceModalBtn" type="button">Attach Files</button></div></div>`);
    const input=$('sequenceModalFile');
    const renderSelected=()=>{const files=Array.from(input.files||[]);$('sequenceModalSelected').innerHTML=files.length?files.map(f=>`<div class="sequence-selected-file"><span class="file-type-icon"><i data-lucide="${fileIconName(f)}"></i></span><div><b>${escapeHtml(f.name)}</b><small>${formatFileSize(f.size)}</small></div><span class="file-pending-status">Selected</span></div>`).join(''):'<div class="muted sequence-no-files">No files selected.</div>';refreshIcons();};
    $('sequenceModalDrop')?.addEventListener('click',()=>input.click());
    input?.addEventListener('change',renderSelected);
    $('uploadSequenceModalBtn')?.addEventListener('click',async()=>{const files=Array.from(input.files||[]);if(!files.length){showToast('Choose at least one file.');return;}const created=await attachFiles(files,{activity:'Sequence',recordType:'sequence',recordId:'SEQ-001'});if(!created.length)return;closeModal();renderSequenceAttachments();showModal(`<div class="sequence-success-modal"><div class="sequence-success-icon"><i data-lucide="check"></i></div><h3>Files Uploaded Successfully</h3><p>${created.length} file${created.length>1?'s have':' has'} been attached to this sequence.</p><button class="primary" id="sequenceUploadSuccessOk" type="button">OK</button></div>`);$('sequenceUploadSuccessOk')?.addEventListener('click',closeModal);refreshIcons();});
    refreshIcons();
  }
  function generateChromatogram(injection,index){
    const scale=injection.type==="Blank"?0.04:injection.type==="Standard"?1:(0.98+((index%3)*0.01));
    const points=[];
    for(let i=0;i<=700;i++){
      const rt=2+i*0.01,baseline=120+10*Math.sin(i/17)+5*Math.sin(i/7);
      const p1=125280*scale*Math.exp(-Math.pow((rt-5.82)/0.075,2));
      const p2=2100*scale*Math.exp(-Math.pow((rt-7.11)/0.10,2));
      points.push({rt:Number(rt.toFixed(2)),response:Number((baseline+p1+p2).toFixed(2))});
    }
    const mainId=injection.type==="Sample"?"Sample":injection.type==="Standard"?"Standard":"Sample";const peaks=scale>0.1?[{peak:1,rt:5.82,area:Math.round(985000*scale),areaPct:98.5,height:Math.round(125400*scale),identification:mainId},{peak:2,rt:7.11,area:Math.round(15000*scale),areaPct:1.5,height:Math.round(2100*scale),identification:"Impurity"}]:[];
    const method=getMethodById(injection.methodId);
    return {sample:injection.sample,type:injection.type,vial:injection.vial,method:injection.method||method?.name||$("methodName")?.value||"Assay by HPLC-UV",methodId:injection.methodId||method?.id||null,volume:injection.volume??method?.injectionVolume??Number($("injectionVolume")?.value||10),runningTime:method?.runningTime??9,column:method?.column||injection.methodDetails?.column||"",mobilePhase1:method?.mobilePhase1||injection.methodDetails?.mobilePhase1||"",mobilePhase2:method?.mobilePhase2||injection.methodDetails?.mobilePhase2||"",flowRate:method?.flowRate??injection.methodDetails?.flowRate??Number($("flowRate")?.value||1),wavelength:method?.wavelength??injection.methodDetails?.wavelength??Number($("methodWavelength")?.value||243),generatedAt:now(),generatedBy:actorLabel(),points,peaks};
  }
  function runSequence(){
    if(!canOperate()){showToast("Hanya QC yang dapat menjalankan sequence.");return;}
    if(!state.sequence.length){showToast("Tambahkan injection terlebih dahulu.");return;}
    const all=getChromatograms();
    state.sequence=state.sequence.map((s,i)=>{const next={...s,status:"Completed"};all[s.sample]=generateChromatogram(next,i);return next;});
    saveChromatograms(all);localStorage.setItem("hplc_sequence",JSON.stringify(state.sequence));
    addAudit("Sequence executed",`${state.sequence.length} injections completed and chromatogram data stored`);
    renderSequence();renderChromatogram();showToast("Sequence completed. Chromatogram data stored.");
  }
  function renderChromatogram(){
    const data=getChromatograms(),keys=Object.keys(data),select=$("chromSampleSelect");
    if(!keys.length){
      $("chromEmpty").classList.remove("hidden");$("chromSvg").classList.add("hidden");
      $("peakTableBody").innerHTML='<tr><td colspan="6" class="muted">No chromatogram data available. Run a sequence first.</td></tr>';
      select.innerHTML="<option>No data</option>";$("chromMeta").textContent="";$("chromLegend").textContent="No chromatogram data available.";return;
    }
    $("chromEmpty").classList.add("hidden");$("chromSvg").classList.remove("hidden");
    const current=select.value&&data[select.value]?select.value:keys[0];
    select.innerHTML=keys.map(k=>`<option value="${escapeHtml(k)}">${escapeHtml(k)} — ${escapeHtml(data[k].type||"")}</option>`).join("");select.value=current;
    const d=data[current],points=Array.isArray(d.points)?d.points:[];
    if(!points.length){$("chromSvg").classList.add("hidden");$("chromEmpty").classList.remove("hidden");$("chromEmpty").textContent="No chromatogram data available. Run a sequence first.";$("peakTableBody").innerHTML='<tr><td colspan="6" class="muted">No chromatogram data available. Run a sequence first.</td></tr>';return;}
    const min=Math.min(...points.map(p=>Number(p.response)||0)),max=Math.max(...points.map(p=>Number(p.response)||0)),span=Math.max(1,max-min);
    $("chromLine").setAttribute("points",points.map((p,i)=>`${(i/(Math.max(1,points.length-1)))*900},${290-(((Number(p.response)||0)-min)/span)*270}`).join(" "));
    $("chromMeta").textContent=`${d.sample} · ${d.type} · vial ${d.vial} · Generated ${d.generatedAt}`;
    const peaks=Array.isArray(d.peaks)?d.peaks:[];
    $("peakTableBody").innerHTML=peaks.length?peaks.map(p=>`<tr><td>${p.peak}</td><td>${Number(p.rt).toFixed(2)}</td><td>${Number(p.area).toLocaleString()}</td><td>${Number(p.areaPct).toFixed(2)}%</td><td>${Number(p.height).toLocaleString()}</td><td>${escapeHtml(p.identification||"Sample")}</td></tr>`).join(""):'<tr><td colspan="6">No reportable peaks detected.</td></tr>';
    const p=peaks[0];$("chromLegend").textContent=p?`Retention time: ${Number(p.rt).toFixed(2)} min · Peak area: ${Number(p.area).toLocaleString()} · Height: ${Number(p.height).toLocaleString()} · ${p.identification||"Sample"}`:"No reportable peaks";
  }

  function renderAttachments(){
    const items=getAttachments();
    if($("attachmentCountLabel")) $("attachmentCountLabel").textContent=items.length;
    const rows=items.map(f=>`<div class="attachment-file-row"><div class="attachment-file-main"><span class="file-type-icon"><i data-lucide="${fileIconName(f)}"></i></span><div><b>${escapeHtml(f.name)}</b><small>${escapeHtml(f.activity||"Other")} · ${escapeHtml(fileTypeLabel(f))} · ${formatFileSize(f.size)}</small></div></div><div class="attachment-file-meta"><span>${escapeHtml(f.user||"—")}</span><span>${escapeHtml(f.time||"—")}</span></div><div class="attachment-file-menu-wrap"><button class="icon-button attachment-menu-btn" type="button" data-attachment-menu="${escapeHtml(f.id)}" aria-label="File actions"><i data-lucide="more-vertical"></i></button><div class="attachment-options-menu hidden" data-attachment-options="${escapeHtml(f.id)}"><button type="button" data-attachment-view="${escapeHtml(f.id)}"><i data-lucide="eye"></i> View</button><button type="button" data-attachment-download="${escapeHtml(f.id)}"><i data-lucide="download"></i> Download</button>${canDeleteAttachment(f)?`<button type="button" data-attachment-rename="${escapeHtml(f.id)}"><i data-lucide="pencil"></i> Rename</button><button type="button" class="danger-text" data-attachment-delete="${escapeHtml(f.id)}"><i data-lucide="trash-2"></i> Delete</button>`:""}</div></div></div>`).join("");
    $("attachmentList").innerHTML=items.length?`<div class="attachment-file-table"><div class="attachment-table-head"><span>FILE NAME</span><span>UPLOADED BY</span><span>DATE / TIME</span><span>ACTION</span></div>${rows}</div>`:'<div class="muted attachment-empty">No supporting evidence attached.</div>';
    document.querySelectorAll("[data-attachment-view]").forEach(b=>b.addEventListener("click",()=>{closeAttachmentMenus();openStoredAttachment(b.dataset.attachmentView,"view");}));
    document.querySelectorAll("[data-attachment-download]").forEach(b=>b.addEventListener("click",()=>{closeAttachmentMenus();openStoredAttachment(b.dataset.attachmentDownload,"download");}));
    document.querySelectorAll("[data-attachment-delete]").forEach(b=>b.addEventListener("click",()=>{closeAttachmentMenus();deleteAttachmentById(b.dataset.attachmentDelete);}));
    document.querySelectorAll("[data-attachment-rename]").forEach(b=>b.addEventListener("click",()=>{closeAttachmentMenus();renameAttachmentById(b.dataset.attachmentRename);}));
    document.querySelectorAll("[data-attachment-menu]").forEach(b=>b.addEventListener("click",e=>{e.stopPropagation();const id=b.dataset.attachmentMenu;const menu=$(`[data-attachment-options="${CSS.escape(id)}"]`);const wasOpen=menu&&!menu.classList.contains("hidden");closeAttachmentMenus();if(menu&&!wasOpen)menu.classList.remove("hidden");}));
    refreshIcons();
  }
  function closeAttachmentMenus(){document.querySelectorAll("[data-attachment-options]").forEach(m=>m.classList.add("hidden"));}
  document.addEventListener("click",e=>{if(!e.target.closest(".attachment-file-menu-wrap"))closeAttachmentMenus();});
  let mainPendingFiles=[];
  function renderMainPending(){const el=$("attachmentPendingFiles");if(!el)return;const summary=$("attachmentFileSummary");if(summary)summary.textContent=mainPendingFiles.length?`${mainPendingFiles.length} file(s) selected`:"No file chosen";el.innerHTML=pendingRows(mainPendingFiles)+(mainPendingFiles.length?`<div class="pending-actions"><span class="muted">${mainPendingFiles.length} file(s) selected</span></div>`:"");el.querySelectorAll(".pending-remove").forEach(b=>b.addEventListener("click",()=>{mainPendingFiles.splice(Number(b.dataset.pendingIndex),1);renderMainPending();}));refreshIcons();}
  async function attachMainPending(){if(!(isQC()||currentIsAdmin())){showToast("Only QC or Admin can upload attachments.");return;}const activity=$("attachmentActivity").value;if(!activity){showToast("Select Related Activity first.");return;}if(!mainPendingFiles.length){showToast("Choose at least one file.");return;}const files=[...mainPendingFiles];showModal(`<div class="upload-modal-spinner"><div class="assay-spinner"></div><h3>Uploading files...</h3><p class="muted">Please wait while your files are being uploaded.</p><div class="assay-progress"><i id="mainUploadProgress"></i></div><div class="upload-progress-label"><span id="mainUploadCount">0 of ${files.length} files uploaded</span><b id="mainUploadPct">0%</b></div><button class="secondary" id="cancelMainUpload">Cancel</button></div>`);let pct=0;let cancelled=false;$("cancelMainUpload")?.addEventListener("click",()=>{cancelled=true;closeModal();});const timer=setInterval(()=>{if(cancelled)return; pct=Math.min(90,pct+Math.ceil(90/files.length));if($("mainUploadProgress"))$("mainUploadProgress").style.width=pct+"%";if($("mainUploadPct"))$("mainUploadPct").textContent=pct+"%";if($("mainUploadCount"))$("mainUploadCount").textContent=`${Math.min(files.length,Math.max(1,Math.floor(pct/90*files.length)))} of ${files.length} files uploaded`;},140);const created=await attachFiles(files,{activity,recordType:"general",recordId:activity});clearInterval(timer);if(cancelled)return;closeModal();mainPendingFiles=[];$("attachmentInput").value="";$("attachmentActivity").value="";renderMainPending();renderAttachments();showToast(created.length?`${created.length} file(s) uploaded successfully.`:"No file attached.");}

  function getAssayInjectionKeys(){
    const data=getChromatograms();
    return Object.keys(data).filter(k=>data[k]&&Array.isArray(data[k].points));
  }
  function getAssaySelectedKey(){
    const keys=getAssayInjectionKeys();
    if(!keys.length)return null;
    const sel=$("assayInjectionSelect");
    if(sel && keys.includes(sel.value))return sel.value;
    return keys.find(k=>String(k).toUpperCase().includes("SAMPLE"))||keys[0];
  }
  function getAssaySelectedData(){
    const key=getAssaySelectedKey();
    return key?getChromatograms()[key]:null;
  }
  function getAssayMainPeak(d){return Array.isArray(d?.peaks)&&d.peaks.length?d.peaks[0]:null;}
  function renderAssayChart(d){
    const svg=$("assayChromSvg"),line=$("assayChromLine"),grid=$("assayGrid"),labels=$("assayPeakLabels");
    if(!svg||!line)return;
    grid.innerHTML="";labels.innerHTML="";
    const points=Array.isArray(d?.points)?d.points:[];
    if(!points.length){line.setAttribute("points","");return;}
    const left=45,right=680,top=20,bottom=235;
    const minRt=Math.min(...points.map(p=>Number(p.rt)||0)),maxRt=Math.max(...points.map(p=>Number(p.rt)||0));
    const minY=Math.min(...points.map(p=>Number(p.response)||0)),maxY=Math.max(...points.map(p=>Number(p.response)||0));
    const span=Math.max(1,maxY-minY), rtSpan=Math.max(.01,maxRt-minRt);
    for(let i=0;i<=5;i++){
      const y=bottom-(i/5)*(bottom-top); grid.innerHTML+=`<line x1="${left}" y1="${y}" x2="${right}" y2="${y}" class="assay-grid-line"/>`;
      const val=(minY+(i/5)*span).toFixed(0); grid.innerHTML+=`<text x="6" y="${y+3}" font-size="9" fill="#68738a">${val}</text>`;
    }
    for(let i=0;i<=6;i++){
      const x=left+(i/6)*(right-left); const val=(minRt+(i/6)*rtSpan).toFixed(1); grid.innerHTML+=`<line x1="${x}" y1="${top}" x2="${x}" y2="${bottom}" class="assay-grid-line"/><text x="${x-8}" y="252" font-size="9" fill="#68738a">${val}</text>`;
    }
    line.setAttribute("points",points.map(p=>{
      const x=left+(((Number(p.rt)||minRt)-minRt)/rtSpan)*(right-left);
      const y=bottom-(((Number(p.response)||minY)-minY)/span)*(bottom-top);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    }).join(" "));
    line.setAttribute("class","assay-chrom-line");
    const peaks=Array.isArray(d.peaks)?d.peaks:[];
    peaks.forEach((pk,i)=>{
      const x=left+((Number(pk.rt)-minRt)/rtSpan)*(right-left);
      const near=points.reduce((best,p)=>Math.abs(Number(p.rt)-Number(pk.rt))<Math.abs(Number(best.rt)-Number(pk.rt))?p:best,points[0]);
      const y=bottom-(((Number(near.response)||minY)-minY)/span)*(bottom-top);
      labels.innerHTML+=`<text x="${Math.max(left,Math.min(right-5,x-3))}" y="${Math.max(16,y-8)}" class="assay-peak-label">${i+1}</text>`;
    });
    $("assayPeakLabelsToggle")?.addEventListener("change",()=>labels.classList.toggle("hidden",!$("assayPeakLabelsToggle").checked));
  }
  function renderAssayPeakTable(d){
    const body=$("assayPeakBody");if(!body)return;
    const peaks=Array.isArray(d?.peaks)?d.peaks:[];
    body.innerHTML=peaks.length?peaks.map((p,i)=>`<tr class="${i===0?"selected":""}"><td><input class="peak-radio" type="radio" name="assayPeak" value="${i}" ${i===0?"checked":""}></td><td>${i+1}</td><td>${Number(p.rt).toFixed(2)}</td><td>${Number(p.area).toLocaleString()}</td><td>${Number(p.height).toLocaleString()}</td><td>${escapeHtml(p.identification||"Unknown")}</td></tr>`).join(""): '<tr><td colspan="6" class="muted">No reportable peaks detected.</td></tr>';
    body.querySelectorAll(".peak-radio").forEach(r=>r.addEventListener("change",()=>{
      body.querySelectorAll("tr").forEach(x=>x.classList.remove("selected"));r.closest("tr")?.classList.add("selected");
      const pk=peaks[Number(r.value)];if(pk){$("sampleArea").value=Number(pk.area)||0;updateAssayResultPreview();}
    }));
  }
  function updateAssayResultPreview(){
    const sample=Number($("sampleArea")?.value),standard=Number($("standardArea")?.value),conc=Number($("standardConc")?.value),df=Number($("assayDilutionFactor")?.value||1);
    if(!sample||!standard||!conc)return;
    const concentration=sample/standard*conc*df,assay=concentration/conc*100;
    if($("assayConcentration"))$("assayConcentration").textContent=concentration.toFixed(3);
    if($("assayPercent"))$("assayPercent").textContent=`${assay.toFixed(2)}%`;
    if($("assaySpecificationResult"))$("assaySpecificationResult").textContent=(assay>=95&&assay<=105)?"Within specification":"Out of specification";
    if($("assayPassBadge")){const el=$("assayPassBadge");el.textContent=assay>=95&&assay<=105?"PASS":"FAIL";el.className=`case-status ${assay>=95&&assay<=105?"pass":"fail"}`;}
  }
  function renderAssayHistory(currentSample){
    const body=$("assayHistoryBody");if(!body)return;
    const data=getChromatograms(),rows=[];
    Object.entries(data).forEach(([key,d])=>{
      if(!currentSample || d.sample===currentSample){
        const pk=getAssayMainPeak(d),seqRow=state.sequence.find(x=>x.sample===key),calc=key===currentSample?JSON.parse(localStorage.getItem("hplc_calculation")||"null"):null;
        rows.push({key,d,pk,calc,seqRow});
      }
    });
    const currentCalc=JSON.parse(localStorage.getItem("hplc_calculation")||"null");
    body.innerHTML=rows.length?rows.map((r,i)=>{const assay=r.key===getAssaySelectedKey()&&currentCalc?Number(currentCalc.assay):null;const rev=state.dataReview?.status||"—";return `<tr><td>${i+1}</td><td>${escapeHtml(r.key)}</td><td>${r.pk?Number(r.pk.rt).toFixed(2):"—"}</td><td>${r.pk?Number(r.pk.area).toLocaleString():"—"}</td><td>${assay!==null?assay.toFixed(2):"—"}</td><td>${assay!==null?(assay>=95&&assay<=105?"PASS":"FAIL"):"—"}</td><td>${r.key===getAssaySelectedKey()?escapeHtml(rev):"—"}</td><td>${r.key===getAssaySelectedKey()&&state.dataReview?.reviewer?escapeHtml(state.dataReview.reviewer):"—"}</td><td>${r.key===getAssaySelectedKey()&&state.dataReview?.reviewedAt?escapeHtml(state.dataReview.reviewedAt):"—"}</td></tr>`;}).join(""):'<tr><td colspan="9" class="muted">No previous results available for this sample.</td></tr>';
  }
  function renderAssayPage(){
    const select=$("assayInjectionSelect");
    const keys=getAssayInjectionKeys();
    if(select){const current=select.value;select.innerHTML=keys.length?keys.map(k=>`<option value="${escapeHtml(k)}">${escapeHtml(k)}</option>`).join(""):'<option value="">No chromatogram data</option>';if(keys.includes(current))select.value=current;else if(keys.length)select.value=getAssaySelectedKey();}
    const d=getAssaySelectedData(),key=getAssaySelectedKey();
    if(!d){renderAssayChart(null);renderAssayPeakTable(null);renderAssayHistory(null);return;}
    const seq=state.sequence.find(x=>x.sample===key)||state.sequence.find(x=>x.sample===d.sample);
    const pk=getAssayMainPeak(d);
    $("assaySequence")&&( $("assaySequence").textContent=seq?.sequenceName||"SEQ-001");
    $("assayInjectionLabel")&&($("assayInjectionLabel").textContent=seq?`${(state.sequence.indexOf(seq)+1)||1} - ${d.sample}`:d.sample);
    $("assaySampleId")&&($("assaySampleId").textContent=d.sample||key);
    $("assaySampleType")&&($("assaySampleType").textContent=d.type||"Sample");
    $("assayMethod")&&($("assayMethod").textContent=d.method||"Assay by HPLC-UV");
    $("assayRunTime")&&($("assayRunTime").textContent=d.generatedAt||"—");
    $("assayInfoSample")&&($("assayInfoSample").textContent=d.sample||key);
    $("assayInfoType")&&($("assayInfoType").textContent=d.type||"—");
    $("assayInfoVial")&&($("assayInfoVial").textContent=d.vial||"—");
    $("assayInfoVolume")&&($("assayInfoVolume").textContent=`${d.volume??10} µL`);
    $("assayDataFile")&&($("assayDataFile").textContent=`${d.sample||key}_${String(d.generatedAt||"").replace(/[^0-9]/g,"")}.dat`);
    $("assayWavelength")&&($("assayWavelength").textContent=d.wavelength||243);
    if(pk){$("sampleArea").value=Number(pk.area)||0;}
    const standard=Object.values(getChromatograms()).find(x=>x.type==="Standard"&&Array.isArray(x.peaks)&&x.peaks.length);if(standard?.peaks?.[0])$("standardArea").value=Number(standard.peaks[0].area)||1000000;
    renderAssayChart(d);renderAssayPeakTable(d);updateAssayResultPreview();renderAssayHistory(d.sample||key);
  }

  function calculateResult(){
    const sample=Number($("sampleArea").value),standard=Number($("standardArea").value),conc=Number($("standardConc").value),df=Number($("assayDilutionFactor")?.value||1);
    if(!sample||!standard||!conc||!df){showToast("Lengkapi data perhitungan.");return;}
    const concentration=sample/standard*conc*df,assay=concentration/conc*100;
    const record={concentration,assay,time:now(),user:actorLabel(),sampleArea:sample,standardArea:standard,standardConc:conc,dilutionFactor:df,injection:getAssaySelectedKey()};
    localStorage.setItem("hplc_calculation",JSON.stringify(record));
    $("calculationResult")&&($("calculationResult").innerHTML=`<b>Sample concentration:</b> ${concentration.toFixed(3)} µg/mL<br><b>Assay:</b> ${assay.toFixed(2)}%`);
    updateAssayResultPreview();renderAssayHistory(getAssaySelectedData()?.sample||getAssaySelectedKey());
    addAudit("Calculation performed",`Assay result ${assay.toFixed(2)}%`);
  }
  function openSaveAssayResultModal(){
    const c=JSON.parse(localStorage.getItem("hplc_calculation")||"null");
    if(!c){showToast("Calculate the result first.");return;}
    showModal(`<div class="assay-result-success"><div class="success-icon"><i data-lucide="check"></i></div><h3>Result saved successfully.</h3><p class="assay-modal-note">The assay result has been saved to the controlled data review record.</p></div><div class="modal-actions"><button class="primary close-modal">Close</button></div>`);
    addAudit("Assay result saved",`Assay result ${Number(c.assay).toFixed(2)}% saved`);
  }
  function openCalculateModal(){
    showModal(`<div class="assay-calculating"><div class="assay-spinner"></div><h3>Calculating...</h3><p class="assay-modal-note">Please wait while the system calculates the assay result.</p></div>`);
    setTimeout(()=>{closeModal();calculateResult();showToast("Assay result calculated successfully.");},850);
  }
  function openDownloadAssayResultModal(){
    const c=JSON.parse(localStorage.getItem("hplc_calculation")||"null");
    if(!c){showToast("Calculate the result first.");return;}
    showModal(`<h3>Download Result Summary</h3><p class="assay-modal-note">Select content to include in the assay result summary.</p><div class="assay-modal-checks"><label class="assay-modal-check"><input id="assayDlChrom" type="checkbox" checked> Chromatogram plot</label><label class="assay-modal-check"><input id="assayDlPeak" type="checkbox" checked> Peak table</label><label class="assay-modal-check"><input id="assayDlCalc" type="checkbox" checked> Calculation parameters</label><label class="assay-modal-check"><input id="assayDlSample" type="checkbox" checked> Sample information</label></div><label>File format<select id="assayDlFormat"><option>PDF</option><option>CSV</option></select></label><div class="modal-actions"><button class="secondary close-modal">Cancel</button><button class="primary" id="assayDlStart"><i data-lucide="download"></i> Download</button></div>`);
    $("assayDlStart")?.addEventListener("click",()=>{
      const fmt=$("assayDlFormat").value;
      showModal(`<div class="assay-calculating"><div class="assay-spinner"></div><h3>Generating ${fmt}...</h3><p class="assay-modal-note">Please wait while the system prepares the result summary.</p></div>`);
      setTimeout(()=>{
        const text=`HPLC-UV Assay Result\nInjection: ${c.injection||"—"}\nSample concentration: ${Number(c.concentration).toFixed(3)} µg/mL\nAssay: ${Number(c.assay).toFixed(2)}%\nTime: ${c.time}`;
        const blob=new Blob([text],{type:fmt==="CSV"?"text/csv":"application/pdf"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`HPLC-UV_Assay_Result.${fmt.toLowerCase()==="pdf"?"pdf":"csv"}`;a.click();URL.revokeObjectURL(a.href);closeModal();showToast("Assay result summary downloaded successfully.");addAudit("Assay result downloaded","Analytical assay result exported");
      },900);
    });
  }
  function openAssayAttachmentModal(){
    if(!(isQC()||currentIsAdmin())){showToast("Only QC or Admin can upload assay attachments.");return;}
    showModal(`<h3>Add Attachment</h3><div id="assayUploadDrop" class="assay-upload-drop"><i data-lucide="upload-cloud"></i><b>Drag and drop files here</b><br><span>or browse files</span><small>Supported formats: PDF, CSV, PNG, JPG, XLSX, DOCX (Max 10 MB/file)</small></div><input id="assayModalFile" type="file" hidden multiple accept=".pdf,.csv,.png,.jpg,.jpeg,.xlsx,.docx"><div id="assayModalFileList"></div><div class="modal-actions"><button class="secondary close-modal">Cancel</button><button class="primary" id="assayModalUpload">Upload</button></div>`);
    const input=$("assayModalFile"),drop=$("assayUploadDrop"),list=$("assayModalFileList");
    const render=()=>{const fs=Array.from(input.files||[]);list.innerHTML=fs.length?fs.map(f=>`<div class="assay-upload-file"><span><b>${escapeHtml(f.name)}</b><br><small>${formatFileSize(f.size)}</small></span></div>`).join(""):"";};
    drop.addEventListener("click",()=>input.click());input.addEventListener("change",render);drop.addEventListener("dragover",e=>{e.preventDefault();drop.classList.add("active")});drop.addEventListener("dragleave",()=>drop.classList.remove("active"));drop.addEventListener("drop",e=>{e.preventDefault();drop.classList.remove("active");input.files=e.dataTransfer.files;render();});
    $("assayModalUpload")?.addEventListener("click",async()=>{const fs=Array.from(input.files||[]);if(!fs.length){showToast("Choose at least one file.");return;}showModal(`<div class="assay-calculating"><div class="assay-spinner"></div><h3>Uploading...</h3><div class="assay-progress"><i id="assayUploadProgress"></i></div></div>`);let pct=0;const timer=setInterval(()=>{pct=Math.min(100,pct+20);$("assayUploadProgress")&&($("assayUploadProgress").style.width=pct+"%");},120);const created=await attachFiles(fs,{activity:"Assay / Data Review",recordType:"assay",recordId:"AR-001"});clearInterval(timer);closeModal();window._assayPendingFiles=[];renderAssayAttachments();showToast(created.length?"File uploaded successfully.":"Attachment upload failed.");});
  }

  function renderDataReview(){
    const r=state.dataReview;
    $("dataReviewStatus").textContent=r?.status||"DRAFT";$("dataReviewReviewer").textContent=r?.reviewer||"—";$("dataReviewTime").textContent=r?.reviewedAt||"—";$("dataReviewComment").textContent=r?.comment||"—";$("dataReviewSignature").textContent=r?.signature||"—";
    try{const c=JSON.parse(localStorage.getItem("hplc_calculation")||"null");if(c){$("calculationResult").innerHTML=`<b>Sample concentration:</b> ${Number(c.concentration).toFixed(3)} µg/mL<br><b>Assay:</b> ${Number(c.assay).toFixed(2)}%`;}}catch{}
    $("dataReviewQAButton").classList.toggle("hidden",!(isQA()&&r?.status==="Pending QA Review"));
    renderAssayPage();
  }
  function submitDataReview(){
    if(!isQC()){showToast("QC menyiapkan data review untuk QA.");return;}
    state.dataReview={status:"Pending QA Review",submittedBy:actorLabel(),submittedAt:now(),reviewer:"—",reviewedAt:"—",comment:"—",signature:"—"};
    localStorage.setItem("hplc_data_review",JSON.stringify(state.dataReview));addAudit("Data Review submitted","QC submitted analytical result for QA review");renderDataReview();showToast("Data Review submitted for QA review.");
  }


  function openDataReviewQA(){
    if(!isQA()||state.dataReview?.status!=="Pending QA Review"){showToast("Tidak ada Data Review yang menunggu QA.");return;}
    showModal(`<h3>QA Review — Data Review</h3><p><b>Submitted by:</b> ${escapeHtml(state.dataReview.submittedBy)}</p><p><b>Submitted at:</b> ${escapeHtml(state.dataReview.submittedAt)}</p><label>QA Review Comment <span class="required">*</span></label><textarea id="drQAComment" placeholder="Enter review comment..."></textarea><label>QA password for electronic signature</label><input id="drQAPassword" type="password" placeholder="Enter QA password"><div id="drQAError" class="error-message"></div><div class="modal-actions"><button class="secondary close-modal">Cancel</button><button class="secondary" id="drRevisionBtn">Request Revision</button><button class="primary" id="drApproveBtn">Approve & Sign</button></div>`);
    const finish=approved=>{
      const c=$("drQAComment").value.trim(),pw=$("drQAPassword").value;
      if(!c){$("drQAError").textContent="Review comment wajib diisi.";return;}
      if(approved&&pw!==USERS.qa.password){$("drQAError").textContent="Password QA tidak sesuai.";return;}
      state.dataReview.status=approved?"Approved":"Revision Required";state.dataReview.reviewer=actorLabel();state.dataReview.reviewedAt=now();state.dataReview.comment=c;state.dataReview.signature=approved?`${actorLabel()} · ${state.dataReview.reviewedAt}`:"—";
      localStorage.setItem("hplc_data_review",JSON.stringify(state.dataReview));addAudit("Data Review QA review",approved?"Data Review APPROVED":"Data Review returned for revision");closeModal();renderDataReview();showToast(approved?"Data Review approved.":"Revision required.");
    };
    $("drApproveBtn")?.addEventListener("click",()=>finish(true));$("drRevisionBtn")?.addEventListener("click",()=>finish(false));
  }
  function applyRoleControls(){
    const qa=isQA();
    ["methodName","columnName","elutionMode","mobilePhase1","mobilePhase2","mobilePhaseAPercent","mobilePhaseBPercent","flowRate","methodWavelength","injectionVolume","columnTemperature","runningTime","pumpFlow","instrumentInjectionVolume","ovenTemp","uvWavelength","detectorTestValue","sampleArea","standardArea","standardConc"].forEach(id=>{const el=$(id);if(el){el.disabled=qa;}});
    ["saveMethodBtn","newMethodBtn","addSequenceBtn","runSequenceBtn","verifyDetectorBtn","calculateBtn","addAttachmentBtn","methodAddAttachmentBtn","methodAddAttachmentBtn2","sequenceChooseFilesBtn","assayChooseFilesBtn","reportChooseFilesBtn","submitDataReviewBtn","addGradientRowBtn","saveGradientBtn","addURSBtn","addValidationBtn"].forEach(id=>{const el=$(id);if(el)el.disabled=qa;});
    if($("resetAllDataBtn")) $("resetAllDataBtn").disabled=!isAdmin();
    if($("methodStatus")){Array.from($("methodStatus").options).forEach(o=>{o.disabled=qa&&o.value!=="Approved";});}
    updateMethodApprovalUI();
    $("submitDataReviewBtn").textContent=qa?"QC-only: Submit for QA Review":"Submit for QA Review";
    $("dataReviewQAButton").classList.toggle("hidden",!qa||state.dataReview?.status!=="Pending QA Review");
  }

  function getValidationCases(){
    return [...VALIDATION_CASES,...state.customValidationCases]
      .filter(x=>!state.deletedValidationCases.includes(x.id))
      .map(x=>state.validationOverrides[x.id]?{...x,...state.validationOverrides[x.id]}:x);
  }
  function getValidationCase(id){return getValidationCases().find(x=>x.id===id);}
  function saveCustomValidationCases(){localStorage.setItem("hplc_custom_validation_cases",JSON.stringify(state.customValidationCases));}
  function validationResult(r){return r?.testResult==="PASS"?"PASS":r?.testResult==="FAIL"?"FAIL":"PENDING";}
  function validationModule(t){
    const s = `${t.title} ${t.objective} ${t.input}`.toLowerCase();
    if(s.includes("wavelength") || s.includes("uv")) return "UV Detector";
    if(s.includes("pump") || s.includes("flow rate")) return "Pump";
    if(s.includes("oven") || s.includes("temperature")) return "Column Oven";
    if(s.includes("sequence")) return "Sequence";
    if(s.includes("calculation") || s.includes("data review") || s.includes("data preservation")) return "Data";
    if(s.includes("instrument")) return "Instrument";
    return "System";
  }

  function validationDisplayStatus(r){
    if(!r?.executedAt) return {label:"Not Tested", cls:"pending"};
    if(r.reviewStatus==="Pending QA Review") return {label:"Pending QA", cls:"review"};
    if(r.reviewStatus==="Approved") return {label:"Approved", cls:"approved"};
    if(r.reviewStatus==="Rejected") return {label:"Rejected", cls:"rejected"};
    if(r.testResult==="PASS") return {label:"Passed", cls:"pass"};
    if(r.testResult==="FAIL") return {label:"Failed", cls:"fail"};
    return {label:"In Progress", cls:"progress"};
  }

  function validationMatchesFilter(t, search, status, module){
    const r = state.validation[t.id];
    const text = `${t.id} ${t.title} ${t.phase} ${t.objective} ${t.criteria} ${t.input}`.toLowerCase();
    if(search && !text.includes(search.toLowerCase())) return false;
    if(module && validationModule(t)!==module) return false;
    if(status){
      const ds = validationDisplayStatus(r);
      if(status==="PENDING" && ds.label!=="Not Tested") return false;
      if(status==="PASS" && r?.testResult!=="PASS") return false;
      if(status==="FAIL" && r?.testResult!=="FAIL") return false;
      if(status==="REVIEW" && r?.reviewStatus!=="Pending QA Review") return false;
      if(status==="APPROVED" && r?.reviewStatus!=="Approved") return false;
      if(status==="REJECTED" && r?.reviewStatus!=="Rejected") return false;
      if(status==="INPROGRESS" && !(r?.executedAt && (!r.reviewStatus || r.reviewStatus==="Not Submitted"))) return false;
    }
    return true;
  }

  function renderValidationDetail(id){
    const panel = $("validationDetailPanel");
    const t = getValidationCase(id);
    if(!t){
      panel.innerHTML = '<div class="validation-detail-empty">Select a validation test to view its details.</div>';
      return;
    }
    validationSelectedId = id;
    const r = state.validation[id];
    const ds = validationDisplayStatus(r);
    const module = validationModule(t);
    const executed = Boolean(r?.executedAt);
    let action = "Execute Test";
    if(executed && r.reviewStatus==="Pending QA Review") action = isQA() ? "Review Test" : "Submit for QA Review";
    else if(executed && r.reviewStatus==="Rejected") action = isQC() ? "Execute Again" : "Review Test";
    else if(executed && r.testResult) action = isQC() ? "Execute Again" : "View Test";

    panel.innerHTML = `
      <div class="validation-detail-head">
        <div>
          <div class="validation-detail-id">${escapeHtml(t.id)}</div>
          <h3>${escapeHtml(t.title)}</h3>
          <p>${escapeHtml(t.objective)}</p>
        </div>
        <span class="validation-status-badge ${ds.cls}">${escapeHtml(ds.label)}</span>
      </div>
      <div class="validation-meta-grid">
        <div><span>Module</span><b>${escapeHtml(module)}</b></div>
        <div><span>Type</span><b>${escapeHtml(t.phase)}</b></div>
        <div><span>Priority</span><b>High</b></div>
        <div><span>Related URS</span><b>${escapeHtml(t.id.startsWith("IQ") ? "URS-001" : t.id.startsWith("OQ") ? "URS-002" : "URS-005")}</b></div>
        <div><span>Created Date</span><b>12 Sep 2026</b></div>
      </div>
      <div class="validation-detail-tabs">
        <button class="validation-detail-tab active" type="button">Test Procedure</button>
        <button class="validation-detail-tab" type="button">Results</button>
        <button class="validation-detail-tab" type="button">Attachments (${r?.evidence ? 1 : 0})</button>
        <button class="validation-detail-tab" type="button">History</button>
      </div>
      <div class="validation-procedure">
        <div class="validation-detail-section-title">Test Procedure</div>
        <div class="validation-procedure-box">
          <div class="validation-objective-row"><b>Requirement / Test Objective</b><span>${escapeHtml(t.objective)}</span></div>
          <div class="validation-objective-row"><b>Acceptance Criteria</b><span>${escapeHtml(t.criteria)}</span></div>
          <div class="validation-objective-row"><b>Test Input</b><span>${escapeHtml(t.input || "—")}</span></div>
        </div>
      </div>
      <div class="validation-result-box ${ds.cls}">
        <div class="validation-result-icon">${r?.testResult==="PASS"?"PASS":r?.testResult==="FAIL"?"FAIL":"PENDING"}</div>
        <div>
          <b>${r?.testResult ? `Test ${r.testResult==="PASS"?"Passed":"Failed"}` : "Test Not Executed"}</b>
          <small>${r?.actualResult ? escapeHtml(r.actualResult) : "No QC execution result has been recorded."}</small>
        </div>
      </div>
      <div class="validation-review-section">
        <div class="validation-detail-section-title">Data Review / Approval</div>
        <div class="validation-review-grid">
          <div><span>Review Status</span><b>${escapeHtml(r?.reviewStatus || "Not Tested")}</b></div>
          <div><span>Executed By</span><b>${escapeHtml(r?.executedBy || "—")}</b></div>
          <div><span>Executed On</span><b>${escapeHtml(r?.executedAt || "—")}</b></div>
          <div><span>Electronic Signature</span><b>${escapeHtml(r?.qaReview?.signature || "—")}</b></div>
          <div class="full"><span>QA Review Comment</span><b>${escapeHtml(r?.qaReview?.comment || state.validationReviews[id]?.comment || "—")}</b></div>
        </div>
      </div>
      <div class="validation-detail-actions">
        ${isQC() && !executed ? `<button class="secondary validation-detail-action" data-action="edit-definition" data-id="${escapeHtml(id)}">Edit</button><button class="secondary danger-action validation-detail-action" data-action="delete-definition" data-id="${escapeHtml(id)}">Delete</button><button class="primary validation-detail-action" data-action="execute" data-id="${escapeHtml(id)}">Run Test</button>` : ""}
        ${isQC() && executed && r.reviewStatus!=="Approved" ? `<button class="secondary validation-detail-action" data-action="edit-result" data-id="${escapeHtml(id)}">Edit Result</button>` : ""}
        ${isQC() && executed && r.reviewStatus!=="Pending QA Review" && r.reviewStatus!=="Approved" ? `<button class="secondary validation-detail-action" data-action="submit" data-id="${escapeHtml(id)}">Submit for QA Review</button>` : ""}
        ${isQA() && executed && r.reviewStatus==="Pending QA Review" ? `<button class="primary validation-detail-action" data-action="review" data-id="${escapeHtml(id)}">Review Test</button>` : ""}
        ${!isQC() && !isQA() ? `<span class="muted">View only</span>` : ""}
      </div>
    `;

    panel.querySelectorAll(".validation-detail-action").forEach(btn=>{
      const action = btn.dataset.action, vid = btn.dataset.id;
      if(action==="execute") openValidationRunConfirm(vid);
      if(action==="edit-result") openValidationModal(vid);
      if(action==="edit-definition") openValidationDefinitionModal(vid);
      if(action==="delete-definition") { const custom=state.customValidationCases.some(x=>x.id===vid); if(custom) deleteCustomValidation(vid); else deleteValidationCase(vid); }
      if(action==="submit") submitValidationForQA(vid);
      if(action==="review") openValidationReview(vid);
    });
  }

  function renderValidation(){
    const cases=getValidationCases();
    const search=$("validationSearch")?.value.trim()||"";
    const status=$("validationStatusFilter")?.value||"";
    const module=$("validationModuleFilter")?.value||"";
    const filtered=cases.filter(t=>validationMatchesFilter(t,search,status,module));
    const totalPages=Math.max(1,Math.ceil(filtered.length/VALIDATION_PAGE_SIZE));
    validationPage=Math.min(Math.max(validationPage,1),totalPages);
    const start=(validationPage-1)*VALIDATION_PAGE_SIZE;
    const visible=filtered.slice(start,start+VALIDATION_PAGE_SIZE);
    if(!validationSelectedId || !filtered.some(t=>t.id===validationSelectedId)) validationSelectedId=visible[0]?.id||null;

    const body=$("validationTableBody");
    body.innerHTML=visible.map(t=>{
      const r=state.validation[t.id],ds=validationDisplayStatus(r);
      return `<tr class="${validationSelectedId===t.id?"selected":""}" data-id="${escapeHtml(t.id)}">
        <td><input class="validation-row-check" type="checkbox" ${validationSelectedId===t.id?"checked":""}></td>
        <td><b class="validation-id-link">${escapeHtml(t.id)}</b></td>
        <td>${escapeHtml(t.title)}</td>
        <td>${escapeHtml(validationModule(t))}</td>
        <td><span class="validation-table-status ${ds.cls}">${escapeHtml(ds.label)}</span></td>
        <td>${escapeHtml(r?.executedBy || "—")}</td>
        <td>${escapeHtml(r?.executedAt || "—")}</td>
        <td><button class="validation-more" type="button" data-id="${escapeHtml(t.id)}" aria-label="View actions"><i data-lucide="more-vertical"></i></button></td>
      </tr>`;
    }).join("") || `<tr><td colspan="8" class="validation-empty-row">No validation tests match the selected filters.</td></tr>`;

    body.querySelectorAll("tr[data-id]").forEach(row=>{
      row.addEventListener("click", e=>{
        if(e.target.closest("button") || e.target.closest("input")) return;
        validationSelectedId=row.dataset.id;
        renderValidation();
      });
    });
    body.querySelectorAll(".validation-row-check").forEach(chk=>{
      chk.addEventListener("change",e=>{
        const row=e.target.closest("tr");
        validationSelectedId=row.dataset.id;
        renderValidation();
      });
    });
    body.querySelectorAll(".validation-more").forEach(btn=>{
      btn.addEventListener("click",e=>{
        e.stopPropagation();
        validationSelectedId=btn.dataset.id;
        renderValidationDetail(btn.dataset.id);
      });
    });

    $("validationShowing").textContent=filtered.length?`Showing ${start+1}–${Math.min(start+VALIDATION_PAGE_SIZE,filtered.length)} of ${filtered.length} tests`:"Showing 0 tests";
    $("validationPage").textContent=String(validationPage);
    $("validationPrev").disabled=validationPage<=1;
    $("validationNext").disabled=validationPage>=totalPages;

    const vals=cases.map(t=>state.validation[t.id]).filter(Boolean);
    const executed=vals.filter(x=>x?.executedAt).length;
    $("totalTests").textContent=cases.length;
    $("executedCount").textContent=executed;
    $("passedCount").textContent=vals.filter(x=>x?.testResult==="PASS").length;
    $("failedCount").textContent=vals.filter(x=>x?.testResult==="FAIL").length;
    $("pendingReviewCount").textContent=vals.filter(x=>x?.reviewStatus==="Pending QA Review").length;
    $("approvedCount").textContent=vals.filter(x=>x?.reviewStatus==="Approved").length;
    $("inProgressCount").textContent=vals.filter(x=>x?.executedAt && (!x.reviewStatus || x.reviewStatus==="Not Submitted")).length;
    $("validationPercent").textContent=`${cases.length?Math.round(executed/cases.length*100):0}%`;

    renderValidationDetail(validationSelectedId);refreshIcons();
  }

  function openValidationDefinitionModal(id=null){
    if(!isQC()){showToast("Hanya QC yang dapat menambah atau mengubah test.");return;}
    const existingCustom=id?state.customValidationCases.find(x=>x.id===id):null;
    const existing=id?(getValidationCase(id)||existingCustom):null;
    const r=id?state.validation[id]:null;
    if(existing&&r?.executedAt){showToast("Validation test yang sudah dieksekusi tidak dapat diedit.");return;}
    showModal(`<h3>${existing?"Edit":"Add New"} Validation Test</h3>
      <label>Test ID <span class="required">*</span></label><input id="customValId" value="${escapeHtml(existing?.id||"")}" ${existing?"readonly":""} placeholder="e.g. OQ-007">
      <label>Test Title <span class="required">*</span></label><input id="customValTitle" value="${escapeHtml(existing?.title||"")}" placeholder="e.g. Audit trail verification">
      <div class="form-grid-2"><div><label>Module <span class="required">*</span></label><select id="customValModule"><option>System</option><option>UV Detector</option><option>Pump</option><option>Column Oven</option><option>Sequence</option><option>Data</option></select></div><div><label>Test Type <span class="required">*</span></label><select id="customValPhase"><option value="IQ" ${existing?.phase==="IQ"?"selected":""}>IQ</option><option value="OQ" ${existing?.phase==="OQ"?"selected":""}>OQ</option><option value="PQ" ${existing?.phase==="PQ"?"selected":""}>PQ</option></select></div></div>
      <label>Description <span class="required">*</span></label><textarea id="customValObjective" placeholder="Describe what this test verifies...">${escapeHtml(existing?.objective||"")}</textarea>
      <label>Acceptance Criteria <span class="required">*</span></label><textarea id="customValCriteria" placeholder="Define the acceptance criteria...">${escapeHtml(existing?.criteria||"")}</textarea>
      <label>Test Input</label><input id="customValInput" value="${escapeHtml(existing?.input||"")}" placeholder="Optional test input">
      <div id="customValError" class="error-message"></div>
      <div class="modal-actions"><button class="secondary close-modal">Cancel</button><button class="primary" id="saveCustomVal">Save</button></div>`);
    if(existing){ const mod=validationModule(existing); if($("customValModule")) $("customValModule").value=mod; }
    $("saveCustomVal")?.addEventListener("click",()=>{
      const test={id:$("customValId").value.trim().toUpperCase(),title:$("customValTitle").value.trim(),phase:$("customValPhase").value,objective:$("customValObjective").value.trim(),criteria:$("customValCriteria").value.trim(),input:$("customValInput").value.trim()};
      if(!test.id||!test.title||!test.objective||!test.criteria){$("customValError").textContent="Please complete all required fields.";return;}
      if(!/^((IQ|OQ|PQ)-\d{3,})$/.test(test.id)){$("customValError").textContent="Format Test ID harus IQ-/OQ-/PQ- diikuti nomor.";return;}
      if(!existing&&getValidationCases().some(x=>x.id===test.id)){$("customValError").textContent="Test ID sudah digunakan.";return;}
      if(existing){
        const old={title:existing.title,phase:existing.phase,objective:existing.objective,criteria:existing.criteria,input:existing.input};
        if(existingCustom) Object.assign(existingCustom,test); else state.validationOverrides[test.id]={title:test.title,phase:test.phase,objective:test.objective,criteria:test.criteria,input:test.input};
        saveCustomValidationCases();localStorage.setItem("hplc_validation_overrides",JSON.stringify(state.validationOverrides));
        addAudit("Validation test definition edited",`${test.id} | Test definition updated`,{testId:test.id,previousValue:JSON.stringify(old),newValue:JSON.stringify(test)});
      }else{state.customValidationCases.push(test);saveCustomValidationCases();addAudit("Validation test added",`${test.id} | ${test.title} added by QC`,{testId:test.id,newValue:"Active"});}
      closeModal();renderValidation();renderReport();updateDashboard();showToast(existing?"Validation test updated successfully.":"Validation test added successfully.");
    });
  }
  function deleteCustomValidation(id){
    if(!isQC())return;
    const t=state.customValidationCases.find(x=>x.id===id);if(!t)return;
    showModal(`<div class="danger-modal"><div class="danger-icon"><i data-lucide="triangle-alert"></i></div><h3>Delete Validation Test</h3><p>Are you sure you want to delete <b>${escapeHtml(id)} — ${escapeHtml(t.title)}</b>?</p><p class="muted">This action cannot be undone.</p><div id="deleteValError" class="error-message"></div><div class="modal-actions"><button class="secondary close-modal">Cancel</button><button class="primary danger-action" id="confirmDeleteVal">Delete</button></div></div>`);
    $("confirmDeleteVal")?.addEventListener("click",()=>{
      delete state.validation[id];delete state.validationReviews[id];delete state.validationHistory[id];
      state.customValidationCases=state.customValidationCases.filter(x=>x.id!==id);saveCustomValidationCases();
      localStorage.setItem("hplc_validation",JSON.stringify(state.validation));localStorage.setItem("hplc_validation_reviews",JSON.stringify(state.validationReviews));localStorage.setItem("hplc_validation_history",JSON.stringify(state.validationHistory));
      addAudit("Validation test deleted",`${id} | Test definition deleted by QC`,{testId:id,newValue:"Deleted"});closeModal();renderValidation();renderReport();updateDashboard();showToast("Validation test deleted successfully.");
    });refreshIcons();
  }
  function handleValidationAction(id){
    const r=state.validation[id];
    if(!r?.executedAt){openValidationRunConfirm(id);return;}
    if(r.reviewStatus==="Pending QA Review"){isQA()?openValidationReview(id):submitValidationForQA(id);return;}
    if(r.reviewStatus==="Rejected"){isQC()?openValidationRunConfirm(id):openValidationReview(id);return;}
    if(r.reviewStatus==="Not Submitted"&&isQC()){submitValidationForQA(id);return;}
    if(isQC()&&!r.reviewStatus)openValidationRunConfirm(id);else if(isQA())openValidationReview(id);
  }
  function openValidationRunConfirm(id){
    const t=getValidationCase(id);if(!t)return;
    showModal(`<h3>Run Validation Test</h3><div class="validation-run-id"><b>${escapeHtml(t.id)}</b><strong>${escapeHtml(t.title)}</strong></div><div class="info-box"><i data-lucide="info"></i><span>This will open the test execution form. You can record test steps, upload evidence, and mark the status.</span></div><div class="modal-actions"><button class="secondary close-modal">Cancel</button><button class="primary" id="startValidationTest">Start Test</button></div>`);
    $("startValidationTest")?.addEventListener("click",()=>{closeModal();openValidationModal(id);addAudit("Validation test execution started",`${id} | QC opened test execution form`,{testId:id});showToast("Test execution started.");});refreshIcons();
  }
  function submitValidationForQA(id){
    if(!isQC()){showToast("Hanya QC yang dapat submit validation test ke QA.");return;}
    const r=state.validation[id]; if(!r?.executedAt||!r.testResult)return;
    const old=r.reviewStatus||"Not Submitted";r.reviewStatus="Pending QA Review";r.submittedBy=actorLabel();r.submittedAt=now();
    localStorage.setItem("hplc_validation",JSON.stringify(state.validation));
    addAudit("Validation test submitted for QA Review",`${id} | QC submitted test for QA review`,{testId:id,previousValue:old,newValue:"Pending QA Review"});
    renderValidation();renderReport();updateDashboard();showToast(`${id} submitted for QA review.`);
  }
  function openValidationReview(id){
    if(!isQA()){showToast("Hanya QA yang dapat review validation test.");return;}
    const evidenceForReview=state.validation[id]?.evidence;if(evidenceForReview)addAudit("QA reviewed evidence",`${id} | QA reviewed evidence ${evidenceForReview}`);
    const t=getValidationCase(id),r=state.validation[id];if(!t||!r)return;
    showModal(`<h3>QA Review — ${escapeHtml(t.id)}</h3><p><b>Test:</b> ${escapeHtml(t.title)}</p><p><b>Validation Type:</b> ${escapeHtml(t.phase)}</p><p><b>Objective:</b> ${escapeHtml(t.objective)}</p><p><b>Acceptance:</b> ${escapeHtml(t.criteria)}</p><p><b>Actual Result:</b> ${escapeHtml(r.actualResult||"")}</p><p><b>QC Test Result:</b> <span class="case-status ${r.testResult==="PASS"?"pass":"fail"}">${escapeHtml(r.testResult||"PENDING")}</span></p><p><b>Evidence:</b> ${escapeHtml(r.evidence||"None")}</p><p><b>Executed by:</b> ${escapeHtml(r.executedBy||"")} · ${escapeHtml(r.executedAt||"")}</p><label>QA Review Comment <span class="required">*</span></label><textarea id="valQAComment" placeholder="Enter review comment..."></textarea><label>QA password for electronic signature (approval only)</label><input id="valQAPassword" type="password" placeholder="Enter QA password"><div id="valQAError" class="error-message"></div><div class="modal-actions"><button class="secondary close-modal">Cancel</button><button class="secondary" id="rejectValidation">Reject</button><button class="primary" id="approveValidation">Approve & Sign</button></div>`);
    const finish=approved=>{const comment=$("valQAComment").value.trim(),pw=$("valQAPassword").value;if(!comment){$("valQAError").textContent="QA review comment wajib diisi.";return;}if(approved&&pw!==USERS.qa.password){$("valQAError").textContent="Password QA tidak sesuai.";return;}const old=r.reviewStatus||"Pending QA Review";r.reviewStatus=approved?"Approved":"Rejected";r.qaReview={reviewer:actorLabel(),reviewedAt:now(),action:approved?"Approved":"Rejected",comment,signature:approved?`${actorLabel()} · ${now()}`:null};state.validationReviews[id]={reviewer:actorLabel(),reviewedAt:r.qaReview.reviewedAt,action:r.qaReview.action,comment};localStorage.setItem("hplc_validation",JSON.stringify(state.validation));localStorage.setItem("hplc_validation_reviews",JSON.stringify(state.validationReviews));addAudit(approved?"QA approved validation test":"QA rejected validation test",`${id} | Original QC Test Result ${r.testResult} preserved`,{testId:id,previousValue:old,newValue:r.reviewStatus});addAudit("QA review comment recorded",`${id} | ${comment}`,{testId:id,newValue:comment});if(approved)addAudit("QA electronic signature",`${id} | QA signed approval`,{testId:id,newValue:"Electronic signature recorded"});closeModal();renderValidation();renderReport();updateDashboard();showToast(approved?`${id} approved.`:`${id} rejected.`);};
    $("approveValidation")?.addEventListener("click",()=>finish(true));$("rejectValidation")?.addEventListener("click",()=>finish(false));
  }
  function openValidationModal(id){
    window._valPendingFiles=[];
    if(!isQC()){showToast("QC bertanggung jawab mengeksekusi validation test.");return;}
    const t=getValidationCase(id),existing=state.validation[id]||{};if(!t)return;
    const evidenceOptions=getAttachments().map(f=>`<option value="${escapeHtml(f.name)}" ${existing.evidence===f.name?"selected":""}>${escapeHtml(f.name)}</option>`).join("");
    const editable=!existing.executedAt&&!existing.reviewStatus;
    const custom=state.customValidationCases.some(x=>x.id===id);
    showModal(`<h3>${escapeHtml(t.id)} — Execute Test</h3><label>Test ID</label><input value="${escapeHtml(t.id)}" readonly><label>Test Name</label><input id="valTestName" value="${escapeHtml(t.title)}" ${editable?"":"readonly"}><label>Validation Type</label><input value="${escapeHtml(t.phase)}" readonly><label>Requirement / Test Objective</label><textarea id="valObjective" ${editable?"":"readonly"}>${escapeHtml(t.objective)}</textarea><label>Acceptance Criteria</label><textarea id="valCriteria" ${editable?"":"readonly"}>${escapeHtml(t.criteria)}</textarea><label>Test Input</label><input id="valTestInput" value="${escapeHtml(t.input||"")}" ${editable?"":"readonly"}><label>Actual Result <span class="required">*</span></label><textarea id="valActual" placeholder="Enter the observed actual result...">${escapeHtml(existing.actualResult||"")}</textarea><label>Result</label><select id="valTestResult"><option value="PASS">Pass</option><option value="FAIL">Fail</option></select><label>Supporting Evidence</label><select id="valEvidence"><option value="">No attachment</option>${evidenceOptions}</select><label>Upload New Evidence</label><input id="valEvidenceFile" type="file" multiple accept=".pdf,.csv,.xlsx,.docx,.png,.jpg,.jpeg"><div id="valPendingFiles" class="pending-file-list"></div><label>Executed By</label><input value="${escapeHtml(actorLabel())}" readonly><label>Execution Date & Time</label><input value="${escapeHtml(now())}" readonly><div id="valError" class="error-message"></div><div class="modal-actions"><button class="secondary close-modal">Cancel</button>${editable?`<button class="secondary" id="editValidationBtn">Save Definition</button>`:""}${!existing.executedAt?`<button class="secondary danger-action" id="deleteValidationBtn">Delete Test</button>`:""}<button class="primary" id="saveValidation">Confirm Test</button></div>`);
    $("valEvidenceFile")?.addEventListener("change",e=>{window._valPendingFiles=Array.from(e.target.files||[]);$("valPendingFiles").innerHTML=pendingRows(window._valPendingFiles);$("valPendingFiles").querySelectorAll(".pending-remove").forEach(b=>b.addEventListener("click",()=>{window._valPendingFiles.splice(Number(b.dataset.pendingIndex),1);e.target.value="";$("valPendingFiles").innerHTML=pendingRows(window._valPendingFiles);refreshIcons();}));refreshIcons();});
    if($("editValidationBtn"))$("editValidationBtn")?.addEventListener("click",()=>{const title=$("valTestName").value.trim(),objective=$("valObjective").value.trim(),criteria=$("valCriteria").value.trim(),input=$("valTestInput").value.trim();if(!title||!objective||!criteria){$("valError").textContent="Test Name, Objective, dan Acceptance Criteria wajib diisi.";return;}const old=getValidationCase(id);state.validationOverrides[id]={title,objective,criteria,input};localStorage.setItem("hplc_validation_overrides",JSON.stringify(state.validationOverrides));addAudit("Validation test definition edited",`${id} | Test definition updated`,{testId:id,previousValue:JSON.stringify({title:old.title,objective:old.objective,criteria:old.criteria,input:old.input}),newValue:JSON.stringify({title,objective,criteria,input})});closeModal();renderValidation();renderReport();showToast(`${id} definition updated.`);});
    if($("deleteValidationBtn"))$("deleteValidationBtn")?.addEventListener("click",()=>deleteValidationCase(id));
    $("saveValidation")?.addEventListener("click",async()=>{const actual=$("valActual").value.trim(),testResult=$("valTestResult").value;let evidence=$("valEvidence").value;const files=Array.from(window._valPendingFiles||$("valEvidenceFile")?.files||[]);if(!actual){$("valError").textContent="Actual Result wajib diisi.";return;}if(!testResult){$("valError").textContent="Test Result wajib dipilih: PASS atau FAIL.";return;}const prior=state.validation[id];if(prior){(state.validationHistory[id]||(state.validationHistory[id]=[])).push({...prior,archivedAt:now()});localStorage.setItem("hplc_validation_history",JSON.stringify(state.validationHistory));}state.validation[id]={...(prior||{}),testResult,pass:testResult==="PASS",reviewStatus:"Not Submitted",executedBy:actorLabel(),executedAt:now(),input:t.input,actualResult:actual,evidence,qaReview:null};localStorage.setItem("hplc_validation",JSON.stringify(state.validation));addAudit("Validation test executed",`${id} | QC executed test`,{testId:id,previousValue:prior?.testResult||"PENDING",newValue:testResult});addAudit("Validation actual result recorded",`${id} | Actual Result recorded`,{testId:id,newValue:actual});addAudit("Validation test result selected",`${id} | QC selected ${testResult}`,{testId:id,newValue:testResult});if(files.length){const created=await attachFiles(files,{activity:"CSV Validation Center",recordType:"validation",recordId:id});if(created[0]){state.validation[id].evidence=created[0].name;localStorage.setItem("hplc_validation",JSON.stringify(state.validation));}}closeModal();renderValidation();renderReport();updateDashboard();showToast(`${id}: ${testResult}`);});
  }
  function deleteValidationCase(id){
    if(!isQC()){showToast("Hanya QC yang dapat menghapus validation test.");return;}
    const t=getValidationCase(id),r=state.validation[id]||{};if(!t)return;
    if(r.executedAt||r.reviewStatus){showToast("Validation test yang sudah dieksekusi tidak dapat dihapus.");return;}
    showModal(`<div class="danger-modal"><div class="danger-icon"><i data-lucide="triangle-alert"></i></div><h3>Delete Validation Test</h3><p>Are you sure you want to delete <b>${escapeHtml(id)} — ${escapeHtml(t.title)}</b>?</p><p class="muted">This action cannot be undone.</p><div class="modal-actions"><button class="secondary close-modal">Cancel</button><button class="primary danger-action" id="confirmDeleteBuiltinVal">Delete</button></div></div>`);
    $("confirmDeleteBuiltinVal")?.addEventListener("click",()=>{state.deletedValidationCases=[...new Set([...state.deletedValidationCases,id])];localStorage.setItem("hplc_deleted_validation_cases",JSON.stringify(state.deletedValidationCases));addAudit("Validation test deleted",`${id} | Test definition deleted by QC`,{testId:id,previousValue:"Active",newValue:"Deleted"});closeModal();renderValidation();renderReport();updateDashboard();showToast("Validation test deleted successfully.");});refreshIcons();
  }

  function phaseStatus(phase){
    const tests=getValidationCases().filter(t=>t.phase===phase),results=tests.map(t=>state.validation[t.id]);
    if(results.some(r=>r?.executedAt&&r.testResult==="FAIL"))return"FAIL";
    if(results.every(r=>r?.executedAt&&r.testResult==="PASS"))return"PASS";
    return"PENDING";
  }
  function reportEligibility(){return getValidationCases().every(t=>state.validation[t.id]?.executedAt&&state.validation[t.id].testResult==="PASS");}
  function renderSequenceAttachments(){
    const el=$("sequenceAttachmentList");if(!el)return;
    const items=getAttachments().filter(a=>a.recordType==="sequence"&&a.recordId==="SEQ-001");
    if($('sequenceAttachmentCount'))$('sequenceAttachmentCount').textContent=`(${items.length})`;
    el.innerHTML=items.length?items.map(a=>`<div class="compact-attachment-row sequence-attachment-row"><span class="file-type-icon"><i data-lucide="${fileIconName(a)}"></i></span><div class="sequence-attachment-info"><b>${escapeHtml(a.name)}</b><small>${formatFileSize(a.size)} · ${escapeHtml(a.time||'')}</small></div><div class="sequence-attachment-menu"><button class="icon-button" type="button" data-seq-menu="${escapeHtml(a.id)}" aria-label="Attachment actions">⋮</button></div></div>`).join(''):'<div class="muted sequence-no-attachments">No attachments yet.</div>';
    document.querySelectorAll('[data-seq-menu]').forEach(b=>b.addEventListener('click',()=>{const id=b.dataset.seqMenu;const a=getAttachmentMeta(id);if(!a)return;showModal(`<h3>Attachment Actions</h3><p><b>${escapeHtml(a.name)}</b></p><div class="modal-actions"><button class="secondary close-modal">Close</button><button class="secondary" id="viewSeqAttachment">View</button><button class="primary" id="downloadSeqAttachment">Download</button>${canDeleteAttachment(a)?'<button class="danger-button" id="deleteSeqAttachment">Delete</button>':''}</div>`);$('viewSeqAttachment')?.addEventListener('click',()=>{closeModal();openStoredAttachment(id,'view');});$('downloadSeqAttachment')?.addEventListener('click',()=>{closeModal();openStoredAttachment(id,'download');});$('deleteSeqAttachment')?.addEventListener('click',()=>{closeModal();deleteAttachmentById(id);});}));
    refreshIcons();
  }

  function renderSequencePendingFiles(){const el=$("sequencePendingFiles");if(!el)return;const files=window._sequencePendingFiles||[];el.innerHTML=pendingRows(files)+(files.length?`<div class="pending-actions"><span class="muted">${files.length} file(s) selected</span><button id="attachSequencePendingBtn" class="primary" type="button"><i data-lucide="paperclip"></i> Attach Selected Files</button></div>`:"");el.querySelectorAll(".pending-remove").forEach(b=>b.addEventListener("click",()=>{files.splice(Number(b.dataset.pendingIndex),1);renderSequencePendingFiles();}));$("attachSequencePendingBtn")?.addEventListener("click",async()=>{const created=await attachFiles(files,{activity:"Sequence",recordType:"sequence",recordId:"SEQ-001"});window._sequencePendingFiles=[];renderSequencePendingFiles();renderSequenceAttachments();showToast(created.length?`${created.length} sequence file(s) attached.`:"No file attached.");});refreshIcons();}
  function renderAssayPendingFiles(){const el=$("assayPendingFiles");if(!el)return;const files=window._assayPendingFiles||[];el.innerHTML=pendingRows(files)+(files.length?`<div class="pending-actions"><span class="muted">${files.length} file(s) selected</span><button id="attachAssayPendingBtn" class="primary" type="button"><i data-lucide="paperclip"></i> Attach Selected Files</button></div>`:"");el.querySelectorAll(".pending-remove").forEach(b=>b.addEventListener("click",()=>{files.splice(Number(b.dataset.pendingIndex),1);renderAssayPendingFiles();}));$("attachAssayPendingBtn")?.addEventListener("click",async()=>{const created=await attachFiles(files,{activity:"Assay / Data Review",recordType:"assay",recordId:"AR-001"});window._assayPendingFiles=[];renderAssayPendingFiles();renderAssayAttachments();showToast(created.length?`${created.length} assay file(s) attached.`:"No file attached.");});refreshIcons();}
  function renderReportAttachmentList(){
    const el=$("reportAttachmentList");if(!el)return;const items=getAttachments().filter(a=>a.recordType==="report"&&a.recordId==="VR-001");el.innerHTML=items.length?items.map(a=>`<div class="compact-attachment-row"><span class="file-type-icon"><i data-lucide="${fileIconName(a)}"></i></span><div><b>${escapeHtml(a.name)}</b><small>${escapeHtml(fileTypeLabel(a))} · ${formatFileSize(a.size)} · ${escapeHtml(a.time)}</small></div><button class="secondary" type="button" data-report-view="${escapeHtml(a.id)}"><i data-lucide="eye"></i></button><button class="secondary" type="button" data-report-download="${escapeHtml(a.id)}"><i data-lucide="download"></i></button>${canDeleteAttachment(a)?`<button class="secondary danger-action" type="button" data-report-delete="${escapeHtml(a.id)}"><i data-lucide="trash-2"></i></button>`:""}</div>`).join(""):'<div class="muted">No supporting documents attached.</div>';document.querySelectorAll("[data-report-view]").forEach(b=>b.addEventListener("click",()=>openStoredAttachment(b.dataset.reportView,"view")));document.querySelectorAll("[data-report-download]").forEach(b=>b.addEventListener("click",()=>openStoredAttachment(b.dataset.reportDownload,"download")));document.querySelectorAll("[data-report-delete]").forEach(b=>b.addEventListener("click",()=>deleteAttachmentById(b.dataset.reportDelete)));refreshIcons();
  }
  function renderReport(){
    renderReportAttachmentList();
    if(isQA()){
      renderQAValidationReport();
      return;
    }
    const cases=getValidationCases();
    const executed=cases.filter(t=>state.validation[t.id]?.executedAt);
    const stored=JSON.parse(localStorage.getItem("hplc_report_selected")||"null");
    const selected=Array.isArray(stored)?stored:[];
    const selectedIds=selected.filter(id=>executed.some(t=>t.id===id));
    const body=$("reportTestBody");
    if(body){
      body.innerHTML=executed.length?executed.map(t=>{
        const r=state.validation[t.id]||{}, pass=r.testResult==="PASS", status=r.testResult?(pass?"Passed":"Failed"):"Not Tested";
        return `<tr class="report-test-row ${selectedIds.includes(t.id)?"selected":""}" data-report-row="${escapeHtml(t.id)}"><td><input class="report-test-check" type="checkbox" value="${escapeHtml(t.id)}" ${selectedIds.includes(t.id)?"checked":""}></td><td><b>${escapeHtml(t.id)}</b></td><td>${escapeHtml(t.title)}</td><td>${escapeHtml(validationModule(t))}</td><td><span class="report-mini-status ${pass?"pass":r.testResult==="FAIL"?"fail":"pending"}">${status}</span></td><td>${escapeHtml(r.executedAt||"—")}</td></tr>`;
      }).join(""):'<tr><td colspan="6" class="muted">No executed tests available. Execute validation tests first.</td></tr>';
      body.querySelectorAll('.report-test-check').forEach(cb=>cb.addEventListener('change',()=>{
        const ids=Array.from(body.querySelectorAll('.report-test-check:checked')).map(x=>x.value);
        localStorage.setItem('hplc_report_selected',JSON.stringify(ids));
        body.querySelectorAll('.report-test-row').forEach(r=>r.classList.toggle('selected',r.querySelector('.report-test-check')?.checked));
        if($("reportSelectedCount")) $("reportSelectedCount").textContent=`${ids.length} test(s) selected`;
        updateReportStepper();
        renderReportPaper();
      }));
      body.querySelectorAll('.report-test-row').forEach(row=>row.addEventListener('click',e=>{if(e.target.closest('input'))return;const cb=row.querySelector('.report-test-check');if(cb){cb.checked=!cb.checked;cb.dispatchEvent(new Event('change',{bubbles:true}));}}));
    }
    if($("reportSelectedCount")) $("reportSelectedCount").textContent=`${selectedIds.length} test(s) selected`;
    renderReportPaper();
    const r=state.report||{};
    const status=r.status||"DRAFT";
    if($("reportStatus")){const label=status==="SUBMITTED FOR QA REVIEW"?"PENDING QA REVIEW":status;$("reportStatus").textContent=label;$("reportStatus").className=`report-status ${status.toLowerCase().replaceAll(' ','-')}`;}
    const canEdit=isQC() && status!=="SUBMITTED FOR QA REVIEW" && status!=="APPROVED";
    ["reportTitleInput","reportVersionInput","reportPreparedBy","reportPreparedDate","reportTemplate"].forEach(id=>{if($(id))$(id).disabled=!canEdit;});
    $("prepareReportBtn")?.classList.toggle('hidden',!isQC() || status==="SUBMITTED FOR QA REVIEW" || status==="APPROVED");
    $("reviewReportBtn")?.classList.toggle("hidden",!(isQA()&&status==="SUBMITTED FOR QA REVIEW"));
    updateReportStepper();
  }

  function updateReportStepper(){
    const selected=JSON.parse(localStorage.getItem('hplc_report_selected')||'[]');
    const count=Array.isArray(selected)?selected.length:0;
    const status=state.report?.status||'DRAFT';
    const generated=!!state.report?.generatedAt;
    ['reportStepSelect','reportStepGenerate','reportStepReview','reportStepQA'].forEach(id=>$(id)?.classList.remove('active','complete'));
    $('reportStepSelect')?.classList.add(count?'complete':'active');
    if(count) $('reportStepGenerate')?.classList.add(generated?'complete':'active');
    if(generated) $('reportStepReview')?.classList.add(status==='SUBMITTED FOR QA REVIEW'||status==='APPROVED'?'complete':'active');
    if(status==='SUBMITTED FOR QA REVIEW'||status==='APPROVED') $('reportStepQA')?.classList.add(status==='APPROVED'?'complete':'active');
  }

  function renderQAValidationReport(){
    const report=state.report || {};
    const cases=getValidationCases();
    const executed=cases.filter(t=>state.validation[t.id]?.executedAt);
    const selected=JSON.parse(localStorage.getItem("hplc_report_selected")||"null") || executed.map(t=>t.id);
    const selectedIds=selected.filter(id=>cases.some(t=>t.id===id));
    const attachments=getAttachments();

    $("report").innerHTML=`
      <div class="qa-report-page">
        <div class="qa-report-back" id="qaReportBackBtn">← <span>Back to Validation Report List</span></div>

        <div class="report-page-subtitle qa-report-subtitle">Review the validation report, add comments, and provide electronic signature.</div>

        <div class="qa-report-meta panel">
          <div><span>Report ID</span><b>${escapeHtml(report.reportId||"VR-001")}</b></div>
          <div><span>Report Title</span><b>${escapeHtml(report.title||"HPLC-UV CSV Validation Report")}</b></div>
          <div><span>System</span><b>HPLC-UV</b></div>
          <div><span>Validation Period</span><b>1 Sep 2026 – 12 Sep 2026</b></div>
          <div><span>Current Status</span><strong id="qaReportCurrentStatus" class="qa-status pending">${escapeHtml(report.status||"Pending QA Review")}</strong></div>
          <button id="qaViewAuditBtn" class="secondary" type="button"><i data-lucide="history"></i> View Audit Trail</button>
        </div>

        <div class="qa-report-tabs panel">
          <button class="qa-report-tab active" type="button">Report Overview</button>
          <button class="qa-report-tab" type="button">Test Summary</button>
          <button class="qa-report-tab" type="button">Deviations</button>
          <button class="qa-report-tab" type="button">Attachments (${attachments.length})</button>
        </div>

        <div class="qa-report-workspace">
          <div class="panel qa-report-preview">
            <div class="qa-preview-header">
              <h3>Report Preview</h3>
              <div class="qa-preview-tools">
                <button class="icon-button" type="button">‹</button><span>1 / 25</span><button class="icon-button" type="button">›</button>
                <button class="icon-button" type="button"><i data-lucide="minus"></i></button><span>100%</span><button class="icon-button" type="button">+</button>
                <button class="icon-button" type="button"><i data-lucide="maximize"></i></button>
                <button class="icon-button" id="qaDownloadReportBtn" type="button"><i data-lucide="download"></i></button>
                <button class="icon-button" id="qaPrintReportBtn" type="button"><i data-lucide="printer"></i></button>
              </div>
            </div>
            <div class="qa-report-preview-scroll">
              <div class="qa-report-paper">
                <div class="qa-paper-top">
                  <div class="paper-logo">HPLC</div>
                  <div><b>HPLC-UV</b><small>CSV System</small></div>
                  <span>CONFIDENTIAL</span>
                </div>
                <h1>CSV VALIDATION REPORT</h1>
                <h2>HPLC-UV System</h2><hr>
                <div class="qa-paper-details">
                  <div><b>Report ID</b><span>${escapeHtml(report.reportId||"VR-001")}</span></div>
                  <div><b>System Name</b><span>HPLC-UV</span></div>
                  <div><b>Validation Period</b><span>1 Sep 2026 – 12 Sep 2026</span></div>
                  <div><b>Report Date</b><span>${escapeHtml(report.preparedAt||"12 Sep 2026")}</span></div>
                  <div><b>Prepared by</b><span>${escapeHtml(report.preparedBy||"QC")}</span></div>
                  <div><b>Reviewed by</b><span id="qaPaperReviewedBy">${escapeHtml(report.reviewer||"—")}</span></div>
                  <div><b>Approved by</b><span id="qaPaperApprovedBy">${report.status==="APPROVED"?escapeHtml(report.reviewer||"—"):"—"}</span></div>
                  <div><b>Version</b><span>${escapeHtml(report.version||"1.0")}</span></div>
                </div>
                <hr>
                <h3>1. Executive Summary</h3>
                <p>The HPLC-UV system has been tested in accordance with the User Requirement Specification (URS) and validation protocol. The report summarizes the executed validation tests and their review status.</p>
                <div id="qaPaperOverallResult" class="qa-paper-result">${escapeHtml(reportOverallForQA(selectedIds))}</div>
                <h3>2. Scope</h3>
                <p>This report covers Installation Qualification (IQ), Operational Qualification (OQ), and Performance Qualification (PQ) for the HPLC-UV system.</p>
                <h3>3. Test Summary</h3>
                <div class="qa-paper-test-summary">
                  ${selectedIds.length ? selectedIds.map(id=>{
                    const t=cases.find(x=>x.id===id), r=state.validation[id]||{};
                    const result=r.testResult||"PENDING";
                    return `<div><span><b>${escapeHtml(id)}</b> — ${escapeHtml(t?.title||"Validation Test")}</span><strong class="${result==="PASS"?"pass":result==="FAIL"?"fail":"pending"}">${escapeHtml(result)}</strong></div>`;
                  }).join("") : '<div class="muted">No executed tests selected for this report.</div>'}
                </div>
              </div>
            </div>
          </div>

          <div class="qa-report-right">
            <div class="panel qa-approval-card">
              <h3>QA Review &amp; Approval</h3>
              <div class="qa-detail-row"><span>Review Status</span><b id="qaReviewStatusText">${escapeHtml(report.status==="APPROVED"?"Approved":report.status==="REVISION REQUIRED"?"Revision Required":"Pending QA Review")}</b></div>
              <div class="qa-detail-row"><span>QC Submission Date</span><b>${escapeHtml(report.preparedAt||"—")}</b></div>
              <div class="qa-detail-row"><span>Reviewed by</span><b id="qaReviewedByText">${escapeHtml(report.reviewer||"—")}</b></div>
              <div class="qa-detail-row"><span>Review Date &amp; Time</span><b id="qaReviewDateText">${escapeHtml(report.reviewedAt||"—")}</b></div>

              <label class="qa-field-label">QA Review Comment <span class="required">*</span></label>
              <textarea id="qaReportCommentInput" maxlength="1000" placeholder="Enter QA review comment...">${escapeHtml(report.comment&&report.comment!=="—"?report.comment:"")}</textarea>
              <div class="qa-comment-count"><span id="qaCommentCount">${report.comment&&report.comment!=="—"?String(report.comment).length:0}</span>/1000</div>

              <label class="qa-field-label">Electronic Signature <span class="required">*</span></label>
              <div class="qa-signature-row">
                <select id="qaSignatureUser">
                  <option value="QA">QA — Quality Assurance</option>
                </select>
                <div class="qa-password-wrap">
                  <input id="qaReportPassword" type="password" placeholder="Enter password">
                  <button id="qaTogglePasswordBtn" class="icon-button" type="button"><i data-lucide="eye"></i></button>
                </div>
              </div>
              <div id="qaReportError" class="error-message"></div>

              <div class="qa-action-row">
                <button id="qaRequestRevisionBtn" class="danger-outline" type="button"><i data-lucide="file-pen-line"></i> Request Revision</button>
                <button id="qaSaveDraftBtn" class="secondary" type="button"><i data-lucide="save"></i> Save as Draft</button>
                <button id="qaApproveSignBtn" class="primary" type="button"><i data-lucide="check"></i> Approve &amp; Sign</button>
              </div>
            </div>

            <div class="panel qa-attachments-card">
              <div class="qa-card-heading"><h3>Attachments from QC</h3><span>${attachments.length} file(s)</span></div>
              ${attachments.length ? attachments.slice(0,5).map(f=>`
                <div class="qa-attachment-row">
                  <div class="qa-attachment-icon"><i data-lucide="${fileIconName(f)}"></i></div>
                  <div><b>${escapeHtml(f.name||"Attachment")}</b><small>${escapeHtml(fileTypeLabel(f))} · ${formatFileSize(f.size)} · ${escapeHtml(f.time||"—")}</small></div>
                  <div class="attachment-actions"><button class="icon-button qa-attachment-view" type="button" data-id="${escapeHtml(f.id)}" aria-label="View attachment"><i data-lucide="eye"></i></button><button class="icon-button qa-attachment-download" type="button" data-id="${escapeHtml(f.id)}" aria-label="Download attachment"><i data-lucide="download"></i></button></div>
                </div>`).join("") : '<div class="muted qa-empty-attachments">No attachments from QC.</div>'}
            </div>
          </div>
        </div>
      </div>`;

    const comment=$("qaReportCommentInput");
    const updateCount=()=>{$("qaCommentCount").textContent=String(comment.value.length);};
    comment.addEventListener("input",updateCount);

    $("qaReportBackBtn")?.addEventListener("click",()=>showSection("validation"));
    $("qaViewAuditBtn")?.addEventListener("click",()=>showSection("audit"));
    $("qaDownloadReportBtn")?.addEventListener("click",()=>{
      addAudit("Validation report downloaded","QA downloaded validation report for review",{testId:report.reportId||"VR-001"});
      window.print();
    });
    $("qaPrintReportBtn")?.addEventListener("click",()=>{
      addAudit("Validation report printed","QA opened validation report print preview",{testId:report.reportId||"VR-001"});
      window.print();
    });

    document.querySelectorAll(".qa-attachment-view").forEach(b=>b.addEventListener("click",()=>openStoredAttachment(b.dataset.id,"view")));document.querySelectorAll(".qa-attachment-download").forEach(b=>b.addEventListener("click",()=>openStoredAttachment(b.dataset.id,"download")));refreshIcons();
    $("qaTogglePasswordBtn")?.addEventListener("click",()=>{
      const input=$("qaReportPassword");
      input.type=input.type==="password"?"text":"password";
    });
    $("qaSaveDraftBtn")?.addEventListener("click",()=>{
      state.report={...(state.report||{}),status:"DRAFT",comment:comment.value.trim()||"—"};
      localStorage.setItem("hplc_report",JSON.stringify(state.report));
      addAudit("QA validation report draft saved","QA saved validation report review as draft",{testId:state.report.reportId||"VR-001"});
      renderReport();
      showToast("QA review draft saved.");
    });
    $("qaRequestRevisionBtn")?.addEventListener("click",()=>{
      const c=comment.value.trim();
      if(!c){$("qaReportError").textContent="QA Review Comment wajib diisi.";return;}
      state.report={...(state.report||{}),status:"REVISION REQUIRED",reviewer:actorLabel(),reviewedAt:now(),comment:c,signature:null};
      localStorage.setItem("hplc_report",JSON.stringify(state.report));
      addAudit("QA rejected validation report","QA requested revision of validation report",{testId:state.report.reportId||"VR-001",previousValue:"Pending QA Review",newValue:"Revision Required"});
      renderReport();
      showToast("Validation report dikembalikan untuk revisi.");
    });
    $("qaApproveSignBtn")?.addEventListener("click",()=>{
      const c=comment.value.trim();
      if(!c){$("qaReportError").textContent="QA Review Comment wajib diisi.";return;}
      showModal(`<div class="signature-modal">
        <div class="signature-modal-title"><i data-lucide="lock"></i> <b>Enter Password to Sign</b><button class="close-modal icon-button" type="button"><i data-lucide="x"></i></button></div>
        <p>Please enter your password to electronically sign this validation report. This action will be recorded in the audit trail.</p>
        <label>User</label><input type="text" value="${escapeHtml(actorLabel())}" disabled>
        <label>Password <span class="required">*</span></label>
        <div class="signature-password-modal"><input id="qaModalPassword" type="password" placeholder="Enter your password"><button id="qaModalTogglePassword" class="icon-button" type="button"><i data-lucide="eye"></i></button></div>
        <div id="qaModalError" class="error-message"></div>
        <div class="modal-actions"><button class="secondary close-modal" type="button">Cancel</button><button id="qaModalSignBtn" class="primary" type="button">Sign</button></div>
      </div>`);
      $("qaModalTogglePassword")?.addEventListener("click",()=>{const i=$("qaModalPassword");i.type=i.type==="password"?"text":"password";});
      $("qaModalSignBtn")?.addEventListener("click",()=>{
        const pw=$("qaModalPassword").value;
        if(!pw){$("qaModalError").textContent="Password wajib diisi untuk electronic signature.";return;}
        if(pw!==USERS.qa.password){$("qaModalError").textContent="Password tidak sesuai.";addAudit("QA electronic signature failed","Invalid password entered for validation report signature",{testId:state.report?.reportId||"VR-001"});return;}
        const signedAt=now();
        state.report={...(state.report||{}),status:"APPROVED",reviewer:actorLabel(),reviewedAt:signedAt,comment:c,signature:`${actorLabel()} · ${signedAt} · Approved`};
        localStorage.setItem("hplc_report",JSON.stringify(state.report));
        addAudit("QA approved validation report","QA approved validation report and created electronic signature",{testId:state.report.reportId||"VR-001",previousValue:"Pending QA Review",newValue:"Approved"});
        closeModal();
        renderReport();
        showModal(`<div class="signature-success-modal">
          <div class="success-check"><i data-lucide="check"></i></div>
          <h3>Document Approved</h3>
          <p>The validation report has been successfully signed and approved.</p>
          <div class="signature-summary">
            <div><span>Signed by</span><b>${escapeHtml(actorLabel())}</b></div>
            <div><span>Date &amp; Time</span><b>${escapeHtml(signedAt)}</b></div>
            <div><span>Action</span><b>Approved</b></div>
            <div><span>Status</span><strong class="qa-status approved">Approved</strong></div>
          </div>
          <div class="modal-actions"><button class="primary close-modal" type="button">OK</button></div>
        </div>`);
      });
    });
  }

  function reportOverallForQA(selectedIds){
    const results=selectedIds.map(id=>state.validation[id]?.testResult).filter(Boolean);
    if(!results.length) return "Overall Result: PENDING";
    return results.every(r=>r==="PASS") ? "Overall Result: PASSED" : "Overall Result: FAILED";
  }

  function renderReportPaper() {
    const cases=getValidationCases();
    const selected=JSON.parse(localStorage.getItem("hplc_report_selected")||"[]");
    const ids=Array.isArray(selected)?selected.filter(id=>cases.some(t=>t.id===id)):[];
    const summary=$("paperTestSummary");
    if(summary) summary.innerHTML=ids.map(id=>{const t=cases.find(x=>x.id===id),r=state.validation[id]||{},st=r.testResult||"NOT TESTED";return `<div class="paper-test-row"><span>${escapeHtml(id)} — ${escapeHtml(t?.title||"Validation Test")}</span><b class="${st.toLowerCase().replaceAll(' ','-')}">${escapeHtml(st)}</b></div>`;}).join("")||'<div class="muted">Select executed tests to preview the report.</div>';
    const results=ids.map(id=>state.validation[id]?.testResult).filter(Boolean);
    const overall=results.length?results.every(r=>r==='PASS')?'Overall Result: PASSED':'Overall Result: FAILED':'Overall Result: PENDING';
    if($("paperOverallResult")) $("paperOverallResult").textContent=overall;
    if($("paperReviewedBy")) $("paperReviewedBy").textContent=state.report?.reviewer||"—";
    if($("paperReportDate")) $("paperReportDate").textContent=state.report?.preparedAt||$("reportPreparedDate")?.value||"12 Sep 2026";
    if($("paperPreparedBy")) $("paperPreparedBy").textContent=state.report?.preparedBy||$("reportPreparedBy")?.value||"QC";
    if($("paperReportVersion")) $("paperReportVersion").textContent=state.report?.version||$("reportVersionInput")?.value||"1.0";
    const title=$("reportTitleInput")?.value||state.report?.title||"HPLC-UV CSV Validation Report";
    const paperTitle=document.querySelector('.report-paper h1');
    if(paperTitle) paperTitle.textContent=title.toUpperCase();
  }

  function prepareReport(){
    if(!isQC()){showToast("Only QC can generate the validation report.");return;}
    const selected=JSON.parse(localStorage.getItem("hplc_report_selected")||"[]");
    if(!Array.isArray(selected)||selected.length===0){showToast("Please select at least one test.");return;}
    const title=$("reportTitleInput")?.value.trim();
    if(!title){showToast("Report Title is required.");$("reportTitleInput")?.focus();return;}
    showModal(`<div class="report-generate-modal"><div class="report-modal-icon"><i data-lucide="file-text"></i></div><h3>Generate Validation Report</h3><p class="muted">Create the selected tests into a CSV validation report.</p><div class="generate-summary-box"><b>${selected.length} test(s) selected</b><div>${selected.map(id=>`<div>• ${escapeHtml(id)} — ${escapeHtml(getValidationCases().find(t=>t.id===id)?.title||'Validation Test')}</div>`).join('')}</div></div><div class="modal-actions"><button class="secondary close-modal" type="button">Cancel</button><button class="primary" id="confirmGenerateReport" type="button"><i data-lucide="file-check"></i> Generate Report</button></div></div>`);
    $("confirmGenerateReport")?.addEventListener("click",()=>{
      $("confirmGenerateReport").disabled=true;
      $("confirmGenerateReport").innerHTML='<i data-lucide="loader-circle"></i> Generating...';refreshIcons();
      closeModal();
      showModal(`<div class="report-progress-modal"><div class="report-loader"></div><h3>Generating Report...</h3><p class="muted">Please wait while we compile the selected tests into a CSV validation report.</p><div class="progress-track"><div id="reportGenerateProgress" class="progress-fill" style="width:20%"></div></div><b id="reportGeneratePct">20%</b><div class="modal-actions"><button id="cancelReportGeneration" class="secondary" type="button">Cancel</button></div></div>`);
      let pct=20;const timer=setInterval(()=>{pct=Math.min(100,pct+20);if($("reportGenerateProgress"))$("reportGenerateProgress").style.width=pct+'%';if($("reportGeneratePct"))$("reportGeneratePct").textContent=pct+'%';if(pct>=100){clearInterval(timer);closeModal();state.report={...(state.report||{}),reportId:"VR-001",title,version:$("reportVersionInput")?.value||"1.0",preparedBy:actorLabel(),preparedAt:now(),generatedAt:now(),status:"GENERATED",reviewer:"—",reviewedAt:"—",comment:"—"};localStorage.setItem("hplc_report",JSON.stringify(state.report));addAudit("Validation report generated",`${selected.length} test(s) included in VR-001`);renderReport();showToast("Report generated successfully.");openGeneratedReportModal();}},180);
      $("cancelReportGeneration")?.addEventListener("click",()=>{clearInterval(timer);closeModal();showToast("Report generation cancelled.");});
    });refreshIcons();
  }

  function openGeneratedReportModal(){
    showModal(`<div class="generated-report-modal"><div class="success-circle"><i data-lucide="check"></i></div><h3>Report Generated</h3><p class="muted">The validation report has been generated successfully.</p><div class="generated-report-file"><i data-lucide="file-text"></i><div><b>CSV_Validation_Report_VR-001.pdf</b><small>PDF ready · ${state.report?.title||'HPLC-UV CSV Validation Report'}</small></div></div><div class="modal-actions"><button class="secondary close-modal" type="button">Close</button><button class="primary" id="viewGeneratedReportBtn" type="button"><i data-lucide="eye"></i> View Report</button><button class="primary" id="downloadGeneratedReportBtn" type="button"><i data-lucide="download"></i> Download Report</button></div></div>`);
    $("viewGeneratedReportBtn")?.addEventListener('click',()=>{closeModal();openReportViewer();});
    $("downloadGeneratedReportBtn")?.addEventListener('click',downloadGeneratedReport);
    refreshIcons();
  }

  function openReportViewer(){
    const selected=JSON.parse(localStorage.getItem("hplc_report_selected")||"[]");
    const cases=getValidationCases();
    showModal(`<div class="report-pdf-viewer"><div class="pdf-toolbar"><b>CSV_Validation_Report_VR-001.pdf</b><div><button class="icon-button" id="pdfPrev" type="button">‹</button><span id="pdfPage">1 / 25</span><button class="icon-button" id="pdfNext" type="button">›</button><button class="icon-button" id="pdfZoomOut" type="button">−</button><span id="pdfZoom">100%</span><button class="icon-button" id="pdfZoomIn" type="button">+</button><button class="icon-button" id="pdfDownload" type="button"><i data-lucide="download"></i></button><button class="icon-button close-modal" type="button"><i data-lucide="x"></i></button></div></div><div class="pdf-viewer-body"><div class="pdf-thumbnails">${[1,2,3].map(n=>`<div class="pdf-thumb ${n===1?'active':''}"><span>${n}</span><small>Page ${n}</small></div>`).join('')}</div><div class="pdf-page"><div class="report-paper viewer-paper"><div class="paper-top"><div class="paper-logo">HPLC</div><div><b>HPLC-UV</b><small>CSV System</small></div><span>CONFIDENTIAL</span></div><h1>${escapeHtml((state.report?.title||'CSV VALIDATION REPORT').toUpperCase())}</h1><h2>HPLC-UV System</h2><hr><div class="paper-details"><div><b>Report ID</b><span>VR-001</span></div><div><b>System Name</b><span>HPLC-UV</span></div><div><b>Validation Period</b><span>1 Sep 2026 – 12 Sep 2026</span></div><div><b>Report Date</b><span>${escapeHtml(state.report?.preparedAt||now())}</span></div><div><b>Prepared by</b><span>${escapeHtml(state.report?.preparedBy||actorLabel())}</span></div><div><b>Reviewed by</b><span>${escapeHtml(state.report?.reviewer||'—')}</span></div><div><b>Version</b><span>${escapeHtml(state.report?.version||'1.0')}</span></div></div><hr><h3>1. Executive Summary</h3><p>The HPLC-UV system validation report summarizes the selected executed validation tests and their current status.</p><div class="paper-result">${escapeHtml(reportOverallForQA(selected))}</div><h3>2. Test Summary</h3>${selected.map(id=>{const t=cases.find(x=>x.id===id),r=state.validation[id]||{};return `<div class="paper-test-row"><span><b>${escapeHtml(id)}</b> — ${escapeHtml(t?.title||'Validation Test')}</span><b>${escapeHtml(r.testResult||'NOT TESTED')}</b></div>`}).join('')||'<p>No tests selected.</p>'}</div></div></div></div>`);
    $("pdfDownload")?.addEventListener('click',downloadGeneratedReport);refreshIcons();
  }

  function downloadGeneratedReport(){
    const selected=JSON.parse(localStorage.getItem("hplc_report_selected")||"[]");
    const cases=getValidationCases();
    const rows=[['Report ID','Report Title','Test ID','Test Title','Module','Status','Executed By','Executed On']];
    selected.forEach(id=>{const t=cases.find(x=>x.id===id),r=state.validation[id]||{};rows.push(['VR-001',state.report?.title||'HPLC-UV CSV Validation Report',id,t?.title||'',validationModule(t||{}),r.testResult||'NOT TESTED',r.executedBy||'—',r.executedAt||'—']);});
    downloadText('CSV_Validation_Report_VR-001.csv',rows.map(r=>r.map(csvCell).join(',')).join('\n'));
    addAudit('Validation report downloaded','VR-001 report downloaded');
    showToast('Validation report downloaded successfully.');
  }

  function finalizeReport(){
    if(!isQC()){showToast("Only QC can submit the validation report.");return;}
    const selected=JSON.parse(localStorage.getItem("hplc_report_selected")||"[]");
    if(!Array.isArray(selected)||selected.length===0){showToast("Please select at least one test.");return;}
    if(!state.report?.generatedAt){showToast("Generate the report before submitting for QA review.");return;}
    showModal(`<div class="report-submit-modal"><div class="report-modal-icon"><i data-lucide="send"></i></div><h3>Submit for QA Review?</h3><p>Are you sure you want to submit this validation report for QA review?</p><p class="muted">No further edits can be made after submission.</p><div class="modal-actions"><button class="secondary close-modal" type="button">Cancel</button><button class="primary" id="confirmReportSubmit" type="button"><i data-lucide="send"></i> Submit</button></div></div>`);
    $("confirmReportSubmit")?.addEventListener("click",()=>{
      state.report={...(state.report||{}),status:"SUBMITTED FOR QA REVIEW",submittedAt:now(),preparedBy:state.report.preparedBy||actorLabel()};
      localStorage.setItem("hplc_report",JSON.stringify(state.report));
      addAudit("Validation report submitted","QC submitted VR-001 for QA review");
      closeModal();renderReport();showToast("Report submitted for QA review.");openSubmissionSuccessModal();
    });refreshIcons();
  }
  function openSubmissionSuccessModal(){
    showModal(`<div class="report-success-modal"><div class="success-circle"><i data-lucide="check"></i></div><h3>Report Submitted</h3><p>The validation report has been successfully submitted for QA review.</p><p><b>Report ID: VR-001</b></p><div class="modal-actions"><button class="secondary" id="viewSubmittedReportBtn" type="button">View Report</button><button class="primary close-modal" type="button">Close</button></div></div>`);
    $("viewSubmittedReportBtn")?.addEventListener("click",()=>{closeModal();openReportViewer();});refreshIcons();
  }

  function reviewReport(){
    if(!isQA()||!state.report||state.report.status!=="SUBMITTED FOR QA REVIEW")return;
    showModal(`<h3>QA Review — Validation Report</h3><p><b>Prepared by:</b> ${escapeHtml(state.report.preparedBy)}</p><p><b>IQ:</b> ${phaseStatus("IQ")} · <b>OQ:</b> ${phaseStatus("OQ")} · <b>PQ:</b> ${phaseStatus("PQ")}</p><label>QA Review Comment <span class="required">*</span></label><textarea id="reportQAComment" placeholder="Enter review comment..."></textarea><label>QA password for electronic signature</label><input id="reportQAPassword" type="password" placeholder="Enter QA password"><div id="reportQAError" class="error-message"></div><div class="modal-actions"><button class="secondary close-modal">Cancel</button><button class="secondary" id="requestRevisionBtn">Request Revision</button><button class="primary" id="approveReportBtn">Approve & Sign</button></div>`);
    const finish=approved=>{
      const c=$("reportQAComment").value.trim(),pw=$("reportQAPassword").value;if(!c){$("reportQAError").textContent="Review comment wajib diisi.";return;}if(approved&&pw!==USERS.qa.password){$("reportQAError").textContent="Password QA tidak sesuai.";return;}
      state.report.comment=c;state.report.reviewer=actorLabel();state.report.reviewedAt=now();state.report.status=approved?"APPROVED":"Revision Required";state.report.signature=approved?`${actorLabel()} · ${state.report.reviewedAt} · Approved`:null;
      localStorage.setItem("hplc_report",JSON.stringify(state.report));addAudit("Validation report QA review",approved?"Validation report APPROVED":"Validation report returned for revision");closeModal();renderReport();showToast(approved?"Validation Report approved.":"Revision required.");
    };
    $("approveReportBtn")?.addEventListener("click",()=>finish(true));$("requestRevisionBtn")?.addEventListener("click",()=>finish(false));
  }

  function showModal(html){const m=$("modalRoot");m.innerHTML=`<div class="modal-backdrop"><div class="modal-card">${html}</div></div>`;m.classList.remove("hidden");refreshIcons();m.querySelectorAll(".close-modal").forEach(b=>b.addEventListener("click",closeModal));}
  function closeModal(){$("modalRoot").classList.add("hidden");$("modalRoot").innerHTML="";}

  function downloadText(filename,text,mime="text/csv;charset=utf-8"){const blob=new Blob(["\ufeff"+text],{type:mime});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),500);}
  function csvCell(v){const x=String(v??"");return `"${x.replace(/"/g,'""')}"`;}
  function downloadURS(){
    showModal(`<h3>Download URS Summary</h3><p class="muted">Select content to include:</p><label class="check-row"><input type="checkbox" checked> Requirement list</label><label class="check-row"><input type="checkbox" checked> Status summary</label><label class="check-row"><input type="checkbox" checked> Test results (if available)</label><label class="check-row"><input type="checkbox"> Approval details</label><label>File format</label><select id="ursDlFormat"><option>PDF</option><option>CSV</option></select><div class="modal-actions"><button class="secondary close-modal">Cancel</button><button class="primary" id="ursDownloadConfirm"><i data-lucide="download"></i> Download</button></div>`);
    $("ursDownloadConfirm")?.addEventListener("click",()=>{const rows=getAllURS().map(u=>{const r=state.urs[u.id]||{};return [u.id,u.text,u.criteria,r.actual||"",r.testResult||"",r.reviewStatus||"Not Tested",r.executedBy||"",r.executedAt||""];});const csv=[["URS ID","Requirement","Acceptance Criteria","Actual Result","Test Result","Review Status","Executed By","Executed At"],...rows].map(r=>r.map(csvCell).join(",")).join("\n");downloadText("URS_Summary.csv",csv);closeModal();addAudit("URS summary downloaded","URS rekap downloaded as CSV");showToast("URS summary downloaded successfully.");});
  }
  function downloadValidationSummary(){
    showModal(`<h3>Download URS Summary</h3><p class="muted">Select content to include:</p><label class="check-row"><input id="dlValList" type="checkbox" checked> Test list and status summary</label><label class="check-row"><input id="dlValExec" type="checkbox" checked> Execution details</label><label class="check-row"><input id="dlValAttach" type="checkbox" checked> Attachments (if available)</label><label>File format</label><select id="validationDlFormat"><option>PDF</option><option>CSV</option></select><div class="modal-actions"><button class="secondary close-modal">Cancel</button><button class="primary" id="downloadValidationConfirm"><i data-lucide="download"></i> Download</button></div>`);
    $("downloadValidationConfirm")?.addEventListener("click",()=>{
      const rows=getValidationCases().map(t=>{const r=state.validation[t.id]||{};const ds=validationDisplayStatus(r);return [t.id,t.title,validationModule(t),ds.label,r.executedBy||"—",r.executedAt||"—",r.actualResult||"—"];});
      const csv=[["ID","TEST TITLE","MODULE","STATUS","EXECUTED BY","EXECUTED ON","ACTUAL RESULT"],...rows].map(r=>r.map(csvCell).join(",")).join("\n");
      downloadText("CSV_Validation_Summary.csv",csv);closeModal();addAudit("Validation summary downloaded","CSV Validation Center summary downloaded",{module:"CSV Validation",actionType:"Downloaded"});showToast("Validation summary downloaded successfully.");
    });refreshIcons();
  }
  function dashboardStatusFor(t){
    const r=state.validation[t.id]||{};
    if(!r.executedAt) return `<span class="dashboard-status-chip pending">Pending</span>`;
    if(r.reviewStatus==="Pending QA Review") return `<span class="dashboard-status-chip review">Pending QA</span>`;
    if(r.reviewStatus==="Approved") return `<span class="dashboard-status-chip approved">Approved</span>`;
    if(r.testResult==="FAIL") return `<span class="dashboard-status-chip fail">Failed</span>`;
    if(r.testResult==="PASS") return `<span class="dashboard-status-chip pass">Passed</span>`;
    return `<span class="dashboard-status-chip">In Progress</span>`;
  }
  function openDashboardDetail(kind){
    const labels={total:"All Tests",pending:"Pending Execution",review:"Pending QA Review",approved:"Approved Tests",failed:"Failed Tests",progress:"Overall Progress"};
    if(kind==="progress"){
      const cases=getValidationCases(), total=cases.length, done=cases.filter(t=>state.validation[t.id]?.executedAt).length, pct=total?Math.round(done/total*100):0;
      const phases=["IQ","OQ","PQ"].map(ph=>{const a=cases.filter(t=>t.phase===ph),d=a.filter(t=>state.validation[t.id]?.executedAt).length;return `<tr><td>${ph}</td><td>${d}</td><td>${a.length-d}</td><td>${a.length?Math.round(d/a.length*100):0}%</td></tr>`}).join("");
      showModal(`<h3>Overall Progress Details</h3><p class="dashboard-modal-note">Validation completion based on executed tests.</p><div class="result-box"><b style="font-size:28px">${pct}%</b><br><span>${done} of ${total} tests executed</span></div><table class="dashboard-detail-table"><thead><tr><th>Phase</th><th>Completed</th><th>Remaining</th><th>Progress</th></tr></thead><tbody>${phases}</tbody></table><div class="modal-actions"><button class="primary close-modal">Close</button></div>`);
      return;
    }
    const rows=dashboardRowsByStatus(kind);
    const body=rows.length?rows.map(t=>{const r=state.validation[t.id]||{};return `<tr class="dashboard-detail-row" data-validation-id="${escapeHtml(t.id)}"><td><b>${escapeHtml(t.id)}</b></td><td>${escapeHtml(t.title)}</td><td>${escapeHtml(t.phase)}</td><td>${dashboardStatusFor(t)}</td><td>${escapeHtml(r.executedAt||"—")}</td></tr>`}).join(""):`<tr><td colspan="5" class="dashboard-empty">No tests in this category.</td></tr>`;
    showModal(`<h3>${labels[kind]}</h3><p class="dashboard-modal-note">Click a test row to open its validation details.</p><table class="dashboard-detail-table"><thead><tr><th>ID</th><th>Test Name</th><th>Phase</th><th>Status</th><th>Executed</th></tr></thead><tbody>${body}</tbody></table><div class="modal-actions"><button class="primary close-modal">Close</button></div>`);
    $("modalRoot").querySelectorAll(".dashboard-detail-row").forEach(row=>row.addEventListener("click",()=>{const id=row.dataset.validationId;closeModal();showSection("validation");setTimeout(()=>{if($("validationSearch")){ $("validationSearch").value=id; renderValidation(); }},0);}));
  }
  function openDashboardSearch(){
    const q=$("dashboardSearch")?.value.trim().toLowerCase()||"";
    if(!q){showToast("Ketik kata kunci pada Search Bar terlebih dahulu.");$("dashboardSearch")?.focus();return;}
    const cases=getValidationCases().filter(t=>`${t.id} ${t.title} ${t.phase} ${t.objective} ${t.input}`.toLowerCase().includes(q));
    const audit=getAudit().filter(a=>`${a.user} ${a.action} ${a.details}`.toLowerCase().includes(q)).slice(0,10);
    const results=[...cases.map(t=>({type:"Validation Test",id:t.id,title:t.title,meta:`${t.phase} · CSV Validation Center`,go:"validation",search:t.id})),...audit.map(a=>({type:"Audit Trail",id:a.action,title:a.details,meta:`${a.user} · ${a.time}`,go:"audit",search:""}))].slice(0,12);
    const html=results.length?results.map((r,i)=>`<div class="dashboard-search-result" data-result-index="${i}"><b>${escapeHtml(r.id)}${r.type?` · ${escapeHtml(r.type)}`:""}</b><span>${escapeHtml(r.title)} · ${escapeHtml(r.meta)}</span></div>`).join(""):`<div class="dashboard-empty">No results found for “${escapeHtml(q)}”.</div>`;
    showModal(`<h3>Search Results</h3><p class="dashboard-modal-note">Results for “${escapeHtml(q)}”.</p><div class="dashboard-search-results">${html}</div><div class="modal-actions"><button class="primary close-modal">Close</button></div>`);
    $("modalRoot").querySelectorAll(".dashboard-search-result").forEach((el,i)=>el.addEventListener("click",()=>{const r=results[i];closeModal();showSection(r.go);if(r.go==="validation"&&r.search){setTimeout(()=>{if($("validationSearch")){ $("validationSearch").value=r.search;renderValidation();}},0);}}));
  }
  function openDashboardNotifications(){
    showModal(`<h3>Notifications</h3><div class="dashboard-menu-list"><button type="button" data-notif-go="validation"><b>New task assigned</b><br><span class="muted">Execute pending validation tests</span></button><button type="button" data-notif-go="instrument"><b>System status updated</b><br><span class="muted">HPLC-UV-001 is ready</span></button><button type="button" data-notif-go="report"><b>Document approval</b><br><span class="muted">Review the current validation report</span></button></div><div class="modal-actions"><button class="primary close-modal">Close</button></div>`);
    $("modalRoot").querySelectorAll("[data-notif-go]").forEach(b=>b.addEventListener("click",()=>{const go=b.dataset.notifGo;closeModal();showSection(go);}));
  }
  function openDashboardUserMenu(){
    showModal(`<h3>${escapeHtml(fullRole())}</h3><p class="dashboard-modal-note">Signed in as <b>${escapeHtml(displayUsername(state.user?.username||""))}</b></p><div class="dashboard-menu-list"><button type="button" data-user-go="admin">My Profile / Administration</button><button type="button" data-user-go="audit">View Audit Trail</button><button type="button" data-user-go="logout">Log Out</button></div><div class="modal-actions"><button class="secondary close-modal">Close</button></div>`);
    $("modalRoot").querySelectorAll("[data-user-go]").forEach(b=>b.addEventListener("click",()=>{const go=b.dataset.userGo;closeModal();if(go==="logout")performLogout();else showSection(go);}));
  }

  function initEvents(){
    $("downloadReportBtn")?.addEventListener("click",()=>{addAudit("Validation report downloaded","Validation report opened for PDF export");window.print();});
    $("logoutBtn")?.addEventListener("click",performLogout);
    document.querySelectorAll(".nav-item").forEach(b=>b.addEventListener("click",()=>{
      showSection(b.dataset.section);
      document.querySelectorAll(".nav-item").forEach(x=>x.classList.remove("active"));b.classList.add("active");
    }));
    document.querySelectorAll("[data-go]").forEach(b=>b.addEventListener("click",()=>showSection(b.dataset.go)));
    $("dashboardGoValidation")?.addEventListener("click",()=>showSection("validation"));
    $("dashboardViewAuditBtn")?.addEventListener("click",()=>showSection("audit"));
    $("dashboardViewTasksBtn")?.addEventListener("click",()=>showSection("validation"));
    $("dashboardSearch")?.addEventListener("input",e=>{const q=e.target.value.trim().toLowerCase();document.querySelectorAll(".dashboard-table tbody tr").forEach(r=>r.style.display=!q||r.textContent.toLowerCase().includes(q)?"":"none");});
    document.querySelectorAll("[data-dashboard-card]").forEach(card=>card.addEventListener("click",()=>openDashboardDetail(card.dataset.dashboardCard)));
    $("dashboardSearch")?.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();openDashboardSearch();}});
    $("dashboardNotificationsBtn")?.addEventListener("click",openDashboardNotifications);
    $("dashboardUserMenuBtn")?.addEventListener("click",openDashboardUserMenu);
    $("instrumentSystemCheckBtn")?.addEventListener("click",instrumentSystemCheckModal);
    $("instrumentViewDetailsBtn")?.addEventListener("click",instrumentDetailsModal);
    $("instrumentQualificationBtn")?.addEventListener("click",instrumentQualificationModal);
    $("instrumentMaintenanceBtn")?.addEventListener("click",instrumentMaintenanceModal);
    $("instrumentRecentRunsBtn")?.addEventListener("click",instrumentRecentRunsModal);
    $("editSequenceBtn")?.addEventListener("click",openEditSelectedSequence);
    $("deleteSequenceBtn")?.addEventListener("click",openDeleteSequenceModal);
    $("assayResetZoom")?.addEventListener("click",()=>showToast("Chromatogram zoom reset."));
    $("saveMethodBtn")?.addEventListener("click",saveMethodRecord);
    $("newMethodBtn")?.addEventListener("click",()=>{if(!canOperate()){showToast("QA tidak dapat membuat Method baru.");return;}clearMethodForm();});
    $("addURSBtn")?.addEventListener("click",openAddURSModal);
    $("ursSearch")?.addEventListener("input",()=>{ursPage=1;renderURS();});
    $("ursCategoryFilter")?.addEventListener("change",()=>{ursPage=1;renderURS();});
    $("ursStatusFilter")?.addEventListener("change",()=>{ursPage=1;renderURS();});
    $("ursResetFilters")?.addEventListener("click",()=>{$("ursSearch").value="";$('ursCategoryFilter').value="";$('ursStatusFilter').value="";ursPage=1;renderURS();});
    $("validationSearch")?.addEventListener("input",()=>{validationPage=1;renderValidation();});
    $("validationStatusFilter")?.addEventListener("change",()=>{validationPage=1;renderValidation();});
    $("validationModuleFilter")?.addEventListener("change",()=>{validationPage=1;renderValidation();});
    $("validationResetFilters")?.addEventListener("click",()=>{$("validationSearch").value="";$("validationStatusFilter").value="";$("validationModuleFilter").value="";validationPage=1;renderValidation();});
    $("validationPrev")?.addEventListener("click",()=>{if(validationPage>1){validationPage--;renderValidation();}});
    $("auditApplyBtn")?.addEventListener("click",()=>{auditPage=1;renderAudit();showToast("Audit filters applied.");});
    $("auditResetBtn")?.addEventListener("click",resetAuditFilters);
    $("auditPrevBtn")?.addEventListener("click",()=>{if(auditPage>1){auditPage--;renderAudit();}});
    $("auditNextBtn")?.addEventListener("click",()=>{const max=Math.max(1,Math.ceil(auditFilteredRows.length/AUDIT_PAGE_SIZE));if(auditPage<max){auditPage++;renderAudit();}});
    $("auditRecordSearch")?.addEventListener("input",()=>{auditPage=1;renderAudit();});
    $("auditDetailsCloseBtn")?.addEventListener("click",()=>{$("auditDetailsPanel")?.classList.remove("is-open");document.querySelectorAll(".audit-row").forEach(r=>r.classList.remove("selected"));});
    $("exportAuditBtn")?.addEventListener("click",exportAuditTrail);
    $("validationNext")?.addEventListener("click",()=>{validationPage++;renderValidation();});
    $("downloadURSBtn")?.addEventListener("click",downloadURS);$("downloadValidationBtn")?.addEventListener("click",downloadValidationSummary);$("downloadSequenceBtn")?.addEventListener("click",downloadSequence);$("downloadChromBtn")?.addEventListener("click",downloadChromatogram);$("addValidationBtn")?.addEventListener("click",()=>openValidationDefinitionModal());$("resetAllDataBtn")?.addEventListener("click",resetAllData);
    $("savedMethodSelect")?.addEventListener("change",()=>{const id=$("savedMethodSelect").value;if(id)populateMethodForm(id);else updateMethodApprovalUI();});
    $("elutionMode")?.addEventListener("change",()=>{updateElutionModeUI();addAudit("Method Elution Mode changed",`Elution Mode changed to ${$("elutionMode").value}`);});
    $("addGradientRowBtn")?.addEventListener("click",()=>{const rows=getGradientRowsFromUI();const last=rows[rows.length-1];rows.push({time:last?Number((last.time+5).toFixed(1)):0,a:last?.a??90,b:last?.b??10,flow:last?.flow??1});renderGradientProgram(rows);});
    $("saveGradientBtn")?.addEventListener("click",()=>{
      if(!validateGradientProgram(true))return;
      const selectedId=$("savedMethodSelect").value,record=selectedId?getMethodById(selectedId):null;
      const rows=getGradientRowsFromUI();
      if(record){
        if(normalizeMethod(record).status==="Approved"){showToast("Approved Method tidak dapat diubah. Buat New Method/version terlebih dahulu.");return;}
        record.gradientProgram=rows;record.elutionMode="Gradient";record.updatedAt=now();record.updatedBy=actorLabel();saveMethods();
        addAudit("Gradient Program saved",`${record.name} (${record.id}) gradient program updated`,{newValue:JSON.stringify(rows)});
      }
      showToast("Gradient Program saved.");
    });
    $("methodQAApproveBtn")?.addEventListener("click",approveMethodAsQA);
    $("addSequenceBtn")?.addEventListener("click",()=>openSequenceModal());$("runSequenceBtn")?.addEventListener("click",openRunSequenceModal);
    if($("sequenceSelectAll")) $("sequenceSelectAll")?.addEventListener("change",()=>document.querySelectorAll(".sequence-row-check").forEach(c=>c.checked=$("sequenceSelectAll").checked));
    $("loadSequenceTemplateBtn")?.addEventListener("click",loadSequenceTemplate);
    $("importSequenceBtn")?.addEventListener("click",openImportSequenceModal);
    $("previewSequenceBtn")?.addEventListener("click",openSequencePreviewModal);
    $("viewSequenceRunLogBtn")?.addEventListener("click",openSequenceRunLogModal);
    document.querySelectorAll(".sequence-tab").forEach(tab=>tab.addEventListener("click",()=>{document.querySelectorAll(".sequence-tab").forEach(t=>t.classList.remove("active"));tab.classList.add("active");const injections=tab.dataset.seqTab==="injections";$("sequenceInjectionsTab").classList.toggle("hidden",!injections);$("sequenceSettingsTab").classList.toggle("hidden",injections);}));
    $("sequenceRunFromSettingsBtn")?.addEventListener("click",openRunSequenceModal);
    $("sequencePreviewSettingsBtn")?.addEventListener("click",openSequencePreviewModal);
    $("sequenceSaveDraftBtn")?.addEventListener("click",()=>{localStorage.setItem("hplc_sequence_settings",JSON.stringify({name:$('sequenceName')?.value||'',method:$('sequenceMethodInfo')?.value||'',wavelength:$('sequenceWavelength')?.value||'',flowRate:$('sequenceFlowRate')?.value||''}));addAudit("Sequence draft saved","Sequence run settings saved as draft",{module:"Sequence",actionType:"Updated",recordId:"SEQ-001"});showToast("Sequence saved as draft.");});
    $("sequenceAutoIntegrate")?.addEventListener("change",e=>{const label=e.target.closest(".toggle-setting")?.querySelector("b");if(label)label.textContent=e.target.checked?"Enabled":"Disabled";});
    $("sequenceAutoPrint")?.addEventListener("change",e=>{const label=e.target.closest(".toggle-setting")?.querySelector("b");if(label)label.textContent=e.target.checked?"Enabled":"Disabled";});

    if($("sequenceNotes")){ $("sequenceNotes").value=localStorage.getItem("hplc_sequence_notes")||""; $("sequenceNotes")?.addEventListener("input",()=>localStorage.setItem("hplc_sequence_notes",$("sequenceNotes").value)); }
    $("pumpFlow")?.addEventListener("input",()=>{$("pressureValue").textContent=`${Math.round(105+(Number($("pumpFlow").value)||0)*7)} bar`;});$("ovenTemp")?.addEventListener("input",()=>$("ovenValue").textContent=`${$("ovenTemp").value} °C`);
    $("uvWavelength")?.addEventListener("input",()=>{const v=$("uvWavelength").value;$("uvRange").textContent=isValidWavelength(v)?"Valid wavelength":"Invalid: accepted range is 190–600 nm";$("uvRange").className=isValidWavelength(v)?"module-value pass":"module-value fail";});
    $("verifyDetectorBtn")?.addEventListener("click",instrumentVerification);
    $("calculateBtn")?.addEventListener("click",openCalculateModal);$("submitDataReviewBtn")?.addEventListener("click",submitDataReview);$("dataReviewQAButton")?.addEventListener("click",openDataReviewQA);$("chromSampleSelect")?.addEventListener("change",renderChromatogram);
    if($("assayInjectionSelect"))$("assayInjectionSelect")?.addEventListener("change",renderAssayPage);
    if($("assayPrevBtn"))$("assayPrevBtn")?.addEventListener("click",()=>{const k=getAssayInjectionKeys(),i=k.indexOf(getAssaySelectedKey());if(k.length){$("assayInjectionSelect").value=k[(i-1+k.length)%k.length];renderAssayPage();}});
    if($("assayNextBtn"))$("assayNextBtn")?.addEventListener("click",()=>{const k=getAssayInjectionKeys(),i=k.indexOf(getAssaySelectedKey());if(k.length){$("assayInjectionSelect").value=k[(i+1)%k.length];renderAssayPage();}});
    if($("viewAssayChromBtn"))$("viewAssayChromBtn")?.addEventListener("click",()=>{const k=getAssaySelectedKey();if(k&&$("chromSampleSelect")){$("chromSampleSelect").value=k;renderChromatogram();}showSection("chromatogram");});
    if($("assayExpandChromBtn"))$("assayExpandChromBtn")?.addEventListener("click",()=>{const k=getAssaySelectedKey();if(k&&$("chromSampleSelect")){$("chromSampleSelect").value=k;renderChromatogram();}showSection("chromatogram");});
    if($("assayPeakLabelsToggle"))$("assayPeakLabelsToggle")?.addEventListener("change",()=>$("assayPeakLabels")?.classList.toggle("hidden",!$("assayPeakLabelsToggle").checked));
    $("saveAssayResultBtn")?.addEventListener("click",openSaveAssayResultModal);
    $("downloadAssayResultBtn")?.addEventListener("click",openDownloadAssayResultModal);
    $("prepareReportBtn")?.addEventListener("click",finalizeReport);$("reviewReportBtn")?.addEventListener("click",reviewReport);$("downloadReportBtn")?.addEventListener("click",prepareReport);
    $("saveReportDraftBtn")?.addEventListener("click",()=>{state.report={...(state.report||{}),status:"DRAFT",title:$("reportTitleInput")?.value||"HPLC-UV CSV Validation Report",version:$("reportVersionInput")?.value||"1.0",preparedBy:actorLabel(),preparedAt:now()};localStorage.setItem("hplc_report",JSON.stringify(state.report));addAudit("Validation report draft saved","QC saved validation report as draft");renderReport();showToast("Validation report saved as draft.");});
    $("previewReportBtn")?.addEventListener("click",()=>{renderReport();openReportViewer();});
    $("reportTitleInput")?.addEventListener("input",renderReportPaper);$("reportVersionInput")?.addEventListener("change",renderReportPaper);$("reportPreparedDate")?.addEventListener("input",renderReportPaper);
    $("reportPrevPageBtn")?.addEventListener("click",()=>showToast("Previous report page."));$("reportNextPageBtn")?.addEventListener("click",()=>showToast("Next report page."));
    $("reportZoomOutBtn")?.addEventListener("click",()=>changeReportZoom(-10));$("reportZoomInBtn")?.addEventListener("click",()=>changeReportZoom(10));$("reportFullscreenBtn")?.addEventListener("click",()=>openReportViewer());
  }


  function addAudit(action,details,meta={}){
    const audit=getAudit();
    const module=meta.module||auditModule({action,details});
    const actionType=meta.actionType||auditActionType({action,details});
    const recordId=meta.recordId||meta.testId||auditRecordId({action,details,testId:meta.testId});
    audit.unshift({time:now(),user:displayUsername(state.user?.username||"system"),role:fullRole(),action,details,module,actionType,recordId,...meta});
    localStorage.setItem("hplc_audit",JSON.stringify(audit.slice(0,100)));
    renderAudit();updateDashboard();
  }
  function roleDisplayName(role){
    return role === "QA" ? "Quality Assurance" : role === "Admin" ? "Administrator" : "Quality Control";
  }
  function bindLogin(){
    const form=$("loginForm");
    if(!form || form.dataset.loginBound === "1") return;
    form.dataset.loginBound="1";
    form.addEventListener("submit",e=>{
      e.preventDefault();
      const username=$("usernameInput")?.value.trim().toLowerCase() || "";
      const password=$("passwordInput")?.value || "";
      performLogin(username,password);
    });
  }
  function performLogin(username,password){
    const account=USERS[username];
    if(!account||account.password!==password){$("loginMessage").textContent="Username atau password salah.";return false;}
    state.user={username,role:account.role,fullRole:roleDisplayName(account.role)};
    sessionStorage.setItem("hplc_user",JSON.stringify(state.user));
    $("loginScreen").classList.add("hidden");$("appScreen").classList.remove("hidden");
    renderUserBadge();applyRoleControls();setMethodEditMode(false);$("loginMessage").textContent="";addAudit("Login","User successfully signed in");
    showSection("dashboard");showToast(`Welcome, ${roleDisplayName(account.role)}`);return true;
  }
  function restoreSession(){
    try{
      const s=JSON.parse(sessionStorage.getItem("hplc_user")||"null");
      if(s&&USERS[s.username]&&USERS[s.username].role===s.role){
        state.user={...s,fullRole:roleDisplayName(USERS[s.username].role)};
        $("loginScreen").classList.add("hidden");$("appScreen").classList.remove("hidden");renderUserBadge();applyRoleControls();setMethodEditMode(false);
      }
    }catch{}
  }

  // Instrument interaction workflow: realistic modals, tabbed module configuration,
  // system check progress, qualification/maintenance records and verification results.
  function instrumentDetailsModal(){
    showModal(`<div class="instrument-modal-title"><div class="instrument-modal-icon"><i data-lucide="microscope"></i></div><div><h3>Instrument Details</h3><span class="instrument-qualified"><span class="dot"></span> Qualified</span></div><button class="icon-button close-modal" type="button" aria-label="Close"><i data-lucide="x"></i></button></div>
      <div class="modal-summary-grid instrument-detail-grid">
        <div><span>Instrument ID</span><b>HPLC-UV-001</b></div><div><span>Instrument Type</span><b>HPLC-UV System (Simulated)</b></div>
        <div><span>Location</span><b>QC Laboratory</b></div><div><span>Software</span><b>HPLC-UV CSV System v1.0.0</b></div>
        <div><span>Firmware Version</span><b>1.0.0</b></div><div><span>Serial Number</span><b>UV001-2026</b></div>
        <div><span>Installation Date</span><b>16 Aug 2025</b></div><div><span>Last Calibration</span><b>01 Aug 2026</b></div>
        <div><span>Last Verification</span><b>12 Sep 2026</b></div><div><span>Next Verification</span><b>12 Sep 2027</b></div>
      </div><div class="modal-actions"><button class="secondary close-modal">Close</button></div>`);
  }

  function instrumentSystemCheckModal(){
    showModal(`<div class="instrument-check-modal"><div class="run-modal-icon"><i data-lucide="scan-search"></i></div><h3>Run System Check</h3><p class="muted">Run a complete system check for all HPLC-UV modules.</p>
      <div class="instrument-check-list"><label><input type="checkbox" checked disabled> Pump</label><label><input type="checkbox" checked disabled> Autosampler</label><label><input type="checkbox" checked disabled> Column Oven</label><label><input type="checkbox" checked disabled> UV Detector</label></div>
      <div id="instrumentCheckError" class="error-message"></div><div class="modal-actions"><button class="secondary close-modal">Cancel</button><button class="primary" id="startInstrumentCheckBtn">Start Check</button></div></div>`);
    $("startInstrumentCheckBtn")?.addEventListener("click",startInstrumentSystemCheck);
  }

  function startInstrumentSystemCheck(){
    const m=$("modalRoot"); if(!m)return;
    m.querySelector(".modal-card").innerHTML=`<div class="instrument-check-modal"><div class="run-modal-icon"><i data-lucide="loader-circle"></i></div><h3>Running System Check</h3><p class="muted">Please wait while the system is being checked...</p><div class="instrument-progress"><span id="instrumentProgressBar"></span></div><div class="instrument-progress-label"><b id="instrumentProgressText">0%</b></div><div id="instrumentCheckSteps" class="instrument-check-list"></div><div class="modal-actions"><button class="secondary" id="cancelInstrumentCheckBtn">Cancel</button></div></div>`;
    refreshIcons();
    const modules=["Pump","Autosampler","Column Oven","UV Detector"];
    let index=0, cancelled=false;
    const render=()=>{
      const completed=modules.map((x,i)=>`<div class="instrument-check-step"><span class="step-icon ${i<index?'done':i===index?'running':''}"><i data-lucide="${i<index?'check':i===index?'loader-circle':'circle'}"></i></span><b>${x}</b><span>${i<index?'Completed':i===index?'In progress...':'Waiting...'}</span></div>`).join("");
      $("instrumentCheckSteps").innerHTML=completed; $("instrumentProgressBar").style.width=`${Math.round(index/modules.length*100)}%`; $("instrumentProgressText").textContent=`${Math.round(index/modules.length*100)}%`;refreshIcons();
    };
    render();
    $("cancelInstrumentCheckBtn")?.addEventListener("click",()=>{cancelled=true;closeModal();showToast("System check cancelled.");});
    const tick=()=>{
      if(cancelled)return;
      index++;
      if(index<modules.length){render();setTimeout(tick,650);}
      else{
        $("instrumentProgressBar").style.width="100%";$("instrumentProgressText").textContent="100%";
        setTimeout(()=>instrumentSystemCheckCompleted(),550);
      }
    };
    setTimeout(tick,650);
  }

  function instrumentSystemCheckCompleted(){
    showModal(`<div class="instrument-complete-modal"><div class="success-check"><i data-lucide="check"></i></div><h3>System Check Completed</h3><p>System check completed successfully.</p><div class="instrument-result-list">${["Pump","Autosampler","Column Oven","UV Detector"].map(x=>`<div><span><i data-lucide="check-circle-2"></i>${x}</span><b class="instrument-pass-badge">Pass</b></div>`).join("")}</div><div class="modal-actions"><button class="secondary" id="viewSystemCheckReportBtn">View Report</button><button class="primary close-modal">Close</button></div></div>`);
    addAudit("System check","HPLC-UV system check completed successfully.",{module:"Instrument",actionType:"Executed"});
    refreshIcons();
    $("viewSystemCheckReportBtn")?.addEventListener("click",()=>{showToast("System check report opened.");});
  }

  function instrumentQualificationModal(){
    showModal(`<h3>Qualification Records</h3><div class="instrument-record-tabs"><button class="instrument-record-tab active" data-record-tab="IQ">IQ</button><button class="instrument-record-tab" data-record-tab="OQ">OQ</button><button class="instrument-record-tab" data-record-tab="PQ">PQ</button></div><div id="instrumentQualificationBody" class="instrument-record-body"></div><div class="modal-actions"><button class="secondary close-modal">Close</button></div>`);
    const data={IQ:[["IQ Protocol","10 Aug 2025","Approved"],["IQ Report","15 Aug 2025","Approved"],["IQ Deviation","15 Aug 2025","N/A"],["IQ Summary","16 Aug 2025","Approved"]],OQ:[["OQ Protocol","20 Aug 2025","Approved"],["OQ Report","22 Aug 2025","Approved"],["OQ Summary","22 Aug 2025","Approved"]],PQ:[["PQ Protocol","28 Aug 2025","Approved"],["PQ Report","01 Sep 2025","Approved"],["PQ Summary","01 Sep 2025","Approved"]]};
    const render=tab=>{$("instrumentQualificationBody").innerHTML=`<table><thead><tr><th>Document Name</th><th>Date</th><th>Status</th><th>Action</th></tr></thead><tbody>${data[tab].map(r=>`<tr><td>${r[0]}</td><td>${r[1]}</td><td><span class="instrument-pass-badge">${r[2]}</span></td><td><button class="secondary small-action instrument-view-record" type="button">View</button></td></tr>`).join("")}</tbody></table>`;refreshIcons();$("instrumentQualificationBody").querySelectorAll(".instrument-view-record").forEach(b=>b.addEventListener("click",()=>showToast("Qualification record opened.")));};
    render("IQ");
    document.querySelectorAll(".instrument-record-tab").forEach(b=>b.addEventListener("click",()=>{document.querySelectorAll(".instrument-record-tab").forEach(x=>x.classList.remove("active"));b.classList.add("active");render(b.dataset.recordTab);}));
  }

  function instrumentMaintenanceModal(){
    showModal(`<h3>Maintenance Log</h3><table><thead><tr><th>Date</th><th>Activity</th><th>Performed By</th><th>Status</th></tr></thead><tbody>
      <tr><td>01 Aug 2026</td><td>Calibration</td><td>Service Engineer</td><td><span class="instrument-pass-badge">Completed</span></td></tr>
      <tr><td>15 Jun 2026</td><td>Lamp Replacement</td><td>Service Engineer</td><td><span class="instrument-pass-badge">Completed</span></td></tr>
      <tr><td>10 Mar 2026</td><td>Preventive Maintenance</td><td>Service Engineer</td><td><span class="instrument-pass-badge">Completed</span></td></tr>
      <tr><td>12 Jan 2026</td><td>System Cleaning</td><td>QC</td><td><span class="instrument-pass-badge">Completed</span></td></tr></tbody></table><div class="modal-actions"><button class="secondary close-modal">Close</button></div>`);
  }

  function instrumentConfigureModule(index){
    if(!canOperate()){showToast("QA hanya dapat melihat konfigurasi instrument.");return;}
    const names=["Pump","Autosampler","Column Oven","UV Detector"]; const body=[
      `<div class="config-grid"><div><label>Flow rate (mL/min)</label><input id="modalPumpFlow" type="number" step="0.001" value="${$("pumpFlow")?.value||"1.000"}"></div><div><label>Gradient mode</label><select id="modalPumpMode"><option>Isocratic</option><option>Gradient</option></select></div><div><label>Pressure limit (bar)</label><input id="modalPressure" type="number" value="400"></div><div><label>Stop time (min)</label><input id="modalStop" type="number" value="10.0"></div><div><label>Solvent A</label><select id="modalSolventA"><option>Water</option><option>Acetonitrile</option></select></div><div><label>Post time (min)</label><input id="modalPost" type="number" value="5.0"></div><div><label>Solvent B</label><select id="modalSolventB"><option>Acetonitrile</option><option>Water</option></select></div></div>`,
      `<div class="config-grid"><div><label>Injection volume (µL)</label><input id="modalAutoVolume" type="number" value="${$("instrumentInjectionVolume")?.value||"10"}"></div><div><label>Temperature (°C)</label><input id="modalAutoTemp" type="number" value="10"></div><div><label>Vial position</label><input value="01"></div><div><label>Injection mode</label><select><option>Full loop</option><option>Partial loop</option></select></div><div><label>Syringe wash</label><select><option>Enable</option><option>Disable</option></select></div><div><label>Wash cycles</label><input type="number" value="3"></div></div>`,
      `<div class="config-grid"><div><label>Temperature (°C)</label><input id="modalOvenTemp" type="number" value="${$("ovenTemp")?.value||"30"}"></div><div><label>Temperature limit (°C)</label><input type="number" value="80"></div><div><label>Equilibration time (min)</label><input type="number" value="5"></div><div><label>Control mode</label><select><option>Constant</option><option>Programmed</option></select></div></div>`,
      `<div class="config-grid"><div><label>Wavelength (nm)</label><input id="modalUVWave" type="number" value="${$("uvWavelength")?.value||"243"}"></div><div><label>Bandwidth (nm)</label><input type="number" value="4"></div><div><label>Reference wavelength (nm)</label><input type="number" value="360"></div><div><label>Response time (s)</label><input type="number" value="1"></div></div>`][index];
    showModal(`<div class="instrument-config-modal"><div class="panel-head"><h3>${names[index]} Configuration</h3><button class="icon-button close-modal"><i data-lucide="x"></i></button></div>${body}<div id="instrumentConfigError" class="error-message"></div><div class="modal-actions"><button class="secondary close-modal">Cancel</button><button class="primary" id="saveInstrumentConfigBtn">Save Settings</button></div></div>`);
    $("saveInstrumentConfigBtn")?.addEventListener("click",()=>{
      if(index===0){const v=Number($("modalPumpFlow").value);if(!(v>0))return $("instrumentConfigError").textContent="Flow rate must be greater than 0.";if($("pumpFlow"))$("pumpFlow").value=v.toFixed(1);}
      if(index===1){const v=Number($("modalAutoVolume").value);if(!(v>0))return $("instrumentConfigError").textContent="Injection volume must be greater than 0.";if($("instrumentInjectionVolume"))$("instrumentInjectionVolume").value=v;}
      if(index===2){const v=Number($("modalOvenTemp").value);if(!(v>=0&&v<=100))return $("instrumentConfigError").textContent="Temperature must be between 0–100 °C.";if($("ovenTemp")){$("ovenTemp").value=v;$('ovenValue').textContent=`${v} °C`;}}
      if(index===3){const v=Number($("modalUVWave").value);if(!isValidWavelength(v))return $("instrumentConfigError").textContent="Wavelength must be within 190–600 nm.";if($("uvWavelength"))$("uvWavelength").value=v;}
      addAudit("Instrument settings saved",`${names[index]} settings updated.`,{module:"Instrument",actionType:"Modified"});closeModal();showToast(`${names[index]} settings updated successfully.`);
    });
  }

  function instrumentTab(index){
    document.querySelectorAll(".instrument-tab").forEach((x,i)=>x.classList.toggle("active",i===index));
    const headings=["Pump Configuration","Autosampler Configuration","Column Oven Configuration","UV Detector Configuration"];
    const panel=document.querySelector(".instrument-config-panel"); if(!panel)return;
    const h=panel.querySelector("h3");if(h)h.textContent=headings[index];
    const controls=["pumpFlow","instrumentInjectionVolume","ovenTemp","uvWavelength"]; const el=$(controls[index]); if(el)el.focus();
    showToast(`${headings[index]} selected.`);
  }

  function instrumentDiagnostic(){
    addAudit("Diagnostic test","Instrument diagnostic test executed.",{module:"Instrument",actionType:"Executed"});
    showModal(`<div class="instrument-complete-modal"><div class="success-check"><i data-lucide="check"></i></div><h3>Diagnostic Test Completed</h3><p>All HPLC-UV modules are responding normally.</p><div class="instrument-result-list">${["Pump","Autosampler","Column Oven","UV Detector"].map(x=>`<div><span><i data-lucide="check-circle-2"></i>${x}</span><b class="instrument-pass-badge">Ready</b></div>`).join("")}</div><div class="modal-actions"><button class="primary close-modal">Close</button></div></div>`);
  }

  function instrumentVerification(){
    if(!canOperate()){showToast("QA tidak dapat menjalankan instrument verification.");return;}
    const item=document.querySelector(".verification-layout select")?.value||"UV Wavelength Accuracy"; const value=Number($("detectorTestValue")?.value);
    if(!Number.isFinite(value)){ $("detectorResult").className="result-box"; $("detectorResult").textContent="Enter a test value before verification.";return; }
    const pass=item.includes("Wavelength")?isValidWavelength(value):true;
    const result=$("detectorResult");result.className=`result-box ${pass?'pass-box':'fail-box'}`;result.innerHTML=`<b>${pass?'PASS':'FAIL'}</b> — ${escapeHtml(String(value))} ${item.includes("Wavelength")?'nm':'value'} ${pass?'meets':'does not meet'} the acceptance range.`;
    addAudit("Instrument verification",`${item}: ${value} → ${pass?'PASS':'FAIL'}`,{module:"Instrument",actionType:"Executed"});showToast(pass?"Verification passed.":"Verification failed.");
  }

  function instrumentRecentRunsModal(){
    const rows=["12 Sep 2026, 10:15|SEQ-001|Completed|QC","10 Sep 2026, 14:32|SEQ-002|Completed|QC","08 Sep 2026, 11:20|SEQ-003|Failed|QC","05 Sep 2026, 09:18|SEQ-004|Completed|QA"].map(x=>x.split("|"));
    showModal(`<h3>Recent Runs</h3><table><thead><tr><th>Date/Time</th><th>Sequence</th><th>Status</th><th>User</th><th>Action</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${r[0]}</td><td>${r[1]}</td><td><span class="case-status ${r[2]==='Completed'?'pass':'fail'}">${r[2]}</span></td><td>${r[3]}</td><td><button class="secondary small-action" type="button" data-run-view="${r[1]}">View</button></td></tr>`).join("")}</tbody></table><div class="modal-actions"><button class="secondary close-modal">Close</button></div>`);
    document.querySelectorAll("[data-run-view]").forEach(b=>b.addEventListener("click",()=>showToast(`${b.dataset.runView} run details opened.`)));
  }

  function initFunctionalButtonFallbacks(){
    // Buttons that are present in the UI mockup but previously had no action.
    document.querySelectorAll(".icon-button[aria-label=\"Notifications\"]").forEach(b=>b.addEventListener("click",()=>showToast("No new critical notifications.")));
    document.querySelectorAll(".module-config").forEach((b,i)=>b.addEventListener("click",()=>instrumentConfigureModule(i)));
    document.querySelectorAll(".instrument-tab").forEach((b,i)=>b.addEventListener("click",()=>instrumentTab(i)));
    document.querySelectorAll(".restore-default").forEach(b=>b.addEventListener("click",()=>{
      if(!canOperate()){showToast("QA hanya dapat melihat instrument.");return;}
      showModal(`<div class="instrument-complete-modal"><div class="run-modal-icon"><i data-lucide="rotate-ccw"></i></div><h3>Restore Default Settings</h3><p>Are you sure you want to restore default settings for the instrument modules?</p><p class="muted">This will overwrite the current configuration.</p><div class="modal-actions"><button class="secondary close-modal">Cancel</button><button class="danger-button" id="confirmRestoreInstrumentBtn">Restore</button></div></div>`);
      $("confirmRestoreInstrumentBtn")?.addEventListener("click",()=>{if($("pumpFlow"))$("pumpFlow").value="1.0";if($("pressureValue"))$("pressureValue").textContent="112 bar";if($("instrumentInjectionVolume"))$("instrumentInjectionVolume").value="10";if($("ovenTemp")){$("ovenTemp").value="30";$("ovenValue").textContent="30 °C";}if($("uvWavelength"))$("uvWavelength").value="243";addAudit("Instrument defaults restored","Instrument settings restored to controlled defaults.",{module:"Instrument",actionType:"Modified"});closeModal();showToast("Default settings restored.");});
    }));
    document.querySelectorAll(".config-actions button").forEach(b=>b.addEventListener("click",()=>{
      const t=b.textContent.trim().toLowerCase(); if(t.includes("cancel")){showToast("Instrument changes cancelled.");return;}
      if(!canOperate()){showToast("QA hanya dapat melihat instrument.");return;}
      addAudit("Instrument settings saved","Instrument operating parameters saved.",{module:"Instrument",actionType:"Modified"}); showToast("Instrument settings saved successfully.");
    }));
    document.querySelectorAll(".diagnostic-btn").forEach(b=>b.addEventListener("click",instrumentDiagnostic));
    document.querySelectorAll(".module-card .module-config").forEach(b=>b.setAttribute("title","Configure module"));
    document.querySelectorAll(".dashboard-user").forEach(b=>b.addEventListener("click",()=>showToast(`Signed in as ${fullRole()}.`)));
    document.querySelectorAll(".report-preview-toolbar button").forEach((b,i)=>b.addEventListener("click",()=>showToast(i===0?"Previous page":"Report preview control selected.")));
    document.querySelectorAll(".assay-chart-tools .icon-button").forEach(b=>b.addEventListener("click",()=>showToast("Chromatogram display control applied.")));
    document.querySelectorAll(".assay-chart-tools label input").forEach(()=>{});
    document.querySelectorAll(".admin-more-btn").forEach(b=>b.addEventListener("click",()=>showToast("More user actions are available through Edit User.")));
    document.querySelectorAll("button:not([disabled])").forEach(b=>{
      if(b.dataset.fallbackBound) return;
      const hasId=!!b.id, hasData=[...b.attributes].some(a=>a.name.startsWith("data-"));
      const hasKnownHandler=hasId || hasData || b.classList.contains("nav-item") || b.classList.contains("method-tab") || b.classList.contains("sequence-tab") || b.classList.contains("admin-tab");
      if(hasKnownHandler) return;
      b.dataset.fallbackBound="1";
      b.addEventListener("click",()=>{
        const label=b.textContent.replace(/\s+/g," ").trim();
        if(label) showToast(`${label} selected.`);
      });
    });
  }

  // Analytical Method interaction layer: keeps the existing application features intact.
  let methodEditSnapshot=null, methodGradientDraft=[];
  function cloneMethod(x){return JSON.parse(JSON.stringify(x));}
  function ensureMethodFields(){
    if(methodData.mobileA==="0.1% Orthophosphoric acid in water") methodData.mobileA="Water";
    methodData.mobileAPercent=methodData.mobileAPercent??70; methodData.mobileBPercent=methodData.mobileBPercent??30;
    methodData.sampleTemp=methodData.sampleTemp??25; methodData.elution=methodData.elution||"Gradient"; methodData.gradient=Array.isArray(methodData.gradient)?methodData.gradient:[];
  }
  function methodLibrary(){try{return JSON.parse(localStorage.getItem("hplc_analytical_method_library")||"[]");}catch{return[];}}
  function persistMethod(){localStorage.setItem("hplc_method",JSON.stringify(methodData));}
  function saveMethodLibrary(x){localStorage.setItem("hplc_analytical_method_library",JSON.stringify(x));}
  function getMethodRevisions(){try{const x=JSON.parse(localStorage.getItem("hplc_method_revision_history")||"[]");if(x.length)return x;}catch{}return[{version:"1.0.0",date:"1 Sep 2026, 09:00",modifiedBy:"QC-001",changes:"Initial method creation",status:"Active"}];}
  function saveMethodRevision(version,changes,status="Active",modifiedBy){const x=getMethodRevisions();x.unshift({version,date:now(),modifiedBy:modifiedBy||displayUsername(state.user?.username)||"QC-001",changes,status});localStorage.setItem("hplc_method_revision_history",JSON.stringify(x.slice(0,50)));}
  function setInlineError(id,msg){const el=$(id);if(!el)return;el.classList.toggle("input-error",!!msg);let e=el.parentElement?.querySelector(`.field-error[data-for="${id}"]`);if(msg&&!e){e=document.createElement("div");e.className="field-error";e.dataset.for=id;el.parentElement?.appendChild(e);}if(e){e.textContent=msg;e.classList.toggle("hidden",!msg);}}
  function clearMethodErrors(){document.querySelectorAll("#method .field-error").forEach(e=>{e.textContent="";e.classList.add("hidden")});document.querySelectorAll("#method .input-error").forEach(e=>e.classList.remove("input-error"));}
  function updateMethodParamInputs(){
    ensureMethodFields();const v={paramColumnInput:methodData.column,paramColumnTempInput:methodData.columnTemp,paramMobileAInput:methodData.mobileA,paramMobileBInput:methodData.mobileB,paramFlowInput:methodData.flow,paramInjectionInput:methodData.injection,paramWavelengthInput:methodData.wavelength,paramRunTimeInput:methodData.runTime,paramElutionInput:methodData.elution,paramSampleTempInput:methodData.sampleTemp,methodIsocraticA:methodData.mobileAPercent,methodIsocraticB:methodData.mobileBPercent,methodIsocraticA2:methodData.mobileAPercent,methodIsocraticB2:methodData.mobileBPercent};Object.entries(v).forEach(([id,x])=>{if($(id))$(id).value=x??""});
  }
  function syncParameterToDetails(){
    const map={paramColumnInput:"methodColumnInput",paramColumnTempInput:"methodColumnTempInput",paramMobileAInput:"methodMobileAInput",paramMobileBInput:"methodMobileBInput",paramFlowInput:"methodFlowInput",paramInjectionInput:"methodInjectionInput",paramWavelengthInput:"methodWavelengthInput",paramRunTimeInput:"methodRunTimeInput",paramSampleTempInput:"methodSampleTempInput"};Object.entries(map).forEach(([a,b])=>{if($(a)&&$(b))$(b).value=$(a).value});if($("paramElutionInput")){document.querySelectorAll('input[name="methodElution"]').forEach(r=>r.checked=r.value===$("paramElutionInput").value)}
  }
  function syncDetailsToParameter(){const map={methodColumnInput:"paramColumnInput",methodColumnTempInput:"paramColumnTempInput",methodMobileAInput:"paramMobileAInput",methodMobileBInput:"paramMobileBInput",methodFlowInput:"paramFlowInput",methodInjectionInput:"paramInjectionInput",methodWavelengthInput:"paramWavelengthInput",methodRunTimeInput:"paramRunTimeInput",methodSampleTempInput:"paramSampleTempInput"};Object.entries(map).forEach(([a,b])=>{if($(a)&&$(b))$(b).value=$(a).value});if($("paramElutionInput")){const r=document.querySelector('input[name="methodElution"]:checked');if(r)$("paramElutionInput").value=r.value;}}
  function updateMethodElutionUI(){
    ensureMethodFields();const g=methodData.elution==="Gradient";$("methodGradientDetailsWrap")?.classList.toggle("hidden",!g);$("methodIsocraticDetails")?.classList.toggle("hidden",g);$("methodGradientTabTableWrap")?.classList.toggle("hidden",!g);$("methodIsocraticGradientTab")?.classList.toggle("hidden",g);
    ["methodIsocraticA","methodIsocraticB","methodIsocraticA2","methodIsocraticB2"].forEach(id=>{if($(id)){ $(id).value=id.includes("A")?(methodData.mobileAPercent??70):(methodData.mobileBPercent??30);$(id).disabled=!methodEditMode; }});
    $("methodEditGradientBtn")?.classList.toggle("hidden",!methodEditMode||!g);$("methodGradientEditTabBtn")?.classList.toggle("hidden",!methodEditMode||!g);
  }
  function renderGradient(){ensureMethodFields();const h=methodData.gradient.length?methodData.gradient.map(r=>`<tr><td>${escapeHtml(r[0])}</td><td>${escapeHtml(r[1])}</td><td>${escapeHtml(r[2])}</td></tr>`).join(""):"<tr><td colspan=\"3\" class=\"muted\">No gradient points configured.</td></tr>";if($("gradientBody"))$("gradientBody").innerHTML=h;if($("gradientTabBody"))$("gradientTabBody").innerHTML=h;updateMethodElutionUI();}
  function renderMethodAttachments(){
    const items=getAttachments().filter(a=>a.recordType==="method"&&a.recordId===methodData.id);const rows=items.map(a=>`<tr><td><div class="attachment-name-cell"><span class="file-type-icon"><i data-lucide="${fileIconName(a)}"></i></span><div><b>${escapeHtml(a.name)}</b><small>${formatFileSize(a.size)}</small></div></div></td><td>${escapeHtml(fileTypeLabel(a))}</td><td>${escapeHtml(a.time||"—")}</td><td>${escapeHtml(a.user||"—")}</td><td><div class="attachment-actions"><button class="secondary attachment-action" data-method-view="${escapeHtml(a.id)}" type="button"><i data-lucide="eye"></i> View</button><button class="secondary attachment-action" data-method-download="${escapeHtml(a.id)}" type="button"><i data-lucide="download"></i> Download</button>${methodEditMode&&canDeleteAttachment(a)?`<button class="secondary danger-action attachment-action" data-method-delete="${escapeHtml(a.id)}" type="button"><i data-lucide="trash-2"></i> Delete</button>`:""}</div></td></tr>`).join("");
    if($("methodAttachmentsFull"))$("methodAttachmentsFull").innerHTML=rows||'<tr><td colspan="5" class="muted">No method attachments uploaded.</td></tr>';
    const compact=items.map(a=>`<div class="method-file-row"><span class="method-file-icon"><i data-lucide="${fileIconName(a)}"></i></span><div><b>${escapeHtml(a.name)}</b><small>${escapeHtml(fileTypeLabel(a))} · ${formatFileSize(a.size)} · ${escapeHtml(a.time||"")}</small></div><button class="method-download secondary" data-method-view="${escapeHtml(a.id)}" type="button"><i data-lucide="eye"></i></button><button class="method-download secondary" data-method-download="${escapeHtml(a.id)}" type="button"><i data-lucide="download"></i></button>${methodEditMode&&canDeleteAttachment(a)?`<button class="method-download secondary danger-action" data-method-delete="${escapeHtml(a.id)}" type="button"><i data-lucide="trash-2"></i></button>`:""}</div>`).join("");if($("methodAttachmentsList"))$("methodAttachmentsList").innerHTML=compact||'<div class="muted">No method attachments uploaded.</div>';
    document.querySelectorAll("[data-method-view]").forEach(b=>b.onclick=()=>openStoredAttachment(b.dataset.methodView,"view"));document.querySelectorAll("[data-method-download]").forEach(b=>b.onclick=()=>openStoredAttachment(b.dataset.methodDownload,"download"));document.querySelectorAll("[data-method-delete]").forEach(b=>b.onclick=()=>confirmDeleteMethodAttachment(b.dataset.methodDelete));refreshIcons();
  }
  function renderPendingMethodFiles(){const f=window._methodPendingFiles||[];["methodPendingFiles","methodPendingFilesFull"].forEach(id=>{if($(id))$(id).innerHTML=pendingRows(f)});document.querySelectorAll("#methodPendingFiles .pending-remove,#methodPendingFilesFull .pending-remove").forEach(b=>b.onclick=()=>{f.splice(Number(b.dataset.pendingIndex),1);renderPendingMethodFiles()});refreshIcons();}
  function getMethodSuitabilityCriteria(){
    return [
      {key:"Retention Time",label:"Retention Time",criteria:"4.0–6.0 min",unit:"min",type:"range",min:4,max:6},
      {key:"Resolution",label:"Resolution",criteria:"≥ 2.0",unit:"",type:"min",min:2},
      {key:"Tailing Factor",label:"Tailing Factor",criteria:"≤ 2.0",unit:"",type:"max",max:2},
      {key:"Theoretical Plates",label:"Theoretical Plates",criteria:"≥ 2000",unit:"",type:"min",min:2000},
      {key:"%RSD",label:"%RSD (Peak Area)",criteria:"≤ 2.0%",unit:"%",type:"max",max:2}
    ];
  }
  function deriveSuitabilityFromChromatogram(){
    const all=getChromatograms();
    const rows=Object.values(all).filter(x=>x && (x.methodId===methodData.id || x.method===methodData.title || x.method===methodData.name) && Array.isArray(x.peaks)&&x.peaks.length);
    if(!rows.length) return {};
    const out={};
    const primary=rows.find(x=>x.type!=="Blank")||rows[0];
    const peaks=primary.peaks||[];
    if(peaks[0]?.rt!=null) out["Retention Time"]=Number(peaks[0].rt).toFixed(2);
    // Derive resolution and plate count from chromatogram peak widths when possible.
    const points=primary.points||[];
    const widths=[];
    for(const pk of peaks.slice(0,2)){
      const half=(Number(pk.height)||0)/2;
      if(!half) continue;
      const near=points.filter(pt=>Math.abs(Number(pt.rt)-Number(pk.rt))<=0.5);
      const above=near.filter(pt=>Number(pt.response)-120>=half);
      if(above.length>=2) widths.push(Math.max(0.01,Number(above[above.length-1].rt)-Number(above[0].rt)));
    }
    if(peaks.length>=2 && widths.length>=2){
      const r=2*(Number(peaks[1].rt)-Number(peaks[0].rt))/(widths[0]+widths[1]);
      if(Number.isFinite(r)) out["Resolution"]=r.toFixed(2);
    }
    if(peaks[0]?.rt!=null && widths[0]){
      const n=16*Math.pow(Number(peaks[0].rt)/widths[0],2);
      if(Number.isFinite(n)) out["Theoretical Plates"]=String(Math.round(n));
    }
    // Approximate tailing from left/right 5% peak widths; Gaussian-like peaks evaluate near 1.0.
    if(peaks[0] && points.length){
      const pk=peaks[0], level=(Number(pk.height)||0)*0.05, near=points.filter(pt=>Math.abs(Number(pt.rt)-Number(pk.rt))<=0.5);
      const above=near.filter(pt=>Number(pt.response)-120>=level);
      if(above.length>=2){
        const mid=Math.floor(above.length/2), left=Math.max(0.01,Number(pk.rt)-Number(above[0].rt)), right=Math.max(0.01,Number(above[above.length-1].rt)-Number(pk.rt));
        const tf=right/left; if(Number.isFinite(tf)) out["Tailing Factor"]=tf.toFixed(2);
      }
    }
    const std=rows.filter(x=>x.type==="Standard" && x.peaks?.[0]?.area!=null).map(x=>Number(x.peaks[0].area)).filter(Number.isFinite);
    if(std.length>=2){const mean=std.reduce((a,b)=>a+b,0)/std.length;const sd=Math.sqrt(std.reduce((a,b)=>a+Math.pow(b-mean,2),0)/(std.length-1));const rsd=mean?100*sd/mean:NaN;if(Number.isFinite(rsd))out["%RSD"]=rsd.toFixed(2);}
    return out;
  }
  function evaluateSuitability(c,a){
    if(a===null||a===undefined||String(a).trim()==="") return "Not Evaluated";
    const n=Number(a); if(!Number.isFinite(n)) return "FAIL";
    if(c.type==="range") return n>=c.min&&n<=c.max?"PASS":"FAIL";
    if(c.type==="min") return n>=c.min?"PASS":"FAIL";
    if(c.type==="max") return n<=c.max?"PASS":"FAIL";
    return "Not Evaluated";
  }
  function renderMethodSuitability(){
    const b=$("methodSuitabilityBody"); if(!b)return; ensureMethodFields();
    const manual=methodData.suitabilityResult||{}; const derived=deriveSuitabilityFromChromatogram(); const criteria=getMethodSuitabilityCriteria();
    const actuals={...derived,...manual};
    b.innerHTML=criteria.map((c,i)=>{
      const a=actuals[c.key]??""; const st=evaluateSuitability(c,a);
      const canEnter=isQC()||isAdmin();
      const display= a==="" ? "" : String(a);
      const suffix=c.unit?`<span class="actual-unit">${c.unit}</span>`:"";
      return `<tr data-suit-row="${escapeHtml(c.key)}"><td>${escapeHtml(c.label)}</td><td><span class="criteria-readonly">${escapeHtml(c.criteria)}</span></td><td><div class="actual-result-input"><input class="suitability-actual-input" data-suit-key="${escapeHtml(c.key)}" type="number" step="0.01" value="${escapeHtml(display)}" placeholder="Enter actual result" ${canEnter?"":"disabled"}>${suffix}</div></td><td><span class="suitability-status ${st.toLowerCase().replace(/ /g,"-")}">${st}</span></td></tr>`;
    }).join("");
    const statuses=criteria.map(c=>evaluateSuitability(c,actuals[c.key]??""));
    const overall=statuses.some(x=>x==="FAIL")?"FAIL":statuses.every(x=>x==="PASS")?"PASS":"Not Evaluated";
    const note=document.getElementById("methodSuitabilityOverall"); if(note) note.innerHTML=`<span>Overall System Suitability</span><span class="suitability-status ${overall.toLowerCase().replace(/ /g,"-")}">${overall}</span>`;
    document.querySelectorAll(".suitability-actual-input").forEach(inp=>inp.addEventListener("change",()=>{
      if(!isQC()&&!isAdmin()) return; const key=inp.dataset.suitKey; methodData.suitabilityResult=methodData.suitabilityResult||{}; methodData.suitabilityResult[key]=inp.value; persistMethod();
      const row=inp.closest("tr"), c=criteria.find(x=>x.key===key), status=evaluateSuitability(c,inp.value), badge=row?.querySelector(".suitability-status");
      if(badge){badge.className="suitability-status "+status.toLowerCase().replace(/ /g,"-");badge.textContent=status;}
      const statuses2=criteria.map(x=>evaluateSuitability(x,methodData.suitabilityResult?.[x.key]??derived[x.key]??"")); const overall2=statuses2.some(x=>x==="FAIL")?"FAIL":statuses2.every(x=>x==="PASS")?"PASS":"Not Evaluated"; if(note){note.innerHTML=`<span>Overall System Suitability</span><span class="suitability-status ${overall2.toLowerCase().replace(/ /g,"-")}">${overall2}</span>`;}
    }));
  }
  function renderMethodHistory(){const b=$("methodHistoryBody");if(!b)return;b.innerHTML=getMethodRevisions().map(r=>`<tr><td>${escapeHtml(r.version)}</td><td>${escapeHtml(r.date)}</td><td>${escapeHtml(r.modifiedBy)}</td><td>${escapeHtml(r.changes)}</td><td><span class="history-status">${escapeHtml(r.status)}</span></td></tr>`).join("");}
  function setMethodFields(){ensureMethodFields();const v={methodIdInput:methodData.id,methodProductInput:methodData.product,methodTitleInput:methodData.title,methodCategoryInput:methodData.category,methodDescriptionInput:methodData.description,methodReferenceInput:methodData.reference,methodColumnInput:methodData.column,methodColumnTempInput:methodData.columnTemp,methodInjectionInput:methodData.injection,methodFlowInput:methodData.flow,methodRunTimeInput:methodData.runTime,methodMobileAInput:methodData.mobileA,methodMobileBInput:methodData.mobileB,methodWavelengthInput:methodData.wavelength,methodSampleTempInput:methodData.sampleTemp,methodNotesInput:methodData.notes};Object.entries(v).forEach(([id,x])=>{if($(id))$(id).value=x??""});updateMethodParamInputs();$("methodIdDisplay").textContent=methodData.id;$("methodTitleDisplay").textContent=methodData.title;$("methodVersionDisplay").textContent=methodData.version;$("methodModifiedDisplay").textContent=methodData.modified;$("methodModifiedByDisplay").textContent=methodData.modifiedBy;renderGradient();renderMethodSuitability();renderMethodHistory();renderMethodAttachments();renderPendingMethodFiles();}
  function setMethodEditMode(on){
    // QC works in editable mode by default; QA remains view-only.
    const forceQCEdit = isQC();
    methodEditMode = forceQCEdit || !!on;
    if(methodEditMode && !methodEditSnapshot) methodEditSnapshot = cloneMethod(methodData);
    $("methodEditState").textContent=methodEditMode?"Edit mode":"View mode";
    document.querySelectorAll("#method input:not([type=hidden]),#method select,#method textarea").forEach(e=>{if(e.id!=="methodAttachmentInput")e.disabled=!methodEditMode || !isQC() && !isAdmin()});
    const canEdit=isQC()||isAdmin();
    if($("methodEditBtn")){
      $("methodEditBtn").innerHTML=methodEditMode?'<i data-lucide="save"></i> Save Method':'<i data-lucide="pencil"></i> Edit Method';
      $("methodEditBtn").disabled=!canEdit;
    }
    if($("methodTopCancelBtn"))$("methodTopCancelBtn").classList.toggle("hidden",!methodEditMode);
    if($("methodSaveBtn"))$("methodSaveBtn").disabled=!methodEditMode||!canEdit;
    if($("methodCancelBtn"))$("methodCancelBtn").disabled=!methodEditMode;
    updateMethodElutionUI();renderMethodAttachments();refreshIcons();
  }
  function collectMethod(){ensureMethodFields();methodData={...methodData,id:$("methodIdInput").value.trim(),product:$("methodProductInput").value.trim(),title:$("methodTitleInput").value.trim(),category:$("methodCategoryInput").value,description:$("methodDescriptionInput").value.trim(),reference:$("methodReferenceInput").value.trim(),column:$("methodColumnInput").value.trim(),columnTemp:$("methodColumnTempInput").value,injection:$("methodInjectionInput").value,flow:$("methodFlowInput").value,runTime:$("methodRunTimeInput").value,mobileA:$("methodMobileAInput").value.trim(),mobileB:$("methodMobileBInput").value.trim(),elution:document.querySelector('input[name="methodElution"]:checked')?.value||methodData.elution,wavelength:$("methodWavelengthInput").value,sampleTemp:$("methodSampleTempInput").value,notes:$("methodNotesInput").value};methodData.mobileAPercent=$("methodIsocraticA")?.value??$("methodIsocraticA2")?.value??methodData.mobileAPercent;methodData.mobileBPercent=$("methodIsocraticB")?.value??$("methodIsocraticB2")?.value??methodData.mobileBPercent;}
  function validateMethod(){clearMethodErrors();let ok=true;[["methodIdInput","Method ID is required."],["methodTitleInput","Method Title is required."],["methodColumnInput","Column is required."],["methodMobileAInput","Mobile Phase A is required."],["methodMobileBInput","Mobile Phase B is required."]].forEach(([id,m])=>{if(!$(id)?.value.trim()){setInlineError(id,m);ok=false}});[["methodFlowInput","Flow Rate must be greater than 0.",v=>Number(v)>0],["methodInjectionInput","Injection Volume must be greater than 0.",v=>Number(v)>0],["methodRunTimeInput","Run Time must be greater than 0.",v=>Number(v)>0],["methodWavelengthInput","Wavelength must be between 190–600 nm.",v=>Number(v)>=190&&Number(v)<=600]].forEach(([id,m,f])=>{if(!f($(id)?.value)){setInlineError(id,m);ok=false}});if(methodData.elution==="Gradient"){const rows=methodData.gradient||[];if(rows.length<2){ok=false;$("parameterValidationMessage")?.classList.remove("hidden");if($("parameterValidationMessage"))$("parameterValidationMessage").textContent="At least 2 gradient points are required."}for(let i=0;i<rows.length;i++){const a=Number(rows[i][1]),b=Number(rows[i][2]);if(!Number.isFinite(a)||!Number.isFinite(b)||Math.abs(a+b-100)>1e-9){ok=false;$("parameterValidationMessage")?.classList.remove("hidden");if($("parameterValidationMessage"))$("parameterValidationMessage").textContent=`Gradient row ${i+1}: %A + %B must equal 100%.`}if(i&&Number(rows[i][0])<=Number(rows[i-1][0]))ok=false;}}else{const a=Number(methodData.mobileAPercent),b=Number(methodData.mobileBPercent);if(!Number.isFinite(a)||!Number.isFinite(b)||a<0||b<0||Math.abs(a+b-100)>1e-9){ok=false;$("methodIsocraticError")?.classList.remove("hidden");if($("methodIsocraticError"))$("methodIsocraticError").textContent="%A + %B must equal 100%.";$("methodIsocraticError2")?.classList.remove("hidden");if($("methodIsocraticError2"))$("methodIsocraticError2").textContent="%A + %B must equal 100%.";}}return ok;}
  function methodChangeSummary(a,b){const m={id:"Method ID",title:"Method Title",column:"Column",columnTemp:"Column Temperature",mobileA:"Mobile Phase A",mobileB:"Mobile Phase B",flow:"Flow Rate",injection:"Injection Volume",runTime:"Run Time",wavelength:"Detection Wavelength",elution:"Elution Mode",notes:"Notes",gradient:"Gradient Program"};const x=Object.keys(m).filter(k=>JSON.stringify(a[k])!==JSON.stringify(b[k])).map(k=>m[k]);return x.length?x.join(", "):"Method metadata updated";}
  function nextVersion(v){const a=String(v||"1.0.0").split(".").map(Number);return a.length===3&&!a.some(Number.isNaN)?`${a[0]}.${a[1]}.${a[2]+1}`:"1.0.1";}
  function saveMethod(){if(!methodEditMode)return;if(!(isQC()||isAdmin())){showToast("Only QC or Admin can modify analytical methods.");return}collectMethod();if(!validateMethod()){showToast("Please correct the highlighted required fields.");return}const old=cloneMethod(methodEditSnapshot||methodData);if(JSON.stringify(old)===JSON.stringify(methodData)){methodEditSnapshot=null;setMethodEditMode(false);showToast("No changes to save.");return}methodData.version=nextVersion(methodData.version);methodData.modified=now();methodData.modifiedBy=displayUsername(state.user?.username)||"QC-001";persistMethod();const lib=methodLibrary();const i=lib.findIndex(x=>x.id===methodData.id);if(i>=0)lib[i]=cloneMethod(methodData);else lib.unshift(cloneMethod(methodData));saveMethodLibrary(lib);saveMethodRevision(methodData.version,methodChangeSummary(old,methodData),"Active",methodData.modifiedBy);addAudit("Method modified",`Updated analytical method ${methodData.id}.`,{module:"Analytical Method",actionType:"Modified",recordId:methodData.id});methodEditSnapshot=null;setMethodFields();setMethodEditMode(false);showToast("Analytical method saved successfully.");}
  function cancelMethodEdit(){if(!methodEditMode)return;collectMethod();if(JSON.stringify(methodEditSnapshot||{})!==JSON.stringify(methodData)){showModal(`<h3>Discard unsaved changes?</h3><p class="dashboard-modal-note">Your changes have not been saved.</p><div class="modal-actions"><button class="secondary" id="keepMethodEditing">Keep Editing</button><button class="primary" id="discardMethodChanges">Discard Changes</button></div>`);$("keepMethodEditing")?.addEventListener("click",closeModal);$("discardMethodChanges")?.addEventListener("click",()=>{closeModal();methodData=cloneMethod(methodEditSnapshot);methodEditSnapshot=null;setMethodFields();setMethodEditMode(false)});}else{methodData=cloneMethod(methodEditSnapshot||methodData);methodEditSnapshot=null;setMethodFields();setMethodEditMode(false);}}
  function openDuplicateMethodModal(){if(!(isQC()||isAdmin())){showToast("Only QC or Admin can duplicate analytical methods.");return}const used=[methodData.id,...methodLibrary().map(x=>x.id)];let n=2;while(used.includes(`AM-${String(n).padStart(3,"0")}`))n++;showModal(`<h3>Duplicate Analytical Method</h3><div class="modal-summary-grid"><div><span>Original Method ID</span><b>${escapeHtml(methodData.id)}</b></div><div><span>New Method ID</span><input id="duplicateMethodId" value="AM-${String(n).padStart(3,"0")}"></div></div><p class="muted">Existing method parameters will be copied without overwriting the original.</p><div id="duplicateMethodError" class="error-message"></div><div class="modal-actions"><button class="secondary close-modal">Cancel</button><button class="primary" id="confirmDuplicateMethod">Duplicate Method</button></div>`);$("confirmDuplicateMethod")?.addEventListener("click",()=>{const id=$("duplicateMethodId").value.trim().toUpperCase();if(!/^AM-\d+$/.test(id)||methodLibrary().some(x=>x.id===id)||id===methodData.id){$("duplicateMethodError").textContent="Enter a unique Method ID, e.g. AM-002.";return}const originalId=methodData.id,copy=cloneMethod(methodData);copy.id=id;copy.version="1.0.0";copy.modified=now();copy.modifiedBy=displayUsername(state.user?.username)||"QC-001";const lib=methodLibrary();if(!lib.some(x=>x.id===originalId))lib.unshift(cloneMethod(methodData));lib.unshift(copy);saveMethodLibrary(lib);methodData=copy;persistMethod();saveMethodRevision(copy.version,`Duplicated from ${originalId}`,"Active",copy.modifiedBy);addAudit("Method duplicated",`Created ${id} from ${originalId}`,{module:"Analytical Method",actionType:"Created",recordId:id});closeModal();setMethodFields();setMethodEditMode(false);showToast("Analytical method duplicated successfully.");});}
  function pdfBlob(text){const c=`BT /F1 11 Tf 50 760 Td `+text.split("\n").slice(0,40).map(x=>`(${String(x).replace(/[\\()]/g,"\\$&")}) Tj 0 -16 Td`).join(" ")+` ET`;const o=[`<< /Type /Catalog /Pages 2 0 R >>`,`<< /Type /Pages /Kids [3 0 R] /Count 1 >>`,`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>`,`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`,`<< /Length ${c.length} >>\nstream\n${c}\nendstream`];let p="%PDF-1.4\n",offs=[0];o.forEach((x,i)=>{offs.push(p.length);p+=`${i+1} 0 obj\n${x}\nendobj\n`});const x=p.length;p+=`xref\n0 ${o.length+1}\n0000000000 65535 f \n`+offs.slice(1).map(n=>String(n).padStart(10,"0")+" 00000 n \n").join("")+`trailer\n<< /Size ${o.length+1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF`;return new Blob([p],{type:"application/pdf"});}
  function downloadBlobFile(name,blob){const u=URL.createObjectURL(blob),a=document.createElement("a");a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),2000);}
  function openExportMethodModal(){const id=methodData.id,title=methodData.title;showModal(`<div class="loading-state"><div class="spinner"></div><h3>Generating PDF...</h3><p class="muted">Preparing the analytical method document.</p></div>`);setTimeout(()=>{window._methodPdfBlob=pdfBlob(`COMPUTERIZED SYSTEM VALIDATION\nAnalytical Method\n\n${id} – ${title}\nVersion: ${methodData.version}\nProduct: ${methodData.product}\nColumn: ${methodData.column}\nMobile Phase A: ${methodData.mobileA}\nMobile Phase B: ${methodData.mobileB}\nFlow Rate: ${methodData.flow} mL/min\nInjection Volume: ${methodData.injection} µL\nDetection Wavelength: ${methodData.wavelength} nm\nRun Time: ${methodData.runTime} min\nElution Mode: ${methodData.elution}`);addAudit("Method exported","Analytical method exported as PDF.",{module:"Analytical Method",actionType:"Downloaded",recordId:id});const m=$("modalRoot");m.innerHTML=`<div class="modal-backdrop"><div class="modal-card"><div class="success-state"><div class="success-icon"><i data-lucide="check"></i></div><h3>${escapeHtml(id)} – ${escapeHtml(title)}</h3><p class="muted">PDF ready</p></div><div class="modal-actions"><button class="secondary close-modal">Close</button><button class="primary" id="downloadMethodPdfBtn"><i data-lucide="download"></i> Download PDF</button></div></div></div>`;m.classList.remove("hidden");refreshIcons();m.querySelector(".close-modal")?.addEventListener("click",closeModal);$("downloadMethodPdfBtn")?.addEventListener("click",()=>{downloadBlobFile(`${id}_Analytical_Method.pdf`,window._methodPdfBlob);showToast("Analytical Method PDF downloaded.")});showToast("Analytical Method PDF generated successfully.")},700)}
  function openMethodAttachmentUpload(){if(!methodEditMode||!(isQC()||isAdmin())){showToast("Click Edit Method to add an attachment.");return}showModal(`<h3>Upload Method Attachment</h3><div class="file-dropzone method-upload-dropzone" id="methodUploadDropzone" tabindex="0"><div class="upload-icon"><i data-lucide="upload-cloud"></i></div><b>Drag and drop your file here or browse files</b><small>PDF, DOCX, XLSX, CSV and image files · Max 10 MB</small><input id="methodModalFileInput" type="file" hidden accept=".pdf,.csv,.xlsx,.xls,.docx,.doc,.png,.jpg,.jpeg"><button class="secondary" id="browseMethodFile" type="button">Browse Files</button></div><div id="methodUploadSelection" class="pending-file-list"></div><div class="upload-progress hidden" id="methodUploadProgress"><div class="progress-track"><span id="methodUploadProgressBar"></span></div><small id="methodUploadProgressText">0%</small></div><div id="methodUploadError" class="error-message"></div><div class="modal-actions"><button class="secondary close-modal">Cancel</button><button class="primary" id="uploadMethodFileBtn" disabled>Upload</button></div>`);const input=$("methodModalFileInput"),drop=$("methodUploadDropzone"),select=f=>{window._methodUploadFile=f;$("methodUploadSelection").innerHTML=f?pendingRows([f]):"";$("uploadMethodFileBtn").disabled=!f;refreshIcons()};$("browseMethodFile")?.addEventListener("click",e=>{e.stopPropagation();input.click()});drop?.addEventListener("click",()=>input.click());input?.addEventListener("change",()=>select(input.files?.[0]));drop?.addEventListener("dragover",e=>{e.preventDefault();drop.classList.add("drag-active")});drop?.addEventListener("dragleave",()=>drop.classList.remove("drag-active"));drop?.addEventListener("drop",e=>{e.preventDefault();drop.classList.remove("drag-active");select(e.dataTransfer.files?.[0])});$("uploadMethodFileBtn")?.addEventListener("click",async()=>{const f=window._methodUploadFile;if(!f)return;const err=validateSelectedFile(f);if(err){$("methodUploadError").textContent=err;return}const prog=$("methodUploadProgress"),bar=$("methodUploadProgressBar"),txt=$("methodUploadProgressText");prog.classList.remove("hidden");$("uploadMethodFileBtn").disabled=true;let pct=0;const timer=setInterval(()=>{pct=Math.min(85,pct+17);bar.style.width=pct+"%";txt.textContent=pct+"%"},90);try{const made=await attachFiles([f],{activity:"Analytical Method",recordType:"method",recordId:methodData.id});clearInterval(timer);bar.style.width="100%";txt.textContent="100%";if(!made.length)throw Error("Upload failed");await new Promise(r=>setTimeout(r,200));closeModal();renderMethodAttachments();showToast("Attachment uploaded successfully.")}catch(e){clearInterval(timer);$("uploadMethodFileBtn").disabled=false;$("methodUploadError").textContent=e.message||"Upload failed."}})}
  async function confirmDeleteMethodAttachment(id){const meta=getAttachmentMeta(id);if(!meta)return;if(!canDeleteAttachment(meta)){showToast("You do not have permission to delete this file.");return}showModal(`<h3>Delete Attachment</h3><p>Are you sure you want to delete this attachment?</p><div class="delete-file-name"><i data-lucide="file"></i> ${escapeHtml(meta.name)}</div><div class="modal-actions"><button class="secondary close-modal">Cancel</button><button class="primary danger-confirm" id="confirmMethodAttachmentDelete">Delete</button></div>`);$("confirmMethodAttachmentDelete")?.addEventListener("click",async()=>{await removeFileBlob(meta.blobKey);saveAttachments(getAttachments().filter(x=>x.id!==id));addAudit("File deleted",`${actorLabel()} | ${meta.name} removed from ${methodData.id}`,{module:"Analytical Method",actionType:"Deleted",recordId:methodData.id});closeModal();renderMethodAttachments();showToast("Attachment deleted successfully.")})}
  function openMethodLibrary(){const all=[methodData,...methodLibrary().filter(x=>x.id!==methodData.id)],u=all.filter((x,i,a)=>a.findIndex(y=>y.id===x.id)===i),body=u.map(m=>`<tr data-method-library-id="${escapeHtml(m.id)}"><td><b>${escapeHtml(m.id)}</b></td><td>${escapeHtml(m.title||m.name||"Analytical Method")}</td><td>${escapeHtml(m.version||"1.0.0")}</td><td>${escapeHtml(m.modifiedBy||"—")}</td><td><span class="history-status">${m.id===methodData.id?"Current":"Available"}</span></td></tr>`).join("");showModal(`<h3>Analytical Method Library</h3><p class="muted">Select a method to open its controlled details.</p><div class="method-library-table-wrap"><table class="method-attachment-table"><thead><tr><th>Method ID</th><th>Method</th><th>Version</th><th>Modified By</th><th>Status</th></tr></thead><tbody>${body||'<tr><td colspan="5" class="muted">No analytical methods available.</td></tr>'}</tbody></table></div><div class="modal-actions"><button class="primary close-modal">Close</button></div>`);document.querySelectorAll("[data-method-library-id]").forEach(r=>r.onclick=()=>{const f=u.find(x=>x.id===r.dataset.methodLibraryId);if(f){methodData=cloneMethod(f);persistMethod();setMethodFields();setMethodEditMode(false)}closeModal();showToast(`${r.dataset.methodLibraryId} opened.`)})}
  function openSystemReadyPopover(){showModal(`<h3>System Status</h3><div class="system-status-popover"><div><span>System Status</span><b><span class="status-dot-ready"></span> Ready</b></div><div><span>Application</span><b>HPLC-UV CSV System</b></div><div><span>System ID</span><b>HPLC-UV-001</b></div><div><span>Software Version</span><b>1.0.0</b></div><div><span>Data Integrity</span><b>ALCOA+ principles</b></div></div><div class="modal-actions"><button class="primary close-modal">Close</button></div>`)}
  function initAnalyticalMethod(){
    ensureMethodFields();setMethodFields();setMethodEditMode(false);
    document.querySelectorAll(".method-tab").forEach(btn=>btn.onclick=()=>{document.querySelectorAll(".method-tab").forEach(x=>x.classList.remove("active"));btn.classList.add("active");const map={details:"methodDetailsTab",suitability:"methodSuitabilityTab",attachments:"methodAttachmentsTab",history:"methodHistoryTab"};document.querySelectorAll(".method-tab-content").forEach(x=>x.classList.add("hidden"));$(map[btn.dataset.methodTab])?.classList.remove("hidden");$("methodBreadcrumbCurrent").textContent=btn.textContent.trim();updateMethodElutionUI();renderMethodAttachments();renderMethodHistory();refreshIcons()});
    $("methodEditBtn")?.addEventListener("click",()=>{if(methodEditMode)saveMethod();else{if(!(isQC()||isAdmin())){showToast("QA is view-only for analytical methods.");return}methodEditSnapshot=cloneMethod(methodData);setMethodEditMode(true)}});$("methodSaveBtn")?.addEventListener("click",saveMethod);$("methodCancelBtn")?.addEventListener("click",cancelMethodEdit);$("methodTopCancelBtn")?.addEventListener("click",cancelMethodEdit);$("methodDuplicateBtn")?.addEventListener("click",openDuplicateMethodModal);$("methodExportBtn")?.addEventListener("click",openExportMethodModal);$("methodBreadcrumbBack")?.addEventListener("click",openMethodLibrary);$("methodEditGradientBtn")?.addEventListener("click",openGradientEditor);$("methodGradientEditTabBtn")?.addEventListener("click",openGradientEditor);["methodAddAttachmentBtn","methodAddAttachmentBtn2"].forEach(id=>$(id)?.addEventListener("click",openMethodAttachmentUpload));$("systemReadyBadge")?.addEventListener("click",openSystemReadyPopover);
    document.querySelectorAll('input[name="methodElution"]').forEach(r=>r.addEventListener("change",()=>{if(!methodEditMode){setMethodFields();return}methodData.elution=r.value;updateMethodElutionUI();}));$("paramElutionInput")?.addEventListener("change",()=>{if(methodEditMode){methodData.elution=$("paramElutionInput").value;document.querySelectorAll('input[name="methodElution"]').forEach(r=>r.checked=r.value===methodData.elution);updateMethodElutionUI()}});
    ["methodIsocraticA","methodIsocraticB","methodIsocraticA2","methodIsocraticB2"].forEach(id=>$(id)?.addEventListener("input",()=>{if(methodEditMode){if(id.includes("A"))methodData.mobileAPercent=$(id).value;if(id.includes("B"))methodData.mobileBPercent=$(id).value;const a=$("methodIsocraticA"),b=$("methodIsocraticB"),a2=$("methodIsocraticA2"),b2=$("methodIsocraticB2");if(a)a.value=methodData.mobileAPercent;if(a2)a2.value=methodData.mobileAPercent;if(b)b.value=methodData.mobileBPercent;if(b2)b2.value=methodData.mobileBPercent}}));
    ["methodColumnInput","methodColumnTempInput","methodMobileAInput","methodMobileBInput","methodFlowInput","methodInjectionInput","methodWavelengthInput","methodRunTimeInput","methodSampleTempInput"].forEach(id=>$(id)?.addEventListener("input",()=>{if(methodEditMode)syncDetailsToParameter()}));["paramColumnInput","paramColumnTempInput","paramMobileAInput","paramMobileBInput","paramFlowInput","paramInjectionInput","paramWavelengthInput","paramRunTimeInput","paramSampleTempInput"].forEach(id=>$(id)?.addEventListener("input",()=>{if(methodEditMode)syncParameterToDetails()}));$("methodAttachmentInput")?.addEventListener("change",e=>{window._methodPendingFiles=[...(window._methodPendingFiles||[]),...Array.from(e.target.files||[])];e.target.value="";renderPendingMethodFiles()});
  }
  function openGradientEditor(){if(!methodEditMode){showToast("Click Edit Method to edit the gradient program.");return}methodGradientDraft=cloneMethod(methodData.gradient||[]);const rows=()=>methodGradientDraft.map((r,i)=>`<tr><td><input data-g-time="${i}" type="number" min="0" step="0.1" value="${escapeHtml(r[0])}"></td><td><input data-g-a="${i}" type="number" min="0" max="100" step="0.1" value="${escapeHtml(r[1])}"></td><td><input data-g-b="${i}" type="number" min="0" max="100" step="0.1" value="${escapeHtml(r[2])}"></td><td><button class="secondary gradient-row-delete" data-g-delete="${i}" type="button"><i data-lucide="trash-2"></i> Delete</button></td></tr>`).join("");showModal(`<h3>Edit Gradient Program</h3><div class="gradient-modal-table-wrap"><table class="gradient-table"><thead><tr><th>Time (min)</th><th>%A</th><th>%B</th><th>Action</th></tr></thead><tbody id="gradientModalBody">${rows()}</tbody></table></div><div class="gradient-modal-actions"><button class="secondary" id="addGradientModalRow" type="button"><i data-lucide="plus"></i> Add Row</button><span id="gradientModalError" class="inline-error"></span></div><div class="modal-actions"><button class="secondary close-modal">Cancel</button><button class="primary" id="saveGradientModal">Save Gradient</button></div>`);const sync=()=>{methodGradientDraft=[...document.querySelectorAll("#gradientModalBody tr")].map(t=>[t.querySelector("[data-g-time]")?.value||"0",t.querySelector("[data-g-a]")?.value||"0",t.querySelector("[data-g-b]")?.value||"0"])};const bind=()=>document.querySelectorAll(".gradient-row-delete").forEach(b=>b.onclick=()=>{sync();methodGradientDraft.splice(Number(b.dataset.gDelete),1);redraw()});const redraw=()=>{$("gradientModalBody").innerHTML=rows()||'<tr><td colspan="4" class="muted">No rows. Add a gradient point.</td></tr>';bind();refreshIcons()};bind();$("addGradientModalRow")?.addEventListener("click",()=>{sync();const last=methodGradientDraft.at(-1);methodGradientDraft.push([String(last?Number(last[0])+1:0),"95","5"]);redraw()});$("saveGradientModal")?.addEventListener("click",()=>{sync();const err=validateGradientDraft(methodGradientDraft);if(err){$("gradientModalError").textContent=err;return}methodData.gradient=cloneMethod(methodGradientDraft);closeModal();renderGradient();showToast("Gradient program updated successfully.")})}
  function validateGradientDraft(rows){if(rows.length<2)return"At least 2 gradient rows are required.";for(let i=0;i<rows.length;i++){const t=Number(rows[i][0]),a=Number(rows[i][1]),b=Number(rows[i][2]);if(![t,a,b].every(Number.isFinite))return`Row ${i+1}: all values must be numeric.`;if(a<0||a>100||b<0||b>100)return`Row ${i+1}: %A and %B must be 0–100%.`;if(Math.abs(a+b-100)>1e-9)return`Row ${i+1}: %A + %B must equal 100%.`;if(i&&t<=Number(rows[i-1][0]))return"Time values must be in ascending order."}return""}

document.addEventListener("DOMContentLoaded", () => {
    // Bind login first so optional UI modules can never prevent authentication.
    bindLogin();
    try { initAdminControls(); } catch (e) { console.error("Admin init error:", e); }
    try { initAnalyticalMethod(); } catch (e) { console.error("Method init error:", e); }
    try { initEvents(); } catch (e) { console.error("Event init error:", e); }
    renderMethodLibrary();
    renderSequence();
    renderURS();
    renderAudit();
    renderAttachments();
    renderSequenceAttachments();
    renderSequencePendingFiles();
    renderAssayAttachments();
    renderAssayPendingFiles();
    renderReportAttachmentList();
    renderDataReview();
    renderValidation();
    renderReport();
    restoreSession();
    updateDashboard();
    showSection("dashboard");
    applySidebarIcons();refreshIcons();
    initFunctionalButtonFallbacks();
  });
})();
