const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const tls = require('tls');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const API_TIMEOUT_MS = Number(process.env.API_TIMEOUT_MS || 12000);
const RATE_LIMIT = Number(process.env.RATE_LIMIT || 20);
const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 60 * 60 * 1000);
const MAX_BODY_BYTES = Number(process.env.MAX_BODY_BYTES || 2 * 1024 * 1024);

const requestCounts = new Map();

app.use(cors());
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
      https: ['HTTPS is active', 'The page is served over a secure connection.', 'Keep HTTPS enabled on every public page.'],
      httpsWarning: ['HTTPS is not being used', 'The URL uses HTTP instead of HTTPS.', 'Redirect traffic to HTTPS and install a valid SSL certificate.'],
      ssl: ['SSL certificate looks healthy', 'The certificate is valid and not close to expiration.', 'Use automatic renewal so it does not expire unexpectedly.'],
      sslWarning: ['SSL certificate needs attention', 'The certificate is missing, unavailable, or close to expiration.', 'Check certificate configuration and renewal settings.'],
      title: ['Title tag is healthy', 'The page has a useful title for search engines and browser tabs.', 'Keep titles specific and close to 30-60 characters.'],
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
      viewportFail: ['Mobile viewport missing', 'Mobile rendering may be unreliable.', 'Add a viewport meta tag.'],
      lang: ['Language attribute found', 'The document declares a language.', 'Keep the html lang attribute accurate.'],
      langWarning: ['Language attribute missing', 'Browsers and accessibility tools may not know the page language.', 'Add the correct lang attribute to the html tag.'],
      og: ['Social preview tags found', 'The page has Open Graph metadata for sharing.', 'Add image, title, and description tags for richer previews.'],
      ogWarning: ['Social preview tags are incomplete', 'Shared links may look plain or inconsistent.', 'Add og:title, og:description, and og:image.'],
      robots: ['Page is indexable', 'No obvious noindex directive was found.', 'Use noindex only for pages you want excluded from search.'],
      robotsFail: ['Page may be blocked from indexing', 'A noindex directive was found.', 'Remove noindex if this page should appear in search.'],
      hsts: ['HSTS header found', 'The site asks browsers to enforce HTTPS.', 'Keep HSTS enabled once HTTPS is stable.'],
      hstsWarning: ['HSTS header missing', 'Browsers are not being told to enforce HTTPS.', 'Consider adding Strict-Transport-Security.'],
      csp: ['Content Security Policy found', 'The site has a CSP security header.', 'Keep CSP rules strict but compatible.'],
      cspWarning: ['Content Security Policy missing', 'The site has less protection against injected scripts.', 'Add a Content-Security-Policy header when possible.'],
      frame: ['Clickjacking protection found', 'The site sends a frame protection header.', 'Keep frame rules aligned with embedding needs.'],
      frameWarning: ['Clickjacking protection missing', 'The page may be embeddable by other sites.', 'Add X-Frame-Options or frame-ancestors in CSP.']
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
      https: ['HTTPS esta activo', 'La pagina usa una conexion segura.', 'Manten HTTPS activo en todas las paginas publicas.'],
      httpsWarning: ['HTTPS no esta en uso', 'La URL usa HTTP en vez de HTTPS.', 'Redirige el trafico a HTTPS e instala un certificado SSL valido.'],
      ssl: ['El certificado SSL se ve saludable', 'El certificado es valido y no esta cerca de vencer.', 'Usa renovacion automatica para evitar vencimientos inesperados.'],
      sslWarning: ['El certificado SSL necesita atencion', 'El certificado falta, no esta disponible o esta cerca de vencer.', 'Revisa la configuracion y renovacion del certificado.'],
      title: ['La etiqueta title esta saludable', 'La pagina tiene un titulo util para buscadores y pestanas del navegador.', 'Manten titulos especificos de 30 a 60 caracteres.'],
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
      viewportFail: ['Falta viewport movil', 'La vista movil podria renderizar de forma incorrecta.', 'Agrega una etiqueta meta viewport.'],
      lang: ['Atributo de idioma encontrado', 'El documento declara un idioma.', 'Manten el atributo lang correcto.'],
      langWarning: ['Falta atributo de idioma', 'Navegadores y herramientas de accesibilidad podrian no saber el idioma.', 'Agrega el atributo lang correcto en html.'],
      og: ['Tags de vista social encontrados', 'La pagina tiene metadata Open Graph para compartir.', 'Agrega imagen, titulo y descripcion para mejores previews.'],
      ogWarning: ['La vista social esta incompleta', 'Los enlaces compartidos podrian verse simples o inconsistentes.', 'Agrega og:title, og:description y og:image.'],
      robots: ['La pagina parece indexable', 'No encontramos una directiva noindex evidente.', 'Usa noindex solo en paginas que quieras excluir de busqueda.'],
      robotsFail: ['La pagina podria estar bloqueada para indexacion', 'Encontramos una directiva noindex.', 'Quita noindex si esta pagina debe aparecer en buscadores.'],
      hsts: ['Header HSTS encontrado', 'El sitio pide al navegador forzar HTTPS.', 'Manten HSTS activo cuando HTTPS sea estable.'],
      hstsWarning: ['Falta header HSTS', 'El navegador no recibe instruccion para forzar HTTPS.', 'Considera agregar Strict-Transport-Security.'],
      csp: ['Content Security Policy encontrado', 'El sitio tiene un header CSP de seguridad.', 'Manten reglas CSP estrictas pero compatibles.'],
      cspWarning: ['Falta Content Security Policy', 'El sitio tiene menos proteccion contra scripts inyectados.', 'Agrega un header Content-Security-Policy cuando sea posible.'],
      frame: ['Proteccion contra clickjacking encontrada', 'El sitio envia un header de proteccion de frames.', 'Manten las reglas alineadas con tus necesidades de embedding.'],
      frameWarning: ['Falta proteccion contra clickjacking', 'La pagina podria ser embebida por otros sitios.', 'Agrega X-Frame-Options o frame-ancestors en CSP.']
    }
  }
};

