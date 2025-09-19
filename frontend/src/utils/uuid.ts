/**
 * Generate a UUID v4
 * Uses crypto.randomUUID if available, otherwise falls back to a polyfill
 */
export function generateUUID(): string {
  // Check if crypto.randomUUID is available and actually works
  if (typeof window !== 'undefined' && window.crypto && typeof window.crypto.randomUUID === 'function') {
    try {
      return window.crypto.randomUUID();
    } catch (e) {
      // Fall through to polyfill if randomUUID fails (Safari issue)
    }
  }
  
  // Fallback for older browsers
  // Generate UUID v4 using crypto.getRandomValues
  if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
    const bytes = new Uint8Array(16);
    window.crypto.getRandomValues(bytes);
    
    // Set version (4) and variant bits
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // Version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // Variant bits
    
    // Convert to hex string
    const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    
    // Format as UUID
    return [
      hex.slice(0, 8),
      hex.slice(8, 12),
      hex.slice(12, 16),
      hex.slice(16, 20),
      hex.slice(20, 32)
    ].join('-');
  }
  
  // Ultimate fallback using Math.random (less secure but works everywhere)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}