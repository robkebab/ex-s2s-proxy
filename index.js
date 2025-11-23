import dotenv from "dotenv";
import { WebSocket, WebSocketServer } from "ws";

dotenv.config();

const PORT = Number(process.env.PORT || 8080);
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL =
  process.env.OPENAI_MODEL || "gpt-4o-realtime-preview-2024-12-17";
const OPENAI_URL =
  process.env.OPENAI_URL || "wss://api.openai.com/v1/realtime";

function json(data) {
  console.log(JSON.stringify(data, null, 2));
}

function main() {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  const wss = new WebSocketServer({ port: PORT, path: "/realtime" });
  wss.on("connection", (client) => {
    // init OpenAI Socket
    const upstreamUrl = new URL(OPENAI_URL);
    upstreamUrl.searchParams.set("model", OPENAI_MODEL);

    const upstream = new WebSocket(upstreamUrl, {
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "OpenAI-Beta": "realtime=v1",
      },
    });

    const pingInterval = setInterval(() => {
      if (client.readyState === WebSocket.OPEN) client.ping();
      if (upstream.readyState === WebSocket.OPEN) upstream.ping();
    }, 15000);

    function closeBoth({ message, code, error }) {
      console.log("closing connections", {
        message,
        code,
        error: json(error || null),
      });

      clearInterval(pingInterval);

      try {
        client.close();
      } catch (err) {}
      try {
        upstream.close();
      } catch (err) {}
    }

    // Client
    client.on("message", (data, isBinary) => {
      if (upstream.readyState === WebSocket.OPEN) {
        upstream.send(data, { binary: isBinary });
      }
    });

    client.on("close", (code) => {
      closeBoth({ message: "client closed", code });
    });

    client.on("error", (error) => {
      closeBoth({ message: "client error", error });
    });

    // Upstream
    upstream.on("open", () => {
      const session = {
        modalities: ["text", "audio"],
        voice: "verse",
        input_audio_format: "pcm16",
        output_audio_format: "pcm16",
      };

      upstream.send(JSON.stringify({ type: "session.update", session }));
    });

    upstream.on("message", (data, isBinary) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data, { binary: isBinary });
      }
    });

    upstream.on("close", (code) => {
      closeBoth({ message: "upstream closed", code });
    });

    upstream.on("error", (err) => {
      closeBoth({ message: "upstream error", error: err });
    });
  });

  wss.on("error", (err) => {
    console.error("websocket server error", { error: json(err) });
  });

  wss.on("listening", () => {
    console.log("websocket server listening on port", PORT);
  });
}

main();
