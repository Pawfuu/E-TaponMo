<div align="center">
  
<img width="2048" height="413" alt="E-TaponBanner" src="https://github.com/user-attachments/assets/bca4e4a8-df8e-4273-9965-3143f8eaf58f" />


<p align="center">
  A frictionless, AI-assisted, and Hedera blockchain-powered community waste reporting platform connecting citizens with Local Government Units (LGUs) for transparent, real-time waste management.
</p>

<p align="center">
  <strong>Developed by Team EcoPulse:</strong><br>
  Arianne Maravilla &bull; Francis Fernandez &bull; Johnly Carable &bull; Keziah Magtibay<br>
  <em>Originally built for SparkFest 2026 &bull; V2 Submission for Cryptita Plays Builder Showcase at WOCEE 2026</em>
</p>

<a href="#about"><img src="https://img.shields.io/badge/💡_About-blue?style=for-the-badge" alt="About"></a>
<a href="#features"><img src="https://img.shields.io/badge/✨_Features-purple?style=for-the-badge" alt="Features"></a>
<a href="#demo"><img src="https://img.shields.io/badge/🌐_Demo-orange?style=for-the-badge" alt="Live Demo"></a>
<a href="#installation"><img src="https://img.shields.io/badge/⚙️_Installation-green?style=for-the-badge" alt="Installation"></a>
<a href="#preview"><img src="https://img.shields.io/badge/📷 Previews-red?style=for-the-badge" alt="Preview"></a>

<br>

</div>

---

> [!TIP]
> Scan the QR Code in the hero banner (once generated) to immediately open the citizen reporting web application on your mobile device.

<div id="about"></div>

## 🚀 About the Project

**E-Tapon Mo** originated as an MVP developed by Team SparkPish during **SparkFest 2026**, a hackathon organized by **Google Developer Groups on Campus – Polytechnic University of the Philippines (GDG on Campus PUP)**.

Building upon that foundation, **Version 2** introduces **Hedera-backed immutable** logging and is proudly submitted to the **Cryptita Plays Builder Showcase**.By bringing blockchain-verified transparency to civic waste management, our enhanced MVP demonstrates technical skill and real-world impact, targeting a live pitch on the WOCEE 2026 Main Stage on August 8, 2026.

