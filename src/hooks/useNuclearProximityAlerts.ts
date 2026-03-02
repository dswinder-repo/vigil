import { useEffect, useRef } from 'react';
import { NUCLEAR_FACILITIES } from '@/lib/geo/nuclear-facilities';
import type { NormalizedEvent } from '@/lib/types';

const PROXIMITY_KM = 100;
const MIN_SEVERITY = 3;
const ALERT_CATEGORIES: NormalizedEvent['category'][] = ['disaster', 'conflict'];

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

export function useNuclearProximityAlerts(events: NormalizedEvent[]) {
  const seenIds = useRef(new Set<string>());

  useEffect(() => {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') {
      Notification.requestPermission();
      return;
    }
    if (Notification.permission !== 'granted') return;

    const candidates = events.filter(
      (e) =>
        ALERT_CATEGORIES.includes(e.category) &&
        e.severity >= MIN_SEVERITY &&
        e.coordinates != null &&
        !seenIds.current.has(e.id)
    );

    for (const event of candidates) {
      seenIds.current.add(event.id);
      const [eLng, eLat] = event.coordinates!;

      for (const facility of NUCLEAR_FACILITIES) {
        const dist = haversineKm(eLat, eLng, facility.lat, facility.lon);
        if (dist <= PROXIMITY_KM) {
          new Notification('⚠️ NUCLEAR PROXIMITY ALERT', {
            body: `${event.title} — ${Math.round(dist)}km from ${facility.name}`,
            tag: `nuclear-proximity-${event.id}-${facility.id}`,
            requireInteraction: true,
          });
        }
      }
    }
  }, [events]);
}
