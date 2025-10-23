const fetch = require('node-fetch'); // node-fetch@2

async function verifyTurnstile(token, ip) {
  try {
    if (!token) {
      console.error("No Turnstile token received from client");
      return { success: false };
    }

    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        secret: process.env.TURNSTILE_SECRET,
        response: token,
        remoteip: ip
      })
    });

    const data = await response.json();
    console.log("🔹 Turnstile verification result:", data);
    return data;

  } catch (err) {
    console.error("Turnstile verification failed:", err);
    return { success: false, error: "fetch-failed" };
  }
}

module.exports = verifyTurnstile;
