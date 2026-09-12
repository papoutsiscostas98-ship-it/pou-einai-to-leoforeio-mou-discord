import linesCacheData from "../lines-cache.json";

// ============================================================
// CONFIG
// ============================================================

const DISCORD_API = "https://discord.com/api/v10";

const OASA_API =
  "https://telematics.oasa.gr/api/";

const APPLICATION_COMMAND_AUTOCOMPLETE = 4;
const APPLICATION_COMMAND = 2;
const MESSAGE_COMPONENT = 3;

const AUTOCOMPLETE_RESULT = 8;
const DEFERRED_CHANNEL_MESSAGE = 5;

const MAX_AUTOCOMPLETE_CHOICES = 25;

// ============================================================
// LINES CACHE
// ============================================================

const linesCache = Array.isArray(linesCacheData)
  ? linesCacheData
  : Array.isArray(linesCacheData?.results)
    ? linesCacheData.results
    : [];

console.log(
  `💾 Lines cache loaded: ${linesCache.length} γραμμές`
);

// ============================================================
// HELPERS
// ============================================================

function json(data, status = 200) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        "Content-Type": "application/json; charset=UTF-8",
      },
    }
  );
}

function text(data, status = 200) {
  return new Response(data, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=UTF-8",
    },
  });
}

function isEnglish(language) {
  return language === "en";
}

function getLineName(line, language = "el") {
  if (language === "en") {
    return (
      line.LineDescrEng ||
      line.LineDescr ||
      line.LineID ||
      "Unknown line"
    );
  }

  return (
    line.LineDescr ||
    line.LineDescrEng ||
    line.LineID ||
    "Άγνωστη γραμμή"
  );
}

function getRouteName(route, language = "el") {
  if (language === "en") {
    return (
      route.RouteDescrEng ||
      route.RouteDescr ||
      `Route ${route.RouteCode}`
    );
  }

  return (
    route.RouteDescr ||
    route.RouteDescrEng ||
    `Διαδρομή ${route.RouteCode}`
  );
}

function findLineByCode(lineCode) {
  return linesCache.find(
    (line) =>
      String(line.LineCode) === String(lineCode)
  );
}

function findLineById(lineId) {
  return linesCache.find(
    (line) =>
      String(line.LineID) === String(lineId)
  );
}

// ============================================================
// DISCORD SIGNATURE VERIFICATION
// ============================================================

function hexToUint8Array(hex) {
  const bytes = new Uint8Array(
    hex.length / 2
  );

  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(
      hex.substr(i * 2, 2),
      16
    );
  }

  return bytes;
}

async function verifyDiscordRequest(
  request,
  body,
  publicKey
) {
  try {
    const signature =
      request.headers.get(
        "X-Signature-Ed25519"
      );

    const timestamp =
      request.headers.get(
        "X-Signature-Timestamp"
      );

    if (!signature || !timestamp) {
      return false;
    }

    if (!publicKey) {
      console.error(
        "❌ DISCORD_PUBLIC_KEY is missing."
      );

      return false;
    }

    const encoder =
      new TextEncoder();

    const message = encoder.encode(
      timestamp + body
    );

    const signatureBytes =
      hexToUint8Array(signature);

    const publicKeyBytes =
      hexToUint8Array(publicKey);

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
      "❌ Discord signature verification error:",
      error
    );

    return false;
  }
}

// ============================================================
// DISCORD API
// ============================================================

async function discordRequest(
  path,
  method,
  token,
  body
) {
  const response = await fetch(
    `${DISCORD_API}${path}`,
    {
      method,
      headers: {
        Authorization:
          `Bot ${token}`,
        "Content-Type":
          "application/json",
      },
      body:
        body !== undefined
          ? JSON.stringify(body)
          : undefined,
    }
  );

  const responseText =
    await response.text();

  if (!response.ok) {
    throw new Error(
      `Discord HTTP ${response.status}: ${responseText.slice(
        0,
        1000
      )}`
    );
  }

  if (!responseText) {
    return null;
  }

  try {
    return JSON.parse(
      responseText
    );
  } catch {
    return responseText;
  }
}

// ============================================================
// EDIT ORIGINAL DISCORD RESPONSE
// ============================================================

