const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const crypto = require("crypto");

const app = express();
const db = new Database(path.join(__dirname, "offcampus.db"));
const PORT = process.env.PORT || 3000;
const uploadsDir = path.join(__dirname, "uploads");
fs.mkdirSync(uploadsDir, { recursive: true });

// Avoid advertising the framework and add baseline browser security headers.
app.disable("x-powered-by");
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (req.path.startsWith("/api/")) {
    res.setHeader("Cache-Control", "no-store");
  }
  next();
});

// Small in-process throttling for authentication endpoints. For a public
// production deployment, use a shared rate limiter/store at the proxy or app layer.
const authRateBuckets = new Map();
const AUTH_RATE_WINDOW_MS = 15 * 60 * 1000;
const AUTH_RATE_LIMIT = 30;
function limitAuthAttempts(req, res, next) {
  const now = Date.now();
  const key = `${req.ip}:${req.path}`;
  let bucket = authRateBuckets.get(key);

  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + AUTH_RATE_WINDOW_MS };
  }
  bucket.count += 1;
  authRateBuckets.set(key, bucket);

  if (authRateBuckets.size > 1000) {
    for (const [entryKey, entry] of authRateBuckets) {
      if (now >= entry.resetAt) authRateBuckets.delete(entryKey);
    }
  }

  if (bucket.count > AUTH_RATE_LIMIT) {
    res.setHeader("Retry-After", String(Math.ceil((bucket.resetAt - now) / 1000)));
    return res.status(429).json({
      error: "Too many login or registration attempts. Please try again later."
    });
  }
  next();
}

const allowedMedia = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/gif", ".gif"],
  ["image/webp", ".webp"],
  ["video/mp4", ".mp4"],
  ["video/webm", ".webm"],
  ["video/ogg", ".ogv"]
]);

const mediaUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, callback) => callback(null, uploadsDir),
    filename: (req, file, callback) => {
      const extension = allowedMedia.get(file.mimetype);
      callback(null, `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${extension}`);
    }
  }),
  limits: { fileSize: 50 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, callback) => {
    if (!allowedMedia.has(file.mimetype)) {
      return callback(new Error("Choose a JPG, PNG, GIF or WebP image, or an MP4, WebM or OGG video."));
    }
    callback(null, true);
  }
});

// Check the bytes at the start of a file as well as its browser-supplied MIME
// type. This is a useful first filter, not a substitute for malware scanning.
function hasValidMediaSignature(file) {
  let descriptor;
  try {
    const header = Buffer.alloc(16);
    descriptor = fs.openSync(file.path, "r");
    const bytesRead = fs.readSync(descriptor, header, 0, header.length, 0);
    const bytes = header.subarray(0, bytesRead);

    switch (file.mimetype) {
      case "image/jpeg":
        return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
      case "image/png":
        return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
      case "image/gif":
        return bytes.length >= 6 && ["GIF87a", "GIF89a"].includes(bytes.toString("ascii", 0, 6));
      case "image/webp":
        return bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
      case "video/mp4":
        return bytes.length >= 12 && bytes.toString("ascii", 4, 8) === "ftyp";
      case "video/webm":
        return bytes.length >= 4 && bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
      case "video/ogg":
        return bytes.length >= 4 && bytes.toString("ascii", 0, 4) === "OggS";
      default:
        return false;
    }
  } catch (error) {
    return false;
  } finally {
    if (descriptor !== undefined) {
      try { fs.closeSync(descriptor); } catch (_) {}
    }
  }
}

if (!process.env.SESSION_SECRET) {
  console.error("SESSION_SECRET is missing. Set it before starting OffCampus.");
  process.exit(1);
}

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 1000 * 60 * 60 * 24
  }
}));

