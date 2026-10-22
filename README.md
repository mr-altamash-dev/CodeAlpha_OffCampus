# OffCampus — Student Social Media Platform

OffCampus is a student-focused social media web application where users can create posts, interact with other students, and manage their profiles. This project was built as a full-stack web development learning project.

## Features

- User registration and login
- Password hashing and session-based authentications
- Create and view posts
- Like and comment on posts
- Search posts
- Follow and unfollow users
- View followers and following information
- Edit profile details and bio
- Upload and view photos and videos
- Responsive interface for desktop and mobile-sized screens
- Backend health-check endpoint at `/api/health`

## Tech Stack

- **Frontend:** HTML, CSS, JavaScript
- **Backend:** Node.js, Express
- **Database:** SQLite with `better-sqlite3`
- **Authentication:** `bcryptjs`, `express-session`
- **File uploads:** Multer

## Run Locally

### Prerequisites

- Node.js **22 or later**
- npm (included with Node.js)

### 1. Clone the repository

```bash
git clone https://github.com/mr-altamash-dev/CodeAlpha_OffCampus.git
cd CodeAlpha_OffCampus
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set a session secret

Set a fresh secret before starting the server. In **Windows PowerShell**, run:

```powershell
$env:SESSION_SECRET = [guid]::NewGuid().ToString("N") + [guid]::NewGuid().ToString("N")
```

Keep the secret private. For a persistent local setup, you can store it in a local `.env` file only if the project is configured to load `.env` files; never commit that file.

### 4. Start the server

```bash
npm start
```

Open [http://localhost:3000](http://localhost:3000) in your browser. The health endpoint is [http://localhost:3000/api/health](http://localhost:3000/api/health).

A fresh local setup should use its own local SQLite database. Existing local accounts, posts, and uploaded media are not included in this source repository.

## Main Project Files

```text
OffCampus/
├── auth.html       # Registration and login page
├── auth.js         # Authentication page behavior
├── index.html      # Main app interface
├── style.css       # Layout and styling
├── script.js       # Frontend app behavior
├── server.js       # Express server and API routes
├── package.json    # Dependencies and npm scripts
├── package-lock.json
├── .gitignore      # Excludes local/private files
└── README.md
```

## Privacy and Security Notes

- Do not commit `node_modules/`, `.env` files, database files, or private user-uploaded media.
- The `.gitignore` should exclude `offcampus.db`, SQLite sidecar files, and the contents of `uploads/`.
- Use a unique, private `SESSION_SECRET`; do not publish real credentials or personal data.
- For real production use, review deployment configuration, session cookie settings, upload limits, access controls, and data-retention requirements.

## Manual Test Checklist

- [ ] Register a new account and log in.
- [ ] Create a post, like it, and add a comment.
- [ ] Follow another account and check follower/following information.
- [ ] Edit profile details and confirm the change persists.
- [ ] Upload a photo and a short video, then confirm they display correctly.
- [ ] Check the layout at a mobile-sized browser viewport.
- [ ] Confirm private database files and server source are not served as public static files.

## AI Assistance and Internship Policy

AI tools were used during development of this project. CodeAlpha's published [Terms & Conditions](https://www.codealpha.tech/files/Terms%20%26%20Conditions.pdf) state that AI-generated code must not be submitted during internships or challenges. Confirm the current rule with the internship coordinator before submitting this repository as an official task, and follow the applicable policy. Describe your own work accurately and be prepared to explain and maintain the code.
