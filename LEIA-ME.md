# LP Kalynko · Demonstração prática

Arquivos:

- `index.html`: a página completa, com CSS e JS no próprio arquivo.
- `assets/`: as imagens (prints reais da plataforma e peças), o vídeo, o logo e as fontes, que ficam hospedadas junto da página.
- `api/kommo-lead.js`: a função de servidor que cria o lead no Kommo.

## 1. Antes de publicar

Edite o bloco `window.KALYNKO_CONFIG`, que fica no `<head>` do `index.html`:

| Campo | O que colocar |
|---|---|
| `leadEndpoint` | `'/api/kommo-lead'`, se for usar a função deste pacote, ou a URL do webhook (Make, n8n ou Zapier) |
| `kommoEmbed` | `true` só se a equipe preferir o formulário incorporado do Kommo |
| `metaPixelId` | ID do Pixel da Meta da Kalynko |
| `privacyUrl` | já aponta para https://kalynko.com/privacidade |

Troque também o `<link rel="canonical">` pela URL final da LP.

Enquanto o `leadEndpoint` estiver vazio, o formulário **não envia nada**. Ele mostra um aviso de "Formulário em configuração" e não finge que o lead entrou.

## 2. Integração com o Kommo

### Opção A: API do Kommo pela função `api/kommo-lead.js` (recomendada)

1. No Kommo, vá em **Configurações > Integrações > Criar integração** e crie uma integração privada. Gere o **token de longa duração**.
2. Hospede a pasta inteira na Vercel. A função já fica disponível em `/api/kommo-lead`.
3. Configure as variáveis de ambiente:
   - `KOMMO_SUBDOMAIN`
   - `KOMMO_TOKEN`
   - opcionais: `KOMMO_PIPELINE_ID`, `KOMMO_STATUS_ID`, `KOMMO_RESPONSIBLE_ID`, `KOMMO_LEAD_FIELDS` e `ALLOWED_ORIGIN`
4. No `index.html`, defina `leadEndpoint: '/api/kommo-lead'`.

O que a função faz:

- Valida os dados de novo no servidor e recusa envios sem consentimento.
- Cria o lead, o contato e a empresa numa única chamada (`/leads/complex`).
- Reaproveita o contato se o e-mail já existir no Kommo.
- Adiciona as tags `LP Demonstração` e `origem:<utm_source>`.
- Grava uma nota no lead com UTMs, IDs de campanha, conjunto e anúncio, fbclid, página de entrada e o registro do consentimento (texto, data e URL).
- Usa uma chave de idempotência para evitar lead duplicado em clique duplo ou reenvio.

Para mandar a origem para campos próprios do lead, crie os campos no Kommo e informe os IDs em `KOMMO_LEAD_FIELDS`, por exemplo: `{"utm_campaign":123,"ad_id":456}`.

A automação de boas-vindas no WhatsApp, citada no playbook, continua sendo configurada dentro do Kommo, no funil.

### Opção B: formulário incorporado do Kommo

Gere o formulário no Kommo, cole o código dentro de `<div id="kommo-embed"></div>` e defina `kommoEmbed: true`. É a opção mais simples, mas tem menos controle sobre o visual e sobre a captura de UTMs e IDs de anúncio.

### Opção C: webhook (Make, n8n ou Zapier)

Aponte o `leadEndpoint` para a URL do webhook. Ele recebe o mesmo JSON que a função da opção A.

## 3. Parâmetros dos anúncios na Meta

No campo **Parâmetros de URL** de cada anúncio, use:

```
utm_source=meta&utm_medium=paid_social&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&utm_term={{adset.name}}&campaign_id={{campaign.id}}&adset_id={{adset.id}}&ad_id={{ad.id}}&placement={{placement}}
```

A página guarda esses valores durante a sessão e envia tudo com o lead, junto com os cookies `_fbp` e `_fbc`.



**Demonstração gratuita:** os criativos de agência falam em "demonstração gratuita". Quando a Kalynko confirmar, mude `demoGratuita` para `true` no `KALYNKO_CONFIG`. O texto abaixo do botão do formulário passa a citar que é gratuita.

## 4. Eventos de mensuração

| Momento | dataLayer | Pixel da Meta |
|---|---|---|
| Página carregada | `page_view_lp` | `PageView` |
| Clique em qualquer CTA | `cta_click` (com o local do botão) | `CTAClick` (personalizado) |
| Primeiro campo do formulário | `form_start` | `FormStart` (personalizado) |
| Envio confirmado pelo servidor | `lead_submit` | `Lead` (com `eventID` igual à chave de idempotência, pronto para deduplicar com a API de Conversões) |
| Erro no envio | `form_error` | nenhum |
| Pergunta aberta no FAQ | `faq_open` | nenhum |

## 5. Decisões de conteúdo (fidelidade ao produto)

- A página não diz que os posts são publicados automaticamente. Pelo playbook, o cliente baixa as peças e publica nas redes. Só as campanhas sobem pela plataforma, e depois da aprovação.
- A produção de vídeo não aparece, porque está em beta. A página fala só em roteiros de Reels.
- Não há preços, depoimentos, métricas ou garantias.
- Bloom Odonto, Kaia Studio e Nortis aparecem identificadas como marcas de demonstração.
- A demonstração de "cerca de 30 minutos por vídeo", citada no FAQ, vem do playbook (Processo Comercial). Confirme com o comercial antes de publicar.
- O comparativo "IA genérica" é uma ilustração e está marcado como tal. O lado da Kalynko usa só telas reais.
