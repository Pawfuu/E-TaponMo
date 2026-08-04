// settings.js
// Logic for the E-Tapon Mo Settings page.
// Handles: sub-nav panel switching, dirty-state tracking, profile photo
// change, password validation, and a save/cancel flow that collects all
// form values into a single settingsData object. No backend yet — the
// `persistSettings()` function is the one spot to wire up to Firestore.

import { SettingsService } from './settings-service.js';
const settingsService = new SettingsService();

// ---------- Element references ----------
const subnav = document.getElementById('subnav');

const fullNameInput = document.getElementById('fullName');
const emailInput = document.getElementById('email');
const barangaySelect = document.getElementById('barangay');

const changePhotoBtn = document.getElementById('changePhotoBtn');
const photoInput = document.getElementById('photoInput');
const bigAvatar = document.getElementById('bigAvatar');
const photoStatus = document.getElementById('photoStatus');

const notifCritical = document.getElementById('notifCritical');
const notifDaily = document.getElementById('notifDaily');
const notifWeekly = document.getElementById('notifWeekly');
const notifSms = document.getElementById('notifSms');

const currentPasswordInput = document.getElementById('currentPassword');
const newPasswordInput = document.getElementById('newPassword');
const confirmPasswordInput = document.getElementById('confirmPassword');
const passwordError = document.getElementById('passwordError');
const twoFactorToggle = document.getElementById('twoFactor');

const prefDashboardView = document.getElementById('prefDashboardView');
const prefReportingWindow = document.getElementById('prefReportingWindow');
const prefUnits = document.getElementById('prefUnits');
const prefRetention = document.getElementById('prefRetention');

const saveBtn = document.getElementById('saveBtn');
const cancelBtn = document.getElementById('cancelBtn');
const saveStatus = document.getElementById('saveStatus');

let pendingPhotoFile = null;
let isDirty = false;

// ---------- Footer timestamp ----------
document.getElementById('footDate').textContent = new Date().toLocaleString('en-PH');

// ---------- Sub-nav panel switching ----------
subnav.addEventListener('click', e => {
    const item = e.target.closest('.subnav-item');
    if (!item) return;
    document.querySelectorAll('.subnav-item').forEach(i => i.classList.remove('active'));
    item.classList.add('active');
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    document.getElementById('panel-' + item.dataset.panel).classList.add('active');
});

// ---------- Snapshot of form state (for dirty-check and Cancel) ----------
function collectFormState() {
    return {
        fullName: fullNameInput.value,
        email: emailInput.value,
        barangay: barangaySelect.value,
        notifications: {
            critical: notifCritical.checked,
            daily: notifDaily.checked,
            weekly: notifWeekly.checked,
            sms: notifSms.checked,
        },
        twoFactor: twoFactorToggle.checked,
        preferences: {
            dashboardView: prefDashboardView.value,
            reportingWindow: prefReportingWindow.value,
            units: prefUnits.value,
            retention: prefRetention.value,
        },
    };
}

function applyFormState(state) {
    if (!state) return;
    if (state.fullName !== undefined) fullNameInput.value = state.fullName;
    if (state.email !== undefined) emailInput.value = state.email;
    if (state.barangay !== undefined) barangaySelect.value = state.barangay;
    if (state.notifications) {
        if (state.notifications.critical !== undefined) notifCritical.checked = state.notifications.critical;
        if (state.notifications.daily !== undefined) notifDaily.checked = state.notifications.daily;
        if (state.notifications.weekly !== undefined) notifWeekly.checked = state.notifications.weekly;
        if (state.notifications.sms !== undefined) notifSms.checked = state.notifications.sms;
    }
    if (state.twoFactor !== undefined) twoFactorToggle.checked = state.twoFactor;
    if (state.preferences) {
        if (state.preferences.dashboardView !== undefined) prefDashboardView.value = state.preferences.dashboardView;
        if (state.preferences.reportingWindow !== undefined) prefReportingWindow.value = state.preferences.reportingWindow;
        if (state.preferences.units !== undefined) prefUnits.value = state.preferences.units;
        if (state.preferences.retention !== undefined) prefRetention.value = state.preferences.retention;
    }
    if (state.fullName && !pendingPhotoFile) {
        bigAvatar.style.backgroundImage = '';
        bigAvatar.textContent = initialsFromName(state.fullName);
    }
}

let initialState = collectFormState();

settingsService.subscribeSettings((data) => {
    initialState = { ...initialState, ...data };
    applyFormState(initialState);
    markClean();
});

