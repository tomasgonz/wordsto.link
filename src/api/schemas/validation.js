import { z } from 'zod';

const identifierRegex = /^[a-z0-9][a-z0-9-_]*[a-z0-9]$/;
const keywordRegex = /^[a-z0-9][a-z0-9-_]*$/;

export const identifierSchema = z
    .string()
    .min(2, 'Identifier must be at least 2 characters')
    .max(20, 'Identifier must be at most 20 characters')
    .toLowerCase()
    .regex(identifierRegex, 'Identifier can only contain lowercase letters, numbers, hyphens, and underscores')
    .transform(val => val.toLowerCase());

export const keywordSchema = z
    .string()
    .min(1, 'Keyword must be at least 1 character')
    .max(30, 'Keyword must be at most 30 characters')
    .toLowerCase()
    .regex(keywordRegex, 'Keyword can only contain lowercase letters, numbers, hyphens, and underscores')
    .transform(val => val.toLowerCase());

export const urlSchema = z
    .string()
    .url('Must be a valid URL')
    .max(2048, 'URL must be at most 2048 characters')
    .refine((url) => {
        try {
            const parsed = new URL(url);
            const blockedHosts = ['localhost', '127.0.0.1', '0.0.0.0', '::1'];
            const privateIpRanges = [/^10\./, /^172\.(1[6-9]|2[0-9]|3[0-1])\./, /^192\.168\./];
            
            if (blockedHosts.includes(parsed.hostname)) {
                return false;
            }
            
            if (parsed.hostname.endsWith('.local')) {
                return false;
            }
            
            if (privateIpRanges.some(range => range.test(parsed.hostname))) {
                return false;
            }
            
            return true;
        } catch {
            return false;
        }
    }, 'URL cannot point to localhost or private IP addresses');

export const createShortenSchema = z.object({
    identifier: identifierSchema.optional().nullable(),
    keywords: z
        .array(keywordSchema)
        .min(1, 'At least one keyword is required')
        .max(5, 'Maximum 5 keywords allowed')
        .transform(keywords => [...new Set(keywords)]),
    destination_url: urlSchema,
    title: z.string().max(255).optional().nullable(),
    description: z.string().max(1000).optional().nullable(),
    expires_at: z.string().datetime().optional().nullable(),
    custom_metadata: z.record(z.any()).optional().default({}),
    is_public: z.boolean().optional().default(true)
});

export const listUrlsSchema = z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().optional(),
    identifier: z.string().optional(),
    sort_by: z.enum(['created_at', 'click_count', 'last_clicked_at', 'title']).default('created_at'),
    order: z.enum(['asc', 'desc']).default('desc'),
    is_active: z.coerce.boolean().optional(),
    has_expired: z.coerce.boolean().optional()
});

export const analyticsQuerySchema = z.object({
    start_date: z.string().datetime().optional(),
    end_date: z.string().datetime().optional(),
    period: z.enum(['1h', '24h', '7d', '30d', '90d', '1y', 'custom']).default('30d'),
    timezone: z.string().default('UTC'),
    group_by: z.enum(['hour', 'day', 'week', 'month']).optional(),
    include_bots: z.coerce.boolean().default(false)
});

export const updateUrlSchema = z.object({
    keywords: z
        .array(keywordSchema)
        .min(1, 'At least one keyword is required')
        .max(5, 'Maximum 5 keywords allowed')
        .optional(),
    destination_url: urlSchema.optional(),
    title: z.string().max(255).optional().nullable(),
    description: z.string().max(1000).optional().nullable(),
    is_active: z.boolean().optional(),
    expires_at: z.string().datetime().optional().nullable(),
    custom_metadata: z.record(z.any()).optional()
});

export const bulkCreateSchema = z.object({
    urls: z.array(createShortenSchema).min(1).max(100)
});

export const identifierOwnershipSchema = z.object({
    identifier: identifierSchema,
    action: z.enum(['claim', 'release', 'transfer']),
    transfer_to_user_id: z.string().uuid().optional()
});

export const pathParamsSchema = z.object({
    path: z.string().transform(path => {
        const segments = path.split('/').filter(Boolean);
        
        if (segments.length === 0) {
            throw new z.ZodError([{
                code: 'custom',
                message: 'Path cannot be empty',
                path: ['path']
            }]);
        }
        
        if (segments.length > 6) {
            throw new z.ZodError([{
                code: 'custom',
                message: 'Path too long (maximum 6 segments)',
                path: ['path']
            }]);
        }
        
        let identifier = null;
        let keywords = [];
        
        if (segments.length === 1) {
            keywords = [segments[0].toLowerCase()];
        } else {
            const firstSegment = segments[0].toLowerCase();
            if (identifierRegex.test(firstSegment)) {
                identifier = firstSegment;
                keywords = segments.slice(1).map(k => k.toLowerCase());
            } else {
                keywords = segments.map(k => k.toLowerCase());
            }
        }
        
        keywords.forEach((keyword, index) => {
            if (!keywordRegex.test(keyword)) {
                throw new z.ZodError([{
                    code: 'custom',
                    message: `Invalid keyword: ${keyword}`,
                    path: ['path', 'keywords', index]
                }]);
            }
        });
        
        return { identifier, keywords, fullPath: segments.join('/') };
    })
});

export const exportDataSchema = z.object({
    format: z.enum(['json', 'csv', 'xlsx']).default('json'),
    include_analytics: z.coerce.boolean().default(false),
    date_range: z.object({
        start: z.string().datetime().optional(),
        end: z.string().datetime().optional()
    }).optional()
});

export const apiKeySchema = z.object({
    name: z.string().min(1).max(255),
    permissions: z.object({
        read: z.boolean().default(true),
        write: z.boolean().default(true),
        delete: z.boolean().default(false)
    }).default({ read: true, write: true, delete: false }),
    expires_at: z.string().datetime().optional().nullable(),
    rate_limit: z.number().int().min(1).max(10000).default(1000)
});

export function validateRequest(schema) {
    return async (request, reply) => {
        try {
            const validated = await schema.parseAsync(request.body || request.query || request.params);
            request.validated = validated;
        } catch (error) {
            if (error instanceof z.ZodError) {
                return reply.status(400).send({
                    statusCode: 400,
                    error: 'Validation Error',
                    message: 'Invalid request data',
                    issues: error.errors.map(err => ({
                        field: err.path.join('.'),
                        message: err.message
                    }))
                });
            }
            throw error;
        }
    };
}

export function validateQueryParams(schema) {
    return async (request, reply) => {
        try {
            const validated = await schema.parseAsync(request.query);
            request.validatedQuery = validated;
        } catch (error) {
            if (error instanceof z.ZodError) {
                return reply.status(400).send({
                    statusCode: 400,
                    error: 'Validation Error',
                    message: 'Invalid query parameters',
                    issues: error.errors.map(err => ({
                        field: err.path.join('.'),
                        message: err.message
                    }))
                });
            }
            throw error;
        }
    };
}

export function validatePathParams(schema) {
    return async (request, reply) => {
        try {
            const validated = await schema.parseAsync(request.params);
            request.validatedParams = validated;
        } catch (error) {
            if (error instanceof z.ZodError) {
                return reply.status(400).send({
                    statusCode: 400,
                    error: 'Validation Error',
                    message: 'Invalid path parameters',
                    issues: error.errors.map(err => ({
                        field: err.path.join('.'),
                        message: err.message
                    }))
                });
            }
            throw error;
        }
    };
}