import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword,
  GoogleAuthProvider, signInWithPopup, signOut
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, collection, addDoc, getDocs,
  query, where, orderBy, serverTimestamp, updateDoc, deleteDoc
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

const $ = id => document.getElementById(id);
const views = ["welcomeView","parentLookupView","teacherView","studentEditorView","reportView"];
let auth, db, currentUser = null, currentRole = null, students = [], selectedStudent = null, selectedEntries = [], reportMode = "teacher";

function showView(id) { views.forEach(v => $(v).classList.toggle("hidden", v !== id)); }
function msg(id, text, good=false) { const el=$(id); if(el){el.textContent=text;el.style.color=good?"#14866d":"";} }
function safeText(value) { return String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function initials(s) { return (s||"Ö").trim().split(/\s+/).slice(0,2).map(x=>x[0]||"").join("").toLocaleUpperCase("tr-TR"); }
function normalize(s) { return (s||"").toLocaleLowerCase("tr-TR").normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim(); }
function dateToday() { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
function displayDate(s) { if(!s) return "Tarih belirtilmedi"; const d=new Date(`${s}T12:00:00`); return Number.isNaN(d.getTime())?s:d.toLocaleDateString("tr-TR",{day:"2-digit",month:"long",year:"numeric"}); }
function fullName(s) { return `${s.firstName||""} ${s.lastName||""}`.trim(); }
function setSignedInHeader() { $("userBadge").textContent=currentUser?.email||""; $("userBadge").classList.remove("hidden"); $("logoutBtn").classList.remove("hidden"); }

function initTabs() {
  document.querySelectorAll("[data-tab]").forEach(b=>b.addEventListener("click",()=>{
    document.querySelectorAll("[data-tab]").forEach(x=>x.classList.toggle("active",x===b));
    $("teacherLoginForm").classList.toggle("hidden",b.dataset.tab!=="teacher");
    $("parentLoginPanel").classList.toggle("hidden",b.dataset.tab!=="parent");
    msg("loginMessage","");
  }));
  document.querySelectorAll("[data-content-tab]").forEach(b=>b.addEventListener("click",()=>{
    document.querySelectorAll("[data-content-tab]").forEach(x=>x.classList.toggle("active",x===b));
    $("recordsTab").classList.toggle("hidden",b.dataset.contentTab!=="records");
    $("detailsTab").classList.toggle("hidden",b.dataset.contentTab!=="details");
  }));
}
function explainError(err) {
  const code=err?.code||"";
  const map={
    "auth/invalid-credential":"E-posta veya şifre hatalı.",
    "auth/invalid-email":"E-posta adresi geçerli değil.",
    "auth/user-not-found":"Bu e-posta ile kayıt bulunamadı.",
    "auth/wrong-password":"Şifre hatalı.",
    "auth/too-many-requests":"Çok fazla deneme yapıldı. Bir süre sonra tekrar dene.",
    "auth/popup-closed-by-user":"Google giriş penceresi kapatıldı.",
    "auth/unauthorized-domain":"Firebase Authentication ayarlarında bu web sitesi alan adını yetkili alanlara ekle.",
    "permission-denied":"İşlem için izin yok. Firestore güvenlik kurallarını ve öğretmen rolünü kontrol et.",
    "auth/network-request-failed":"Bağlantı hatası. İnternet bağlantını kontrol et."
  };
  return map[code] || err?.message || "Beklenmeyen bir hata oluştu.";
}
async function getRole(user) {
  const snap=await getDoc(doc(db,"users",user.uid));
  return snap.exists() ? snap.data().role : null;
}
async function loadTeacher() {
  const q=query(collection(db,"students"),orderBy("lastName"));
  const snap=await getDocs(q);
  students=snap.docs.map(d=>({id:d.id,...d.data()}));
  renderStudentList();
  $("totalStudents").textContent=students.length;
  $("highSchoolCount").textContent=students.filter(s=>["9. sınıf","10. sınıf","11. sınıf","12. sınıf","Mezun"].includes(s.grade)).length;
  $("lastUpdate").textContent=new Date().toLocaleDateString("tr-TR",{day:"2-digit",month:"2-digit"});
}
function renderStudentList() {
  const term=normalize($("studentSearch").value);
  const list=students.filter(s=>normalize(`${fullName(s)} ${s.grade} ${s.parentEmail}`).includes(term));
  $("studentList").innerHTML=list.map(s=>`<article class="student-card" data-open-student="${safeText(s.id)}" tabindex="0" role="button" aria-label="${safeText(fullName(s))} dosyasını aç"><div class="avatar">${safeText(initials(fullName(s)))}</div><div class="student-card-main"><strong>${safeText(fullName(s))}</strong><span>${safeText(s.grade||"Sınıf belirtilmedi")} · ${safeText(s.parentEmail||"Veli e-postası yok")}</span></div><span class="open-arrow">›</span></article>`).join("");
  $("emptyStudents").classList.toggle("hidden",list.length>0);
  $("studentList").querySelectorAll("[data-open-student]").forEach(el=>{
    const go=()=>openStudent(el.dataset.openStudent);
    el.addEventListener("click",go);el.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();go();}});
  });
}
async function createStudent() {
  const firstName=prompt("Öğrencinin adı:"); if(!firstName?.trim())return;
  const lastName=prompt("Öğrencinin soyadı:"); if(!lastName?.trim())return;
  const grade=prompt("Sınıf (ör. 8. sınıf, 11. sınıf veya Mezun):","9. sınıf"); if(!grade?.trim())return;
  const parentEmail=prompt("Velinin Google hesabı e-postası:"); if(!parentEmail?.trim())return;
  try{
    const ref=await addDoc(collection(db,"students"),{firstName:firstName.trim(),lastName:lastName.trim(),grade:grade.trim(),parentEmail:parentEmail.trim().toLowerCase(),generalNote:"",createdAt:serverTimestamp(),updatedAt:serverTimestamp(),createdBy:currentUser.uid});
    await loadTeacher(); await openStudent(ref.id);
  }catch(e){alert(explainError(e));}
}
async function openStudent(id) {
  selectedStudent=students.find(s=>s.id===id);
  if(!selectedStudent){try{const snap=await getDoc(doc(db,"students",id));if(snap.exists())selectedStudent={id:snap.id,...snap.data()};}catch(e){}}
  if(!selectedStudent){alert("Öğrenci kaydı bulunamadı.");return;}
  $("profileName").textContent=fullName(selectedStudent);
  $("profileMeta").textContent=`${selectedStudent.grade||"Sınıf belirtilmedi"} · Veli: ${selectedStudent.parentEmail||"e-posta yok"}`;
  $("profileAvatar").textContent=initials(fullName(selectedStudent));
  $("editFirstName").value=selectedStudent.firstName||"";
  $("editLastName").value=selectedStudent.lastName||"";
  const gradeOptions=[...$("editGrade").options].map(o=>o.value);
  $("editGrade").value=gradeOptions.includes(selectedStudent.grade)?selectedStudent.grade:"9. sınıf";
  $("editParentEmail").value=selectedStudent.parentEmail||"";
  $("editGeneralNote").value=selectedStudent.generalNote||"";
  $("entryDate").value=dateToday();
  showView("studentEditorView");
  await loadEntries();
}
async function loadEntries() {
  const q=query(collection(db,"students",selectedStudent.id,"entries"),orderBy("date","desc"));
  const snap=await getDocs(q);
  selectedEntries=snap.docs.map(d=>({id:d.id,...d.data()}));
  renderEntries();
}
function renderEntries() {
  const filter=$("entryFilter").value;
  const entries=selectedEntries.filter(e=>filter==="all"||e.type===filter);
  $("entryList").innerHTML=entries.map(e=>`<div class="timeline-item"><div class="timeline-dot"></div><div class="timeline-body"><div class="timeline-top"><h3>${safeText(e.topic||"Kayıt")}</h3><span class="tag">${safeText(e.type||"Kayıt")}</span></div><div class="timeline-meta">${safeText(e.subject||"Alan belirtilmedi")}${e.score?" · "+safeText(e.score):""} · ${safeText(displayDate(e.date))}</div>${e.note?`<p class="timeline-note">${safeText(e.note)}</p>`:""}<div class="timeline-actions"><button class="text-btn" data-delete-entry="${safeText(e.id)}">Kaydı sil</button></div></div></div>`).join("");
  $("emptyEntries").classList.toggle("hidden",entries.length>0);
  $("entryList").querySelectorAll("[data-delete-entry]").forEach(b=>b.addEventListener("click",async()=>{
    if(!confirm("Bu gelişim kaydını silmek istediğine emin misin?"))return;
    try{await deleteDoc(doc(db,"students",selectedStudent.id,"entries",b.dataset.deleteEntry));await loadEntries();}catch(e){alert(explainError(e));}
  }));
}
async function addEntry(e) {
  e.preventDefault(); if(!selectedStudent)return;
  const data={type:$("entryType").value,subject:$("entrySubject").value.trim(),topic:$("entryTopic").value.trim(),date:$("entryDate").value,score:$("entryScore").value.trim(),note:$("entryNote").value.trim(),createdAt:serverTimestamp(),createdBy:currentUser.uid};
  try{
    await addDoc(collection(db,"students",selectedStudent.id,"entries"),data);
    $("entryForm").reset();$("entryDate").value=dateToday();msg("entryMessage","Kayıt eklendi.",true);await loadEntries();
  }catch(err){msg("entryMessage",explainError(err));}
}
async function saveStudent(e) {
  e.preventDefault(); if(!selectedStudent)return;
  const data={firstName:$("editFirstName").value.trim(),lastName:$("editLastName").value.trim(),grade:$("editGrade").value,parentEmail:$("editParentEmail").value.trim().toLowerCase(),generalNote:$("editGeneralNote").value.trim(),updatedAt:serverTimestamp()};
  try{
    await updateDoc(doc(db,"students",selectedStudent.id),data);
    selectedStudent={...selectedStudent,...data};await loadTeacher();await openStudent(selectedStudent.id);msg("editMessage","Bilgiler kaydedildi.",true);
  }catch(err){msg("editMessage",explainError(err));}
}
async function deleteStudent() {
  if(!selectedStudent||!confirm(`${fullName(selectedStudent)} öğrencisini ve tüm gelişim kayıtlarını silmek istediğine emin misin? Bu işlem geri alınamaz.`))return;
  try{
    const snap=await getDocs(collection(db,"students",selectedStudent.id,"entries"));
    await Promise.all(snap.docs.map(d=>deleteDoc(d.ref)));
    await deleteDoc(doc(db,"students",selectedStudent.id));
    selectedStudent=null;await loadTeacher();showView("teacherView");
  }catch(e){alert(explainError(e));}
}
function buildReport(student, entries, mode="teacher") {
  const sorted=[...entries].sort((a,b)=>(b.date||"").localeCompare(a.date||""));
  const groups=["Ders / Konu","TYT","AYT","Deneme sınavı","Okunan kitap","Öğretmen yorumu"];
  return `<article class="report-paper"><header class="report-head"><p class="eyebrow">FATİH HOCA · ÖĞRENCİ GELİŞİM RAPORU</p><h1>${safeText(fullName(student))}</h1><p>${safeText(student.grade||"Sınıf belirtilmedi")} · Rapor tarihi: ${safeText(new Date().toLocaleDateString("tr-TR"))}</p></header>
  <section class="report-section"><h3>Genel değerlendirme</h3><p>${safeText(student.generalNote||"Genel değerlendirme henüz eklenmedi.")}</p></section>
  ${groups.map(g=>{const arr=sorted.filter(e=>e.type===g);return arr.length?`<section class="report-section"><h3>${safeText(g)} (${arr.length})</h3>${arr.map(e=>`<div class="report-entry"><strong>${safeText(e.topic||"Kayıt")}</strong><p>${safeText([e.subject,displayDate(e.date),e.score].filter(Boolean).join(" · "))}</p>${e.note?`<p>${safeText(e.note)}</p>`:""}</div>`).join("")}</section>`:"";}).join("")}
  ${sorted.length===0?'<p>Henüz gelişim kaydı eklenmemiş.</p>':""}
  <div class="report-footer">Bu rapor öğrenci gelişimini izlemek ve veli-öğretmen iletişimini desteklemek amacıyla hazırlanmıştır.</div></article>`;
}
function printStudentReport() {
  if(!selectedStudent)return;
  $("reportView").innerHTML=buildReport(selectedStudent,selectedEntries);
  $("reportView").classList.remove("hidden");
  window.print();
  setTimeout(()=>$("reportView").classList.add("hidden"),500);
}
async function parentLookup(e) {
  e.preventDefault();msg("parentMessage","Kayıtlar aranıyor…",true);$("parentResults").innerHTML="";
  try{
    // Firestore rules require the query to filter by the authenticated parent's email.
    const q=query(collection(db,"students"),where("parentEmail","==",currentUser.email.toLowerCase()));
    const snap=await getDocs(q);
    const term=normalize($("childNameInput").value);
    const matches=snap.docs.map(d=>({id:d.id,...d.data()})).filter(s=>normalize(fullName(s)).includes(term));
    if(!matches.length){msg("parentMessage","Bu e-posta ve isimle eşleşen öğrenci bulunamadı. E-posta adresini öğretmeninle kontrol et.");return;}
    msg("parentMessage",`${matches.length} öğrenci kaydı bulundu.`,true);
    $("parentResults").innerHTML=matches.map(s=>`<div class="parent-card"><div class="avatar">${safeText(initials(fullName(s)))}</div><div class="student-card-main"><strong>${safeText(fullName(s))}</strong><span>${safeText(s.grade||"Sınıf belirtilmedi")}</span></div><button class="btn btn-primary" data-parent-report="${safeText(s.id)}">Raporu aç</button></div>`).join("");
    $("parentResults").querySelectorAll("[data-parent-report]").forEach(b=>b.addEventListener("click",()=>openParentReport(b.dataset.parentReport)));
  }catch(err){msg("parentMessage",explainError(err));}
}
async function openParentReport(id) {
  try{
    const snap=await getDoc(doc(db,"students",id));if(!snap.exists())throw new Error("Öğrenci bulunamadı.");
    const student={id:snap.id,...snap.data()};
    const q=query(collection(db,"students",id,"entries"),orderBy("date","desc"));
    const entriesSnap=await getDocs(q);
    const entries=entriesSnap.docs.map(d=>({id:d.id,...d.data()}));
    $("reportView").innerHTML=`<div class="back-row"><button id="backToParentBtn" class="back-link">← Öğrenci aramaya dön</button><button id="parentPrintBtn" class="btn btn-primary">PDF raporu yazdır / kaydet</button></div>${buildReport(student,entries,"parent")}`;
    showView("reportView");
    $("backToParentBtn").addEventListener("click",()=>showView("parentLookupView"));
    $("parentPrintBtn").addEventListener("click",()=>window.print());
  }catch(err){alert(explainError(err));}
}
async function logout() { await signOut(auth); currentUser=null;currentRole=null;students=[];selectedStudent=null;showView("welcomeView");$("userBadge").classList.add("hidden");$("logoutBtn").classList.add("hidden"); }
async function onSignedIn(user) {
  currentUser=user;setSignedInHeader();
  try{
    currentRole=await getRole(user);
    if(currentRole==="teacher"){showView("teacherView");await loadTeacher();}
    else if(currentRole==="parent"){showView("parentLookupView");}
    else {await signOut(auth);msg("loginMessage","Bu hesap için erişim tanımlanmamış. Öğretmeninle iletişime geç.");showView("welcomeView");}
  }catch(e){await signOut(auth);showView("welcomeView");msg("loginMessage",explainError(e));}
}

