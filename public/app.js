const form = document.querySelector("#analysis-form");
const surface = document.querySelector("#surface");
const textPage = document.querySelector("#text-page");
const audioPage = document.querySelector("#audio-page");
const content = document.querySelector("#content");
const audioContent = document.querySelector("#audio-content");
const imageInput = document.querySelector("#image");
const preview = document.querySelector("#preview");
const status = document.querySelector("#status");
const audioStatus = document.querySelector("#audio-status");
const submitButton = document.querySelector("#text-submit");
const progress = document.querySelector("#analysis-progress");
const progressBar = document.querySelector("#analysis-progressbar");
const progressFill = document.querySelector("#analysis-progress-fill");
const progressFish = document.querySelector(".progress-fish");
const microphone = document.querySelector("#microphone-trigger");
const startListening = document.querySelector("#start-listening");
const stopListeningButton = document.querySelector("#stop-listening");
const listeningStatus = document.querySelector("#listening-status");
const liveAssessment = document.querySelector("#live-assessment");
const orangeFish = document.querySelector("#orange-fish-swimmer");
const hook = document.querySelector("#metal-hook");
const scene = document.querySelector(".surface-artboard");
const fishOrientation = document.querySelector("#fish-orientation");
const modeButtons = document.querySelectorAll(".mode-button");
const backButtons = document.querySelectorAll(".back-to-surface");
const aboutDialog = document.querySelector("#about");
const aboutTriggers = document.querySelectorAll(".about-trigger");
const closeAbout = document.querySelector("#close-about");
const progressStatus = document.querySelector("#deep-scan-status");
const deepRisk = document.querySelector("#deep-risk");
const deepConfidence = document.querySelector("#deep-confidence");
const deepReasons = document.querySelector("#deep-reasons");
const deepAction = document.querySelector("#deep-action");
const audioDeepRisk = document.querySelector("#audio-deep-risk");
const audioDeepConfidence = document.querySelector("#audio-deep-confidence");
const audioDeepReasons = document.querySelector("#audio-deep-reasons");
const audioDeepAction = document.querySelector("#audio-deep-action");
const audioDeepScanStatus = document.querySelector("#audio-deep-scan-status");
const audioResults = document.querySelector("#audio-deepen-bottom");

let selectedImage = null;
let previewUrl = null;
let analysisTimer = null;
let progressTimer = null;
let progressValue = 0;
let recognition = null;
let recognitionActive = false;
let listening = false;
let finalTranscript = "";
let interimTranscript = "";
let microphoneStream = null;
let transitionRunning = false;

if ("scrollRestoration" in window.history) window.history.scrollRestoration = "manual";
document.documentElement.style.scrollBehavior = "auto";
window.scrollTo(0, 0);
document.documentElement.style.removeProperty("scroll-behavior");

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

function activeMode() {
  return form.elements.type.value;
}

function scrollToElement(element, behavior = "smooth", topOffset = 28) {
  window.scrollTo({
    top: element.getBoundingClientRect().top + window.scrollY - topOffset,
    behavior,
  });
}

function returnToTextInput() {
  textPage.classList.remove("is-showing-results");
  window.scrollTo({
    top: textPage.getBoundingClientRect().top + window.scrollY,
    behavior: "smooth",
  });
  content.focus({ preventScroll: true });
}

function setMode(mode) {
  form.querySelector(`input[name="type"][value="${mode}"]`).checked = true;
}

