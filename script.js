const postForm = document.getElementById("post-form");
const postContent = document.getElementById("post-content");
const postMedia = document.getElementById("post-media");
const mediaPreview = document.getElementById("media-preview");
const postSearch = document.getElementById("post-search");
const feedList = document.getElementById("feed-list");
const noPostsMessage = document.getElementById("no-posts");
const suggestedPeople = document.getElementById("suggested-people");
const followersList = document.getElementById("followers-list");

let currentUser = null;
let posts = [];
let people = [];
let followers = [];
const openComments = new Set();

async function api(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...options,
    headers: {
      ...(options.body && !(options.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
      ...options.headers
    }
  });

  const data = await response.json().catch(() => ({}));

  if (response.status === 401) {
    window.location.href = "/auth.html";
    throw new Error("Please log in.");
  }

  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}

function createElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function initialsFor(username) {
  return (username || "?").slice(0, 2).toUpperCase();
}

function formatTime(value) {
  const timestamp = Number.isFinite(Number(value)) ? Number(value) : Date.parse(value);
  if (!Number.isFinite(timestamp)) return "";

  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  return new Date(timestamp).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short"
  });
}

function makeAvatar(initials, tone, className) {
  return createElement("div", `${className} ${tone}`, initials);
}

async function loadFeed() {
  const data = await api("/api/posts");

  posts = data.posts.map(post => ({
    ...post,
    id: Number(post.id),
    text: post.content || "",
    media_path: post.media_path || "",
    media_type: post.media_type || "",
    name: post.username,
    handle: post.username,
    initials: initialsFor(post.username),
    tone: Number(post.user_id) === Number(currentUser.id) ? "tone-user" : "tone-sage",
    createdAt: Date.parse(post.created_at + " UTC"),
    likes: Number(post.likes),
    liked: Boolean(post.liked)
  }));

  renderFeed();
}

async function loadSuggestions() {
  const data = await api("/api/users/suggestions");
  people = data.users;
  renderSuggestions();

  const count = document.getElementById("your-following-count");
  if (count) count.textContent = data.followingCount;
}

async function loadFollowers() {
  const data = await api("/api/users/followers");
  followers = data.followers;
  renderFollowers();

  const count = document.getElementById("your-follower-count");
  if (count) count.textContent = data.followerCount;
}

function createFollowButton(person, labelWhenNotFollowing = "Follow") {
  const isFollowing = Boolean(person.is_following);
  const button = createElement(
    "button",
    `follow-button${isFollowing ? " following" : ""}`,
    isFollowing ? "Following" : labelWhenNotFollowing
  );

  button.type = "button";
  button.setAttribute("aria-pressed", String(isFollowing));

  button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      await api(`/api/users/${person.id}/follow`, { method: "POST" });
      await Promise.all([loadSuggestions(), loadFollowers()]);
    } catch (error) {
      alert(error.message);
    } finally {
      button.disabled = false;
    }
  });

  return button;
}

function createPersonRow(person, labelWhenNotFollowing = "Follow") {
  const row = createElement("div", "person-row");
  const avatar = makeAvatar(initialsFor(person.username), "tone-sage", "person-avatar");
  const details = createElement("div", "person-details");

  details.append(
    createElement("strong", "", person.username),
    createElement("span", "", person.bio || "OffCampus member")
  );

  row.append(avatar, details, createFollowButton(person, labelWhenNotFollowing));
  return row;
}

function renderFollowers() {
  if (!followersList) return;
  followersList.replaceChildren();

  if (followers.length === 0) {
    followersList.appendChild(createElement(
      "p",
      "composer-hint",
      "No followers yet. Share a post and meet your people!"
    ));
    return;
  }

  followers.forEach(person => {
    followersList.appendChild(createPersonRow(person, "Follow back"));
  });
}

function createCommentsArea(post) {
  const area = createElement("div", "comments-area");
  area.hidden = !openComments.has(post.id);

  const commentsList = createElement("div", "comments-list");
  const form = createElement("form", "comment-form");
  const input = createElement("input");
  const button = createElement("button", "", "Reply");

  input.type = "text";
  input.maxLength = 500;
  input.placeholder = "Write a comment...";
  input.setAttribute("aria-label", "Write a comment");
  input.required = true;
  button.type = "submit";
  form.append(input, button);

  async function loadComments() {
    const data = await api(`/api/posts/${post.id}/comments`);
    commentsList.replaceChildren();

    if (!data.comments.length) {
      commentsList.appendChild(createElement("p", "composer-hint", "No comments yet. Start the conversation."));
    }

    data.comments.forEach(comment => {
      const row = createElement("div", "comment");
      const avatar = makeAvatar(initialsFor(comment.username), "tone-sage", "comment-avatar");
      const content = createElement("div", "comment-content");
      content.append(
        createElement("strong", "", comment.username),
        createElement("p", "", comment.content)
      );
      row.append(avatar, content);
      commentsList.appendChild(row);
    });

    const card = area.closest(".post-card");
    if (card) {
      const commentButton = [...card.querySelectorAll(".post-action")]
        .find(item => item.textContent.includes("Comment"));
      if (commentButton) commentButton.textContent = `◯ Comment · ${data.comments.length}`;
    }
  }

  form.addEventListener("submit", async event => {
    event.preventDefault();
    const content = input.value.trim();
    if (!content) return;
    button.disabled = true;

    try {
      await api(`/api/posts/${post.id}/comments`, {
        method: "POST",
        body: JSON.stringify({ content })
      });
      input.value = "";
      await loadComments();
    } catch (error) {
      alert(error.message);
    } finally {
      button.disabled = false;
    }
  });

  area.append(commentsList, form);
  if (openComments.has(post.id)) loadComments().catch(error => alert(error.message));
  return area;
}

