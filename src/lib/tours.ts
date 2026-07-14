import type { TourStep } from "@/components/guided-tour";

/** Dashboard / in-app walkthrough (launched from the welcome dialog & sidebar). */
export const APP_TOUR: TourStep[] = [
  {
    selectors: ['[data-tour="upload"]'],
    title: "1. Upload your material",
    body: "Start here. Add a PDF, notes or past papers and the AI turns them into a full, structured course.",
  },
  {
    selectors: ['[data-tour="focus"]'],
    title: "2. Today's Focus",
    body: "This card always tells you the single best thing to study next. Hit “Start now” and you're learning.",
  },
  {
    selectors: ['[data-tour="courses"]'],
    title: "3. Your courses",
    body: "Each course lives here. “Start / Resume” opens the lesson; “Outline” browses every topic.",
  },
  {
    selectors: ['[data-tour="nav"]', '[data-tour="menu"]'],
    title: "4. Get around",
    body: "Everything else is in the menu: Learn, Mock exam, Progress, Revision, Notes and AI settings.",
  },
  {
    selectors: ['[data-tour="focus"]', '[data-tour="upload"]'],
    title: "You're ready! 🎉",
    body: "That's the whole loop: upload → learn → quiz → review. Click “Start now” (or upload material) to begin.",
  },
];

/** Login / register screen — the very first thing a new user sees. */
export const LOGIN_TOUR: TourStep[] = [
  {
    selectors: ['[data-tour="auth-name"]', '[data-tour="auth-email"]'],
    title: "Welcome! Let's get you set up 👋",
    body: "This is your private study space. Create one local account — your name, an email and a password. It all stays on your device.",
  },
  {
    selectors: ['[data-tour="auth-email"]'],
    title: "Your email & password",
    body: "Use any email — it's just your login, not sent anywhere. Pick a password you'll remember.",
  },
  {
    selectors: ['[data-tour="auth-submit"]'],
    title: "Create your account",
    body: "Tap here to continue. Next we'll ask a couple of quick questions to personalise your tutor.",
  },
  {
    selectors: ['[data-tour="auth-toggle"]', '[data-tour="auth-submit"]'],
    title: "Already have an account?",
    body: "Been here before? Switch to “Sign in” instead. Otherwise, create your account and let's go!",
  },
];

/** Onboarding — step 1: study profile. */
export const PROFILE_TOUR: TourStep[] = [
  {
    selectors: ['[data-tour="goal"]'],
    title: "1. What are you studying for?",
    body: "Tell us your goal — e.g. “Final exam in Financial Management”. Your tutor uses it to keep lessons focused.",
  },
  {
    selectors: ['[data-tour="level"]'],
    title: "2. Your current level",
    body: "Pick how comfortable you are. Beginners get everything explained from scratch, no assumptions.",
  },
  {
    selectors: ['[data-tour="examDate"]'],
    title: "3. Exam date (optional)",
    body: "Add your exam date and the dashboard will count down and pace your revision. You can skip this.",
  },
  {
    selectors: ['[data-tour="profile-continue"]'],
    title: "Continue",
    body: "Save your profile and move on to connecting your AI — the engine that teaches you.",
  },
];

/** Onboarding — step 2: connect the local AI. The trickiest part for beginners. */
export const CONNECT_TOUR: TourStep[] = [
  {
    selectors: ['[data-tour="ai-connection"]'],
    title: "Connect your AI tutor",
    body: "Your tutor runs on your own AI on this computer — private and free with your subscription. Three quick checks below.",
  },
  {
    selectors: ['[data-tour="ai-install"]', '[data-tour="ai-connection"]'],
    title: "1. Install the CLI",
    body: "If the AI tool isn't installed yet, tap “Install” and we set it up for you. Green tick = done.",
  },
  {
    selectors: ['[data-tour="ai-signin"]', '[data-tour="ai-connection"]'],
    title: "2. Sign in",
    body: "Tap “Sign in”, run the one command it shows in your terminal, and approve it in your browser with your subscription account.",
  },
  {
    selectors: ['[data-tour="ai-verify"]'],
    title: "3. Test the connection",
    body: "Hit “Test connection” to confirm everything works. All three green means you're ready.",
  },
  {
    selectors: ['[data-tour="connect-continue"]'],
    title: "Continue to upload",
    body: "Connected? Head to upload and drop in your first document to build a course.",
  },
];

/** Upload screen — turning a document into a course. */
export const UPLOAD_TOUR: TourStep[] = [
  {
    selectors: ['[data-tour="dropzone"]', '[data-tour="uploaded-file"]'],
    title: "1. Add your document",
    body: "Drag a file in or click to browse — a PDF, notes or past paper (up to 25 MB). We read every page.",
  },
  {
    selectors: ['[data-tour="generate"]', '[data-tour="dropzone"]'],
    title: "2. Generate the course",
    body: "Once your file is picked, tap “Generate course”. The AI organises every topic — nothing gets skipped.",
  },
  {
    selectors: ['[data-tour="dropzone"]', '[data-tour="uploaded-file"]'],
    title: "That's it!",
    body: "We'll build your outline (about a minute), then you can start learning topic by topic. 🎉",
  },
];