async function editOriginalResponse(
  applicationId,
  interactionToken,
  token,
  payload
) {
  const url =
    `${DISCORD_API}/webhooks/` +
    `${applicationId}/` +
    `${interactionToken}/messages/@original`;

  const response = await fetch(
    url,
    {
      method: "PATCH",
      headers: {
        Authorization:
          `Bot ${token}`,
        "Content-Type":
          "application/json",
      },
      body: JSON.stringify(
        payload
      ),
    }
  );

  const responseText =
    await response.text();

  if (!response.ok) {
    throw new Error(
      `Discord edit HTTP ${response.status}: ${responseText.slice(
        0,
        1000
      )}`
    );
  }

  return responseText;
}

// ============================================================
// OASA FETCH
// ============================================================

async function oasaFetch(
  params
) {
  const url =
    new URL(OASA_API);

  for (
    const [key, value]
    of Object.entries(params)
  ) {
    url.searchParams.set(
      key,
      String(value)
    );
  }

  console.log(
    `🌐 OASA request: ${url.toString()}`
  );

  const started =
    Date.now();

  let response;

  try {
    response = await fetch(
      url.toString(),
      {
        method: "GET",
        headers: {
          Accept:
            "application/json,text/plain,*/*",
          "User-Agent":
            "PapoutsisDigital-DiscordBot/1.0",
        },
      }
    );
  } catch (error) {
    throw new Error(
      `OASA FETCH ERROR: ${
        error?.message ||
        String(error)
      }`
    );
  }

  const elapsed =
    Date.now() - started;

  const responseText =
    await response.text();

  console.log(
    `📡 OASA status: ${response.status} (${elapsed}ms)`
  );

  console.log(
    `📦 OASA body length: ${responseText.length}`
  );

  if (!response.ok) {
    throw new Error(
      `OASA HTTP ${response.status}: ${responseText.slice(
        0,
        1000
      )}`
    );
  }

  let data;

  try {
    data = JSON.parse(
      responseText
    );
  } catch {
    throw new Error(
      `OASA INVALID JSON: ${responseText.slice(
        0,
        1000
      )}`
    );
  }

  return data;
}

// ============================================================
// GET ROUTES FROM OASA
// ============================================================

async function getRoutes(
  lineCode
) {
  const data =
    await oasaFetch({
      act: "webGetRoutes",
      p1: lineCode,
    });

  if (!Array.isArray(data)) {
    throw new Error(
      `OASA ROUTES RESPONSE IS NOT ARRAY: ${JSON.stringify(
        data
      ).slice(0, 1000)}`
    );
  }

  return data;
}

// ============================================================
// AUTOCOMPLETE
// ============================================================

async function handleAutocomplete(
  interaction
) {
  const options =
    interaction.data?.options ||
    [];

  const focused =
    options.find(
      (option) =>
        option.focused === true
    );

  const query =
    String(
      focused?.value ||
      ""
    )
      .trim()
      .toLowerCase();

  console.log(
    `🔎 Autocomplete query: "${query}"`
  );

  let filtered =
    linesCache;

  if (query) {
    filtered =
      linesCache.filter(
        (line) => {
          const id =
            String(
              line.LineID ||
              ""
            )
              .toLowerCase();

          const code =
            String(
              line.LineCode ||
              ""
            )
              .toLowerCase();

          const greek =
            String(
              line.LineDescr ||
              ""
            )
              .toLowerCase();

          const english =
            String(
              line.LineDescrEng ||
              ""
            )
              .toLowerCase();

          return (
            id.includes(query) ||
            code.includes(query) ||
            greek.includes(query) ||
            english.includes(query)
          );
        }
      );
  }

  filtered =
    filtered.slice(
      0,
      MAX_AUTOCOMPLETE_CHOICES
    );

  const choices =
    filtered.map(
      (line) => ({
        name:
          `🚌 ${line.LineID || line.LineCode} — ${
            line.LineDescr ||
            line.LineDescrEng ||
            "Άγνωστη γραμμή"
          }`.slice(
            0,
            100
          ),

        value:
          String(
            line.LineCode
          ),
      })
    );

  return json({
    type:
      AUTOCOMPLETE_RESULT,

    data: {
      choices,
    },
  });
}

// ============================================================
// ROUTE SELECT MENU
// ============================================================

function createRoutesComponents(
  routes,
  userId,
  lineId,
  lineCode,
  language
) {
  const options =
    routes
      .slice(
        0,
        25
      )
      .map(
        (route) => ({
          label:
            getRouteName(
              route,
              language
            ).slice(
              0,
              100
            ),

          value:
            String(
              route.RouteCode
            ),

          description:
            `Route ${route.RouteCode}`.slice(
              0,
              100
            ),
        })
      );

  if (!options.length) {
    return [];
  }

  return [
    {
      type: 1,

      components: [
        {
          type: 3,

          custom_id:
            `route:${userId}:${lineId}:${lineCode}:${language}`,

          placeholder:
            isEnglish(language)
              ? "Select a direction"
              : "Επίλεξε κατεύθυνση",

          min_values: 1,

          max_values: 1,

          options,
        },
      ],
    },
  ];
}