function language(locale) {
  return locale === 'es' ? 'es' : 'en';
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
    'notion.so'
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
  }, { pass: 0, warning: 0, fail: 0, uptime: 0, seo: 0, security: 0 });
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

  let urlObj;

  try {
    urlObj = normalizeUrl(req.body.url);
  } catch (error) {
    return res.status(400).json({ status: 'error', code: 'invalid_url', message: messages[locale].invalid, detail: error.message });
  }

  try {
    const startedAt = Date.now();
    const sslPromise = getSslInfo(urlObj);

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
    const $ = cheerio.load(html);
    const headers = response.headers || {};
    const ssl = await sslPromise;
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
    const hasFrameProtection = Boolean(headers['x-frame-options'] || (headers['content-security-policy'] || '').includes('frame-ancestors'));
    const pageContext = getPageContext(urlObj, title, metaDescription);

    if (response.status >= 500) addCheck(checks, locale, 'uptime', 'status_code', 'fail', 12, response.status, 'statusFail');
    else if (response.status >= 400) addCheck(checks, locale, 'uptime', 'status_code', 'warning', 12, response.status, 'statusWarning');
    else addCheck(checks, locale, 'uptime', 'status_code', 'pass', 12, response.status, 'status');

    if (responseTime < 1000) addCheck(checks, locale, 'uptime', 'response_time', 'pass', 12, `${responseTime}ms`, 'speed');
    else if (responseTime < 3000) addCheck(checks, locale, 'uptime', 'response_time', 'warning', 12, `${responseTime}ms`, 'speedWarning');
    else addCheck(checks, locale, 'uptime', 'response_time', 'fail', 12, `${responseTime}ms`, 'speedFail');

    if (urlObj.protocol === 'https:') addCheck(checks, locale, 'uptime', 'https', 'pass', 8, 'https', 'https');
    else addCheck(checks, locale, 'uptime', 'https', 'warning', 8, 'http', 'httpsWarning');

    if (ssl && ssl.days_remaining > 30) addCheck(checks, locale, 'uptime', 'ssl', 'pass', 8, `${ssl.days_remaining} days`, 'ssl');
    else addCheck(checks, locale, 'uptime', 'ssl', 'warning', 8, ssl ? `${ssl.days_remaining} days` : 'Unavailable', 'sslWarning');

    if (!title) addCheck(checks, locale, 'seo', 'title', 'fail', 10, 'Missing', 'titleFail');
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
    addCheck(checks, locale, 'seo', 'viewport', viewport ? 'pass' : 'fail', 4, viewport || 'Missing', viewport ? 'viewport' : 'viewportFail');
    addCheck(checks, locale, 'seo', 'lang', htmlLang ? 'pass' : 'warning', 3, htmlLang || 'Missing', htmlLang ? 'lang' : 'langWarning');
    addCheck(checks, locale, 'seo', 'open_graph', ogCount >= 3 ? 'pass' : 'warning', 3, ogCount, ogCount >= 3 ? 'og' : 'ogWarning');
    addCheck(checks, locale, 'seo', 'robots_indexing', robots.includes('noindex') ? 'fail' : 'pass', 3, robots || 'indexable', robots.includes('noindex') ? 'robotsFail' : 'robots');

    addCheck(checks, locale, 'security', 'hsts', headers['strict-transport-security'] ? 'pass' : 'warning', 3, headers['strict-transport-security'] ? 'Present' : 'Missing', headers['strict-transport-security'] ? 'hsts' : 'hstsWarning');
    addCheck(checks, locale, 'security', 'csp', headers['content-security-policy'] ? 'pass' : 'warning', 3, headers['content-security-policy'] ? 'Present' : 'Missing', headers['content-security-policy'] ? 'csp' : 'cspWarning');
    addCheck(checks, locale, 'security', 'frame', hasFrameProtection ? 'pass' : 'warning', 2, headers['x-frame-options'] || 'Missing', hasFrameProtection ? 'frame' : 'frameWarning');

    const score = calculateScore(checks);

    res.json({
      status: 'success',
      analyzed_url: urlObj.toString(),
      final_url: finalUrl,
      status_code: response.status,
      page_context: pageContext,
      response_time_ms: responseTime,
      response_time: `${responseTime}ms`,
      title: title || 'No title',
      meta_description: metaDescription || 'No description',
      h1_count: h1Count,
      images,
      images_with_alt: imagesWithAlt,
      seo_score: score,
      score,
      summary: summarize(checks),
      ssl,
      checks,
      rate_limit: {
        remaining: limit.remaining,
        reset_at: new Date(limit.resetAt).toISOString()
      }
    });
  } catch (error) {
    console.error('Analyze error:', error.message);
    res.status(502).json({
      status: 'error',
      code: 'fetch_failed',
      message: messages[locale].fetch,
      detail: error.message
    });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`SiteTrace running on port ${PORT}`);
});
