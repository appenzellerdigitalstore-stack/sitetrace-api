const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const tls = require('tls');
const path = require('path');
const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;
const API_TIMEOUT_MS = Number(process.env.API_TIMEOUT_MS || 12000);
const RATE_LIMIT = Number(process.env.RATE_LIMIT || 20);
const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 60 * 60 * 1000);
const MAX_BODY_BYTES = Number(process.env.MAX_BODY_BYTES || 2 * 1024 * 1024);
const APP_URL = process.env.APP_URL || 'https://www.sitetrace.it.com';
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
const STRIPE_STARTER_PRICE_ID = process.env.STRIPE_STARTER_PRICE_ID || '';
const STRIPE_AGENCY_PRICE_ID = process.env.STRIPE_AGENCY_PRICE_ID || '';
const CRON_SECRET = process.env.CRON_SECRET || '';
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const RESEND_READ_API_KEY = process.env.RESEND_READ_API_KEY || RESEND_API_KEY;
const ALERT_FROM_EMAIL = process.env.ALERT_FROM_EMAIL || 'SiteTrace <alerts@sitetrace.it.com>';
const ALERT_REPLY_TO_EMAIL = process.env.ALERT_REPLY_TO_EMAIL || 'support@sitetrace.it.com';
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL || '';
const TEAMS_WEBHOOK_URL = process.env.TEAMS_WEBHOOK_URL || '';
const PLAN_LIMITS = {
  free: { sites: 0, interval_minutes: 0, history_days: 0 },
  starter: { sites: 5, interval_minutes: 5, history_days: 30 },
  agency: { sites: 50, interval_minutes: 1, history_days: 90 }
};
const PLAN_FEATURES = {
  free: {
    instant_audit: true,
    monitored_sites: false,
    scheduled_checks: false,
    email_alerts: false,
    status_pages: false,
    client_reports: false,
    webhooks: false,
    api_access: false
  },
  starter: {
    instant_audit: true,
    monitored_sites: true,
    scheduled_checks: true,
    email_alerts: true,
    status_pages: true,
    client_reports: true,
    webhooks: false,
    api_access: false
  },
  agency: {
    instant_audit: true,
    monitored_sites: true,
    scheduled_checks: true,
    email_alerts: true,
    status_pages: true,
    client_reports: true,
    webhooks: true,
    api_access: true
  }
};
const DOMAIN_EXPIRY_WARNING_DAYS = Number(process.env.DOMAIN_EXPIRY_WARNING_DAYS || 30);
const DOMAIN_EXPIRY_CRITICAL_DAYS = Number(process.env.DOMAIN_EXPIRY_CRITICAL_DAYS || 7);
const EMAIL_DNS_GUIDANCE = {
  status: 'action_required',
  issue: 'Resend reports likely DMARC conflict for sitetrace.it.com.',
  action: 'Remove the TXT record at _dmarc.sitetrace.it.com that starts with v=DMARC1; p=none; rua=mailto:appenzeller.digitalstore@gmail.com. If Gmail still rejects mail, ask it.com support to loosen the parent DMARC policy from p=reject to p=none for sitetrace.it.com.',
  recommended_from: ALERT_FROM_EMAIL,
  resend_note: 'Keep SPF/DKIM records from Resend, but avoid duplicate or conflicting DMARC records on the custom domain.'
};

const requestCounts = new Map();
const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null;
const supabaseAdmin = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  : null;

app.use(cors({
  origin(origin, callback) {
    const allowedOrigins = [
      APP_URL,
      'https://www.sitetrace.it.com',
      'https://sitetrace.it.com',
      'http://localhost:3000',
      'http://localhost:3010',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:3010'
    ];

    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error('Not allowed by CORS'));
  }
}));

app.post('/billing/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!stripe || !supabaseAdmin || !STRIPE_WEBHOOK_SECRET) {
    return res.status(503).json({ error: 'Billing webhook is not configured' });
  }

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], STRIPE_WEBHOOK_SECRET);
  } catch (error) {
    return res.status(400).send(`Webhook error: ${error.message}`);
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const userId = session.client_reference_id;
      const plan = session.metadata && session.metadata.plan ? session.metadata.plan : 'starter';

      if (userId) {
        await supabaseAdmin.from('profiles').upsert({
          id: userId,
          plan,
          stripe_customer_id: session.customer,
          subscription_status: 'active',
          updated_at: new Date().toISOString()
        });
      }
    }

    if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object;
      const customerId = subscription.customer;

      await supabaseAdmin
        .from('profiles')
        .update({ plan: 'free', subscription_status: 'canceled', updated_at: new Date().toISOString() })
        .eq('stripe_customer_id', customerId);
    }
  } catch (error) {
    console.error('Stripe webhook handling error:', error.message);
    return res.status(500).json({ error: 'Webhook handling failed' });
  }

  res.json({ received: true });
});

app.use(express.json({ limit: '20kb' }));
app.use(express.static(__dirname));

