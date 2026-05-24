const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const tls = require('tls');
const path = require('path');
const http = require('http');
const https = require('https');
const dns = require('dns').promises;
const net = require('net');
const crypto = require('crypto');
const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;
const API_TIMEOUT_MS = Number(process.env.API_TIMEOUT_MS || 12000);
const RATE_LIMIT = Number(process.env.RATE_LIMIT || 20);
const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 60 * 60 * 1000);
const API_KEY_READ_LIMIT = Number(process.env.API_KEY_READ_LIMIT || 600);
const API_KEY_ANALYZE_LIMIT = Number(process.env.API_KEY_ANALYZE_LIMIT || 60);
const API_KEY_RATE_LIMIT_WINDOW_MS = Number(process.env.API_KEY_RATE_LIMIT_WINDOW_MS || 60 * 60 * 1000);
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
const HEALTH_SECRET = process.env.HEALTH_SECRET || '';
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const RESEND_READ_API_KEY = process.env.RESEND_READ_API_KEY || RESEND_API_KEY;
const ALERT_FROM_EMAIL = process.env.ALERT_FROM_EMAIL || 'SiteTrace <alerts@sitetrace.it.com>';
const ALERT_REPLY_TO_EMAIL = process.env.ALERT_REPLY_TO_EMAIL || 'support@sitetrace.it.com';
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL || '';
const TEAMS_WEBHOOK_URL = process.env.TEAMS_WEBHOOK_URL || '';
const PLAN_LIMITS = {
  free: { sites: 1, interval_minutes: 20, history_days: 7 },
  starter: { sites: 5, interval_minutes: 5, history_days: 30 },
  agency: { sites: 50, interval_minutes: 1, history_days: 90 }
};
const PLAN_FEATURES = {
  free: {
    instant_audit: true,
    monitored_sites: true,   // 1 site max, enforced by PLAN_LIMITS
    scheduled_checks: true,  // 20-min interval, enforced by PLAN_LIMITS
    in_app_alerts: false,
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
    in_app_alerts: true,
    email_alerts: false, // kept for future re-enable; currently disabled platform-wide
    status_pages: true,
    client_reports: true,
    webhooks: false,
    api_access: false
  },
  agency: {
    instant_audit: true,
    monitored_sites: true,
    scheduled_checks: true,
    in_app_alerts: true,
    email_alerts: false, // kept for future re-enable; currently disabled platform-wide
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
const apiKeyRequestCounts = new Map();
const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null;
const supabaseAdmin = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  : null;

function getSupabaseAdmin() {
  return app.locals.supabaseAdmin || supabaseAdmin;
}

function logEvent(event, fields = {}) {
  console.info(JSON.stringify({
    event,
    service: 'sitetrace-api',
    timestamp: new Date().toISOString(),
    ...fields
  }));
}

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

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');

  if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  }

  next();
});

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

    if (event.type === 'customer.subscription.updated') {
      const subscription = event.data.object;
      const customerId = subscription.customer;
      const priceId = subscription.items && subscription.items.data[0] && subscription.items.data[0].price
        ? subscription.items.data[0].price.id : null;
      const plan = priceId === STRIPE_AGENCY_PRICE_ID ? 'agency' : 'starter';
      const subStatus = subscription.status === 'active' ? 'active' : subscription.status;

      await supabaseAdmin
        .from('profiles')
        .update({ plan, subscription_status: subStatus, updated_at: new Date().toISOString() })
        .eq('stripe_customer_id', customerId);
    }

    if (event.type === 'invoice.payment_failed') {
      const invoice = event.data.object;
      const customerId = invoice.customer;

      await supabaseAdmin
        .from('profiles')
        .update({ subscription_status: 'past_due', updated_at: new Date().toISOString() })
        .eq('stripe_customer_id', customerId);
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
      dnsChanged: ['DNS records changed', 'One or more DNS records (A, MX, or NS) changed since the last check.', 'Verify this change was intentional. Unexpected DNS changes can indicate a misconfiguration or hijack.'],
      dnsStable: ['DNS records are stable', 'No DNS record changes detected since the last check.', 'Keep monitoring for unexpected changes.'],
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
      dnsChanged: ['Los registros DNS cambiaron', 'Uno o mas registros DNS (A, MX o NS) cambiaron desde el ultimo check.', 'Verifica que el cambio fue intencional. Cambios inesperados pueden indicar mala configuracion o secuestro.'],
      dnsStable: ['Los registros DNS estan estables', 'No se detectaron cambios en los registros DNS desde el ultimo check.', 'Sigue monitoreando para detectar cambios inesperados.'],
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

function isPrivateIp(address) {
  const ipVersion = net.isIP(address);

  if (ipVersion === 4) {
    const parts = address.split('.').map((part) => Number(part));
    const [first, second] = parts;
    return (
      first === 0 ||
      first === 10 ||
      first === 127 ||
      first === 169 && second === 254 ||
      first === 172 && second >= 16 && second <= 31 ||
      first === 192 && second === 168 ||
      first >= 224
    );
  }

  if (ipVersion === 6) {
    const normalized = address.toLowerCase();
    return (
      normalized === '::1' ||
      normalized === '::' ||
      normalized.startsWith('fc') ||
      normalized.startsWith('fd') ||
      normalized.startsWith('fe8') ||
      normalized.startsWith('fe9') ||
      normalized.startsWith('fea') ||
      normalized.startsWith('feb')
    );
  }

  return false;
}

function normalizeHostname(hostname) {
  return String(hostname || '').replace(/\.+$/g, '').toLowerCase();
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

  const hostname = normalizeHostname(parsed.hostname);
  const blockedHosts = ['localhost', '0.0.0.0', '127.0.0.1', '::1'];

  if (blockedHosts.includes(hostname) || isPrivateIp(hostname)) {
    throw new Error('Private or local network URLs are not supported');
  }

  return parsed;
}

async function assertPublicHostname(hostname) {
  const normalized = normalizeHostname(hostname);

  if (!normalized || normalized === 'localhost' || isPrivateIp(normalized)) {
    throw new Error('Private or local network URLs are not supported');
  }

  const records = await dns.lookup(normalized, { all: true, verbatim: true });
  if (!records.length || records.some((record) => isPrivateIp(record.address))) {
    throw new Error('Private or local network URLs are not supported');
  }

  return records;
}

async function validatePublicUrl(rawUrl) {
  const urlObj = normalizeUrl(rawUrl);
  await assertPublicHostname(urlObj.hostname);
  return urlObj;
}

async function requestPublicUrl(urlObj, axiosOptions, maxRedirects = 5) {
  let currentUrl = urlObj;

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    const records = await assertPublicHostname(currentUrl.hostname);
    const targetAddress = records.find((record) => record.family === 4) || records[0];
    const lookup = (hostname, options, callback) => {
      if (typeof options === 'function') {
        callback = options;
        options = {};
      }

      if (options && options.all) {
        callback(null, [{ address: targetAddress.address, family: targetAddress.family }]);
        return;
      }

      callback(null, targetAddress.address, targetAddress.family);
    };
    const response = await axios.request({
      ...axiosOptions,
      url: currentUrl.toString(),
      httpAgent: new http.Agent({ lookup }),
      httpsAgent: new https.Agent({ lookup }),
      maxRedirects: 0,
      proxy: false,
      validateStatus: () => true
    });

    if (![301, 302, 303, 307, 308].includes(response.status)) {
      return { response, finalUrl: currentUrl.toString() };
    }

    const location = response.headers && response.headers.location;
    if (!location) {
      return { response, finalUrl: currentUrl.toString() };
    }

    currentUrl = normalizeUrl(new URL(location, currentUrl).toString());
  }

  throw new Error('Too many redirects');
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

function checkBucketLimit(store, key, limit, windowMs) {
  const now = Date.now();
  const current = store.get(key);

  if (!current || now > current.resetAt) {
    const resetAt = now + windowMs;
    store.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: limit - 1, resetAt };
  }

  current.count += 1;
  store.set(key, current);

  return {
    allowed: current.count <= limit,
    remaining: Math.max(0, limit - current.count),
    resetAt: current.resetAt
  };
}

