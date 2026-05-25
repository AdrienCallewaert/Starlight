const DEMO_LOCATION = {
  latitude: 50.8503,
  longitude: 4.3517,
  altitude: null,
  accuracy: null,
  source: "demo"
};

export class LocationService {
  constructor() {
    this.watchId = null;
  }

  async request() {
    if (!navigator.geolocation) {
      return {
        status: "unavailable",
        message: "GPS non disponible. Position de demonstration activee.",
        location: { ...DEMO_LOCATION }
      };
    }

    try {
      const position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 30000
        });
      });

      return {
        status: "granted",
        message: "Position GPS active.",
        location: fromPosition(position, "gps")
      };
    } catch (error) {
      return {
        status: "denied",
        message: `GPS indisponible: ${readableGeoError(error)}. Position de demonstration activee.`,
        location: { ...DEMO_LOCATION }
      };
    }
  }

  watch(onUpdate) {
    if (!navigator.geolocation || this.watchId !== null) {
      return;
    }

    this.watchId = navigator.geolocation.watchPosition(
      (position) => onUpdate(fromPosition(position, "gps")),
      () => {},
      {
        enableHighAccuracy: true,
        maximumAge: 15000,
        timeout: 20000
      }
    );
  }

  stop() {
    if (this.watchId !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
  }
}

function fromPosition(position, source) {
  const { latitude, longitude, altitude, accuracy } = position.coords;

  return {
    latitude,
    longitude,
    altitude,
    accuracy,
    source
  };
}

function readableGeoError(error) {
  if (!error) {
    return "permission refusee";
  }

  if (error.code === 1) {
    return "permission refusee";
  }

  if (error.code === 2) {
    return "position introuvable";
  }

  if (error.code === 3) {
    return "delai depasse";
  }

  return error.message || "erreur navigateur";
}
