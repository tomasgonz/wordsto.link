import { parseUrlPattern, validateKeywords, generateShortUrl } from '../../src/utils/url-parser.js';

describe('URL Parser', () => {
  describe('parseUrlPattern', () => {
    test('parses single keyword pattern', () => {
      const result = parseUrlPattern('/github');
      expect(result).toEqual({
        identifier: null,
        keywords: ['github'],
        pattern: 'keyword'
      });
    });

    test('parses identifier + keyword pattern', () => {
      const result = parseUrlPattern('/john/portfolio');
      expect(result).toEqual({
        identifier: 'john',
        keywords: ['portfolio'],
        pattern: 'identifier-keyword'
      });
    });

    test('parses multiple keywords pattern', () => {
      const result = parseUrlPattern('/docs/api/v2/authentication');
      expect(result).toEqual({
        identifier: null,
        keywords: ['docs', 'api', 'v2', 'authentication'],
        pattern: 'multi-keyword'
      });
    });

    test('parses identifier + multiple keywords', () => {
      const result = parseUrlPattern('/company/product/launch/2024');
      expect(result).toEqual({
        identifier: 'company',
        keywords: ['product', 'launch', '2024'],
        pattern: 'identifier-multi-keyword'
      });
    });

    test('handles empty path', () => {
      const result = parseUrlPattern('/');
      expect(result).toEqual({
        identifier: null,
        keywords: [],
        pattern: 'empty'
      });
    });

    test('handles paths with trailing slashes', () => {
      const result = parseUrlPattern('/docs/api/');
      expect(result).toEqual({
        identifier: null,
        keywords: ['docs', 'api'],
        pattern: 'multi-keyword'
      });
    });

    test('handles special characters in keywords', () => {
      const result = parseUrlPattern('/user/my-awesome-project_v2.0');
      expect(result).toEqual({
        identifier: 'user',
        keywords: ['my-awesome-project_v2.0'],
        pattern: 'identifier-keyword'
      });
    });
  });

  describe('validateKeywords', () => {
    test('validates valid keywords', () => {
      const result = validateKeywords(['api', 'docs', 'v2']);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    test('rejects empty keywords', () => {
      const result = validateKeywords(['api', '', 'docs']);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Empty keyword not allowed');
    });

    test('rejects keywords that are too long', () => {
      const longKeyword = 'a'.repeat(101);
      const result = validateKeywords(['api', longKeyword]);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Keyword exceeds maximum length of 100 characters');
    });

    test('rejects reserved keywords', () => {
      const result = validateKeywords(['api', 'admin', 'docs']);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Reserved keyword: admin');
    });

    test('allows alphanumeric with hyphens and underscores', () => {
      const result = validateKeywords(['api-v2', 'user_guide', '2024']);
      expect(result.valid).toBe(true);
    });

    test('rejects invalid characters', () => {
      const result = validateKeywords(['api', 'docs@v2']);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid characters in keyword: docs@v2');
    });
  });

  describe('generateShortUrl', () => {
    test('generates URL for single keyword', () => {
      const url = generateShortUrl({
        identifier: null,
        keywords: ['github']
      });
      expect(url).toBe('wordsto.link/github');
    });

    test('generates URL for identifier + keyword', () => {
      const url = generateShortUrl({
        identifier: 'john',
        keywords: ['portfolio']
      });
      expect(url).toBe('wordsto.link/john/portfolio');
    });

    test('generates URL for multiple keywords', () => {
      const url = generateShortUrl({
        identifier: null,
        keywords: ['docs', 'api', 'v2']
      });
      expect(url).toBe('wordsto.link/docs/api/v2');
    });

    test('generates URL with custom domain', () => {
      const url = generateShortUrl({
        identifier: 'company',
        keywords: ['product']
      }, 'custom.link');
      expect(url).toBe('custom.link/company/product');
    });

    test('handles empty keywords array', () => {
      const url = generateShortUrl({
        identifier: 'user',
        keywords: []
      });
      expect(url).toBe('wordsto.link/user');
    });
  });
});