// ==========================================
// 1. IMPORTS & CONSTANTS
// ==========================================

/**
 * LGU Administrator Portal — live Firestore dashboard
 *
 * - Real-time dashboard powered by dashboard-service.js (onSnapshot listeners)
 * - View switching, search, sort, modal drill-down
 * - Status updates written back with updateDoc
 */

import { db } from "../shared/firebase-config.js";
import {
  doc,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { subscribeDashboard } from "./dashboard-service.js";
import { logReportOnChain } from "../user-app/js/hedera-logger.js";

(function () {
  "use strict";

  const STATUS_TO_UI = {
    pending: "Pending Verification",
    "in progress": "In Progress",
    in_progress: "In Progress",
    resolved: "Resolved",
    dismissed: "Dismissed",
  };

  const STATUS_TO_FIRESTORE = {
    "Pending Verification": "pending",
    "In Progress": "in_progress",
    Resolved: "resolved",
    Dismissed: "dismissed",
  };

  const PLACEHOLDER_IMAGE =
    "https://images.unsplash.com/photo-1530587191325-3db32d826c18?q=80&w=400&auto=format&fit=crop";

  // ==========================================
  // 2. UTILITY FUNCTIONS
  // ==========================================

  function normalizeStatus(rawStatus) {
    const key = String(rawStatus || "pending").trim().toLowerCase();
    return STATUS_TO_UI[key] || "Pending Verification";
  }

  function normalizeCategory(rawCategory) {
    if (!rawCategory) return "Uncategorized";
    const cat = String(rawCategory).trim().toLowerCase();

    // Mappings from the misaligned user-app values to match what the user chose
    const legacyMapping = {
      "organic": "Recyclable",
      "plastic": "Non-recyclable",
      "construction": "Hazardous Waste",
      "mixed": "Nabubulok"
    };

    if (legacyMapping[cat]) {
      return legacyMapping[cat];
    }

    // Capitalize first letter of category if it's already a clean string
    return rawCategory.charAt(0).toUpperCase() + rawCategory.slice(1);
  }

  function showToast(featureName, subtitle) {
    let container = document.getElementById("toast-container");
    if (!container) {
      container = document.createElement("div");
      container.id = "toast-container";
      container.className = "fixed bottom-5 right-5 z-[9999] flex flex-col gap-3";
      document.body.appendChild(container);
    }

    const subtext = subtitle || "This feature will be added in the next update.";

    const toast = document.createElement("div");
    toast.className = "flex items-center gap-3 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-xl text-sm font-medium transform transition-all duration-300 translate-y-10 opacity-0";
    toast.innerHTML = `
      <span class="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center text-emerald-400 flex-shrink-0">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
      </span>
      <div>
        <p class="font-bold text-slate-100">${featureName}</p>
        <p class="text-[10px] text-slate-400">${subtext}</p>
      </div>
    `;
    container.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.remove("translate-y-10", "opacity-0");
    });

    setTimeout(() => {
      toast.classList.add("translate-y-10", "opacity-0");
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // ==========================================
  // 3. GLOBAL STATE & DOM ELEMENTS
  // ==========================================

// NEW: Task Management State Variables
  let taskCurrentTab = 'all';
  let taskCurrentPriority = 'all';
  let taskSearchQuery = '';
  let taskCurrentPage = 1;
  const tasksPerPage = 7;

  let reports = [];
  let dashboardMetrics = null;
  let lastFilteredReports = [];
  let currentPage = 1;
  const itemsPerPage = 8;
  let selectedReport = null;
  let unsubscribeReports = null;

  // Map Variables
  let mapInstance = null;
  let markerLayerGroup = null;
  let dashboardMapInstance = null;
  let dashboardLayerGroup = null;
  let activeMapStatusFilter = "all";
  let activeMapCategoryFilter = "all";
  let showSeverityLow = true;
  let showSeverityMedium = true;
  let showSeverityHigh = true;
  let showMarkers = true;
  let heatLayer = null;
  let showHeatmap = false;

  // DOM Elements - Navigation
  const navDashboardBtn = document.getElementById("nav-dashboard");
  const navReportsBtn = document.getElementById("nav-reports");
  const navMapBtn = document.getElementById("nav-map");
  const navAnalyticsBtn = document.getElementById("nav-analytics");
  const navBarangayBtn = document.getElementById("nav-barangay");
  const navTasksBtn = document.getElementById("nav-tasks");
  const navRoutesBtn = document.getElementById("nav-routes");
  const navInsightsBtn = document.getElementById("nav-insights");
  const navSettingsBtn = document.getElementById("nav-settings");

  // DOM Elements - Panels
  const viewDashboardPanel = document.getElementById("view-dashboard-panel");
  const viewReportsPanel = document.getElementById("view-reports-panel");
  const viewMapPanel = document.getElementById("view-map-panel");
  const viewAnalyticsPanel = document.getElementById("view-analytics-panel");
  const viewBarangayPanel = document.getElementById("view-barangay-performance-panel");
  const viewTasksPanel = document.getElementById("view-task-management-panel");
  const viewRoutesPanel = document.getElementById("view-collection-routes-panel");
  const viewInsightsPanel = document.getElementById("view-ai-insights-panel");
  const viewSettingsPanel = document.getElementById("view-settings-panel");
  const viewLiveSyncPanel = document.getElementById("view-live-sync-panel");
  
  const viewTitle = document.getElementById("view-title");
  const mainHeader = document.getElementById("main-header");

  const statActiveEl = document.getElementById("stat-active");
  const statPendingEl = document.getElementById("stat-pending");
  const statProgressEl = document.getElementById("stat-progress");
  const statResolvedEl = document.getElementById("stat-resolved");

  const reportsTableBody = document.getElementById("reports-table-body");
  const reportSearchInput = document.getElementById("report-search-input");
  const sortSelect = document.getElementById("sort-select");
  const tableResultsCounter = document.getElementById("table-results-counter");

  const reportDetailModal = document.getElementById("report-detail-modal");
  const modalReportId = document.getElementById("modal-report-id");
  const modalCategory = document.getElementById("modal-category");
  const modalLocation = document.getElementById("modal-location");
  const modalSubmitter = document.getElementById("modal-submitter");
  const modalAiVolume = document.getElementById("modal-ai-volume");
  const modalSeverityScore = document.getElementById("modal-severity-score");
  const modalNotes = document.getElementById("modal-notes");
  const modalContactInfo = document.getElementById("modal-contact-info");
  const modalStatusBadge = document.getElementById("modal-status-badge");
  const modalStatusSelect = document.getElementById("modal-status-select");
  const modalReportImage = document.getElementById("modal-report-image");
  const dismissalReasonContainer = document.getElementById("dismissal-reason-container");
  const dismissalReasonInput = document.getElementById("dismissal-reason");
  const resolvedByContainer = document.getElementById("resolved-by-container");
  const resolvedByInput = document.getElementById("resolved-by-code");
  const assigneeContainer = document.getElementById("assignee-container");
  const assigneeInput = document.getElementById("assignee-code");
  const modalBlockchainUrl = document.getElementById("modal-blockchain-url");
  const blockchainUrlContainer = document.getElementById("modal-blockchain-url-container");

  const closeModalBtn = document.getElementById("close-modal-btn");
  const modalBtnCloseSecondary = document.getElementById("modal-btn-close-secondary");
  const modalBtnSave = document.getElementById("modal-btn-save");

  // ==========================================
  // 4. CORE & FIREBASE LOGIC
  // ==========================================

  function init() {
    setupEventListeners();
    updateDateDisplay();
    initLeafletMap();
    refreshMapSizes(100);
    subscribeToReports();

    // Listen for back/forward browser navigation
    window.addEventListener('popstate', () => {
      const urlParams = new URLSearchParams(window.location.search);
      const viewParam = urlParams.get("view") || "dashboard";
      switchView(viewParam, false); // false prevents pushing state again
    });

    const urlParams = new URLSearchParams(window.location.search);
    const viewParam = urlParams.get("view");
    if (viewParam && ["dashboard", "reports", "map", "analytics", "barangay-performance", "task-management", "collection-routes", "ai-insights", "settings"].includes(viewParam)) {
      switchView(viewParam, false);
    } else {
      switchView("dashboard", false);
    }

    window.addEventListener("beforeunload", () => {
      if (unsubscribeReports) unsubscribeReports();
    });
  }

  function refreshMapSizes(delay) {
    setTimeout(function () {
      if (window.mapInstance) window.mapInstance.invalidateSize();
      if (window.dashboardMapInstance) window.dashboardMapInstance.invalidateSize();
    }, delay);
  }

  function syncMapGlobals() {
    window.mapInstance = mapInstance;
    window.dashboardMapInstance = dashboardMapInstance;
  }

  function subscribeToReports() {
    unsubscribeReports = subscribeDashboard(
      (data) => {
        reports = data.reports || [];
        dashboardMetrics = data.metrics || null;

        updateDropdowns(reports);
        updateDashboardMetrics(reports);
        renderReportsTable();
        if (typeof updateRecentCriticalAlerts === "function") updateRecentCriticalAlerts();
        if (typeof renderMapMarkers === "function") renderMapMarkers();
        if (typeof updateAnalyticsMetrics === "function") updateAnalyticsMetrics();
        if (typeof renderBlockchainActivity === "function") renderBlockchainActivity(reports);

        renderBarangayPerformance();
        renderTaskManagement();

        // ADD THIS: Auto-center the map on the first successful data load
        if (!window.hasAutoCentered && window.recenterMap) {
          setTimeout(() => { 
            window.recenterMap(); 
            window.hasAutoCentered = true; 
          }, 600); // Slight delay ensures Leaflet has finished painting
        }

        if (selectedReport) {
          const fresh = reports.find((r) => r.docId === selectedReport.docId);
          if (fresh) {
            selectedReport = fresh;
            populateModal(fresh);
          }
        }
      },
      (error) => {
        console.error("DashboardService error:", error);
        if (statActiveEl) statActiveEl.textContent = "!";
        showToast("Sync Error", "Could not sync data from Firestore. Retrying...");
      }
      
    );
  }

  function updateDateDisplay() {
    const options = { weekday: "long", year: "numeric", month: "long", day: "numeric" };
    const dateEl = document.getElementById("header-date");
    if (dateEl) dateEl.textContent = new Date().toLocaleDateString("en-US", options);
  }

 function updateDropdowns(reportsList) {
    const categories = [
      "Nabubulok", "Recyclable", "Non-recyclable", 
      "Hazardous Waste", "Healthcare Waste", "Mixed Waste"
    ];
    
    // Hardcode explicit districts for consistent UI
    const districts = [
      "District 1", "District 2", "District 3", 
      "District 4", "District 5", "District 6", 
      "Provincial / Outside QC"
    ];

    // 1. Reports View Category Dropdown
    const reportsCatMenu = document.getElementById("reports-dropdown-category-menu");
    const reportsCatText = document.getElementById("reports-dropdown-category-text");
    if (reportsCatMenu) {
      reportsCatMenu.innerHTML = `<div class="px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 cursor-pointer transition-colors" data-value="all">All Categories</div>`;
      categories.forEach(cat => {
        const optionDiv = document.createElement("div");
        optionDiv.className = "px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 cursor-pointer transition-colors";
        optionDiv.dataset.value = cat;
        optionDiv.textContent = cat;
        reportsCatMenu.appendChild(optionDiv);
      });
      reportsCatMenu.querySelectorAll("div[data-value]").forEach(opt => {
        opt.addEventListener("click", (e) => {
          e.stopPropagation();
          currentCategoryFilter = e.target.dataset.value;
          if (reportsCatText) reportsCatText.textContent = e.target.textContent;
          reportsCatMenu.classList.add("hidden");
          currentPage = 1;
          renderReportsTable();
        });
      });
    }

    // 2. Reports View District Dropdown
    const reportsDistMenu = document.getElementById("reports-dropdown-district-menu");
    const reportsDistText = document.getElementById("reports-dropdown-district-text");
    if (reportsDistMenu) {
      reportsDistMenu.innerHTML = `<div class="px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 cursor-pointer transition-colors" data-value="all">All Districts</div>`;
      districts.forEach(dist => {
        const optionDiv = document.createElement("div");
        optionDiv.className = "px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 cursor-pointer transition-colors";
        optionDiv.dataset.value = dist; 
        optionDiv.textContent = dist.includes("District") ? `${dist} (QC)` : dist; 
        reportsDistMenu.appendChild(optionDiv);
      });
      reportsDistMenu.querySelectorAll("div[data-value]").forEach(opt => {
        opt.addEventListener("click", (e) => {
          e.stopPropagation();
          currentDistrictFilter = e.target.dataset.value;
          if (reportsDistText) reportsDistText.textContent = e.target.textContent;
          reportsDistMenu.classList.add("hidden");
          currentPage = 1;
          renderReportsTable();
        });
      });
    }

    // 3. Analytics View District Filter (Select Menu)
    const analyticsDistSelect = document.getElementById("analytics-district-filter");
    if (analyticsDistSelect) {
      const currentVal = analyticsDistSelect.value;
      analyticsDistSelect.innerHTML = `<option value="all">All Districts</option>`;
      districts.forEach(dist => {
        const opt = document.createElement("option");
        opt.value = dist;
        opt.textContent = dist.includes("District") ? `${dist} (QC)` : dist;
        analyticsDistSelect.appendChild(opt);
      });
      if (districts.includes(currentVal)) analyticsDistSelect.value = currentVal;
    }

    // 4. Map View Category Dropdown
    const mapCatMenu = document.getElementById("dropdown-category-menu");
    const mapCatText = document.getElementById("dropdown-category-text");
    if (mapCatMenu) {
      mapCatMenu.innerHTML = `<div class="px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 cursor-pointer transition-colors" data-value="all">All Categories</div>`;
      categories.forEach(cat => {
        const optionDiv = document.createElement("div");
        optionDiv.className = "px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 cursor-pointer transition-colors";
        optionDiv.dataset.value = cat;
        optionDiv.textContent = cat;
        mapCatMenu.appendChild(optionDiv);
      });
      mapCatMenu.querySelectorAll("div[data-value]").forEach(opt => {
        opt.addEventListener("click", (e) => {
          e.stopPropagation();
          activeMapCategoryFilter = e.target.dataset.value;
          if (mapCatText) mapCatText.textContent = e.target.textContent;
          mapCatMenu.classList.add("hidden");
          renderMapMarkers();
        });
      });
    }
  }

  function formatReportedAt(date) {
    if (!date) return "N/A";
    const options = { month: "short", day: "numeric" };
    const formattedDate = date.toLocaleDateString("en-US", options);

    let hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12;
    hours = hours ? hours : 12; // the hour '0' should be '12'
    const strMinutes = minutes < 10 ? "0" + minutes : minutes;

    return `${formattedDate}, ${hours}:${strMinutes} ${ampm}`;
  }

  function renderPaginationControls(totalPages) {
    const container = document.getElementById("pagination-controls");
    if (!container) return;
    container.innerHTML = "";

    if (totalPages <= 1) return; // Hide pagination if only 1 page

    // Helper to append a button
    function createPageBtn(label, pageNum, disabled = false, isActive = false) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.disabled = disabled;

      if (isActive) {
        btn.className = "px-2.5 py-1 text-xs font-bold rounded-lg border border-emerald-600 bg-emerald-50 text-emerald-800 transition-colors";
      } else if (disabled) {
        btn.className = "p-1 text-slate-300 pointer-events-none";
      } else {
        btn.className = "px-2.5 py-1 text-xs font-medium rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors cursor-pointer";
      }

      btn.innerHTML = label;
      if (!disabled) {
        btn.addEventListener("click", () => {
          currentPage = pageNum;
          renderReportsTable();
        });
      }
      return btn;
    }

    // Previous button
    const prevBtn = createPageBtn(
      `<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" /></svg>`,
      currentPage - 1,
      currentPage === 1
    );
    container.appendChild(prevBtn);

    // Calculate page range to show
    let range = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) range.push(i);
    } else {
      if (currentPage <= 4) {
        range = [1, 2, 3, 4, 5, "...", totalPages];
      } else if (currentPage >= totalPages - 3) {
        range = [1, "...", totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
      } else {
        range = [1, "...", currentPage - 1, currentPage, currentPage + 1, "...", totalPages];
      }
    }

    // Render page buttons
    range.forEach(item => {
      if (item === "...") {
        const dot = document.createElement("span");
        dot.className = "px-1 text-slate-400 font-bold select-none text-xs";
        dot.textContent = "...";
        container.appendChild(dot);
      } else {
        const pageBtn = createPageBtn(item.toString(), item, false, item === currentPage);
        container.appendChild(pageBtn);
      }
    });

    // Next button
    const nextBtn = createPageBtn(
      `<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" /></svg>`,
      currentPage + 1,
      currentPage === totalPages
    );
    container.appendChild(nextBtn);
  }

  function exportToCSV() {
    const dataToExport = lastFilteredReports.length > 0 ? lastFilteredReports : reports;
    if (dataToExport.length === 0) {
      showToast("Export Notice", "No reports available to export.");
      return;
    }

    // CSV Headers
    const headers = [
      "Report ID",
      "Category",
      "Location Address",
      "Latitude",
      "Longitude",
      "Status",
      "Priority",
      "Submitted By",
      "Contact Info",
      "AI Volume Estimate",
      "Severity Score",
      "Notes",
      "Reported At"
    ];

    // Convert rows to CSV strings
    const csvRows = [headers.join(",")];

    dataToExport.forEach(report => {
      let lat = "";
      let lng = "";
      if (report.coordinates) {
        if (report.coordinates.lat != null) lat = report.coordinates.lat;
        if (report.coordinates.lng != null) lng = report.coordinates.lng;
      }

      let priorityText = "Low";
      if (report.severity >= 4) {
        priorityText = "High";
      } else if (report.severity === 3) {
        priorityText = "Medium";
      }

      const row = [
        `#${report.id}`,
        report.category,
        report.location,
        lat,
        lng,
        report.status,
        priorityText,
        report.submittedBy,
        report.contactInfo,
        report.aiVolume,
        report.severity,
        report.notes,
        report.createdAt ? report.createdAt.toISOString() : "N/A"
      ];

      // Escape quotes and wrap cell values in double quotes
      const escapedRow = row.map(val => {
        const strVal = String(val == null ? "" : val).replace(/"/g, '""');
        return `"${strVal}"`;
      });
      csvRows.push(escapedRow.join(","));
    });

    // Create a blob and download it
    const csvString = csvRows.join("\n");
    const blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);

    link.setAttribute("href", url);
    link.setAttribute("download", `basura_pin_reports_${new Date().toISOString().slice(0, 10)}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function updateDashboardMetrics(reports) {
    // 1. Dashboard View Stats
    const activeCount = reports.filter((r) => r.status !== "Resolved").length; // Active non-resolved reports
    const criticalCount = reports.filter((r) => r.severity >= 4 && r.status !== "Resolved").length; // Active severity >= 4
    const pendingCount = reports.filter((r) => r.status === "Pending Verification").length;
    const resolvedCount = reports.filter((r) => r.status === "Resolved").length;
    const inProgressCount = reports.filter((r) => r.status === "In Progress").length;

    if (statActiveEl) statActiveEl.textContent = String(activeCount);
    if (statPendingEl) statPendingEl.textContent = String(pendingCount);
    if (statProgressEl) statProgressEl.textContent = String(criticalCount);
    if (statResolvedEl) statResolvedEl.textContent = String(resolvedCount);

    // 2. Dynamic Map View Stats (Active non-resolved alerts)
    const activeAlerts = reports.filter(r => r.status !== "Resolved");
    const totalActive = activeAlerts.length;

    // Calculate how many active reports were submitted TODAY
    const today = new Date();
    const newTodayCount = activeAlerts.filter(r => {
    if (!r.reportedAt) return false; // Changed from createdAt
    return r.reportedAt.getDate() === today.getDate() &&
        r.reportedAt.getMonth() === today.getMonth() &&
        r.reportedAt.getFullYear() === today.getFullYear();
    }).length;

    const activeValEl = document.getElementById("map-active-alerts-val");
    const newIndicatorEl = document.getElementById("map-active-new-indicator");

    if (activeValEl) activeValEl.textContent = String(totalActive);

    if (newIndicatorEl) {
      if (newTodayCount > 0) {
        newIndicatorEl.className = "text-[10px] font-bold text-emerald-600 mt-2 flex items-center gap-1";
        newIndicatorEl.innerHTML = `<span class="text-xs">↑</span> +${newTodayCount} new today`;
      } else {
        newIndicatorEl.className = "text-[10px] font-bold text-slate-400 mt-2 flex items-center gap-1";
        newIndicatorEl.innerHTML = `No new alerts today`;
      }
    }

    // Severity Breakdown
    const lowCount = activeAlerts.filter(r => r.severity <= 2).length;
    const mediumCount = activeAlerts.filter(r => r.severity === 3).length;
    const highCountMap = activeAlerts.filter(r => r.severity >= 4).length; // Both score 4 and 5 consolidated

    if (document.getElementById("map-severity-low-val")) document.getElementById("map-severity-low-val").textContent = String(lowCount);
    if (document.getElementById("map-severity-medium-val")) document.getElementById("map-severity-medium-val").textContent = String(mediumCount);
    if (document.getElementById("map-severity-high-val")) document.getElementById("map-severity-high-val").textContent = String(highCountMap);

    // Dynamic Map KPI Cards
    if (document.getElementById("map-kpi-total")) document.getElementById("map-kpi-total").textContent = String(reports.length);
    if (document.getElementById("map-kpi-pending")) document.getElementById("map-kpi-pending").textContent = String(pendingCount);
    if (document.getElementById("map-kpi-progress")) document.getElementById("map-kpi-progress").textContent = String(inProgressCount);
    if (document.getElementById("map-kpi-resolved")) document.getElementById("map-kpi-resolved").textContent = String(resolvedCount);
  }

  function updateTrendUI(elementId, current, previous, isPositiveGood) {
    const el = document.getElementById(elementId);
    if (!el) return;
    const container = el.parentElement;

    let percent = 0;
    if (previous > 0) {
      percent = Math.round(((current - previous) / previous) * 100);
    } else if (current > 0) {
      percent = 100;
    }

    // Cap percentage to 100% to keep analytics clean and understandable
    percent = Math.min(100, Math.max(-100, percent));

    let isBetter = false;
    if (current > previous) {
      isBetter = isPositiveGood;
    } else if (current < previous) {
      isBetter = !isPositiveGood;
    } else {
      container.className = "mt-3 flex items-center gap-1 text-[10px] font-semibold text-slate-500";
      el.textContent = `0%`;
      return;
    }

    const arrow = current > previous ? "↑" : "↓";
    const colorClass = isBetter ? "text-emerald-700" : "text-rose-700";

    container.className = `mt-3 flex items-center gap-1 text-[10px] font-semibold ${colorClass}`;
    el.textContent = `${arrow} ${Math.abs(percent)}%`;
  }

  function updateAnalyticsMetrics() {
   const dateFilterEl = document.getElementById("analytics-date-filter");
    const distFilterEl = document.getElementById("analytics-district-filter");
    
    const dateVal = dateFilterEl ? dateFilterEl.value : "7days";
    const distVal = distFilterEl ? distFilterEl.value : "all";

    const now = new Date();
    let filtered = [...reports];
    let prevFiltered = [];

    // 1. First, apply District Filter
    if (distVal !== "all") {
      filtered = filtered.filter(r => r.district === distVal);
    }

    // 2. Determine Date Ranges
    let currentStart = new Date();
    let prevStart = new Date();
    let prevEnd = new Date();

    let subtextLabel = "from last week";

    if (dateVal === "7days") {
      currentStart.setDate(now.getDate() - 7);
      currentStart.setHours(0, 0, 0, 0);
      prevStart.setDate(now.getDate() - 14);
      prevStart.setHours(0, 0, 0, 0);
      prevEnd.setDate(now.getDate() - 7);
      prevEnd.setHours(0, 0, 0, 0);
      subtextLabel = "from last week";
    } else if (dateVal === "30days") {
      currentStart.setDate(now.getDate() - 30);
      currentStart.setHours(0, 0, 0, 0);
      prevStart.setDate(now.getDate() - 60);
      prevStart.setHours(0, 0, 0, 0);
      prevEnd.setDate(now.getDate() - 30);
      prevEnd.setHours(0, 0, 0, 0);
      subtextLabel = "from last month";
    }

    // Execute Time Filtering
    if (dateVal !== "all") {
        prevFiltered = reports.filter(r => r.reportedAt && r.reportedAt >= prevStart && r.reportedAt < prevEnd);
        filtered = filtered.filter(r => r.reportedAt && r.reportedAt >= currentStart);
    } else {
        prevFiltered = [...reports]; // Fallback for all time
    }
    
    if (distVal !== "all" && dateVal !== "all") {
        prevFiltered = prevFiltered.filter(r => r.district === distVal);
    }

    // 3. Compute Metrics
    const totalCount = filtered.length;
    const resolvedCount = filtered.filter(r => r.status === "Resolved").length;
    const pendingCount = filtered.filter(r => r.status === "Pending Verification").length;

    const prevTotal = prevFiltered.length;
    const prevResolved = prevFiltered.filter(r => r.status === "Resolved").length;
    const prevPending = prevFiltered.filter(r => r.status === "Pending Verification").length;

    // Apply to UI
    if (document.getElementById("analytics-stat-total")) document.getElementById("analytics-stat-total").textContent = String(totalCount);
    if (document.getElementById("analytics-stat-resolved")) document.getElementById("analytics-stat-resolved").textContent = String(resolvedCount);
    if (document.getElementById("analytics-stat-pending")) document.getElementById("analytics-stat-pending").textContent = String(pendingCount);

    updateTrendUI("analytics-trend-total", totalCount, prevTotal, false); 
    updateTrendUI("analytics-trend-resolved", resolvedCount, prevResolved, true); 
    updateTrendUI("analytics-trend-pending", pendingCount, prevPending, false); 

    // Text Sublabels
    const subtextTotalEl = document.getElementById("analytics-subtext-total");
    if (subtextTotalEl) subtextTotalEl.textContent = subtextLabel;
    if (document.getElementById("analytics-subtext-resolved")) document.getElementById("analytics-subtext-resolved").textContent = subtextLabel;
    if (document.getElementById("analytics-subtext-pending")) document.getElementById("analytics-subtext-pending").textContent = subtextLabel;
    if (document.getElementById("analytics-subtext-time")) document.getElementById("analytics-subtext-time").textContent = subtextLabel;

    // Simulated Average Response Time Logic
    let avgTimeCurrent = totalCount > 0 ? Math.max(4, Math.round(10 + (pendingCount * 0.8))) : 18; 
    let avgTimePrev = prevTotal > 0 ? Math.max(4, Math.round(10 + (prevPending * 0.8))) : 20; 

    if (document.getElementById("analytics-stat-time")) {
      document.getElementById("analytics-stat-time").textContent = `${avgTimeCurrent}h`;
    }

    const timeDiff = avgTimeCurrent - avgTimePrev;
    const trendTimeEl = document.getElementById("analytics-trend-time");
    if (trendTimeEl) {
      const container = trendTimeEl.parentElement;
      if (timeDiff < 0) {
        container.className = "mt-3 flex items-center gap-1 text-[10px] font-semibold text-emerald-700";
        trendTimeEl.textContent = `↓ ${Math.abs(timeDiff)}h`;
      } else if (timeDiff > 0) {
        container.className = "mt-3 flex items-center gap-1 text-[10px] font-semibold text-rose-700";
        trendTimeEl.textContent = `↑ ${timeDiff}h`;
      } else {
        container.className = "mt-3 flex items-center gap-1 text-[10px] font-semibold text-slate-500";
        trendTimeEl.textContent = `0h change`;
      }
    }

    // Redraw Charts
    drawReportsOverTimeChart(filtered, dateVal);
    drawCategoryDonutChart(filtered);
    renderAnalyticsTopBarangays();
    animateAnalyticsRefresh();
  }

  function renderAnalyticsTopBarangays() {
    if (!dashboardMetrics || !dashboardMetrics.barangaySummary) return;

    const tbody = document.getElementById("analytics-top-barangays-tbody");
    const chartContainer = document.getElementById("analytics-avg-response-chart");
    if (!tbody || !chartContainer) return;

    // Get Top 5 by Total Reports
    const top5 = [...dashboardMetrics.barangaySummary].sort((a,b) => b.total - a.total).slice(0, 5);

    // 1. Populate Table
    tbody.innerHTML = "";
    if (top5.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" class="py-4 text-center text-xs text-slate-500 italic">No data available</td></tr>`;
    } else {
      top5.forEach(b => {
        tbody.innerHTML += `
          <tr class="hover:bg-slate-50 transition-colors">
            <td class="py-3 text-xs font-bold text-slate-800">${b.name}</td>
            <td class="py-3 text-right text-xs font-semibold text-slate-600">${b.total}</td>
            <td class="py-3 text-right text-xs font-semibold text-slate-600">${b.resolved}</td>
            <td class="py-3 text-right text-xs font-bold text-emerald-600">${b.rate}%</td>
          </tr>
        `;
      });
    }

    // 2. Populate Bar Chart (Simulating Response time dynamically)
    chartContainer.innerHTML = "";
    if (top5.length === 0) {
      chartContainer.innerHTML = `<div class="w-full text-center text-xs text-slate-500 italic flex items-center justify-center h-full">No data available</div>`;
    } else {
      const maxBarHeight = 120; // px
      let maxHours = 0;
      const chartData = top5.map(b => {
          const hours = b.total > 0 ? Math.max(2, Math.round(8 + (b.pending * 0.8))) : 0;
          if (hours > maxHours) maxHours = hours;
          return { name: b.name, hours: hours };
      });

      chartData.forEach(d => {
          const heightPx = maxHours > 0 ? (d.hours / Math.max(maxHours, 24)) * maxBarHeight : 0;
          const finalHeight = Math.max(heightPx, 10);
          const truncName = d.name.length > 8 ? d.name.substring(0,6) + '...' : d.name;

          chartContainer.innerHTML += `
            <div class="flex flex-col items-center gap-2 flex-1 group cursor-pointer" title="${d.name} (${d.hours}h avg)">
              <span class="text-slate-800 opacity-0 group-hover:opacity-100 transition-opacity font-bold">${d.hours}h</span>
              <div class="w-7 bg-emerald-600/90 rounded-t-lg transition-all duration-500 group-hover:bg-emerald-700" style="height: ${finalHeight}px;"></div>
              <span class="text-[9px] text-slate-400 truncate w-14 text-center uppercase tracking-wider">${truncName}</span>
            </div>
          `;
      });
    }
  }

  function renderBarangayPerformance() {
    if (!dashboardMetrics || !dashboardMetrics.barangaySummary) return;
    
    // Top KPI Cards
    if (document.getElementById("brgy-kpi-resolved")) document.getElementById("brgy-kpi-resolved").textContent = dashboardMetrics.resolved7d.toLocaleString();
    
    const mockHours = dashboardMetrics.totalReports > 0 ? Math.max(2, Math.round(10 + (dashboardMetrics.pendingReports * 0.5))) : 0;
    if (document.getElementById("brgy-kpi-response")) document.getElementById("brgy-kpi-response").textContent = `${mockHours}h`;
    
    if (document.getElementById("brgy-kpi-flagged")) {
      document.getElementById("brgy-kpi-flagged").innerHTML = `${dashboardMetrics.flaggedCount} <span class="text-sm font-normal text-slate-400">of ${dashboardMetrics.totalBarangays}</span>`;
    }

    // Ranked Board Table Body
    const tbody = document.getElementById("brgy-performance-tbody");
    if (!tbody) return;

    // --- NEW: APPLY FILTERS ---
    let filteredBrgy = [...dashboardMetrics.barangaySummary];

    if (activeBrgyDistrictFilter !== "all") {
        filteredBrgy = filteredBrgy.filter(b => b.district === activeBrgyDistrictFilter);
    }

    if (activeBrgySearchQuery) {
        filteredBrgy = filteredBrgy.filter(b => b.name.toLowerCase().includes(activeBrgySearchQuery.toLowerCase()));
    }

    let html = "";
    
    // Handle empty state gracefully
    if (filteredBrgy.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="py-10 text-center text-sm text-slate-500 font-semibold bg-slate-50/50">No barangays match your filter criteria.</td></tr>`;
        return;
    }

    filteredBrgy.forEach((b, index) => {
      const rank = index + 1;
      
      // Calculate 6-segment metrics
      const totalSeg = (b.segregation.nab + b.segregation.rec + b.segregation.non + b.segregation.mix + b.segregation.haz + b.segregation.heal) || 1;
      
      const pNab = (b.segregation.nab / totalSeg) * 100;
      const pRec = (b.segregation.rec / totalSeg) * 100;
      const pNon = (b.segregation.non / totalSeg) * 100;
      const pMix = (b.segregation.mix / totalSeg) * 100;
      const pHaz = (b.segregation.haz / totalSeg) * 100;
      const pHeal = (b.segregation.heal / totalSeg) * 100;

      const uiStatus = b.statusText === "Low" ? "Good" : b.statusText === "Medium" ? "Monitor" : "Critical";
      const badgeClass = b.statusText === "Low" ? "bg-emerald-100 text-emerald-700 border border-emerald-200" 
                        : b.statusText === "Medium" ? "bg-amber-100 text-amber-700 border border-amber-200" 
                        : "bg-rose-100 text-rose-700 border border-rose-200";

      const trendBars = b.history.map(val => {
          const h = val > 0 ? Math.max((val / Math.max(...b.history)) * 100, 20) : 10;
          return `<div class="w-1 bg-slate-300 rounded-t-sm" style="height: ${h}%" title="${val} reports"></div>`;
      }).join('');

      html += `
        <tr class="hover:bg-slate-50 transition-colors border-b border-slate-50">
          <td class="py-4 px-6 text-left text-xs font-bold text-slate-400">${rank}</td>
          <td class="py-4 px-6 text-left">
            <div class="font-bold text-slate-800 text-xs">${b.name}</div>
            <div class="text-[9px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">${b.district || 'QC'}</div>
          </td>
          <td class="py-4 px-6 text-center text-xs font-bold text-slate-700">${b.total}</td>
          <td class="py-4 px-6 text-center text-xs text-amber-600 font-bold">${b.pending}</td>
          <td class="py-4 px-6 text-center text-xs text-emerald-600 font-bold">${b.resolved}</td>
          <td class="py-4 px-6 text-center text-xs font-bold text-slate-800">${b.rate}%</td>
          <td class="py-4 px-6 text-center w-36">
            <div class="flex w-full h-1.5 rounded-full overflow-hidden bg-slate-100">
              <div style="width:${pNab}%; background: #10b981;"></div>
              <div style="width:${pRec}%; background: #3b82f6;"></div>
              <div style="width:${pNon}%; background: #b45309;"></div>
              <div style="width:${pMix}%; background: #64748b;"></div>
              <div style="width:${pHaz}%; background: #f59e0b;"></div>
              <div style="width:${pHeal}%; background: #ef4444;"></div>
            </div>
          </td>
          <td class="py-4 px-6 text-center">
             <div class="flex items-end justify-center h-4 gap-0.5 w-16 mx-auto">${trendBars}</div>
          </td>
          <td class="py-4 px-6 text-center">
            <span class="px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider ${badgeClass}">${uiStatus}</span>
          </td>
        </tr>
      `;
    });
    tbody.innerHTML = html;

    // Performance Score Gauge Sync
    const gaugeVal = document.getElementById("brgy-gauge-val");
    const gaugePath = document.getElementById("brgy-gauge-path");
    if (gaugeVal && gaugePath) {
      const dr = dashboardMetrics.cityDiversionRate || 0;
      gaugeVal.textContent = `${dr}%`;
      const offset = 125.6 - (125.6 * (dr / 100)); // 125.6 maps to SVG stroke dash scale
      gaugePath.style.strokeDashoffset = offset;
      gaugePath.style.stroke = dr > 75 ? '#16a34a' : dr > 50 ? '#f59e0b' : '#dc2626';
    }

    drawBarangayTrendChart();
  }

  function renderTaskManagement() {
    const tbody = document.getElementById('task-table-body');
    const counter = document.getElementById('task-table-results-counter');
    const pager = document.getElementById('task-pagination-controls');
    if (!tbody || !reports) return;

    // 1. Synthesize Tasks from live Reports
    let allTasks = reports.map((r, i) => {
      const sev = r.severity || 0;
      const upvotes = r.upvotes || 1;
      
      // Upvotes organically raise priority!
      let priority = 'Low';
      if (sev >= 4 || upvotes >= 10) priority = 'High';
      else if (sev === 3 || upvotes >= 5) priority = 'Medium';

      const targetDate = r.reportedAt ? new Date(r.reportedAt.getTime() + (48 * 60 * 60 * 1000)) : new Date();
      const ageMs = r.reportedAt ? (new Date() - r.reportedAt) : 0;
      
      let status = 'Planning';
      let isOverdue = false;
      if (r.status === 'Resolved') status = 'Completed';
      else if (r.status === 'In Progress') status = 'In Progress';
      else if (ageMs > (48 * 60 * 60 * 1000) && r.status === 'Pending Verification') { 
        status = 'Overdue'; 
        isOverdue = true; 
      }
      else status = 'Pending';

      // Simulate Assignees for realism for 'Pending' tasks
      const assignees = ["Juan Dela Cruz", "Maria Santos", "Pedro Garcia", "Ana Reyes", "Carlos Dizon"];
      const teams = ["Team A", "Team B", "Team C", "Team A", "Team D"];
      const hash = r.id.charCodeAt(0) % 5;

      let assignee = 'Unassigned';
      let team = 'Response Unit';
      
      if (status === 'Completed' && r.resolvedByCode) {
          assignee = `Verified: ${r.resolvedByCode.split(' ')[0]}`; // Clean Admin ID
          team = 'Admin Finalized';
      } else if (status === 'In Progress' && r.assignedToCode) {
          assignee = `${r.assignedToCode}`; // Clean Truck ID
          team = 'Active Deployment';
      } else if (status === 'In Progress' || status === 'Completed' || status === 'Pending') {
          assignee = assignees[hash];
          team = teams[hash];
      }

      return {
        id: `TSK-${new Date().getFullYear()}-${1000 + i}`,
        refId: r.id,
        docId: r.docId,
        title: r.category === 'Uncategorized' ? 'Waste Clearing' : `${r.category} Collection`,
        barangay: r.barangay,
        assignee: assignee,
        team: team,
        priority: priority,
        status: status,
        isOverdue: isOverdue,
        due: targetDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        rawDate: targetDate.getTime()
      };
    });

    // Update Top KPIs
    document.getElementById('task-stat-total').textContent = allTasks.length;
    document.getElementById('task-stat-assigned').textContent = allTasks.filter(t => t.status === 'In Progress').length;
    document.getElementById('task-stat-overdue').textContent = allTasks.filter(t => t.isOverdue).length;
    document.getElementById('task-stat-completed').textContent = allTasks.filter(t => t.status === 'Completed').length;

    // Update Tab Counts
    document.getElementById('task-count-all').textContent = `(${allTasks.length})`;
    document.getElementById('task-count-mine').textContent = `(${allTasks.filter(t => t.assignee === 'Maria Santos').length})`;
    document.getElementById('task-count-overdue').textContent = `(${allTasks.filter(t => t.isOverdue).length})`;
    document.getElementById('task-count-completed').textContent = `(${allTasks.filter(t => t.status === 'Completed').length})`;

    // 2. Apply Filters
    let list = [...allTasks];
    if (taskState.tab === 'mine') list = list.filter(t => t.assignee === 'Maria Santos');
    if (taskState.tab === 'overdue') list = list.filter(t => t.isOverdue);
    if (taskState.tab === 'completed') list = list.filter(t => t.status === 'Completed');

    if (taskState.status !== 'all') list = list.filter(t => t.status === taskState.status);
    if (taskState.priority !== 'all') list = list.filter(t => t.priority === taskState.priority);
    if (taskState.assignee !== 'all') list = list.filter(t => t.assignee === taskState.assignee);

    if (taskState.search.trim()) {
        const q = taskState.search.trim().toLowerCase();
        list = list.filter(t => t.title.toLowerCase().includes(q) || t.id.toLowerCase().includes(q) || t.barangay.toLowerCase().includes(q));
    }

    list.sort((a, b) => a.rawDate - b.rawDate);

    // 3. Render Table
    const totalPages = Math.max(1, Math.ceil(list.length / TASK_PAGE_SIZE));
    if (taskState.page > totalPages) taskState.page = totalPages;
    const start = (taskState.page - 1) * TASK_PAGE_SIZE;
    const pageItems = list.slice(start, start + TASK_PAGE_SIZE);

    tbody.innerHTML = '';
    const priorityStyle = { High: 'bg-rose-50 text-rose-600 border border-rose-100', Medium: 'bg-amber-50 text-amber-700 border border-amber-100', Low: 'bg-blue-50 text-blue-600 border border-blue-100' };
    const statusStyle = {
        Planning: { dot: 'bg-slate-400', pill: 'bg-slate-100 text-slate-600' },
        Assigned: { dot: 'bg-indigo-500', pill: 'bg-indigo-50 text-indigo-600' },
        Pending: { dot: 'bg-amber-500', pill: 'bg-amber-50 text-amber-700' },
        'In Progress': { dot: 'bg-blue-500', pill: 'bg-blue-50 text-blue-600' },
        Overdue: { dot: 'bg-rose-500', pill: 'bg-rose-50 text-rose-600' },
        Completed: { dot: 'bg-emerald-500', pill: 'bg-emerald-50 text-emerald-600' },
    };

    if (pageItems.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="px-5 py-10 text-center text-slate-400 text-xs font-semibold bg-slate-50/50">No tasks match your filters.</td></tr>`;
    } else {
        pageItems.forEach((t, i) => {
            const st = statusStyle[t.status] || statusStyle.Planning;
            // Extrapolate initials safely, handling "Ref: CODE" edge cases
            const initArr = t.assignee.replace('Ref: ', '').split(' ');
            const initials = initArr.map(w => w[0]).slice(0, 2).join('').toUpperCase() || 'NA';
            
            tbody.innerHTML += `
            <tr class="hover:bg-slate-50 transition-colors animate-table-row border-b border-slate-50" style="animation-delay: ${i * 30}ms;">
                <td class="px-5 py-3.5 font-mono text-[11px] text-slate-500 whitespace-nowrap">${t.id}</td>
                <td class="px-5 py-3.5">
                  <p class="font-semibold text-slate-800">${t.title}</p>
                </td>
                <td class="px-5 py-3.5 text-slate-600 text-xs font-semibold whitespace-nowrap">${t.barangay}</td>
                <td class="px-5 py-3.5">
                  <div class="flex items-center gap-2">
                    <span class="w-7 h-7 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center text-[10px] font-black flex-shrink-0">${initials}</span>
                    <div class="min-w-0">
                      <p class="font-semibold text-slate-800 text-xs truncate">${t.assignee}</p>
                      <p class="text-[10px] text-slate-400 truncate">${t.team}</p>
                    </div>
                  </div>
                </td>
                <td class="px-5 py-3.5">
                  <span class="text-[10px] font-bold px-2 py-1 rounded-full whitespace-nowrap ${priorityStyle[t.priority]}">${t.priority}</span>
                </td>
                <td class="px-5 py-3.5 text-slate-600 text-xs font-semibold whitespace-nowrap">${t.due}</td>
                <td class="px-5 py-3.5">
                  <span class="inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-1 rounded-full whitespace-nowrap ${st.pill}">
                    <span class="w-1.5 h-1.5 rounded-full ${st.dot}"></span>${t.status}
                  </span>
                </td>
                <td class="px-5 py-3.5 text-right">
                  <button onclick="window.openDetailModal('${t.docId}')" class="w-7 h-7 rounded-lg border border-slate-200 text-slate-400 hover:text-emerald-600 hover:border-emerald-300 transition-colors inline-flex items-center justify-center cursor-pointer">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 5v14m-7-7h14"/></svg>
                  </button>
                </td>
            </tr>`;
        });
    }

    if(counter) counter.textContent = list.length ? `Showing ${start + 1} to ${Math.min(start + TASK_PAGE_SIZE, list.length)} of ${list.length} tasks` : 'Showing 0 tasks';

    // Pagination render
    if (pager) {
        pager.innerHTML = '';
        if (totalPages > 1) {
            const mkBtn = (lbl, pg, active, disabled) => {
                const b = document.createElement('button');
                b.innerHTML = lbl; b.disabled = disabled;
                b.className = `w-7 h-7 rounded-lg text-xs font-bold flex items-center justify-center transition-colors ${active ? 'bg-emerald-600 text-white' : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-50'} ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`;
                if (!disabled) b.addEventListener('click', () => { taskState.page = pg; renderTaskManagement(); });
                return b;
            };
            pager.appendChild(mkBtn('‹', Math.max(1, taskState.page - 1), false, taskState.page === 1));
            for (let p = 1; p <= totalPages; p++) pager.appendChild(mkBtn(String(p), p, p === taskState.page, false));
            pager.appendChild(mkBtn('›', Math.min(totalPages, taskState.page + 1), false, taskState.page === totalPages));
        }
    }

    // 4. Update Assignee Dropdown Dynamically
    const assgnMenu = document.getElementById("dd-task-assignee-menu");
    if(assgnMenu && assgnMenu.children.length <= 1) {
        const uniques = [...new Set(allTasks.map(t => t.assignee))];
        assgnMenu.innerHTML = `<div class="dd-opt px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 cursor-pointer" data-value="all">All Assignees</div>`;
        uniques.forEach(v => {
            assgnMenu.innerHTML += `<div class="dd-opt px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 cursor-pointer" data-value="${v}">${v}</div>`;
        });
        
        assgnMenu.querySelectorAll('.dd-opt').forEach(opt => {
            opt.addEventListener('click', (e) => {
                e.stopPropagation();
                taskState.assignee = opt.dataset.value;
                document.getElementById('dd-task-assignee-text').textContent = opt.dataset.value === 'all' ? 'All Assignees' : opt.dataset.value;
                assgnMenu.classList.add('hidden');
                taskState.page = 1;
                renderTaskManagement();
            });
        });
    }

    // 5. Sidebar: Service Queue
    const brgyCounts = {};
    allTasks.filter(t => t.status !== 'Completed').forEach(t => {
      brgyCounts[t.barangay] = (brgyCounts[t.barangay] || 0) + 1;
    });
    
    const queueData = Object.keys(brgyCounts).map(k => ({ name: k, count: brgyCounts[k] })).sort((a,b) => b.count - a.count).slice(0, 5);
    const maxQueue = Math.max(...queueData.map(q => q.count), 1);
    
    const queueContainer = document.getElementById("service-queue-list");
    if(queueContainer) {
      queueContainer.innerHTML = queueData.length === 0 ? `<p class="text-xs text-slate-400 italic text-center py-4">Queue is empty.</p>` : "";
      queueData.forEach(q => {
        const pct = (q.count / maxQueue) * 100;
        let c = 'bg-emerald-500'; let tc = 'text-emerald-600';
        if(q.count > 10) { c = 'bg-rose-500'; tc = 'text-rose-600'; }
        else if(q.count > 5) { c = 'bg-amber-500'; tc = 'text-amber-600'; }

        queueContainer.innerHTML += `
          <div>
            <div class="flex items-center justify-between mb-1.5">
              <span class="text-xs font-bold text-slate-700">${q.name}</span>
              <span class="text-xs font-black ${tc}">${q.count}</span>
            </div>
            <div class="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div class="h-full ${c} rounded-full" style="width:${pct}%"></div>
            </div>
          </div>
        `;
      });
    }

    // 6. Sidebar: Donut Chart
    const statusCounts = { 'In Progress': 0, 'Pending': 0, 'Overdue': 0, 'Planning': 0 };
    allTasks.forEach(t => { if(statusCounts[t.status] !== undefined) statusCounts[t.status]++; });

    document.getElementById("task-donut-total").textContent = allTasks.length;
    const oData = [
      { label: 'In Progress', val: statusCounts['In Progress'], color: '#3b82f6' },
      { label: 'Pending', val: statusCounts['Pending'], color: '#f59e0b' },
      { label: 'Overdue', val: statusCounts['Overdue'], color: '#e11d48' },
      { label: 'Planning', val: statusCounts['Planning'], color: '#94a3b8' }
    ].filter(d => d.val > 0);

    if (donutEl && legendEl) {
      legendEl.innerHTML = oData.length === 0 ? `<p class="text-xs text-slate-400 italic py-4">No data</p>` : "";
      let cursor = 0;
      const stops = oData.map(o => {
          const startPct = (cursor / allTasks.length) * 100;
          cursor += o.val;
          const endPct = (cursor / allTasks.length) * 100;
          return `${o.color} ${startPct}% ${endPct}%`;
      }).join(', ');
      donutEl.style.background = `conic-gradient(${stops})`;

      oData.forEach(o => {
          const pct = Math.round((o.val / allTasks.length) * 100);
          legendEl.innerHTML += `
            <div class="flex items-center justify-between gap-2 mb-2.5">
              <span class="flex items-center gap-2 truncate">
                <span class="w-2.5 h-2.5 rounded-full flex-shrink-0" style="background:${o.color}"></span>
                <span class="truncate">${o.label}</span>
              </span>
              <span class="text-slate-400 font-semibold">${pct}%</span>
            </div>
          `;
      });
    }
  }

  function drawBarangayTrendChart() {
    const container = document.getElementById("brgy-trend-chart");
    if (!container || !dashboardMetrics) return;

    // Pull real-time data calculated by dashboard-service.js
    const labels = dashboardMetrics.trendLabels || [];
    const thisWeek = dashboardMetrics.trendThisWeek || [];
    const lastWeek = dashboardMetrics.trendLastWeek || [];

    if (labels.length === 0) {
        container.innerHTML = `<div class="flex h-full items-center justify-center text-xs text-slate-400 italic">No trend data available</div>`;
        return;
    }

    // Dynamic Sizing
    const width = container.clientWidth || 600;
    const height = container.clientHeight || 200;
    const paddingLeft = 35;
    const paddingRight = 15;
    const paddingTop = 30; 
    const paddingBottom = 25;

    const chartWidth = width - paddingLeft - paddingRight;
    const chartHeight = height - paddingTop - paddingBottom;

    // Find highest peak to scale the Y-Axis (minimum scale of 5)
    const maxVal = Math.max(...thisWeek, ...lastWeek, 5);

    const getX = (idx) => paddingLeft + (idx / (labels.length - 1)) * chartWidth;
    const getY = (val) => paddingTop + chartHeight - (val / maxVal) * chartHeight;

    let html = `
      <div class="absolute top-0 right-2 flex items-center gap-4 text-[10px] font-bold bg-white px-2 py-1">
        <span class="flex items-center gap-1.5 text-blue-600"><span class="w-2.5 h-2.5 rounded-full bg-blue-600"></span> This Week</span>
        <span class="flex items-center gap-1.5 text-emerald-600"><span class="w-2.5 h-2.5 rounded-full bg-emerald-600"></span> Last Week</span>
      </div>
      <svg width="100%" height="100%" viewBox="0 0 ${width} ${height}" class="overflow-visible">
    `;

    // 1. Grid Lines & Y-Axis Labels
    const gridLines = 4;
    for (let i = 0; i <= gridLines; i++) {
      const val = Math.round((i / gridLines) * maxVal);
      const y = getY(val);
      html += `
        <line x1="${paddingLeft}" y1="${y}" x2="${width - paddingRight}" y2="${y}" stroke="#f1f5f9" stroke-width="1.5" />
        <text x="${paddingLeft - 8}" y="${y + 4}" fill="#94a3b8" font-size="10" font-weight="600" text-anchor="end">${val}</text>
      `;
    }

    // 2. X-Axis Labels
    labels.forEach((label, idx) => {
      const x = getX(idx);
      html += `<text x="${x}" y="${height - 5}" fill="#94a3b8" font-size="10" font-weight="600" text-anchor="middle">${label}</text>`;
    });

    // 3. Path Builder Helper
    const buildPath = (data) => data.map((val, idx) => `${idx === 0 ? 'M' : 'L'} ${getX(idx)} ${getY(val)}`).join(" ");

    // 4. Draw Last Week Line & Nodes (Green)
    html += `<path d="${buildPath(lastWeek)}" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />`;
    lastWeek.forEach((val, idx) => {
        html += `<circle cx="${getX(idx)}" cy="${getY(val)}" r="4" fill="#10b981" stroke="#ffffff" stroke-width="1.5" />`;
    });

    // 5. Draw This Week Line & Nodes (Blue)
    html += `<path d="${buildPath(thisWeek)}" fill="none" stroke="#2563eb" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />`;
    thisWeek.forEach((val, idx) => {
        html += `<circle cx="${getX(idx)}" cy="${getY(val)}" r="4" fill="#2563eb" stroke="#ffffff" stroke-width="1.5" />`;
    });

    html += `</svg>`;
    container.innerHTML = html;
  }

  function animateAnalyticsRefresh() {
    const targets = [
      document.getElementById("analytics-stat-total"),
      document.getElementById("analytics-stat-resolved"),
      document.getElementById("analytics-stat-pending"),
      document.getElementById("analytics-line-chart-container"),
      document.getElementById("analytics-donut-chart"),
      document.getElementById("analytics-donut-legend")
    ];

    targets.forEach(el => {
      if (!el) return;
      el.style.transition = "transform 0.12s ease, opacity 0.12s ease";
      el.style.transform = "scale(0.97)";
      el.style.opacity = "0.5";
      setTimeout(() => {
        el.style.transform = "scale(1)";
        el.style.opacity = "1";
      }, 150);
    });
  }

function drawReportsOverTimeChart(filtered, dateVal) {
    const container = document.getElementById("analytics-line-chart-container");
    if (!container) return;
    container.innerHTML = "";

    const daysCount = dateVal === "30days" ? 30 : 7;
    const now = new Date();

    const days = [];
    for (let i = daysCount - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(now.getDate() - i);
      d.setHours(0, 0, 0, 0);
      days.push(d);
    }

    const reportsCounts = Array(daysCount).fill(0);
    const resolvedCounts = Array(daysCount).fill(0);

    filtered.forEach(r => {
      // FIXED: Using reportedAt instead of createdAt
      if (!r.reportedAt) return;
      const reportDate = new Date(r.reportedAt);
      reportDate.setHours(0, 0, 0, 0);

      const index = days.findIndex(d => d.getTime() === reportDate.getTime());
      if (index !== -1) {
        reportsCounts[index]++;
        if (r.status === "Resolved") {
          resolvedCounts[index]++;
        }
      }
    });

    const width = container.clientWidth || 500;
    const height = container.clientHeight || 250;
    const paddingLeft = 40;
    const paddingRight = 20;
    const paddingTop = 20;
    const paddingBottom = 40;

    const chartWidth = width - paddingLeft - paddingRight;
    const chartHeight = height - paddingTop - paddingBottom;

    const maxVal = Math.max(...reportsCounts, ...resolvedCounts, 5);

    const getX = (idx) => paddingLeft + (idx / (daysCount - 1)) * chartWidth;
    const getY = (val) => paddingTop + chartHeight - (val / maxVal) * chartHeight;

    let svgContent = `<svg width="100%" height="100%" viewBox="0 0 ${width} ${height}" class="overflow-visible">`;

    const gridLines = 4;
    for (let i = 0; i <= gridLines; i++) {
      const val = Math.round((i / gridLines) * maxVal);
      const y = getY(val);
      svgContent += `
        <line x1="${paddingLeft}" y1="${y}" x2="${width - paddingRight}" y2="${y}" stroke="#f1f5f9" stroke-width="1" />
        <text x="${paddingLeft - 10}" y="${y + 4}" fill="#94a3b8" font-size="10" font-weight="700" text-anchor="end">${val}</text>
      `;
    }

    const labelStep = daysCount === 30 ? 5 : 1;
    days.forEach((day, idx) => {
      if (idx % labelStep === 0) {
        const x = getX(idx);
        const dayLabel = day.toLocaleDateString("en-US", { month: "short", day: "numeric" });
        svgContent += `
          <text x="${x}" y="${height - 15}" fill="#94a3b8" font-size="10" font-weight="700" text-anchor="middle">${dayLabel}</text>
        `;
      }
    });

    const buildPath = (data) => {
      let d = "";
      data.forEach((val, idx) => {
        const x = getX(idx);
        const y = getY(val);
        d += (idx === 0) ? `M ${x} ${y}` : ` L ${x} ${y}`;
      });
      return d;
    };

    const reportsPath = buildPath(reportsCounts);
    svgContent += `
      <path d="${reportsPath}" fill="none" stroke="#2563eb" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
    `;

    if (daysCount === 7) {
      reportsCounts.forEach((val, idx) => {
        svgContent += `
          <circle cx="${getX(idx)}" cy="${getY(val)}" r="3.5" fill="#2563eb" stroke="#ffffff" stroke-width="1.5" />
        `;
      });
    }

    const resolvedPath = buildPath(resolvedCounts);
    svgContent += `
      <path d="${resolvedPath}" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
    `;

    if (daysCount === 7) {
      resolvedCounts.forEach((val, idx) => {
        svgContent += `
          <circle cx="${getX(idx)}" cy="${getY(val)}" r="3.5" fill="#10b981" stroke="#ffffff" stroke-width="1.5" />
        `;
      });
    }

    svgContent += `</svg>`;
    container.innerHTML = svgContent;
  }

  function drawCategoryDonutChart(filtered) {
    const donutEl = document.getElementById("analytics-donut-chart");
    const legendEl = document.getElementById("analytics-donut-legend");
    if (!donutEl || !legendEl) return;

    legendEl.innerHTML = "";
    if (filtered.length === 0) {
      donutEl.style.background = "#e2e8f0";
      legendEl.innerHTML = `<p class="text-xs text-slate-400 italic text-center py-4">No data available</p>`;
      return;
    }

    const counts = {};
    filtered.forEach(r => {
      const cat = r.category || "Uncategorized";
      counts[cat] = (counts[cat] || 0) + 1;
    });

    const items = Object.keys(counts).map(key => ({
      name: key,
      count: counts[key],
      pct: Math.round((counts[key] / filtered.length) * 100)
    }));
    items.sort((a, b) => b.count - a.count);

    let displayItems = [];
    if (items.length <= 4) {
      displayItems = items;
    } else {
      displayItems = items.slice(0, 3);
      const othersCount = items.slice(3).reduce((sum, item) => sum + item.count, 0);
      const othersPct = Math.round((othersCount / filtered.length) * 100);
      displayItems.push({ name: "Others", count: othersCount, pct: othersPct });
    }

    const colorPalette = ["#10b981", "#3b82f6", "#f59e0b", "#f97316", "#94a3b8"];

    let currentPct = 0;
    const gradientParts = [];

    displayItems.forEach((item, idx) => {
      const color = colorPalette[idx % colorPalette.length];
      item.color = color;

      const start = currentPct;
      currentPct += item.pct;
      gradientParts.push(`${color} ${start}% ${currentPct}%`);

      const row = document.createElement("div");
      row.className = "flex items-center justify-between";
      row.innerHTML = `
        <span class="flex items-center gap-2">
          <span class="w-2.5 h-2.5 rounded-full flex-shrink-0" style="background-color: ${color}"></span>
          <span class="truncate max-w-[120px]">${item.name}</span>
        </span>
        <span class="font-bold text-slate-800">${item.pct}%</span>
      `;
      legendEl.appendChild(row);
    });

    donutEl.style.background = `conic-gradient(${gradientParts.join(", ")})`;
  }

  // ==========================================
  // 5. MAP LOGIC
  // ==========================================

  function initLeafletMap() {
    if (!mapInstance && document.getElementById("lgu-map")) {
      mapInstance = L.map("lgu-map").setView([14.5995, 120.9842], 13);
      L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
        maxZoom: 19,
      }).addTo(mapInstance);
      markerLayerGroup = L.layerGroup().addTo(mapInstance);
    }

    if (!dashboardMapInstance && document.getElementById("lgu-dashboard-map")) {
      dashboardMapInstance = L.map("lgu-dashboard-map", { zoomControl: false }).setView([14.5995, 120.9842], 12);
      L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
        maxZoom: 19,
      }).addTo(dashboardMapInstance);
      dashboardLayerGroup = L.layerGroup().addTo(dashboardMapInstance);
    }

    syncMapGlobals();
  }

  function getReportLatLng(report) {
    const coords = report.coordinates;

    // Safely extract and convert string coordinates to actual floating-point numbers
    if (coords && coords.lat != null && coords.lng != null) {
      const parsedLat = parseFloat(coords.lat);
      const parsedLng = parseFloat(coords.lng);

      // Make sure the parsing actually resulted in valid numbers
      if (!isNaN(parsedLat) && !isNaN(parsedLng)) {
        return [parsedLat, parsedLng];
      }
    }

    if (Array.isArray(coords) && coords.length >= 2) {
      const parsedLat = parseFloat(coords[0]);
      const parsedLng = parseFloat(coords[1]);
      if (!isNaN(parsedLat) && !isNaN(parsedLng)) {
        return [parsedLat, parsedLng];
      }
    }

    // GPS Fallback to Manila center if everything else completely fails
    let hash = 0;
    for (let i = 0; i < report.id.length; i++) hash = report.id.charCodeAt(i) + ((hash << 5) - hash);
    const randomOffsetLat = (Math.abs(hash) % 100) / 15000;
    const randomOffsetLng = (Math.abs(hash >> 2) % 100) / 15000;
    return [14.5995 + randomOffsetLat, 120.9842 + randomOffsetLng];
  }

  function buildMarkerHtml(report) {
    let pinColorClass = "text-amber-500";
    let pulseHtml = "";

    // Evaluate Status First (Base Color)
    if (report.status === "Resolved") {
      pinColorClass = "text-slate-400";
    } else if (report.status === "In Progress") {
      pinColorClass = "text-blue-500";
      // If severe AND in progress -> Blue Pin, Blue Pulse
      if (report.severity >= 4) {
        pulseHtml = '<span class="absolute top-[10%] left-[20%] inline-flex h-[60%] w-[60%] rounded-full bg-blue-400 opacity-60 animate-ping"></span>';
      }
    } else {
      // Pending Verification
      if (report.severity >= 4) {
        // If severe AND pending -> Red Pin, Red Pulse
        pinColorClass = "text-rose-500";
        pulseHtml = '<span class="absolute top-[10%] left-[20%] inline-flex h-[60%] w-[60%] rounded-full bg-rose-400 opacity-60 animate-ping"></span>';
      } else {
        // If normal AND pending -> Amber Pin, no pulse
        pinColorClass = "text-amber-500";
      }
    }

    const svgIcon = `
      <svg class="relative z-10 w-full h-full drop-shadow-md ${pinColorClass}" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
      </svg>
    `;
    return '<div class="relative w-full h-full">' + pulseHtml + svgIcon + '</div>';
  }

  function getFilteredReportsForMap() {
    let list = [...reports];

    // 1. Status Filter
    if (activeMapStatusFilter !== "all") {
      list = list.filter(r => r.status === activeMapStatusFilter);
    }

    // 2. Category Filter
    if (activeMapCategoryFilter !== "all") {
      list = list.filter(r => r.category === activeMapCategoryFilter);
    }

    // 3. Severity Checkboxes
    list = list.filter(r => {
      if (r.severity >= 4) return showSeverityHigh;
      if (r.severity === 3) return showSeverityMedium;
      return showSeverityLow;
    });

    return list;
  }

  function updateHeatmap() {
    if (!mapInstance) return;
    if (heatLayer) {
      mapInstance.removeLayer(heatLayer);
      heatLayer = null;
    }

    if (showHeatmap) {
      const filteredForMap = getFilteredReportsForMap();
      const heatPoints = filteredForMap
        .map(r => {
          const latLng = getReportLatLng(r);
          return [latLng[0], latLng[1], r.severity / 5]; // lat, lng, intensity
        });

      if (typeof L.heatLayer === "function") {
        heatLayer = L.heatLayer(heatPoints, {
          radius: 35,
          blur: 20,
          max: 1.0
        }).addTo(mapInstance);
      } else {
        console.warn("Leaflet Heat plugin not loaded.");
      }
    }
  }

 function updateRecentCriticalAlerts() {
    const container = document.getElementById("recent-critical-alerts-container");
    if (!container) return;

    const criticalReports = reports
      .filter(r => r.severity >= 4 && r.status !== "Resolved")
      .sort((a, b) => {
        // FIXED: Using reportedAt instead of createdAt
        if (a.reportedAt && b.reportedAt) {
          return b.reportedAt.getTime() - a.reportedAt.getTime();
        }
        return b.docId.localeCompare(a.docId);
      });

    const top3 = criticalReports.slice(0, 3);
    container.innerHTML = "";

    if (top3.length === 0) {
      container.innerHTML = `<p class="text-xs text-slate-400 italic py-4 text-center">No active critical alerts.</p>`;
      return;
    }

    top3.forEach(report => {
      const card = document.createElement("div");
      card.className = "bg-white hover:bg-slate-50 border border-slate-200 p-3 rounded-xl shadow-sm transition-all flex items-start gap-3 cursor-pointer group mb-2.5";

      card.addEventListener("click", () => {
        openDetailModal(report.docId);
      });

      // FIXED: Using reportedAt instead of createdAt
      const timeStr = report.reportedAt ? report.reportedAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "N/A";
      const dateStr = report.reportedAt ? report.reportedAt.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";

      card.innerHTML = `
        <div class="w-10 h-10 rounded-lg overflow-hidden border border-slate-100 flex-shrink-0">
          <img src="${report.imageUrl || PLACEHOLDER_IMAGE}" class="w-full h-full object-cover group-hover:scale-105 transition-transform" />
        </div>
        <div class="min-w-0 flex-1">
          <div class="flex items-center justify-between gap-2">
            <h5 class="text-xs font-bold text-slate-800 truncate">${report.category}</h5>
            <span class="text-[9px] font-black uppercase text-rose-600 bg-rose-50 border border-rose-100/50 px-1.5 py-0.5 rounded">High</span>
          </div>
          <p class="text-[10px] text-slate-500 truncate mt-0.5">${report.location}</p>
          <p class="text-[9px] text-slate-400 font-medium mt-1">${dateStr} • ${timeStr}</p>
        </div>
      `;
      container.appendChild(card);
    });
  }

  function renderMapMarkers() {
    if (!markerLayerGroup && !dashboardLayerGroup) return;
    if (markerLayerGroup) markerLayerGroup.clearLayers();
    if (dashboardLayerGroup) dashboardLayerGroup.clearLayers();

    const mapReports = getFilteredReportsForMap();

    // Dynamically update the count of filtered alerts in the overlay card
    const activeValEl = document.getElementById("map-active-alerts-val");
    if (activeValEl) activeValEl.textContent = String(mapReports.length);

    // Render main map markers (filtered) only if showMarkers is true
    if (showMarkers) {
      mapReports.forEach((report) => {
        const latLng = getReportLatLng(report);
        const popupHtml = `
          <div class="text-sm space-y-2 p-1 min-w-[180px]">
            <p><strong>Report ID:</strong> ${report.id}</p>
            <p><strong>Severity:</strong> ${report.severity} / 5</p>
            <p><strong>Category:</strong> ${report.category}</p>
            <p><strong>Status:</strong> ${report.status}</p>
            <button type="button" onclick="window.openDetailModal('${report.docId}')" class="mt-2 w-full px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700">View Details</button>
          </div>
        `;

        if (markerLayerGroup) {
          const icon = L.divIcon({
            className: "bg-transparent border-0",
            html: buildMarkerHtml(report),
            iconSize: [32, 32],
            iconAnchor: [16, 32],
            popupAnchor: [0, -32],
          });
          const marker = L.marker(latLng, { icon });
          marker.bindPopup(popupHtml);
          markerLayerGroup.addLayer(marker);
        }
      });
    }
    

    // Render dashboard map markers (all reports)
    reports.forEach((report) => {
      const latLng = getReportLatLng(report);
      if (dashboardLayerGroup) {
        const dashboardIcon = L.divIcon({
          className: "bg-transparent border-0",
          html: buildMarkerHtml(report),
          iconSize: [32, 32],
          iconAnchor: [12, 24],
        });
        const dashboardMarker = L.marker(latLng, { icon: dashboardIcon, interactive: false });
        dashboardLayerGroup.addLayer(dashboardMarker);
      }
    });

    updateHeatmap();

    // Add this right below renderMapMarkers()
  window.recenterMap = function() {
    const mapReports = getFilteredReportsForMap();
    if (mapReports.length === 0) return;

    // Calculate a boundary box that includes all active report coordinates
    const bounds = L.latLngBounds(mapReports.map(r => getReportLatLng(r)));
    
    if (bounds.isValid()) {
      // Smoothly fly the map to fit all pins with a nice 50px padding
      if (window.mapInstance) {
        window.mapInstance.flyToBounds(bounds, { padding: [50, 50], maxZoom: 16 });
      }
      if (window.dashboardMapInstance) {
        window.dashboardMapInstance.flyToBounds(bounds, { padding: [20, 20], maxZoom: 16 });
      }
    }
  };
  }

  // ==========================================
  // 6. UI & NAVIGATION LOGIC
  // ==========================================

  function switchView(viewName, pushState = true) {
    const navButtons = [
      navDashboardBtn, navReportsBtn, navMapBtn, navAnalyticsBtn, 
      navBarangayBtn, navTasksBtn, navRoutesBtn, navInsightsBtn, navSettingsBtn
    ];

    // 1. Reset all buttons to inactive state
    navButtons.forEach((btn) => {
      if (btn) {
        btn.classList.remove("bg-emerald-50", "text-emerald-700", "border-emerald-500", "font-bold");
        btn.classList.add("text-slate-500", "border-transparent", "font-semibold");
      }
    });

    // 2. Hide all panels
    if (viewDashboardPanel) viewDashboardPanel.classList.add("hidden");
    if (viewReportsPanel) viewReportsPanel.classList.add("hidden");
    if (viewMapPanel) viewMapPanel.classList.add("hidden");
    if (viewAnalyticsPanel) viewAnalyticsPanel.classList.add("hidden");
    if (viewBarangayPanel) viewBarangayPanel.classList.add("hidden");
    if (viewTasksPanel) viewTasksPanel.classList.add("hidden");
    if (viewRoutesPanel) viewRoutesPanel.classList.add("hidden");
    if (viewInsightsPanel) viewInsightsPanel.classList.add("hidden");
    if (viewLiveSyncPanel) viewLiveSyncPanel.classList.add("hidden");

    // 3. Activate selected view and apply correct emerald highlights
    
    // Ensure the top header is ALWAYS visible across all pages
    if (mainHeader) mainHeader.classList.remove("hidden");

    if (viewName === "dashboard") {
      if (viewDashboardPanel) viewDashboardPanel.classList.remove("hidden");
      if (navDashboardBtn) navDashboardBtn.classList.add("bg-emerald-50", "text-emerald-700", "border-emerald-500", "font-bold");
      if (viewTitle) viewTitle.textContent = "Dashboard";
      updateDashboardMetrics(reports);
      initLeafletMap();
      renderMapMarkers();
      refreshMapSizes(100);
    } 
    else if (viewName === "reports") {
      if (viewReportsPanel) viewReportsPanel.classList.remove("hidden");
      if (navReportsBtn) navReportsBtn.classList.add("bg-emerald-50", "text-emerald-700", "border-emerald-500", "font-bold");
      if (viewTitle) viewTitle.textContent = "Civic Reports Database";
      renderReportsTable();
    } 
    else if (viewName === "map") {
      if (viewMapPanel) viewMapPanel.classList.remove("hidden");
      if (navMapBtn) navMapBtn.classList.add("bg-emerald-50", "text-emerald-700", "border-emerald-500", "font-bold");
      if (viewTitle) viewTitle.textContent = "Live Reports Map";
      initLeafletMap();
      if (typeof updateRecentCriticalAlerts === "function") updateRecentCriticalAlerts();
      renderMapMarkers();
      refreshMapSizes(100);
    } 
    else if (viewName === "analytics") {
      if (viewAnalyticsPanel) viewAnalyticsPanel.classList.remove("hidden");
      if (navAnalyticsBtn) navAnalyticsBtn.classList.add("bg-emerald-50", "text-emerald-700", "border-emerald-500", "font-bold");
      if (viewTitle) viewTitle.textContent = "Analytics Overview";
      updateAnalyticsMetrics();
    }
    else if (viewName === "barangay-performance") {
      if (viewBarangayPanel) viewBarangayPanel.classList.remove("hidden");
      if (navBarangayBtn) navBarangayBtn.classList.add("bg-emerald-50", "text-emerald-700", "border-emerald-500", "font-bold");
      if (viewTitle) viewTitle.textContent = "Barangay Performance";
    }
    else if (viewName === "task-management") {
      if (viewTasksPanel) viewTasksPanel.classList.remove("hidden");
      if (navTasksBtn) navTasksBtn.classList.add("bg-emerald-50", "text-emerald-700", "border-emerald-500", "font-bold");
      if (viewTitle) viewTitle.textContent = "Task Management";
    }
    else if (viewName === "live-sync") {
      if (viewLiveSyncPanel) viewLiveSyncPanel.classList.remove("hidden");
      // Highlight the parent Task Management nav button
      if (navTasksBtn) navTasksBtn.classList.add("bg-emerald-50", "text-emerald-700", "border-emerald-500", "font-bold");
      // Hide the global view title since this specific page has its own breadcrumb header
      if (mainHeader) mainHeader.classList.add("hidden"); 
    }
    else if (viewName === "collection-routes") {
      if (viewRoutesPanel) viewRoutesPanel.classList.remove("hidden");
      if (navRoutesBtn) navRoutesBtn.classList.add("bg-emerald-50", "text-emerald-700", "border-emerald-500", "font-bold");
      if (viewTitle) viewTitle.textContent = "Collection Routes";
    }
    else if (viewName === "ai-insights") {
      if (viewInsightsPanel) viewInsightsPanel.classList.remove("hidden");
      if (navInsightsBtn) navInsightsBtn.classList.add("bg-emerald-50", "text-emerald-700", "border-emerald-500", "font-bold");
      if (viewTitle) viewTitle.textContent = "AI Insights";
    }
    else if (viewName === "settings") {
      if (viewSettingsPanel) viewSettingsPanel.classList.remove("hidden");
      if (navSettingsBtn) navSettingsBtn.classList.add("bg-emerald-50", "text-emerald-700", "border-emerald-500", "font-bold");
      if (viewTitle) viewTitle.textContent = "Settings";
    }

    // Update URL history silently
    if (pushState) {
      window.history.pushState({ view: viewName }, '', `lgu.html?view=${viewName}`);
    }
  }

  // ==========================================
  // 7. REPORTS TABLE LOGIC
  // ==========================================

  // Track active sub-filter tab and dropdown states globally
  let currentStatusFilter = "all";
  let currentCategoryFilter = "all";
  let currentDistrictFilter = "all";
  let currentBarangayFilter = "all";
  let currentSortOrder = "date-desc"; // Default sorting by newest submitted time

