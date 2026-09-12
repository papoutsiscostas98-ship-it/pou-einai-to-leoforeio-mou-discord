const DISCORD_API = "https://discord.com/api/v10";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    /*
     * ====================================================
     * REGISTER
     * POST /register
     *
     * Χρησιμοποιεί:
     * - env.DISCORD_TOKEN
     * - env.REGISTER_KEY
     * - env.APPLICATION_ID
     * ====================================================
     */

    if (url.pathname === "/register") {
      if (request.method !== "POST") {
        return new Response("Method Not Allowed", {
          status: 405,
        });
      }

      if (!env.REGISTER_KEY) {
        console.error("REGISTER_KEY is missing");

        return new Response(
          "REGISTER_KEY is not configured",
          {
            status: 500,
          }
        );
      }

      const registerKey =
        request.headers.get("X-Register-Key");

      if (
        !registerKey ||
        registerKey !== env.REGISTER_KEY
      ) {
        return new Response("Unauthorized", {
          status: 401,
        });
      }

      return await registerCommands(env);
    }

    /*
     * ====================================================
     * BASIC WORKER RESPONSE
     * ====================================================
     */

    if (request.method !== "POST") {
      return new Response(
        "Λεωφορεία Discord Worker",
        {
          status: 200,
        }
      );
    }

    /*
     * ====================================================
     * DISCORD SIGNATURE
     * ====================================================
     */

    const signature = request.headers.get(
      "X-Signature-Ed25519"
    );

    const timestamp = request.headers.get(
      "X-Signature-Timestamp"
    );

    if (!signature || !timestamp) {
      return new Response(
        "Missing Discord signature",
        {
          status: 401,
        }
      );
    }

    const body = await request.text();

    /*
     * ====================================================
     * VERIFY DISCORD REQUEST
     * ====================================================
     */

    const isValid =
      await verifyDiscordRequest(
        signature,
        timestamp,
        body,
        env.DISCORD_PUBLIC_KEY
      );

    if (!isValid) {
      return new Response(
        "Invalid Discord signature",
        {
          status: 401,
        }
      );
    }

    /*
     * ====================================================
     * PARSE JSON
     * ====================================================
     */

    let interaction;

    try {
      interaction = JSON.parse(body);
    } catch {
      return new Response(
        "Invalid JSON",
        {
          status: 400,
        }
      );
    }

    /*
     * ====================================================
     * DISCORD PING
     * ====================================================
     */

    if (interaction.type === 1) {
      return Response.json({
        type: 1,
      });
    }

    /*
     * ====================================================
     * SLASH COMMAND
     * ====================================================
     */

    if (interaction.type === 2) {
      return await handleCommand(
        interaction,
        env
      );
    }

    /*
     * ====================================================
     * AUTOCOMPLETE
     * ====================================================
     */

    if (interaction.type === 4) {
      return await handleAutocomplete(
        interaction,
        env
      );
    }

    /*
     * ====================================================
     * UNKNOWN INTERACTION
     * ====================================================
     */

    return new Response(
      "Unknown interaction type",
      {
        status: 400,
      }
    );
  },
};


/*
 * ========================================================
 * REGISTER DISCORD COMMANDS
 * ========================================================
 */

async function registerCommands(env) {
  if (!env.DISCORD_TOKEN) {
    return new Response(
      "DISCORD_TOKEN is not configured",
      {
        status: 500,
      }
    );
  }

  if (!env.APPLICATION_ID) {
    return new Response(
      "APPLICATION_ID is not configured",
      {
        status: 500,
      }
    );
  }

  const commands = [
    {
      name: "αφίξεις",
      description:
        "Δες τις επόμενες αφίξεις λεωφορείων σε στάση.",
      options: [
        {
          type: 3,
          name: "γραμμή",
          description:
            "Αριθμός ή όνομα γραμμής",
          required: true,
          autocomplete: true,
        },
      ],
    },

    {
      name: "arrivals",
      description:
        "See upcoming bus arrivals at a stop.",
      options: [
        {
          type: 3,
          name: "line",
          description:
            "Bus line number or name",
          required: true,
          autocomplete: true,
        },
      ],
    },
  ];

  try {
    const response = await fetch(
      `${DISCORD_API}/applications/${env.APPLICATION_ID}/commands`,
      {
        method: "PUT",

        headers: {
          Authorization:
            `Bot ${env.DISCORD_TOKEN}`,

          "Content-Type":
            "application/json",
        },

        body: JSON.stringify(commands),
      }
    );

    const text =
      await response.text();

    console.log(
      "Discord registration status:",
      response.status
    );

    console.log(
      "Discord registration response:",
      text
    );

    return new Response(
      text,
      {
        status: response.status,

        headers: {
          "Content-Type":
            "application/json",
        },
      }
    );
  } catch (error) {
    console.error(
      "Discord registration error:",
      error
    );

    return new Response(
      JSON.stringify({
        success: false,
        error:
          error?.message ||
          String(error),
      }),
      {
        status: 500,

        headers: {
          "Content-Type":
            "application/json",
        },
      }
    );
  }
}


/*
 * ========================================================
 * SLASH COMMAND HANDLER
 * ========================================================
 */

async function handleCommand(
  interaction,
  env
) {
  const commandName =
    interaction.data?.name;

  if (
    commandName !== "αφίξεις" &&
    commandName !== "arrivals"
  ) {
    return Response.json({
      type: 4,

      data: {
        content:
          "❌ Άγνωστη εντολή.",
      },
    });
  }

  /*
   * Έλεγχος Cloudflare bindings
   */

  if (!env.DISCORD_TOKEN) {
    console.error(
      "DISCORD_TOKEN is missing"
    );

    return Response.json({
      type: 4,

      data: {
        content:
          "❌ Το DISCORD_TOKEN δεν έχει ρυθμιστεί στο Cloudflare Worker.",
      },
    });
  }

  if (!env.APPLICATION_ID) {
    console.error(
      "APPLICATION_ID is missing"
    );

    return Response.json({
      type: 4,

      data: {
        content:
          "❌ Το APPLICATION_ID δεν έχει ρυθμιστεί στο Cloudflare Worker.",
      },
    });
  }

  /*
   * Προσωρινή απάντηση.
   *
   * ΔΕΝ εμφανίζουμε το Token ή το REGISTER_KEY.
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
 * AUTOCOMPLETE
 * ========================================================
 */

async function handleAutocomplete(
  interaction,
  env
) {
  const option =
    interaction.data?.options?.find(
      (item) => item.focused
    );

  const query =
    String(
      option?.value || ""
    ).toLowerCase();

  const testLines = [
    {
      name:
        "304 - Νομισματοκοπείο - Άρτεμις",
      value: "304",
    },

    {
      name:
        "316 - Στ. Νομισματοκοπείο - Παλλήνη",
      value: "316",
    },

    {
      name:
        "040 - Πειραιάς - Σύνταγμα",
      value: "040",
    },
  ];

  const choices =
    testLines
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
 * DISCORD ED25519 SIGNATURE VERIFICATION
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
      hexToUint8Array(
        publicKey
      );

    const signatureBytes =
      hexToUint8Array(
        signature
      );

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
    new Uint8Array(
      hex.length / 2
    );

  for (
    let i = 0;
    i < hex.length;
    i += 2
  ) {
    const value =
      parseInt(
        hex.substring(
          i,
          i + 2
        ),
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