function apiKeyRateLimit(limit, bucketName) {
  return (req, res, next) => {
    const keyId = req.apiKey && req.apiKey.id ? req.apiKey.id : 'unknown';
    const bucket = `${bucketName}:${keyId}`;
    const result = checkBucketLimit(apiKeyRequestCounts, bucket, limit, API_KEY_RATE_LIMIT_WINDOW_MS);

    res.setHeader('X-RateLimit-Limit', String(limit));
    res.setHeader('X-RateLimit-Remaining', String(result.remaining));
    res.setHeader('X-RateLimit-Reset', new Date(result.resetAt).toISOString());

    if (!result.allowed) {
      logEvent('api_key_rate_limited', {
        api_key_id: keyId,
        bucket: bucketName,
        limit,
        reset_at: new Date(result.resetAt).toISOString()
      });
      return res.status(429).json({
        status: 'error',
        code: 'rate_limited',
        message: 'API rate limit reached. Try again after the reset time.',
        reset_at: new Date(result.resetAt).toISOString()
      });
    }

    next();
  };
}

async function countApiKeyUsage(db, userId, apiKeyId, since, options = {}) {
  let query = db
    .from('api_key_usage')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('api_key_id', apiKeyId)
    .gte('created_at', since);

  if (options.rateLimited) {
    query = query.eq('rate_limited', true);
  }

  const { count, error } = await query;
  if (error) throw error;
  return count || 0;
}

async function loadApiKeyUsageSummary(db, userId, apiKeyId) {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  try {
    const [today, month, rateLimitedMonth] = await Promise.all([
      countApiKeyUsage(db, userId, apiKeyId, todayStart.toISOString()),
      countApiKeyUsage(db, userId, apiKeyId, monthStart.toISOString()),
      countApiKeyUsage(db, userId, apiKeyId, monthStart.toISOString(), { rateLimited: true })
    ]);

    return { today, month, rate_limited_month: rateLimitedMonth };
  } catch (error) {
    logEvent('api_key_usage_summary_failed', {
      user_id: userId,
      api_key_id: apiKeyId,
      message: error.message
    });
    return { today: 0, month: 0, rate_limited_month: 0 };
  }
}

async function recordApiKeyUsage(req, statusCode, responseTimeMs) {
  if (!req.apiKey || !req.apiUser || !req.db) return;

  const routePath = req.route && req.route.path ? req.route.path : req.path;
  const endpoint = `${req.baseUrl || ''}${routePath}`;
  const { error } = await req.db
    .from('api_key_usage')
    .insert({
      api_key_id: req.apiKey.id,
      user_id: req.apiUser.id,
      endpoint,
      method: req.method,
      status_code: statusCode,
      response_time_ms: responseTimeMs,
      rate_limited: statusCode === 429
    });

  if (error) throw error;
}