let activeBrgyDistrictFilter = "all";
let activeBrgySearchQuery = "";

// NEW: Task Management State Variables
  let taskState = {
      tab: 'all',
      status: 'all',
      priority: 'all',
      assignee: 'all',
      search: '',
      page: 1,
  };
  const TASK_PAGE_SIZE = 7;

  function renderReportsTable() {
    if (!reportsTableBody) return;
    const queryText = reportSearchInput ? reportSearchInput.value.toLowerCase().trim() : "";

    // Update live sub-tab totals indicator elements
    const counts = {
      all: reports.length,
      pending: reports.filter(r => r.status === "Pending Verification").length,
      progress: reports.filter(r => r.status === "In Progress").length,
      resolved: reports.filter(r => r.status === "Resolved").length
    };

    if (document.getElementById("tab-count-all")) document.getElementById("tab-count-all").textContent = `(${counts.all})`;
    if (document.getElementById("tab-count-pending")) document.getElementById("tab-count-pending").textContent = `(${counts.pending})`;
    if (document.getElementById("tab-count-progress")) document.getElementById("tab-count-progress").textContent = `(${counts.progress})`;
    if (document.getElementById("tab-count-resolved")) document.getElementById("tab-count-resolved").textContent = `(${counts.resolved})`;

    // Filter list based on selected sub-tab
    let filteredList = [...reports];
    if (currentStatusFilter === "pending") {
      filteredList = filteredList.filter(r => r.status === "Pending Verification");
    } else if (currentStatusFilter === "progress") {
      filteredList = filteredList.filter(r => r.status === "In Progress");
    } else if (currentStatusFilter === "resolved") {
      filteredList = filteredList.filter(r => r.status === "Resolved");
    }

    // Apply secondary category filter from custom dropdown
    if (currentCategoryFilter && currentCategoryFilter !== "all") {
      filteredList = filteredList.filter(r => r.category === currentCategoryFilter);
    }

    // ADD THIS: Apply District filter
    if (currentDistrictFilter && currentDistrictFilter !== "all") {
      filteredList = filteredList.filter(r => r.district === currentDistrictFilter);
    }

    // Apply text query filter
    if (queryText) {
      filteredList = filteredList.filter((item) =>
        item.id.toLowerCase().includes(queryText) ||
        item.category.toLowerCase().includes(queryText) ||
        item.location.toLowerCase().includes(queryText) ||
        item.submittedBy.toLowerCase().includes(queryText) ||
        item.status.toLowerCase().includes(queryText)
      );
    }

    // Sort processing based on "Reported At" (reportedAt timestamp)
    filteredList.sort((a, b) => {
      // Fallback to 0 if time is missing, though Firebase provides the timestamp
      const timeA = a.reportedAt ? a.reportedAt.getTime() : 0; // Changed from createdAt
      const timeB = b.reportedAt ? b.reportedAt.getTime() : 0; // Changed from createdAt

      if (currentSortOrder === "date-desc") {
        // Newest submitted forms first
        return timeB - timeA || b.docId.localeCompare(a.docId);
      } else {
        // Oldest submitted forms first
        return timeA - timeB || a.docId.localeCompare(b.docId);
      }
    });

    // Save filtered and sorted list for CSV export
    lastFilteredReports = filteredList;

    // Pagination calculations
    const totalItems = filteredList.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
    if (currentPage > totalPages) {
      currentPage = 1;
    }
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, totalItems);
    const paginatedList = filteredList.slice(startIndex, endIndex);

    reportsTableBody.innerHTML = "";

    if (totalItems === 0) {
      reportsTableBody.innerHTML = `<tr><td colspan="7" class="px-6 py-12 text-center text-slate-500 font-medium bg-slate-50/50">No matching reports found.</td></tr>`;
      if (tableResultsCounter) tableResultsCounter.textContent = "Showing 0 reports";
      const pagContainer = document.getElementById("pagination-controls");
      if (pagContainer) pagContainer.innerHTML = "";
      return;
    }

    if (tableResultsCounter) {
      tableResultsCounter.textContent = `Showing ${startIndex + 1} to ${endIndex} of ${totalItems} reports`;
    }

    renderPaginationControls(totalPages);

    paginatedList.forEach((report, index) => {
      const tr = document.createElement("tr");
      tr.className = "animate-table-row hover:bg-slate-50/80 transition-colors border-b border-slate-100 align-middle";
      tr.style.animationDelay = `${index * 0.05}s`;

      // 1. Calculate Status Badge Styles
      let badgeColorClass = "bg-slate-100 text-slate-700 border border-slate-200";
      if (report.status === "Resolved") {
        badgeColorClass = "bg-green-50 text-green-700 border border-green-200";
      } else if (report.status === "In Progress") {
        badgeColorClass = "bg-blue-50 text-blue-700 border border-blue-200";
      } else if (report.status === "Pending Verification") {
        badgeColorClass = "bg-amber-50 text-amber-700 border border-amber-200";
      }

      // 2. Calculate Priority Badge Styles
      let priorityText = "Low";
      let priorityClass = "bg-slate-100 text-slate-600 font-semibold text-xs px-2.5 py-0.5 rounded";

      if (report.severity >= 4) {
        priorityText = "High";
        priorityClass = "bg-rose-50 text-rose-700 font-bold text-xs px-2.5 py-0.5 rounded border border-rose-100";
      } else if (report.severity === 3) {
        priorityText = "Medium";
        priorityClass = "bg-amber-50 text-amber-700 font-semibold text-xs px-2.5 py-0.5 rounded border border-amber-100";
      }

      tr.innerHTML = `
        <td class="px-6 py-4 font-mono font-semibold text-slate-900">#${report.id}</td>
        <td class="px-6 py-4 font-semibold text-slate-800 capitalize">${report.category}</td>
        <td class="px-6 py-4 text-slate-600 max-w-xs truncate">${report.location}</td>
        <td class="px-6 py-4">
          <span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${badgeColorClass}">
            ${report.status}
          </span>
        </td>
        <td class="px-6 py-4">
          <span class="${priorityClass}">
            ${priorityText}
          </span>
        </td>
        <td class="px-6 py-4 text-slate-600 whitespace-nowrap">${formatReportedAt(report.reportedAt)}</td>
        <td class="px-6 py-4 text-right">
          <button data-doc-id="${report.docId}" class="action-view-btn text-xs font-bold text-emerald-600 hover:text-emerald-800 transition-colors px-3 py-1.5 rounded bg-emerald-50 hover:bg-emerald-100 inline-flex items-center gap-1">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
            <span>View</span>
          </button>
        </td>
      `;
      reportsTableBody.appendChild(tr);
    });

    reportsTableBody.querySelectorAll(".action-view-btn").forEach((btn) => {
      btn.addEventListener("click", function () {
        openDetailModal(this.getAttribute("data-doc-id"));
      });
    });
  }

  function renderTaskManagement() {
    const tbody = document.getElementById("task-table-body");
    const queueList = document.getElementById("service-queue-list");
    const donutEl = document.getElementById("task-donut-chart");
    const legendEl = document.getElementById("task-donut-legend");
    if (!tbody || !queueList || !donutEl || !reports) return;

    // 1. Process Reports into "Tasks" applying Upvote Priority Logic
    let allTasks = reports.map(r => {
      const sev = r.severity || 0;
      const upvotes = r.upvotes || 1;
      
      // PRIORITY LOGIC: Community upvotes make it rise in urgency!
      let priority = 'Low';
      if (sev >= 4 || upvotes >= 10) priority = 'High';
      else if (sev === 3 || upvotes >= 5) priority = 'Medium';

      // Due Date: 48 Hours from reported time
      const targetDate = r.reportedAt ? new Date(r.reportedAt.getTime() + (48 * 60 * 60 * 1000)) : new Date();
      const ageMs = r.reportedAt ? (new Date() - r.reportedAt) : 0;
      
      let uiStatus = r.status;
      let isOverdue = false;
      if (r.status === 'Pending Verification' && ageMs > (48 * 60 * 60 * 1000)) {
          uiStatus = 'Overdue';
          isOverdue = true;
      }

      let assignee = 'Unassigned';
      if (r.status === 'In Progress') assignee = 'Response Team';
      else if (r.status === 'Resolved') assignee = 'Completed Unit';

      return {
        id: r.id,
        docId: r.docId,
        title: `${r.category} Clearing`,
        barangay: r.barangay,
        assignee: assignee,
        priority: priority,
        status: uiStatus,
        isOverdue: isOverdue,
        upvotes: upvotes,
        due: targetDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        rawDate: targetDate.getTime()
      };
    });

    // 2. Update KPI Cards & Tab Counts
    const activeTasks = allTasks.filter(t => t.status !== 'Resolved' && t.status !== 'Dismissed');
    const totalActive = activeTasks.length;
    const assignedCount = allTasks.filter(t => t.status === 'In Progress').length;
    const overdueCount = allTasks.filter(t => t.isOverdue).length;
    const completedCount = allTasks.filter(t => t.status === 'Resolved').length;

    if(document.getElementById("stat-task-total")) document.getElementById("stat-task-total").textContent = totalActive;
    if(document.getElementById("stat-task-assigned")) document.getElementById("stat-task-assigned").textContent = assignedCount;
    if(document.getElementById("stat-task-overdue")) document.getElementById("stat-task-overdue").textContent = overdueCount;
    if(document.getElementById("stat-task-completed")) document.getElementById("stat-task-completed").textContent = completedCount;

    if(document.getElementById("task-count-all")) document.getElementById("task-count-all").textContent = `(${totalActive})`;
    if(document.getElementById("task-count-overdue")) document.getElementById("task-count-overdue").textContent = `(${overdueCount})`;
    if(document.getElementById("task-count-completed")) document.getElementById("task-count-completed").textContent = `(${completedCount})`;

    // 3. Apply Filters
    let filteredTasks = [...allTasks];
    
    if (taskCurrentTab === 'all') filteredTasks = activeTasks;
    else if (taskCurrentTab === 'overdue') filteredTasks = filteredTasks.filter(t => t.isOverdue);
    else if (taskCurrentTab === 'completed') filteredTasks = filteredTasks.filter(t => t.status === 'Resolved');

    if (taskCurrentPriority !== 'all') {
      filteredTasks = filteredTasks.filter(t => t.priority === taskCurrentPriority);
    }

    if (taskSearchQuery) {
      const q = taskSearchQuery.toLowerCase();
      filteredTasks = filteredTasks.filter(t => 
        t.title.toLowerCase().includes(q) || 
        t.id.toLowerCase().includes(q) || 
        t.barangay.toLowerCase().includes(q)
      );
    }

    filteredTasks.sort((a, b) => a.rawDate - b.rawDate);

    // 4. Render Paginated Table
    const totalPages = Math.max(1, Math.ceil(filteredTasks.length / tasksPerPage));
    if (taskCurrentPage > totalPages) taskCurrentPage = 1;
    const start = (taskCurrentPage - 1) * tasksPerPage;
    const pageItems = filteredTasks.slice(start, start + tasksPerPage);

    tbody.innerHTML = "";
    if (pageItems.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="px-5 py-10 text-center text-slate-400 text-xs font-semibold bg-slate-50/50">No tasks currently match this filter.</td></tr>`;
    } else {
      pageItems.forEach((t, i) => {
        const priorityColors = {
          High: 'bg-rose-50 text-rose-600 border-rose-200',
          Medium: 'bg-amber-50 text-amber-700 border-amber-200',
          Low: 'bg-blue-50 text-blue-600 border-blue-200'
        };

        const statusStyles = {
          'Pending Verification': { dot: 'bg-amber-500', pill: 'bg-amber-50 text-amber-700 border-amber-200' },
          'In Progress': { dot: 'bg-blue-500', pill: 'bg-blue-50 text-blue-700 border-blue-200' },
          'Overdue': { dot: 'bg-rose-500', pill: 'bg-rose-50 text-rose-700 border-rose-200' },
          'Resolved': { dot: 'bg-emerald-500', pill: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
          'Dismissed': { dot: 'bg-slate-400', pill: 'bg-slate-50 text-slate-600 border-slate-200' }
        };

        const st = statusStyles[t.status] || statusStyles['Pending Verification'];
        
        tbody.innerHTML += `
          <tr class="hover:bg-slate-50 transition-colors animate-table-row border-b border-slate-100" style="animation-delay: ${i * 30}ms;">
            <td class="px-5 py-4 font-mono text-[11px] font-bold text-slate-500">#${t.id}</td>
            <td class="px-5 py-4">
              <p class="font-bold text-slate-800">${t.title}</p>
              <p class="text-[10px] text-emerald-600 font-bold mt-0.5 flex items-center gap-1" title="Community Upvotes raise priority">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 15l7-7 7 7" /></svg>
                ${t.upvotes} Votes
              </p>
            </td>
            <td class="px-5 py-4 text-xs font-semibold text-slate-600">${t.barangay}</td>
            <td class="px-5 py-4">
              <span class="text-[10px] font-bold px-2.5 py-1 rounded border ${priorityColors[t.priority]}">${t.priority}</span>
            </td>
            <td class="px-5 py-4 text-xs font-bold ${t.isOverdue ? 'text-rose-600' : 'text-slate-600'}">${t.due}</td>
            <td class="px-5 py-4">
              <span class="inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-1 rounded-full border ${st.pill}">
                <span class="w-1.5 h-1.5 rounded-full ${st.dot}"></span>${t.status}
              </span>
            </td>
            <td class="px-5 py-4 text-right">
              <button onclick="window.openDetailModal('${t.docId}')" class="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer" title="View Detail">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
              </button>
            </td>
          </tr>
        `;
      });
    }

    const counter = document.getElementById("task-table-counter");
    if(counter) counter.textContent = filteredTasks.length > 0 ? `Showing ${start + 1} to ${Math.min(start + tasksPerPage, filteredTasks.length)} of ${filteredTasks.length} tasks` : `Showing 0 tasks`;

    const pager = document.getElementById("task-pagination-controls");
    if (pager) {
        pager.innerHTML = "";
        if (totalPages > 1) {
            const createBtn = (label, pageNum, disabled, isActive) => {
                const b = document.createElement("button");
                b.innerHTML = label;
                b.disabled = disabled;
                if (isActive) b.className = "px-2.5 py-1 text-xs font-bold rounded-lg border border-emerald-600 bg-emerald-50 text-emerald-800 transition-colors";
                else if (disabled) b.className = "p-1 text-slate-300 pointer-events-none";
                else b.className = "px-2.5 py-1 text-xs font-medium rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors cursor-pointer";
                if (!disabled && !isActive) { b.addEventListener("click", () => { taskCurrentPage = pageNum; renderTaskManagement(); }); }
                return b;
            };
            pager.appendChild(createBtn(`<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" /></svg>`, taskCurrentPage - 1, taskCurrentPage === 1, false));
            for (let p = 1; p <= totalPages; p++) pager.appendChild(createBtn(p.toString(), p, false, p === taskCurrentPage));
            pager.appendChild(createBtn(`<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" /></svg>`, taskCurrentPage + 1, taskCurrentPage === totalPages, false));
        }
    }

    // 5. Sidebar: Service Queue
    const brgyCounts = {};
    activeTasks.forEach(t => {
      brgyCounts[t.barangay] = (brgyCounts[t.barangay] || 0) + 1;
    });
    
    const queueData = Object.keys(brgyCounts).map(k => ({ name: k, count: brgyCounts[k] })).sort((a,b) => b.count - a.count).slice(0, 6);
    const maxQueue = Math.max(...queueData.map(q => q.count), 1);
    
    queueList.innerHTML = "";
    if(queueData.length === 0) queueList.innerHTML = `<p class="text-xs text-slate-400 italic text-center py-4">No active queue.</p>`;
    
    queueData.forEach(q => {
      const pct = (q.count / maxQueue) * 100;
      let barColor = 'bg-emerald-500';
      if(q.count > 10) barColor = 'bg-rose-500';
      else if(q.count > 4) barColor = 'bg-amber-500';

      queueList.innerHTML += `
        <div>
          <div class="flex items-center justify-between mb-1.5">
            <span class="text-[11px] font-bold text-slate-700">${q.name}</span>
            <span class="text-[11px] font-black text-slate-900">${q.count}</span>
          </div>
          <div class="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div class="h-full ${barColor} rounded-full" style="width:${pct}%"></div>
          </div>
        </div>
      `;
    });

    // 6. Sidebar: Donut Chart
    const statusCounts = { 'Pending Verification': 0, 'In Progress': 0, 'Overdue': 0, 'Resolved': 0 };
    allTasks.forEach(t => {
      if(statusCounts[t.status] !== undefined) statusCounts[t.status]++;
    });

    const dTotal = allTasks.filter(t => t.status !== 'Dismissed').length;
    if(document.getElementById("task-donut-total")) document.getElementById("task-donut-total").textContent = dTotal;

    const oData = [
      { label: 'In Progress', val: statusCounts['In Progress'], color: '#3b82f6' },
      { label: 'Pending', val: statusCounts['Pending Verification'], color: '#f59e0b' },
      { label: 'Overdue', val: statusCounts['Overdue'], color: '#e11d48' },
      { label: 'Completed', val: statusCounts['Resolved'], color: '#10b981' }
    ].filter(d => d.val > 0);

    legendEl.innerHTML = "";
    if (oData.length === 0) {
       donutEl.style.background = "#e2e8f0";
       legendEl.innerHTML = `<p class="text-xs text-slate-400 italic py-4">No data</p>`;
    } else {
      let cursor = 0;
      const stops = oData.map(o => {
          const startPct = (cursor / dTotal) * 100;
          cursor += o.val;
          const endPct = (cursor / dTotal) * 100;
          return `${o.color} ${startPct}% ${endPct}%`;
      }).join(', ');
      donutEl.style.background = `conic-gradient(${stops})`;

      oData.forEach(o => {
          const pct = Math.round((o.val / dTotal) * 100);
          legendEl.innerHTML += `
            <div class="flex items-center justify-between gap-2 mb-2">
              <span class="flex items-center gap-2 truncate">
                <span class="w-2.5 h-2.5 rounded-full flex-shrink-0" style="background:${o.color}"></span>
                <span class="truncate">${o.label}</span>
              </span>
              <span class="text-slate-500 font-bold">${pct}%</span>
            </div>
          `;
      });
    }
  }

  function updateTabHighlight(activeKey) {
    const tabs = {
      all: document.getElementById("filter-tab-all"),
      pending: document.getElementById("filter-tab-pending"),
      progress: document.getElementById("filter-tab-progress"),
      resolved: document.getElementById("filter-tab-resolved")
    };
    Object.keys(tabs).forEach(key => {
      const t = tabs[key];
      if (t) {
        if (key === activeKey) {
          t.className = "px-4 py-2.5 border-b-2 border-emerald-600 text-emerald-600 font-bold transition-all";
        } else {
          t.className = "px-4 py-2.5 border-b-2 border-transparent hover:text-slate-800 transition-all";
        }
      }
    });
  }

  // Bind events for filter sub-tabs execution
  function setupTabFilters() {
    const tabs = {
      all: document.getElementById("filter-tab-all"),
      pending: document.getElementById("filter-tab-pending"),
      progress: document.getElementById("filter-tab-progress"),
      resolved: document.getElementById("filter-tab-resolved")
    };

    Object.keys(tabs).forEach(key => {
      if (!tabs[key]) return;
      tabs[key].addEventListener("click", function () {
        currentStatusFilter = key;
        updateTabHighlight(key);

        // Sync select dropdown
        const statusSelect = document.getElementById("status-filter-select");
        if (statusSelect) {
          const selectVals = {
            all: "all",
            pending: "Pending Verification",
            progress: "In Progress",
            resolved: "Resolved"
          };
          statusSelect.value = selectVals[key] || "all";
        }

        currentPage = 1;
        renderReportsTable();
      });
    });
  }

  // ==========================================
  // 7b. BLOCKCHAIN ACTIVITY LOGIC
  // ==========================================
  function renderBlockchainActivity(reportsList) {
    const timelineContainer = document.getElementById("blockchain-timeline");
    const tableBody = document.getElementById("blockchain-table-body");

    if (!timelineContainer || !tableBody) return;

    timelineContainer.innerHTML = "";
    tableBody.innerHTML = "";

    // Filter to only those with a blockchain hashScanUrl
    const blockchainReports = reportsList.filter(r => r.hashScanUrl);

    if (blockchainReports.length === 0) {
      timelineContainer.innerHTML = `<p class="text-xs text-slate-500 py-4 italic">No on-chain activity recorded yet.</p>`;
      tableBody.innerHTML = `<tr><td colspan="4" class="py-4 text-center text-xs text-slate-500 italic">No blockchain transactions found.</td></tr>`;
      return;
    }

    // TIMELINE RENDERING (Top 3 recent)
    const timelineReports = blockchainReports.slice(0, 3);
    timelineReports.forEach((r, index) => {
      const timeStr = r.reportedAt ? r.reportedAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "N/A";
      const dateStr = r.reportedAt ? r.reportedAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";
      const isFirst = index === 0;
      const statusLabel = r.status === "Pending Verification" ? "Report Submitted" : r.status;

      const itemHTML = `
        <div class="flex items-start gap-4">
          <div class="w-6 h-6 rounded-full ${isFirst ? 'bg-emerald-700' : 'bg-slate-300'} flex items-center justify-center relative z-10 shrink-0">
            ${isFirst ? '<div class="w-2 h-2 rounded-full bg-white"></div>' : ''}
          </div>
          <div>
            <h4 class="text-xs font-bold ${isFirst ? 'text-slate-800' : 'text-slate-500'}">${statusLabel}</h4>
            <p class="text-[10px] text-slate-500 mb-1">${dateStr} • ${timeStr}</p>
            ${r.hashScanUrl ? `<a href="${r.hashScanUrl}" target="_blank" class="inline-block px-2 py-0.5 bg-emerald-100 text-emerald-700 hover:bg-emerald-200 text-[9px] font-bold rounded transition-colors">Confirmed</a>` : ''}
            <p class="text-[9px] text-slate-400 font-mono mt-1 truncate max-w-[120px]" title="${r.hashScanUrl || ''}">Tx: ${r.hashScanUrl ? r.hashScanUrl.split('/').pop().substring(0, 10) + '...' : 'N/A'}</p>
          </div>
        </div>
      `;
      timelineContainer.insertAdjacentHTML('beforeend', itemHTML);
    });

    // TABLE RENDERING (Top 5 recent)
    const tableReports = blockchainReports.slice(0, 5);
    tableReports.forEach(r => {
      let timeAgo = "Just now";
      if (r.reportedAt) {
        const diffMs = Date.now() - r.reportedAt.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);
        if (diffDays > 0) timeAgo = `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
        else if (diffHours > 0) timeAgo = `${diffHours} hr${diffHours > 1 ? 's' : ''} ago`;
        else if (diffMins > 0) timeAgo = `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
      }

      const typeLabel = r.status === "Pending Verification" ? "New Report" : "Status Update";
      const txHashDisplay = r.hashScanUrl ? r.hashScanUrl.split('/').pop().substring(0, 12) + '...' : 'N/A';

      const trHTML = `
        <tr class="cursor-pointer hover:bg-slate-50 transition-colors" onclick="document.getElementById('nav-reports').click()">
          <td class="py-3 text-xs font-mono font-semibold text-emerald-600 truncate max-w-[100px]"><a href="${r.hashScanUrl || '#'}" target="_blank" class="hover:underline" onclick="event.stopPropagation()">${txHashDisplay}</a></td>
          <td class="py-3 text-xs font-semibold text-slate-800">${typeLabel}</td>
          <td class="py-3">
            <span class="inline-block px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[9px] font-bold rounded">Confirmed</span>
          </td>
          <td class="py-3 text-[10px] font-medium text-slate-500 text-right">${timeAgo}</td>
        </tr>
      `;
      tableBody.insertAdjacentHTML('beforeend', trHTML);
    });
  }

  // ==========================================
  // 8. MODAL LOGIC
  // ==========================================

  const CATEGORY_ICONS = {
    "Recyclable": `<svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 8H18.5" /></svg>`,
    "Nabubulok": `<svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>`,
    "Non-recyclable": `<svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>`,
    "Mixed Waste": `<svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>`,
    "Hazardous Waste": `<svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 13.33 1.924 3 3.464 3z" /></svg>`,
    "Healthcare Waste": `<svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" /></svg>`,
    "default": `<svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>`
  };

