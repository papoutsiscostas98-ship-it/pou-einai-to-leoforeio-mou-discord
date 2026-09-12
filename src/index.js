const OASA_LINES_URL =
  "https://telematics.oasa.gr/api/?act=webGetLines";

const OASA_ROUTES_URL =
  "https://telematics.oasa.gr/api/?act=webGetRoutes&p1=";

const CACHE_TTL = 5 * 60 * 1000;

// =========================================================
// MEMORY CACHE
// =========================================================

let linesCache = null;
let linesCacheTime = 0;

const routesCache = new Map();


// =========================================================
// DISCORD COMMANDS
// =========================================================

const COMMANDS = [
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

      {
        type: 3,
        name: "κατεύθυνση",
        description:
          "Κατεύθυνση λεωφορείου",
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

      {
        type: 3,
        name: "direction",
        description:
          "Bus direction",
        required: true,
        autocomplete: true,
      },
    ],
  },
];


// =========================================================
// JSON RESPONSE
// =========================================================

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


// =========================================================
// DISCORD SIGNATURE
// =========================================================

function hexToUint8Array(hex) {
  const bytes =
    new Uint8Array(
      hex.length / 2
    );

  for (
    let i = 0;
    i < bytes.length;
    i++
  ) {
    bytes[i] =
      parseInt(
        hex.slice(
          i * 2,
          i * 2 + 2
        ),
        16
      );
  }

  return bytes;
}


