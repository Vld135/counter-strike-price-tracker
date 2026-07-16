const SteamCommunity = require("steamcommunity");
const fs = require("fs");
const sha1 = require("js-sha1");
const SteamTotp = require("steam-totp");
const { EAuthTokenPlatformType, LoginSession } = require("steam-session");
const { default: axios } = require("axios");
const Request = require("request");
const { getWeightedAveragePrice } = require("./pricing");


const STEAM_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36";

const STEAM_WEB_HEADERS = {
  "User-Agent": STEAM_USER_AGENT,
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br, zstd",
  "sec-ch-ua": '"Google Chrome";v="146", "Chromium";v="146", "Not?A_Brand";v="24"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"Windows"',
};

const dir = `./static`;
const dirPrices = `./static/prices`;
const dirPricehistory = `./static/pricehistory`;
const ITEMS_API_BASE_URL =
  "https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en";
const MARKET_BASE_URL = "https://steamcommunity.com/market";
const STATE_FILE = "state.json";
const proxy = process.argv[5];

const START_TIME = Date.now();
const MAX_DURATION = 3600 * 1000 * 1.5;

let errorFound = false;

if (process.argv.length != 6) {
  console.error(
    `Missing input arguments, expected 6 got ${process.argv.length}`
  );
  process.exit(1);
}

if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir);
}

if (!fs.existsSync(dirPrices)) {
  fs.mkdirSync(dirPrices);
}

if (!fs.existsSync(dirPricehistory)) {
  fs.mkdirSync(dirPricehistory);
}

console.log("Logging into Steam community...");


const session = new LoginSession(EAuthTokenPlatformType.SteamClient, {
  httpProxy: proxy,
});
session.startWithCredentials({
  accountName: process.argv[2],
  password: process.argv[3],
  steamGuardCode: SteamTotp.generateAuthCode(process.argv[4]),
});
let community = new SteamCommunity({
  request: Request.defaults({ headers: { ...STEAM_WEB_HEADERS }, forever: true }),
  userAgent: STEAM_USER_AGENT,
});


session.on("authenticated", async () => {
  console.log("Steam session authenticated");
  const cookies = await session.getWebCookies();
  community.setCookies(cookies);

  try {
    console.log("Loading items...");
    const items = await getAllItemNames();
    console.log(`Processing ${items.length} items.`);
    const state = loadState();
    const lastIndex = (state.lastIndex || 0) % items.length;
    await processItems(items.slice(lastIndex), lastIndex);

    const prices = await loadPrices();
    const newPrices = {
      ...prices,
      ...priceDataByItemHashName,
    };
    const orderedNewPrices = Object.keys(newPrices)
      .sort()
      .reduce((acc, key) => {
        acc[key] = newPrices[key];
        return acc;
      }, {});

    // Save price data to one json file
    fs.writeFile(
      `${dirPrices}/latest.json`,
      JSON.stringify(orderedNewPrices, null, 4),
      (err) => err && console.error(err)
    );

    // Save price data to one json file with the current date as name (YYYY-MM-DD format).
    const currentDate = new Date().toISOString().split("T")[0];
    fs.writeFile(
      `${dirPrices}/${currentDate}.json`,
      JSON.stringify(orderedNewPrices, null, 4),
      (err) => err && console.error(err)
    );
  } catch (error) {
    console.error("An error occurred while processing items:", error);
  }
});

console.log("Logging into Steam community....");

// Price data by item hash name
const priceDataByItemHashName = {};

function loadPrices() {
  if (fs.existsSync(`${dirPrices}/latest.json`)) {
    const data = fs.readFileSync(`${dirPrices}/latest.json`);
    return JSON.parse(data);
  }
  return {};
}

function loadState() {
  if (fs.existsSync(STATE_FILE)) {
    const data = fs.readFileSync(STATE_FILE);
    return JSON.parse(data);
  }
  return {};
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state));
}

