import { db } from "../shared/firebase-config.js";
import { collection, onSnapshot, query, orderBy } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// DOM Elements
const tbody = document.getElementById("explorer-table-body");
const statTotal = document.getElementById("stat-total-reports");
const statResolved = document.getElementById("stat-resolved");
const statActive = document.getElementById("stat-active");
const statDismissed = document.getElementById("stat-dismissed");
const searchInput = document.getElementById("searchInput");
const resultsCount = document.getElementById("results-count");

let allReportsList = [];

// Helper to escape HTML characters
function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Convert Firestore Timestamps or JS Dates into a relative "time ago" string
function timeAgo(dateInput) {
    if (!dateInput) return "Unknown";
    
    const date = dateInput.toDate ? dateInput.toDate() : new Date(dateInput);
    if (isNaN(date.getTime())) return "Unknown";

    const seconds = Math.floor((new Date() - date) / 1000);
    
    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + " yrs ago";
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + " mos ago";
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + " days ago";
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + " hrs ago";
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + " mins ago";
    return Math.floor(seconds) + " secs ago";
}

// Truncate Hedera HashScan URLs down to standard Tx Hash formats
function getTxHash(url) {
    if (url) {
        const parts = url.split('/');
        const id = parts[parts.length - 1];
        if (id && id.length > 5) {
           return id.substring(0, 15) + "..."; 
        }
    }
    return "Pending...";
}

// Determine tailwind styling based on report status
function getTypeBadgeStyles(status) {
    const s = (status || "").toLowerCase();
    if (s === "resolved") return "bg-emerald-50 text-emerald-700 border-emerald-200";
    if (s === "dismissed") return "bg-rose-50 text-rose-700 border-rose-200";
    if (s === "in progress" || s === "assigned") return "bg-blue-50 text-blue-700 border-blue-200";
    return "bg-amber-50 text-amber-700 border-amber-200"; 
}

// Render the Firestore data natively to the HTML Table
function renderExplorerTable(reports) {
    if (!tbody) return;

    if (reports.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="px-6 py-8 text-center text-slate-500 font-medium">No transactions found.</td></tr>`;
        return;
    }

    tbody.innerHTML = reports.map((report) => {
        const txHash = getTxHash(report.hashScanUrl);
        const timeStr = timeAgo(report.reportedAt);
        const badgeStyle = getTypeBadgeStyles(report.status);
        const locLine1 = report.barangay || "Unassigned";
        const locLine2 = report.location || report.city || "Quezon City";
        const severity = report.severityScore || 1;
        const wasteType = report.wasteType || "Mixed Waste";
        const statusDisplay = (report.status || "Pending").toUpperCase();

        return `
        <tr class="hover:bg-slate-50/50 transition-colors group cursor-pointer" onclick="if('${report.hashScanUrl}') window.open('${report.hashScanUrl}', '_blank')">
            
            <!-- TX HASH -->
            <td class="px-6 py-4 whitespace-nowrap">
                <div class="flex items-center gap-2">
                    <span class="text-slate-700 font-bold">${escapeHTML(txHash)}</span>
                    ${report.hashScanUrl ? `
                    <svg class="w-4 h-4 text-slate-400 group-hover:text-emerald-500 transition-colors" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
                    </svg>
                    ` : ''}
                </div>
            </td>

            <!-- TIME -->
            <td class="px-6 py-4 whitespace-nowrap text-slate-500 font-medium">
                ${timeStr}
            </td>

            <!-- REPORT ID -->
            <td class="px-6 py-4 whitespace-nowrap text-slate-500 font-mono text-xs">
                ${report.id}
            </td>

            <!-- REPORT STATUS -->
            <td class="px-6 py-4 whitespace-nowrap">
                <span class="inline-flex px-3 py-1 rounded-full text-[11px] font-bold border ${badgeStyle}">
                    ${escapeHTML(statusDisplay)}
                </span>
            </td>

            <!-- LOCATION -->
            <td class="px-6 py-4 whitespace-nowrap">
                <div class="flex flex-col">
                    <span class="text-slate-800 font-semibold">${escapeHTML(locLine1)}</span>
                    <span class="text-slate-500 text-xs truncate max-w-[180px]">${escapeHTML(locLine2)}</span>
                </div>
            </td>

            <!-- WASTE TYPE & SEVERITY -->
            <td class="px-6 py-4 whitespace-nowrap">
                <div class="flex flex-col">
                    <span class="text-slate-700 font-medium text-sm">${escapeHTML(wasteType)}</span>
                    <span class="text-xs" title="Severity ${severity}/5">${"⭐".repeat(severity)}</span>
                </div>
            </td>

            <!-- NETWORK HCS STATUS -->
            <td class="px-6 py-4 whitespace-nowrap">
                <span class="${report.hashScanUrl ? 'text-emerald-600 bg-emerald-50/50 border-emerald-100' : 'text-amber-600 bg-amber-50/50 border-amber-100'} font-bold text-[11px] px-2.5 py-1 rounded-md border uppercase tracking-wider">
                    ${report.hashScanUrl ? 'Confirmed' : 'Pending'}
                </span>
            </td>

            <!-- ACTIONS -->
            <td class="px-6 py-4 whitespace-nowrap text-right">
                <button class="text-slate-400 hover:text-slate-700 transition-colors p-1.5 rounded-lg hover:bg-slate-100">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                </button>
            </td>
        </tr>
        `;
    }).join('');
}

// Map the arrays accurately to fill out dynamic UI cards
function updateKPIs(reports) {
    if (statTotal) statTotal.textContent = reports.length;
    
    let resolved = 0, active = 0, dismissed = 0;
    reports.forEach(r => {
        const s = (r.status || "").toLowerCase();
        if (s === "resolved") resolved++;
        else if (s === "dismissed") dismissed++;
        else active++; // Groups Pending, In Progress, Assigned 
    });

    if (statResolved) statResolved.textContent = resolved;
    if (statActive) statActive.textContent = active;
    if (statDismissed) statDismissed.textContent = dismissed;
}

// Hook Firestore connection to initialize Dashboard state
export function initExplorer() {
    const reportsRef = collection(db, "reports");
    const q = query(reportsRef, orderBy("reportedAt", "desc")); 

    onSnapshot(q, (snapshot) => {
        allReportsList = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        updateKPIs(allReportsList);
        renderExplorerTable(allReportsList);
        
        if (resultsCount) {
             resultsCount.textContent = `Showing 1 to ${Math.min(10, allReportsList.length)} of ${allReportsList.length} results`;
             resultsCount.classList.remove("hidden");
        }
    }, (error) => {
        console.error("Error fetching reports for explorer:", error);
    });

    if (searchInput) {
        searchInput.addEventListener("input", (e) => {
            const term = e.target.value.toLowerCase();
            const filtered = allReportsList.filter(r => 
                (r.id || "").toLowerCase().includes(term) ||
                (r.barangay || "").toLowerCase().includes(term) ||
                (r.hashScanUrl || "").toLowerCase().includes(term) ||
                (r.location || "").toLowerCase().includes(term) ||
                (r.wasteType || "").toLowerCase().includes(term)
            );
            renderExplorerTable(filtered);
        });
    }
}

document.addEventListener("DOMContentLoaded", () => {
    initExplorer();
});