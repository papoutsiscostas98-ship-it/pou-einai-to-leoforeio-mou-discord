import linesCache from "./lines-cache.json" with { type: "json" };

// ============================================================
// CONFIG
// ============================================================

const BUSAPP_API =
  "https://busapp.papoutsiscostas98.gr/api";

const DISCORD_API =
  "https://discord.com/api/v10";

const STOPS_PER_PAGE = 25;

// ============================================================
// HELPERS
// ============================================================

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      "Cache-Control": "no-store",
    },
  });
}

function text(data, status = 200) {
  return new Response(data, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=UTF-8",
      "Cache-Control": "no-store",
    },
  });
}

function isEnglish(language) {
  return language === "en";
}

function getLineId(line) {
  return String(
    line?.LineID ??
      line?.lineId ??
      line?.id ??
      ""
  );
}

function getLineCode(line) {
  return String(
    line?.LineCode ??
      line?.lineCode ??
      ""
  );
}

function getLineGreek(line) {
  return String(
    line?.LineDescr ??
      line?.lineDescription ??
      line?.description ??
      ""
  );
}

function getLineEnglish(line) {
  return String(
    line?.LineDescrEng ??
      line?.lineDescriptionEng ??
      line?.descriptionEng ??
      ""
  );
}

function lineName(line, language) {
  if (isEnglish(language)) {
    return (
      getLineEnglish(line) ||
      getLineGreek(line) ||
      getLineId(line)
    );
  }

  return (
    getLineGreek(line) ||
    getLineEnglish(line) ||
    getLineId(line)
  );
}

function getRouteCode(route) {
  return String(
    route?.RouteCode ??
      route?.routeCode ??
      ""
  );
}

function getRouteGreek(route) {
  return String(
    route?.RouteDescr ??
      route?.routeDescription ??
      route?.description ??
      ""
  );
}

function getRouteEnglish(route) {
  return String(
    route?.RouteDescrEng ??
      route?.routeDescriptionEng ??
      route?.descriptionEng ??
      ""
  );
}

function routeName(route, language) {
  if (isEnglish(language)) {
    return (
      getRouteEnglish(route) ||
      getRouteGreek(route) ||
      getRouteCode(route)
    );
  }

  return (
    getRouteGreek(route) ||
    getRouteEnglish(route) ||
    getRouteCode(route)
  );
}

function getStopCode(stop) {
  return String(
    stop?.StopCode ??
      stop?.stopCode ??
      ""
  );
}

function getStopGreek(stop) {
  return String(
    stop?.StopDescr ??
      stop?.stopDescription ??
      stop?.description ??
      ""
  );
}

function getStopEnglish(stop) {
  return String(
    stop?.StopDescrEng ??
      stop?.stopDescriptionEng ??
      stop?.descriptionEng ??
      ""
  );
}

