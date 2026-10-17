const form = document.querySelector("#analysis-form");
const button = form.querySelector('button[type="submit"]');
const content = document.querySelector("#content");
const contentLabel = document.querySelector("#content-label");
const typeInputs = form.querySelectorAll('input[name="type"]');
const imageInput = document.querySelector("#image");
const preview = document.querySelector("#preview");
const emailImageControls = document.querySelector("#email-image-controls");
const status = document.querySelector("#status");
const result = document.querySelector("#result");
const phoneControls = document.querySelector("#phone-controls");
const startListening = document.querySelector("#start-listening");
const stopListening = document.querySelector("#stop-listening");
const listeningStatus = document.querySelector("#listening-status");

let selectedImage = null;
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
  preview.src = URL.createObjectURL(file);
  preview.hidden = false;
}

imageInput.addEventListener("change", () => {
  try {
    setImage(imageInput.files[0]);
    status.textContent = "Screenshot ready.";
  } catch (error) {
    selectedImage = null;
    imageInput.value = "";
    status.textContent = error.message;
  }
});

function updatePhoneControls() {
  const isPhone = form.elements.type.value === "phone";
  phoneControls.hidden = !isPhone;
  emailImageControls.hidden = isPhone;
  imageInput.disabled = isPhone;
  if (isPhone) {
    contentLabel.textContent = "Live transcript";
    content.placeholder = "Your live phone-call transcript will appear here...";
  } else {
    contentLabel.textContent = "Paste the message or transcript";
    content.placeholder = "Paste the email or phone-call transcript here...";
  }
}

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
  result.className = "result live-result";
  result.hidden = false;
  result.replaceChildren();

  const heading = document.createElement("h2");
  heading.textContent = "Current scam likelihood";
  result.append(heading);

  const score = document.createElement("p");
  score.className = "risk-score";
  score.textContent = confidence === null ? "--%" : `${confidence}%`;
  result.append(score);

  const note = document.createElement("p");
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
    result.className = "result error";
    result.textContent = error.message;
    result.hidden = false;
    status.textContent = "";
  } finally {
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

typeInputs.forEach((input) => input.addEventListener("change", updatePhoneControls));
updatePhoneControls();

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
  result.className = "result";
  result.hidden = false;
  result.replaceChildren();

  const heading = document.createElement("h2");
  heading.textContent = analysis.verdict.replace("_", " ");
  result.append(heading);

  const confidence = document.createElement("p");
  confidence.className = "risk-score";
  confidence.textContent = `Confidence: ${analysis.confidence}%`;
  result.append(confidence);

  const reasonsHeading = document.createElement("strong");
  reasonsHeading.textContent = "Reasons";
  result.append(reasonsHeading);

  const reasons = document.createElement("ul");
  for (const reason of analysis.reasons) {
    const item = document.createElement("li");
    item.textContent = reason;
    reasons.append(item);
  }
  result.append(reasons);

  const action = document.createElement("p");
  const actionLabel = document.createElement("strong");
  actionLabel.textContent = "Recommended action: ";
  action.append(actionLabel, document.createTextNode(analysis.recommended_action));
  result.append(action);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (form.elements.type.value === "phone") {
    await analyzeCurrentTranscript();
    return;
  }
  if (!content.value.trim() && !selectedImage) {
    status.textContent = "Paste text or select an email screenshot first.";
    return;
  }
  button.disabled = true;
  status.textContent = "Analyzing...";
  result.hidden = true;

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
    result.className = "result error";
    result.textContent = error.message;
    result.hidden = false;
    status.textContent = "";
  } finally {
    button.disabled = false;
  }
});