// ============================================================
// SHOW ROUTES
// ============================================================

async function showRoutes(
  interaction,
  lineCode,
  language,
  env
) {
  const line =
    findLineByCode(
      lineCode
    );

  const lineId =
    line?.LineID ||
    lineCode;

  try {
    console.log(
      `🚌 Selected line: ${lineId}`
    );

    console.log(
      `🔢 LineCode: ${lineCode}`
    );

    const routes =
      await getRoutes(
        lineCode
      );

    console.log(
      `✅ OASA returned ${routes.length} routes`
    );

    if (!routes.length) {
      await editOriginalResponse(
        env.APPLICATION_ID,
        interaction.token,
        env.DISCORD_TOKEN,
        {
          embeds: [
            {
              title:
                "⚠️ Δεν βρέθηκαν κατευθύνσεις",

              description:
                isEnglish(language)
                  ? `No directions were returned by OASA for line **${lineId}**.`
                  : `Η τηλεματική ΟΑΣΑ δεν επέστρεψε κατευθύνσεις για τη γραμμή **${lineId}**.`,

              fields: [
                {
                  name:
                    "LineCode",

                  value:
                    `\`${lineCode}\``,
                },
              ],
            },
          ],

          components: [],
        }
      );

      return;
    }

    await editOriginalResponse(
      env.APPLICATION_ID,
      interaction.token,
      env.DISCORD_TOKEN,
      {
        embeds: [
          {
            title:
              isEnglish(language)
                ? `🚌 Line ${lineId}`
                : `🚌 Γραμμή ${lineId}`,

            description:
              getLineName(
                line ||
                  {
                    LineID:
                      lineId,
                  },
                language
              ),

            fields: [
              {
                name:
                  isEnglish(language)
                    ? "Directions"
                    : "Κατευθύνσεις",

                value:
                  isEnglish(language)
                    ? "Choose the direction you want."
                    : "Επίλεξε την κατεύθυνση που θέλεις.",
              },

              {
                name:
                  "LineCode",

                value:
                  `\`${lineCode}\``,
              },

              {
                name:
                  "Πηγή",

                value:
                  "Τηλεματική ΟΑΣΑ",
              },
            ],
          },
        ],

        components:
          createRoutesComponents(
            routes,
            interaction.member?.user?.id ||
              interaction.user?.id ||
              "unknown",
            lineId,
            lineCode,
            language
          ),
      }
    );
  } catch (error) {
    console.error(
      "❌ SHOW ROUTES ERROR:",
      error
    );

    const errorMessage =
      error?.message ||
      String(error);

    await editOriginalResponse(
      env.APPLICATION_ID,
      interaction.token,
      env.DISCORD_TOKEN,
      {
        embeds: [
          {
            title:
              "❌ Σφάλμα τηλεματικής",

            description:
              isEnglish(language)
                ? `The directions for line **${lineId}** could not be retrieved.`
                : `Δεν ήταν δυνατή η ανάκτηση των κατευθύνσεων για τη γραμμή **${lineId}**.`,

            fields: [
              {
                name:
                  "Γραμμή",

                value:
                  `\`${lineId}\``,
              },

              {
                name:
                  "LineCode",

                value:
                  `\`${lineCode}\``,
              },

              {
                name:
                  "❌ Πραγματικό σφάλμα",

                value:
                  `\`\`\`\n${errorMessage.slice(
                    0,
                    1000
                  )}\n\`\`\``,
              },

              {
                name:
                  "Πηγή",

                value:
                  "Τηλεματική ΟΑΣΑ",
              },
            ],
          },
        ],

        components: [],
      }
    );
  }
}

// ============================================================
// HANDLE ROUTE SELECT
// ============================================================