function trackApiKeyUsage(req, res, next) {
  const startedAt = Date.now();

  res.on('finish', () => {
    recordApiKeyUsage(req, res.statusCode, Date.now() - startedAt).catch((error) => {
      logEvent('api_key_usage_record_failed', {
        api_key_id: req.apiKey && req.apiKey.id,
        message: error.message
      });
    });
  });

  next();
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
  const db = getSupabaseAdmin();
  if (!db || !userId) return 'free';
  const { data } = await db
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

async function getDnsSnapshot(hostname) {
  try {
    const [aRec, mxRec, nsRec] = await Promise.allSettled([
      dns.resolve4(hostname),
      dns.resolveMx(hostname),
      dns.resolveNs(hostname)
    ]);
    return {
      a:  aRec.status  === 'fulfilled' ? [...aRec.value].sort()                           : [],
      mx: mxRec.status === 'fulfilled' ? mxRec.value.map(r => r.exchange).sort()          : [],
      ns: nsRec.status === 'fulfilled' ? [...nsRec.value].sort()                           : []
    };
  } catch (_) {
    return null;
  }
}

function dnsSnapshotChanged(prev, curr) {
  if (!prev || !curr) return false;
  const join = obj => [obj.a, obj.mx, obj.ns].map(arr => (arr || []).join(',')).join('|');
  return join(prev) !== join(curr);
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

function generateRecommendations(checks) {
  const severityMap = { fail: 'critical', warning: 'high' };
  const categoryMap = {
    uptime: 'technical',
    seo: 'metadata',
    content: 'content',
    security: 'technical',
    domain: 'technical'
  };
  const whyItMatters = {
    title: 'The page title is the most visible SEO signal in search results. A missing or poorly written title directly reduces click-through rates and rankings.',
    meta_description: 'The meta description is the preview snippet shown under your link in search results. Without it, Google picks random text — usually hurting clicks.',
    h1: 'The H1 is the main heading search engines use to understand what a page covers. Missing or multiple H1s confuse crawlers and weaken topical relevance.',
    image_alt: 'Alt text helps search engines understand images and is required for screen readers. Missing alt text hurts both image SEO and accessibility compliance.',
    canonical: 'Without a canonical tag, duplicate URL variations (http vs https, trailing slash, etc.) can compete against each other in search, splitting authority.',
    viewport: 'Without a viewport meta tag, mobile browsers render the page at desktop width, creating a broken mobile experience and hurting Core Web Vitals.',
    lang: 'The lang attribute tells browsers and screen readers what language to use. Missing it degrades accessibility and localization accuracy.',
    open_graph: 'Open Graph tags control how your page looks when shared on LinkedIn, Facebook, Slack, and iMessage. Missing tags produce plain, unbranded previews.',
    robots_indexing: 'A noindex directive tells every search engine to exclude this page from results. If unintentional, it silently kills organic traffic to this URL.',
    structured_data: 'Structured data helps Google understand your content and can unlock rich results like star ratings, FAQ dropdowns, and event listings in search.',
    word_count: 'Thin pages with little text signal low value to search engines and are often filtered out of competitive queries in favor of more thorough content.',
    links: 'Internal links help search engines discover content and distribute authority across the site. A page with few links may be treated as an orphan.',
    page_size: 'Heavy HTML responses slow down initial load time and can negatively impact Core Web Vitals scores, which are a confirmed Google ranking factor.',
    favicon: 'A favicon increases brand recognition in browser tabs, bookmarks, and mobile home screens. Missing it makes the site look unfinished.',
    status_code: 'Non-200 HTTP status codes indicate errors, broken redirects, or unreachable pages that hurt crawlability, indexing, and user experience.',
    response_time: 'Slow server response directly increases bounce rates and is a known Google ranking signal. Under 1 second is ideal; over 3 seconds is a problem.',
    https: 'HTTPS is required for user trust and browser security indicators. It is also a confirmed Google ranking signal and required for many browser APIs.',
    ssl: 'An expired or misconfigured SSL certificate triggers full-page browser warnings that block visitors and immediately destroy trust and conversions.',
    hsts: 'Without HSTS, users who navigate via HTTP can be intercepted before being redirected to HTTPS. HSTS closes this window for man-in-the-middle attacks.',
    csp: 'A Content Security Policy is the primary defense against cross-site scripting (XSS) attacks, which can silently redirect users or steal form data.',
    frame: 'Without frame protection, attackers can embed your page inside a hidden iframe and trick users into clicking buttons they cannot see (clickjacking).',
    domain_expiry: 'An expired domain takes the site completely offline and can be registered by a third party — permanently losing your brand name, rankings, and email.'
  };
  const copyPasteFixes = {
    title: '<title>Your Page Title – Brand Name</title>',
    meta_description: '<meta name="description" content="A clear 70–160 character description of what this page offers.">',
    canonical: '<link rel="canonical" href="https://yourdomain.com/this-page/">',
    viewport: '<meta name="viewport" content="width=device-width, initial-scale=1">',
    lang: '<html lang="en">',
    hsts: 'Strict-Transport-Security: max-age=31536000; includeSubDomains',
    csp: "Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'",
    frame: 'X-Frame-Options: SAMEORIGIN',
    structured_data: '{"@context":"https://schema.org","@type":"Organization","name":"Your Company","url":"https://yourdomain.com"}'
  };

  const severityOrder = { critical: 1, high: 2, medium: 3, low: 4 };
  let priorityCounter = 1;

  return checks
    .filter((check) => check.level !== 'pass')
    .sort((a, b) => {
      const aS = severityOrder[severityMap[a.level] || 'medium'] || 3;
      const bS = severityOrder[severityMap[b.level] || 'medium'] || 3;
      return aS - bS;
    })
    .map((check) => ({
      issueTitle: check.title,
      severity: severityMap[check.level] || 'medium',
      category: categoryMap[check.category] || 'technical',
      plainEnglishExplanation: check.description,
      whyItMatters: whyItMatters[check.id] || `This issue may negatively affect the site's ${check.category} performance.`,
      recommendedFix: check.recommendation,
      copyPasteFix: copyPasteFixes[check.id] || null,
      priorityOrder: priorityCounter++,
      checkId: check.id,
      value: check.value
    }));
}

function cleanWords(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 3 && !['with', 'from', 'that', 'this', 'your', 'about', 'have', 'what', 'when', 'where', 'their', 'will', 'site', 'page', 'home'].includes(word));
}

function titleCaseWords(value) {
  return String(value || '')
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function inferPrimaryTopic({ title, metaDescription, h1Text, hostname }) {
  const source = [h1Text, title, metaDescription, hostname].filter(Boolean).join(' ');
  const words = cleanWords(source);
  const counts = new Map();
  words.forEach((word) => counts.set(word, (counts.get(word) || 0) + 1));
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([word]) => word);
  return ranked.slice(0, 3).join(' ') || hostname.replace(/^www\./, '').split('.')[0] || 'website';
}

function buildAuditInsights({ urlObj, title, metaDescription, h1Text, wordCount, internalLinks, checks, recommendations, pageContext }) {
  const hostname = urlObj.hostname.replace(/^www\./, '');
  const primaryTopic = inferPrimaryTopic({ title, metaDescription, h1Text, hostname });
  const readableTopic = titleCaseWords(primaryTopic);
  const failures = checks.filter((check) => check.level === 'fail').length;
  const warnings = checks.filter((check) => check.level === 'warning' || check.level === 'warn').length;
  const topPriorities = recommendations.slice(0, 3).map((rec) => ({
    priority: rec.severity,
    area: rec.category,
    issue: rec.issueTitle,
    action: rec.recommendedFix
  }));

  const contentOpportunities = [
    {
      priority: failures || wordCount < 250 ? 'High' : 'Medium',
      title: `${readableTopic}: What Visitors Should Know Before Choosing`,
      primary_keyword: primaryTopic,
      supporting_keywords: [`${primaryTopic} guide`, `${primaryTopic} benefits`, `${primaryTopic} questions`],
      intent: 'Informational'
    },
    {
      priority: internalLinks < 3 ? 'High' : 'Medium',
      title: `How to Choose the Right ${readableTopic} Option`,
      primary_keyword: `choose ${primaryTopic}`,
      supporting_keywords: [`best ${primaryTopic}`, `${primaryTopic} comparison`, `${primaryTopic} checklist`],
      intent: 'Commercial'
    },
    {
      priority: metaDescription && title ? 'Medium' : 'High',
      title: `${readableTopic} FAQs: Answers for New Visitors`,
      primary_keyword: `${primaryTopic} faq`,
      supporting_keywords: [`what is ${primaryTopic}`, `${primaryTopic} cost`, `${primaryTopic} process`],
      intent: 'BOFU'
    }
  ];

  const quickWins = recommendations
    .filter((rec) => ['title', 'meta_description', 'h1', 'canonical', 'structured_data', 'links'].includes(rec.checkId))
    .slice(0, 5)
    .map((rec) => rec.recommendedFix);

  return {
    executive_summary: failures
      ? `This page has ${failures} critical audit issue${failures === 1 ? '' : 's'} and ${warnings} warning${warnings === 1 ? '' : 's'}. Fix the technical blockers first, then improve the content and search snippet.`
      : `This page is reachable and has no critical audit failures. The next gains are likely content depth, internal linking, structured data, and search snippet polish.`,
    page_profile: {
      likely_topic: primaryTopic,
      page_type: pageContext,
      visible_word_count: wordCount,
      internal_links: internalLinks
    },
    top_priorities: topPriorities,
    quick_wins: quickWins,
    content_opportunities: contentOpportunities,
    optional_content_plan: {
      phase_1: 'Confirm the page profile, target audience, and keyword map.',
      phase_2: 'Pick the highest-priority content opportunities the client wants to use.',
      phase_3: 'For each approved topic, prepare SEO title, meta description, H1, H2/H3 outline, FAQ section, internal links, CTA, and source notes.'
    }
  };
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
  const recommendations = generateRecommendations(checks);

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
    recommendations,
    insights: {
      executive_summary: `The site could not be reached during this audit. Check hosting logs, recent deploys, DNS, firewall rules, or upstream provider incidents.`,
      page_profile: { likely_topic: site.name || site.url, page_type: 'unreachable', visible_word_count: 0, internal_links: 0 },
      top_priorities: recommendations.slice(0, 3).map((rec) => ({
        priority: rec.severity,
        area: rec.category,
        issue: rec.issueTitle,
        action: rec.recommendedFix
      })),
      quick_wins: ['Refresh the ping after the provider or hosting issue is resolved.', 'Run a full audit again once the page responds normally.'],
      content_opportunities: [],
      optional_content_plan: null
    },
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

async function sendOnboardingEmail(email) {
  if (!RESEND_API_KEY || !email) return;
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RESEND_API_KEY}` },
    body: JSON.stringify({
      from: ALERT_FROM_EMAIL,
      reply_to: ALERT_REPLY_TO_EMAIL,
      to: [email],
      subject: 'Welcome to SiteTrace — here\'s how to get started',
      html: `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#f8fafc;font-family:Inter,'Helvetica Neue',Arial,sans-serif;">
<div style="max-width:560px;margin:40px auto;background:#fff;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden;">
  <div style="background:#6366f1;padding:28px 32px;">
    <div style="display:inline-flex;align-items:center;gap:10px;">
      <span style="background:rgba(255,255,255,.2);border-radius:8px;padding:6px 10px;font-weight:800;font-size:1.1rem;color:#fff;letter-spacing:-.02em;">ST</span>
      <span style="color:#fff;font-weight:700;font-size:1.15rem;">SiteTrace</span>
    </div>
  </div>
  <div style="padding:32px 32px 24px;">
    <h1 style="margin:0 0 8px;font-size:1.4rem;font-weight:800;color:#1a1a2e;letter-spacing:-.02em;">Welcome aboard 👋</h1>
    <p style="margin:0 0 24px;color:#64748b;line-height:1.6;">Your SiteTrace account is ready. Here's how to get the most out of it in the next 5 minutes.</p>

    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:20px 22px;margin-bottom:20px;">
      <div style="font-size:.7rem;font-weight:800;color:#6366f1;text-transform:uppercase;letter-spacing:.1em;margin-bottom:12px;">Step 1 — Add your first site</div>
      <p style="margin:0 0 10px;color:#334155;font-size:.9rem;line-height:1.55;">Click <strong>Add new site</strong> in your dashboard sidebar and paste in any URL. SiteTrace will run an instant health check and start monitoring it automatically.</p>
    </div>

    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:20px 22px;margin-bottom:20px;">
      <div style="font-size:.7rem;font-weight:800;color:#6366f1;text-transform:uppercase;letter-spacing:.1em;margin-bottom:12px;">Step 2 — Understand your health score</div>
      <p style="margin:0 0 10px;color:#334155;font-size:.9rem;line-height:1.55;">Every scan produces a score from 0–100 covering uptime, SSL, SEO, performance, and security. Issues are ranked by severity so you know what to fix first.</p>
    </div>

    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:20px 22px;margin-bottom:28px;">
      <div style="font-size:.7rem;font-weight:800;color:#6366f1;text-transform:uppercase;letter-spacing:.1em;margin-bottom:12px;">Step 3 — Set up alerts</div>
      <p style="margin:0;color:#334155;font-size:.9rem;line-height:1.55;">Go to <strong>Monitor settings</strong> and make sure email alerts are on. You'll get notified the moment a site goes down — and again when it recovers.</p>
    </div>

    <a href="${APP_URL}/dashboard" style="display:inline-block;background:#6366f1;color:#fff;padding:13px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-size:.95rem;letter-spacing:-.01em;">Open your dashboard →</a>

    <p style="margin:24px 0 0;font-size:.82rem;color:#94a3b8;line-height:1.6;">Questions? Reply to this email — we read every one.<br>You're on the <strong>Free plan</strong>. <a href="${APP_URL}/pricing" style="color:#6366f1;text-decoration:none;">Upgrade anytime</a> for scheduled checks, alerts, and client reports.</p>
  </div>
  <div style="padding:16px 32px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;">
    <span style="font-size:.75rem;color:#94a3b8;">SiteTrace · sitetrace.it.com</span>
    <a href="${APP_URL}" style="font-size:.75rem;color:#6366f1;text-decoration:none;">Visit site</a>
  </div>
</div>
</body></html>`
    })
  });
  logEvent('onboarding_email_sent', { email });
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

async function createInAppAlert(userId, siteId, type, severity, title, message) {
  if (!supabaseAdmin || !userId) return null;
  const { data, error } = await supabaseAdmin
    .from('alerts')
    .insert({ user_id: userId, site_id: siteId || null, type, severity, title, message })
    .select('id')
    .single();
  if (error) {
    console.error('createInAppAlert error:', error.message);
    return null;
  }
  return data;
}

async function resolveOpenIncidents({ site, analysis, skipAlert = false }) {
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
      const durationMin = updated.duration_seconds ? Math.round(updated.duration_seconds / 60) : null;
      if (!skipAlert) {
        await createInAppAlert(
          site.user_id, site.id, 'resolved', 'info',
          `${site.name} is back online`,
          `The monitor recovered after ${durationMin != null ? `${durationMin} minute${durationMin !== 1 ? 's' : ''}` : 'a downtime window'}. Health score: ${analysis.score}/100.`
        );
        const notifications = await sendIncidentNotifications({ to: await loadProfileEmail(site.user_id), site, status: 'resolved', analysis, incident: updated });
        resolved.push({ incident: updated, notifications });
      } else {
        resolved.push({ incident: updated, notifications: { skipped: 'notify_on_recovery_disabled' } });
      }
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
    // notify_on_recovery preference (#32): default true (column: alert_on_recovery)
    if (site.alert_on_recovery === false) {
      return resolveOpenIncidents({ site, analysis, skipAlert: true });
    }
    return resolveOpenIncidents({ site, analysis });
  }

  if (!['down', 'warning'].includes(level)) {
    return null;
  }

  // alert_threshold preference (#32): how many consecutive failures before opening
  // an incident. Default 2 (existing behaviour).
  const threshold = Math.max(1, Number(site.alert_threshold || 2));

  const { data: recentChecks } = await supabaseAdmin
    .from('checks')
    .select('status, created_at')
    .eq('site_id', site.id)
    .order('created_at', { ascending: false })
    .limit(threshold);

  const confirmedCount = (recentChecks || []).filter(c => c.status === level).length;
  if (confirmedCount < threshold) {
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
  const features = planFeatures(plan);
  const topIssue = importantIssues(analysis, 1)[0];
  const alertSeverity = level === 'down' ? 'critical' : 'high';
  const alertMsg = [
    level === 'down' ? `${site.name} is down.` : `${site.name} has a warning.`,
    topIssue ? `Detected: ${topIssue.title}.` : '',
    `Health score: ${analysis.score}/100.`,
    analysis.response_time ? `Response time: ${analysis.response_time}.` : ''
  ].filter(Boolean).join(' ');
  await createInAppAlert(site.user_id, site.id, level, alertSeverity, incident.title, alertMsg);
  const notifications = await sendIncidentNotifications({ to: await loadProfileEmail(site.user_id), site, status: level, analysis, incident, features });
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

function hashApiKey(apiKey) {
  return crypto.createHash('sha256').update(String(apiKey || '')).digest('hex');
}

function generateApiKey() {
  return `st_${crypto.randomBytes(32).toString('base64url')}`;
}

async function requireAgencyUser(req, res, next) {
  const plan = await loadUserPlan(req.user.id);
  const features = planFeatures(plan);

  if (!features.api_access) {
    return res.status(402).json({
      status: 'error',
      code: 'agency_required',
      message: 'API access is available on the Agency plan.',
      plan,
      features
    });
  }

  req.plan = plan;
  req.features = features;
  next();
}

async function requireApiKey(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!token || !token.startsWith('st_')) {
    return res.status(401).json({ status: 'error', message: 'Missing API key' });
  }

  const db = getSupabaseAdmin();
  if (!db) {
    return res.status(503).json({ status: 'error', message: 'Supabase server credentials are not configured' });
  }

  const keyHash = hashApiKey(token);
  const { data: apiKey, error } = await db
    .from('api_keys')
    .select('id, user_id, name, revoked_at')
    .eq('key_hash', keyHash)
    .is('revoked_at', null)
    .maybeSingle();

  if (error || !apiKey) {
    return res.status(401).json({ status: 'error', message: 'Invalid API key' });
  }

  const plan = await loadUserPlan(apiKey.user_id);
  const features = planFeatures(plan);
  if (!features.api_access) {
    return res.status(402).json({ status: 'error', code: 'agency_required', message: 'API access is available on the Agency plan.' });
  }

  await db
    .from('api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', apiKey.id);

  req.apiKey = apiKey;
  req.apiUser = { id: apiKey.user_id };
  req.db = db;
  next();
}

async function analyzeWebsite(rawUrl, locale, options = {}) {
  const urlObj = await validatePublicUrl(rawUrl);
  const startedAt = Date.now();
  const sslPromise = getSslInfo(urlObj);
  const dnsSnapshotPromise = getDnsSnapshot(urlObj.hostname);
  const domainExpiryPromise = getDomainExpiryInfo(urlObj.hostname).catch((error) => ({
    domain: urlObj.hostname,
    expires_at: null,
    days_remaining: null,
    source: 'rdap',
    error: error.message
  }));

  const { response, finalUrl } = await requestPublicUrl(urlObj, {
    method: 'GET',
    timeout: API_TIMEOUT_MS,
    maxContentLength: MAX_BODY_BYTES,
    responseType: 'arraybuffer',
    headers: {
      'User-Agent': 'SiteTraceBot/1.0 (+https://www.sitetrace.it.com/)'
    }
  });

  const responseTime = Date.now() - startedAt;
  const html = responseText(response.data);
  const pageSizeBytes = Buffer.byteLength(html, 'utf8');
  const $ = cheerio.load(html);
  const headers = response.headers || {};
  const [ssl, domainExpiry, dnsSnapshot] = await Promise.all([sslPromise, domainExpiryPromise, dnsSnapshotPromise]);
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
  const h1Text = ($('h1').first().text() || '').trim().replace(/\s+/g, ' ');
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
  const recommendations = generateRecommendations(checks);
  const insights = buildAuditInsights({
    urlObj,
    title,
    metaDescription,
    h1Text,
    wordCount,
    internalLinks,
    checks,
    recommendations,
    pageContext
  });

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
    dns_snapshot: dnsSnapshot,
    checks,
    recommendations,
    insights
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

  // ── Retry-before-down (#33) ─────────────────────────────────────────────
  // If the first attempt returns down, wait 15 s and try once more before
  // recording. This eliminates most false positives from transient blips.
  let level = monitoringStatus(analysis);
  if (level === 'down') {
    await new Promise(resolve => setTimeout(resolve, 15000));
    try {
      const retry = await analyzeWebsite(site.url, locale, {
        keyword: site.keyword,
        keyword_should_exist: site.keyword_should_exist
      });
      level = monitoringStatus(retry);
      if (level !== 'down') analysis = retry; // site recovered — use the good result
    } catch (_) { /* keep original down result */ }
  }

  // ── DNS change detection (#30) ──────────────────────────────────────────
  // Fetch the previous check's dns_snapshot and inject a dns_changed check
  // into analysis.checks if records differ.
  if (analysis.dns_snapshot) {
    try {
      const { data: prevCheck } = await supabaseAdmin
        .from('checks')
        .select('result')
        .eq('site_id', site.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      const prevSnap = prevCheck && prevCheck.result && prevCheck.result.dns_snapshot;
      if (prevSnap) {
        const changed = dnsSnapshotChanged(prevSnap, analysis.dns_snapshot);
        if (changed) {
          analysis.checks.push({
            category: 'domain', id: 'dns_changed', level: 'warn', weight: 15,
            value: 'Changed',
            title: checkText(locale, 'dnsChanged')[0],
            description: checkText(locale, 'dnsChanged')[1],
            recommendation: checkText(locale, 'dnsChanged')[2]
          });
          analysis.dns_changed = true;
        }
      }
    } catch (_) { /* non-fatal */ }
  }

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

app.get('/health-dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'health.html'));
});

function requireHealthSecret(req, res, next) {
  if (!HEALTH_SECRET) return next();
  if (req.headers.authorization !== `Bearer ${HEALTH_SECRET}`) {
    return res.status(401).json({ status: 'error', message: 'Unauthorized' });
  }
  next();
}

app.get('/health/deep', requireHealthSecret, async (req, res) => {
  const db = getSupabaseAdmin();
  const checks = {
    app_url_configured: Boolean(APP_URL),
    supabase_configured: Boolean(SUPABASE_URL && SUPABASE_ANON_KEY && SUPABASE_SERVICE_ROLE_KEY),
    supabase_reachable: false,
    stripe_configured: Boolean(stripe && STRIPE_WEBHOOK_SECRET && STRIPE_STARTER_PRICE_ID && STRIPE_AGENCY_PRICE_ID),
    cron_configured: Boolean(CRON_SECRET),
    api_key_limits_configured: API_KEY_READ_LIMIT > 0 && API_KEY_ANALYZE_LIMIT > 0 && API_KEY_RATE_LIMIT_WINDOW_MS > 0,
    slack_alerts_configured: Boolean(SLACK_WEBHOOK_URL),
    teams_alerts_configured: Boolean(TEAMS_WEBHOOK_URL),
    resend_configured: Boolean(RESEND_API_KEY)
  };
  const errors = [];

  if (db) {
    try {
      const { error } = await db
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .limit(1);
      checks.supabase_reachable = !error;
      if (error) errors.push({ service: 'supabase', message: error.message });
    } catch (error) {
      checks.supabase_reachable = false;
      errors.push({ service: 'supabase', message: error.message });
    }
  }

  const criticalOk = checks.app_url_configured && checks.supabase_configured && checks.supabase_reachable && checks.api_key_limits_configured;
  const warnings = [];
  if (!checks.stripe_configured) warnings.push('billing_not_fully_configured');
  if (!checks.cron_configured) warnings.push('scheduled_checks_not_configured');
  if (!checks.resend_configured && !checks.slack_alerts_configured && !checks.teams_alerts_configured) warnings.push('external_alerts_not_configured');

  res.status(criticalOk ? 200 : 503).json({
    status: criticalOk ? 'ok' : 'degraded',
    service: 'sitetrace-api',
    timestamp: new Date().toISOString(),
    checks,
    warnings,
    errors
  });
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
    in_app_alerts_enabled: Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY),
    // Email alerts are disabled pending DNS resolution; kept for future re-enable
    alerts_enabled: false,
    email_alerts_enabled: false,
    alert_from_email: ALERT_FROM_EMAIL,
    delivery_lookup_configured: false,
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

  // Send onboarding email on first login (non-blocking)
  if (profile && !profile.onboarding_email_sent && RESEND_API_KEY) {
    sendOnboardingEmail(req.user.email).then(() => {
      supabaseAdmin.from('profiles')
        .update({ onboarding_email_sent: true, updated_at: new Date().toISOString() })
        .eq('id', req.user.id)
        .then(() => {});
    }).catch(() => {});
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

app.get('/api/sites', requireUser, async (req, res) => {
  const { data: sites, error } = await supabaseAdmin
    .from('sites')
    .select('*')
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false });

  if (error) {
    return res.status(500).json({ status: 'error', message: error.message });
  }

  res.json({ status: 'success', sites: sites || [] });
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
    normalized = (await validatePublicUrl(url)).toString();
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
      check_interval_minutes: limits.interval_minutes,
      public_slug: Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6)
    })
    .select('*')
    .single();

  if (error) {
    return res.status(400).json({ status: 'error', message: error.message });
  }

  res.status(201).json({ status: 'success', site: data, plan, limits, features, usage: { sites: (count || 0) + 1 } });
});

app.get('/api/sites/:id/checks', requireUser, async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 100);
  const { data: site, error: siteError } = await supabaseAdmin
    .from('sites')
    .select('id')
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .maybeSingle();

  if (siteError || !site) {
    return res.status(404).json({ status: 'error', message: 'Site not found' });
  }

  const { data: checks, error } = await supabaseAdmin
    .from('checks')
    .select('*')
    .eq('site_id', req.params.id)
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    return res.status(500).json({ status: 'error', message: error.message });
  }

  res.json({ status: 'success', checks: checks || [] });
});

app.post('/api/test-alert-email', requireUser, async (req, res) => {
  // Email alerts are currently disabled platform-wide (deliverability configuration pending).
  // In-app alerts are active. Email alerts will be re-enabled once domain DNS is resolved.
  res.json({
    status: 'coming_soon',
    message: 'Email alerts are coming soon. Your in-app Alert Center is active — all incidents and recoveries appear there immediately.',
    in_app_alerts_active: true
  });
});

app.get('/api/alerts', requireUser, async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 100);
  const { data: alerts, error } = await supabaseAdmin
    .from('alerts')
    .select('*')
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    return res.status(500).json({ status: 'error', message: error.message });
  }

  const unread = (alerts || []).filter((alert) => !alert.read).length;
  res.json({ status: 'success', alerts: alerts || [], unread });
});

app.patch('/api/alerts/read-all', requireUser, async (req, res) => {
  const { error } = await supabaseAdmin
    .from('alerts')
    .update({ read: true })
    .eq('user_id', req.user.id)
    .eq('read', false);

  if (error) {
    return res.status(500).json({ status: 'error', message: error.message });
  }

  res.json({ status: 'success' });
});

app.get('/api/ping', requireUser, async (req, res) => {
  let urlObj;
  try {
    urlObj = await validatePublicUrl(req.query.url || '');
  } catch (error) {
    return res.status(400).json({ error: 'Invalid url' });
  }
  const start = Date.now();
  try {
    const { response } = await requestPublicUrl(urlObj, {
      method: 'HEAD',
      timeout: 6000,
      headers: {
        'User-Agent': 'SiteTraceBot/1.0 (+https://www.sitetrace.it.com/)'
      }
    });
    const ms = Date.now() - start;
    return res.json({ ms, httpStatus: response.status, status: response.status >= 200 && response.status < 400 ? 'ok' : 'warn', ts: new Date().toISOString() });
  } catch (err) {
    const ms = Date.now() - start;
    const timedOut = err.code === 'ECONNABORTED' || ms >= 5900;
    return res.json({ ms: timedOut ? null : ms, httpStatus: null, status: timedOut ? 'timeout' : 'error', ts: new Date().toISOString() });
  }
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

  if (Object.prototype.hasOwnProperty.call(updates, 'url') && updates.url) {
    try {
      updates.url = (await validatePublicUrl(updates.url)).toString();
    } catch (error) {
      return res.status(400).json({ status: 'error', message: error.message });
    }
  }

  if (updates.status_page_enabled && !features.status_pages) {
    return res.status(402).json({ status: 'error', code: 'paid_status_required', message: 'Public status pages are available on Starter and Agency plans.', plan, features });
  }

  if ((updates.email_alerts_enabled || updates.alert_on_down || updates.alert_on_warning || updates.alert_on_recovery) && !features.in_app_alerts) {
    return res.status(402).json({ status: 'error', code: 'paid_alerts_required', message: 'In-app alerts are available on Starter and Agency plans.', plan, features });
  }

  updates.updated_at = new Date().toISOString();

  // Auto-generate public_slug if enabling status page and slug doesn't exist yet
  if (updates.status_page_enabled) {
    const { data: existing } = await supabaseAdmin
      .from('sites').select('public_slug').eq('id', req.params.id).single();
    if (!existing?.public_slug) {
      updates.public_slug = Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
    }
  }

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

app.delete('/api/sites/:id', requireUser, async (req, res) => {
  const { error } = await supabaseAdmin
    .from('sites')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.user.id);

  if (error) {
    return res.status(400).json({ status: 'error', message: error.message });
  }

  res.json({ status: 'success' });
});

app.get('/api/api-keys', requireUser, requireAgencyUser, async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('api_keys')
    .select('id, name, key_prefix, created_at, last_used_at, revoked_at')
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false });

  if (error) {
    return res.status(500).json({ status: 'error', message: error.message });
  }

  const keys = await Promise.all((data || []).map(async (key) => ({
    ...key,
    usage: await loadApiKeyUsageSummary(supabaseAdmin, req.user.id, key.id)
  })));

  res.json({ status: 'success', api_keys: keys });
});

app.post('/api/api-keys', requireUser, requireAgencyUser, async (req, res) => {
  const activeCount = await supabaseAdmin
    .from('api_keys')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', req.user.id)
    .is('revoked_at', null);

  if ((activeCount.count || 0) >= 10) {
    return res.status(400).json({ status: 'error', message: 'You can have up to 10 active API keys.' });
  }

  const name = String(req.body.name || 'API key').trim().slice(0, 80) || 'API key';
  const apiKey = generateApiKey();
  const { data, error } = await supabaseAdmin
    .from('api_keys')
    .insert({
      user_id: req.user.id,
      name,
      key_hash: hashApiKey(apiKey),
      key_prefix: apiKey.slice(0, 12)
    })
    .select('id, name, key_prefix, created_at, last_used_at, revoked_at')
    .single();

  if (error) {
    return res.status(400).json({ status: 'error', message: error.message });
  }

  logEvent('api_key_created', { user_id: req.user.id, api_key_id: data.id, key_prefix: data.key_prefix });
  res.status(201).json({ status: 'success', api_key: apiKey, key: data });
});

app.delete('/api/api-keys/:id', requireUser, requireAgencyUser, async (req, res) => {
  const { error } = await supabaseAdmin
    .from('api_keys')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .is('revoked_at', null);

  if (error) {
    return res.status(400).json({ status: 'error', message: error.message });
  }

  logEvent('api_key_revoked', { user_id: req.user.id, api_key_id: req.params.id });
  res.json({ status: 'success' });
});

app.get('/api/v1/monitors', requireApiKey, trackApiKeyUsage, apiKeyRateLimit(API_KEY_READ_LIMIT, 'read'), async (req, res) => {
  const db = req.db || getSupabaseAdmin();
  const { data, error } = await db
    .from('sites')
    .select('id, name, url, monitoring_enabled, last_status, last_score, last_response_time_ms, last_checked_at, created_at, updated_at')
    .eq('user_id', req.apiUser.id)
    .order('created_at', { ascending: false });

  if (error) {
    return res.status(500).json({ status: 'error', message: error.message });
  }

  res.json({ status: 'success', monitors: data || [] });
});

app.get('/api/v1/monitors/:id/checks', requireApiKey, trackApiKeyUsage, apiKeyRateLimit(API_KEY_READ_LIMIT, 'read'), async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 100);
  const db = req.db || getSupabaseAdmin();
  const { data, error } = await db
    .from('checks')
    .select('id, site_id, status, score, status_code, response_time_ms, result, created_at')
    .eq('user_id', req.apiUser.id)
    .eq('site_id', req.params.id)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    return res.status(500).json({ status: 'error', message: error.message });
  }

  res.json({ status: 'success', checks: data || [] });
});

app.get('/api/v1/incidents', requireApiKey, trackApiKeyUsage, apiKeyRateLimit(API_KEY_READ_LIMIT, 'read'), async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 100);
  const db = req.db || getSupabaseAdmin();
  const { data, error } = await db
    .from('incidents')
    .select('id, site_id, status, title, details, resolved_at, duration_seconds, created_at')
    .eq('user_id', req.apiUser.id)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    return res.status(500).json({ status: 'error', message: error.message });
  }

  res.json({ status: 'success', incidents: data || [] });
});

app.post('/api/v1/analyze', requireApiKey, trackApiKeyUsage, apiKeyRateLimit(API_KEY_ANALYZE_LIMIT, 'analyze'), async (req, res) => {
  const locale = language(req.body.locale);
  try {
    res.json(await analyzeWebsite(req.body.url, locale));
  } catch (error) {
    const statusCode = error.message.includes('URL') || error.message.includes('protocol') || error.message.includes('Private') ? 400 : 502;
    res.status(statusCode).json({
      status: 'error',
      code: statusCode === 400 ? 'invalid_url' : 'fetch_failed',
      message: statusCode === 400 ? messages[locale].invalid : messages[locale].fetch,
      detail: error.message
    });
  }
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

app.post('/billing/portal', requireUser, async (req, res) => {
  if (!stripe) {
    return res.status(503).json({ status: 'error', message: 'Stripe is not configured' });
  }

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', req.user.id)
    .single();

  if (!profile || !profile.stripe_customer_id) {
    return res.status(400).json({ status: 'error', message: 'No billing account found. Please upgrade first.' });
  }

  try {
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${APP_URL}/dashboard`
    });
    res.json({ url: portalSession.url });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// ── Scheduled checks core ─────────────────────────────────────────────────────