function createPostCard(post) {
  const card = createElement("article", "post-card card");
  const header = createElement("div", "post-header");
  const avatar = makeAvatar(post.initials, post.tone, "post-avatar");
  const author = createElement("div", "post-author");

  author.append(
    createElement("strong", "", post.name),
    createElement("span", "", `@${post.handle}`)
  );

  const time = createElement("time", "post-time", formatTime(post.createdAt));
  if (Number.isFinite(post.createdAt)) time.dateTime = new Date(post.createdAt).toISOString();
  header.append(avatar, author, time);

  const contentArea = createElement("div", "post-content-area");
  if (post.text) contentArea.appendChild(createElement("p", "post-body", post.text));

  if (post.media_path) {
    if (post.media_type === "image") {
      const image = createElement("img", "post-media-image");
      image.src = post.media_path;
      image.alt = `Photo shared by ${post.name}`;
      image.loading = "lazy";
      contentArea.appendChild(image);
    } else if (post.media_type === "video") {
      const video = createElement("video", "post-media-video");
      video.src = post.media_path;
      video.controls = true;
      video.preload = "metadata";
      video.playsInline = true;
      video.setAttribute("aria-label", `Video shared by ${post.name}`);
      contentArea.appendChild(video);
    }
  }

  const divider = createElement("div", "post-divider");
  const actions = createElement("div", "post-actions");

  const likeButton = createElement(
    "button",
    `post-action${post.liked ? " liked" : ""}`,
    `${post.liked ? "♥" : "♡"}  Like · ${post.likes}`
  );
  likeButton.type = "button";
  likeButton.setAttribute("aria-pressed", String(post.liked));
  likeButton.addEventListener("click", async () => {
    likeButton.disabled = true;
    try {
      await api(`/api/posts/${post.id}/like`, { method: "POST" });
      await loadFeed();
    } catch (error) {
      alert(error.message);
    } finally {
      likeButton.disabled = false;
    }
  });

  const commentButton = createElement("button", "post-action", `◯ Comment · ${post.comment_count || 0}`);
  commentButton.type = "button";
  commentButton.addEventListener("click", () => {
    if (openComments.has(post.id)) openComments.delete(post.id);
    else openComments.add(post.id);
    renderFeed();
  });

  actions.append(likeButton, commentButton);
  card.append(header, contentArea, divider, actions, createCommentsArea(post));
  return card;
}

function renderFeed() {
  feedList.replaceChildren();
  const query = postSearch.value.trim().toLowerCase();
  const visiblePosts = posts.filter(post =>
    post.text.toLowerCase().includes(query) ||
    post.name.toLowerCase().includes(query) ||
    post.handle.toLowerCase().includes(query)
  );

  visiblePosts.forEach(post => feedList.appendChild(createPostCard(post)));
  noPostsMessage.hidden = visiblePosts.length > 0;

  const count = document.getElementById("your-post-count");
  if (count) {
    count.textContent = posts.filter(post => Number(post.user_id) === Number(currentUser.id)).length;
  }
}

function renderSuggestions() {
  suggestedPeople.replaceChildren();

  people.forEach(person => {
    suggestedPeople.appendChild(createPersonRow(person, "Follow"));
  });

  if (people.length === 0) {
    suggestedPeople.appendChild(createElement(
      "p",
      "composer-hint",
      "No other members yet. Invite a friend to join OffCampus!"
    ));
  }
}

