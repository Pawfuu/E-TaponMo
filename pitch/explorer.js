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
