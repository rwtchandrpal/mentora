# Mentora

**An AI tutoring web app that helps you learn any topic step by step, talk through concepts, and test your knowledge with practice quizzes.**

Standard AI chat tools often dump long walls of text on you, get stuck asking the same questions when you are confused, or give unreliable quiz answers. Mentora solves this by organizing every study session into three focused modes—**Explain**, **Interact**, and **Practice**—all tailored to your background and learning style.

[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React 18](https://img.shields.io/badge/React_18-20232A?style=flat-square&logo=react&logoColor=61DAFB)](https://react.dev/)
[![Node.js](https://img.shields.io/badge/Node.js_20_LTS-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-000000?style=flat-square&logo=express&logoColor=white)](https://expressjs.com/)
[![MongoDB](https://img.shields.io/badge/MongoDB_Atlas-47A248?style=flat-square&logo=mongodb&logoColor=white)](https://www.mongodb.com/atlas)
[![Google Gemini API](https://img.shields.io/badge/Google_Gemini_API-8E75C2?style=flat-square&logo=google&logoColor=white)](https://ai.google.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=flat-square&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)

---

## Overview

Mentora is built for independent learners, including high school students, university students, and working professionals who want to pick up new skills.

Instead of re-explaining your background every time you start a new chat, you set up a learning profile once. After that, you can enter any topic and switch smoothly between reading structured explanations, having a guided conversation, and taking practice tests inside a single workspace.

---

<p>
  <a href="mentoraclient.vercel.app/login">
    <img src="https://img.shields.io/badge/Live_Demo-Visit%20Website-2ea44f?style=for-the-badge" alt="Live Demo">
  </a>
</p>

---

## Features

- **Personalized Learning Profile:** Choose your education level (*High School*, *Undergraduate*, or *Professional*) and preferred style (*Visual*, *Analogy-Heavy*, or *Concise & Technical*) once, and Mentora adapts every explanation and quiz to match.
- **Explain Mode (Step-by-Step Cards):** Breaks down complex topics into 4 bite-sized cards (*Intuition $\rightarrow$ Core Mechanism $\rightarrow$ Example $\rightarrow$ Check-for-Understanding*). Click **Next** to move at your own pace, or click **Go Deeper** on any card to see extra examples, math derivations, or diagrams.
- **Interact Mode (Guided Chat without Frustration):** Guides you through 3 to 5 key milestones for your topic using live streaming chat. If you get stuck 3 times in a row (the **3-Strike Circuit Breaker**)—or if you click *"Explain this milestone directly"*—the tutor stops quizzing you and gives a clear, direct explanation.
- **Practice Mode (3-Level Quiz Progression):** Tests your knowledge with 10-question multiple-choice quizzes across three difficulty levels (*Easy $\rightarrow$ Medium $\rightarrow$ Hard*). Your selected answers save automatically in your browser if you refresh the page, and submitting a quiz unlocks the next difficulty tier with full step-by-step explanations.
- **Rich Math, Code, and Diagrams:** Renders math equations ($\LaTeX$), syntax-highlighted code blocks with a copy button, and visual flowcharts (`Mermaid.js`). If an AI-generated diagram has a syntax error, it safely falls back to a clean text block instead of crashing the page.
- **Session History & Fair Daily Limits:** Saves all your past study sessions in a left sidebar so you can pick up right where you left off. Each user gets 50 AI tutor actions per day, while reviewing saved sessions and submitting active quizzes always remains free and unlimited.

---

## Tech Stack

### Frontend (`@mentora/client`)
- **React 18, Vite & TypeScript:** Builds a fast, type-safe single-page web interface.
- **Redux Toolkit & React Router v6:** Manages user login state, active study sessions, and page navigation.
- **Tailwind CSS:** Styles the responsive desktop and mobile workspace layout.
- **Axios & Native `fetch` Streams:** Handles standard API requests and streams live tutor chat replies using Server-Sent Events (SSE).
- **Markdown, KaTeX & Mermaid.js:** Renders formatted text, tables, math formulas, code blocks, and visual diagrams.

### Backend (`@mentora/server`)
- **Node.js 20 LTS, Express.js & TypeScript:** Runs the REST and streaming API server.
- **Google Gen AI SDK (`@google/genai`):** Connects to Google Gemini models—using `gemini-3.5-flash-lite` for fast chat and initial cards, and `gemini-3.6-pro` for deep dives and 10-question quizzes.
- **JSON Web Tokens (`jsonwebtoken`) & `bcryptjs`:** Secures user accounts with hashed passwords and stateless login tokens.
- **Zod:** Validates user inputs, environment variables, and AI JSON responses before saving them.
- **Pino, Helmet, CORS & `express-rate-limit`:** Provides structured server logs, security headers, and protection against spam requests.

### Shared Package (`@mentora/shared`)
- **TypeScript & Zod Contracts:** Shares data types, validation rules, and constants between the frontend and backend so both sides always stay in sync.

### Database & Hosting
- **MongoDB Atlas & Mongoose:** Stores user profiles, daily usage counters, and saved study sessions.
- **pnpm Workspaces:** Manages the frontend, backend, and shared packages inside a single repository (monorepo).
- **Vitest, Supertest & React Testing Library:** Runs automated unit, API, and UI tests.
- **Vercel & Render:** Hosts the React frontend (Vercel) and Express backend API (Render).

---

## Project Structure

Mentora is organized as a monorepo with three main workspaces:

```text
mentora/
├── packages/
│   └── shared/               # @mentora/shared: Shared Zod schemas, TypeScript types, and constants
├── apps/
│   ├── server/               # @mentora/server: Express backend API, Gemini AI logic, and MongoDB models
│   │   ├── src/
│   │   │   ├── ai/           # Google Gemini client, prompt builders, and model router
│   │   │   ├── controllers/  # HTTP and SSE request handlers
│   │   │   ├── middlewares/  # Auth, profile check, daily quota, and validation guards
│   │   │   ├── models/       # Mongoose schemas (User and TopicSession)
│   │   │   ├── routes/       # API route definitions (/api/v1/*)
│   │   │   └── services/     # Core logic for Explain, Interact, and Practice modes
│   │   └── .env.example      # Example backend environment variables
│   └── client/               # @mentora/client: React frontend application
│       ├── src/
│       │   ├── components/   # UI components for Explain, Interact, Practice, and Layout
│       │   ├── hooks/        # Custom hooks for SSE streaming and quiz draft saving
│       │   ├── pages/        # Login, Register, Onboarding, and Workspace pages
│       │   ├── services/     # API client setup
│       │   └── store/        # Redux state slices (auth, session, ui)
│       └── .env.example      # Example frontend environment variables
├── docs/                     # Project documentation and screenshot assets
├── package.json              # Root scripts to build, test, lint, and typecheck all workspaces
└── pnpm-workspace.yaml       # Workspace configuration
```

---

## Getting Started

Follow these steps to run Mentora on your computer.

### 1. Prerequisites
Make sure you have the following installed:
- **Node.js** (v20 LTS or higher)
- **pnpm** (Package manager)
- A **MongoDB Atlas** connection URI (or a local MongoDB instance)
- A **Google Gemini API Key** from Google AI Studio

### 2. Install Dependencies
Clone the repository and install dependencies for all workspaces from the root folder:

```bash
git clone https://github.com/<your-username>/mentora.git
cd mentora
pnpm install
```

### 3. Configure Environment Variables
Create `.env` files for both the backend and frontend using the provided `.env.example` templates.

#### Backend (`apps/server/.env`)
```bash
cp apps/server/.env.example apps/server/.env
```
Open `apps/server/.env` and fill in your values:
```dotenv
NODE_ENV=development
PORT=4000
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/mentora
JWT_SECRET=your-minimum-32-character-jwt-secret-key-here
JWT_EXPIRES_IN=7d
CLIENT_ORIGIN=http://localhost:5173
GEMINI_API_KEY=your-google-ai-studio-api-key
GEMINI_FAST_MODEL=gemini-3.5-flash-lite
GEMINI_REASONING_MODEL=gemini-3.6-pro
DAILY_AI_QUOTA_LIMIT=50
```

#### Frontend (`apps/client/.env`)
```bash
cp apps/client/.env.example apps/client/.env
```
Open `apps/client/.env` and make sure it points to your local backend server:
```dotenv
VITE_API_BASE_URL=http://localhost:4000/api/v1
```

### 4. Build and Run the Project
First, build the shared package so both the backend and frontend can use its types. Then start both development servers:

```bash
# 1. Build the shared contracts package
pnpm --filter @mentora/shared build

# 2. Start the backend server (runs on http://localhost:4000)
pnpm --filter @mentora/server dev

# 3. Open a second terminal and start the frontend app (runs on http://localhost:5173)
pnpm --filter @mentora/client dev
```

### 5. Useful Scripts
You can run these commands from the root directory to check code quality and run tests:

```bash
# Check TypeScript types across all packages
pnpm typecheck

# Run ESLint across all packages
pnpm lint

# Run automated unit and integration tests
pnpm test

# Run the standalone AI output evaluation script (dry run)
pnpm eval:ai -- --dry-run
```

---

## How to Use

1. **Sign Up & Set Your Profile:** Create an account and complete the quick 2-question setup by picking your education level and preferred explanation style. You can change these anytime in your Profile Settings.
2. **Start a Topic:** Type any subject into the prompt bar (for example, *"Deadlocks in Operating Systems"* or *"Photosynthesis"*) and choose a starting mode.
3. **Read in Explain Mode:** Read through the 4 progressive cards. Click **Next** to reveal the next card, or click **Go Deeper** if you want a more detailed breakdown of the current step.
4. **Chat in Interact Mode:** Switch to the **Interact** tab at the top of the page. Answer the tutor's questions to complete each milestone in the progress bar, or click *"Explain this milestone directly"* whenever you want a straightforward answer.
5. **Test Yourself in Practice Mode:** Switch to the **Practice** tab to take a 10-question Easy quiz. Click **Show Hint** if you need a clue. Once you answer all 10 questions and submit, review the step-by-step solutions and unlock the Medium and Hard quizzes.

---

## API Overview

All backend endpoints are prefixed with `/api/v1`:

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/v1/health` | `GET` | Checks server status and database connection. |
| `/api/v1/auth/register` | `POST` | Creates a new user account. |
| `/api/v1/auth/login` | `POST` | Logs in a user and returns a JWT token. |
| `/api/v1/auth/me` | `GET` | Fetches the logged-in user's profile and remaining daily quota. |
| `/api/v1/profile` | `PUT` | Saves or updates the user's Static Learner Profile. |
| `/api/v1/sessions` | `GET` / `POST` | Lists saved topic sessions or creates a new study session. |
| `/api/v1/sessions/:id` | `GET` / `DELETE` | Loads a specific study session (with unsubmitted quiz answers hidden) or deletes it. |
| `/api/v1/sessions/:id/mode` | `PATCH` | Updates the active tab (`explain`, `interact`, or `practice`). |
| `/api/v1/sessions/:id/explain/*` | `POST` / `PATCH` | Generates the 4 Explain cards, advances steps, or generates `Go Deeper` sub-cards. |
| `/api/v1/sessions/:id/interact/*` | `POST` | Generates learning milestones and streams Socratic chat replies over SSE. |
| `/api/v1/sessions/:id/practice/*` | `POST` | Generates 10-question MCQ batches and grades submitted answers. |

---

## Key Engineering Takeaways

- **Shared TypeScript & Zod Contracts:** Keeping all validation schemas and TypeScript types in `@mentora/shared` prevents mismatches between frontend forms, backend API routes, and Gemini AI outputs.
- **Predictable Tutoring with Server-Side State Machines:** Rather than relying on the AI alone to remember how many times a student has struggled, the backend tracks strikes and milestones directly and strips internal state tags (`<<MENTORA_STATE:...>>`) from the live chat stream before text reaches the browser.
- **Reasoning-First Quiz Generation:** When generating multiple-choice questions, the JSON schema forces the AI to write out the full `solutionExplanation` *before* picking the `correctOptionIndex`. This prevents the model from guessing an answer letter first and making up a flawed explanation afterward.
- **Safe Rendering & User Isolation:** Wrapping `Mermaid.js` diagram rendering in error boundaries prevents bad diagram syntax from crashing the app, while scoping every database query by `{ _id, userId }` ensures users can only access their own sessions.
