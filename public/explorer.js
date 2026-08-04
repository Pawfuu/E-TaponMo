import { db } from "./shared/firebase-config.js";
import { collection, onSnapshot, query, orderBy } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// ─── DOM Elements ─────────────────────────────────────────────────────────────
const tbody            = document.getElementById("explorer-table-body");
const statTotal        = document.getElementById("stat-total-reports");
const statResolved     = document.getElementById("stat-resolved");
const statActive       = document.getElementById("stat-active");
const statDismissed    = document.getElementById("stat-dismissed");
const searchInput      = document.getElementById("searchInput");
const paginationEl     = document.getElementById("pagination-container");

// ─── Pagination State ─────────────────────────────────────────────────────────
let currentPage    = 1;
const itemsPerPage = 10;
let allReportsList = [];
let activeList     = []; // The currently displayed list (full or filtered)

// ─── Toast Notification ───────────────────────────────────────────────────────
/**
 * Shows a brief bottom-right toast notification and auto-dismisses it.
 * @param {string} message - The text to display inside the toast.
 */
function showToast(message) {
    const container = document.getElementById("toast-container");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = "toast";
    toast.innerHTML = `
        <div class="toast-icon">
            <svg width="14" height="14" fill="none" stroke="#34D399" stroke-width="2.5" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
        </div>
        <span>${message}</span>
    `;

    container.appendChild(toast);

    // Trigger animation on next frame
    requestAnimationFrame(() => {
        requestAnimationFrame(() => toast.classList.add("show"));
    });

    // Auto-remove after 3.5 s
    setTimeout(() => {
        toast.classList.remove("show");
        toast.addEventListener("transitionend", () => toast.remove(), { once: true });
    }, 3500);
}

// ─── Placeholder Button Listeners ─────────────────────────────────────────────
const COMING_SOON_MSG = "This feature will be implemented on the next update.";

