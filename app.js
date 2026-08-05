// Openbare MEXC-data. Geen account, API-sleutel of orderfunctionaliteit.
const MEXC = "https://api.mexc.com/api/v3";
const REFRESH_MS = 10_000;
const DETAIL_ASSETS = [
  { symbol: "BTCUSDT", name: "Bitcoin", short: "BTC" },
  { symbol: "ETHUSDT", name: "Ethereum", short: "ETH" },
  { symbol: "SOLUSDT", name: "Solana", short: "SOL" },
  { symbol: "XRPUSDT", name: "XRP", short: "XRP" }
];
const DEFAULT_FILTERS = { usdtOnly: true, minVolume: 1_000_000, watchlistOnly: false };
let selected = DETAIL_ASSETS[0];
let rankedMarkets = [];
let marketSymbols = null;
let showAll = false;
let filters = JSON.parse(localStorage.getItem("cryptoFocusFilters") || "null") || { ...DEFAULT_FILTERS };
let watchlist = JSON.parse(localStorage.getItem("cryptoFocusWatchlist") || "[]");
const supabaseClient = window.supabase.createClient(window.CRYPTO_FOCUS_SUPABASE_URL, window.CRYPTO_FOCUS_SUPABASE_PUBLISHABLE_KEY);
let currentUser = null;
let signupMode = false;

const fetchJson = async path => {
  const response = await fetch(`${MEXC}${path}`);
  if (!response.ok) throw new Error("MEXC-marktdata is tijdelijk niet beschikbaar.");
  return response.json();
};
const fmt = number => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "USDT", maximumFractionDigits: number < 10 ? 4 : 2 }).format(number);
const pretty = symbol => symbol.endsWith("USDT") ? `${symbol.slice(0, -4)}/USDT` : symbol;
const num = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const label = score => score >= 75 ? "Sterke context" : score >= 50 ? "Gemengde context" : "Zwakke context";
const compact = new Intl.NumberFormat("nl-NL", { notation: "compact", maximumFractionDigits: 1 });

function ema(values, period) {
  const multiplier = 2 / (period + 1);
  let latest = values[0];
  return values.map(value => (latest = value * multiplier + latest * (1 - multiplier)));
}
function rsi(values, period = 14) {
  const changes = values.slice(1).map((value, index) => value - values[index]);
  let gain = changes.slice(0, period).reduce((total, value) => total + Math.max(value, 0), 0) / period;
  let loss = changes.slice(0, period).reduce((total, value) => total + Math.max(-value, 0), 0) / period;
  const results = Array(period).fill(null);
  for (let index = period; index < changes.length; index += 1) {
    gain = (gain * (period - 1) + Math.max(changes[index], 0)) / period;
    loss = (loss * (period - 1) + Math.max(-changes[index], 0)) / period;
    results.push(loss === 0 ? 100 : 100 - 100 / (1 + gain / loss));
  }
  return [null, ...results];
}
function calculateDetail(raw) {
  const close = raw.map(candle => +candle[4]);
  const volume = raw.map(candle => +candle[5]);
  const ema20 = ema(close, 20), ema50 = ema(close, 50), ema200 = ema(close, 200), rsi14 = rsi(close);
  const macd = ema(close, 12).map((value, index) => value - ema(close, 26)[index]);
  const signal = ema(macd, 9), index = close.length - 1;
  const averageVolume = volume.slice(-20).reduce((total, value) => total + value, 0) / 20;
  const tests = [
    ["Prijs boven EMA 20", close[index] > ema20[index], 20],
    ["EMA 20 boven EMA 50", ema20[index] > ema50[index], 20],
    ["Prijs boven EMA 200", close[index] > ema200[index], 20],
    ["RSI tussen 50 en 70", rsi14[index] >= 50 && rsi14[index] <= 70, 15],
    ["MACD boven signaallijn", macd[index] > signal[index], 15],
    ["Volume boven gemiddelde", volume[index] > averageVolume, 10]
  ];
  return { close: close[index], change: (close[index] / close[index - 1] - 1) * 100, rsi: rsi14[index], volumeRatio: volume[index] / averageVolume, trend: close[index] > ema200[index] ? "Boven EMA 200" : "Onder EMA 200", score: tests.reduce((total, test) => total + (test[1] ? test[2] : 0), 0), tests };
}
function renderDetail(data) {
  document.querySelector("#assetName").textContent = selected.name;
  document.querySelector("#price").textContent = fmt(data.close);
  const change = document.querySelector("#change");
  change.textContent = `${data.change >= 0 ? "+" : ""}${data.change.toFixed(2)}% sinds vorige candle`;
  change.className = `change ${data.change > 0 ? "positive" : "negative"}`;
  document.querySelector("#updated").textContent = `Detail bijgewerkt: ${new Date().toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`;
  document.querySelector("#score").textContent = data.score;
  document.querySelector("#scoreRing").style.setProperty("--score", `${data.score}%`);
  document.querySelector("#setupLabel").textContent = label(data.score);
  document.querySelector("#scoreSummary").textContent = label(data.score);
  document.querySelector("#rsi").textContent = data.rsi.toFixed(1);
  document.querySelector("#volume").textContent = `${data.volumeRatio.toFixed(2)}x`;
  document.querySelector("#trend").textContent = data.trend;
  document.querySelector("#checklist").innerHTML = data.tests.map(([name, yes, points]) => `<div class="check-row"><span>${name}</span><span class="check-status ${yes ? "yes" : "no"}">${yes ? `+${points}` : "-"}</span></div>`).join("");
}
async function loadDetail() {
  try { renderDetail(calculateDetail(await fetchJson(`/klines?symbol=${selected.symbol}&interval=1h&limit=250`))); }
  catch (error) { document.querySelector("#change").textContent = error.message; document.querySelector("#change").className = "change neutral"; }
}