// Shared by the HTTP endpoint and the internal scheduler.
// Processes all monitoring-enabled sites with:
//   - Per-user plan caching (one DB hit per user, not per site)
//   - Concurrent processing in batches of SCHED_CONCURRENCY
//   - shouldRunForPlan cadence gate (skips sites not yet due)
const SCHED_CONCURRENCY = 10;
let _schedulerRunning = false;

async function runScheduledChecks() {
  if (!supabaseAdmin) return { status: 'error', message: 'Supabase not configured' };
  // Prevent overlapping runs if a previous tick is still in flight
  if (_schedulerRunning) return { status: 'skipped', reason: 'previous_run_in_progress' };
  _schedulerRunning = true;
  try {
    const { data: sites, error } = await supabaseAdmin
      .from('sites')
      .select('*')
      .eq('monitoring_enabled', true)
      .limit(500);

    if (error) return { status: 'error', message: error.message };

    const now = new Date();
    const planCache = {};
    const results = [];
    const sitesToCheck = [];

    // Phase 1: filter — resolve plans (cached per user) and apply cadence gate
    for (const site of sites || []) {
      if (!planCache[site.user_id]) {
        planCache[site.user_id] = await loadUserPlan(site.user_id);
      }
      const plan = planCache[site.user_id];
      const features = planFeatures(plan);
      if (!features.scheduled_checks) {
        results.push({ site_id: site.id, status: 'skipped', reason: 'plan', plan });
        continue;
      }
      if (!shouldRunForPlan(site, plan, now)) {
        results.push({ site_id: site.id, status: 'skipped', reason: 'cadence', plan });
        continue;
      }
      sitesToCheck.push({ site, plan });
    }

    // Phase 2: run checks in concurrent batches
    for (let i = 0; i < sitesToCheck.length; i += SCHED_CONCURRENCY) {
      const batch = sitesToCheck.slice(i, i + SCHED_CONCURRENCY);
      const settled = await Promise.allSettled(
        batch.map(({ site, plan }) =>
          runMonitorCheck(site, 'en', site.user_id)
            .then(({ analysis, level, incident }) => ({
              site_id: site.id, status: level,
              score: analysis.score, plan,
              incident: Boolean(incident && incident.incident)
            }))
            .catch(err => ({ site_id: site.id, status: 'error', error: err.message }))
        )
      );
      settled.forEach(r => results.push(r.status === 'fulfilled' ? r.value : { site_id: null, status: 'error', error: String(r.reason) }));
    }

    const checked = results.filter(r => r.status !== 'skipped').length;
    logEvent('cron_checks_completed', { checked, total: results.length, queued: sitesToCheck.length });

    // ── Domain expiry alerts (#31) ────────────────────────────────────────
    // Run once per scheduler tick. Send email if domain expires in 30, 14,
    // or 7 days and an alert at that threshold hasn't been sent yet today.
    if (RESEND_API_KEY && supabaseAdmin) {
      try { await sendDomainExpiryAlerts(sites || []); } catch (_) { /* non-fatal */ }
    }

    return { status: 'success', checked, total: results.length, results };
  } finally {
    _schedulerRunning = false;
  }
}

