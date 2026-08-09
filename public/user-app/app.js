// ==========================================
// 1. IMPORTS & CONFIG
// ==========================================

/**
 * Basura-Pin — Photo capture & Gemini AI validation
 *
 * Flow:
 * 1. User snaps a photo → preview only (no API call)
 * 2. User fills reporter fields (optional) and clicks Submit
 * 3. Image + prompt sent to Gemini 3.1 Flash Lite
 * 4. Success/error flash modals + AI summary update
 */

import { GEMINI_API_KEY } from "./config.js";
import { submitTrashReport } from "../shared/report-service.js";
import { upvoteReport } from "../src/utils/db.js";
// ADD AUTH SERVICE IMPORT HERE
import { initializeGoogleAuth } from "../shared/auth-service.js";

// ---------------------------------------------------------------------------
// API configuration
// Key lives in gitignored config.js — see config.example.js for setup.
// ---------------------------------------------------------------------------
const GEMINI_MODEL = "gemini-3.1-flash-lite";
const REQUEST_TIMEOUT_MS = 45000;

const API_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=` +
  GEMINI_API_KEY;

/** Base validator prompt — reporter notes appended at submit time if provided */
const VALIDATOR_PROMPT_BASE =
  'Analyze this image for any visible trash, garbage, or litter. ' +
  'Step 1: If there is absolutely NO trash visible, return the exact JSON: `{"valid": false, "error": "No waste detected"}`. ' +
  'Step 2: If ANY trash is visible, return valid: true. Estimate the volume using recognizable metrics (e.g., "Sack-sized", "1-2 cubic meters", "Small pile", "Loose litter"). ' +
  'Step 3: Rate the severity score from 1 (minor litter/contained in bin) to 5 (critical block of road/drainage or massive dumpsite). Return JSON: `{"valid": true, "volume": "[estimate]", "severity_score": [1-5]}`.';

// ==========================================
// 2. DOM ELEMENTS & STATE
// ==========================================

// DOM references
const photoInput = document.getElementById("trash-photo-input");
const summaryEl = document.getElementById("ai-summary");
const submitBtn = document.getElementById("submit-report-btn");
const submitSpinner = document.getElementById("submit-spinner");
const submitText = document.getElementById("submit-text");
const reporterName = document.getElementById("reporter-name");
const wasteCategory = document.getElementById("waste-category");
const contactInfo = document.getElementById("reporter-contact");
const reporterNotes = document.getElementById("reporter-notes");

if (!photoInput || !summaryEl || !submitBtn) {
  console.error(
    "Basura-Pin: Required elements (#trash-photo-input, #ai-summary, #submit-report-btn) not found.",
  );
}

// In-memory state for the selected photo (used on submit)
let selectedFile = null;
let previewObjectUrl = null;
let isSubmitting = false;
let isReportComplete = false;

// Map state
let finalCoordinates = null;
let finalAddress = "";
let mapInstance = null;
let mapMarker = null;

// ---------------------------------------------------------------------------
// Startup: validate API key configuration
// ---------------------------------------------------------------------------
function isApiKeyConfigured() {
  try {
    return (
      typeof GEMINI_API_KEY === "string" &&
      GEMINI_API_KEY.trim().length > 0 &&
      GEMINI_API_KEY !== "YOUR_GEMINI_API_KEY_HERE"
    );
  } catch (e) {
    return false;
  }
}

try {
  if (!isApiKeyConfigured()) {
    console.error(
      "Basura-Pin: Missing API key. Copy config.example.js to config.js and add your Gemini key.",
    );
    if (summaryEl) {
      summaryEl.textContent =
        "App configuration incomplete. Copy config.example.js to config.js and add your Gemini API key.";
    }
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.classList.add("opacity-70", "cursor-not-allowed");
    }
  }
} catch (e) {
  console.warn("Config check failed:", e);
}

// ---------------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------------

/** Plain-text update for #ai-summary */
function setSummary(message) {
  if (summaryEl) {
    summaryEl.textContent = message;
  }
}

/** HTML update for image preview inside #ai-summary */
function setSummaryHtml(html) {
  if (summaryEl) {
    summaryEl.innerHTML = html;
  }
}

/** Toggle submit button loading state + spinner visibility */
function setSubmitLoading(isLoading) {
  if (!submitBtn) return;

  submitBtn.disabled = isLoading || !isApiKeyConfigured();
  submitBtn.classList.toggle("opacity-70", isLoading);
  submitBtn.classList.toggle("cursor-not-allowed", isLoading);
  submitBtn.classList.toggle("hover:scale-[1.02]", !isLoading);

  if (submitSpinner) {
    submitSpinner.classList.toggle("hidden", !isLoading);
  }
  if (submitText) {
    submitText.textContent = isLoading ? "Analyzing..." : "Submit Trash Report";
  }
}

// ---------------------------------------------------------------------------
// Stepper Logic
// ---------------------------------------------------------------------------

/** Dynamically updates the visual progress bar based on form state */
function updateStepper() {
  let activeStep = 1; // Default to step 1

  const categoryEl = document.getElementById("waste-category");
  // Look for the user profile badge instead of the contact form
  const userProfileEl = document.getElementById("user-profile");
  const isUserLoggedIn = userProfileEl && !userProfileEl.classList.contains("hidden");

  // Logic to determine the current step
  if (selectedFile) {
    activeStep = 2; // Photo uploaded
  }

  // Step 3 is complete if they selected a category AND logged in
  if (selectedFile && categoryEl?.value && isUserLoggedIn) {
    activeStep = 3;
  }

  // Keep at step 4 if submitting OR if the report is finished
  if (isSubmitting || isReportComplete) {
    activeStep = 4;
  }

  const steps = document.querySelectorAll(".stepper-step");
  const progressBar = document.getElementById("stepper-progress-bar");

  // Calculate width for the connecting line (0%, 33.3%, 66.6%, 100%)
  if (progressBar && steps.length > 1) {
    const progressPercentage = ((activeStep - 1) / (steps.length - 1)) * 100;
    progressBar.style.width = `${progressPercentage}%`;
  }

  // Toggle Tailwind classes for active/inactive states
  steps.forEach((stepEl, index) => {
    const stepNum = index + 1;
    const circle = stepEl.querySelector(".step-circle");
    const label = stepEl.querySelector(".step-label");

    if (stepNum <= activeStep) {
      // Completed or Current Step
      circle.classList.remove("bg-gray-200", "text-gray-500");
      circle.classList.add("bg-green-700", "text-white");
      label.classList.remove("text-gray-400", "font-semibold");
      label.classList.add("text-green-800", "font-bold");
    } else {
      // Inactive Future Step
      circle.classList.remove("bg-green-700", "text-white");
      circle.classList.add("bg-gray-200", "text-gray-500");
      label.classList.remove("text-green-800", "font-bold");
      label.classList.add("text-gray-400", "font-semibold");
    }
  });
}

// Event Listeners to trigger stepper updates dynamically
if (photoInput) photoInput.addEventListener("change", updateStepper);
document
  .getElementById("waste-category")
  ?.addEventListener("change", updateStepper);
document
  .getElementById("reporter-contact")
  ?.addEventListener("input", updateStepper);

/** Read optional reporter fields from the form */
function getReporterData() {
  return {
    name: reporterName ? reporterName.value.trim() : "",
    notes: reporterNotes ? reporterNotes.value.trim() : "",
  };
}

/** Read report fields used for Firestore submission */
function getReportFormData() {
  const contact = contactInfo ? contactInfo.value.trim() : "";
  return {
    wasteType: wasteCategory ? wasteCategory.value : "",
    contactInfo: contact || null,
  };
}

/** Resolve location from URL params or the header display */
function getReportLocation() {
  const params = new URLSearchParams(window.location.search);
  const barangay = params.get("barangay");
  const street = params.get("street");

  if (barangay && street) {
    return "Brgy " + barangay + ", " + street;
  }
  if (barangay) {
    return "Brgy " + barangay;
  }
  if (street) {
    return street;
  }

  const locEl = document.getElementById("street-location");
  if (locEl) {
    const text = locEl.textContent.replace(/^📍 Location:\s*/, "").trim();
    if (text) {
      return text;
    }
  }

  return "Unknown location";
}

/** Build the full prompt, optionally enriched with reporter notes */
function buildValidatorPrompt(notes) {
  if (!notes) {
    return VALIDATOR_PROMPT_BASE;
  }
  return (
    VALIDATOR_PROMPT_BASE + "\n\nAdditional context from the reporter: " + notes
  );
}

/** Normalize unknown errors into user-friendly messages */
function getErrorMessage(error) {
  if (!error) {
    return "Unknown error. Please try again.";
  }

  if (error.name === "AbortError") {
    return "Request timed out after " + REQUEST_TIMEOUT_MS / 1000 + " seconds. Please check your connection and try again.";
  }

  if (error instanceof TypeError && error.message.toLowerCase().includes("fetch")) {
    return "Network error — unable to reach the Gemini API. Check your internet connection.";
  }

  return error.message || "Unknown error. Please try again.";
}

// ==========================================
// 3. CAMERA & FILE UPLOAD LOGIC
// ==========================================

/** Revoke the previous blob URL to free memory */
function revokePreviewUrl() {
  if (previewObjectUrl) {
    URL.revokeObjectURL(previewObjectUrl);
    previewObjectUrl = null;
  }
}

/** Render a thumbnail preview in the AI summary card */
function showPhotoPreview(file) {
  revokePreviewUrl();
  previewObjectUrl = URL.createObjectURL(file);

  setSummaryHtml(
    '<div class="space-y-3">' +
    "<img" +
    ' src="' +
    previewObjectUrl +
    '"' +
    ' alt="Preview of captured trash photo"' +
    ' class="w-full max-h-56 rounded-xl object-cover border border-gray-200 dark:border-zinc-700"' +
    "/>" +
    '<p class="text-gray-600 dark:text-gray-400">' +
    "Photo ready. Review the preview, add any notes, then tap " +
    "<strong>Submit Trash Report</strong>." +
    "</p>" +
    "</div>",
  );
}

if (photoInput) {
  photoInput.addEventListener("change", function (event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    selectedFile = file;
    showPhotoPreview(file);

    photoInput.value = "";
  });
}

// ==========================================
// 4. GEMINI AI ANALYSIS
// ==========================================

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(function () {
    controller.abort();
  }, timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function fileToBase64(file) {
  return new Promise(function (resolve, reject) {
    const reader = new FileReader();

    reader.onload = function () {
      const result = reader.result;
      const commaIndex = result.indexOf(",");
      const base64 = commaIndex >= 0 ? result.slice(commaIndex + 1) : result;
      resolve({
        base64: base64,
        mimeType: file.type || "image/jpeg",
      });
    };

    reader.onerror = function () {
      reject(new Error("Failed to read the selected image file."));
    };

    reader.readAsDataURL(file);
  });
}

async function analyzeImageWithGemini(base64, mimeType, promptText) {
  const requestBody = {
    contents: [
      {
        parts: [
          { text: promptText },
          {
            inline_data: {
              mime_type: mimeType,
              data: base64,
            },
          },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
    },
  };

  const response = await fetchWithTimeout(
    API_URL,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    },
    REQUEST_TIMEOUT_MS,
  );

  if (!response.ok) {
    let errorText = "";
    try {
      errorText = await response.text();
    } catch (readError) {
      errorText = response.statusText;
    }
    throw new Error(
      "API request failed (" + response.status + "): " + errorText,
    );
  }

  const data = await response.json();
  return extractJsonFromGeminiResponse(data);
}

function extractJsonFromGeminiResponse(data) {
  if (data && data.promptFeedback && data.promptFeedback.blockReason) {
    return { valid: false, error: "Image blocked by AI safety filters." };
  }
  if (data && data.candidates && data.candidates[0].finishReason === "SAFETY") {
    return { valid: false, error: "Image flagged as inappropriate by AI." };
  }

  let text =
    data &&
    data.candidates &&
    data.candidates[0] &&
    data.candidates[0].content &&
    data.candidates[0].content.parts &&
    data.candidates[0].content.parts[0] &&
    data.candidates[0].content.parts[0].text;

  if (!text) {
    throw new Error("Gemini returned an empty or unexpected response.");
  }

  try {
    return JSON.parse(text.trim());
  } catch (parseError1) {
    try {
      let cleanText = text.replace(/```json/gi, "").replace(/```/g, "").trim();
      return JSON.parse(cleanText);
    } catch (parseError2) {
      try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]);
        }
        throw new Error("No JSON structure found.");
      } catch (parseError3) {
        console.error("Raw Gemini output that failed to parse:", text);
        throw new Error("Could not parse Gemini JSON response.");
      }
    }
  }
}

// ==========================================
// 5. GEOLOCATION LOGIC
// ==========================================

const mapModal = document.getElementById("map-modal");
const openMapBtn = document.getElementById("open-map-btn");
const closeMapIcon = document.getElementById("close-map-icon");
const confirmBtn = document.getElementById("confirm-location-btn");
const gpsBtn = document.getElementById("gps-fallback-btn");
const displayLocation = document.getElementById("display-location");
const mapAddressText = document.getElementById("map-address-text");

const defaultLat = 14.5995;
const defaultLng = 120.9842;

function initMap() {
  if (mapInstance) {
    mapInstance.invalidateSize();
    return;
  }

  mapInstance = L.map("leaflet-map").setView([defaultLat, defaultLng], 13);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(mapInstance);

  mapMarker = L.marker([defaultLat, defaultLng], { draggable: true }).addTo(
    mapInstance,
  );

  mapMarker.on("dragend", function (e) {
    const position = mapMarker.getLatLng();
    updateAddressText(position.lat, position.lng);
  });

  mapInstance.on("click", function (e) {
    mapMarker.setLatLng(e.latlng);
    updateAddressText(e.latlng.lat, e.latlng.lng);
  });
}

async function updateAddressText(lat, lng) {
  mapAddressText.textContent = "Fetching address...";
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
    );
    const data = await response.json();
    if (data && data.display_name) {
      finalAddress = data.display_name;
      mapAddressText.textContent = finalAddress;
      finalCoordinates = { lat, lng };
    }
  } catch (err) {
    mapAddressText.textContent = "Location selected (Address unavailable)";
    finalCoordinates = { lat, lng };
    finalAddress = "Unknown Pin Location";
  }
}

openMapBtn?.addEventListener("click", () => {
  mapModal.classList.remove("hidden");
  setTimeout(() => {
    initMap();
    if (mapInstance) {
      mapInstance.invalidateSize();
    }

    if (finalCoordinates) {
      mapInstance.setView([finalCoordinates.lat, finalCoordinates.lng], 17);
      mapMarker.setLatLng([finalCoordinates.lat, finalCoordinates.lng]);
      mapAddressText.textContent = finalAddress;
    } else {
      updateAddressText(defaultLat, defaultLng);
    }
  }, 100);
});

const closeMap = () => mapModal.classList.add("hidden");
closeMapIcon?.addEventListener("click", closeMap);

confirmBtn?.addEventListener("click", () => {
  if (finalCoordinates) {
    const searchInput = document.getElementById("map-search-input");
    if (searchInput) {
      searchInput.value = finalAddress;
      document.getElementById("clear-search-btn")?.classList.remove("hidden");
    }
    updateStepper();
    closeMap();
  }
});

gpsBtn?.addEventListener("click", () => {
  gpsBtn.innerHTML = "Locating...";
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        mapInstance.setView([latitude, longitude], 17);
        mapMarker.setLatLng([latitude, longitude]);
        updateAddressText(latitude, longitude);
        gpsBtn.innerHTML = "📍 Use My Current GPS";
      },
      (error) => {
        alert("Could not get GPS location. Please drag the pin manually.");
        gpsBtn.innerHTML = "📍 Use My Current GPS";
      },
      { enableHighAccuracy: true, timeout: 5000 },
    );
  } else {
    alert("Geolocation is not supported by your browser.");
  }
});

// ==========================================
// 6. FIREBASE SUBMISSION LOGIC
// ==========================================

function handleValidationResult(result, reporter, reportId, contact) {
  if (result.valid === true) {
    const severityScore = result.severity_score != null ? result.severity_score : 3;
    const stars = "⭐".repeat(severityScore);

    setSummary(
      "✅ AI Analysis Complete\n\n" +
      "Severity Level: " + severityScore + " / 5  " + stars + "\n" +
      "Estimated Volume: " + (result.volume || "Unknown") +
      (reportId ? "\n\nReport ID: " + reportId : "")
    );

    if (typeof window.showSuccessModal === "function") {
      window.showSuccessModal();
    }
    return;
  }

  setSummary(result.error || "No waste detected");

  if (typeof window.showErrorModal === "function") {
    window.showErrorModal();
  }
}

if (submitBtn) {
  submitBtn.addEventListener("click", async function (event) {
    event.preventDefault();

    if (isSubmitting) return;

    if (!isApiKeyConfigured()) {
      setSummary(
        "API key missing. Copy config.example.js to config.js and add your Gemini API key.",
      );
      return;
    }

    if (!selectedFile) {
      if (typeof window.showErrorModal === "function") {
        window.showErrorModal("Please snap a trash photo before submitting your report.");
      }
      return;
    }

    const userProfileEl = document.getElementById("user-profile");
    if (!userProfileEl || userProfileEl.classList.contains("hidden")) {
      if (typeof window.showErrorModal === "function") {
        window.showErrorModal("Please Sign In with Google in Step 3 to submit your report and receive $ECO tokens.");
      }
      return;
    }

    const reportForm = getReportFormData();
    if (!reportForm.wasteType) {
      if (typeof window.showErrorModal === "function") {
        window.showErrorModal("Please select a trash category before submitting your report.");
      }
      return;
    }

    const reporter = getReporterData();
    const promptText = buildValidatorPrompt(reporter.notes);

    isSubmitting = true;
    setSubmitLoading(true);
    updateStepper();

    try {
      setSummary("Analyzing image... please wait.");

      const imageData = await fileToBase64(selectedFile);

      const result = await analyzeImageWithGemini(
        imageData.base64,
        imageData.mimeType,
        promptText,
      );

      if (result.valid !== true) {
        handleValidationResult(result, reporter);
        if (typeof window.showErrorModal === "function") {
          window.showErrorModal(result.error || "No waste detected");
        }
        setSubmitLoading(false);
        isSubmitting = false;
        return;
      }

      setSummary("Trash verified. Uploading report... please wait.");

      const nameInput = document.getElementById("reporter-name");
      const contactInput = document.getElementById("reporter-contact");

      const reporterName = nameInput ? nameInput.value.trim() : "";
      const contactValue = contactInput ? contactInput.value.trim() : "Not Provided";

      const reportData = {
        wasteType: reportForm.wasteType,
        volumeEstimate: result.volume || "Unknown",
        location: finalAddress || getReportLocation(),
        coordinates: finalCoordinates || null,
        contactInfo: contactValue,
        reporterName: reporterName || "Anonymous",
        notes: reporter.notes,
        severityScore: result.severity_score != null ? result.severity_score : 3,
      };

      const response = await submitTrashReport(reportData, selectedFile);

      if (response.status === 'duplicate_found') {
        setSubmitLoading(false);
        isSubmitting = false;

        const duplicates = response.existingReports;
        let currentDupIndex = 0;

        const dupModal = document.getElementById('duplicate-modal');
        const dupImg = document.getElementById('duplicate-modal-image');
        const dupTime = document.getElementById('duplicate-modal-time');
        const dupDist = document.getElementById('duplicate-modal-distance');
        const dupReporter = document.getElementById('duplicate-modal-reporter');
        const closeIcon = document.getElementById('close-duplicate-modal');
        const upvoteBtn = document.getElementById('confirm-upvote-btn');
        const cancelBtn = document.getElementById('cancel-upvote-btn');
        const prevBtn = document.getElementById('prev-duplicate-btn');
        const nextBtn = document.getElementById('next-duplicate-btn');
        const counterText = document.getElementById('carousel-counter-text');
        const dotsContainer = document.getElementById('carousel-dots');

        const zoomSlider = document.getElementById('duplicate-zoom-slider');
        const zoomInBtn = document.getElementById('zoom-in-btn');
        const zoomOutBtn = document.getElementById('zoom-out-btn');
        const fitBtn = document.getElementById('fit-image-btn');
        const fullscreenBtn = document.getElementById('fullscreen-image-btn');

        if (zoomSlider && dupImg) {
          zoomSlider.oninput = (e) => {
            dupImg.style.transform = `scale(${e.target.value})`;
          };
          if (zoomInBtn) zoomInBtn.onclick = () => {
            zoomSlider.value = Math.min(3, Number(zoomSlider.value) + 0.2);
            dupImg.style.transform = `scale(${zoomSlider.value})`;
          };
          if (zoomOutBtn) zoomOutBtn.onclick = () => {
            zoomSlider.value = Math.max(1, Number(zoomSlider.value) - 0.2);
            dupImg.style.transform = `scale(${zoomSlider.value})`;
          };
          if (fitBtn) fitBtn.onclick = () => {
            zoomSlider.value = 1;
            dupImg.style.transform = 'scale(1)';
          };
          if (fullscreenBtn) fullscreenBtn.onclick = () => {
            if (dupImg.requestFullscreen) dupImg.requestFullscreen();
          };
        }

        if (dotsContainer) {
          dotsContainer.innerHTML = duplicates.map((_, i) =>
            `<button data-dot="${i}" class="w-2 h-2 rounded-full transition-all duration-200 ${i === 0 ? 'bg-green-600 w-4' : 'bg-gray-300'}"></button>`
          ).join('');
          dotsContainer.querySelectorAll('[data-dot]').forEach(dot => {
            dot.addEventListener('click', () => {
              currentDupIndex = Number(dot.dataset.dot);
              renderDuplicateReport(currentDupIndex);
            });
          });
        }

        function renderDuplicateReport(index) {
          const report = duplicates[index];

          if (zoomSlider) zoomSlider.value = 1;
          if (dupImg) dupImg.style.transform = 'scale(1)';

          if (dupImg) dupImg.src = report.imageUrl || '';

          if (dupTime) {
            const dateObj = report.reportedAt?.toDate
              ? report.reportedAt.toDate()
              : new Date();
            const formattedDate = dateObj.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
            const formattedTime = dateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
            dupTime.innerText = `${formattedDate} • ${formattedTime}`;
          }

          if (dupDist) dupDist.innerText = report.distance ?? '?';

          if (dupReporter) dupReporter.innerText = report.reporterName || 'Community Member';

          if (counterText) counterText.innerText = `Report ${index + 1} of ${duplicates.length}`;

          if (dotsContainer) {
            dotsContainer.querySelectorAll('[data-dot]').forEach((dot, i) => {
              dot.className = `rounded-full transition-all duration-200 ${i === index ? 'w-4 h-2 bg-green-600' : 'w-2 h-2 bg-gray-300'}`;
            });
          }

          if (prevBtn) prevBtn.classList.toggle('hidden', index === 0);
          if (nextBtn) nextBtn.classList.toggle('hidden', index === duplicates.length - 1);
        }

        if (prevBtn) {
          prevBtn.onclick = () => {
            if (currentDupIndex > 0) {
              currentDupIndex--;
              renderDuplicateReport(currentDupIndex);
            }
          };
        }
        if (nextBtn) {
          nextBtn.onclick = () => {
            if (currentDupIndex < duplicates.length - 1) {
              currentDupIndex++;
              renderDuplicateReport(currentDupIndex);
            }
          };
        }

        renderDuplicateReport(0);

        if (dupModal) dupModal.classList.remove('hidden');

        if (closeIcon) {
          closeIcon.onclick = () => {
            dupModal.classList.add('hidden');
          };
        }

        if (upvoteBtn) {
          upvoteBtn.onclick = async () => {
            upvoteBtn.innerText = "Verifying...";
            await upvoteReport(duplicates[currentDupIndex].id);

            alert("Thank you! We've added your verification to the existing report.");
            dupModal.classList.add('hidden');
            document.getElementById("close-success-modal")?.click();

            upvoteBtn.innerHTML = `<div class="bg-white rounded-full p-0.5 text-[#418B46]"><svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"></path></svg></div> Yes, this is the same`;
          };
        }

        if (cancelBtn) {
          cancelBtn.onclick = async () => {
            dupModal.classList.add('hidden');

            setSubmitLoading(true);
            isSubmitting = true;
            setSummary("Bypassing check... Creating unique report.");

            try {
              reportData.bypassDuplicateCheck = true;
              const forceResponse = await submitTrashReport(reportData, selectedFile);

              const reportId = forceResponse.reportId;
              isReportComplete = true;

              console.log("E-Tapon Mo report submitted (Bypassed Duplicate Check):", { reportId });
              handleValidationResult(result, reporter, reportId, reportForm.contactInfo);
            } catch (error) {
              console.error("Forced submission error:", error);
              setSummary("Something went wrong while processing your report.\n\n" + getErrorMessage(error));
              if (typeof window.showErrorModal === "function") window.showErrorModal();
            } finally {
              isSubmitting = false;
              setSubmitLoading(false);
              updateStepper();
            }
          };
        }

        return;
      }

      const reportId = response.reportId;

      isReportComplete = true;

      console.log("Basura-Pin report submitted:", {
        reporter: reporter,
        validation: result,
        reportId: reportId,
      });

      handleValidationResult(
        result,
        reporter,
        reportId,
        reportForm.contactInfo,
      );
    } catch (error) {
      console.error("E-Tapon Mo submission error:", error);
      setSummary(
        "Something went wrong while processing your report.\n\n" +
        getErrorMessage(error),
      );

      if (typeof window.showErrorModal === "function") {
        window.showErrorModal();
      }
    } finally {
      isSubmitting = false;
      setSubmitLoading(false);
      updateStepper();
    }
  });

  // ==========================================
  // 7. UI/UX EVENT LISTENERS
  // ==========================================

  // Initialize the native Google GIS Button
  initializeGoogleAuth();

  const mapSearchInput = document.getElementById("map-search-input");
  const searchSuggestions = document.getElementById("search-suggestions");
  const clearSearchBtn = document.getElementById("clear-search-btn");

  let searchTimeout;

  mapSearchInput?.addEventListener("input", (e) => {
    const query = e.target.value;

    if (query.length > 0) {
      clearSearchBtn.classList.remove("hidden");
    } else {
      clearSearchBtn.classList.add("hidden");
      searchSuggestions.classList.add("hidden");
      return;
    }

    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=ph&limit=5`,
        );
        const data = await res.json();

        searchSuggestions.innerHTML = "";

        if (data.length > 0) {
          searchSuggestions.classList.remove("hidden");
          data.forEach((place) => {
            const li = document.createElement("li");
            li.className =
              "cursor-pointer p-3 hover:bg-gray-50 flex items-start gap-3";

            const nameParts = place.display_name.split(",");
            const mainName = nameParts[0];
            const fullAddress = place.display_name
              .substring(mainName.length + 1)
              .trim();

            li.innerHTML = `
                        <span class="text-green-700 mt-0.5">
                           <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
                        </span>
                        <div>
                            <div class="font-bold text-sm text-gray-900">${mainName}</div>
                            <div class="text-xs text-gray-500 line-clamp-1">${fullAddress}</div>
                        </div>
                    `;

            li.addEventListener("click", () => {
              mapSearchInput.value = place.display_name;
              finalAddress = place.display_name;
              finalCoordinates = { lat: place.lat, lng: place.lon };
              searchSuggestions.classList.add("hidden");
              updateStepper();
            });

            searchSuggestions.appendChild(li);
          });
        } else {
          searchSuggestions.classList.add("hidden");
        }
      } catch (err) {
        console.error("Geocoding search error:", err);
      }
    }, 400);
  });

  clearSearchBtn?.addEventListener("click", () => {
    mapSearchInput.value = "";
    finalAddress = "";
    finalCoordinates = null;
    clearSearchBtn.classList.add("hidden");
    searchSuggestions.classList.add("hidden");
    mapSearchInput.focus();
  });

  document.addEventListener("click", (e) => {
    if (
      !mapSearchInput.contains(e.target) &&
      !searchSuggestions.contains(e.target)
    ) {
      searchSuggestions.classList.add("hidden");
    }
  });

  document.getElementById("close-success-modal")?.addEventListener("click", () => {
    selectedFile = null;
    isReportComplete = false;
    finalCoordinates = null;
    finalAddress = "";

    const searchInput = document.getElementById("map-search-input");
    if (searchInput) searchInput.value = "";
    document.getElementById("clear-search-btn")?.classList.add("hidden");

    updateStepper();
  });
}