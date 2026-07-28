import { db, storage } from "./firebase-config.js";
import {
  ref,
  uploadBytes,
  getDownloadURL,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";
import {
  collection,
  addDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// ADD THIS IMPORT SO THE SCRIPT KNOWS HOW TO LOG TO THE BLOCKCHAIN
import { logReportOnChain } from "../user-app/js/hedera-logger.js";

// MISSING HELPER FUNCTION RESTORED
function uniqueReportFilename(imageFile) {
  const ext = imageFile.name?.includes(".")
    ? imageFile.name.split(".").pop()
    : "jpg";
  const randomSuffix = Math.random().toString(36).slice(2, 8);
  return `${Date.now()}-${randomSuffix}.${ext}`;
}

/**
 * Uploads a trash report image and persists metadata to Firestore and Hedera.
 *
 * @param {object} reportData - { wasteType, volumeEstimate, location, coordinates, contactInfo, reporterName, notes, severityScore }
 * @param {File} imageFile - Raw image file from a file input
 * @returns {Promise<string>} Firestore document ID
 */
export async function submitTrashReport(reportData, imageFile) {

  const filename = uniqueReportFilename(imageFile);
  const storageRef = ref(storage, `reports/${filename}`);

  // 1. Upload Image to Storage
  await uploadBytes(storageRef, imageFile);
  const imageUrl = await getDownloadURL(storageRef);

  // 2. Package metadata for the Blockchain
  const hederaPayload = {
    aiSeverityScore: reportData.severityScore != null ? Number(reportData.severityScore) : 3,
    category: reportData.wasteType,
    lat: reportData.coordinates?.lat || null,
    lng: reportData.coordinates?.lng || null,
    statusUpdate: "pending" // Initial status for new reports
  };

  // 3. Log to Hedera and get the HashScan URL
  const hashScanUrl = await logReportOnChain(hederaPayload);

  // 4. Save everything to Firestore
  const docRef = await addDoc(collection(db, "reports"), {
    imageUrl: imageUrl,
    wasteType: reportData.wasteType,
    volumeEstimate: reportData.volumeEstimate,
    location: reportData.location,
    coordinates: reportData.coordinates || null,
    status: "pending", // Always default to pending
    contactInfo: reportData.contactInfo || "Not Provided",
    reporterName: reportData.reporterName,
    notes: reportData.notes || "",
    severityScore: reportData.severityScore != null ? Number(reportData.severityScore) : 3,
    createdAt: serverTimestamp(),
    hashScanUrl: hashScanUrl || null // Attach the blockchain receipt here!
  });

  return docRef.id;
}