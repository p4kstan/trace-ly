## WhatsApp Tracking (híbrido — funciona com ou sem Business API)

A ideia: rastrear **100% dos cliques** de qualquer botão/link de WhatsApp, manter atribuição (utm/gclid/fbclid/fbp), e permitir **fechar o loop de conversão** de 3 formas — você escolhe a que tiver disponível.

### Fluxo

```text
[Visitante clica no botão WhatsApp]
        │
        ▼
[SDK capitrack: gera click_id único + grava sessão + dispara Lead p/ Meta/Google]
        │
        ▼
[Redireciona p/ wa.me/55XXX?text=...%20Ref:CT-AB12CD]   ← ID embutido na msg
        │
        ▼
   ┌────┴──────────────────────────────────────────────┐
   │ Conversão fechada por uma destas 3 vias:          │
   │  1. WhatsApp Business API webhook  (auto)         │
   │  2. CRM/Zapier/n8n  → POST /whatsapp-conversion   │
   │  3. Botão manual no painel  ("marcar vendido")    │
   └────┬──────────────────────────────────────────────┘
        ▼
[Dispara Purchase server-side p/ Meta CAPI + Google Ads + GA4 com atribuição original]
```

### O que será criado

**Banco**
- `whatsapp_clicks` — click_id, workspace_id, número destino, mensagem, utm/click ids (gclid/fbclid/wbraid), fbp/fbc, IP/UA hash, page_url, status (`pending`/`converted`/`lost`), created_at.
- `whatsapp_conversions` — FK para click, valor, currency, source da conversão (`business_api`/`webhook`/`manual`), event_id, sent_to_meta/google/ga4 flags.
- RLS por `workspace_id` via `is_workspace_member`.

**Edge functions**
- `whatsapp-click` — recebe do SDK, persiste click, dispara `Lead` no fluxo existente (`/track`), retorna `click_id` + `wa_url`.
- `whatsapp-conversion` — endpoint público com `X-Api-Key`. Aceita `click_id` OU `ref` (extraído da msg). Marca convertido + dispara `Purchase` no `/track`.
- `whatsapp-business-webhook` — endpoint opcional p/ webhook oficial Meta (parseia mensagens recebidas, casa pelo "Ref:CT-XXXX" no texto, marca convertido).

**SDK (`public/sdk.js`)**
- Novo helper `capitrack.whatsapp(numero, { message, value })` → devolve URL pronta com tracking.
- Auto-bind: qualquer `<a href="https://wa.me/...">` ou `[data-capitrack-whatsapp]` é interceptado automaticamente.

**UI nova: `/whatsapp`**
- **Gerador de link/botão** (número + msg template + valor estimado) → copia HTML pronto.
- **Tabela de cliques** (últimos 200) com status, atribuição, botão "marcar como vendido R$___".
- **Card opcional**: instruções p/ plugar Business API webhook (URL + token), escondido em accordion p/ quem não tem.
- Métricas: cliques / conversões / taxa / receita atribuída.

**Sidebar**: nova entrada "WhatsApp" sob seção tracking.

### Detalhes técnicos

- `click_id` curto e legível: `CT-` + 6 chars base32 (ex: `CT-AB12CD`).
- Atribuição preservada usando os mesmos campos que `/track` já entende (gclid/gbraid/wbraid/fbclid/fbp/fbc/utm_*).
- Conversão dispara `Purchase` reusando `/track` → cai automaticamente em Meta CAPI + Google Ads + GA4 + TikTok já configurados (não duplica integração).
- Sem Business API: usuário fecha pelo botão manual ou Zapier/n8n posta no `/whatsapp-conversion`. Com Business API: webhook automatiza.
- Dedupe pelo `click_id` (também vira `event_id` da Purchase para deduplicar com pixel se houver).

Confirma que posso seguir?
