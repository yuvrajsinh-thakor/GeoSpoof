const $ = (id) => document.getElementById(id);

const coordsInput = $("coords");
const manualLat = $("manualLat");
const manualLon = $("manualLon");
const nameInput = $("shopName");
const accInput = $("acc");
const preview = $("preview");
const status = $("status");
const shopList = $("shopList");
const shopCount = $("shopCount");
const saveButton = $("save");
const pasteMode = $("pasteMode");
const manualMode = $("manualMode");
const pastePanel = $("pastePanel");
const manualPanel = $("manualPanel");

let inputMode = "paste";

function showStatus(text, type = "") {
  status.textContent = text;
  status.className = type;
}

function normalizeText(s) {
  return String(s || "")
    .replace(/[，、;]/g, ",")
    .replace(/\u2212/g, "-")
    .trim();
}

function parseCoordinates(raw) {
  const s = normalizeText(raw);

  const labeled = s.match(
    /lat(?:itude)?\s*[:=]?\s*(-?\d+(?:\.\d+)?)\D+(?:lon(?:gitude)?|lng)\s*[:=]?\s*(-?\d+(?:\.\d+)?)/i
  );

  if (labeled) {
    return {
      latitude: Number(labeled[1]),
      longitude: Number(labeled[2])
    };
  }

  const nums = s.match(/-?\d+(?:\.\d+)?/g) || [];

  if (nums.length < 2) return null;

  for (let i = 0; i < nums.length - 1; i++) {
    const a = Number(nums[i]);
    const b = Number(nums[i + 1]);

    if (
      Number.isFinite(a) &&
      Number.isFinite(b) &&
      a >= -90 && a <= 90 &&
      b >= -180 && b <= 180
    ) {
      return { latitude: a, longitude: b };
    }
  }

  return null;
}

function getPosition() {
  let latitude;
  let longitude;

  if (inputMode === "manual") {
    latitude = Number(manualLat.value);
    longitude = Number(manualLon.value);
  } else {
    const pair = parseCoordinates(coordsInput.value);
    if (!pair) return null;

    latitude = pair.latitude;
    longitude = pair.longitude;
  }

  const accuracy = Number(accInput.value);

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    !Number.isFinite(accuracy)
  ) {
    return null;
  }

  if (
    latitude < -90 || latitude > 90 ||
    longitude < -180 || longitude > 180 ||
    accuracy <= 0
  ) {
    return null;
  }

  return { latitude, longitude, accuracy };
}

function updatePreview() {
  const pos = getPosition();

  if (
    inputMode === "paste" &&
    !coordsInput.value.trim()
  ) {
    preview.textContent = "Waiting for coordinates…";
    preview.className = "preview";
    return;
  }

  if (
    inputMode === "manual" &&
    !manualLat.value.trim() &&
    !manualLon.value.trim()
  ) {
    preview.textContent = "Enter latitude and longitude…";
    preview.className = "preview";
    return;
  }

  if (!pos) {
    preview.textContent =
      "❌ Invalid coordinates. Latitude: -90 to 90, Longitude: -180 to 180.";
    preview.className = "preview invalid";
    return;
  }

  preview.innerHTML =
    `✅ Latitude: <b>${pos.latitude}</b><br>` +
    `✅ Longitude: <b>${pos.longitude}</b>`;

  preview.className = "preview valid";
}

