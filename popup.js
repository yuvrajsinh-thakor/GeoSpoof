const $ = id => document.getElementById(id);
const lat = $("lat"), lon = $("lon"), acc = $("acc"), status = $("status");

function msg(text, type="") {
  status.textContent = text;
  status.className = type;
}

async function load() {
  const x = await chrome.storage.local.get(["latitude","longitude","accuracy","enabled"]);
  if (x.latitude !== undefined) lat.value = x.latitude;
  if (x.longitude !== undefined) lon.value = x.longitude;
  if (x.accuracy !== undefined) acc.value = x.accuracy;
  if (x.enabled) msg("Location override is active", "ok");
}
load();

document.querySelectorAll(".preset").forEach(btn => {
  btn.addEventListener("click", () => {
    lat.value = btn.dataset.lat;
    lon.value = btn.dataset.lon;
    acc.value = 10;
  });
});

$("apply").addEventListener("click", async () => {
  const latitude = Number(lat.value);
  const longitude = Number(lon.value);
  const accuracy = Number(acc.value);

  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)
    return msg("Latitude must be -90 to 90.", "error");

  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180)
    return msg("Longitude must be -180 to 180.", "error");

  if (!Number.isFinite(accuracy) || accuracy <= 0)
    return msg("Accuracy must be greater than 0.", "error");

  msg("Applying...");
  const r = await chrome.runtime.sendMessage({
    type: "apply",
    position: {latitude, longitude, accuracy}
  });

  if (r?.ok)
    msg(`Active: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`, "ok");
  else
    msg(r?.error || "Failed to apply.", "error");
});

$("clear").addEventListener("click", async () => {
  msg("Clearing...");
  const r = await chrome.runtime.sendMessage({type:"clear"});
  if (r?.ok) msg("Geolocation override cleared.", "ok");
  else msg(r?.error || "Failed to clear.", "error");
});