async function handleRouteSelect(
  interaction,
  env
) {
  const customId =
    interaction.data?.custom_id ||
    "";

  const values =
    interaction.data?.values ||
    [];

  if (!values.length) {
    return json({
      type: 4,

      data: {
        content:
          "❌ Δεν επιλέχθηκε κατεύθυνση.",
      },
    });
  }

  const parts =
    customId.split(":");

  const userId =
    parts[1];

  const lineId =
    parts[2];

  const lineCode =
    parts[3];

  const language =
    parts[4] ||
    "el";

  const interactionUserId =
    interaction.member?.user?.id ||
    interaction.user?.id;

  if (
    userId !==
    interactionUserId
  ) {
    return json({
      type: 4,

      data: {
        content:
          isEnglish(language)
            ? "❌ This menu belongs to another user."
            : "❌ Αυτό το μενού ανήκει σε άλλον χρήστη.",

        flags: 64,
      },
    });
  }

  const routeCode =
    values[0];

  console.log(
    `🛣️ Selected route: ${routeCode}`
  );

  console.log(
    `🚌 LineCode: ${lineCode}`
  );

  return json({
    type: 4,

    data: {
      embeds: [
        {
          title:
            isEnglish(language)
              ? `🚌 Line ${lineId}`
              : `🚌 Γραμμή ${lineId}`,

          description:
            isEnglish(language)
              ? `Direction selected: **${routeCode}**`
              : `Επιλέχθηκε η κατεύθυνση: **${routeCode}**`,

          fields: [
            {
              name:
                "RouteCode",

              value:
                `\`${routeCode}\``,
            },

            {
              name:
                "LineCode",

              value:
                `\`${lineCode}\``,
            },

            {
              name:
                isEnglish(language)
                  ? "Next step"
                  : "Επόμενο βήμα",

              value:
                isEnglish(language)
                  ? "Stops will be added next."
                  : "Στο επόμενο βήμα θα προσθέσουμε τις στάσεις.",
            },
          ],
        },
      ],

      components: [],
    },
  });
}

// ============================================================
// REGISTER COMMANDS
// ============================================================

async function registerCommands(
  env
) {
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

  return await discordRequest(
    `/applications/${env.APPLICATION_ID}/commands`,
    "PUT",
    env.DISCORD_TOKEN,
    commands
  );
}

// ============================================================
// HANDLE SLASH COMMAND
// ============================================================

async function handleSlashCommand(
  interaction,
  env
) {
  const commandName =
    interaction.data?.name;

  const isGreek =
    commandName ===
    "αφίξεις";

  const isEnglishCommand =
    commandName ===
    "arrivals";

  if (
    !isGreek &&
    !isEnglishCommand
  ) {
    return json({
      type: 4,

      data: {
        content:
          "❌ Άγνωστη εντολή.",
      },
    });
  }

  const language =
    isGreek
      ? "el"
      : "en";

  const options =
    interaction.data?.options ||
    [];

  const selectedOption =
    options.find(
      (option) =>
        option.name ===
          "γραμμή" ||
        option.name ===
          "line"
    );

  const lineCode =
    selectedOption?.value;

  if (!lineCode) {
    return json({
      type: 4,

      data: {
        content:
          isEnglish(language)
            ? "❌ Please select a bus line."
            : "❌ Παρακαλώ επίλεξε γραμμή.",
      },
    });
  }

  console.log(
    `🚌 Slash command ${commandName}`
  );

  console.log(
    `🔢 Selected LineCode: ${lineCode}`
  );

  const line =
    findLineByCode(
      lineCode
    );

  if (!line) {
    return json({
      type: 4,

      data: {
        content:
          isEnglish(language)
            ? `❌ LineCode ${lineCode} was not found in the lines cache.`
            : `❌ Το LineCode ${lineCode} δεν βρέθηκε στο cache των γραμμών.`,
      },
    });
  }

  // Discord needs an immediate response.
  // We defer the response and continue the OASA request
  // in the background.
  const response =
    json({
      type:
        DEFERRED_CHANNEL_MESSAGE,
    });

  // Continue after the response.
  interaction.ctx?.waitUntil?.(
    showRoutes(
      interaction,
      lineCode,
      language,
      env
    )
  );

  return response;
}

// ============================================================
// TEST OASA
// ============================================================

async function handleTestOasa(
  request,
  env
) {
  const url =
    new URL(request.url);

  const lineCode =
    url.searchParams.get(
      "lineCode"
    ) ||
    "953";

  try {
    const started =
      Date.now();

    const routes =
      await getRoutes(
        lineCode
      );

    const elapsed =
      Date.now() -
      started;

    return json({
      success: true,

      lineCode,

      elapsedMs:
        elapsed,

      routeCount:
        routes.length,

      results:
        routes,
    });
  } catch (error) {
    return json(
      {
        success: false,

        lineCode,

        error:
          error?.message ||
          String(error),
      },

      500
    );
  }
}

// ============================================================
// REGISTER ENDPOINT
// ============================================================

