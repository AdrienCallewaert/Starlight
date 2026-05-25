export function isSecureRuntime() {
  return window.isSecureContext || location.hostname === "localhost" || location.hostname === "127.0.0.1";
}

export async function requestOrientationPermission() {
  if (!("DeviceOrientationEvent" in window)) {
    return {
      status: "unavailable",
      message: "Les capteurs d'orientation ne sont pas disponibles sur ce navigateur."
    };
  }

  const eventConstructor = window.DeviceOrientationEvent;

  if (typeof eventConstructor.requestPermission === "function") {
    try {
      const response = await eventConstructor.requestPermission();
      return {
        status: response === "granted" ? "granted" : "denied",
        message:
          response === "granted"
            ? "Orientation autorisee."
            : "Orientation refusee. Starlight utilise une orientation de demonstration."
      };
    } catch (error) {
      return {
        status: "denied",
        message: `Orientation indisponible: ${error.message || "permission refusee"}.`
      };
    }
  }

  return {
    status: "granted",
    message: "Orientation disponible."
  };
}

export function formatPermissionMessages(results) {
  return results
    .filter(Boolean)
    .filter((result) => result.status && result.status !== "granted")
    .map((result) => result.message)
    .join(" ");
}
