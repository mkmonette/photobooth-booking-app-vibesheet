Photobooth Booking App ? README
===============================

Short summary
-------------
Photobooth Booking is a mobile-first, single-business booking SPA built with React + TypeScript and Vite. It's frontend-only: all persistent data is stored in browser storage (localStorage) and can be exported/imported. The app supports a public landing and booking flow, customer and admin dashboards, manual payment workflows (payment instructions & proof uploads), galleries, reminders/notifications, theme (light/dark), and a local backup/import facility. Service-worker files are included for optional offline behavior and background notification attempts, but reminders and scheduling are best-effort in-app.

Quick links
-----------
- Dev server: npm run dev
- Build: npm run build
- Preview built app: npm run preview
- Tests: npm test (vitest)
- Lint: npm run lint
- Typecheck: npm run type-check
- Format: npm run format

Prerequisites
-------------
- Node.js >= 16 (package.json specifies "engines": { "node": ">=16" })
- npm (or yarn/pnpm)
- Modern browser for full feature set (Web Crypto, Service Worker, Notifications, localStorage)

Installation (local)
--------------------
1. Clone repository:
   - git clone <repo-url>
   - cd photobooth-booking-app-vibesheet

2. Install dependencies:
   - npm ci
   - (or npm install)

3. Environment:
   - An example env file is provided as component3.env (do NOT commit secrets).
   - Copy and adapt locally if needed:
     - cp component3.env .env.local
   - Note: Some code reads REACT_APP_* keys or custom keys directly; check bootstrap code and adjust values as needed. The app also stores theme and settings in localStorage.

