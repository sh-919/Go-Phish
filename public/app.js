const form = document.querySelector("#analysis-form");
const button = form.querySelector('button[type="submit"]');
const content = document.querySelector("#content");
const typeInputs = form.querySelectorAll('input[name="type"]');
const imageInput = document.querySelector("#image");
const preview = document.querySelector("#preview");
const status = document.querySelector("#status");
const result = document.querySelector("#result");
const phoneControls = document.querySelector("#phone-controls");
const startListening = document.querySelector("#start-listening");
const stopListening = document.querySelector("#stop-listening");
const listeningStatus = document.querySelector("#listening-status");
const analysisPage = document.querySelector("#analysis-page");
const analysisArt = document.querySelector("#analysis-art");
const analysisMenuButton = document.querySelector("#analysis-menu-button");
const analysisMenuPanel = document.querySelector("#analysis-menu-panel");
const aboutPage = document.querySelector("#about");
const aboutMenuButton = document.querySelector("#about-menu-button");
const aboutMenuPanel = document.querySelector("#about-menu-panel");
const progress = document.querySelector("#analysis-progress");
const progressBar = document.querySelector("#analysis-progressbar");
const progressFill = document.querySelector("#analysis-progress-fill");
const progressFish = document.querySelector(".progress-fish");
const textModeButton = document.querySelector("#text-mode-button");
const audioModeButton = document.querySelector("#audio-mode-button");
const menuButton = document.querySelector("#menu-button");
const menuPanel = document.querySelector("#menu-panel");
const aboutLinks = document.querySelectorAll(".dropdown-about-link");
const returnButtons = document.querySelectorAll(".return-to-surface");
const oceanStage = document.querySelector(".ocean-stage");
const pageContainer = document.querySelector("#page-container");
const scene = document.querySelector(".scene");
const phishButton = document.querySelector("#phish-button");
const hook = document.querySelector("#metal-hook");
const hookTetherLine = document.querySelector("#hook-tether-line");
const fishOrientation = document.querySelector("#fish-orientation");
const orangeFish = document.querySelector("#orange-fish");

let selectedImage = null;
let previewUrl = null;
let recognition = null;
let listening = false;
let finalTranscript = "";
let interimTranscript = "";
let analysisTimer = null;
let analysisInProgress = false;
let analysisQueued = false;
let finalAnalysisRequested = false;
let microphoneStream = null;
let restartTimer = null;
let recognitionActive = false;
let recognitionStarting = false;
let latestLiveConfidence = null;
let introSequenceStarted = false;
let introSequenceToken = 0;
let progressTimer = null;
let progressValue = 0;

const scamIndicators = [
  { pattern: /\b(password|passcode|verification code|security code|one[- ]time code|otp)\b/i, score: 30 },
  { pattern: /\b(send|tell|read|give|share)\b.{0,30}\b(code|password|pin)\b/i, score: 25 },
  { pattern: /\b(urgent|immediately|right now|act fast|final warning|last chance)\b/i, score: 18 },
  { pattern: /\b(account|bank|card|payment|refund|money)\b.{0,40}\b(locked|closed|suspended|cancelled|due|pay)\b/i, score: 18 },
  { pattern: /\b(remote access|install|download|gift card|wire transfer|crypto)\b/i, score: 20 },
  { pattern: /\b(police|arrest|lawsuit|legal action|warrant)\b/i, score: 15 },
];

function estimateLiveConfidence(transcript) {
  const score = scamIndicators.reduce(
    (total, indicator) => total + (indicator.pattern.test(transcript) ? indicator.score : 0),
    5,
  );
  return Math.min(score, 99);
}