async function getAllItemNames() {
  return Promise.all([
    fetch(`${ITEMS_API_BASE_URL}/skins_not_grouped.json`)
      .then((res) => res.json())
      .then((res) => res.map((item) => item.market_hash_name)),
    fetch(`${ITEMS_API_BASE_URL}/stickers.json`)
      .then((res) => res.json())
      .then((res) => res.map((item) => item.market_hash_name)),
    fetch(`${ITEMS_API_BASE_URL}/crates.json`)
      .then((res) => res.json())
      .then((res) => res.map((item) => item.market_hash_name)),
    fetch(`${ITEMS_API_BASE_URL}/agents.json`)
      .then((res) => res.json())
      .then((res) => res.map((item) => item.market_hash_name)),
    fetch(`${ITEMS_API_BASE_URL}/keys.json`)
      .then((res) => res.json())
      .then((res) => res.map((item) => item.market_hash_name)),
    fetch(`${ITEMS_API_BASE_URL}/patches.json`)
      .then((res) => res.json())
      .then((res) => res.map((item) => item.market_hash_name)),
    fetch(`${ITEMS_API_BASE_URL}/graffiti.json`)
      .then((res) => res.json())
      .then((res) => res.map((item) => item.market_hash_name)),
    fetch(`${ITEMS_API_BASE_URL}/music_kits.json`)
      .then((res) => res.json())
      .then((res) => res.map((item) => item.market_hash_name)),
    fetch(`${ITEMS_API_BASE_URL}/collectibles.json`)
      .then((res) => res.json())
      .then((res) => res.map((item) => item.market_hash_name)),
    fetch(`${ITEMS_API_BASE_URL}/keychains.json`)
      .then((res) => res.json())
      .then((res) => res.map((item) => item.market_hash_name)),
  ]).then((results) => results.flat().filter(Boolean));
}

async function fetchPrice(name) {
  return new Promise((resolve, reject) => {
    community.request.get(
      `${MARKET_BASE_URL}/pricehistory/?appid=730&market_hash_name=${encodeURIComponent(
        name
      )}`,
      async (err, res) => {
        if (err) {
          reject(err);
          return;
        }
        try {
          if (res.statusCode == 429) {
            // errorFound = true;
            console.log("[ERROR]", res.statusCode, res.statusMessage);
            console.log(
              `${MARKET_BASE_URL}/pricehistory/?appid=730&market_hash_name=${encodeURIComponent(
                name
              )}`
            );

            const resp = await axios.post(`${proxy}/api/refresh-ip`);
            console.log("IP refreshed:", resp.data);

            resolve({ prices: [], lastEver: null });
            return;
          }

          const prices = (JSON.parse(res.body).prices || []).map(
            ([time, value, volume]) => ({
              time: Date.parse(time),
              value,
              volume: parseInt(volume),
            })
          );
          resolve({
            prices,
            lastEver:
              prices.length > 0 ? prices[prices.length - 1].value : null,
          });
        } catch (parseError) {
          reject(parseError);
        }
      }
    );
  });
}

async function processBatch(batch) {
  const promises = batch.map((name) =>
    fetchPrice(name)
      .then(({ prices, lastEver }) => {
        if (prices.length > 0) {
          priceDataByItemHashName[name] = {
            steam: getWeightedAveragePrice(prices, lastEver),
          };
          const hashedName = sha1(name);
          // TODO: Try to save all data prices.
          // For testing purposes just add the last 500 prices.
          // const filteredPrices = prices.splice(-500);
          return fs.writeFile(
              `${dir}/pricehistory/${hashedName}.json`,
              JSON.stringify(prices),
              (err) => err && console.error(err)
          );
        }
      })
      .catch((error) => console.log(`Error processing ${name}:`, error))
  );
  await Promise.all(promises);
}

async function processItems(items, startIndex, batchSize = 1) {
  // Calculate delay based on rate limit
  const requestsPerMinute = 180;
  // Calculate delay needed after each batch to adhere to the rate limit
  // Note: If batchSize is larger than the rate limit, this will result in a negative delay,
  // which should be handled as well (e.g., by setting a minimum batchSize or adjusting the logic accordingly).
  const delayPerBatch = (60 / requestsPerMinute) * batchSize * 1000; // Convert to milliseconds

  for (let i = 0; i < items.length; i += batchSize) {
    const currentTime = Date.now();
    if (currentTime - START_TIME >= MAX_DURATION) {
      console.log("Max duration reached. Stopping the process.");
      saveState({ lastIndex: startIndex + i });
      return;
    }

    const batch = items.slice(i, i + batchSize);
    await processBatch(batch);

    if (errorFound) {
      return;
    }

    console.log(
      `Processed batch ${i / batchSize + 1}/${Math.ceil(
        items.length / batchSize
      )}`
    );

    saveState({ lastIndex: startIndex + i + batchSize });

    // Add a delay to respect the rate limit, only if there are more batches to process
    if (i + batchSize < items.length) {
      console.log(
        `Waiting for ${delayPerBatch / 1000} seconds to respect rate limit...`
      );
      await new Promise((resolve) => setTimeout(resolve, delayPerBatch));
    }
  }
}

