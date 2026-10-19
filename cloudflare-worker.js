/**
 * M-iT Solution – Anthropic Proxy Worker
 * Deploy this on https://workers.cloudflare.com (free tier)
 *
 * Setup:
 * 1. Create a new Worker and paste this code
 * 2. Go to Settings → Variables → Add secret: ANTHROPIC_API_KEY
 *    Value: (paste your Anthropic API key here — starts with sk-ant-...)
 * 3. Save & Deploy → copy the worker URL (e.g. https://mit-chat.YOUR-NAME.workers.dev)
 * 4. In index.html replace WORKER_URL_PLACEHOLDER with that URL
 */

const ALLOWED_ORIGIN = 'https://www.m-it-solution.com';

export default {
  async fetch(request, env) {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin':  ALLOWED_ORIGIN,
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age':       '86400',
        },
      });
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    // Only allow requests from your website
    const origin = request.headers.get('Origin') || '';
    if (origin !== ALLOWED_ORIGIN) {
      return new Response('Forbidden', { status: 403 });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return new Response('Bad request', { status: 400 });
    }

    // Forward to Anthropic
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key':         env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type':      'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    return new Response(JSON.stringify(data), {
      status: response.status,
      headers: {
        'Content-Type':                 'application/json',
        'Access-Control-Allow-Origin':  ALLOWED_ORIGIN,
      },
    });
  },
};
