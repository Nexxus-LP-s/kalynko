/**
 * Kalynko LP · envio de lead para o Kommo (API v4)
 * ---------------------------------------------------------------
 * Função serverless (Vercel: /api/kommo-lead). Roda no servidor, então o
 * token do Kommo NUNCA aparece no navegador.
 *
 * Variáveis de ambiente (configurar no painel da hospedagem):
 *   KOMMO_SUBDOMAIN        subdomínio da conta. Ex.: "kalynko" para kalynko.kommo.com   [obrigatória]
 *   KOMMO_TOKEN            token de longa duração de uma integração privada do Kommo   [obrigatória]
 *   KOMMO_PIPELINE_ID      ID do funil onde o lead entra                                [opcional]
 *   KOMMO_STATUS_ID        ID da etapa inicial do funil                                 [opcional]
 *   KOMMO_RESPONSIBLE_ID   ID do usuário responsável                                    [opcional]
 *   KOMMO_LEAD_FIELDS      JSON ligando campos de origem a IDs de campos personalizados  [opcional]
 *                          Ex.: {"utm_source":123456,"utm_campaign":123457,"ad_id":123458}
 *   ALLOWED_ORIGIN         domínio da LP. Ex.: "https://lp.kalynko.com"                  [recomendada]
 *
 * Nenhum ID acima foi inventado aqui: todos vêm da conta Kommo da Kalynko.
 */

const seen = new Map(); // idempotência em memória (melhor esforço por instância)
const TTL = 1000 * 60 * 30;

const ORIGIN_KEYS = ['utm_source','utm_medium','utm_campaign','utm_content','utm_term','utm_id',
  'campaign_id','adset_id','ad_id','placement','fbclid','gclid','fbp','fbc','landing_url','referrer'];

function clean(v, max = 200) { return String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max); }

async function kommo(path, opts = {}) {
  const base = `https://${process.env.KOMMO_SUBDOMAIN}.kommo.com/api/v4`;
  const r = await fetch(base + path, {
    ...opts,
    headers: { 'Authorization': `Bearer ${process.env.KOMMO_TOKEN}`, 'Content-Type': 'application/json', ...(opts.headers || {}) }
  });
  if (r.status === 204) return null;
  const text = await r.text();
  let json = null; try { json = text ? JSON.parse(text) : null; } catch (_) {}
  if (!r.ok) { const e = new Error(`Kommo ${r.status}`); e.detail = json || text; throw e; }
  return json;
}

module.exports = async function handler(req, res) {
  const allowed = process.env.ALLOWED_ORIGIN;
  if (allowed) {
    res.setHeader('Access-Control-Allow-Origin', allowed);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Idempotency-Key');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  if (allowed && req.headers.origin && req.headers.origin !== allowed) return res.status(403).json({ ok: false, error: 'origin' });

  if (!process.env.KOMMO_SUBDOMAIN || !process.env.KOMMO_TOKEN) {
    return res.status(503).json({ ok: false, error: 'kommo_nao_configurado' });
  }

  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (_) { b = null; } }
  if (!b || typeof b !== 'object') return res.status(400).json({ ok: false, error: 'payload' });

  // validação
  const nome = clean(b.nome, 80), empresa = clean(b.empresa, 100), email = clean(b.email, 120).toLowerCase();
  const fone = clean(b.whatsapp, 20).replace(/[^\d+]/g, '');
  const errs = [];
  if (nome.length < 2) errs.push('nome');
  if (empresa.length < 2) errs.push('empresa');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) errs.push('email');
  if (!/^\+?\d{12,13}$/.test(fone)) errs.push('whatsapp');
  if (!b.consentimento || b.consentimento.aceito !== true) errs.push('consentimento');
  if (errs.length) return res.status(422).json({ ok: false, error: 'validacao', campos: errs });

  // idempotência
  const key = clean(req.headers['idempotency-key'] || b.idempotency_key, 80);
  const now = Date.now();
  for (const [k, t] of seen) if (now - t.at > TTL) seen.delete(k);
  if (key && seen.has(key)) return res.status(200).json({ ok: true, duplicate: true, lead_id: seen.get(key).id });

  const o = {};
  ORIGIN_KEYS.forEach(k => { if (b.origem && b.origem[k]) o[k] = clean(b.origem[k], 400); });

  try {
    // reaproveita contato existente com o mesmo e-mail (evita contato duplicado)
    let contactId = null;
    try {
      const found = await kommo(`/contacts?query=${encodeURIComponent(email)}&limit=1`);
      contactId = found && found._embedded && found._embedded.contacts && found._embedded.contacts[0] ? found._embedded.contacts[0].id : null;
    } catch (_) { /* busca é opcional */ }

    const lead = {
      name: `Demonstração · ${empresa}`,
      _embedded: {
        tags: [{ name: 'LP Demonstração' }].concat(o.utm_source ? [{ name: `origem:${o.utm_source}` }] : []),
        contacts: [contactId ? { id: contactId } : {
          name: nome,
          custom_fields_values: [
            { field_code: 'EMAIL', values: [{ value: email, enum_code: 'WORK' }] },
            { field_code: 'PHONE', values: [{ value: fone, enum_code: 'MOB' }] }
          ]
        }],
        companies: [{ name: empresa }]
      }
    };
    if (process.env.KOMMO_PIPELINE_ID) lead.pipeline_id = Number(process.env.KOMMO_PIPELINE_ID);
    if (process.env.KOMMO_STATUS_ID) lead.status_id = Number(process.env.KOMMO_STATUS_ID);
    if (process.env.KOMMO_RESPONSIBLE_ID) lead.responsible_user_id = Number(process.env.KOMMO_RESPONSIBLE_ID);

    // campos personalizados de origem (se mapeados)
    let map = {};
    try { map = JSON.parse(process.env.KOMMO_LEAD_FIELDS || '{}'); } catch (_) {}
    const cf = Object.keys(map).filter(k => o[k]).map(k => ({ field_id: Number(map[k]), values: [{ value: o[k] }] }));
    if (cf.length) lead.custom_fields_values = cf;

    const created = await kommo('/leads/complex', { method: 'POST', body: JSON.stringify([lead]) });
    const leadId = created && created[0] && created[0].id;

    // nota com origem completa e registro do consentimento
    const lines = [
      'Lead da LP de demonstração.',
      `Nome: ${nome}`, `Empresa: ${empresa}`, `E-mail: ${email}`, `WhatsApp: ${fone}`,
      '', 'Origem:'
    ].concat(Object.keys(o).map(k => `${k}: ${o[k]}`))
     .concat(['', `Consentimento: aceito em ${clean(b.consentimento.data, 40)}`, `Texto: ${clean(b.consentimento.texto, 400)}`, `Página: ${clean(b.consentimento.url, 400)}`]);
    if (leadId) {
      try { await kommo('/leads/notes', { method: 'POST', body: JSON.stringify([{ entity_id: leadId, note_type: 'common', params: { text: lines.join('\n') } }]) }); } catch (_) {}
    }

    if (key) seen.set(key, { id: leadId, at: now });
    return res.status(200).json({ ok: true, lead_id: leadId || null });
  } catch (e) {
    console.error('[kommo-lead]', e.message, JSON.stringify(e.detail || ''));
    return res.status(502).json({ ok: false, error: 'crm_indisponivel' });
  }
};