function autoName(position) {
  if (nameInput.value.trim()) return nameInput.value.trim();
  return `${position.latitude.toFixed(6)}, ${position.longitude.toFixed(6)}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function getShops() {
  const data = await chrome.storage.local.get(["shops"]);
  return Array.isArray(data.shops) ? data.shops : [];
}

async function renderShops() {
  const shops = await getShops();

  shopCount.textContent =
    `${shops.length} saved location${shops.length === 1 ? "" : "s"}`;

  if (!shops.length) {
    shopList.innerHTML =
      `<div class="empty">No saved locations yet.<br>Enter coordinates above and tap Save.</div>`;
    return;
  }

  shopList.innerHTML = shops.map(shop => `
    <div class="shop-item">
      <div class="shop-name">${escapeHtml(shop.name)}</div>
      <div class="coords">
        ${escapeHtml(Number(shop.latitude).toFixed(15))},
        ${escapeHtml(Number(shop.longitude).toFixed(15))}
      </div>
      <div class="shop-actions">
        <button class="use" data-id="${escapeHtml(shop.id)}" type="button">📍 Apply</button>
        <button class="edit" data-id="${escapeHtml(shop.id)}" type="button">Edit</button>
        <button class="del" data-id="${escapeHtml(shop.id)}" type="button">Delete</button>
      </div>
    </div>
  `).join("");
}

async function applyLocation(position, label = "") {
  showStatus("Applying…");

  const result = await chrome.runtime.sendMessage({
    type: "apply",
    label,
    position
  });

  if (!result?.ok) {
    showStatus(result?.error || "Could not apply location.", "error");
    return false;
  }

  showStatus(
    `Active: ${position.latitude.toFixed(6)}, ${position.longitude.toFixed(6)}`,
    "ok"
  );

  return true;
}

function setMode(mode) {
  inputMode = mode;

  const paste = mode === "paste";

  pasteMode.classList.toggle("active", paste);
  manualMode.classList.toggle("active", !paste);

  pastePanel.hidden = !paste;
  manualPanel.hidden = paste;

  updatePreview();
}

pasteMode.addEventListener("click", () => setMode("paste"));
manualMode.addEventListener("click", () => setMode("manual"));

coordsInput.addEventListener("input", updatePreview);
manualLat.addEventListener("input", updatePreview);
manualLon.addEventListener("input", updatePreview);
accInput.addEventListener("input", updatePreview);

coordsInput.addEventListener("paste", () => {
  setTimeout(updatePreview, 0);
});

$("apply").addEventListener("click", async () => {
  const pos = getPosition();

  if (!pos) {
    showStatus("Enter valid latitude and longitude.", "error");
    updatePreview();
    return;
  }

  await applyLocation(pos, nameInput.value.trim());
});

saveButton.addEventListener("click", async () => {
  const pos = getPosition();

  if (!pos) {
    showStatus("Enter valid latitude and longitude first.", "error");
    updatePreview();
    return;
  }

  const shops = await getShops();
  const editId = nameInput.dataset.editId;

  const newShop = {
    id: editId ||
      (crypto.randomUUID
        ? crypto.randomUUID()
        : `shop-${Date.now()}`),
    name: autoName(pos),
    latitude: pos.latitude,
    longitude: pos.longitude,
    accuracy: pos.accuracy
  };

  const updated = editId
    ? shops.map(shop => shop.id === editId ? newShop : shop)
    : [newShop, ...shops];

  await chrome.storage.local.set({ shops: updated });

  delete nameInput.dataset.editId;
  saveButton.textContent = "💾 Save";

  await renderShops();

  showStatus(
    editId ? "Location updated." : "Location saved.",
    "ok"
  );
});

$("clear").addEventListener("click", async () => {
  showStatus("Clearing…");

  const result = await chrome.runtime.sendMessage({ type: "clear" });

  if (!result?.ok) {
    showStatus(result?.error || "Could not clear.", "error");
    return;
  }

  coordsInput.value = "";
  manualLat.value = "";
  manualLon.value = "";
  nameInput.value = "";

  delete nameInput.dataset.editId;
  saveButton.textContent = "💾 Save";

  updatePreview();
  showStatus("Location cleared.", "ok");
});

shopList.addEventListener("click", async (event) => {
  const button = event.target.closest("button");
  if (!button) return;

  const shops = await getShops();
  const shop = shops.find(item => item.id === button.dataset.id);

  if (!shop) return;

  if (button.classList.contains("use")) {
    coordsInput.value = `${shop.latitude}, ${shop.longitude}`;
    manualLat.value = shop.latitude;
    manualLon.value = shop.longitude;
    nameInput.value = shop.name;
    accInput.value = shop.accuracy;

    setMode("paste");
    await applyLocation(shop, shop.name);
    return;
  }

  if (button.classList.contains("edit")) {
    coordsInput.value = `${shop.latitude}, ${shop.longitude}`;
    manualLat.value = shop.latitude;
    manualLon.value = shop.longitude;
    nameInput.value = shop.name;
    accInput.value = shop.accuracy;

    nameInput.dataset.editId = shop.id;
    saveButton.textContent = "💾 Update";

    setMode("manual");
    showStatus("Edit and tap Update.");
    manualLat.focus();
    return;
  }

  if (button.classList.contains("del")) {
    const updated = shops.filter(item => item.id !== shop.id);

    await chrome.storage.local.set({ shops: updated });

    if (nameInput.dataset.editId === shop.id) {
      delete nameInput.dataset.editId;
      saveButton.textContent = "💾 Save";
    }

    await renderShops();
    showStatus(`${shop.name} deleted.`, "ok");
  }
});

async function load() {
  await renderShops();
  updatePreview();
}

load();