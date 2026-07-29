/**
 * Dashboard Service
 *
 * Real-time data aggregator for the LGU Administrator Portal.
 * Subscribes to the Firestore 'reports' collection and computes unified metrics.
 */

import { db } from '../shared/firebase-config.js';
import { collection, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

export class DashboardService {
    constructor() {
        this.state = {
            reports: [],
            tasks: [], // Placeholder for future feature
            barangays: [], // Placeholder for future feature
            insights: [], // Placeholder for future feature
            settings: null,
            metrics: {
                totalTasks: 0,
                completedTasks: 0,
                pendingTasks: 0,
                overdueTasks: 0,
                taskCompletionRate: 0,
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
                aiSummary: [],
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

        if (!this.isSubscribed) {
            this.startListeners(onError);
        } else if (this.state.isLoaded) {
            callback(this.getAggregatedState());
        }

        return () => {
            this.subscribers.delete(callback);
            if (this.subscribers.size === 0) {
                this.stopListeners();
            }
        };
    }

    startListeners(onError) {
        this.isSubscribed = true;

        try {
            const reportsRef = collection(db, 'reports');
            this.unsubscriber = onSnapshot(reportsRef, (snapshot) => {
                
                // FIXED: Map the documents, then STRICTLY filter out legacy data
                this.state.reports = snapshot.docs
                    .map(docSnap => this.normalizeReport(docSnap))
                    .filter(report => report.reportedAt !== null); 

                this.recalculateAndNotify();
            }, (err) => {
                console.error("DashboardService - Reports Listener Error:", err);
                this.state.error = err;
                if (onError) onError(err);
                this.notifySubscribers();
            });
        } catch (err) {
            console.error("DashboardService - Failed to attach reports listener:", err);
            this.state.error = err;
            if (onError) onError(err);
        }
    }

    stopListeners() {
        if (typeof this.unsubscriber === 'function') {
            this.unsubscriber();
        }
        this.unsubscriber = null;
        this.isSubscribed = false;
    }

   normalizeReport(docSnap) {
        const data = docSnap.data();
        
        // Safely extract location and barangay from our Phase 1 updates
        const safeLocation = data.location || "Unknown Location";
        const barangay = data.barangay || "Unassigned";

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
            wasteType: data.wasteType || "Uncategorized",
            location: safeLocation,
            barangay: barangay, // Phase 1 field
            coordinates: data.coordinates || null,
            submittedBy: data.reporterName || "Anonymous",
            contactInfo: data.contactInfo || "Not Provided",
            status: uiStatus,
            rawStatus: rawStatus,
            aiVolume: data.volumeEstimate || "N/A",
            severity: data.severityScore != null ? Number(data.severityScore) : 0,
            upvotes: data.upvotes || 1, // Phase 1 duplicate counter
            notes: data.notes || "",
            imageUrl: data.imageUrl || null,
            // FIXED: Map reportedAt from Phase 1 DB instead of createdAt
            reportedAt: data.reportedAt?.toDate?.() || null, 
            hashScanUrl: data.hashScanUrl || null,
            dismissalReason: data.dismissalReason || "",
        };
    }

    recalculateAndNotify() {
        const reports = this.state.reports;

        // Reports Aggregation
        const totalReports = reports.length;
        const activeReports = reports.filter(r => r.status !== "Resolved" && r.status !== "Dismissed").length;
        const reportsResolved = reports.filter(r => r.status === "Resolved").length;
        const pendingReports = reports.filter(r => r.status === "Pending Verification").length;
        const criticalReports = reports.filter(r => r.severity >= 4 && r.status !== "Resolved").length;
        const reportCompletionRate = totalReports > 0 ? Math.round((reportsResolved / totalReports) * 100) : 0;

        // FIXED: Sort reports by reportedAt desc
        const sortedReports = [...reports].sort((a, b) => {
            const ta = a.reportedAt ? a.reportedAt.getTime() : 0;
            const tb = b.reportedAt ? b.reportedAt.getTime() : 0;
            return tb - ta;
        });

        // Waste Statistics Breakdown
        const wasteStats = {};
        reports.forEach(r => {
            const cat = r.category || "Uncategorized";
            wasteStats[cat] = (wasteStats[cat] || 0) + 1;
        });

        // Dynamic Barangay Summary using the dedicated barangay field
        const barangayMap = {};
        reports.forEach(r => {
            const loc = r.barangay; 
            if (!barangayMap[loc]) {
                barangayMap[loc] = { total: 0, resolved: 0 };
            }
            barangayMap[loc].total++;
            if (r.status === "Resolved") barangayMap[loc].resolved++;
        });

        let barangaySummary = Object.keys(barangayMap).map(loc => {
            const stats = barangayMap[loc];
            const rate = stats.total > 0 ? Math.round((stats.resolved / stats.total) * 100) : 0;
            return {
                name: loc,
                total: stats.total,
                resolved: stats.resolved,
                rate,
                status: rate >= 80 ? "ok" : rate >= 60 ? "watch" : "critical"
            };
        });

        barangaySummary.sort((a, b) => b.rate - a.rate);
        const topBarangays = barangaySummary.slice(0, 5);
        const lowestBarangays = [...barangaySummary].reverse().slice(0, 5);

        const recentActivities = sortedReports.slice(0, 5).map(r => ({
            id: r.id,
            type: 'report',
            title: `Report #${r.id} (${r.category})`,
            subtitle: r.location,
            status: r.status,
            timestamp: r.reportedAt
        }));

        this.state.metrics = {
            totalTasks: 0,
            completedTasks: 0,
            pendingTasks: 0,
            overdueTasks: 0,
            taskCompletionRate: 0,
            totalReports,
            activeReports,
            reportsResolved,
            pendingReports,
            criticalReports,
            reportCompletionRate,
            wasteStats,
            barangaySummary,
            topBarangays,
            lowestBarangays,
            aiSummary: [],
            recentActivities,
            latestReports: sortedReports.slice(0, 10)
        };

        this.state.isLoaded = true;
        this.notifySubscribers();
    }

    notifySubscribers() {
        const payload = this.getAggregatedState();
        this.subscribers.forEach(cb => {
            try {
                cb(payload);
            } catch (err) {
                console.error("DashboardService - Subscriber callback error:", err);
            }
        });
    }

    getAggregatedState() {
        return {
            reports: [...this.state.reports],
            tasks: [...this.state.tasks],
            barangays: [...this.state.barangays],
            insights: [...this.state.insights],
            settings: this.state.settings ? { ...this.state.settings } : null,
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