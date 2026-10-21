
const form = document.getElementById("auth-form");
const usernameLabel = document.getElementById("username-label");
const usernameInput = document.getElementById("username");
const passwordInput = document.getElementById("password");
const submitButton = document.getElementById("auth-submit");
const message = document.getElementById("auth-message");
const loginTab = document.getElementById("show-login");
const registerTab = document.getElementById("show-register");

let mode = "login";

function setMode(nextMode) {
  mode = nextMode;

  const registering = mode === "register";

  usernameLabel.hidden = !registering;
  usernameInput.required = registering;

  passwordInput.autocomplete = registering
    ? "new-password"
    : "current-password";

  submitButton.textContent = registering
    ? "Create account"
    : "Sign in";

  loginTab.classList.toggle("active", !registering);
  registerTab.classList.toggle("active", registering);

  message.textContent = "";
  message.className = "auth-message";
}

loginTab.addEventListener("click", () => setMode("login"));
registerTab.addEventListener("click", () => setMode("register"));

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  message.textContent = "";
  message.className = "auth-message";
  submitButton.disabled = true;

  const email = document.getElementById("email").value.trim();
  const password = passwordInput.value;

  const payload = { email, password };

  if (mode === "register") {
    payload.username = usernameInput.value.trim();
  }

  try {
    const response = await fetch(
      `/api/${mode === "register" ? "register" : "login"}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        credentials: "same-origin",
        body: JSON.stringify(payload)
      }
    );

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "Authentication failed.");
    }

    message.className = "auth-message success";
    message.textContent = "Success! Opening your feed...";

    window.location.assign("/");
  } catch (error) {
    message.className = "auth-message error";
    message.textContent =
      error.message === "Failed to fetch"
        ? "Cannot reach the server. Make sure OffCampus is running."
        : error.message;
  } finally {
    submitButton.disabled = false;
  }
});