function rankMarkets(tickers, symbols) {
  const enabled = new Set(symbols.filter(item => item.status === "1" || item.status === "ENABLED" || item.isSpotTradingAllowed).map(item => item.symbol));
  const active = tickers.filter(item => (enabled.size === 0 || enabled.has(item.symbol)) && num(item.quoteVolume) > 0 && num(item.lastPrice) > 0);
  const volumes = active.map(item => Math.log10(num(item.quoteVolume) + 1));
  return active.map(item => {
    const move = Math.abs(num(item.priceChangePercent));
    const range = num(item.lowPrice) > 0 ? (num(item.highPrice) - num(item.lowPrice)) / num(item.lowPrice) * 100 : 0;
    const liquidity = Math.min(45, volumes.filter(volume => volume <= Math.log10(num(item.quoteVolume) + 1)).length / volumes.length * 45);
    const score = Math.round(liquidity + Math.min(35, move * 3.5) + Math.min(20, range * 1.5));
    return { symbol: item.symbol, score, move, quoteVolume: num(item.quoteVolume), side: num(item.priceChangePercent) > 0 ? "Opwaarts" : num(item.priceChangePercent) < 0 ? "Neerwaarts" : "Vlak" };
  }).sort((first, second) => second.score - first.score || second.quoteVolume - first.quoteVolume);
}
function visibleMarkets() {
  const query = document.querySelector("#marketSearch").value.trim().toUpperCase();
  return rankedMarkets.filter(market =>
    market.symbol.includes(query) &&
    (!filters.usdtOnly || market.symbol.endsWith("USDT")) &&
    market.quoteVolume >= filters.minVolume &&
    (!filters.watchlistOnly || watchlist.includes(market.symbol))
  );
}
function chooseMarket(symbol) {
  selected = { symbol, name: pretty(symbol), short: symbol.slice(0, 4) };
  document.querySelectorAll(".asset").forEach(asset => asset.classList.remove("active"));
  loadDetail();
  window.scrollTo({ top: 0, behavior: "smooth" });
}
function toggleWatch(symbol) {
  watchlist = watchlist.includes(symbol) ? watchlist.filter(item => item !== symbol) : [...watchlist, symbol];
  localStorage.setItem("cryptoFocusWatchlist", JSON.stringify(watchlist));
  renderScanner();
  renderWatchlist();
  syncSettings();
}
function renderScanner() {
  const markets = visibleMarkets();
  const visible = showAll ? markets : markets.slice(0, 30);
  const scanner = document.querySelector("#scanner");
  scanner.innerHTML = visible.length ? visible.map((market, index) => `<article class="scan-row"><button class="market-detail" data-symbol="${market.symbol}"><div class="rank">${index + 1}</div><div class="coin-dot">${market.symbol.slice(0, 4)}</div><div class="scan-text"><strong>${pretty(market.symbol)}</strong><small>${market.side} · ${market.move.toFixed(2)}% · volume ${compact.format(market.quoteVolume)} USDT</small></div><div class="scan-score">${market.score}<small>/100</small></div></button><button class="watch-toggle ${watchlist.includes(market.symbol) ? "saved" : ""}" data-watch="${market.symbol}" aria-label="Bewaar ${pretty(market.symbol)} in watchlist">${watchlist.includes(market.symbol) ? "★" : "☆"}</button></article>`).join("") : "<p class=\"loading\">Geen markt voldoet aan deze filters.</p>";
  scanner.querySelectorAll(".market-detail").forEach(button => button.addEventListener("click", () => chooseMarket(button.dataset.symbol)));
  scanner.querySelectorAll(".watch-toggle").forEach(button => button.addEventListener("click", () => toggleWatch(button.dataset.watch)));
}
function renderWatchlist() {
  const lookup = new Map(rankedMarkets.map(market => [market.symbol, market]));
  const container = document.querySelector("#watchlist");
  document.querySelector("#watchlistCount").textContent = `${watchlist.length} ${watchlist.length === 1 ? "markt" : "markten"}`;
  container.innerHTML = watchlist.length ? watchlist.map(symbol => {
    const market = lookup.get(symbol);
    const subtitle = market ? `${market.side} · score ${market.score}/100 · ${market.move.toFixed(2)}%` : "Wachten op marktdata";
    return `<div class="watch-row"><div class="coin-dot">${symbol.slice(0, 4)}</div><button data-open="${symbol}"><strong>${pretty(symbol)}</strong><small>${subtitle}</small></button><button class="remove-watch" data-remove="${symbol}" aria-label="Verwijder ${pretty(symbol)}">×</button></div>`;
  }).join("") : "<p class=\"loading\">Tik op ☆ bij een markt om hem hier te bewaren.</p>";
  container.querySelectorAll("[data-open]").forEach(button => button.addEventListener("click", () => chooseMarket(button.dataset.open)));
  container.querySelectorAll("[data-remove]").forEach(button => button.addEventListener("click", () => toggleWatch(button.dataset.remove)));
}
async function scan() {
  const status = document.querySelector("#scanStatus");
  try {
    const tickers = await fetchJson("/ticker/24hr");
    if (!marketSymbols) { const exchange = await fetchJson("/exchangeInfo"); marketSymbols = exchange.symbols || []; }
    rankedMarkets = rankMarkets(tickers, marketSymbols);
    renderScanner(); renderWatchlist();
    status.textContent = `${rankedMarkets.length.toLocaleString("nl-NL")} actieve markten · live`;
  } catch (error) { status.textContent = "MEXC-data niet beschikbaar"; document.querySelector("#scanner").innerHTML = `<p class="loading">${error.message}</p>`; }
}
function saveFilters() {
  filters = { usdtOnly: document.querySelector("#usdtOnly").checked, minVolume: Number(document.querySelector("#minVolume").value), watchlistOnly: document.querySelector("#watchlistOnly").checked };
  localStorage.setItem("cryptoFocusFilters", JSON.stringify(filters));
  renderScanner();
  syncSettings();
}
function restoreFilterControls() {
  document.querySelector("#usdtOnly").checked = filters.usdtOnly;
  document.querySelector("#minVolume").value = String(filters.minVolume);
  document.querySelector("#watchlistOnly").checked = filters.watchlistOnly;
}
function refresh() { loadDetail(); scan(); }

