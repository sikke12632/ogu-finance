import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth, setPersistence, browserLocalPersistence,
  signInWithEmailAndPassword, signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getFunctions, httpsCallable
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-functions.js";

if (!window.firebaseConfig || !window.firebaseConfig.apiKey || window.firebaseConfig.apiKey.includes("여기에")) {
  document.body.innerHTML = `<div class="wrap"><div class="card"><h1>Firebase 설정이 필요해요</h1><p>public/firebase-config.js 파일에 Firebase 웹앱 설정값을 먼저 붙여넣어 주세요.</p></div></div>`;
  throw new Error("Firebase config missing");
}

const app = initializeApp(window.firebaseConfig);
const auth = getAuth(app);
await setPersistence(auth, browserLocalPersistence);
const functions = getFunctions(app, window.functionsRegion || "asia-northeast3");

let currentUser = null;
let currentRole = "";
let latestAdminAccounts = null;
let latestStudentSummary = null;
let latestLogs = null;
let currentLogTab = "logs";

function toEmail(userId) {
  return `${String(userId || "").trim().toLowerCase()}@ogu.local`;
}
async function call(name, data = {}) {
  const fn = httpsCallable(functions, name);
  const res = await fn(data);
  return res.data;
}
function qs(id) { return document.getElementById(id); }
function show(id) { qs(id)?.classList.remove("hidden"); }
function hide(id) { qs(id)?.classList.add("hidden"); }
function hideAllPages() { ["loginPage","forcePasswordPage","adminPage","bankerPage","studentPage"].forEach(hide); }
function showStatus(id, msg, type = "") {
  const el = qs(id); if (!el) return;
  el.textContent = msg || "";
  el.className = "status " + (type || "");
  el.classList.remove("hidden");
}
function hideStatus(id) { qs(id)?.classList.add("hidden"); }
function errMsg(err) {
  const msg = err?.message || String(err);
  if (msg.includes("auth/user-disabled")) return "아직 승인되지 않았거나 잠긴 계정이에요. 선생님께 문의해 주세요.";
  if (msg.includes("auth/invalid-credential") || msg.includes("auth/wrong-password") || msg.includes("auth/user-not-found")) return "아이디 또는 비밀번호가 올바르지 않아요.";
  if (msg.includes("functions/")) return msg.replace(/^FirebaseError:\s*/, "").replace(/^.*?:\s*/, "");
  return msg.replace(/^FirebaseError:\s*/, "");
}
function formatMoney(v) { return (Number(v) || 0).toLocaleString("ko-KR") + "오구"; }

