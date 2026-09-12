const DISCORD_API = "https://discord.com/api/v10";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    /*
     * ----------------------------------------------------
     * Βασικός έλεγχος Worker
     * ----------------------------------------------------
     */

    if (request.method !== "POST") {
      return new Response("Λεωφορεία Discord Worker", {
        status: 200,
      });
    }

    /*
     * ----------------------------------------------------
     * Έλεγχος Discord signature
     * ----------------------------------------------------
     */

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

    /*
     * ----------------------------------------------------
     * JSON interaction
     * ----------------------------------------------------
     */

    let interaction;

    try {
      interaction = JSON.parse(body);
    } catch {
      return new Response("Invalid JSON", {
        status: 400,
      });
    }

    /*
     * ----------------------------------------------------
     * Discord PING
     *
     * Το Discord το χρησιμοποιεί για να επαληθεύσει
     * το Interactions Endpoint URL.
     * ----------------------------------------------------
     */

    if (interaction.type === 1) {
      return Response.json({
        type: 1,
      });
    }

    /*
     * ----------------------------------------------------
     * Slash command
     * ----------------------------------------------------
     */

    if (interaction.type === 2) {
      return await handleCommand(interaction, env);
    }

    /*
     * ----------------------------------------------------
     * Autocomplete
     * ----------------------------------------------------
     */

    if (interaction.type === 4) {
      return await handleAutocomplete(interaction, env);
    }

    /*
     * Άγνωστος τύπος interaction
     */

    return new Response("Unknown interaction type", {
      status: 400,
    });
  },
};


/*
 * ========================================================
 * COMMAND HANDLER
 * ========================================================
 */

async function handleCommand(interaction, env) {
  const commandName = interaction.data?.name;

  if (
    commandName !== "αφίξεις" &&
    commandName !== "arrivals"
  ) {
    return Response.json({
      type: 4,
      data: {
        content: "❌ Άγνωστη εντολή.",
      },
    });
  }

  /*
   * Ελέγχουμε ότι υπάρχουν τα απαραίτητα Cloudflare
   * bindings.
   */

  if (!env.DISCORD_TOKEN) {
    console.error("DISCORD_TOKEN is missing");

    return Response.json({
      type: 4,
      data: {
        content:
          "❌ Το DISCORD_TOKEN δεν έχει ρυθμιστεί στο Cloudflare Worker.",
      },
    });
  }

  if (!env.APPLICATION_ID) {
    console.error("APPLICATION_ID is missing");

    return Response.json({
      type: 4,
      data: {
        content:
          "❌ Το APPLICATION_ID δεν έχει ρυθμιστεί στο Cloudflare Worker.",
      },
    });
  }

  /*
   * Προσωρινή απάντηση για να επιβεβαιώσουμε ότι
   * το Discord → Worker λειτουργεί.
   */

  return Response.json({
    type: 4,
    data: {
      content:
        `🤖 Το Λεωφορεία Worker λειτουργεί!\n\n` +
        `Application ID: \`${env.APPLICATION_ID}\`\n` +
        `Command: \`/${commandName}\``,
    },
  });
}


/*
 * ========================================================
 * AUTOCOMPLETE HANDLER
 * ========================================================
 */

async function handleAutocomplete(interaction, env) {
  if (!env.DISCORD_TOKEN) {
    console.error("DISCORD_TOKEN is missing");

    return Response.json({
      type: 8,
      data: {
        choices: [],
      },
    });
  }

  /*
   * Προς το παρόν επιστρέφουμε μερικές δοκιμαστικές γραμμές.
   *
   * Στο επόμενο βήμα θα τις αντικαταστήσουμε με τις
   * πραγματικές γραμμές από το BusApp.
   */

  const option =
    interaction.data?.options?.find(
      (item) => item.focused
    );

  const query = String(
    option?.value || ""
  ).toLowerCase();

  const testLines = [
    {
      name: "304 - Νομισματοκοπείο - Άρτεμις",
      value: "304",
    },
    {
      name: "316 - Στ. Νομισματοκοπείο - Παλλήνη",
      value: "316",
    },
    {
      name: "040 - Πειραιάς - Σύνταγμα",
      value: "040",
    },
  ];

  const choices = testLines
    .filter((line) =>
      line.name
        .toLowerCase()
        .includes(query)
    )
    .slice(0, 25);

  return Response.json({
    type: 8,
    data: {
      choices,
    },
  });
}


/*
 * ========================================================
 * DISCORD SIGNATURE VERIFICATION
 * ========================================================
 */

async function verifyDiscordRequest(
  signature,
  timestamp,
  body,
  publicKey
) {
  try {
    if (!publicKey) {
      console.error(
        "DISCORD_PUBLIC_KEY is missing"
      );

      return false;
    }

    const publicKeyBytes =
      hexToUint8Array(publicKey);

    const signatureBytes =
      hexToUint8Array(signature);

    const message =
      new TextEncoder().encode(
        timestamp + body
      );

    const cryptoKey =
      await crypto.subtle.importKey(
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


/*
 * ========================================================
 * HEX → Uint8Array
 * ========================================================
 */

function hexToUint8Array(hex) {
  if (
    typeof hex !== "string" ||
    hex.length % 2 !== 0
  ) {
    throw new Error(
      "Invalid hexadecimal value"
    );
  }

  const bytes =
    new Uint8Array(hex.length / 2);

  for (
    let i = 0;
    i < hex.length;
    i += 2
  ) {
    const value = parseInt(
      hex.substring(i, i + 2),
      16
    );

    if (Number.isNaN(value)) {
      throw new Error(
        "Invalid hexadecimal value"
      );
    }

    bytes[i / 2] = value;
  }

  return bytes;
}