function setImage(file) {
  if (!file || !["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
    throw new Error("Please choose a PNG, JPEG, or WebP image.");
  }
  if (file.size > 7 * 1024 * 1024) {
    throw new Error("Please choose an image smaller than 7 MB.");
  }

  selectedImage = file;
  if (previewUrl) {
    URL.revokeObjectURL(previewUrl);
  }
  previewUrl = URL.createObjectURL(file);
  preview.src = previewUrl;
  preview.hidden = false;
  analysisPage.classList.add("has-image");
}

imageInput.addEventListener("change", () => {
  try {
    setImage(imageInput.files[0]);
    status.textContent = "Screenshot ready.";
  } catch (error) {
    selectedImage = null;
    analysisPage.classList.remove("has-image");
    imageInput.value = "";
    status.textContent = error.message;
  }
});

function updatePhoneControls() {
  const isPhone = form.elements.type.value === "phone";
  const modeSelected = !analysisPage.hidden;
  textModeButton.setAttribute("aria-pressed", String(modeSelected && !isPhone));
  audioModeButton.setAttribute("aria-pressed", String(modeSelected && isPhone));
  phoneControls.hidden = !isPhone;
  imageInput.disabled = isPhone;
  analysisPage.classList.toggle("is-audio", isPhone);
  content.setAttribute("aria-label", isPhone ? "Live phone-call transcript" : "Enter suspicious text");
  const artwork = isPhone ? "/assets/Audio.png" : "/assets/Text.png";
  if (analysisArt.getAttribute("src") !== artwork) {
    analysisArt.src = artwork;
  }
  if (isPhone) {
    content.placeholder = "Your live phone-call transcript will appear here...";
  } else {
    content.placeholder = "Paste the email or phone-call transcript here...";
  }
}

function activateMode(type, moveFocus) {
  form.querySelector(`input[name="type"][value="${type}"]`).checked = true;
  analysisPage.hidden = false;
  analysisPage.classList.remove("is-loading");
  progress.hidden = true;
  button.hidden = false;
  result.hidden = true;
  status.textContent = "";
  closeMenus();
  analysisMenuButton.setAttribute("aria-expanded", "false");
  analysisMenuPanel.hidden = true;
  updatePhoneControls();
  if (window.location.hash === "#about") {
    showAboutPage(false);
  }
  analysisPage.scrollIntoView({
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
  });
  if (moveFocus) {
    if (type === "phone") {
      startListening.focus();
    } else {
      content.focus();
    }
  }
}

textModeButton.addEventListener("click", (event) => activateMode("email", event.detail === 0));
audioModeButton.addEventListener("click", (event) => activateMode("phone", event.detail === 0));
typeInputs.forEach((input) =>
  input.addEventListener("change", () => {
    analysisPage.hidden = false;
    updatePhoneControls();
  }),
);

function closeMenus() {
  for (const [trigger, panel] of [
    [menuButton, menuPanel],
    [analysisMenuButton, analysisMenuPanel],
    [aboutMenuButton, aboutMenuPanel],
  ]) {
    trigger.setAttribute("aria-expanded", "false");
    panel.hidden = true;
  }
}

function toggleMenu(trigger, panel) {
  const expanded = trigger.getAttribute("aria-expanded") === "true";
  closeMenus();
  trigger.setAttribute("aria-expanded", String(!expanded));
  panel.hidden = expanded;
}

function showAboutPage(updateHistory = true) {
  closeMenus();
  stopPhoneListening();
  scene.hidden = true;
  analysisPage.hidden = true;
  aboutPage.hidden = false;
  oceanStage.classList.add("is-about");
  if (updateHistory && window.location.hash !== "#about") {
    window.history.pushState(null, "", "#about");
  }
  window.scrollTo({ top: 0, behavior: "instant" });
}

function stopPhoneListening() {
  const shouldStopRecognition = recognitionActive || recognitionStarting || listening;
  listening = false;
  recognitionStarting = false;
  if (restartTimer) {
    clearTimeout(restartTimer);
    restartTimer = null;
  }
  if (analysisTimer) {
    clearTimeout(analysisTimer);
    analysisTimer = null;
  }
  if (shouldStopRecognition) {
    recognition?.stop();
  }
  recognitionActive = false;
  microphoneStream?.getTracks().forEach((track) => track.stop());
  microphoneStream = null;
  setListeningState(false);
}

function returnToSurface(updateHistory = true) {
  introSequenceToken += 1;
  closeMenus();
  aboutPage.hidden = true;
  analysisPage.hidden = true;
  analysisPage.classList.remove("is-loading");
  progress.hidden = true;
  button.hidden = false;
  result.hidden = true;
  result.replaceChildren();
  status.textContent = "";
  scene.hidden = false;
  oceanStage.classList.remove("is-about");
  pageContainer.classList.remove("is-submerged");
  scene.classList.remove("is-catching", "is-snared", "is-pulling", "is-descended");
  orangeFish.style.removeProperty("animation");
  orangeFish.style.removeProperty("transform");
  fishOrientation.style.removeProperty("transform");
  fishOrientation.style.removeProperty("transform-origin");
  hook.style.removeProperty("transform");
  hook.style.removeProperty("animation");
  hook.style.removeProperty("top");
  hook.style.removeProperty("left");
  hook.style.removeProperty("--hook-drop-distance");
  introSequenceStarted = false;
  phishButton.disabled = false;
  phishButton.removeAttribute("aria-busy");
  textModeButton.hidden = true;
  audioModeButton.hidden = true;
  form.elements.type.value = "email";
  stopPhoneListening();
  updatePhoneControls();
  if (updateHistory && window.location.hash !== "#surface") {
    window.history.pushState(null, "", "#surface");
  }
  window.scrollTo({ top: 0, behavior: "instant" });
  updateHookTether();
}

menuButton.addEventListener("click", () => toggleMenu(menuButton, menuPanel));
analysisMenuButton.addEventListener("click", () => toggleMenu(analysisMenuButton, analysisMenuPanel));
aboutMenuButton.addEventListener("click", () => toggleMenu(aboutMenuButton, aboutMenuPanel));
aboutLinks.forEach((link) =>
  link.addEventListener("click", (event) => {
    event.preventDefault();
    showAboutPage();
  }),
);
returnButtons.forEach((returnButton) =>
  returnButton.addEventListener("click", () => returnToSurface()),
);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeMenus();
  }
});
window.addEventListener("popstate", () => {
  if (window.location.hash === "#about") {
    showAboutPage(false);
  } else {
    returnToSurface(false);
  }
});

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function updateHookTether() {
  const sceneRect = scene.getBoundingClientRect();
  const buttonRect = phishButton.getBoundingClientRect();
  const buttonX =
    ((buttonRect.left + buttonRect.width / 2 - sceneRect.left) / sceneRect.width) * 100;
  const hookTop = ((buttonRect.bottom - sceneRect.top) / sceneRect.height) * 100;
  const buttonY = ((buttonRect.bottom - sceneRect.top) / sceneRect.height) * 100;

  hook.style.top = `${hookTop}%`;
  hook.style.left = `${buttonX - (hook.getBoundingClientRect().width / sceneRect.width) * 50}%`;
  hookTetherLine.setAttribute("x1", String(buttonX));
  hookTetherLine.setAttribute("y1", String(buttonY));
  hookTetherLine.setAttribute("x2", String(buttonX));
  hookTetherLine.setAttribute("y2", String(hookTop));
}

