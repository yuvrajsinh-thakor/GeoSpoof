const attached = new Set();

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      const tabs = await chrome.tabs.query({active: true, lastFocusedWindow: true});
      const tab = tabs[0];
      if (!tab?.id) throw new Error("No active tab.");

      if (msg.type === "apply") {
        const p = msg.position;
        await attach(tab.id);
        await chrome.debugger.sendCommand(
          {tabId: tab.id},
          "Emulation.setGeolocationOverride",
          {
            latitude: p.latitude,
            longitude: p.longitude,
            accuracy: p.accuracy
          }
        );
        await chrome.storage.local.set({
          enabled: true,
          latitude: p.latitude,
          longitude: p.longitude,
          accuracy: p.accuracy
        });
        sendResponse({ok: true});
        return;
      }

      if (msg.type === "clear") {
        await clear(tab.id);
        sendResponse({ok: true});
        return;
      }

      throw new Error("Unknown command.");
    } catch (e) {
      sendResponse({ok: false, error: e?.message || String(e)});
    }
  })();
  return true;
});

async function attach(tabId) {
  if (attached.has(tabId)) return;
  try {
    await chrome.debugger.attach({tabId}, "1.3");
    attached.add(tabId);
  } catch (e) {
    if ((e.message || "").toLowerCase().includes("already attached")) {
      attached.add(tabId);
      return;
    }
    throw e;
  }
}

async function clear(tabId) {
  if (!attached.has(tabId)) {
    await chrome.storage.local.set({enabled: false});
    return;
  }

  try {
    await chrome.debugger.sendCommand(
      {tabId},
      "Emulation.clearGeolocationOverride"
    );
  } catch (_) {}

  try {
    await chrome.debugger.detach({tabId});
  } catch (_) {}

  attached.delete(tabId);
  await chrome.storage.local.set({enabled: false});
}

chrome.debugger.onDetach.addListener(({tabId}) => attached.delete(tabId));
chrome.tabs.onRemoved.addListener((tabId) => attached.delete(tabId));