function populateModal(report) {
    modalReportId.textContent = `Report #${report.id}`;
    modalCategory.textContent = report.category;
    
    // Inject Category Icon dynamically
    const iconContainer = document.getElementById("modal-cat-icon-container");
    if (iconContainer) {
        iconContainer.innerHTML = CATEGORY_ICONS[report.category] || CATEGORY_ICONS["default"];
    }

    modalLocation.textContent = report.location;
    modalSubmitter.textContent = report.submittedBy;
    if (modalContactInfo) modalContactInfo.textContent = report.contactInfo || "Not Provided";
    modalAiVolume.textContent = report.aiVolume || "N/A";
    modalSeverityScore.textContent = String(report.severity || 0);
    modalNotes.textContent = report.notes ? `"${report.notes}"` : '"No additional comments provided."';
    modalStatusSelect.value = report.status;
    updateModalStatusBadge(report.status);
    modalReportImage.src = report.imageUrl || PLACEHOLDER_IMAGE;

   // Hide all dynamic inputs first
    if (dismissalReasonContainer) dismissalReasonContainer.classList.add("hidden");
    if (resolvedByContainer) resolvedByContainer.classList.add("hidden");
    if (assigneeContainer) assigneeContainer.classList.add("hidden");

    // Show and populate only the relevant one based on current status
    if (report.status === "Dismissed") {
      if (dismissalReasonContainer) dismissalReasonContainer.classList.remove("hidden");
      if (dismissalReasonInput) dismissalReasonInput.value = report.dismissalReason || "";
    } else if (report.status === "Resolved") {
      if (resolvedByContainer) resolvedByContainer.classList.remove("hidden");
      if (resolvedByInput) resolvedByInput.value = report.resolvedByCode || "";
    } else if (report.status === "In Progress") {
      if (assigneeContainer) assigneeContainer.classList.remove("hidden");
      if (assigneeInput) assigneeInput.value = report.assignedToCode || "";
    }

    if (modalBlockchainUrl && blockchainUrlContainer) {
      if (report.hashScanUrl) {
        modalBlockchainUrl.href = report.hashScanUrl;
        blockchainUrlContainer.classList.remove("hidden");
      } else {
        modalBlockchainUrl.removeAttribute("href");
        blockchainUrlContainer.classList.add("hidden");
      }
    }
  }

  function openDetailModal(docId) {
    selectedReport = reports.find((r) => r.docId === docId);
    if (!selectedReport) return;
    populateModal(selectedReport);
    reportDetailModal.classList.remove("hidden");
    document.body.classList.add("overflow-hidden");
  }