const messages = {
  en: {
    rate: 'Free limit reached. Upgrade for more checks.',
    fetch: 'We could not analyze that URL. Make sure the site is public and responding correctly.',
    invalid: 'Only public http and https URLs are supported.',
    checks: {
      status: ['Site is reachable', 'We received a usable HTTP response.', 'Keep monitoring status changes so you catch outages quickly.'],
      statusWarning: ['Page returned a client error', 'The server responded, but the status code may be bad for visitors.', 'Check redirects, permissions, broken URLs, or missing pages.'],
      statusFail: ['Server error detected', 'The page returned a server error or could not be reached normally.', 'Review hosting logs and application errors as soon as possible.'],
      speed: ['Fast response time', 'The server responded quickly.', 'Keep pages lightweight and monitor speed over time.'],
      speedWarning: ['Response time could be better', 'The page is online, but visitors may feel the delay.', 'Compress assets, cache pages, and review hosting performance.'],
      speedFail: ['Slow response time', 'The page took too long to respond.', 'Investigate hosting, database queries, scripts, and heavy assets.'],
      keyword: ['Keyword found', 'The expected content is present in the page response.', 'Keep this keyword stable if customers rely on it.'],
      keywordFail: ['Keyword missing', 'The page responded, but the expected keyword was not found.', 'Check whether the page content changed, the app failed to render, or the keyword rule is outdated.'],
      https: ['HTTPS is active', 'The page is served over a secure connection.', 'Keep HTTPS enabled on every public page.'],
      httpsWarning: ['HTTPS is not being used', 'The URL uses HTTP instead of HTTPS.', 'Redirect traffic to HTTPS and install a valid SSL certificate.'],
      ssl: ['SSL certificate looks healthy', 'The certificate is valid and not close to expiration.', 'Use automatic renewal so it does not expire unexpectedly.'],
      sslWarning: ['SSL certificate needs attention', 'The certificate is missing, unavailable, or close to expiration.', 'Check certificate configuration and renewal settings.'],
      title: ['Title tag is healthy', 'The page has a useful title for search engines and browser tabs.', 'Keep titles specific and close to 30-60 characters.'],
      titlePlatform: ['Title is acceptable for a platform page', 'Direct app, store, and platform pages often use short brand-led titles.', 'Only expand the title if this page is meant to compete as a public SEO landing page.'],
      titleWarning: ['Title tag could be improved', 'The title exists but its length is not ideal.', 'Write a clear title with the page topic and brand.'],
      titleFail: ['Missing title tag', 'Search engines and users need a page title to understand the page.', 'Add a unique title tag to this page.'],
      meta: ['Meta description is healthy', 'The page has a useful search snippet description.', 'Keep descriptions around 70-160 characters.'],
      metaWarning: ['Meta description could be improved', 'The description exists but its length is not ideal.', 'Write a concise description that explains the page value.'],
      metaFail: ['Missing meta description', 'Search results may show a random snippet from the page.', 'Add a compelling meta description.'],
      h1: ['H1 structure looks good', 'The page has one main heading.', 'Use one clear H1 that matches the page purpose.'],
      h1Warning: ['Multiple H1 headings found', 'More than one H1 can make page structure less clear.', 'Use one primary H1 and convert secondary headings to H2 or H3.'],
      h1Fail: ['Missing H1 heading', 'The page does not have a main visible heading.', 'Add one H1 that explains the page clearly.'],
      h1Platform: ['H1 is optional for this type of page', 'Large app-style platforms often use dynamic layouts where a traditional landing-page H1 is not the main signal.', 'Do not force an H1 unless this page is meant to rank as a public landing page.'],
      alt: ['Images have good ALT coverage', 'Most images include accessible ALT text.', 'Keep ALT text descriptive and useful.'],
      altWarning: ['Some images are missing ALT text', 'Accessibility and image SEO can improve.', 'Add ALT text to meaningful images.'],
      altFail: ['Many images are missing ALT text', 'Search engines and assistive tools may not understand the images.', 'Add ALT text to important images.'],
      canonical: ['Canonical tag found', 'The page declares its preferred URL.', 'Keep canonical URLs consistent.'],
      canonicalWarning: ['Canonical tag missing', 'Duplicate URL versions may compete in search.', 'Add a canonical link tag.'],
      viewport: ['Mobile viewport configured', 'The page is prepared for responsive layouts.', 'Test important pages on mobile sizes.'],
      viewportPlatform: ['Viewport is platform-managed', 'Large app and media platforms can serve different markup to bots, regions, or devices.', 'Treat this as informational unless you own the platform template.'],
      viewportFail: ['Mobile viewport missing', 'Mobile rendering may be unreliable.', 'Add a viewport meta tag.'],
      lang: ['Language attribute found', 'The document declares a language.', 'Keep the html lang attribute accurate.'],
      langWarning: ['Language attribute missing', 'Browsers and accessibility tools may not know the page language.', 'Add the correct lang attribute to the html tag.'],
      og: ['Social preview tags found', 'The page has Open Graph metadata for sharing.', 'Add image, title, and description tags for richer previews.'],
      ogPlatform: ['Social preview is platform-managed', 'Large platforms often control previews with app-specific metadata or dynamic rendering.', 'Only audit Open Graph manually if you manage this page or campaign landing.'],
      ogWarning: ['Social preview tags are incomplete', 'Shared links may look plain or inconsistent.', 'Add og:title, og:description, and og:image.'],
      robots: ['Page is indexable', 'No obvious noindex directive was found.', 'Use noindex only for pages you want excluded from search.'],
      robotsFail: ['Page may be blocked from indexing', 'A noindex directive was found.', 'Remove noindex if this page should appear in search.'],
      hsts: ['HSTS header found', 'The site asks browsers to enforce HTTPS.', 'Keep HSTS enabled once HTTPS is stable.'],
      hstsWarning: ['HSTS header missing', 'Browsers are not being told to enforce HTTPS.', 'Consider adding Strict-Transport-Security.'],
      csp: ['Content Security Policy found', 'The site has a CSP security header.', 'Keep CSP rules strict but compatible.'],
      cspWarning: ['Content Security Policy missing', 'The site has less protection against injected scripts.', 'Add a Content-Security-Policy header when possible.'],
      frame: ['Clickjacking protection found', 'The site sends a frame protection header.', 'Keep frame rules aligned with embedding needs.'],
      frameWarning: ['Clickjacking protection missing', 'The page may be embeddable by other sites.', 'Add X-Frame-Options or frame-ancestors in CSP.'],
      domain: ['Domain registration looks healthy', 'The domain registration is not close to expiration.', 'Keep auto-renew enabled and payment details current.'],
      domainWarning: ['Domain registration expires soon', 'The domain registration is close to expiration.', 'Renew the domain or confirm auto-renew is working.'],
      domainFail: ['Domain registration is critically close to expiry', 'The domain may stop resolving if it is not renewed soon.', 'Renew the domain immediately and confirm the registrar account is in good standing.'],
      domainUnknown: ['Domain expiry could not be confirmed', 'The registry did not return a clear expiration date.', 'Check the registrar manually if this is a critical domain.'],
      structuredData: ['Structured data found', 'The page includes machine-readable structured data.', 'Keep schema markup accurate and aligned with the visible content.'],
      structuredDataWarning: ['Structured data missing', 'Search engines may have fewer clues for rich results.', 'Add JSON-LD schema for organization, local business, article, product, or FAQ content when relevant.'],
      wordCount: ['Content depth looks useful', 'The page has enough visible text for users and search engines to understand it.', 'Keep important pages specific and helpful.'],
      wordCountWarning: ['Page content looks thin', 'The page has limited visible text.', 'Add useful copy that explains the offer, services, benefits, and next steps.'],
      pageSize: ['Page size is lightweight', 'The HTML response is not overly large.', 'Keep markup lean and optimize heavy assets.'],
      pageSizeWarning: ['Page size may be heavy', 'The response is large enough to deserve a performance review.', 'Compress assets, remove unused scripts, and cache where possible.'],
      links: ['Links are present', 'The page includes navigation or supporting links.', 'Keep important internal links easy to find.'],
      linksWarning: ['Few links found', 'The page may not guide visitors or crawlers very well.', 'Add clear navigation, service links, or next-step links.'],
      favicon: ['Favicon found', 'The page has a browser tab icon.', 'Keep the favicon consistent with the brand.'],
      faviconWarning: ['Favicon missing', 'The page may look less polished in browser tabs and bookmarks.', 'Add a favicon or site icon.']
    }
  },
  es: {
    rate: 'Limite gratuito alcanzado. Mejora tu plan para mas analisis.',
    fetch: 'No pudimos analizar esa URL. Verifica que el sitio este publico y responda correctamente.',
    invalid: 'Solo se permiten URLs publicas con http o https.',
    checks: {
      status: ['El sitio responde', 'Recibimos una respuesta HTTP utilizable.', 'Sigue monitoreando cambios de estado para detectar caidas rapido.'],
      statusWarning: ['La pagina devolvio un error de cliente', 'El servidor respondio, pero el codigo puede afectar a visitantes.', 'Revisa redirecciones, permisos, URLs rotas o paginas faltantes.'],
      statusFail: ['Error de servidor detectado', 'La pagina devolvio un error de servidor o no se pudo alcanzar normalmente.', 'Revisa logs del hosting y errores de la aplicacion cuanto antes.'],
      speed: ['Tiempo de respuesta rapido', 'El servidor respondio rapidamente.', 'Manten las paginas ligeras y monitorea la velocidad con el tiempo.'],
      speedWarning: ['El tiempo de respuesta puede mejorar', 'La pagina esta online, pero el visitante podria notar demora.', 'Comprime assets, usa cache y revisa el rendimiento del hosting.'],
      speedFail: ['Tiempo de respuesta lento', 'La pagina tardo demasiado en responder.', 'Investiga hosting, consultas a base de datos, scripts y assets pesados.'],
      keyword: ['Keyword encontrado', 'El contenido esperado esta presente en la respuesta de la pagina.', 'Manten este keyword estable si tus clientes dependen de el.'],
      keywordFail: ['Keyword faltante', 'La pagina respondio, pero no encontramos el keyword esperado.', 'Revisa si cambio el contenido, si la app no renderizo o si la regla ya no aplica.'],
      https: ['HTTPS esta activo', 'La pagina usa una conexion segura.', 'Manten HTTPS activo en todas las paginas publicas.'],
      httpsWarning: ['HTTPS no esta en uso', 'La URL usa HTTP en vez de HTTPS.', 'Redirige el trafico a HTTPS e instala un certificado SSL valido.'],
      ssl: ['El certificado SSL se ve saludable', 'El certificado es valido y no esta cerca de vencer.', 'Usa renovacion automatica para evitar vencimientos inesperados.'],
      sslWarning: ['El certificado SSL necesita atencion', 'El certificado falta, no esta disponible o esta cerca de vencer.', 'Revisa la configuracion y renovacion del certificado.'],
      title: ['La etiqueta title esta saludable', 'La pagina tiene un titulo util para buscadores y pestanas del navegador.', 'Manten titulos especificos de 30 a 60 caracteres.'],
      titlePlatform: ['El title es aceptable para una pagina de plataforma', 'Paginas directas de apps, tiendas y plataformas suelen usar titulos cortos centrados en la marca.', 'Solo amplia el title si esta pagina busca competir como landing SEO publica.'],
      titleWarning: ['El title puede mejorar', 'El titulo existe pero su longitud no es ideal.', 'Escribe un titulo claro con el tema de la pagina y la marca.'],
      titleFail: ['Falta la etiqueta title', 'Buscadores y usuarios necesitan un titulo para entender la pagina.', 'Agrega un title unico a esta pagina.'],
      meta: ['La meta description esta saludable', 'La pagina tiene una descripcion util para resultados de busqueda.', 'Manten descripciones de 70 a 160 caracteres.'],
      metaWarning: ['La meta description puede mejorar', 'La descripcion existe pero su longitud no es ideal.', 'Escribe una descripcion breve que explique el valor de la pagina.'],
      metaFail: ['Falta la meta description', 'Los resultados de busqueda podrian mostrar un texto aleatorio de la pagina.', 'Agrega una meta description convincente.'],
      h1: ['La estructura H1 se ve bien', 'La pagina tiene un encabezado principal.', 'Usa un H1 claro que coincida con el proposito de la pagina.'],
      h1Warning: ['Hay multiples H1', 'Mas de un H1 puede hacer menos clara la estructura.', 'Usa un H1 principal y cambia otros encabezados a H2 o H3.'],
      h1Fail: ['Falta el encabezado H1', 'La pagina no tiene un encabezado visible principal.', 'Agrega un H1 que explique claramente la pagina.'],
      h1Platform: ['El H1 es opcional para este tipo de pagina', 'Las plataformas grandes tipo app suelen usar layouts dinamicos donde un H1 tradicional no es la senal principal.', 'No fuerces un H1 a menos que esta pagina busque posicionar como landing publica.'],
      alt: ['Buena cobertura de ALT en imagenes', 'La mayoria de imagenes tiene texto ALT accesible.', 'Manten el ALT descriptivo y util.'],
      altWarning: ['Algunas imagenes no tienen ALT', 'Puede mejorar la accesibilidad y el SEO de imagenes.', 'Agrega ALT a las imagenes importantes.'],
      altFail: ['Muchas imagenes no tienen ALT', 'Buscadores y lectores de pantalla podrian no entender las imagenes.', 'Agrega ALT a las imagenes importantes.'],
      canonical: ['Canonical encontrado', 'La pagina declara su URL preferida.', 'Manten las URLs canonical consistentes.'],
      canonicalWarning: ['Falta canonical', 'Versiones duplicadas de una URL podrian competir en buscadores.', 'Agrega una etiqueta canonical.'],
      viewport: ['Viewport movil configurado', 'La pagina esta preparada para layouts responsivos.', 'Prueba las paginas importantes en tamanos moviles.'],
      viewportPlatform: ['El viewport depende de la plataforma', 'Plataformas grandes de app o media pueden entregar HTML distinto segun bot, region o dispositivo.', 'Tomalo como informativo a menos que controles el template de la plataforma.'],
      viewportFail: ['Falta viewport movil', 'La vista movil podria renderizar de forma incorrecta.', 'Agrega una etiqueta meta viewport.'],
      lang: ['Atributo de idioma encontrado', 'El documento declara un idioma.', 'Manten el atributo lang correcto.'],
      langWarning: ['Falta atributo de idioma', 'Navegadores y herramientas de accesibilidad podrian no saber el idioma.', 'Agrega el atributo lang correcto en html.'],
      og: ['Tags de vista social encontrados', 'La pagina tiene metadata Open Graph para compartir.', 'Agrega imagen, titulo y descripcion para mejores previews.'],
      ogPlatform: ['La vista social depende de la plataforma', 'Plataformas grandes suelen controlar previews con metadata propia o render dinamico.', 'Audita Open Graph manualmente solo si administras esta pagina o landing de campana.'],
      ogWarning: ['La vista social esta incompleta', 'Los enlaces compartidos podrian verse simples o inconsistentes.', 'Agrega og:title, og:description y og:image.'],
      robots: ['La pagina parece indexable', 'No encontramos una directiva noindex evidente.', 'Usa noindex solo en paginas que quieras excluir de busqueda.'],
      robotsFail: ['La pagina podria estar bloqueada para indexacion', 'Encontramos una directiva noindex.', 'Quita noindex si esta pagina debe aparecer en buscadores.'],
      hsts: ['Header HSTS encontrado', 'El sitio pide al navegador forzar HTTPS.', 'Manten HSTS activo cuando HTTPS sea estable.'],
      hstsWarning: ['Falta header HSTS', 'El navegador no recibe instruccion para forzar HTTPS.', 'Considera agregar Strict-Transport-Security.'],
      csp: ['Content Security Policy encontrado', 'El sitio tiene un header CSP de seguridad.', 'Manten reglas CSP estrictas pero compatibles.'],
      cspWarning: ['Falta Content Security Policy', 'El sitio tiene menos proteccion contra scripts inyectados.', 'Agrega un header Content-Security-Policy cuando sea posible.'],
      frame: ['Proteccion contra clickjacking encontrada', 'El sitio envia un header de proteccion de frames.', 'Manten las reglas alineadas con tus necesidades de embedding.'],
      frameWarning: ['Falta proteccion contra clickjacking', 'La pagina podria ser embebida por otros sitios.', 'Agrega X-Frame-Options o frame-ancestors en CSP.'],
      domain: ['El registro del dominio se ve saludable', 'El registro del dominio no esta cerca de vencer.', 'Manten auto-renew activo y el metodo de pago actualizado.'],
      domainWarning: ['El dominio vence pronto', 'El registro del dominio esta cerca de vencer.', 'Renueva el dominio o confirma que auto-renew esta funcionando.'],
      domainFail: ['El dominio esta criticamente cerca de vencer', 'El dominio podria dejar de resolver si no se renueva pronto.', 'Renueva el dominio de inmediato y revisa la cuenta del registrador.'],
      domainUnknown: ['No pudimos confirmar el vencimiento del dominio', 'El registro no devolvio una fecha clara de vencimiento.', 'Revisa el registrador manualmente si este dominio es critico.'],
      structuredData: ['Structured data encontrado', 'La pagina incluye datos estructurados legibles por buscadores.', 'Manten el schema alineado con el contenido visible.'],
      structuredDataWarning: ['Falta structured data', 'Los buscadores pueden tener menos senales para rich results.', 'Agrega JSON-LD de organization, local business, article, product o FAQ cuando aplique.'],
      wordCount: ['El contenido tiene buena profundidad', 'La pagina tiene suficiente texto visible para explicar su valor.', 'Manten paginas importantes especificas y utiles.'],
      wordCountWarning: ['El contenido parece delgado', 'La pagina tiene poco texto visible.', 'Agrega copy util que explique oferta, servicios, beneficios y siguiente paso.'],
      pageSize: ['La pagina es ligera', 'La respuesta HTML no es demasiado grande.', 'Manten el markup limpio y optimiza assets pesados.'],
      pageSizeWarning: ['La pagina puede estar pesada', 'La respuesta es suficientemente grande para revisar performance.', 'Comprime assets, elimina scripts innecesarios y usa cache cuando sea posible.'],
      links: ['Hay enlaces en la pagina', 'La pagina incluye navegacion o enlaces de apoyo.', 'Manten enlaces internos importantes faciles de encontrar.'],
      linksWarning: ['Pocos enlaces encontrados', 'La pagina podria guiar mejor a visitantes y crawlers.', 'Agrega navegacion clara, enlaces a servicios o proximos pasos.'],
      favicon: ['Favicon encontrado', 'La pagina tiene icono para la pestana del navegador.', 'Manten el favicon consistente con la marca.'],
      faviconWarning: ['Falta favicon', 'La pagina puede verse menos pulida en pestanas y marcadores.', 'Agrega un favicon o site icon.']
    }
  }
};

