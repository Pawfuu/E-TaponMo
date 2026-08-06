import { storage } from "./firebase-config.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";
import { logReportOnChain } from "../user-app/js/hedera-logger.js";
import { checkForDuplicates, createReport } from "../src/utils/db.js";
import { reverseGeocodeQC } from "../src/utils/geocoding.js";

function uniqueReportFilename(imageFile) {
  const ext = imageFile.name?.includes(".") ? imageFile.name.split(".").pop() : "jpg";
  const randomSuffix = Math.random().toString(36).slice(2, 8);
  return `${Date.now()}-${randomSuffix}.${ext}`;
}

export async function submitTrashReport(reportData, imageFile) {
  const lat = reportData.coordinates?.lat;
  const lng = reportData.coordinates?.lng;

  if (!lat || !lng) throw new Error("Coordinates are required.");

  // 1. Get Barangay and City via Reverse Geocoding
  const geoData = await reverseGeocodeQC(lat, lng);
  reportData.barangay = geoData.barangay;
  reportData.city = geoData.city;

  // 2. Check for Duplicates BEFORE uploading anything
  // If the user actively chose to bypass, skip duplicate checking.
  if (!reportData.bypassDuplicateCheck) {
    const duplicates = await checkForDuplicates(lat, lng, 50);

    if (duplicates) {
      return {
        status: 'duplicate_found',
        existingReports: duplicates
      };
    }
  }

  // 3. If no duplicate or check bypassed, proceed to upload Image to Storage
  const filename = uniqueReportFilename(imageFile);
  const storageRef = ref(storage, `reports/${filename}`);
  await uploadBytes(storageRef, imageFile);
  const imageUrl = await getDownloadURL(storageRef);
  reportData.imageUrl = imageUrl;

  // ==========================================
  // NEW: INJECT GOOGLE AUTH DATA
  // ==========================================
  const activeUser = JSON.parse(localStorage.getItem("etaponmo_user"));
  if (activeUser) {
    reportData.userId = activeUser.uid;
    reportData.reporterName = activeUser.displayName;
    reportData.contactInfo = activeUser.email;
  } else {
    throw new Error("Critical Error: Unauthorized user attempted to submit a report.");
  }

  // 4. Package metadata for Hedera and log it
  const severityScore = reportData.severityScore != null ? Number(reportData.severityScore) : 3;
  const hederaPayload = {
    aiSeverityScore: severityScore,
    category: reportData.wasteType,
    lat: lat,
    lng: lng,
    statusUpdate: "pending"
  };
  const hashScanUrl = await logReportOnChain(hederaPayload);
  reportData.hashScanUrl = hashScanUrl;
  reportData.severityScore = severityScore;

  // 5. Save everything to Firestore using our updated Geohash schema
  const docId = await createReport(reportData);

  return {
    status: 'success',
    reportId: docId
  };
}