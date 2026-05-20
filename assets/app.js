const apiBase = ['localhost', '127.0.0.1'].includes(window.location.hostname)
  ? ''
  : 'https://sitetrace-api.onrender.com';
const apiPath = (path) => `${apiBase}${path}`;
const page = document.body.dataset.page || 'home';
const state = { config: null, supabase: null, session: null, profile: null, plan: 'free', limits: null, features: null, usage: null, sites: [], selectedSiteId: null, selectedChecks: [], alerts: [], alertsUnread: 0, dashboardPanel: 'overview' };
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
        ['Best first paid plan', 'Starter', '$19/mo', "For one business or a freelancer's core sites.", ['5 monitored sites', 'Checks every 5 minutes', 'In-app alerts and 30-day history', 'Public status pages and client-ready reports']],
        ['For recurring care', 'Agency', '$79/mo', 'For teams managing client websites.', ['50 monitored sites', 'Checks every 1 minute', '90-day history, client reports, and status pages', 'Advanced incident history, downloadable client reports, priority monitoring dashboard']]
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
      alertCenter: 'Alert Center',
      alertCenterDesc: 'SiteTrace watches your website when you are not watching it.',
      alertCenterEmpty: 'No alerts yet. Alerts appear here when a monitor detects an issue or recovery.',
      alertMarkRead: 'Mark all read',
      alertUnread: 'unread',
      noSites: 'No client sites monitored yet.',
      running: 'Checking uptime, speed, SEO basics, SSL, and security signals...',
      completed: 'Health check completed.',
      pendingIncident: 'First matching failure recorded. Run one more check to confirm and open an incident.',
      sendingTest: 'Sending test email...',
      noHistory: 'No check history yet.',
      noIssues: 'No open recommendations from the latest check.',
      firstCheck: 'Run the first check to start history.',
      monitorEyebrow: 'Client site monitor',
      runCheck: 'Run scan',
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
      emailAlerts: 'In-app alerts',
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
      paidFeaturesCopy: 'Starter unlocks saved monitors, scheduled checks, in-app alerts, history, status pages, and client-ready reports. Agency adds higher capacity, advanced incident history, and priority monitoring.',
      paidFeatureItems: ['Saved client monitors', 'Scheduled checks', 'In-app Alert Center', 'History and incidents', 'Status pages', 'Reports for clients'],
      monitoringUnavailable: 'Monitoring is a paid feature. Use the homepage scanner for a free one-time audit.',
      lockedForPlan: 'Locked on this plan',
      lockedStatusPage: 'Status pages require Starter or Agency.',
      lockedAlerts: 'In-app alerts require Starter or Agency.',
      domainExpiry: 'Domain expiry',
      domainUnknown: 'Unknown',
      lastScan: 'Last scan',
      nextScan: 'Next scan in',
      overview: 'Overview',
      liveResponse: 'Live Response Time',
      runFullAudit: 'Run full audit',
      sitesUsed: 'sites',
      addNewSite: 'Add new site',
      cancelBtn: 'Cancel',
      issuesFound: 'Issues Found',
      noIssuesFound: 'No issues found in the latest scan.',
      scanBreakdown: 'Full Scan Breakdown',
      noChecksYet: 'No checks run yet.',
      noIncidentsYet: 'No incidents recorded.',
      planFree: 'Free',
      planStarter: 'Starter',
      planAgency: 'Agency',
      scanHistory: 'Scan History',
      viewReport: 'View Report',
      downloadReport: 'Download Report',
      noHistory: 'No scan history for this period.',
      websiteHealthOverview: 'Website Health Overview',
      websiteHealthSubtitle: 'Monitor uptime, response time, SEO health, SSL, and recent site changes.',
      apiAccess: 'API Access',
      apiAccessLocked: 'API Access — Agency Plan',
      apiAccessLockedDesc: 'Integrate SiteTrace monitoring data into your own tools, dashboards, and workflows.',
      apiAccessNotice: 'API keys are for server-side integrations. Treat them like passwords and only share them with systems you trust.',
      apiKeyCreateTitle: 'Create an API key',
      apiKeyCreateHelp: 'Use a label that tells you where this key will be used, such as Production, Zapier, or Client dashboard.',
      apiKeyOneTime: 'Copy this key now. For security, SiteTrace will not show it again.',
      generateKey: 'Create key',
      newKeyName: 'Label, e.g. Production',
      activeKeys: 'Active keys',
      revokeKey: 'Revoke',
      revokeKeyConfirm: 'Revoke this API key? Any integration using it will stop working immediately.',
      noApiKeys: 'No API keys yet.',
      lastUsed: 'Last used',
      neverUsed: 'Never used',
      apiUsageToday: 'Today',
      apiUsageMonth: 'This month',
      apiUsageRateLimited: 'Rate limited',
      copyKey: 'Copy',
      endpointExamples: 'API Endpoints',
      alertsIncidents: 'Alert Center',
      noAlerts: 'No alerts yet.',
      activeAlerts: 'Active alerts',
      resolvedIncidents: 'Resolved incidents',
      scanHistoryEmpty: 'No scan history yet for this site.',
      selectSiteFirst: 'Select a site from the sidebar to view this section.',
      reports: 'Reports',
      latestReport: 'Latest Report',
      noReports: 'Select a site to download reports.',
      refreshLivePing: 'Refresh Live Ping',
      upgradeAgencyBtn: 'Upgrade to Agency'
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
        ['Para cuidado recurrente', 'Agency', '$79/mes', 'Para equipos que manejan sitios de clientes.', ['50 sitios monitoreados', 'Checks cada 1 minuto', 'Historial de 90 dias, reportes y status pages', 'Historial avanzado de incidentes, reportes descargables, dashboard prioritario']]
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
      alertCenter: 'Centro de alertas',
      alertCenterDesc: 'SiteTrace vigila tu sitio web cuando tú no lo estás mirando.',
      alertCenterEmpty: 'Sin alertas aún. Las alertas aparecen aquí cuando un monitor detecta un problema o recuperación.',
      alertMarkRead: 'Marcar todo leído',
      alertUnread: 'sin leer',
      noSites: 'Aun no hay sitios de clientes monitoreados.',
      running: 'Revisando uptime, velocidad, SEO basico, SSL y seguridad...',
      completed: 'Check de salud completado.',
      pendingIncident: 'Primer fallo registrado. Corre otro check para confirmar y abrir un incidente.',
      sendingTest: 'Enviando email de prueba...',
      noHistory: 'Aun no hay historial de checks.',
      noIssues: 'No hay recomendaciones abiertas en el ultimo check.',
      firstCheck: 'Corre el primer check para iniciar el historial.',
      monitorEyebrow: 'Monitor de sitio cliente',
      runCheck: 'Correr escaneo',
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
      emailAlerts: 'Alertas en la app',
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
      paidFeaturesCopy: 'Starter desbloquea monitores guardados, checks programados, alertas en la app, historial, status pages y reportes para clientes. Agency agrega mas capacidad, historial avanzado y monitoreo prioritario.',
      paidFeatureItems: ['Monitores de clientes', 'Checks programados', 'Centro de alertas', 'Historial e incidentes', 'Status pages', 'Reportes para clientes'],
      monitoringUnavailable: 'El monitoreo es una funcion de pago. Usa el scanner del inicio para una auditoria gratis puntual.',
      lockedForPlan: 'Bloqueado en este plan',
      lockedStatusPage: 'Las status pages requieren Starter o Agency.',
      lockedAlerts: 'Las alertas en la app requieren Starter o Agency.',
      domainExpiry: 'Vencimiento dominio',
      domainUnknown: 'Desconocido',
      lastScan: 'Ultimo escaneo',
      nextScan: 'Proximo escaneo en',
      overview: 'Resumen',
      liveResponse: 'Respuesta en vivo',
      runFullAudit: 'Auditoria completa',
      sitesUsed: 'sitios',
      addNewSite: 'Agregar sitio',
      cancelBtn: 'Cancelar',
      issuesFound: 'Problemas encontrados',
      noIssuesFound: 'Sin problemas en el ultimo escaneo.',
      scanBreakdown: 'Desglose del escaneo',
      noChecksYet: 'Aun no hay escaneos.',
      noIncidentsYet: 'Sin incidentes registrados.',
      planFree: 'Gratis',
      planStarter: 'Starter',
      planAgency: 'Agencia',
      scanHistory: 'Historial de Escaneos',
      viewReport: 'Ver Reporte',
      downloadReport: 'Descargar Reporte',
      noHistory: 'Sin historial de escaneos para este periodo.',
      websiteHealthOverview: 'Resumen de salud del sitio',
      websiteHealthSubtitle: 'Monitorea uptime, tiempo de respuesta, SEO, SSL y cambios recientes.',
      apiAccess: 'Acceso API',
      apiAccessLocked: 'Acceso API — Plan Agency',
      apiAccessLockedDesc: 'Integra los datos de SiteTrace en tus propias herramientas y flujos de trabajo.',
      apiAccessNotice: 'Las API keys son para integraciones de servidor. Tratalas como contrasenas y compartelas solo con sistemas confiables.',
      apiKeyCreateTitle: 'Crear una API key',
      apiKeyCreateHelp: 'Usa una etiqueta que indique donde se usara esta key, como Produccion, Zapier o Dashboard cliente.',
      apiKeyOneTime: 'Copia esta key ahora. Por seguridad, SiteTrace no volvera a mostrarla.',
      generateKey: 'Crear key',
      newKeyName: 'Etiqueta, ej. Produccion',
      activeKeys: 'Keys activas',
      revokeKey: 'Revocar',
      revokeKeyConfirm: 'Revocar esta API key? Cualquier integracion que la use dejara de funcionar inmediatamente.',
      noApiKeys: 'Aun no hay API keys.',
      lastUsed: 'Ultimo uso',
      neverUsed: 'Nunca usada',
      apiUsageToday: 'Hoy',
      apiUsageMonth: 'Este mes',
      apiUsageRateLimited: 'Limitadas',
      copyKey: 'Copiar',
      endpointExamples: 'Endpoints de API',
      alertsIncidents: 'Centro de alertas',
      noAlerts: 'Sin alertas aun.',
      activeAlerts: 'Alertas activas',
      resolvedIncidents: 'Incidentes resueltos',
      scanHistoryEmpty: 'Sin historial de escaneos para este sitio.',
      selectSiteFirst: 'Selecciona un sitio para ver esta seccion.',
      reports: 'Reportes',
      latestReport: 'Ultimo reporte',
      noReports: 'Selecciona un sitio para descargar reportes.',
      refreshLivePing: 'Actualizar ping en vivo',
      upgradeAgencyBtn: 'Subir a Agency'
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
  const score = data.score || data.seo_score || 0;
  const scoreLabel = score >= 80 ? '✅ Good' : score >= 60 ? '⚠️ Fair' : '🔴 Needs attention';
  const domainDays = data.domain_expiry && data.domain_expiry.days_remaining != null ? `${data.domain_expiry.days_remaining} days` : 'Unknown';
  const ssl = data.ssl && data.ssl.days_remaining != null ? `${data.ssl.days_remaining} days` : 'Unknown';
  const sep = '─'.repeat(44);
  const lines = [
    '📊 WEBSITE HEALTH REPORT — SiteTrace',
    sep,
    `Website:    ${data.final_url || data.analyzed_url}`,
    `Scanned:    ${new Date().toLocaleString()}`,
    sep,
    `Health Score:   ${score}/100  ${scoreLabel}`,
    `Response time:  ${data.response_time || '-'}`,
    `HTTP status:    ${data.status_code || '-'}`,
    `Page size:      ${data.page_size_bytes ? Math.round(data.page_size_bytes / 1024) + ' KB' : '-'}`,
    `SSL expires:    ${ssl}`,
    `Domain expires: ${domainDays}`,
    sep,
    currentLocale === 'es' ? 'PROBLEMAS ENCONTRADOS:' : 'ISSUES FOUND:'
  ];
  if (!issues.length) {
    lines.push(currentLocale === 'es' ? '✅ No se encontraron problemas.' : '✅ No issues found.');
  } else {
    issues.forEach((check, i) => {
      const icon = check.level === 'fail' ? '🔴' : '⚠️';
      lines.push(`${icon} ${i + 1}. ${check.title}`);
      lines.push(`   Fix: ${check.recommendation || check.description}`);
    });
  }
  lines.push(sep);
  lines.push('Generated by SiteTrace — sitetrace.it.com');
  return lines.join('\n');
}

// ── Spanish audit translation layer ────────────────────────────────────────────
const CHECK_TRANSLATIONS_ES = {
  // uptime / status
  'site is reachable': ['El sitio responde', 'El servidor esta respondiendo normalmente.', 'Mantener el servidor activo y accesible.'],
  'site is unreachable': ['El sitio no responde', 'El servidor no esta respondiendo.', 'Revisar el servidor y la configuracion de DNS.'],
  'http status warning': ['Advertencia de estado HTTP', 'El servidor devolvio un estado de advertencia.', 'Revisar los logs del servidor.'],
  'response time is fast': ['Tiempo de respuesta rapido', 'La pagina carga rapidamente.', 'Mantener el rendimiento actual.'],
  'response time is slow': ['Tiempo de respuesta lento', 'La pagina tarda en cargar.', 'Optimizar el servidor o usar un CDN.'],
  'response time is very slow': ['Tiempo de respuesta muy lento', 'La pagina carga muy despacio.', 'Revisar la carga del servidor y optimizar recursos.'],
  // ssl
  'ssl certificate is valid': ['Certificado SSL valido', 'El certificado SSL esta activo y es valido.', 'Renovar antes del vencimiento.'],
  'ssl certificate expiring soon': ['Certificado SSL por vencer', 'El certificado SSL vence pronto.', 'Renovar el certificado SSL cuanto antes.'],
  'https is enabled': ['HTTPS activado', 'El sitio usa HTTPS correctamente.', 'Mantener HTTPS activo.'],
  'https is not enabled': ['HTTPS no activado', 'El sitio no usa HTTPS.', 'Migrar a HTTPS para proteger a los visitantes.'],
  // domain
  'domain expiry is ok': ['Dominio vigente', 'El dominio esta al dia.', 'Renovar el dominio antes de que venza.'],
  'domain expiring soon': ['Dominio por vencer', 'El dominio vence pronto.', 'Renovar el dominio cuanto antes.'],
  'domain is expired': ['Dominio vencido', 'El dominio ha vencido.', 'Renovar el dominio de inmediato.'],
  'domain expiry unknown': ['Vencimiento de dominio desconocido', 'No se pudo verificar el vencimiento del dominio.', 'Verificar el estado del dominio con el registrador.'],
  // seo - title
  'title tag is healthy': ['Etiqueta title correcta', 'La pagina tiene un titulo util para buscadores.', 'Mantener el titulo entre 30 y 60 caracteres.'],
  'title tag is missing': ['Etiqueta title faltante', 'La pagina no tiene etiqueta de titulo.', 'Agregar una etiqueta <title> con 30-60 caracteres.'],
  'title tag length warning': ['Longitud del title fuera de rango', 'El titulo es demasiado corto o largo.', 'Ajustar el titulo a entre 30 y 60 caracteres.'],
  // meta description
  'meta description is healthy': ['Meta description correcta', 'La pagina tiene una descripcion util para resultados de busqueda.', 'Mantener la descripcion entre 70 y 160 caracteres.'],
  'meta description is missing': ['Meta description faltante', 'La pagina no tiene meta description.', 'Agregar una <meta name="description"> de 70-160 caracteres.'],
  'meta description length warning': ['Longitud de meta description fuera de rango', 'La descripcion es demasiado corta o larga.', 'Ajustar la descripcion a entre 70 y 160 caracteres.'],
  // h1
  'h1 tag is present': ['Etiqueta H1 presente', 'La pagina tiene una etiqueta H1.', 'Mantener un solo H1 descriptivo por pagina.'],
  'h1 tag is missing': ['Etiqueta H1 faltante', 'La pagina no tiene etiqueta H1.', 'Agregar una etiqueta H1 con la frase principal.'],
  'multiple h1 tags found': ['Multiples etiquetas H1', 'La pagina tiene mas de un H1.', 'Dejar solo un H1 por pagina.'],
  // canonical
  'canonical url is set': ['URL canonical definida', 'La URL canonical esta configurada.', 'Verificar que la canonical apunte a la URL correcta.'],
  'canonical url is missing': ['URL canonical faltante', 'No se encontro URL canonical.', 'Agregar <link rel="canonical"> a la pagina.'],
  // open graph / og
  'open graph tags are present': ['Tags Open Graph presentes', 'La pagina tiene tags Open Graph.', 'Verificar que titulo, descripcion e imagen esten definidos.'],
  'open graph tags incomplete': ['Tags Open Graph incompletos', 'Faltan tags Open Graph importantes.', 'Agregar og:title, og:description y og:image.'],
  // robots
  'page is indexable': ['Pagina indexable', 'Los motores de busqueda pueden indexar esta pagina.', 'Mantener la pagina indexable si debe aparecer en busquedas.'],
  'page is blocked from indexing': ['Pagina bloqueada de indexacion', 'La pagina tiene noindex y no aparecera en busquedas.', 'Quitar la directiva noindex si la pagina debe aparecer en busquedas.'],
  // keyword
  'keyword found on page': ['Keyword encontrada', 'La keyword requerida esta presente en la pagina.', 'Mantener la keyword en el contenido principal.'],
  'keyword not found on page': ['Keyword no encontrada', 'La keyword requerida no esta en la pagina.', 'Revisar si la keyword fue eliminada o cambiada.'],
  // security
  'csp header is present': ['Header CSP presente', 'El header Content-Security-Policy esta configurado.', 'Revisar la politica CSP periodicamente.'],
  'csp header is missing': ['Header CSP faltante', 'No hay header Content-Security-Policy.', 'Agregar un header Content-Security-Policy al servidor.'],
  'hsts header is present': ['Header HSTS presente', 'El header HSTS esta activo.', 'Mantener HSTS activo para seguridad.'],
  'hsts header is missing': ['Header HSTS faltante', 'No hay header Strict-Transport-Security.', 'Agregar el header HSTS en el servidor.'],
  'x-frame-options is set': ['X-Frame-Options configurado', 'La pagina esta protegida contra clickjacking.', 'Mantener el header X-Frame-Options.'],
  'x-frame-options is missing': ['X-Frame-Options faltante', 'La pagina no tiene proteccion contra clickjacking.', 'Agregar X-Frame-Options: DENY o SAMEORIGIN.'],
  // image alt
  'image alt texts are complete': ['Textos alt de imagenes completos', 'La mayoria de imagenes tiene texto alternativo.', 'Mantener los textos alt actualizados.'],
  'image alt texts incomplete': ['Textos alt de imagenes incompletos', 'Algunas imagenes no tienen texto alternativo.', 'Agregar atributo alt a todas las imagenes.'],
  // redirect
  'redirect detected': ['Redireccion detectada', 'La URL redirige a otra direccion.', 'Verificar que la redireccion sea intencional y correcta.'],
};

function translateCheck(check, locale) {
  if (locale !== 'es') return check;
  const key = (check.title || '').toLowerCase().trim();
  const mapping = CHECK_TRANSLATIONS_ES[key];
  if (!mapping) return check;
  return Object.assign({}, check, {
    title: mapping[0],
    description: mapping[1] || check.description,
    recommendation: mapping[2] || check.recommendation
  });
}

