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
- Backend health-check endpoint at /api/health

## Tech Stack

- **Frontend:** HTML, CSS, JavaScript
- **Backend:** Node.js, Express
- **Database:** SQLite with better-sqlite3
- **Authentication:** bcryptjs, express-session
- **File uploads:** Multer

## Run Locally

### Prerequisites

- Node.js 22 or later
- npm (included with Node.js)

### 1. Clone the repository

git clone https://github.com/mr-altamash-dev/CodeAlpha_OffCampus.git
cd CodeAlpha_OffCampus


### 2. Install dependencies

npm install


### 3. Set a session secret

In **Windows PowerShell**, run:

$env:SESSION_SECRET = [guid]::NewGuid().ToString("N") + [guid]::NewGuid().ToString("N")


### 4. Start the server

npm start

Open [http://localhost:3000](http://localhost:3000) in your browser. The health endpoint is [http://localhost:3000/api/health](http://localhost:3000/api/health).


## Main Project Files

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


## Manual Test Checklist

- [ ] Register a new account and log in.
- [ ] Create a post, like it, and add a comment.
- [ ] Follow another account and check follower/following information.
- [ ] Edit profile details and confirm the change persists.
- [ ] Upload a photo and a short video, then confirm they display correctly.
- [ ] Check the layout at a mobile-sized browser viewport.
- [ ] Confirm private database files and server source are not served as public static files.

## Internship

CodeAlpha Full Stack Development Internship
Task 2: Social Media Platform
