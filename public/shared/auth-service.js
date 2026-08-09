import {
    getAuth,
    GoogleAuthProvider,
    signInWithCredential,
    signOut
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { auth, APP_CONFIG } from "./firebase-config.js";

// Your exact Web Client ID from the Firebase Console
const GOOGLE_CLIENT_ID = "642996076812-qgtmuplt6unm393cp9eva686odp6tdk1.apps.googleusercontent.com";

let currentUser = null;

// ==========================================
// KIOSK MODE: INSTANT WIPE ON LOAD
// ==========================================
// Because GIS handles login directly on the page, we can safely and 
// aggressively wipe the session every single time the page is refreshed or opened.
export async function forceResetSession() {
    localStorage.removeItem("etaponmo_user");
    currentUser = null;

    const authWrapper = document.getElementById("auth-buttons-wrapper");
    const userProfile = document.getElementById("user-profile");

    if (authWrapper) authWrapper.classList.remove("hidden");
    if (userProfile) userProfile.classList.add("hidden");

    try {
        await signOut(auth);
    } catch (e) {
        // Ignore signout errors on load
    }
}

// Run the wipe instantly on script load
forceResetSession();

// ==========================================
// GOOGLE IDENTITY SERVICES (GIS) HANDLER
// ==========================================
/**
 * Runs natively when Google finishes authenticating the user inside the iframe.
 */
async function handleCredentialResponse(response) {
    try {
        // 1. Take the JWT token from Google
        const idToken = response.credential;

        // 2. Wrap it into a Firebase Credential
        const credential = GoogleAuthProvider.credential(idToken);

        // 3. Sign into Firebase silently
        const result = await signInWithCredential(auth, credential);
        const user = result.user;

        currentUser = {
            uid: user.uid,
            displayName: user.displayName || "Verified Citizen",
            email: user.email,
            photoURL: user.photoURL || "",
            isVerified: true
        };

        onLoginSuccess(currentUser);
    } catch (error) {
        console.error("GIS Authentication Failed:", error);
        alert("Authentication failed. Please try again.");
    }
}

/**
 * Renders the Google Button onto the page
 */
export function initializeGoogleAuth() {
    if (APP_CONFIG && APP_CONFIG.IS_DEMO_MODE) {
        console.log("⚡ [DEMO MODE ACTIVE]: Bypassing Google OAuth");
        const container = document.getElementById("google-btn-container");
        if (container) {
            container.innerHTML = `<button id="demo-login-btn" class="w-full bg-white text-gray-800 border border-gray-200 py-3 rounded-full font-bold shadow hover:bg-gray-50 transition-all">Sign in with Google (Demo)</button>`;
            document.getElementById("demo-login-btn").addEventListener("click", async () => {
                await new Promise(r => setTimeout(r, 500));
                onLoginSuccess(APP_CONFIG.DEMO_USER);
            });
        }
        return;
    }

    // A smart loop that waits until Google's script has fully loaded before rendering
    const checkAndRenderGoogleBtn = () => {
        if (window.google && window.google.accounts && window.google.accounts.id) {
            google.accounts.id.initialize({
                client_id: GOOGLE_CLIENT_ID,
                callback: handleCredentialResponse,
            });

            google.accounts.id.renderButton(
                document.getElementById("google-btn-container"),
                { theme: "outline", size: "large", width: 280, shape: "pill" }
            );
        } else {
            // If it hasn't loaded yet, check again in 100 milliseconds
            setTimeout(checkAndRenderGoogleBtn, 100);
        }
    };

    // Start the loading check
    checkAndRenderGoogleBtn();
}

/**
 * Updates UI and stores session locally
 */
function onLoginSuccess(user) {
    localStorage.setItem("etaponmo_user", JSON.stringify(user));

    const authWrapper = document.getElementById("auth-buttons-wrapper");
    const userProfile = document.getElementById("user-profile");
    const userName = document.getElementById("user-name");
    const userEmail = document.getElementById("user-email");

    if (authWrapper) authWrapper.classList.add("hidden");
    if (userProfile) userProfile.classList.remove("hidden");

    if (userName) userName.textContent = user.displayName;
    if (userEmail) userEmail.textContent = user.email;

    // Trigger stepper update
    const categoryEl = document.getElementById("waste-category");
    if (categoryEl) {
        categoryEl.dispatchEvent(new Event('change'));
    }
}