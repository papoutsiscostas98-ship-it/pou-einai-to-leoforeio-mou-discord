const DISCORD_API = "https://discord.com/api/v10";
const OASA_API = "https://telematics.oasa.gr/api/";

/* =========================================================
   DISCORD COMMANDS
========================================================= */

const COMMANDS = [
  {
    name: "αφίξεις",
    description: "Δες τις επόμενες αφίξεις λεωφορείων σε στάση.",
    type: 1,
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
    type: 1,
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

/* =========================================================
   JSON RESPONSE
========================================================= */

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      "Cache-Control": "no-store",
    },
  });
}

/* =========================================================
   HEX → BYTES
========================================================= */

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);

  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }

  return bytes;
}

/* =========================================================
   DISCORD SIGNATURE VERIFICATION
========================================================= */

async function verifyDiscordRequest(request, body, publicKey) {
  const signature = request.headers.get("X-Signature-Ed25519");
  const timestamp = request.headers.get("X-Signature-Timestamp");

  if (!signature || !timestamp || !publicKey) {
    return false;
  }

  try {
    const encoder = new TextEncoder();

    const publicKeyBytes = hexToBytes(publicKey);
    const signatureBytes = hexToBytes(signature);

    const key = await crypto.subtle.importKey(
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
      encoder.encode(timestamp + body)
    );
  } catch (error) {
    console.error(
      "DISCORD SIGNATURE ERROR:",
      error
    );

    return false;
  }
}

/* =========================================================
   OASA FETCH
========================================================= */

async function fetchOasaJson(url) {
  const response = await fetch(url, {
    method: "GET",

    headers: {
      "User-Agent":
        "PapoutsisDigital-BusApp-Discord/1.0",

      "Accept":
        "application/json, text/plain, */*",
    },
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `OASA HTTP ${response.status}: ${text.slice(
        0,
        300
      )}`
    );
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(
      `OASA returned invalid JSON: ${text.slice(
        0,
        300
      )}`
    );
  }
}

/* =========================================================
   OASA LINES
========================================================= */

async function getLines() {
  const data = await fetchOasaJson(
    `${OASA_API}?act=webGetLines`
  );

  if (!Array.isArray(data)) {
    throw new Error(
      "OASA lines response is not an array"
    );
  }

  return data;
}

/* =========================================================
   OASA ROUTES
========================================================= */

async function getRoutes(lineCode) {
  const data = await fetchOasaJson(
    `${OASA_API}?act=webGetRoutes&p1=${encodeURIComponent(
      lineCode
    )}`
  );

  if (!Array.isArray(data)) {
    throw new Error(
      "OASA routes response is not an array"
    );
  }

  return data;
}

/* =========================================================
   FIND LINE
========================================================= */

async function findLine(lineCode) {
  const lines = await getLines();

  return (
    lines.find(
      (line) =>
        String(line.LineCode) ===
        String(lineCode)
    ) || null
  );
}

/* =========================================================
   LINE AUTOCOMPLETE
========================================================= */

