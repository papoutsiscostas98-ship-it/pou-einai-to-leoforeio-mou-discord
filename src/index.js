const DISCORD_API = "https://discord.com/api/v10";
const OASA_API = "https://telematics.oasa.gr/api/";

const COMMANDS = [
  {
    name: "αφίξεις",
    description: "Δες τις επόμενες αφίξεις λεωφορείων σε στάση.",
    type: 1,
    options: [
      {
        type: 3,
        name: "γραμμή",
        description: "Αριθμός γραμμής",
        required: true,
        autocomplete: true,
      },
      {
        type: 3,
        name: "κατεύθυνση",
        description: "Κατεύθυνση γραμμής",
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
        description: "Bus line number",
        required: true,
        autocomplete: true,
      },
      {
        type: 3,
        name: "direction",
        description: "Bus direction",
        required: true,
        autocomplete: true,
      },
    ],
  },
];

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
    console.error("Discord signature verification error:", error);
    return false;
  }
}

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);

  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }

  return bytes;
}

/* =========================================================
   GENERIC JSON RESPONSE
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
   OASA
========================================================= */

async function fetchOasaJson(url) {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "User-Agent": "PapoutsisDigital-BusApp-Discord/1.0",
      "Accept": "application/json, text/plain, */*",
    },
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `OASA HTTP ${response.status}: ${text.slice(0, 300)}`
    );
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(
      `OASA returned invalid JSON: ${text.slice(0, 300)}`
    );
  }
}

/* =========================================================
   LINES
========================================================= */

async function getLines() {
  const data = await fetchOasaJson(
    `${OASA_API}?act=webGetLines`
  );

  if (!Array.isArray(data)) {
    throw new Error("OASA lines response is not an array");
  }

  return data;
}

/* =========================================================
   ROUTES
========================================================= */

async function getRoutes(lineCode) {
  const data = await fetchOasaJson(
    `${OASA_API}?act=webGetRoutes&p1=${encodeURIComponent(lineCode)}`
  );

  if (!Array.isArray(data)) {
    throw new Error("OASA routes response is not an array");
  }

  return data;
}

/* =========================================================
   LINE AUTOCOMPLETE
========================================================= */

async function handleLineAutocomplete(interaction, option) {
  const search = String(option.value || "")
    .trim()
    .toLocaleLowerCase("el-GR");

  try {
    const lines = await getLines();

    const results = lines
      .filter((line) => {
        const id = String(line.LineID || "");
        const descr = String(line.LineDescr || "");
        const descrEng = String(line.LineDescrEng || "");

        return (
          id.toLocaleLowerCase("el-GR").includes(search) ||
          descr.toLocaleLowerCase("el-GR").includes(search) ||
          descrEng.toLocaleLowerCase("el-GR").includes(search)
        );
      })
      .slice(0, 25)
      .map((line) => {
        const id = String(line.LineID || "");
        const descr = String(line.LineDescr || "");

        let name = `${id} - ${descr}`;

        if (name.length > 100) {
          name = name.substring(0, 100);
        }

        return {
          name,
          value: String(line.LineCode),
        };
      });

    return json({
      type: 8,
      data: {
        choices: results,
      },
    });
  } catch (error) {
    console.error("LINE AUTOCOMPLETE ERROR:", error);

    /*
     * ΠΟΛΥ ΣΗΜΑΝΤΙΚΟ:
     * Ακόμα και αν η τηλεματική αποτύχει προσωρινά,
     * το Discord πρέπει να πάρει έγκυρη autocomplete απάντηση.
     */

    return json({
      type: 8,
      data: {
        choices: [],
      },
    });
  }
}

/* =========================================================
   DIRECTION AUTOCOMPLETE
========================================================= */

async function handleDirectionAutocomplete(interaction, option) {
  const search = String(option.value || "")
    .trim()
    .toLocaleLowerCase("el-GR");

  const options = interaction.data?.options || [];

  const lineOption = options.find(
    (item) =>
      item.name === "γραμμή" ||
      item.name === "line"
  );

  const lineCode = lineOption
    ? String(lineOption.value || "")
    : "";

  /*
   * Αν ο χρήστης δεν έχει επιλέξει ακόμα γραμμή,
   * δεν προσπαθούμε να καλέσουμε την τηλεματική.
   */
  if (!lineCode) {
    return json({
      type: 8,
      data: {
        choices: [],
      },
    });
  }

  try {
    const routes = await getRoutes(lineCode);

    const results = routes
      .filter((route) => {
        const descr = String(route.RouteDescr || "");
        const descrEng = String(route.RouteDescrEng || "");

        return (
          descr.toLocaleLowerCase("el-GR").includes(search) ||
          descrEng.toLocaleLowerCase("el-GR").includes(search)
        );
      })
      .slice(0, 25)
      .map((route) => {
        let name = String(route.RouteDescr || "");

        if (!name) {
          name = String(route.RouteDescrEng || "");
        }

        if (name.length > 100) {
          name = name.substring(0, 100);
        }

        return {
          name,
          value: String(route.RouteCode),
        };
      });

    return json({
      type: 8,
      data: {
        choices: results,
      },
    });
  } catch (error) {
    console.error("DIRECTION AUTOCOMPLETE ERROR:", error);

    return json({
      type: 8,
      data: {
        choices: [],
      },
    });
  }
}

/* =========================================================
   /REGISTER
========================================================= */

