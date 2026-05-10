const apiBase = ['localhost', '127.0.0.1'].includes(window.location.hostname)
  ? ''
  : 'https://sitetrace-api.onrender.com';
const apiPath = (path) => `${apiBase}${path}`;
const page = document.body.dataset.page || 'home';
const state = { config: null, supabase: null, session: null, profile: null, plan: 'free', limits: null, features: null, usage: null, sites: [], selectedSiteId: null, selectedChecks: [] };
const escapeHtml = (value) => String(value || '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
const savedLocale = localStorage.getItem('sitetrace_locale');
const browserLocale = navigator.language && navigator.language.toLowerCase().startsWith('es') ? 'es' : 'en';
let currentLocale = savedLocale === 'es' || savedLocale === 'en' ? savedLocale : browserLocale;
let currentTheme = localStorage.getItem('sitetrace_theme') === 'night' ? 'night' : 'day';
let supabaseInitPromise = null;

const copy = {
  en: {
    nav: { pricing: 'Pricing', demo: 'Demo', how: 'How it works', dashboard: 'Dashboard', signin: 'Sign in', home: 'Home', signout: 'Sign out' },
    controls: { themeDay: 'Day mode', themeNight: 'Night mode', language: 'Language' },
    common: { copied: 'Report copied to clipboard.', copyFailed: 'Could not copy the report.', shareReport: 'Share report', copyReport: 'Copy client report' },
    home: {
      eyebrow: 'Instant website audit plus monitoring',
      title: 'Find SEO, uptime, SSL, and domain issues before they cost you leads.',
      lead: 'Run a free website health check in seconds. Then monitor client sites for silent changes, outages, slowdowns, expiring domains, and SEO basics that break quietly.',
      placeholder: 'https://example.com',
      button: 'Check a site ->',
      pills: ['Free instant audit', 'SEO + uptime + SSL + domain expiry', 'Upgrade for monitoring and history'],
      previewEyebrow: 'Audit preview',
      previewSite: 'client-site.com',
      metricResponse: 'Response time',
      metricSsl: 'Domain expiry',
      metricIssues: 'Issues to fix',
      checkReachableTitle: 'Site is reachable',
      checkReachableCopy: 'Your server is responding normally.',
      checkMetaTitle: 'Homepage meta changed',
      checkMetaCopy: 'A weak snippet can lower clicks from search and shared links.',
      checkSecurityTitle: 'Security headers missing',
      checkSecurityCopy: 'Flag baseline trust and protection gaps before a client asks.',
      sectionEyebrow: 'Positioned for maintenance revenue',
      sectionTitle: 'Give every client site a simple health monitor.',
      sectionCopy: 'Agencies and freelancers can use SiteTrace to prove they are watching the details clients never check until something breaks.',
      featureTitles: ['Silent issue alerts', 'Client-ready health score', 'Agency-friendly monitoring'],
      featureCopy: [
        'Know when a site is online but still risky: slow response, noindex, missing metadata, SSL trouble, or keyword changes.',
        'Turn technical checks into a plain score, issue list, and recent history that a non-technical client can understand.',
        'Manage multiple sites, run checks on demand, publish status pages, and build recurring maintenance around proactive care.'
      ],
      agencyEyebrow: 'For agencies',
      agencyTitle: 'Turn website maintenance into something clients can see.',
      agencyCopy: 'SiteTrace gives you the proof layer for recurring care: what changed, what is risky, when it happened, and what you did before the client noticed.',
      agencyPoints: ['Monitor every client site from one dashboard', 'Copy client-ready reports after each check', 'Use status pages and incidents to show proactive support'],
      whyEyebrow: 'Why it matters',
      whyTitle: 'A site can be live and still be losing business.',
      whyCopy: 'Downtime is obvious. The expensive problems are often quieter: a CMS update removes a title, a page becomes noindex, SSL starts expiring, a homepage slows down, or a required phrase disappears from a client page.',
      plans: 'See plans',
      footer: 'SiteTrace - Website health monitoring for agencies and site owners.'
    },
    pricing: {
      title: 'Plans built around proactive website care.',
      lead: 'Start with a free instant audit, then monitor the sites that matter with alerts, history, status pages, and agency-ready capacity.',
      cards: [
        ['Validate', 'Free', '$0', 'For one-time website health checks.', ['Instant public audit', 'SEO, uptime, SSL, domain expiry, and security basics', 'Visual score with shareable recommendations', 'No saved monitors, history, or alerts']],
        ['Best first paid plan', 'Starter', '$19/mo', "For one business or a freelancer's core sites.", ['5 monitored sites', 'Checks every 5 minutes', 'Email alerts and 30-day history', 'Public status pages and client-ready reports']],
        ['For recurring care', 'Agency', '$79/mo', 'For teams managing client websites.', ['50 monitored sites', 'Checks every 1 minute', '90-day history, client reports, and status pages', 'Slack, Teams, webhooks, and API access']]
      ],
      buttons: ['Start monitoring', 'Upgrade to Agency'],
      note: 'Launch focus:',
      noteCopy: ' The free audit helps people validate a site now. Paid plans sell the ongoing protection: monitoring, alerts, history, and proof.',
      splitTitle: 'Simple rule: scan free, monitor paid.',
      splitCopy: 'Free should answer "what is wrong right now?" Paid should answer "what changed, who was alerted, and what proof can I show the client?"',
      splitFree: ['Instant audit', 'Visual score', 'Fix recommendations', 'No storage needed'],
      splitPaid: ['Scheduled monitoring', 'Incident alerts', 'Check history', 'Client reports and status pages']
    },
    demo: {
      eyebrow: 'Live-style demo',
      title: 'See how SiteTrace explains client website health.',
      lead: 'Explore sample monitors for a healthy site, a warning state, and a down incident before creating an account.',
      select: 'Sample client sites',
      current: 'Current health',
      score: 'Health score',
      response: 'Response',
      lastCheck: 'Last check',
      issues: 'Issues SiteTrace would surface',
      history: 'Recent checks',
      ctaTitle: 'Use this as your sales demo.',
      ctaCopy: 'A freelancer or agency can show this view to explain why proactive monitoring belongs in every maintenance plan.',
      ctaButton: 'Start with Agency'
    },
    api: {
      eyebrow: 'How it works',
      title: 'SiteTrace checks your site repeatedly and explains what needs attention.',
      lead: 'Add a website once. SiteTrace keeps checking whether it is online, fast enough, safe to visit, and still showing the SEO basics clients depend on.',
      stepTitles: ['1. Add a site', '2. SiteTrace checks it', '3. You get a clear status', '4. Share the result'],
      stepCopy: [
        'Save a client website or run a quick manual check from the homepage.',
        'It reviews uptime, response speed, SSL, indexing, page titles, descriptions, and other basics that often break quietly.',
        'Each site shows a health score, current status, recent checks, and the most important issues to fix first.',
        'Copy a client-ready report or publish a status page so people can understand what happened without reading technical logs.'
      ],
      watchTitle: 'What SiteTrace looks for',
      watchCopy: 'The goal is not to overwhelm you. SiteTrace focuses on the problems most likely to hurt trust, leads, search visibility, or client confidence.',
      watchTitles: ['Site is down', 'Site is getting slow', 'SEO basics changed', 'Trust signals need attention'],
      watchCopies: [
        'The page stops responding or returns a server error.',
        'Response time increases enough that visitors may feel the delay.',
        'Important page titles, descriptions, indexing rules, or required phrases go missing.',
        'SSL, HTTPS, or security basics look weak or misconfigured.'
      ],
      maintenanceTitle: 'Built for proactive maintenance',
      maintenanceCopy: 'Agencies and freelancers can use SiteTrace to show clients that their sites are being watched, not just repaired after complaints.'
    },
    dashboard: {
      eyebrow: 'Website health command center',
      title: 'Monitor the sites that cannot quietly break.',
      lead: 'Track status, speed, SEO hygiene, SSL risk, security warnings, recent incidents, and client-ready history.',
      addName: 'Client or site name',
      addButton: 'Add monitor',
      clientSites: 'Client sites',
      emptyTitle: 'No monitor selected',
      emptyCopy: 'Choose a site from the left to see health, incidents, recommendations, and recent checks.',
      plan: 'Plan',
      sites: 'Sites',
      lastCheck: 'Last check',
      alerts: ['Email alerts', 'From address', 'Recipient', 'Delivery lookup', 'Slack', 'Teams'],
      alertValues: {
        configured: 'Configured',
        notConfigured: 'Not configured',
        readKey: 'Read key configured',
        sendOnly: 'Send-only key',
        optional: 'Optional'
      },
      noSites: 'No client sites monitored yet.',
      running: 'Checking uptime, speed, SEO basics, SSL, and security signals...',
      completed: 'Health check completed.',
      emailSent: 'Incident email sent successfully.',
      emailNotSent: 'Incident was recorded, but email was not sent:',
      pendingIncident: 'First matching failure recorded. Run one more matching check to open an incident and send an alert.',
      sendingTest: 'Sending test email...',
      noHistory: 'No check history yet.',
      noIssues: 'No open recommendations from the latest check.',
      firstCheck: 'Run the first check to start history.',
      monitorEyebrow: 'Client site monitor',
      runCheck: 'Run health check',
      refresh: 'Refresh history',
      delete: 'Delete',
      currentHealth: 'Current health',
      uptimeSample: 'Uptime sample',
      healthScore: 'Health score',
      avgResponse: 'Avg response',
      sinceDown: 'Since last down',
      recentIncidents: 'Recent incidents',
      settings: 'Monitor settings',
      settingsCopy: 'Keyword checks, maintenance, alerts, public status.',
      keyword: 'Keyword must appear',
      keywordPlaceholder: 'optional text to monitor',
      maintenanceStart: 'Maintenance starts',
      maintenanceEnd: 'Maintenance ends',
      emailAlerts: 'Email alerts',
      alertDown: 'Notify when down',
      alertWarning: 'Notify on warnings',
      alertRecovery: 'Notify on recovery',
      statusPage: 'Enable public status page',
      save: 'Save settings',
      latestIssues: 'Latest silent issues',
      recentChecks: 'Recent checks',
      enterUrl: 'Enter a public website URL.',
      saved: 'Saved.',
      deleteConfirm: 'Delete this monitored site and its check history?',
      saveFailed: 'Could not save settings',
      planUsage: 'Plan usage',
      upgradePrompt: 'Upgrade to add more monitored sites or run checks more often.',
      upgradeStarter: 'Upgrade to Starter',
      upgradeAgency: 'Upgrade to Agency',
      limitReached: 'Monitor limit reached for this plan.',
      freeScanOnly: 'Free plan = instant audits only',
      paidFeaturesTitle: 'Upgrade to monitor sites continuously',
      paidFeaturesCopy: 'Starter unlocks saved monitors, scheduled checks, email alerts, history, status pages, and client-ready reports. Agency adds higher capacity, webhooks, and API access.',
      paidFeatureItems: ['Saved client monitors', 'Scheduled checks', 'Email alerts', 'History and incidents', 'Status pages', 'Reports for clients'],
      monitoringUnavailable: 'Monitoring is a paid feature. Use the homepage scanner for a free one-time audit.',
      lockedForPlan: 'Locked on this plan',
      lockedStatusPage: 'Status pages require Starter or Agency.',
      lockedAlerts: 'Email alerts require Starter or Agency.',
      domainExpiry: 'Domain expiry',
      domainUnknown: 'Unknown'
    },
    signin: {
      eyebrow: 'Customer access',
      title: 'Sign in to manage monitored sites.',
      lead: 'Create an account to save sites, run checks, and keep history separate from the public scanner.',
      formTitle: 'Sign in or create account',
      password: 'Password',
      signin: 'Sign in',
      signup: 'Create account'
    }
  },
  es: {
    nav: { pricing: 'Precios', demo: 'Demo', how: 'Como funciona', dashboard: 'Dashboard', signin: 'Entrar', home: 'Inicio', signout: 'Salir' },
    controls: { themeDay: 'Modo dia', themeNight: 'Modo noche', language: 'Idioma' },
    common: { copied: 'Reporte copiado al portapapeles.', copyFailed: 'No se pudo copiar el reporte.', shareReport: 'Compartir reporte', copyReport: 'Copiar reporte para cliente' },
    home: {
      eyebrow: 'Auditoria web instantanea mas monitoreo',
      title: 'Encuentra problemas SEO, uptime, SSL y dominio antes de que cuesten leads.',
      lead: 'Corre un health check gratis en segundos. Luego monitorea sitios de clientes por cambios silenciosos, caidas, lentitud, dominios por vencer y SEO basico que se rompe sin avisar.',
      placeholder: 'https://ejemplo.com',
      button: 'Revisar sitio ->',
      pills: ['Auditoria instantanea gratis', 'SEO + uptime + SSL + dominio', 'Mejora para monitoreo e historial'],
      previewEyebrow: 'Vista de auditoria',
      previewSite: 'sitio-cliente.com',
      metricResponse: 'Tiempo de respuesta',
      metricSsl: 'Vencimiento dominio',
      metricIssues: 'Problemas a corregir',
      checkReachableTitle: 'El sitio responde',
      checkReachableCopy: 'El servidor esta respondiendo normalmente.',
      checkMetaTitle: 'La meta del home cambio',
      checkMetaCopy: 'Un snippet debil puede bajar clics desde busqueda y enlaces compartidos.',
      checkSecurityTitle: 'Faltan headers de seguridad',
      checkSecurityCopy: 'Detecta brechas basicas de confianza antes de que pregunte un cliente.',
      sectionEyebrow: 'Orientado a ingresos recurrentes',
      sectionTitle: 'Dale a cada sitio de cliente un monitor de salud simple.',
      sectionCopy: 'Agencias y freelancers pueden usar SiteTrace para demostrar que vigilan detalles que los clientes no revisan hasta que algo se rompe.',
      featureTitles: ['Alertas de problemas silenciosos', 'Score claro para clientes', 'Monitoreo para agencias'],
      featureCopy: [
        'Sabe cuando un sitio esta online pero sigue en riesgo: respuesta lenta, noindex, metadata faltante, SSL o cambios de keywords.',
        'Convierte checks tecnicos en un score, lista de problemas e historial que un cliente no tecnico puede entender.',
        'Administra varios sitios, corre checks, publica status pages y vende mantenimiento recurrente con evidencia.'
      ],
      agencyEyebrow: 'Para agencias',
      agencyTitle: 'Convierte el mantenimiento web en algo que el cliente puede ver.',
      agencyCopy: 'SiteTrace te da la capa de evidencia para cuidado recurrente: que cambio, que esta en riesgo, cuando paso y que hiciste antes de que el cliente lo notara.',
      agencyPoints: ['Monitorea todos los sitios de clientes desde un dashboard', 'Copia reportes listos para cliente despues de cada check', 'Usa status pages e incidentes para mostrar soporte proactivo'],
      whyEyebrow: 'Por que importa',
      whyTitle: 'Un sitio puede estar vivo y aun asi perder negocio.',
      whyCopy: 'La caida total es obvia. Los problemas caros suelen ser mas silenciosos: una actualizacion quita el title, una pagina queda noindex, el SSL empieza a expirar, el home se vuelve lento o desaparece una frase clave.',
      plans: 'Ver planes',
      footer: 'SiteTrace - Monitoreo de salud web para agencias y duenos de sitios.'
    },
    pricing: {
      title: 'Planes pensados para cuidado web proactivo.',
      lead: 'Empieza con una auditoria instantanea gratis y luego monitorea los sitios importantes con alertas, historial, status pages y capacidad para agencias.',
      cards: [
        ['Validar', 'Free', '$0', 'Para checks puntuales de salud web.', ['Auditoria publica instantanea', 'SEO, uptime, SSL, dominio y seguridad basica', 'Score visual con recomendaciones compartibles', 'Sin monitores guardados, historial ni alertas']],
        ['Mejor primer plan pago', 'Starter', '$19/mes', 'Para un negocio o los sitios clave de un freelancer.', ['5 sitios monitoreados', 'Checks cada 5 minutos', 'Alertas por email e historial de 30 dias', 'Status pages y reportes para cliente']],
        ['Para cuidado recurrente', 'Agency', '$79/mes', 'Para equipos que manejan sitios de clientes.', ['50 sitios monitoreados', 'Checks cada 1 minuto', 'Historial de 90 dias, reportes y status pages', 'Slack, Teams, webhooks y API']]
      ],
      buttons: ['Empezar monitoreo', 'Subir a Agency'],
      note: 'Enfoque de lanzamiento:',
      noteCopy: ' El audit gratis ayuda a validar un sitio ahora. Los planes pagos venden proteccion continua: monitoreo, alertas, historial y evidencia.',
      splitTitle: 'Regla simple: escanear gratis, monitorear pagado.',
      splitCopy: 'Free responde "que esta mal ahora?". Pago responde "que cambio, a quien se aviso y que evidencia puedo mostrar al cliente?".',
      splitFree: ['Auditoria instantanea', 'Score visual', 'Recomendaciones', 'Sin guardar datos'],
      splitPaid: ['Monitoreo programado', 'Alertas de incidentes', 'Historial de checks', 'Reportes y status pages']
    },
    demo: {
      eyebrow: 'Demo tipo monitoreo real',
      title: 'Mira como SiteTrace explica la salud web de clientes.',
      lead: 'Explora monitores de ejemplo para un sitio saludable, uno con alerta y uno con incidente antes de crear cuenta.',
      select: 'Sitios de cliente de ejemplo',
      current: 'Salud actual',
      score: 'Score de salud',
      response: 'Respuesta',
      lastCheck: 'Ultimo check',
      issues: 'Problemas que SiteTrace mostraria',
      history: 'Checks recientes',
      ctaTitle: 'Usa esto como demo de venta.',
      ctaCopy: 'Un freelancer o agencia puede mostrar esta vista para explicar por que el monitoreo proactivo pertenece a cada plan de mantenimiento.',
      ctaButton: 'Empezar con Agency'
    },
    api: {
      eyebrow: 'Como funciona',
      title: 'SiteTrace revisa tu sitio constantemente y explica que necesita atencion.',
      lead: 'Agrega un sitio una vez. SiteTrace sigue revisando si esta online, si carga suficientemente rapido, si es seguro visitarlo y si conserva los basicos SEO que importan.',
      stepTitles: ['1. Agrega un sitio', '2. SiteTrace lo revisa', '3. Recibes un estado claro', '4. Comparte el resultado'],
      stepCopy: [
        'Guarda un sitio de cliente o corre un check rapido desde la pagina principal.',
        'Revisa uptime, velocidad, SSL, indexacion, titles, descriptions y otros basicos que suelen romperse en silencio.',
        'Cada sitio muestra score de salud, estado actual, checks recientes y los problemas mas importantes a corregir.',
        'Copia un reporte listo para cliente o publica una status page para explicar que paso sin logs tecnicos.'
      ],
      watchTitle: 'Que busca SiteTrace',
      watchCopy: 'La meta no es abrumarte. SiteTrace se enfoca en problemas que pueden afectar confianza, leads, visibilidad o tranquilidad del cliente.',
      watchTitles: ['El sitio esta caido', 'El sitio se esta volviendo lento', 'Cambios en SEO basico', 'Senales de confianza debiles'],
      watchCopies: [
        'La pagina deja de responder o devuelve un error del servidor.',
        'El tiempo de respuesta sube lo suficiente como para que visitantes sientan la demora.',
        'Titles, descriptions, reglas de indexacion o frases requeridas desaparecen.',
        'SSL, HTTPS o configuraciones basicas de seguridad se ven debiles o mal configuradas.'
      ],
      maintenanceTitle: 'Pensado para mantenimiento proactivo',
      maintenanceCopy: 'Agencias y freelancers pueden usar SiteTrace para demostrar que los sitios estan siendo vigilados, no solo reparados despues de quejas.'
    },
    dashboard: {
      eyebrow: 'Centro de salud web',
      title: 'Monitorea los sitios que no pueden romperse en silencio.',
      lead: 'Sigue estado, velocidad, SEO basico, riesgo SSL, seguridad, incidentes recientes e historial claro para clientes.',
      addName: 'Cliente o nombre del sitio',
      addButton: 'Agregar monitor',
      clientSites: 'Sitios de clientes',
      emptyTitle: 'No hay monitor seleccionado',
      emptyCopy: 'Elige un sitio de la izquierda para ver salud, incidentes, recomendaciones y checks recientes.',
      plan: 'Plan',
      sites: 'Sitios',
      lastCheck: 'Ultimo check',
      alerts: ['Alertas por email', 'Remitente', 'Destinatario', 'Consulta de entrega', 'Slack', 'Teams'],
      alertValues: {
        configured: 'Configurado',
        notConfigured: 'No configurado',
        readKey: 'Read key configurada',
        sendOnly: 'Llave solo de envio',
        optional: 'Opcional'
      },
      noSites: 'Aun no hay sitios de clientes monitoreados.',
      running: 'Revisando uptime, velocidad, SEO basico, SSL y seguridad...',
      completed: 'Check de salud completado.',
      emailSent: 'Email de incidente enviado correctamente.',
      emailNotSent: 'El incidente se registro, pero el email no se envio:',
      pendingIncident: 'Primer fallo registrado. Corre otro check igual para abrir incidente y enviar alerta.',
      sendingTest: 'Enviando email de prueba...',
      noHistory: 'Aun no hay historial de checks.',
      noIssues: 'No hay recomendaciones abiertas en el ultimo check.',
      firstCheck: 'Corre el primer check para iniciar el historial.',
      monitorEyebrow: 'Monitor de sitio cliente',
      runCheck: 'Correr health check',
      refresh: 'Actualizar historial',
      delete: 'Eliminar',
      currentHealth: 'Salud actual',
      uptimeSample: 'Muestra de uptime',
      healthScore: 'Score de salud',
      avgResponse: 'Respuesta prom.',
      sinceDown: 'Desde ultima caida',
      recentIncidents: 'Incidentes recientes',
      settings: 'Configuracion del monitor',
      settingsCopy: 'Keywords, mantenimiento, alertas y status publico.',
      keyword: 'Keyword requerida',
      keywordPlaceholder: 'texto opcional a monitorear',
      maintenanceStart: 'Inicio de mantenimiento',
      maintenanceEnd: 'Fin de mantenimiento',
      emailAlerts: 'Alertas por email',
      alertDown: 'Avisar si cae',
      alertWarning: 'Avisar con warnings',
      alertRecovery: 'Avisar recuperacion',
      statusPage: 'Activar status page publica',
      save: 'Guardar configuracion',
      latestIssues: 'Problemas silenciosos recientes',
      recentChecks: 'Checks recientes',
      enterUrl: 'Ingresa una URL publica.',
      saved: 'Guardado.',
      deleteConfirm: 'Eliminar este sitio monitoreado y su historial?',
      saveFailed: 'No se pudo guardar la configuracion',
      planUsage: 'Uso del plan',
      upgradePrompt: 'Mejora tu plan para agregar mas sitios o correr checks con mas frecuencia.',
      upgradeStarter: 'Subir a Starter',
      upgradeAgency: 'Subir a Agency',
      limitReached: 'Limite de monitores alcanzado para este plan.',
      freeScanOnly: 'Plan Free = auditorias instantaneas',
      paidFeaturesTitle: 'Sube de plan para monitorear sitios continuamente',
      paidFeaturesCopy: 'Starter desbloquea monitores guardados, checks programados, alertas por email, historial, status pages y reportes para clientes. Agency agrega mas capacidad, webhooks y API.',
      paidFeatureItems: ['Monitores de clientes', 'Checks programados', 'Alertas por email', 'Historial e incidentes', 'Status pages', 'Reportes para clientes'],
      monitoringUnavailable: 'El monitoreo es una funcion de pago. Usa el scanner del inicio para una auditoria gratis puntual.',
      lockedForPlan: 'Bloqueado en este plan',
      lockedStatusPage: 'Las status pages requieren Starter o Agency.',
      lockedAlerts: 'Las alertas por email requieren Starter o Agency.',
      domainExpiry: 'Vencimiento dominio',
      domainUnknown: 'Desconocido'
    },
    signin: {
      eyebrow: 'Acceso de cliente',
      title: 'Entra para manejar sitios monitoreados.',
      lead: 'Crea una cuenta para guardar sitios, correr checks y separar el historial del scanner publico.',
      formTitle: 'Entrar o crear cuenta',
      password: 'Contrasena',
      signin: 'Entrar',
      signup: 'Crear cuenta'
    }
  }
};

function t(path) {
  return path.split('.').reduce((value, key) => value && value[key], copy[currentLocale]) || path;
}

function setText(selector, value) {
  const element = document.querySelector(selector);
  if (element) element.textContent = value;
}

function setAllText(selector, values) {
  document.querySelectorAll(selector).forEach((element, index) => {
    if (values[index]) element.textContent = values[index];
  });
}

function localizedStatus(status) {
  const labels = {
    en: { online: 'online', warning: 'warning', down: 'down', maintenance: 'maintenance', pending: 'pending' },
    es: { online: 'online', warning: 'warning', down: 'caido', maintenance: 'mantenimiento', pending: 'pendiente' }
  };
  return labels[currentLocale][status] || status || labels[currentLocale].pending;
}

async function copyToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
}

