export const VALIDATION_RULES = {
    identifier: {
        minLength: 2,
        maxLength: 20,
        pattern: /^[a-z0-9][a-z0-9-_]*[a-z0-9]$/,
        description: '2-20 characters, alphanumeric with hyphens/underscores, must start and end with alphanumeric'
    },
    keyword: {
        minLength: 1,
        maxLength: 30,
        pattern: /^[a-z0-9][a-z0-9-_]*$/,
        description: '1-30 characters, alphanumeric with hyphens/underscores'
    },
    maxKeywords: 5,
    url: {
        maxLength: 2048,
        pattern: /^https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)$/,
        description: 'Valid HTTP or HTTPS URL'
    },
    shortCode: {
        minLength: 4,
        maxLength: 12,
        pattern: /^[a-zA-Z0-9]+$/,
        description: '4-12 alphanumeric characters'
    }
};

export function validateIdentifier(identifier) {
    if (!identifier) return false;
    
    const normalized = identifier.toLowerCase();
    
    if (normalized.length < VALIDATION_RULES.identifier.minLength || 
        normalized.length > VALIDATION_RULES.identifier.maxLength) {
        return false;
    }
    
    return VALIDATION_RULES.identifier.pattern.test(normalized);
}

export function validateKeyword(keyword) {
    if (!keyword) return false;
    
    const normalized = keyword.toLowerCase();
    
    if (normalized.length < VALIDATION_RULES.keyword.minLength || 
        normalized.length > VALIDATION_RULES.keyword.maxLength) {
        return false;
    }
    
    return VALIDATION_RULES.keyword.pattern.test(normalized);
}

export function validateKeywords(keywords) {
    if (!Array.isArray(keywords)) return false;
    
    if (keywords.length === 0 || keywords.length > VALIDATION_RULES.maxKeywords) {
        return false;
    }
    
    return keywords.every(keyword => validateKeyword(keyword));
}

export function validateUrl(url) {
    if (!url) return false;
    
    if (url.length > VALIDATION_RULES.url.maxLength) {
        return false;
    }
    
    return VALIDATION_RULES.url.pattern.test(url);
}

export function validateShortCode(shortCode) {
    if (!shortCode) return true;
    
    if (shortCode.length < VALIDATION_RULES.shortCode.minLength || 
        shortCode.length > VALIDATION_RULES.shortCode.maxLength) {
        return false;
    }
    
    return VALIDATION_RULES.shortCode.pattern.test(shortCode);
}

export function normalizeIdentifier(identifier) {
    if (!identifier) return null;
    
    const normalized = identifier.toLowerCase().trim();
    
    if (!validateIdentifier(normalized)) {
        throw new Error(`Invalid identifier: ${VALIDATION_RULES.identifier.description}`);
    }
    
    return normalized;
}

export function normalizeKeyword(keyword) {
    if (!keyword) return null;
    
    const normalized = keyword
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9-_]/g, '');
    
    if (!validateKeyword(normalized)) {
        throw new Error(`Invalid keyword: ${VALIDATION_RULES.keyword.description}`);
    }
    
    return normalized;
}

export function normalizeKeywords(keywords) {
    if (!Array.isArray(keywords)) {
        throw new Error('Keywords must be an array');
    }
    
    const normalized = keywords
        .filter(k => k && typeof k === 'string')
        .map(k => normalizeKeyword(k))
        .filter(Boolean);
    
    const unique = [...new Set(normalized)];
    
    if (unique.length === 0) {
        throw new Error('At least one valid keyword is required');
    }
    
    if (unique.length > VALIDATION_RULES.maxKeywords) {
        throw new Error(`Maximum ${VALIDATION_RULES.maxKeywords} keywords allowed`);
    }
    
    return unique;
}

export function sanitizeUrl(url) {
    if (!url) return null;
    
    url = url.trim();
    
    if (!/^https?:\/\//i.test(url)) {
        url = 'https://' + url;
    }
    
    if (!validateUrl(url)) {
        throw new Error(`Invalid URL: ${VALIDATION_RULES.url.description}`);
    }
    
    try {
        const parsed = new URL(url);
        
        const blockedHosts = [
            'localhost',
            '127.0.0.1',
            '0.0.0.0',
            '::1'
        ];
        
        if (blockedHosts.includes(parsed.hostname)) {
            throw new Error('Local URLs are not allowed');
        }
        
        if (parsed.hostname.endsWith('.local')) {
            throw new Error('Local network URLs are not allowed');
        }
        
        const privateIpRanges = [
            /^10\./,
            /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
            /^192\.168\./
        ];
        
        if (privateIpRanges.some(range => range.test(parsed.hostname))) {
            throw new Error('Private IP addresses are not allowed');
        }
        
        return parsed.href;
    } catch (error) {
        if (error.message.includes('not allowed')) {
            throw error;
        }
        throw new Error('Invalid URL format');
    }
}

export const createUrlSchema = {
    type: 'object',
    required: ['keywords', 'original_url'],
    properties: {
        identifier: {
            type: 'string',
            minLength: VALIDATION_RULES.identifier.minLength,
            maxLength: VALIDATION_RULES.identifier.maxLength,
            pattern: VALIDATION_RULES.identifier.pattern.source
        },
        keywords: {
            type: 'array',
            items: {
                type: 'string',
                minLength: VALIDATION_RULES.keyword.minLength,
                maxLength: VALIDATION_RULES.keyword.maxLength,
                pattern: VALIDATION_RULES.keyword.pattern.source
            },
            minItems: 1,
            maxItems: VALIDATION_RULES.maxKeywords
        },
        original_url: {
            type: 'string',
            format: 'uri',
            maxLength: VALIDATION_RULES.url.maxLength
        },
        short_code: {
            type: 'string',
            minLength: VALIDATION_RULES.shortCode.minLength,
            maxLength: VALIDATION_RULES.shortCode.maxLength,
            pattern: VALIDATION_RULES.shortCode.pattern.source
        },
        title: {
            type: 'string',
            maxLength: 255
        },
        description: {
            type: 'string',
            maxLength: 1000
        },
        expires_at: {
            type: 'string',
            format: 'date-time'
        },
        custom_metadata: {
            type: 'object',
            maxProperties: 10
        }
    },
    additionalProperties: false
};

export const updateUrlSchema = {
    type: 'object',
    properties: {
        keywords: {
            type: 'array',
            items: {
                type: 'string',
                minLength: VALIDATION_RULES.keyword.minLength,
                maxLength: VALIDATION_RULES.keyword.maxLength,
                pattern: VALIDATION_RULES.keyword.pattern.source
            },
            minItems: 1,
            maxItems: VALIDATION_RULES.maxKeywords
        },
        original_url: {
            type: 'string',
            format: 'uri',
            maxLength: VALIDATION_RULES.url.maxLength
        },
        title: {
            type: 'string',
            maxLength: 255
        },
        description: {
            type: 'string',
            maxLength: 1000
        },
        is_active: {
            type: 'boolean'
        },
        expires_at: {
            type: ['string', 'null'],
            format: 'date-time'
        },
        custom_metadata: {
            type: 'object',
            maxProperties: 10
        }
    },
    additionalProperties: false
};