async function handleRegister(
  request,
  env
) {
  const url =
    new URL(request.url);

  const queryKey =
    url.searchParams.get(
      "key"
    );

  const headerKey =
    request.headers.get(
      "X-Register-Key"
    );

  const suppliedKey =
    headerKey ||
    queryKey;

  if (
    !env.REGISTER_KEY
  ) {
    return json(
      {
        success: false,

        error:
          "REGISTER_KEY is not configured.",
      },
      500
    );
  }

  if (
    !suppliedKey ||
    suppliedKey !==
      env.REGISTER_KEY
  ) {
    return json(
      {
        success: false,

        error:
          "Unauthorized.",
      },
      401
    );
  }

  try {
    const commands =
      await registerCommands(
        env
      );

    return json({
      success: true,

      message:
        "Discord commands registered successfully.",

      commands,
    });
  } catch (error) {
    console.error(
      "❌ REGISTER ERROR:",
      error
    );

    return json(
      {
        success: false,

        error:
          error?.message ||
          String(error),
      },
      500
    );
  }
}

// ============================================================
// MAIN WORKER
// ============================================================

export default {
  async fetch(
    request,
    env,
    ctx
  ) {
    const url =
      new URL(request.url);

    // --------------------------------------------------------
    // BASIC HEALTH CHECK
    // --------------------------------------------------------

    if (
      request.method ===
        "GET" &&
      url.pathname ===
        "/"
    ) {
      return text(
        "🚌 Πού είναι το λεωφορείο μου; — Discord Worker OK"
      );
    }

    // --------------------------------------------------------
    // TEST OASA
    // --------------------------------------------------------

    if (
      request.method ===
        "GET" &&
      url.pathname ===
        "/test-oasa"
    ) {
      return handleTestOasa(
        request,
        env
      );
    }

    // --------------------------------------------------------
    // REGISTER COMMANDS
    // --------------------------------------------------------

    if (
      request.method ===
        "GET" &&
      url.pathname ===
        "/register"
    ) {
      return handleRegister(
        request,
        env
      );
    }

    if (
      request.method ===
        "POST" &&
      url.pathname ===
        "/register"
    ) {
      return handleRegister(
        request,
        env
      );
    }

    // --------------------------------------------------------
    // DISCORD INTERACTIONS
    // --------------------------------------------------------

    if (
      request.method !==
      "POST"
    ) {
      return text(
        "Method Not Allowed",
        405
      );
    }

    const body =
      await request.text();

    // --------------------------------------------------------
    // VERIFY DISCORD REQUEST
    // --------------------------------------------------------

    const valid =
      await verifyDiscordRequest(
        request,
        body,
        env.DISCORD_PUBLIC_KEY
      );

    if (!valid) {
      console.warn(
        "❌ Invalid Discord signature."
      );

      return text(
        "Bad request signature.",
        401
      );
    }

    let interaction;

    try {
      interaction =
        JSON.parse(
          body
        );
    } catch {
      return text(
        "Invalid JSON.",
        400
      );
    }

    // Give ctx to interaction so the
    // command handler can use waitUntil.
    interaction.ctx =
      ctx;

    console.log(
      `📨 Discord interaction type: ${interaction.type}`
    );

    // --------------------------------------------------------
    // PING
    // --------------------------------------------------------

    if (
      interaction.type ===
      1
    ) {
      return json({
        type: 1,
      });
    }

    // --------------------------------------------------------
    // AUTOCOMPLETE
    // --------------------------------------------------------

    if (
      interaction.type ===
      APPLICATION_COMMAND_AUTOCOMPLETE
    ) {
      return handleAutocomplete(
        interaction
      );
    }

    // --------------------------------------------------------
    // SLASH COMMAND
    // --------------------------------------------------------

    if (
      interaction.type ===
      APPLICATION_COMMAND
    ) {
      return handleSlashCommand(
        interaction,
        env
      );
    }

    // --------------------------------------------------------
    // COMPONENT
    // --------------------------------------------------------

    if (
      interaction.type ===
      MESSAGE_COMPONENT
    ) {
      const customId =
        interaction.data?.custom_id ||
        "";

      if (
        customId.startsWith(
          "route:"
        )
      ) {
        return handleRouteSelect(
          interaction,
          env
        );
      }
    }

    // --------------------------------------------------------
    // UNKNOWN INTERACTION
    // --------------------------------------------------------

    return json({
      type: 4,

      data: {
        content:
          "❌ Μη υποστηριζόμενος τύπος interaction.",
      },
    });
  },
};
