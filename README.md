<div align="center">

# 📚 AI Study Partner

### Learn from your own notes with a simple AI tutor

[![Open Source](https://img.shields.io/badge/Open%20Source-Yes-22c55e)](https://github.com/codewithowais/ai-study-planner)
![Beginner Friendly](https://img.shields.io/badge/Beginner%20Friendly-Yes-3b82f6)
![Runs Locally](https://img.shields.io/badge/Runs-Local%20Machine-f59e0b)

</div>

AI Study Partner is an open-source app for students.
You upload your study files (PDFs/notes), and it helps you learn step by step.

## ✨ What this app can do

- Turn your notes into chapters and topics
- Explain topics in easy language
- Create quizzes and mock exams
- Show weak topics for revision
- Save your learning progress

## 👥 Who should use this

- Students preparing for exams
- Parents and teachers helping students
- Open-source beginners who want to contribute

## ✅ Before you start

You need:

- Node.js 18.17+
- One supported AI CLI: `claude` or `codex`

## 🚀 Quick start (5 steps)

1. Install packages:

   ```bash
   npm install
   ```

2. Create local environment file:

   ```bash
   cp .env.example .env.local
   ```

3. Add this in `.env.local`:

   ```bash
   COMPANION_SECRET=your-long-random-secret
   ```

4. (Optional) Generate a strong secret:

   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

5. Start the app:

   ```bash
   npm run dev:all
   ```

Now open: **http://localhost:3000**

## 🛠 First-time setup inside the app

After opening the app:

1. Go to **Settings → AI settings**
2. Check companion status
3. Install/sign in to your AI CLI if needed
4. Upload your first study file

## 📖 How learning works

1. Upload PDF or notes
2. App creates a course structure
3. Learn topic-by-topic
4. Take quizzes
5. Revise weak areas
6. Track progress

## 🔒 Privacy (simple)

- Your data is stored on your machine in `./data`
- `./data` is git-ignored
- This app is made for local personal use

## 🔑 Forgot password?

Reset local password:

```bash
npm run reset-password
```

Reset specific email:

```bash
npm run reset-password you@example.com
```

## 🐳 Docker (optional)

Run companion on host:

```bash
npm run companion
```

Then run web app in Docker:

```bash
export $(grep -v '^#' .env.local | xargs)
docker compose up --build
```

Open: **http://localhost:3000**

## 🤝 Contributing (easy)

1. Fork this repo
2. Create a branch
3. Make your changes
4. Run:

   ```bash
   npm run lint
   npm run test
   ```

5. Open a pull request with clear summary

## 📂 Project folders

- `src/app` → pages and API routes
- `src/components` → UI components
- `src/lib` → app logic (learn, quiz, store, ingest)
- `companion` → local AI companion service
- `scripts` → helper scripts

## 📜 Useful scripts

- `npm run dev` → start web app
- `npm run companion` → start companion service
- `npm run dev:all` → start both together
- `npm run lint` → lint checks
- `npm run test` → tests
- `npm run build` → production build