// 모듈 내부 콜백에서 window에 붙인 함수들을 안전하게 호출하기 위한 얇은 래퍼입니다.
function loadAdminSummary(...args){ return window.loadAdminSummary(...args); }
function loadAdminAccounts(...args){ return window.loadAdminAccounts(...args); }
function loadAdminMoney(...args){ return window.loadAdminMoney(...args); }
function loadAdminStock(...args){ return window.loadAdminStock(...args); }
function loadAdminDeposits(...args){ return window.loadAdminDeposits(...args); }
function loadAdminFunding(...args){ return window.loadAdminFunding(...args); }
function loadAdminInflation(...args){ return window.loadAdminInflation(...args); }
function loadStudentSummary(...args){ return window.loadStudentSummary(...args); }
function loadBankerSummary(...args){ return window.loadBankerSummary(...args); }
function loadLogs(...args){ return window.loadLogs(...args); }
function percent(v) { return ((Number(v) || 0) * 100).toFixed(1).replace(".0", "") + "%"; }
function escapeHtml(v) {
  return String(v ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
}
function escapeJs(v) { return String(v ?? "").replaceAll("\\","\\\\").replaceAll("'","\\'").replaceAll("\n"," "); }
function statusBadge(status) {
  const map = { PENDING:["대기","yellow"], APPROVED:["승인","green"], REJECTED:["거절","red"], ACTIVE:["활성","green"], LOCKED:["잠김","red"], STOPPED:["중지","red"], PAUSED:["중지","yellow"], COMPLETED:["완료","green"], CANCELLED:["취소","red"], CLAIMED:["만기수령","green"], EARLY_CANCELLED:["중도해지","red"] };
  const item = map[status] || [status, ""];
  return `<span class="badge ${item[1]}">${escapeHtml(item[0])}</span>`;
}
function txTypeKo(type) {
  const map = { WITHDRAW_REQUEST_HOLD:"출금 신청", DEPOSIT_APPROVED:"입금 승인", WITHDRAW_APPROVED:"출금 승인", WITHDRAW_REJECTED_RELEASE:"출금 거절", STOCK_BUY:"주식 매수", STOCK_SELL:"주식 매도", DEPOSIT_JOIN:"예금 가입", DEPOSIT_CLAIM:"예금 만기수령", DEPOSIT_EARLY_CANCEL:"예금 중도해지", FUNDING_CONTRIBUTE:"펀딩 참여", FUNDING_REFUND:"펀딩 환불", ADMIN_ADD:"관리자 지급", ADMIN_SUBTRACT:"관리자 차감" };
  return map[type] || type;
}
function requestTypeKo(t) { return t === "DEPOSIT" ? "입금" : t === "WITHDRAW" ? "출금" : t; }

window.showLoginMode = function() {
  qs("loginModeBtn").classList.add("active"); qs("signupModeBtn").classList.remove("active");
  show("loginBox"); hide("signupBox"); hideStatus("signupStatus");
};
window.showSignupMode = function() {
  qs("signupModeBtn").classList.add("active"); qs("loginModeBtn").classList.remove("active");
  show("signupBox"); hide("loginBox"); hideStatus("loginStatus");
};
window.showSetupBox = function() { show("setupBox"); };

async function restore() {
  if (!auth.currentUser) return;
  try {
    const res = await call("getMyProfile");
    applyProfile(res.user);
  } catch {
    await signOut(auth);
  }
}
auth.onAuthStateChanged(() => restore());

function applyProfile(user) {
  currentUser = user;
  currentRole = user.role;
  if (user.mustChangePassword === "YES") {
    hideAllPages(); show("forcePasswordPage");
    qs("forcePasswordUserInfo").textContent = `${user.name} / ${user.userId} / ${user.role}`;
    return;
  }
  routeToRolePage();
}
function routeToRolePage() {
  hideAllPages();
  if (!currentUser) { show("loginPage"); return; }
  if (currentRole === "admin") {
    qs("adminInfo").textContent = `${currentUser.name} / ${currentUser.userId}`;
    show("adminPage");
    loadAdminInitial();
  } else if (currentRole === "banker") {
    qs("bankerInfo").textContent = `${currentUser.name} / ${currentUser.userId}`;
    show("bankerPage");
    loadBankerSummary();
  } else {
    qs("studentInfo").textContent = `${currentUser.name} / ${currentUser.userId}`;
    show("studentPage");
    loadStudentSummary();
  }
}
window.login = async function() {
  const id = qs("loginId").value;
  const pw = qs("loginPw").value;
  try {
    showStatus("loginStatus", "로그인 중이에요...", "warn");
    await signInWithEmailAndPassword(auth, toEmail(id), pw);
    const res = await call("getMyProfile");
    applyProfile(res.user);
  } catch (err) {
    showStatus("loginStatus", errMsg(err), "error");
  }
};
window.logoutNow = async function() {
  currentUser = null; currentRole = "";
  await signOut(auth);
  hideAllPages(); show("loginPage");
};
window.requestSignup = async function() {
  try {
    const res = await call("requestStudentSignup", {
      studentId: qs("signupId").value,
      studentName: qs("signupName").value,
      studentPassword: qs("signupPw").value,
      signupCode: qs("signupCode").value
    });
    showStatus("signupStatus", res.message, "success");
    ["signupId","signupName","signupPw","signupCode"].forEach(id => qs(id).value = "");
  } catch (err) { showStatus("signupStatus", errMsg(err), "error"); }
};
window.setupInitialAdmin = async function() {
  try {
    const res = await call("setupInitialAdmin", {
      setupKey: qs("setupKey").value,
      adminId: qs("setupAdminId").value,
      adminName: qs("setupAdminName").value,
      password: qs("setupAdminPw").value
    });
    showStatus("setupStatus", res.message + "\n이제 위 로그인 창에서 관리자 아이디로 로그인하세요.", "success");
  } catch (err) { showStatus("setupStatus", errMsg(err), "error"); }
};
window.changeMyPassword = async function() {
  try {
    const res = await call("changeMyPassword", { newPassword: qs("newMyPassword").value, confirmPassword: qs("newMyPasswordConfirm").value });
    showStatus("forcePasswordStatus", res.message, "success");
    await signOut(auth);
  } catch (err) { showStatus("forcePasswordStatus", errMsg(err), "error"); }
};

async function loadAdminInitial() {
  await loadAdminSummary();
  await loadAdminAccounts();
}
window.loadAdminSummary = async function() {
  try {
    const res = await call("getAdminSummary");
    qs("studentCount").textContent = res.studentCount;
    qs("activeStudentCount").textContent = res.activeStudentCount;
    qs("pendingStudentCount").textContent = res.pendingStudentCount;
    qs("bankerCount").textContent = res.bankerCount;
    qs("signupCodeText").textContent = res.signupCode;
    qs("resetPasswordText").textContent = res.resetPassword;
  } catch (err) { showStatus("adminStatus", errMsg(err), "error"); }
};
window.showAdminTab = function(tab) {
  ["accounts","money","stock","deposit","funding","inflation","logs"].forEach(t => {
    qs(`admin${cap(t)}Tab`)?.classList.add("hidden");
    qs(`adminTab${cap(t)}Btn`)?.classList.remove("active");
  });
  qs(`admin${cap(tab)}Tab`).classList.remove("hidden");
  qs(`adminTab${cap(tab)}Btn`).classList.add("active");
  if (tab === "accounts") loadAdminAccounts();
  if (tab === "money") { loadAdminMoney(); loadAdminAccounts(); }
  if (tab === "stock") loadAdminStock();
  if (tab === "deposit") loadAdminDeposits();
  if (tab === "funding") loadAdminFunding();
  if (tab === "logs") loadLogs();
};
function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

window.loadAdminAccounts = async function() {
  try {
    const res = await call("getAdminAccountsPanel");
    latestAdminAccounts = res;
    renderPendingStudents(res.pendingStudents || []);
    renderManagedStudents(res.managedStudents || []);
    renderBankers(res.bankers || []);
    renderAdjustStudentSelect(res.managedStudents || []);
    await loadAdminSummary();
  } catch (err) { showStatus("adminStatus", errMsg(err), "error"); }
};
function renderPendingStudents(list) {
  const body = qs("pendingBody"); body.innerHTML = "";
  if (!list.length) { body.innerHTML = '<tr><td colspan="5">승인대기 학생이 없어요.</td></tr>'; return; }
  list.forEach(s => {
    body.insertAdjacentHTML("beforeend", `<tr><td><input type="checkbox" class="studentPendingCheck" value="${escapeHtml(s.userId)}"></td><td>${escapeHtml(s.userId)}</td><td>${escapeHtml(s.name)}</td><td>${escapeHtml(s.createdAt)}</td><td><button class="green smallBtn" onclick="approveStudent('${escapeJs(s.userId)}')">승인</button><button class="danger smallBtn" onclick="rejectStudent('${escapeJs(s.userId)}')">거절</button></td></tr>`);
  });
}
function renderManagedStudents(list) {
  const body = qs("studentsManageBody"); body.innerHTML = "";
  if (!list.length) { body.innerHTML = '<tr><td colspan="9">활성 또는 잠금 상태의 학생이 없어요.</td></tr>'; return; }
  list.forEach(s => {
    const bankerBtn = s.bankerPermission === "YES"
      ? `<button class="danger smallBtn" onclick="revokeBankerPermission('${escapeJs(s.userId)}')">권한 회수</button>`
      : `<button class="purple smallBtn" onclick="grantBankerPermission('${escapeJs(s.userId)}')">권한 부여</button>`;
    const lockBtn = s.status === "LOCKED"
      ? `<button class="green smallBtn" onclick="unlockUser('${escapeJs(s.userId)}')">잠금해제</button>`
      : `<button class="danger smallBtn" onclick="lockUser('${escapeJs(s.userId)}')">잠금</button>`;
    body.insertAdjacentHTML("beforeend", `<tr><td>${escapeHtml(s.userId)}</td><td>${escapeHtml(s.name)}</td><td>${statusBadge(s.status)}</td><td>${formatMoney(s.balance)}</td><td>${s.shares || 0}주</td><td>${formatMoney(s.pendingWithdrawal)}</td><td>${s.bankerPermission === "YES" ? '<span class="badge purple">YES</span>' : "NO"}<br>${bankerBtn}</td><td>${s.mustChangePassword === "YES" ? '<span class="badge yellow">필요</span>' : "완료"}<br><button class="smallBtn" onclick="resetUserPassword('${escapeJs(s.userId)}')">1234 초기화</button></td><td>${lockBtn}</td></tr>`);
  });
}
function renderBankers(list) {
  const body = qs("bankersBody"); body.innerHTML = "";
  if (!list.length) { body.innerHTML = '<tr><td colspan="6">은행원 권한 보유자가 없어요.</td></tr>'; return; }
  list.forEach(b => {
    const manage = b.role === "student" ? `<button class="danger smallBtn" onclick="revokeBankerPermission('${escapeJs(b.userId)}')">권한 회수</button>` : "-";
    body.insertAdjacentHTML("beforeend", `<tr><td>${escapeHtml(b.userId)}</td><td>${escapeHtml(b.name)}</td><td>${escapeHtml(b.role)}</td><td>${statusBadge(b.status)}</td><td><span class="badge purple">은행원</span></td><td>${manage}</td></tr>`);
  });
}
function renderAdjustStudentSelect(list) {
  const sel = qs("adjustStudentSelect"); if (!sel) return;
  sel.innerHTML = list.map(s => `<option value="${escapeHtml(s.userId)}">${escapeHtml(s.name)} (${escapeHtml(s.userId)}) · ${formatMoney(s.balance)}</option>`).join("");
}
function selectedPendingStudentIds() { return Array.from(document.querySelectorAll("#pendingBody input.studentPendingCheck:checked")).map(c => c.value); }
window.approveStudent = async id => actionStatus("studentApprovalStatus", "approveStudent", { studentId: id }, loadAdminAccounts);
window.rejectStudent = async id => actionStatus("studentApprovalStatus", "rejectStudent", { studentId: id }, loadAdminAccounts);
window.bulkApproveStudents = async function() {
  const ids = selectedPendingStudentIds();
  if (!ids.length) return showStatus("studentApprovalStatus", "일괄승인할 학생을 선택해 주세요.", "error");
  await actionStatus("studentApprovalStatus", "bulkApproveStudents", { studentIds: ids }, loadAdminAccounts);
};
window.bulkRejectStudents = async function() {
  const ids = selectedPendingStudentIds();
  if (!ids.length) return showStatus("studentApprovalStatus", "일괄거절할 학생을 선택해 주세요.", "error");
  await actionStatus("studentApprovalStatus", "bulkRejectStudents", { studentIds: ids }, loadAdminAccounts);
};
window.grantBankerPermission = async id => actionStatus("bankerStatus", "grantBankerPermission", { studentId: id }, loadAdminAccounts);
window.revokeBankerPermission = async id => actionStatus("bankerStatus", "revokeBankerPermission", { studentId: id }, loadAdminAccounts);
window.resetUserPassword = async id => {
  if (confirm(`${id} 계정의 비밀번호를 1234로 초기화할까요?`)) await actionStatus("adminStatus", "resetUserPassword", { targetUserId: id }, loadAdminAccounts);
};
window.lockUser = async id => actionStatus("adminStatus", "lockUser", { targetUserId: id }, loadAdminAccounts);
window.unlockUser = async id => actionStatus("adminStatus", "unlockUser", { targetUserId: id }, loadAdminAccounts);
window.createStudent = async function() {
  await actionStatus("adminStatus", "createStudent", { studentId: qs("newStudentId").value, studentName: qs("newStudentName").value, studentPassword: qs("newStudentPw").value }, () => { ["newStudentId","newStudentName","newStudentPw"].forEach(id => qs(id).value = ""); loadAdminAccounts(); });
};
window.createBanker = async function() {
  await actionStatus("bankerStatus", "createBanker", { bankerId: qs("newBankerId").value, bankerName: qs("newBankerName").value }, () => { ["newBankerId","newBankerName"].forEach(id => qs(id).value = ""); loadAdminAccounts(); });
};
window.adjustWallet = async function() {
  await actionStatus("adjustStatus", "adjustWallet", { studentId: qs("adjustStudentSelect").value, mode: qs("adjustMode").value, amount: qs("adjustAmount").value, note: qs("adjustNote").value }, () => { qs("adjustAmount").value = ""; qs("adjustNote").value = ""; loadAdminAccounts(); });
};

async function actionStatus(statusId, fnName, data, after) {
  try {
    const res = await call(fnName, data);
    showStatus(statusId, res.message || "완료되었어요.", res.failCount ? "warn" : "success");
    if (after) await after();
  } catch (err) { showStatus(statusId, errMsg(err), "error"); }
}

window.loadAdminMoney = async function() {
  try {
    const res = await call("getAdminMoneyPanel");
    renderMoneyRequestsForAction("adminPendingMoneyBody", res.pendingMoneyRequests || [], "admin");
  } catch (err) { showStatus("adminMoneyStatus", errMsg(err), "error"); }
};
window.loadBankerSummary = async function() {
  try {
    const res = await call("getBankerSummary");
    qs("bankerMessage").textContent = `${res.name}님, 은행원 화면에 접속했어요.`;
    renderMoneyRequestsForAction("bankerPendingMoneyBody", res.pendingMoneyRequests || [], "banker");
    renderRecentMoneyRequests("bankerRecentMoneyBody", res.recentMoneyRequests || []);
  } catch (err) { qs("bankerMessage").textContent = errMsg(err); }
};
function moneyStatusId(source) {
  if (source === "admin") return "adminMoneyStatus";
  if (source === "studentBanker") return "studentBankerMoneyStatus";
  return "bankerMoneyStatus";
}
function reloadMoneySource(source) {
  if (source === "admin") loadAdminMoney();
  else if (source === "studentBanker") loadStudentSummary();
  else loadBankerSummary();
}
function renderMoneyRequestsForAction(bodyId, list, source) {
  const body = qs(bodyId); body.innerHTML = "";
  if (!list.length) { body.innerHTML = '<tr><td colspan="6">대기 중인 신청이 없어요.</td></tr>'; return; }
  list.forEach(r => {
    body.insertAdjacentHTML("beforeend", `<tr><td><input type="checkbox" class="moneyCheck" value="${escapeHtml(r.requestId)}"></td><td>${escapeHtml(r.studentName)}<br><span class="small">${escapeHtml(r.studentId)}</span></td><td>${requestTypeKo(r.requestType)}</td><td>${formatMoney(r.amount)}</td><td>${escapeHtml(r.requestedAt)}</td><td><button class="green smallBtn" onclick="approveMoneyRequest('${escapeJs(r.requestId)}','${source}')">승인</button><button class="danger smallBtn" onclick="rejectMoneyRequest('${escapeJs(r.requestId)}','${source}')">거절</button></td></tr>`);
  });
}
function getSelectedMoneyRequestIds(source) {
  const bodyId = source === "admin" ? "adminPendingMoneyBody" : source === "studentBanker" ? "studentBankerPendingMoneyBody" : "bankerPendingMoneyBody";
  return Array.from(document.querySelectorAll(`#${bodyId} input.moneyCheck:checked`)).map(c => c.value);
}
window.approveMoneyRequest = async (requestId, source) => actionStatus(moneyStatusId(source), "approveMoneyRequest", { requestId }, () => reloadMoneySource(source));
window.rejectMoneyRequest = async (requestId, source) => actionStatus(moneyStatusId(source), "rejectMoneyRequest", { requestId }, () => reloadMoneySource(source));
window.bulkApproveMoneyRequests = async function(source) {
  const ids = getSelectedMoneyRequestIds(source);
  if (!ids.length) return showStatus(moneyStatusId(source), "일괄승인할 신청을 선택해 주세요.", "error");
  await actionStatus(moneyStatusId(source), "bulkApproveMoneyRequests", { requestIds: ids }, () => reloadMoneySource(source));
};

window.loadAdminStock = async function() {
  try {
    const res = await call("getAdminStockPanel");
    renderAdminStock(res.stock);
  } catch (err) { showStatus("adminStockStatus", errMsg(err), "error"); }
};
function renderAdminStock(stock) {
  const s = stock.settings || {};
  qs("adminStockBox").innerHTML = `
    <div class="grid3">
      <div class="mini"><h3>현재 주가</h3><strong>${formatMoney(s.currentPrice)}</strong></div>
      <div class="mini"><h3>장 상태</h3><strong>${s.marketOpen === "OPEN" ? "열림" : "마감"}</strong></div>
      <div class="mini"><h3>시장 보유 주식</h3><strong>${s.marketShares || 0}주</strong></div>
      <div class="mini"><h3>교사 보유</h3><strong>${s.teacherShares || 0}주</strong></div>
      <div class="mini"><h3>거래소 보유금</h3><strong>${formatMoney(s.exchangeFund)}</strong></div>
      <div class="mini"><h3>일일 순매수</h3><strong>${(s.dayStudentBuy||0)+(s.dayTeacherBuy||0)-(s.dayStudentSell||0)-(s.dayTeacherSell||0)}주</strong></div>
    </div>
    <button class="green" onclick="openStockMarket()">장 열기</button>
    <button class="danger" onclick="closeStockMarket()">장 마감</button>
    <div class="grid2">
      <div><label>교사 큰손 매수</label><input id="teacherBuyShares" type="number" min="1"><button onclick="teacherBuyStock()">매수</button></div>
      <div><label>교사 큰손 매도</label><input id="teacherSellShares" type="number" min="1"><button onclick="teacherSellStock()">매도</button></div>
    </div>`;
}
window.openStockMarket = async () => actionStatus("adminStockStatus", "openStockMarket", {}, loadAdminStock);
window.closeStockMarket = async () => actionStatus("adminStockStatus", "closeStockMarket", {}, loadAdminStock);
window.teacherBuyStock = async () => actionStatus("adminStockStatus", "teacherBuyStock", { shares: qs("teacherBuyShares").value }, loadAdminStock);
window.teacherSellStock = async () => actionStatus("adminStockStatus", "teacherSellStock", { shares: qs("teacherSellShares").value }, loadAdminStock);
window.addStockNews = async () => actionStatus("adminStockStatus", "addStockNews", { title: qs("stockNewsTitle").value, body: qs("stockNewsBody").value }, () => { qs("stockNewsTitle").value = ""; qs("stockNewsBody").value = ""; loadAdminStock(); });

window.loadAdminDeposits = async function() {
  try {
    const res = await call("getAdminDepositPanel");
    renderAdminDepositProducts(res.depositProducts || []);
  } catch (err) { showStatus("adminDepositStatus", errMsg(err), "error"); }
};
function renderAdminDepositProducts(list) {
  const body = qs("adminDepositProductsBody"); body.innerHTML = "";
  if (!list.length) { body.innerHTML = '<tr><td colspan="6">예금 상품이 없어요.</td></tr>'; return; }
  list.forEach(p => {
    body.insertAdjacentHTML("beforeend", `<tr><td>${escapeHtml(p.name)}</td><td>${p.weeks}주</td><td>${percent(p.interestRate)}</td><td>${percent(p.earlyPenaltyRate)}</td><td>${statusBadge(p.status)}</td><td><button class="smallBtn" onclick="toggleDepositProduct('${escapeJs(p.productId)}')">${p.status === "ACTIVE" ? "판매중지" : "판매재개"}</button></td></tr>`);
  });
}
window.createDepositProduct = async function() {
  await actionStatus("adminDepositStatus", "createDepositProduct", { name: qs("depositProductName").value, weeks: qs("depositWeeks").value, interestRate: qs("depositRate").value, earlyPenaltyRate: qs("depositPenalty").value, minAmount: qs("depositMin").value, maxAmount: qs("depositMax").value }, loadAdminDeposits);
};
window.toggleDepositProduct = async id => actionStatus("adminDepositStatus", "toggleDepositProduct", { productId: id }, loadAdminDeposits);

window.loadAdminFunding = async function() {
  try {
    const res = await call("getAdminFundingPanel");
    renderAdminFunding(res.fundingCampaigns || []);
  } catch (err) { showStatus("adminFundingStatus", errMsg(err), "error"); }
};
function renderAdminFunding(list) {
  const body = qs("adminFundingBody"); body.innerHTML = "";
  if (!list.length) { body.innerHTML = '<tr><td colspan="6">펀딩이 없어요.</td></tr>'; return; }
  list.forEach(c => {
    const canManage = c.status === "ACTIVE" || c.status === "PAUSED";
    body.insertAdjacentHTML("beforeend", `<tr><td>${escapeHtml(c.title)}</td><td>${escapeHtml(c.description || "")}</td><td>${formatMoney(c.targetAmount)}</td><td>${formatMoney(c.currentAmount)}<div class="progress"><div style="width:${c.progress}%"></div></div></td><td>${statusBadge(c.status)}</td><td>${canManage ? `<button class="smallBtn" onclick="editFundingCampaign('${escapeJs(c.campaignId)}','${escapeJs(c.title)}','${escapeJs(c.description||"")}',${c.targetAmount})">수정</button><button class="smallBtn" onclick="toggleFundingCampaign('${escapeJs(c.campaignId)}')">${c.status === "ACTIVE" ? "중지" : "재개"}</button><button class="danger smallBtn" onclick="cancelFundingCampaign('${escapeJs(c.campaignId)}')">취소/환불</button>` : "-"}</td></tr>`);
  });
}
window.createFundingCampaign = async () => actionStatus("adminFundingStatus", "createFundingCampaign", { title: qs("fundingTitle").value, targetAmount: qs("fundingTarget").value, description: qs("fundingDesc").value }, () => { ["fundingTitle","fundingTarget","fundingDesc"].forEach(id => qs(id).value = ""); loadAdminFunding(); });
window.toggleFundingCampaign = async id => actionStatus("adminFundingStatus", "toggleFundingCampaign", { campaignId: id }, loadAdminFunding);
window.editFundingCampaign = async function(id, title, desc, target) {
  const newTitle = prompt("펀딩 제목을 수정해 주세요.", title); if (newTitle === null) return;
  const newTarget = prompt("목표 금액을 수정해 주세요.", target); if (newTarget === null) return;
  const newDesc = prompt("설명을 수정해 주세요.", desc || ""); if (newDesc === null) return;
  await actionStatus("adminFundingStatus", "updateFundingCampaign", { campaignId: id, title: newTitle, targetAmount: newTarget, description: newDesc }, loadAdminFunding);
};
window.cancelFundingCampaign = async id => {
  if (confirm("이 펀딩을 취소하고 참여 금액을 모두 환불할까요?")) await actionStatus("adminFundingStatus", "cancelFundingCampaign", { campaignId: id }, loadAdminFunding);
};

window.loadAdminInflation = async function() {
  try {
    const res = await call("getAdminInflationPanel");
    const i = res.inflation;
    qs("inflationProjectedAssets").textContent = formatMoney(i.projectedAssets);
    qs("inflationNetPrincipal").textContent = formatMoney(i.netPrincipal);
    qs("inflationIncreasedAmount").textContent = formatMoney(i.increasedAmount);
    qs("inflationRate").textContent = percent(i.inflationRate);
    showStatus("inflationRiskText", i.riskMessage, i.riskLevel === "HIGH" ? "error" : i.riskLevel === "MID" ? "warn" : "success");
    const body = qs("inflationStudentsBody"); body.innerHTML = "";
    (i.students || []).forEach(s => body.insertAdjacentHTML("beforeend", `<tr><td>${escapeHtml(s.name)}<br><span class="small">${escapeHtml(s.userId)}</span></td><td>${formatMoney(s.wallet)}</td><td>${s.shares}주</td><td>${formatMoney(s.stockValue)}</td><td>${formatMoney(s.depositValue)}</td><td>${formatMoney(s.totalAsset)}</td></tr>`));
  } catch (err) { showStatus("inflationRiskText", errMsg(err), "error"); }
};

window.loadStudentSummary = async function() {
  try {
    const res = await call("getStudentSummary");
    latestStudentSummary = res;
    qs("studentMessage").textContent = `${res.name}님, 접속에 성공했어요.${res.bankerPermission === "YES" ? " 은행원 권한이 있어요." : ""}`;
    qs("studentBalance").textContent = formatMoney(res.wallet.balance);
    qs("studentPendingWithdrawal").textContent = formatMoney(res.wallet.pendingWithdrawal);
    qs("studentAvailableBalance").textContent = formatMoney(res.wallet.availableBalance);
    renderStudentStock(res.stock);
    renderStudentDepositProducts(res.depositProducts || []);
    renderStudentDeposits(res.myDeposits || []);
    renderStudentFunding(res.fundingCampaigns || []);
    renderStudentFundingHistory(res.myFundingContributions || []);
    renderStudentMoneyRequests(res.recentMoneyRequests || []);
    renderStudentWalletTx(res.recentWalletTransactions || []);
    renderStudentBankerPanel(res);
  } catch (err) { qs("studentMessage").textContent = errMsg(err); }
};
window.showStudentTab = function(tab) {
  ["stock","bank","funding","studentBanker","history"].forEach(t => {
    qs(`${t}Tab`)?.classList.add("hidden");
    qs(`tab${cap(t)}Btn`)?.classList.remove("active");
  });
  qs(`${tab}Tab`).classList.remove("hidden");
  qs(`tab${cap(tab)}Btn`).classList.add("active");
};
function renderStudentStock(stock) {
  const s = stock.settings || {};
  const h = stock.holding || { shares: 0 };
  const news = (stock.news || []).map(n => `<div class="mini"><b>${escapeHtml(n.title)}</b><p>${escapeHtml(n.body)}</p><p class="small">${escapeHtml(n.createdAt)}</p></div>`).join("") || '<p class="small">등록된 뉴스가 없어요.</p>';
  qs("studentStockBox").innerHTML = `<div class="grid3"><div class="mini"><h3>현재 주가</h3><strong>${formatMoney(s.currentPrice)}</strong></div><div class="mini"><h3>장 상태</h3><strong>${s.marketOpen === "OPEN" ? "열림" : "마감"}</strong></div><div class="mini"><h3>내 보유 주식</h3><strong>${h.shares || 0}주</strong></div></div><div class="grid2"><div><label>매수할 주식 수</label><input id="buyShares" type="number" min="1"><button class="green" onclick="buyStock()">매수</button></div><div><label>매도할 주식 수</label><input id="sellShares" type="number" min="1"><button class="purple" onclick="sellStock()">매도</button></div></div><h3>뉴스</h3>${news}`;
}
window.buyStock = async () => actionStatus("studentStockStatus", "buyStock", { shares: qs("buyShares").value }, loadStudentSummary);
window.sellStock = async () => actionStatus("studentStockStatus", "sellStock", { shares: qs("sellShares").value }, loadStudentSummary);
window.createMoneyRequest = async function(type) {
  const inputId = type === "DEPOSIT" ? "depositAmount" : "withdrawAmount";
  await actionStatus("studentMoneyStatus", "createMoneyRequest", { requestType: type, amount: qs(inputId).value }, () => { qs(inputId).value = ""; loadStudentSummary(); });
};
function renderStudentDepositProducts(list) {
  const box = qs("studentDepositProductsBox");
  if (!list.length) { box.innerHTML = '<p class="small">가입 가능한 예금 상품이 없어요.</p>'; return; }
  box.innerHTML = list.map(p => `<div class="mini"><b>${escapeHtml(p.name)}</b><p>${p.weeks}주 · 이율 ${percent(p.interestRate)} · 중도해지 지급률 ${percent(p.earlyPenaltyRate)}</p><input id="depositAmount_${p.productId}" type="number" placeholder="가입 금액"><button class="green" onclick="joinDeposit('${escapeJs(p.productId)}')">가입</button></div>`).join("");
}
window.joinDeposit = async id => actionStatus("studentMoneyStatus", "joinDeposit", { productId: id, amount: qs("depositAmount_" + id).value }, loadStudentSummary);
function renderStudentDeposits(list) {
  const box = qs("studentDepositsBox");
  if (!list.length) { box.innerHTML = '<p class="small">가입한 예금이 없어요.</p>'; return; }
  box.innerHTML = `<div class="tableWrap"><table><thead><tr><th>상품</th><th>원금</th><th>이율</th><th>만기</th><th>상태</th><th>처리</th></tr></thead><tbody>${list.map(d => `<tr><td>${escapeHtml(d.productName)}</td><td>${formatMoney(d.principal)}</td><td>${percent(d.interestRate)}</td><td>${escapeHtml(d.maturityAt)}</td><td>${statusBadge(d.status)}</td><td>${d.status === "ACTIVE" ? `<button class="green smallBtn" onclick="claimDeposit('${escapeJs(d.depositId)}')">만기수령</button><button class="danger smallBtn" onclick="cancelDepositEarly('${escapeJs(d.depositId)}')">중도해지</button>` : "-"}</td></tr>`).join("")}</tbody></table></div>`;
}
window.claimDeposit = async id => actionStatus("studentMoneyStatus", "claimDeposit", { depositId: id }, loadStudentSummary);
window.cancelDepositEarly = async id => { if (confirm("중도해지하면 이자를 거의 받지 못해요. 해지할까요?")) await actionStatus("studentMoneyStatus", "cancelDepositEarly", { depositId: id }, loadStudentSummary); };
function renderStudentFunding(list) {
  const box = qs("studentFundingBox");
  if (!list.length) { box.innerHTML = '<p class="small">진행 중인 펀딩이 없어요.</p>'; return; }
  box.innerHTML = list.map(c => `<div class="mini"><h3>${escapeHtml(c.title)}</h3><p>${escapeHtml(c.description)}</p><p><b>${formatMoney(c.currentAmount)}</b> / ${formatMoney(c.targetAmount)}</p><div class="progress"><div style="width:${c.progress}%"></div></div><input id="fundingAmount_${c.campaignId}" type="number" placeholder="참여 금액"><button class="purple" onclick="contributeFunding('${escapeJs(c.campaignId)}')">펀딩 참여</button></div>`).join("");
}
window.contributeFunding = async id => actionStatus("studentFundingStatus", "contributeFunding", { campaignId: id, amount: qs("fundingAmount_" + id).value }, loadStudentSummary);
function renderStudentFundingHistory(list) {
  const box = qs("studentFundingHistoryBox");
  if (!list.length) { box.innerHTML = '<p class="small">참여 기록이 없어요.</p>'; return; }
  box.innerHTML = `<div class="tableWrap"><table><thead><tr><th>시간</th><th>펀딩</th><th>금액</th><th>환불</th></tr></thead><tbody>${list.map(c => `<tr><td>${escapeHtml(c.timestamp)}</td><td>${escapeHtml(c.title)}</td><td>${formatMoney(c.amount)}</td><td>${c.refunded === "YES" ? "환불됨" : "-"}</td></tr>`).join("")}</tbody></table></div>`;
}
function renderStudentMoneyRequests(list) {
  const body = qs("studentMoneyRequestsBody"); body.innerHTML = "";
  if (!list.length) { body.innerHTML = '<tr><td colspan="5">입출금 신청 내역이 없어요.</td></tr>'; return; }
  list.forEach(r => body.insertAdjacentHTML("beforeend", `<tr><td>${requestTypeKo(r.requestType)}</td><td>${formatMoney(r.amount)}</td><td>${statusBadge(r.status)}</td><td>${escapeHtml(r.requestedAt)}</td><td>${escapeHtml(r.processedAt)}</td></tr>`));
}
function renderStudentWalletTx(list) {
  const body = qs("studentWalletTxBody"); body.innerHTML = "";
  if (!list.length) { body.innerHTML = '<tr><td colspan="6">지갑 거래 기록이 없어요.</td></tr>'; return; }
  list.forEach(tx => body.insertAdjacentHTML("beforeend", `<tr><td>${escapeHtml(tx.timestamp)}</td><td>${escapeHtml(txTypeKo(tx.txType))}</td><td>${formatMoney(tx.amount)}</td><td>${formatMoney(tx.beforeBalance)} → ${formatMoney(tx.afterBalance)}</td><td>${formatMoney(tx.beforePendingWithdrawal)} → ${formatMoney(tx.afterPendingWithdrawal)}</td><td>${escapeHtml(tx.note)}</td></tr>`));
}
function renderStudentBankerPanel(res) {
  if (res.bankerPermission === "YES") {
    show("tabStudentBankerBtn");
    renderMoneyRequestsForAction("studentBankerPendingMoneyBody", res.bankerPendingMoneyRequests || [], "studentBanker");
    renderRecentMoneyRequests("studentBankerRecentMoneyBody", res.bankerRecentMoneyRequests || []);
  } else hide("tabStudentBankerBtn");
}
function renderRecentMoneyRequests(bodyId, list) {
  const body = qs(bodyId); body.innerHTML = "";
  if (!list.length) { body.innerHTML = '<tr><td colspan="6">기록이 없어요.</td></tr>'; return; }
  list.forEach(r => body.insertAdjacentHTML("beforeend", `<tr><td>${escapeHtml(r.studentName)}</td><td>${requestTypeKo(r.requestType)}</td><td>${formatMoney(r.amount)}</td><td>${statusBadge(r.status)}</td><td>${escapeHtml(r.requestedAt)}</td><td>${escapeHtml(r.processedBy || "")}</td></tr>`));
}

window.loadLogs = async function() {
  try {
    const res = await call("getLogsPanel", { limit: 150 });
    latestLogs = res;
    showLogTab(currentLogTab);
    showStatus("logsStatus", "기록을 불러왔어요.", "success");
  } catch (err) { showStatus("logsStatus", errMsg(err), "error"); }
};
window.showLogTab = function(tab) {
  currentLogTab = tab;
  ["logs","wallet","money","stock","deposit","funding"].forEach(t => qs(`logTab${cap(t)}Btn`)?.classList.remove("active"));
  qs(`logTab${cap(tab)}Btn`)?.classList.add("active");
  if (!latestLogs) return;
  const configs = {
    logs: { headers:["시간","구분","사용자","권한","행동","결과","상세"], rows:(latestLogs.logs||[]).map(x=>[x.timestamp,x.category,x.userId,x.role,x.action,x.result,x.detail]) },
    wallet: { headers:["시간","학생","종류","금액","잔액 변화","대기금 변화","처리자","내용"], rows:(latestLogs.walletTransactions||[]).map(x=>[x.timestamp,x.userId,txTypeKo(x.txType),formatMoney(x.amount),`${formatMoney(x.beforeBalance)} → ${formatMoney(x.afterBalance)}`,`${formatMoney(x.beforePendingWithdrawal)} → ${formatMoney(x.afterPendingWithdrawal)}`,x.processedBy,x.note]) },
    money: { headers:["신청시간","처리시간","학생","종류","금액","상태","처리자"], rows:(latestLogs.moneyRequests||[]).map(x=>[x.requestedAt,x.processedAt,x.studentName,requestTypeKo(x.requestType),formatMoney(x.amount),x.status,x.processedBy]) },
    stock: { headers:["시간","사용자","종류","주식수","가격","총액","보유 변화"], rows:(latestLogs.stockTrades||[]).map(x=>[x.timestamp,x.name||x.userId,x.tradeType,`${x.shares}주`,formatMoney(x.price),formatMoney(x.total),`${x.beforeShares??""} → ${x.afterShares??""}`]) },
    deposit: { headers:["시작","만기/처리","학생","상품","원금","상태","지급액","상세"], rows:(latestLogs.studentDeposits||[]).map(x=>[x.startAt,x.claimedAt||x.maturityAt,x.userName,x.productName,formatMoney(x.principal),x.status,formatMoney(x.payoutAmount),x.detail]) },
    funding: { headers:["시간","학생","펀딩","금액","환불"], rows:(latestLogs.fundingContributions||[]).map(x=>[x.timestamp,x.userName,x.title,formatMoney(x.amount),x.refunded]) }
  };
  renderLogTable(configs[tab]);
};
function renderLogTable(config) {
  qs("logsHead").innerHTML = `<tr>${config.headers.map(h => `<th>${escapeHtml(h)}</th>`).join("")}</tr>`;
  qs("logsBody").innerHTML = config.rows.length ? config.rows.map(row => `<tr>${row.map(v => `<td>${escapeHtml(v)}</td>`).join("")}</tr>`).join("") : `<tr><td colspan="${config.headers.length}">기록이 없어요.</td></tr>`;
}
window.downloadCurrentLogCsv = function() {
  if (!latestLogs) return showStatus("logsStatus", "먼저 기록을 새로고침해 주세요.", "error");
  const table = qs("logsTable");
  const rows = Array.from(table.querySelectorAll("tr")).map(tr => Array.from(tr.children).map(td => td.textContent));
  const csv = rows.map(row => row.map(csvEscape).join(",")).join("\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `ogu-${currentLogTab}-logs.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
};
function csvEscape(v) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replaceAll('"','""')}"` : s;
}