function updateModalStatusBadge(status) {
    const editBox = document.getElementById("modal-status-edit-box");
    const titleText = document.getElementById("modal-status-title-text");
    const saveBtn = document.getElementById("modal-btn-save");
    const footerSpacer = document.getElementById("footer-spacer");

    modalStatusBadge.className = "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black bg-white shadow-sm border border-slate-200 text-slate-700";
    let dotEl = modalStatusBadge.querySelector("span:first-child");
    let textEl = modalStatusBadge.querySelector("span:last-child");

    if (!dotEl) {
      modalStatusBadge.innerHTML = '<span class="w-2 h-2 rounded-full"></span><span></span>';
      dotEl = modalStatusBadge.querySelector("span:first-child");
      textEl = modalStatusBadge.querySelector("span:last-child");
    }

    textEl.textContent = status;
    
    // Reset Edit Box Base Classes
    if(editBox) editBox.className = "mt-8 p-6 rounded-2xl border transition-colors duration-300";
    if(titleText) titleText.className = "text-[10px] font-bold uppercase tracking-widest mb-1.5";
    
    // Reset Save Button
    if(saveBtn) saveBtn.className = "px-6 py-2.5 text-white text-sm font-bold rounded-xl shadow-md transition-all active:scale-95 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed";

    // Show spacer by default, hide if Resolved (so Resolved UI takes the space)
    if(footerSpacer) footerSpacer.style.display = status === "Resolved" ? "none" : "block";

    if (status === "Resolved") {
      dotEl.className = "w-2 h-2 rounded-full bg-emerald-500";
      modalStatusBadge.classList.add("text-emerald-700");
      if(editBox) editBox.classList.add("bg-emerald-50", "border-emerald-200");
      if(titleText) titleText.classList.add("text-emerald-600");
      if(saveBtn) saveBtn.classList.add("bg-emerald-600", "hover:bg-emerald-700", "shadow-emerald-500/30");
    } else if (status === "In Progress") {
      dotEl.className = "w-2 h-2 rounded-full bg-blue-500";
      modalStatusBadge.classList.add("text-blue-700");
      if(editBox) editBox.classList.add("bg-blue-50", "border-blue-200");
      if(titleText) titleText.classList.add("text-blue-600");
      if(saveBtn) saveBtn.classList.add("bg-blue-600", "hover:bg-blue-700", "shadow-blue-500/30");
    } else if (status === "Dismissed") {
      dotEl.className = "w-2 h-2 rounded-full bg-rose-500";
      modalStatusBadge.classList.add("text-rose-700");
      if(editBox) editBox.classList.add("bg-rose-50", "border-rose-200");
      if(titleText) titleText.classList.add("text-rose-600");
      if(saveBtn) saveBtn.classList.add("bg-rose-600", "hover:bg-rose-700", "shadow-rose-500/30");
    } else {
      dotEl.className = "w-2 h-2 rounded-full bg-slate-400";
      if(editBox) editBox.classList.add("bg-slate-50", "border-slate-200");
      if(titleText) titleText.classList.add("text-slate-500");
      if(saveBtn) saveBtn.classList.add("bg-blue-600", "hover:bg-blue-700", "shadow-blue-500/30"); // Default save color
    }
  }

  function closeModal() {
    reportDetailModal.classList.add("hidden");
    document.body.classList.remove("overflow-hidden");
    selectedReport = null;
  }

  async function saveStatusChange() {
    if (!selectedReport) return;
    const newStatus = modalStatusSelect.value;
    const firestoreStatus = STATUS_TO_FIRESTORE[newStatus] || "pending";

    const updatePayload = { status: firestoreStatus };
    
    // Safely structure payload based on Admin selection
    if (newStatus === "Dismissed") {
      updatePayload.dismissalReason = dismissalReasonInput ? dismissalReasonInput.value : "";
    } 
    else if (newStatus === "Resolved") {
      const adminCode = resolvedByInput ? resolvedByInput.value : "";
      if (!adminCode) {
          showToast("Validation Error", "Please verify using your Admin ID before saving.");
          return; 
      }
      updatePayload.resolvedByCode = adminCode;
    } 
    else if (newStatus === "In Progress") {
      const truckCode = assigneeInput ? assigneeInput.value : "";
      if (!truckCode) {
          showToast("Validation Error", "Please assign a Truck or Team before marking as In Progress.");
          return; 
      }
      updatePayload.assignedToCode = truckCode;
    }

    try {
      modalBtnSave.disabled = true;
      modalBtnSave.textContent = "Logging to Blockchain..."; // UI feedback for network delay

      // --- 1. EXTRACT COORDINATES SAFELY ---
      let lat = null, lng = null;
      if (selectedReport.coordinates) {
        if (selectedReport.coordinates.lat != null) {
          lat = selectedReport.coordinates.lat;
          lng = selectedReport.coordinates.lng;
        } else if (Array.isArray(selectedReport.coordinates)) {
          lat = selectedReport.coordinates[0];
          lng = selectedReport.coordinates[1];
        }
      }

      // --- 2. BUILD BLOCKCHAIN PAYLOAD ---
      const hederaPayload = {
        aiSeverityScore: selectedReport.severity,
        category: selectedReport.category,
        lat: lat,
        lng: lng,
        statusUpdate: firestoreStatus // Log the new status state
      };

      // --- 3. SEND TO HEDERA ---
      const hashScanUrl = await logReportOnChain(hederaPayload);

      // If the blockchain accepts it, attach the new receipt URL to the database update
      if (hashScanUrl) {
        updatePayload.hashScanUrl = hashScanUrl;
      }

      modalBtnSave.textContent = "Saving to Database...";

      // --- 4. UPDATE FIRESTORE ---
      await updateDoc(doc(db, "reports", selectedReport.docId), updatePayload);
      closeModal();
      // Use your existing toast system for feedback
      showToast("Report Updated", "Status changes saved to Blockchain and Database.");

    } catch (error) {
      console.error("Failed to save report status change:", error);
      showToast("Save Failed", error.message || "Could not save status change.");
    } finally {
      modalBtnSave.disabled = false;
      modalBtnSave.textContent = "Save Status Changes";
    }
  }

  function setupSidebarToggle() {
    const sidebar = document.getElementById("main-sidebar");
    const mainWrapper = document.getElementById("main-content-wrapper");
    const toggleBtn = document.getElementById("toggle-sidebar-btn");
    const toggleIcon = document.getElementById("toggle-icon");
    const sidebarTexts = document.querySelectorAll(".sidebar-text");

    if (!toggleBtn || !sidebar || !mainWrapper) return;

    toggleBtn.addEventListener("click", () => {
      sidebar.classList.toggle("w-64");
      sidebar.classList.toggle("w-16");
      mainWrapper.classList.toggle("pl-64");
      mainWrapper.classList.toggle("pl-16");

      const collapsed = sidebar.classList.contains("w-16");
      if (toggleIcon) {
        toggleIcon.innerHTML = collapsed
          ? '<path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />'
          : '<path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />';
      }
      sidebarTexts.forEach((el) => {
        if (collapsed) {
          el.classList.add("opacity-0", "hidden");
        } else {
          el.classList.remove("hidden");
          setTimeout(() => el.classList.remove("opacity-0"), 50);
        }
      });

      setTimeout(() => {
        if (window.mapInstance) window.mapInstance.invalidateSize();
        if (window.dashboardMapInstance) window.dashboardMapInstance.invalidateSize();
      }, 350);
    });
  }

  // ==========================================
  // 9. EVENT LISTENERS
  // ==========================================

  function handleNavClick(e, viewName) {
    e.preventDefault(); // Prevents the page reload flicker
    switchView(viewName, true);
  }

  function setupEventListeners() {
    // --- NEW: Barangay Performance Input Listeners ---
    const brgyDistrictFilter = document.getElementById("brgy-district-filter");
    if (brgyDistrictFilter) {
      brgyDistrictFilter.addEventListener("change", function () {
        activeBrgyDistrictFilter = this.value;
        renderBarangayPerformance();
      });
    }

    const brgySearchInput = document.getElementById("brgy-search-input");
    if (brgySearchInput) {
      brgySearchInput.addEventListener("input", function () {
        activeBrgySearchQuery = this.value.trim();
        renderBarangayPerformance();
      });
    }


    // Navigation Routing mapped to the new preventDefault handler
    if (navDashboardBtn) navDashboardBtn.addEventListener("click", (e) => handleNavClick(e, "dashboard"));
    if (navReportsBtn) navReportsBtn.addEventListener("click", (e) => handleNavClick(e, "reports"));
    if (navMapBtn) navMapBtn.addEventListener("click", (e) => handleNavClick(e, "map"));
    if (navAnalyticsBtn) navAnalyticsBtn.addEventListener("click", (e) => handleNavClick(e, "analytics"));
    if (navBarangayBtn) navBarangayBtn.addEventListener("click", (e) => handleNavClick(e, "barangay-performance"));
    if (navTasksBtn) navTasksBtn.addEventListener("click", (e) => handleNavClick(e, "task-management"));
    if (navRoutesBtn) navRoutesBtn.addEventListener("click", (e) => handleNavClick(e, "collection-routes"));
    if (navInsightsBtn) navInsightsBtn.addEventListener("click", (e) => handleNavClick(e, "ai-insights"));
    if (navSettingsBtn) navSettingsBtn.addEventListener("click", (e) => handleNavClick(e, "settings"));

    const analyticsDateFilter = document.getElementById("analytics-date-filter");
    if (analyticsDateFilter) {
      analyticsDateFilter.addEventListener("change", updateAnalyticsMetrics);
    }

    // --- Header Toast ---
    const headerCityBtn = document.getElementById("header-city-btn");
    if (headerCityBtn) {
        headerCityBtn.addEventListener("click", () => {
            showToast("Only Quezon City for now", "Future cities will be added in the next update.");
        });
    }

    // --- Analytics Filter Change ---
    const analyticsDistFilter = document.getElementById("analytics-district-filter");
    if (analyticsDistFilter) {
      analyticsDistFilter.addEventListener("change", updateAnalyticsMetrics);
    }

    // --- Analytics Simulated Table Row Click Handlers ---
    const analyticsTableRows = document.querySelectorAll("#view-analytics-panel table tbody tr");
    analyticsTableRows.forEach(row => {
      row.classList.add("cursor-pointer", "hover:bg-slate-50", "transition-colors");
      row.addEventListener("click", () => {
        showToast("Barangay Drill-down (In Development)");
      });
    });

// --- TASK MANAGEMENT LISTENERS ---
    const tSearchInput = document.getElementById("task-search-input");
    if(tSearchInput) {
      tSearchInput.addEventListener("input", function() {
        taskSearchQuery = this.value;
        taskCurrentPage = 1;
        renderTaskManagement();
      });
    }

    const tTabs = ['all', 'overdue', 'completed'];
    tTabs.forEach(key => {
      const btn = document.getElementById(`task-tab-${key}`);
      if(btn) {
        btn.addEventListener('click', () => {
          taskCurrentTab = key;
          taskCurrentPage = 1;
          
          tTabs.forEach(k => {
             const b = document.getElementById(`task-tab-${k}`);
             if(b) b.className = "px-4 py-2.5 border-b-2 border-transparent hover:text-slate-800 transition-all";
          });
          btn.className = "px-4 py-2.5 border-b-2 border-emerald-600 text-emerald-600 font-bold transition-all";
          renderTaskManagement();
        });
      }
    });

    const tPriBtn = document.getElementById("dd-task-priority-btn");
    const tPriMenu = document.getElementById("dd-task-priority-menu");
    const tPriText = document.getElementById("dd-task-priority-text");
    
    if(tPriBtn && tPriMenu) {
      tPriBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        tPriMenu.classList.toggle("hidden");
      });
      tPriMenu.querySelectorAll("div[data-value]").forEach(opt => {
        opt.addEventListener("click", (e) => {
          e.stopPropagation();
          taskCurrentPriority = e.target.dataset.value;
          if(tPriText) tPriText.textContent = e.target.textContent;
          tPriMenu.classList.add("hidden");
          taskCurrentPage = 1;
          renderTaskManagement();
        });
      });
    }

    // Connect the Global Click Escaper to the new Priority Menu
    document.addEventListener("click", () => {
        if(tPriMenu && !tPriMenu.classList.contains("hidden")) tPriMenu.classList.add("hidden");
    });

    const tResetBtn = document.getElementById("task-reset-btn");
    if (tResetBtn) {
       tResetBtn.addEventListener("click", () => {
          taskSearchQuery = '';
          if(tSearchInput) tSearchInput.value = '';
          taskCurrentPriority = 'all';
          if(tPriText) tPriText.textContent = 'All Priorities';
          taskCurrentPage = 1;
          renderTaskManagement();
       });
    }

    // --- Analytics Simulated Bar Graph Column Click Handlers ---
    const responseTimeBars = document.querySelectorAll("#view-analytics-panel .lg\\:col-span-5 .flex-1.flex.items-end > div");
    responseTimeBars.forEach(barCol => {
      barCol.classList.add("cursor-pointer", "hover:opacity-80", "transition-opacity");
      barCol.addEventListener("click", () => {
        showToast("Response Time Drill-down (In Development)");
      });
    });

    setupSidebarToggle();

    

    // Modal & Table Setup
    window.openDetailModal = openDetailModal;
    window.saveStatusChange = saveStatusChange;

    window.switchView = switchView;
    window.exportToCSV = exportToCSV;

    if (reportSearchInput) {
      reportSearchInput.addEventListener("input", () => {
        currentPage = 1;
        renderReportsTable();
      });
    }
    if (sortSelect) {
      sortSelect.addEventListener("change", () => {
        currentPage = 1;
        renderReportsTable();
      });
    }
    if (closeModalBtn) closeModalBtn.addEventListener("click", closeModal);
    if (modalBtnCloseSecondary) modalBtnCloseSecondary.addEventListener("click", closeModal);
    if (modalBtnSave) modalBtnSave.addEventListener("click", saveStatusChange);
    if (modalStatusSelect) {
      modalStatusSelect.addEventListener("change", function () {
        updateModalStatusBadge(this.value);
        
        // Hide all dynamically
        if (dismissalReasonContainer) dismissalReasonContainer.classList.add("hidden");
        if (resolvedByContainer) resolvedByContainer.classList.add("hidden");
        if (assigneeContainer) assigneeContainer.classList.add("hidden");

        // Show based on user selection
        if (this.value === "Dismissed" && dismissalReasonContainer) {
            dismissalReasonContainer.classList.remove("hidden");
        } else if (this.value === "Resolved" && resolvedByContainer) {
            resolvedByContainer.classList.remove("hidden");
        } else if (this.value === "In Progress" && assigneeContainer) {
            assigneeContainer.classList.remove("hidden");
        }
      });
    }

    const backdrop = document.getElementById("modal-backdrop");
    if (backdrop) backdrop.addEventListener("click", closeModal);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" || e.key === "Esc") closeModal(); });

    // --- Toolbar Filters Setup (Reports Tab Custom Dropdowns) ---

    // Status Dropdown
    const rptStatusBtn = document.getElementById("reports-dropdown-status-btn");
    const rptStatusMenu = document.getElementById("reports-dropdown-status-menu");
    const rptStatusText = document.getElementById("reports-dropdown-status-text");

    if (rptStatusBtn && rptStatusMenu) {
      rptStatusBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        rptStatusMenu.classList.toggle("hidden");
        document.getElementById("reports-dropdown-category-menu")?.classList.add("hidden");
        document.getElementById("reports-dropdown-sort-menu")?.classList.add("hidden");
      });

      rptStatusMenu.querySelectorAll("div[data-value]").forEach(opt => {
        opt.addEventListener("click", (e) => {
          e.stopPropagation();
          const val = e.target.dataset.value;
          const keys = { "all": "all", "Pending Verification": "pending", "In Progress": "progress", "Resolved": "resolved" };

          currentStatusFilter = keys[val] || "all";
          if (rptStatusText) rptStatusText.textContent = e.target.textContent;
          rptStatusMenu.classList.add("hidden");
          updateTabHighlight(currentStatusFilter);
          currentPage = 1;
          renderReportsTable();
        });
      });

      // --- Reports Menu District Dropdown ---
    const rptDistBtn = document.getElementById("reports-dropdown-district-btn");
    const rptDistMenu = document.getElementById("reports-dropdown-district-menu");
    if (rptDistBtn && rptDistMenu) {
      rptDistBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        rptDistMenu.classList.toggle("hidden");
        document.getElementById("reports-dropdown-status-menu")?.classList.add("hidden");
        document.getElementById("reports-dropdown-category-menu")?.classList.add("hidden");
        document.getElementById("reports-dropdown-sort-menu")?.classList.add("hidden");
      });
    }

    // Map the Global Click Escape properly
    document.addEventListener("click", () => {
      [
        "reports-dropdown-status-menu",
        "reports-dropdown-category-menu",
        "reports-dropdown-district-menu", 
        "reports-dropdown-sort-menu",
        "dropdown-status-menu",
        "dropdown-category-menu"
      ].forEach(id => {
        const menu = document.getElementById(id);
        if (menu && !menu.classList.contains("hidden")) menu.classList.add("hidden");
      });
    });

    // Fix the "Clear Filters" Button 
    const filterBtn = document.getElementById("filter-btn");
    if (filterBtn) {
      filterBtn.addEventListener("click", function () {
        if (reportSearchInput) reportSearchInput.value = "";

        currentStatusFilter = "all";
        currentCategoryFilter = "all";
        currentDistrictFilter = "all"; 
        currentSortOrder = "date-desc";

        const rptStatusText = document.getElementById("reports-dropdown-status-text");
        const rptSortText = document.getElementById("reports-dropdown-sort-text");

        if (rptStatusText) rptStatusText.textContent = "All Status";
        if (document.getElementById("reports-dropdown-category-text")) document.getElementById("reports-dropdown-category-text").textContent = "All Categories";
        if (document.getElementById("reports-dropdown-district-text")) document.getElementById("reports-dropdown-district-text").textContent = "All Districts"; 
        if (rptSortText) rptSortText.textContent = "Reported At (Newest)";

        updateTabHighlight("all");
        currentPage = 1;
        renderReportsTable();
      });
    }
    }

    // Category Dropdown
    const rptCatBtn = document.getElementById("reports-dropdown-category-btn");
    const rptCatMenu = document.getElementById("reports-dropdown-category-menu");
    if (rptCatBtn && rptCatMenu) {
      rptCatBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        rptCatMenu.classList.toggle("hidden");
        document.getElementById("reports-dropdown-status-menu")?.classList.add("hidden");
        document.getElementById("reports-dropdown-sort-menu")?.classList.add("hidden");
      });
    }

    // Sort Dropdown
    const rptSortBtn = document.getElementById("reports-dropdown-sort-btn");
    const rptSortMenu = document.getElementById("reports-dropdown-sort-menu");
    const rptSortText = document.getElementById("reports-dropdown-sort-text");

    if (rptSortBtn && rptSortMenu) {
      rptSortBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        rptSortMenu.classList.toggle("hidden");
        document.getElementById("reports-dropdown-category-menu")?.classList.add("hidden");
        document.getElementById("reports-dropdown-status-menu")?.classList.add("hidden");
      });

      rptSortMenu.querySelectorAll("div[data-value]").forEach(opt => {
        opt.addEventListener("click", (e) => {
          e.stopPropagation();
          currentSortOrder = e.target.dataset.value;
          if (rptSortText) rptSortText.textContent = e.target.textContent;
          rptSortMenu.classList.add("hidden");
          currentPage = 1;
          renderReportsTable();
        });
      });
    }

    // Barangay Dropdown (Coming Soon)
    const rptBrgyBtn = document.getElementById("reports-dropdown-barangay-btn");
    if (rptBrgyBtn) {
      rptBrgyBtn.addEventListener("click", () => showToast("Barangay Mapping"));
    }

    // Filter Reset Button
    const filterBtn = document.getElementById("filter-btn");
    if (filterBtn) {
      filterBtn.addEventListener("click", function () {
        if (reportSearchInput) reportSearchInput.value = "";

        currentStatusFilter = "all";
        currentCategoryFilter = "all";
        currentSortOrder = "date-desc";

        if (rptStatusText) rptStatusText.textContent = "All Status";
        if (document.getElementById("reports-dropdown-category-text")) document.getElementById("reports-dropdown-category-text").textContent = "All Categories";
        if (rptSortText) rptSortText.textContent = "Reported At (Newest)";

        updateTabHighlight("all");
        currentPage = 1;
        renderReportsTable();
      });
    }

    const exportBtn = document.getElementById("export-btn");
    if (exportBtn) {
      exportBtn.addEventListener("click", exportToCSV);
    }

    // Map overlay filter listeners
    const mapFilterStatus = document.getElementById("map-filter-status");
    if (mapFilterStatus) {
      mapFilterStatus.addEventListener("change", function () {
        activeMapStatusFilter = this.value;
        renderMapMarkers();
      });
    }

    const mapFilterCategory = document.getElementById("map-filter-category");
    if (mapFilterCategory) {
      mapFilterCategory.addEventListener("change", function () {
        activeMapCategoryFilter = this.value;
        renderMapMarkers();
      });
    }

    const mapSevLow = document.getElementById("map-severity-low");
    if (mapSevLow) {
      mapSevLow.addEventListener("change", function () {
        showSeverityLow = this.checked;
        renderMapMarkers();
      });
    }

    const mapSevMedium = document.getElementById("map-severity-medium");
    if (mapSevMedium) {
      mapSevMedium.addEventListener("change", function () {
        showSeverityMedium = this.checked;
        renderMapMarkers();
      });
    }

    const mapSevHigh = document.getElementById("map-severity-high");
    if (mapSevHigh) {
      mapSevHigh.addEventListener("change", function () {
        showSeverityHigh = this.checked;
        renderMapMarkers();
      });
    }

    // Map filters reset listener
    const mapBtnFilters = document.getElementById("map-btn-filters");
    if (mapBtnFilters) {
      mapBtnFilters.addEventListener("click", function () {
        activeMapStatusFilter = "all";
        activeMapCategoryFilter = "all";
        const statusText = document.getElementById("dropdown-status-text");
        const catText = document.getElementById("dropdown-category-text");
        if (statusText) statusText.textContent = "Filter Reports (All)";
        if (catText) catText.textContent = "All Categories";

        const lowCb = document.getElementById("map-severity-low");
        const medCb = document.getElementById("map-severity-medium");
        const highCb = document.getElementById("map-severity-high");
        if (lowCb) lowCb.checked = true;
        if (medCb) medCb.checked = true;
        if (highCb) highCb.checked = true;

        showSeverityLow = true;
        showSeverityMedium = true;
        showSeverityHigh = true;

        renderMapMarkers();
        showToast("Map filters have been successfully reset.");
      });
    }
    // --- Custom Map Dropdown Toggle Logic ---
    const statusBtn = document.getElementById("dropdown-status-btn");
    const statusMenu = document.getElementById("dropdown-status-menu");
    const statusText = document.getElementById("dropdown-status-text");

    if (statusBtn && statusMenu) {
      statusBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        statusMenu.classList.toggle("hidden");
        document.getElementById("dropdown-category-menu")?.classList.add("hidden");
      });

      statusMenu.querySelectorAll("div[data-value]").forEach(opt => {
        opt.addEventListener("click", (e) => {
          e.stopPropagation();
          activeMapStatusFilter = e.target.dataset.value;
          if (statusText) statusText.textContent = e.target.textContent;
          statusMenu.classList.add("hidden");
          renderMapMarkers();
        });
      });
    }

    const catBtn = document.getElementById("dropdown-category-btn");
    const catMenu = document.getElementById("dropdown-category-menu");
    if (catBtn && catMenu) {
      catBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        catMenu.classList.toggle("hidden");
        document.getElementById("dropdown-status-menu")?.classList.add("hidden");
      });
    }

    // Global Click Listener to close all open dropdowns
    document.addEventListener("click", () => {
      [
        "reports-dropdown-status-menu",
        "reports-dropdown-category-menu",
        "reports-dropdown-sort-menu",
        "dropdown-status-menu",
        "dropdown-category-menu"
      ].forEach(id => {
        const menu = document.getElementById(id);
        if (menu && !menu.classList.contains("hidden")) menu.classList.add("hidden");
      });
    });

    // Map overlay layer listeners
    const layerToggleHeatmap = document.getElementById("layer-toggle-heatmap");
    if (layerToggleHeatmap) {
      layerToggleHeatmap.addEventListener("change", function () {
        if (this.checked) {
          showToast("Heatmap density layer is a work in progress.");
          this.checked = false;
          showHeatmap = false;
        }
      });
    }

    const layerToggleMarkers = document.getElementById("layer-toggle-markers");
    if (layerToggleMarkers) {
      layerToggleMarkers.addEventListener("change", function () {
        showMarkers = this.checked;
        renderMapMarkers();
      });
    }

    const layerToggleBarangay = document.getElementById("layer-toggle-barangay");
    if (layerToggleBarangay) {
      layerToggleBarangay.addEventListener("change", function () {
        if (this.checked) {
          showToast("Barangay Boundaries");
          this.checked = false;
        }
      });
    }

    const layerToggleFlood = document.getElementById("layer-toggle-flood");
    if (layerToggleFlood) {
      layerToggleFlood.addEventListener("change", function () {
        if (this.checked) {
          showToast("Flood Prone Zones");
          this.checked = false;
        }
      });
    }

    const mapBtnViewAll = document.getElementById("map-btn-view-all");
    if (mapBtnViewAll) {
      mapBtnViewAll.addEventListener("click", () => {
        switchView("reports", true);
      });
    }

    // Initialize Sub-Tab Filters  
    setupTabFilters();

    // BARANGAY PERFORMANCE CHARTS
    // Ensure Trend Chart scales dynamically if window is resized
    window.addEventListener("resize", () => {
        if (!document.getElementById("view-barangay-performance-panel").classList.contains("hidden")) {
            drawBarangayTrendChart();
        }
    });
  }

  // ==========================================
  // 10. EXECUTION HOOK
  // ==========================================

  document.addEventListener("DOMContentLoaded", init);

})();