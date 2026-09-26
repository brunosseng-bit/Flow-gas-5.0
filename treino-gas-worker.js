// Treino Gás — proxy OpenAI (Cloudflare Worker)
// Variáveis no Cloudflare (Settings → Variables and Secrets):
//   OPENAI_API_KEY  (secret)  chave da OpenAI
//   APP_TOKEN       (secret)  senha que você digita no app em "Token do proxy"
//   ALLOWED_ORIGIN  (texto)   endereço do app, ex.: https://treino-gas.pages.dev
//                             (vários separados por vírgula)
const ALLOWED_PATHS = ['/chat/completions', '/audio/transcriptions'];
export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
    const originOk = allowed.includes(origin);
    const corsHeaders = {
      'Access-Control-Allow-Origin': originOk ? origin : 'null',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-App-Token',
      'Access-Control-Max-Age': '86400',
      'Vary': 'Origin'
    };
    if (!originOk) return json({ error: 'Origin not allowed' }, 403, corsHeaders);
    if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, corsHeaders);
    if (!env.APP_TOKEN || request.headers.get('X-App-Token') !== env.APP_TOKEN) {
      return json({ error: 'Unauthorized' }, 401, corsHeaders);
    }
    const path = new URL(request.url).pathname;
    if (!ALLOWED_PATHS.includes(path)) return json({ error: 'Endpoint not allowed' }, 404, corsHeaders);
    if (!env.OPENAI_API_KEY) return json({ error: 'OPENAI_API_KEY not configured' }, 500, corsHeaders);
    const headers = new Headers();
    const ct = request.headers.get('Content-Type');
    if (ct) headers.set('Content-Type', ct);
    headers.set('Authorization', 'Bearer ' + env.OPENAI_API_KEY);
    try {
      const upstream = await fetch('https://api.openai.com/v1' + path, { method: 'POST', headers, body: request.body });
      const respHeaders = new Headers(upstream.headers);
      Object.entries(corsHeaders).forEach(([k, v]) => respHeaders.set(k, v));
      return new Response(upstream.body, { status: upstream.status, headers: respHeaders });
    } catch (e) {
      return json({ error: 'Upstream error: ' + e.message }, 502, corsHeaders);
    }
  }
};
function json(obj, status, extra = {}) {
  return new Response(JSON.stringify(obj), {
    status, headers: { 'Content-Type': 'application/json', ...extra }
  });
}
