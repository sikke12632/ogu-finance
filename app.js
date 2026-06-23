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
let renderAdminStock = null;
let renderStudentStock = null;

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
    body.insertAdjacentHTML("beforeend", `<tr><td>${escapeHtml(s.userId)}</td><td>${escapeHtml(s.name)}</td><td>${statusBadge(s.status)}</td><td>${formatMoney(s.balance)}</td><td>${s.shares || 0}주</td><td>${formatMoney(s.pendingWithdrawal)}</td><td>${s.bankerPermission === "YES" ? '<span class="badge purple">YES</span>' : "NO"}<br>${bankerBtn}</td><td>${s.mustChangePassword === "YES" ? '<span class="badge yellow">필요</span>' : "완료"}<br><button class="smallBtn" onclick="resetUserPassword('${escapeJs(s.userId)}')">123456 초기화</button></td><td>${lockBtn}</td></tr>`);
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
  if (confirm(`${id} 계정의 비밀번호를 123456으로 초기화할까요?`)) await actionStatus("adminStatus", "resetUserPassword", { targetUserId: id }, loadAdminAccounts);
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
function renderAdminStockV2(stock) {
  const s = stock.settings || {};
  const m = stock.marketStats || {};
  const recentTrades = stock.recentTrades || [];
  const net = Number(m.netBuy || 0);
  const netText = net > 0 ? `+${net}주` : `${net}주`;
  const closeReason = s.lastCloseAdminReason || s.lastCloseReason || "아직 장마감 설명이 없어요.";
  const adminNews = stock.news || [];
  const adminNewsHtml = adminNews.length
    ? `<div style="overflow-x:auto;margin-top:10px;"><table><thead><tr><th>구분</th><th>제목</th><th>내용</th><th>등록시각</th><th>관리</th></tr></thead><tbody>${adminNews.map(n => `<tr><td>${n.type === "CLOSE_MARKET" ? "장마감" : "일반"}</td><td>${escapeHtml(n.title)}</td><td>${escapeHtml(n.body || "")}</td><td>${escapeHtml(n.createdAt || "")}</td><td><button class="danger smallBtn" onclick="deleteStockNews('${escapeJs(n.newsId || n.id)}')">삭제</button></td></tr>`).join("")}</tbody></table></div>`
    : '<p class="small">등록된 뉴스가 없어요.</p>';
  const tradesHtml = recentTrades.length
    ? `<div style="overflow-x:auto;margin-top:10px;"><table><thead><tr><th>시간</th><th>이름</th><th>종류</th><th>수량</th><th>가격</th><th>보유 변화</th></tr></thead><tbody>${recentTrades.map(t => `<tr><td>${escapeHtml(t.timestamp)}</td><td>${escapeHtml(t.name || t.userId || "-")}</td><td>${escapeHtml(t.tradeType)}</td><td>${t.shares || 0}주</td><td>${formatMoney(t.price || 0)}</td><td>${t.beforeShares ?? "-"} → ${t.afterShares ?? "-"}</td></tr>`).join("")}</tbody></table></div>`
    : '<p class="small">최근 거래가 없어요.</p>';
  qs("adminStockBox").innerHTML = `
    <div class="grid3">
      <div class="mini"><h3>현재 주가</h3><strong>${formatMoney(s.currentPrice)}</strong></div>
      <div class="mini"><h3>장 상태</h3><strong>${s.marketOpen === "OPEN" ? "열림" : "마감"}</strong></div>
      <div class="mini"><h3>시장 보유 주식</h3><strong>${s.marketShares || 0}주</strong></div>
      <div class="mini"><h3>교사 보유</h3><strong>${s.teacherShares || 0}주</strong></div>
      <div class="mini"><h3>거래소 보유금</h3><strong>${formatMoney(s.exchangeFund)}</strong></div>
      <div class="mini"><h3>전체 순매수</h3><strong>${netText}</strong></div>
    </div>
    <div class="mini" style="margin-top:14px;">
      <h3>실시간 거래량판</h3>
      <div class="grid3">
        <div class="mini"><h3>학생 매수/매도</h3><strong>${m.studentBuy || 0} / ${m.studentSell || 0}주</strong></div>
        <div class="mini"><h3>큰손 매수/매도</h3><strong>${m.teacherBuy || 0} / ${m.teacherSell || 0}주</strong></div>
        <div class="mini"><h3>예상 마감가</h3><strong>${formatMoney(m.expectedClosePrice ?? s.currentPrice)}</strong><p class="small">${escapeHtml(m.direction || "보합 가능")}</p></div>
      </div>
    </div>
    <div class="mini" style="margin-top:14px;"><h3>최근 장마감 설명</h3><p>${escapeHtml(closeReason)}</p></div>
    <button class="green" onclick="openStockMarket()">장 열기</button>
    <button class="danger" onclick="closeStockMarket()">장 마감</button>
    <button class="secondary" onclick="loadAdminStock()">거래량 새로고침</button>
    <div class="grid2">
      <div><label>교사 큰손 매수</label><input id="teacherBuyShares" type="number" min="1"><button onclick="teacherBuyStock()">매수</button></div>
      <div><label>교사 큰손 매도</label><input id="teacherSellShares" type="number" min="1"><button onclick="teacherSellStock()">매도</button></div>
    </div>
    <div class="mini" style="margin-top:14px;">
      <h3>최근 거래 내역</h3>
      <p class="small">교사 화면에는 학생 실명 거래와 큰손 거래가 모두 보입니다.</p>
      ${tradesHtml}
    </div>
    <div class="mini" style="margin-top:14px;">
      <h3>뉴스 등록/삭제</h3>
      <p class="small">장마감하면 [장마감 소식] 뉴스가 자동 등록됩니다. 테스트 중 생긴 뉴스나 오래된 뉴스는 여기서 삭제하세요.</p>
      <div class="grid2">
        <div><label>뉴스 제목</label><input id="stockNewsTitle" placeholder="예: 오구 주식회사, 신제품 인기"></div>
        <div><label>뉴스 내용</label><input id="stockNewsBody" placeholder="학생들이 읽을 투자 힌트나 시장 소식을 적어 주세요."></div>
      </div>
      <button class="green" onclick="addStockNews()">뉴스 등록</button>
      <h3 style="margin-top:14px;">현재 뉴스 목록</h3>
      <p class="small">학생 화면에는 최신 뉴스 3개만 크게 보이고, 장마감 뉴스는 최신 1개만 보여요.</p>
      ${adminNewsHtml}
    </div>
    <div class="mini" style="margin-top:14px;">
      <h3>관리자 주식 설정 변경</h3>
      <p class="small">증자, 거래소 보유금 보정, 최고가/최저가 변경처럼 실제 거래가 아닌 운영 조정에 사용하세요. 변경 기록은 로그에 남아요.</p>
      <div class="grid3">
        <div><label>현재 주가</label><input id="stockSetCurrentPrice" type="number" min="0" value="${s.currentPrice ?? 100}"></div>
        <div><label>시장 보유 주식</label><input id="stockSetMarketShares" type="number" min="0" value="${s.marketShares ?? 0}"></div>
        <div><label>교사 보유 주식</label><input id="stockSetTeacherShares" type="number" min="0" value="${s.teacherShares ?? 0}"></div>
        <div><label>거래소 보유금</label><input id="stockSetExchangeFund" type="number" min="0" value="${s.exchangeFund ?? 0}"></div>
        <div><label>1인 보유 한도</label><input id="stockSetPerStudentLimit" type="number" min="0" value="${s.perStudentLimit ?? 20}"></div>
        <div><label>순매수 1주당 주가 반영값</label><input id="stockSetPriceWeight" type="number" min="0" step="0.1" value="${s.priceWeight ?? 1}"></div>
        <div><label>일일 등락 제한(%)</label><input id="stockSetDailyLimitRate" type="number" min="0" max="100" step="1" value="${Math.round(Number(s.dailyLimitRate ?? 0.3) * 100)}"></div>
        <div><label>최저 주가</label><input id="stockSetMinPrice" type="number" min="0" value="${s.minPrice ?? 1}"></div>
        <div><label>최고 주가</label><input id="stockSetMaxPrice" type="number" min="0" value="${s.maxPrice ?? 200}"></div>
      </div>
      <label><input id="stockSetResetDay" type="checkbox" checked> 오늘 거래량 초기화</label>
      <label><input id="stockSetForceClose" type="checkbox"> 장 상태를 마감으로 변경</label>
      <button class="purple" onclick="updateStockSettings()">주식 설정 저장</button>
    </div>`;
}
window.openStockMarket = async () => actionStatus("adminStockStatus", "openStockMarket", {}, loadAdminStock);
window.closeStockMarket = async () => actionStatus("adminStockStatus", "closeStockMarket", {}, loadAdminStock);
window.teacherBuyStock = async () => actionStatus("adminStockStatus", "teacherBuyStock", { shares: qs("teacherBuyShares").value }, loadAdminStock);
window.teacherSellStock = async () => actionStatus("adminStockStatus", "teacherSellStock", { shares: qs("teacherSellShares").value }, loadAdminStock);
renderAdminStock = renderAdminStockV2;