function language(locale) {
  return locale === 'es' ? 'es' : 'en';
}

function escapeHtml(value) {
  return String(value === undefined || value === null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function emailHeaderValue(value) {
  return String(value === undefined || value === null ? '' : value).replace(/[\r\n]+/g, ' ').trim();
}

function checkText(locale, key) {
  return messages[language(locale)].checks[key] || messages.en.checks[key];
}

function normalizeUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') {
    throw new Error('URL is required');
  }

  const value = rawUrl.trim();
  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  const parsed = new URL(withProtocol);

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Unsupported protocol');
  }

  const hostname = parsed.hostname.toLowerCase();
  const blockedHosts = ['localhost', '0.0.0.0', '127.0.0.1', '::1'];
  const privatePatterns = [/^10\./, /^127\./, /^192\.168\./, /^169\.254\./, /^172\.(1[6-9]|2\d|3[0-1])\./];

  if (blockedHosts.includes(hostname) || privatePatterns.some((pattern) => pattern.test(hostname))) {
    throw new Error('Private or local network URLs are not supported');
  }

  return parsed;
}

function getPageContext(urlObj, title, metaDescription) {
  const hostname = urlObj.hostname.replace(/^www\./, '').toLowerCase();
  const appLikeHosts = [
    'youtube.com',
    'youtu.be',
    'netflix.com',
    'spotify.com',
    'tiktok.com',
    'instagram.com',
    'facebook.com',
    'x.com',
    'twitter.com',
    'linkedin.com',
    'github.com',
    'figma.com',
    'notion.so',
    'steampowered.com'
  ];
  const text = `${title} ${metaDescription}`.toLowerCase();
  const appLikeWords = ['watch', 'video', 'stream', 'playlist', 'dashboard', 'sign in', 'login', 'app'];

  if (appLikeHosts.some((host) => hostname === host || hostname.endsWith(`.${host}`))) {
    return 'platform';
  }

  if (appLikeWords.some((word) => text.includes(word))) {
    return 'app';
  }

  return 'standard';
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  return forwarded ? forwarded.split(',')[0].trim() : req.socket.remoteAddress;
}

function checkRateLimit(req) {
  const now = Date.now();
  const ip = getClientIp(req);
  const current = requestCounts.get(ip);

  if (!current || now > current.resetAt) {
    const resetAt = now + RATE_LIMIT_WINDOW_MS;
    requestCounts.set(ip, { count: 1, resetAt });
    return { allowed: true, remaining: RATE_LIMIT - 1, resetAt };
  }

  current.count += 1;
  requestCounts.set(ip, current);

  return {
    allowed: current.count <= RATE_LIMIT,
    remaining: Math.max(0, RATE_LIMIT - current.count),
    resetAt: current.resetAt
  };
}

function addCheck(checks, locale, category, id, level, weight, value, messageKey) {
  const [title, description, recommendation] = checkText(locale, messageKey);
  checks.push({ category, id, level, weight, value, title, description, recommendation });
}

function planLimits(plan) {
  return PLAN_LIMITS[plan] || PLAN_LIMITS.free;
}

function planFeatures(plan) {
  return PLAN_FEATURES[plan] || PLAN_FEATURES.free;
}

async function loadUserPlan(userId) {
  if (!supabaseAdmin || !userId) return 'free';
  const { data } = await supabaseAdmin
    .from('profiles')
    .select('plan, subscription_status')
    .eq('id', userId)
    .maybeSingle();
  if (!data || data.subscription_status === 'canceled') return 'free';
  return PLAN_LIMITS[data.plan] ? data.plan : 'free';
}

function shouldRunForPlan(site, plan, now = new Date()) {
  const limits = planLimits(plan);
  if (!site.last_checked_at) return true;
  const requested = Number(site.check_interval_minutes || limits.interval_minutes);
  const interval = Math.max(limits.interval_minutes, requested);
  const elapsedMs = now.getTime() - new Date(site.last_checked_at).getTime();
  return elapsedMs >= interval * 60 * 1000;
}

