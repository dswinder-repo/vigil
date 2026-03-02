import { useEffect, useRef } from 'react';
import { useDashboardStore } from '@/stores/dashboard-store';
import type { NormalizedEvent } from '@/lib/types';

export function useAlerts(events: NormalizedEvent[]) {
  const alertsEnabled = useDashboardStore((s) => s.alertsEnabled);
  const alertMinSeverity = useDashboardStore((s) => s.alertMinSeverity);
  const alertCategories = useDashboardStore((s) => s.alertCategories);
  const alertSound = useDashboardStore((s) => s.alertSound);
  const seenIds = useRef(new Set<string>());

  useEffect(() => {
    if (!alertsEnabled) return;
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') {
      Notification.requestPermission();
      return;
    }
    if (Notification.permission !== 'granted') return;

    const candidates = events.filter(
      (e) =>
        e.severity >= alertMinSeverity &&
        alertCategories.includes(e.category) &&
        !seenIds.current.has(e.id)
    );

    for (const event of candidates) {
      seenIds.current.add(event.id);
      new Notification(`VIGIL — ${event.category.toUpperCase()} (SEV ${event.severity})`, {
        body: event.title,
        tag: event.id,
        requireInteraction: event.severity === 5,
      });
      if (alertSound) playAlertChime(event.severity);
    }
  }, [events, alertsEnabled, alertMinSeverity, alertCategories, alertSound]);
}

function playAlertChime(severity: number) {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = severity >= 5 ? 220 : severity >= 4 ? 330 : 440;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.8);
  } catch {
    // silent fail — AudioContext may be blocked
  }
}