function setImage(file) {
  if (!file || !["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
    throw new Error("Please choose a PNG, JPEG, or WebP image.");
  }
  if (file.size > 7 * 1024 * 1024) {
    throw new Error("Please choose an image smaller than 7 MB.");
  }

  selectedImage = file;
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = URL.createObjectURL(file);
  preview.src = previewUrl;
  preview.hidden = false;
}

imageInput.addEventListener("change", () => {
  try {
    setImage(imageInput.files[0]);
    status.textContent = "Screenshot ready.";
  } catch (error) {
    selectedImage = null;
    preview.hidden = true;
    preview.removeAttribute("src");
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null;
    imageInput.value = "";
    status.textContent = error.message;
  }
});

document.addEventListener("paste", (event) => {
  const image = [...(event.clipboardData?.items ?? [])]
    .find((item) => item.type.startsWith("image/"))
    ?.getAsFile();
  if (!image) return;

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

function wait(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function animateWindowScroll(targetY, duration) {
  const startY = window.scrollY;
  const startTime = performance.now();

  return new Promise((resolve) => {
    const animate = (timestamp) => {
      const progress = Math.min((timestamp - startTime) / duration, 1);
      const easedProgress = progress * progress * (3 - 2 * progress);
      window.scrollTo({
        top: startY + (targetY - startY) * easedProgress,
        behavior: "instant",
      });

      if (progress < 1) {
        window.requestAnimationFrame(animate);
      } else {
        resolve();
      }
    };

    window.requestAnimationFrame(animate);
  });
}

function animateProgress() {
  clearInterval(progressTimer);
  progressValue = 4;
  progress.hidden = false;
  submitButton.hidden = true;
  progressFill.style.width = `${progressValue}%`;
  progressFish.style.left = "5%";
  progressBar.setAttribute("aria-valuenow", String(progressValue));
  progressTimer = window.setInterval(() => {
    progressValue = Math.min(92, progressValue + Math.max(.35, (92 - progressValue) * .035));
    progressFill.style.width = `${progressValue}%`;
    progressFish.style.left = `${Math.min(95, Math.max(5, progressValue))}%`;
    progressBar.setAttribute("aria-valuenow", String(Math.round(progressValue)));
  }, 160);
}

function stopProgress() {
  clearInterval(progressTimer);
  progressTimer = null;
  progressValue = 100;
  progressFill.style.width = "100%";
  progressBar.setAttribute("aria-valuenow", "100");
}

async function requestAnalysis({ type, text, image = null, live = false }) {
  const requestImage = image ? {
    mimeType: image.type,
    data: await fileAsBase64(image),
  } : null;
  let response;
  try {
    response = await fetch("/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, content: text, image: requestImage, live }),
    });
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error("Cannot reach the Go Phish analysis server. Start it with `npm start`, then retry.");
    }
    throw error;
  }
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(`The analysis server returned an unreadable response (HTTP ${response.status}).`);
  }
  if (!response.ok) throw new Error(data.error ?? "The analysis failed.");
  if (!data.analysis) throw new Error("The analysis response did not include a report.");
  return data.analysis;
}

function showResult(analysis, mode = activeMode()) {
  const renderReasons = (container, reasons) => {
    const list = document.createElement("ul");
    list.className = "deep-reasons-list";
    for (const reason of reasons ?? []) {
      const item = document.createElement("li");
      item.textContent = reason;
      list.append(item);
    }
    container.replaceChildren(list);
  };

  if (mode === "phone") {
    audioDeepRisk.textContent = String(analysis.verdict).replaceAll("_", " ");
    audioDeepConfidence.textContent = `${analysis.confidence}%`;
    renderReasons(audioDeepReasons, analysis.reasons);
    audioDeepAction.textContent = analysis.recommended_action;
    audioDeepScanStatus.textContent = "Audio analysis complete. Your report is ready.";
  } else {
    deepRisk.textContent = String(analysis.verdict).replaceAll("_", " ");
    deepConfidence.textContent = `${analysis.confidence}%`;
    renderReasons(deepReasons, analysis.reasons);
    deepAction.textContent = analysis.recommended_action;
  }
}

function showAnalysisError(error, mode = activeMode()) {
  const risk = mode === "phone" ? audioDeepRisk : deepRisk;
  const confidence = mode === "phone" ? audioDeepConfidence : deepConfidence;
  const reasons = mode === "phone" ? audioDeepReasons : deepReasons;
  const action = mode === "phone" ? audioDeepAction : deepAction;
  risk.textContent = "Analysis unavailable";
  confidence.textContent = "—";
  reasons.replaceChildren();
  reasons.textContent = error.message;
  action.textContent = "Check the connection and retry the analysis.";
  if (mode === "phone") {
    audioDeepScanStatus.textContent = `Audio analysis could not be completed: ${error.message}`;
  }
}

function openModeChooser() {
  if (transitionRunning || surface.classList.contains("is-choosing")) return;
  transitionRunning = true;
  const phishButton = document.querySelector("#phish-button");
  phishButton.disabled = true;
  phishButton.setAttribute("aria-busy", "true");
  surface.classList.add("is-catching");

  const sceneRect = scene.getBoundingClientRect();
  const buttonRect = phishButton.getBoundingClientRect();
  const swimmerRect = orangeFish.getBoundingClientRect();
  const hookHeight = hook.offsetHeight;
  const hookTop = buttonRect.bottom - sceneRect.top;
  const targetHeadX = sceneRect.width / 2;
  const targetHeadY = swimmerRect.top - sceneRect.top + swimmerRect.height / 2;
  const targetLeft = targetHeadX - swimmerRect.width * .86;
  const hookLeft = targetHeadX - hook.offsetWidth * .84;
  const hookScale = Math.max(1, (targetHeadY - hookTop) / hookHeight);

  orangeFish.style.animation = "none";
  orangeFish.style.transform = "none";
  orangeFish.style.left = `${swimmerRect.left - sceneRect.left}px`;
  orangeFish.style.transition = "left 450ms ease";
  fishOrientation.style.transformOrigin = "86% 50%";
  hook.style.top = `${hookTop}px`;
  hook.style.left = `${hookLeft}px`;
  hook.style.setProperty("--hook-target-scale", String(hookScale));
  hook.style.setProperty("--fish-lift-distance", "80px");

  window.setTimeout(async () => {
    orangeFish.style.left = `${targetLeft}px`;
    await wait(700);
    surface.classList.add("is-snared");
    const surfaceBottom =
      surface.getBoundingClientRect().top + window.scrollY
        + surface.getBoundingClientRect().height - window.innerHeight;
    const landingBottom = Math.max(
      0,
      Math.min(
        surfaceBottom,
        document.documentElement.scrollHeight - window.innerHeight,
      ),
    );
    const landingScroll = animateWindowScroll(landingBottom, 1500);
    await wait(500);
    surface.classList.add("is-choosing");
    const options = document.querySelector(".mode-options");
    options.setAttribute("aria-hidden", "false");
    modeButtons.forEach((button) => button.disabled = false);
    phishButton.removeAttribute("aria-busy");
    phishButton.setAttribute("aria-expanded", "true");
    phishButton.setAttribute("aria-label", "Choose text or audio");
    await wait(900);
    await landingScroll;
    transitionRunning = false;
  }, 0);
}

function beginSink(mode) {
  if (transitionRunning) return;
  transitionRunning = true;
  setMode(mode);
  modeButtons.forEach((button) => {
    const selected = button.id === (mode === "phone" ? "audio-mode-button" : "text-mode-button");
    button.setAttribute("aria-pressed", String(selected));
  });
  document.querySelector(".mode-options").setAttribute("aria-hidden", "true");
  surface.classList.add("is-submerging");
  document.querySelectorAll(".mode-button, #phish-button").forEach((button) => {
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
  });

  window.setTimeout(async () => {
    await wait(350);
    surface.classList.remove("is-choosing");
    const target = mode === "phone" ? audioPage : textPage;
    textPage.classList.remove("is-showing-results");
    textPage.classList.remove("is-active");
    audioPage.classList.remove("is-active");
    target.classList.add("is-active");
    document.body.classList.add("dashboard-locked");
    document.documentElement.classList.add("dashboard-locked");
    window.scrollTo({
      top: target.getBoundingClientRect().top + window.scrollY,
      behavior: "smooth",
    });
    await wait(1000);
    document.querySelectorAll(".mode-button, #phish-button").forEach((button) => {
      button.removeAttribute("aria-busy");
    });
    if (mode === "phone") startListening.focus({ preventScroll: true });
    else content.focus({ preventScroll: true });
    transitionRunning = false;
  }, 0);
}

modeButtons.forEach((button) => button.addEventListener("click", () => {
  beginSink(button.id === "audio-mode-button" ? "phone" : "email");
}));
document.querySelector("#phish-button").addEventListener("click", openModeChooser);

function returnToSurface() {
  stopListening();
  document.body.classList.remove("dashboard-locked");
  document.documentElement.classList.remove("dashboard-locked");
  surface.classList.remove("is-catching", "is-snared", "is-submerging", "is-choosing");
  textPage.classList.remove("is-active");
  textPage.classList.remove("is-showing-results");
  audioPage.classList.remove("is-active");
  audioPage.classList.remove("is-showing-results");
  orangeFish.removeAttribute("style");
  fishOrientation.removeAttribute("style");
  hook.removeAttribute("style");
  document.querySelectorAll(".mode-button, #phish-button").forEach((button) => {
    button.disabled = button.classList.contains("mode-button");
    button.removeAttribute("aria-busy");
  });
  document.querySelector(".mode-options").setAttribute("aria-hidden", "true");
  modeButtons.forEach((button) => button.setAttribute("aria-pressed", "false"));
  const phishButton = document.querySelector("#phish-button");
  phishButton.setAttribute("aria-expanded", "false");
  phishButton.setAttribute("aria-label", "Start checking for phishing");
  window.scrollTo({
    top: 0,
    behavior: "smooth",
  });
}

backButtons.forEach((button) => button.addEventListener("click", returnToSurface));
document.querySelector("#back-to-input").addEventListener("click", returnToTextInput);
document.querySelector("#audio-back-to-input").addEventListener("click", () => {
  audioPage.classList.remove("is-showing-results");
  window.scrollTo({
    top: audioPage.getBoundingClientRect().top + window.scrollY,
    behavior: "smooth",
  });
  audioContent.focus({ preventScroll: true });
});

function showAbout() {
  aboutDialog.hidden = false;
  document.querySelector("#close-about").focus();
}

function hideAbout() {
  aboutDialog.hidden = true;
}

aboutTriggers.forEach((trigger) => trigger.addEventListener("click", showAbout));
closeAbout.addEventListener("click", hideAbout);
aboutDialog.addEventListener("click", (event) => {
  if (event.target === aboutDialog) hideAbout();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    hideAbout();
  }
});

