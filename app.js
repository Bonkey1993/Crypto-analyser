const assets = [
  { symbol: "BTCUSDT", name: "Bitcoin", short: "BTC" },
  { symbol: "ETHUSDT", name: "Ethereum", short: "ETH" },
  { symbol: "SOLUSDT", name: "Solana", short: "SOL" },
  { symbol: "XRPUSDT", name: "XRP", short: "XRP" }
];
let selected = assets[0];

const api = (symbol) => `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1h&limit=250`;
const fmt = (number) => new Intl.NumberFormat("nl-NL", { style:"currency", currency:"USD", maximumFractionDigits:number < 10 ? 4 : 2 }).format(number);

function ema(values, period) { const multiplier = 2 / (period + 1); let value = values[0]; return values.map(v => (value = v * multiplier + value * (1 - multiplier))); }
function rsi(values, period = 14) { const deltas = values.slice(1).map((v,i) => v - values[i]); let avgGain = deltas.slice(0,period).reduce((a,v)=>a + Math.max(v,0),0)/period; let avgLoss = deltas.slice(0,period).reduce((a,v)=>a + Math.max(-v,0),0)/period; const result = Array(period).fill(null); for(let i=period;i<deltas.length;i++) { avgGain=(avgGain*(period-1)+Math.max(deltas[i],0))/period; avgLoss=(avgLoss*(period-1)+Math.max(-deltas[i],0))/period; result.push(avgLoss === 0 ? 100 : 100 - 100/(1+avgGain/avgLoss)); } return [null,...result]; }
function calc(raw) {
  const close = raw.map(c=>+c[4]), volume=raw.map(c=>+c[5]), ema20=ema(close,20), ema50=ema(close,50), ema200=ema(close,200), rs=rsi(close);
  const macdLine = ema(close,12).map((v,i)=>v-ema(close,26)[i]), signal=ema(macdLine,9), last=close.length-1;
  const volumeAvg=volume.slice(-20).reduce((a,v)=>a+v,0)/20;
  const tests = [
    ["Prijs boven EMA 20", close[last]>ema20[last],20], ["EMA 20 boven EMA 50",ema20[last]>ema50[last],20], ["Prijs boven EMA 200",close[last]>ema200[last],20], ["RSI tussen 50 en 70",rs[last]>=50&&rs[last]<=70,15], ["MACD boven signaallijn",macdLine[last]>signal[last],15], ["Volume boven gemiddelde",volume[last]>volumeAvg,10]
  ]; const score=tests.reduce((total,test)=>total+(test[1]?test[2]:0),0);
  return { close:close[last], change:(close[last]/close[last-1]-1)*100, rsi:rs[last], volumeRatio:volume[last]/volumeAvg, trend:close[last]>ema200[last]?"Boven EMA 200":"Onder EMA 200", score, tests };
}
function label(score) { return score>=75?"Sterke context":score>=50?"Gemengde context":"Zwakke context"; }
function render(data) {
  document.querySelector("#assetName").textContent=selected.name; document.querySelector("#price").textContent=fmt(data.close);
  const change=document.querySelector("#change"); change.textContent=`${data.change>=0?"+":""}${data.change.toFixed(2)}% sinds vorige candle`; change.className=`change ${data.change>0?"positive":"negative"}`;
  document.querySelector("#updated").textContent=`Bijgewerkt: ${new Date().toLocaleTimeString("nl-NL",{hour:"2-digit",minute:"2-digit"})}`;
  document.querySelector("#score").textContent=data.score; document.querySelector("#scoreRing").style.setProperty("--score",`${data.score}%`); document.querySelector("#setupLabel").textContent=label(data.score); document.querySelector("#scoreSummary").textContent=label(data.score);
  document.querySelector("#rsi").textContent=data.rsi.toFixed(1); document.querySelector("#volume").textContent=`${data.volumeRatio.toFixed(2)}×`; document.querySelector("#trend").textContent=data.trend;
  document.querySelector("#checklist").innerHTML=data.tests.map(([name,yes,pts])=>`<div class="check-row"><span>${name}</span><span class="check-status ${yes?"yes":"no"}">${yes?`✓ +${pts}`:"–"}</span></div>`).join("");
}
async function loadSelected() { document.querySelector("#change").textContent="Data laden…"; document.querySelector("#change").className="change neutral"; try { render(calc(await (await fetch(api(selected.symbol))).json())); } catch { document.querySelector("#change").textContent="Marktdata niet beschikbaar. Probeer opnieuw."; } }
async function loadScanner() { const target=document.querySelector("#scanner"); target.innerHTML='<p class="loading">Scanner laden…</p>'; const results=await Promise.all(assets.map(async asset=>{try{return {asset,data:calc(await (await fetch(api(asset.symbol))).json())};}catch{return {asset,data:null};}})); target.innerHTML=results.map(({asset,data})=>data?`<div class="scan-row"><div class="coin-dot">${asset.short}</div><div class="scan-text"><strong>${asset.name}</strong><small>${label(data.score)} · RSI ${data.rsi.toFixed(1)}</small></div><div class="scan-score">${data.score}</div></div>`:`<div class="scan-row"><div class="coin-dot">${asset.short}</div><div class="scan-text"><strong>${asset.name}</strong><small>Data niet beschikbaar</small></div></div>`).join(""); }
function refresh() { loadSelected(); loadScanner(); }
document.querySelectorAll(".asset").forEach(button=>button.addEventListener("click",()=>{ selected=assets.find(a=>a.symbol===button.dataset.symbol); document.querySelectorAll(".asset").forEach(b=>b.classList.toggle("active",b===button)); loadSelected(); }));
document.querySelector("#refreshButton").addEventListener("click",refresh); refresh(); if("serviceWorker" in navigator) navigator.serviceWorker.register("service-worker.js");
