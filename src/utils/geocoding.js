/**
 * Reverse geocodes coordinates to extract Barangay and Address metadata.
 * @param {number} lat 
 * @param {number} lng 
 * @returns {Promise<{barangay: string, fullAddress: string, city: string}>}
 */
export async function reverseGeocodeQC(lat, lng) {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`;

    try {
        const response = await fetch(url, {
            headers: {
                'Accept-Language': 'en-US,en;q=0.9',
                'User-Agent': 'E-TaponMo-PWA-Ideathon' // OpenStreetMap requires a custom User-Agent
            }
        });

        if (!response.ok) throw new Error('Geocoding request failed');

        const data = await response.json();
        const address = data.address || {};

        // Nominatim PH hierarchy mapping
        let rawBarangay =
            address.quarter ||
            address.suburb ||
            address.neighbourhood ||
            address.village ||
            'Unknown Barangay';

        // Cleanup: Remove prefixes like "Barangay " if present for uniform DB naming
        const barangay = rawBarangay.replace(/^Barangay\s+/i, '').trim();
        const city = address.city || address.town || 'Quezon City';

        return {
            barangay,
            city,
            fullAddress: data.display_name || `${lat}, ${lng}`
        };
    } catch (error) {
        console.error('Error during reverse geocoding:', error);
        return {
            barangay: 'Unassigned',
            city: 'Quezon City',
            fullAddress: `${lat.toFixed(5)}, ${lng.toFixed(5)}`
        };
    }
}