// Create a profile editor inside the existing profile card.
function setupProfileEditor() {
  const profileInfo = document.querySelector(".profile-info");
  const bioElement = document.querySelector(".profile-bio");
  const stats = document.querySelector(".profile-stats");
  if (!profileInfo || !bioElement || !stats) return;

  const editButton = createElement("button", "profile-edit-button", "✎ Edit profile");
  editButton.type = "button";
  editButton.setAttribute("aria-expanded", "false");

  const form = createElement("form", "profile-edit-form");
  form.hidden = true;

  const usernameLabel = createElement("label", "", "Username");
  const usernameInput = createElement("input");
  usernameInput.type = "text";
  usernameInput.name = "username";
  usernameInput.minLength = 3;
  usernameInput.maxLength = 24;
  usernameInput.pattern = "[A-Za-z0-9_]{3,24}";
  usernameInput.required = true;
  usernameInput.autocomplete = "username";
  usernameLabel.appendChild(usernameInput);

  const bioLabel = createElement("label", "", "Bio (up to 160 characters)");
  const bioInput = createElement("textarea");
  bioInput.name = "bio";
  bioInput.maxLength = 160;
  bioInput.placeholder = "Tell people a little about yourself...";
  bioLabel.appendChild(bioInput);

  const actions = createElement("div", "profile-edit-actions");
  const cancelButton = createElement("button", "", "Cancel");
  cancelButton.type = "button";
  const saveButton = createElement("button", "profile-save-button", "Save changes");
  saveButton.type = "submit";
  actions.append(cancelButton, saveButton);
  form.append(usernameLabel, bioLabel, actions);

  editButton.addEventListener("click", () => {
    usernameInput.value = currentUser.username;
    bioInput.value = currentUser.bio || "";
    form.hidden = false;
    editButton.hidden = true;
    editButton.setAttribute("aria-expanded", "true");
    usernameInput.focus();
  });

  cancelButton.addEventListener("click", () => {
    form.hidden = true;
    editButton.hidden = false;
    editButton.setAttribute("aria-expanded", "false");
  });

  form.addEventListener("submit", async event => {
    event.preventDefault();
    saveButton.disabled = true;

    try {
      const result = await api("/api/me", {
        method: "PATCH",
        body: JSON.stringify({
          username: usernameInput.value.trim(),
          bio: bioInput.value.trim()
        })
      });

      currentUser = result.user;
      applyCurrentUserToPage();
      form.hidden = true;
      editButton.hidden = false;
      editButton.setAttribute("aria-expanded", "false");
      await Promise.all([loadFeed(), loadSuggestions(), loadFollowers()]);
      alert("Profile updated successfully!");
    } catch (error) {
      alert(error.message);
    } finally {
      saveButton.disabled = false;
    }
  });

  profileInfo.insertBefore(editButton, stats);
  profileInfo.insertBefore(form, stats);
}

function applyCurrentUserToPage() {
  document.querySelectorAll(".my-avatar").forEach(avatar => {
    avatar.textContent = initialsFor(currentUser.username);
  });

  const profileAvatar = document.querySelector(".profile-avatar");
  const profileName = document.querySelector(".profile-info h2");
  const profileHandle = document.querySelector(".profile-handle");
  const profileBio = document.querySelector(".profile-bio");

  if (profileAvatar) profileAvatar.textContent = initialsFor(currentUser.username);
  if (profileName) profileName.textContent = currentUser.username;
  if (profileHandle) profileHandle.textContent = `@${currentUser.username}`;
  if (profileBio) {
    profileBio.textContent = currentUser.bio || "Student life, random thoughts, and everything in between.";
  }
}

// Show a preview when a photo or video is selected.
let previewObjectUrl = null;
if (postMedia && mediaPreview) {
  postMedia.addEventListener("change", () => {
    mediaPreview.replaceChildren();
    mediaPreview.hidden = true;

    if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
    previewObjectUrl = null;

    const file = postMedia.files && postMedia.files[0];
    if (!file) return;

    const isImage = file.type.startsWith("image/");
    const maxSize = isImage ? 10 * 1024 * 1024 : 50 * 1024 * 1024;
    if (file.size > maxSize) {
      postMedia.value = "";
      alert(isImage ? "Images must be 10 MB or smaller." : "Videos must be 50 MB or smaller.");
      return;
    }

    previewObjectUrl = URL.createObjectURL(file);
    const preview = isImage ? createElement("img", "media-preview-image") : createElement("video", "media-preview-video");
    preview.src = previewObjectUrl;
    preview.controls = !isImage;
    preview.alt = isImage ? "Selected photo preview" : "Selected video preview";
    mediaPreview.appendChild(preview);
    mediaPreview.hidden = false;
  });
}

postForm.addEventListener("submit", async event => {
  event.preventDefault();
  const content = postContent.value.trim();
  const file = postMedia && postMedia.files ? postMedia.files[0] : null;

  if (!content && !file) {
    alert("Write something or choose a photo/video before publishing.");
    postContent.focus();
    return;
  }

  const submitButton = postForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  const formData = new FormData();
  formData.append("content", content);
  if (file) formData.append("media", file);

  try {
    await api("/api/posts", {
      method: "POST",
      body: formData
    });
    postContent.value = "";
    if (postMedia) postMedia.value = "";
    if (mediaPreview) {
      mediaPreview.replaceChildren();
      mediaPreview.hidden = true;
    }
    if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
    previewObjectUrl = null;
    await loadFeed();
    document.getElementById("feed").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    alert(error.message);
  } finally {
    submitButton.disabled = false;
  }
});

postSearch.addEventListener("input", renderFeed);

async function initialize() {
  try {
    const data = await api("/api/me");
    currentUser = data.user;
    applyCurrentUserToPage();
    setupProfileEditor();

    await Promise.all([loadSuggestions(), loadFollowers(), loadFeed()]);
  } catch (error) {
    if (error.message !== "Please log in.") {
      console.error(error);
      alert("Could not load OffCampus. Check that the server is running.");
    }
  }
}

initialize();