// Database tables. Existing data is preserved.
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    bio TEXT DEFAULT '',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    content TEXT DEFAULT '',
    media_path TEXT DEFAULT '',
    media_type TEXT DEFAULT '',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (post_id) REFERENCES posts(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS likes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (post_id, user_id),
    FOREIGN KEY (post_id) REFERENCES posts(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS follows (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    follower_id INTEGER NOT NULL,
    following_id INTEGER NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (follower_id, following_id),
    CHECK (follower_id != following_id),
    FOREIGN KEY (follower_id) REFERENCES users(id),
    FOREIGN KEY (following_id) REFERENCES users(id)
  );
`);

db.pragma("foreign_keys = ON");

// Serve only known frontend files. Do not expose the entire project directory,
// which may contain the database, source code, logs or environment files.
app.use("/uploads", express.static(uploadsDir, {
  dotfiles: "deny",
  index: false,
  setHeaders(res) {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
    res.setHeader("Content-Disposition", "inline");
  }
}));

app.get("/", (req, res, next) => {
  res.sendFile(path.join(__dirname, "index.html"), error => {
    if (error) next(error);
  });
});

app.get(["/index.html", "/auth.html", "/style.css", "/script.js", "/auth.js"], (req, res, next) => {
  const fileName = req.path.slice(1);
  res.sendFile(path.join(__dirname, fileName), error => {
    if (error) next(error);
  });
});

app.get("/api/health", (req, res) => {
  res.json({ success: true, message: "OffCampus backend is running." });
});

app.post("/api/register", limitAuthAttempts, async (req, res, next) => {
  try {
    const { username, email, password } = req.body;
    if (typeof username !== "string" || typeof email !== "string" || typeof password !== "string") {
      return res.status(400).json({ error: "Username, email and password are required." });
    }

    const cleanUsername = username.trim();
    const cleanEmail = email.trim().toLowerCase();

    if (!/^[a-zA-Z0-9_]{3,24}$/.test(cleanUsername)) {
      return res.status(400).json({ error: "Username must be 3-24 characters using letters, numbers or underscores." });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({ error: "Enter a valid email address." });
    }
    if (password.length < 8 || password.length > 72) {
      return res.status(400).json({ error: "Password must be between 8 and 72 characters." });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const result = db.prepare(`
      INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)
    `).run(cleanUsername, cleanEmail, passwordHash);

    const newUserId = Number(result.lastInsertRowid);
    // Rotate the session after registration to reduce session-fixation risk.
    req.session.regenerate(sessionError => {
      if (sessionError) return next(sessionError);
      req.session.userId = newUserId;
      res.status(201).json({
        success: true,
        user: { id: newUserId, username: cleanUsername, email: cleanEmail }
      });
    });
  } catch (error) {
    if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
      return res.status(409).json({ error: "That username or email is already registered." });
    }
    console.error("Registration error:", error);
    res.status(500).json({ error: "Could not create your account." });
  }
});

app.post("/api/login", limitAuthAttempts, (req, res, next) => {
  const { email, password } = req.body;
  if (typeof email !== "string" || typeof password !== "string") {
    return res.status(400).json({ error: "Email and password are required." });
  }

  const user = db.prepare(`
    SELECT id, username, email, password_hash FROM users WHERE email = ?
  `).get(email.trim().toLowerCase());

  if (!user) return res.status(401).json({ error: "Invalid email or password." });

  bcrypt.compare(password, user.password_hash, (error, matches) => {
    if (error) return next(error);
    if (!matches) return res.status(401).json({ error: "Invalid email or password." });

    req.session.regenerate(sessionError => {
      if (sessionError) return next(sessionError);
      req.session.userId = user.id;
      res.json({
        success: true,
        user: { id: user.id, username: user.username, email: user.email }
      });
    });
  });
});

app.get("/api/me", (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: "Please log in." });
  const user = db.prepare(`
    SELECT id, username, email, bio, created_at FROM users WHERE id = ?
  `).get(req.session.userId);
  if (!user) return res.status(401).json({ error: "Please log in again." });
  res.json({ user });
});

function requireLogin(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: "Please log in." });
  next();
}

// NEW: update the current user's username and bio.
app.patch("/api/me", requireLogin, (req, res) => {
  const username = typeof req.body.username === "string" ? req.body.username.trim() : "";
  const bio = typeof req.body.bio === "string" ? req.body.bio.trim() : "";

  if (!/^[a-zA-Z0-9_]{3,24}$/.test(username)) {
    return res.status(400).json({ error: "Username must be 3-24 characters using letters, numbers or underscores." });
  }
  if (bio.length > 160) {
    return res.status(400).json({ error: "Bio must be 160 characters or fewer." });
  }

  try {
    db.prepare("UPDATE users SET username = ?, bio = ? WHERE id = ?")
      .run(username, bio, req.session.userId);

    const user = db.prepare(`
      SELECT id, username, email, bio, created_at FROM users WHERE id = ?
    `).get(req.session.userId);

    res.json({ success: true, user });
  } catch (error) {
    if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
      return res.status(409).json({ error: "That username is already taken." });
    }
    console.error("Profile update error:", error);
    res.status(500).json({ error: "Could not update your profile." });
  }
});

app.get("/api/posts", (req, res) => {
  const posts = db.prepare(`
    SELECT p.id, p.content, p.media_path, p.media_type, p.created_at, u.id AS user_id, u.username,
      (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) AS likes,
      (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS comment_count,
      EXISTS (SELECT 1 FROM likes l WHERE l.post_id = p.id AND l.user_id = ?) AS liked
    FROM posts p JOIN users u ON u.id = p.user_id ORDER BY p.id DESC
  `).all(req.session.userId || 0);
  res.json({ posts });
});

app.post("/api/posts", requireLogin, (req, res, next) => {
  mediaUpload.single("media")(req, res, error => {
    if (error) {
      const status = error instanceof multer.MulterError
        ? (error.code === "LIMIT_FILE_SIZE" ? 413 : 400)
        : 400;
      return res.status(status).json({
        error: error.code === "LIMIT_FILE_SIZE"
          ? "The selected file exceeds the 50 MB upload limit."
          : error.message || "Could not upload that file."
      });
    }

    try {
      const content = typeof req.body.content === "string" ? req.body.content.trim() : "";
      const file = req.file;

      if (!content && !file) {
        return res.status(400).json({ error: "Write something or choose a photo/video." });
      }
      if (content.length > 1000) {
        if (file) fs.unlink(file.path, () => {});
        return res.status(400).json({ error: "Post text must be 1000 characters or fewer." });
      }
      if (file && file.mimetype.startsWith("image/") && file.size > 10 * 1024 * 1024) {
        fs.unlink(file.path, () => {});
        return res.status(413).json({ error: "Images must be 10 MB or smaller." });
      }
      if (file && !hasValidMediaSignature(file)) {
        fs.unlink(file.path, () => {});
        return res.status(400).json({
          error: "This file does not match the selected image or video format. Please choose a valid media file."
        });
      }

      const mediaPath = file ? `/uploads/${file.filename}` : "";
      const mediaType = file ? (file.mimetype.startsWith("image/") ? "image" : "video") : "";

      const result = db.prepare(`
        INSERT INTO posts (user_id, content, media_path, media_type)
        VALUES (?, ?, ?, ?)
      `).run(req.session.userId, content, mediaPath, mediaType);

      const post = db.prepare(`
        SELECT p.id, p.content, p.media_path, p.media_type, p.created_at,
               u.id AS user_id, u.username
        FROM posts p JOIN users u ON u.id = p.user_id WHERE p.id = ?
      `).get(result.lastInsertRowid);

      res.status(201).json({ post });
    } catch (routeError) {
      if (req.file) fs.unlink(req.file.path, () => {});
      next(routeError);
    }
  });
});

app.post("/api/posts/:id/like", requireLogin, (req, res) => {
  const postId = Number(req.params.id);
  if (!Number.isSafeInteger(postId) || postId < 1) return res.status(400).json({ error: "Invalid post ID." });
  if (!db.prepare("SELECT id FROM posts WHERE id = ?").get(postId)) {
    return res.status(404).json({ error: "Post not found." });
  }

  const existing = db.prepare("SELECT id FROM likes WHERE post_id = ? AND user_id = ?")
    .get(postId, req.session.userId);
  if (existing) {
    db.prepare("DELETE FROM likes WHERE id = ?").run(existing.id);
  } else {
    db.prepare("INSERT INTO likes (post_id, user_id) VALUES (?, ?)")
      .run(postId, req.session.userId);
  }
  const likes = db.prepare("SELECT COUNT(*) AS count FROM likes WHERE post_id = ?")
    .get(postId).count;
  res.json({ liked: !existing, likes });
});

app.get("/api/posts/:id/comments", (req, res) => {
  const postId = Number(req.params.id);
  if (!Number.isSafeInteger(postId) || postId < 1) return res.status(400).json({ error: "Invalid post ID." });
  const comments = db.prepare(`
    SELECT c.id, c.content, c.created_at, u.username
    FROM comments c JOIN users u ON u.id = c.user_id
    WHERE c.post_id = ? ORDER BY c.id ASC
  `).all(postId);
  res.json({ comments });
});

app.post("/api/posts/:id/comments", requireLogin, (req, res) => {
  const postId = Number(req.params.id);
  const content = typeof req.body.content === "string" ? req.body.content.trim() : "";
  if (!Number.isSafeInteger(postId) || postId < 1) return res.status(400).json({ error: "Invalid post ID." });
  if (!content || content.length > 500) return res.status(400).json({ error: "Comment must contain 1–500 characters." });
  if (!db.prepare("SELECT id FROM posts WHERE id = ?").get(postId)) {
    return res.status(404).json({ error: "Post not found." });
  }

  const result = db.prepare(`
    INSERT INTO comments (post_id, user_id, content) VALUES (?, ?, ?)
  `).run(postId, req.session.userId, content);
  const comment = db.prepare(`
    SELECT c.id, c.content, c.created_at, u.username
    FROM comments c JOIN users u ON u.id = c.user_id WHERE c.id = ?
  `).get(result.lastInsertRowid);
  res.status(201).json({ comment });
});

app.get("/api/users/suggestions", requireLogin, (req, res) => {
  const userId = req.session.userId;
  const users = db.prepare(`
    SELECT u.id, u.username, u.bio,
      EXISTS (SELECT 1 FROM follows f WHERE f.follower_id = ? AND f.following_id = u.id) AS is_following
    FROM users u WHERE u.id != ? ORDER BY u.username COLLATE NOCASE LIMIT 20
  `).all(userId, userId);
  const followingCount = db.prepare("SELECT COUNT(*) AS count FROM follows WHERE follower_id = ?")
    .get(userId).count;
  res.json({ users, followingCount });
});

// NEW: list the actual accounts following the logged-in user.
app.get("/api/users/followers", requireLogin, (req, res) => {
  const userId = req.session.userId;
  const followers = db.prepare(`
    SELECT u.id, u.username, u.bio, f.created_at AS followed_at,
      EXISTS (
        SELECT 1 FROM follows back
        WHERE back.follower_id = ? AND back.following_id = u.id
      ) AS is_following
    FROM follows f JOIN users u ON u.id = f.follower_id
    WHERE f.following_id = ? ORDER BY f.id DESC
  `).all(userId, userId);
  res.json({ followers, followerCount: followers.length });
});

app.post("/api/users/:id/follow", requireLogin, (req, res) => {
  const targetId = Number(req.params.id);
  const userId = req.session.userId;
  if (!Number.isSafeInteger(targetId) || targetId < 1) return res.status(400).json({ error: "Invalid user ID." });
  if (targetId === userId) return res.status(400).json({ error: "You cannot follow yourself." });
  if (!db.prepare("SELECT id FROM users WHERE id = ?").get(targetId)) {
    return res.status(404).json({ error: "User not found." });
  }

  const existing = db.prepare("SELECT id FROM follows WHERE follower_id = ? AND following_id = ?")
    .get(userId, targetId);
  let following;
  if (existing) {
    db.prepare("DELETE FROM follows WHERE id = ?").run(existing.id);
    following = false;
  } else {
    db.prepare("INSERT INTO follows (follower_id, following_id) VALUES (?, ?)")
      .run(userId, targetId);
    following = true;
  }
  const followingCount = db.prepare("SELECT COUNT(*) AS count FROM follows WHERE follower_id = ?")
    .get(userId).count;
  res.json({ following, followingCount });
});

app.post("/api/logout", (req, res, next) => {
  req.session.destroy(error => {
    if (error) return next(error);
    res.clearCookie("connect.sid");
    res.json({ success: true });
  });
});

app.use((error, req, res, next) => {
  console.error("Server error:", error);
  res.status(500).json({ error: "Something went wrong on the server." });
});

app.listen(PORT, () => {
  console.log(`OffCampus is running at http://localhost:${PORT}`);
});

function closeDatabase() {
  if (db.open) db.close();
}
process.on("SIGINT", () => { closeDatabase(); process.exit(0); });
process.on("SIGTERM", () => { closeDatabase(); process.exit(0); });
