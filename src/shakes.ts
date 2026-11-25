
export type ShakeCallback = () => void;

let cleanup: (() => void) | null = null;


const SHAKE_THRESHOLD = 3.5;
const COOLDOWN = 120;


const GRAVITY_ALPHA = 0.8;

export async function requestMotionPermission(): Promise<boolean> {
  if (!("DeviceMotionEvent" in window)) {
    return false;
  }

  const Motion = DeviceMotionEvent as typeof DeviceMotionEvent & {
    requestPermission?: () => Promise<"granted" | "denied">;
  };

  if (typeof Motion.requestPermission === "function") {
    try {
      return (await Motion.requestPermission()) === "granted";
    } catch {
      return false;
    }
  }

  return true;
}

export function startShakeDetection(callback: ShakeCallback) {
  stopShakeDetection();

  let gravity = {
    x: 0,
    y: 0,
    z: 0
  };

  let initialized = false;
  let lastShake = 0;

  const handleMotion = (event: DeviceMotionEvent) => {
    let x: number;
    let y: number;
    let z: number;

    const acceleration = event.acceleration;


    if (
      acceleration &&
      acceleration.x !== null &&
      acceleration.y !== null &&
      acceleration.z !== null
    ) {
      x = acceleration.x;
      y = acceleration.y;
      z = acceleration.z;
    } else {

      const raw = event.accelerationIncludingGravity;

      if (
        !raw ||
        raw.x === null ||
        raw.y === null ||
        raw.z === null
      ) {
        return;
      }

      if (!initialized) {
        gravity = {
          x: raw.x,
          y: raw.y,
          z: raw.z
        };

        initialized = true;
        return;
      }

      gravity.x =
        GRAVITY_ALPHA * gravity.x +
        (1 - GRAVITY_ALPHA) * raw.x;

      gravity.y =
        GRAVITY_ALPHA * gravity.y +
        (1 - GRAVITY_ALPHA) * raw.y;

      gravity.z =
        GRAVITY_ALPHA * gravity.z +
        (1 - GRAVITY_ALPHA) * raw.z;

      x = raw.x - gravity.x;
      y = raw.y - gravity.y;
      z = raw.z - gravity.z;
    }


    const magnitude = Math.sqrt(
      x * x +
      y * y +
      z * z
    );

    const now = Date.now();


    if (
      magnitude >= SHAKE_THRESHOLD &&
      now - lastShake >= COOLDOWN
    ) {
      lastShake = now;
      callback();
    }
  };

  window.addEventListener("devicemotion", handleMotion, {
    passive: true
  });

  cleanup = () => {
    window.removeEventListener("devicemotion", handleMotion);
  };
}

export function stopShakeDetection() {
  if (cleanup) {
    cleanup();
    cleanup = null;
  }
}