function reportSummaryFromAnalysis(data) {
  const checks = Array.isArray(data.checks) ? data.checks : [];
  const issues = checks.filter((check) => check.level !== 'pass').slice(0, 8);
  const lines = [
    `SiteTrace report: ${data.final_url || data.analyzed_url}`,
    `Score: ${data.score || data.seo_score || 0}/100`,
    `HTTP: ${data.status_code || '-'}`,
    `Response: ${data.response_time || '-'}`,
    '',
    currentLocale === 'es' ? 'Problemas principales:' : 'Top issues:'
  ];
  if (!issues.length) lines.push(currentLocale === 'es' ? 'No hay problemas abiertos.' : 'No open issues.');
  issues.forEach((check) => lines.push(`- ${check.title}: ${check.recommendation || check.description}`));
  return lines.join('\n');
}

function reportSummaryFromSite(site, checks) {
  const latest = checks[0] || {};
  const result = latest.result || {};
  const issues = Array.isArray(result.checks) ? result.checks.filter((check) => check.level !== 'pass').slice(0, 8) : [];
  const lines = [
    `SiteTrace client report: ${site.name}`,
    `URL: ${site.url}`,
    `Status: ${localizedStatus(statusLabel(site.last_status))}`,
    `Score: ${site.last_score || latest.score || '-'}/100`,
    `Response: ${site.last_response_time_ms || latest.response_time_ms || '-'}ms`,
    `Last check: ${formatDateTime(site.last_checked_at || latest.created_at)}`,
    '',
    currentLocale === 'es' ? 'Problemas principales:' : 'Top issues:'
  ];
  if (!issues.length) lines.push(currentLocale === 'es' ? 'No hay problemas abiertos.' : 'No open issues.');
  issues.forEach((check) => lines.push(`- ${check.title}: ${check.recommendation || check.description}`));
  return lines.join('\n');
}