function bindEvents() {
  $("teacherLoginForm").addEventListener("submit",async e=>{e.preventDefault();msg("loginMessage","Giriş yapılıyor…",true);try{await signInWithEmailAndPassword(auth,$("teacherEmail").value.trim(),$("teacherPassword").value);}catch(err){msg("loginMessage",explainError(err));}});
  $("googleLoginBtn").addEventListener("click",async()=>{msg("loginMessage","Google hesabı açılıyor…",true);try{await signInWithPopup(auth,new GoogleAuthProvider());}catch(err){msg("loginMessage",explainError(err));}});
  $("logoutBtn").addEventListener("click",logout);
  $("newStudentBtn").addEventListener("click",createStudent);
  $("studentSearch").addEventListener("input",renderStudentList);
  $("backToStudentsBtn").addEventListener("click",()=>showView("teacherView"));
  $("entryForm").addEventListener("submit",addEntry);
  $("entryFilter").addEventListener("change",renderEntries);
  $("studentEditForm").addEventListener("submit",saveStudent);
  $("deleteStudentBtn").addEventListener("click",deleteStudent);
  $("downloadReportBtn").addEventListener("click",printStudentReport);
  $("parentLookupForm").addEventListener("submit",parentLookup);
}

async function start() {
  initTabs();
  if(!window.FIREBASE_CONFIG||window.FIREBASE_CONFIG.apiKey==="FIREBASE_WEB_API_KEY"||window.FIREBASE_CONFIG.projectId==="PROJE_ID"){
    $("setupWarning").classList.remove("hidden");$("teacherLoginForm").querySelector("button").disabled=true;$("googleLoginBtn").disabled=true;return;
  }
  try{
    const app=initializeApp(window.FIREBASE_CONFIG);auth=getAuth(app);db=getFirestore(app);bindEvents();
    onAuthStateChanged(auth,user=>{if(user)onSignedIn(user);else{currentUser=null;currentRole=null;showView("welcomeView");$("userBadge").classList.add("hidden");$("logoutBtn").classList.add("hidden");}});
  }catch(e){$("setupWarning").classList.remove("hidden");$("setupWarning").insertAdjacentHTML("beforeend",`<p>${safeText(e.message)}</p>`);}
}
start();
