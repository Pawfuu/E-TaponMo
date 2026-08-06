import { GoogleAuthProvider, signInWithPopup } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { auth, APP_CONFIG } from "./firebase-config.js";

const googleProvider = new GoogleAuthProvider();

let currentUser = null;

/**
 * Handles Google Login with Demo Mode fallback
 */
export async function handleGoogleLogin() {
    // -------------------------------------------------------------
    // PATH A: DEMO MODE (Stage Pitch - Bypasses OAuth Popup)
    // -------------------------------------------------------------
    if (APP_CONFIG.IS_DEMO_MODE) {
        console.log("⚡ [DEMO MODE ACTIVE]: Bypassing Google OAuth Popup");

        // Simulate 0.5s loading state for realistic UI feel
        await new Promise((resolve) => setTimeout(resolve, 500));

        currentUser = APP_CONFIG.DEMO_USER;
        onLoginSuccess(currentUser);
        return currentUser;
    }

    // -------------------------------------------------------------
    // PATH B: REAL GOOGLE AUTH (Public / Production)
    // -------------------------------------------------------------
    try {
        const result = await signInWithPopup(auth, googleProvider);
        const user = result.user;

        currentUser = {
            uid: user.uid,
            displayName: user.displayName,
            email: user.email,
            photoURL: user.photoURL,
            isVerified: false
        };

        onLoginSuccess(currentUser);
        return currentUser;
    } catch (error) {
        console.error("Google Authentication Failed:", error);
        alert("Authentication failed. Please try again.");
    }
}

/**
 * Updates UI and stores session locally
 */
function onLoginSuccess(user) {
    localStorage.setItem("etaponmo_user", JSON.stringify(user));

    // NEW: Target the wrapper instead of just the single button
    const authWrapper = document.getElementById("auth-buttons-wrapper");
    const userProfile = document.getElementById("user-profile");
    const userName = document.getElementById("user-name");
    const userEmail = document.getElementById("user-email");

    // Hide all login buttons and show the ID badge
    if (authWrapper) authWrapper.classList.add("hidden");
    if (userProfile) userProfile.classList.remove("hidden");

    if (userName) userName.textContent = user.displayName;
    if (userEmail) userEmail.textContent = user.email;
}