function waitForFishUnderHook(targetX, sequenceToken) {
  const sceneRect = scene.getBoundingClientRect();
  const fishHeadOffsetX = sceneRect.width * (0.423 - 0.38);
  const fishAngle = (-25 * Math.PI) / 180;
  const tolerance = Math.max(2, sceneRect.width * 0.004);

  return new Promise((resolve) => {
    const checkPosition = () => {
      if (sequenceToken !== introSequenceToken) {
        resolve(null);
        return;
      }

      const fishTransform = getComputedStyle(orangeFish).transform;
      const fishMatrix = new DOMMatrixReadOnly(
        fishTransform === "none" ? "matrix(1, 0, 0, 1, 0, 0)" : fishTransform,
      );
      const fishPivotX = sceneRect.left + sceneRect.width * 0.38 + fishMatrix.m41;
      const rotatedHeadX = fishPivotX + fishHeadOffsetX * Math.cos(fishAngle);

      if (Math.abs(rotatedHeadX - targetX) <= tolerance) {
        resolve({ fishTransform, rotatedHeadX });
        return;
      }

      window.requestAnimationFrame(checkPosition);
    };

    window.requestAnimationFrame(checkPosition);
  });
}

function startAnalysisProgress() {
  window.clearInterval(progressTimer);
  progressTimer = null;
  progressValue = 4;
  progressFill.style.width = `${progressValue}%`;
  progressFish.style.left = "37%";
  progressBar.setAttribute("aria-valuenow", String(progressValue));
  progress.hidden = false;
  button.hidden = true;
  result.hidden = true;
  analysisPage.classList.add("is-loading");
  analysisArt.src =
    form.elements.type.value === "phone" ? "/assets/Audio Deepen.png" : "/assets/Text Deepen.png";
  status.textContent = "Analyzing...";

  progressTimer = window.setInterval(() => {
    progressValue = Math.min(90, progressValue + Math.max(0.3, (90 - progressValue) * 0.035));
    progressFill.style.width = `${progressValue}%`;
    progressFish.style.left = `${36.1 + progressValue * 0.17}%`;
    progressBar.setAttribute("aria-valuenow", String(Math.round(progressValue)));
  }, 180);
}

