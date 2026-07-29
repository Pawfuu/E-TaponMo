// 1. Import your globally initialized db instance
import { db } from '../../shared/firebase-config.js';

// 2. IMPORTANT: Update the version number to 10.8.0 to match your other files!
import {
    collection,
    addDoc,
    getDocs,
    doc,
    updateDoc,
    increment,
    query,
    where,
    serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

// 3. Keep your utility imports
import geohash from 'https://cdn.jsdelivr.net/npm/ngeohash@0.6.3/+esm';
import { calculateDistanceMeters } from './haversine.js';

/**
 * 1. DEDUPLICATION CHECK (Upgraded Geohash + Haversine)
 */
export async function checkForDuplicates(lat, lng, radiusMeters = 30) {
    const reportsRef = collection(db, 'reports');

    // Generate a precision 7 geohash (~150m x 150m grid box anywhere on Earth)
    const targetGeohash = geohash.encode(lat, lng, 7);

    // Pre-filter query: NO CITY RESTRICTIONS. Just look inside the geohash box.
    const q = query(
        reportsRef,
        where('geohash7', '==', targetGeohash),
        where('status', 'in', ['pending', 'Assigned', 'In Progress'])
    );

    const querySnapshot = await getDocs(q);
    let duplicateMatches = [];

    // Apply exact Haversine distance verification to the pre-filtered results
    querySnapshot.forEach((docSnapshot) => {
        const data = docSnapshot.data();
        if (data.coordinates?.lat && data.coordinates?.lng) {
            const distance = calculateDistanceMeters(
                lat, lng,
                data.coordinates.lat, data.coordinates.lng
            );
            if (distance <= radiusMeters) {
                duplicateMatches.push({ id: docSnapshot.id, distance: Math.round(distance), ...data });
            }
        }
    });

    // Sort by closest first
    duplicateMatches.sort((a, b) => a.distance - b.distance);

    return duplicateMatches.length > 0 ? duplicateMatches : null;
}

/**
 * 2. UPVOTE EXISTING REPORT
 */
export async function upvoteReport(reportId) {
    const reportRef = doc(db, 'reports', reportId);
    await updateDoc(reportRef, {
        upvotes: increment(1),
        lastUpvotedAt: serverTimestamp()
    });
}

/**
 * 3. CREATE NEW REPORT SCHEMA (Enriched with Geohash & Hedera Data)
 */
export async function createReport(reportData) {
    const reportsRef = collection(db, 'reports');

    // Compute spatial indexes for fast querying later
    const geohash7 = geohash.encode(reportData.coordinates.lat, reportData.coordinates.lng, 7);
    const geohash6 = geohash.encode(reportData.coordinates.lat, reportData.coordinates.lng, 6);

    const newReport = {
        userId: reportData.userId || 'anonymous_user',
        coordinates: reportData.coordinates,
        geohash7: geohash7,
        geohash6: geohash6,
        barangay: reportData.barangay || 'Unassigned',
        city: reportData.city || 'Quezon City',
        location: reportData.location || '',
        wasteType: reportData.wasteType,
        volumeEstimate: reportData.volumeEstimate || '',
        imageUrl: reportData.imageUrl || '',
        status: 'pending',
        upvotes: 1,
        isDuplicate: false,
        severityScore: reportData.severityScore,
        contactInfo: reportData.contactInfo || "Not Provided",
        reporterName: reportData.reporterName || "Anonymous",
        notes: reportData.notes || "",
        hashScanUrl: reportData.hashScanUrl || null,
        reportedAt: serverTimestamp(),
        resolvedAt: null
    };

    const docRef = await addDoc(reportsRef, newReport);
    return docRef.id;
}

/**
 * 4. CREATE NEW TASK SCHEMA (Unchanged)
 */
export async function createLGUTask(taskData) {
    const tasksRef = collection(db, 'tasks');
    const newTask = {
        taskCode: `TSK-${Math.floor(1000 + Math.random() * 9000)}`,
        reportId: taskData.reportId || null,
        title: taskData.title,
        barangay: taskData.barangay,
        assignedTo: taskData.assignedTo || 'Unassigned Driver',
        priority: taskData.priority || 'Medium',
        status: 'Pending',
        dueDate: taskData.dueDate || null,
        createdAt: serverTimestamp(),
        completedAt: null
    };
    const docRef = await addDoc(tasksRef, newTask);
    return docRef.id;
}