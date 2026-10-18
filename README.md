# Go-Phish
A website that determines if an email, phone call, or email screenshot is a phishing scam.

The landing and underwater scenes use separately exported Figma art layers (sky, ocean, fish, bubbles, and seabed) with real HTML controls layered above them; no full-screen screenshot is used as a background. The tall landing scene first shows **PHISH?**. Press it to run the hook-and-fish catch, then scroll down to the **TEXT** and **AUDIO** choices. Choosing a mode transitions into its dashboard. **BACK TO SURFACE** returns to the top of the landing scene, and **ABOUT US** opens the project information.

In **TEXT** mode, paste suspicious content or upload a PNG, JPEG, or WebP screenshot. Press `Ctrl+V` to paste an image directly. **RUN PHISH_NET** runs the Gemini analysis with an animated two-second-minimum scan, then scrolls to the inline results card.

In **AUDIO** mode, choose **Start Listening** or the microphone and allow microphone access. The browser transcribes speech and updates an immediate local scam-likelihood estimate; Gemini refines the estimate periodically. Stop listening to scroll to the final inline Gemini report with reasons and recommended next steps. The app transcribes speech in the browser and does not record or upload raw audio.

## Local setup

Enter your Gemini API key in the `GEMINI_API_KEY` field in the root `.env` file, then run `npm start` and open `http://localhost:3000`. The `.env` file is local and ignored by Git; `.env.example` is the safe template.

## Phone-call feature constraints

- This uses the browser's built-in Web Speech API for transcription; it does not record or upload raw audio.
- Microphone permission and an internet connection are required. Use `http://localhost:3000` during development.
- Gemini receives a transcript snapshot every 10 seconds, not a true audio stream. Between Gemini requests, the displayed number is a local estimate based on recognized scam indicators so it can update without network delay. The displayed confidence is not a mathematically guaranteed probability.
- Each update is a separate Gemini request. On the free tier, long calls can use quota quickly, so stop the listener when the call ends.
- The feature cannot hear a separate phone call unless that call's audio is audible to the computer microphone or routed into the browser.