> [!NOTE]
> For a comprehensive overview of our development strategy, urbanization research, and community impact goals, please read our full **[Project Brief / Overview](https://docs.google.com/document/d/1WQ6l98iAIJKUQi1jfdTixk6JQkpZnFz_06-UeEMLn9M/edit?tab=t.nimvz5l2j3wy)**.

### 🎯 Problem Statement

The Philippines is facing a critical infrastructural deficit in municipal solid waste (MSW) management, exacerbated by rapid urbanization. Despite the comprehensive legislative framework of Republic Act 9003 (Ecological Solid Waste Management Act of 2000), compliance remains low, with less than 40% of the nationwide MRF requirement met and a growing proliferation of illegal open dumpsites. Municipal planners often struggle with:

- **Inconsistent Enforcement:** Rapid urbanization and limited LGU resources have led to persistent increases in solid waste volume and overstrained landfills.
- **Manual Bottlenecks:** Existing government initiatives heavily rely on manual data entry, fragmented social media messages, and lack public transparency. Citizen complaints disappear into manual filing systems, eroding public trust.
- **The Result:** This creates a systemic gap in environmental governance and public trust, leading to the proliferation of illegal open dumpsites, polluted drainage systems, and severe public health risks.

> [!IMPORTANT]
> **Target Beneficiaries**
>
> **E-Tapon Mo** is designed to serve **Local Government Units (LGUs)** and the **urban/rural communities** they support. Its primary beneficiaries include:
>
> - 🏛️ City and Municipal Sanitation Offices
> - 🏘️ Barangay Officials
> - 👥 Residents in densely populated communities
> - 🌱 Environmental and waste management personnel

### 💡 The Solution

**E-Tapon Mo** is a Progressive Web Application (PWA) that revolutionizes community-based waste reporting by combining **AI-assisted triage**, **interactive mapping**, and **blockchain transparency**. 

Citizens can report illegal dumping or uncollected waste using any smartphone browser—requiring only a secure **Google account authorization** to ensure accountability. Each report is automatically validated by **Google's Gemini AI** and securely logged onto the **Hedera Testnet** for **immutable public transparency**, before being synchronized to a centralized **LGU dashboard**.

> [!IMPORTANT]
>
> - **Streamlined Submission**: Citizens log in securely via **Google account authorization**, snap a photo of a trash site, select a category, pin a location on the map, and hit **Submit**.
> - **AI Spam Filtering & Validation**: **Google's Gemini AI** automatically validates the image to **filter out spam**, estimates the waste volume, and assigns a **priority severity score (1-5)**.
> - **Immutable Transparency**: Reports and status updates are logged on the **Hedera Blockchain**, ensuring **public trust** and an **unalterable audit trail** of LGU responsiveness.
> - **Real-Time Dispatch Dashboard**: **LGU Administrators** get a dedicated **real-time portal** that instantly populates with new verified reports, enabling city planners to deploy clearing operations before sanitation hazards escalate.

---

<div id="features"></div>

## ✨ Key Features (v2 Upgrades)

Our platform is divided into two seamless experiences: a public-facing reporting tool and an LGU administrative dashboard.


### 👥 Citizen Reporting App (`/user-app`)

| Feature | Description |
| :--- | :--- |
| 📸 **Mobile Photo Capture** | Snap or upload live photos of waste sites directly from any mobile browser. |
| 🤖 **Gemini AI Guardrails** | Built-in validation filters out spam (non-waste photos) and automatically evaluates the severity score (1-5) and volume. |
| 📍 **GPS Auto-Pinning** | Interactive Leaflet.js maps with a "Use My Current GPS" button to drop precise coordinates instantly. |
| 🔍 **Reverse Geocoding Auto-Detection** | Nominatim-powered geocoding translates coordinate drops into a human-readable address and automatically extracts the correct Barangay. This completely removes the need for hardcoded dropdown menus! |
| 📋 **Guided Stepper** | A seamless 4-step reporting workflow: `Snap Photo ➔ Fill Details ➔ Pin Location ➔ Submit`. |
| ⚖️ **Geospatial Deduplication Carousel (New)** | If a user tries to submit a report within a 30-meter radius of an active issue:<br>• The app halts submission and opens a modern verification modal.<br>• Allows citizens to scroll through nearby active reports via a carousel.<br>• Clicking "Yes, this is it" acts as a zero-cost community Upvote, escalating LGU priority.<br>• Clicking "No, create new report" bypasses the warning to register a distinct, adjacent trash pile. |

### 🏛️ LGU Admin Dashboard (`/lgu-dashboard`)
| Feature | Description |
| :--- | :--- |
| 📡 **Real-Time Synchronized Feed** | Powered by Firestore `onSnapshot` listeners to stream reports instantly as they are validated by citizens. |
| 📋 **Task Management Board (New Backend Setup)** | A dynamic task tracker matching the LGU operational pipeline. Admins can prioritize tickets, assign drivers, track progress, and trigger automatic overdue alerts. |
| 📊 **Barangay Performance Analytics (New Backend Setup)** | Generates live performance aggregations filtered for Quezon City:<br>• **Average Response Time**: Calculated dynamically using `reportedAt` and `resolvedAt` timestamps.<br>• **Resolution Rates**: Measures active vs. completed tasks per barangay.<br>• **Waste Segregation Mix**: Tracks the percentage breakdown of Biodegradable, Recyclable, Residual, and Hazardous waste. |
| 🔗 **Hedera Public Ledger Activity Feed** | Shows a chronological timeline of blockchain-anchored actions to verify city-wide transparency. |

<br>

---

<div id="preview"></div>

## 🎥 Feature Demonstrations
### 🤖 AI Image Validation

|                            ✅ Successful Report                            |                        ❌ Invalid Submission                        |
| :------------------------------------------------------------------------: | :-----------------------------------------------------------------: |
| <img src="user-app/assets/success.gif" width="100%" alt="Successful Flow"> | <img src="user-app/assets/Error.gif" width="100%" alt="Error Flow"> |

### 🏛️ LGU Dashboard


|                               Dashboard Overview                                |
| :-----------------------------------------------------------------------------: |
| <img src="user-app/assets/dashboard.gif" width="100%" alt="Dashboard Overview"> |


> [!IMPORTANT]
> **Showcase Scope**
> Some dashboard modules shown in the interface represent **planned future enhancements** to demonstrate the project's long-term scalability and potential impact.
- 🔒 **Collection Routes** — Planned
- 🔒 **AI Insights** — Prototype integrated

---

## 🧰 Tech Stack

### 🔵 Core Technologies

| Technology                               | Usage                                                          |
| ---------------------------------------- | -------------------------------------------------------------- |
| **Gemini API** (`gemini-3.1-flash-lite`) | AI image validation, waste volume estimation, severity scoring |
| **Hedera Testnet**                       | DLT integration for immutable logging of civic reports         |
| **Firebase Cloud Firestore**             | Real-time NoSQL database for storing and listening to reports  |
| **Firebase Cloud Storage**               | Stores uploaded trash photo images                             |
| **Firebase Hosting**                     | Deploys the entire app publicly via CDN                        |

### 🎨 Frontend Frameworks & Libraries

| Technology                                   | Usage                                                         |
| -------------------------------------------- | ------------------------------------------------------------- |
| **Vanilla HTML5 & JavaScript (ES6 Modules)** | Core structure and application logic — no build step required |
| **Tailwind CSS (via CDN)**                   | Utility-first styling, dark mode, and responsive layouts      |
| **Leaflet.js**                               | Interactive maps, draggable pins, and tile rendering          |

### 🔌 Additional Integrations

| Technology                    | Usage                                                                       |
| ----------------------------- | --------------------------------------------------------------------------- |
| **Nominatim (OpenStreetMap)** | Reverse geocoding (coordinates → readable address) and address autocomplete |
| **OpenStreetMap Tiles**       | Map tile rendering inside the Leaflet modal                                 |
| **Browser Geolocation API**   | GPS-based auto-pinning of the user's current location                       |

---

<div id="installation"></div>

## 🛠️ Local Setup & Installation

> **Prerequisites:** A modern browser and a local HTTP server (e.g., VS Code Live Server). Node.js is **not required** — the project uses native ES Modules served via CDN.

### Step 1 — Clone the Repository

```bash
git clone https://github.com/Pawfuu/SparkPish.git
cd SparkPish
```

### Step 2 — Set Up Firebase Credentials

1. Go to your [Firebase Console](https://console.firebase.google.com/) and create or select a project.
2. Enable **Cloud Firestore**, **Firebase Storage**, and **Firebase Hosting**.
3. Register a **Web App** and copy the config object.
4. Duplicate the example config file and fill in your credentials:

```bash
cp shared/firebase-example-config.js shared/firebase-config.js
```

Then open `shared/firebase-config.js` and replace the placeholder values with your Firebase project settings.

> [!IMPORTANT]
> The LGU Admin Dashboard requires administrator configuration/credentials (or can be accessed via the `/lgu-dashboard` path).

### Step 3 — Set Up the Gemini API Key

1. Get a free API key from [Google AI Studio](https://aistudio.google.com/app/apikey).
2. Duplicate the example config:

```bash
cp user-app/config-example.js user-app/config.js
```

3. Open `user-app/config.js` and replace `YOUR_GEMINI_API_KEY_HERE` with your actual key.

> [!WARNING]
> Firebase configuration (`firebase-config.js`) and Gemini API keys (`config.js`) are intentionally gitignored. Ensure you follow the **Installation** steps before running the app.


### Step 4 — Set Up Hedera Ledger Credentials
Duplicate the Hedera config template (or create your hedera-config.js file):
```bash
cp shared/hedera-example-config.js shared/hedera-config.js
```
Open shared/hedera-config.js and input your LGU Operator ID, LGU Private Key, and E-Tapon Topic ID for testnet notarization:
```bash
export const LGU_OPERATOR_ID = "YOUR_OPERATOR_ID";
export const LGU_PRIVATE_KEY = "YOUR_PRIVATE_KEY";
export const E_TAPON_TOPIC_ID = "YOUR_TOPIC_ID";
```

> [!WARNING]
> Security Warning: Configuration files (firebase-config.js, config.js, and hedera-config.js) contain private credentials and are pre-configured in .gitignore. Do not commit them to GitHub!

### Step 5 — Run Locally

This project uses native ES Modules (`import`/`export`), so it **must be served over HTTP** — opening `index.html` directly as a file will not work.

**Run Through IDEs with Live Server** _(Recommended: VS Code)_

- Install the [Live Server](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer) extension
- Right-click `index.html` → **Open with Live Server**

---

<div id="demo"></div>

## 🌐 Live Demo

The app is deployed and publicly accessible via **Firebase Hosting**:
| Page                     | URL                                                      |
| ------------------------ | -------------------------------------------------------- |
| 👤 Citizen Reporting App | https://e-taponmo-ph.web.app/lgu-dashboard/lgu.html    |
| 🏛️ LGU Admin Dashboard   | https://e-taponmo-ph.web.app/user-app/index.html |
| 📊 Pitch Presentation    | https://e-taponmo-ph.web.app/   | 