function applyTheme() {
  document.documentElement.dataset.theme = currentTheme;
  const button = document.getElementById('themeToggle');
  if (button) {
    const label = currentTheme === 'day' ? t('controls.themeNight') : t('controls.themeDay');
    button.innerHTML = currentTheme === 'day'
      ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.7 6.7 0 0 0 9.8 9.8Z"/></svg>'
      : '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>';
    button.setAttribute('aria-label', label);
    button.setAttribute('title', label);
  }
}

function updateAuthNav() {
  const signInLink = document.querySelector('.nav-links a[href="/signin"], .nav-links a[data-auth-link="signin"]');
  if (!signInLink) return;
  signInLink.dataset.authLink = 'signin';
  if (state.session) {
    signInLink.textContent = t('nav.signout');
    signInLink.href = '#signout';
    signInLink.classList.add('secondary');
  } else {
    signInLink.textContent = t('nav.signin');
    signInLink.href = '/signin';
  }
}

async function initNavSession() {
  if (page === 'dashboard' || page === 'signin') return;
  await initSupabase();
  updateAuthNav();
  const signInLink = document.querySelector('.nav-links a[data-auth-link="signin"]');
  if (!signInLink || signInLink.dataset.authBound) return;
  signInLink.dataset.authBound = 'true';
  signInLink.addEventListener('click', async (event) => {
    if (!state.session) return;
    event.preventDefault();
    if (state.supabase) await state.supabase.auth.signOut();
    state.session = null;
    updateAuthNav();
    window.location.href = '/';
  });
}

function initPreferences() {
  document.documentElement.lang = currentLocale;
  const navLinks = document.querySelector('.nav-links');
  if (navLinks && !document.getElementById('languageSelect')) {
    const controls = document.createElement('div');
    controls.className = 'nav-controls';
    controls.innerHTML = `
      <select id="languageSelect" class="control-select" aria-label="${escapeHtml(t('controls.language'))}">
        <option value="en">EN</option>
        <option value="es">ES</option>
      </select>
      <button id="themeToggle" class="control-button" type="button"></button>`;
    navLinks.appendChild(controls);
    document.getElementById('languageSelect').value = currentLocale;
    document.getElementById('languageSelect').addEventListener('change', (event) => {
      currentLocale = event.target.value === 'es' ? 'es' : 'en';
      localStorage.setItem('sitetrace_locale', currentLocale);
      applyLanguage();
      if (page === 'dashboard' && state.sites.length) renderDashboard();
    });
    document.getElementById('themeToggle').addEventListener('click', () => {
      currentTheme = currentTheme === 'day' ? 'night' : 'day';
      localStorage.setItem('sitetrace_theme', currentTheme);
      applyTheme();
    });
  }
  applyTheme();
}

if (page === 'home' && ['#pricing', '#api', '#dashboard'].includes(window.location.hash)) {
  window.location.replace(window.location.hash.replace('#', '/'));
}

