import UAParser from 'ua-parser-js';

export function parseUserAgent(userAgentString) {
    if (!userAgentString) {
        return {
            device_type: 'unknown',
            browser_name: 'unknown',
            browser_version: null,
            os_name: 'unknown',
            os_version: null,
            is_bot: false
        };
    }

    const parser = new UAParser(userAgentString);
    const result = parser.getResult();
    
    const botPatterns = [
        /bot/i, /crawler/i, /spider/i, /scraper/i,
        /facebookexternalhit/i, /whatsapp/i, /telegram/i,
        /slackbot/i, /discord/i, /twitterbot/i,
        /linkedinbot/i, /pinterest/i, /tumblr/i,
        /google/i, /bing/i, /yandex/i, /baidu/i,
        /duckduck/i, /archive\.org/i, /semrush/i,
        /ahrefs/i, /moz\.com/i, /majestic/i
    ];
    
    const is_bot = botPatterns.some(pattern => pattern.test(userAgentString));
    
    let device_type = 'desktop';
    if (result.device.type) {
        device_type = result.device.type.toLowerCase();
    } else if (result.device.model) {
        device_type = 'mobile';
    } else if (/tablet|ipad/i.test(userAgentString)) {
        device_type = 'tablet';
    } else if (/mobile|android|iphone/i.test(userAgentString)) {
        device_type = 'mobile';
    }
    
    return {
        device_type,
        browser_name: result.browser.name || 'unknown',
        browser_version: result.browser.version || null,
        os_name: result.os.name || 'unknown',
        os_version: result.os.version || null,
        is_bot
    };
}

export function getClientIp(request) {
    const forwardedFor = request.headers['x-forwarded-for'];
    if (forwardedFor) {
        const ips = forwardedFor.split(',').map(ip => ip.trim());
        return ips[0];
    }
    
    const realIp = request.headers['x-real-ip'];
    if (realIp) {
        return realIp;
    }
    
    const cfConnectingIp = request.headers['cf-connecting-ip'];
    if (cfConnectingIp) {
        return cfConnectingIp;
    }
    
    return request.ip || request.connection?.remoteAddress || '127.0.0.1';
}

export function extractUtmParams(query) {
    if (!query || typeof query !== 'object') {
        return {
            utm_source: null,
            utm_medium: null,
            utm_campaign: null,
            utm_term: null,
            utm_content: null
        };
    }
    
    return {
        utm_source: query.utm_source || null,
        utm_medium: query.utm_medium || null,
        utm_campaign: query.utm_campaign || null,
        utm_term: query.utm_term || null,
        utm_content: query.utm_content || null
    };
}

export function sanitizeHeaders(headers) {
    const sanitized = {};
    const allowedHeaders = [
        'user-agent',
        'referer',
        'referrer',
        'accept-language',
        'accept-encoding',
        'cache-control',
        'dnt',
        'sec-ch-ua',
        'sec-ch-ua-mobile',
        'sec-ch-ua-platform'
    ];
    
    for (const header of allowedHeaders) {
        if (headers[header]) {
            sanitized[header] = headers[header];
        }
    }
    
    return sanitized;
}

export function getReferrerDomain(referrer) {
    if (!referrer) return null;
    
    try {
        const url = new URL(referrer);
        return url.hostname;
    } catch {
        return null;
    }
}

export function isValidIpAddress(ip) {
    if (!ip) return false;
    
    const ipv4Pattern = /^(\d{1,3}\.){3}\d{1,3}$/;
    const ipv6Pattern = /^([0-9a-fA-F]{0,4}:){7}[0-9a-fA-F]{0,4}$/;
    
    if (ipv4Pattern.test(ip)) {
        const parts = ip.split('.');
        return parts.every(part => {
            const num = parseInt(part, 10);
            return num >= 0 && num <= 255;
        });
    }
    
    return ipv6Pattern.test(ip);
}

export function isPrivateIp(ip) {
    if (!ip) return false;
    
    const privateRanges = [
        /^10\./,
        /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
        /^192\.168\./,
        /^127\./,
        /^169\.254\./,
        /^::1$/,
        /^fe80:/i,
        /^fc00:/i,
        /^fd00:/i
    ];
    
    return privateRanges.some(range => range.test(ip));
}

export function generateVisitorId(request) {
    const components = [
        getClientIp(request),
        request.headers['user-agent'],
        request.headers['accept-language'],
        request.headers['accept-encoding']
    ].filter(Boolean);
    
    const crypto = require('crypto');
    return crypto
        .createHash('sha256')
        .update(components.join('|'))
        .digest('hex')
        .substring(0, 16);
}

export function getCookieOptions(isProduction = false) {
    return {
        httpOnly: true,
        secure: isProduction,
        sameSite: 'lax',
        path: '/',
        maxAge: 365 * 24 * 60 * 60
    };
}

export function parseAcceptLanguage(acceptLanguage) {
    if (!acceptLanguage) return 'en';
    
    const languages = acceptLanguage
        .split(',')
        .map(lang => {
            const [code, q = '1'] = lang.trim().split(';q=');
            return {
                code: code.split('-')[0].toLowerCase(),
                quality: parseFloat(q)
            };
        })
        .sort((a, b) => b.quality - a.quality);
    
    return languages[0]?.code || 'en';
}