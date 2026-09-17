# AI Study Partner

AI Study Partner helps you turn your own study material into a guided learning experience.
Upload your PDFs or notes, and the app can:

- create a study structure (subjects, chapters, topics)
- explain topics step-by-step
- generate quizzes and mock exams
- track weak areas and progress

This project is open source and designed to run on your own machine.

## Who this is for

- **Students** who want a personal study tutor
- **Parents/teachers** helping someone revise
- **Open-source contributors** who want to improve the app

## What you need before starting

- Node.js 18.17 or newer
- An AI CLI account/tool supported by the app (`claude` or `codex`)

## Quick start (recommended)

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create your local environment file:

   ```bash
   cp .env.example .env.local
   ```

3. Set a secure companion secret in `.env.local`:

   ```bash
   COMPANION_SECRET=your-long-random-secret
   ```

   You can generate one with:

   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

4. Start everything:

   ```bash
   npm run dev:all
   ```

5. Open http://localhost:3000 and create your local account.

## First-time setup in the app

After opening the app:

1. Go to **Settings → AI settings**
2. Make sure companion service is connected
3. Install/sign in to your selected AI CLI if needed
4. Upload your first PDF or notes and start learning

## Daily use flow

1. Upload study material
2. Let the app generate a course outline
3. Learn topic-by-topic
4. Take quizzes
5. Revise weak topics
6. Track progress over time

## Privacy and local data

- Your account, progress, and uploaded files are stored locally in `./data`.
- `./data` is git-ignored and not committed by default.
- The app is intended for local personal use.

## Password reset

If you forget your password:

```bash
npm run reset-password
```

Or reset a specific local email:

```bash
npm run reset-password you@example.com
```

## Run with Docker (optional)

The web app can run in Docker, but the companion service should run on your host machine.

1. Start companion on host:

   ```bash
   npm run companion
   ```

2. In another terminal, run Docker:

   ```bash
   export $(grep -v '^#' .env.local | xargs)
   docker compose up --build
   ```

Then open http://localhost:3000.

## For open-source contributors

Contributions are welcome.

1. Fork the repository
2. Create a feature branch
3. Make focused changes
4. Run checks:

   ```bash
   npm run lint
   npm run test
   ```

5. Open a pull request with a clear summary

## Project structure

- `src/app` – pages and API routes
- `src/components` – UI components
- `src/lib` – core learning, quiz, ingest, and storage logic
- `companion` – local AI companion service
- `scripts` – helper scripts (dev and password reset)

## Scripts reference

- `npm run dev` – start web app
- `npm run companion` – start companion service
- `npm run dev:all` – start both services
- `npm run lint` – run linter
- `npm run test` – run tests
- `npm run build` – production build