function finishAnalysisProgress() {
  window.clearInterval(progressTimer);
  progressTimer = null;
  analysisPage.classList.remove("is-loading");
  progressValue = 100;
  progressFill.style.width = "100%";
  progressFish.style.left = "51.5%";
  progressBar.setAttribute("aria-valuenow", "100");
  window.setTimeout(() => {
    result.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
      block: "start",
    });
  }, 100);
}

phishButton.addEventListener("click", async () => {
  if (introSequenceStarted) {
    return;
  }

  introSequenceStarted = true;
  const sequenceToken = ++introSequenceToken;
  phishButton.disabled = true;
  phishButton.setAttribute("aria-busy", "true");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const catchDuration = reducedMotion ? 0 : 420;
  const pullDuration = reducedMotion ? 0 : 1500;
  updateHookTether();
  const buttonRect = phishButton.getBoundingClientRect();
  const hookTargetX = buttonRect.left + buttonRect.width / 2;
  let fishContact;

  if (reducedMotion) {
    const sceneRect = scene.getBoundingClientRect();
    const fishHeadOffsetX = sceneRect.width * (0.423 - 0.38);
    const fishAngle = (-25 * Math.PI) / 180;
    const targetTranslateX =
      hookTargetX -
      sceneRect.left -
      sceneRect.width * 0.38 -
      fishHeadOffsetX * Math.cos(fishAngle);
    fishContact = {
      fishTransform: `matrix(1, 0, 0, 1, ${targetTranslateX}, 0)`,
      rotatedHeadX: hookTargetX,
    };
  } else {
    fishContact = await waitForFishUnderHook(hookTargetX, sequenceToken);
  }
  if (sequenceToken !== introSequenceToken || !fishContact) {
    return;
  }

  const sceneRect = scene.getBoundingClientRect();
  const fishTransform = fishContact.fishTransform;
  const fishMatrix = new DOMMatrixReadOnly(
    fishTransform === "none" ? "matrix(1, 0, 0, 1, 0, 0)" : fishTransform,
  );
  const fishTranslateX = fishMatrix.m41;
  const fishTranslateY = fishMatrix.m42;
  const fishPivotX = sceneRect.left + sceneRect.width * 0.38 + fishTranslateX;
  const fishPivotY = sceneRect.top + sceneRect.height * 0.4445 + fishTranslateY;
  const fishHeadOffsetX = sceneRect.width * (0.423 - 0.38);
  const fishAngle = (-25 * Math.PI) / 180;
  const headY = fishPivotY + fishHeadOffsetX * Math.sin(fishAngle);
  const hookDropDistance = headY - hook.getBoundingClientRect().bottom;

  orangeFish.style.animation = "none";
  orangeFish.style.transform = fishTransform;
  fishOrientation.style.transformOrigin =
    `${((fishPivotX - sceneRect.left) / sceneRect.width) * 100}% ` +
    `${((fishPivotY - sceneRect.top) / sceneRect.height) * 100}%`;
  fishOrientation.style.transform =
    `translateX(${hookTargetX - fishContact.rotatedHeadX}px) rotate(-25deg)`;
  hook.style.setProperty("--hook-drop-distance", `${hookDropDistance}px`);

  scene.classList.add("is-catching");
  await wait(catchDuration);
  if (sequenceToken !== introSequenceToken) {
    return;
  }

  scene.classList.remove("is-catching");
  hook.style.transform = `translateY(${hookDropDistance}px)`;
  scene.classList.add("is-snared", "is-descended", "is-pulling");
  pageContainer.classList.add("is-submerged");
  textModeButton.hidden = false;
  audioModeButton.hidden = false;

  await wait(pullDuration);
  if (sequenceToken !== introSequenceToken) {
    return;
  }
  phishButton.removeAttribute("aria-busy");
  status.textContent = "Fish caught. Choose text or audio input.";
});

