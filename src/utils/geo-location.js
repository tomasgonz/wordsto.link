import { isPrivateIp } from './request-utils.js';

const geoCache = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000;

export async function getGeoLocation(ip) {
    if (!ip || isPrivateIp(ip)) {
        return {
            country_code: null,
            country_name: null,
            city: null,
            region: null,
            postal_code: null,
            latitude: null,
            longitude: null,
            timezone: null
        };
    }

    const cached = geoCache.get(ip);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.data;
    }

    try {
        const response = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,countryCode,region,regionName,city,zip,lat,lon,timezone`, {
            signal: AbortSignal.timeout(2000)
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();

        if (data.status === 'fail') {
            throw new Error('IP lookup failed');
        }

        const geoData = {
            country_code: data.countryCode || null,
            country_name: data.country || null,
            city: data.city || null,
            region: data.regionName || null,
            postal_code: data.zip || null,
            latitude: data.lat || null,
            longitude: data.lon || null,
            timezone: data.timezone || null
        };

        geoCache.set(ip, {
            data: geoData,
            timestamp: Date.now()
        });

        if (geoCache.size > 10000) {
            const oldestKey = geoCache.keys().next().value;
            geoCache.delete(oldestKey);
        }

        return geoData;
    } catch (error) {
        console.debug(`Geo lookup failed for ${ip}:`, error.message);
        
        return {
            country_code: null,
            country_name: null,
            city: null,
            region: null,
            postal_code: null,
            latitude: null,
            longitude: null,
            timezone: null
        };
    }
}

export function clearGeoCache() {
    geoCache.clear();
}

export function getGeoCacheSize() {
    return geoCache.size;
}