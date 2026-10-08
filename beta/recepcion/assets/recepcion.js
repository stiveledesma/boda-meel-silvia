/* Recepción V11.2 · web pública estática + servidor Apps Script.
   El servidor valida SIEMPRE la sesión, cupos y operación.
   Este JS no contiene contraseñas ni datos de otros invitados. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const SESSION_STORAGE_KEY = 'ms_v111_reception_session';
  const EXPIRATION_STORAGE_KEY = 'ms_v111_reception_expiration';
  const DEVICE_STORAGE_KEY = 'ms_v111_device_id';
  const errors = Object.freeze({
    SESION_EXPIRADA: 'La sesión terminó. Inicia un nuevo turno.',
    CLAVE_RECEPCION_INCORRECTA: 'Contraseña de recepción incorrecta.',
    RECEPCION_NO_CONFIGURADA: 'No se ha configurado RECEPCION_CLAVE en Apps Script.',
    ACCESO_TEMPORALMENTE_BLOQUEADO: 'Demasiados intentos incorrectos. Espera 5 minutos.',
    PASE_NO_ENCONTRADO: 'Este pase no aparece en la lista de invitados.',
    RSVP_NO_CONFIRMADO: 'Esta invitación todavía no tiene la asistencia confirmada.',
    INVITACION_INACTIVA: 'Esta invitación está desactivada.',
    CUPO_INSUFICIENTE: 'No quedan suficientes lugares disponibles.',
    CUPO_INVALIDO_REVISAR_HOJA: 'Revisa las sillas reservadas en Google Sheets.',
    CODIGO_QR_INVALIDO: 'El código QR no tiene el formato esperado.',
    CANTIDAD_INVALIDA: 'Elige una cantidad válida.',
    ERROR_OPERACION: 'No se pudo completar la operación. Consulta el pase de nuevo.',
    OPERACION_INVALIDA: 'Identificador de operación inválido.',
  });

  const url = String(window.RECEPCION_CONFIG?.apiUrl || '').trim();
  const apiReady = /^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(url);
  const setup = $('setupMessage');
  let sessionToken = '';
  let expiresAt = 0;
  let busy = false;
  let currentEntry = '';
  let currentPass = null;
  let dashboardData = null;
  let activeMainTab = 'scan';
  let activeRosterTab = 'porLlegar';
  let dashboardBusy = false;
  let successTimer = null;
  let stream = null;
  let detector = null;
  let scanActive = false;
  let scanPaused = false;
  let scanLoopId = 0;
  let scannerBusy = false;
  let lastFrameAt = 0;
  let blockedCode = '';
  let noQrFrames = 0;
  const scanCanvas = document.createElement('canvas');
  const scanCtx = scanCanvas.getContext('2d', {willReadFrequently:true});

  function message(id, text, isError=false) {
    const e = $(id);
    if (!e) return;
    e.textContent = text;
    e.classList.toggle('error', isError);
  }
  function friendly(value) {
    const raw = typeof value === 'string' ? value : String(value?.message || 'ERROR_OPERACION');
    return errors[raw] || raw;
  }
  function lock(yes) {
    busy = yes;
    for(const id of ['loginButton','manualButton','admitButton','logoutButton']) $(id).disabled = yes;
  }
  function sleep(ms) { return new Promise(resolve => setTimeout(resolve,ms)); }
  function uuidHex() {
    if (!window.crypto?.getRandomValues) throw new Error('Se necesita HTTPS para generar identificadores seguros.');
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return [...bytes].map(b=>b.toString(16).padStart(2,'0')).join('');
  }
  function isEntryCode(value) { return /^ENTRY_[a-zA-Z0-9]{16,48}$/.test(String(value || '').trim()); }

  // Consulta de solo lectura con identificador secreto de operación (NO es el PIN).
  // No hay sesiones ni contraseñas en la URL.
  function jsonpResult(opId) {
    return new Promise((resolve,reject)=>{
      const callback = '__reception_cb_' + uuidHex();
      const endpoint = new URL(url);
      endpoint.searchParams.set('action','recepcion_resultado');
      endpoint.searchParams.set('opId',opId);
      endpoint.searchParams.set('callback',callback);
      endpoint.searchParams.set('_',String(Date.now()));
      const script = document.createElement('script');
      let completed = false;
      function finish(error, data) {
        if(completed) return;
        completed = true;
        clearTimeout(timer);
        try { delete window[callback]; } catch (_) { window[callback]=undefined; }
        script.remove();
        if(error) reject(error); else resolve(data);
      }
      const timer = setTimeout(()=>finish(new Error('Tiempo de espera al consultar el servidor.')),8000);
      window[callback] = data => finish(null,data);
      script.onerror = () => finish(new Error('No se recibió respuesta de Apps Script.'));
      script.src = endpoint.toString();
      document.head.appendChild(script);
    });
  }

  // Escrituras solo mediante POST. El resultado es opaco por CORS, por lo que
  // se recupera por polling GET JSONP con un opId aleatorio no predecible.
  async function api(action, payload = {}, totalWaitMs=45000) {
    if (!apiReady) throw new Error('La URL /exec de Apps Script aún no está configurada.');
    const opId = uuidHex();
    const body = new URLSearchParams({action, opId, ...payload});
    let transportError = null;
    const post = fetch(url, {
      method: 'POST', mode: 'no-cors', credentials: 'omit',
      body, referrerPolicy: 'no-referrer', cache: 'no-store'
    }).catch(err => {transportError = err;});
    const deadline = Date.now()+totalWaitMs;
    // No hay que asumir éxito solo porque la petición POST fue despachada.
    while(Date.now() < deadline) {
      await sleep(900);
      try {
        const response = await jsonpResult(opId);
        if(response?.lista === false) continue;
        if(response?.ok === false) throw new Error(response.error || 'ERROR_OPERACION');
        return response;
      } catch(err) {
        const raw = String(err.message||err);
        if(raw in errors) throw err;
        // Un fallo de una consulta no demuestra que el POST haya fallado.
        if(Date.now() >= deadline) break;
      }
    }
    await Promise.race([post,sleep(200)]);
    throw new Error(transportError
      ? 'No se pudo enviar o comprobar la petición. Verifica tu conexión.'
      : 'No se confirmó la operación. Consulta otra vez el pase antes de repetir el ingreso.');
  }

  function getSaved() {
    try {
      return {
        token:sessionStorage.getItem(SESSION_STORAGE_KEY)||'',
        expiry:Number(sessionStorage.getItem(EXPIRATION_STORAGE_KEY)||0)
      };
    } catch(_) { return {token:'',expiry:0}; }
  }
  function getDeviceId() {
    try {
      let id = sessionStorage.getItem(DEVICE_STORAGE_KEY);
      if(!/^[0-9a-f]{32}$/.test(id||'')) {
        id = uuidHex();
        sessionStorage.setItem(DEVICE_STORAGE_KEY,id);
      }
      return id;
    } catch(_) { return uuidHex(); }
  }
  function clearSaved() {
    try { sessionStorage.removeItem(SESSION_STORAGE_KEY); sessionStorage.removeItem(EXPIRATION_STORAGE_KEY); } catch(_) {}
  }
  function saveSession(token, expiry) {
    try { sessionStorage.setItem(SESSION_STORAGE_KEY,token); sessionStorage.setItem(EXPIRATION_STORAGE_KEY,String(expiry)); } catch(_) {}
  }
  function showLogin(msg='') {
    sessionToken = '';
    expiresAt = 0;
    clearSaved();
    void stopCamera();
    $('privateArea').hidden=true;
    $('loginSection').hidden=false;
    $('guestPanel').hidden=true;
    dashboardData=null;
    closeSuccessDialog();
    message('loginMessage',msg,Boolean(msg));
  }
  function showActive() {
    $('loginSection').hidden = true;
    $('privateArea').hidden = false;
    updateSessionDisplay();
  }
  function updateSessionDisplay(){
    if(!sessionToken) return;
    const remain = Math.max(0,Math.floor((expiresAt-Date.now())/60000));
    $('remainingSession').textContent = remain>=60 ? `${Math.floor(remain/60)} h ${remain%60} min` : `${remain} min`;
    if(remain === 0 && Date.now() >= expiresAt) showLogin('El turno terminó. Vuelve a iniciar sesión.');
  }
  async function startSession(e) {
    e.preventDefault();
    if(busy)return;
    const password = $('password').value;
    $('password').value=''; // Ni se guarda ni se vuelve a mostrar.
    if(password.length < 16){message('loginMessage','La clave debe tener al menos 16 caracteres.',true);return;}
    lock(true); message('loginMessage','Validando acceso…');
    try {
      const result=await api('turno_login',{clave:password,clientId:getDeviceId()});
      if(!/^s_[a-f0-9]{64}$/.test(result.sessionToken||''))throw new Error('Sesión inválida del servidor.');
      sessionToken=result.sessionToken;
      expiresAt=Number(result.expiresAt);
      saveSession(sessionToken,expiresAt);
      message('loginMessage','');
      showActive();
      message('cameraMessage','Turno iniciado. Activa la cámara una vez para comenzar.');
      void refreshDashboard();
    } catch(err){message('loginMessage',friendly(err),true);}
    finally{lock(false);}
  }
  async function restoreSession(){
    const saved=getSaved();
    if(!saved.token || saved.expiry<=Date.now()){clearSaved();return;}
    lock(true);
    message('loginMessage','Recuperando turno anterior…');
    try {
      const result=await api('turno_estado',{sessionToken:saved.token},30000);
      sessionToken=saved.token;
      expiresAt=Number(result.expiresAt);
      showActive();
      message('cameraMessage','Turno recuperado. Activa la cámara cuando estés listo.');
      void refreshDashboard();
    }catch(_){showLogin('El turno anterior expiró. Vuelve a ingresar la clave.');}
    finally{lock(false);}
  }
  async function logout(){
    if(!sessionToken)return;
    const old = sessionToken;
    showLogin();
    try{await api('turno_logout',{sessionToken:old},15000);}catch(_){}
  }

  function renderPass(pass){
    currentPass=pass;
    $('guestPanel').hidden=false;
    $('guestName').textContent=String(pass.nombre||'—');
    $('guestMesa').textContent=pass.mesa==null ? 'Se asignará en recepción' : String(pass.mesa);
    $('guestReserved').textContent=String(pass.reservados);
    $('guestEntered').textContent=String(pass.ingresos);
    $('guestAvailable').textContent=String(pass.disponibles);
    $('guestStatus').textContent=pass.disponibles>0 ? pass.estado : 'Cupo completo';
    $('admitArea').hidden=pass.disponibles<=0;
    const select=$('quantity');
    select.replaceChildren();
    for(let n=1;n<=Math.min(1000,Number(pass.disponibles));n++){
      const option=document.createElement('option');
      option.value=String(n); option.textContent=n===1?'1 persona':`${n} personas`;
      select.appendChild(option);
    }
    message('admitMessage',pass.disponibles===0?'No quedan lugares disponibles.':'');
    $('nextButton').hidden=false;
  }

  async function verify(code){
    if(busy || !sessionToken)return;
    const entry=String(code||'').trim();
    if(!isEntryCode(entry)){
      message('cameraMessage','Lee un QR válido o escribe el código ENTRY_ completo.',true);return;
    }
    scanPaused=true;
    currentPass=null; currentEntry='';
    $('guestPanel').hidden=true;
    message('cameraMessage','Buscando invitación…');
    lock(true);
    try{
      const result=await api('turno_verificar',{sessionToken, entrada:entry});
      currentEntry=entry;
      $('manualCode').value=entry;
      renderPass(result.pase);
      message('cameraMessage','Pase válido. Verifica quién se presenta.');
    } catch(err){
      if(err.message==='SESION_EXPIRADA')showLogin(friendly(err));
      else {message('cameraMessage',friendly(err),true);scanPaused=false;blockedCode=entry;noQrFrames=0;}
    }finally{lock(false);}
  }

  function readyNext(note='Listo para escanear al siguiente invitado.'){
    const previous=currentEntry;
    currentEntry='';currentPass=null;
    $('guestPanel').hidden=true;
    $('manualCode').value='';
    $('nextButton').hidden=true;
    scanPaused=false;
    blockedCode=previous;
    noQrFrames=0;
    message('cameraMessage',note);
  }
  async function registerAdmission(){
    if(busy || !sessionToken || !currentEntry || !currentPass)return;
    const qty=Number($('quantity').value);
    if(!Number.isInteger(qty)||qty<1||qty>currentPass.disponibles)return;
    // Importante: si la red falla, una operación incierta NO se reenvía.
    // El encargado debe consultar de nuevo el pase primero.
    const entry=currentEntry;
    const txnId=uuidHex();
    lock(true);message('admitMessage',`Registrando ${qty} ${qty===1?'persona':'personas'}…`);
    try{
      const result=await api('turno_registrar',{
        sessionToken,entrada:entry,cantidad:String(qty),operacionId:txnId
      },55000);
      if(result.pase && result.pase.disponibles>=0){
        renderPass(result.pase);
      }
      const resultMessage=result.yaProcesada?'La operación ya estaba registrada.':'Ingreso registrado correctamente.';
      const pass=result.pase||{};
      readyNext(resultMessage + ' Listo para el siguiente QR.');
      showSuccessDialog(pass.nombre || currentPass?.nombre || 'Invitado', qty, pass.ingresos, pass.reservados, pass.disponibles);
      void refreshDashboard();
    }catch(err){
      if(err.message==='SESION_EXPIRADA')showLogin(friendly(err));
      else {
        message('admitMessage',friendly(err)+' No reintentes sin consultar primero el estado del pase.',true);
        $('admitButton').disabled=true;
        $('nextButton').hidden=false;
      }
    }finally{lock(false);}
  }

  /* =========================================================
     V11.2 — Confirmación clara de ingreso y lista privada
     ========================================================= */
  function closeSuccessDialog(){
    if(successTimer){clearTimeout(successTimer);successTimer=null;}
    const dialog=$('successDialog');
    if(dialog && dialog.open) dialog.close();
    // En cuanto el personal continúa, el lector vuelve a quedar activo.
    if(scanActive && activeMainTab==='scan' && !currentPass) scanPaused=false;
  }
  function showSuccessDialog(name, qty, total, reserved, remaining){
    const label=Number(qty)===1?'persona registrada':'personas registradas';
    const summary=`${qty} ${label} · ${total} de ${reserved} ingresaron`;
    $('successCount').textContent=summary;
    $('successGuest').textContent=String(name);
    $('successRemaining').textContent=remaining===0?'Cupo completo: nadie más puede entrar con este pase.':`Quedan ${remaining} lugares disponibles.`;
    $('recentAdmission').textContent=`✓ ${name}: ${qty} ${Number(qty)===1?'ingreso registrado':'ingresos registrados'}. Total ${total} de ${reserved}.`;
    $('recentAdmission').hidden=false;
    if(scanActive) scanPaused=true;
    if(typeof $('successDialog').showModal==='function') $('successDialog').showModal();
    else message('cameraMessage',summary);
    successTimer=setTimeout(closeSuccessDialog,4200);
  }
  function renderDashboard(){
    const data=dashboardData;
    if(!data)return;
    const total=data.totales||{};
    $('metricReserved').textContent=String(total.reservados??0);
    $('metricEntered').textContent=String(total.ingresaron??0);
    $('metricRemaining').textContent=String(total.porEntrar??0);
    const counts={
      countPending:data.porLlegar?.length||0,
      countEntered:data.ingresaron?.length||0,
      countUnconfirmed:data.sinConfirmar?.length||0,
      countDeclined:data.noAsistiran?.length||0
    };
    for(const [id,n] of Object.entries(counts))$(id).textContent=String(n);
    const items=Array.isArray(data[activeRosterTab])?data[activeRosterTab]:[];
    const text=$('rosterFilter').value.trim().toLocaleLowerCase('es');
    const matches=items.filter(item=>String(item.nombre||'').toLocaleLowerCase('es').includes(text));
    const list=$('rosterList');
    list.replaceChildren();
    if(!matches.length){
      const empty=document.createElement('div');empty.className='roster-empty';
      empty.textContent=text?'No encontramos ese nombre en esta pestaña.':'No hay invitaciones en esta categoría.';
      list.appendChild(empty);
      return;
    }
    for(const item of matches){
      const card=document.createElement('article');card.className='roster-item';
      const line=document.createElement('div');line.className='roster-line';
      const title=document.createElement('h3');title.className='roster-name';title.textContent=String(item.nombre||'');
      const state=document.createElement('span');state.className='roster-badge';
      const status=String(item.estado||'');
      state.classList.toggle('pending',item.disponibles>0);
      state.textContent=activeRosterTab==='sinConfirmar'?'Sin confirmar':activeRosterTab==='noAsistiran'?'No asistirá':status;
      line.append(title,state);
      const meta=document.createElement('p');meta.className='roster-meta';
      const mesa=item.mesa===null?'Mesa por asignar':`Mesa ${item.mesa}`;
      meta.textContent=`${mesa} · Reservados: ${item.reservados} · Entraron: ${item.ingresos} · Faltan: ${item.disponibles}`;
      card.append(line,meta);
      list.append(card);
    }
  }
  async function refreshDashboard(){
    if(!sessionToken || dashboardBusy || !apiReady)return;
    dashboardBusy=true;
    $('refreshDashboard').disabled=true;
    message('dashboardMessage','Actualizando datos de invitados…');
    try{
      const data=await api('turno_resumen',{sessionToken},45000);
      if(!data?.ok || !data?.totales)throw new Error('No se recibió el resumen.');
      dashboardData=data;
      renderDashboard();
      const time=new Date(data.actualizadoEn||Date.now());
      $('dashboardTimestamp').textContent='Última actualización: '+time.toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
      message('dashboardMessage','Datos sincronizados con Google Sheets.');
    }catch(err){
      if(err.message==='SESION_EXPIRADA')showLogin(friendly(err));
      else message('dashboardMessage','No pudimos actualizar el resumen. '+friendly(err),true);
    }finally{
      dashboardBusy=false;
      $('refreshDashboard').disabled=false;
    }
  }
  function switchMainTab(tab){
    activeMainTab=tab==='dashboard'?'dashboard':'scan';
    $('scanArea').hidden=activeMainTab!=='scan';
    $('dashboardPanel').hidden=activeMainTab!=='dashboard';
    for(const btn of document.querySelectorAll('[data-main-tab]')){
      const selected=btn.dataset.mainTab===activeMainTab;
      btn.classList.toggle('is-selected',selected);
      btn.setAttribute('aria-selected',String(selected));
    }
    if(scanActive)scanPaused=activeMainTab!=='scan'||Boolean(currentPass)||$('successDialog').open;
    if(activeMainTab==='dashboard')void refreshDashboard();
  }
  for(const btn of document.querySelectorAll('[data-main-tab]')){
    btn.addEventListener('click',()=>switchMainTab(btn.dataset.mainTab));
  }
  for(const btn of document.querySelectorAll('[data-roster-tab]')){
    btn.addEventListener('click',()=>{
      activeRosterTab=btn.dataset.rosterTab;
      for(const b of document.querySelectorAll('[data-roster-tab]')){
        const selected=b===btn;
        b.classList.toggle('is-selected',selected);
        b.setAttribute('aria-selected',String(selected));
      }
      renderDashboard();
    });
  }
  $('rosterFilter').addEventListener('input',renderDashboard);
  $('refreshDashboard').addEventListener('click',()=>void refreshDashboard());
  $('dismissSuccess').addEventListener('click',closeSuccessDialog);
  $('successDialog').addEventListener('close',()=>{
    if(scanActive && activeMainTab==='scan' && !currentPass)scanPaused=false;
  });

  function decodingMode(){
    if('BarcodeDetector' in window)return 'native';
    if(typeof window.jsQR === 'function')return 'jsqr';
    return 'none';
  }
  async function decodeFromVideo(video){
    if(detector){
      try{
        const results=await detector.detect(video);
        const item=results.find(r=>isEntryCode(r.rawValue));
        return item?.rawValue||'';
      }catch(e){
        detector=null; // Biblioteca jsQR es el respaldo.
      }
    }
    if(typeof window.jsQR!=='function'||!scanCtx)return '';
    const width=640,height=Math.round(width*(video.videoHeight/Math.max(1,video.videoWidth)));
    scanCanvas.width=width;scanCanvas.height=height;
    scanCtx.drawImage(video,0,0,width,height);
    const pixels=scanCtx.getImageData(0,0,width,height);
    const result=window.jsQR(pixels.data,width,height,{inversionAttempts:'attemptBoth'});
    return result && isEntryCode(result.data)?result.data:'';
  }

  async function scanFrame(timestamp){
    if(!scanActive)return;
    // El escáner espera una respuesta antes de leer el siguiente QR.
    if(timestamp-lastFrameAt>280 && !scanPaused && !busy && !scannerBusy && $('cameraVideo').readyState>=2){
      lastFrameAt=timestamp;
      scannerBusy=true;
      try{
        const value=await decodeFromVideo($('cameraVideo'));
        if(!value){
          noQrFrames++;
          if(noQrFrames>=4)blockedCode='';
        }else if(value!==blockedCode){
          noQrFrames=0;
          void verify(value);
        }
      }catch(_){}
      finally{scannerBusy=false;}
    }
    if(scanActive)scanLoopId=requestAnimationFrame(scanFrame);
  }
  async function startCamera(){
    if(!sessionToken)return;
    if(scanActive)return;
    if(!navigator.mediaDevices?.getUserMedia){message('cameraMessage','La cámara no está disponible. Usa Chrome o Safari por HTTPS y permite el acceso.',true);return;}
    if(decodingMode()==='none'){message('cameraMessage','Falta compatibilidad para leer QR. Comprueba la conexión o usa la alternativa manual.',true);return;}
    try{
      if('BarcodeDetector' in window){
        try {detector=new BarcodeDetector({formats:['qr_code']});}catch(_){detector=null;}
      }
      if(!detector && typeof window.jsQR!=='function'){
        message('cameraMessage','Este navegador no puede decodificar QR. Usa la opción manual o prueba Chrome/Safari.',true);return;
      }
      stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
      const video=$('cameraVideo');video.srcObject=stream;await video.play();
      $('viewfinder').hidden=false;
      $('startCamera').hidden=true; $('stopCamera').hidden=false;
      $('scannerStatus').textContent='Cámara activa';
      scanActive=true;scanPaused=false;blockedCode='';
      message('cameraMessage','Cámara activa. Muestra un código QR.');
      scanLoopId=requestAnimationFrame(scanFrame);
    }catch(err){
      await stopCamera();
      message('cameraMessage','No se pudo abrir la cámara: '+friendly(err)+'. Usa la alternativa manual.',true);
    }
  }
  async function stopCamera(){
    scanActive=false;scanPaused=false;
    if(scanLoopId)cancelAnimationFrame(scanLoopId);
    scanLoopId=0;
    if(stream){stream.getTracks().forEach(t=>t.stop());stream=null;}
    $('cameraVideo').srcObject=null;
    $('viewfinder').hidden=true;
    $('startCamera').hidden=false;
    $('stopCamera').hidden=true;
    $('scannerStatus').textContent='Cámara detenida';
  }
  async function decodePhoto(file){
    if(!file)return;
    try {
      const bitmap=await createImageBitmap(file);
      const width=Math.min(1400,bitmap.width),height=Math.round(bitmap.height*width/bitmap.width);
      const cnv=document.createElement('canvas');cnv.width=width;cnv.height=height;
      const ctx=cnv.getContext('2d',{willReadFrequently:true});ctx.drawImage(bitmap,0,0,width,height);
      bitmap.close?.();
      let found='';
      if('BarcodeDetector' in window){
        try{const reader=new BarcodeDetector({formats:['qr_code']}); const codes=await reader.detect(cnv);found=codes.find(c=>isEntryCode(c.rawValue))?.rawValue||'';}catch(_){}
      }
      if(!found && typeof window.jsQR==='function'){
        const data=ctx.getImageData(0,0,width,height);
        const decoded=window.jsQR(data.data,width,height,{inversionAttempts:'attemptBoth'});
        if(isEntryCode(decoded?.data))found=decoded.data;
      }
      if(!found){message('cameraMessage','No se detectó un QR válido en la foto.',true);return;}
      await verify(found);
    }catch(err){message('cameraMessage','No se pudo leer la imagen: '+friendly(err),true);}
    finally{$('imageFile').value='';}
  }

  $('loginForm').addEventListener('submit',startSession);
  $('manualForm').addEventListener('submit',e=>{e.preventDefault();void verify($('manualCode').value);});
  $('logoutButton').addEventListener('click',()=>void logout());
  $('admitButton').addEventListener('click',()=>void registerAdmission());
  $('nextButton').addEventListener('click',()=>readyNext());
  $('startCamera').addEventListener('click',()=>void startCamera());
  $('stopCamera').addEventListener('click',()=>void stopCamera());
  $('imageFile').addEventListener('change',e=>void decodePhoto(e.target.files?.[0]));
  window.addEventListener('pagehide',()=>void stopCamera());
  setInterval(updateSessionDisplay,30000);
  if(!apiReady){
    setup.hidden=false;
    setup.textContent='Configura la URL /exec de V11 en recepcion/config.js antes de iniciar sesión.';
    $('loginButton').disabled=true;
  } else void restoreSession();
})();
