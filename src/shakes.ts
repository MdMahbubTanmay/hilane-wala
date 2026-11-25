
export type ShakeCallback = () => void;

let cleanup: (() => void) | null = null;

const SHAKE_THRESHOLD = 7;
const QUIET_THRESHOLD = 2.5;
const COOLDOWN = 180;

export async function requestMotionPermission(): Promise<boolean> {
  if (!("DeviceMotionEvent" in window)) return false;

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

  let gravity = { x: 0, y: 0, z: 0 };
  let initialized = false;
  let readyForShake = true;
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
      ) return;

      if (!initialized) {
        gravity = {
          x: raw.x,
          y: raw.y,
          z: raw.z
        };

        initialized = true;
        return;
      }

      const alpha = 0.85;

      gravity.x = alpha * gravity.x + (1 - alpha) * raw.x;
      gravity.y = alpha * gravity.y + (1 - alpha) * raw.y;
      gravity.z = alpha * gravity.z + (1 - alpha) * raw.z;

      x = raw.x - gravity.x;
      y = raw.y - gravity.y;
      z = raw.z - gravity.z;
    }

    const magnitude = Math.sqrt(x * x + y * y + z * z);

    const now = Date.now();


    if (magnitude < QUIET_THRESHOLD) {
      readyForShake = true;
      return;
    }

    if (
      magnitude >= SHAKE_THRESHOLD &&
      readyForShake &&
      now - lastShake >= COOLDOWN
    ) {
      lastShake = now;
      readyForShake = false;

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
  cleanup?.();
  cleanup = null;
}