function rdapEventDate(events) {
  if (!Array.isArray(events)) return null;
  const event = events.find((item) => {
    const action = String(item.eventAction || '').toLowerCase();
    return action.includes('expiration') || action.includes('expiry');
  });
  return event && event.eventDate ? event.eventDate : null;
}

function domainCandidates(hostname) {
  const labels = String(hostname || '').replace(/^www\./i, '').split('.').filter(Boolean);
  const candidates = [];
  for (let index = 0; index <= labels.length - 2; index += 1) {
    candidates.push(labels.slice(index).join('.'));
  }
  return [...new Set(candidates)];
}

async function getDomainExpiryInfo(hostname) {
  const candidates = domainCandidates(hostname);
  for (const domain of candidates) {
    try {
      const response = await axios.get(`https://rdap.org/domain/${encodeURIComponent(domain)}`, {
        timeout: 5000,
        proxy: false,
        validateStatus: () => true,
        headers: { 'User-Agent': 'SiteTraceBot/1.0 (+https://www.sitetrace.it.com/)' }
      });
      if (response.status >= 400 || !response.data) continue;
      const expiresAt = rdapEventDate(response.data.events);
      if (!expiresAt) continue;
      const expires = new Date(expiresAt);
      if (Number.isNaN(expires.getTime())) continue;
      const daysRemaining = Math.ceil((expires.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      return {
        domain,
        expires_at: expires.toISOString(),
        days_remaining: daysRemaining,
        source: 'rdap'
      };
    } catch (error) {
      // Try the next candidate; RDAP coverage varies by registry.
    }
  }

  return {
    domain: candidates[0] || hostname,
    expires_at: null,
    days_remaining: null,
    source: 'rdap',
    error: 'expiry_not_found'
  };
}

function addDomainExpiryCheck(checks, locale, domainExpiry) {
  if (!domainExpiry || domainExpiry.days_remaining === null || domainExpiry.days_remaining === undefined) {
    addCheck(checks, locale, 'domain', 'domain_expiry', 'warning', 10, 'Unknown', 'domainUnknown');
    return;
  }

  const days = Number(domainExpiry.days_remaining);
  const value = `${days} days`;
  if (days <= DOMAIN_EXPIRY_CRITICAL_DAYS) {
    addCheck(checks, locale, 'domain', 'domain_expiry', 'fail', 10, value, 'domainFail');
  } else if (days <= DOMAIN_EXPIRY_WARNING_DAYS) {
    addCheck(checks, locale, 'domain', 'domain_expiry', 'warning', 10, value, 'domainWarning');
  } else {
    addCheck(checks, locale, 'domain', 'domain_expiry', 'pass', 10, value, 'domain');
  }
}

function calculateScore(checks) {
  const totalWeight = checks.reduce((sum, check) => sum + check.weight, 0);
  const earned = checks.reduce((sum, check) => {
    if (check.level === 'pass') return sum + check.weight;
    if (check.level === 'warning') return sum + check.weight * 0.5;
    return sum;
  }, 0);

  return Math.round((earned / totalWeight) * 100);
}

function summarize(checks) {
  return checks.reduce((summary, check) => {
    summary[check.level] = (summary[check.level] || 0) + 1;
    summary[check.category] = (summary[check.category] || 0) + 1;
    return summary;
  }, { pass: 0, warning: 0, fail: 0, uptime: 0, seo: 0, security: 0, domain: 0, content: 0 });
}

function monitoringStatus(analysis) {
  const statusCode = Number(analysis.status_code || 0);
  const uptimeChecks = Array.isArray(analysis.checks)
    ? analysis.checks.filter((check) => check.category === 'uptime')
    : [];
  const responseTimeCheck = uptimeChecks.find((check) => check.id === 'response_time');
  const keywordCheck = Array.isArray(analysis.checks)
    ? analysis.checks.find((check) => check.id === 'keyword')
    : null;
  const domainCheck = Array.isArray(analysis.checks)
    ? analysis.checks.find((check) => check.id === 'domain_expiry')
    : null;

  if (!statusCode || statusCode >= 500) {
    return 'down';
  }

  if (keywordCheck && keywordCheck.level === 'fail') {
    return 'down';
  }

  if (statusCode >= 400 || (responseTimeCheck && responseTimeCheck.level === 'fail')) {
    return 'warning';
  }

  if (domainCheck && ['warning', 'fail'].includes(domainCheck.level)) {
    return 'warning';
  }

  return 'online';
}

function isInMaintenance(site, now = new Date()) {
  if (!site.maintenance_starts_at || !site.maintenance_ends_at) return false;
  const startsAt = new Date(site.maintenance_starts_at);
  const endsAt = new Date(site.maintenance_ends_at);
  return startsAt <= now && now <= endsAt;
}

function failedAnalysis(site, locale, error) {
  const checks = [];
  addCheck(checks, locale, 'uptime', 'status_code', 'fail', 12, 'unreachable', 'statusFail');

  return {
    status: 'success',
    analyzed_url: site.url,
    final_url: site.url,
    status_code: null,
    page_context: 'unreachable',
    response_time_ms: null,
    response_time: 'unreachable',
    title: 'Unreachable',
    meta_description: error.message,
    h1_count: 0,
    images: 0,
    images_with_alt: 0,
    seo_score: 0,
    score: 0,
    summary: summarize(checks),
    ssl: null,
    checks,
    error_detail: error.message
  };
}

function getSslInfo(urlObj) {
  if (urlObj.protocol !== 'https:') {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    const socket = tls.connect({ host: urlObj.hostname, port: 443, servername: urlObj.hostname, timeout: 5000 }, () => {
      const cert = socket.getPeerCertificate();
      socket.end();

      if (!cert || !cert.valid_to) {
        resolve(null);
        return;
      }

      const expiresAt = new Date(cert.valid_to);
      const daysRemaining = Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      resolve({ issuer: cert.issuer && cert.issuer.O, expires_at: expiresAt.toISOString(), days_remaining: daysRemaining });
    });

    socket.on('error', () => resolve(null));
    socket.on('timeout', () => {
      socket.destroy();
      resolve(null);
    });
  });
}

function responseText(data) {
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
  return buffer.toString('utf8');
}

function importantIssues(analysis, limit = 5) {
  return Array.isArray(analysis && analysis.checks)
    ? analysis.checks.filter((check) => check.level !== 'pass').slice(0, limit)
    : [];
}

function alertEmailText({ site, status, analysis, incident }) {
  const statusLabel = status === 'resolved' ? 'back online' : status;
  const issues = importantIssues(analysis, 5);
  const lines = [
    'SiteTrace account notification',
    '',
    `Monitor: ${site.name}`,
    `Current status: ${statusLabel}`,
    `Score: ${analysis.score}/100`,
    `Status code: ${analysis.status_code || '-'}`,
    `Response time: ${analysis.response_time || '-'}`,
    '',
    ...(issues.length ? ['Top issues:', ...issues.map((issue) => `- ${issue.title}: ${issue.value}`), ''] : []),
    'You are receiving this because you created a SiteTrace account and enabled website monitoring.',
    `Dashboard: ${APP_URL}/dashboard`
  ];

  if (incident && incident.duration_seconds) {
    lines.push(`Incident duration: ${Math.round(incident.duration_seconds / 60)} minutes`);
  }

  lines.push('', 'Open SiteTrace to review the full check history.');
  return lines.join('\n');
}

async function retrieveResendEmail(emailId) {
  if (!RESEND_READ_API_KEY || !emailId) return null;

  const response = await fetch(`https://api.resend.com/emails/${encodeURIComponent(emailId)}`, {
    headers: { Authorization: `Bearer ${RESEND_READ_API_KEY}` }
  });

  if (!response.ok) {
    return { error: await response.text() };
  }

  return response.json();
}

async function sendAlertEmail({ to, site, status, analysis, incident }) {
  if (!RESEND_API_KEY || !to) {
    return { sent: false, reason: 'email_not_configured' };
  }

  const statusLabel = status === 'resolved' ? 'back online' : status;
  const safeSiteName = escapeHtml(site.name);
  const safeStatusLabel = escapeHtml(statusLabel);
  const subject = emailHeaderValue(status === 'resolved'
    ? `SiteTrace account notification: ${site.name} is back online`
    : `SiteTrace account notification for ${site.name}`);
  const issues = importantIssues(analysis, 5);
  const issueRows = issues.map((issue) => `
        <tr><td style="padding:4px 16px 4px 0;color:#4b5563;">${escapeHtml(issue.title)}</td><td style="padding:4px 0;">${escapeHtml(issue.value || issue.level)}</td></tr>
  `).join('');
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.55;color:#111827;background:#ffffff;max-width:560px;">
      <h2 style="margin:0 0 12px;font-size:20px;">SiteTrace account notification</h2>
      <p style="margin:0 0 16px;">The monitor <strong>${safeSiteName}</strong> is currently <strong>${safeStatusLabel}</strong>.</p>
      <table role="presentation" style="border-collapse:collapse;margin:0 0 16px;">
        <tr><td style="padding:4px 16px 4px 0;color:#4b5563;">Score</td><td style="padding:4px 0;">${escapeHtml(analysis.score)}/100</td></tr>
        <tr><td style="padding:4px 16px 4px 0;color:#4b5563;">Status code</td><td style="padding:4px 0;">${escapeHtml(analysis.status_code || '-')}</td></tr>
        <tr><td style="padding:4px 16px 4px 0;color:#4b5563;">Response time</td><td style="padding:4px 0;">${escapeHtml(analysis.response_time || '-')}</td></tr>
        ${issueRows}
        ${incident && incident.duration_seconds ? `<tr><td style="padding:4px 16px 4px 0;color:#4b5563;">Duration</td><td style="padding:4px 0;">${Math.round(incident.duration_seconds / 60)} minutes</td></tr>` : ''}
      </table>
      <p style="margin:0 0 18px;">Review the full check history in your SiteTrace dashboard.</p>
      <p style="margin:0;"><a href="${APP_URL}/dashboard" style="color:#0f766e;">Open dashboard</a></p>
      <p style="margin:22px 0 0;color:#6b7280;font-size:12px;">You are receiving this because you created a SiteTrace account and enabled website monitoring.</p>
    </div>
  `;
  const text = alertEmailText({ site, status, analysis, incident });

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: ALERT_FROM_EMAIL,
      to,
      subject,
      html,
      text,
      reply_to: ALERT_REPLY_TO_EMAIL,
      headers: {
        'X-Entity-Ref-ID': incident && incident.id ? `sitetrace-${incident.id}` : `sitetrace-${Date.now()}`
      },
      tags: [
        { name: 'app', value: 'sitetrace' },
        { name: 'kind', value: status === 'resolved' ? 'incident_resolved' : 'incident_alert' }
      ]
    })
  });

  if (!response.ok) {
    return { sent: false, reason: await response.text() };
  }

  let data = null;
  try {
    data = await response.json();
  } catch (error) {
    data = null;
  }

  return { sent: true, id: data && data.id ? data.id : null };
}

async function sendPlainDiagnosticEmail({ to }) {
  if (!RESEND_API_KEY || !to) {
    return { sent: false, reason: 'email_not_configured' };
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: ALERT_FROM_EMAIL,
      to,
      subject: 'SiteTrace email check',
      text: [
        'SiteTrace email check',
        '',
        'This is a plain text message to confirm that your SiteTrace account can receive email.',
        '',
        'No action is required.'
      ].join('\n'),
      reply_to: ALERT_REPLY_TO_EMAIL,
      headers: {
        'X-Entity-Ref-ID': `sitetrace-test-${Date.now()}`
      }
    })
  });

  if (!response.ok) {
    return { sent: false, reason: await response.text() };
  }

  let data = null;
  try {
    data = await response.json();
  } catch (error) {
    data = null;
  }

  return { sent: true, id: data && data.id ? data.id : null };
}

function incidentText({ site, status, analysis, incident }) {
  const statusLabel = status === 'resolved' ? 'back online' : status;
  const issues = importantIssues(analysis, 5);
  const lines = [
    `SiteTrace: ${site.name} is ${statusLabel}`,
    `URL: ${site.url}`,
    `Status code: ${analysis.status_code || '-'}`,
    `Response time: ${analysis.response_time || '-'}`,
    `Score: ${analysis.score || '-'}/100`
  ];

  if (issues.length) {
    lines.push('', 'Top issues:');
    issues.forEach((issue) => lines.push(`- ${issue.title}: ${issue.value}`));
  }

  if (incident && incident.duration_seconds) {
    lines.push(`Duration: ${Math.round(incident.duration_seconds / 60)} minutes`);
  }

  if (site.public_slug) {
    lines.push(`Status page: ${APP_URL}/status/${site.public_slug}`);
  }

  return lines.join('\n');
}

async function postJsonWebhook(url, payload) {
  if (!url) return { sent: false, reason: 'not_configured' };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    return { sent: false, reason: await response.text() };
  }

  return { sent: true };
}

async function sendSlackNotification(context) {
  if (!SLACK_WEBHOOK_URL) return { sent: false, reason: 'slack_not_configured' };
  const text = incidentText(context);
  return postJsonWebhook(SLACK_WEBHOOK_URL, {
    text,
    blocks: [
      { type: 'section', text: { type: 'mrkdwn', text: `*${context.site.name}* is *${context.status === 'resolved' ? 'back online' : context.status}*` } },
      { type: 'section', text: { type: 'mrkdwn', text: `URL: ${context.site.url}\nHTTP: ${context.analysis.status_code || '-'} | Response: ${context.analysis.response_time || '-'} | Score: ${context.analysis.score || '-'}/100` } },
      ...(context.site.public_slug ? [{ type: 'section', text: { type: 'mrkdwn', text: `<${APP_URL}/status/${context.site.public_slug}|Open public status page>` } }] : [])
    ]
  });
}

async function sendTeamsNotification(context) {
  if (!TEAMS_WEBHOOK_URL) return { sent: false, reason: 'teams_not_configured' };
  const text = incidentText(context).replace(/\n/g, '\n\n');
  return postJsonWebhook(TEAMS_WEBHOOK_URL, {
    type: 'message',
    text
  });
}

function shouldSendEmailForStatus(site, status) {
  if (site.email_alerts_enabled === false) return false;
  if (status === 'resolved') return site.alert_on_recovery !== false;
  if (status === 'down') return site.alert_on_down !== false;
  if (status === 'warning') return site.alert_on_warning !== false;
  return true;
}

async function sendIncidentNotifications({ to, site, status, analysis, incident, features = PLAN_FEATURES.free }) {
  const [email, slack, teams] = await Promise.all([
    features.email_alerts && shouldSendEmailForStatus(site, status)
      ? sendAlertEmail({ to, site, status, analysis, incident }).catch((error) => ({ sent: false, reason: error.message }))
      : Promise.resolve({ sent: false, reason: features.email_alerts ? 'email_alert_disabled' : 'plan_does_not_include_email_alerts' }),
    features.webhooks
      ? sendSlackNotification({ site, status, analysis, incident }).catch((error) => ({ sent: false, reason: error.message }))
      : Promise.resolve({ sent: false, reason: 'plan_does_not_include_webhooks' }),
    features.webhooks
      ? sendTeamsNotification({ site, status, analysis, incident }).catch((error) => ({ sent: false, reason: error.message }))
      : Promise.resolve({ sent: false, reason: 'plan_does_not_include_webhooks' })
  ]);

  console.info('Incident notification result:', {
    site_id: site.id,
    user_id: site.user_id,
    status,
    to: to ? 'configured' : 'missing',
    email,
    slack,
    teams
  });

  return { email, slack, teams };
}

async function loadProfileEmail(userId) {
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.getUserById(userId);
  const authEmail = authData && authData.user && authData.user.email ? authData.user.email : null;

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('email')
    .eq('id', userId)
    .single();

  if (authEmail) {
    if (!profile || profile.email !== authEmail) {
      await supabaseAdmin
        .from('profiles')
        .upsert({ id: userId, email: authEmail, updated_at: new Date().toISOString() }, { onConflict: 'id' });
    }

    return authEmail;
  }

  if (authError) {
    console.error('Auth email lookup error:', authError.message);
  }

  if (profile && profile.email) {
    return profile.email;
  }

  if (authError || !authData || !authData.user) {
    return null;
  }
}

async function resolveOpenIncidents({ site, analysis }) {
  const { data: openIncidents } = await supabaseAdmin
    .from('incidents')
    .select('*')
    .eq('site_id', site.id)
    .in('status', ['down', 'warning'])
    .is('resolved_at', null);

  const resolved = [];

  for (const incident of openIncidents || []) {
    const resolvedAt = new Date();
    const durationSeconds = Math.max(0, Math.round((resolvedAt.getTime() - new Date(incident.created_at).getTime()) / 1000));
    const { data: updated, error } = await supabaseAdmin
      .from('incidents')
      .update({
        status: 'resolved',
        resolved_at: resolvedAt.toISOString(),
        duration_seconds: durationSeconds,
        resolved_details: analysis
      })
      .eq('id', incident.id)
      .select('*')
      .single();

    if (!error && updated) {
      const notifications = await sendIncidentNotifications({ to: await loadProfileEmail(site.user_id), site, status: 'resolved', analysis, incident: updated });
      resolved.push({ incident: updated, notifications });
    }
  }

  return resolved;
}

async function recordIncidentIfNeeded({ site, level, analysis }) {
  if (!supabaseAdmin) {
    return null;
  }

  if (level === 'maintenance') {
    return { skipped: 'maintenance' };
  }

  if (level === 'online') {
    return resolveOpenIncidents({ site, analysis });
  }

  if (!['down', 'warning'].includes(level)) {
    return null;
  }

  const { data: recentChecks } = await supabaseAdmin
    .from('checks')
    .select('status, created_at')
    .eq('site_id', site.id)
    .order('created_at', { ascending: false })
    .limit(2);

  const previousCheck = recentChecks && recentChecks[1];
  const confirmed = previousCheck && previousCheck.status === level;
  if (!confirmed) {
    return { pending_confirmation: true };
  }

  const { data: existing } = await supabaseAdmin
    .from('incidents')
    .select('*')
    .eq('site_id', site.id)
    .eq('status', level)
    .is('resolved_at', null)
    .limit(1)
    .maybeSingle();

  if (existing) return { incident: existing, existing: true };

  const { data: incident, error } = await supabaseAdmin
    .from('incidents')
    .insert({
      site_id: site.id,
      user_id: site.user_id,
      status: level,
      title: `${site.name}: ${(importantIssues(analysis, 1)[0] && importantIssues(analysis, 1)[0].title) || `is ${level}`}`,
      details: analysis,
      confirmed_after_checks: 2
    })
    .select('*')
    .single();

  if (error) {
    console.error('Incident insert error:', error.message);
    return null;
  }

  const plan = await loadUserPlan(site.user_id);
  const notifications = await sendIncidentNotifications({ to: await loadProfileEmail(site.user_id), site, status: level, analysis, incident, features: planFeatures(plan) });
  return { incident, notifications };
}

async function requireUser(req, res, next) {
  if (!supabaseAdmin) {
    return res.status(503).json({ status: 'error', message: 'Supabase server credentials are not configured' });
  }

  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');

  if (!token) {
    return res.status(401).json({ status: 'error', message: 'Missing auth token' });
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !data.user) {
    return res.status(401).json({ status: 'error', message: 'Invalid auth token' });
  }

  req.user = data.user;
  next();
}

async function analyzeWebsite(rawUrl, locale, options = {}) {
  const urlObj = normalizeUrl(rawUrl);
  const startedAt = Date.now();
  const sslPromise = getSslInfo(urlObj);
  const domainExpiryPromise = getDomainExpiryInfo(urlObj.hostname).catch((error) => ({
    domain: urlObj.hostname,
    expires_at: null,
    days_remaining: null,
    source: 'rdap',
    error: error.message
  }));

  const response = await axios.get(urlObj.toString(), {
    timeout: API_TIMEOUT_MS,
    maxRedirects: 5,
    maxContentLength: MAX_BODY_BYTES,
    proxy: false,
    responseType: 'arraybuffer',
    validateStatus: () => true,
    headers: {
      'User-Agent': 'SiteTraceBot/1.0 (+https://www.sitetrace.it.com/)'
    }
  });

  const responseTime = Date.now() - startedAt;
  const finalUrl = response.request && response.request.res && response.request.res.responseUrl
    ? response.request.res.responseUrl
    : urlObj.toString();
  const html = responseText(response.data);
  const pageSizeBytes = Buffer.byteLength(html, 'utf8');
  const $ = cheerio.load(html);
  const headers = response.headers || {};
  const [ssl, domainExpiry] = await Promise.all([sslPromise, domainExpiryPromise]);
  const checks = [];

  const title = ($('title').first().text() || '').trim().replace(/\s+/g, ' ');
  const metaDescription = ($('meta[name="description" i]').attr('content') || '').trim().replace(/\s+/g, ' ');
  const h1Count = $('h1').length;
  const images = $('img').length;
  const imagesWithAlt = $('img').filter((_, img) => Boolean(($(img).attr('alt') || '').trim())).length;
  const altRatio = images === 0 ? 1 : imagesWithAlt / images;
  const canonical = $('link[rel="canonical" i]').attr('href') || '';
  const viewport = $('meta[name="viewport" i]').attr('content') || '';
  const htmlLang = $('html').attr('lang') || '';
  const robots = ($('meta[name="robots" i]').attr('content') || '').toLowerCase();
  const ogCount = $('meta[property^="og:" i]').length;
  const structuredDataCount = $('script[type="application/ld+json" i]').length;
  const visibleText = $('body').text().replace(/\s+/g, ' ').trim();
  const wordCount = visibleText ? visibleText.split(/\s+/).filter(Boolean).length : 0;
  const internalLinks = $('a[href]').filter((_, link) => {
    const href = ($(link).attr('href') || '').trim();
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return false;
    try {
      const linkUrl = new URL(href, finalUrl);
      return linkUrl.hostname.replace(/^www\./, '') === urlObj.hostname.replace(/^www\./, '');
    } catch (error) {
      return false;
    }
  }).length;
  const favicon = $('link[rel~="icon" i], link[rel="shortcut icon" i], link[rel="apple-touch-icon" i]').first().attr('href') || '';
  const hasFrameProtection = Boolean(headers['x-frame-options'] || (headers['content-security-policy'] || '').includes('frame-ancestors'));
  const pageContext = getPageContext(urlObj, title, metaDescription);

  if (response.status >= 500) addCheck(checks, locale, 'uptime', 'status_code', 'fail', 12, response.status, 'statusFail');
  else if (response.status >= 400) addCheck(checks, locale, 'uptime', 'status_code', 'warning', 12, response.status, 'statusWarning');
  else addCheck(checks, locale, 'uptime', 'status_code', 'pass', 12, response.status, 'status');

  if (responseTime < 1000) addCheck(checks, locale, 'uptime', 'response_time', 'pass', 12, `${responseTime}ms`, 'speed');
  else if (responseTime < 3000) addCheck(checks, locale, 'uptime', 'response_time', 'warning', 12, `${responseTime}ms`, 'speedWarning');
  else addCheck(checks, locale, 'uptime', 'response_time', 'fail', 12, `${responseTime}ms`, 'speedFail');

  const keyword = typeof options.keyword === 'string' ? options.keyword.trim() : '';
  if (keyword) {
    const found = html.toLowerCase().includes(keyword.toLowerCase());
    const shouldExist = options.keyword_should_exist !== false;
    const passed = shouldExist ? found : !found;
    addCheck(checks, locale, 'uptime', 'keyword', passed ? 'pass' : 'fail', 10, keyword, passed ? 'keyword' : 'keywordFail');
  }

  if (urlObj.protocol === 'https:') addCheck(checks, locale, 'uptime', 'https', 'pass', 8, 'https', 'https');
  else addCheck(checks, locale, 'uptime', 'https', 'warning', 8, 'http', 'httpsWarning');

  if (ssl && ssl.days_remaining > 30) addCheck(checks, locale, 'uptime', 'ssl', 'pass', 8, `${ssl.days_remaining} days`, 'ssl');
  else addCheck(checks, locale, 'uptime', 'ssl', 'warning', 8, ssl ? `${ssl.days_remaining} days` : 'Unavailable', 'sslWarning');

  if (!title) addCheck(checks, locale, 'seo', 'title', 'fail', 10, 'Missing', 'titleFail');
  else if (title.length < 30 && pageContext !== 'standard') addCheck(checks, locale, 'seo', 'title', 'pass', 6, `${title.length} chars`, 'titlePlatform');
  else if (title.length < 30 || title.length > 60) addCheck(checks, locale, 'seo', 'title', 'warning', 10, `${title.length} chars`, 'titleWarning');
  else addCheck(checks, locale, 'seo', 'title', 'pass', 10, `${title.length} chars`, 'title');

  if (!metaDescription) addCheck(checks, locale, 'seo', 'meta_description', 'fail', 10, 'Missing', 'metaFail');
  else if (metaDescription.length < 70 || metaDescription.length > 160) addCheck(checks, locale, 'seo', 'meta_description', 'warning', 10, `${metaDescription.length} chars`, 'metaWarning');
  else addCheck(checks, locale, 'seo', 'meta_description', 'pass', 10, `${metaDescription.length} chars`, 'meta');

  if (h1Count === 0 && pageContext !== 'standard') addCheck(checks, locale, 'seo', 'h1', 'pass', 4, h1Count, 'h1Platform');
  else if (h1Count === 0) addCheck(checks, locale, 'seo', 'h1', 'fail', 8, h1Count, 'h1Fail');
  else if (h1Count > 1) addCheck(checks, locale, 'seo', 'h1', 'warning', 8, h1Count, 'h1Warning');
  else addCheck(checks, locale, 'seo', 'h1', 'pass', 8, h1Count, 'h1');

  if (altRatio >= 0.8) addCheck(checks, locale, 'seo', 'image_alt', 'pass', 7, `${imagesWithAlt}/${images}`, 'alt');
  else if (altRatio >= 0.5) addCheck(checks, locale, 'seo', 'image_alt', 'warning', 7, `${imagesWithAlt}/${images}`, 'altWarning');
  else addCheck(checks, locale, 'seo', 'image_alt', 'fail', 7, `${imagesWithAlt}/${images}`, 'altFail');

  addCheck(checks, locale, 'seo', 'canonical', canonical ? 'pass' : 'warning', 4, canonical || 'Missing', canonical ? 'canonical' : 'canonicalWarning');
  if (viewport) addCheck(checks, locale, 'seo', 'viewport', 'pass', 4, viewport, 'viewport');
  else if (pageContext !== 'standard') addCheck(checks, locale, 'seo', 'viewport', 'pass', 1, 'Platform-managed', 'viewportPlatform');
  else addCheck(checks, locale, 'seo', 'viewport', 'fail', 4, 'Missing', 'viewportFail');

  addCheck(checks, locale, 'seo', 'lang', htmlLang ? 'pass' : 'warning', 3, htmlLang || 'Missing', htmlLang ? 'lang' : 'langWarning');

  if (ogCount >= 3) addCheck(checks, locale, 'seo', 'open_graph', 'pass', 3, ogCount, 'og');
  else if (pageContext !== 'standard') addCheck(checks, locale, 'seo', 'open_graph', 'pass', 1, ogCount, 'ogPlatform');
  else addCheck(checks, locale, 'seo', 'open_graph', 'warning', 3, ogCount, 'ogWarning');

  addCheck(checks, locale, 'seo', 'robots_indexing', robots.includes('noindex') ? 'fail' : 'pass', 3, robots || 'indexable', robots.includes('noindex') ? 'robotsFail' : 'robots');
  addCheck(checks, locale, 'seo', 'structured_data', structuredDataCount ? 'pass' : 'warning', 4, structuredDataCount || 'Missing', structuredDataCount ? 'structuredData' : 'structuredDataWarning');
  addCheck(checks, locale, 'content', 'word_count', wordCount >= 250 ? 'pass' : 'warning', 4, wordCount, wordCount >= 250 ? 'wordCount' : 'wordCountWarning');
  addCheck(checks, locale, 'content', 'links', internalLinks >= 3 ? 'pass' : 'warning', 3, internalLinks, internalLinks >= 3 ? 'links' : 'linksWarning');
  addCheck(checks, locale, 'content', 'page_size', pageSizeBytes <= 500000 ? 'pass' : 'warning', 3, `${Math.round(pageSizeBytes / 1024)}KB`, pageSizeBytes <= 500000 ? 'pageSize' : 'pageSizeWarning');
  addCheck(checks, locale, 'content', 'favicon', favicon ? 'pass' : 'warning', 2, favicon || 'Missing', favicon ? 'favicon' : 'faviconWarning');

  addCheck(checks, locale, 'security', 'hsts', headers['strict-transport-security'] ? 'pass' : 'warning', 3, headers['strict-transport-security'] ? 'Present' : 'Missing', headers['strict-transport-security'] ? 'hsts' : 'hstsWarning');
  addCheck(checks, locale, 'security', 'csp', headers['content-security-policy'] ? 'pass' : 'warning', 3, headers['content-security-policy'] ? 'Present' : 'Missing', headers['content-security-policy'] ? 'csp' : 'cspWarning');
  addCheck(checks, locale, 'security', 'frame', hasFrameProtection ? 'pass' : 'warning', 2, headers['x-frame-options'] || 'Missing', hasFrameProtection ? 'frame' : 'frameWarning');
  addDomainExpiryCheck(checks, locale, domainExpiry);

  const score = calculateScore(checks);

  return {
    status: 'success',
    analyzed_url: urlObj.toString(),
    final_url: finalUrl,
    status_code: response.status,
    page_context: pageContext,
    response_time_ms: responseTime,
    response_time: `${responseTime}ms`,
    page_size_bytes: pageSizeBytes,
    word_count: wordCount,
    internal_links: internalLinks,
    structured_data_count: structuredDataCount,
    favicon: favicon || null,
    title: title || 'No title',
    meta_description: metaDescription || 'No description',
    h1_count: h1Count,
    images,
    images_with_alt: imagesWithAlt,
    seo_score: score,
    score,
    summary: summarize(checks),
    ssl,
    domain_expiry: domainExpiry,
    checks
  };
}

async function runMonitorCheck(site, locale, userId) {
  if (isInMaintenance(site)) {
    const analysis = {
      status: 'success',
      analyzed_url: site.url,
      final_url: site.url,
      status_code: null,
      page_context: 'maintenance',
      response_time_ms: null,
      response_time: 'maintenance',
      title: 'Maintenance window',
      meta_description: 'Monitoring paused during scheduled maintenance.',
      h1_count: 0,
      images: 0,
      images_with_alt: 0,
      seo_score: site.last_score || 0,
      score: site.last_score || 0,
      summary: { pass: 0, warning: 0, fail: 0, uptime: 0, seo: 0, security: 0 },
      ssl: null,
      checks: []
    };

    const { data: check, error: checkError } = await supabaseAdmin
      .from('checks')
      .insert({
        site_id: site.id,
        user_id: userId || site.user_id,
        status: 'maintenance',
        score: analysis.score,
        status_code: null,
        response_time_ms: null,
        result: analysis
      })
      .select('*')
      .single();

    if (checkError) throw checkError;

    await supabaseAdmin
      .from('sites')
      .update({
        last_status: 'maintenance',
        last_checked_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', site.id);

    return { analysis, check, level: 'maintenance', incident: { skipped: 'maintenance' } };
  }

  let analysis;
  try {
    analysis = await analyzeWebsite(site.url, locale, {
      keyword: site.keyword,
      keyword_should_exist: site.keyword_should_exist
    });
  } catch (error) {
    analysis = failedAnalysis(site, locale, error);
  }
  const level = monitoringStatus(analysis);

  const { data: check, error: checkError } = await supabaseAdmin
    .from('checks')
    .insert({
      site_id: site.id,
      user_id: userId || site.user_id,
      status: level,
      score: analysis.score,
      status_code: analysis.status_code,
      response_time_ms: analysis.response_time_ms,
      result: analysis
    })
    .select('*')
    .single();

  if (checkError) throw checkError;

  const incident = await recordIncidentIfNeeded({ site, level, analysis });

  await supabaseAdmin
    .from('sites')
    .update({
      last_status: level,
      last_score: analysis.score,
      last_response_time_ms: analysis.response_time_ms,
      last_checked_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', site.id);

  return { analysis, check, level, incident };
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'sitetrace-api' });
});

app.post('/analyze', async (req, res) => {
  const locale = language(req.body.locale);
  const limit = checkRateLimit(req);

  if (!limit.allowed) {
    return res.status(429).json({
      status: 'error',
      code: 'rate_limited',
      message: messages[locale].rate,
      reset_at: new Date(limit.resetAt).toISOString()
    });
  }

  try {
    res.json({
      ...(await analyzeWebsite(req.body.url, locale)),
      rate_limit: {
        remaining: limit.remaining,
        reset_at: new Date(limit.resetAt).toISOString()
      }
    });
  } catch (error) {
    console.error('Analyze error:', error.message);
    const statusCode = error.message.includes('URL') || error.message.includes('protocol') || error.message.includes('Private') ? 400 : 502;
    res.status(statusCode).json({
      status: 'error',
      code: statusCode === 400 ? 'invalid_url' : 'fetch_failed',
      message: statusCode === 400 ? messages[locale].invalid : messages[locale].fetch,
      detail: error.message
    });
  }
});

app.get('/config', (req, res) => {
  res.json({
    supabase_url: SUPABASE_URL,
    supabase_anon_key: SUPABASE_ANON_KEY,
    billing_enabled: Boolean(stripe && STRIPE_STARTER_PRICE_ID && STRIPE_AGENCY_PRICE_ID),
    alerts_enabled: Boolean(RESEND_API_KEY || SLACK_WEBHOOK_URL || TEAMS_WEBHOOK_URL),
    email_alerts_enabled: Boolean(RESEND_API_KEY),
    alert_from_email: ALERT_FROM_EMAIL,
    delivery_lookup_configured: Boolean(RESEND_READ_API_KEY && RESEND_READ_API_KEY !== RESEND_API_KEY),
    email_dns_guidance: EMAIL_DNS_GUIDANCE,
    slack_alerts_enabled: Boolean(SLACK_WEBHOOK_URL),
    teams_alerts_enabled: Boolean(TEAMS_WEBHOOK_URL),
    plans: {
      free: { ...PLAN_LIMITS.free, features: { ...PLAN_FEATURES.free } },
      starter: { ...PLAN_LIMITS.starter, features: { ...PLAN_FEATURES.starter }, price_id: STRIPE_STARTER_PRICE_ID || null },
      agency: { ...PLAN_LIMITS.agency, features: { ...PLAN_FEATURES.agency }, price_id: STRIPE_AGENCY_PRICE_ID || null }
    }
  });
});

app.get('/api/me', requireUser, async (req, res) => {
  let { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('*')
    .eq('id', req.user.id)
    .single();

  if (!profile || !profile.email) {
    const { data: repaired } = await supabaseAdmin
      .from('profiles')
      .upsert({ id: req.user.id, email: req.user.email, updated_at: new Date().toISOString() }, { onConflict: 'id' })
      .select('*')
      .single();
    profile = repaired || profile;
  }

  const plan = profile && PLAN_LIMITS[profile.plan] && profile.subscription_status !== 'canceled' ? profile.plan : 'free';
  const limits = planLimits(plan);
  const features = planFeatures(plan);
  const { count } = await supabaseAdmin
    .from('sites')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', req.user.id);

  res.json({
    user: { id: req.user.id, email: req.user.email },
    profile: profile || { id: req.user.id, plan: 'free', subscription_status: 'inactive' },
    plan,
    limits,
    features,
    usage: { sites: count || 0 }
  });
});

app.post('/api/sites', requireUser, async (req, res) => {
  const plan = await loadUserPlan(req.user.id);
  const limits = planLimits(plan);
  const features = planFeatures(plan);
  const { count } = await supabaseAdmin
    .from('sites')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', req.user.id);

  if (!features.monitored_sites) {
    return res.status(402).json({
      status: 'error',
      code: 'paid_monitoring_required',
      message: 'The free plan includes instant audits only. Upgrade to Starter to add monitored sites, history, and alerts.',
      plan,
      limits,
      features,
      usage: { sites: count || 0 }
    });
  }

  if ((count || 0) >= limits.sites) {
    return res.status(402).json({
      status: 'error',
      code: 'plan_limit_reached',
      message: `Your ${plan} plan supports up to ${limits.sites} monitored site${limits.sites === 1 ? '' : 's'}. Upgrade to add more.`,
      plan,
      limits,
      features,
      usage: { sites: count || 0 }
    });
  }

  const name = String(req.body.name || '').trim();
  const url = String(req.body.url || '').trim();

  if (!name || !url) {
    return res.status(400).json({ status: 'error', message: 'Site name and URL are required' });
  }

  let normalized;
  try {
    normalized = normalizeUrl(url).toString();
  } catch (error) {
    return res.status(400).json({ status: 'error', message: error.message });
  }

  const { data, error } = await supabaseAdmin
    .from('sites')
    .insert({
      user_id: req.user.id,
      name,
      url: normalized,
      monitoring_enabled: true,
      check_interval_minutes: limits.interval_minutes
    })
    .select('*')
    .single();

  if (error) {
    return res.status(400).json({ status: 'error', message: error.message });
  }

  res.status(201).json({ status: 'success', site: data, plan, limits, features, usage: { sites: (count || 0) + 1 } });
});

app.post('/api/test-alert-email', requireUser, async (req, res) => {
  const plan = await loadUserPlan(req.user.id);
  const features = planFeatures(plan);
  if (!features.email_alerts) {
    return res.status(402).json({
      status: 'error',
      code: 'paid_alerts_required',
      message: 'Email alerts are available on Starter and Agency plans.',
      plan,
      features
    });
  }

  const to = req.user.email || await loadProfileEmail(req.user.id);
  const email = await sendPlainDiagnosticEmail({ to }).catch((error) => ({ sent: false, reason: error.message }));

  console.info('Test alert email result:', {
    user_id: req.user.id,
    to: to ? 'configured' : 'missing',
    email
  });

  if (!email.sent) {
    return res.status(502).json({
      status: 'error',
      message: 'Test email was not sent',
      email,
      email_dns_guidance: EMAIL_DNS_GUIDANCE,
      email_alerts_enabled: Boolean(RESEND_API_KEY),
      alert_from_email: ALERT_FROM_EMAIL
    });
  }

  let delivery = null;
  if (email.id) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    delivery = await retrieveResendEmail(email.id).catch((error) => ({ error: error.message }));
  }

  res.json({
    status: 'success',
    message: 'Test email sent',
    email,
    delivery,
    to,
    alert_from_email: ALERT_FROM_EMAIL,
    email_dns_guidance: EMAIL_DNS_GUIDANCE
  });
});

app.get('/api/email-status/:id', requireUser, async (req, res) => {
  const delivery = await retrieveResendEmail(req.params.id).catch((error) => ({ error: error.message }));
  if (!delivery || delivery.error) {
    return res.status(502).json({
      status: 'error',
      message: 'Could not retrieve email delivery status',
      delivery
    });
  }

  res.json({ status: 'success', delivery });
});

app.post('/api/run-site-check', requireUser, async (req, res) => {
  const locale = language(req.body.locale);
  const siteId = req.body.site_id;
  const plan = await loadUserPlan(req.user.id);
  const features = planFeatures(plan);

  if (!features.monitored_sites) {
    return res.status(402).json({
      status: 'error',
      code: 'paid_monitoring_required',
      message: 'Monitor checks, history, and incidents are available on paid plans. Use the public scanner for free one-time audits.',
      plan,
      features
    });
  }

  if (!siteId) {
    return res.status(400).json({ status: 'error', message: 'site_id is required' });
  }

  const { data: site, error: siteError } = await supabaseAdmin
    .from('sites')
    .select('*')
    .eq('id', siteId)
    .eq('user_id', req.user.id)
    .single();

  if (siteError || !site) {
    return res.status(404).json({ status: 'error', message: 'Site not found' });
  }

  try {
    const result = await runMonitorCheck(site, locale, req.user.id);
    res.json({ status: 'success', ...result });
  } catch (error) {
    res.status(502).json({ status: 'error', message: messages[locale].fetch, detail: error.message });
  }
});

app.patch('/api/sites/:id', requireUser, async (req, res) => {
  const plan = await loadUserPlan(req.user.id);
  const features = planFeatures(plan);
  const updates = {};
  const allowed = [
    'name',
    'url',
    'monitoring_enabled',
    'keyword',
    'keyword_should_exist',
    'maintenance_starts_at',
    'maintenance_ends_at',
    'status_page_enabled',
    'email_alerts_enabled',
    'alert_on_down',
    'alert_on_warning',
    'alert_on_recovery'
  ];

  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(req.body, key)) {
      updates[key] = req.body[key] === '' ? null : req.body[key];
    }
  }

  if (updates.status_page_enabled && !features.status_pages) {
    return res.status(402).json({ status: 'error', code: 'paid_status_required', message: 'Public status pages are available on Starter and Agency plans.', plan, features });
  }

  if ((updates.email_alerts_enabled || updates.alert_on_down || updates.alert_on_warning || updates.alert_on_recovery) && !features.email_alerts) {
    return res.status(402).json({ status: 'error', code: 'paid_alerts_required', message: 'Email alerts are available on Starter and Agency plans.', plan, features });
  }

  updates.updated_at = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from('sites')
    .update(updates)
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .select('*')
    .single();

  if (error) {
    return res.status(400).json({ status: 'error', message: error.message });
  }

  res.json({ status: 'success', site: data });
});

app.get('/public/status/:slug', async (req, res) => {
  if (!supabaseAdmin) {
    return res.status(503).json({ status: 'error', message: 'Status pages are not configured' });
  }

  const { data: site, error } = await supabaseAdmin
    .from('sites')
    .select('id, name, url, last_status, last_score, last_response_time_ms, last_checked_at, status_page_enabled, public_slug')
    .eq('public_slug', req.params.slug)
    .eq('status_page_enabled', true)
    .single();

  if (error || !site) {
    return res.status(404).json({ status: 'error', message: 'Status page not found' });
  }

  const { data: checks } = await supabaseAdmin
    .from('checks')
    .select('status, score, status_code, response_time_ms, created_at')
    .eq('site_id', site.id)
    .order('created_at', { ascending: false })
    .limit(50);

  const { data: incidents } = await supabaseAdmin
    .from('incidents')
    .select('status, title, created_at, resolved_at, duration_seconds')
    .eq('site_id', site.id)
    .order('created_at', { ascending: false })
    .limit(20);

  res.json({ status: 'success', site, checks: checks || [], incidents: incidents || [] });
});

app.post('/billing/create-checkout-session', requireUser, async (req, res) => {
  if (!stripe) {
    return res.status(503).json({ status: 'error', message: 'Stripe is not configured' });
  }

  const plan = req.body.plan === 'agency' ? 'agency' : 'starter';
  const priceId = plan === 'agency' ? STRIPE_AGENCY_PRICE_ID : STRIPE_STARTER_PRICE_ID;

  if (!priceId) {
    return res.status(503).json({ status: 'error', message: `Stripe price id for ${plan} is not configured` });
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer_email: req.user.email,
    client_reference_id: req.user.id,
    line_items: [{ price: priceId, quantity: 1 }],
    metadata: { plan },
    success_url: `${APP_URL}/dashboard?billing=success`,
    cancel_url: `${APP_URL}/pricing?billing=cancel`
  });

  res.json({ url: session.url });
});

app.post('/jobs/run-checks', async (req, res) => {
  if (!CRON_SECRET || req.headers.authorization !== `Bearer ${CRON_SECRET}`) {
    return res.status(401).json({ status: 'error', message: 'Unauthorized' });
  }

  if (!supabaseAdmin) {
    return res.status(503).json({ status: 'error', message: 'Supabase server credentials are not configured' });
  }

  const { data: sites, error } = await supabaseAdmin
    .from('sites')
    .select('*')
    .eq('monitoring_enabled', true)
    .limit(100);

  if (error) {
    return res.status(500).json({ status: 'error', message: error.message });
  }

  const results = [];

  for (const site of sites || []) {
    try {
      const plan = await loadUserPlan(site.user_id);
      const features = planFeatures(plan);
      if (!features.scheduled_checks) {
        results.push({ site_id: site.id, status: 'skipped', reason: 'plan_does_not_include_scheduled_checks', plan });
        continue;
      }
      if (!shouldRunForPlan(site, plan)) {
        results.push({ site_id: site.id, status: 'skipped', reason: 'plan_cadence', plan });
        continue;
      }
      const { analysis, level, incident } = await runMonitorCheck(site, 'en', site.user_id);
      results.push({ site_id: site.id, status: level, score: analysis.score, plan, incident: Boolean(incident && incident.incident) });
    } catch (error) {
      results.push({ site_id: site.id, status: 'error', error: error.message });
    }
  }

  res.json({ status: 'success', checked: results.filter((result) => result.status !== 'skipped').length, results });
});

app.get('/pricing', (req, res) => {
  res.sendFile(path.join(__dirname, 'pricing.html'));
});

app.get('/api', (req, res) => {
  res.sendFile(path.join(__dirname, 'api.html'));
});

app.get('/demo', (req, res) => {
  res.sendFile(path.join(__dirname, 'demo.html'));
});

app.get('/signin', (req, res) => {
  res.sendFile(path.join(__dirname, 'signin.html'));
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard.html'));
});

app.get('/status/:slug', (req, res) => {
  res.sendFile(path.join(__dirname, 'status.html'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`SiteTrace running on port ${PORT}`);
});
