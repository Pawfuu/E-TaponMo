import { db } from '../shared/firebase-config.js';
import { collection, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

export class BarangayService {
    subscribeBarangays(callback) {
        const barangaysRef = collection(db, 'barangays');
        return onSnapshot(barangaysRef, (snapshot) => {
            const barangays = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            callback(barangays);
        });
    }
}
