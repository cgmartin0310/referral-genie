import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { milesBetween, nearestClinic } from './distance';

describe('distance', () => {
  it('measures miles between two points', () => {
    // Kinston to La Grange, NC: about 14 miles apart.
    const miles = milesBetween({ lat: 35.2627, lng: -77.5816 }, { lat: 35.3068, lng: -77.7883 });
    assert.ok(miles > 11 && miles < 15, String(miles));
  });

  it('picks the nearest clinic and skips clinics without a place', () => {
    const practice = { latitude: 35.2627, longitude: -77.5816 };
    const nearest = nearestClinic(practice, [
      { id: 'far', name: 'Goldsboro', latitude: 35.3849, longitude: -77.9928 },
      { id: 'near', name: 'Kinston', latitude: 35.27, longitude: -77.59 },
      { id: 'none', name: 'No address', latitude: null, longitude: null },
    ]);
    assert.equal(nearest?.clinicName, 'Kinston');
    assert.ok((nearest?.miles ?? 99) < 1);
    assert.equal(nearestClinic({ latitude: null, longitude: null }, []), null);
  });
});
