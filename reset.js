// Deze pagina is uitsluitend voor een Supabase-herstellink. Hij opent nooit het dashboard.
const client = window.supabase.createClient(window.CRYPTO_FOCUS_SUPABASE_URL, window.CRYPTO_FOCUS_SUPABASE_PUBLISHABLE_KEY);
const message = document.querySelector("#resetMessage");
const submit = document.querySelector("#resetSubmit");
let recoverySession = false;
const hashParameters = new URLSearchParams(window.location.hash.slice(1));
const queryParameters = new URLSearchParams(window.location.search);
const isRecoveryLink = hashParameters.get("type") === "recovery" || queryParameters.get("type") === "recovery" || queryParameters.has("code");
const recoveryLockKey = "cryptoFocusPasswordRecovery";

// Bewaar alleen voor deze herstelstroom dat de tijdelijke sessie geen gewone login is.
if (isRecoveryLink) localStorage.setItem(recoveryLockKey, "1");
const isRecoveryFlow = isRecoveryLink || localStorage.getItem(recoveryLockKey) === "1";

function setReady(ready, text) { recoverySession = ready; submit.disabled = !ready; message.textContent = text; }
client.auth.onAuthStateChange((event, session) => {
  if (event === "PASSWORD_RECOVERY" && session?.user) setReady(true, "Kies hieronder je nieuwe wachtwoord.");
});
client.auth.getSession().then(({ data }) => {
  // Een gewone ingelogde sessie geeft hier nadrukkelijk geen toegang.
  if (isRecoveryFlow && data.session?.user) setReady(true, "Kies hieronder je nieuwe wachtwoord.");
  else {
    localStorage.removeItem(recoveryLockKey);
    setReady(false, "Deze herstellink is ongeldig of verlopen. Vraag een nieuwe link aan in de app.");
  }
});

document.querySelector("#resetForm").addEventListener("submit", async event => {
  event.preventDefault();
  const password = document.querySelector("#newPassword").value;
  const confirmation = document.querySelector("#confirmPassword").value;
  if (!recoverySession) { setReady(false, "Deze herstellink is niet meer geldig. Vraag een nieuwe aan."); return; }
  if (password !== confirmation) { message.textContent = "De twee wachtwoorden zijn niet hetzelfde."; return; }
  submit.disabled = true; message.textContent = "Wachtwoord opslaan…";
  const { error } = await client.auth.updateUser({ password });
  if (error) { submit.disabled = false; message.textContent = error.message; return; }
  localStorage.removeItem(recoveryLockKey);
  await client.auth.signOut({ scope: "local" });
  message.textContent = "Wachtwoord aangepast. Je gaat nu naar het inlogscherm.";
  window.setTimeout(() => window.location.replace(new URL("index.html", window.location.href).href), 900);
});
