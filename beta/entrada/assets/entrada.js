/* V11.2 — Pase digital de invitación confirmada.
   Solo GET de lectura al Apps Script de pruebas; QR renderizado localmente.
   No requiere sesión del recepcionista ni incluye ninguna contraseña. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const params=new URLSearchParams(location.search);
  const token=String(params.get('i')||'').trim();
  const saved=(()=>{try{return localStorage.getItem('ms_visual_theme')}catch(_){return null}})();
  const theme=params.get('tema')==='azul'?'azul':params.get('tema')==='clasico'?'clasico':saved==='azul'?'azul':'clasico';
  document.documentElement.dataset.theme=theme;
  const apiUrl=String(window.BODA_API_CONFIG?.apiUrl||'').trim();
  const apiReady=/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(apiUrl);
  const invite=new URL('../',location.href);
  if(token) invite.searchParams.set('i',token);
  if(theme==='azul')invite.searchParams.set('tema','azul');
  $('returnInvite').href=invite.toString();
  $('returnError').href=invite.toString();
  let pass=null;

  function renderError(message){
    $('loadingState').hidden=true;
    $('ticket').hidden=true;
    $('actions').hidden=true;
    $('errorText').textContent=message;
    $('errorState').hidden=false;
  }
  function jsonp(action,code){
    return new Promise((resolve,reject)=>{
      const callback='__ms_entry_'+Date.now()+'_'+Math.random().toString(36).slice(2);
      const endpoint=new URL(apiUrl);
      endpoint.searchParams.set('action',action);
      endpoint.searchParams.set('token',code);
      endpoint.searchParams.set('callback',callback);
      endpoint.searchParams.set('_',String(Date.now()));
      const script=document.createElement('script');
      let completed=false;
      const timer=setTimeout(()=>finish(new Error('Tiempo de espera agotado.')),15000);
      function finish(err,data){
        if(completed)return;
        completed=true;
        clearTimeout(timer);
        try{delete window[callback]}catch(_){window[callback]=undefined}
        script.remove();
        if(err)reject(err);else resolve(data);
      }
      window[callback]=data=>finish(null,data);
      script.onerror=()=>finish(new Error('No se pudo conectar con Apps Script.'));
      script.src=endpoint.toString();
      document.head.appendChild(script);
    });
  }
  // Cachea solo pases previamente confirmados por el backend durante 2 min.
  // Se usa para una apertura inmediata al pulsar «Abrir entrada»; el registro
  // de acceso SIEMPRE se valida en el servidor por el personal de recepción.
  const cacheKey='ms_boda_v113_pase_'+token;
  function leerCachePase(){
    try{
      const c=JSON.parse(localStorage.getItem(cacheKey)||'null');
      if(!c || c.version!==1 || c.token!==token || c.apiUrl!==apiUrl ||
         !(Number(c.expiresAt)>Date.now()) || !c.pase?.tokenEntrada ||
         !/^ENTRY_[A-Za-z0-9_-]{8,100}$/.test(String(c.pase.tokenEntrada))){
        try{localStorage.removeItem(cacheKey)}catch(_){}
        return null;
      }
      return c.pase;
    }catch(_){return null}
  }
  function guardarCachePase(pase){
    try{localStorage.setItem(cacheKey,JSON.stringify({
      version:1,token,apiUrl,expiresAt:Date.now()+120000,pase
    }))}catch(_){}
  }
  function borrarCachePase(){try{localStorage.removeItem(cacheKey)}catch(_){}}
  function mostrarPase(pase){
    pass=pase;
    const code=String(pass.tokenEntrada);
    const svg=window.MSQr.svg(code);
    const parser=new DOMParser();
    const doc=parser.parseFromString(svg,'image/svg+xml');
    const node=document.importNode(doc.documentElement,true);
    $('qrImage').replaceChildren(node);
    $('ticketName').textContent=String(pass.nombre||'');
    const seats=Number(pass.sillasReservadas)||0;
    $('ticketSeats').textContent=seats===1?'1 lugar reservado':`${seats} lugares reservados`;
    $('ticketTable').hidden=!pass.mesa;
    $('ticketTable').textContent=pass.mesa?`Mesa ${pass.mesa}`:'';
    $('ticketCode').textContent=code;
    $('loadingState').hidden=true;
    $('errorState').hidden=true;
    $('ticket').hidden=false;
    $('actions').hidden=false;
  }
  async function load(){
    if(!token){renderError('Abre el pase desde tu invitación personal.');return}
    if(!apiReady){renderError('Esta versión de prueba todavía no tiene configurada la URL de Apps Script.');return}
    const inicio=performance.now();
    const cache=leerCachePase();
    if(cache){
      mostrarPase(cache);
      $('actionStatus').textContent='Entrada preparada. Verificando su vigencia…';
      console.info('[Boda V11.3] Entrada mostrada desde caché: '+((performance.now()-inicio)/1000).toFixed(2)+' s');
    }
    try{
      const result=await jsonp('pase',token);
      if(!result?.ok || !result.pase?.tokenEntrada){
        borrarCachePase();
        const message=result?.error==='RSVP_NO_CONFIRMADO'
          ? 'Primero confirma tu asistencia desde tu invitación.'
          : 'No fue posible validar este pase. Vuelve a abrir tu invitación.';
        renderError(message);
        return;
      }
      mostrarPase(result.pase);
      guardarCachePase(result.pase);
      $('actionStatus').textContent='Pase verificado correctamente.';
      console.info('[Boda V11.3] Entrada verificada: '+((performance.now()-inicio)/1000).toFixed(2)+' s');
    }catch(error){
      if(cache){
        $('actionStatus').textContent='No se pudo comprobar la vigencia ahora. Recepción validará el código al ingresar.';
      }else{
        renderError('No se pudo recuperar tu QR. Comprueba la conexión e inténtalo de nuevo.');
      }
    }
  }
  function fittedText(ctx,text,startSize,maxWidth,weight='500'){
    let size=startSize;
    while(size>32){ctx.font=`${weight} ${size}px Georgia, serif`;if(ctx.measureText(text).width<=maxWidth)break;size-=2;}
    return size;
  }
  async function downloadTicket(){
    if(!pass)return;
    $('downloadTicket').disabled=true;
    $('actionStatus').textContent='Generando tu entrada…';
    try{
      const canvas=document.createElement('canvas');
      const W=1080,H=1590;
      canvas.width=W;canvas.height=H;
      const ctx=canvas.getContext('2d');
      const blue=theme==='azul';
      const primary=blue?'#2b4661':'#55372d';
      const muted=blue?'#678198':'#927362';
      const line=blue?'#bfd4e4':'#dac1ad';
      const bg=blue?'#eff7fb':'#fff8f2';
      ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
      const gradients=ctx.createLinearGradient(0,0,W,H);
      gradients.addColorStop(0,blue?'#e4f0f8':'#f9ecdf');
      gradients.addColorStop(.5,'#fffdfc');
      gradients.addColorStop(1,blue?'#eaf4fc':'#f7ede4');
      ctx.fillStyle=gradients;ctx.fillRect(35,35,W-70,H-70);
      ctx.strokeStyle=line;ctx.lineWidth=3;ctx.strokeRect(57,57,W-114,H-114);
      ctx.lineWidth=1;ctx.strokeRect(73,73,W-146,H-146);
      ctx.textAlign='center';ctx.fillStyle=muted;
      ctx.font='500 25px Arial,sans-serif';ctx.fillText('INVITACIÓN DE BODA',540,193);
      ctx.fillStyle=primary;
      ctx.font='normal 115px Georgia,serif';ctx.fillText('Meel & Silvia',540,325,930);
      ctx.font='500 29px Arial,sans-serif';ctx.fillStyle=muted;ctx.fillText('14 · 02 · 2027     •     CUSCO',540,398);
      ctx.fillStyle=line;ctx.fillRect(240,444,600,2);
      ctx.fillStyle=muted;ctx.font='500 24px Arial,sans-serif';ctx.fillText('PASE DE INGRESO PARA',540,512);
      ctx.fillStyle=primary;
      const name=String(pass.nombre||'Invitado');
      const fontSize=fittedText(ctx,name,68,870);
      ctx.font=`500 ${fontSize}px Georgia, serif`;
      ctx.fillText(name,540,603,870);
      ctx.fillStyle=muted;ctx.font='27px Arial,sans-serif';
      const n=Number(pass.sillasReservadas)||0;
      ctx.fillText(n===1?'1 lugar reservado':`${n} lugares reservados`,540,662);
      if(pass.mesa){ctx.fillStyle=primary;ctx.font='500 31px Arial,sans-serif';ctx.fillText(`Mesa ${pass.mesa}`,540,714);}
      // QR se dibuja por módulos. No se envía a ninguna API de terceros.
      const qr=window.MSQr.matrix(String(pass.tokenEntrada));
      const N=qr.length,cell=15,x=Math.round(540-(N+8)*cell/2),y=750;
      ctx.fillStyle='#fff';ctx.fillRect(x,y,(N+8)*cell,(N+8)*cell);
      ctx.fillStyle='#1b3145';
      for(let row=0;row<N;row++)for(let col=0;col<N;col++)if(qr[row][col])ctx.fillRect(x+(col+4)*cell,y+(row+4)*cell,cell,cell);
      ctx.fillStyle=primary;ctx.font='600 27px Arial,sans-serif';ctx.fillText('PRESENTA ESTE QR EN RECEPCIÓN',540,1407);
      ctx.font='20px monospace';ctx.fillText(String(pass.tokenEntrada),540,1455,870);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
      if(!blob)throw new Error('NO_PNG');
      const url=URL.createObjectURL(blob);
      const a=document.createElement('a');
      a.href=url;a.download='entrada-boda-meel-silvia.png';
      document.body.appendChild(a);a.click();a.remove();
      setTimeout(()=>URL.revokeObjectURL(url),5000);
      $('actionStatus').textContent='Entrada generada. También puedes guardarla como PDF o tomar una captura.';
    }catch(error){$('actionStatus').textContent='No se pudo generar el archivo. Puedes imprimir o guardar una captura del QR.';}
    finally{$('downloadTicket').disabled=false;}
  }
  $('downloadTicket').addEventListener('click',()=>void downloadTicket());
  $('printTicket').addEventListener('click',()=>window.print());
  void load();
})();
