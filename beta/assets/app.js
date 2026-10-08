const $ = (s, p = document) => p.querySelector(s);
const $$ = (s, p = document) => [...p.querySelectorAll(s)];
const toast = $('#toast');
const gate = $('#gate');
const body = document.body;
const song = $('#weddingSong');
const audioControl = $('#audioControl');
const audioLabel = $('#audioLabel');

/* =========================================================
   API Boda Meel & Silvia
   ========================================================= */
const API_URL = String(window.BODA_API_CONFIG?.apiUrl || '').trim();
const pageParams = new URLSearchParams(location.search);
const invitationToken = (pageParams.get('i') || '').trim();
let currentInvitation = null;
let entryQrToken = '';
let loadingEntry = false;
let apiBusy = false;

function showToast(message){
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => toast.classList.remove('show'), 2400);
}

async function startMusic(){
  try{
    await song.play();
    audioControl.classList.add('playing');
    audioLabel.textContent = 'Pausar canción';
  }catch{
    audioLabel.textContent = 'Nuestra canción';
  }
}

$('#openInvitation').addEventListener('click', async () => {
  await startMusic();
  gate.classList.add('closed');
  body.classList.remove('is-locked');
  setTimeout(() => gate.remove(), 950);
});

audioControl.addEventListener('click', async () => {
  if(song.paused){
    await startMusic();
    showToast('Música activada');
  }else{
    song.pause();
    audioControl.classList.remove('playing');
    audioLabel.textContent = 'Nuestra canción';
    showToast('Música en pausa');
  }
});

// Scroll reveal
const observer = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if(entry.isIntersecting){
      entry.target.classList.add('visible');
      observer.unobserve(entry.target);
    }
  });
}, {threshold:.12, rootMargin:'0px 0px -30px 0px'});
$$('.reveal').forEach(el => observer.observe(el));

// Countdown
const weddingDate = new Date('2027-02-14T16:00:00-05:00');
function tick(){
  const diff = Math.max(0, weddingDate - new Date());
  const d = Math.floor(diff / 86400000);
  const h = Math.floor(diff / 3600000) % 24;
  const m = Math.floor(diff / 60000) % 60;
  const s = Math.floor(diff / 1000) % 60;
  $('#days').textContent = String(d).padStart(3,'0');
  $('#hours').textContent = String(h).padStart(2,'0');
  $('#minutes').textContent = String(m).padStart(2,'0');
  $('#seconds').textContent = String(s).padStart(2,'0');
}
tick(); setInterval(tick,1000);

// Mobile film controls
let filmIndex = 0;
const cards = $$('.film-card');
function updateFilm(){
  if(window.innerWidth <= 680){
    cards.forEach(c => c.style.transform = `translateX(${-100 * filmIndex}%)`);
    const progress = $('#filmProgress');
    if(progress) progress.style.transform = `translateX(${filmIndex * 100}%)`;
  }else{
    cards.forEach(c => c.style.transform = '');
  }
}
$$('[data-film]').forEach(btn => btn.addEventListener('click', () => {
  filmIndex = btn.dataset.film === 'next' ? (filmIndex + 1) % cards.length : (filmIndex - 1 + cards.length) % cards.length;
  updateFilm();
}));
window.addEventListener('resize', updateFilm);

function escapeHtml(value){
  return String(value).replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
}

/* =========================================================
   GET API V11.3: JSONP directamente.
   Apps Script ContentService redirige a googleusercontent.com; el
   intento fetch previo fallaba por CORS y provocaba una consulta doble.
   El callback queda validado por el backend. No usar para secretos.
   ========================================================= */
function apiGet(action, token){
  return apiGetJsonp(action, token);
}