function stopName(stop, language) {
  if (isEnglish(language)) {
    return (
      getStopEnglish(stop) ||
      getStopGreek(stop) ||
      getStopCode(stop)
    );
  }

  return (
    getStopGreek(stop) ||
    getStopEnglish(stop) ||
    getStopCode(stop)
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

async function verifyDiscordSignature(
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

  if (!signature || !timestamp) {
    return false;
  }

  try {
    const key = await crypto.subtle.importKey(
      "raw",
      hexToUint8Array(publicKey),
      {
        name: "Ed25519",
      },
      false,
      ["verify"]
    );

    const message = new TextEncoder().encode(
      timestamp + body
    );

    return await crypto.subtle.verify(
      {
        name: "Ed25519",
      },
      key,
      hexToUint8Array(signature),
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
  options = {}
) {
  const response = await fetch(
    `${DISCORD_API}${path}`,
    {
      ...options,
      headers: {
        "Content-Type":
          "application/json",
        ...(options.headers || {}),
      },
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
    return JSON.parse(responseText);
  } catch {
    return responseText;
  }
}

// ============================================================
// BUSAPP API
// ============================================================

async function busAppFetch(
  endpoint,
  params = {}
) {
  const url =
    new URL(
      `${BUSAPP_API}${endpoint}`
    );

  for (
    const [key, value] of Object.entries(
      params
    )
  ) {
    if (
      value !== undefined &&
      value !== null &&
      value !== ""
    ) {
      url.searchParams.set(
        key,
        String(value)
      );
    }
  }

  console.log(
    `🌐 BusApp request: ${url.toString()}`
  );

  const response =
    await fetch(
      url.toString(),
      {
        method: "GET",
        headers: {
          Accept:
            "application/json",
          "User-Agent":
            "PapoutsisDigital-DiscordBot/2.0",
        },
      }
    );

  console.log(
    `📡 BusApp status: ${response.status}`
  );

  const responseText =
    await response.text();

  if (!response.ok) {
    throw new Error(
      `BusApp HTTP ${response.status}: ${responseText.slice(
        0,
        1000
      )}`
    );
  }

  let data;

  try {
    data =
      JSON.parse(responseText);
  } catch {
    throw new Error(
      `Το BusApp επέστρεψε μη έγκυρο JSON: ${responseText.slice(
        0,
        1000
      )}`
    );
  }

  if (
    data &&
    data.success === false
  ) {
    throw new Error(
      data.error ||
        "Το BusApp επέστρεψε αποτυχία."
    );
  }

  return data;
}

// ============================================================
// GET LINES
// ============================================================

function getLines() {
  return Array.isArray(linesCache)
    ? linesCache
    : [];
}

// ============================================================
// GET ROUTES
//
// ΣΗΜΑΝΤΙΚΟ:
// ΕΔΩ ΔΕΝ ΚΑΛΟΥΜΕ ΠΛΕΟΝ ΑΠΕΥΘΕΙΑΣ OASA.
//
// Discord Worker
//      ↓
// BusApp /api/routes
//      ↓
// OASA
// ============================================================

async function getRoutes(
  lineCode
) {
  console.log(
    `🚌 Αναζήτηση διαδρομών μέσω BusApp για LineCode ${lineCode}`
  );

  const data =
    await busAppFetch(
      "/routes",
      {
        lineCode,
      }
    );

  const routes =
    Array.isArray(
      data?.results
    )
      ? data.results
      : [];

  console.log(
    `✅ BusApp επέστρεψε ${routes.length} διαδρομές`
  );

  return routes;
}

// ============================================================
// GET STOPS
// ============================================================

async function getStops(
  routeCode
) {
  console.log(
    `🚏 Αναζήτηση στάσεων μέσω BusApp για RouteCode ${routeCode}`
  );

  const data =
    await busAppFetch(
      "/stops",
      {
        routeCode,
      }
    );

  const stops =
    Array.isArray(
      data?.results
    )
      ? data.results
      : [];

  console.log(
    `✅ BusApp επέστρεψε ${stops.length} στάσεις`
  );

  return stops;
}

// ============================================================
// GET ARRIVALS
// ============================================================

async function getArrivals(
  stopCode
) {
  console.log(
    `⏱️ Αναζήτηση αφίξεων μέσω BusApp για StopCode ${stopCode}`
  );

  const data =
    await busAppFetch(
      "/arrivals",
      {
        stopCode,
      }
    );

  const arrivals =
    Array.isArray(
      data?.results
    )
      ? data.results
      : [];

  return arrivals.map(
    (arrival) => ({
      ...arrival,

      routeCode:
        arrival.routeCode ??
        arrival.route_code ??
        "",

      vehicleCode:
        arrival.vehicleCode ??
        arrival.veh_code ??
        "",

      minutes:
        arrival.minutes ??
        arrival.btime2 ??
        null,

      lineCode:
        arrival.lineCode ??
        "",

      lineId:
        arrival.lineId ??
        "",

      lineDescription:
        arrival.lineDescription ??
        "",

      routeDescription:
        arrival.routeDescription ??
        "",
    })
  );
}

// ============================================================
// DISCORD INITIAL RESPONSES
// ============================================================

function pongResponse() {
  return json({
    type: 1,
  });
}

function messageResponse(
  content,
  options = {}
) {
  return json({
    type: 4,

    data: {
      content,

      ...(options.embeds
        ? {
            embeds:
              options.embeds,
          }
        : {}),

      ...(options.components
        ? {
            components:
              options.components,
          }
        : {}),
    },
  });
}

function deferredResponse() {
  return json({
    type: 5,
  });
}

function autocompleteResponse(
  choices
) {
  return json({
    type: 8,

    data: {
      choices: choices.slice(
        0,
        25
      ),
    },
  });
}

// ============================================================
// DISCORD ORIGINAL RESPONSE
// ============================================================

async function editOriginalResponse(
  interaction,
  payload
) {
  const applicationId =
    interaction.application_id;

  const token =
    interaction.token;

  return discordRequest(
    `/webhooks/${applicationId}/${token}/messages/@original`,
    {
      method: "PATCH",
      body: JSON.stringify(
        payload
      ),
    }
  );
}

// ============================================================
// EMBEDS
// ============================================================

function createErrorEmbed(
  title,
  description
) {
  return {
    title,
    description,
    color: 0xed4245,
  };
}

function createRoutesEmbed(
  line,
  routes,
  language
) {
  return {
    title: isEnglish(language)
      ? `🚌 Line ${getLineId(line)}`
      : `🚌 Γραμμή ${getLineId(line)}`,

    description:
      isEnglish(language)
        ? "Select a direction:"
        : "Επίλεξε διαδρομή:",

    color: 0x5865f2,

    fields: [
      {
        name: isEnglish(language)
          ? "Available directions"
          : "Διαθέσιμες διαδρομές",

        value:
          routes.length
            ? routes
                .map(
                  (route) =>
                    `🚌 ${routeName(
                      route,
                      language
                    )}`
                )
                .join("\n")
            : isEnglish(language)
            ? "No directions available."
            : "Δεν υπάρχουν διαθέσιμες διαδρομές.",
      },
    ],
  };
}

function createStopsEmbed(
  line,
  route,
  stops,
  page,
  totalPages,
  language
) {
  return {
    title: isEnglish(language)
      ? `🚌 Line ${getLineId(line)}`
      : `🚌 Γραμμή ${getLineId(line)}`,

    description:
      `**${routeName(
        route,
        language
      )}**\n\n` +
      (isEnglish(language)
        ? `Select a stop — page ${page}/${totalPages}`
        : `Επίλεξε στάση — σελίδα ${page}/${totalPages}`),

    color: 0x5865f2,

    fields: [
      {
        name: isEnglish(language)
          ? "Stops"
          : "Στάσεις",

        value:
          stops.length
            ? stops
                .map(
                  (stop) =>
                    `🚏 ${stopName(
                      stop,
                      language
                    )}`
                )
                .join("\n")
            : isEnglish(language)
            ? "No stops available."
            : "Δεν υπάρχουν διαθέσιμες στάσεις.",
      },
    ],
  };
}

// ============================================================
// COMPONENTS
// ============================================================

function routeSelectComponent(
  interaction,
  line,
  routes,
  language
) {
  const options =
    routes
      .slice(0, 25)
      .map(
        (route) => ({
          label:
            routeName(
              route,
              language
            ).slice(0, 100),

          value:
            JSON.stringify({
              lineId:
                getLineId(line),

              lineCode:
                getLineCode(line),

              routeCode:
                getRouteCode(route),

              language,
            }),
        })
      );

  return [
    {
      type: 1,

      components: [
        {
          type: 3,

          custom_id:
            `route:${interaction.id}`,

          placeholder:
            isEnglish(language)
              ? "Select a direction"
              : "Επίλεξε διαδρομή",

          options,
        },
      ],
    },
  ];
}

function stopSelectComponent(
  interaction,
  line,
  route,
  stops,
  page,
  totalPages,
  language
) {
  const options =
    stops
      .slice(
        page * STOPS_PER_PAGE,
        (page + 1) *
          STOPS_PER_PAGE
      )
      .map(
        (stop) => ({
          label:
            stopName(
              stop,
              language
            ).slice(0, 100),

          value:
            JSON.stringify({
              lineId:
                getLineId(line),

              lineCode:
                getLineCode(line),

              routeCode:
                getRouteCode(route),

              stopCode:
                getStopCode(stop),

              routeName:
                routeName(
                  route,
                  language
                ),

              stopName:
                stopName(
                  stop,
                  language
                ),

              language,
            }),
        })
      );

  const components = [];

  components.push({
    type: 1,

    components: [
      {
        type: 3,

        custom_id:
          `stop:${interaction.id}:${page}`,

        placeholder:
          isEnglish(language)
            ? "Select a stop"
            : "Επίλεξε στάση",

        options,
      },
    ],
  });

  const navigationButtons = [];

  if (page > 0) {
    navigationButtons.push({
      type: 2,

      style: 2,

      custom_id:
        `stoppage:${interaction.id}:${page - 1}`,

      label:
        isEnglish(language)
          ? "← Previous"
          : "← Προηγούμενη",
    });
  }

  if (
    page <
    totalPages - 1
  ) {
    navigationButtons.push({
      type: 2,

      style: 2,

      custom_id:
        `stoppage:${interaction.id}:${page + 1}`,

      label:
        isEnglish(language)
          ? "Next →"
          : "Επόμενη →",
    });
  }

  if (navigationButtons.length) {
    components.push({
      type: 1,
      components:
        navigationButtons,
    });
  }

  components.push({
    type: 1,

    components: [
      {
        type: 2,

        style: 2,

        custom_id:
          `backroutes:${interaction.id}`,

        label:
          isEnglish(language)
            ? "↩ Back to directions"
            : "↩ Πίσω στις διαδρομές",
      },
    ],
  });

  return components;
}

function arrivalsComponents(
  interaction,
  selected,
  language
) {
  return [
    {
      type: 1,

      components: [
        {
          type: 2,

          style: 1,

          custom_id:
            `refresh:${interaction.id}`,

          label:
            isEnglish(language)
              ? "🔄 Refresh"
              : "🔄 Ανανέωση",
        },
      ],
    },

    {
      type: 1,

      components: [
        {
          type: 2,

          style: 2,

          custom_id:
            `backstops:${interaction.id}`,

          label:
            isEnglish(language)
              ? "↩ Back to stops"
              : "↩ Πίσω στις στάσεις",
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
  line,
  language
) {
  const routes =
    await getRoutes(
      getLineCode(line)
    );

  if (!routes.length) {
    await editOriginalResponse(
      interaction,
      {
        embeds: [
          createErrorEmbed(
            isEnglish(language)
              ? "❌ No directions"
              : "❌ Δεν βρέθηκαν διαδρομές",

            isEnglish(language)
              ? `No directions were returned for line ${getLineId(
                  line
                )}.`
              : `Δεν επιστράφηκαν διαδρομές για τη γραμμή ${getLineId(
                  line
                )}.`
          ),
        ],

        components: [],
      }
    );

    return;
  }

  await editOriginalResponse(
    interaction,
    {
      embeds: [
        createRoutesEmbed(
          line,
          routes,
          language
        ),
      ],

      components:
        routeSelectComponent(
          interaction,
          line,
          routes,
          language
        ),
    }
  );
}

// ============================================================
// SHOW STOPS
// ============================================================

async function showStops(
  interaction,
  line,
  route,
  language,
  page = 0
) {
  const stops =
    await getStops(
      getRouteCode(route)
    );

  if (!stops.length) {
    await editOriginalResponse(
      interaction,
      {
        embeds: [
          createErrorEmbed(
            isEnglish(language)
              ? "❌ No stops"
              : "❌ Δεν βρέθηκαν στάσεις",

            isEnglish(language)
              ? "No stops were returned for this direction."
              : "Δεν επιστράφηκαν στάσεις για αυτή τη διαδρομή."
          ),
        ],

        components: [],
      }
    );

    return;
  }

  const totalPages =
    Math.max(
      1,
      Math.ceil(
        stops.length /
          STOPS_PER_PAGE
      )
    );

  const safePage =
    Math.min(
      Math.max(
        0,
        page
      ),
      totalPages - 1
    );

  await editOriginalResponse(
    interaction,
    {
      embeds: [
        createStopsEmbed(
          line,
          route,
          stops,
          safePage,
          totalPages,
          language
        ),
      ],

      components:
        stopSelectComponent(
          interaction,
          line,
          route,
          stops,
          safePage,
          totalPages,
          language
        ),
    }
  );
}

// ============================================================
// SHOW ARRIVALS
// ============================================================

async function showArrivals(
  interaction,
  selected
) {
  const language =
    selected.language || "el";

  const arrivals =
    await getArrivals(
      selected.stopCode
    );

  const filtered =
    arrivals
      .filter(
        (arrival) =>
          String(
            arrival.routeCode ??
              ""
          ) ===
          String(
            selected.routeCode
          )
      )
      .sort(
        (a, b) =>
          Number(
            a.minutes ??
              999999
          ) -
          Number(
            b.minutes ??
              999999
          )
      );

  const embed = {
    title: isEnglish(language)
      ? `🚌 Line ${selected.lineId}`
      : `🚌 Γραμμή ${selected.lineId}`,

    description:
      `**${selected.routeName}**\n\n` +
      `📍 **${selected.stopName}**`,

    color: 0x5865f2,

    timestamp:
      new Date().toISOString(),
  };

  if (!filtered.length) {
    embed.fields = [
      {
        name:
          isEnglish(language)
            ? "⏱️ Upcoming arrivals"
            : "⏱️ Επόμενες αφίξεις",

        value:
          isEnglish(language)
            ? "No arrivals are currently available."
            : "Δεν υπάρχουν διαθέσιμες αφίξεις αυτή τη στιγμή.",
      },
    ];
  } else {
    const arrivalText =
      filtered
        .slice(0, 10)
        .map(
          (arrival) => {
            const minutes =
              Number(
                arrival.minutes
              );

            let timeText;

            if (
              minutes === 0
            ) {
              timeText =
                isEnglish(language)
                  ? "🟢 **Now**"
                  : "🟢 **Τώρα**";
            } else if (
              minutes === 1
            ) {
              timeText =
                isEnglish(language)
                  ? "🟡 in **1 min**"
                  : "🟡 σε **1′**";
            } else if (
              Number.isFinite(
                minutes
              )
            ) {
              timeText =
                isEnglish(language)
                  ? `🟡 in **${minutes} min**`
                  : `🟡 σε **${minutes}′**`;
            } else {
              timeText =
                isEnglish(language)
                  ? "🟡 unknown"
                  : "🟡 άγνωστο";
            }

            return `🚌 ${timeText}`;
          }
        )
        .join("\n");

    embed.fields = [
      {
        name:
          isEnglish(language)
            ? "⏱️ Upcoming arrivals"
            : "⏱️ Επόμενες αφίξεις",

        value:
          arrivalText,
      },
    ];
  }

  embed.footer = {
    text:
      isEnglish(language)
        ? "Where is my bus? • Papoutsis Digital"
        : "Πού είναι το λεωφορείο μου; • Papoutsis Digital",
  };

  await editOriginalResponse(
    interaction,
    {
      embeds: [embed],

      components:
        arrivalsComponents(
          interaction,
          selected,
          language
        ),
    }
  );
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
      focused?.value ?? ""
    )
      .trim()
      .toLowerCase();

  const language =
    interaction.data?.name ===
    "arrivals"
      ? "en"
      : "el";

  const lines =
    getLines();

  const filtered =
    lines
      .filter(
        (line) => {
          const id =
            getLineId(
              line
            ).toLowerCase();

          const greek =
            getLineGreek(
              line
            ).toLowerCase();

          const english =
            getLineEnglish(
              line
            ).toLowerCase();

          return (
            id.includes(query) ||
            greek.includes(query) ||
            english.includes(query)
          );
        }
      )
      .slice(0, 25);

  const choices =
    filtered.map(
      (line) => ({
        name:
          `🚌 ${getLineId(
            line
          )} — ${lineName(
            line,
            language
          )}`.slice(
            0,
            100
          ),

        value:
          JSON.stringify({
            lineId:
              getLineId(
                line
              ),

            lineCode:
              getLineCode(
                line
              ),

            language,
          }),
      })
    );

  console.log(
    `🔎 Autocomplete "${query}" [${language}] → ${choices.length} αποτελέσματα`
  );

  return autocompleteResponse(
    choices
  );
}

// ============================================================
// COMMAND DATA
// ============================================================

function getCommandOption(
  interaction
) {
  return (
    interaction.data?.options?.[0]
      ?.value ??
    null
  );
}

function findLine(
  lineId,
  lineCode
) {
  return getLines().find(
    (line) =>
      String(
        getLineId(line)
      ) === String(lineId) &&
      String(
        getLineCode(line)
      ) === String(lineCode)
  );
}

// ============================================================
// SLASH COMMAND
// ============================================================

async function handleCommand(
  interaction,
  env,
  ctx
) {
  const commandName =
    interaction.data?.name;

  if (
    commandName !==
      "αφίξεις" &&
    commandName !==
      "arrivals"
  ) {
    return messageResponse(
      "❌ Unknown command."
    );
  }

  const language =
    commandName ===
    "arrivals"
      ? "en"
      : "el";

  const value =
    getCommandOption(
      interaction
    );

  if (!value) {
    return messageResponse(
      isEnglish(language)
        ? "❌ Please select a bus line."
        : "❌ Επίλεξε πρώτα γραμμή λεωφορείου."
    );
  }

  let selectedLine;

  try {
    const parsed =
      JSON.parse(
        String(value)
      );

    selectedLine =
      findLine(
        parsed.lineId,
        parsed.lineCode
      );

    if (!selectedLine) {
      selectedLine = {
        LineID:
          parsed.lineId,

        LineCode:
          parsed.lineCode,

        LineDescr:
          parsed.lineDescription ||
          parsed.lineId,

        LineDescrEng:
          parsed.lineDescriptionEng ||
          parsed.lineId,
      };
    }
  } catch {
    const lineText =
      String(value)
        .trim()
        .toLowerCase();

    selectedLine =
      getLines().find(
        (line) =>
          getLineId(
            line
          )
            .toLowerCase() ===
            lineText
      );
  }

  if (!selectedLine) {
    return messageResponse(
      isEnglish(language)
        ? "❌ The selected line could not be found."
        : "❌ Δεν βρέθηκε η επιλεγμένη γραμμή."
    );
  }

  // Απαντάμε αμέσως στο Discord.
  // Η πραγματική αναζήτηση γίνεται μετά.
  ctx.waitUntil(
    (async () => {
      try {
        await showRoutes(
          interaction,
          selectedLine,
          language
        );
      } catch (error) {
        console.error(
          "❌ ROUTES ERROR:",
          error
        );

        await editOriginalResponse(
          interaction,
          {
            embeds: [
              createErrorEmbed(
                isEnglish(language)
                  ? "❌ Directions error"
                  : "❌ Σφάλμα διαδρομών",

                isEnglish(language)
                  ? `I could not load the directions.\n\n\`${String(
                      error?.message ||
                        error
                    ).slice(
                      0,
                      900
                    )}\``
                  : `Δεν μπόρεσα να φορτώσω τις διαδρομές.\n\n\`${String(
                      error?.message ||
                        error
                    ).slice(
                      0,
                      900
                    )}\``
              ),
            ],

            components: [],
          }
        );
      }
    })()
  );

  return deferredResponse();
}

// ============================================================
// COMPONENT INTERACTIONS
// ============================================================

async function handleComponent(
  interaction,
  ctx
) {
  const customId =
    interaction.data?.custom_id ||
    "";

  // ----------------------------------------------------------
  // ROUTE SELECT
  // ----------------------------------------------------------

  if (
    customId.startsWith(
      "route:"
    )
  ) {
    const value =
      interaction.data
        ?.values?.[0];

    if (!value) {
      return messageResponse(
        "❌ No direction selected."
      );
    }

    let selected;

    try {
      selected =
        JSON.parse(
          value
        );
    } catch {
      return messageResponse(
        "❌ Invalid direction data."
      );
    }

    const line =
      findLine(
        selected.lineId,
        selected.lineCode
      ) || {
        LineID:
          selected.lineId,

        LineCode:
          selected.lineCode,

        LineDescr:
          selected.lineId,

        LineDescrEng:
          selected.lineId,
      };

    const route = {
      RouteCode:
        selected.routeCode,

      RouteDescr:
        selected.routeName,

      RouteDescrEng:
        selected.routeName,
    };

    const language =
      selected.language ||
      "el";

    ctx.waitUntil(
      (async () => {
        try {
          await showStops(
            interaction,
            line,
            route,
            language,
            0
          );
        } catch (error) {
          console.error(
            "❌ STOPS ERROR:",
            error
          );

          await editOriginalResponse(
            interaction,
            {
              embeds: [
                createErrorEmbed(
                  isEnglish(language)
                    ? "❌ Stops error"
                    : "❌ Σφάλμα στάσεων",

                  isEnglish(language)
                    ? `I could not load the stops.\n\n\`${String(
                        error?.message ||
                          error
                      ).slice(
                        0,
                        900
                      )}\``
                    : `Δεν μπόρεσα να φορτώσω τις στάσεις.\n\n\`${String(
                        error?.message ||
                          error
                      ).slice(
                        0,
                        900
                      )}\``
                ),
              ],

              components: [],
            }
          );
        }
      })()
    );

    return deferredResponse();
  }

  // ----------------------------------------------------------
  // STOP SELECT
  // ----------------------------------------------------------

  if (
    customId.startsWith(
      "stop:"
    )
  ) {
    const value =
      interaction.data
        ?.values?.[0];

    if (!value) {
      return messageResponse(
        "❌ No stop selected."
      );
    }

    let selected;

    try {
      selected =
        JSON.parse(
          value
        );
    } catch {
      return messageResponse(
        "❌ Invalid stop data."
      );
    }

    ctx.waitUntil(
      (async () => {
        try {
          await showArrivals(
            interaction,
            selected
          );
        } catch (error) {
          console.error(
            "❌ ARRIVALS ERROR:",
            error
          );

          const language =
            selected.language ||
            "el";

          await editOriginalResponse(
            interaction,
            {
              embeds: [
                createErrorEmbed(
                  isEnglish(language)
                    ? "❌ Arrivals error"
                    : "❌ Σφάλμα αφίξεων",

                  isEnglish(language)
                    ? `I could not load the arrivals.\n\n\`${String(
                        error?.message ||
                          error
                      ).slice(
                        0,
                        900
                      )}\``
                    : `Δεν μπόρεσα να φορτώσω τις αφίξεις.\n\n\`${String(
                        error?.message ||
                          error
                      ).slice(
                        0,
                        900
                      )}\``
                ),
              ],

              components: [],
            }
          );
        }
      })()
    );

    return deferredResponse();
  }

  // ----------------------------------------------------------
  // STOP PAGE
  // ----------------------------------------------------------

  if (
    customId.startsWith(
      "stoppage:"
    )
  ) {
    const value =
      customId.split(
        ":"
      );

    const page =
      Number(
        value[2]
      );

    const state =
      interaction.message
        ?.embeds?.[0];

    const description =
      state?.description ||
      "";

    // Για pagination ξαναχρησιμοποιούμε
    // τα στοιχεία που βρίσκονται στο message.
    //
    // Επειδή το Discord component interaction
    // δεν κρατάει arbitrary state, ζητάμε από
    // τα υπάρχοντα custom IDs να επαναφέρουμε
    // την κατάσταση όπου είναι διαθέσιμη.

    return messageResponse(
      "❌ Η σελιδοποίηση χρειάζεται ανανέωση της λίστας στάσεων."
    );
  }

  // ----------------------------------------------------------
  // REFRESH
  // ----------------------------------------------------------

  if (
    customId.startsWith(
      "refresh:"
    )
  ) {
    return messageResponse(
      "🔄 Η ανανέωση θα προστεθεί στο επόμενο βήμα."
    );
  }

  // ----------------------------------------------------------
  // BACK TO ROUTES
  // ----------------------------------------------------------

  if (
    customId.startsWith(
      "backroutes:"
    )
  ) {
    return messageResponse(
      "↩️ Η επιστροφή στις διαδρομές θα προστεθεί στο επόμενο βήμα."
    );
  }

  // ----------------------------------------------------------
  // BACK TO STOPS
  // ----------------------------------------------------------

  if (
    customId.startsWith(
      "backstops:"
    )
  ) {
    return messageResponse(
      "↩️ Η επιστροφή στις στάσεις θα προστεθεί στο επόμενο βήμα."
    );
  }

  return messageResponse(
    "❌ Unknown interaction."
  );
}

// ============================================================
// REGISTER COMMANDS
// ============================================================

async function registerCommands(
  env
) {
  if (!env.APPLICATION_ID) {
    throw new Error(
      "APPLICATION_ID δεν έχει οριστεί."
    );
  }

  if (!env.DISCORD_TOKEN) {
    throw new Error(
      "DISCORD_TOKEN δεν έχει οριστεί."
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

  console.log(
    "📡 Registering Discord global commands..."
  );

  const result =
    await discordRequest(
      `/applications/${env.APPLICATION_ID}/commands`,
      {
        method: "PUT",

        headers: {
          Authorization:
            `Bot ${env.DISCORD_TOKEN}`,
        },

        body: JSON.stringify(
          commands
        ),
      }
    );

  console.log(
    `✅ Registered ${result.length} commands.`
  );

  return result;
}

// ============================================================
// TEST OASA THROUGH BUSAPP
// ============================================================

async function testBusApp() {
  const started =
    Date.now();

  const data =
    await busAppFetch(
      "/routes",
      {
        lineCode: "953",
      }
    );

  return {
    success: true,

    elapsedMs:
      Date.now() -
      started,

    source:
      "BusApp",

    endpoint:
      `${BUSAPP_API}/routes?lineCode=953`,

    results:
      Array.isArray(
        data?.results
      )
        ? data.results
        : [],
  };
}

// ============================================================
// MAIN FETCH
// ============================================================

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

    // --------------------------------------------------------
    // HEALTH CHECK
    // --------------------------------------------------------

    if (
      request.method ===
        "GET" &&
      url.pathname === "/"
    ) {
      return json({
        success: true,

        service:
          "Πού είναι το λεωφορείο μου; — Discord Bot",

        status:
          "online",

        architecture:
          "Discord → Discord Worker → BusApp → OASA",

        routesSource:
          "BusApp",

        directOasaRoutes:
          false,
      });
    }

    // --------------------------------------------------------
    // TEST BUSAPP
    // --------------------------------------------------------

    if (
      request.method ===
        "GET" &&
      url.pathname ===
        "/test-oasa"
    ) {
      try {
        const result =
          await testBusApp();

        return json(
          result
        );
      } catch (error) {
        console.error(
          "❌ /test-oasa ERROR:",
          error
        );

        return json(
          {
            success:
              false,

            error:
              String(
                error?.message ||
                  error
              ),
          },
          502
        );
      }
    }

    // --------------------------------------------------------
    // REGISTER
    // --------------------------------------------------------

    if (
      request.method ===
        "GET" &&
      url.pathname ===
        "/register"
    ) {
      const key =
        url.searchParams.get(
          "key"
        );

      if (
        !key ||
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
        const commands =
          await registerCommands(
            env
          );

        return json({
          success:
            true,

          message:
            "Discord commands registered.",

          commands:
            commands.map(
              (command) => ({
                id:
                  command.id,

                name:
                  command.name,
              })
            ),
        });
      } catch (error) {
        console.error(
          "❌ REGISTER ERROR:",
          error
        );

        return json(
          {
            success:
              false,

            error:
              String(
                error?.message ||
                  error
              ),
          },
          500
        );
      }
    }

    // --------------------------------------------------------
    // DISCORD INTERACTIONS
    // --------------------------------------------------------

    if (
      request.method !==
      "POST"
    ) {
      return json(
        {
          success:
            false,

          error:
            "Method Not Allowed",
        },
        405
      );
    }

    const body =
      await request.text();

    if (
      !env.DISCORD_PUBLIC_KEY
    ) {
      console.error(
        "❌ DISCORD_PUBLIC_KEY missing."
      );

      return json(
        {
          success:
            false,

          error:
            "Discord public key is not configured.",
        },
        500
      );
    }

    const verified =
      await verifyDiscordSignature(
        request,
        body,
        env.DISCORD_PUBLIC_KEY
      );

    if (!verified) {
      console.error(
        "❌ Invalid Discord signature."
      );

      return text(
        "Invalid request signature.",
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
      return json(
        {
          success:
            false,

          error:
            "Invalid JSON.",
        },
        400
      );
    }

    console.log(
      `📨 Discord interaction type=${interaction.type} name=${interaction.data?.name || interaction.data?.custom_id || ""}`
    );

    // --------------------------------------------------------
    // PING
    // --------------------------------------------------------

    if (
      interaction.type ===
      1
    ) {
      return pongResponse();
    }

    // --------------------------------------------------------
    // AUTOCOMPLETE
    // --------------------------------------------------------

    if (
      interaction.type ===
      4
    ) {
      try {
        return await handleAutocomplete(
          interaction
        );
      } catch (error) {
        console.error(
          "❌ AUTOCOMPLETE ERROR:",
          error
        );

        return autocompleteResponse(
          []
        );
      }
    }

    // --------------------------------------------------------
    // SLASH COMMAND
    // --------------------------------------------------------

    if (
      interaction.type ===
      2
    ) {
      return handleCommand(
        interaction,
        env,
        ctx
      );
    }

    // --------------------------------------------------------
    // COMPONENT
    // --------------------------------------------------------

    if (
      interaction.type ===
      3
    ) {
      return handleComponent(
        interaction,
        ctx
      );
    }

    return messageResponse(
      "❌ Unsupported Discord interaction."
    );
  },
};
