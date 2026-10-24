import { NOTIFICATION_SOUNDS, type NotificationSoundId } from "./settings";

export const SOUND_LABELS: Record<NotificationSoundId, string> = {
  chime: "Chime",
  bell: "Bell",
  ping: "Ping",
  alert: "Alert",
  soft: "Soft",
};

const SOUND_URLS: Record<NotificationSoundId, string> = {
  chime: "/sounds/chime.wav",
  bell: "/sounds/bell.wav",
  ping: "/sounds/ping.wav",
  alert: "/sounds/alert.wav",
  soft: "/sounds/soft.wav",
};

let clip: HTMLAudioElement | null = null;
let primed = false;

function prime() {
  primed = true;
  window.removeEventListener("pointerdown", prime, true);
  window.removeEventListener("keydown", prime, true);
}

/** Later alerts may play only after the page has been clicked or keyed. */
export function armNotificationAudio() {
  if (typeof window === "undefined" || primed) return;
  window.addEventListener("pointerdown", prime, true);
  window.addEventListener("keydown", prime, true);
}

function playClip(id: NotificationSoundId) {
  if (clip) {
    clip.pause();
    clip.currentTime = 0;
  }
  const audio = new Audio(SOUND_URLS[id]);
  clip = audio;
  void audio.play().catch(() => {});
}

/** Plays when the page has already been used. Stays silent before that. */
export function playNotificationSound(id: NotificationSoundId | null) {
  if (!id || typeof window === "undefined" || !primed) return;
  playClip(id);
}

/** Preview is a click, so it plays immediately and unlocks later alerts. */
export function previewNotificationSound(id: NotificationSoundId) {
  if (typeof window === "undefined") return;
  if (!NOTIFICATION_SOUNDS.includes(id)) return;
  primed = true;
  playClip(id);
}