function updateLiveAssessment(value, label = "LIVE RISK ESTIMATE") {
  liveAssessment.textContent = value === null ? "AWAITING AUDIO..." : `${label}: ${value}%`;
}

function setListeningState(value) {
  listening = value;
  startListening.disabled = value;
  stopListeningButton.disabled = !value;
  microphone.classList.toggle("is-listening", value);
  microphone.setAttribute("aria-label", value ? "Stop listening" : "Start listening");
  listeningStatus.textContent = value ? "LISTENING..." : "";
}

function updateTranscript() {
  audioContent.value = `${finalTranscript} ${interimTranscript}`.trim();
  if (listening && audioContent.value) {
    updateLiveAssessment(estimateLiveConfidence(audioContent.value));
  }
}

function scheduleLiveAnalysis() {
  if (analysisTimer || !listening) return;
  analysisTimer = window.setTimeout(async () => {
    analysisTimer = null;
    if (!listening) return;
    if (audioContent.value.trim()) {
      try {
        const analysis = await requestAnalysis({
          type: "phone",
          text: audioContent.value,
          live: true,
        });
        updateLiveAssessment(analysis.confidence, "GEMINI LIVE RISK");
      } catch (error) {
        audioStatus.textContent = `Live analysis failed: ${error.message}`;
      }
    }
    scheduleLiveAnalysis();
  }, 10_000);
}

function createRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) throw new Error("Live speech recognition is unavailable in this browser.");

  const instance = new SpeechRecognition();
  instance.continuous = true;
  instance.interimResults = true;
  instance.lang = "en-US";
  instance.onstart = () => {
    recognitionActive = true;
    setListeningState(true);
  };
  instance.onresult = (event) => {
    interimTranscript = "";
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const transcript = event.results[index][0].transcript;
      if (event.results[index].isFinal) finalTranscript += `${transcript} `;
      else interimTranscript += transcript;
    }
    updateTranscript();
    scheduleLiveAnalysis();
  };
  instance.onerror = (event) => {
    const messages = {
      "audio-capture": "No microphone was found. Check your input device.",
      "not-allowed": "Microphone access was denied. Allow access and try again.",
      network: "Speech recognition needs an internet connection.",
      "no-speech": "No speech detected yet. Keep speaking.",
    };
    listeningStatus.textContent = messages[event.error] ?? `Listening error: ${event.error}`;
  };
  instance.onend = () => {
    recognitionActive = false;
    if (listening) {
      window.setTimeout(() => {
        if (!listening || recognitionActive) return;
        try {
          instance.start();
        } catch (error) {
          listeningStatus.textContent = `Could not restart listening: ${error.message}`;
          setListeningState(false);
        }
      }, 250);
    }
  };
  return instance;
}

startListening.addEventListener("click", async () => {
  try {
    if (listening) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("This browser does not support microphone access.");
    }
    microphoneStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    recognition ??= createRecognition();
    finalTranscript = audioContent.value.trim();
    interimTranscript = "";
    recognition.start();
    setListeningState(true);
    scheduleLiveAnalysis();
    audioStatus.textContent = "";
  } catch (error) {
    setListeningState(false);
    listeningStatus.textContent = `Could not start listening: ${error.message}`;
    microphoneStream?.getTracks().forEach((track) => track.stop());
    microphoneStream = null;
  }
});

