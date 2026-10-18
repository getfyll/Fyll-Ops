// Vercel Serverless Function: Send OneSignal notification for thread activity
import type { VercelRequest, VercelResponse } from '@vercel/node';

const ONESIGNAL_APP_ID = process.env.ONESIGNAL_APP_ID;
const ONESIGNAL_REST_API_KEY = process.env.ONESIGNAL_REST_API_KEY;
const FYLL_ONESIGNAL_APP_ID = process.env.FYLL_ONESIGNAL_APP_ID;
const FYLL_ONESIGNAL_REST_API_KEY = process.env.FYLL_ONESIGNAL_REST_API_KEY;
const WWW_ONESIGNAL_APP_ID = process.env.WWW_ONESIGNAL_APP_ID || ONESIGNAL_APP_ID;
const WWW_ONESIGNAL_REST_API_KEY = process.env.WWW_ONESIGNAL_REST_API_KEY || ONESIGNAL_REST_API_KEY;
const INTERNAL_NOTIFICATIONS_TOKEN = process.env.INTERNAL_NOTIFICATIONS_TOKEN;

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const internalToken = req.headers['x-internal-token'];
    const tokenValue = Array.isArray(internalToken) ? internalToken[0] : internalToken;
    if (!INTERNAL_NOTIFICATIONS_TOKEN || tokenValue !== INTERNAL_NOTIFICATIONS_TOKEN) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const { businessId, userId, threadTitle, message, url } = req.body;
    const oneSignalConfigs = [
        { origin: 'https://www.fyll.app', appId: WWW_ONESIGNAL_APP_ID, restApiKey: WWW_ONESIGNAL_REST_API_KEY },
        { origin: 'https://fyll.app', appId: FYLL_ONESIGNAL_APP_ID, restApiKey: FYLL_ONESIGNAL_REST_API_KEY },
    ].filter((config) => config.appId && config.restApiKey)
      .filter((config, index, configs) => configs.findIndex((candidate) => candidate.appId === config.appId) === index);
    if (oneSignalConfigs.length === 0) {
        return res.status(500).json({ error: 'OneSignal config missing' });
    }
    if (!businessId || !userId || !threadTitle || !message || !url) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        const deliveries = await Promise.all(oneSignalConfigs.map(async (config) => {
            const response = await fetch('https://api.onesignal.com/notifications', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Key ${config.restApiKey}`,
                },
                body: JSON.stringify({
                    app_id: config.appId,
                    filters: [
                        { field: 'tag', key: 'business_id', relation: '=', value: businessId },
                        { operator: 'AND' },
                        { field: 'tag', key: 'user_id', relation: '=', value: userId },
                    ],
                    headings: { en: `Thread Update: ${threadTitle}` },
                    contents: { en: message },
                    url,
                }),
            });
            return { origin: config.origin, ok: response.ok, status: response.status, details: response.ok ? null : await response.text() };
        }));
        if (deliveries.every((delivery) => !delivery.ok)) {
            return res.status(500).json({ error: 'OneSignal error', deliveries });
        }
        return res.status(200).json({ success: true, deliveries });
    } catch (error) {
        return res.status(500).json({ error: 'Request failed', details: error?.toString() });
    }
}
