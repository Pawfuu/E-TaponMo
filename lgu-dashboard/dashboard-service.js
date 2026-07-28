/**
 * Dashboard Service
 *
 * Real-time data aggregator for the LGU Administrator Portal.
 * Subscribes to Firestore collections (reports, tasks, barangays, settings, AI insights)
 * using onSnapshot() and computes unified metrics for UI consumption.
 */

import { db } from '../shared/firebase-config.js';
import { collection, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { TaskService } from './task-service.js';
import { BarangayService } from './barangay-service.js';
import { AiInsightService } from './ai-insight-service.js';
import { SettingsService } from './settings-service.js';

export class DashboardService {
    constructor() {
        this.taskService = new TaskService();
        this.barangayService = new BarangayService();
        this.aiInsightService = new AiInsightService();
        this.settingsService = new SettingsService();

        this.state = {
            reports: [],
            tasks: [],
            barangays: [],
            insights: [],
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
        this.unsubscribers = [];
        this.isSubscribed = false;
    }

    /**
     * Subscribe to real-time dashboard data changes.
     * @param {Function} callback Function invoked whenever dashboard data changes
     * @param {Function} [onError] Optional error callback for Firestore subscription errors
     * @returns {Function} Unsubscribe function
     */
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

        // 1. Subscribe to Reports Collection
        try {
            const reportsRef = collection(db, 'reports');
            const unsubReports = onSnapshot(reportsRef, (snapshot) => {
                this.state.reports = snapshot.docs.map(docSnap => this.normalizeReport(docSnap));
                this.recalculateAndNotify();
            }, (err) => {
                console.error("DashboardService - Reports Listener Error:", err);
                this.state.error = err;
                if (onError) onError(err);
                this.notifySubscribers();
            });
            this.unsubscribers.push(unsubReports);
        } catch (err) {
            console.error("DashboardService - Failed to attach reports listener:", err);
            this.state.error = err;
            if (onError) onError(err);
        }

        // 2. Subscribe to Tasks (via TaskService)
        try {
            const unsubTasks = this.taskService.subscribeTasks((tasks) => {
                this.state.tasks = tasks || [];
                this.recalculateAndNotify();
            });
            if (typeof unsubTasks === 'function') this.unsubscribers.push(unsubTasks);
        } catch (err) {
            console.warn("DashboardService - TaskService subscription fallback:", err);
        }

        // 3. Subscribe to Barangays (via BarangayService)
        try {
            const unsubBarangays = this.barangayService.subscribeBarangays((barangays) => {
                this.state.barangays = barangays || [];
                this.recalculateAndNotify();
            });
            if (typeof unsubBarangays === 'function') this.unsubscribers.push(unsubBarangays);
        } catch (err) {
            console.warn("DashboardService - BarangayService subscription fallback:", err);
        }

        // 4. Subscribe to AI Insights (via AiInsightService)
        try {
            const unsubInsights = this.aiInsightService.subscribeInsights((insights) => {
                this.state.insights = insights || [];
                this.recalculateAndNotify();
            });
            if (typeof unsubInsights === 'function') this.unsubscribers.push(unsubInsights);
        } catch (err) {
            console.warn("DashboardService - AiInsightService subscription fallback:", err);
        }

        // 5. Subscribe to Settings (via SettingsService)
        try {
            const unsubSettings = this.settingsService.subscribeSettings((settings) => {
                this.state.settings = settings || {};
                this.recalculateAndNotify();
            });
            if (typeof unsubSettings === 'function') this.unsubscribers.push(unsubSettings);
        } catch (err) {
            console.warn("DashboardService - SettingsService subscription fallback:", err);
        }
    }

    stopListeners() {
        this.unsubscribers.forEach(unsub => {
            if (typeof unsub === 'function') unsub();
        });
        this.unsubscribers = [];
        this.isSubscribed = false;
    }

    normalizeReport(docSnap) {
        const data = docSnap.data();
        let safeLocation = "Unknown Location";
        if (typeof data.location === "string") {
            safeLocation = data.location;
        } else if (typeof data.location === "object" && data.location !== null) {
            safeLocation = data.location.display_name || data.location.address || data.location.name || "Map Pin Location";
        }

        const rawStatus = String(data.status || "pending").trim().toLowerCase();
        let uiStatus = "Pending Verification";
        if (rawStatus === "resolved") uiStatus = "Resolved";
        else if (rawStatus === "in progress" || rawStatus === "in_progress") uiStatus = "In Progress";
        else if (rawStatus === "dismissed") uiStatus = "Dismissed";

        const rawCategory = data.wasteType;
        let category = "Uncategorized";
        if (rawCategory) {
            const cat = String(rawCategory).trim().toLowerCase();
            const legacyMapping = {
                "organic": "Recyclable",
                "plastic": "Non-recyclable",
                "construction": "Hazardous Waste",
                "mixed": "Nabubulok"
            };
            category = legacyMapping[cat] || (rawCategory.charAt(0).toUpperCase() + rawCategory.slice(1));
        }

        return {
            docId: docSnap.id,
            reportId: docSnap.id,
            id: docSnap.id.slice(0, 8).toUpperCase(),
            category: category,
            wasteType: data.wasteType || category,
            location: safeLocation,
            coordinates: data.coordinates || null,
            submittedBy: data.reporterName || "Anonymous",
            contactInfo: data.contactInfo || "Not Provided",
            status: uiStatus,
            rawStatus: rawStatus,
            aiVolume: data.volumeEstimate || "N/A",
            severity: data.severityScore != null ? Number(data.severityScore) : 0,
            notes: data.notes || "",
            imageUrl: data.imageUrl || null,
            createdAt: data.createdAt?.toDate?.() || null,
            hashScanUrl: data.hashScanUrl || null,
            dismissalReason: data.dismissalReason || "",
        };
    }

    recalculateAndNotify() {
        const reports = this.state.reports;
        const tasks = this.state.tasks;
        const barangays = this.state.barangays;

        // Task Aggregation
        const totalTasks = tasks.length;
        const completedTasks = tasks.filter(t => (t.status || '').toLowerCase() === 'completed').length;
        const overdueTasks = tasks.filter(t => (t.status || '').toLowerCase() === 'overdue').length;
        const pendingTasks = tasks.filter(t => {
            const s = (t.status || '').toLowerCase();
            return s === 'pending' || s === 'in progress' || s === 'assigned' || s === 'planning';
        }).length;
        const taskCompletionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

        // Reports Aggregation
        const totalReports = reports.length;
        const activeReports = reports.filter(r => r.status !== "Resolved" && r.status !== "Dismissed").length;
        const reportsResolved = reports.filter(r => r.status === "Resolved").length;
        const pendingReports = reports.filter(r => r.status === "Pending Verification").length;
        const criticalReports = reports.filter(r => r.severity >= 4 && r.status !== "Resolved").length;
        const reportCompletionRate = totalReports > 0 ? Math.round((reportsResolved / totalReports) * 100) : 0;

        // Sort reports by createdAt desc
        const sortedReports = [...reports].sort((a, b) => {
            const ta = a.createdAt ? a.createdAt.getTime() : 0;
            const tb = b.createdAt ? b.createdAt.getTime() : 0;
            return tb - ta;
        });

        // Waste Statistics Breakdown
        const wasteStats = {};
        reports.forEach(r => {
            const cat = r.category || "Uncategorized";
            wasteStats[cat] = (wasteStats[cat] || 0) + 1;
        });

        // Barangay Performance Summary
        const barangayMap = {};
        reports.forEach(r => {
            const loc = r.location || "Unknown Location";
            if (!barangayMap[loc]) {
                barangayMap[loc] = { total: 0, resolved: 0 };
            }
            barangayMap[loc].total++;
            if (r.status === "Resolved") barangayMap[loc].resolved++;
        });

        let barangaySummary = barangays.map(b => {
            const name = b.name || "Unknown";
            const stats = barangayMap[name] || { total: b.total || 0, resolved: b.resolved || 0 };
            const rate = stats.total > 0 ? Math.round((stats.resolved / stats.total) * 100) : (b.rate || 0);
            return {
                name,
                total: stats.total,
                resolved: stats.resolved,
                rate,
                status: b.status || (rate >= 80 ? "ok" : rate >= 60 ? "watch" : "critical")
            };
        });

        if (barangaySummary.length === 0) {
            barangaySummary = Object.keys(barangayMap).map(loc => {
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
        }

        barangaySummary.sort((a, b) => b.rate - a.rate);
        const topBarangays = barangaySummary.slice(0, 5);
        const lowestBarangays = [...barangaySummary].reverse().slice(0, 5);

        // Combined Recent Activities
        const recentActivities = [
            ...sortedReports.slice(0, 5).map(r => ({
                id: r.id,
                type: 'report',
                title: `Report #${r.id} (${r.category})`,
                subtitle: r.location,
                status: r.status,
                timestamp: r.createdAt
            })),
            ...tasks.slice(0, 5).map(t => ({
                id: t.id,
                type: 'task',
                title: t.title || `Task #${t.id}`,
                subtitle: t.barangay || t.assignee || '',
                status: t.status,
                timestamp: null
            }))
        ];

        this.state.metrics = {
            totalTasks,
            completedTasks,
            pendingTasks,
            overdueTasks,
            taskCompletionRate,
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
            aiSummary: this.state.insights,
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
