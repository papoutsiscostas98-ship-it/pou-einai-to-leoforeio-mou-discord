import linesCacheData from "../lines-cache.json";

const DISCORD_API = "https://discord.com/api/v10";

const OASA_API =
  "https://telematics.oasa.gr/api/";

/* =========================================================
   DISCORD COMMANDS
========================================================= */

const COMMANDS = [
  {
    name: "αφίξεις",

    description:
      "Δες τις επόμενες αφίξεις λεωφορείων σε στάση.",

    type: 1,

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

    type: 1,

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

/* =========================================================
   JSON RESPONSE
========================================================= */

function json(data, status = 200) {
  return new Response(
    JSON.stringify(data),
    {
      status,

      headers: {
        "Content-Type":
          "application/json; charset=UTF-8",
      },
    }
  );
}

/* =========================================================
   HEX → BYTES
========================================================= */

function hexToBytes(hex) {
  const bytes =
    new Uint8Array(
      hex.length / 2
    );

  for (
    let i = 0;
    i < bytes.length;
    i++
  ) {
    bytes[i] = parseInt(
      hex.substr(i * 2, 2),
      16
    );
  }

  return bytes;
}

/* =========================================================
   DISCORD SIGNATURE VERIFICATION
========================================================= */

async function verifyDiscordRequest(
  request,
  body,
  publicKey
) {
  const signature =
    request.headers.get(
      "X-Signature-Ed25519"
    );

  const timestamp =
    request.headers.get(
      "X-Signature-Timestamp"
    );

  if (
    !signature ||
    !timestamp ||
    !publicKey
  ) {
    return false;
  }

  try {
    const encoder =
      new TextEncoder();

    const publicKeyBytes =
      hexToBytes(publicKey);

    const signatureBytes =
      hexToBytes(signature);

    const key =
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
      "Ed25519",

      key,

      signatureBytes,

      encoder.encode(
        timestamp + body
      )
    );
  } catch (error) {
    console.error(
      "❌ Discord signature error:",
      error
    );

    return false;
  }
}

/* =========================================================
   LINES CACHE
========================================================= */

function getLinesFromCache() {
  /*
   * Υποστηρίζει:
   *
   * [
   *   {...},
   *   {...}
   * ]
   *
   * ή:
   *
   * {
   *   "results": [...]
   * }
   */

  if (
    Array.isArray(
      linesCacheData
    )
  ) {
    return linesCacheData;
  }

  if (
    Array.isArray(
      linesCacheData?.results
    )
  ) {
    return linesCacheData.results;
  }

  return [];
}

/* =========================================================
   LINE HELPERS
========================================================= */

function getLineId(line) {
  return String(
    line?.LineID ?? ""
  );
}

function getLineCode(line) {
  return String(
    line?.LineCode ?? ""
  );
}

function getLineGreek(line) {
  return String(
    line?.LineDescr ?? ""
  );
}

function getLineEnglish(line) {
  return String(
    line?.LineDescrEng ?? ""
  );
}

/* =========================================================
   ROUTE HELPERS
========================================================= */

function getRouteCode(route) {
  return String(
    route?.RouteCode ?? ""
  );
}

function getRouteGreek(route) {
  return String(
    route?.RouteDescr ?? ""
  );
}

function getRouteEnglish(route) {
  return String(
    route?.RouteDescrEng ?? ""
  );
}

/* =========================================================
   OASA FETCH
========================================================= */

async function fetchOasaJson(url) {
  console.log(
    `🛰️ OASA request: ${url}`
  );

  const started =
    Date.now();

  const response =
    await fetch(
      url,
      {
        method: "GET",

        headers: {
          "User-Agent":
            "PapoutsisDigital-DiscordBot/1.0",

          "Accept":
            "application/json, text/plain, */*",
        },
      }
    );

  const text =
    await response.text();

  console.log(
    `🛰️ OASA response: ${response.status} (${Date.now() - started}ms)`
  );

  if (!response.ok) {
    throw new Error(
      `OASA HTTP ${response.status}: ${text.slice(
        0,
        500
      )}`
    );
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(
      `OASA returned invalid JSON: ${text.slice(
        0,
        500
      )}`
    );
  }
}

/* =========================================================
   GET ROUTES DIRECTLY FROM OASA
========================================================= */

async function getRoutes(lineCode) {
  const url =
    `${OASA_API}?act=webGetRoutes&p1=${encodeURIComponent(
      lineCode
    )}`;

  const data =
    await fetchOasaJson(url);

  if (
    !Array.isArray(data)
  ) {
    throw new Error(
      "OASA routes response is not an array."
    );
  }

  return data;
}

/* =========================================================
   FIND LINE
========================================================= */

function findLine(lineCode) {
  const lines =
    getLinesFromCache();

  return (
    lines.find(
      (line) =>
        getLineCode(line) ===
        String(lineCode)
    ) || null
  );
}

/* =========================================================
   LINE AUTOCOMPLETE
========================================================= */

async function handleLineAutocomplete(
  focusedOption
) {
  const focused =
    String(
      focusedOption?.value ?? ""
    )
      .trim()
      .toLocaleLowerCase(
        "el-GR"
      );

  try {
    /*
     * Εδώ ΔΕΝ γίνεται καμία
     * κλήση στην τηλεματική.
     *
     * Χρησιμοποιούμε αποκλειστικά
     * το lines-cache.json.
     */

    const lines =
      getLinesFromCache();

    console.log(
      `📋 Lines cache: ${lines.length} γραμμές`
    );

    const filtered =
      lines
        .filter(
          (line) => {
            const id =
              getLineId(line)
                .toLocaleLowerCase(
                  "el-GR"
                );

            const greek =
              getLineGreek(line)
                .toLocaleLowerCase(
                  "el-GR"
                );

            const english =
              getLineEnglish(line)
                .toLocaleLowerCase(
                  "el-GR"
                );

            return (
              id.includes(
                focused
              ) ||
              greek.includes(
                focused
              ) ||
              english.includes(
                focused
              )
            );
          }
        )
        .slice(0, 25);

    const choices =
      filtered.map(
        (line) => {
          const id =
            getLineId(line);

          const greek =
            getLineGreek(line);

          const english =
            getLineEnglish(line);

          const description =
            greek ||
            english ||
            "Γραμμή λεωφορείου";

          return {
            name:
              `🚌 ${id} — ${description}`
                .slice(
                  0,
                  100
                ),

            /*
             * Περνάμε το LineCode
             * στο Discord.
             *
             * Για την 304:
             *
             * LineID   = 304
             * LineCode = 953
             */

            value:
              getLineCode(line),
          };
        }
      );

    console.log(
      `🔎 Autocomplete "${focused}" → ${choices.length} αποτελέσματα`
    );

    return json({
      type: 8,

      data: {
        choices,
      },
    });
  } catch (error) {
    console.error(
      "❌ LINE AUTOCOMPLETE ERROR:",
      error
    );

    return json({
      type: 8,

      data: {
        choices: [],
      },
    });
  }
}

/* =========================================================
   DISCORD ORIGINAL RESPONSE EDIT
========================================================= */

async function editOriginalResponse(
  interaction,
  payload
) {
  const url =
    `${DISCORD_API}/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`;

  const response =
    await fetch(
      url,
      {
        method: "PATCH",

        headers: {
          "Content-Type":
            "application/json",
        },

        body:
          JSON.stringify(
            payload
          ),
      }
    );

  const text =
    await response.text();

  if (!response.ok) {
    throw new Error(
      `Discord edit response HTTP ${response.status}: ${text}`
    );
  }

  return text;
}

/* =========================================================
   SHOW ROUTES
========================================================= */

async function showRoutes(
  interaction,
  lineCode
) {
  const line =
    findLine(lineCode);

  const lineId =
    line
      ? getLineId(line)
      : lineCode;

  const lineDescription =
    line
      ? (
          getLineGreek(line) ||
          getLineEnglish(line)
        )
      : "Γραμμή λεωφορείου";

  try {
    /*
     * Εδώ πλέον ΔΕΝ προσπαθούμε να
     * κάνουμε την κλήση πριν απαντήσουμε
     * στο Discord.
     *
     * Η αρχική απάντηση γίνεται αμέσως
     * με DEFERRED CHANNEL MESSAGE.
     */

    const routes =
      await getRoutes(
        lineCode
      );

    if (
      !routes.length
    ) {
      return editOriginalResponse(
        interaction,
        {
          embeds: [
            {
              title:
                "🚌 Αφίξεις λεωφορείων",

              description:
                `Δεν βρέθηκαν διαθέσιμες κατευθύνσεις για τη γραμμή **${lineId}**.`,

              fields: [
                {
                  name:
                    "📍 Γραμμή",

                  value:
                    `**${lineId}** — ${lineDescription}`,
                },

                {
                  name:
                    "🛰️ Πηγή",

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

    const options =
      routes
        .slice(0, 25)
        .map(
          (route) => {
            let label =
              getRouteGreek(
                route
              );

            if (!label) {
              label =
                getRouteEnglish(
                  route
                );
            }

            if (!label) {
              label =
                `Route ${getRouteCode(
                  route
                )}`;
            }

            return {
              label:
                label.slice(
                  0,
                  100
                ),

              description:
                `RouteCode: ${getRouteCode(
                  route
                )}`.slice(
                  0,
                  100
                ),

              value:
                getRouteCode(
                  route
                ),
            };
          }
        );

    const embed = {
      title:
        "🚌 Αφίξεις λεωφορείων",

      description:
        `Επίλεξε την κατεύθυνση της γραμμής **${lineId}**.`,

      fields: [
        {
          name:
            "📍 Γραμμή",

          value:
            `**${lineId}** — ${lineDescription}`,
        },

        {
          name:
            "🧭 Κατευθύνσεις",

          value:
            `Βρέθηκαν **${routes.length}** διαθέσιμες κατευθύνσεις.`,
        },

        {
          name:
            "🛰️ Πηγή",

          value:
            "Τηλεματική ΟΑΣΑ",
        },
      ],

      footer: {
        text:
          "Πού είναι το λεωφορείο μου; • Papoutsis Digital",
      },
    };

    const selectMenu = {
      type: 1,

      components: [
        {
          type: 3,

          custom_id:
            `direction:${lineCode}`,

          placeholder:
            "🧭 Επίλεξε κατεύθυνση",

          min_values: 1,

          max_values: 1,

          options,
        },
      ],
    };

    return editOriginalResponse(
      interaction,
      {
        embeds: [
          embed,
        ],

        components: [
          selectMenu,
        ],
      }
    );
  } catch (error) {
    console.error(
      "❌ SHOW ROUTES ERROR:",
      error
    );

    return editOriginalResponse(
      interaction,
      {
        embeds: [
          {
            title:
              "❌ Σφάλμα τηλεματικής",

            description:
              `Δεν ήταν δυνατή η ανάκτηση των κατευθύνσεων για τη γραμμή **${lineId}**.`,

            fields: [
              {
                name:
                  "Γραμμή",

                value:
                  `**${lineId}** — ${lineDescription}`,
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

/* =========================================================
   DIRECTION SELECT
========================================================= */

async function handleDirectionSelect(
  interaction
) {
  const customId =
    String(
      interaction.data
        ?.custom_id || ""
    );

  const values =
    interaction.data
      ?.values || [];

  if (
    !customId.startsWith(
      "direction:"
    )
  ) {
    return json({
      type: 4,

      data: {
        content:
          "❌ Άγνωστο dropdown.",

        flags: 64,
      },
    });
  }

  const lineCode =
    customId.substring(
      "direction:".length
    );

  const routeCode =
    values[0] || "";

  if (!routeCode) {
    return json({
      type: 4,

      data: {
        content:
          "❌ Δεν επιλέχθηκε κατεύθυνση.",

        flags: 64,
      },
    });
  }

  /*
   * Για τώρα απαντάμε με το
   * επιλεγμένο RouteCode.
   *
   * Στο επόμενο βήμα εδώ
   * θα μπει το stops-cache.
   */

  const routes =
    await getRoutes(
      lineCode
    );

  const route =
    routes.find(
      (item) =>
        getRouteCode(
          item
        ) ===
        String(routeCode)
    );

  const line =
    findLine(lineCode);

  const lineId =
    line
      ? getLineId(line)
      : lineCode;

  const lineDescription =
    line
      ? (
          getLineGreek(line) ||
          getLineEnglish(line)
        )
      : "Γραμμή λεωφορείου";

  const routeDescription =
    route
      ? (
          getRouteGreek(route) ||
          getRouteEnglish(route)
        )
      : "Άγνωστη κατεύθυνση";

  return json({
    type: 4,

    data: {
      embeds: [
        {
          title:
            "🚌 Αφίξεις λεωφορείων",

          description:
            "Η κατεύθυνση επιλέχθηκε.",

          fields: [
            {
              name:
                "📍 Γραμμή",

              value:
                `**${lineId}** — ${lineDescription}`,
            },

            {
              name:
                "🧭 Κατεύθυνση",

              value:
                routeDescription,
            },

            {
              name:
                "🔢 RouteCode",

              value:
                `\`${routeCode}\``,
            },

            {
              name:
                "🛰️ Πηγή",

              value:
                "Τηλεματική ΟΑΣΑ",
            },

            {
              name:
                "📌 Επόμενο βήμα",

              value:
                "Θα ακολουθήσει επιλογή στάσης.",
            },
          ],

          footer: {
            text:
              "Πού είναι το λεωφορείο μου; • Papoutsis Digital",
          },
        },
      ],

      components: [],
    },
  });
}

/* =========================================================
   REGISTER
========================================================= */

async function registerCommands(
  env
) {
  if (
    !env.DISCORD_TOKEN
  ) {
    throw new Error(
      "Missing DISCORD_TOKEN"
    );
  }

  if (
    !env.APPLICATION_ID
  ) {
    throw new Error(
      "Missing APPLICATION_ID"
    );
  }

  const response =
    await fetch(
      `${DISCORD_API}/applications/${env.APPLICATION_ID}/commands`,

      {
        method: "PUT",

        headers: {
          Authorization:
            `Bot ${env.DISCORD_TOKEN}`,

          "Content-Type":
            "application/json",
        },

        body:
          JSON.stringify(
            COMMANDS
          ),
      }
    );

  const text =
    await response.text();

  return new Response(
    text,

    {
      status:
        response.status,

      headers: {
        "Content-Type":
          response.headers.get(
            "Content-Type"
          ) ||
          "application/json; charset=UTF-8",
      },
    }
  );
}

/* =========================================================
   TEST OASA
========================================================= */

async function testOasa() {
  const started =
    Date.now();

  try {
    const response =
      await fetch(
        `${OASA_API}?act=webGetLines`,
        {
          headers: {
            "User-Agent":
              "PapoutsisDigital-DiscordBot/1.0",

            "Accept":
              "application/json, text/plain, */*",
          },
        }
      );

    const body =
      await response.text();

    return json({
      success:
        response.ok,

      status:
        response.status,

      statusText:
        response.statusText,

      elapsedMs:
        Date.now() -
        started,

      contentType:
        response.headers.get(
          "Content-Type"
        ),

      bodyLength:
        body.length,

      bodyPreview:
        body.substring(
          0,
          1000
        ),
    });
  } catch (error) {
    return json({
      success: false,

      elapsedMs:
        Date.now() -
        started,

      error:
        String(error),
    });
  }
}

/* =========================================================
   MAIN WORKER
========================================================= */

export default {
  async fetch(
    request,
    env,
    ctx
  ) {
    const url =
      new URL(
        request.url
      );

    /* =====================================================
       GET
    ===================================================== */

    if (
      request.method ===
      "GET"
    ) {
      if (
        url.pathname ===
        "/test-oasa"
      ) {
        return json({
          success: false,

          error:
            "Use POST /test-oasa",
        });
      }

      return new Response(
        "Papoutsis Digital Discord Bot Worker is running.",

        {
          status: 200,

          headers: {
            "Content-Type":
              "text/plain; charset=UTF-8",
          },
        }
      );
    }

    /* =====================================================
       TEST OASA
    ===================================================== */

    if (
      request.method ===
        "POST" &&
      url.pathname ===
        "/test-oasa"
    ) {
      const key =
        request.headers.get(
          "X-Register-Key"
        );

      if (
        !env.REGISTER_KEY ||
        key !==
          env.REGISTER_KEY
      ) {
        return json(
          {
            success: false,

            error:
              "Unauthorized",
          },

          401
        );
      }

      return testOasa();
    }

    /* =====================================================
       REGISTER
    ===================================================== */

    if (
      request.method ===
        "POST" &&
      url.pathname ===
        "/register"
    ) {
      const key =
        request.headers.get(
          "X-Register-Key"
        );

      if (
        !env.REGISTER_KEY ||
        key !==
          env.REGISTER_KEY
      ) {
        return json(
          {
            success: false,

            error:
              "Unauthorized",
          },

          401
        );
      }

      try {
        return await registerCommands(
          env
        );
      } catch (error) {
        console.error(
          "❌ REGISTER ERROR:",
          error
        );

        return json(
          {
            success: false,

            error:
              String(error),
          },

          500
        );
      }
    }

    /* =====================================================
       DISCORD
    ===================================================== */

    if (
      request.method ===
        "POST" &&
      url.pathname === "/"
    ) {
      const body =
        await request.text();

      const valid =
        await verifyDiscordRequest(
          request,

          body,

          env.DISCORD_PUBLIC_KEY
        );

      if (!valid) {
        return new Response(
          "Invalid request signature.",

          {
            status: 401,
          }
        );
      }

      let interaction;

      try {
        interaction =
          JSON.parse(body);
      } catch {
        return new Response(
          "Invalid JSON.",

          {
            status: 400,
          }
        );
      }

      /* ===================================================
         PING
      =================================================== */

      if (
        interaction.type === 1
      ) {
        return json({
          type: 1,
        });
      }

      /* ===================================================
         AUTOCOMPLETE
      =================================================== */

      if (
        interaction.type === 4
      ) {
        const options =
          interaction.data
            ?.options || [];

        const focusedOption =
          options.find(
            (option) =>
              option.focused ===
              true
          );

        if (
          !focusedOption
        ) {
          return json({
            type: 8,

            data: {
              choices: [],
            },
          });
        }

        if (
          focusedOption.name ===
            "γραμμή" ||
          focusedOption.name ===
            "line"
        ) {
          return handleLineAutocomplete(
            focusedOption
          );
        }

        return json({
          type: 8,

          data: {
            choices: [],
          },
        });
      }

      /* ===================================================
         SLASH COMMAND
      =================================================== */

      if (
        interaction.type === 2
      ) {
        const commandName =
          interaction.data
            ?.name;

        if (
          commandName ===
            "αφίξεις" ||
          commandName ===
            "arrivals"
        ) {
          const options =
            interaction.data
              ?.options || [];

          const lineOption =
            options.find(
              (option) =>
                option.name ===
                  "γραμμή" ||
                option.name ===
                  "line"
            );

          const lineCode =
            lineOption
              ?.value || "";

          if (!lineCode) {
            return json({
              type: 4,

              data: {
                content:
                  "❌ Δεν επιλέχθηκε γραμμή.",

                flags: 64,
              },
            });
          }

          /*
           * ΑΠΑΝΤΑΜΕ ΑΜΕΣΑ.
           *
           * Το Discord περιμένει το αρχικό
           * interaction response μέσα σε
           * συγκεκριμένο χρονικό όριο.
           *
           * Μετά το Worker θα κάνει
           * την κλήση στην τηλεματική
           * και θα κάνει PATCH το
           * original response.
           */

          ctx.waitUntil(
            showRoutes(
              interaction,

              lineCode
            )
          );

          return json({
            type: 5,
          });
        }
      }

      /* ===================================================
         SELECT MENU
      =================================================== */

      if (
        interaction.type === 3
      ) {
        const customId =
          interaction.data
            ?.custom_id || "";

        if (
          customId.startsWith(
            "direction:"
          )
        ) {
          return handleDirectionSelect(
            interaction
          );
        }

        return json({
          type: 4,

          data: {
            content:
              "❌ Άγνωστο dropdown.",

            flags: 64,
          },
        });
      }

      return json({
        type: 4,

        data: {
          content:
            "❌ Άγνωστο interaction.",

          flags: 64,
        },
      });
    }

    return new Response(
      "Not Found",

      {
        status: 404,
      }
    );
  },
};
