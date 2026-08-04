import { db } from '../shared/firebase-config.js';
import { collection, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

export class TaskService {
    constructor() {
        this.CURRENT_USER = 'Maria Santos';

        this.barangayCounts = [
            { name: 'Brgy. 430', count: 12, level: 'High' },
            { name: 'Brgy. 291', count: 7, level: 'Medium' },
            { name: 'Brgy. 630', count: 6, level: 'Medium' },
            { name: 'Brgy. 176', count: 4, level: 'Low' },
            { name: 'Brgy. 92', count: 3, level: 'Low' },
        ];

        this.STAT_TOTAL = 124;
        this.STAT_ASSIGNED = 68;
        this.STAT_OVERDUE = 9;
        this.STAT_COMPLETED = 47;

        this.overview = [
            { label: 'In Progress', value: 34, color: '#3b82f6' },
            { label: 'Pending', value: 27, color: '#f59e0b' },
            { label: 'Assigned', value: 24, color: '#6366f1' },
            { label: 'Overdue', value: 9, color: '#e11d48' },
            { label: 'Planning', value: 6, color: '#94a3b8' },
        ];
    }

    async getCurrentUser() {
        return this.CURRENT_USER;
    }

    subscribeTasks(callback) {
        const tasksRef = collection(db, 'tasks');
        return onSnapshot(tasksRef, (snapshot) => {
            const tasks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            callback(tasks);
        });
    }

    async getBarangayCounts() {
        return [...this.barangayCounts];
    }

    async getStats() {
        return {
            total: this.STAT_TOTAL,
            assigned: this.STAT_ASSIGNED,
            overdue: this.STAT_OVERDUE,
            completed: this.STAT_COMPLETED
        };
    }

    async getOverview() {
        return [...this.overview];
    }
}