function applyLanguage() {
  document.documentElement.lang = currentLocale;
  const languageSelect = document.getElementById('languageSelect');
  if (languageSelect) languageSelect.value = currentLocale;

  setText('.nav-links a[href="/pricing"]', t('nav.pricing'));
  setText('.nav-links a[href="/demo"]', t('nav.demo'));
  setText('.nav-links a[href="/api"]', t('nav.how'));
  setText('.nav-links a[href="/dashboard"]', t('nav.dashboard'));
  setText('.nav-links a[href="/signin"]', t('nav.signin'));
  setText('.nav-links a[href="/"]', t('nav.home'));
  setText('#signOutBtn', t('nav.signout'));
  updateAuthNav();

  if (page === 'home') {
    setText('.hero .eyebrow', t('home.eyebrow'));
    setText('.hero h1', t('home.title'));
    setText('.hero .lead', t('home.lead'));
    const urlInput = document.getElementById('urlInput');
    if (urlInput) urlInput.placeholder = t('home.placeholder');
    setText('#analyzeBtn', t('home.button'));
    setAllText('.trust-row .pill', t('home.pills'));
    setText('.panel .panel-top .eyebrow', t('home.previewEyebrow'));
    setText('.panel .panel-top strong', t('home.previewSite'));
    setAllText('.metric-grid .metric span', [t('home.metricResponse'), t('home.metricSsl'), t('home.metricIssues')]);
    setAllText('.panel .check-title', [t('home.checkReachableTitle'), t('home.checkMetaTitle'), t('home.checkSecurityTitle')]);
    setAllText('.panel .check-copy', [t('home.checkReachableCopy'), t('home.checkMetaCopy'), t('home.checkSecurityCopy')]);
    setText('.value-section .section-head .eyebrow', t('home.sectionEyebrow'));
    setText('.value-section .section-head h2', t('home.sectionTitle'));
    setText('.value-section .section-head p:not(.eyebrow)', t('home.sectionCopy'));
    setAllText('.value-section .feature h3', t('home.featureTitles'));
    setAllText('.value-section .feature p', t('home.featureCopy'));
    setText('.agency-section .eyebrow', t('home.agencyEyebrow'));
    setText('.agency-section h2', t('home.agencyTitle'));
    setText('.agency-section .lead', t('home.agencyCopy'));
    setAllText('.agency-section li', t('home.agencyPoints'));
    setText('.conversion-band .eyebrow', t('home.whyEyebrow'));
    setText('.conversion-band h2', t('home.whyTitle'));
    setText('.conversion-band p:not(.eyebrow)', t('home.whyCopy'));
    setText('.conversion-band .button', t('home.plans'));
    setText('.footer .container', t('home.footer'));
  }

  if (page === 'pricing') {
    setText('.section-head h1', t('pricing.title'));
    setText('.section-head p:not(.eyebrow)', t('pricing.lead'));
    document.querySelectorAll('.price').forEach((card, index) => {
      const data = t('pricing.cards')[index];
      if (!data) return;
      setText(`.price:nth-child(${index + 1}) .eyebrow`, data[0]);
      setText(`.price:nth-child(${index + 1}) h3`, data[1]);
      setText(`.price:nth-child(${index + 1}) strong`, data[2]);
      setText(`.price:nth-child(${index + 1}) p:not(.eyebrow)`, data[3]);
      setAllText(`.price:nth-child(${index + 1}) li`, data[4]);
    });
    setAllText('[data-upgrade]', t('pricing.buttons'));
    const note = document.querySelector('.pricing-note');
    if (note) note.innerHTML = `<strong>${escapeHtml(t('pricing.note'))}</strong>${escapeHtml(t('pricing.noteCopy'))}`;
    setText('.plan-divider h2', t('pricing.splitTitle'));
    setText('.plan-divider > div > p', t('pricing.splitCopy'));
    setAllText('.plan-split article:nth-child(1) li', t('pricing.splitFree'));
    setAllText('.plan-split article:nth-child(2) li', t('pricing.splitPaid'));
  }

  if (page === 'demo') {
    setText('.section-head .eyebrow', t('demo.eyebrow'));
    setText('.section-head h1', t('demo.title'));
    setText('.section-head p:not(.eyebrow)', t('demo.lead'));
    renderDemo();
  }

  if (page === 'api') {
    setText('.page-shell .eyebrow', t('api.eyebrow'));
    setText('.page-shell h1', t('api.title'));
    setText('.page-shell .lead', t('api.lead'));
    const groups = document.querySelectorAll('.features.two');
    if (groups[0]) {
      groups[0].querySelectorAll('.feature h3').forEach((element, index) => { element.textContent = t('api.stepTitles')[index] || element.textContent; });
      groups[0].querySelectorAll('.feature p').forEach((element, index) => { element.textContent = t('api.stepCopy')[index] || element.textContent; });
    }
    const sections = document.querySelectorAll('.how-section');
    if (sections[0]) {
      sections[0].querySelector('h2').textContent = t('api.watchTitle');
      sections[0].querySelector('p').textContent = t('api.watchCopy');
    }
    if (groups[1]) {
      groups[1].querySelectorAll('.feature h3').forEach((element, index) => { element.textContent = t('api.watchTitles')[index] || element.textContent; });
      groups[1].querySelectorAll('.feature p').forEach((element, index) => { element.textContent = t('api.watchCopies')[index] || element.textContent; });
    }
    if (sections[1]) {
      sections[1].querySelector('h2').textContent = t('api.maintenanceTitle');
      sections[1].querySelector('p').textContent = t('api.maintenanceCopy');
    }
  }

  if (page === 'dashboard') {
    setText('.dashboard-head .eyebrow', t('dashboard.eyebrow'));
    setText('.dashboard-head h1', t('dashboard.title'));
    setText('.dashboard-head .muted', t('dashboard.lead'));
    const siteName = document.getElementById('siteName');
    if (siteName) siteName.placeholder = t('dashboard.addName');
    setText('#siteForm .button', t('dashboard.addButton'));
    setText('.site-list-panel .panel-top strong', t('dashboard.clientSites'));
    const empty = document.querySelector('#siteDetail.empty-state');
    if (empty) {
      setText('#siteDetail h2', t('dashboard.emptyTitle'));
      setText('#siteDetail p', t('dashboard.emptyCopy'));
    }
  }

  if (page === 'signin') {
    setText('.auth-copy .eyebrow', t('signin.eyebrow'));
    setText('.auth-copy h1', t('signin.title'));
    setText('.auth-copy .lead', t('signin.lead'));
    setText('.auth-form h2', t('signin.formTitle'));
    const password = document.getElementById('authPassword');
    if (password) password.placeholder = t('signin.password');
    setText('#authForm .button[type="submit"]', t('signin.signin'));
    setText('#signUpBtn', t('signin.signup'));
  }

  applyTheme();
}

function authHeaders() {
  return state.session ? { Authorization: `Bearer ${state.session.access_token}` } : {};
}

function statusLabel(level) {
  if (level === 'online') return 'online';
  if (level === 'warning') return 'warning';
  if (level === 'down') return 'down';
  return level || 'pending';
}

function formatDateTime(value) {
  return value ? new Date(value).toLocaleString() : '-';
}

