# Go-Phish
A website that determines if an email, phone call, or email screenshot is a phishing scam.
<img width="1232" height="622" alt="image" src="https://github.com/user-attachments/assets/7fce0cd5-8cd9-4cbd-812d-648566a23117" />
You can paste an email screenshot directly into the page with `Ctrl+V`, or choose a PNG, JPEG, or WebP file. The image is sent to Gemini as visual input so it can read the email text and inspect phishing indicators.

For phone calls, select **Phone call**, click **Start listening**, and allow microphone access. The browser updates an immediate local scam-likelihood estimate as speech is recognized, while Gemini refines the number in the background every 10 seconds. During the call, only the number is shown. Click **Stop listening** to generate the final Gemini conclusion with reasons and recommended next steps.

## Phone-call feature constraints

- This uses the browser's built-in Web Speech API for transcription; it does not record or upload raw audio.
- Microphone permission and an internet connection are required. Use `http://localhost:3000` during development.
- Gemini receives a transcript snapshot every 10 seconds, not a true audio stream. Between Gemini requests, the displayed number is a local estimate based on recognized scam indicators so it can update without network delay. The displayed confidence is not a mathematically guaranteed probability.
- Each update is a separate Gemini request. On the free tier, long calls can use quota quickly, so keep the 15-second interval and stop the listener when the call ends.
- The feature cannot hear a separate phone call unless that call's audio is audible to the computer microphone or routed into the browser.