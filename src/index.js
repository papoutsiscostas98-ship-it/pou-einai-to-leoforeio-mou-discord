const OASA_URL =
  "https://telematics.oasa.gr/api/?act=webGetLines";

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

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
    },
  });
}

function hexToUint8Array(hex) {
  const bytes = new Uint8Array(hex.length / 2);

  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }

  return bytes;
}

async function verifyDiscordRequest(request, env) {
  const signature = request.headers.get("X-Signature-Ed25519");
  const timestamp = request.headers.get("X-Signature-Timestamp");

  if (!signature || !timestamp || !env.DISCORD_PUBLIC_KEY) {
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
    console.error("Discord signature verification error:", error);
    return false;
  }
}

async function testOasa() {
  const started = Date.now();

  try {
    const response = await fetch(OASA_URL, {
      method: "GET",
      headers: {
        Accept: "application/json, text/plain, */*",
        "User-Agent": "Papoutsis-Digital-BusApp/1.0",
      },
    });

    const elapsed = Date.now() - started;
    const body = await response.text();

    return json({
      success: response.ok,
      status: response.status,
      statusText: response.statusText,
      elapsedMs: elapsed,
      contentType: response.headers.get("content-type"),
      bodyLength: body.length,
      bodyPreview: body.slice(0, 1000),
    });
  } catch (error) {
    const elapsed = Date.now() - started;

    return json(
      {
        success: false,
        elapsedMs: elapsed,
        error: error?.message || String(error),
        name: error?.name || null,
      },
      502
    );
  }
}

async function registerCommands(env) {
  if (!env.DISCORD_TOKEN) {
    throw new Error("Missing DISCORD_TOKEN");
  }

  if (!env.APPLICATION_ID) {
    throw new Error("Missing APPLICATION_ID");
  }

  const url =
    `https://discord.com/api/v10/applications/${env.APPLICATION_ID}/commands`;

  const response = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bot ${env.DISCORD_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(COMMANDS),
  });

  const text = await response.text();

  return new Response(text, {
    status: response.status,
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
    },
  });
}

async function getOasaLines() {
  const response = await fetch(OASA_URL, {
    method: "GET",
    headers: {
      Accept: "application/json, text/plain, */*",
      "User-Agent": "Papoutsis-Digital-BusApp/1.0",
    },
  });

  if (!response.ok) {
    throw new Error(
      `OASA HTTP ${response.status} ${response.statusText}`
    );
  }

  const data = await response.json();

  if (!Array.isArray(data)) {
    throw new Error("OASA returned non-array data");
  }

  return data;
}

function makeAutocompleteResponse(lines, query) {
  const search = String(query || "").trim().toLowerCase();

  const choices = lines
    .filter((line) => {
      const id = String(line.LineID ?? "").toLowerCase();
      const greek = String(line.LineDescr ?? "").toLowerCase();
      const english = String(line.LineDescrEng ?? "").toLowerCase();

      if (!search) return true;

      return (
        id.includes(search) ||
        greek.includes(search) ||
        english.includes(search)
      );
    })
    .slice(0, 25)
    .map((line) => {
      const id = String(line.LineID ?? "");
      const greek = String(line.LineDescr ?? "").trim();
      const english = String(line.LineDescrEng ?? "").trim();

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

async function handleInteraction(request, env) {
  const body = await request.json();

  // Discord PING
  if (body.type === 1) {
    return json({
      type: 1,
    });
  }

  // Autocomplete
  if (body.type === 4) {
    const option =
      body.data?.options?.find(
        (item) => item.focused === true
      );

    const query = option?.value || "";

    try {
      const lines = await getOasaLines();

      return makeAutocompleteResponse(lines, query);
    } catch (error) {
      console.error("OASA autocomplete error:", error);

      return json({
        type: 8,
        data: {
          choices: [],
        },
      });
    }
  }

  // Slash command
  if (body.type === 2) {
    const commandName = body.data?.name;

    if (
      commandName === "αφίξεις" ||
      commandName === "arrivals"
    ) {
      const option = body.data?.options?.[0];
      const line = option?.value || "";

      return json({
        type: 4,
        data: {
          content:
            `🚌 Επιλέχθηκε η γραμμή **${line}**.\n\n` +
            `Η σύνδεση με την τηλεματική του ΟΑΣΑ θα χρησιμοποιηθεί για την αναζήτηση διαδρομών, στάσεων και αφίξεων.`,
        },
      });
    }
  }

  return json({
    type: 4,
    data: {
      content: "Άγνωστη αλληλεπίδραση.",
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    /*
     * ---------------------------------------------------------
     * TEST OASA
     * ---------------------------------------------------------
     *
     * POST /test-oasa
     * Header:
     * X-Register-Key: <REGISTER_KEY>
     */

    if (url.pathname === "/test-oasa") {
      if (request.method !== "POST") {
        return json(
          {
            success: false,
            error: "Use POST /test-oasa",
          },
          405
        );
      }

      const registerKey =
        request.headers.get("X-Register-Key");

      if (
        !env.REGISTER_KEY ||
        registerKey !== env.REGISTER_KEY
      ) {
        return json(
          {
            success: false,
            error: "Unauthorized",
          },
          401
        );
      }

      return await testOasa();
    }

    /*
     * ---------------------------------------------------------
     * REGISTER DISCORD COMMANDS
     * ---------------------------------------------------------
     *
     * POST /register
     * Header:
     * X-Register-Key: <REGISTER_KEY>
     */

    if (url.pathname === "/register") {
      if (request.method !== "POST") {
        return json(
          {
            success: false,
            error: "Use POST /register",
          },
          405
        );
      }

      const registerKey =
        request.headers.get("X-Register-Key");

      if (
        !env.REGISTER_KEY ||
        registerKey !== env.REGISTER_KEY
      ) {
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
        return json(
          {
            success: false,
            error: error?.message || String(error),
          },
          500
        );
      }
    }

    /*
     * ---------------------------------------------------------
     * DISCORD INTERACTIONS
     * ---------------------------------------------------------
     */

    if (request.method === "POST") {
      const valid = await verifyDiscordRequest(
        request,
        env
      );

      if (!valid) {
        return json(
          {
            success: false,
            error: "Invalid Discord signature",
          },
          401
        );
      }

      return await handleInteraction(request, env);
    }

    /*
     * ---------------------------------------------------------
     * HOME
     * ---------------------------------------------------------
     */

    return json({
      success: true,
      name: "Πού είναι το λεωφορείο μου; - Discord Bot",
      status: "online",
      endpoints: {
        discord: "POST /",
        register: "POST /register",
        testOasa: "POST /test-oasa",
      },
    });
  },
};
