/** Miles between two points on the earth (haversine). */
export function milesBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const radius = 3958.8;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * radius * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface Located {
  id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
}

/** The nearest of a subscriber's clinics to a point, with the distance in miles (one decimal). */
export function nearestClinic(
  point: { latitude: number | null; longitude: number | null },
  clinics: Located[],
): { clinicId: string; clinicName: string; miles: number } | null {
  if (point.latitude == null || point.longitude == null) return null;
  let best: { clinicId: string; clinicName: string; miles: number } | null = null;
  for (const clinic of clinics) {
    if (clinic.latitude == null || clinic.longitude == null) continue;
    const miles = milesBetween({ lat: point.latitude, lng: point.longitude }, { lat: clinic.latitude, lng: clinic.longitude });
    if (!best || miles < best.miles) best = { clinicId: clinic.id, clinicName: clinic.name, miles: Math.round(miles * 10) / 10 };
  }
  return best;
}