function apiGetJsonp(action, token){
  return new Promise((resolve, reject) => {
    const callback = `__ms_jsonp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const url = new URL(API_URL);
    url.searchParams.set('action', action);
    if(token) url.searchParams.set('token', token);
    url.searchParams.set('callback', callback);
    url.searchParams.set('_', Date.now().toString());

    const script = document.createElement('script');
    const timer = setTimeout(() => cleanup(new Error('Tiempo de espera agotado al consultar la invitación.')), 9500);

    let completed = false;
    function cleanup(error, data){
      if(completed) return;
      completed = true;
      clearTimeout(timer);
      try{ delete window[callback]; }catch{}
      script.remove();
      if(error) reject(error); else resolve(data);
    }

    window[callback] = data => cleanup(null, data);
    script.onerror = () => cleanup(new Error('No se pudo conectar con la API.'));
    script.src = url.toString();
    document.head.appendChild(script);
  });
}

/* =========================================================
   POST API rápido — sin esperar una respuesta CORS.

   Enviamos un formulario POST a un iframe oculto y verificamos
   el resultado consultando nuevamente la invitación.
   Esto evita el retraso de ~1 minuto observado con fetch POST.
   ========================================================= */
function apiPostFast(payload){
  return new Promise((resolve, reject) => {
    const stamp = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const iframe = document.createElement('iframe');
    const form = document.createElement('form');
    iframe.name = `ms_api_frame_${stamp}`;
    iframe.hidden = true;
    form.hidden = true;
    form.method = 'POST';
    form.action = API_URL;
    form.target = iframe.name;

    Object.entries(payload).forEach(([key,value]) => {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = key;
      input.value = String(value ?? '');
      form.appendChild(input);
    });

    document.body.append(iframe, form);

    try{
      form.submit();
      // La solicitud ya fue despachada; no esperamos poder leer
      // la respuesta cross-origin del iframe.
      setTimeout(resolve, 120);
      setTimeout(() => {
        try{ iframe.remove(); form.remove(); }catch{}
      }, 15000);
    }catch(error){
      try{ iframe.remove(); form.remove(); }catch{}
      reject(error);
    }
  });
}

function sleep(ms){
  return new Promise(resolve => setTimeout(resolve, ms));
}

/* V11.3: una consulta reducida por acción, sin releer DESEOS,
   CANCIONES y CONFIG cuando solo queremos verificar un resultado. */
async function esperarEstadoRapido(accion, predicado, {timeout = 9800, intervalo = 300} = {}){
  const inicio = performance.now();
  await sleep(380); // permitir que el POST empiece antes de la primera lectura
  while(performance.now() - inicio < timeout){
    try{
      const data = await apiGet(accion, invitationToken);
      if(data?.ok && predicado(data)) return data;
      if(data?.ok === false && ['INVITACION_INACTIVA','INVITACION_NO_ENCONTRADA'].includes(data.error)){
        throw new Error(data.error);
      }
    }catch(error){
      console.warn('Verificación rápida:', error);
    }
    await sleep(intervalo);
  }
  return null;
}
function registrarTiempo(etiqueta,inicio){
  console.info(`[Boda V11.3] ${etiqueta}: ${((performance.now()-inicio)/1000).toFixed(2)} s`);
}

// Pase válido durante 2 minutos para acelerar abrir la entrada en otra pestaña.
// Es una optimización de visualización, NUNCA autoriza el ingreso en recepción.
const PASS_CACHE_TTL = 2 * 60 * 1000;
function cacheKeyPase(){return 'ms_boda_v113_pase_'+invitationToken;}
function cachearPaseValidado(pase){
  if(!invitationToken || !pase?.tokenEntrada) return;
  try{
    localStorage.setItem(cacheKeyPase(),JSON.stringify({
      version:1,apiUrl:API_URL,token:invitationToken,
      expiresAt:Date.now()+PASS_CACHE_TTL,pase:{
        nombre:String(pase.nombre||''),
        sillasReservadas:Number(pase.sillasReservadas||0),
        mesa:pase.mesa||null,
        tokenEntrada:String(pase.tokenEntrada)
      }
    }));
  }catch(error){console.debug('Cache pase no disponible:',error);}
}
function limpiarPaseCache(){
  if(!invitationToken)return;
  try{localStorage.removeItem(cacheKeyPase());}catch{}
}

function setStatus(element, message, type=''){
  if(!element) return;
  element.textContent = message;
  element.classList.remove('is-success','is-error');
  if(type) element.classList.add(type === 'error' ? 'is-error' : 'is-success');
}

function seatsText(count){
  const n = Number(count || 0);
  if(n === 1) return 'Hemos reservado 1 lugar para ti.';
  return `Hemos reservado ${n} lugares para ustedes.`;
}

function rsvpLabel(status){
  const normalized = String(status || '').toLowerCase();
  if(normalized.includes('confirmado')) return 'Asistencia confirmada';
  if(normalized.includes('no asist')) return 'No asistirán';
  return 'Confirmación pendiente';
}

function setInteractiveFormsEnabled(enabled){
  const wishInput = $('#wishText');
  const songInput = $('#songInput');
  const wishButton = $('#wishSubmit');
  const songButton = $('#songSubmit');

  const wishSent = !!currentInvitation?.invitado?.deseoEnviado;
  const songSent = !!currentInvitation?.invitado?.cancionEnviada;

  if(wishInput) wishInput.disabled = !enabled || wishSent;
  if(songInput) songInput.disabled = !enabled || songSent;
  if(wishButton) wishButton.disabled = !enabled || wishSent;
  if(songButton) songButton.disabled = !enabled || songSent;

  if(wishButton) wishButton.textContent = wishSent ? 'Deseo enviado' : 'Enviar deseo';
  if(songButton) songButton.textContent = songSent ? 'Canción enviada' : 'Sugerir canción';

  if(wishSent){
    setStatus($('#wishStatus'), 'Ya recibimos tu mensaje. Cada invitación puede enviar un solo deseo.', 'success');
  }
  if(songSent){
    setStatus($('#songStatus'), 'Ya recibimos tu sugerencia. Cada invitación puede enviar una sola canción.', 'success');
  }

  body.classList.toggle('api-no-token', !enabled);
}

function actualizarEnlacesEntrada(){
  if(!invitationToken)return;
  const url=new URL('entrada/',location.href);
  url.searchParams.set('i',invitationToken);
  if(document.documentElement.dataset.visualTheme==='azul')url.searchParams.set('tema','azul');
  else url.searchParams.delete('tema');
  ['#externalEntryAfterRsvp','#externalEntryFromQr'].forEach(selector=>{
    const anchor=document.querySelector(selector);
    if(anchor)anchor.href=url.toString();
  });
}

function renderInvitation(data){
  currentInvitation = data;
  actualizarEnlacesEntrada();
  const invite = data.invitado;

  $('#guestDisplay').textContent = invite.nombre;
  $('#guestSeats').textContent = seatsText(invite.sillasReservadas);
  $('#guestRsvpState').textContent = rsvpLabel(invite.estadoRSVP);
  $('#guestMetaNote').textContent = 'Datos vinculados a tu invitación personal.';

  const mesaText = invite.mesa ? `Mesa asignada: ${invite.mesa}` : '';
  $('#guestMesa').textContent = mesaText;
  $('#guestMesa').hidden = !invite.mesa;

  $('#wishGuestName').textContent = invite.nombre;
  $('#songGuestName').textContent = invite.nombre;
  setInteractiveFormsEnabled(true);

  $('#rsvpLoading').hidden = true;
  $('#rsvpNoToken').hidden = true;
  $('#rsvpError').hidden = true;
  $('#rsvpPersonalized').hidden = false;
  $('#rsvpGuestName').textContent = invite.nombre;
  $('#rsvpSeats').textContent = seatsText(invite.sillasReservadas);
  $('#rsvpMesa').textContent = mesaText;
  $('#rsvpMesa').hidden = !invite.mesa;

  const normalized = String(invite.estadoRSVP || 'Pendiente').toLowerCase();
  $('#rsvpPending').hidden = normalized !== 'pendiente' || !invite.rsvpAbierto;
  $('#rsvpConfirmed').hidden = normalized !== 'confirmado';
  $('#rsvpDeclined').hidden = !normalized.includes('no asist');
  $('#ingreso').hidden = normalized !== 'confirmado';
  if(normalized === 'confirmado') loadEntryPass();
  else{ limpiarPaseCache(); entryQrToken=''; }
  $('#rsvpClosed').hidden = !!invite.rsvpAbierto || normalized !== 'pendiente';

  if(normalized === 'confirmado'){
    $('#rsvpIntro').textContent = 'Tu asistencia ya se encuentra registrada.';
  }else if(normalized.includes('no asist')){
    $('#rsvpIntro').textContent = 'Tu respuesta ya se encuentra registrada.';
  }
}

function renderNoToken(){
  currentInvitation = null;
  $('#ingreso').hidden = true;
  $('#rsvpLoading').hidden = true;
  $('#rsvpNoToken').hidden = false;
  $('#rsvpError').hidden = true;
  $('#rsvpPersonalized').hidden = true;
  $('#guestDisplay').textContent = 'Con mucho cariño, te invitamos';
  $('#guestSeats').textContent = 'Tu nombre y lugares reservados aparecerán al abrir tu enlace personalizado.';
  $('#guestMesa').hidden = true;
  $('#guestRsvpState').textContent = '';
  $('#guestMetaNote').textContent = 'Esta es la vista general de la invitación.';
  $('#wishGuestName').textContent = 'tu invitación personalizada';
  $('#songGuestName').textContent = 'tu invitación personalizada';
  setInteractiveFormsEnabled(false);
}

function renderApiError(error){
  $('#ingreso').hidden = true;
  $('#rsvpLoading').hidden = true;
  $('#rsvpNoToken').hidden = true;
  $('#rsvpPersonalized').hidden = true;
  $('#rsvpError').hidden = false;
  $('#rsvpErrorText').textContent = error === 'INVITACION_NO_ENCONTRADA'
    ? 'El enlace no corresponde a una invitación válida.'
    : error === 'INVITACION_INACTIVA'
      ? 'Esta invitación ya no se encuentra activa.'
      : 'No pudimos conectar con la lista de invitados. Inténtalo nuevamente.';
  setInteractiveFormsEnabled(false);
}

async function loadInvitation(){
  if(!invitationToken){
    renderNoToken();
    return;
  }

  $('#rsvpLoading').hidden = false;
  $('#rsvpError').hidden = true;
  try{
    const data = await apiGet('invitado', invitationToken);
    if(!data || !data.ok){
      renderApiError(data?.error || 'ERROR_API');
      return;
    }
    renderInvitation(data);
  }catch(error){
    console.error('API invitación:', error);
    renderApiError('CONEXION');
  }
}

$('#retryInvitation').addEventListener('click', loadInvitation);

async function submitRsvp(respuesta){
  if(!invitationToken || apiBusy) return;
  apiBusy = true;
  const buttons = [$('#rsvpYes'), $('#rsvpNo')];
  buttons.forEach(btn => btn.disabled = true);
  setStatus($('#rsvpActionStatus'), 'Registrando tu respuesta…');
  const inicioRsvp=performance.now();

  try{
    await apiPostFast({action:'rsvp', token:invitationToken, respuesta});

    const verified = await esperarEstadoRapido('estado_rsvp', data => {
      const state = String(data.estadoRSVP||'').toLowerCase();
      return respuesta === 'Confirmado'
        ? state === 'confirmado'
        : state.includes('no asist');
    });
    if(!verified?.ok) throw new Error('La respuesta aún no se pudo verificar.');
    const actualizada = {...currentInvitation, invitado:{
      ...currentInvitation.invitado,
      estadoRSVP:verified.estadoRSVP,
      fechaRSVP:verified.fechaRSVP
    }};
    renderInvitation(actualizada);
    registrarTiempo('Confirmación RSVP',inicioRsvp);
    setStatus($('#rsvpActionStatus'), 'Respuesta guardada correctamente.', 'success');
    showToast('Confirmación registrada');
  }catch(error){
    console.error('RSVP:', error);
    setStatus($('#rsvpActionStatus'), 'La verificación está tardando. Recarga la invitación antes de intentar de nuevo.', 'error');
  }finally{
    apiBusy = false;
    buttons.forEach(btn => btn.disabled = false);
  }
}

$('#rsvpYes').addEventListener('click', () => submitRsvp('Confirmado'));
$('#rsvpNo').addEventListener('click', () => submitRsvp('No asistirá'));

$('#wishForm').addEventListener('submit', async e => {
  e.preventDefault();
  if(!invitationToken || !currentInvitation || currentInvitation.invitado?.deseoEnviado) return;
  const message = $('#wishText').value.trim();
  if(!message) return;
  const button = $('#wishSubmit');
  button.disabled = true;
  setStatus($('#wishStatus'), 'Enviando…');
  const inicioDeseo=performance.now();

  try{
    await apiPostFast({action:'deseo', token:invitationToken, mensaje:message});
    const verified = await esperarEstadoRapido('estado_deseo', data=>data.enviado===true);
    if(!verified?.ok || verified.enviado!==true) throw new Error('No se pudo verificar el deseo.');
    $('#wishText').value = '';
    renderInvitation({...currentInvitation,invitado:{...currentInvitation.invitado,deseoEnviado:true}});
    registrarTiempo('Buzón de deseos',inicioDeseo);
    setStatus($('#wishStatus'), 'Gracias. Tu mensaje fue enviado y ya quedó cerrado para esta invitación.', 'success');
    showToast('Deseo enviado');
  }catch(error){
    console.error('Deseo:', error);
    setStatus($('#wishStatus'), 'El envío está tardando. Actualiza la página antes de reenviarlo.', 'error');
    // Evitar un segundo POST si el primero sí quedó registrado pero falló la verificación.
    button.disabled = true;
  }
});

$('#songForm').addEventListener('submit', async e => {
  e.preventDefault();
  if(!invitationToken || !currentInvitation || currentInvitation.invitado?.cancionEnviada) return;
  const value = $('#songInput').value.trim();
  if(!value) return;
  const button = $('#songSubmit');
  button.disabled = true;
  setStatus($('#songStatus'), 'Enviando…');
  const inicioCancion=performance.now();

  try{
    await apiPostFast({action:'cancion', token:invitationToken, cancion:value});
    const verified = await esperarEstadoRapido('estado_cancion', data=>data.enviado===true);
    if(!verified?.ok || verified.enviado!==true) throw new Error('No se pudo verificar la canción.');
    $('#songInput').value = '';
    renderInvitation({...currentInvitation,invitado:{...currentInvitation.invitado,cancionEnviada:true}});
    registrarTiempo('Sugerencia de canción',inicioCancion);
    setStatus($('#songStatus'), 'Canción añadida. Esta invitación ya utilizó su sugerencia.', 'success');
    showToast('Canción enviada');
  }catch(error){
    console.error('Canción:', error);
    setStatus($('#songStatus'), 'El envío está tardando. Actualiza la página antes de reenviarla.', 'error');
    button.disabled = true;
  }
});


/* =========================================================
   Pase de ingreso, independiente del QR para Google Photos.
   El QR se genera localmente: el token no se comparte con
   ningún proveedor externo de imágenes o códigos QR.
   ========================================================= */
async function loadEntryPass(){
  if(!invitationToken || loadingEntry || entryQrToken) return;
  loadingEntry = true;
  $('#entryQrLoading').hidden = false;
  $('#entryError').hidden = true;
  try{
    const data = await apiGet('pase', invitationToken);
    if(!data?.ok || !data.pase?.tokenEntrada) throw new Error(data?.error || 'PASE_NO_DISPONIBLE');
    const pase = data.pase;
    const code = String(pase.tokenEntrada);
    const svg = MSQr.svg(code);
    const uri = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    const image = document.createElement('img');
    image.alt = 'QR individual de la invitación';
    image.width = 264;
    image.height = 264;
    image.src = uri;
    $('#entryQr').replaceChildren(image);
    $('#entryName').textContent = pase.nombre;
    $('#entryCapacity').textContent = seatsText(pase.sillasReservadas);
    $('#entryMesa').hidden = !pase.mesa;
    $('#entryMesa').textContent = pase.mesa ? `Mesa ${pase.mesa}` : '';
    $('#entryDownload').href = uri;
    $('#entryCode').textContent = code;
    $('#entryQrLoading').hidden = true;
    $('#entryQrBlock').hidden = false;
    entryQrToken = code;
    cachearPaseValidado(pase);
  }catch(err){
    console.error('Pase QR:', err);
    $('#entryQrLoading').hidden = true;
    $('#entryError').hidden = false;
  }finally{loadingEntry = false;}
}
$('#entryPrint').addEventListener('click', () => window.print());
$('#entryCopy').addEventListener('click', async () => {
  if(!entryQrToken) return;
  try{ await navigator.clipboard.writeText(entryQrToken); showToast('Código copiado'); }
  catch{showToast('Selecciona el código del pase para copiarlo');}
});

/* =========================================================
   Selector visual Clásico / Azul
   ========================================================= */
const themeStylesheet = document.getElementById('themeStylesheet');
const themeButtons = [...document.querySelectorAll('[data-theme-choice]')];

function currentVisualTheme(){
  return document.documentElement.dataset.visualTheme === 'azul' ? 'azul' : 'clasico';
}

function syncThemeButtons(theme){
  themeButtons.forEach(btn => {
    const active = btn.dataset.themeChoice === theme;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
}

function applyVisualTheme(theme, {persist = true, updateUrl = true} = {}){
  const safeTheme = theme === 'azul' ? 'azul' : 'clasico';
  document.documentElement.dataset.visualTheme = safeTheme;
  themeStylesheet.href = safeTheme === 'azul' ? 'assets/styles-blue.css' : 'assets/styles-classic.css';
  if(persist) localStorage.setItem('ms_visual_theme', safeTheme);
  if(updateUrl){
    const url = new URL(location.href);
    if(safeTheme === 'azul') url.searchParams.set('tema','azul');
    else url.searchParams.delete('tema');
    history.replaceState(null,'',url);
  }
  syncThemeButtons(safeTheme);
  actualizarEnlacesEntrada();
}

themeButtons.forEach(btn => btn.addEventListener('click', () => {
  applyVisualTheme(btn.dataset.themeChoice);
}));

syncThemeButtons(currentVisualTheme());
loadInvitation();
