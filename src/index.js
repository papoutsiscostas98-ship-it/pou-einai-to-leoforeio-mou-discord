const OASA_LINES_URL =
  "https://telematics.oasa.gr/api/?act=webGetLines";

const CACHE_KEY_URL =
  "https://busappbotdiscord.papoutsiscostas98.gr/__cache/oasa-lines";

const CACHE_TTL = 300; // 5 λεπτά

const COMMANDS = [
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

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      ...extraHeaders,
    },
  });
}

function hexToUint8Array(hex) {
  const bytes = new Uint8Array(hex.length / 2);

  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(
      hex.slice(i * 2, i * 2 + 2),
      16
    );
  }

  return bytes;
}

async function verifyDiscordRequest(request, env) {
  const signature =
    request.headers.get("X-Signature-Ed25519");

  const timestamp =
    request.headers.get("X-Signature-Timestamp");

  if (
    !signature ||
    !timestamp ||
    !env.DISCORD_PUBLIC_KEY
  ) {
    return false;
  }

  const body = await request.clone().text();

  try {
    const publicKey = await crypto.subtle.importKey(
      "raw",
      hexToUint8Array(env.DISCORD_PUBLIC_KEY),
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
      hexToUint8Array(signature),
      new TextEncoder().encode(timestamp + body)
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
 * =========================================================
 * ΟΑΣΑ - ΓΡΑΜΜΕΣ ΜΕ CACHE
 * =========================================================
 */

async function getOasaLines(ctx) {
  const cache = caches.default;

  const cacheKey = new Request(
    CACHE_KEY_URL,
    {
      method: "GET",
    }
  );

  /*
   * 1. Προσπάθησε πρώτα να βρεις cached γραμμές.
   */

  const cachedResponse =
    await cache.match(cacheKey);

  if (cachedResponse) {
    console.log("OASA lines cache HIT");

    return await cachedResponse.json();
  }

  /*
   * 2. Δεν υπάρχει cache.
   *    Πάμε απευθείας στην τηλεματική ΟΑΣΑ.
   */

  console.log("OASA lines cache MISS");

  const started = Date.now();

  const response = await fetch(
    OASA_LINES_URL,
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

  const elapsed =
    Date.now() - started;

  console.log(
    `OASA response: ${response.status} in ${elapsed}ms`
  );

  if (!response.ok) {
    throw new Error(
      `OASA HTTP ${response.status} ${response.statusText}`
    );
  }

  const text =
    await response.text();

  let lines;

  try {
    lines = JSON.parse(text);
  } catch (error) {
    throw new Error(
      "OASA returned invalid JSON"
    );
  }

  if (!Array.isArray(lines)) {
    throw new Error(
      "OASA returned non-array data"
    );
  }

  /*
   * 3. Αποθήκευση των γραμμών στην Cloudflare cache.
   *
   *    5 λεπτά TTL.
   */

  const cacheResponse = new Response(
    JSON.stringify(lines),
    {
      status: 200,
      headers: {
        "Content-Type":
          "application/json; charset=UTF-8",
        "Cache-Control":
          `public, max-age=${CACHE_TTL}`,
      },
    }
  );

  ctx.waitUntil(
    cache.put(
      cacheKey,
      cacheResponse.clone()
    )
  );

  return lines;
}

/*
 * =========================================================
 * DISCORD AUTOCOMPLETE
 * =========================================================
 */

function makeAutocompleteResponse(
  lines,
  query
) {
  const search =
    String(query || "")
      .trim()
      .toLowerCase();

  const choices = lines
    .filter((line) => {
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

      if (!search) {
        return true;
      }

      return (
        id.includes(search) ||
        greek.includes(search) ||
        english.includes(search)
      );
    })
    .slice(0, 25)
    .map((line) => {
      const id =
        String(
          line.LineID ?? ""
        );

      const greek =
        String(
          line.LineDescr ?? ""
        ).trim();

      let label = id;

      if (greek) {
        label += ` - ${greek}`;
      }

      return {
        name: label.slice(0, 100),
        value: id.slice(0, 100),
      };
    });

  return json({
    type: 8,
    data: {
      choices,
    },
  });
}

/*
 * =========================================================
 * DISCORD COMMAND REGISTRATION
 * =========================================================
 */

async function registerCommands(env) {
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
    await fetch(url, {
      method: "PUT",

      headers: {
        Authorization:
          `Bot ${env.DISCORD_TOKEN}`,

        "Content-Type":
          "application/json",
      },

      body: JSON.stringify(
        COMMANDS
      ),
    });

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

/*
 * =========================================================
 * TEST OASA
 * =========================================================
 */

async function testOasa() {
  const started =
    Date.now();

  try {
    const response =
      await fetch(
        OASA_LINES_URL,
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

    const elapsed =
      Date.now() - started;

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
        elapsed,

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
          Date.now() - started,

        error:
          error?.message ||
          String(error),

        name:
          error?.name ||
          null,
      },
      502
    );
  }
}

/*
 * =========================================================
 * DISCORD INTERACTION
 * =========================================================
 */

async function handleInteraction(
  request,
  env,
  ctx
) {
  const body =
    await request.json();

  /*
   * Discord PING
   */

  if (body.type === 1) {
    return json({
      type: 1,
    });
  }

  /*
   * Autocomplete
   *
   * Discord interaction type 4
   */

  if (body.type === 4) {
    const option =
      body.data?.options?.find(
        (item) =>
          item.focused === true
      );

    const query =
      option?.value || "";

    try {
      const lines =
        await getOasaLines(ctx);

      return makeAutocompleteResponse(
        lines,
        query
      );
    } catch (error) {
      console.error(
        "OASA autocomplete error:",
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
   * Slash command
   */

  if (body.type === 2) {
    const commandName =
      body.data?.name;

    if (
      commandName === "αφίξεις" ||
      commandName === "arrivals"
    ) {
      const option =
        body.data?.options?.[0];

      const line =
        option?.value || "";

      return json({
        type: 4,

        data: {
          content:
            `🚌 Επιλέχθηκε η γραμμή **${line}**.\n\n` +
            `Η γραμμή αναζητήθηκε απευθείας από την τηλεματική του ΟΑΣΑ.`,
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

/*
 * =========================================================
 * WORKER
 * =========================================================
 */

export default {
  async fetch(request, env, ctx) {
    const url =
      new URL(request.url);

    /*
     * -----------------------------------------------------
     * TEST OASA
     * -----------------------------------------------------
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

      const registerKey =
        request.headers.get(
          "X-Register-Key"
        );

      if (
        !env.REGISTER_KEY ||
        registerKey !==
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
     * -----------------------------------------------------
     * REGISTER COMMANDS
     * -----------------------------------------------------
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

      const registerKey =
        request.headers.get(
          "X-Register-Key"
        );

      if (
        !env.REGISTER_KEY ||
        registerKey !==
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
     * -----------------------------------------------------
     * DISCORD
     * -----------------------------------------------------
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
     * -----------------------------------------------------
     * HOME
     * -----------------------------------------------------
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

      endpoints: {
        discord:
          "POST /",

        register:
          "POST /register",

        testOasa:
          "POST /test-oasa",
      },
    });
  },
};
