import { validateIdentifier, validateKeyword } from '../../utils/validation.js';
import { parseUserAgent, getClientIp, extractUtmParams } from '../../utils/request-utils.js';
import { nanoid } from 'nanoid';

export async function redirectHandler(fastify, opts) {
    fastify.get('/*', async (request, reply) => {
        const startTime = Date.now();
        const pathSegments = request.params['*'].split('/').filter(Boolean);
        
        if (pathSegments.length === 0) {
            return reply.callNotFound();
        }

        if (pathSegments.length > 6) {
            return reply.status(400).send({
                statusCode: 400,
                error: 'Bad Request',
                message: 'URL path too long (max 6 segments)'
            });
        }

        let identifier = null;
        let keywords = [];
        let lookupResult = null;
        let cacheKey = null;

        try {
            if (pathSegments.length === 1) {
                const keyword = pathSegments[0].toLowerCase();
                
                if (!validateKeyword(keyword)) {
                    return reply.status(400).send({
                        statusCode: 400,
                        error: 'Invalid keyword',
                        message: `Keyword must be 1-30 characters, alphanumeric with hyphens/underscores`
                    });
                }
                
                keywords = [keyword];
                cacheKey = `url:${keyword}`;
            } else {
                const firstSegment = pathSegments[0].toLowerCase();
                
                if (validateIdentifier(firstSegment)) {
                    identifier = firstSegment;
                    keywords = pathSegments.slice(1).map(k => k.toLowerCase());
                    
                    for (const keyword of keywords) {
                        if (!validateKeyword(keyword)) {
                            return reply.status(400).send({
                                statusCode: 400,
                                error: 'Invalid keyword',
                                message: `Keyword "${keyword}" must be 1-30 characters, alphanumeric with hyphens/underscores`
                            });
                        }
                    }
                    
                    if (keywords.length > 5) {
                        return reply.status(400).send({
                            statusCode: 400,
                            error: 'Too many keywords',
                            message: 'Maximum 5 keywords allowed per URL'
                        });
                    }
                    
                    cacheKey = `url:${identifier}:${keywords.join(':')}`;
                } else {
                    keywords = pathSegments.map(k => k.toLowerCase());
                    
                    for (const keyword of keywords) {
                        if (!validateKeyword(keyword)) {
                            return reply.status(400).send({
                                statusCode: 400,
                                error: 'Invalid keyword',
                                message: `Keyword "${keyword}" must be 1-30 characters, alphanumeric with hyphens/underscores`
                            });
                        }
                    }
                    
                    cacheKey = `url:${keywords.join(':')}`;
                }
            }

            const cached = await fastify.cache.get(cacheKey);
            if (cached) {
                lookupResult = JSON.parse(cached);
                fastify.log.debug(`Cache hit for ${cacheKey}`);
            } else {
                if (identifier) {
                    lookupResult = await fastify.db.findShortenedUrl(identifier, keywords);
                }
                
                if (!lookupResult) {
                    lookupResult = await fastify.db.findShortenedUrl(null, keywords);
                }

                if (lookupResult) {
                    await fastify.cache.set(cacheKey, JSON.stringify(lookupResult), 300);
                    fastify.log.debug(`Cache miss for ${cacheKey}, cached for 300s`);
                }
            }

            if (!lookupResult) {
                const suggestions = await getSuggestions(fastify.db, identifier, keywords);
                
                return reply.status(404).send({
                    statusCode: 404,
                    error: 'Not Found',
                    message: 'No matching URL found',
                    path: request.url,
                    identifier,
                    keywords,
                    suggestions: suggestions.length > 0 ? suggestions : undefined
                });
            }

            const responseTime = Date.now() - startTime;

            const visitorId = request.cookies.visitor_id || nanoid(16);
            if (!request.cookies.visitor_id) {
                reply.setCookie('visitor_id', visitorId, {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: 'lax',
                    maxAge: 365 * 24 * 60 * 60,
                    path: '/'
                });
            }

            const userAgentData = parseUserAgent(request.headers['user-agent']);
            const clientIp = getClientIp(request);
            const utmParams = extractUtmParams(request.query);

            fastify.analytics.track({
                shortened_url_id: lookupResult.id,
                visitor_id: visitorId,
                ip_address: clientIp,
                user_agent: request.headers['user-agent'],
                referer: request.headers.referer || request.headers.referrer,
                ...userAgentData,
                ...utmParams,
                response_time_ms: responseTime
            }).catch(err => {
                fastify.log.error('Failed to track analytics:', err);
            });

            reply.header('Cache-Control', 'public, max-age=3600');
            reply.header('X-Robots-Tag', 'noindex, nofollow');
            
            return reply.redirect(301, lookupResult.original_url);

        } catch (error) {
            fastify.log.error('Redirect handler error:', error);
            fastify.log.error('Error stack:', error.stack);
            
            return reply.status(500).send({
                statusCode: 500,
                error: 'Internal Server Error',
                message: 'An error occurred while processing your request'
            });
        }
    });
}

async function getSuggestions(db, identifier, keywords) {
    try {
        const suggestions = [];
        
        if (identifier && keywords.length > 0) {
            const identifierUrls = await db.query(
                `SELECT DISTINCT keywords FROM shortened_urls 
                 WHERE identifier = $1 AND is_active = true 
                 LIMIT 5`,
                [identifier]
            );
            
            if (identifierUrls.rows.length > 0) {
                suggestions.push({
                    type: 'identifier_keywords',
                    message: `Found URLs for identifier "${identifier}" with different keywords`,
                    examples: identifierUrls.rows.map(r => `${identifier}/${r.keywords.join('/')}`)
                });
            }
        }
        
        if (keywords.length === 1) {
            const similarKeywords = await db.query(
                `SELECT DISTINCT keywords FROM shortened_urls 
                 WHERE keywords @> ARRAY[$1]::text[] 
                    OR $1 % ANY(keywords)
                 AND is_active = true 
                 LIMIT 5`,
                [keywords[0]]
            );
            
            if (similarKeywords.rows.length > 0) {
                suggestions.push({
                    type: 'similar_keywords',
                    message: 'Similar keywords found',
                    examples: similarKeywords.rows.flatMap(r => r.keywords)
                });
            }
        }
        
        if (keywords.length > 1) {
            for (const keyword of keywords) {
                const partialMatch = await db.query(
                    `SELECT identifier, keywords FROM shortened_urls 
                     WHERE keywords @> ARRAY[$1]::text[] 
                     AND is_active = true 
                     LIMIT 3`,
                    [keyword]
                );
                
                if (partialMatch.rows.length > 0) {
                    suggestions.push({
                        type: 'partial_match',
                        message: `URLs containing keyword "${keyword}"`,
                        examples: partialMatch.rows.map(r => 
                            r.identifier ? `${r.identifier}/${r.keywords.join('/')}` : r.keywords.join('/')
                        )
                    });
                    break;
                }
            }
        }
        
        return suggestions.slice(0, 3);
    } catch (error) {
        console.error('Error getting suggestions:', error);
        return [];
    }
}