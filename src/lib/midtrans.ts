const SNAP_SCRIPT_ID = "midtrans-snap-script";

function requiredClientKey(): string {
  const key = import.meta.env.VITE_MIDTRANS_CLIENT_KEY;
  if (!key) throw new Error("VITE_MIDTRANS_CLIENT_KEY belum dikonfigurasi.");
  return key;
}

export function isMidtransProduction(): boolean {
  return import.meta.env.VITE_MIDTRANS_IS_PRODUCTION === "true";
}

export function loadMidtransSnap(): Promise<NonNullable<Window["snap"]>> {
  if (window.snap) return Promise.resolve(window.snap);

  const existing = document.getElementById(SNAP_SCRIPT_ID) as HTMLScriptElement | null;
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener("load", () => window.snap ? resolve(window.snap) : reject(new Error("Midtrans Snap gagal dimuat.")), { once: true });
      existing.addEventListener("error", () => reject(new Error("Midtrans Snap gagal dimuat.")), { once: true });
    });
  }

  const script = document.createElement("script");
  script.id = SNAP_SCRIPT_ID;
  script.src = isMidtransProduction()
    ? "https://app.midtrans.com/snap/snap.js"
    : "https://app.sandbox.midtrans.com/snap/snap.js";
  script.async = true;
  script.dataset.clientKey = requiredClientKey();

  return new Promise((resolve, reject) => {
    script.onload = () => window.snap ? resolve(window.snap) : reject(new Error("Midtrans Snap gagal dimuat."));
    script.onerror = () => reject(new Error("Midtrans Snap gagal dimuat."));
    document.head.appendChild(script);
  });
}