function setAuthMessage(message) { document.querySelector("#authMessage").textContent = message || ""; }
function showAuth() { document.querySelector("#authOverlay").classList.remove("hidden"); setAuthMessage(""); }
function hideAuth() { document.querySelector("#authOverlay").classList.add("hidden"); }
function renderAccount() {
  const button = document.querySelector("#accountButton");
  if (currentUser) { button.textContent = "Uitloggen"; button.classList.add("signed-in"); }
  else { button.textContent = "Inloggen"; button.classList.remove("signed-in"); }
}
function syncToLocal() {
  localStorage.setItem("cryptoFocusFilters", JSON.stringify(filters));
  localStorage.setItem("cryptoFocusWatchlist", JSON.stringify(watchlist));
}
async function syncSettings() {
  if (!currentUser) return;
  const { error } = await supabaseClient.from("user_settings").upsert({
    user_id: currentUser.id, filters, watchlist, updated_at: new Date().toISOString()
  });
  if (error) console.warn("Instellingen konden nog niet worden gesynchroniseerd.", error.message);
}
async function loadSyncedSettings() {
  const { data, error } = await supabaseClient.from("user_settings").select("filters, watchlist").eq("user_id", currentUser.id).maybeSingle();
  if (error) { setAuthMessage("De database-instelling ontbreekt nog. Voer eerst supabase-setup.sql uit."); return; }
  if (data) {
    filters = { ...DEFAULT_FILTERS, ...data.filters };
    watchlist = Array.isArray(data.watchlist) ? data.watchlist : [];
    syncToLocal(); restoreFilterControls(); renderScanner(); renderWatchlist();
  } else {
    await syncSettings();
  }
}
async function setSignedInUser(user) {
  currentUser = user;
  renderAccount();
  if (user) { hideAuth(); await loadSyncedSettings(); }
  else showAuth();
}
async function submitAuth(event) {
  event.preventDefault();
  const email = document.querySelector("#authEmail").value.trim();
  const password = document.querySelector("#authPassword").value;
  const submit = document.querySelector("#authSubmit");
  submit.disabled = true; setAuthMessage("Even controleren…");
  const result = signupMode
    ? await supabaseClient.auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}${window.location.pathname}` } })
    : await supabaseClient.auth.signInWithPassword({ email, password });
  submit.disabled = false;
  if (result.error) { setAuthMessage(result.error.message); return; }
  if (signupMode && !result.data.session) {
    setAuthMessage("Controleer je e-mail en bevestig je account. Log daarna hier in.");
    signupMode = false; renderAuthMode(); return;
  }
  setAuthMessage("");
}
function renderAuthMode() {
  document.querySelector("#authTitle").textContent = signupMode ? "Maak je account" : "Gebruik je account op elk apparaat";
  document.querySelector("#authDescription").textContent = signupMode ? "Je watchlist en filters worden veilig gesynchroniseerd." : "Log in om je watchlist en filters automatisch te synchroniseren.";
  document.querySelector("#authSubmit").textContent = signupMode ? "Account maken" : "Inloggen";
  document.querySelector("#authSwitch").textContent = signupMode ? "Al een account? Inloggen" : "Nog geen account? Account maken";
  document.querySelector("#authPassword").autocomplete = signupMode ? "new-password" : "current-password";
}

document.querySelectorAll(".asset").forEach(button => button.addEventListener("click", () => { selected = DETAIL_ASSETS.find(asset => asset.symbol === button.dataset.symbol); document.querySelectorAll(".asset").forEach(asset => asset.classList.toggle("active", asset === button)); loadDetail(); }));
document.querySelector("#marketSearch").addEventListener("input", renderScanner);
document.querySelector("#allMarketsButton").addEventListener("click", () => { showAll = !showAll; document.querySelector("#allMarketsButton").textContent = showAll ? "Toon top 30" : "Alle markten"; renderScanner(); });
document.querySelector("#refreshButton").addEventListener("click", refresh);
document.querySelector("#accountButton").addEventListener("click", async () => { if (currentUser) await supabaseClient.auth.signOut(); else showAuth(); });
document.querySelector("#authForm").addEventListener("submit", submitAuth);
document.querySelector("#authSwitch").addEventListener("click", () => { signupMode = !signupMode; setAuthMessage(""); renderAuthMode(); });
["#usdtOnly", "#minVolume", "#watchlistOnly"].forEach(id => document.querySelector(id).addEventListener("change", saveFilters));
document.querySelector("#resetFilters").addEventListener("click", () => { filters = { ...DEFAULT_FILTERS }; restoreFilterControls(); saveFilters(); });
restoreFilterControls(); refresh(); window.setInterval(refresh, REFRESH_MS);
supabaseClient.auth.onAuthStateChange((_event, session) => { setSignedInUser(session?.user || null); });
supabaseClient.auth.getSession().then(({ data }) => setSignedInUser(data.session?.user || null));
if ("serviceWorker" in navigator) navigator.serviceWorker.register("service-worker.js");