function formatDurationSince(value) {
  if (!value) return currentLocale === 'es' ? 'Sin caidas registradas' : 'No downtime recorded';
  const diff = Math.max(0, Date.now() - new Date(value).getTime());
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return currentLocale === 'es' ? 'Ahora' : 'Just now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

function statusCopy(status) {
  if (currentLocale === 'es') {
    if (status === 'online') return 'Saludable ahora';
    if (status === 'warning') return 'Problema silencioso';
    if (status === 'down') return 'Requiere accion';
    if (status === 'maintenance') return 'Ventana de mantenimiento';
    return 'Esperando primer check';
  }
  if (status === 'online') return 'Healthy right now';
  if (status === 'warning') return 'Silent issue found';
  if (status === 'down') return 'Action needed';
  if (status === 'maintenance') return 'Maintenance window';
  return 'Waiting for first check';
}

function normalizePublicUrl(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function uptimePercent(checks) {
  const counted = checks.filter((check) => ['online', 'warning', 'down'].includes(check.status));
  if (!counted.length) return '-';
  const up = counted.filter((check) => check.status === 'online' || check.status === 'warning').length;
  return `${((up / counted.length) * 100).toFixed(1)}%`;
}

function boolValue(value, fallback = true) {
  return value === undefined || value === null ? fallback : Boolean(value);
}

function planUpgradeTarget() {
  if (state.plan === 'free') return 'starter';
  if (state.plan === 'starter') return 'agency';
  return '';
}

function hasFeature(name) {
  return Boolean(state.features && state.features[name]);
}

async function startUpgrade(plan) {
  if (!plan) return;
  const response = await fetch(apiPath('/billing/create-checkout-session'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ plan })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || 'Billing is not configured');
  window.location.href = data.url;
}

function renderPlanUsage() {
  const target = document.getElementById('planUsagePanel');
  if (!target || !state.limits || !state.usage) return;
  const used = Number(state.usage.sites || state.sites.length || 0);
  const max = Number.isFinite(Number(state.limits.sites)) ? Number(state.limits.sites) : 0;
  const interval = Number(state.limits.interval_minutes || 60);
  const reached = used >= max;
  const upgrade = planUpgradeTarget();
  const cadence = interval > 0 ? `${interval}m checks` : t('dashboard.freeScanOnly');
  target.innerHTML = `
    <div class="plan-usage ${reached ? 'limit' : ''}">
      <div>
        <strong>${escapeHtml(t('dashboard.planUsage'))}</strong>
        <span>${escapeHtml(state.plan)} - ${used}/${max} ${escapeHtml(t('dashboard.sites').toLowerCase())} - ${escapeHtml(cadence)}</span>
      </div>
      ${upgrade ? `<button class="button small secondary" type="button" data-dashboard-upgrade="${upgrade}">${escapeHtml(upgrade === 'starter' ? t('dashboard.upgradeStarter') : t('dashboard.upgradeAgency'))}</button>` : ''}
    </div>
    ${reached && upgrade ? `<div class="message error">${escapeHtml(t('dashboard.limitReached'))} ${escapeHtml(t('dashboard.upgradePrompt'))}</div>` : ''}`;
}

function renderPaidFeaturePanel() {
  const target = document.getElementById('paidFeaturePanel');
  if (!target) return;
  if (hasFeature('monitored_sites')) {
    target.innerHTML = '';
    return;
  }
  const items = t('dashboard.paidFeatureItems').map((item) => `<span>${escapeHtml(item)}</span>`).join('');
  target.innerHTML = `
    <div class="paid-lock">
      <div>
        <p class="eyebrow compact">${escapeHtml(t('dashboard.freeScanOnly'))}</p>
        <h3>${escapeHtml(t('dashboard.paidFeaturesTitle'))}</h3>
        <p>${escapeHtml(t('dashboard.paidFeaturesCopy'))}</p>
        <div class="summary-pills">${items}</div>
      </div>
      <button class="button" type="button" data-dashboard-upgrade="starter">${escapeHtml(t('dashboard.upgradeStarter'))}</button>
    </div>`;
}

function domainExpiryLabel(domainExpiry) {
  if (!domainExpiry || domainExpiry.days_remaining === null || domainExpiry.days_remaining === undefined) return t('dashboard.domainUnknown');
  return `${domainExpiry.days_remaining}d`;
}

async function initSupabase() {
  if (supabaseInitPromise) return supabaseInitPromise;
  supabaseInitPromise = initSupabaseOnce();
  return supabaseInitPromise;
}

async function initSupabaseOnce() {
  if (!window.supabase) return;
  state.config = await fetch(apiPath('/config')).then((res) => res.json());
  if (state.config.supabase_url && state.config.supabase_anon_key) {
    state.supabase = window.supabase.createClient(state.config.supabase_url, state.config.supabase_anon_key);
    const { data } = await state.supabase.auth.getSession();
    state.session = data.session;
    state.supabase.auth.onAuthStateChange((event, session) => {
      state.session = session;
      updateAuthNav();
      if (page === 'dashboard') loadDashboard();
    });
  }
}

function renderResults(data) {
  const target = document.getElementById('results');
  if (!target) return;

  const checks = Array.isArray(data.checks) ? data.checks : [];
  const failCount = checks.filter((check) => check.level === 'fail').length;
  const warningCount = checks.filter((check) => check.level === 'warning').length;
  const sorted = [...checks].sort((a, b) => ({ fail: 0, warning: 1, pass: 2 }[a.level] - { fail: 0, warning: 1, pass: 2 }[b.level]));
  const score = Number(data.score || data.seo_score || 0);
  const topIssues = sorted.filter((check) => check.level !== 'pass').slice(0, 3);
  const grouped = ['uptime', 'seo', 'security', 'domain', 'content'].map((category) => {
    const categoryChecks = sorted.filter((check) => check.category === category);
    if (!categoryChecks.length) return '';
    return `<div class="result-category"><div class="result-category-head"><strong>${escapeHtml(category)}</strong><span>${categoryChecks.filter((check) => check.level !== 'pass').length} issues</span></div>${categoryChecks.map((check) => `<div class="check compact-check"><span class="dot ${check.level === 'pass' ? '' : check.level}"></span><div><p class="check-title">${escapeHtml(check.title)} <span class="level-badge ${check.level}">${escapeHtml(check.level)}</span></p><p class="check-copy">${escapeHtml(check.description)}</p><p class="check-copy"><strong>Fix:</strong> ${escapeHtml(check.recommendation)}</p></div><span class="check-value">${escapeHtml(check.value)}</span></div>`).join('')}</div>`;
  }).join('');
  const topIssueHtml = topIssues.length
    ? topIssues.map((check) => `<div class="priority-item"><span class="level-badge ${check.level}">${escapeHtml(check.level)}</span><div><strong>${escapeHtml(check.title)}</strong><p>${escapeHtml(check.recommendation)}</p></div></div>`).join('')
    : '<div class="priority-item"><span class="level-badge pass">pass</span><div><strong>No critical fixes found</strong><p>Keep monitoring for silent changes over time.</p></div></div>';
  const domainDays = data.domain_expiry && data.domain_expiry.days_remaining !== null && data.domain_expiry.days_remaining !== undefined ? `${data.domain_expiry.days_remaining}d` : '-';
  const pageSizeKb = data.page_size_bytes ? `${Math.round(Number(data.page_size_bytes) / 1024)}KB` : '-';

  const reportText = encodeURIComponent(reportSummaryFromAnalysis(data));
  target.innerHTML = `<div class="result-shell result-report"><div class="panel-top"><div><p class="eyebrow compact">Website health report</p><strong>${escapeHtml(data.final_url || data.analyzed_url)}</strong></div><div class="result-actions"><button class="button small secondary" type="button" data-share-report="${reportText}">${escapeHtml(t('common.shareReport'))}</button><div class="score-ring" style="background:conic-gradient(var(--green) 0 ${score}%, rgba(255,255,255,.14) ${score}% 100%);"><span>${score}</span></div></div></div><div class="metric-grid report-metrics"><div class="metric"><strong>${score}/100</strong><span>Health score</span></div><div class="metric"><strong>${escapeHtml(data.response_time)}</strong><span>Response time</span></div><div class="metric"><strong>${domainDays}</strong><span>Domain expiry</span></div><div class="metric"><strong>${pageSizeKb}</strong><span>Page size</span></div><div class="metric"><strong>${failCount}</strong><span>Critical</span></div><div class="metric"><strong>${warningCount}</strong><span>Warnings</span></div></div><div class="result-summary-grid"><section class="priority-panel"><p class="eyebrow compact">Top fixes</p>${topIssueHtml}</section><section class="priority-panel"><p class="eyebrow compact">What was checked</p><div class="summary-pills"><span>${checks.filter((check) => check.category === 'uptime').length} uptime</span><span>${checks.filter((check) => check.category === 'seo').length} SEO</span><span>${checks.filter((check) => check.category === 'security').length} security</span><span>${checks.filter((check) => check.category === 'domain').length} domain</span><span>${checks.filter((check) => check.category === 'content').length} content</span></div></section></div><div class="result-categories">${grouped}</div></div>`;
  target.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderLoadingSteps() {
  const target = document.getElementById('results');
  if (!target) return () => {};
  const steps = ['Connecting to site', 'Checking server response', 'Reading metadata', 'Inspecting SEO basics', 'Checking SSL and domain expiry', 'Building report'];
  let index = 0;
  const draw = () => {
    target.innerHTML = `<div class="result-shell loading-report"><div class="panel-top"><strong>Building your website health report...</strong></div><div class="scan-steps">${steps.map((step, stepIndex) => `<div class="scan-step ${stepIndex < index ? 'done' : stepIndex === index ? 'active' : ''}"><span>${stepIndex < index ? 'OK' : stepIndex + 1}</span><strong>${step}</strong></div>`).join('')}</div></div>`;
  };
  draw();
  const timer = window.setInterval(() => {
    index = Math.min(index + 1, steps.length - 1);
    draw();
  }, 550);
  return () => window.clearInterval(timer);
}

function renderError(message) {
  const target = document.getElementById('results') || document.getElementById('pageMessage') || document.getElementById('siteDetail');
  if (target) target.innerHTML = `<div class="empty">${escapeHtml(message)}</div>`;
}

function setDashboardMessage(message, tone = '') {
  const target = document.getElementById('dashboardMessage');
  if (!target) return;
  target.className = `message ${tone}`.trim();
  target.textContent = message || '';
}

function initAnalyzer() {
  const form = document.getElementById('analyzeForm');
  if (!form) return;
  const input = document.getElementById('urlInput');
  const button = document.getElementById('analyzeBtn');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const url = input.value.trim();
    if (!url) return renderError('Enter a website URL first.');
    button.disabled = true;
    const stopLoading = renderLoadingSteps();
    try {
      const response = await fetch(apiPath('/analyze'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url, locale: currentLocale }) });
      const data = await response.json();
      stopLoading();
      if (!response.ok || data.status === 'error') renderError(data.message || 'Analysis failed');
      else renderResults(data);
    } catch (error) {
      stopLoading();
      renderError(error.message || 'Analysis failed');
    } finally {
      button.disabled = false;
    }
  });
  document.getElementById('results').addEventListener('click', async (event) => {
    const button = event.target.closest('[data-share-report]');
    if (!button) return;
    try {
      await copyToClipboard(decodeURIComponent(button.dataset.shareReport));
      button.textContent = t('common.copied');
      window.setTimeout(() => { button.textContent = t('common.shareReport'); }, 2200);
    } catch (error) {
      button.textContent = t('common.copyFailed');
    }
  });
}

async function initAuth() {
  const form = document.getElementById('authForm');
  if (!form) return;
  await initSupabase();
  const message = document.getElementById('authMessage');
  const submitButton = form.querySelector('button[type="submit"]');
  const signUpButton = document.getElementById('signUpBtn');

  function setAuthBusy(isBusy) {
    if (submitButton) submitButton.disabled = isBusy;
    if (signUpButton) signUpButton.disabled = isBusy;
  }

  if (!state.supabase) {
    message.textContent = 'Supabase is not configured yet.';
    return;
  }

  if (state.session) {
    message.textContent = 'Opening dashboard...';
    setAuthBusy(true);
    window.location.replace('/dashboard');
    return;
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = normalizeEmail(document.getElementById('authEmail').value);
    const password = document.getElementById('authPassword').value;
    message.textContent = 'Signing in...';
    setAuthBusy(true);
    try {
      const { data, error } = await state.supabase.auth.signInWithPassword({ email, password });
      if (error) {
        message.textContent = error.message;
        return;
      }
      state.session = data.session;
      message.textContent = 'Opening dashboard...';
      window.location.replace('/dashboard');
    } finally {
      setAuthBusy(false);
    }
  });

  signUpButton.addEventListener('click', async () => {
    const email = normalizeEmail(document.getElementById('authEmail').value);
    const password = document.getElementById('authPassword').value;
    message.textContent = 'Creating account...';
    setAuthBusy(true);
    try {
      const { error } = await state.supabase.auth.signUp({ email, password });
      message.textContent = error ? error.message : 'Account created. You can sign in now.';
    } finally {
      setAuthBusy(false);
    }
  });
}

async function loadDashboard() {
  const setupWarning = document.getElementById('setupWarning');
  const authRequired = document.getElementById('authRequired');
  const dashboardView = document.getElementById('dashboardView');
  if (!dashboardView) return;

  if (!state.config) await initSupabase();
  const configured = Boolean(state.supabase);
  setupWarning.classList.toggle('hidden', configured);
  authRequired.classList.toggle('hidden', !configured || Boolean(state.session));
  dashboardView.classList.toggle('hidden', !configured || !state.session);

  const signOut = document.getElementById('signOutBtn');
  if (signOut) signOut.classList.toggle('hidden', !state.session);
  if (!configured || !state.session) return;

  const me = await fetch(apiPath('/api/me'), { headers: authHeaders() }).then((res) => res.json());
  state.profile = me.profile;
  state.plan = me.plan || (me.profile && me.profile.plan) || 'free';
  state.limits = me.limits || (state.config && state.config.plans && state.config.plans[state.plan]) || null;
  state.features = me.features || (state.config && state.config.plans && state.config.plans[state.plan] && state.config.plans[state.plan].features) || null;
  state.usage = me.usage || null;
  const { data: sites, error } = await state.supabase.from('sites').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  state.sites = sites || [];
  if (!state.selectedSiteId && state.sites.length) state.selectedSiteId = state.sites[0].id;
  if (state.selectedSiteId && !state.sites.some((site) => site.id === state.selectedSiteId)) {
    state.selectedSiteId = state.sites.length ? state.sites[0].id : null;
  }
  if (state.selectedSiteId) await loadSelectedChecks();
  renderDashboard();
}