// ── Client PDF Report Generator ───────────────────────────────────────────────
function generateClientReport(site, checks, tier) {
  const latest      = checks[0] || {};
  const latestResult= latest.result || {};
  const allChecks   = Array.isArray(latestResult.checks) ? latestResult.checks.map(c => translateCheck(c, currentLocale)) : [];
  const domainExpiry= latestResult.domain_expiry || null;
  const issues      = allChecks.filter(c => c.level !== 'pass');
  // Tier-based content limits
  const reportTier  = tier || state.plan || 'free';
  const isFree      = reportTier === 'free';
  const isStarter   = reportTier === 'starter';
  const isAgency    = reportTier === 'agency';
  const shownIssues = isFree ? issues.slice(0, 3) : issues;
  const downChecks  = checks.filter(c => c.status === 'down');
  const recentChecks= checks.slice(0, 15);
  const status      = statusLabel(site.last_status);
  const scoreColor  = site.last_score >= 80 ? '#16a34a' : site.last_score >= 60 ? '#d97706' : '#dc2626';

  // Live ping stats from current session
  const chart       = state.livePingChart;
  const pingPts     = chart ? chart.points.filter(p => p.ms !== null) : [];
  const pingCur     = chart && chart.points.length ? chart.points[chart.points.length - 1] : null;
  const pingAvg     = pingPts.length ? Math.round(pingPts.reduce((s, p) => s + p.ms, 0) / pingPts.length) : null;
  const pingMin     = pingPts.length ? Math.min(...pingPts.map(p => p.ms)) : null;
  const pingMax     = pingPts.length ? Math.max(...pingPts.map(p => p.ms)) : null;
  const pingTimeouts= chart ? chart.points.filter(p => p.status === 'timeout' || p.status === 'error').length : 0;
  const hasPing     = pingPts.length > 0;

  // Uptime %
  const uptimePct   = checks.length
    ? ((checks.filter(c => c.status !== 'down').length / checks.length) * 100).toFixed(1) + '%'
    : '–';

  // Average response from stored checks
  const respChecks  = checks.filter(c => Number(c.response_time_ms) > 0);
  const avgResp     = respChecks.length
    ? Math.round(respChecks.reduce((s, c) => s + Number(c.response_time_ms), 0) / respChecks.length) + 'ms'
    : site.last_response_time_ms ? site.last_response_time_ms + 'ms' : '–';

  // Domain/SSL info
  const domainStr   = domainExpiry && domainExpiry.days_remaining != null
    ? `${domainExpiry.days_remaining}d remaining`
    : site.last_score != null ? 'See scan details' : '–';

  // Category grouping for scan breakdown
  const catIcon = {
    domain: '🌐', ssl: '🔒', seo: '🔍', uptime: '📡', performance: '⚡', keyword: '👁'
  };
  const catLabel = {
    domain: 'Domain', ssl: 'SSL Certificate', seo: 'SEO',
    uptime: 'Uptime & Status', performance: 'Performance', keyword: 'Keyword Monitor'
  };
  const byCategory = {};
  allChecks.forEach(c => {
    const cat = c.category || 'other';
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(c);
  });
  const levelOrder = { fail: 0, warn: 1, warning: 1, pass: 2 };
  const sortedCats = Object.keys(byCategory).sort((a, b) => {
    const worst = arr => Math.min(...arr.map(c => levelOrder[c.level] ?? 2));
    return worst(byCategory[a]) - worst(byCategory[b]);
  });

  const levelCol = { fail: '#dc2626', warn: '#d97706', warning: '#d97706', pass: '#16a34a' };
  const levelBg  = { fail: '#fef2f2', warn: '#fffbeb', warning: '#fffbeb', pass: '#f0fdf4' };
  const levelBdr = { fail: '#fecaca', warn: '#fde68a', warning: '#fde68a', pass: '#bbf7d0' };
  const insights = latestResult.insights || {};
  const opportunities = Array.isArray(insights.content_opportunities) ? insights.content_opportunities : [];
  const priorities = Array.isArray(insights.top_priorities) ? insights.top_priorities : [];
  const plan = insights.optional_content_plan || null;

  const now = new Date().toLocaleString();

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>SiteTrace Report — ${escapeHtml(site.name)}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 13px; color: #1a1a2e; background: #fff; line-height: 1.5; }
  @media print {
    body { font-size: 11px; }
    .no-print { display: none !important; }
    .page-break { page-break-before: always; }
    section { page-break-inside: avoid; }
  }

  /* Layout */
  .report-wrap { max-width: 820px; margin: 0 auto; padding: 40px 32px; }

  /* Header */
  .report-header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #6366f1; padding-bottom: 20px; margin-bottom: 28px; }
  .report-brand { display: flex; align-items: center; gap: 10px; }
  .report-brand-mark { width: 36px; height: 36px; background: #6366f1; border-radius: 8px; display: flex; align-items: center; justify-content: center; }
  .report-brand-mark svg { width: 20px; height: 20px; fill: none; stroke: #fff; stroke-width: 2; stroke-linecap: round; }
  .report-brand-name { font-size: 1.3rem; font-weight: 800; color: #1a1a2e; letter-spacing: -.02em; }
  .report-brand-tag { font-size: .7rem; color: #6366f1; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; }
  .report-meta { text-align: right; font-size: .75rem; color: #64748b; line-height: 1.8; }
  .report-meta strong { color: #1a1a2e; font-size: .9rem; display: block; margin-bottom: 2px; }

  /* Status pill */
  .status-pill { display: inline-flex; align-items: center; gap: 5px; font-size: .72rem; font-weight: 700; padding: 3px 10px; border-radius: 20px; margin-top: 4px; }
  .status-pill.online  { background: #f0fdf4; color: #16a34a; border: 1px solid #bbf7d0; }
  .status-pill.down    { background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; }
  .status-pill.warning { background: #fffbeb; color: #d97706; border: 1px solid #fde68a; }
  .status-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }

  /* Section */
  section { margin-bottom: 28px; }
  .section-title { font-size: .65rem; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; color: #94a3b8; margin-bottom: 12px; padding-bottom: 6px; border-bottom: 1px solid #e2e8f0; }

  /* Metric grid */
  .metric-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
  .metric-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px 16px; }
  .metric-label { font-size: .68rem; color: #64748b; font-weight: 600; text-transform: uppercase; letter-spacing: .06em; margin-bottom: 6px; }
  .metric-value { font-size: 1.4rem; font-weight: 800; line-height: 1; }

  /* Ping row */
  .ping-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; }
  .ping-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 12px; text-align: center; }
  .ping-label { font-size: .65rem; color: #64748b; text-transform: uppercase; letter-spacing: .06em; margin-bottom: 4px; }
  .ping-value { font-size: 1.05rem; font-weight: 800; font-variant-numeric: tabular-nums; }
  .report-callout { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px 16px; color: #334155; font-size: .82rem; line-height: 1.55; }
  .opportunity-table td:first-child { font-weight: 700; }
  .opportunity-table td { vertical-align: top; }
  .plan-list { margin-left: 18px; color: #334155; font-size: .82rem; line-height: 1.7; }

  /* Issue rows */
  .issue-list { border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; }
  .issue-row { display: flex; align-items: flex-start; gap: 10px; padding: 11px 14px; border-bottom: 1px solid #e2e8f0; }
  .issue-row:last-child { border-bottom: none; }
  .issue-badge { flex-shrink: 0; font-size: .65rem; font-weight: 700; padding: 2px 8px; border-radius: 4px; margin-top: 1px; }
  .issue-body { flex: 1; }
  .issue-title { font-weight: 600; font-size: .85rem; margin-bottom: 2px; }
  .issue-desc  { font-size: .75rem; color: #64748b; margin-bottom: 2px; line-height: 1.4; }
  .issue-fix   { font-size: .75rem; color: #475569; line-height: 1.4; }
  .issue-fix strong { color: #1a1a2e; }
  .issue-value { flex-shrink: 0; font-size: .72rem; font-weight: 700; background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 4px; padding: 2px 7px; white-space: nowrap; }
  .empty-note { padding: 14px; text-align: center; color: #94a3b8; font-size: .82rem; background: #f8fafc; border-radius: 10px; border: 1px solid #e2e8f0; }

  /* Incidents */
  .incident-row { padding: 11px 14px; border-bottom: 1px solid #e2e8f0; }
  .incident-row:last-child { border-bottom: none; }
  .incident-top { display: flex; align-items: center; gap: 8px; margin-bottom: 5px; font-weight: 600; font-size: .85rem; }
  .incident-time { margin-left: auto; font-size: .72rem; color: #64748b; }
  .chip-row { display: flex; flex-wrap: wrap; gap: 5px; }
  .chip { font-size: .7rem; font-weight: 600; background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 4px; padding: 2px 7px; font-variant-numeric: tabular-nums; }

  /* Recent checks table */
  table { width: 100%; border-collapse: collapse; font-size: .8rem; }
  th { background: #f8fafc; font-size: .65rem; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: #64748b; padding: 8px 10px; text-align: left; border-bottom: 2px solid #e2e8f0; }
  td { padding: 8px 10px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
  tr:last-child td { border-bottom: none; }
  .td-status { display: inline-flex; align-items: center; gap: 5px; font-size: .72rem; font-weight: 700; padding: 2px 8px; border-radius: 4px; }

  /* Scan breakdown */
  .cat-group { margin-bottom: 12px; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; }
  .cat-head { display: flex; align-items: center; gap: 7px; padding: 8px 14px; font-size: .68rem; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; background: #f8fafc; border-bottom: 1px solid #e2e8f0; }
  .check-row { display: flex; align-items: flex-start; gap: 10px; padding: 9px 14px; border-bottom: 1px solid #f1f5f9; }
  .check-row:last-child { border-bottom: none; }
  .check-icon { flex-shrink: 0; width: 14px; height: 14px; margin-top: 1px; }
  .check-body { flex: 1; }
  .check-title-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .check-title { font-size: .83rem; font-weight: 500; }
  .check-val { font-size: .7rem; font-weight: 700; background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 4px; padding: 1px 6px; }
  .check-desc { margin-top: 3px; font-size: .74rem; color: #64748b; line-height: 1.4; }
  .check-fix  { margin-top: 2px; font-size: .74rem; color: #475569; line-height: 1.4; }
  .lvl-badge  { flex-shrink: 0; font-size: .62rem; font-weight: 700; padding: 2px 7px; border-radius: 4px; margin-top: 1px; }

  /* Footer */
  .report-footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; font-size: .7rem; color: #94a3b8; }

  /* Print button */
  .print-bar { background: #6366f1; color: #fff; display: flex; align-items: center; justify-content: space-between; padding: 10px 32px; margin-bottom: 0; }
  .print-bar span { font-size: .85rem; font-weight: 600; }
  .print-btn { background: #fff; color: #6366f1; border: none; border-radius: 6px; padding: 7px 20px; font-size: .85rem; font-weight: 700; cursor: pointer; }
</style>
</head>
<body>

<div class="print-bar no-print">
  <span>📄 SiteTrace Client Report — ready to save as PDF</span>
  <button class="print-btn" onclick="window.print()">Save as PDF</button>
</div>

<div class="report-wrap">

  <!-- Header -->
  <div class="report-header">
    <div class="report-brand">
      <div class="report-brand-mark">
        <svg viewBox="0 0 24 24"><path d="M4 12h3l2-7 4 14 2-7h5"/></svg>
      </div>
      <div>
        <div class="report-brand-name">SiteTrace</div>
        <div class="report-brand-tag">Website Health Report</div>
      </div>
    </div>
    <div class="report-meta">
      <strong>${escapeHtml(site.name)}</strong>
      ${escapeHtml(site.url)}<br>
      Generated: ${now}<br>
      <span class="status-pill ${status}"><span class="status-dot"></span>${status === 'online' ? 'Healthy Right Now' : status === 'down' ? 'Currently Down' : 'Warning'}</span>
    </div>
  </div>

  <!-- Health Overview -->
  <section>
    <div class="section-title">Health Overview</div>
    <div class="metric-grid">
      <div class="metric-card">
        <div class="metric-label">Health Score</div>
        <div class="metric-value" style="color:${scoreColor};">${site.last_score ? site.last_score + '/100' : '–'}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Uptime Sample</div>
        <div class="metric-value">${uptimePct}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Avg Response</div>
        <div class="metric-value">${avgResp}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">SSL / Domain</div>
        <div class="metric-value" style="font-size:1rem;">${escapeHtml(domainStr)}</div>
      </div>
    </div>
  </section>

  ${(insights.executive_summary || priorities.length) ? `
  <section>
    <div class="section-title">Executive Audit Insights</div>
    ${insights.executive_summary ? `<div class="report-callout">${escapeHtml(insights.executive_summary)}</div>` : ''}
    ${priorities.length ? `<div class="issue-list" style="margin-top:10px;">${priorities.map((item) => `
      <div class="issue-row">
        <span class="issue-badge" style="background:#f1f5f9;color:#334155;border:1px solid #e2e8f0;">${escapeHtml(item.priority || 'medium')}</span>
        <div class="issue-body">
          <div class="issue-title">${escapeHtml(item.issue || item.area || 'Priority')}</div>
          <div class="issue-fix"><strong>Action:</strong> ${escapeHtml(item.action || '')}</div>
        </div>
      </div>`).join('')}</div>` : ''}
  </section>` : ''}

  ${opportunities.length ? `
  <section>
    <div class="section-title">Optional Content Opportunities</div>
    <div style="border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;">
      <table class="opportunity-table">
        <thead><tr><th>Priority</th><th>Topic / Page Idea</th><th>Primary Keyword</th><th>Supporting Keywords</th><th>Intent</th></tr></thead>
        <tbody>${opportunities.map((item) => `<tr>
          <td>${escapeHtml(item.priority || 'Medium')}</td>
          <td>${escapeHtml(item.title || '')}</td>
          <td>${escapeHtml(item.primary_keyword || '')}</td>
          <td>${escapeHtml(Array.isArray(item.supporting_keywords) ? item.supporting_keywords.join(', ') : item.supporting_keywords || '')}</td>
          <td>${escapeHtml(item.intent || '')}</td>
        </tr>`).join('')}</tbody>
      </table>
    </div>
    ${plan ? `<div class="report-callout" style="margin-top:10px;">
      <strong>Content improvement plan:</strong>
      <ol class="plan-list">
        <li>${escapeHtml(plan.phase_1 || '')}</li>
        <li>${escapeHtml(plan.phase_2 || '')}</li>
        <li>${escapeHtml(plan.phase_3 || '')}</li>
      </ol>
    </div>` : ''}
  </section>` : ''}

  ${hasPing ? `
  <!-- Live Response Monitoring -->
  <section>
    <div class="section-title">Live Response Time (this session)</div>
    <div class="ping-grid">
      <div class="ping-card">
        <div class="ping-label">Current</div>
        <div class="ping-value" style="color:${pingCur && pingCur.ms < 400 ? '#16a34a' : pingCur && pingCur.ms < 800 ? '#d97706' : '#dc2626'};">${pingCur && pingCur.ms != null ? pingCur.ms + 'ms' : 'Timeout'}</div>
      </div>
      <div class="ping-card">
        <div class="ping-label">Average</div>
        <div class="ping-value">${pingAvg != null ? pingAvg + 'ms' : '–'}</div>
      </div>
      <div class="ping-card">
        <div class="ping-label">Min</div>
        <div class="ping-value" style="color:#16a34a;">${pingMin != null ? pingMin + 'ms' : '–'}</div>
      </div>
      <div class="ping-card">
        <div class="ping-label">Max</div>
        <div class="ping-value">${pingMax != null ? pingMax + 'ms' : '–'}</div>
      </div>
      <div class="ping-card">
        <div class="ping-label">Timeouts</div>
        <div class="ping-value" style="color:${pingTimeouts > 0 ? '#dc2626' : '#16a34a'};">${pingTimeouts}</div>
      </div>
    </div>
    ${pingTimeouts > 0 ? `<div class="report-callout" style="margin-top:10px;">${escapeHtml(pingCur && pingCur.ms != null
      ? 'This incident has been resolved, please refresh the ping. Browser ping failures may come from local network, CORS/browser limits, upstream provider errors, or temporary service incidents.'
      : 'Browser ping failures were detected. These can be caused by local network issues, browser/CORS limits, upstream provider errors, or temporary service incidents. Scheduled scans remain the source of truth.')}</div>` : ''}
  </section>` : ''}

  <!-- Issues Found -->
  <section>
    <div class="section-title">Issues Found — ${issues.length ? issues.length + ' item' + (issues.length > 1 ? 's' : '') : 'None'}</div>
    ${issues.length ? `<div class="issue-list">${issues.map(c => `
      <div class="issue-row">
        <span class="issue-badge" style="background:${levelBg[c.level]};color:${levelCol[c.level]};border:1px solid ${levelBdr[c.level]};">${c.level}</span>
        <div class="issue-body">
          <div class="issue-title">${escapeHtml(c.title)}</div>
          ${c.description ? `<div class="issue-desc">${escapeHtml(c.description)}</div>` : ''}
          ${c.recommendation ? `<div class="issue-fix"><strong>Fix:</strong> ${escapeHtml(c.recommendation)}</div>` : ''}
        </div>
        ${c.value ? `<span class="issue-value">${escapeHtml(c.value)}</span>` : ''}
      </div>`).join('')}</div>`
    : '<div class="empty-note">✓ No issues found in the latest scan.</div>'}
  </section>

  <!-- Recent Incidents -->
  <section>
    <div class="section-title">Recent Incidents</div>
    ${downChecks.length ? `<div class="issue-list">${downChecks.slice(0, 8).map(inc => {
      const incIssues = inc.result && Array.isArray(inc.result.checks)
        ? inc.result.checks.filter(c => c.level === 'fail').slice(0, 3) : [];
      return `<div class="incident-row">
        <div class="incident-top">
          <span style="color:#dc2626;">●</span> Downtime detected
          <span class="incident-time">${formatDateTime(inc.created_at)}</span>
        </div>
        <div class="chip-row">
          <span class="chip">HTTP ${inc.status_code || 'unreachable'}</span>
          ${inc.response_time_ms ? `<span class="chip">${inc.response_time_ms}ms</span>` : ''}
          ${inc.score ? `<span class="chip">Score ${inc.score}/100</span>` : ''}
          ${incIssues.map(i => `<span class="chip" style="color:#dc2626;">${escapeHtml(i.title)}</span>`).join('')}
        </div>
      </div>`;
    }).join('')}</div>`
    : '<div class="empty-note">✓ No incidents in recent checks.</div>'}
  </section>

  <!-- Recent Checks -->
  <section>
    <div class="section-title">Recent Checks (last ${recentChecks.length})</div>
    <div style="border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;">
      <table>
        <thead><tr><th>Time</th><th>Status</th><th>Score</th><th>Response</th><th>HTTP</th></tr></thead>
        <tbody>${recentChecks.map(c => {
          const st = statusLabel(c.status);
          const stCol = st === 'online' ? '#16a34a' : st === 'down' ? '#dc2626' : '#d97706';
          const stBg  = st === 'online' ? '#f0fdf4' : st === 'down' ? '#fef2f2' : '#fffbeb';
          return `<tr>
            <td>${formatDateTime(c.created_at)}</td>
            <td><span class="td-status" style="background:${stBg};color:${stCol};">${st}</span></td>
            <td>${c.score ? c.score + '/100' : '–'}</td>
            <td>${c.response_time_ms ? c.response_time_ms + 'ms' : '–'}</td>
            <td>${c.status_code || '–'}</td>
          </tr>`;
        }).join('')}</tbody>
      </table>
    </div>
  </section>

  <!-- Full Scan Breakdown -->
  ${allChecks.length ? `
  <section class="page-break">
    <div class="section-title">Full Scan Breakdown — ${allChecks.length} checks · ${formatDateTime(latest.created_at)}</div>
    ${sortedCats.map(cat => {
      const catChecks = byCategory[cat].slice().sort((a,b) => (levelOrder[a.level]??2)-(levelOrder[b.level]??2));
      const worst = catChecks[0]?.level || 'pass';
      return `<div class="cat-group">
        <div class="cat-head" style="color:${levelCol[worst] || '#64748b'};">
          ${catIcon[cat] || '📋'} ${catLabel[cat] || cat}
        </div>
        ${catChecks.map(c => {
          const isIssue = c.level === 'fail' || c.level === 'warn' || c.level === 'warning';
          const icon = c.level === 'pass'
            ? `<svg class="check-icon" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>`
            : c.level === 'fail'
            ? `<svg class="check-icon" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`
            : `<svg class="check-icon" viewBox="0 0 24 24" fill="none" stroke="#d97706" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
          return `<div class="check-row">
            ${icon}
            <div class="check-body">
              <div class="check-title-row">
                <span class="check-title">${escapeHtml(c.title)}</span>
                ${c.value ? `<span class="check-val">${escapeHtml(c.value)}</span>` : ''}
                <span class="lvl-badge" style="background:${levelBg[c.level]||'#f1f5f9'};color:${levelCol[c.level]||'#64748b'};border:1px solid ${levelBdr[c.level]||'#e2e8f0'};">${c.level}</span>
              </div>
              ${c.description ? `<div class="check-desc">${escapeHtml(c.description)}</div>` : ''}
              ${c.recommendation && isIssue ? `<div class="check-fix"><strong>Fix:</strong> ${escapeHtml(c.recommendation)}</div>` : ''}
            </div>
          </div>`;
        }).join('')}
      </div>`;
    }).join('')}
  </section>` : ''}

  <!-- Footer -->
  <div class="report-footer">
    <span>Generated by SiteTrace · sitetrace.it.com</span>
    <span>${escapeHtml(site.url)} · ${now}</span>
  </div>

</div>
</body>
</html>`;

  const w = window.open('', '_blank');
  if (!w) { alert('Pop-up blocked — please allow pop-ups for this site to download reports.'); return; }
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.setTimeout(() => w.print(), 600);
}

function reportSummaryFromSite(site, checks) {
  const latest = checks[0] || {};
  const result = latest.result || {};
  const issues = Array.isArray(result.checks) ? result.checks.filter((check) => check.level !== 'pass').slice(0, 8).map(c => translateCheck(c, currentLocale)) : [];
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
  const languageControl = document.querySelector('.language-control');
  if (languageControl) {
    languageControl.setAttribute('aria-label', t('controls.language'));
    languageControl.setAttribute('title', t('controls.language'));
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
      <label class="language-control" aria-label="${escapeHtml(t('controls.language'))}" title="${escapeHtml(t('controls.language'))}">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 0 20"/><path d="M12 2a15.3 15.3 0 0 0 0 20"/></svg>
        <select id="languageSelect" class="control-select" aria-label="${escapeHtml(t('controls.language'))}">
          <option value="en">EN</option>
          <option value="es">ES</option>
        </select>
      </label>
      <button id="themeToggle" class="control-button" type="button"></button>`;
    navLinks.appendChild(controls);
    document.getElementById('languageSelect').value = currentLocale;
    document.getElementById('languageSelect').addEventListener('change', (event) => {
      currentLocale = event.target.value === 'es' ? 'es' : 'en';
      localStorage.setItem('sitetrace_locale', currentLocale);
      applyLanguage();
      if (page === 'dashboard' && state.sites.length) {
        renderDashboard();
      }
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
  const languageControl = document.querySelector('.language-control');
  if (languageControl) {
    languageControl.setAttribute('aria-label', t('controls.language'));
    languageControl.setAttribute('title', t('controls.language'));
  }
  if (languageSelect) languageSelect.setAttribute('aria-label', t('controls.language'));

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
    setAllText('.agency-section li span', t('home.agencyPoints'));
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

// ── Scan interval by plan ──────────────────────────────
function planIntervalMinutes() {
  const interval = state.limits && Number(state.limits.interval_minutes);
  if (!interval || interval <= 0) return 20;
  return interval;
}

function planIntervalLabel() {
  const mins = planIntervalMinutes();
  if (currentLocale === 'es') {
    if (mins <= 1) return 'Prioritario · Cada 1 min';
    if (mins <= 5) return 'Cada 5 min';
    return `Cada ${mins} min`;
  }
  if (mins <= 1) return 'Priority · Every 1 min';
  if (mins <= 5) return 'Every 5 min';
  if (mins <= 20) return 'Every 20 min';
  return `Every ${mins} min`;
}

// ── Scan timer / countdown ─────────────────────────────
let scanCountdownInterval = null;

function startScanCountdown(lastCheckedAt, siteId) {
  if (scanCountdownInterval) clearInterval(scanCountdownInterval);
  const countdownEl = document.getElementById('scanCountdown');
  const lastScanEl  = document.getElementById('lastScanTime');
  if (!countdownEl) return;

  const intervalMins = planIntervalMinutes();
  const intervalMs = intervalMins * 60 * 1000;

  // Use localStorage timestamp if more recent than server timestamp
  let lastMs = lastCheckedAt ? new Date(lastCheckedAt).getTime() : Date.now() - intervalMs + 30000;
  if (siteId) {
    const stored = localStorage.getItem('st_last_scan_' + siteId);
    if (stored) {
      const storedMs = Number(stored);
      if (storedMs > lastMs) lastMs = storedMs;
    }
  }
  const nextMs = lastMs + intervalMs;

  if (lastScanEl && lastCheckedAt) {
    const d = new Date(lastCheckedAt);
    lastScanEl.textContent = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: intervalMins <= 1 ? '2-digit' : undefined });
  }

  // Show plan cooldown message
  const planMsgEl = document.getElementById('scanCooldownMsg');
  if (planMsgEl) {
    const planName = state.plan === 'agency' ? 'Agency' : state.plan === 'starter' ? 'Starter' : 'Free';
    planMsgEl.textContent = `Your ${planName} plan allows one scan every ${intervalMins} minute${intervalMins !== 1 ? 's' : ''}.`;
  }

  const setAuditBtnState = (available) => {
    const btn = document.getElementById('runAuditBtn');
    if (!btn) return;
    btn.disabled = !available;
    btn.classList.toggle('btn-available', available);
  };

  const tick = () => {
    const rem = nextMs - Date.now();
    const el  = document.getElementById('scanCountdown');
    if (!el) { clearInterval(scanCountdownInterval); return; }
    if (rem <= 0) {
      el.textContent = 'Scan available';
      el.style.color = 'var(--green)';
      setAuditBtnState(true);
      return;
    }
    el.style.color = '';
    setAuditBtnState(false);
    const totalSec = Math.floor(rem / 1000);
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    el.textContent = `Next scan in ${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };
  tick();
  scanCountdownInterval = setInterval(tick, 1000);
}

// ── Recent checks table ────────────────────────────────
function renderRecentChecksTable(checks) {
  if (!checks || !checks.length) {
    return '<div class="empty subtle" style="padding:14px 20px;font-size:.85rem;">No checks recorded yet. Run a check to see history here.</div>';
  }
  const rows = checks.slice(0, 20).map((c) => {
    const d = new Date(c.created_at);
    const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const statusCl = c.status === 'online' ? 'var(--green)' : c.status === 'down' ? 'var(--red)' : 'var(--amber)';
    const issueCount = c.result && Array.isArray(c.result.checks) ? c.result.checks.filter((ch) => ch.level !== 'pass').length : '–';
    return `<tr>
      <td style="white-space:nowrap;">${timeStr}</td>
      <td><span style="font-size:.76rem;color:var(--muted);">Scheduled</span></td>
      <td><span class="dot ${c.status === 'online' ? '' : c.status}" style="width:7px;height:7px;display:inline-block;vertical-align:middle;margin-right:5px;"></span>${c.status}</td>
      <td style="color:${c.score >= 80 ? 'var(--green)' : c.score >= 60 ? 'var(--amber)' : 'var(--red)'};">${c.score || '–'}/100</td>
      <td>${c.response_time_ms ? c.response_time_ms + 'ms' : '–'}</td>
      <td>${typeof issueCount === 'number' && issueCount > 0 ? `<span class="level-badge ${issueCount > 2 ? 'fail' : 'warning'}">${issueCount}</span>` : '<span class="level-badge pass">0</span>'}</td>
    </tr>`;
  }).join('');
  return `<table class="checks-table"><thead><tr><th>Time</th><th>Trigger</th><th>Status</th><th>Score</th><th>Response</th><th>Issues</th></tr></thead><tbody>${rows}</tbody></table>`;
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

function renderEmailDnsPanel() {
  // Email DNS panel removed — alerts are now handled in-app via Alert Center
  const target = document.getElementById('emailDnsPanel');
  if (target) target.innerHTML = '';
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
    window._stSupabase = state.supabase;
    const { data } = await state.supabase.auth.getSession();
    state.session = data.session;
    state.supabase.auth.onAuthStateChange((event, session) => {
      state.session = session;
      updateAuthNav();
      if (page === 'dashboard') loadDashboard();
      if (event === 'PASSWORD_RECOVERY' && page === 'signin') {
        const authForm        = document.getElementById('authForm');
        const resetForm       = document.getElementById('resetForm');
        const newPasswordForm = document.getElementById('newPasswordForm');
        const heading         = document.querySelector('.auth-card h1');
        const subheading      = document.querySelector('.auth-card .lead');
        if (authForm)        authForm.style.display = 'none';
        if (resetForm)       resetForm.style.display = 'none';
        if (newPasswordForm) newPasswordForm.style.display = '';
        if (heading)         heading.textContent = 'Set new password';
        if (subheading)      subheading.style.display = 'none';
      }
    });
  }
}

function renderActionPlan(recommendations) {
  if (!Array.isArray(recommendations) || !recommendations.length) {
    return '<div class="action-plan-empty"><span class="level-badge pass">All clear</span><p>No issues detected. Keep monitoring for silent changes over time.</p></div>';
  }
  const criticals = recommendations.filter((r) => r.severity === 'critical');
  const highs = recommendations.filter((r) => r.severity === 'high');
  const renderGroup = (label, items, colorClass) => {
    if (!items.length) return '';
    return `<div class="ap-group"><div class="ap-group-head"><span class="ap-severity ${colorClass}">${escapeHtml(label)}</span><span class="ap-count">${items.length} item${items.length > 1 ? 's' : ''}</span></div>${items.map((rec) => `<div class="ap-item"><div class="ap-item-head"><strong>${escapeHtml(rec.issueTitle)}</strong><span class="ap-category">${escapeHtml(rec.category)}</span></div><div class="ap-item-body"><div class="ap-row"><span class="ap-label">What's wrong</span><p>${escapeHtml(rec.plainEnglishExplanation)}</p></div><div class="ap-row"><span class="ap-label">Why it matters</span><p>${escapeHtml(rec.whyItMatters)}</p></div><div class="ap-row"><span class="ap-label">How to fix it</span><p>${escapeHtml(rec.recommendedFix)}</p></div>${rec.copyPasteFix ? `<div class="ap-row"><span class="ap-label">Copy-paste fix</span><div class="ap-code-wrap"><code class="ap-code">${escapeHtml(rec.copyPasteFix)}</code><button class="ap-copy-btn" type="button" data-copy-fix="${escapeHtml(rec.copyPasteFix)}">Copy</button></div></div>` : ''}</div></div>`).join('')}</div>`;
  };
  return renderGroup('Critical', criticals, 'sev-critical') + renderGroup('Needs attention', highs, 'sev-high');
}

function renderClientReport(data) {
  const checks = Array.isArray(data.checks) ? data.checks : [];
  const recommendations = Array.isArray(data.recommendations) ? data.recommendations : [];
  const score = Number(data.score || data.seo_score || 0);
  const scanDate = new Date().toLocaleString();
  const url = data.final_url || data.analyzed_url || '';
  const ssl = data.ssl;
  const domain = data.domain_expiry;
  const failCount = checks.filter((c) => c.level === 'fail').length;
  const warnCount = checks.filter((c) => c.level === 'warning').length;
  const passCount = checks.filter((c) => c.level === 'pass').length;
  const scoreColor = score >= 80 ? 'var(--green)' : score >= 60 ? 'var(--amber)' : 'var(--red)';

  const metaChecks = checks.filter((c) => c.category === 'seo');
  const contentChecks = checks.filter((c) => c.category === 'content');
  const techChecks = checks.filter((c) => ['uptime', 'security', 'domain'].includes(c.category));
  const insights = data.insights || {};
  const opportunities = Array.isArray(insights.content_opportunities) ? insights.content_opportunities : [];
  const plan = insights.optional_content_plan || null;

  const checkRow = (check) => `<tr class="rpt-check-row rpt-${check.level}"><td>${escapeHtml(check.title)}</td><td><span class="level-badge ${check.level}">${escapeHtml(check.level)}</span></td><td>${escapeHtml(String(check.value || ''))}</td><td>${escapeHtml(check.recommendation)}</td></tr>`;

  const sectionTable = (items) => items.length ? `<table class="rpt-table"><thead><tr><th>Check</th><th>Status</th><th>Value</th><th>Recommendation</th></tr></thead><tbody>${items.map(checkRow).join('')}</tbody></table>` : '<p class="rpt-empty">No issues found in this area.</p>';

  const recItems = recommendations.slice(0, 10).map((rec, i) => `<div class="rpt-rec-item"><div class="rpt-rec-head"><span class="rpt-rec-num">${i + 1}</span><div><strong>${escapeHtml(rec.issueTitle)}</strong><span class="ap-severity sev-${rec.severity}">${escapeHtml(rec.severity)}</span></div></div><p>${escapeHtml(rec.recommendedFix)}</p></div>`).join('');

  return `<div class="client-report" id="clientReport">
    <div class="rpt-header">
      <div class="rpt-header-brand">
        <span class="brand-mark"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h3l2-7 4 14 2-7h5"/></svg></span>
        <strong>SiteTrace</strong>
        <span class="rpt-header-label">Website Health Report</span>
      </div>
      <div class="rpt-header-meta">
        <strong style="color:var(--text);font-size:.95rem;">${escapeHtml(url)}</strong>
        <span>Scanned: ${escapeHtml(scanDate)}</span>
      </div>
    </div>
    <div class="rpt-score-row">
      <div class="rpt-score-block">
        <div class="rpt-score-ring" style="background:conic-gradient(${scoreColor} 0 ${score}%, var(--line) ${score}% 100%)"><span>${score}</span></div>
        <div><strong>Overall Health Score</strong><p>${score >= 80 ? 'Good — keep monitoring' : score >= 60 ? 'Fair — some issues need attention' : 'Poor — critical issues found'}</p></div>
      </div>
      <div class="rpt-score-pills">
        <div class="rpt-pill rpt-pill-fail"><strong>${failCount}</strong><span>Critical</span></div>
        <div class="rpt-pill rpt-pill-warn"><strong>${warnCount}</strong><span>Warnings</span></div>
        <div class="rpt-pill rpt-pill-pass"><strong>${passCount}</strong><span>Passing</span></div>
      </div>
    </div>
    <div class="rpt-overview">
      <div class="rpt-overview-card"><span class="rpt-ov-label">Response time</span><strong>${escapeHtml(data.response_time || '-')}</strong></div>
      <div class="rpt-overview-card"><span class="rpt-ov-label">HTTP status</span><strong>${escapeHtml(String(data.status_code || '-'))}</strong></div>
      <div class="rpt-overview-card"><span class="rpt-ov-label">Page size</span><strong>${data.page_size_bytes ? Math.round(data.page_size_bytes / 1024) + 'KB' : '-'}</strong></div>
      <div class="rpt-overview-card"><span class="rpt-ov-label">Word count</span><strong>${escapeHtml(String(data.word_count || '-'))}</strong></div>
      <div class="rpt-overview-card"><span class="rpt-ov-label">SSL expires</span><strong>${ssl && ssl.days_remaining !== null ? ssl.days_remaining + 'd' : '-'}</strong></div>
      <div class="rpt-overview-card"><span class="rpt-ov-label">Domain expires</span><strong>${domain && domain.days_remaining !== null ? domain.days_remaining + 'd' : '-'}</strong></div>
    </div>
    <div class="rpt-section">
      <h3 class="rpt-section-title">Priority Action Plan</h3>
      ${recommendations.length ? recItems : '<p class="rpt-empty">No open issues found.</p>'}
    </div>
    ${(insights.executive_summary || opportunities.length) ? `<div class="rpt-section">
      <h3 class="rpt-section-title">Executive Audit Insights</h3>
      ${insights.executive_summary ? `<p class="rpt-empty" style="text-align:left;">${escapeHtml(insights.executive_summary)}</p>` : ''}
      ${opportunities.length ? `<table class="rpt-table"><thead><tr><th>Priority</th><th>Topic / Page Idea</th><th>Primary Keyword</th><th>Supporting Keywords</th><th>Intent</th></tr></thead><tbody>${opportunities.map((item) => `<tr>
        <td>${escapeHtml(item.priority || 'Medium')}</td>
        <td>${escapeHtml(item.title || '')}</td>
        <td>${escapeHtml(item.primary_keyword || '')}</td>
        <td>${escapeHtml(Array.isArray(item.supporting_keywords) ? item.supporting_keywords.join(', ') : item.supporting_keywords || '')}</td>
        <td>${escapeHtml(item.intent || '')}</td>
      </tr>`).join('')}</tbody></table>` : ''}
      ${plan ? `<p class="rpt-empty" style="text-align:left;margin-top:10px;"><strong>Optional plan:</strong> ${escapeHtml(plan.phase_1 || '')} ${escapeHtml(plan.phase_2 || '')} ${escapeHtml(plan.phase_3 || '')}</p>` : ''}
    </div>` : ''}
    <div class="rpt-section">
      <h3 class="rpt-section-title">Metadata &amp; SEO</h3>
      ${sectionTable(metaChecks)}
    </div>
    <div class="rpt-section">
      <h3 class="rpt-section-title">Content</h3>
      ${sectionTable(contentChecks)}
    </div>
    <div class="rpt-section">
      <h3 class="rpt-section-title">Technical &amp; Security</h3>
      ${sectionTable(techChecks)}
    </div>
    <div class="rpt-footer">
      <p>Generated by SiteTrace — Website health monitoring for agencies and site owners. &copy; ${new Date().getFullYear()} SiteTrace</p>
    </div>
  </div>`;
}

function renderResults(data) {
  const target = document.getElementById('results');
  if (!target) return;

  const checks = Array.isArray(data.checks) ? data.checks : [];
  const sorted = [...checks].sort((a, b) => ({ fail: 0, warning: 1, pass: 2 }[a.level] - { fail: 0, warning: 1, pass: 2 }[b.level]));
  const score = Number(data.score || data.seo_score || 0);
  const failCount = checks.filter((c) => c.level === 'fail').length;
  const warnCount  = checks.filter((c) => c.level === 'warning').length;

  // Free tier: top 3 issues only
  const topIssues = sorted.filter((c) => c.level !== 'pass').slice(0, 3);
  const sslCheck   = checks.find((c) => c.category === 'domain' || c.title?.toLowerCase().includes('ssl'));
  const domainDays = data.domain_expiry && data.domain_expiry.days_remaining != null ? `${data.domain_expiry.days_remaining}d` : '–';
  const uptime     = checks.some((c) => c.category === 'uptime' && c.level === 'fail') ? 'Issue' : 'Online';
  const sslStatus  = sslCheck && sslCheck.level === 'fail' ? 'Issue' : 'Valid';
  const scoreColor = score >= 80 ? 'var(--green)' : score >= 60 ? 'var(--amber)' : 'var(--red)';

  const topIssueHtml = topIssues.length
    ? topIssues.map((c) => `
      <div class="free-issue-row">
        <svg viewBox="0 0 24 24" class="icon-${c.level === 'fail' ? 'red' : 'amber'}" style="width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;flex-shrink:0;margin-top:2px;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <div>
          <strong>${escapeHtml(c.title)}</strong>
          <p style="margin:2px 0 0;font-size:.82rem;color:var(--muted);">${escapeHtml(c.recommendation)}</p>
        </div>
        <span class="level-badge ${c.level}" style="flex-shrink:0;">${escapeHtml(c.level)}</span>
      </div>`)
      .join('')
    : `<div class="free-issue-row"><svg viewBox="0 0 24 24" style="width:16px;height:16px;fill:none;stroke:var(--green);stroke-width:2;stroke-linecap:round;"><polyline points="20 6 9 17 4 12"/></svg><strong>No critical issues found — site looks healthy.</strong></div>`;

  target.innerHTML = `
    <div class="free-result-shell">

      <!-- Score header -->
      <div class="free-result-header">
        <div class="free-result-site">
          <svg viewBox="0 0 24 24" style="width:20px;height:20px;fill:none;stroke:var(--muted);stroke-width:2;stroke-linecap:round;flex-shrink:0;"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
          <span>${escapeHtml(data.final_url || data.analyzed_url)}</span>
        </div>
        <p class="eyebrow compact" style="margin-bottom:4px;">Free website health check</p>
      </div>

      <!-- Score + basics -->
      <div class="free-result-body">
        <div class="free-score-block">
          <div class="score-ring" style="background:conic-gradient(${scoreColor} 0 ${score}%, var(--bg-muted) ${score}% 100%);width:88px;height:88px;"><span style="font-size:1.5rem;">${score}</span></div>
          <div>
            <div style="font-size:1.1rem;font-weight:700;">Health Score</div>
            <div style="font-size:.85rem;color:var(--muted);margin-top:2px;">${failCount} critical · ${warnCount} warnings</div>
          </div>
        </div>

        <div class="free-basics-row">
          <div class="free-basic-card">
            <svg viewBox="0 0 24 24" style="width:18px;height:18px;fill:none;stroke:${uptime === 'Online' ? 'var(--green)' : 'var(--red)'};stroke-width:2;stroke-linecap:round;"><path d="M22 12h-4l-3 8L9 4l-3 8H2"/></svg>
            <div>
              <div class="free-basic-label">Uptime</div>
              <div class="free-basic-val" style="color:${uptime === 'Online' ? 'var(--green)' : 'var(--red)'};">${uptime}</div>
            </div>
          </div>
          <div class="free-basic-card">
            <svg viewBox="0 0 24 24" style="width:18px;height:18px;fill:none;stroke:${sslStatus === 'Valid' ? 'var(--green)' : 'var(--red)'};stroke-width:2;stroke-linecap:round;"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            <div>
              <div class="free-basic-label">SSL</div>
              <div class="free-basic-val" style="color:${sslStatus === 'Valid' ? 'var(--green)' : 'var(--red)'};">${sslStatus}</div>
            </div>
          </div>
          <div class="free-basic-card">
            <svg viewBox="0 0 24 24" style="width:18px;height:18px;fill:none;stroke:var(--muted);stroke-width:2;stroke-linecap:round;"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>
            <div>
              <div class="free-basic-label">Domain</div>
              <div class="free-basic-val">${domainDays}</div>
            </div>
          </div>
          <div class="free-basic-card">
            <svg viewBox="0 0 24 24" style="width:18px;height:18px;fill:none;stroke:var(--muted);stroke-width:2;stroke-linecap:round;"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
            <div>
              <div class="free-basic-label">Response</div>
              <div class="free-basic-val">${escapeHtml(data.response_time || '–')}</div>
            </div>
          </div>
        </div>

        <!-- Top 3 issues -->
        <div class="free-issues-block">
          <div class="free-section-head">
            <strong>Top issues found</strong>
            <span class="level-badge ${failCount > 0 ? 'fail' : warnCount > 0 ? 'warning' : 'pass'}">${failCount + warnCount} total</span>
          </div>
          ${topIssueHtml}
        </div>

        <!-- Locked: full breakdown -->
        <div class="free-locked-section">
          <div class="free-locked-inner">
            <svg viewBox="0 0 24 24" style="width:22px;height:22px;fill:none;stroke:var(--muted);stroke-width:2;stroke-linecap:round;margin-bottom:8px;"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            <strong>Full technical breakdown</strong>
            <p>SEO, security headers, content checks, and ${checks.length - 3} more issues are hidden. Available in Starter.</p>
          </div>
        </div>

        <!-- Locked: change history -->
        <div class="free-locked-section">
          <div class="free-locked-inner">
            <svg viewBox="0 0 24 24" style="width:22px;height:22px;fill:none;stroke:var(--muted);stroke-width:2;stroke-linecap:round;margin-bottom:8px;"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>
            <strong>Response time graph &amp; check history</strong>
            <p>See how this site has performed over time. Available in Starter.</p>
          </div>
        </div>

        <!-- Locked: client report -->
        <div class="free-locked-section">
          <div class="free-locked-inner">
            <svg viewBox="0 0 24 24" style="width:22px;height:22px;fill:none;stroke:var(--muted);stroke-width:2;stroke-linecap:round;margin-bottom:8px;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            <strong>Client-ready report</strong>
            <p>Share a professional health summary with clients. Available in Agency.</p>
          </div>
        </div>

        <!-- CTA -->
        <div class="free-result-cta">
          <div>
            <strong>Start monitoring this site automatically</strong>
            <p>Get alerts the moment something breaks, and show clients proof of active monitoring.</p>
          </div>
          <div style="display:flex;gap:10px;flex-wrap:wrap;">
            <a class="button" href="/signin">Create free account</a>
            <a class="button secondary" href="/pricing">See plans</a>
          </div>
        </div>

      </div>
    </div>`;

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

  // Don't auto-redirect if this is a recovery flow (OTP hash or PKCE code)
  const hashParams2 = Object.fromEntries(new URLSearchParams(window.location.hash.slice(1)));
  const isRecoveryFlow = new URLSearchParams(window.location.search).has('code') || hashParams2.type === 'recovery';
  if (state.session && !isRecoveryFlow) {
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
  const sitesResponse = await fetch(apiPath('/api/sites'), { headers: authHeaders() });
  const sitesData = await sitesResponse.json();
  if (!sitesResponse.ok) throw new Error(sitesData.message || 'Could not load sites');
  state.sites = sitesData.sites || [];
  if (!state.selectedSiteId && state.sites.length) state.selectedSiteId = state.sites[0].id;
  if (state.selectedSiteId && !state.sites.some((site) => site.id === state.selectedSiteId)) {
    state.selectedSiteId = state.sites.length ? state.sites[0].id : null;
  }
  if (state.selectedSiteId) await loadSelectedChecks();
  await loadAlerts();
  renderDashboard();
}

function severityClass(severity) {
  if (severity === 'critical') return 'down';
  if (severity === 'high') return 'warning';
  if (severity === 'info') return 'online';
  return 'warning';
}

function alertIcon(type) {
  if (type === 'resolved') return `<svg viewBox="0 0 24 24" class="icon-green"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;
  if (type === 'down') return `<svg viewBox="0 0 24 24" class="icon-red"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`;
  return `<svg viewBox="0 0 24 24" class="icon-amber"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
}

async function loadAlerts() {
  if (!state.session || !state.supabase) return [];
  try {
    const res = await fetch(apiPath('/api/alerts?limit=30'), { headers: authHeaders() });
    if (!res.ok) return [];
    const data = await res.json();
    state.alerts = data.alerts || [];
    state.alertsUnread = data.unread || 0;
    return state.alerts;
  } catch (e) {
    return [];
  }
}

function renderAlertCenter() {
  const target = document.getElementById('alertCenterPanel');
  if (!target) return;
  const alerts = state.alerts || [];
  const unread = state.alertsUnread || 0;
  const hasAlerts = alerts.length > 0;
  target.innerHTML = `
    <div class="alert-center-wrap">
      <div class="alert-center-head">
        <div style="display:flex;align-items:center;gap:8px;">
          <svg viewBox="0 0 24 24" style="width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
          <strong>${escapeHtml(t('dashboard.alertCenter'))}</strong>
          ${unread > 0 ? `<span class="alert-badge">${unread}</span>` : ''}
        </div>
        ${hasAlerts ? `<button class="link-button small" id="markAlertsReadBtn" type="button">${escapeHtml(t('dashboard.alertMarkRead'))}</button>` : ''}
      </div>
      <p class="alert-center-tagline">${escapeHtml(t('dashboard.alertCenterDesc'))}</p>
      <div class="alert-list">
        ${hasAlerts
          ? alerts.slice(0, 20).map((alert) => `
            <div class="alert-row ${alert.read ? 'read' : 'unread'}" data-alert-id="${alert.id}">
              <div class="alert-icon">${alertIcon(alert.type)}</div>
              <div class="alert-body">
                <div class="alert-title">${escapeHtml(alert.title)}</div>
                <div class="alert-msg">${escapeHtml(alert.message)}</div>
                <div class="alert-time">${formatDateTime(alert.created_at)}</div>
              </div>
              ${!alert.read ? '<span class="alert-unread-dot"></span>' : ''}
            </div>`).join('')
          : `<div class="alert-empty">${escapeHtml(t('dashboard.alertCenterEmpty'))}</div>`}
      </div>
    </div>`;

  const markBtn = document.getElementById('markAlertsReadBtn');
  if (markBtn) {
    markBtn.addEventListener('click', async () => {
      markBtn.disabled = true;
      try {
        await fetch(apiPath('/api/alerts/read-all'), { method: 'PATCH', headers: authHeaders() });
        state.alerts = (state.alerts || []).map((a) => ({ ...a, read: true }));
        state.alertsUnread = 0;
        renderAlertCenter();
      } catch (e) {
        markBtn.disabled = false;
      }
    });
  }
}

function renderAlertStatus() {
  // Alert center is now the primary notification surface (see renderAlertCenter)
  // This function kept for compatibility; alert status panel is hidden
  const target = document.getElementById('alertStatusPanel');
  if (target) target.innerHTML = '';
}

function renderSidebarPlanUsage() {
  const target = document.getElementById('sidebarPlanUsage');
  if (!target || !state.limits) return;
  const used = Number(state.usage && state.usage.sites !== undefined ? state.usage.sites : state.sites.length);
  const max = Number.isFinite(Number(state.limits.sites)) ? Number(state.limits.sites) : 0;
  const interval = Number(state.limits.interval_minutes || 60);
  const reached = max > 0 && used >= max;
  const cadence = planIntervalLabel();
  const pct = max > 0 ? Math.min(100, Math.round((used / max) * 100)) : 0;
  const upgrade = planUpgradeTarget();
  target.innerHTML = `
    <div class="plan-usage-card">
      <div class="plan-usage-head">
        <span style="text-transform:capitalize;">${escapeHtml(state.plan || 'free')}</span>
        <span style="font-weight:400;color:var(--muted);font-size:.8rem;">${used}/${max} sites</span>
      </div>
      <div class="plan-usage-bar"><div class="plan-usage-fill${reached ? ' over' : ''}" style="width:${pct}%"></div></div>
      <div style="display:flex;justify-content:space-between;align-items:center;font-size:.8rem;color:var(--muted);">
        <span>${escapeHtml(cadence)}</span>
        ${upgrade ? `<button class="link-button small" type="button" data-dashboard-upgrade="${upgrade}" style="font-size:.78rem;">Upgrade</button>` : ''}
      </div>
      ${reached && upgrade ? `<p class="plan-usage-note" style="margin-top:6px;">${escapeHtml(t('dashboard.limitReached'))}</p>` : ''}
    </div>`;
}

function renderDashboard() {
  renderAlertCenter();
  // Keep alert center hidden unless alerts panel is active
  const _acp = document.getElementById('alertCenterPanel');
  if (_acp && state.dashboardPanel !== 'alerts') _acp.style.display = 'none';
  renderPlanUsage();
  renderPaidFeaturePanel();
  renderEmailDnsPanel();
  renderSidebarPlanUsage();

  const list = document.getElementById('sitesList');
  if (!list) return;

  if (!state.sites.length) {
    list.innerHTML = `<div style="padding:10px 4px;font-size:.85rem;color:var(--muted);">${escapeHtml(t('dashboard.noSites'))}</div>`;
    renderSiteDetail(null);
    return;
  }
  list.innerHTML = state.sites.map((site) => {
    const active = site.id === state.selectedSiteId ? ' active' : '';
    const status = statusLabel(site.last_status);
    const dotCls = status === 'online' ? '' : status;
    const scoreStr = site.last_score ? `${site.last_score}/100` : '–';
    return `<button class="db-site-card${active}" type="button" data-select="${site.id}">
      <div class="db-site-card-top">
        <span class="dot ${dotCls}"></span>
        <span class="db-site-card-name">${escapeHtml(site.name)}</span>
        <span class="db-site-card-score" style="color:${site.last_score >= 80 ? 'var(--green)' : site.last_score >= 60 ? 'var(--amber)' : site.last_score ? 'var(--red)' : 'var(--muted)'}">${scoreStr}</span>
      </div>
      <div class="db-site-card-url">${escapeHtml(site.url)}</div>
    </button>`;
  }).join('');
  // Preserve whatever panel the user was on — don't always reset to overview
  const currentPanel = state.dashboardPanel || 'overview';
  if (currentPanel === 'overview') {
    renderSiteDetail(state.sites.find((site) => site.id === state.selectedSiteId));
  } else {
    renderPanel(currentPanel);
  }
}

async function runSiteCheck(siteId) {
  const detail = document.getElementById('siteDetail');
  if (detail) detail.classList.add('is-loading');
  setDashboardMessage(t('dashboard.running'));
  const response = await fetch(apiPath('/api/run-site-check'), { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify({ site_id: siteId, locale: currentLocale }) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || 'Check failed');
  await loadDashboard();
  if (data.incident && data.incident.pending_confirmation) {
    setDashboardMessage(t('dashboard.pendingIncident'));
  } else if (data.incident && data.incident.incident) {
    setDashboardMessage(t('dashboard.completed') + ' Alert recorded in your Alert Center.', 'success');
  } else {
    setDashboardMessage(t('dashboard.completed'));
  }
  // Store last scan timestamp for cooldown
  localStorage.setItem('st_last_scan_' + siteId, String(Date.now()));
}

async function deleteMonitor(siteId) {
  if (!siteId) return;
  if (!window.confirm(t('dashboard.deleteConfirm'))) return;
  const response = await fetch(apiPath(`/api/sites/${siteId}`), { method: 'DELETE', headers: authHeaders() });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || 'Could not delete monitor');
  await loadDashboard();
  setDashboardMessage(t('dashboard.saved'), 'success');
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
      const dmarcHint = data.email_dns_guidance ? ` ${t('dashboard.emailDnsTitle')}` : '';
      throw new Error(`${data.message || 'Test email failed'}${reason}${dmarcHint}`);
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
  const response = await fetch(apiPath(`/api/sites/${state.selectedSiteId}/checks?limit=50`), { headers: authHeaders() });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || 'Could not load checks');
  state.selectedChecks = data.checks || [];
}

async function showHistory(siteId) {
  const response = await fetch(apiPath(`/api/sites/${siteId}/checks?limit=10`), { headers: authHeaders() });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || 'Could not load checks');
  const data = payload.checks || [];
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

// ── Demo: simulated response-time bars for each site
const demoRespBars = {
  'Northstar Dental': [210,195,230,188,200,220,190,215,205,188,200,212],
  'Atlas Roofing':    [1200,1400,1840,1650,1800,1920,1400,1600,1840,1700,1500,1840],
  'Luma Studio':      [310,280,null,null,null,null,null,null,null,null,null,null]
};
const demoRecentChecks = {
  'Northstar Dental': [
    { time: '2:41 PM', trigger: 'Scheduled', status: 'online', score: 94, ms: 212, issues: 0 },
    { time: '2:36 PM', trigger: 'Scheduled', status: 'online', score: 94, ms: 200, issues: 0 },
    { time: '2:31 PM', trigger: 'Scheduled', status: 'online', score: 94, ms: 195, issues: 0 }
  ],
  'Atlas Roofing': [
    { time: '2:38 PM', trigger: 'Scheduled', status: 'warning', score: 71, ms: 1840, issues: 2 },
    { time: '2:33 PM', trigger: 'Scheduled', status: 'warning', score: 71, ms: 1700, issues: 2 },
    { time: '2:28 PM', trigger: 'Scheduled', status: 'online', score: 82, ms: 950, issues: 1 }
  ],
  'Luma Studio': [
    { time: '2:43 PM', trigger: 'Scheduled', status: 'down', score: 18, ms: null, issues: 2 },
    { time: '2:38 PM', trigger: 'Scheduled', status: 'down', score: 18, ms: null, issues: 2 },
    { time: '2:33 PM', trigger: 'Scheduled', status: 'down', score: 22, ms: null, issues: 2 }
  ]
};

function demoBuildRespChart(bars) {
  const valid = bars.filter(Boolean);
  if (!valid.length) return '<div class="empty subtle" style="padding:20px;font-size:.85rem;">No response data — site is unreachable.</div>';
  const max = Math.max(...valid);
  return `<div class="response-chart" style="height:80px;">${bars.map((v, i) => {
    const h = v ? Math.max(5, Math.round((v / max) * 100)) : 0;
    const cls = !v ? 'down' : v > 1500 ? 'slow' : '';
    return `<div class="resp-bar-col" title="${v ? v + 'ms' : 'down'}"><div class="resp-bar ${cls}" style="height:${h}%"></div></div>`;
  }).join('')}</div>`;
}

function demoBuildRecentChecks(rows) {
  return `<table class="checks-table">
    <thead><tr><th>Time</th><th>Trigger</th><th>Status</th><th>Score</th><th>Response</th><th>Issues</th></tr></thead>
    <tbody>${rows.map((r) => `<tr>
      <td>${r.time}</td>
      <td><span style="font-size:.78rem;color:var(--muted);">${r.trigger}</span></td>
      <td><span class="dot ${r.status === 'online' ? '' : r.status}" style="width:8px;height:8px;display:inline-block;vertical-align:middle;margin-right:5px;"></span>${r.status}</td>
      <td style="color:${r.score >= 80 ? 'var(--green)' : r.score >= 60 ? 'var(--amber)' : 'var(--red)'};">${r.score}/100</td>
      <td>${r.ms ? r.ms + 'ms' : '—'}</td>
      <td>${r.issues > 0 ? `<span class="level-badge ${r.issues > 1 ? 'fail' : 'warning'}">${r.issues} issue${r.issues > 1 ? 's' : ''}</span>` : '<span class="level-badge pass">clear</span>'}</td>
    </tr>`).join('')}</tbody>
  </table>`;
}

function renderDemoSiteDetail(site, root) {
  const bars    = demoRespBars[site.name] || [];
  const checks  = demoRecentChecks[site.name] || [];
  const status  = site.status;
  const statusLabel2 = status === 'online' ? 'Healthy' : status === 'warning' ? 'Warning' : 'Critical';
  const uptime  = status === 'online' ? '99.99%' : status === 'warning' ? '98.2%' : '61.0%';
  const avgMs   = bars.filter(Boolean).length ? Math.round(bars.filter(Boolean).reduce((a, b) => a + b, 0) / bars.filter(Boolean).length) + 'ms' : '–';
  const ssl     = status === 'down' ? 'Error' : status === 'warning' ? '14 days' : '245 days';

  const silentIssues = site.issues.filter((i) => i[0] !== 'fail' || site.status !== 'down').slice(0, 2);
  const incidents    = site.status !== 'online'
    ? [{ icon: 'red', text: site.issues[0] ? site.issues[0][1] : 'Issue detected', detail: site.issues[0] ? site.issues[0][2] : '' }]
    : [
      { icon: 'green', text: 'Resolved: SSL Certificate Renewed', detail: 'Certificate was successfully updated.' },
      { icon: 'green', text: 'Resolved: Response Time Spike', detail: 'Response time returned to normal.' }
    ];

  root.innerHTML = `
    <div class="demo-detail-view">
      <button class="button secondary small" id="demoBackBtn" type="button" style="margin-bottom:20px;">← Back to overview</button>

      <div class="db-content-header" style="margin-bottom:20px;">
        <div class="db-site-title">
          <svg viewBox="0 0 24 24" class="db-globe-icon"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
          <span class="db-site-name">${escapeHtml(site.name)}</span>
          <span class="db-status-badge ${status}">${statusLabel2}</span>
        </div>
        <div class="db-header-actions">
          <span class="scan-interval-badge">Agency · Every 1 min</span>
          <a class="button small" href="/signin">Start Monitoring</a>
        </div>
      </div>

      <!-- Scan proof -->
      <div class="scan-proof-bar" style="margin-bottom:20px;">
        <span>Last scan: <strong>${checks[0] ? checks[0].time : '2:41 PM'}</strong></span>
        <span>·</span>
        <span>Next scan in <strong id="demoCountdown">00:38</strong></span>
      </div>

      <!-- 4 metric cards -->
      <div class="detail-metrics" style="grid-template-columns:repeat(4,1fr);margin-bottom:20px;">
        <div class="dash-card">
          <span class="muted" style="font-size:.8rem;">Health Score</span>
          <h3 style="color:${site.score >= 80 ? 'var(--green)' : site.score >= 60 ? 'var(--amber)' : 'var(--red)'};">${site.score}/100</h3>
        </div>
        <div class="dash-card">
          <span class="muted" style="font-size:.8rem;">Uptime (30d)</span>
          <h3>${uptime}</h3>
        </div>
        <div class="dash-card">
          <span class="muted" style="font-size:.8rem;">Avg Response</span>
          <h3>${avgMs}</h3>
        </div>
        <div class="dash-card">
          <span class="muted" style="font-size:.8rem;">SSL / Domain</span>
          <h3 style="color:${ssl === 'Error' ? 'var(--red)' : ssl.includes('14') ? 'var(--amber)' : 'var(--green)'};">${ssl}</h3>
        </div>
      </div>

      <!-- Response time chart -->
      <div class="response-chart-wrap" style="margin-bottom:20px;">
        <div class="response-chart-head">
          <span>Response Time</span>
          <span style="font-size:.78rem;color:var(--muted);">24 hours ago → Now</span>
        </div>
        ${demoBuildRespChart(bars)}
      </div>

      <!-- Issues + Incidents -->
      <div class="detail-grid" style="margin-bottom:20px;">
        <div class="detail-panel">
          <div class="detail-panel-head">
            <span>Latest Silent Issues</span>
            <span class="level-badge ${silentIssues.length ? 'warning' : 'pass'}">${silentIssues.length} Open</span>
          </div>
          ${silentIssues.length
            ? silentIssues.map((i) => `<div class="issue-row">
                <svg viewBox="0 0 24 24" class="icon-${i[0] === 'fail' ? 'red' : 'amber'}"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                <div><strong>${escapeHtml(i[1])}</strong><p class="meta">${escapeHtml(i[2])}</p></div>
              </div>`).join('')
            : '<div class="empty subtle" style="padding:16px 20px;">No silent issues detected.</div>'}
        </div>
        <div class="detail-panel">
          <div class="detail-panel-head">
            <span>Recent Incidents</span>
          </div>
          ${incidents.map((inc) => `<div class="incident-row">
            <svg viewBox="0 0 24 24" class="icon-${inc.icon}"><circle cx="12" cy="12" r="10"/>${inc.icon === 'green' ? '<polyline points="9 11 12 14 22 4"/>' : '<line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>'}</svg>
            <div><strong>${escapeHtml(inc.text)}</strong><p class="meta">${escapeHtml(inc.detail)}</p></div>
          </div>`).join('')}
        </div>
      </div>

      <!-- Recent checks table -->
      <div class="detail-panel" style="margin-bottom:24px;">
        <div class="detail-panel-head"><span>Recent Checks</span></div>
        <div style="overflow-x:auto;padding:0 4px;">
          ${demoBuildRecentChecks(checks)}
        </div>
      </div>

      <!-- CTA -->
      <div class="free-result-cta">
        <div>
          <strong>This is a demo — your real sites need real monitoring</strong>
          <p>Create a free account and add your first monitor in under 60 seconds.</p>
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <a class="button" href="/signin">Start monitoring free</a>
          <a class="button secondary" href="/pricing">Compare plans</a>
        </div>
      </div>
    </div>`;

  // Live countdown demo
  let remaining = 38;
  const countdownEl = document.getElementById('demoCountdown');
  const tick = () => {
    remaining = remaining > 0 ? remaining - 1 : 59;
    if (countdownEl) countdownEl.textContent = `00:${String(remaining).padStart(2, '0')}`;
  };
  const intervalId = setInterval(tick, 1000);

  document.getElementById('demoBackBtn').addEventListener('click', () => {
    clearInterval(intervalId);
    renderDemo();
  });
}

function renderDemo() {
  const root = document.getElementById('demoRoot');
  if (!root) return;

  const criticalCount = demoSites.filter((s) => s.status === 'down').length;
  const avgUptime = '99.98';

  const scoreCls = (n) => n >= 90 ? 'var(--green)' : n >= 70 ? 'var(--amber)' : 'var(--red)';
  const respCls  = (ms) => !ms ? 'var(--red)' : ms > 1500 ? 'var(--amber)' : 'var(--text)';
  const sslVal   = (s) => s.status === 'down' ? 'Error' : s.status === 'warning' ? '14 days' : '245 days';
  const sslColor = (s) => s.status === 'down' ? 'var(--red)' : s.status === 'warning' ? 'var(--amber)' : 'var(--green)';

  const siteCardsHtml = demoSites.map((site) => {
    const statusLabel2 = site.status === 'online' ? 'Healthy' : site.status === 'warning' ? 'Warning' : 'Critical';
    const topIssue = site.issues[0];
    const alertHtml = topIssue ? `
      <div class="demo-site-alert ${topIssue[0]}">
        <svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;flex-shrink:0;"><circle cx="12" cy="12" r="10"/>${topIssue[0] === 'fail' ? '<line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>' : '<line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>'}</svg>
        <span><strong>${escapeHtml(topIssue[1])}:</strong> ${escapeHtml(topIssue[2])}</span>
      </div>` : '';

    return `
      <div class="demo-site-card ${site.status !== 'online' ? site.status : ''}">
        <div class="demo-site-row">
          <div class="demo-site-identity">
            <div class="demo-site-globe ${site.status}">
              <svg viewBox="0 0 24 24" style="width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
            </div>
            <div>
              <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                <strong style="font-size:.95rem;">${escapeHtml(site.name)}</strong>
                <span class="db-status-badge ${site.status}">${statusLabel2}</span>
              </div>
              <div style="font-size:.78rem;color:var(--muted);margin-top:2px;">Last checked: ${site.lastCheck} ago</div>
            </div>
          </div>
          <div class="demo-site-metrics">
            <div class="demo-metric-col">
              <div class="demo-metric-label">Health Score</div>
              <div class="demo-metric-val" style="color:${scoreCls(site.score)};">${site.score}</div>
            </div>
            <div class="demo-metric-col">
              <div class="demo-metric-label">Response</div>
              <div class="demo-metric-val" style="color:${respCls(site.response)};">${site.response ? site.response + 'ms' : 'Timeout'}</div>
            </div>
            <div class="demo-metric-col">
              <div class="demo-metric-label">SSL</div>
              <div class="demo-metric-val" style="color:${sslColor(site)};">${sslVal(site)}</div>
            </div>
          </div>
          <button class="button small secondary" type="button" data-demo-detail="${site.name}" style="flex-shrink:0;">Details ↗</button>
        </div>
        ${alertHtml}
      </div>`;
  }).join('');

  root.innerHTML = `
    <div class="demo-overview">
      <div class="demo-header">
        <div>
          <h1 style="font-size:clamp(1.5rem,3vw,2rem);margin-bottom:4px;">Client Sites Overview</h1>
          <p style="color:var(--muted);margin:0;font-size:.9rem;">Demo dashboard showing sample client monitoring.</p>
        </div>
        <div style="display:flex;gap:8px;">
          <a class="button secondary small" href="/signin">Add Site</a>
          <a class="button small" href="/signin">Generate Report</a>
        </div>
      </div>

      <div class="demo-stat-row">
        <div class="demo-stat-card">
          <div class="demo-stat-label">Total Sites</div>
          <div class="demo-stat-val">${demoSites.length}</div>
        </div>
        <div class="demo-stat-card">
          <div class="demo-stat-label">Critical Issues</div>
          <div class="demo-stat-val" style="color:${criticalCount > 0 ? 'var(--red)' : 'var(--green)'};">${criticalCount}</div>
        </div>
        <div class="demo-stat-card">
          <div class="demo-stat-label">Avg Uptime</div>
          <div class="demo-stat-val" style="color:var(--green);">${avgUptime}%</div>
        </div>
      </div>

      <div class="demo-sites-list">
        ${siteCardsHtml}
      </div>

      <div class="free-result-cta" style="margin-top:8px;">
        <div>
          <strong>Ready to protect your own client sites?</strong>
          <p>Create a free account and add your first monitor in under 60 seconds.</p>
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <a class="button" href="/signin">Start free</a>
          <a class="button secondary" href="/pricing">Compare plans</a>
        </div>
      </div>
    </div>`;
}

function initDemo() {
  if (page !== 'demo') return;
  renderDemo();
  document.getElementById('demoRoot').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-demo-detail]');
    if (!btn) return;
    const siteName = btn.dataset.demoDetail;
    const site = demoSites.find((s) => s.name === siteName);
    if (site) renderDemoSiteDetail(site, document.getElementById('demoRoot'));
  });
}

function syncContentHeader(site, status, reportText, reportLocked, reportUrl) {
  const nameEl      = document.getElementById('dbSelectedSiteName');
  const statusEl    = document.getElementById('dbSelectedSiteStatus');
  const copyBtn     = document.getElementById('copyReportBtn');
  const pingRefresh = document.getElementById('refreshPingBtn');
  const deleteBtn   = document.getElementById('deleteMonitorBtn');

  if (!site) {
    if (nameEl)      nameEl.textContent = 'Select a site';
    if (statusEl)    { statusEl.style.display = 'none'; statusEl.className = 'db-status-badge'; statusEl.textContent = ''; }
    if (copyBtn)     copyBtn.style.display = 'none';
    if (pingRefresh) pingRefresh.style.display = 'none';
    if (deleteBtn)   deleteBtn.style.display = 'none';
    return;
  }
  if (nameEl) nameEl.textContent = site.name;
  if (statusEl) {
    statusEl.style.display = '';
    statusEl.className = `db-status-badge ${status}`;
    statusEl.textContent = statusCopy(status);
  }
  if (copyBtn) {
    copyBtn.style.display = reportLocked ? 'none' : '';
  }
  if (pingRefresh) pingRefresh.style.display = '';
  if (deleteBtn) {
    deleteBtn.style.display = '';
    deleteBtn.dataset.delete = site.id;
  }
}


// ── LivePingChart ─────────────────────────────────────────────────────────────
// Real-time canvas ping chart. Polls /api/ping every 2s independently of scans.
class LivePingChart {
  constructor(canvas, opts = {}) {
    this.canvas    = canvas;
    this.ctx       = canvas.getContext('2d');
    this.url       = opts.url || '';
    this.maxPts    = opts.maxPts   || 120;   // 4 min at 2s
    this.pollMs    = opts.pollMs   || 2000;
    this.threshold = opts.threshold|| 800;
    this.points    = [];   // { ms:number|null, status:string, t:Date }
    this._timer    = null;
    this._raf      = null;
    this._pulse    = 0;
    this._ro       = null;
  }

  start() {
    this._resize();
    if (typeof ResizeObserver !== 'undefined') {
      this._ro = new ResizeObserver(() => this._resize());
      if (this.canvas.parentElement) this._ro.observe(this.canvas.parentElement);
    }
    this._poll();
    this._timer = setInterval(() => this._poll(), this.pollMs);
    this._frame();
  }

  stop() {
    if (this._timer)  clearInterval(this._timer);
    if (this._raf)    cancelAnimationFrame(this._raf);
    if (this._ro)     this._ro.disconnect();
    this._timer = this._raf = null;
  }

  _resize() {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const dpr = window.devicePixelRatio || 1;
    const w   = parent.clientWidth || 600;
    const h   = 190;
    this.canvas.width  = w * dpr;
    this.canvas.height = h * dpr;
    this.canvas.style.width  = w + 'px';
    this.canvas.style.height = h + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  async _poll() {
    const start = performance.now();
    const ac    = new AbortController();
    const timer = setTimeout(() => ac.abort(), 8000);
    try {
      // Route ping through backend to avoid browser CORS/firewall blocks on strict sites
      const res  = await fetch(apiPath('/api/ping?url=' + encodeURIComponent(this.url)), {
        headers: authHeaders ? authHeaders() : {},
        cache: 'no-store',
        signal: ac.signal
      });
      clearTimeout(timer);
      const data = res.ok ? await res.json() : null;
      if (data) {
        this._push({ ms: data.ms, status: data.status, t: new Date() });
      } else {
        const ms = Math.round(performance.now() - start);
        this._push({ ms, status: 'error', t: new Date() });
      }
    } catch (err) {
      clearTimeout(timer);
      const ms = Math.round(performance.now() - start);
      this._push({ ms: err.name === 'AbortError' ? null : ms, status: err.name === 'AbortError' ? 'timeout' : 'error', t: new Date() });
    }
  }

  _push(pt) {
    this.points.push(pt);
    if (this.points.length > this.maxPts) this.points.shift();
    this._updateStats();
  }

  _updateStats() {
    const valid    = this.points.filter(p => p.ms !== null).map(p => p.ms);
    const cur      = this.points.length ? this.points[this.points.length - 1] : null;
    const timeouts = this.points.filter(p => p.status === 'timeout' || p.status === 'error').length;
    const fmt      = ms => ms === null ? 'Timeout' : ms + 'ms';
    const col      = ms => ms === null ? 'var(--red)' : ms < 400 ? 'var(--green)' : ms < 800 ? 'var(--amber)' : 'var(--red)';

    const set = (id, text, color) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.textContent  = text;
      if (color !== undefined) el.style.color = color;
    };

    set('lpCurrent', cur ? fmt(cur.ms) : '–',  cur ? col(cur.ms) : '');
    set('lpAvg',  valid.length ? fmt(Math.round(valid.reduce((a,b)=>a+b,0)/valid.length)) : '–');
    set('lpMin',  valid.length ? fmt(Math.min(...valid)) : '–');
    set('lpMax',  valid.length ? fmt(Math.max(...valid)) : '–');
    set('lpTO',   String(timeouts), timeouts > 0 ? 'var(--red)' : '');

    const note = document.getElementById('lpTimeoutNote');
    if (note) {
      if (timeouts <= 0) {
        note.textContent = '';
        note.style.display = 'none';
      } else {
        note.style.display = 'block';
        note.textContent = cur && cur.ms !== null
          ? 'This incident has been resolved, please refresh the ping. Browser ping failures can be caused by local network issues, CORS/browser limits, upstream provider errors, or temporary service incidents.'
          : 'Browser ping failures detected. These can be caused by local network issues, CORS/browser limits, upstream provider errors, or temporary service incidents. Scheduled scans are the source of truth.';
      }
    }
  }

  _msColorHex(ms) {
    if (ms === null || ms >= 800) return '#ef4444';
    if (ms >= 400)                return '#f59e0b';
    return '#22c55e';
  }

  _frame() {
    this._raf    = requestAnimationFrame(() => this._frame());
    this._pulse  = (this._pulse + 0.07) % (Math.PI * 2);
    this._draw();
  }

  _draw() {
    const ctx    = this.ctx;
    const dpr    = window.devicePixelRatio || 1;
    const W      = this.canvas.width  / dpr;
    const H      = this.canvas.height / dpr;
    const PAD    = { top: 20, right: 18, bottom: 30, left: 46 };
    const cW     = W - PAD.left - PAD.right;
    const cH     = H - PAD.top  - PAD.bottom;
    const pts    = this.points;

    ctx.clearRect(0, 0, W, H);

    if (!pts.length) {
      ctx.fillStyle = 'rgba(148,163,184,0.5)';
      ctx.font      = '12px Inter,sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Pinging…', W / 2, H / 2);
      return;
    }

    const valid  = pts.filter(p => p.ms !== null).map(p => p.ms);
    const maxVal = valid.length ? Math.max(Math.max(...valid) * 1.2, 300) : 500;
    const range  = maxVal;

    const offset = this.maxPts - pts.length;
    const xOf    = i  => PAD.left + ((offset + i) / (this.maxPts - 1)) * cW;
    const yOf    = ms => PAD.top  + cH - (ms / range) * cH;

    // Grid lines + Y labels
    ctx.font      = '10px Inter,sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    [0, 0.25, 0.5, 0.75, 1].forEach(f => {
      const val = Math.round(f * maxVal);
      const y   = PAD.top + cH - f * cH;
      ctx.fillStyle   = 'rgba(148,163,184,0.45)';
      ctx.fillText(val + 'ms', PAD.left - 5, y);
      ctx.save();
      ctx.setLineDash([3, 5]);
      ctx.strokeStyle = 'rgba(148,163,184,0.12)';
      ctx.lineWidth   = 1;
      ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(PAD.left + cW, y); ctx.stroke();
      ctx.restore();
    });

    // Threshold line
    if (this.threshold <= maxVal) {
      const ty = yOf(this.threshold);
      ctx.save();
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = 'rgba(239,68,68,0.4)';
      ctx.lineWidth   = 1;
      ctx.beginPath(); ctx.moveTo(PAD.left, ty); ctx.lineTo(PAD.left + cW, ty); ctx.stroke();
      ctx.restore();
      ctx.fillStyle   = 'rgba(239,68,68,0.5)';
      ctx.textAlign   = 'left';
      ctx.fillText('⚠ ' + this.threshold + 'ms', PAD.left + 4, ty - 6);
    }

    // Build coords
    const coords = pts.map((p, i) => ({
      x: xOf(i), y: p.ms !== null ? yOf(p.ms) : null, ms: p.ms, status: p.status
    }));

    // Determine colour from last valid point
    const lastValid = [...pts].reverse().find(p => p.ms !== null);
    const col       = this._msColorHex(lastValid ? lastValid.ms : null);

    // Gradient fill
    const grad = ctx.createLinearGradient(0, PAD.top, 0, PAD.top + cH);
    const [r,g,b] = [parseInt(col.slice(1,3),16), parseInt(col.slice(3,5),16), parseInt(col.slice(5,7),16)];
    grad.addColorStop(0,   `rgba(${r},${g},${b},0.40)`);
    grad.addColorStop(0.55,`rgba(${r},${g},${b},0.12)`);
    grad.addColorStop(1,   `rgba(${r},${g},${b},0.00)`);

    const drawSmooth = (fill) => {
      let inPath = false;
      ctx.beginPath();
      for (let i = 0; i < coords.length; i++) {
        const c = coords[i];
        if (c.y === null) {
          if (inPath && fill) { ctx.lineTo(coords[i-1].x, PAD.top + cH); ctx.closePath(); }
          inPath = false;
          continue;
        }
        if (!inPath) {
          if (fill) ctx.moveTo(c.x, PAD.top + cH);
          ctx[fill ? 'lineTo' : 'moveTo'](c.x, c.y);
          inPath = true;
        } else {
          const prev = coords.slice(0, i).reverse().find(p => p.y !== null);
          if (prev) {
            const mx = (prev.x + c.x) / 2;
            ctx.bezierCurveTo(mx, prev.y, mx, c.y, c.x, c.y);
          } else ctx.lineTo(c.x, c.y);
        }
      }
      if (inPath && fill) {
        const last = [...coords].reverse().find(c => c.y !== null);
        if (last) { ctx.lineTo(last.x, PAD.top + cH); ctx.closePath(); }
      }
    };

    // Fill
    ctx.save();
    drawSmooth(true);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.restore();

    // Stroke
    ctx.save();
    drawSmooth(false);
    ctx.strokeStyle = col;
    ctx.lineWidth   = 2;
    ctx.lineJoin    = 'round';
    ctx.lineCap     = 'round';
    ctx.stroke();
    ctx.restore();

    // Pulsing dot on latest valid point
    const lc = [...coords].reverse().find(c => c.y !== null);
    if (lc) {
      const pulse = 0.5 + 0.5 * Math.sin(this._pulse);
      ctx.save();
      ctx.beginPath();
      ctx.arc(lc.x, lc.y, 7 + pulse * 5, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${r},${g},${b},${0.18 * pulse})`;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(lc.x, lc.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = col;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth   = 1.5;
      ctx.stroke();
      ctx.restore();
    }

    // X axis time labels — only show oldest + newest, skip if too close
    ctx.fillStyle    = 'rgba(148,163,184,0.5)';
    ctx.textBaseline = 'alphabetic';
    ctx.font         = '10px Inter,sans-serif';
    if (pts.length >= 2) {
      const fmt = t => t.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit', second:'2-digit' });
      const x0  = xOf(0);
      const x1  = xOf(pts.length - 1);
      const minGap = 80; // px
      ctx.textAlign = 'left';
      ctx.fillText(fmt(pts[0].t), Math.max(PAD.left, x0), H - 4);
      if (x1 - x0 > minGap) {
        ctx.textAlign = 'right';
        ctx.fillText(fmt(pts[pts.length - 1].t), Math.min(PAD.left + cW, x1), H - 4);
      }
    }
  }
}
function renderSiteDetail(site) {
  // Preserve ping data if re-rendering the same site (e.g. after audit)
  let _savedPingPoints = null;
  let _savedPingUrl    = null;
  if (state.livePingChart) {
    _savedPingUrl    = state.livePingChart.url;
    _savedPingPoints = state.livePingChart.points.slice();
    state.livePingChart.stop();
    state.livePingChart = null;
  }

  const detail = document.getElementById('siteDetail');
  if (!detail) return;
  detail.classList.remove('empty-state', 'is-loading');
  if (!site) {
    syncContentHeader(null, null, null, true);
    detail.classList.add('empty-state');
    detail.innerHTML = `
      <div class="db-empty-icon"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg></div>
      <h2>${escapeHtml(t('dashboard.emptyTitle'))}</h2>
      <p>${escapeHtml(t('dashboard.emptyCopy'))}</p>`;
    return;
  }

  const checks = state.selectedChecks || [];
  const latest = checks[0];
  const lastDown = checks.find((check) => check.status === 'down');
  const downChecks = checks.filter((check) => check.status === 'down');
  const averageResponse = checks.filter((check) => Number(check.response_time_ms) > 0);
  const avgMs = averageResponse.length
    ? `${Math.round(averageResponse.reduce((sum, check) => sum + Number(check.response_time_ms || 0), 0) / averageResponse.length)}ms`
    : '-';
  const status = statusLabel(site.last_status);
  const latestResult = latest && latest.result ? latest.result : null;
  const domainExpiry = latestResult && latestResult.domain_expiry ? latestResult.domain_expiry : null;
  const restoredPingTimeouts = _savedPingPoints ? _savedPingPoints.filter(p => p.status === 'timeout' || p.status === 'error').length : 0;
  const restoredPingLatest = _savedPingPoints && _savedPingPoints.length ? _savedPingPoints[_savedPingPoints.length - 1] : null;
  let importantChecks = latestResult && Array.isArray(latestResult.checks)
    ? latestResult.checks.filter((check) => check.level !== 'pass').slice(0, 5).map(c => translateCheck(c, currentLocale))
    : [];
  if (restoredPingTimeouts > 0) {
    importantChecks = [{
      level: restoredPingLatest && restoredPingLatest.ms != null ? 'warning' : 'fail',
      title: restoredPingLatest && restoredPingLatest.ms != null ? 'Live ping recovered after failures' : 'Live ping failures detected',
      description: `${restoredPingTimeouts} browser ping failure${restoredPingTimeouts === 1 ? '' : 's'} happened in this session. This can come from browser/network limits, CORS behavior, upstream provider errors, or a temporary service incident.`,
      recommendation: restoredPingLatest && restoredPingLatest.ms != null ? 'This incident has been resolved, please refresh the ping.' : 'Compare against scheduled scans and provider status, then refresh the ping after the provider recovers.',
      value: restoredPingTimeouts
    }].concat(importantChecks).slice(0, 5);
  }

  const issueHtml = importantChecks.length
    ? importantChecks.map((c) => `
        <div class="rich-issue-row rich-issue-${c.level}">
          <div class="rich-issue-top">
            <span class="rich-issue-icon lvl-${c.level}">
              ${c.level === 'fail'
                ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="width:15px;height:15px;"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>'
                : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="width:15px;height:15px;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>'}
            </span>
            <span class="rich-issue-title">${escapeHtml(c.title)}</span>
            ${c.value ? `<span class="scan-check-value">${escapeHtml(c.value)}</span>` : ''}
            <span class="level-badge ${c.level}" style="margin-left:auto;">${escapeHtml(c.level)}</span>
          </div>
          ${c.description ? `<p class="rich-issue-desc">${escapeHtml(c.description)}</p>` : ''}
          ${c.recommendation ? `<p class="rich-issue-fix"><strong>How to fix:</strong> ${escapeHtml(c.recommendation)}</p>` : ''}
        </div>`).join('')
    : `<div class="empty subtle">${escapeHtml(t('dashboard.noIssues'))}</div>`;

  // Full scan breakdown — grouped by category, showing value + description
  const allChecks = (latestResult && Array.isArray(latestResult.checks) ? latestResult.checks : []).map(c => translateCheck(c, currentLocale));
  const failChecks = allChecks.filter(c => c.level === 'fail');
  const warnChecks = allChecks.filter(c => c.level === 'warn');
  const passChecks = allChecks.filter(c => c.level === 'pass');

  const _catIcon = {
    domain:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="width:14px;height:14px;flex-shrink:0"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>',
    ssl:         '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="width:14px;height:14px;flex-shrink:0"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
    seo:         '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="width:14px;height:14px;flex-shrink:0"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
    uptime:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="width:14px;height:14px;flex-shrink:0"><path d="M22 12h-4l-3 8L9 4l-3 8H2"/></svg>',
    performance: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="width:14px;height:14px;flex-shrink:0"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
    keyword:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="width:14px;height:14px;flex-shrink:0"><path d="M1 6l11 12L23 6"/></svg>',
  };
  const _catLabel = { domain:'Domain', ssl:'SSL Certificate', seo:'SEO', uptime:'Uptime & Status', performance:'Performance', keyword:'Keyword Monitor' };
  const _levelOrder = { fail: 0, warn: 1, warning: 1, pass: 2 };
  const _checkIcon = (lvl) => lvl === 'pass'
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" style="width:15px;height:15px;flex-shrink:0;"><polyline points="20 6 9 17 4 12"/></svg>'
    : lvl === 'fail'
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="width:15px;height:15px;flex-shrink:0;"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>'
    : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="width:15px;height:15px;flex-shrink:0;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';

  // Group checks by category, sort categories by worst level first
  const _byCategory = {};
  allChecks.forEach(c => {
    const cat = c.category || 'other';
    if (!_byCategory[cat]) _byCategory[cat] = [];
    _byCategory[cat].push(c);
  });
  const _sortedCats = Object.keys(_byCategory).sort((a, b) => {
    const worstLevel = (checks) => Math.min(...checks.map(c => _levelOrder[c.level] ?? 2));
    return worstLevel(_byCategory[a]) - worstLevel(_byCategory[b]);
  });

  const scanBreakdownHtml = allChecks.length ? `
    <details class="scan-breakdown" open>
      <summary class="scan-breakdown-head">
        <span>Latest scan breakdown</span>
        <span class="scan-breakdown-meta">
          ${failChecks.length ? `<span class="level-badge fail">${failChecks.length} fail</span>` : ''}
          ${warnChecks.length ? `<span class="level-badge warn">${warnChecks.length} warn</span>` : ''}
          ${passChecks.length ? `<span class="level-badge pass">${passChecks.length} pass</span>` : ''}
          <span style="color:var(--muted);font-size:.78rem;margin-left:4px;">${formatDateTime(latest && latest.created_at)}</span>
        </span>
        <svg class="scan-breakdown-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
      </summary>
      <div class="scan-breakdown-body">
        ${_sortedCats.map(cat => {
          const checks = _byCategory[cat].slice().sort((a,b) => (_levelOrder[a.level]??2) - (_levelOrder[b.level]??2));
          const catWorst = checks[0]?.level || 'pass';
          return `<div class="scan-cat-group">
            <div class="scan-cat-head scan-cat-${catWorst}">
              ${_catIcon[cat] || _catIcon.seo}
              <span>${_catLabel[cat] || cat}</span>
            </div>
            ${checks.map(c => {
              const isIssue = c.level === 'fail' || c.level === 'warn' || c.level === 'warning';
              return `<div class="scan-check-row2 scan-check-${c.level}">
                <span class="scan-check-icon2 lvl-${c.level}">${_checkIcon(c.level)}</span>
                <div class="scan-check-body">
                  <div class="scan-check-title-row">
                    <span class="scan-check-title">${escapeHtml(c.title)}</span>
                    ${c.value ? `<span class="scan-check-value">${escapeHtml(c.value)}</span>` : ''}
                  </div>
                  ${c.description ? `<p class="scan-check-desc">${escapeHtml(c.description)}</p>` : ''}
                  ${c.recommendation && isIssue ? `<p class="scan-check-fix"><strong>Fix:</strong> ${escapeHtml(c.recommendation)}</p>` : ''}
                </div>
              </div>`;
            }).join('')}
          </div>`;
        }).join('')}
      </div>
    </details>` : '';

  const insights = latestResult && latestResult.insights ? latestResult.insights : {};
  const opportunities = Array.isArray(insights.content_opportunities) ? insights.content_opportunities : [];
  const insightHtml = (insights.executive_summary || opportunities.length) ? `
    <div class="detail-panel" style="margin:18px 0;">
      <div class="detail-panel-head"><span>Audit insights</span></div>
      ${insights.executive_summary ? `<div style="padding:14px 16px;color:var(--muted);font-size:.86rem;line-height:1.55;border-bottom:1px solid var(--border);">${escapeHtml(insights.executive_summary)}</div>` : ''}
      ${opportunities.length ? `<div style="overflow-x:auto;">
        <table class="checks-table">
          <thead><tr><th>Priority</th><th>Topic idea</th><th>Primary keyword</th><th>Supporting keywords</th><th>Intent</th></tr></thead>
          <tbody>${opportunities.map((item) => `<tr>
            <td><span class="level-badge ${String(item.priority || '').toLowerCase() === 'high' ? 'fail' : 'warning'}">${escapeHtml(item.priority || 'Medium')}</span></td>
            <td>${escapeHtml(item.title || '')}</td>
            <td>${escapeHtml(item.primary_keyword || '')}</td>
            <td>${escapeHtml(Array.isArray(item.supporting_keywords) ? item.supporting_keywords.join(', ') : item.supporting_keywords || '')}</td>
            <td>${escapeHtml(item.intent || '')}</td>
          </tr>`).join('')}</tbody>
        </table>
      </div>` : ''}
    </div>` : '';

  const recoveryHtml = latest && latest.status === 'online' && lastDown
    ? `<div class="rich-incident-row">
          <div class="rich-incident-top">
            <svg viewBox="0 0 24 24" fill="none" stroke="var(--green)" stroke-width="2" stroke-linecap="round" style="width:15px;height:15px;flex-shrink:0;"><polyline points="20 6 9 17 4 12"/></svg>
            <strong>This incident has been resolved</strong>
            <span class="rich-incident-time">${formatDateTime(latest.created_at)}</span>
          </div>
          <p class="rich-issue-desc" style="margin:4px 0 0;">Please refresh the ping to verify the current live response.</p>
        </div>`
    : '';

  const incidentRowsHtml = downChecks.length || recoveryHtml
    ? recoveryHtml + downChecks.slice(0, 8).map((inc) => {
        const scoreColor = inc.score >= 80 ? 'var(--green)' : inc.score >= 60 ? 'var(--amber)' : 'var(--red)';
        const respMs = inc.response_time_ms ? `${inc.response_time_ms}ms` : null;
        const incIssues = inc.result && Array.isArray(inc.result.checks)
          ? inc.result.checks.filter(c => c.level === 'fail').slice(0, 2)
          : [];
        return `<div class="rich-incident-row">
          <div class="rich-incident-top">
            <svg viewBox="0 0 24 24" fill="none" stroke="var(--red)" stroke-width="2" stroke-linecap="round" style="width:15px;height:15px;flex-shrink:0;"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
            <strong>Downtime detected</strong>
            <span class="rich-incident-time">${formatDateTime(inc.created_at)}</span>
          </div>
          <div class="rich-incident-meta">
            <span class="rich-meta-chip">HTTP ${inc.status_code || 'unreachable'}</span>
            ${respMs ? `<span class="rich-meta-chip">${respMs} response</span>` : ''}
            ${inc.score ? `<span class="rich-meta-chip" style="color:${scoreColor};">Score ${inc.score}/100</span>` : ''}
          </div>
          ${incIssues.length ? `<div class="rich-incident-issues">${incIssues.map(i => `<span class="rich-incident-issue-tag">${escapeHtml(i.title)}</span>`).join('')}</div>` : ''}
        </div>`;
      }).join('')
    : `<div class="empty subtle">No incidents in recent checks.</div>`;

  const historyHtml = checks.length
    ? checks.slice(0, 12).map((check) => `<div class="timeline-row"><span class="dot ${check.status === 'online' ? '' : check.status}"></span><div><strong>${escapeHtml(localizedStatus(check.status))}</strong><small>${formatDateTime(check.created_at)} · ${check.score || '-'}/100 · ${check.response_time_ms || '-'}ms · HTTP ${check.status_code || 'unreachable'}</small></div></div>`).join('')
    : `<div class="empty subtle">${escapeHtml(t('dashboard.firstCheck'))}</div>`;

  const bars = checks.slice(0, 24).reverse().map((check) => `<span class="uptime-bar ${statusLabel(check.status)}" title="${escapeHtml(check.status)} ${formatDateTime(check.created_at)}"></span>`).join('');

  // Response-time bar chart
  const chartChecks = checks.slice(0, 12).filter((c) => Number(c.response_time_ms) > 0).reverse();
  const maxResp = chartChecks.length ? Math.max(...chartChecks.map((c) => Number(c.response_time_ms))) : 1;
  const respChartHtml = chartChecks.length
    ? `<div class="response-chart">${chartChecks.map((c) => {
        const h = Math.max(4, Math.round((Number(c.response_time_ms) / maxResp) * 100));
        const cls = c.status === 'down' ? 'down' : Number(c.response_time_ms) > 1500 ? 'slow' : '';
        return `<div class="resp-bar-col" title="${c.response_time_ms}ms"><div class="resp-bar ${cls}" style="height:${h}%"></div></div>`;
      }).join('')}</div>`
    : `<div class="empty subtle" style="padding:12px 20px;">No response data yet.</div>`;

  const publicUrl  = site.public_slug ? `${window.location.origin}/status/${site.public_slug}` : '';
  const reportUrl  = site.public_slug ? `${window.location.origin}/report/${site.public_slug}` : '';
  const reportText = encodeURIComponent(reportSummaryFromSite(site, checks));
  const alertsLocked = !hasFeature('in_app_alerts');
  const statusLocked = !hasFeature('status_pages');
  const reportLocked = !hasFeature('client_reports');

  syncContentHeader(site, status, reportText, reportLocked, reportUrl);

  // Free tier: show upgrade gate instead of full detail
  if (state.plan === 'free' && !hasFeature('in_app_alerts')) {
    detail.innerHTML = `
      <div class="scan-proof-bar">
        <span class="scan-interval-badge">Free · Every 20 min</span>
        <span>Last scan: <strong id="lastScanTime">–</strong></span>
        <span>·</span>
        <span><strong id="scanCountdown">–</strong></span>
      </div>
      <div id="scanCooldownMsg" class="scan-cooldown-msg"></div>
      <div class="detail-metrics" style="grid-template-columns:repeat(4,1fr);margin-bottom:20px;">
        <div class="dash-card"><span class="muted">${escapeHtml(t('dashboard.healthScore'))}</span><h3 style="color:${site.last_score >= 80 ? 'var(--green)' : site.last_score >= 60 ? 'var(--amber)' : 'var(--red)'}">${site.last_score ? `${site.last_score}/100` : '-'}</h3></div>
        <div class="dash-card"><span class="muted">${escapeHtml(t('dashboard.uptimeSample'))}</span><h3>${uptimePercent(checks)}</h3></div>
        <div class="dash-card"><span class="muted">${escapeHtml(t('dashboard.avgResponse'))}</span><h3>${avgMs}</h3></div>
        <div class="dash-card"><span class="muted">SSL / Domain</span><h3>${escapeHtml(domainExpiryLabel(domainExpiry))}</h3></div>
      </div>
      <div class="free-issues-block" style="margin-bottom:16px;">
        <div class="free-section-head"><strong>Top issues</strong></div>
        ${importantChecks.length ? importantChecks.slice(0,3).map((c) => `<div class="free-issue-row"><svg viewBox="0 0 24 24" class="icon-${c.level === 'fail' ? 'red' : 'amber'}" style="width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;flex-shrink:0;margin-top:1px;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg><div><strong>${escapeHtml(c.title)}</strong><p style="margin:2px 0 0;font-size:.8rem;color:var(--muted);">${escapeHtml(c.recommendation)}</p></div><span class="level-badge ${c.level}">${c.level}</span></div>`).join('') : `<div class="free-issue-row">No critical issues.</div>`}
      </div>
      <div class="free-locked-section"><div class="free-locked-inner">
        <svg viewBox="0 0 24 24" style="width:20px;height:20px;fill:none;stroke:var(--muted);stroke-width:2;stroke-linecap:round;margin-bottom:6px;"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>
        <strong>Response time graph &amp; full check history</strong>
        <p>30-day monitoring graphs and incident timeline available in Starter.</p>
        <button class="button small" type="button" data-dashboard-upgrade="starter" style="margin-top:10px;">Upgrade to Starter</button>
      </div></div>
      <div class="free-locked-section"><div class="free-locked-inner">
        <svg viewBox="0 0 24 24" style="width:20px;height:20px;fill:none;stroke:var(--muted);stroke-width:2;stroke-linecap:round;margin-bottom:6px;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        <strong>Client reports &amp; status pages</strong>
        <p>Share professional health summaries with clients. Available in Agency.</p>
        <button class="button small secondary" type="button" data-dashboard-upgrade="agency" style="margin-top:10px;">Upgrade to Agency</button>
      </div></div>
      <div class="detail-actions" style="margin-top:16px;">
        <button class="button" type="button" data-run="${site.id}">${escapeHtml(t('dashboard.runCheck'))}</button>
        <button class="button danger" type="button" data-delete="${site.id}">${escapeHtml(t('dashboard.delete'))}</button>
      </div>`;
    startScanCountdown(site.last_checked_at, site.id);
    return;
  }

  detail.innerHTML = `
    <!-- Scan proof bar -->
    <div class="scan-proof-bar">
      <span class="scan-interval-badge">${escapeHtml(state.plan === 'agency' ? t('dashboard.planAgency') : state.plan === 'starter' ? t('dashboard.planStarter') : t('dashboard.planFree'))} · ${state.limits ? (state.sites ? state.sites.length : 0) + '/' + (state.limits.sites || '?') + ' ' + t('dashboard.sitesUsed') : planIntervalLabel()}</span>
      <span>${escapeHtml(t('dashboard.lastScan'))}: <strong id="lastScanTime">–</strong></span>
      <span>·</span>
      <span><strong id="scanCountdown">–</strong></span>
    </div>
    <div id="scanCooldownMsg" class="scan-cooldown-msg"></div>

    <div class="detail-tabs" id="detailTabs">
      <button class="detail-tab active" type="button" data-tab="overview">${escapeHtml(t('dashboard.overview'))}</button>
      <button class="detail-tab" type="button" data-tab="incidents">${escapeHtml(t('dashboard.recentIncidents'))}</button>
      <button class="detail-tab" type="button" data-tab="checks">${escapeHtml(t('dashboard.recentChecks'))}</button>
    </div>

    <!-- Overview -->
    <div class="detail-tab-panel" data-panel="overview" style="padding-top:24px;">
      <div style="margin-bottom:28px;padding-bottom:20px;border-bottom:1px solid var(--border);">
        <h2 style="margin:0 0 6px;font-size:1.2rem;font-weight:700;">${escapeHtml(t('dashboard.websiteHealthOverview'))}</h2>
        <p style="margin:0;font-size:.88rem;color:var(--muted);">${escapeHtml(t('dashboard.websiteHealthSubtitle'))}</p>
      </div>
      <div class="detail-metrics" style="grid-template-columns:repeat(4,1fr);">
        <div class="dash-card"><span class="muted">${escapeHtml(t('dashboard.healthScore'))}</span><h3 style="color:${site.last_score >= 80 ? 'var(--green)' : site.last_score >= 60 ? 'var(--amber)' : 'var(--red)'}">${site.last_score ? `${site.last_score}/100` : '-'}</h3></div>
        <div class="dash-card"><span class="muted">${escapeHtml(t('dashboard.uptimeSample'))}</span><h3>${uptimePercent(checks)}</h3></div>
        <div class="dash-card"><span class="muted">${escapeHtml(t('dashboard.avgResponse'))}</span><h3>${avgMs}</h3></div>
        <div class="dash-card"><span class="muted">SSL / Domain</span><h3>${escapeHtml(domainExpiryLabel(domainExpiry))}</h3></div>
      </div>
      ${insightHtml}
      <div class="live-ping-wrap">
        <div class="live-ping-head">
          <span>${escapeHtml(t('dashboard.liveResponse'))}</span>
          <span class="live-ping-badge"><span class="live-dot-blink"></span>Live</span>
          <span style="font-size:.78rem;color:var(--muted);margin-left:auto;">Pinging every 2s · independent of scans</span>
        </div>
        <canvas id="livePingCanvas" class="live-ping-canvas"></canvas>
        <div class="live-ping-stats">
          <div class="live-ping-stat"><span class="muted">Current</span><strong id="lpCurrent">–</strong></div>
          <div class="live-ping-stat"><span class="muted">Average</span><strong id="lpAvg">–</strong></div>
          <div class="live-ping-stat"><span class="muted">Min</span><strong id="lpMin">–</strong></div>
          <div class="live-ping-stat"><span class="muted">Max</span><strong id="lpMax">–</strong></div>
          <div class="live-ping-stat"><span class="muted">Timeouts</span><strong id="lpTO">0</strong></div>
        </div>
        <div id="lpTimeoutNote" class="scan-cooldown-msg" style="display:none;margin-top:10px;"></div>
      </div>
      <div class="detail-grid">
        <div class="detail-panel">
          <div class="detail-panel-head">
            <span>${escapeHtml(t('dashboard.latestIssues'))}</span>
            <svg viewBox="0 0 24 24" class="icon-amber"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          </div>
          ${issueHtml}
        </div>
        <div class="detail-panel">
          <div class="detail-panel-head">
            <span>${escapeHtml(t('dashboard.recentIncidents'))}</span>
            <svg viewBox="0 0 24 24" class="icon-red"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
          </div>
          ${incidentRowsHtml}
        </div>
      </div>
      <div class="audit-cta-band">
        <div class="audit-cta-left">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="width:18px;height:18px;flex-shrink:0;color:var(--muted)"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <span>Issues are from the last scheduled scan. Run a full audit to get the latest SEO, SSL and performance results.</span>
        </div>
        <button class="button small" id="auditCtaBtn" type="button" data-run="${site.id}">${escapeHtml(t('dashboard.runFullAudit'))}</button>
      </div>
      ${scanBreakdownHtml}
    </div>

    <!-- Incidents -->
    <div class="detail-tab-panel hidden" data-panel="incidents">
      <div style="padding:20px;">
        <div class="detail-panel">
          <div class="detail-panel-head"><span>${escapeHtml(t('dashboard.recentIncidents'))}</span></div>
          ${incidentRowsHtml}
        </div>
        <div style="margin-top:16px; font-size:.85rem; color:var(--muted);">
          Domain expiry: <strong>${escapeHtml(domainExpiryLabel(domainExpiry))}</strong> &nbsp;·&nbsp;
          Since last down: <strong>${formatDurationSince(lastDown && lastDown.created_at)}</strong>
        </div>
      </div>
    </div>

    <!-- Recent Checks -->
    <div class="detail-tab-panel hidden" data-panel="checks">
      <div class="detail-panel" style="margin:0 0 16px;">
        <div class="detail-panel-head"><span>${escapeHtml(t('dashboard.recentChecks'))}</span></div>
        <div style="overflow-x:auto;padding:0 4px;">
          ${renderRecentChecksTable(state.selectedChecks)}
        </div>
      </div>
    </div>

    `;

  // Tab switching
  const tabsEl = document.getElementById('detailTabs');
  if (tabsEl) {
    tabsEl.addEventListener('click', (e) => {
      const tab = e.target.closest('.detail-tab');
      if (!tab) return;
      const panelName = tab.dataset.tab;
      tabsEl.querySelectorAll('.detail-tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      detail.querySelectorAll('.detail-tab-panel').forEach((p) => {
        p.classList.toggle('hidden', p.dataset.panel !== panelName);
      });
    });
  }

  // Start live scan countdown
  startScanCountdown(site.last_checked_at, site.id);

  // Mount live ping chart — restore history if same site re-renders (e.g. after audit)
  const pingCanvas = document.getElementById('livePingCanvas');
  if (pingCanvas) {
    state.livePingChart = new LivePingChart(pingCanvas, { url: site.url });
    if (_savedPingUrl === site.url && _savedPingPoints && _savedPingPoints.length) {
      state.livePingChart.points = _savedPingPoints;
      state.livePingChart._updateStats();
    }
    state.livePingChart.start();
  }
}

// ── Sidebar panel rendering ───────────────────────────────────────────────────

function buildScanHistoryTable(checks, plan) {
  const now = Date.now();
  let historyChecks;
  if (plan === 'agency') {
    historyChecks = checks.filter(c => (now - new Date(c.created_at).getTime()) < 90 * 24 * 60 * 60 * 1000);
  } else if (plan === 'starter') {
    historyChecks = checks.filter(c => (now - new Date(c.created_at).getTime()) < 30 * 24 * 60 * 60 * 1000);
  } else {
    historyChecks = checks.slice(0, 3);
  }
  if (!historyChecks.length) {
    return '<div class="empty subtle" style="padding:16px;">' + escapeHtml(t('dashboard.scanHistoryEmpty')) + '</div>';
  }
  let rows = '';
  historyChecks.forEach(function(c, idx) {
    const issueCount = c.result && Array.isArray(c.result.checks) ? c.result.checks.filter(x => x.level !== 'pass').length : '-';
    const scoreColor = c.score >= 80 ? 'var(--green)' : c.score >= 60 ? 'var(--amber)' : 'var(--red)';
    rows += '<tr>' +
      '<td style="white-space:nowrap;">' + formatDateTime(c.created_at) + '</td>' +
      '<td><span class="dot ' + (c.status === 'online' ? '' : escapeHtml(c.status)) + '" style="display:inline-block;margin-right:4px;"></span>' + escapeHtml(localizedStatus(c.status)) + '</td>' +
      '<td style="color:' + scoreColor + ';font-weight:600;">' + (c.score || '-') + '/100</td>' +
      '<td>' + (c.response_time_ms ? c.response_time_ms + 'ms' : '-') + '</td>' +
      '<td>' + issueCount + '</td>' +
      '<td style="white-space:nowrap;" data-history-idx="' + idx + '">' +
      '<button class="button small secondary sh-view-btn" type="button">' + escapeHtml(t('dashboard.viewReport')) + '</button> ' +
      '<button class="button small secondary sh-dl-btn" type="button">' + escapeHtml(t('dashboard.downloadReport')) + '</button>' +
      '</td></tr>';
  });
  return '<table class="scan-history-table"><thead><tr><th>Date / Time</th><th>Status</th><th>Score</th><th>Response</th><th>Issues</th><th>Actions</th></tr></thead><tbody>' + rows + '</tbody></table>';
}

function buildSettingsForm(site) {
  const alertsLocked = !hasFeature('in_app_alerts');
  const statusLocked = !hasFeature('status_pages');
  const publicUrl = site.public_slug ? window.location.origin + '/status/' + site.public_slug : '';
  return '<form class="monitor-settings" id="monitorSettingsForm" style="padding:20px 24px; display:grid; gap:16px;">' +
    '<div class="settings-head"><strong>' + escapeHtml(t('dashboard.settings')) + '</strong>' +
    '<span class="muted" style="font-size:.85rem;">' + escapeHtml(t('dashboard.settingsCopy')) + '</span></div>' +
    '<label style="display:grid;gap:6px;font-size:.9rem;font-weight:500;"><span style="color:var(--muted);font-size:.85rem;">' + escapeHtml(t('dashboard.keyword')) + '</span>' +
    '<input id="keywordInput" type="text" value="' + escapeHtml(site.keyword || '') + '" placeholder="' + escapeHtml(t('dashboard.keywordPlaceholder')) + '"></label>' +
    '<label style="display:grid;gap:6px;font-size:.9rem;font-weight:500;"><span style="color:var(--muted);font-size:.85rem;">' + escapeHtml(t('dashboard.maintenanceStart')) + '</span>' +
    '<input id="maintenanceStartInput" type="datetime-local" value="' + (site.maintenance_starts_at ? new Date(site.maintenance_starts_at).toISOString().slice(0,16) : '') + '"></label>' +
    '<label style="display:grid;gap:6px;font-size:.9rem;font-weight:500;"><span style="color:var(--muted);font-size:.85rem;">' + escapeHtml(t('dashboard.maintenanceEnd')) + '</span>' +
    '<input id="maintenanceEndInput" type="datetime-local" value="' + (site.maintenance_ends_at ? new Date(site.maintenance_ends_at).toISOString().slice(0,16) : '') + '"></label>' +
    '<label class="toggle-row ' + (alertsLocked ? 'locked-control' : '') + '">' +
    '<input id="emailAlertsInput" type="checkbox" ' + (boolValue(site.email_alerts_enabled) ? 'checked' : '') + ' ' + (alertsLocked ? 'disabled' : '') + '>' +
    '<span>' + escapeHtml(t('dashboard.emailAlerts')) + '</span></label>' +
    '<label class="toggle-row ' + (alertsLocked ? 'locked-control' : '') + '">' +
    '<input id="alertDownInput" type="checkbox" ' + (boolValue(site.alert_on_down) ? 'checked' : '') + ' ' + (alertsLocked ? 'disabled' : '') + '>' +
    '<span>' + escapeHtml(t('dashboard.alertDown')) + '</span></label>' +
    '<label class="toggle-row ' + (alertsLocked ? 'locked-control' : '') + '">' +
    '<input id="alertWarningInput" type="checkbox" ' + (boolValue(site.alert_on_warning) ? 'checked' : '') + ' ' + (alertsLocked ? 'disabled' : '') + '>' +
    '<span>' + escapeHtml(t('dashboard.alertWarning')) + '</span></label>' +
    '<label class="toggle-row ' + (alertsLocked ? 'locked-control' : '') + '">' +
    '<input id="alertRecoveryInput" type="checkbox" ' + (boolValue(site.alert_on_recovery) ? 'checked' : '') + ' ' + (alertsLocked ? 'disabled' : '') + '>' +
    '<span>' + escapeHtml(t('dashboard.alertRecovery')) + '</span></label>' +
    '<label class="toggle-row ' + (statusLocked ? 'locked-control' : '') + '">' +
    '<input id="statusPageInput" type="checkbox" ' + (site.status_page_enabled ? 'checked' : '') + ' ' + (statusLocked ? 'disabled' : '') + '>' +
    '<span>' + escapeHtml(t('dashboard.statusPage')) + '</span></label>' +
    (alertsLocked ? '<div class="locked-note">' + escapeHtml(t('dashboard.lockedAlerts')) + '</div>' : '') +
    (statusLocked ? '<div class="locked-note">' + escapeHtml(t('dashboard.lockedStatusPage')) + '</div>' : '') +
    (publicUrl && site.status_page_enabled ? '<a class="status-link" href="' + publicUrl + '" target="_blank" rel="noopener">' + escapeHtml(publicUrl) + '</a>' : '') +
    (site.public_slug ? '<div style="margin-top:10px;padding:10px 14px;background:#f0f4ff;border:1px solid #c7d2fe;border-radius:8px;">' +
      '<div style="font-size:.7rem;font-weight:700;color:#6366f1;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px;">Client Report Link</div>' +
      '<a class="status-link" href="/report/' + site.public_slug + '" target="_blank" rel="noopener" style="color:#6366f1;">' + window.location.origin + '/report/' + site.public_slug + '</a>' +
      '</div>' : '') +
    '<button class="button secondary" type="submit">' + escapeHtml(t('dashboard.save')) + '</button>' +
    '</form>';
}

function renderApiKeys(keys) {
  const target = document.getElementById('apiKeysList');
  if (!target) return;
  const active = (keys || []).filter((key) => !key.revoked_at);
  if (!active.length) {
    target.innerHTML = '<div class="empty subtle">' + escapeHtml(t('dashboard.noApiKeys')) + '</div>';
    return;
  }
  target.innerHTML = active.map((key) => (
    (() => {
      const usage = key.usage || {};
      const lastUsed = key.last_used_at ? formatDateTime(key.last_used_at) : t('dashboard.neverUsed');
      const usageText = [
        t('dashboard.lastUsed') + ': ' + lastUsed,
        t('dashboard.apiUsageToday') + ': ' + Number(usage.today || 0),
        t('dashboard.apiUsageMonth') + ': ' + Number(usage.month || 0)
      ];
      if (usage.rate_limited_month) {
        usageText.push(t('dashboard.apiUsageRateLimited') + ': ' + Number(usage.rate_limited_month));
      }
      return (
    '<div class="check" style="align-items:center;">' +
    '<span class="dot online"></span>' +
    '<div style="flex:1;">' +
    '<p class="check-title">' + escapeHtml(key.name || 'API key') + '</p>' +
    '<p class="check-copy">' + escapeHtml(key.key_prefix || '') + '... - ' + escapeHtml(usageText.join(' - ')) + '</p>' +
    '</div>' +
    '<button class="button small secondary" type="button" data-revoke-api-key="' + escapeHtml(key.id) + '">' + escapeHtml(t('dashboard.revokeKey')) + '</button>' +
    '</div>'
      );
    })()
  )).join('');
  target.querySelectorAll('[data-revoke-api-key]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!window.confirm(t('dashboard.revokeKeyConfirm'))) return;
      const response = await fetch(apiPath(`/api/api-keys/${button.dataset.revokeApiKey}`), { method: 'DELETE', headers: authHeaders() });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Could not revoke API key');
      await loadApiKeys();
    });
  });
}

async function loadApiKeys() {
  const target = document.getElementById('apiKeysList');
  if (target) target.innerHTML = '<div class="empty subtle">Loading...</div>';
  try {
    const response = await fetch(apiPath('/api/api-keys'), { headers: authHeaders() });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Could not load API keys');
    renderApiKeys(data.api_keys || []);
  } catch (error) {
    if (target) target.innerHTML = '<div class="empty">' + escapeHtml(error.message) + '</div>';
  }
}

async function createApiKey(event) {
  event.preventDefault();
  const input = document.getElementById('apiKeyNameInput');
  const errEl = document.getElementById('apiKeyNameError');
  const name  = input ? input.value.trim() : '';

  // Require a label
  if (!name) {
    if (input) {
      input.style.borderColor = 'var(--red, #ef4444)';
      input.focus();
    }
    if (errEl) { errEl.textContent = 'Please enter a label for this key (e.g. Production, Staging).'; errEl.style.display = 'block'; }
    return;
  }

  // Clear any previous error
  if (input)  input.style.borderColor = '';
  if (errEl)  errEl.style.display = 'none';

  const submitBtn = document.querySelector('#apiKeyForm button[type="submit"]');
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Creating…'; }

  try {
    const response = await fetch(apiPath('/api/api-keys'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ name })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Could not create API key');
    if (input) input.value = '';
    const box     = document.getElementById('newApiKeyBox');
    const display = document.getElementById('apiKeyDisplay');
    if (box)     box.style.display = 'block';
    if (display) display.textContent = data.api_key || '';
    await loadApiKeys();
  } finally {
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = t('dashboard.generateKey'); }
  }
}

function renderApiAccessPanel(detail) {
  syncContentHeader(null, null, null, true);
  const nameEl = document.getElementById('dbSelectedSiteName');
  if (nameEl) nameEl.textContent = t('dashboard.apiAccess');
  detail.classList.remove('empty-state', 'is-loading');
  if (state.plan !== 'agency') {
    detail.innerHTML = '<div class="locked-section" style="text-align:center;padding:40px 20px;">' +
      '<div style="font-size:2.5rem;margin-bottom:12px;">API</div>' +
      '<h3 style="margin-bottom:8px;">' + escapeHtml(t('dashboard.apiAccessLocked')) + '</h3>' +
      '<p style="color:var(--muted);max-width:400px;margin:0 auto 20px;">' + escapeHtml(t('dashboard.apiAccessLockedDesc')) + '</p>' +
      '<button class="button small" data-dashboard-upgrade="agency">' + escapeHtml(t('dashboard.upgradeAgencyBtn')) + '</button>' +
      '</div>';
    return;
  }

  const planLimits = state.limits || {};
  const rateLimit  = planLimits.api_calls_per_minute || 60;
  const maxKeys    = planLimits.api_keys || 5;

  detail.innerHTML = '<div class="api-access-section" style="padding:20px 20px 32px;max-width:1100px;">' +
    '<div style="display:grid;grid-template-columns:1fr 290px;gap:24px;align-items:start;">' +

    // ── LEFT COLUMN ──
    '<div>' +
    '<div style="background:var(--surface,var(--bg2));border:1px solid var(--border);border-radius:8px;padding:10px 13px;margin-bottom:10px;display:flex;align-items:flex-start;gap:9px;">' +
    '<svg viewBox="0 0 24 24" style="width:14px;height:14px;flex-shrink:0;margin-top:2px;fill:none;stroke:var(--accent,#6366f1);stroke-width:2;stroke-linecap:round;"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>' +
    '<p style="margin:0;font-size:.81rem;color:var(--text);"><strong style="color:var(--text);">' + escapeHtml(t('dashboard.apiKeyCreateTitle')) + '</strong> — ' + escapeHtml(t('dashboard.apiKeyCreateHelp')) + '</p>' +
    '</div>' +
    '<div style="background:var(--info-bg,rgba(99,102,241,.07));border:1px solid var(--info-border,rgba(99,102,241,.18));border-radius:8px;padding:8px 12px;margin-bottom:14px;font-size:.79rem;color:var(--muted);">' +
    escapeHtml(t('dashboard.apiAccessNotice')) + '</div>' +
    '<form id="apiKeyForm" style="display:grid;grid-template-columns:1fr auto;align-items:end;gap:8px;margin-bottom:6px;">' +
    '<label style="display:grid;gap:5px;font-size:.74rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;">' +
    escapeHtml(t('dashboard.newKeyName')) +
    '<input id="apiKeyNameInput" type="text" maxlength="80" placeholder="e.g. Production, Staging, Client-XYZ" required ' +
    'style="background:var(--input-bg,var(--bg));color:var(--text);border:1px solid var(--border);border-radius:6px;padding:8px 10px;font-size:.86rem;width:100%;outline:none;">' +
    '</label>' +
    '<button class="button small" type="submit" style="white-space:nowrap;">' + escapeHtml(t('dashboard.generateKey')) + '</button>' +
    '</form>' +
    '<span id="apiKeyNameError" style="display:none;color:var(--red,#ef4444);font-size:.77rem;margin-bottom:10px;"></span>' +
    '<div id="newApiKeyBox" style="display:none;margin-bottom:14px;background:rgba(16,185,129,.08);border:1px solid rgba(16,185,129,.25);border-radius:8px;padding:11px;">' +
    '<p style="margin:0 0 7px;color:var(--green,#10b981);font-size:.79rem;font-weight:700;">⚠ ' + escapeHtml(t('dashboard.apiKeyOneTime')) + '</p>' +
    '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">' +
    '<code id="apiKeyDisplay" style="flex:1;min-width:180px;background:var(--bg2,var(--bg));color:var(--text);border:1px solid var(--border);border-radius:6px;padding:7px 11px;font-size:.8rem;letter-spacing:.03em;word-break:break-all;"></code>' +
    '<button class="button small secondary" id="copyApiKeyBtn" type="button">' + escapeHtml(t('dashboard.copyKey')) + '</button>' +
    '</div></div>' +
    '<p style="margin:0 0 8px;font-size:.74rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);">' + escapeHtml(t('dashboard.activeKeys')) + '</p>' +
    '<div id="apiKeysList"><div class="empty subtle">Loading...</div></div>' +
    '</div>' +

    // ── RIGHT COLUMN ──
    '<div style="display:grid;gap:10px;">' +

    '<div style="background:var(--surface,var(--bg2));border:1px solid var(--border);border-radius:10px;padding:13px 15px;">' +
    '<p style="margin:0 0 9px;font-size:.71rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);">Your Plan</p>' +
    '<div style="display:flex;align-items:center;gap:7px;margin-bottom:9px;">' +
    '<span style="background:var(--accent,#6366f1);color:#fff;font-size:.7rem;font-weight:700;padding:2px 8px;border-radius:99px;">Agency</span>' +
    '<span style="font-size:.8rem;color:var(--text);">API Access</span>' +
    '</div>' +
    '<div style="display:grid;gap:5px;">' +
    '<div style="display:flex;justify-content:space-between;font-size:.79rem;"><span style="color:var(--muted);">Rate limit</span><strong style="color:var(--text);">' + rateLimit + ' req/min</strong></div>' +
    '<div style="display:flex;justify-content:space-between;font-size:.79rem;"><span style="color:var(--muted);">Max keys</span><strong style="color:var(--text);">' + maxKeys + '</strong></div>' +
    '<div style="display:flex;justify-content:space-between;font-size:.79rem;"><span style="color:var(--muted);">Auth header</span><strong style="color:var(--text);font-family:monospace;font-size:.74rem;">Authorization: Bearer &lt;key&gt;</strong></div>' +
    '</div></div>' +

    '<div style="background:var(--surface,var(--bg2));border:1px solid var(--border);border-radius:10px;padding:13px 15px;">' +
    '<p style="margin:0 0 8px;font-size:.71rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);">Quick Start</p>' +
    '<pre style="background:var(--code-bg,#0f0f1a);color:#e2e8f0;border-radius:6px;padding:9px 11px;font-size:.7rem;overflow-x:auto;margin:0;line-height:1.75;white-space:pre-wrap;word-break:break-all;">curl https://sitetrace-api.onrender.com/api/v1/monitors \\\n  -H "Authorization: Bearer YOUR_KEY"</pre>' +
    '</div>' +

    '<div style="background:var(--surface,var(--bg2));border:1px solid var(--border);border-radius:10px;padding:13px 15px;">' +
    '<p style="margin:0 0 9px;font-size:.71rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);">Endpoints</p>' +
    '<div style="display:grid;gap:5px;font-family:monospace;font-size:.74rem;">' +
    '<div><span style="color:var(--green,#10b981);font-weight:700;margin-right:4px;">POST</span><span style="color:var(--text);">/api/v1/analyze</span></div>' +
    '<div><span style="color:var(--accent,#6366f1);font-weight:700;margin-right:4px;">GET</span><span style="color:var(--text);">/api/v1/monitors</span></div>' +
    '<div><span style="color:var(--accent,#6366f1);font-weight:700;margin-right:4px;">GET</span><span style="color:var(--text);">/api/v1/monitors/{id}/checks</span></div>' +
    '<div><span style="color:var(--accent,#6366f1);font-weight:700;margin-right:4px;">GET</span><span style="color:var(--text);">/api/v1/incidents</span></div>' +
    '</div></div>' +

    '<div style="background:var(--surface,var(--bg2));border:1px solid var(--border);border-radius:10px;padding:13px 15px;">' +
    '<p style="margin:0 0 8px;font-size:.71rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);">Resources</p>' +
    '<div style="display:grid;gap:7px;">' +
    '<a href="/docs" target="_blank" style="display:flex;align-items:center;gap:7px;font-size:.8rem;color:var(--accent,#6366f1);text-decoration:none;">' +
    '<svg viewBox="0 0 24 24" style="width:12px;height:12px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;flex-shrink:0;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>' +
    'API Reference (interactive)</a>' +
    '<a href="https://rapidapi.com" target="_blank" style="display:flex;align-items:center;gap:7px;font-size:.8rem;color:var(--accent,#6366f1);text-decoration:none;">' +
    '<svg viewBox="0 0 24 24" style="width:12px;height:12px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;flex-shrink:0;"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>' +
    'RapidAPI marketplace</a>' +
    '</div></div>' +

    '</div>' + // end right col
    '</div>' + // end grid
    '</div>';  // end section

  loadApiKeys();
  const form = document.getElementById('apiKeyForm');
  if (form) {
    form.addEventListener('submit', (event) => {
      createApiKey(event).catch((error) => setDashboardMessage(error.message, 'error'));
    });
  }
  const keyInput = document.getElementById('apiKeyNameInput');
  if (keyInput) {
    keyInput.addEventListener('input', () => {
      keyInput.style.borderColor = '';
      const errEl = document.getElementById('apiKeyNameError');
      if (errEl) errEl.style.display = 'none';
    });
  }
  const copyBtn = document.getElementById('copyApiKeyBtn');
  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      const disp = document.getElementById('apiKeyDisplay');
      if (disp) {
        navigator.clipboard.writeText(disp.textContent).then(() => {
          copyBtn.textContent = 'Copied!';
          setTimeout(() => { copyBtn.textContent = t('dashboard.copyKey'); }, 2000);
        });
      }
    });
  }

}
function renderPanel(panelName) {
  state.dashboardPanel = panelName;

  // Show/hide the persistent alertCenterPanel — only visible on alerts panel
  const acp = document.getElementById('alertCenterPanel');
  if (acp) acp.style.display = panelName === 'alerts' ? '' : 'none';
  // Restore siteDetail visibility when leaving alerts panel
  const _sd = document.getElementById('siteDetail');
  if (_sd && panelName !== 'alerts') _sd.style.display = '';

  // Update sidebar active state
  document.querySelectorAll('.db-nav-item').forEach(el => el.classList.remove('db-nav-item-active'));
  const navMap = { overview: 'navOverview', alerts: 'navAlerts', 'scan-history': 'navScanHistory', reports: 'navReports', 'api-access': 'navApiAccess', settings: 'navSettings' };
  const activeNav = document.getElementById(navMap[panelName]);
  if (activeNav) activeNav.classList.add('db-nav-item-active');

  const site = state.sites ? state.sites.find(s => s.id === state.selectedSiteId) : null;
  const checks = state.selectedChecks || [];
  const detail = document.getElementById('siteDetail');
  if (!detail) return;

  // Update content header title for non-overview panels
  const dbSiteTitle = document.getElementById('dbSiteTitle');

  if (panelName === 'overview') {
    // Show overview — re-render site detail normally
    renderSiteDetail(site);
    return;
  }

  if (panelName === 'alerts') {
    if (dbSiteTitle) dbSiteTitle.querySelector('.db-site-name') && (dbSiteTitle.querySelector('.db-site-name').textContent = t('dashboard.alertCenter'));
    syncContentHeader(null, null, null, true);
    detail.classList.remove('empty-state', 'is-loading');
    // Alert Center lives entirely in #alertCenterPanel (shown above siteDetail).
    // Clear siteDetail so there's no duplication.
    detail.innerHTML = '';
    detail.style.display = 'none';
    return;
  }

  if (panelName === 'scan-history') {
    syncContentHeader(site, site ? statusLabel(site.last_status) : null, null, true);
    const nameEl = document.getElementById('dbSelectedSiteName');
    if (site && nameEl) nameEl.textContent = site.name;
    detail.classList.remove('empty-state', 'is-loading');
    if (!site) {
      detail.innerHTML = '<div class="db-empty-icon"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg></div>' +
        '<h2>' + escapeHtml(t('dashboard.scanHistory')) + '</h2>' +
        '<p>' + escapeHtml(t('dashboard.selectSiteFirst')) + '</p>';
      detail.classList.add('empty-state');
      return;
    }
    const tableHtml = buildScanHistoryTable(checks, state.plan);
    detail.innerHTML = '<div class="detail-panel" style="margin:0 0 16px;">' +
      '<div class="detail-panel-head"><span>' + escapeHtml(t('dashboard.scanHistory')) + '</span></div>' +
      '<div style="overflow-x:auto;padding:0 4px;" id="panelScanHistoryTable">' + tableHtml + '</div></div>';
    const tableWrap = document.getElementById('panelScanHistoryTable');
    if (tableWrap) {
      const allHistory = checks;
      const now = Date.now();
      let historyChecks;
      if (state.plan === 'agency') {
        historyChecks = allHistory.filter(c => (now - new Date(c.created_at).getTime()) < 90 * 24 * 60 * 60 * 1000);
      } else if (state.plan === 'starter') {
        historyChecks = allHistory.filter(c => (now - new Date(c.created_at).getTime()) < 30 * 24 * 60 * 60 * 1000);
      } else {
        historyChecks = allHistory.slice(0, 3);
      }
      tableWrap.addEventListener('click', function(e) {
        const td = e.target.closest('[data-history-idx]');
        if (!td) return;
        const idx = Number(td.dataset.historyIdx);
        const histSite = state.sites ? state.sites.find(s => s.id === state.selectedSiteId) : null;
        if ((e.target.classList.contains('sh-view-btn') || e.target.classList.contains('sh-dl-btn')) && histSite && historyChecks[idx]) {
          generateClientReport(histSite, [historyChecks[idx]], state.plan);
        }
      });
    }
    return;
  }

  if (panelName === 'reports') {
    syncContentHeader(site, site ? statusLabel(site.last_status) : null, null, true);
    const nameEl = document.getElementById('dbSelectedSiteName');
    if (site && nameEl) nameEl.textContent = site.name;
    detail.classList.remove('empty-state', 'is-loading');
    if (!site) {
      detail.innerHTML = '<div class="db-empty-icon"><svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div>' +
        '<h2>' + escapeHtml(t('dashboard.reports')) + '</h2>' +
        '<p>' + escapeHtml(t('dashboard.noReports')) + '</p>';
      detail.classList.add('empty-state');
      return;
    }
    const latest = checks[0];
    let html = '<div style="padding:4px 0;">' +
      '<h3 style="margin-bottom:16px;">' + escapeHtml(t('dashboard.reports')) + '</h3>';
    if (latest) {
      const scoreColor = latest.score >= 80 ? 'var(--green)' : latest.score >= 60 ? 'var(--amber)' : 'var(--red)';
      html += '<div class="detail-panel" style="margin-bottom:20px;">' +
        '<div class="detail-panel-head"><span>' + escapeHtml(t('dashboard.latestReport')) + '</span></div>' +
        '<div style="padding:16px;display:flex;align-items:center;gap:20px;flex-wrap:wrap;">' +
        '<div><span class="muted" style="font-size:.85rem;">' + escapeHtml(t('dashboard.healthScore')) + '</span><h3 style="color:' + scoreColor + ';margin:4px 0;">' + (latest.score || '-') + '/100</h3></div>' +
        '<div><span class="muted" style="font-size:.85rem;">' + escapeHtml(t('dashboard.lastCheck')) + '</span><p style="margin:4px 0;">' + formatDateTime(latest.created_at) + '</p></div>' +
        '<button class="button small" type="button" id="downloadLatestReportBtn">' + escapeHtml(t('dashboard.downloadReport')) + '</button>' +
        '</div></div>';
    }
    if (checks.length > 1) {
      html += '<div class="detail-panel"><div class="detail-panel-head"><span>Previous Reports</span></div>' +
        '<div style="overflow-x:auto;">' + buildScanHistoryTable(checks.slice(1), state.plan) + '</div></div>';
    }
    if (!latest) {
      html += '<div class="empty subtle">' + escapeHtml(t('dashboard.noHistory')) + '</div>';
    }
    html += '</div>';
    detail.innerHTML = html;
    const dlBtn = document.getElementById('downloadLatestReportBtn');
    if (dlBtn && site && latest) {
      dlBtn.addEventListener('click', () => generateClientReport(site, [latest], state.plan));
    }
    const tableWrap = detail.querySelector('.scan-history-table');
    if (tableWrap) {
      tableWrap.closest('div').addEventListener('click', function(e) {
        const td = e.target.closest('[data-history-idx]');
        if (!td) return;
        const idx = Number(td.dataset.historyIdx);
        if ((e.target.classList.contains('sh-dl-btn') || e.target.classList.contains('sh-view-btn')) && site && checks[idx + 1]) {
          generateClientReport(site, [checks[idx + 1]], state.plan);
        }
      });
    }
    return;
  }

  if (panelName === 'api-access') {
    renderApiAccessPanel(detail);
    return;
  }

  if (panelName === 'settings') {
    syncContentHeader(site, site ? statusLabel(site.last_status) : null, null, true);
    const nameEl = document.getElementById('dbSelectedSiteName');
    if (site && nameEl) nameEl.textContent = site.name;
    detail.classList.remove('empty-state', 'is-loading');
    if (!site) {
      detail.innerHTML = '<div class="db-empty-icon"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg></div>' +
        '<h2>' + escapeHtml(t('dashboard.settings')) + '</h2>' +
        '<p>' + escapeHtml(t('dashboard.selectSiteFirst')) + '</p>';
      detail.classList.add('empty-state');
      return;
    }
    detail.innerHTML = buildSettingsForm(site);
    return;
  }
}


async function initDashboard() {
  if (page !== 'dashboard') return;
  await loadDashboard();

  const _rdb = document.getElementById('refreshDashboardBtn');
  if (_rdb) _rdb.addEventListener('click', loadDashboard);

  document.getElementById('signOutBtn').addEventListener('click', async () => {
    if (state.supabase) await state.supabase.auth.signOut();
    window.location.href = '/signin';
  });

  // Add Monitor button toggles the form
  const addMonitorBtn  = document.getElementById('addMonitorBtn');
  const addMonitorForm = document.getElementById('addMonitorForm');
  const cancelAddBtn   = document.getElementById('cancelAddMonitor');
  if (addMonitorBtn && addMonitorForm) {
    addMonitorBtn.addEventListener('click', () => addMonitorForm.classList.toggle('hidden'));
  }
  if (cancelAddBtn && addMonitorForm) {
    cancelAddBtn.addEventListener('click', () => addMonitorForm.classList.add('hidden'));
  }

  // Copy Client Report button in header
  const copyReportBtn = document.getElementById('copyReportBtn');
  if (copyReportBtn) {
    copyReportBtn.addEventListener('click', () => {
      const site = state.sites ? state.sites.find(s => s.id === state.selectedSiteId) : null;
      if (!site) return;
      generateClientReport(site, state.selectedChecks || [], state.plan);
    });
  }

  // Refresh Ping button (header)
  const refreshPingBtn = document.getElementById('refreshPingBtn');
  if (refreshPingBtn) {
    refreshPingBtn.addEventListener('click', () => {
      if (state.livePingChart) {
        state.livePingChart.stop();
        state.livePingChart.points = [];
        state.livePingChart._updateStats();
        const canvas = document.getElementById('livePingCanvas');
        if (canvas) {
          state.livePingChart.canvas = canvas;
          state.livePingChart.ctx = canvas.getContext('2d');
          state.livePingChart._resize();
        }
        state.livePingChart.start();
      }
    });
  }

  // "Add new site" sidebar button → open modal
  const addMonitorSidebarBtn = document.getElementById('addMonitorSidebarBtn');
  const addSiteModal         = document.getElementById('addSiteModal');
  const closeModalBtn        = document.getElementById('closeAddSiteModal');
  if (addMonitorSidebarBtn && addSiteModal) {
    addMonitorSidebarBtn.addEventListener('click', () => addSiteModal.classList.remove('hidden'));
  }
  if (closeModalBtn && addSiteModal) {
    closeModalBtn.addEventListener('click', () => addSiteModal.classList.add('hidden'));
  }
  if (addSiteModal) {
    addSiteModal.addEventListener('click', (e) => {
      if (e.target === addSiteModal) addSiteModal.classList.add('hidden');
    });
  }

  // Sidebar navigation
  document.querySelectorAll('.db-nav-item').forEach(navEl => {
    navEl.addEventListener('click', (e) => {
      e.preventDefault();
      const panelMap = {
        navOverview: 'overview',
        navAlerts: 'alerts',
        navScanHistory: 'scan-history',
        navReports: 'reports',
        navApiAccess: 'api-access',
        navSettings: 'settings'
      };
      const panel = panelMap[navEl.id];
      if (panel) renderPanel(panel);
    });
  });

  // Upgrade click handler (works anywhere in dashboard)
  document.getElementById('dashboardView').addEventListener('click', async (event) => {
    const deleteButton = event.target.closest('#deleteMonitorBtn[data-delete]');
    if (deleteButton) {
      try {
        await deleteMonitor(deleteButton.dataset.delete);
      } catch (error) {
        setDashboardMessage(error.message, 'error');
      }
      return;
    }

    const button = event.target.closest('[data-dashboard-upgrade]');
    if (!button) return;
    try {
      await startUpgrade(button.dataset.dashboardUpgrade);
    } catch (error) {
      setDashboardMessage(error.message, 'error');
    }
  });

  document.getElementById('siteForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!hasFeature('monitored_sites')) {
      setDashboardMessage(t('dashboard.monitoringUnavailable'), 'error');
      return;
    }
    const siteUrl = normalizePublicUrl(document.getElementById('siteUrl').value);
    if (!siteUrl) {
      setDashboardMessage(t('dashboard.enterUrl'), 'error');
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
    const _modal = document.getElementById('addSiteModal');
    if (_modal) _modal.classList.add('hidden');
    if (addMonitorForm) addMonitorForm.classList.add('hidden');
    await loadDashboard();
    setDashboardMessage(t('dashboard.saved'), 'success');
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
    const action = event.target.closest('[data-run], [data-refresh-detail], [data-delete]');
    if (!action) return;
    const runId = action.dataset.run;
    const refreshId = action.dataset.refreshDetail;
    const deleteId = action.dataset.delete;
    try {
      if (runId) {
        // Cooldown gate — prevent running if still within plan interval
        const _stored = localStorage.getItem('st_last_scan_' + runId);
        if (_stored) {
          const _elapsed = Date.now() - Number(_stored);
          const _cooldownMs = planIntervalMinutes() * 60 * 1000;
          if (_elapsed < _cooldownMs) {
            const _rem = Math.ceil((_cooldownMs - _elapsed) / 1000);
            const _mm = String(Math.floor(_rem / 60)).padStart(2, '0');
            const _ss = String(_rem % 60).padStart(2, '0');
            setDashboardMessage('Scan cooldown active. Next scan in ' + _mm + ':' + _ss + '.', 'error');
            return;
          }
        }
        await runSiteCheck(runId);
      }
      if (refreshId) {
        state.selectedSiteId = refreshId;
        await loadSelectedChecks();
        renderDashboard();
      }
      if (deleteId) {
        await deleteMonitor(deleteId);
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
      email_alerts_enabled: hasFeature('in_app_alerts') ? document.getElementById('emailAlertsInput').checked : false,
      alert_on_down: hasFeature('in_app_alerts') ? document.getElementById('alertDownInput').checked : false,
      alert_on_warning: hasFeature('in_app_alerts') ? document.getElementById('alertWarningInput').checked : false,
      alert_on_recovery: hasFeature('in_app_alerts') ? document.getElementById('alertRecoveryInput').checked : false,
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

  // If logged in, fetch current plan and update button states
  if (state.session) {
    try {
      const me = await fetch(apiPath('/api/me'), { headers: authHeaders() }).then(r => r.json());
      const currentPlan = me.plan || (me.profile && me.profile.plan) || 'free';
      const planRank = { free: 0, starter: 1, agency: 2 };
      const currentRank = planRank[currentPlan] || 0;

      const starterBtn = document.getElementById('starterBtn');
      const agencyBtn  = document.getElementById('agencyBtn');

      if (starterBtn) {
        if (currentPlan === 'starter') {
          starterBtn.textContent = '✓ Current plan';
          starterBtn.disabled = true;
          starterBtn.classList.add('secondary');
          starterBtn.style.opacity = '.55';
          starterBtn.style.cursor = 'default';
        } else if (currentRank > 1) {
          starterBtn.textContent = 'Downgrade';
          starterBtn.classList.add('secondary');
        }
      }

      if (agencyBtn) {
        if (currentPlan === 'agency') {
          agencyBtn.textContent = '✓ Current plan';
          agencyBtn.disabled = true;
          agencyBtn.style.opacity = '.55';
          agencyBtn.style.cursor = 'default';
        } else if (currentRank < 2) {
          agencyBtn.textContent = 'Upgrade to Agency';
          agencyBtn.classList.add('button');
          agencyBtn.classList.remove('secondary');
        }
      }
    } catch (_) { /* silently ignore */ }
  }

  buttons.forEach((button) => button.addEventListener('click', async () => {
    if (button.disabled) return;
    const message = document.getElementById('pageMessage');
    if (!state.session) {
      window.location.href = '/signin';
      return;
    }
    try {
      await startUpgrade(button.dataset.upgrade);
    } catch (error) {
      if (message) message.textContent = error.message;
    }
  }));
}

async function init() {
  initPreferences();
  applyLanguage();
  await initNavSession();
  initAnalyzer();
  initDemo();
  await initAuth();
  await initDashboard();
  await initStatusPage();
  await initBilling();
}

init();
