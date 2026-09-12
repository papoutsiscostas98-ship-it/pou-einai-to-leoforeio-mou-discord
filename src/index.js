import linesCacheData from "../lines-cache.json";

const DISCORD_API = "https://discord.com/api/v10";

const OASA_API =
  "https://telematics.oasa.gr/api/";

/* =========================================================
   DISCORD COMMAND
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
   DISCORD SIGNATURE
========================================================= */

function hexToBytes(hex) {
  const bytes =
    new Uint8Array(hex.length / 2);

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
      "Discord signature error:",
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
   * Υποστηρίζουμε και:
   *
   * [
   *   {...},
   *   {...}
   * ]
   *
   * αλλά και:
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
   OASA
========================================================= */

async function fetchOasaJson(url) {
  const response =
    await fetch(url, {
      method: "GET",

      headers: {
        "User-Agent":
          "PapoutsisDigital-DiscordBot/1.0",

        "Accept":
          "application/json, text/plain, */*",
      },
    });

  const text =
    await response.text();

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
      `OASA invalid JSON: ${text.slice(
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

  console.log(
    `🛰️ OASA routes request: ${url}`
  );

  const data =
    await fetchOasaJson(url);

  if (!Array.isArray(data)) {
    throw new Error(
      "OASA routes response is not an array."
    );
  }

  console.log(
    `🧭 OASA routes: ${data.length}`
  );

  return data;
}

/* =========================================================
   FIND LINE IN CACHE
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
  interaction,
  focusedOption
) {
  const focused =
    String(
      focusedOption?.value ?? ""
    )
      .trim()
      .toLocaleLowerCase("el-GR");

  try {
    const lines =
      getLinesFromCache();

    console.log(
      `📋 Lines cache: ${lines.length} γραμμές`
    );

    const filtered =
      lines
        .filter((line) => {
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
            id.includes(focused) ||
            greek.includes(focused) ||
            english.includes(focused)
          );
        })
        .slice(0, 25);

    const choices =
      filtered.map(
        (line) => {
          const id =
            getLineId(line);

          let name =
            `${id} — ${getLineGreek(
              line
            )}`;

          if (
            !getLineGreek(line)
          ) {
            name =
              `${id} — ${getLineEnglish(
                line
              )}`;
          }

          return {
            name:
              `🚌 ${name}`.slice(
                0,
                100
              ),

            /*
             * ΠΟΛΥ ΣΗΜΑΝΤΙΚΟ:
             *
             * Το Discord θα επιστρέψει
             * αυτό το value όταν ο
             * χρήστης επιλέξει τη γραμμή.
             *
             * Εμείς χρειαζόμαστε το
             * LineCode για την τηλεματική.
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
   CREATE DIRECTION MENU
========================================================= */

function createDirectionMenu(
  lineCode,
  routes
) {
  const options =
    routes
      .slice(0, 25)
      .map(
        (route) => {
          let label =
            getRouteGreek(route);

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
              getRouteCode(route),
          };
        }
      );

  return {
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
}

/* =========================================================
   SHOW ROUTES AFTER LINE SELECTION
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
     * ΕΔΩ χτυπάμε την τηλεματική.
     *
     * Όχι στο autocomplete.
     *
     * Μόλις ο χρήστης επιλέξει
     * γραμμή.
     */

    const routes =
      await getRoutes(
        lineCode
      );

    if (!routes.length) {
      return json({
        type: 4,

        data: {
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
        },
      });
    }

    const embed = {
      title:
        "🚌 Αφίξεις λεωφορείων",

      description:
        `Επίλεξε την κατεύθυνση για τη γραμμή **${lineId}**.`,

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

    const directionMenu =
      createDirectionMenu(
        lineCode,
        routes
      );

    return json({
      type: 4,

      data: {
        embeds: [
          embed,
        ],

        components: [
          directionMenu,
        ],
      },
    });
  } catch (error) {
    console.error(
      "❌ SHOW ROUTES ERROR:",
      error
    );

    return json({
      type: 4,

      data: {
        embeds: [
          {
            title:
              "❌ Σφάλμα τηλεματικής",

            description:
              `Δεν ήταν δυνατή η ανάκτηση των κατευθύνσεων για τη γραμμή **${lineId}**.`,

            fields: [
              {
                name:
                  "Πηγή",

                value:
                  "Τηλεματική ΟΑΣΑ",
              },
            ],
          },
        ],
      },
    });
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

  const lineCode =
    customId.startsWith(
      "direction:"
    )
      ? customId.substring(
          "direction:".length
        )
      : "";

  const routeCode =
    values[0] || "";

  if (
    !lineCode ||
    !routeCode
  ) {
    return json({
      type: 4,

      data: {
        content:
          "❌ Δεν ήταν δυνατή η αναγνώριση της επιλογής.",

        flags: 64,
      },
    });
  }

  try {
    const routes =
      await getRoutes(
        lineCode
      );

    const route =
      routes.find(
        (item) =>
          getRouteCode(item) ===
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
                  "Επιλογή στάσης.",
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
  } catch (error) {
    console.error(
      "❌ DIRECTION SELECT ERROR:",
      error
    );

    return json({
      type: 4,

      data: {
        embeds: [
          {
            title:
              "❌ Σφάλμα",

            description:
              "Δεν ήταν δυνατή η ανάκτηση της κατεύθυνσης από την τηλεματική του ΟΑΣΑ.",
          },
        ],
      },
    });
  }
}

/* =========================================================
   REGISTER COMMANDS
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
    env
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
            interaction,

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

          return showRoutes(
            interaction,

            lineCode
          );
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
