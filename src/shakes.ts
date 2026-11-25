
export type ShakeCallback = () => void;

let cleanup: (() => void) | null = null;

const THRESHOLD = 13;
const COOLDOWN = 280;

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

  let previous = { x: 0, y: 0, z: 0 };
  let lastShake = 0;
  let initialized = false;

  const handleMotion = (event: DeviceMotionEvent) => {
    const acceleration = event.acceleration;

    if (
      !acceleration ||
      acceleration.x === null ||
      acceleration.y === null ||
      acceleration.z === null
    ) {
      return;
    }

    const { x, y, z } = acceleration;

    if (!initialized) {
      previous = { x, y, z };
      initialized = true;
      return;
    }

    const dx = x - previous.x;
    const dy = y - previous.y;
    const dz = z - previous.z;

    previous = { x, y, z };

    const magnitude = Math.sqrt(dx * dx + dy * dy + dz * dz);

    const now = Date.now();

    if (magnitude > THRESHOLD && now - lastShake >= COOLDOWN) {
      lastShake = now;
      callback();
    }
  };

  window.addEventListener("devicemotion", handleMotion);

  cleanup = () => {
    window.removeEventListener("devicemotion", handleMotion);
  };
}

export function stopShakeDetection() {
  cleanup?.();
  cleanup = null;
}
