/**
 * Dashboard Service
 * Real-time data aggregator for the LGU Administrator Portal.
 */

import { db } from '../shared/firebase-config.js';
import { collection, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Quezon City Legislative District Mapping Dictionary
const QC_DISTRICTS = {
    "Alicia": "District 1", "Bagong Pag-asa": "District 1", "Bahay Toro": "District 1", "Balingasa": "District 1",
    "Bungad": "District 1", "Damar": "District 1", "Damayan": "District 1", "Del Monte": "District 1",
    "Katipunan": "District 1", "Laging Handa": "District 1", "Lourdes": "District 1", "Manresa": "District 1",
    "Mariblo": "District 1", "Masambong": "District 1", "Nayong Kanluran": "District 1", "Paang Bundok": "District 1",
    "Pag-ibig sa Nayon": "District 1", "Paltok": "District 1", "Paraiso": "District 1", "Phil-Am": "District 1",
    "Project 6": "District 1", "Ramon Magsaysay": "District 1", "San Antonio": "District 1", "San Jose": "District 1",
    "Santa Cruz": "District 1", "Santa Teresita": "District 1", "Santo Domingo": "District 1", "Santo Cristo": "District 1",
    "Siena": "District 1", "Talayan": "District 1", "Vasra": "District 1", "Veterans Village": "District 1", "West Triangle": "District 1",
    "Bagong Silangan": "District 2", "Batasan Hills": "District 2", "Commonwealth": "District 2", "Holy Spirit": "District 2", "Payatas": "District 2",
    "Amihan": "District 3", "Bagumbayan": "District 3", "Bayanihan": "District 3", "Blue Ridge A": "District 3", "Blue Ridge B": "District 3",
    "Camp Aguinaldo": "District 3", "Claro": "District 3", "Dioquino Zobel": "District 3", "Duyan-Duyan": "District 3", "E. Rodriguez": "District 3",
    "East Kamias": "District 3", "Escopa I": "District 3", "Escopa II": "District 3", "Escopa III": "District 3", "Escopa IV": "District 3",
    "Libis": "District 3", "Loyola Heights": "District 3", "Mangga": "District 3", "Marilag": "District 3", "Masagana": "District 3",
    "Matandang Balara": "District 3", "Milagrosa": "District 3", "Pansol": "District 3", "Quirino 2-A": "District 3", "Quirino 2-B": "District 3",
    "Quirino 2-C": "District 3", "Quirino 3-A": "District 3", "Saint Ignatius": "District 3", "San Roque": "District 3", "Silangan": "District 3",
    "Socorro": "District 3", "Tagumpay": "District 3", "Ugong Norte": "District 3", "Villa Maria Clara": "District 3", "West Kamias": "District 3", "White Plains": "District 3",
    "Bagong Lipunan ng Crame": "District 4", "Botocan": "District 4", "Central": "District 4", "Damayang Lagi": "District 4",
    "Don Manuel": "District 4", "Doña Aurora": "District 4", "Doña Imelda": "District 4", "Doña Josefa": "District 4",
    "Horseshoe": "District 4", "Imelda": "District 4", "Kalusugan": "District 4", "Kamuning": "District 4", "Kaunlaran": "District 4",
    "Kristong Hari": "District 4", "Malaya": "District 4", "Mariana": "District 4", "Obrero": "District 4", "Old Capitol Site": "District 4",
    "Paligsahan": "District 4", "Pinyahan": "District 4", "Pinagkaisahan": "District 4", "Roxas": "District 4", "Sacred Heart": "District 4",
    "San Martin de Porres": "District 4", "Sikatuna Village": "District 4", "South Triangle": "District 4", "Tatalon": "District 4",
    "Teachers Village East": "District 4", "Teachers Village West": "District 4", "U.P. Campus": "District 4", "UP Campus": "District 4",
    "U.P. Village": "District 4", "Valencia": "District 4", "Barangay 630": "District 4",
    "Bagbag": "District 5", "Capri": "District 5", "Fairview": "District 5", "Greater Lagro": "District 5", "Gulod": "District 5",
    "Kaligayahan": "District 5", "Nagkaisang Nayon": "District 5", "Novaliches Proper": "District 5", "Pasong Putik Proper": "District 5",
    "San Bartolome": "District 5", "Santa Lucia": "District 5", "Santa Monica": "District 5",
    "Baesa": "District 6", "Balon-Bato": "District 6", "Culiat": "District 6", "New Era": "District 6", "Pasong Tamo": "District 6",
    "Sangandaan": "District 6", "Sauyo": "District 6", "Talipapa": "District 6", "Tandang Sora": "District 6", "Unang Sigaw": "District 6"
};

function getDistrictForBarangay(barangayName, city) {
    if (!barangayName) return "Provincial / Outside QC";
    const cleanName = barangayName.replace(/^Barangay\s+/i, '').trim();
    if (QC_DISTRICTS[cleanName]) return QC_DISTRICTS[cleanName];
    if (city && city.toLowerCase().includes("quezon")) return "QC Unassigned";
    return "Provincial / Outside QC";
}

export class DashboardService {
    constructor() {
        this.state = {
            reports: [],
            metrics: {
                totalReports: 0,
                activeReports: 0,
                reportsResolved: 0,
                pendingReports: 0,
                criticalReports: 0,
                reportCompletionRate: 0,
                wasteStats: {},
                barangaySummary: [],
                topBarangays: [],
                lowestBarangays: [],
                recentActivities: [],
                latestReports: []
            },
            isLoaded: false,
            error: null
        };
        this.subscribers = new Set();
        this.unsubscriber = null;
        this.isSubscribed = false;
    }

    subscribeDashboard(callback, onError) {
        this.subscribers.add(callback);
        if (!this.isSubscribed) this.startListeners(onError);
        else if (this.state.isLoaded) callback(this.getAggregatedState());
        return () => {
            this.subscribers.delete(callback);
            if (this.subscribers.size === 0) this.stopListeners();
        };
    }

    startListeners(onError) {
        this.isSubscribed = true;
        try {
            const reportsRef = collection(db, 'reports');
            this.unsubscriber = onSnapshot(reportsRef, (snapshot) => {
                this.state.reports = snapshot.docs
                    .map(docSnap => this.normalizeReport(docSnap))
                    .filter(report => report.reportedAt !== null);
                this.recalculateAndNotify();
            }, (err) => {
                this.state.error = err;
                if (onError) onError(err);
            });
        } catch (err) {
            this.state.error = err;
            if (onError) onError(err);
        }
    }

    stopListeners() {
        if (typeof this.unsubscriber === 'function') this.unsubscriber();
        this.unsubscriber = null;
        this.isSubscribed = false;
    }

    normalizeReport(docSnap) {
        const data = docSnap.data();
        const safeLocation = data.location || "Unknown Location";
        const barangay = data.barangay || "Unassigned";
        const district = getDistrictForBarangay(barangay, data.city);

        const rawStatus = String(data.status || "pending").trim().toLowerCase();
        let uiStatus = "Pending Verification";
        if (rawStatus === "resolved") uiStatus = "Resolved";
        else if (rawStatus === "in progress" || rawStatus === "in_progress") uiStatus = "In Progress";
        else if (rawStatus === "dismissed") uiStatus = "Dismissed";

        return {
            docId: docSnap.id,
            reportId: docSnap.id,
            id: docSnap.id.slice(0, 8).toUpperCase(),
            category: data.wasteType || "Uncategorized",
            location: safeLocation,
            barangay: barangay,
            district: district,
            coordinates: data.coordinates || null,

            // UPDATED: Strict Accountability mapping
            submittedBy: data.reporterName || "Verified Citizen",
            contactInfo: data.contactInfo || "Email Attached",

            status: uiStatus,
            rawStatus: rawStatus,
            aiVolume: data.volumeEstimate || "N/A",
            severity: data.severityScore != null ? Number(data.severityScore) : 0,
            upvotes: data.upvotes || 1,
            notes: data.notes || "",
            imageUrl: data.imageUrl || null,
            reportedAt: data.reportedAt?.toDate?.() || null,
            hashScanUrl: data.hashScanUrl || null,
            dismissalReason: data.dismissalReason || "",
            resolvedByCode: data.resolvedByCode || null,
            assignedToCode: data.assignedToCode || null,

            taskDueDate: data.taskDueDate || null,
        };
    }

    recalculateAndNotify() {
        const reports = this.state.reports;
        const totalReports = reports.length;
        const activeReports = reports.filter(r => r.status !== "Resolved" && r.status !== "Dismissed").length;
        const reportsResolved = reports.filter(r => r.status === "Resolved").length;
        const pendingReports = reports.filter(r => r.status === "Pending Verification").length;
        const criticalReports = reports.filter(r => r.severity >= 4 && r.status !== "Resolved").length;

        const sortedReports = [...reports].sort((a, b) => {
            const ta = a.reportedAt ? a.reportedAt.getTime() : 0;
            const tb = b.reportedAt ? b.reportedAt.getTime() : 0;
            return tb - ta;
        });

        // --- BARANGAY PERFORMANCE & TREND CALCULATIONS ---
        const now = new Date();
        const trendLabels = [];
        const trendThisWeek = Array(7).fill(0);
        const trendLastWeek = Array(7).fill(0);

        for (let i = 6; i >= 0; i--) {
            let d = new Date();
            d.setDate(now.getDate() - i);
            trendLabels.push(d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
        }

        const barangayMap = {};
        let resolved7d = 0;
        let totalDiversionEligible = 0;
        let totalCategorized = 0;

        reports.forEach(r => {
            const loc = r.barangay;
            if (!barangayMap[loc]) {
                barangayMap[loc] = {
                    total: 0, resolved: 0, pending: 0, district: r.district,
                    // Track all 6 explicit categories
                    nab: 0, rec: 0, non: 0, mix: 0, haz: 0, heal: 0,
                    history: Array(7).fill(0), // Sparkline history tracking
                    maxActiveSeverity: 0       // Track highest AI severity 
                };
            }

            // Core Metrics
            barangayMap[loc].total++;
            if (r.status === "Resolved") barangayMap[loc].resolved++;
            if (r.status === "Pending Verification") barangayMap[loc].pending++;

            // Track AI Severity for Active Reports (1 to 5)
            if (r.status !== "Resolved" && r.status !== "Dismissed") {
                if (r.severity > barangayMap[loc].maxActiveSeverity) {
                    barangayMap[loc].maxActiveSeverity = r.severity;
                }
            }

            // Global Timeline Math
            if (r.reportedAt) {
                const reportTime = r.reportedAt.getTime();
                const diffDays = Math.floor((now.getTime() - reportTime) / (1000 * 3600 * 24));

                if (diffDays >= 0 && diffDays < 7) {
                    trendThisWeek[6 - diffDays]++;
                    if (r.status === "Resolved") resolved7d++;
                    barangayMap[loc].history[6 - diffDays]++;
                } else if (diffDays >= 7 && diffDays < 14) {
                    trendLastWeek[13 - diffDays]++;
                }
            }

            // Segregation Breakdown (Updated to 6 Categories)
            const cat = r.category;
            totalCategorized++;
            if (cat === "Nabubulok") { barangayMap[loc].nab++; totalDiversionEligible++; }
            else if (cat === "Recyclable") { barangayMap[loc].rec++; totalDiversionEligible++; }
            else if (cat === "Non-recyclable") { barangayMap[loc].non++; }
            else if (cat === "Mixed Waste") { barangayMap[loc].mix++; }
            else if (cat === "Hazardous Waste") { barangayMap[loc].haz++; }
            else if (cat === "Healthcare Waste") { barangayMap[loc].heal++; }
            else { barangayMap[loc].non++; } // Default fallback
        });

        const cityDiversionRate = totalCategorized > 0 ? Math.round((totalDiversionEligible / totalCategorized) * 100) : 0;

        // Map to standard array
        let barangaySummary = Object.keys(barangayMap).map(loc => {
            const stats = barangayMap[loc];
            const rate = stats.total > 0 ? Math.round((stats.resolved / stats.total) * 100) : 0;

            let statusText = "Low";
            let statusColor = "text-emerald-600 bg-emerald-50 border-emerald-200";

            if (stats.maxActiveSeverity >= 4) {
                statusText = "High";
                statusColor = "text-rose-600 bg-rose-50 border-rose-200";
            } else if (stats.maxActiveSeverity === 3) {
                statusText = "Medium";
                statusColor = "text-amber-600 bg-amber-50 border-amber-200";
            }

            return {
                name: loc,
                district: stats.district,
                total: stats.total,
                pending: stats.pending,
                resolved: stats.resolved,
                rate,
                // Export 6 distinct groups
                segregation: { nab: stats.nab, rec: stats.rec, non: stats.non, mix: stats.mix, haz: stats.haz, heal: stats.heal },
                history: stats.history,
                statusText,
                statusColor
            };
        });

        barangaySummary.sort((a, b) => b.rate - a.rate); // Sort by highest rate
        const flaggedCount = barangaySummary.filter(b => b.statusText === "High").length;
        this.state.metrics = {
            totalReports,
            activeReports,
            reportsResolved,
            pendingReports,
            criticalReports,
            barangaySummary,
            recentActivities: sortedReports.slice(0, 5),
            latestReports: sortedReports.slice(0, 10),
            trendLabels,
            trendThisWeek,
            trendLastWeek,
            resolved7d,
            cityDiversionRate,
            flaggedCount,
            totalBarangays: Object.keys(barangayMap).length
        };

        this.state.isLoaded = true;
        this.notifySubscribers();
    }

    notifySubscribers() {
        const payload = this.getAggregatedState();
        this.subscribers.forEach(cb => {
            try { cb(payload); } catch (err) { console.error("DashboardService Callback Error:", err); }
        });
    }

    getAggregatedState() {
        return {
            reports: [...this.state.reports],
            metrics: { ...this.state.metrics },
            isLoaded: this.state.isLoaded,
            error: this.state.error
        };
    }
}

const dashboardServiceInstance = new DashboardService();
export function subscribeDashboard(callback, onError) {
    return dashboardServiceInstance.subscribeDashboard(callback, onError);
}
export default dashboardServiceInstance;