window.addEventListener("resize", () => {
  if (!introSequenceStarted) {
    updateHookTether();
  }
});

function setListeningState(value) {
  listening = value;
  startListening.disabled = value;
  stopListening.disabled = !value;
  listeningStatus.textContent = value ? "Listening..." : "Not listening";
}

function refreshTranscript() {
  content.value = `${finalTranscript} ${interimTranscript}`.trim();
}

function scheduleLiveAnalysis() {
  if (analysisTimer) {
    return;
  }
  analysisTimer = setTimeout(() => {
    analysisTimer = null;
    if (!listening) {
      return;
    }
    if (content.value.trim()) {
      analyzeCurrentTranscript(true);
    } else {
      scheduleLiveAnalysis();
    }
  }, 10_000);
}

function createRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    throw new Error("Live listening speech recognition is unavailable.");
  }

  const instance = new SpeechRecognition();
  instance.continuous = true;
  instance.interimResults = true;
  instance.lang = "en-US";
  instance.onstart = () => {
    recognitionActive = true;
    recognitionStarting = false;
    setListeningState(true);
    listeningStatus.textContent = "Listening...";
  };
  instance.onresult = (event) => {
    interimTranscript = "";
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const transcript = event.results[index][0].transcript;
      if (event.results[index].isFinal) {
        finalTranscript += `${transcript} `;
      } else {
        interimTranscript += transcript;
      }
    }
    refreshTranscript();
    latestLiveConfidence = estimateLiveConfidence(content.value);
    showLiveConfidence(latestLiveConfidence, "Live estimate");
    scheduleLiveAnalysis();
  };
  instance.onerror = (event) => {
    const messages = {
      "audio-capture": "No microphone was found. Check your Windows input device.",
      "not-allowed": "Microphone access was denied. Allow it for http://localhost:3000.",
      "network": "Speech recognition needs an internet connection.",
      "no-speech": "No speech detected yet. Keep speaking.",
    };
    listeningStatus.textContent = messages[event.error] ?? `Listening error: ${event.error}`;
    recognitionActive = false;
    recognitionStarting = false;
    setListeningState(false);
  };
  instance.onend = () => {
    recognitionActive = false;
    recognitionStarting = false;
    if (listening) {
      restartTimer = setTimeout(() => {
        restartTimer = null;
        if (listening && !recognitionActive && !recognitionStarting) {
          try {
            recognitionStarting = true;
            instance.start();
          } catch (error) {
            recognitionStarting = false;
            setListeningState(false);
            listeningStatus.textContent = `Could not restart listening: ${error.message}`;
          }
        }
      }, 250);
    } else {
      setListeningState(false);
    }
  };
  return instance;
}