function renderAlertStatus() {
  const target = document.getElementById('alertStatusPanel');
  if (!target || !state.config) return;
  const profileEmail = state.profile && state.profile.email ? state.profile.email : state.session.user.email;
  const labels = t('dashboard.alerts');
  const values = t('dashboard.alertValues');
  const items = [
    { label: labels[0], value: state.config.email_alerts_enabled ? values.configured : values.notConfigured, ok: state.config.email_alerts_enabled },
    { label: labels[1], value: state.config.alert_from_email || '-', ok: state.config.email_alerts_enabled },
    { label: labels[2], value: profileEmail || '-', ok: Boolean(profileEmail) },
    { label: labels[3], value: state.config.delivery_lookup_configured ? values.readKey : values.sendOnly, ok: state.config.delivery_lookup_configured },
    { label: labels[4], value: state.config.slack_alerts_enabled ? values.configured : values.optional, ok: state.config.slack_alerts_enabled },
    { label: labels[5], value: state.config.teams_alerts_enabled ? values.configured : values.optional, ok: state.config.teams_alerts_enabled }
  ];
  target.innerHTML = items.map((item) => `<div class="alert-status-card"><span class="dot ${item.ok ? '' : 'pending'}"></span><div><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.value)}</small></div></div>`).join('');
}

function renderDashboard() {
  setText('.dashboard-grid .dash-card:nth-child(1) .muted', t('dashboard.plan'));
  setText('.dashboard-grid .dash-card:nth-child(2) .muted', t('dashboard.sites'));
  setText('.dashboard-grid .dash-card:nth-child(3) .muted', t('dashboard.lastCheck'));
  document.getElementById('planValue').textContent = state.plan || (state.profile ? state.profile.plan : 'free');
  document.getElementById('siteCount').textContent = state.sites.length;
  const lastSite = state.sites.find((site) => site.last_checked_at);
  document.getElementById('lastCheckValue').textContent = lastSite ? new Date(lastSite.last_checked_at).toLocaleDateString() : '-';
  renderAlertStatus();
  renderPlanUsage();
  renderPaidFeaturePanel();
  const testEmail = document.getElementById('testEmailBtn');
  if (testEmail) testEmail.disabled = !hasFeature('email_alerts');
  const form = document.getElementById('siteForm');
  if (form) {
    form.querySelectorAll('input, button').forEach((element) => {
      element.disabled = !hasFeature('monitored_sites');
    });
  }
  const list = document.getElementById('sitesList');
  const listCount = document.getElementById('siteListCount');
  if (listCount) listCount.textContent = state.sites.length;
  if (!state.sites.length) {
    list.innerHTML = `<div class="empty">${escapeHtml(t('dashboard.noSites'))}</div>`;
    renderSiteDetail(null);
    return;
  }
  list.innerHTML = state.sites.map((site) => {
    const active = site.id === state.selectedSiteId ? ' active' : '';
    const status = statusLabel(site.last_status);
    return `<button class="site-list-item${active}" type="button" data-select="${site.id}"><span class="dot ${status === 'online' ? '' : status}"></span><span><strong>${escapeHtml(site.name)}</strong><small>${escapeHtml(site.url)}</small></span><em class="level-badge ${status}">${escapeHtml(localizedStatus(status))}</em></button>`;
  }).join('');
  renderSiteDetail(state.sites.find((site) => site.id === state.selectedSiteId));
}

async function runSiteCheck(siteId) {
  const detail = document.getElementById('siteDetail');
  if (detail) detail.classList.add('is-loading');
  setDashboardMessage(t('dashboard.running'));
  const response = await fetch(apiPath('/api/run-site-check'), { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify({ site_id: siteId, locale: currentLocale }) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || 'Check failed');
  const emailResult = data.incident && data.incident.notifications && data.incident.notifications.email;
  await loadDashboard();
  if (emailResult && emailResult.sent) {
    setDashboardMessage(t('dashboard.emailSent'), 'success');
  } else if (emailResult && !emailResult.sent) {
    setDashboardMessage(`${t('dashboard.emailNotSent')} ${emailResult.reason || 'unknown error'}`, 'error');
  } else if (data.incident && data.incident.pending_confirmation) {
    setDashboardMessage(t('dashboard.pendingIncident'));
  } else {
    setDashboardMessage(t('dashboard.completed'));
  }
}

async function testAlertEmail() {
  const button = document.getElementById('testEmailBtn');
  if (button) button.disabled = true;
  setDashboardMessage(t('dashboard.sendingTest'));
  try {
    const response = await fetch(apiPath('/api/test-alert-email'), { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() } });
    const data = await response.json();
    if (!response.ok || data.status === 'error') {
      const reason = data.email && data.email.reason ? `: ${data.email.reason}` : '';
      throw new Error(`${data.message || 'Test email failed'}${reason}`);
    }
    const emailId = data.email && data.email.id ? data.email.id : '';
    const event = data.delivery && data.delivery.last_event ? ` Event: ${data.delivery.last_event}.` : '';
    setDashboardMessage(`Test email sent to ${data.to}. Resend id: ${emailId || 'created'}.${event || ' Checking delivery status...'}`, 'success');
    if (emailId) {
      pollEmailStatus(emailId, data.to);
    }
  } catch (error) {
    setDashboardMessage(error.message || 'Test email failed', 'error');
  } finally {
    if (button) button.disabled = false;
  }
}

function deliverySummary(delivery) {
  if (!delivery) return '';
  if (delivery.last_event) return `Event: ${delivery.last_event}.`;
  if (delivery.error) {
    const restricted = String(delivery.error).includes('restricted_api_key') || String(delivery.error).includes('only send emails');
    if (restricted) return 'Delivery status unavailable: Resend API key is send-only.';
    return `Delivery lookup error: ${delivery.error}`;
  }
  return 'Delivery lookup returned no event yet.';
}

function pollEmailStatus(emailId, to) {
  [5000, 15000, 30000].forEach((delay) => {
    window.setTimeout(async () => {
      try {
        const statusResponse = await fetch(apiPath(`/api/email-status/${emailId}`), { headers: authHeaders() });
        const statusData = await statusResponse.json();
        if (!statusResponse.ok || statusData.status === 'error') {
          const summary = deliverySummary(statusData.delivery);
          setDashboardMessage(`Test email sent to ${to}. Resend id: ${emailId}. ${summary || 'Could not read delivery status.'}`, 'error');
          return;
        }
        setDashboardMessage(`Test email sent to ${to}. Resend id: ${emailId}. ${deliverySummary(statusData.delivery)}`, 'success');
      } catch (error) {
        setDashboardMessage(`Test email sent to ${to}. Resend id: ${emailId}. Delivery status check failed: ${error.message}`, 'error');
      }
    }, delay);
  });
}

async function loadSelectedChecks() {
  if (!state.selectedSiteId) {
    state.selectedChecks = [];
    return;
  }
  const { data, error } = await state.supabase.from('checks').select('*').eq('site_id', state.selectedSiteId).order('created_at', { ascending: false }).limit(50);
  if (error) throw error;
  state.selectedChecks = data || [];
}

async function showHistory(siteId) {
  const { data, error } = await state.supabase.from('checks').select('*').eq('site_id', siteId).order('created_at', { ascending: false }).limit(10);
  if (error) throw error;
  const history = document.getElementById('siteDetail');
  if (!data.length) {
    history.innerHTML = `<div class="empty">${escapeHtml(t('dashboard.noHistory'))}</div>`;
    return;
  }
  history.innerHTML = `<div class="check-list">${data.map((check) => `<div class="check"><span class="dot ${check.status}"></span><div><p class="check-title">${new Date(check.created_at).toLocaleString()} <span class="level-badge ${check.status}">${escapeHtml(check.status)}</span></p><p class="check-copy">${check.score || '-'} / 100 - ${check.response_time_ms || '-'}ms - HTTP ${check.status_code || '-'}</p></div><span class="check-value">${escapeHtml(check.result && check.result.page_context)}</span></div>`).join('')}</div>`;
}

const demoSites = [
  {
    name: 'Northstar Dental',
    url: 'https://northstar-dental.example',
    status: 'online',
    score: 94,
    response: 286,
    lastCheck: '4m',
    issues: [
      ['warning', 'Open Graph image missing', 'Shared links work, but the preview could look stronger for campaigns.'],
      ['warning', 'CSP header missing', 'Add a basic Content Security Policy to improve the security baseline.']
    ],
    history: ['online', 'online', 'online', 'online', 'warning', 'online', 'online', 'online']
  },
  {
    name: 'Atlas Roofing',
    url: 'https://atlas-roofing.example',
    status: 'warning',
    score: 71,
    response: 1840,
    lastCheck: '7m',
    issues: [
      ['warning', 'Homepage response slowed down', 'The site is online, but a slower homepage can reduce leads from mobile visitors.'],
      ['fail', 'Required phrase missing', 'The monitored phrase "emergency roof repair" disappeared from the landing page.'],
      ['warning', 'Meta description too short', 'Rewrite the snippet so searchers understand the offer before they click.']
    ],
    history: ['online', 'online', 'warning', 'warning', 'online', 'warning', 'warning', 'warning']
  },
  {
    name: 'Luma Studio',
    url: 'https://luma-studio.example',
    status: 'down',
    score: 18,
    response: null,
    lastCheck: '2m',
    issues: [
      ['fail', 'Server error detected', 'The homepage returned a server error and needs immediate attention.'],
      ['fail', 'Client status page updated', 'The public status view shows an active incident while the team investigates.']
    ],
    history: ['online', 'online', 'warning', 'down', 'down', 'down', 'warning', 'down']
  }
];

