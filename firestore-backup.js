import { initializeApp, getApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-functions.js";

const BACKUP_COLLECTIONS = [
  "users",
  "moneyRequests",
  "walletTransactions",
  "stockTrades",
  "studentDeposits",
  "depositProducts",
  "fundingCampaigns",
  "fundingContributions",
  "logs",
  "stockNews",
  "settings"
];

const firebaseApp = getApps().length ? getApp() : initializeApp(window.firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const functions = getFunctions(firebaseApp, window.functionsRegion || "asia-northeast3");

function qs(id) {
  return document.getElementById(id);
}

function setBackupStatus(message, type = "") {
  const el = qs("firestoreBackupStatus");
  if (!el) return;
  el.textContent = message || "";
  el.className = "status " + (type || "");
  el.classList.remove("hidden");
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function timestampForFile(date = new Date()) {
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function normalizeFirestoreValue(value) {
  if (value == null) return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalizeFirestoreValue);
  if (typeof value !== "object") return value;
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  if (typeof value.latitude === "number" && typeof value.longitude === "number") {
    return { latitude: value.latitude, longitude: value.longitude };
  }
  if (typeof value.path === "string" && value.firestore) return { path: value.path };
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalizeFirestoreValue(item)]));
}

async function requireAdminUser() {
  if (!auth.currentUser) throw new Error("관리자만 사용할 수 있습니다.");
  const getMyProfile = httpsCallable(functions, "getMyProfile");
  const res = await getMyProfile({});
  if (res?.data?.user?.role !== "admin") throw new Error("관리자만 사용할 수 있습니다.");
}

function downloadJsonFile(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

window.downloadFirestoreBackup = async function() {
  const btn = qs("firestoreBackupBtn");
  try {
    if (btn) btn.disabled = true;
    setBackupStatus("백업 중입니다. 잠시만 기다려 주세요.", "warn");
    await requireAdminUser();

    const backup = {
      backupMeta: {
        createdAt: new Date().toISOString(),
        appName: "오구반 금융센터",
        version: "firestore-json-backup-v1",
        collectionCounts: {},
        totalDocuments: 0
      },
      collections: {}
    };

    for (const collectionName of BACKUP_COLLECTIONS) {
      try {
        const snap = await getDocs(collection(db, collectionName));
        backup.collections[collectionName] = snap.docs.map(doc => ({
          id: doc.id,
          data: normalizeFirestoreValue(doc.data())
        }));
        backup.backupMeta.collectionCounts[collectionName] = snap.size;
        backup.backupMeta.totalDocuments += snap.size;
        setBackupStatus(`${collectionName}: ${snap.size}개 읽음`, "warn");
      } catch (err) {
        throw new Error(`${collectionName} 컬렉션 백업 실패: ${err?.message || err}`);
      }
    }

    const countText = Object.entries(backup.backupMeta.collectionCounts)
      .map(([name, count]) => `${name}: ${count}개`)
      .join(", ");
    downloadJsonFile(`ogu-firestore-backup-${timestampForFile()}.json`, backup);
    setBackupStatus(`백업이 완료되었습니다.\n${countText}`, "success");
  } catch (err) {
    const message = err?.message || String(err);
    setBackupStatus(message.includes("관리자만") ? "관리자만 사용할 수 있습니다." : message, "error");
  } finally {
    if (btn) btn.disabled = false;
  }
};

function injectBackupControls() {
  const logsTab = qs("adminLogsTab");
  if (!logsTab) return false;
  if (qs("firestoreBackupBox")) return true;

  const box = document.createElement("div");
  box.id = "firestoreBackupBox";
  box.className = "mini";
  box.innerHTML = `
    <h2>Firestore 데이터 백업</h2>
    <button id="firestoreBackupBtn" class="blue" onclick="downloadFirestoreBackup()">Firestore 데이터 백업 다운로드</button>
    <div id="firestoreBackupStatus" class="status hidden"></div>
  `;

  const status = qs("logsStatus");
  logsTab.insertBefore(box, status || logsTab.firstChild);
  return true;
}

function waitForAdminLogsTab() {
  if (injectBackupControls()) return;
  setTimeout(waitForAdminLogsTab, 300);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", waitForAdminLogsTab);
} else {
  waitForAdminLogsTab();
}