// ── Domain expiry alert mailer (#31) ─────────────────────────────────────────
const EXPIRY_THRESHOLDS = [30, 14, 7];
async function sendDomainExpiryAlerts(sites) {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  for (const site of sites) {
    try {
      const { data: lastCheck } = await supabaseAdmin
        .from('checks')
        .select('result, created_at')
        .eq('site_id', site.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      if (!lastCheck) continue;
      const expiry = lastCheck.result && lastCheck.result.domain_expiry;
      if (!expiry || expiry.days_remaining === null) continue;
      const days = Number(expiry.days_remaining);
      const threshold = EXPIRY_THRESHOLDS.find(t => days <= t);
      if (!threshold) continue;

      // Throttle: store last alert key in site metadata
      const alertKey = `domain_expiry_alert_${threshold}`;
      const lastAlerted = site[alertKey] || null;
      if (lastAlerted && lastAlerted.slice(0, 10) === today) continue;

      // Fetch user email
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('email')
        .eq('id', site.user_id)
        .single();
      const email = profile && profile.email;
      if (!email) continue;

      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RESEND_API_KEY}` },
        body: JSON.stringify({
          from: ALERT_FROM_EMAIL,
          reply_to: ALERT_REPLY_TO_EMAIL,
          to: [email],
          subject: `⚠️ Domain expiring in ${days} days — ${site.name}`,
          html: `<div style="font-family:Inter,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;">
  <div style="margin-bottom:20px;font-weight:700;font-size:1.1rem;">SiteTrace — Domain Expiry Alert</div>
  <p>The domain for <strong>${escapeForEmail(site.name)}</strong> is expiring in <strong>${days} days</strong>.</p>
  <p><strong>Site:</strong> ${escapeForEmail(site.url)}<br>
     <strong>Domain:</strong> ${escapeForEmail(expiry.domain || site.url)}<br>
     <strong>Expires:</strong> ${expiry.expires_at ? new Date(expiry.expires_at).toDateString() : 'Unknown'}</p>
  <p>Renew your domain before it expires to avoid downtime and losing your name.</p>
  <a href="https://www.sitetrace.it.com/dashboard" style="display:inline-block;background:#6366f1;color:#fff;padding:10px 22px;border-radius:6px;text-decoration:none;font-weight:600;margin-top:8px;">Open Dashboard</a>
  <p style="margin-top:24px;font-size:.8rem;color:#94a3b8;">SiteTrace · sitetrace.it.com</p>
</div>`
        })
      });

      logEvent('domain_expiry_alert_sent', { site_id: site.id, days, threshold, email });
    } catch (_) { /* skip individual failures */ }
  }
}

function escapeForEmail(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

app.post('/billing/portal', requireUser, async (req, res) => {
  if (!stripe) {
    return res.status(503).json({ status: 'error', message: 'Stripe is not configured' });
  }

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', req.user.id)
    .single();

  if (!profile || !profile.stripe_customer_id) {
    return res.status(400).json({ status: 'error', message: 'No billing account found. Please upgrade first.' });
  }

  try {
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${APP_URL}/dashboard`
    });
    res.json({ url: portalSession.url });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.post('/jobs/run-checks', async (req, res) => {
  if (!CRON_SECRET || req.headers.authorization !== `Bearer ${CRON_SECRET}`) {
    return res.status(401).json({ status: 'error', message: 'Unauthorized' });
  }
  if (!supabaseAdmin) {
    return res.status(503).json({ status: 'error', message: 'Supabase server credentials are not configured' });
  }
  const result = await runScheduledChecks();
  if (result.status === 'error') return res.status(500).json(result);
  res.json(result);
});

app.get('/terms', (req, res) => {
  res.sendFile(path.join(__dirname, 'terms.html'));
});

app.get('/privacy', (req, res) => {
  res.sendFile(path.join(__dirname, 'privacy.html'));
});

app.get('/status/:slug', (req, res) => {
  res.sendFile(path.join(__dirname, 'status.html'));
});

app.get('/public/report/:slug', async (req, res) => {
  if (!supabaseAdmin) {
    return res.status(503).json({ status: 'error', message: 'Not configured' });
  }
  const { data: site, error } = await supabaseAdmin
    .from('sites')
    .select('id, name, url, last_status, last_score, last_response_time_ms, last_checked_at, public_slug, status_page_enabled')
    .eq('public_slug', req.params.slug)
    .single();

  if (error || !site) {
    return res.status(404).json({ status: 'error', message: 'Report not found' });
  }

  const { data: checks } = await supabaseAdmin
    .from('checks')
    .select('status, score, status_code, response_time_ms, created_at, result')
    .eq('site_id', site.id)
    .order('created_at', { ascending: false })
    .limit(30);

  const { data: incidents } = await supabaseAdmin
    .from('incidents')
    .select('status, title, created_at, resolved_at, duration_seconds')
    .eq('site_id', site.id)
    .order('created_at', { ascending: false })
    .limit(10);

  res.json({ status: 'success', site, checks: checks || [], incidents: incidents || [] });
});

app.get('/report/:slug', (req, res) => {
  res.sendFile(path.join(__dirname, 'report.html'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log('SiteTrace API listening on port ' + PORT);

    if (CRON_SECRET && supabaseAdmin) {
      console.log('Scheduler started — running checks every 60 s');
      setInterval(async () => {
        try {
          const result = await runScheduledChecks();
          if (result.status === 'skipped') return;
          console.log(`[scheduler] checked=${result.checked} total=${result.total}`);
        } catch (err) {
          console.error('[scheduler] unexpected error:', err.message);
        }
      }, 60 * 1000);
    } else {
      console.warn('Scheduler disabled — set CRON_SECRET and configure Supabase to enable automated checks');
    }
  });
}

module.exports = { app };