function showLiveConfidence(confidence, label = "Gemini update") {
  result.className = "analysis-result live-result";
  result.hidden = false;
  result.replaceChildren();

  const heading = document.createElement("h2");
  heading.className = "visually-hidden";
  heading.textContent = "Current scam likelihood";
  result.append(heading);

  const score = document.createElement("p");
  score.className = "risk-score";
  score.textContent = confidence === null ? "--%" : `${confidence}%`;
  score.setAttribute("aria-label", `Current scam likelihood: ${score.textContent}`);
  result.append(score);

  const note = document.createElement("p");
  note.className = "visually-hidden";
  note.textContent =
    confidence === null
      ? "Listening for speech. The number will update as words are recognized."
      : `${label}. Only the number updates during the call. Stop listening for the final conclusion.`;
  result.append(note);
}

async function analyzeCurrentTranscript(isLiveUpdate = false) {
  if (!content.value.trim() || analysisInProgress) {
    if (analysisInProgress) {
      if (isLiveUpdate) {
        analysisQueued = true;
      } else {
        finalAnalysisRequested = true;
      }
    }
    return;
  }

  analysisInProgress = true;
  if (isLiveUpdate) {
    status.textContent = "Updating live risk analysis...";
  } else {
    startAnalysisProgress();
  }
  try {
    const response = await fetch("/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "phone", content: content.value, live: isLiveUpdate }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error ?? "The analysis failed.");
    }
    if (isLiveUpdate) {
      latestLiveConfidence = data.analysis.confidence;
      showLiveConfidence(latestLiveConfidence);
    } else {
      showResult(data.analysis);
    }
    status.textContent = isLiveUpdate ? "Live analysis updated." : "Analysis complete.";
  } catch (error) {
    showAnalysisError(error);
    status.textContent = "";
  } finally {
    if (!isLiveUpdate) {
      result.hidden = false;
      finishAnalysisProgress();
    }
    analysisInProgress = false;
    if (finalAnalysisRequested) {
      finalAnalysisRequested = false;
      setTimeout(() => analyzeCurrentTranscript(), 0);
    } else if (analysisQueued) {
      analysisQueued = false;
      scheduleLiveAnalysis();
    } else if (isLiveUpdate && listening) {
      scheduleLiveAnalysis();
    }
  }
}

startListening.addEventListener("click", async () => {
  try {
    if (recognitionActive || recognitionStarting || listening) {
      listeningStatus.textContent = "Already listening.";
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("This browser does not support microphone access.");
    }
    microphoneStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    if (!recognition) {
      recognition = createRecognition();
    }
    finalTranscript = content.value.trim();
    interimTranscript = "";
    recognitionStarting = true;
    recognition.start();
    setListeningState(true);
    latestLiveConfidence = null;
    showLiveConfidence(null);
    status.textContent = "Listening started. The number will update as you speak.";
    scheduleLiveAnalysis();
  } catch (error) {
    recognitionStarting = false;
    if (error.name === "InvalidStateError") {
      recognitionActive = true;
      setListeningState(true);
      listeningStatus.textContent = "Already listening.";
      return;
    }
    setListeningState(false);
    listeningStatus.textContent =
      error.name === "NotAllowedError"
        ? "Microphone access was denied. Allow it for http://localhost:3000 and try again."
        : `Could not start listening: ${error.message}`;
    microphoneStream?.getTracks().forEach((track) => track.stop());
    microphoneStream = null;
  }
});

