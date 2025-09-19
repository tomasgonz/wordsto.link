const RESERVED_KEYWORDS = [
  'admin', 'api', 'app', 'auth', 'dashboard', 'login', 'logout',
  'register', 'settings', 'profile', 'account', 'billing',
  'terms', 'privacy', 'help', 'support', 'docs', 'documentation'
];

const RESERVED_IDENTIFIERS = [
  'admin', 'api', 'app', 'www', 'mail', 'ftp', 'blog',
  'shop', 'store', 'cdn', 'static', 'assets'
];

export function parseUrlPattern(path) {
  const cleanPath = path.replace(/^\/+|\/+$/g, '');
  
  if (!cleanPath) {
    return { identifier: null, keywords: [], pattern: 'empty' };
  }
  
  const segments = cleanPath.split('/').filter(Boolean);
  
  if (segments.length === 0) {
    return { identifier: null, keywords: [], pattern: 'empty' };
  }
  
  if (segments.length === 1) {
    return {
      identifier: null,
      keywords: [segments[0]],
      pattern: 'keyword'
    };
  }
  
  const firstSegment = segments[0];
  const isIdentifier = !RESERVED_KEYWORDS.includes(firstSegment.toLowerCase());
  
  if (isIdentifier && segments.length === 2) {
    return {
      identifier: firstSegment,
      keywords: [segments[1]],
      pattern: 'identifier-keyword'
    };
  }
  
  if (isIdentifier && segments.length > 2) {
    return {
      identifier: firstSegment,
      keywords: segments.slice(1),
      pattern: 'identifier-multi-keyword'
    };
  }
  
  return {
    identifier: null,
    keywords: segments,
    pattern: 'multi-keyword'
  };
}

export function validateKeywords(keywords) {
  const errors = [];
  const BANNED_KEYWORDS = RESERVED_KEYWORDS.filter(k => !['api', 'docs'].includes(k));
  
  for (const keyword of keywords) {
    if (!keyword || keyword.trim() === '') {
      errors.push('Empty keyword not allowed');
      continue;
    }
    
    if (keyword.length > 100) {
      errors.push('Keyword exceeds maximum length of 100 characters');
      continue;
    }
  
    if (BANNED_KEYWORDS.includes(keyword.toLowerCase())) {
      errors.push(`Reserved keyword: ${keyword}`);
      continue;
    }

    if (!/^[a-zA-Z0-9-_.]+$/.test(keyword)) {
      errors.push(`Invalid characters in keyword: ${keyword}`);
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

export function validateIdentifier(identifier) {
  if (!identifier) {
    return { valid: true, errors: [] };
  }
  
  const errors = [];
  
  if (identifier.length < 3) {
    errors.push('Identifier must be at least 3 characters');
  }
  
  if (identifier.length > 50) {
    errors.push('Identifier exceeds maximum length of 50 characters');
  }
  
  if (RESERVED_IDENTIFIERS.includes(identifier.toLowerCase())) {
    errors.push(`Reserved identifier: ${identifier}`);
  }
  
  if (!/^[a-zA-Z0-9-_]+$/.test(identifier)) {
    errors.push('Identifier can only contain letters, numbers, hyphens, and underscores');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

export function generateShortUrl(urlData, domain = 'wordsto.link') {
  const parts = [];
  
  if (urlData.identifier) {
    parts.push(urlData.identifier);
  }
  
  if (urlData.keywords && urlData.keywords.length > 0) {
    parts.push(...urlData.keywords);
  }
  
  const path = parts.join('/');
  return path ? `${domain}/${path}` : domain;
}

export function extractDomain(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    return null;
  }
}

export function normalizeUrl(url) {
  if (!url) return null;
  
  url = url.trim();
  
  if (!/^https?:\/\//i.test(url)) {
    url = 'https://' + url;
  }
  
  try {
    const urlObj = new URL(url);
    return urlObj.href;
  } catch {
    return null;
  }
}
