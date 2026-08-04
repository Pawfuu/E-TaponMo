import { E_TAPON_TOPIC_ID } from "./user-app/js/hedera-config.js";
import { db } from "./shared/firebase-config.js";
import { collection, onSnapshot, query, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Helper function to format timestamp
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

// Function to generate pseudo transaction hash
function getTxHash(docId) {
    return "0x" + docId.substring(0, 10).toLowerCase();
}

// Function to map status to timeline color and labels
function getStatusDetails(status) {
    switch (status) {
        case "submitted":
            return { label: "Report Submitted", color: "text-[#208A56]", bg: "bg-[#208A56]" };
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

// DOM Elements
const transactionsTable = document.getElementById("blockchain-transactions-tbody");
const totalReportsMetric = document.getElementById("network-total-reports");

// Initialize listeners
function initBlockchainData() {
    const topicText = document.getElementById("network-topic-id");
    const topicLink = document.getElementById("network-hashscan-link");
    if (topicText) topicText.textContent = E_TAPON_TOPIC_ID;
    if (topicLink) topicLink.href = "https://hashscan.io/testnet/topic/" + E_TAPON_TOPIC_ID;
    const reportsRef = collection(db, "reports");

    onSnapshot(reportsRef, (snapshot) => {
        let allReports = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        // Sort descending by createdAt
        allReports.sort((a, b) => {
            const ta = a.createdAt ? (a.createdAt.toMillis ? a.createdAt.toMillis() : new Date(a.createdAt).getTime()) : 0;
            const tb = b.createdAt ? (b.createdAt.toMillis ? b.createdAt.toMillis() : new Date(b.createdAt).getTime()) : 0;
            return tb - ta;
        });

        // 1. Update Metrics
        if (totalReportsMetric) {
            totalReportsMetric.textContent = allReports.length.toLocaleString();
        }

        // 2. Update Transactions Table (Top 5)
        const recentReports = allReports.slice(0, 5);
        if (transactionsTable) {
            transactionsTable.innerHTML = "";
            recentReports.forEach(report => {
                const tr = document.createElement("tr");
                const details = getStatusDetails(report.status);
                const bgColorClass = details.bg.replace('bg-', 'bg-') + '/10';
                const borderColorClass = 'border-' + details.color.replace('text-', '') + '/20';

                tr.innerHTML = `
                    <td class="py-3.5 font-mono text-slate-500">${getTxHash(report.id)}...</td>
                    <td class="py-3.5">${details.label}</td>
                    <td class="py-3.5 text-center">
                        <span class="text-[9px] font-bold ${details.color} ${bgColorClass} px-2 py-0.5 rounded border ${borderColorClass}">
                            Confirmed
                        </span>
                    </td>
                    <td class="py-3.5 text-right text-slate-400">${formatTimeAgo(report.createdAt)}</td>
                `;
                transactionsTable.appendChild(tr);
            });
        }
    });
}

// Start fetching data
document.addEventListener("DOMContentLoaded", initBlockchainData);