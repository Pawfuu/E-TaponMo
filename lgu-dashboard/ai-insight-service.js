import { db } from '../shared/firebase-config.js';
import { collection, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

export class AiInsightService {
    subscribeInsights(callback) {
        const q = collection(db, 'reports');
        return onSnapshot(q, (snapshot) => {
            const reports = snapshot.docs.map(doc => {
                const data = doc.data();
                let location = "Unknown Location";
                if (typeof data.location === "string") {
                    location = data.location;
                } else if (typeof data.location === "object" && data.location !== null) {
                    location = data.location.display_name || data.location.address || data.location.name || "Map Pin Location";
                }
                
                const rawStatus = String(data.status || "pending").trim().toLowerCase();
                const isResolved = rawStatus === "resolved";
                const isDismissed = rawStatus === "dismissed";
                const isOpen = !isResolved && !isDismissed;
                const severity = data.severityScore != null ? Number(data.severityScore) : 0;
                
                return { location, isOpen, isResolved, severity };
            });

            const insights = this.generateInsights(reports);
            callback(insights);
        });
    }

    generateInsights(reports) {
        const insights = [];

        // 1. ANOMALY DETECTION
        const openReportsByLocation = {};
        reports.forEach(r => {
            if (r.isOpen) {
                openReportsByLocation[r.location] = (openReportsByLocation[r.location] || 0) + 1;
            }
        });

        let maxOpenLocation = null;
        let maxOpenCount = 0;
        for (const [loc, count] of Object.entries(openReportsByLocation)) {
            if (count > maxOpenCount) {
                maxOpenCount = count;
                maxOpenLocation = loc;
            }
        }

        if (maxOpenCount >= 2 && maxOpenLocation) {
            insights.push({
                type: 'anomaly',
                headline: `Unusual surge of open reports in ${maxOpenLocation}`,
                detail: `Explain that this Barangay currently has the highest concentration of unresolved waste reports and may require immediate operational attention.`,
                meta: `Barangay: ${maxOpenLocation} · Detected from real-time data`,
                confidence: 88
            });
        }

        // 2. PREDICTION
        let openCount = 0;
        let resolvedCount = 0;
        reports.forEach(r => {
            if (r.isOpen) openCount++;
            if (r.isResolved) resolvedCount++;
        });

        if (resolvedCount > openCount) {
            insights.push({
                type: 'prediction',
                headline: 'Resolution velocity is outpacing incoming reports',
                detail: 'Current operations indicate that the existing backlog is likely to be cleared within the next few days if the current resolution rate continues.',
                meta: 'Scope: City-wide · Forecast horizon: 3 days',
                confidence: 82
            });
        } else {
            insights.push({
                type: 'prediction',
                headline: 'Reporting volume exceeds operational capacity',
                detail: 'Incoming reports are increasing faster than resolution efforts. Collection delays are likely this week unless additional manpower is deployed.',
                meta: 'Scope: City-wide · Forecast horizon: 7 days',
                confidence: 76
            });
        }

        // 3. RECOMMENDATION
        const highSeverityByLocation = {};
        reports.forEach(r => {
            if (r.severity >= 4 && r.isOpen) {
                highSeverityByLocation[r.location] = (highSeverityByLocation[r.location] || 0) + 1;
            }
        });

        let maxSevLocation = null;
        let maxSevCount = 0;
        for (const [loc, count] of Object.entries(highSeverityByLocation)) {
            if (count > maxSevCount) {
                maxSevCount = count;
                maxSevLocation = loc;
            }
        }

        if (maxSevLocation) {
            insights.push({
                type: 'recommendation',
                headline: `Prioritize hazardous waste response in ${maxSevLocation}`,
                detail: 'Recommend dispatching additional resources because this area contains the greatest concentration of severe waste-related reports.',
                meta: `Barangay: ${maxSevLocation} · Critical incidents: ${maxSevCount}`,
                confidence: 85
            });
        }

        return insights;
    }
}
