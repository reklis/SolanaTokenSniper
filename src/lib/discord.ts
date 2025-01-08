export async function sendDiscordMessage(message: string) {
  if (process.env.DISCORD_WEBHOOK_URL) {
    const res = await fetch(process.env.DISCORD_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ content: message }),
    });

    if (!res.ok) {
      console.error("Failed to send notification to Discord:", res.statusText);
    }
  }
}
