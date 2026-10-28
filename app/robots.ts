import type { MetadataRoute } from 'next'

// Only the home page is worth indexing; rooms, results and the API are private to a game.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/api/', '/host', '/play/', '/results/', '/join'] },
  }
}
