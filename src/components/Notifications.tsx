import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { api, dateLabel, errorMessage } from "../api.ts";
import { InlineError, SectionHeading } from "./UI.tsx";
export function DeviceNotifications({
  owner,
  timezone,
  notify,
}: {
  owner: string;
  timezone: string;
  notify: (m: string) => void;
}) {
  const [config, setConfig] = useState<any>(null),
    [deviceId, setDeviceId] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [preferences, setPreferences] = useState({
    actions: true,
    updates: false,
    comparisons: false,
    quietHours: true,
  });
  const supported =
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window &&
    window.isSecureContext;
  useEffect(() => {
    let active = true;
    api("/push")
      .then((v) => {
        if (!active) return;
        setConfig(v);
        try {
          const id = localStorage.getItem("shuttl:push:" + owner),
            device = v.devices.find((d: any) => d.id === id);
          if (device) {
            setDeviceId(device.id);
            setPreferences(device.preferences);
          }
        } catch {}
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      });
    return () => {
      active = false;
    };
  }, [owner]);
  const enable = async () => {
    setBusy(true);
    setError("");
    try {
      if (!supported || !config?.configured)
        throw new Error(
          "Device alerts are unavailable here. Your SHUTTL inbox still works.",
        );
      const permission = await Notification.requestPermission();
      if (permission !== "granted")
        throw new Error(
          "Device alerts were not enabled. You can keep using your inbox.",
        );
      await navigator.serviceWorker.register("/sw.js");
      const registration = await navigator.serviceWorker.ready;
      const old = await registration.pushManager.getSubscription();
      if (old) await old.unsubscribe();
      const encoded = config.publicKey.replace(/-/g, "+").replace(/_/g, "/");
      const bytes = Uint8Array.from(
        atob(encoded + "=".repeat((4 - (encoded.length % 4)) % 4)),
        (c) => c.charCodeAt(0),
      );
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: bytes.buffer,
      });
      const result = await api("/push", {
        subscription: subscription.toJSON(),
        preferences,
      });
      setDeviceId(result.id);
      try {
        localStorage.setItem("shuttl:push:" + owner, result.id);
      } catch {}
      setConfig({
        ...config,
        devices: [
          ...config.devices.filter((d: any) => d.id !== result.id),
          { id: result.id, preferences, createdAt: new Date().toISOString() },
        ],
      });
      notify(
        "Device alerts enabled with your choices. Delivery also depends on your browser and device.",
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  async function disable(id: string) {
    setBusy(true);
    setError("");
    try {
      await api("/push/" + id, {}, "DELETE");
      setConfig({
        ...config,
        devices: config.devices.filter((d: any) => d.id !== id),
      });
      if (id === deviceId) {
        setDeviceId(null);
        try {
          localStorage.removeItem("shuttl:push:" + owner);
          const registration = await navigator.serviceWorker.getRegistration();
          const subscription =
            await registration?.pushManager.getSubscription();
          await subscription?.unsubscribe();
        } catch {}
      }
      notify("SHUTTL alerts disabled for that device.");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel settings-panel">
      <SectionHeading title="Your device alerts" />
      <p className="form-help">
        Choose useful updates. Alerts show a discreet message; names and rating
        numbers stay inside SHUTTL. Signing out stops this session’s device
        alerts.
      </p>
      <InlineError message={error} />
      {!config ? (
        <p className="form-help">Checking notification availability…</p>
      ) : (
        <>
          {!supported || !config.configured ? (
            <p className="notice neutral">
              Device alerts are unavailable here. Your SHUTTL inbox still works.
            </p>
          ) : (
            <>
              {[
                ["actions", "Result requests and invitations"],
                ["updates", "Published progress and corrections"],
                ["comparisons", "Supported friend lead changes"],
                ["quietHours", `Quiet hours: 21:00–08:00 (${timezone})`],
              ].map(([key, label]) => (
                <label className="check-line" key={key}>
                  <input
                    type="checkbox"
                    checked={preferences[key as keyof typeof preferences]}
                    onChange={(e) =>
                      setPreferences({
                        ...preferences,
                        [key]: e.target.checked,
                      })
                    }
                  />
                  <span>{label}</span>
                </label>
              ))}
              {deviceId ? (
                <>
                  <button
                    className="button secondary block"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        await api("/push/" + deviceId, preferences, "PATCH");
                        notify("Your device alert choices are saved.");
                      } catch (e) {
                        setError(errorMessage(e));
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Save alert choices
                  </button>
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() => disable(deviceId)}
                  >
                    <BellOff size={16} /> Disable this device’s alerts
                  </button>
                </>
              ) : (
                <button
                  className="button secondary block"
                  disabled={busy}
                  onClick={enable}
                >
                  <Bell size={17} />
                  {busy
                    ? "Enabling your alerts…"
                    : "Enable alerts on this device"}
                </button>
              )}
              <p className="form-help">
                On iPhone and iPad, add SHUTTL to your Home Screen before
                enabling. Alerts need browser permission and can be limited by
                device settings.
              </p>
            </>
          )}
          {config.devices
            .filter((d: any) => d.id !== deviceId)
            .map((d: any, i: number) => (
              <div className="field-row" key={d.id}>
                <span>
                  Notification device {i + 1}
                  <small style={{ display: "block" }}>
                    Added {dateLabel(d.createdAt)}
                  </small>
                </span>
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => disable(d.id)}
                >
                  Disable
                </button>
              </div>
            ))}
        </>
      )}
    </section>
  );
}
