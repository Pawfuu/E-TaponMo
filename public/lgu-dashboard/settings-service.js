import { db } from '../shared/firebase-config.js';
import { doc, onSnapshot, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

export class SettingsService {
    constructor() {
        this.docRef = doc(db, 'settings', 'system');
    }

    subscribeSettings(callback) {
        return onSnapshot(this.docRef, (docSnap) => {
            if (docSnap.exists()) {
                callback(docSnap.data());
            } else {
                callback(this.getDefaultSettings());
            }
        }, (error) => {
            console.error("Error fetching settings:", error);
        });
    }

    async saveSettings(data) {
        try {
            const payload = {
                ...data,
                updatedAt: serverTimestamp()
            };
            
            // Remove transient UI properties
            if (payload.photoFile) delete payload.photoFile;
            if (payload.newPassword) delete payload.newPassword;

            await setDoc(this.docRef, payload, { merge: true });
            return true;
        } catch (error) {
            console.error("Error saving settings:", error);
            throw error;
        }
    }

    async updateSetting(field, value) {
        try {
            const payload = {
                [field]: value,
                updatedAt: serverTimestamp()
            };
            await setDoc(this.docRef, payload, { merge: true });
            return true;
        } catch (error) {
            console.error(`Error updating setting ${field}:`, error);
            throw error;
        }
    }

    getDefaultSettings() {
        return {
            fullName: 'Maria Santos',
            email: 'maria.santos@etaponmo.gov.ph',
            barangay: 'Poblacion',
            notifications: {
                critical: true,
                daily: true,
                weekly: true,
                sms: false
            },
            twoFactor: false,
            preferences: {
                dashboardView: 'Barangay Performance',
                reportingWindow: 'Rolling 7 days',
                units: 'Kilograms',
                retention: '12 months'
            },
            systemName: "E-Tapon Mo Admin",
            municipality: "",
            province: "",
            contactEmail: "",
            contactNumber: "",
            logoUrl: "",
            notificationsEnabled: true,
            maintenanceMode: false
        };
    }
}