window.updateStockSettings = async () => actionStatus("adminStockStatus", "updateStockSettings", {
  currentPrice: qs("stockSetCurrentPrice").value,
  marketShares: qs("stockSetMarketShares").value,
  teacherShares: qs("stockSetTeacherShares").value,
  exchangeFund: qs("stockSetExchangeFund").value,
  perStudentLimit: qs("stockSetPerStudentLimit").value,
  priceWeight: qs("stockSetPriceWeight").value,
  dailyLimitRate: qs("stockSetDailyLimitRate").value,
  minPrice: qs("stockSetMinPrice").value,
  maxPrice: qs("stockSetMaxPrice").value,
  resetDayCounters: qs("stockSetResetDay").checked,
  forceCloseMarket: qs("stockSetForceClose").checked
}, loadAdminStock);
window.addStockNews = async () => actionStatus("adminStockStatus", "addStockNews", { title: qs("stockNewsTitle").value, body: qs("stockNewsBody").value }, () => { qs("stockNewsTitle").value = ""; qs("stockNewsBody").value = ""; loadAdminStock(); });
window.deleteStockNews = async id => {
  if (!confirm("이 뉴스를 삭제할까요? 삭제하면 학생 화면에서도 사라집니다.")) return;
  await actionStatus("adminStockStatus", "deleteStockNews", { newsId: id }, loadAdminStock);
};

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
function renderStudentStockV2(stock) {
  const s = stock.settings || {};
  const h = stock.holding || { shares: 0 };
  const m = stock.marketStats || {};
  const net = Number(m.netBuy || 0);
  const netText = net > 0 ? `+${net}주` : `${net}주`;
  const lastReason = s.lastCloseReason || "아직 장마감 설명이 없어요.";
  const newsList = stock.news || [];
  const news = newsList.length
    ? `<div style="border:2px solid #f6ad55;border-radius:14px;padding:14px;background:#fffaf0;margin-bottom:14px;"><h2 style="margin:0 0 8px 0;">📰 오늘의 오구 뉴스</h2><p class="small">최신 뉴스 3개만 보여요. 장마감 소식은 가장 최근 것 1개만 표시됩니다.</p>${newsList.map((n, idx) => `<div class="mini" style="background:white;border-left:5px solid #ed8936;margin-top:10px;"><b>${idx === 0 ? '<span style="display:inline-block;background:#e53e3e;color:white;border-radius:999px;padding:2px 8px;margin-right:6px;font-size:12px;">NEW</span>' : ''}${escapeHtml(n.title)}</b><p style="font-size:15px;line-height:1.5;">${escapeHtml(n.body || "")}</p><p class="small">${escapeHtml(n.createdAt || "")}</p></div>`).join("")}</div>`
    : '<div style="border:2px solid #f6ad55;border-radius:14px;padding:14px;background:#fffaf0;margin-bottom:14px;"><h2 style="margin:0;">📰 오늘의 오구 뉴스</h2><p class="small">등록된 뉴스가 없어요.</p></div>';
  qs("studentStockBox").innerHTML = `
    ${news}
    <div class="grid3">
      <div class="mini"><h3>현재 주가</h3><strong>${formatMoney(s.currentPrice)}</strong></div>
      <div class="mini"><h3>장 상태</h3><strong>${s.marketOpen === "OPEN" ? "열림" : "마감"}</strong></div>
      <div class="mini"><h3>내 보유 주식</h3><strong>${h.shares || 0}주</strong></div>
    </div>
    <div class="mini" style="margin-top:14px;">
      <h3>오늘의 시장 분위기</h3>
      <p class="small">학생 화면에서는 개인 이름 없이 전체 거래량만 보여요. 큰손 거래도 익명으로 합산됩니다.</p>
      <div class="grid3">
        <div class="mini"><h3>전체 매수</h3><strong>${m.totalBuy || 0}주</strong></div>
        <div class="mini"><h3>전체 매도</h3><strong>${m.totalSell || 0}주</strong></div>
        <div class="mini"><h3>현재 순매수</h3><strong>${netText}</strong></div>
      </div>
      <p><b>장마감 예상:</b> ${escapeHtml(m.direction || "보합 가능")} · 예상가 ${formatMoney(m.expectedClosePrice ?? s.currentPrice)}</p>
    </div>
    <div class="mini" style="margin-top:14px;"><h3>최근 주가 변동 이유</h3><p>${escapeHtml(lastReason)}</p></div>
    <div class="grid2">
      <div><label>매수할 주식 수</label><input id="buyShares" type="number" min="1"><button class="green" onclick="buyStock()">매수</button></div>
      <div><label>매도할 주식 수</label><input id="sellShares" type="number" min="1"><button class="purple" onclick="sellStock()">매도</button></div>
    </div>`;
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
  if (!list.length) { box.innerHTML = '<p class="small">표시할 펀딩이 없어요.</p>'; return; }
  box.innerHTML = list.map(c => {
    const summary = c.contributionSummary || [];
    const rows = summary.length
      ? summary.map(x => `<tr><td>${escapeHtml(x.userName || x.userId)}</td><td>${formatMoney(x.totalAmount)}</td><td>${x.count}회</td></tr>`).join("")
      : '<tr><td colspan="3">아직 참여자가 없어요.</td></tr>';
    const recent = (c.contributions || []).slice(0, 8).map(x => `<tr><td>${escapeHtml(x.timestamp)}</td><td>${escapeHtml(x.userName || x.userId)}</td><td>${formatMoney(x.amount)}</td></tr>`).join("");
    const canContribute = c.status === "ACTIVE";
    return `<div class="mini">
      <h3>${escapeHtml(c.title)} ${statusBadge(c.status)}</h3>
      <p>${escapeHtml(c.description)}</p>
      <p><b>${formatMoney(c.currentAmount)}</b> / ${formatMoney(c.targetAmount)}</p>
      <div class="progress"><div style="width:${c.progress}%"></div></div>
      ${canContribute ? `<input id="fundingAmount_${c.campaignId}" type="number" placeholder="참여 금액"><button class="purple" onclick="contributeFunding('${escapeJs(c.campaignId)}')">펀딩 참여</button>` : `<p class="small">${c.status === "COMPLETED" ? "목표를 달성한 펀딩이에요." : "현재 참여가 중지된 펀딩이에요."}</p>`}
      <h4>펀딩 참여자 합계</h4>
      <div class="tableWrap"><table><thead><tr><th>학생</th><th>총 펀딩액</th><th>참여 횟수</th></tr></thead><tbody>${rows}</tbody></table></div>
      <details style="margin-top:10px;"><summary class="small">펀딩 참여자 최근 기록 보기</summary><div class="tableWrap"><table><thead><tr><th>시간</th><th>학생</th><th>금액</th></tr></thead><tbody>${recent || '<tr><td colspan="3">기록이 없어요.</td></tr>'}</tbody></table></div></details>
    </div>`;
  }).join("");
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

window.updateStockSettings = async () => actionStatus("adminStockStatus", "updateStockSettings", {
  currentPrice: stockSettingValueV4("stockSetCurrentPrice"),
  marketTrend: currentSelectedStockTrendV4(stockLastAdminStockV4),
  updateIntervalSeconds: stockSettingValueV4("stockSetUpdateIntervalSeconds"),
  marketShares: stockSettingValueV4("stockSetMarketShares"),
  teacherShares: stockSettingValueV4("stockSetTeacherShares"),
  exchangeFund: stockSettingValueV4("stockSetExchangeFund"),
  perStudentLimit: stockSettingValueV4("stockSetPerStudentLimit"),
  priceWeight: stockSettingValueV4("stockSetPriceWeight"),
  trendMoveStep: stockSettingValueV4("stockSetTrendMoveStep"),
  tradeImpactShares: stockSettingValueV4("stockSetTradeImpactShares"),
  tradeImpactMaxMove: stockSettingValueV4("stockSetTradeImpactMaxMove"),
  dailyLimitRate: stockSettingValueV4("stockSetDailyLimitRate"),
  minPrice: stockSettingValueV4("stockSetMinPrice"),
  maxPrice: stockSettingValueV4("stockSetMaxPrice"),
  baseSpread: stockSettingValueV4("stockSetBaseSpread"),
  volatileSpread: stockSettingValueV4("stockSetVolatileSpread"),
  buyFeeRate: stockSettingValueV4("stockSetBuyFeeRate"),
  sellFeeRate: stockSettingValueV4("stockSetSellFeeRate"),
  feeMode: stockSettingValueV4("stockSetFeeMode"),
  linkedFundingCampaignId: stockSettingValueV4("stockSetLinkedFundingCampaignId"),
  resetDayCounters: stockSettingCheckedV4("stockSetResetDay"),
  forceCloseMarket: stockSettingCheckedV4("stockSetForceClose")
}, loadAdminStock);

renderAdminStock = renderAdminStockV4;
renderStudentStock = renderStudentStockV4;

function stockSettingValueV4(id) {
  return qs(id)?.value ?? "";
}

function stockSettingCheckedV4(id) {
  return Boolean(qs(id)?.checked);
}

window.openStockMarket = async () => actionStatus("adminStockStatus", "openStockMarket", {
  marketTrend: currentSelectedStockTrendV4(stockLastAdminStockV4)
}, loadAdminStock);

window.closeStockMarket = async () => {
  clearInterval(stockAutoTickTimerV4);
  stockAutoTickTimerV4 = null;
  await actionStatus("adminStockStatus", "closeStockMarket", {}, loadAdminStock);
};

window.tickStockMarket = async () => actionStatus("adminStockStatus", "tickStockMarket", {}, loadAdminStock);

window.updateStockSettings = async () => actionStatus("adminStockStatus", "updateStockSettings", {
  currentPrice: stockSettingValueV4("stockSetCurrentPrice"),
  marketTrend: currentSelectedStockTrendV4(stockLastAdminStockV4),
  updateIntervalSeconds: stockSettingValueV4("stockSetUpdateIntervalSeconds"),
  marketShares: stockSettingValueV4("stockSetMarketShares"),
  teacherShares: stockSettingValueV4("stockSetTeacherShares"),
  exchangeFund: stockSettingValueV4("stockSetExchangeFund"),
  perStudentLimit: stockSettingValueV4("stockSetPerStudentLimit"),
  priceWeight: stockSettingValueV4("stockSetPriceWeight"),
  trendMoveStep: stockSettingValueV4("stockSetTrendMoveStep"),
  tradeImpactShares: stockSettingValueV4("stockSetTradeImpactShares"),
  tradeImpactMaxMove: stockSettingValueV4("stockSetTradeImpactMaxMove"),
  dailyLimitRate: stockSettingValueV4("stockSetDailyLimitRate"),
  minPrice: stockSettingValueV4("stockSetMinPrice"),
  maxPrice: stockSettingValueV4("stockSetMaxPrice"),
  baseSpread: stockSettingValueV4("stockSetBaseSpread"),
  volatileSpread: stockSettingValueV4("stockSetVolatileSpread"),
  buyFeeRate: stockSettingValueV4("stockSetBuyFeeRate"),
  sellFeeRate: stockSettingValueV4("stockSetSellFeeRate"),
  feeMode: stockSettingValueV4("stockSetFeeMode"),
  linkedFundingCampaignId: stockSettingValueV4("stockSetLinkedFundingCampaignId"),
  resetDayCounters: stockSettingCheckedV4("stockSetResetDay"),
  forceCloseMarket: stockSettingCheckedV4("stockSetForceClose")
}, loadAdminStock);

const showAdminTabBeforeStockV4 = window.showAdminTab;
window.showAdminTab = function(tab) {
  if (tab !== "stock") {
    clearInterval(stockAutoTickTimerV4);
    stockAutoTickTimerV4 = null;
  }
  return showAdminTabBeforeStockV4(tab);
};

renderAdminStock = renderAdminStockV4;
renderStudentStock = renderStudentStockV4;

// Stock UI v4: cleaner test-page style controls for the operating app.
var stockAutoTickTimerV4 = null;
var stockLastAdminStockV4 = null;

function stockTrendOptionsV4(stock) {
  const fromServer = Array.isArray(stock?.trendRules) && stock.trendRules.length ? stock.trendRules : null;
  return fromServer || [
    { key: "SURGE", label: "급등장" },
    { key: "BULL", label: "강세장" },
    { key: "MIXED", label: "혼조세" },
    { key: "BEAR", label: "약세장" },
    { key: "CRASH", label: "급락장" }
  ];
}

function stockTrendLabelV4(stock, key) {
  return stockTrendOptionsV4(stock).find(item => item.key === key)?.label || key || "혼조세";
}

function currentSelectedStockTrendV4(stock) {
  return document.querySelector(".stockTrendButton.active")?.dataset.trend
    || stock?.settings?.marketTrend
    || "MIXED";
}

window.selectStockTrend = function(trend) {
  document.querySelectorAll(".stockTrendButton").forEach(button => {
    button.classList.toggle("active", button.dataset.trend === trend);
  });
};

function renderStockChartV4(canvasId, history, fallbackPrice = 100) {
  const canvas = qs(canvasId);
  if (!canvas) return;
  const values = (Array.isArray(history) ? history : [])
    .map(v => Math.max(1, Math.round(stockNum(v, fallbackPrice))))
    .filter(v => Number.isFinite(v));
  if (!values.length) values.push(Math.max(1, Math.round(stockNum(fallbackPrice, 100))));

  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  const pad = 34;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "#e5e7eb";
  ctx.lineWidth = 1;
  for (let i = 0; i < 5; i += 1) {
    const y = pad + ((height - pad * 2) / 4) * i;
    ctx.beginPath();
    ctx.moveTo(pad, y);
    ctx.lineTo(width - pad, y);
    ctx.stroke();
  }

  ctx.strokeStyle = "#2563eb";
  ctx.lineWidth = 4;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  values.forEach((value, index) => {
    const x = values.length === 1 ? width / 2 : pad + ((width - pad * 2) * index) / (values.length - 1);
    const y = height - pad - ((value - min) / range) * (height - pad * 2);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  ctx.fillStyle = "#111827";
  ctx.font = "14px Arial";
  ctx.fillText(`${max.toLocaleString("ko-KR")}오구`, pad, 22);
  ctx.fillText(`${min.toLocaleString("ko-KR")}오구`, pad, height - 10);
}

function startStockAutoTickV4(stock) {
  clearInterval(stockAutoTickTimerV4);
  stockAutoTickTimerV4 = null;
  if (!stock || currentRole !== "admin" || stock.settings?.marketOpen !== "OPEN") return;
  const seconds = Math.max(1, Math.floor(stockNum(stock.settings.updateIntervalSeconds, 5)));
  stockAutoTickTimerV4 = setInterval(async () => {
    try {
      const res = await call("tickStockMarket", {});
      if (res && !res.skipped) await loadAdminStock();
    } catch {
      clearInterval(stockAutoTickTimerV4);
      stockAutoTickTimerV4 = null;
    }
  }, seconds * 1000);
}

function renderAutoNewsV4(newsList) {
  const list = (newsList || []).slice(0, 3);
  if (!list.length) return '<p class="small">자동 뉴스가 아직 없어요. 장을 열면 장세에 맞는 뉴스가 생성됩니다.</p>';
  return list.map(n => `<div class="stockNewsItemV4"><b>${escapeHtml(n.title)}</b><p>${escapeHtml(n.body || "")}</p><p class="small">${escapeHtml(n.createdAt || "")}</p></div>`).join("");
}

function fundingOptionsV4(stock) {
  const s = stock.settings || {};
  const linkedId = s.linkedFundingCampaignId || "";
  const campaigns = stock.fundingCampaigns || [];
  return [
    `<option value="">펀딩 연결 안 함</option>`,
    ...campaigns.map(c => `<option value="${escapeHtml(c.campaignId || c.id)}" ${linkedId === (c.campaignId || c.id) ? "selected" : ""}>${escapeHtml(c.title)} (${formatMoney(c.currentAmount)} / ${formatMoney(c.targetAmount)})</option>`)
  ].join("");
}

function renderAdminStockV4(stock) {
  stockLastAdminStockV4 = stock;
  const s = stock.settings || {};
  const m = stock.marketStats || {};
  const prices = getStockPrices(stock);
  const trendKey = s.marketTrend || prices.marketTrend || "MIXED";
  const trendButtons = stockTrendOptionsV4(stock).map(item => (
    `<button class="stockTrendButton ${item.key === trendKey ? "active" : ""}" data-trend="${escapeHtml(item.key)}" onclick="selectStockTrend('${escapeJs(item.key)}')">${escapeHtml(item.label)}</button>`
  )).join("");
  const linkedFunding = stock.linkedFunding;
  const linkedText = s.linkedFundingCampaignId ? (linkedFunding?.title || "선택한 펀딩") : "연결 안 함";

  qs("adminStockBox").innerHTML = `
    <div class="stockHeroV4">
      <div>
        <p class="small">오늘의 장세</p>
        <h2>${escapeHtml(stockTrendLabelV4(stock, trendKey))}</h2>
      </div>
      <div>
        <p class="small">현재가</p>
        <strong>${formatMoney(prices.currentPrice)}</strong>
      </div>
      <div>
        <p class="small">장 상태</p>
        <strong>${stockMarketLabel(s.marketOpen)}</strong>
      </div>
      <div>
        <p class="small">자동 갱신</p>
        <strong>${Math.max(1, stockNum(s.updateIntervalSeconds, 5))}초</strong>
      </div>
    </div>

    <div class="stockPanelV4">
      <div class="sectionHeadV4">
        <div>
          <h3>장세 선택</h3>
          <p class="small">장을 열 때 선택한 장세에 맞춰 자동 뉴스와 가격 흐름이 만들어집니다.</p>
        </div>
        <span class="badge blue">${escapeHtml(linkedText)}</span>
      </div>
      <div class="segmentedV4">${trendButtons}</div>
      <div class="buttonRowV4">
        <button class="green" onclick="openStockMarket()">장 열기</button>
        <button class="danger" onclick="closeStockMarket()">장 마감</button>
        <button class="secondary" onclick="loadAdminStock()">새로고침</button>
        <button class="blue" onclick="tickStockMarket()">가격 1회 갱신</button>
      </div>
    </div>

    <div class="stockPanelV4">
      <div class="sectionHeadV4"><h3>가격 그래프</h3><span class="badge">${m.direction || "보합 가능"}</span></div>
      <canvas id="adminStockChartV4" class="stockChart stockChartV4" width="720" height="260"></canvas>
      <div class="grid3 stockMetricGridV4">
        <div class="mini"><h3>매수가</h3><strong>${formatMoney(prices.buyPrice)}</strong></div>
        <div class="mini"><h3>매도가</h3><strong>${formatMoney(prices.sellPrice)}</strong></div>
        <div class="mini"><h3>예상 마감가</h3><strong>${formatMoney(m.expectedClosePrice ?? prices.currentPrice)}</strong></div>
      </div>
    </div>

    <div class="stockPanelV4">
      <h3>자동 뉴스</h3>
      ${renderAutoNewsV4(stock.news)}
    </div>

    <div class="stockPanelV4">
      <h3>운영 설정</h3>
      <div class="grid3">
        <div><label>현재 주가</label><input id="stockSetCurrentPrice" type="number" min="1" value="${s.currentPrice ?? 100}"></div>
        <div><label>가격 갱신 간격(초)</label><input id="stockSetUpdateIntervalSeconds" type="number" min="1" value="${s.updateIntervalSeconds ?? 5}"></div>
        <div><label>일일 등락 한도(%)</label><input id="stockSetDailyLimitRate" type="number" min="0" max="100" step="0.1" value="${stockRateInput(s.dailyLimitRate ?? 0.1)}"></div>
        <div><label>기본 스프레드</label><input id="stockSetBaseSpread" type="number" min="0" value="${s.baseSpread ?? 1}"></div>
        <div><label>급등/급락 스프레드</label><input id="stockSetVolatileSpread" type="number" min="0" value="${s.volatileSpread ?? 3}"></div>
        <div><label>장세 영향값</label><input id="stockSetTrendMoveStep" type="number" min="0" step="0.1" value="${s.trendMoveStep ?? 1}"></div>
        <div><label>거래량 반영 기준(주)</label><input id="stockSetTradeImpactShares" type="number" min="1" value="${s.tradeImpactShares ?? 10}"></div>
        <div><label>거래량 최대 반영값</label><input id="stockSetTradeImpactMaxMove" type="number" min="0" value="${s.tradeImpactMaxMove ?? 8}"></div>
        <div><label>순매수 1주당 반영값</label><input id="stockSetPriceWeight" type="number" min="0" step="0.1" value="${s.priceWeight ?? 1}"></div>
        <div><label>매수 수수료(%)</label><input id="stockSetBuyFeeRate" type="number" min="0" max="100" step="0.1" value="${stockRateInput(s.buyFeeRate ?? 0.05)}"></div>
        <div><label>매도 수수료(%)</label><input id="stockSetSellFeeRate" type="number" min="0" max="100" step="0.1" value="${stockRateInput(s.sellFeeRate ?? 0.05)}"></div>
        <div><label>수수료 처리</label><select id="stockSetFeeMode">
          <option value="split" ${s.feeMode === "split" ? "selected" : ""}>70% 소멸 + 30% 펀딩</option>
          <option value="funding" ${s.feeMode === "funding" ? "selected" : ""}>전액 펀딩</option>
          <option value="burn" ${s.feeMode === "burn" ? "selected" : ""}>전액 소멸</option>
          <option value="treasury" ${s.feeMode === "treasury" ? "selected" : ""}>학급 금고</option>
        </select></div>
        <div><label>연동할 펀딩</label><select id="stockSetLinkedFundingCampaignId">${fundingOptionsV4(stock)}</select></div>
      </div>
      <details class="stockAdvancedV4">
        <summary>고급 재고/한도 설정</summary>
        <div class="grid3">
          <div><label>시장 보유 주식</label><input id="stockSetMarketShares" type="number" min="0" value="${s.marketShares ?? 0}"></div>
          <div><label>교사 보유 주식</label><input id="stockSetTeacherShares" type="number" min="0" value="${s.teacherShares ?? 0}"></div>
          <div><label>거래소 보유금</label><input id="stockSetExchangeFund" type="number" min="0" value="${s.exchangeFund ?? 0}"></div>
          <div><label>1인 보유 한도</label><input id="stockSetPerStudentLimit" type="number" min="0" value="${s.perStudentLimit ?? 20}"></div>
          <div><label>최저 주가</label><input id="stockSetMinPrice" type="number" min="1" value="${s.minPrice ?? 1}"></div>
          <div><label>최고 주가</label><input id="stockSetMaxPrice" type="number" min="1" value="${s.maxPrice ?? 200}"></div>
        </div>
      </details>
      <label><input id="stockSetResetDay" type="checkbox" checked> 오늘 거래량 초기화</label>
      <label><input id="stockSetForceClose" type="checkbox"> 장 상태를 마감으로 변경</label>
      <button class="purple" onclick="updateStockSettings()">설정 저장</button>
    </div>

    <div class="stockPanelV4">
      <h3>수수료 현황</h3>
      <div class="grid3">
        <div class="mini"><h3>총 수수료</h3><strong>${formatMoney(s.stockFeeTotal || 0)}</strong></div>
        <div class="mini"><h3>소멸</h3><strong>${formatMoney(s.stockFeeBurned || 0)}</strong></div>
        <div class="mini"><h3>펀딩 적립</h3><strong>${formatMoney(s.stockFeeFunding || 0)}</strong></div>
      </div>
    </div>`;

  requestAnimationFrame(() => renderStockChartV4("adminStockChartV4", s.priceHistory, prices.currentPrice));
  startStockAutoTickV4(stock);
}

window.openStockMarket = async () => actionStatus("adminStockStatus", "openStockMarket", { marketTrend: currentSelectedStockTrendV4(stockLastAdminStockV4) }, loadAdminStock);
window.closeStockMarket = async () => {
  clearInterval(stockAutoTickTimerV4);
  stockAutoTickTimerV4 = null;
  await actionStatus("adminStockStatus", "closeStockMarket", {}, loadAdminStock);
};
window.tickStockMarket = async () => actionStatus("adminStockStatus", "tickStockMarket", {}, loadAdminStock);

window.updateStockSettings = async () => actionStatus("adminStockStatus", "updateStockSettings", {
  currentPrice: qs("stockSetCurrentPrice").value,
  marketTrend: currentSelectedStockTrendV4(stockLastAdminStockV4),
  updateIntervalSeconds: qs("stockSetUpdateIntervalSeconds").value,
  marketShares: qs("stockSetMarketShares").value,
  teacherShares: qs("stockSetTeacherShares").value,
  exchangeFund: qs("stockSetExchangeFund").value,
  perStudentLimit: qs("stockSetPerStudentLimit").value,
  priceWeight: qs("stockSetPriceWeight").value,
  trendMoveStep: qs("stockSetTrendMoveStep").value,
  tradeImpactShares: qs("stockSetTradeImpactShares").value,
  tradeImpactMaxMove: qs("stockSetTradeImpactMaxMove").value,
  dailyLimitRate: qs("stockSetDailyLimitRate").value,
  minPrice: qs("stockSetMinPrice").value,
  maxPrice: qs("stockSetMaxPrice").value,
  baseSpread: qs("stockSetBaseSpread").value,
  volatileSpread: qs("stockSetVolatileSpread").value,
  buyFeeRate: qs("stockSetBuyFeeRate").value,
  sellFeeRate: qs("stockSetSellFeeRate").value,
  feeMode: qs("stockSetFeeMode").value,
  linkedFundingCampaignId: qs("stockSetLinkedFundingCampaignId").value,
  resetDayCounters: qs("stockSetResetDay").checked,
  forceCloseMarket: qs("stockSetForceClose").checked
}, loadAdminStock);

function renderStudentStockV4(stock) {
  const s = stock.settings || {};
  const h = stock.holding || { shares: 0 };
  const m = stock.marketStats || {};
  const prices = getStockPrices(stock);
  const linkedFunding = stock.linkedFunding;
  const linkedProgress = stockFundingProgress(linkedFunding);

  qs("studentStockBox").innerHTML = `
    <div class="stockHeroV4">
      <div><p class="small">오늘의 장세</p><h2>${escapeHtml(stockTrendLabelV4(stock, s.marketTrend || "MIXED"))}</h2></div>
      <div><p class="small">현재가</p><strong>${formatMoney(prices.currentPrice)}</strong></div>
      <div><p class="small">내 보유</p><strong>${h.shares || 0}주</strong></div>
      <div><p class="small">장 상태</p><strong>${stockMarketLabel(s.marketOpen)}</strong></div>
    </div>
    <div class="stockPanelV4">
      <h3>실시간 가격 그래프</h3>
      <canvas id="studentStockChartV4" class="stockChart stockChartV4" width="720" height="260"></canvas>
      <div class="grid3 stockMetricGridV4">
        <div class="mini"><h3>매수가</h3><strong>${formatMoney(prices.buyPrice)}</strong><p class="small">수수료 ${stockRateText(prices.buyFeeRate)}</p></div>
        <div class="mini"><h3>매도가</h3><strong>${formatMoney(prices.sellPrice)}</strong><p class="small">수수료 ${stockRateText(prices.sellFeeRate)}</p></div>
        <div class="mini"><h3>마감 예상</h3><strong>${formatMoney(m.expectedClosePrice ?? prices.currentPrice)}</strong></div>
      </div>
    </div>
    <div class="stockPanelV4">
      <h3>자동 뉴스</h3>
      ${renderAutoNewsV4(stock.news)}
    </div>
    <div class="stockPanelV4">
      <h3>수수료 연동 펀딩</h3>
      ${linkedFunding ? `<p><b>${escapeHtml(linkedFunding.title)}</b> ${formatMoney(linkedFunding.currentAmount)} / ${formatMoney(linkedFunding.targetAmount)}</p><div class="progress"><div style="width:${linkedProgress}%"></div></div>` : '<p class="small">관리자가 펀딩을 연결하면 거래 수수료가 자동으로 반영됩니다.</p>'}
    </div>
    <div class="grid2">
      <div class="tradeBoxV4">
        <label>매수할 주식 수</label>
        <input id="buyShares" type="number" min="1" oninput="updateStockTradeEstimate()">
        <p class="small" id="buyStockEstimate">예상 결제금액: -</p>
        <button class="green stockActionButton" onclick="buyStock()">매수</button>
      </div>
      <div class="tradeBoxV4">
        <label>매도할 주식 수</label>
        <input id="sellShares" type="number" min="1" oninput="updateStockTradeEstimate()">
        <p class="small" id="sellStockEstimate">예상 수령금액: -</p>
        <button class="purple stockActionButton" onclick="sellStock()">매도</button>
      </div>
    </div>`;
  requestAnimationFrame(() => {
    renderStockChartV4("studentStockChartV4", s.priceHistory, prices.currentPrice);
    updateStockTradeEstimate();
  });
}

renderAdminStock = renderAdminStockV4;
renderStudentStock = renderStudentStockV4;
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

// Stock update v2: display-only helpers and safer student trade button handling.
var stockActionLockedV2 = false;

function stockNum(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function stockRateInput(value) {
  return Math.round(stockNum(value, 0) * 1000) / 10;
}

function stockRateText(value) {
  return `${stockRateInput(value)}%`;
}

function getStockPrices(stock) {
  const s = stock?.settings || {};
  const p = stock?.prices || {};
  const currentPrice = stockNum(p.currentPrice ?? s.currentPrice, 100);
  const spread = stockNum(p.spread ?? s.baseSpread, 1);
  return {
    currentPrice,
    buyPrice: stockNum(p.buyPrice, currentPrice + spread),
    sellPrice: stockNum(p.sellPrice, Math.max(1, currentPrice - spread)),
    spread,
    buyFeeRate: stockNum(p.buyFeeRate ?? s.buyFeeRate, 0.05),
    sellFeeRate: stockNum(p.sellFeeRate ?? s.sellFeeRate, 0.05),
    feeMode: p.feeMode || s.feeMode || "split"
  };
}

function stockFeePreview(amount, rate) {
  if (amount <= 0 || rate <= 0) return 0;
  return Math.max(1, Math.ceil(amount * rate));
}

function stockMarketLabel(status) {
  return status === "OPEN" ? "열림" : "마감";
}

function stockFeeModeLabel(mode) {
  const map = { burn: "소멸", treasury: "학급 금고", funding: "펀딩", split: "70% 소멸 + 30% 펀딩" };
  return map[mode] || mode || "-";
}

function stockFundingProgress(campaign) {
  if (!campaign) return 0;
  return Math.min(100, Math.floor(stockNum(campaign.currentAmount, 0) / Math.max(1, stockNum(campaign.targetAmount, 1)) * 100));
}

function renderStockChart(canvasId, history, fallbackPrice = 100) {
  const canvas = qs(canvasId);
  if (!canvas) return;
  const values = (Array.isArray(history) ? history : [])
    .map(v => Math.max(1, Math.round(stockNum(v, fallbackPrice))))
    .filter(v => Number.isFinite(v));
  if (!values.length) values.push(Math.max(1, Math.round(stockNum(fallbackPrice, 100))));

  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  const pad = 34;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "#e5e7eb";
  ctx.lineWidth = 1;
  for (let i = 0; i < 5; i += 1) {
    const y = pad + ((height - pad * 2) / 4) * i;
    ctx.beginPath();
    ctx.moveTo(pad, y);
    ctx.lineTo(width - pad, y);
    ctx.stroke();
  }

  const last = values.at(-1);
  const first = values[0];
  ctx.strokeStyle = last >= first ? "#2563eb" : "#b91c1c";
  ctx.lineWidth = 4;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  values.forEach((value, index) => {
    const x = values.length === 1 ? width / 2 : pad + ((width - pad * 2) * index) / (values.length - 1);
    const y = height - pad - ((value - min) / range) * (height - pad * 2);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  ctx.fillStyle = "#111827";
  ctx.font = "14px Arial";
  ctx.fillText(`${max.toLocaleString("ko-KR")}오구`, pad, 22);
  ctx.fillText(`${min.toLocaleString("ko-KR")}오구`, pad, height - 10);
  ctx.fillStyle = "#6b7280";
  ctx.fillText(`최근 ${values.length}회`, width - 96, height - 10);
}

function renderAdminStockV3(stock) {
  const s = stock.settings || {};
  const m = stock.marketStats || {};
  const prices = getStockPrices(stock);
  const recentTrades = stock.recentTrades || [];
  const campaigns = stock.fundingCampaigns || [];
  const linkedId = s.linkedFundingCampaignId || "";
  const linkedFunding = stock.linkedFunding || campaigns.find(c => c.campaignId === linkedId || c.id === linkedId);
  const linkedText = linkedId ? (linkedFunding?.title || "선택한 펀딩") : "연결 안 함";
  const net = stockNum(m.netBuy, 0);
  const netText = net > 0 ? `+${net}주` : `${net}주`;
  const closeReason = s.lastCloseAdminReason || s.lastCloseReason || "아직 마감 설명이 없어요.";
  const adminNews = stock.news || [];
  const fundingOptions = [
    `<option value="">펀딩 연결 안 함</option>`,
    ...campaigns.map(c => `<option value="${escapeHtml(c.campaignId || c.id)}" ${linkedId === (c.campaignId || c.id) ? "selected" : ""}>${escapeHtml(c.title)} (${formatMoney(c.currentAmount)} / ${formatMoney(c.targetAmount)})</option>`)
  ].join("");
  const adminNewsHtml = adminNews.length
    ? `<div class="tableWrap"><table><thead><tr><th>구분</th><th>제목</th><th>내용</th><th>등록시각</th><th>관리</th></tr></thead><tbody>${adminNews.map(n => `<tr><td>${n.type === "CLOSE_MARKET" ? "장마감" : "일반"}</td><td>${escapeHtml(n.title)}</td><td>${escapeHtml(n.body || "")}</td><td>${escapeHtml(n.createdAt || "")}</td><td><button class="danger smallBtn" onclick="deleteStockNews('${escapeJs(n.newsId || n.id)}')">삭제</button></td></tr>`).join("")}</tbody></table></div>`
    : '<p class="small">등록된 뉴스가 없어요.</p>';
  const tradesHtml = recentTrades.length
    ? `<div class="tableWrap"><table><thead><tr><th>시간</th><th>이름</th><th>종류</th><th>수량</th><th>가격</th><th>거래금액</th><th>수수료</th><th>보유 변화</th></tr></thead><tbody>${recentTrades.map(t => `<tr><td>${escapeHtml(t.timestamp)}</td><td>${escapeHtml(t.name || t.userId || "-")}</td><td>${escapeHtml(t.tradeType)}</td><td>${t.shares || 0}주</td><td>${formatMoney(t.price || 0)}</td><td>${formatMoney(t.total || 0)}</td><td>${formatMoney(t.fee || 0)}</td><td>${t.beforeShares ?? "-"} → ${t.afterShares ?? "-"}</td></tr>`).join("")}</tbody></table></div>`
    : '<p class="small">최근 거래가 없어요.</p>';

  qs("adminStockBox").innerHTML = `
    <div class="grid3">
      <div class="mini"><h3>현재가</h3><strong>${formatMoney(prices.currentPrice)}</strong></div>
      <div class="mini"><h3>학생 매수가</h3><strong>${formatMoney(prices.buyPrice)}</strong><p class="small">수수료 ${stockRateText(prices.buyFeeRate)}</p></div>
      <div class="mini"><h3>학생 매도가</h3><strong>${formatMoney(prices.sellPrice)}</strong><p class="small">수수료 ${stockRateText(prices.sellFeeRate)}</p></div>
      <div class="mini"><h3>장 상태</h3><strong>${stockMarketLabel(s.marketOpen)}</strong></div>
      <div class="mini"><h3>시장 보유 주식</h3><strong>${s.marketShares || 0}주</strong></div>
      <div class="mini"><h3>교사 보유</h3><strong>${s.teacherShares || 0}주</strong></div>
      <div class="mini"><h3>거래소 보유금</h3><strong>${formatMoney(s.exchangeFund)}</strong></div>
      <div class="mini"><h3>전체 순매수</h3><strong>${netText}</strong></div>
      <div class="mini"><h3>연동 펀딩</h3><strong>${escapeHtml(linkedText)}</strong></div>
    </div>
    <div class="mini stockChartPanel">
      <h3>주가 그래프</h3>
      <canvas id="adminStockChart" class="stockChart" width="720" height="260"></canvas>
    </div>
    <div class="mini">
      <h3>실시간 거래판</h3>
      <div class="grid3">
        <div class="mini"><h3>학생 매수/매도</h3><strong>${m.studentBuy || 0} / ${m.studentSell || 0}주</strong></div>
        <div class="mini"><h3>교사 매수/매도</h3><strong>${m.teacherBuy || 0} / ${m.teacherSell || 0}주</strong></div>
        <div class="mini"><h3>예상 마감가</h3><strong>${formatMoney(m.expectedClosePrice ?? prices.currentPrice)}</strong><p class="small">${escapeHtml(m.direction || "보합 가능")}</p></div>
      </div>
    </div>
    <div class="mini">
      <h3>수수료 현황</h3>
      <div class="grid3">
        <div class="mini"><h3>총 수수료</h3><strong>${formatMoney(s.stockFeeTotal || 0)}</strong></div>
        <div class="mini"><h3>소멸</h3><strong>${formatMoney(s.stockFeeBurned || 0)}</strong></div>
        <div class="mini"><h3>학급 금고</h3><strong>${formatMoney(s.stockFeeTreasury || 0)}</strong></div>
        <div class="mini"><h3>펀딩 적립</h3><strong>${formatMoney(s.stockFeeFunding || 0)}</strong></div>
        <div class="mini"><h3>처리 방식</h3><strong>${stockFeeModeLabel(s.feeMode)}</strong></div>
      </div>
    </div>
    <div class="mini"><h3>최근 장마감 설명</h3><p>${escapeHtml(closeReason)}</p></div>
    <button class="green" onclick="openStockMarket()">장 열기</button>
    <button class="danger" onclick="closeStockMarket()">장 마감</button>
    <button class="secondary" onclick="loadAdminStock()">거래판 새로고침</button>
    <div class="grid2">
      <div><label>교사 직접 매수</label><input id="teacherBuyShares" type="number" min="1"><button onclick="teacherBuyStock()">매수</button></div>
      <div><label>교사 직접 매도</label><input id="teacherSellShares" type="number" min="1"><button onclick="teacherSellStock()">매도</button></div>
    </div>
    <div class="mini">
      <h3>최근 거래 내역</h3>
      ${tradesHtml}
    </div>
    <div class="mini">
      <h3>뉴스 등록/삭제</h3>
      <div class="grid2">
        <div><label>뉴스 제목</label><input id="stockNewsTitle" placeholder="예: 오구 주식회사, 새로운 인기"></div>
        <div><label>뉴스 내용</label><input id="stockNewsBody" placeholder="학생들이 볼 짧은 시장 소식을 적어 주세요."></div>
      </div>
      <button class="green" onclick="addStockNews()">뉴스 등록</button>
      <h3 style="margin-top:14px;">현재 뉴스 목록</h3>
      ${adminNewsHtml}
    </div>
    <div class="mini">
      <h3>관리자 주식 설정</h3>
      <div class="grid3">
        <div><label>현재 주가</label><input id="stockSetCurrentPrice" type="number" min="1" value="${s.currentPrice ?? 100}"></div>
        <div><label>시장 보유 주식</label><input id="stockSetMarketShares" type="number" min="0" value="${s.marketShares ?? 0}"></div>
        <div><label>교사 보유 주식</label><input id="stockSetTeacherShares" type="number" min="0" value="${s.teacherShares ?? 0}"></div>
        <div><label>거래소 보유금</label><input id="stockSetExchangeFund" type="number" min="0" value="${s.exchangeFund ?? 0}"></div>
        <div><label>1인 보유 한도</label><input id="stockSetPerStudentLimit" type="number" min="0" value="${s.perStudentLimit ?? 20}"></div>
        <div><label>순매수 1주당 반영값</label><input id="stockSetPriceWeight" type="number" min="0" step="0.1" value="${s.priceWeight ?? 1}"></div>
        <div><label>일일 등락 한도(%)</label><input id="stockSetDailyLimitRate" type="number" min="0" max="100" step="0.1" value="${stockRateInput(s.dailyLimitRate ?? 0.1)}"></div>
        <div><label>최저 주가</label><input id="stockSetMinPrice" type="number" min="1" value="${s.minPrice ?? 1}"></div>
        <div><label>최고 주가</label><input id="stockSetMaxPrice" type="number" min="1" value="${s.maxPrice ?? 200}"></div>
        <div><label>매수/매도 가격 차이</label><input id="stockSetBaseSpread" type="number" min="0" value="${s.baseSpread ?? 1}"></div>
        <div><label>매수 수수료(%)</label><input id="stockSetBuyFeeRate" type="number" min="0" max="100" step="0.1" value="${stockRateInput(s.buyFeeRate ?? 0.05)}"></div>
        <div><label>매도 수수료(%)</label><input id="stockSetSellFeeRate" type="number" min="0" max="100" step="0.1" value="${stockRateInput(s.sellFeeRate ?? 0.05)}"></div>
        <div><label>수수료 처리</label><select id="stockSetFeeMode">
          <option value="split" ${s.feeMode === "split" ? "selected" : ""}>70% 소멸 + 30% 펀딩</option>
          <option value="funding" ${s.feeMode === "funding" ? "selected" : ""}>전액 펀딩</option>
          <option value="burn" ${s.feeMode === "burn" ? "selected" : ""}>전액 소멸</option>
          <option value="treasury" ${s.feeMode === "treasury" ? "selected" : ""}>학급 금고</option>
        </select></div>
        <div><label>연동할 펀딩</label><select id="stockSetLinkedFundingCampaignId">${fundingOptions}</select></div>
      </div>
      <label><input id="stockSetResetDay" type="checkbox" checked> 오늘 거래량 초기화</label>
      <label><input id="stockSetForceClose" type="checkbox"> 장 상태를 마감으로 변경</label>
      <button class="purple" onclick="updateStockSettings()">주식 설정 저장</button>
    </div>`;
  requestAnimationFrame(() => renderStockChart("adminStockChart", s.priceHistory, prices.currentPrice));
}

window.updateStockSettings = async () => actionStatus("adminStockStatus", "updateStockSettings", {
  currentPrice: qs("stockSetCurrentPrice").value,
  marketShares: qs("stockSetMarketShares").value,
  teacherShares: qs("stockSetTeacherShares").value,
  exchangeFund: qs("stockSetExchangeFund").value,
  perStudentLimit: qs("stockSetPerStudentLimit").value,
  priceWeight: qs("stockSetPriceWeight").value,
  dailyLimitRate: qs("stockSetDailyLimitRate").value,
  minPrice: qs("stockSetMinPrice").value,
  maxPrice: qs("stockSetMaxPrice").value,
  baseSpread: qs("stockSetBaseSpread").value,
  buyFeeRate: qs("stockSetBuyFeeRate").value,
  sellFeeRate: qs("stockSetSellFeeRate").value,
  feeMode: qs("stockSetFeeMode").value,
  linkedFundingCampaignId: qs("stockSetLinkedFundingCampaignId").value,
  resetDayCounters: qs("stockSetResetDay").checked,
  forceCloseMarket: qs("stockSetForceClose").checked
}, loadAdminStock);

function renderStudentStockV3(stock) {
  const s = stock.settings || {};
  const h = stock.holding || { shares: 0 };
  const m = stock.marketStats || {};
  const prices = getStockPrices(stock);
  const net = stockNum(m.netBuy, 0);
  const netText = net > 0 ? `+${net}주` : `${net}주`;
  const lastReason = s.lastCloseReason || "아직 장마감 설명이 없어요.";
  const linkedFunding = stock.linkedFunding;
  const linkedTitle = linkedFunding?.title || (s.linkedFundingCampaignId ? "관리자가 선택한 펀딩" : "연동된 펀딩 없음");
  const linkedProgress = stockFundingProgress(linkedFunding);
  const newsList = stock.news || [];
  const news = newsList.length
    ? `<div class="stockNewsBox"><h2>오늘의 오구 뉴스</h2>${newsList.map((n, idx) => `<div class="mini stockNewsItem"><b>${idx === 0 ? '<span class="badge red">NEW</span>' : ''}${escapeHtml(n.title)}</b><p>${escapeHtml(n.body || "")}</p><p class="small">${escapeHtml(n.createdAt || "")}</p></div>`).join("")}</div>`
    : '<div class="stockNewsBox"><h2>오늘의 오구 뉴스</h2><p class="small">등록된 뉴스가 없어요.</p></div>';

  qs("studentStockBox").innerHTML = `
    ${news}
    <div class="grid3">
      <div class="mini"><h3>현재가</h3><strong>${formatMoney(prices.currentPrice)}</strong></div>
      <div class="mini"><h3>매수가</h3><strong>${formatMoney(prices.buyPrice)}</strong><p class="small">수수료 ${stockRateText(prices.buyFeeRate)}</p></div>
      <div class="mini"><h3>매도가</h3><strong>${formatMoney(prices.sellPrice)}</strong><p class="small">수수료 ${stockRateText(prices.sellFeeRate)}</p></div>
      <div class="mini"><h3>장 상태</h3><strong>${stockMarketLabel(s.marketOpen)}</strong></div>
      <div class="mini"><h3>내 보유 주식</h3><strong>${h.shares || 0}주</strong></div>
      <div class="mini"><h3>보유 한도</h3><strong>${s.perStudentLimit ?? 20}주</strong></div>
    </div>
    <div class="mini stockChartPanel">
      <h3>실시간 주가 그래프</h3>
      <canvas id="studentStockChart" class="stockChart" width="720" height="260"></canvas>
    </div>
    <div class="mini">
      <h3>오늘의 시장 분위기</h3>
      <div class="grid3">
        <div class="mini"><h3>전체 매수</h3><strong>${m.totalBuy || 0}주</strong></div>
        <div class="mini"><h3>전체 매도</h3><strong>${m.totalSell || 0}주</strong></div>
        <div class="mini"><h3>현재 순매수</h3><strong>${netText}</strong></div>
      </div>
      <p><b>마감 예상:</b> ${escapeHtml(m.direction || "보합 가능")} · 예상가 ${formatMoney(m.expectedClosePrice ?? prices.currentPrice)}</p>
    </div>
    <div class="mini">
      <h3>주식 수수료 펀딩 연결</h3>
      <p><b>${escapeHtml(linkedTitle)}</b></p>
      ${linkedFunding ? `<p>${formatMoney(linkedFunding.currentAmount)} / ${formatMoney(linkedFunding.targetAmount)}</p><div class="progress"><div style="width:${linkedProgress}%"></div></div>` : '<p class="small">관리자가 펀딩을 연결하면 거래 수수료가 자동으로 반영됩니다.</p>'}
      <p class="small">학생은 따로 펀딩 버튼을 누르지 않아도 매매 수수료가 자동 처리됩니다.</p>
    </div>
    <div class="mini"><h3>최근 주가 변화 이유</h3><p>${escapeHtml(lastReason)}</p></div>
    <div class="grid2">
      <div>
        <label>매수할 주식 수</label>
        <input id="buyShares" type="number" min="1" oninput="updateStockTradeEstimate()">
        <p class="small" id="buyStockEstimate">예상 결제금액: -</p>
        <button class="green stockActionButton" onclick="buyStock()">매수</button>
      </div>
      <div>
        <label>매도할 주식 수</label>
        <input id="sellShares" type="number" min="1" oninput="updateStockTradeEstimate()">
        <p class="small" id="sellStockEstimate">예상 수령금액: -</p>
        <button class="purple stockActionButton" onclick="sellStock()">매도</button>
      </div>
    </div>`;
  requestAnimationFrame(() => {
    renderStockChart("studentStockChart", s.priceHistory, prices.currentPrice);
    updateStockTradeEstimate();
  });
}

renderAdminStock = renderAdminStockV3;
renderStudentStock = renderStudentStockV3;

window.updateStockTradeEstimate = function() {
  const stock = latestStudentSummary?.stock;
  if (!stock) return;
  const prices = getStockPrices(stock);
  const buyQty = Math.max(0, Math.floor(stockNum(qs("buyShares")?.value, 0)));
  const sellQty = Math.max(0, Math.floor(stockNum(qs("sellShares")?.value, 0)));
  const buyAmount = prices.buyPrice * buyQty;
  const sellAmount = prices.sellPrice * sellQty;
  const buyFee = stockFeePreview(buyAmount, prices.buyFeeRate);
  const sellFee = stockFeePreview(sellAmount, prices.sellFeeRate);
  if (qs("buyStockEstimate")) {
    qs("buyStockEstimate").textContent = buyQty ? `예상 결제금액: ${formatMoney(buyAmount + buyFee)} (수수료 ${formatMoney(buyFee)})` : "예상 결제금액: -";
  }
  if (qs("sellStockEstimate")) {
    qs("sellStockEstimate").textContent = sellQty ? `예상 수령금액: ${formatMoney(Math.max(0, sellAmount - sellFee))} (수수료 ${formatMoney(sellFee)})` : "예상 수령금액: -";
  }
};

function setStockActionDisabled(disabled) {
  document.querySelectorAll(".stockActionButton").forEach(btn => { btn.disabled = disabled; });
}

async function runStockAction(fnName, data) {
  if (stockActionLockedV2) return;
  stockActionLockedV2 = true;
  setStockActionDisabled(true);
  try {
    await actionStatus("studentStockStatus", fnName, data, loadStudentSummary);
  } finally {
    stockActionLockedV2 = false;
    setStockActionDisabled(false);
  }
}

window.buyStock = async () => runStockAction("buyStock", { shares: qs("buyShares").value });
window.sellStock = async () => runStockAction("sellStock", { shares: qs("sellShares").value });

function renderStudentFundingHistoryV2(list) {
  const box = qs("studentFundingHistoryBox");
  if (!list.length) { box.innerHTML = '<p class="small">참여 기록이 없어요.</p>'; return; }
  box.innerHTML = `<div class="tableWrap"><table><thead><tr><th>시간</th><th>펀딩</th><th>금액</th><th>출처</th><th>환불</th></tr></thead><tbody>${list.map(c => `<tr><td>${escapeHtml(c.timestamp)}</td><td>${escapeHtml(c.title)}</td><td>${formatMoney(c.amount)}</td><td>${escapeHtml(c.sourceLabel || (c.source === "STOCK_FEE" ? "주식 수수료" : "직접 참여"))}</td><td>${c.refunded === "YES" ? "환불됨" : "-"}</td></tr>`).join("")}</tbody></table></div>`;
}

renderStudentFundingHistory = renderStudentFundingHistoryV2;

window.showLogTab = function(tab) {
  currentLogTab = tab;
  ["logs","wallet","money","stock","deposit","funding"].forEach(t => qs(`logTab${cap(t)}Btn`)?.classList.remove("active"));
  qs(`logTab${cap(tab)}Btn`)?.classList.add("active");
  if (!latestLogs) return;
  const configs = {
    logs: { headers:["시간","구분","사용자","권한","행동","결과","상세"], rows:(latestLogs.logs||[]).map(x=>[x.timestamp,x.category,x.userId,x.role,x.action,x.result,x.detail]) },
    wallet: { headers:["시간","학생","종류","금액","잔액 변화","대기금 변화","처리자","내용"], rows:(latestLogs.walletTransactions||[]).map(x=>[x.timestamp,x.userId,txTypeKo(x.txType),formatMoney(x.amount),`${formatMoney(x.beforeBalance)} → ${formatMoney(x.afterBalance)}`,`${formatMoney(x.beforePendingWithdrawal)} → ${formatMoney(x.afterPendingWithdrawal)}`,x.processedBy,x.note]) },
    money: { headers:["신청시간","처리시간","학생","종류","금액","상태","처리자"], rows:(latestLogs.moneyRequests||[]).map(x=>[x.requestedAt,x.processedAt,x.studentName,requestTypeKo(x.requestType),formatMoney(x.amount),x.status,x.processedBy]) },
    stock: { headers:["시간","사용자","종류","주식수","가격","거래금액","수수료","실제 금액","보유 변화"], rows:(latestLogs.stockTrades||[]).map(x=>[x.timestamp,x.name||x.userId,x.tradeType,`${x.shares}주`,formatMoney(x.price),formatMoney(x.total),formatMoney(x.fee || 0),formatMoney(x.netAmount ?? x.total),`${x.beforeShares??""} → ${x.afterShares??""}`]) },
    deposit: { headers:["시작","만기/처리","학생","상품","원금","상태","지급액","상세"], rows:(latestLogs.studentDeposits||[]).map(x=>[x.startAt,x.claimedAt||x.maturityAt,x.userName,x.productName,formatMoney(x.principal),x.status,formatMoney(x.payoutAmount),x.detail]) },
    funding: { headers:["시간","학생","펀딩","금액","출처","환불"], rows:(latestLogs.fundingContributions||[]).map(x=>[x.timestamp,x.userName,x.title,formatMoney(x.amount),x.sourceLabel || (x.source === "STOCK_FEE" ? "주식 수수료" : "직접 참여"),x.refunded]) }
  };
  renderLogTable(configs[tab]);
};

window.updateStockSettings = async () => actionStatus("adminStockStatus", "updateStockSettings", {
  currentPrice: stockSettingValueV4("stockSetCurrentPrice"),
  marketTrend: currentSelectedStockTrendV4(stockLastAdminStockV4),
  updateIntervalSeconds: stockSettingValueV4("stockSetUpdateIntervalSeconds"),
  marketShares: stockSettingValueV4("stockSetMarketShares"),
  teacherShares: stockSettingValueV4("stockSetTeacherShares"),
  exchangeFund: stockSettingValueV4("stockSetExchangeFund"),
  perStudentLimit: stockSettingValueV4("stockSetPerStudentLimit"),
  priceWeight: stockSettingValueV4("stockSetPriceWeight"),
  trendMoveStep: stockSettingValueV4("stockSetTrendMoveStep"),
  tradeImpactShares: stockSettingValueV4("stockSetTradeImpactShares"),
  tradeImpactMaxMove: stockSettingValueV4("stockSetTradeImpactMaxMove"),
  dailyLimitRate: stockSettingValueV4("stockSetDailyLimitRate"),
  minPrice: stockSettingValueV4("stockSetMinPrice"),
  maxPrice: stockSettingValueV4("stockSetMaxPrice"),
  baseSpread: stockSettingValueV4("stockSetBaseSpread"),
  volatileSpread: stockSettingValueV4("stockSetVolatileSpread"),
  buyFeeRate: stockSettingValueV4("stockSetBuyFeeRate"),
  sellFeeRate: stockSettingValueV4("stockSetSellFeeRate"),
  feeMode: stockSettingValueV4("stockSetFeeMode"),
  linkedFundingCampaignId: stockSettingValueV4("stockSetLinkedFundingCampaignId"),
  resetDayCounters: stockSettingCheckedV4("stockSetResetDay"),
  forceCloseMarket: stockSettingCheckedV4("stockSetForceClose")
}, loadAdminStock);

renderAdminStock = renderAdminStockV4;
renderStudentStock = renderStudentStockV4;

var stockStudentRefreshTimerFinalV4 = null;
var stockStudentRefreshBusyFinalV4 = false;
const renderStudentStockBaseFinalV4 = renderStudentStockV4;
const showStudentTabBaseFinalV4 = window.showStudentTab;

function stopStudentStockRefreshFinalV4() {
  clearInterval(stockStudentRefreshTimerFinalV4);
  stockStudentRefreshTimerFinalV4 = null;
}

function isStudentStockTabVisibleFinalV4() {
  const tab = qs("stockTab");
  return currentRole === "student" && tab && !tab.classList.contains("hidden");
}

function renderStudentStockLiveFinalV4(stock) {
  const buyValue = qs("buyShares")?.value ?? "";
  const sellValue = qs("sellShares")?.value ?? "";
  renderStudentStockBaseFinalV4(stock);
  if (buyValue && qs("buyShares")) qs("buyShares").value = buyValue;
  if (sellValue && qs("sellShares")) qs("sellShares").value = sellValue;
  updateStockTradeEstimate();
  startStudentStockRefreshFinalV4(stock);
}

async function refreshStudentStockOnlyFinalV4() {
  if (stockStudentRefreshBusyFinalV4 || !isStudentStockTabVisibleFinalV4()) return;
  const activeId = document.activeElement?.id || "";
  if (activeId === "buyShares" || activeId === "sellShares") return;
  stockStudentRefreshBusyFinalV4 = true;
  try {
    const res = await call("getStudentStockPanel", {});
    if (res?.stock) {
      latestStudentSummary = latestStudentSummary || {};
      latestStudentSummary.stock = res.stock;
      renderStudentStockLiveFinalV4(res.stock);
    }
  } catch {
    stopStudentStockRefreshFinalV4();
  } finally {
    stockStudentRefreshBusyFinalV4 = false;
  }
}

function startStudentStockRefreshFinalV4(stock) {
  stopStudentStockRefreshFinalV4();
  if (!stock || !isStudentStockTabVisibleFinalV4() || stock.settings?.marketOpen !== "OPEN") return;
  const seconds = Math.max(5, Math.floor(stockNum(stock.settings.updateIntervalSeconds, 5)));
  stockStudentRefreshTimerFinalV4 = setInterval(refreshStudentStockOnlyFinalV4, seconds * 1000);
}

window.showStudentTab = function(tab) {
  const result = showStudentTabBaseFinalV4(tab);
  if (tab === "stock") startStudentStockRefreshFinalV4(latestStudentSummary?.stock);
  else stopStudentStockRefreshFinalV4();
  return result;
};

renderStudentStock = renderStudentStockLiveFinalV4;
