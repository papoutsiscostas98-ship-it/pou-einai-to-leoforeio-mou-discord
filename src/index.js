const DISCORD_API = "https://discord.com/api/v10";
const APPLICATION_ID = "1547738265602232410";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Προσωρινό registration endpoint
    if (url.pathname === "/register") {
      if (request.method !== "POST") {
        return new Response("Method Not Allowed", {
          status: 405,
        });
      }

      const registerKey = request.headers.get("X-Register-Key");

      if (!registerKey || registerKey !== env.REGISTER_KEY) {
        return new Response("Unauthorized", {
          status: 401,
        });
      }

      return await registerCommands(env);
    }

    // Κανονική σελίδα Worker
    if (request.method !== "POST") {
      return new Response("Λεωφορεία Discord Worker", {
        status: 200,
      });
    }

    const signature = request.headers.get(
      "X-Signature-Ed25519"
    );

    const timestamp = request.headers.get(
      "X-Signature-Timestamp"
    );

    if (!signature || !timestamp) {
      return new Response("Missing Discord signature", {
        status: 401,
      });
    }

    const body = await request.text();

    const isValid = await verifyDiscordRequest(
      signature,
      timestamp,
      body,
      env.DISCORD_PUBLIC_KEY
    );

    if (!isValid) {
      return new Response("Invalid Discord signature", {
        status: 401,
      });
    }

    let interaction;

    try {
      interaction = JSON.parse(body);
    } catch {
      return new Response("Invalid JSON", {
        status: 400,
      });
    }

    // Discord PING
    if (interaction.type === 1) {
      return Response.json({
        type: 1,
      });
    }

    // Προσωρινή απάντηση
    return Response.json({
      type: 4,
      data: {
        content: "🤖 Το Λεωφορεία Worker λειτουργεί!",
      },
    });
  },
};

async function registerCommands(env) {
  const commands = [
    {
      name: "αφίξεις",
      description: "Δες τις επόμενες αφίξεις λεωφορείων σε στάση.",
      options: [
        {
          type: 3,
          name: "γραμμή",
          description: "Αριθμός ή όνομα γραμμής",
          required: true,
          autocomplete: true,
        },
      ],
    },
    {
      name: "arrivals",
      description: "See upcoming bus arrivals at a stop.",
      options: [
        {
          type: 3,
          name: "line",
          description: "Bus line number or name",
          required: true,
          autocomplete: true,
        },
      ],
    },
  ];

  const response = await fetch(
    `${DISCORD_API}/applications/${APPLICATION_ID}/commands`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bot ${env.DISCORD_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(commands),
    }
  );

  const text = await response.text();

  return new Response(text, {
    status: response.status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

async function verifyDiscordRequest(
  signature,
  timestamp,
  body,
  publicKey
) {
  try {
    if (!publicKey) {
      console.error("DISCORD_PUBLIC_KEY is missing");
      return false;
    }

    const publicKeyBytes = hexToUint8Array(publicKey);
    const signatureBytes = hexToUint8Array(signature);

    const message = new TextEncoder().encode(
      timestamp + body
    );

    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      publicKeyBytes,
      {
        name: "Ed25519",
      },
      false,
      ["verify"]
    );

    return await crypto.subtle.verify(
      {
        name: "Ed25519",
      },
      cryptoKey,
      signatureBytes,
      message
    );
  } catch (error) {
    console.error(
      "Discord signature verification error:",
      error
    );

    return false;
  }
}

function hexToUint8Array(hex) {
  if (
    typeof hex !== "string" ||
    hex.length % 2 !== 0
  ) {
    throw new Error("Invalid hexadecimal value");
  }

  const bytes = new Uint8Array(hex.length / 2);

  for (let i = 0; i < hex.length; i += 2) {
    const value = parseInt(
      hex.substring(i, i + 2),
      16
    );

    if (Number.isNaN(value)) {
      throw new Error("Invalid hexadecimal value");
    }

    bytes[i / 2] = value;
  }

  return bytes;
}