function stopListening() {
  listening = false;
  if (analysisTimer) {
    clearTimeout(analysisTimer);
    analysisTimer = null;
  }
  if (recognitionActive) recognition?.stop();
  recognitionActive = false;
  microphoneStream?.getTracks().forEach((track) => track.stop());
  microphoneStream = null;
  setListeningState(false);
}

async function analyzePhoneTranscript() {
  if (!audioContent.value.trim()) {
    audioStatus.textContent = "Start listening or enter a transcript before running the analysis.";
    return;
  }
  audioStatus.textContent = "Preparing the final Gemini report...";
  audioDeepScanStatus.textContent = "The analysis is running. Your report will appear here.";
  audioDeepRisk.textContent = "Analyzing";
  audioDeepConfidence.textContent = "—";
  audioDeepReasons.textContent = "The results will appear here when the scan is complete.";
  audioDeepAction.textContent = "—";
  try {
    showResult(await requestAnalysis({ type: "phone", text: audioContent.value }));
    audioStatus.textContent = "Analysis complete. Your report is ready.";
  } catch (error) {
    showAnalysisError(error);
    audioStatus.textContent = `Analysis could not be completed: ${error.message}`;
  }
  audioPage.classList.add("is-showing-results");
  scrollToElement(
    audioResults,
    "smooth",
    Math.round(window.innerHeight * .12),
  );
}

stopListeningButton.addEventListener("click", async () => {
  stopListening();
  await analyzePhoneTranscript();
});

microphone.addEventListener("click", () => {
  if (listening) stopListeningButton.click();
  else startListening.click();
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (activeMode() === "phone") {
    await analyzePhoneTranscript();
    return;
  }
  if (!content.value.trim() && !selectedImage) {
    status.textContent = "Enter suspicious text or upload an email screenshot first.";
    return;
  }

  status.textContent = "";
  progressStatus.textContent = "The analysis is running. Your report will appear here.";
  deepRisk.textContent = "Analyzing";
  deepConfidence.textContent = "—";
  deepReasons.textContent = "The results will appear here when the scan is complete.";
  deepAction.textContent = "—";
  animateProgress();
  const minimumDuration = wait(2000);
  let analysis;
  let analysisError;
  try {
    try {
      analysis = await requestAnalysis({
        type: "email",
        text: content.value,
        image: selectedImage,
      });
    } catch (error) {
      analysisError = error;
    }
    await minimumDuration;
    if (analysisError) throw analysisError;
    showResult(analysis);
    progressStatus.textContent = "Analysis complete. Your Gemini report is ready.";
    status.textContent = "Analysis complete.";
  } catch (error) {
    showAnalysisError(error);
    progressStatus.textContent = `Analysis could not be completed: ${error.message}`;
    status.textContent = error.message;
  } finally {
    stopProgress();
    progress.hidden = true;
    submitButton.hidden = false;
    textPage.classList.add("is-showing-results");
    scrollToElement(
      document.querySelector("#text-deepen-bottom"),
      "smooth",
      Math.round(window.innerHeight * .12),
    );
  }
});

document.addEventListener("wheel", (event) => {
  if (!document.body.classList.contains("dashboard-locked")) return;
  const target = event.target instanceof Element ? event.target : null;
  const scrollable = target?.closest(".analysis-result, .deep-result-card, .about-copy, textarea");
  if (!scrollable) event.preventDefault();
}, { passive: false });

document.addEventListener("touchmove", (event) => {
  const target = event.target instanceof Element ? event.target : null;
  if (document.body.classList.contains("dashboard-locked")
    && !target?.closest(".analysis-result, .deep-result-card, .about-copy, textarea")) {
    event.preventDefault();
  }
}, { passive: false });

document.addEventListener("keydown", (event) => {
  if (!document.body.classList.contains("dashboard-locked")) return;
  const target = event.target instanceof Element ? event.target : null;
  if (["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End", " "].includes(event.key)
    && !target?.closest("textarea, input, button, .deep-result-card, .analysis-result, .about-copy")) {
    event.preventDefault();
  }
});

window.addEventListener("beforeunload", () => {
  if (previewUrl) URL.revokeObjectURL(previewUrl);
});
