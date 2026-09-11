export default {
  async fetch(request, env) {
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

    // Προσωρινή απάντηση για δοκιμή
    return Response.json({
      type: 4,
      data: {
        content: "🤖 Το Λεωφορεία Worker λειτουργεί!",
      },
    });
  },
};

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