function renderDemo(selectedIndex = 0) {
  const root = document.getElementById('demoRoot');
  if (!root) return;
  const selected = demoSites[selectedIndex] || demoSites[0];
  const issueHtml = selected.issues.map((issue) => `<div class="check compact-check"><span class="dot ${issue[0]}"></span><div><p class="check-title">${escapeHtml(issue[1])} <span class="level-badge ${issue[0]}">${escapeHtml(issue[0])}</span></p><p class="check-copy">${escapeHtml(issue[2])}</p></div></div>`).join('');
  const historyHtml = selected.history.map((status) => `<span class="uptime-bar ${statusLabel(status)}" title="${escapeHtml(localizedStatus(status))}"></span>`).join('');
  root.innerHTML = `
    <div class="demo-layout">
      <aside class="site-list-panel demo-list">
        <div class="panel-top compact-panel"><strong>${escapeHtml(t('demo.select'))}</strong></div>
        <div class="site-list">
          ${demoSites.map((site, index) => `<button class="site-list-item${index === selectedIndex ? ' active' : ''}" type="button" data-demo-site="${index}"><span class="dot ${site.status === 'online' ? '' : site.status}"></span><span><strong>${escapeHtml(site.name)}</strong><small>${escapeHtml(site.url)}</small></span><em class="level-badge ${site.status}">${escapeHtml(localizedStatus(site.status))}</em></button>`).join('')}
        </div>
      </aside>
      <section class="site-detail-panel">
        <div class="site-detail">
          <div class="detail-hero">
            <div><p class="eyebrow compact">${escapeHtml(t('demo.current'))}</p><h2>${escapeHtml(selected.name)}</h2><p class="muted">${escapeHtml(selected.url)}</p></div>
            <span class="status-pill ${selected.status}"><span class="dot ${selected.status === 'online' ? '' : selected.status}"></span>${escapeHtml(statusCopy(selected.status))}</span>
          </div>
          <div class="detail-metrics">
            <div class="dash-card"><span class="muted">${escapeHtml(t('demo.score'))}</span><h3>${selected.score}/100</h3></div>
            <div class="dash-card"><span class="muted">${escapeHtml(t('demo.response'))}</span><h3>${selected.response ? `${selected.response}ms` : '-'}</h3></div>
            <div class="dash-card"><span class="muted">${escapeHtml(t('demo.lastCheck'))}</span><h3>${escapeHtml(selected.lastCheck)}</h3></div>
          </div>
          <div class="uptime-strip">${historyHtml}</div>
          <div class="detail-grid">
            <div class="panel flat-panel"><div class="panel-top"><strong>${escapeHtml(t('demo.issues'))}</strong></div><div class="check-list">${issueHtml}</div></div>
            <div class="panel flat-panel"><div class="panel-top"><strong>${escapeHtml(t('demo.history'))}</strong></div><div class="timeline">${selected.history.map((status, index) => `<div class="timeline-row"><span class="dot ${status === 'online' ? '' : status}"></span><div><strong>${escapeHtml(localizedStatus(status))}</strong><small>${index + 1} ${currentLocale === 'es' ? 'check reciente' : 'recent check'}</small></div></div>`).join('')}</div></div>
          </div>
        </div>
      </section>
    </div>
    <div class="conversion-band demo-cta">
      <div><p class="eyebrow">${escapeHtml(t('demo.ctaTitle'))}</p><p>${escapeHtml(t('demo.ctaCopy'))}</p></div>
      <a class="button secondary" href="/pricing">${escapeHtml(t('demo.ctaButton'))}</a>
    </div>`;
}

function initDemo() {
  if (page !== 'demo') return;
  renderDemo();
  document.getElementById('demoRoot').addEventListener('click', (event) => {
    const button = event.target.closest('[data-demo-site]');
    if (button) renderDemo(Number(button.dataset.demoSite));
  });
}

function renderSiteDetail(site) {
  const detail = document.getElementById('siteDetail');
  if (!detail) return;
  detail.classList.remove('empty-state', 'is-loading');
  if (!site) {
    detail.classList.add('empty-state');
    detail.innerHTML = `<h2>${escapeHtml(t('dashboard.emptyTitle'))}</h2><p>${escapeHtml(t('dashboard.emptyCopy'))}</p>`;
    return;
  }

  const checks = state.selectedChecks || [];
  const latest = checks[0];
  const lastDown = checks.find((check) => check.status === 'down');
  const incidents = checks.filter((check) => check.status === 'down').length;
  const warnings = checks.filter((check) => check.status === 'warning').length;
  const averageResponse = checks.filter((check) => Number(check.response_time_ms) > 0);
  const avgMs = averageResponse.length
    ? `${Math.round(averageResponse.reduce((sum, check) => sum + Number(check.response_time_ms || 0), 0) / averageResponse.length)}ms`
    : '-';
  const status = statusLabel(site.last_status);
  const latestResult = latest && latest.result ? latest.result : null;
  const domainExpiry = latestResult && latestResult.domain_expiry ? latestResult.domain_expiry : null;
  const importantChecks = latestResult && Array.isArray(latestResult.checks)
    ? latestResult.checks.filter((check) => check.level !== 'pass').slice(0, 5)
    : [];

  const issueHtml = importantChecks.length
    ? importantChecks.map((check) => `<div class="check compact-check"><span class="dot ${check.level}"></span><div><p class="check-title">${escapeHtml(check.title)} <span class="level-badge ${check.level}">${escapeHtml(check.level)}</span></p><p class="check-copy">${escapeHtml(check.recommendation)}</p></div><span class="check-value">${escapeHtml(check.value)}</span></div>`).join('')
    : `<div class="empty subtle">${escapeHtml(t('dashboard.noIssues'))}</div>`;

  const historyHtml = checks.length
    ? checks.slice(0, 12).map((check) => `<div class="timeline-row"><span class="dot ${check.status === 'online' ? '' : check.status}"></span><div><strong>${escapeHtml(localizedStatus(check.status))}</strong><small>${formatDateTime(check.created_at)} - ${check.score || '-'} / 100 - ${check.response_time_ms || '-'}ms - HTTP ${check.status_code || 'unreachable'}</small></div></div>`).join('')
    : `<div class="empty subtle">${escapeHtml(t('dashboard.firstCheck'))}</div>`;
  const bars = checks.slice(0, 24).reverse().map((check) => `<span class="uptime-bar ${statusLabel(check.status)}" title="${escapeHtml(check.status)} ${formatDateTime(check.created_at)}"></span>`).join('');
  const publicUrl = site.public_slug ? `${window.location.origin}/status/${site.public_slug}` : '';
  const reportText = encodeURIComponent(reportSummaryFromSite(site, checks));
  const alertsLocked = !hasFeature('email_alerts');
  const statusLocked = !hasFeature('status_pages');
  const reportLocked = !hasFeature('client_reports');

  detail.innerHTML = `
    <div class="detail-hero">
      <div>
        <p class="eyebrow compact">${escapeHtml(t('dashboard.monitorEyebrow'))}</p>
        <h2>${escapeHtml(site.name)}</h2>
        <p class="muted">${escapeHtml(site.url)}</p>
      </div>
      <span class="status-pill ${status}"><span class="dot ${status === 'online' ? '' : status}"></span>${escapeHtml(statusCopy(status))}</span>
    </div>
    <div class="detail-actions">
      <button class="button" type="button" data-run="${site.id}">${escapeHtml(t('dashboard.runCheck'))}</button>
      <button class="button secondary" type="button" ${reportLocked ? 'data-dashboard-upgrade="starter"' : `data-copy-client-report="${reportText}"`}>${escapeHtml(reportLocked ? t('dashboard.lockedForPlan') : t('common.copyReport'))}</button>
      <button class="button secondary" type="button" data-refresh-detail="${site.id}">${escapeHtml(t('dashboard.refresh'))}</button>
      <button class="button danger" type="button" data-delete="${site.id}">${escapeHtml(t('dashboard.delete'))}</button>
    </div>
    <div class="detail-metrics">
      <div class="dash-card"><span class="muted">${escapeHtml(t('dashboard.currentHealth'))}</span><h3>${escapeHtml(localizedStatus(status))}</h3></div>
      <div class="dash-card"><span class="muted">${escapeHtml(t('dashboard.uptimeSample'))}</span><h3>${uptimePercent(checks)}</h3></div>
      <div class="dash-card"><span class="muted">${escapeHtml(t('dashboard.healthScore'))}</span><h3>${site.last_score ? `${site.last_score}/100` : '-'}</h3></div>
      <div class="dash-card"><span class="muted">${escapeHtml(t('dashboard.domainExpiry'))}</span><h3>${escapeHtml(domainExpiryLabel(domainExpiry))}</h3></div>
      <div class="dash-card"><span class="muted">${escapeHtml(t('demo.response'))}</span><h3>${site.last_response_time_ms ? `${site.last_response_time_ms}ms` : '-'}</h3></div>
      <div class="dash-card"><span class="muted">${escapeHtml(t('dashboard.avgResponse'))}</span><h3>${avgMs}</h3></div>
      <div class="dash-card"><span class="muted">${escapeHtml(t('dashboard.lastCheck'))}</span><h3>${formatDurationSince(site.last_checked_at)}</h3></div>
      <div class="dash-card"><span class="muted">${escapeHtml(t('dashboard.sinceDown'))}</span><h3>${formatDurationSince(lastDown && lastDown.created_at)}</h3></div>
      <div class="dash-card"><span class="muted">${escapeHtml(t('dashboard.recentIncidents'))}</span><h3>${incidents} down - ${warnings} warn</h3></div>
    </div>
    <div class="uptime-strip">${bars || '<span class="muted">No uptime samples yet.</span>'}</div>
    <form class="monitor-settings" id="monitorSettingsForm">
      <div class="settings-head"><strong>${escapeHtml(t('dashboard.settings'))}</strong><span class="muted">${escapeHtml(t('dashboard.settingsCopy'))}</span></div>
      <label><span>${escapeHtml(t('dashboard.keyword'))}</span><input id="keywordInput" type="text" value="${escapeHtml(site.keyword || '')}" placeholder="${escapeHtml(t('dashboard.keywordPlaceholder'))}"></label>
      <label><span>${escapeHtml(t('dashboard.maintenanceStart'))}</span><input id="maintenanceStartInput" type="datetime-local" value="${site.maintenance_starts_at ? new Date(site.maintenance_starts_at).toISOString().slice(0,16) : ''}"></label>
      <label><span>${escapeHtml(t('dashboard.maintenanceEnd'))}</span><input id="maintenanceEndInput" type="datetime-local" value="${site.maintenance_ends_at ? new Date(site.maintenance_ends_at).toISOString().slice(0,16) : ''}"></label>
      <label class="toggle-row ${alertsLocked ? 'locked-control' : ''}"><input id="emailAlertsInput" type="checkbox" ${boolValue(site.email_alerts_enabled) ? 'checked' : ''} ${alertsLocked ? 'disabled' : ''}><span>${escapeHtml(t('dashboard.emailAlerts'))}</span></label>
      <label class="toggle-row ${alertsLocked ? 'locked-control' : ''}"><input id="alertDownInput" type="checkbox" ${boolValue(site.alert_on_down) ? 'checked' : ''} ${alertsLocked ? 'disabled' : ''}><span>${escapeHtml(t('dashboard.alertDown'))}</span></label>
      <label class="toggle-row ${alertsLocked ? 'locked-control' : ''}"><input id="alertWarningInput" type="checkbox" ${boolValue(site.alert_on_warning) ? 'checked' : ''} ${alertsLocked ? 'disabled' : ''}><span>${escapeHtml(t('dashboard.alertWarning'))}</span></label>
      <label class="toggle-row ${alertsLocked ? 'locked-control' : ''}"><input id="alertRecoveryInput" type="checkbox" ${boolValue(site.alert_on_recovery) ? 'checked' : ''} ${alertsLocked ? 'disabled' : ''}><span>${escapeHtml(t('dashboard.alertRecovery'))}</span></label>
      <label class="toggle-row ${statusLocked ? 'locked-control' : ''}"><input id="statusPageInput" type="checkbox" ${site.status_page_enabled ? 'checked' : ''} ${statusLocked ? 'disabled' : ''}><span>${escapeHtml(t('dashboard.statusPage'))}</span></label>
      ${alertsLocked ? `<div class="locked-note">${escapeHtml(t('dashboard.lockedAlerts'))}</div>` : ''}
      ${statusLocked ? `<div class="locked-note">${escapeHtml(t('dashboard.lockedStatusPage'))}</div>` : ''}
      ${publicUrl && site.status_page_enabled ? `<a class="status-link" href="${publicUrl}" target="_blank" rel="noopener">${escapeHtml(publicUrl)}</a>` : ''}
      <button class="button secondary" type="submit">${escapeHtml(t('dashboard.save'))}</button>
    </form>
    <div class="detail-grid">
      <div class="panel flat-panel"><div class="panel-top"><strong>${escapeHtml(t('dashboard.latestIssues'))}</strong></div><div class="check-list">${issueHtml}</div></div>
      <div class="panel flat-panel"><div class="panel-top"><strong>${escapeHtml(t('dashboard.recentChecks'))}</strong></div><div class="timeline">${historyHtml}</div></div>
    </div>`;
}

