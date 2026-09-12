const DISCORD_API = "https://discord.com/api/v10";
const BUSAPP_API =
  "https://telematics.oasa.gr/api";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    /*
     * ====================================================
     * REGISTER
     * POST /register
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
 * SLASH COMMAND
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
   * Βρίσκουμε τη γραμμή που επέλεξε ο χρήστης.
   */

  const option =
    interaction.data?.options?.find(
      (item) =>
        item.name === "γραμμή" ||
        item.name === "line"
    );

  const lineQuery =
    String(
      option?.value || ""
    ).trim();

  if (!lineQuery) {
    return Response.json({
      type: 4,

      data: {
        content:
          "❌ Δεν επιλέχθηκε γραμμή.",
      },
    });
  }

  /*
   * Προς το παρόν επιβεβαιώνουμε τη γραμμή.
   *
   * Στο επόμενο βήμα θα χρησιμοποιήσουμε τη γραμμή
   * για να βρούμε διαδρομές → στάσεις → αφίξεις.
   */

  return Response.json({
    type: 4,

    data: {
      content:
        `🚌 Επιλέχθηκε η γραμμή **${lineQuery}**.\n\n` +
        `⏳ Στο επόμενο βήμα θα αναζητήσουμε τις στάσεις και τις πραγματικές αφίξεις.`,
    },
  });
}


/*
 * ========================================================
 * AUTOCOMPLETE ΑΠΟ ΤΟ BUSAPP API
 * ========================================================
 */

async function handleAutocomplete(
  interaction,
  env
) {
  try {
    /*
     * Βρίσκουμε ποια επιλογή πληκτρολογεί ο χρήστης.
     */

    const option =
      interaction.data?.options?.find(
        (item) => item.focused
      );

    const query =
      String(
        option?.value || ""
      ).trim().toLowerCase();

    /*
     * ----------------------------------------------------
     * Ζητάμε τις πραγματικές γραμμές από το BusApp
     * ----------------------------------------------------
     */

    const response = await fetch(
      `${BUSAPP_API}/api/lines`,
      {
        method: "GET",

        headers: {
          Accept:
            "application/json",
        },
      }
    );

    if (!response.ok) {
      console.error(
        "BusApp /api/lines returned:",
        response.status
      );

      return Response.json({
        type: 8,

        data: {
          choices: [],
        },
      });
    }

    const data =
      await response.json();

    /*
     * Το BusApp API επιστρέφει:
     *
     * {
     *   success: true,
     *   results: [...]
     * }
     */

    if (
      !data ||
      data.success !== true ||
      !Array.isArray(data.results)
    ) {
      console.error(
        "Invalid BusApp /api/lines response:",
        data
      );

      return Response.json({
        type: 8,

        data: {
          choices: [],
        },
      });
    }

    /*
     * ----------------------------------------------------
     * Μετατρέπουμε τις πραγματικές γραμμές του BusApp
     * σε Discord autocomplete choices.
     * ----------------------------------------------------
     */

    const choices =
      data.results
        .map((line) => {
          const lineId =
            String(
              line.LineID ?? ""
            ).trim();

          const greekName =
            String(
              line.LineDescr ?? ""
            ).trim();

          const englishName =
            String(
              line.LineDescrEng ?? ""
            ).trim();

          if (!lineId) {
            return null;
          }

          /*
           * Ελληνικό όνομα ως κύρια εμφάνιση.
           */

          let displayName =
            greekName
              ? `${lineId} - ${greekName}`
              : lineId;

          /*
           * Discord επιτρέπει μέχρι 100 χαρακτήρες
           * στο name μιας choice.
           */

          displayName =
            displayName.substring(
              0,
              100
            );

          return {
            name: displayName,

            value: lineId,
          };
        })

        .filter(Boolean);

    /*
     * ----------------------------------------------------
     * Φιλτράρισμα σύμφωνα με αυτό που πληκτρολόγησε
     * ο χρήστης.
     * ----------------------------------------------------
     */

    const filteredChoices =
      choices
        .filter((choice) => {
          const name =
            choice.name.toLowerCase();

          const value =
            choice.value.toLowerCase();

          return (
            !query ||
            name.includes(query) ||
            value.includes(query)
          );
        })

        /*
         * Discord autocomplete:
         * maximum 25 choices.
         */

        .slice(0, 25);

    return Response.json({
      type: 8,

      data: {
        choices:
          filteredChoices,
      },
    });
  } catch (error) {
    console.error(
      "BusApp autocomplete error:",
      error
    );

    return Response.json({
      type: 8,

      data: {
        choices: [],
      },
    });
  }
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