async function registerCommands(env) {
  if (!env.DISCORD_TOKEN) {
    throw new Error("Missing DISCORD_TOKEN");
  }

  if (!env.APPLICATION_ID) {
    throw new Error("Missing APPLICATION_ID");
  }

  const response = await fetch(
    `${DISCORD_API}/applications/${env.APPLICATION_ID}/commands`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bot ${env.DISCORD_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(COMMANDS),
    }
  );

  const text = await response.text();

  return new Response(text, {
    status: response.status,
    headers: {
      "Content-Type":
        response.headers.get("Content-Type") ||
        "application/json; charset=UTF-8",
    },
  });
}

/* =========================================================
   TEST OASA
========================================================= */

async function testOasa() {
  const started = Date.now();

  try {
    const response = await fetch(
      `${OASA_API}?act=webGetLines`,
      {
        headers: {
          "User-Agent": "PapoutsisDigital-BusApp-Discord/1.0",
          "Accept": "application/json, text/plain, */*",
        },
      }
    );

    const body = await response.text();

    return json({
      success: response.ok,
      status: response.status,
      statusText: response.statusText,
      elapsedMs: Date.now() - started,
      contentType: response.headers.get("Content-Type"),
      bodyLength: body.length,
      bodyPreview: body.substring(0, 1000),
    });
  } catch (error) {
    return json({
      success: false,
      elapsedMs: Date.now() - started,
      error: String(error),
    });
  }
}

/* =========================================================
   MAIN WORKER
========================================================= */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    /* -----------------------------------------------------
       GET
    ----------------------------------------------------- */

    if (request.method === "GET") {
      if (url.pathname === "/test-oasa") {
        return json({
          success: false,
          error: "Use POST /test-oasa",
        });
      }

      return new Response(
        "Papoutsis Digital Discord Bot Worker is running.",
        {
          status: 200,
          headers: {
            "Content-Type": "text/plain; charset=UTF-8",
          },
        }
      );
    }

    /* -----------------------------------------------------
       TEST OASA
    ----------------------------------------------------- */

    if (
      request.method === "POST" &&
      url.pathname === "/test-oasa"
    ) {
      const key = request.headers.get("X-Register-Key");

      if (!env.REGISTER_KEY || key !== env.REGISTER_KEY) {
        return json(
          {
            success: false,
            error: "Unauthorized",
          },
          401
        );
      }

      return testOasa();
    }

    /* -----------------------------------------------------
       REGISTER
    ----------------------------------------------------- */

    if (
      request.method === "POST" &&
      url.pathname === "/register"
    ) {
      const key = request.headers.get("X-Register-Key");

      if (!env.REGISTER_KEY || key !== env.REGISTER_KEY) {
        return json(
          {
            success: false,
            error: "Unauthorized",
          },
          401
        );
      }

      try {
        return await registerCommands(env);
      } catch (error) {
        console.error("REGISTER ERROR:", error);

        return json(
          {
            success: false,
            error: String(error),
          },
          500
        );
      }
    }

    /* -----------------------------------------------------
       DISCORD INTERACTIONS
    ----------------------------------------------------- */

    if (
      request.method === "POST" &&
      url.pathname === "/"
    ) {
      const body = await request.text();

      const valid = await verifyDiscordRequest(
        request,
        body,
        env.DISCORD_PUBLIC_KEY
      );

      if (!valid) {
        return new Response("Invalid request signature.", {
          status: 401,
        });
      }

      let interaction;

      try {
        interaction = JSON.parse(body);
      } catch (error) {
        return new Response("Invalid JSON.", {
          status: 400,
        });
      }

      /* ---------------------------------------------------
         PING
      --------------------------------------------------- */

      if (interaction.type === 1) {
        return json({
          type: 1,
        });
      }

      /* ---------------------------------------------------
         AUTOCOMPLETE
      --------------------------------------------------- */

      if (interaction.type === 4) {
        const options = interaction.data?.options || [];

        const focusedOption = options.find(
          (option) => option.focused === true
        );

        if (!focusedOption) {
          return json({
            type: 8,
            data: {
              choices: [],
            },
          });
        }

        if (
          focusedOption.name === "γραμμή" ||
          focusedOption.name === "line"
        ) {
          return handleLineAutocomplete(
            interaction,
            focusedOption
          );
        }

        if (
          focusedOption.name === "κατεύθυνση" ||
          focusedOption.name === "direction"
        ) {
          return handleDirectionAutocomplete(
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

      /* ---------------------------------------------------
         SLASH COMMAND
      --------------------------------------------------- */

      if (interaction.type === 2) {
        const commandName = interaction.data?.name;

        const options = interaction.data?.options || [];

        const lineOption = options.find(
          (option) =>
            option.name === "γραμμή" ||
            option.name === "line"
        );

        const directionOption = options.find(
          (option) =>
            option.name === "κατεύθυνση" ||
            option.name === "direction"
        );

        const lineCode = lineOption?.value || "";
        const routeCode = directionOption?.value || "";

        return json({
          type: 4,
          data: {
            content:
              `🚌 **Γραμμή:** ${lineCode || "—"}\n` +
              `🧭 **RouteCode:** ${routeCode || "—"}\n\n` +
              `Η γραμμή και η κατεύθυνση αναζητήθηκαν απευθείας από την τηλεματική του ΟΑΣΑ.\n\n` +
              `📍 Επόμενο βήμα: επιλογή στάσης και πραγματικές αφίξεις.`,
          },
        });
      }

      return json({
        type: 4,
        data: {
          content: "Άγνωστο interaction.",
        },
      });
    }

    return new Response("Not Found", {
      status: 404,
    });
  },
};