// ---------- Dirty-state tracking ----------
function markDirty() {
    isDirty = true;
    saveBtn.disabled = false;
    saveStatus.textContent = '';
}

function markClean() {
    isDirty = false;
    saveBtn.disabled = true;
}

const watchedFields = [
    fullNameInput, emailInput, barangaySelect,
    notifCritical, notifDaily, notifWeekly, notifSms,
    twoFactorToggle,
    prefDashboardView, prefReportingWindow, prefUnits, prefRetention,
    newPasswordInput, confirmPasswordInput,
];

watchedFields.forEach(field => {
    const evt = field.tagName === 'SELECT' || field.type === 'checkbox' ? 'change' : 'input';
    field.addEventListener(evt, markDirty);
});

// ---------- Change Photo ----------
changePhotoBtn.addEventListener('click', () => photoInput.click());

photoInput.addEventListener('change', () => {
    const file = photoInput.files[0];
    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/png'];
    const maxSizeBytes = 5 * 1024 * 1024; // 5MB

    if (!allowedTypes.includes(file.type)) {
        photoStatus.textContent = 'Only JPG or PNG files are allowed.';
        photoStatus.style.color = 'var(--critical)';
        photoInput.value = '';
        return;
    }
    if (file.size > maxSizeBytes) {
        photoStatus.textContent = 'File is too large. Max size is 5MB.';
        photoStatus.style.color = 'var(--critical)';
        photoInput.value = '';
        return;
    }

    pendingPhotoFile = file;
    photoStatus.textContent = `Selected: ${file.name}`;
    photoStatus.style.color = 'var(--muted)';

    // Preview: swap the avatar initials for the uploaded image
    const reader = new FileReader();
    reader.onload = () => {
        bigAvatar.style.backgroundImage = `url(${reader.result})`;
        bigAvatar.style.backgroundSize = 'cover';
        bigAvatar.style.backgroundPosition = 'center';
        bigAvatar.textContent = '';
    };
    reader.readAsDataURL(file);

    markDirty();
});

// ---------- Password validation ----------
function validatePasswords() {
    passwordError.style.display = 'none';
    passwordError.textContent = '';

    const wantsChange = newPasswordInput.value.length > 0 || confirmPasswordInput.value.length > 0;
    if (!wantsChange) return true;

    if (!currentPasswordInput.value) {
        return showPasswordError('Enter your current password to set a new one.');
    }
    if (newPasswordInput.value.length < 8) {
        return showPasswordError('New password must be at least 8 characters.');
    }
    if (newPasswordInput.value !== confirmPasswordInput.value) {
        return showPasswordError('New password and confirmation do not match.');
    }
    return true;
}

function showPasswordError(message) {
    passwordError.textContent = message;
    passwordError.style.display = 'block';
    return false;
}

// ---------- Save / Cancel ----------
saveBtn.addEventListener('click', () => {
    if (!validatePasswords()) return;

    const settingsData = collectFormState();
    if (pendingPhotoFile) settingsData.photoFile = pendingPhotoFile;
    if (newPasswordInput.value) settingsData.newPassword = newPasswordInput.value;

    persistSettings(settingsData);
});

cancelBtn.addEventListener('click', () => {
    applyFormState(initialState);
    newPasswordInput.value = '';
    confirmPasswordInput.value = '';
    currentPasswordInput.value = '••••••••••';
    passwordError.style.display = 'none';
    pendingPhotoFile = null;
    photoInput.value = '';
    photoStatus.textContent = 'JPG or PNG, at least 200×200px';
    photoStatus.style.color = 'var(--muted)';
    bigAvatar.style.backgroundImage = '';
    bigAvatar.textContent = initialsFromName(initialState.fullName);
    markClean();
    saveStatus.textContent = '';
});

function initialsFromName(name) {
    return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
}

// Single integration point for a future backend (e.g. Firestore).
async function persistSettings(settingsData) {
    saveBtn.disabled = true;
    saveStatus.textContent = 'Saving...';
    saveStatus.style.color = 'var(--muted)';

    try {
        await settingsService.saveSettings(settingsData);
        initialState = collectFormState();
        newPasswordInput.value = '';
        confirmPasswordInput.value = '';
        pendingPhotoFile = null;
        markClean();
        saveStatus.textContent = 'Saved successfully.';
        saveStatus.style.color = 'var(--brand-dark)';
    } catch (err) {
        saveBtn.disabled = false;
        saveStatus.textContent = 'Error saving changes.';
        saveStatus.style.color = 'var(--critical)';
    }
}