async function verifyDiscordRequest(
  request,
  env
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
    !env.DISCORD_PUBLIC_KEY
  ) {
    return false;
  }

  const body =
    await request.clone().text();

  try {
    const publicKey =
      await crypto.subtle.importKey(
        "raw",

        hexToUint8Array(
          env.DISCORD_PUBLIC_KEY
        ),

        {
          name: "Ed25519",
          namedCurve: "Ed25519",
        },

        false,

        ["verify"]
      );

    return await crypto.subtle.verify(
      "Ed25519",

      publicKey,

      hexToUint8Array(
        signature
      ),

      new TextEncoder().encode(
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


// =========================================================
// OASA FETCH
// =========================================================

async function fetchOasaJson(url) {
  const response =
    await fetch(
      url,
      {
        method: "GET",

        headers: {
          Accept:
            "application/json, text/plain, */*",

          "User-Agent":
            "Papoutsis-Digital-BusApp/1.0",
        },
      }
    );

  if (!response.ok) {
    throw new Error(
      `OASA HTTP ${response.status}`
    );
  }

  const text =
    await response.text();

  let data;

  try {
    data =
      JSON.parse(text);
  } catch {
    throw new Error(
      "OASA returned invalid JSON"
    );
  }

  if (!Array.isArray(data)) {
    throw new Error(
      "OASA returned non-array data"
    );
  }

  return data;
}


// =========================================================
// GET LINES
// =========================================================

async function getOasaLines(ctx) {
  const now =
    Date.now();

  // Fast memory cache
  if (
    linesCache &&
    now - linesCacheTime <
      CACHE_TTL
  ) {
    return linesCache;
  }

  /*
   * Αν υπάρχει παλιά cache,
   * τη χρησιμοποιούμε ΑΜΕΣΩΣ.
   *
   * Και ανανεώνουμε στο background.
   */

  if (linesCache) {
    ctx.waitUntil(
      refreshLines()
    );

    return linesCache;
  }

  /*
   * Πρώτη φορά:
   * πρέπει να πάρουμε τα δεδομένα.
   */

  const lines =
    await fetchOasaJson(
      OASA_LINES_URL
    );

  linesCache =
    lines;

  linesCacheTime =
    now;

  return lines;
}


// =========================================================
// REFRESH LINES
// =========================================================

async function refreshLines() {
  try {
    const lines =
      await fetchOasaJson(
        OASA_LINES_URL
      );

    linesCache =
      lines;

    linesCacheTime =
      Date.now();

    console.log(
      `OASA lines refreshed: ${lines.length}`
    );
  } catch (error) {
    console.error(
      "OASA lines refresh failed:",
      error
    );
  }
}


// =========================================================
// GET ROUTES
// =========================================================

async function getOasaRoutes(
  lineCode
) {
  const now =
    Date.now();

  const cached =
    routesCache.get(
      String(lineCode)
    );

  if (
    cached &&
    now - cached.time <
      CACHE_TTL
  ) {
    return cached.data;
  }

  const url =
    `${OASA_ROUTES_URL}${encodeURIComponent(
      lineCode
    )}`;

  const routes =
    await fetchOasaJson(
      url
    );

  routesCache.set(
    String(lineCode),
    {
      data: routes,
      time: now,
    }
  );

  return routes;
}


// =========================================================
// FIND LINE
// =========================================================

function findLine(
  lines,
  value
) {
  const wanted =
    String(
      value || ""
    ).trim();

  return lines.find(
    (line) =>
      String(
        line.LineID ?? ""
      ) === wanted
  );
}


// =========================================================
// LINE AUTOCOMPLETE
// =========================================================

function lineAutocomplete(
  lines,
  query
) {
  const search =
    String(
      query || ""
    )
      .trim()
      .toLowerCase();

  const choices =
    lines
      .filter(
        (line) => {
          const id =
            String(
              line.LineID ?? ""
            ).toLowerCase();

          const greek =
            String(
              line.LineDescr ?? ""
            ).toLowerCase();

          const english =
            String(
              line.LineDescrEng ?? ""
            ).toLowerCase();

          return (
            !search ||
            id.includes(search) ||
            greek.includes(search) ||
            english.includes(search)
          );
        }
      )

      .slice(0, 25)

      .map(
        (line) => {
          const id =
            String(
              line.LineID ?? ""
            );

          const description =
            String(
              line.LineDescr ?? ""
            ).trim();

          const label =
            description
              ? `${id} - ${description}`
              : id;

          return {
            name:
              label.slice(
                0,
                100
              ),

            value:
              id.slice(
                0,
                100
              ),
          };
        }
      );

  return json({
    type: 8,

    data: {
      choices,
    },
  });
}


// =========================================================
// DIRECTION AUTOCOMPLETE
// =========================================================

async function directionAutocomplete(
  lines,
  selectedLine,
  query
) {
  const line =
    findLine(
      lines,
      selectedLine
    );

  if (!line) {
    return json({
      type: 8,

      data: {
        choices: [],
      },
    });
  }

  const lineCode =
    String(
      line.LineCode ?? ""
    );

  if (!lineCode) {
    return json({
      type: 8,

      data: {
        choices: [],
      },
    });
  }

  const routes =
    await getOasaRoutes(
      lineCode
    );

  const search =
    String(
      query || ""
    )
      .trim()
      .toLowerCase();

  const choices =
    routes
      .filter(
        (route) => {
          const greek =
            String(
              route.RouteDescr ?? ""
            ).toLowerCase();

          const english =
            String(
              route.RouteDescrEng ?? ""
            ).toLowerCase();

          const code =
            String(
              route.RouteCode ?? ""
            ).toLowerCase();

          return (
            !search ||
            greek.includes(search) ||
            english.includes(search) ||
            code.includes(search)
          );
        }
      )

      .slice(0, 25)

      .map(
        (route) => {
          const code =
            String(
              route.RouteCode ?? ""
            );

          const description =
            String(
              route.RouteDescr ?? ""
            ).trim();

          const label =
            description ||
            `Διαδρομή ${code}`;

          return {
            name:
              label.slice(
                0,
                100
              ),

            value:
              code.slice(
                0,
                100
              ),
          };
        }
      );

  return json({
    type: 8,

    data: {
      choices,
    },
  });
}


// =========================================================
// REGISTER COMMANDS
// =========================================================

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

  const url =
    `https://discord.com/api/v10/applications/${env.APPLICATION_ID}/commands`;

  const response =
    await fetch(
      url,
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
          "application/json; charset=UTF-8",
      },
    }
  );
}


// =========================================================
// TEST OASA
// =========================================================

async function testOasa() {
  const started =
    Date.now();

  try {
    const response =
      await fetch(
        OASA_LINES_URL
      );

    const body =
      await response.text();

    return json({
      success:
        response.ok,

      status:
        response.status,

      elapsedMs:
        Date.now() -
        started,

      contentType:
        response.headers.get(
          "content-type"
        ),

      bodyLength:
        body.length,

      bodyPreview:
        body.slice(
          0,
          1000
        ),
    });
  } catch (error) {
    return json(
      {
        success:
          false,

        elapsedMs:
          Date.now() -
          started,

        error:
          error?.message ||
          String(error),
      },
      502
    );
  }
}