stopListening.addEventListener("click", async () => {
  listening = false;
  recognitionStarting = false;
  if (restartTimer) {
    clearTimeout(restartTimer);
    restartTimer = null;
  }
  recognition?.stop();
  recognitionActive = false;
  microphoneStream?.getTracks().forEach((track) => track.stop());
  microphoneStream = null;
  setListeningState(false);
  if (analysisTimer) {
    clearTimeout(analysisTimer);
    analysisTimer = null;
  }
  status.textContent = "Call ended. Preparing the final conclusion...";
  await analyzeCurrentTranscript();
});

updatePhoneControls();
updateHookTether();

document.addEventListener("paste", (event) => {
  const image = [...event.clipboardData.items]
    .find((item) => item.type.startsWith("image/"))
    ?.getAsFile();
  if (!image) {
    return;
  }

  try {
    setImage(image);
    status.textContent = "Screenshot pasted and ready.";
  } catch (error) {
    status.textContent = error.message;
  }
});

function fileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(new Error("Could not read the screenshot."));
    reader.readAsDataURL(file);
  });
}

function showResult(analysis) {
  result.className = "analysis-result";
  result.hidden = false;
  result.replaceChildren();

  const heading = document.createElement("h2");
  heading.className = "visually-hidden";
  heading.textContent = "Phishing analysis result";
  result.append(heading);

  const verdict = document.createElement("p");
  verdict.className = "result-value risk-value";
  verdict.textContent = analysis.verdict.replaceAll("_", " ");
  verdict.setAttribute("aria-label", `Risk: ${verdict.textContent}`);
  result.append(verdict);

  const confidence = document.createElement("p");
  confidence.className = "result-value confidence-value";
  confidence.textContent = `${analysis.confidence}%`;
  confidence.setAttribute("aria-label", `Confidence: ${confidence.textContent}`);
  result.append(confidence);

  const reasonsHeading = document.createElement("strong");
  reasonsHeading.className = "visually-hidden";
  reasonsHeading.textContent = "Reasons";
  result.append(reasonsHeading);

  const reasons = document.createElement("ul");
  reasons.className = "analysis-reasons-list";
  for (const reason of analysis.reasons) {
    const item = document.createElement("li");
    item.textContent = reason;
    reasons.append(item);
  }
  result.append(reasons);

  const action = document.createElement("p");
  action.className = "result-value action-value";
  const actionLabel = document.createElement("strong");
  actionLabel.className = "visually-hidden";
  actionLabel.textContent = "Recommended action: ";
  action.append(actionLabel, document.createTextNode(analysis.recommended_action));
  result.append(action);
}

function showAnalysisError(error) {
  result.className = "analysis-result error";
  result.hidden = false;
  result.replaceChildren();

  const message = document.createElement("p");
  message.className = "analysis-error-message";
  message.textContent = error.message;
  result.append(message);

  const retry = document.createElement("button");
  retry.className = "retry-analysis";
  retry.type = "button";
  retry.textContent = "Try again";
  retry.addEventListener("click", () => form.requestSubmit(), { once: true });
  result.append(retry);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (form.elements.type.value === "phone") {
    if (!content.value.trim()) {
      status.textContent = "Start listening or enter a transcript before running the analysis.";
      return;
    }
    await analyzeCurrentTranscript();
    return;
  }
  if (!content.value.trim() && !selectedImage) {
    status.textContent = "Enter suspicious text or upload an email screenshot first.";
    return;
  }
  startAnalysisProgress();

  const type = form.elements.type.value;

  try {
    const image = selectedImage
      ? { mimeType: selectedImage.type, data: await fileAsBase64(selectedImage) }
      : null;
    const response = await fetch("/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, content: content.value, image }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error ?? "The analysis failed.");
    }
    showResult(data.analysis);
    status.textContent = "Analysis complete.";
  } catch (error) {
    showAnalysisError(error);
    status.textContent = "";
  } finally {
    result.hidden = false;
    finishAnalysisProgress();
  }
});