["btn-filters", "btn-open-map", "btn-view-leaders", "btn-view-analytics"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("click", () => showToast(COMING_SOON_MSG));
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
/** Escape HTML characters to prevent XSS when injecting user data. */
function escapeHTML(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

/** Convert Firestore Timestamps or JS Dates into a relative "time ago" string. */
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

/** Truncate a Hedera HashScan URL down to a short Tx Hash display string. */
function getTxHash(url) {
    if (url) {
        const parts = url.split('/');
        const id = parts[parts.length - 1];
        if (id && id.length > 5) return id.substring(0, 15) + "...";
    }
    return "Pending...";
}

/** Return Tailwind badge colour classes based on report status. */
function getTypeBadgeStyles(status) {
    const s = (status || "").toLowerCase();
    if (s === "resolved")                           return "bg-emerald-50 text-emerald-700 border-emerald-200";
    if (s === "dismissed")                          return "bg-rose-50 text-rose-700 border-rose-200";
    if (s === "in progress" || s === "assigned")    return "bg-blue-50 text-blue-700 border-blue-200";
    return "bg-amber-50 text-amber-700 border-amber-200";
}

// ─── Table Renderer ───────────────────────────────────────────────────────────
/**
 * Renders one page of the reports array into the table body.
 * Slices the array based on the current pagination state.
 * @param {Array} reports - The full (possibly filtered) list of reports to paginate.
 */
function renderExplorerTable(reports) {
    if (!tbody) return;

    if (reports.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="px-6 py-8 text-center text-slate-500 font-medium">No transactions found.</td></tr>`;
        return;
    }

    // Slice to the current page
    const start           = (currentPage - 1) * itemsPerPage;
    const end             = start + itemsPerPage;
    const paginatedReports = reports.slice(start, end);

    tbody.innerHTML = paginatedReports.map((report) => {
        const txHash        = getTxHash(report.hashScanUrl);
        const timeStr       = timeAgo(report.reportedAt);
        const badgeStyle    = getTypeBadgeStyles(report.status);
        const locLine1      = report.barangay || "Unassigned";
        const locLine2      = report.location || report.city || "Quezon City";
        const severity      = report.severityScore || 1;
        const wasteType     = report.wasteType || "Mixed Waste";
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

// ─── Pagination Renderer ──────────────────────────────────────────────────────
/**
 * Dynamically builds the pagination bar HTML (Prev, page numbers, Next, results count)
 * and injects it into #pagination-container.
 * @param {number} totalItems - Total number of items in the active list.
 */
function renderPagination(totalItems) {
    if (!paginationEl) return;

    const totalPages  = Math.max(1, Math.ceil(totalItems / itemsPerPage));
    const start       = totalItems === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
    const end         = Math.min(currentPage * itemsPerPage, totalItems);
    const isFirstPage = currentPage === 1;
    const isLastPage  = currentPage >= totalPages;

    // Build page-number buttons with ellipsis logic
    const pageButtons = buildPageButtons(totalPages);

    // Shared class strings
    const navBtnBase   = "px-4 py-2 border border-slate-200 bg-white rounded-lg text-slate-600 transition-colors flex items-center gap-2";
    const navBtnActive = "hover:bg-slate-50 cursor-pointer";
    const navBtnDisabled = "opacity-40 cursor-not-allowed";

    paginationEl.innerHTML = `
        <!-- Previous -->
        <button id="pg-prev"
            class="${navBtnBase} ${isFirstPage ? navBtnDisabled : navBtnActive}"
            ${isFirstPage ? "disabled" : ""}>
            <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/>
            </svg>
            Previous
        </button>

        <!-- Page Numbers -->
        <div class="flex items-center gap-1.5">
            ${pageButtons}
        </div>

        <!-- Next + Results Count -->
        <div class="flex items-center gap-4">
            <button id="pg-next"
                class="${navBtnBase} ${isLastPage ? navBtnDisabled : navBtnActive}"
                ${isLastPage ? "disabled" : ""}>
                Next
                <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/>
                </svg>
            </button>
            <span class="text-slate-400 hidden sm:block">
                Showing ${start} to ${end} of ${totalItems} results
            </span>
        </div>
    `;

    // Attach navigation event listeners
    document.getElementById("pg-prev")?.addEventListener("click", () => {
        if (currentPage > 1) {
            currentPage--;
            renderExplorerTable(activeList);
            renderPagination(activeList.length);
            window.scrollTo({ top: 0, behavior: "smooth" });
        }
    });

    document.getElementById("pg-next")?.addEventListener("click", () => {
        if (currentPage < totalPages) {
            currentPage++;
            renderExplorerTable(activeList);
            renderPagination(activeList.length);
            window.scrollTo({ top: 0, behavior: "smooth" });
        }
    });

    // Attach numbered page button listeners
    paginationEl.querySelectorAll("[data-page]").forEach(btn => {
        btn.addEventListener("click", () => {
            const page = parseInt(btn.dataset.page, 10);
            if (!isNaN(page) && page !== currentPage) {
                currentPage = page;
                renderExplorerTable(activeList);
                renderPagination(activeList.length);
                window.scrollTo({ top: 0, behavior: "smooth" });
            }
        });
    });
}

/**
 * Generates paginated page-number button HTML strings with smart ellipsis.
 * Always shows: first page, last page, current page ± 1, with "..." where gaps exist.
 * @param {number} totalPages
 * @returns {string} HTML string of page buttons
 */
function buildPageButtons(totalPages) {
    if (totalPages <= 1) return '';

    const activeCls  = "w-8 h-8 rounded-lg bg-[#0A2517] text-white font-bold text-xs flex items-center justify-center cursor-pointer";
    const normalCls  = "w-8 h-8 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 font-semibold text-xs flex items-center justify-center cursor-pointer transition-colors";
    const ellipsis   = `<span class="w-8 h-8 flex items-center justify-center text-slate-400 font-bold">…</span>`;

    // Determine which pages to show
    const pages = new Set([1, totalPages]);
    for (let p = Math.max(1, currentPage - 1); p <= Math.min(totalPages, currentPage + 1); p++) {
        pages.add(p);
    }
    const sorted = [...pages].sort((a, b) => a - b);

    let html = '';
    let prev = 0;
    for (const p of sorted) {
        if (p - prev > 1) html += ellipsis;
        const cls = p === currentPage ? activeCls : normalCls;
        html += `<button class="${cls}" data-page="${p}">${p}</button>`;
        prev = p;
    }
    return html;
}

// ─── KPI Cards ────────────────────────────────────────────────────────────────
/** Updates the 4 summary KPI cards from the full reports array. */
function updateKPIs(reports) {
    if (statTotal) statTotal.textContent = reports.length;

    let resolved = 0, active = 0, dismissed = 0;
    reports.forEach(r => {
        const s = (r.status || "").toLowerCase();
        if (s === "resolved")       resolved++;
        else if (s === "dismissed") dismissed++;
        else                        active++;   // Pending, In Progress, Assigned
    });

    if (statResolved)  statResolved.textContent  = resolved;
    if (statActive)    statActive.textContent     = active;
    if (statDismissed) statDismissed.textContent  = dismissed;
}

// ─── Main Init ────────────────────────────────────────────────────────────────
/** Hook Firestore real-time listener and wire up search to initialise the page. */
export function initExplorer() {
    const reportsRef = collection(db, "reports");
    const q          = query(reportsRef, orderBy("reportedAt", "desc"));

    onSnapshot(q, (snapshot) => {
        allReportsList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // Reset to page 1 on fresh data push
        currentPage  = 1;
        activeList   = allReportsList;

        updateKPIs(allReportsList);
        renderExplorerTable(activeList);
        renderPagination(activeList.length);
    }, (error) => {
        console.error("Error fetching reports for explorer:", error);
    });

    // Live search — resets pagination to page 1 on each keystroke
    if (searchInput) {
        searchInput.addEventListener("input", (e) => {
            const term = e.target.value.toLowerCase();
            activeList = allReportsList.filter(r =>
                (r.id          || "").toLowerCase().includes(term) ||
                (r.barangay    || "").toLowerCase().includes(term) ||
                (r.hashScanUrl || "").toLowerCase().includes(term) ||
                (r.location    || "").toLowerCase().includes(term) ||
                (r.wasteType   || "").toLowerCase().includes(term)
            );
            currentPage = 1;
            renderExplorerTable(activeList);
            renderPagination(activeList.length);
        });
    }
}

document.addEventListener("DOMContentLoaded", () => {
    initExplorer();
});