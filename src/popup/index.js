import { MESSAGES } from "../shared/contracts.js";

const status = document.querySelector("#status");
const toggle = document.querySelector("#toggle");
let isEnabled = true;

function render(enabled) {
  isEnabled = enabled;
  status.classList.remove("is-error");
  status.textContent = enabled ? "Bandkit is active" : "Bandkit is deactivated";
  toggle.textContent = enabled ? "Deactivate" : "Activate";
  toggle.classList.toggle("is-active", enabled);
  toggle.setAttribute("aria-pressed", String(enabled));
  toggle.disabled = false;
}

async function activationMessage(message) {
  const response = await chrome.runtime.sendMessage(message);
  if (!response?.ok) throw new Error(response?.error || "Bandkit could not be updated.");
  return response;
}

async function initialise() {
  try {
    const response = await activationMessage({ type: MESSAGES.GET_ENABLED });
    render(response.enabled !== false);
  } catch (error) {
    status.textContent = error.message || "Bandkit status could not be read";
    status.classList.add("is-error");
    toggle.disabled = true;
  }
}

toggle.addEventListener("click", async () => {
  toggle.disabled = true;
  try {
    const response = await activationMessage({
      type: MESSAGES.SET_ENABLED,
      enabled: !isEnabled
    });
    render(response.enabled !== false);
  } catch (error) {
    status.textContent = error.message || "Bandkit could not be updated";
    status.classList.add("is-error");
    toggle.disabled = false;
  }
});

void initialise();