4. Run development server:
   - npm run dev
   - Open the URL printed by Vite (usually http://localhost:5173)

5. Run tests:
   - npm test
   - For watch mode: npm run test:watch

6. Lint / Format / TypeCheck:
   - npm run lint
   - npm run lint:fix
   - npm run format
   - npm run type-check

First-run admin setup
---------------------
- On first run, open the Admin Setup Wizard (component: adminsetupwizard.tsx) in the admin area to create an admin PIN and optionally seed demo data. The PIN is hashed using PBKDF2 and stored locally; do not reuse it elsewhere.

Local storage & backups
-----------------------
- All persistent app data is saved to localStorage. Important keys are defined in component3.env and code constants.
- Use the backup/export UI (backupexportservice.ts) to export a JSON backup that can be imported on another device. Large blobs (base64 images) may be skipped unless you choose to include them.
- Regularly export backups ? browser storage is not a permanent server backup.

Service worker & notifications
------------------------------
- A service worker implementation is included (serviceworker.ts) and a flexible registration helper (serviceworkerregistration.ts).
- Service workers require a secure context (https) or localhost. When deploying to production, ensure correct sw path and HTTPS hosting.
- Reminders are scheduled by notificationservice.ts and run in-app on load/interaction and via service worker messages where supported ? treat background reminders as best-effort.

Image handling
--------------
- Images and uploads are stored as base64 (imagecompressor.ts provides client-side resizing/compression).
- File size limits enforced (typically 5 MB for payment proof). Watch browser storage quota; the UI warns when size approaches limits.

Launching & deploying from GitHub
---------------------------------
1. Push branch to GitHub:
   - git push origin main

2. Continuous integration:
   - A GitHub Actions workflow is provided at .github/workflows/ci.yml that runs lint, type-check, tests, and build on push and PRs.

3. Deploy options:
   - Static hosting (Netlify, Vercel, GitHub Pages, S3 + CloudFront) is suitable: run npm run build and deploy the output directory (Vite typically emits to dist).
   - If using service worker: ensure the sw file path in registration matches the hosted path (main.tsx registers '/sw.js' ? adjust build output or registration).
   - For GitHub Pages: set up build step to push dist to gh-pages branch, or use a GitHub Action deployer.

4. Notes for service worker on GitHub Pages:
   - GitHub Pages serves over HTTPS; ensure the service worker registration path is /service-worker.js or /sw.js as produced by your bundler.

Using an AI assistant for implementation (Codex / "Google Jules")
----------------------------------------------------------------
- Use an AI assistant to help with individual tasks (fixing a component, writing tests, implementing a migration).
- Important workflow guidelines:
  - Work on one task at a time. Make a small code change, run tests/lint locally, then commit and push.
  - Use small, focused prompts: describe the file and exact change you want. Prefer providing the relevant file content or file path.
  - After the AI produces code, run linters and tests locally before committing.
  - Keep commits atomic and descriptive (e.g., feat(storageservice): add migration v2).
  - If you use the assistant to edit multiple files, perform one change, run the app, then push ? repeat.
- Suggested prompt pattern:
  - "In storageservice.ts, add migration to convert bookings stored under key 'bookings' (legacy shape) to new bookings schema. Show only the updated function and tests."
- Keep secrets out of code and never paste production keys into prompts.

Project structure and responsibilities (per file)
------------------------------------------------
Below is a succinct mapping of each provided file to its responsibility. Use this as a quick reference while implementing or reviewing code.

Root & config
- package.json ? npm scripts, dependencies (React, Vite, TypeScript, Vitest, ESLint).
- tsconfig.json ? TypeScript compiler options and path aliases.
- component3.env ? example environment variables (feature flags, storage keys); copy/convert to .env.local as needed.

Public assets
- public/index.html ? HTML shell with early theme handling and root container.
- public/manifest.json ? PWA manifest for installability.

Bootstrap / entrypoints
- index.js ? legacy/root mounting helpers (initializeApp, mount, hydrate) and localStorage safe fallback.
- main.tsx ? app bootstrapping, service registration, ErrorBoundary, theme init, registerAppServices and startApp flow.
- app.jsx / app.tsx ? two app roots in the file list (one JS demo and one TSX advanced App). They contain global listeners, top-level providers, routing, header/footer, and booking demo UIs.

Routing & Pages
- routes.tsx ? application route configuration, lazy imports, auth wrappers (RequireAuth, RedirectIfAuthenticated), and protectedRouteWrapper utilities.

Pages (primary flows)
- src/pages/landingpage.tsx ? landing hero, public packages loader, CTA to booking, package info modal.
- src/pages/bookingpage.tsx ? booking flow: package selection, customer/contact fields, add-ons, autosave drafts, validation and proceed-to-summary.
- src/pages/summarypage.tsx ? booking price breakdown, totals calculation (calculateTotals), confirmBooking persistence.
- src/pages/bookingconfirmation.tsx ? view booking by reference; print/download/copy ref, robust date parsing.
- src/pages/customerdashboard.tsx ? customer login (email/ref), view bookings, reupload payment proof (stores base64), session handling, demo seeding.
- src/pages/admindashboard.tsx ? admin dashboard, simple auth guard (local token), bookings overview, export CSV, admin actions.
- src/pages/admin/packagemanager.tsx ? manage packages (create/edit/delete), persist to storage, feature toggles.
- src/pages/admin/addonmanager.tsx ? CRUD for add-ons with localStorage persistence, small simulated delays.
- src/pages/admin/bookingmanager.tsx ? admin booking operations (approve, reject with modal, request payment proof), list, filters, export.
- src/pages/admin/gallerymanager.tsx ? create galleries (images as data URLs), manage expiry, send gallery links to bookings.
- src/pages/admin/settings.tsx ? payment and reminder template configuration, save to localStorage, preview templates.
- src/pages/customerdashboard.tsx ? (listed above) customer area.

UI components
- src/components/header.tsx ? app header, ThemeToggle, menu button and help hint.
- src/components/footer.tsx ? business contact details, theme toggle, back-to-top, small footer nav.
- src/components/packagecard.tsx ? package card with price breakdown and selection; uses PackagePriceBreakdown.
- src/components/addoncard.tsx ? presentational add-on card with selection indicator (controlled/uncontrolled).
- src/components/packageselector.tsx ? package filtering UI with search, filters, sorting and accessible listbox.
- src/components/addonsselector.tsx ? add-ons selection list with checkboxes and uncontrolled/controlled modes.
- src/components/datetimepicker.tsx ? date/time input (datetime-local) with availability checks (checkAvailability) and min/max handling.
- src/components/eventdetailsform.tsx ? full event/contact form with validation and field-level error reporting.
- src/components/paymentstep.tsx ? payment proof upload UI, validation (validatePaymentProof), local upload (uploadPaymentProof).
- src/components/bookinglist.tsx ? generic booking list component with BookingRow and client-side search/filter/sort.
- src/components/galleryviewer.tsx ? gallery viewer with thumbnails, zoom/pan, keyboard navigation, and download helper (downloadImage).
- src/components/protectedroute.tsx ? route guard and admin PIN validation, session checks and redirects.
- src/components/modal.tsx ? accessible modal container with focus trap, backdrop management, open/close helpers and global modal manager.

Services & domain logic
- src/services/storageservice.ts ? central storage wrapper around localStorage; schema versioning, migration helpers, import/export state. Implement migrations here first.
- src/services/bookingservice.ts ? booking domain model: load/save bookings, normalization, createBooking, listBookings, checkAvailability, and status updates.
- src/services/authservice.ts ? admin PIN creation/verification using Web Crypto (PBKDF2), session creation for customers, login/logout helpers.
- src/services/notificationservice.ts ? scheduling and sending reminders/notifications (in-app + browser Notification API), templating support and runDueReminders.
- src/services/analyticsservice.ts ? lightweight analytics (event tracking, summaries, popular packages), localStorage-backed.
- backupexportservice.ts ? robust export/import with size checks, validation, and warnings for large blobs.

Admin & utility pages
- adminsidebar.tsx ? admin navigation sidebar with keyboard accessibility and persisted collapse/active state.
- adminsetupwizard.tsx ? initial admin PIN creation, demo data seeding (seedDemoData), uses PBKDF2 hashing.
- paymentinstructionseditor.tsx ? editor for manual payment instructions with validation and persistence.
- remindertemplateeditor.tsx ? reminder template editor + preview and template parser/render (renderTemplatePreview, validateTemplate).
- packagemanager.tsx, addonmanager.tsx, bookingmanager.tsx, gallerymanager.tsx ? CRUD pages and managers (see pages list).

Utilities & helpers
- imagecompressor.ts ? fileToBase64, resize/compress to reduce localStorage footprint with OffscreenCanvas fallback.
- serviceworker.ts ? service worker implementation (precache, fetch strategies, push/sync handlers, postMessage).
- serviceworkerregistration.ts ? safe SW register/unregister with lifecycle callbacks and origin checks.
- backupexportservice.ts ? export/import backup JSON helpers with validation and skipped-large-blobs handling.
- validators.ts ? input validators: isValidEmail (robust), validatePhone, base64 image detection (isBase64Image).
- formatters.ts ? currency/date/duration formatting helpers.
- utils/validators.ts & utils/formatters.ts ? additional helper functions used across components.
- types/index.ts ? shared TypeScript types (AppSettings, Booking, PackageItem, etc.)
- hooks/uselocalstoragesync.ts ? React hook syncing state to localStorage with cross-tab events.
- hooks/usedarkmode.ts ? hook for dark mode with system preference and storage sync.

Build & CI
- .github/workflows/ci.yml ? CI workflow (install, lint, type-check, test, build, artifact upload).
- index.css, global.scss, theme.scss ? styling and theme tokens for the app.
- index.ts ? app-level global helpers (theme toggling, global keyboard handling, setupGlobals/teardown).

Notes, pitfalls & TODOs (recommended next steps)
-----------------------------------------------
- Implement storageservice.ts schema & migrations early. Keep meta (META_KEY) and versioning consistent; register migrations in MIGRATIONS for upgrades.
- Seed/demos: adminsetupwizard.tsx can seed demo packages/bookings ? useful for development.
- Booking availability must be validated server-side in a real app; current bookingservice.checkAvailability is single-resource, local-only.
- Image uploads can grow localStorage quickly ? enforce compression/size warnings and encourage backup/export.
- Service worker paths must match produced file names after build. Confirm registration URL (main.tsx registers '/sw.js' ? ensure your bundler outputs that, or adjust registerServiceWorker call).
- Accessibility: components include ARIA attributes, keyboard handlers, and focus management ? test with keyboard and screen readers.
- Performance: large localStorage bodies (many base64 images) are expensive ? prefer to store thumbnails and link to external resources if migrating to a server later.

Troubleshooting tips
--------------------
- If localStorage is unavailable (private mode), app uses memory fallback; data will not persist across reloads.
- If the app fails to load after changes, run npm run build locally and inspect dist; use the ErrorBoundary logs (localStorage key photobooth.lastError) for diagnostics.
- Service worker updates may be cached ? use navigator.serviceWorker.getRegistrations() or unregisterServiceWorker() to clear during dev.

Contributing & change workflow
-------------------------------
- Make small, focused commits. Run lint/test locally before opening PR.
- When using an AI assistant:
  - Run only one edit/patch at a time.
  - Validate app locally (lint, type-check, test).
  - Commit and push after verifying behavior.
  - Keep an audit trail: each commit should describe what changed and why.

Contact & further reading
-------------------------
- This project stores all data locally ? no server backup. Plan migrations and backups accordingly.
- For production/scale consider adding a backend for persistence, secure authentication, server-side reminders/scheduler, and CDN-hosted gallery assets.

If you want, I can:
- Produce a prioritized implementation checklist mapped one-to-one to files (small tasks per file).
- Generate suggested migration steps for storageservice when changing booking schema.
- Generate example GitHub Actions deploy workflow for Vercel/Netlify.

Which would you like next?