async function initDashboard() {
  if (page !== 'dashboard') return;
  await loadDashboard();
  document.getElementById('refreshDashboardBtn').addEventListener('click', loadDashboard);
  document.getElementById('testEmailBtn').addEventListener('click', testAlertEmail);
  document.querySelector('.dashboard-main').addEventListener('click', async (event) => {
    const button = event.target.closest('[data-dashboard-upgrade]');
    if (!button) return;
    try {
      await startUpgrade(button.dataset.dashboardUpgrade);
    } catch (error) {
      setDashboardMessage(error.message, 'error');
    }
  });
  document.getElementById('signOutBtn').addEventListener('click', async () => {
    if (state.supabase) await state.supabase.auth.signOut();
    window.location.href = '/signin';
  });
  document.getElementById('siteForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!hasFeature('monitored_sites')) {
      setDashboardMessage(t('dashboard.monitoringUnavailable'), 'error');
      return;
    }
    const siteUrl = normalizePublicUrl(document.getElementById('siteUrl').value);
    if (!siteUrl) {
      document.getElementById('siteDetail').innerHTML = `<div class="empty">${escapeHtml(t('dashboard.enterUrl'))}</div>`;
      return;
    }
    const payload = {
      name: document.getElementById('siteName').value,
      url: siteUrl,
      monitoring_enabled: true
    };
    const response = await fetch(apiPath('/api/sites'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(payload)
    });
    const created = await response.json();
    if (!response.ok) throw new Error(created.message || 'Could not add monitor');
    if (created.plan) state.plan = created.plan;
    if (created.limits) state.limits = created.limits;
    if (created.features) state.features = created.features;
    if (created.usage) state.usage = created.usage;
    event.target.reset();
    await loadDashboard();
    document.getElementById('siteDetail').insertAdjacentHTML('afterbegin', `<div class="empty subtle">${escapeHtml(t('dashboard.saved'))}</div>`);
  });
  document.getElementById('sitesList').addEventListener('click', async (event) => {
    const selectId = event.target.closest('[data-select]') && event.target.closest('[data-select]').dataset.select;
    try {
      if (selectId) {
        state.selectedSiteId = selectId;
        await loadSelectedChecks();
        renderDashboard();
      }
    } catch (error) {
      document.getElementById('siteDetail').innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
    }
  });
  document.getElementById('siteDetail').addEventListener('click', async (event) => {
    const action = event.target.closest('[data-run], [data-copy-client-report], [data-refresh-detail], [data-delete]');
    if (!action) return;
    const runId = action.dataset.run;
    const copyReport = action.dataset.copyClientReport;
    const refreshId = action.dataset.refreshDetail;
    const deleteId = action.dataset.delete;
    try {
      if (runId) await runSiteCheck(runId);
      if (copyReport) {
        await copyToClipboard(decodeURIComponent(copyReport));
        action.textContent = t('common.copied');
        window.setTimeout(() => { action.textContent = t('common.copyReport'); }, 2200);
      }
      if (refreshId) {
        state.selectedSiteId = refreshId;
        await loadSelectedChecks();
        renderDashboard();
      }
      if (deleteId) {
        if (!window.confirm(t('dashboard.deleteConfirm'))) return;
        await state.supabase.from('sites').delete().eq('id', deleteId);
        await loadDashboard();
      }
    } catch (error) {
      const detail = document.getElementById('siteDetail');
      detail.classList.remove('is-loading');
      detail.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
    }
  });
  document.getElementById('siteDetail').addEventListener('submit', async (event) => {
    if (event.target.id !== 'monitorSettingsForm') return;
    event.preventDefault();
    const siteId = state.selectedSiteId;
    const payload = {
      keyword: document.getElementById('keywordInput').value.trim() || null,
      keyword_should_exist: true,
      maintenance_starts_at: document.getElementById('maintenanceStartInput').value ? new Date(document.getElementById('maintenanceStartInput').value).toISOString() : null,
      maintenance_ends_at: document.getElementById('maintenanceEndInput').value ? new Date(document.getElementById('maintenanceEndInput').value).toISOString() : null,
      email_alerts_enabled: hasFeature('email_alerts') ? document.getElementById('emailAlertsInput').checked : false,
      alert_on_down: hasFeature('email_alerts') ? document.getElementById('alertDownInput').checked : false,
      alert_on_warning: hasFeature('email_alerts') ? document.getElementById('alertWarningInput').checked : false,
      alert_on_recovery: hasFeature('email_alerts') ? document.getElementById('alertRecoveryInput').checked : false,
      status_page_enabled: hasFeature('status_pages') ? document.getElementById('statusPageInput').checked : false
    };
    const response = await fetch(apiPath(`/api/sites/${siteId}`), { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify(payload) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || t('dashboard.saveFailed'));
    await loadDashboard();
  });
}

async function initStatusPage() {
  if (page !== 'status') return;
  const slug = window.location.pathname.split('/').filter(Boolean).pop();
  const target = document.getElementById('publicStatusRoot');
  const response = await fetch(apiPath(`/public/status/${slug}`));
  const data = await response.json();
  if (!response.ok) {
    target.innerHTML = '<div class="empty">Status page not found.</div>';
    return;
  }
  const checks = data.checks || [];
  const incidents = data.incidents || [];
  const site = data.site;
  const status = statusLabel(site.last_status);
  const bars = checks.slice(0, 50).reverse().map((check) => `<span class="uptime-bar ${statusLabel(check.status)}" title="${escapeHtml(check.status)} ${formatDateTime(check.created_at)}"></span>`).join('');
  target.innerHTML = `
    <div class="public-status-card">
      <div class="detail-hero">
        <div><p class="eyebrow compact">Public status</p><h1>${escapeHtml(site.name)}</h1><p class="muted">${escapeHtml(site.url)}</p></div>
        <span class="status-pill ${status}"><span class="dot ${status === 'online' ? '' : status}"></span>${escapeHtml(statusCopy(status))}</span>
      </div>
      <div class="detail-metrics">
        <div class="dash-card"><span class="muted">Uptime sample</span><h3>${uptimePercent(checks)}</h3></div>
        <div class="dash-card"><span class="muted">Response</span><h3>${site.last_response_time_ms ? `${site.last_response_time_ms}ms` : '-'}</h3></div>
        <div class="dash-card"><span class="muted">Last check</span><h3>${formatDurationSince(site.last_checked_at)}</h3></div>
      </div>
      <div class="uptime-strip">${bars}</div>
      <div class="panel flat-panel"><div class="panel-top"><strong>Incident history</strong></div><div class="timeline">${incidents.length ? incidents.map((incident) => `<div class="timeline-row"><span class="dot ${incident.status === 'resolved' ? '' : incident.status}"></span><div><strong>${escapeHtml(incident.title)}</strong><small>${formatDateTime(incident.created_at)}${incident.resolved_at ? ` - resolved ${formatDateTime(incident.resolved_at)}` : ''}</small></div></div>`).join('') : '<div class="empty subtle">No incidents reported.</div>'}</div></div>
    </div>`;
}

async function initBilling() {
  const buttons = document.querySelectorAll('[data-upgrade]');
  if (!buttons.length) return;
  await initSupabase();
  buttons.forEach((button) => button.addEventListener('click', async () => {
    const message = document.getElementById('pageMessage');
    if (!state.session) {
      window.location.href = '/signin';
      return;
    }
    try {
      await startUpgrade(button.dataset.upgrade);
    } catch (error) {
      message.textContent = error.message;
    }
  }));
}

initPreferences();
applyLanguage();
initNavSession().catch(renderError);
initAnalyzer();
initAuth().catch(renderError);
initDashboard().catch(renderError);
initDemo();
initBilling().catch(renderError);
initStatusPage().catch(renderError);
