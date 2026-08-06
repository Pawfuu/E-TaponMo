/**
 * Example Firebase config — safe to commit.
 *
 * Setup:
 * 1. Copy this file to shared/firebase-config.js
 * 2. Replace the placeholder values with your Firebase project settings
 *    (Firebase Console → Project settings → Your apps → Web app config)
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

const firebaseConfig = { // Replace with your actual Firebase project settings
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: "",
  measurementId: "",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

export { auth, db, storage };

// ==========================================
// DEMO MODE CONFIGURATION
// ==========================================
export const APP_CONFIG = {
  // Set to TRUE for live stage pitch (instant 0.5s demo login)
  // Set to FALSE when deploying public links (forces real Google Auth)
  IS_DEMO_MODE: true,

  // Pre-configured test user for stage demos
  DEMO_USER: {
    uid: "demo_citizen_qc_001",
    displayName: "Juan Dela Cruz",
    email: "juan.delacruz.demo@gmail.com",
    photoURL: "https://lh3.googleusercontent.com/a/default-user",
    isVerified: true,
    barangay: "Brgy. Maligaya"
  }
};