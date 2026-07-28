import { db } from "../shared/firebase-config.js";
import { collection, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// DOM Elements
const statTotal = document.getElementById("stat-total-reports");
const statResolved = document.getElementById("stat-resolved");
const statActive = document.getElementById("stat-active");
const tableBody = document.getElementById("explorer-table-body");
const searchInput = document.getElementById("searchInput");
const noResultsDiv = document.getElementById("no-results");

// State
let allReports = [];

// Helper Functions
function formatTimeAgo(timestamp) {
    if (!timestamp) return "Just now";
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const seconds = Math.floor((new Date() - date) / 1000);
    
    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + " years ago";
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + " months ago";
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + " days ago";
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + " hrs ago";
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + " mins ago";
    return Math.floor(seconds) + " secs ago";
}

function getTxHash(docId) {
    return "0x" + docId.substring(0, 10).toLowerCase();
}

function getShortId(docId) {
    return docId.substring(0, 8).toUpperCase();
}

function getStatusDetails(status) {
    switch (status) {
        case "submitted":
            return { label: "Submitted", color: "text-[#208A56]", bg: "bg-[#208A56]" };
        case "in_progress":
            return { label: "In Progress", color: "text-amber-500", bg: "bg-amber-500" };
        case "resolved":
            return { label: "Resolved", color: "text-blue-500", bg: "bg-blue-500" };
        case "rejected":
            return { label: "Rejected", color: "text-red-500", bg: "bg-red-500" };
        default:
            return { label: "Pending", color: "text-slate-500", bg: "bg-slate-500" };
    }
}

// Render Function
function renderTable(data) {
    tableBody.innerHTML = "";
    
    if (data.length === 0) {
        noResultsDiv.classList.remove("hidden");
    } else {
        noResultsDiv.classList.add("hidden");
        
        data.forEach(report => {
            const tr = document.createElement("tr");
            tr.className = "hover:bg-slate-50 transition-colors";
            
            const txHash = getTxHash(report.id);
            const shortId = getShortId(report.id);
            const details = getStatusDetails(report.status);
            
            // Safely get location
            let locationName = "Unknown Location";
            if (typeof report.location === "string") {
                locationName = report.location;
            } else if (typeof report.location === "object" && report.location !== null) {
                locationName = report.location.display_name || report.location.address || report.location.name || "Map Pin Location";
            }
            
            // Limit location length
            if (locationName.length > 40) {
                locationName = locationName.substring(0, 40) + "...";
            }

            const bgColorClass = details.bg.replace('bg-', 'bg-') + '/10';
            const borderColorClass = 'border-' + details.color.replace('text-', '') + '/20';

            tr.innerHTML = `
                <td class="px-6 py-4 whitespace-nowrap font-mono text-slate-500">${txHash}</td>
                <td class="px-6 py-4 whitespace-nowrap text-slate-500">${formatTimeAgo(report.createdAt)}</td>
                <td class="px-6 py-4 whitespace-nowrap font-bold text-[#0A2517]">${shortId}</td>
                <td class="px-6 py-4 whitespace-nowrap text-slate-600 truncate max-w-[200px]" title="${locationName}">${locationName}</td>
                <td class="px-6 py-4 whitespace-nowrap text-center">
                    <span class="inline-flex items-center justify-center px-2.5 py-1 text-[10px] font-bold rounded-full ${details.color} ${bgColorClass} border ${borderColorClass}">
                        ${details.label}
                    </span>
                </td>
            `;
            tableBody.appendChild(tr);
        });
    }
}

// Initialize
// Dynamic Trend Helper Function
function updateTrendCard(type, currentCount, previousCount) {
    let percent = 0;
    let isUp = true;

    if (previousCount === 0) {
        percent = currentCount > 0 ? 100 : 0;
        isUp = currentCount >= 0;
    } else {
        percent = Math.round(((currentCount - previousCount) / previousCount) * 100);
        isUp = percent >= 0;
    }

    const pathEl = document.getElementById(`trend-path-${type}`);
    const circleEl = document.getElementById(`trend-circle-${type}`);
    const valEl = document.getElementById(`trend-val-${type}`);
    const iconEl = document.getElementById(`trend-icon-${type}`);

    if(!pathEl || !circleEl || !valEl || !iconEl) return;

    valEl.textContent = `${Math.abs(percent)}%`;

    if (isUp) {
        // Upward swoop
        pathEl.setAttribute("d", "M0,50 L0,40 Q30,45 60,25 T100,10 L100,50 Z");
        circleEl.setAttribute("cy", "10");
        iconEl.innerHTML = `<path stroke-linecap="round" stroke-linejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />`;
    } else {
        // Downward swoop
        pathEl.setAttribute("d", "M0,50 L0,15 Q30,10 60,30 T100,40 L100,50 Z");
        circleEl.setAttribute("cy", "40");
        iconEl.innerHTML = `<path stroke-linecap="round" stroke-linejoin="round" d="M13 17h8m0 0v-8m0 8l-8-8-4 4-6-6" />`;
    }
}

function initExplorer() {
    const reportsRef = collection(db, "reports");
    
    onSnapshot(reportsRef, (snapshot) => {
        allReports = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        // Sort descending by createdAt
        allReports.sort((a, b) => {
            const ta = a.createdAt ? (a.createdAt.toMillis ? a.createdAt.toMillis() : new Date(a.createdAt).getTime()) : 0;
            const tb = b.createdAt ? (b.createdAt.toMillis ? b.createdAt.toMillis() : new Date(b.createdAt).getTime()) : 0;
            return tb - ta;
        });

        // Compute Stats
        const resolvedCount = allReports.filter(r => r.status === "resolved").length;
        const activeCount = allReports.filter(r => r.status === "submitted" || r.status === "in_progress" || !r.status).length;
        
        if (statTotal) statTotal.textContent = allReports.length.toLocaleString();
        if (statResolved) statResolved.textContent = resolvedCount.toLocaleString();
        if (statActive) statActive.textContent = activeCount.toLocaleString();

        // Compute Dynamic Trends (Current 30 Days vs Prev 30 Days)
        const now = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
        const sixtyDaysAgo = new Date(now.getTime() - (60 * 24 * 60 * 60 * 1000));

        let curTotal = 0, prevTotal = 0;
        let curRes = 0, prevRes = 0;
        let curAct = 0, prevAct = 0;

        allReports.forEach(r => {
            const d = r.createdAt?.toDate ? r.createdAt.toDate() : new Date(r.createdAt);
            if (!d || isNaN(d)) return;
            
            const isRes = r.status === "resolved";
            const isAct = r.status === "submitted" || r.status === "in_progress" || !r.status;

            if (d >= thirtyDaysAgo) {
                curTotal++;
                if (isRes) curRes++;
                if (isAct) curAct++;
            } else if (d >= sixtyDaysAgo && d < thirtyDaysAgo) {
                prevTotal++;
                if (isRes) prevRes++;
                if (isAct) prevAct++;
            }
        });

        updateTrendCard('total', curTotal, prevTotal);
        updateTrendCard('resolved', curRes, prevRes);
        updateTrendCard('active', curAct, prevAct);

        // Initial Render
        filterAndRender();
    });

    // Search Listener
    if (searchInput) {
        searchInput.addEventListener("input", filterAndRender);
    }
}

function filterAndRender() {
    const query = (searchInput.value || "").toLowerCase().trim();
    
    if (!query) {
        renderTable(allReports);
        return;
    }

    const filtered = allReports.filter(report => {
        const txHash = getTxHash(report.id).toLowerCase();
        const shortId = getShortId(report.id).toLowerCase();
        const fullId = report.id.toLowerCase();
        
        return txHash.includes(query) || shortId.includes(query) || fullId.includes(query);
    });

    renderTable(filtered);
}

document.addEventListener("DOMContentLoaded", initExplorer);