// =========================================================
// DISCORD INTERACTION
// =========================================================

async function handleInteraction(
  request,
  env,
  ctx
) {
  const body =
    await request.json();

  /*
   * PING
   */

  if (
    body.type === 1
  ) {
    return json({
      type: 1,
    });
  }


  /*
   * AUTOCOMPLETE
   */

  if (
    body.type === 4
  ) {
    const options =
      body.data?.options ||
      [];

    const focused =
      options.find(
        (option) =>
          option.focused === true
      );

    if (!focused) {
      return json({
        type: 8,

        data: {
          choices: [],
        },
      });
    }


    /*
     * -----------------------------------------------
     * ΓΡΑΜΜΗ
     * -----------------------------------------------
     */

    if (
      focused.name ===
      "γραμμή" ||
      focused.name ===
      "line"
    ) {
      try {
        const lines =
          await getOasaLines(
            ctx
          );

        return lineAutocomplete(
          lines,
          focused.value
        );
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


    /*
     * -----------------------------------------------
     * ΚΑΤΕΥΘΥΝΣΗ
     * -----------------------------------------------
     */

    if (
      focused.name ===
      "κατεύθυνση" ||
      focused.name ===
      "direction"
    ) {
      try {
        const lines =
          await getOasaLines(
            ctx
          );

        const lineOption =
          options.find(
            (option) =>
              option.name ===
                "γραμμή" ||
              option.name ===
                "line"
          );

        const selectedLine =
          lineOption?.value ||
          "";

        return await directionAutocomplete(
          lines,
          selectedLine,
          focused.value
        );
      } catch (error) {
        console.error(
          "DIRECTION AUTOCOMPLETE ERROR:",
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

    return json({
      type: 8,

      data: {
        choices: [],
      },
    });
  }


  /*
   * SLASH COMMAND
   */

  if (
    body.type === 2
  ) {
    const commandName =
      body.data?.name;

    if (
      commandName ===
        "αφίξεις" ||
      commandName ===
        "arrivals"
    ) {
      const options =
        body.data?.options ||
        [];

      const lineOption =
        options.find(
          (option) =>
            option.name ===
              "γραμμή" ||
            option.name ===
              "line"
        );

      const directionOption =
        options.find(
          (option) =>
            option.name ===
              "κατεύθυνση" ||
            option.name ===
              "direction"
        );

      const line =
        lineOption?.value ||
        "";

      const direction =
        directionOption?.value ||
        "";

      return json({
        type: 4,

        data: {
          content:
            `🚌 **Γραμμή:** ${line}\n` +
            `🧭 **RouteCode:** ${direction}\n\n` +
            `Η γραμμή και η κατεύθυνση αναζητήθηκαν απευθείας από την τηλεματική του ΟΑΣΑ.`,
        },
      });
    }
  }


  return json({
    type: 4,

    data: {
      content:
        "Άγνωστη αλληλεπίδραση.",
    },
  });
}


// =========================================================
// WORKER
// =========================================================

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


    /*
     * TEST OASA
     */

    if (
      url.pathname ===
      "/test-oasa"
    ) {
      if (
        request.method !==
        "POST"
      ) {
        return json(
          {
            success:
              false,

            error:
              "Use POST /test-oasa",
          },
          405
        );
      }

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
            success:
              false,

            error:
              "Unauthorized",
          },
          401
        );
      }

      return await testOasa();
    }


    /*
     * REGISTER
     */

    if (
      url.pathname ===
      "/register"
    ) {
      if (
        request.method !==
        "POST"
      ) {
        return json(
          {
            success:
              false,

            error:
              "Use POST /register",
          },
          405
        );
      }

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
            success:
              false,

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
        return json(
          {
            success:
              false,

            error:
              error?.message ||
              String(error),
          },
          500
        );
      }
    }


    /*
     * DISCORD
     */

    if (
      request.method ===
      "POST"
    ) {
      const valid =
        await verifyDiscordRequest(
          request,
          env
        );

      if (!valid) {
        return json(
          {
            success:
              false,

            error:
              "Invalid Discord signature",
          },
          401
        );
      }

      return await handleInteraction(
        request,
        env,
        ctx
      );
    }


    /*
     * HOME
     */

    return json({
      success:
        true,

      name:
        "Πού είναι το λεωφορείο μου; - Discord Bot",

      status:
        "online",

      source:
        "OASA Telematics",
    });
  },
};
