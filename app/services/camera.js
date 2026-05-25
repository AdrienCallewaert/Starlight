export class CameraService {
  constructor() {
    this.stream = null;
  }

  async start(videoElement) {
    if (!navigator.mediaDevices?.getUserMedia) {
      return {
        status: "unavailable",
        message: "Camera non disponible. Le mode demo reste actif."
      };
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        }
      });

      videoElement.srcObject = this.stream;
      await videoElement.play();

      return {
        status: "granted",
        message: "Camera active."
      };
    } catch (error) {
      return {
        status: "denied",
        message: `Camera indisponible: ${readableMediaError(error)}. Le mode demo reste actif.`
      };
    }
  }

  stop() {
    if (!this.stream) {
      return;
    }

    this.stream.getTracks().forEach((track) => track.stop());
    this.stream = null;
  }
}

function readableMediaError(error) {
  if (!error) {
    return "permission refusee";
  }

  if (error.name === "NotAllowedError" || error.name === "SecurityError") {
    return "permission refusee";
  }

  if (error.name === "NotFoundError" || error.name === "OverconstrainedError") {
    return "aucune camera compatible";
  }

  return error.message || "erreur navigateur";
}