async function handleLineAutocomplete(
  interaction,
  option
) {
  const search = String(
    option.value || ""
  )
    .trim()
    .toLocaleLowerCase("el-GR");

  try {
    const lines = await getLines();

    const results = lines
      .filter((line) => {
        const id = String(
          line.LineID || ""
        );

        const descr = String(
          line.LineDescr || ""
        );

        const descrEng = String(
          line.LineDescrEng || ""
        );

        return (
          id
            .toLocaleLowerCase("el-GR")
            .includes(search) ||
          descr
            .toLocaleLowerCase("el-GR")
            .includes(search) ||
          descrEng
            .toLocaleLowerCase("el-GR")
            .includes(search)
        );
      })
      .slice(0, 25)
      .map((line) => {
        let name =
          `${line.LineID || ""} - ` +
          `${line.LineDescr || ""}`;

        if (name.length > 100) {
          name = name.substring(0, 100);
        }

        return {
          name,
          value: String(
            line.LineCode
          ),
        };
      });

    return json({
      type: 8,

      data: {
        choices: results,
      },
    });
  } catch (error) {
    console.error(
      "LINE AUTOCOMPLETE ERROR:",
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
   CREATE DIRECTION DROPDOWN
========================================================= */

async function createDirectionDropdown(
  lineCode
) {
  const routes = await getRoutes(lineCode);

  const options = routes
    .slice(0, 25)
    .map((route) => {
      let label =
        String(
          route.RouteDescr || ""
        );

      if (!label) {
        label =
          String(
            route.RouteDescrEng || ""
          );
      }

      if (label.length > 100) {
        label = label.substring(0, 100);
      }

      return {
        label,

        value: String(
          route.RouteCode
        ),

        description:
          route.RouteDescrEng
            ? String(
                route.RouteDescrEng
              ).substring(0, 100)
            : undefined,
      };
    });

  return options;
}

/* =========================================================
   SLASH COMMAND → SHOW EMBED + DROPDOWN
========================================================= */

async function handleArrivalsCommand(
  interaction
) {
  const commandName =
    interaction.data?.name;

  const options =
    interaction.data?.options || [];

  const lineOption =
    options.find(
      (option) =>
        option.name === "γραμμή" ||
        option.name === "line"
    );

  const lineCode =
    lineOption?.value || "";

  if (!lineCode) {
    return json({
      type: 4,

      data: {
        content:
          "❌ Δεν επιλέχθηκε γραμμή.",
        ephemeral: true,
      },
    });
  }

  try {
    /* ---------------------------------------------
       GET LINE
    --------------------------------------------- */

    const line =
      await findLine(lineCode);

    const lineId =
      line?.LineID ||
      lineCode;

    const lineDescription =
      line?.LineDescr ||
      "Γραμμή λεωφορείου";

    /* ---------------------------------------------
       GET ROUTES
    --------------------------------------------- */

    const directionOptions =
      await createDirectionDropdown(
        lineCode
      );

    if (
      directionOptions.length === 0
    ) {
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
                  name: "Γραμμή",
                  value:
                    `${lineId} — ${lineDescription}`,
                },
              ],
            },
          ],
        },
      });
    }

    /* ---------------------------------------------
       EMBED
    --------------------------------------------- */

    const embed = {
      title:
        "🚌 Αφίξεις λεωφορείων",

      description:
        `Επίλεξε την κατεύθυνση της γραμμής **${lineId}** για να συνεχίσεις.`,

      fields: [
        {
          name: "📍 Γραμμή",

          value:
            `**${lineId}** — ${lineDescription}`,
        },

        {
          name: "🛰️ Πηγή",

          value:
            "Τηλεματική ΟΑΣΑ",
        },
      ],

      footer: {
        text:
          "Πού είναι το λεωφορείο μου; • Papoutsis Digital",
      },
    };

    /* ---------------------------------------------
       SELECT MENU
    --------------------------------------------- */

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

          options:
            directionOptions,
        },
      ],
    };

    /* ---------------------------------------------
       DISCORD RESPONSE
    --------------------------------------------- */

    return json({
      type: 4,

      data: {
        embeds: [embed],

        components: [
          selectMenu,
        ],
      },
    });
  } catch (error) {
    console.error(
      "ARRIVALS COMMAND ERROR:",
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
              "Δεν ήταν δυνατή η ανάκτηση των κατευθύνσεων από την τηλεματική του ΟΑΣΑ.",
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
    interaction.data?.custom_id ||
    "";

  const selectedValues =
    interaction.data?.values || [];

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
        ephemeral: true,
      },
    });
  }

  const lineCode =
    customId.substring(
      "direction:".length
    );

  const routeCode =
    selectedValues[0];

  if (!routeCode) {
    return json({
      type: 4,

      data: {
        content:
          "❌ Δεν επιλέχθηκε κατεύθυνση.",
        ephemeral: true,
      },
    });
  }

  try {
    const routes =
      await getRoutes(lineCode);

    const route =
      routes.find(
        (item) =>
          String(
            item.RouteCode
          ) === String(routeCode)
      );

    const line =
      await findLine(lineCode);

    const lineId =
      line?.LineID ||
      lineCode;

    const lineDescription =
      line?.LineDescr ||
      "Γραμμή λεωφορείου";

    const routeDescription =
      route?.RouteDescr ||
      route?.RouteDescrEng ||
      "Άγνωστη κατεύθυνση";

    return json({
      type: 4,

      data: {
        embeds: [
          {
            title:
              "🚌 Αφίξεις λεωφορείων",

            description:
              `Η κατεύθυνση επιλέχθηκε επιτυχώς.`,

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
                  "Επιλογή στάσης και εμφάνιση πραγματικών αφίξεων.",
              },
            ],

            footer: {
              text:
                "Πού είναι το λεωφορείο μου; • Papoutsis Digital",
            },
          },
        ],
      },
    });
  } catch (error) {
    console.error(
      "DIRECTION SELECT ERROR:",
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
              "Δεν ήταν δυνατή η ανάκτηση της επιλεγμένης κατεύθυνσης.",
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
  if (!env.DISCORD_TOKEN) {
    throw new Error(
      "Missing DISCORD_TOKEN"
    );
  }

  if (!env.APPLICATION_ID) {
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
              "PapoutsisDigital-BusApp-Discord/1.0",

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

    /* ===============================================
       GET
    =============================================== */

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

    /* ===============================================
       TEST OASA
    =============================================== */

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

    /* ===============================================
       REGISTER
    =============================================== */

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
          "REGISTER ERROR:",
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

    /* ===============================================
       DISCORD INTERACTIONS
    =============================================== */

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

      /* =============================================
         PING
      ============================================= */

      if (
        interaction.type === 1
      ) {
        return json({
          type: 1,
        });
      }

      /* =============================================
         AUTOCOMPLETE
      ============================================= */

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

      /* =============================================
         SLASH COMMAND
      ============================================= */

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
          return handleArrivalsCommand(
            interaction
          );
        }

        return json({
          type: 4,

          data: {
            content:
              "❌ Άγνωστη εντολή.",
          },
        });
      }

      /* =============================================
         COMPONENT INTERACTION
      ============================================= */

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
              "❌ Άγνωστο component.",
            ephemeral: true,
          },
        });
      }

      return json({
        type: 4,

        data: {
          content:
            "❌ Άγνωστο interaction.",
          ephemeral: true,
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
