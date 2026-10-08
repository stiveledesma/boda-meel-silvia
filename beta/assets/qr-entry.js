/* QR Code Version 3, error correction M, byte mode.
   Self-contained, no external QR API: admission token never leaves this browser
   except when explicitly validated by the owners' Google Apps Script.
   Supports 1–42 ASCII bytes. Matrix: 29x29, 44 data bytes, 26 ECC bytes. */
(function(root){
  'use strict';
  const VERSION=3, SIZE=29, DATA_BYTES=44, ECC_BYTES=26;
  function gfMul(a,b){let p=0;for(let i=0;i<8;i++){if((b&1)!==0)p^=a;let hi=a&0x80;a=(a<<1)&255;if(hi)a^=0x1d;b>>=1;}return p;}
  function eccGenerator(degree){let poly=[1];let root=1;for(let i=0;i<degree;i++){const next=Array(poly.length+1).fill(0);for(let j=0;j<poly.length;j++){next[j]^=poly[j];next[j+1]^=gfMul(poly[j],root);}poly=next;root=gfMul(root,2);}return poly;}
  function eccRemainder(data){const gen=eccGenerator(ECC_BYTES),rem=Array(ECC_BYTES).fill(0);for(const b of data){const factor=b^rem.shift();rem.push(0);for(let j=0;j<ECC_BYTES;j++)rem[j]^=gfMul(gen[j+1],factor);}return rem;}
  function getData(text){const bytes=Array.from(text).map(c=>c.charCodeAt(0));if(bytes.some(b=>b>127)||bytes.length<1||bytes.length>42)throw new Error('Formato de pase QR no admitido.');
    const bits=[];function push(val,n){for(let i=n-1;i>=0;i--)bits.push((val>>>i)&1);}
    push(0b0100,4);push(bytes.length,8);bytes.forEach(b=>push(b,8));
    const capacity=DATA_BYTES*8;push(0,Math.min(4,capacity-bits.length));while(bits.length%8)bits.push(0);
    const data=[];for(let i=0;i<bits.length;i+=8)data.push(parseInt(bits.slice(i,i+8).join(''),2));
    while(data.length<DATA_BYTES)data.push(data.length%2===0?0xec:0x11);
    return data.concat(eccRemainder(data));
  }
  function matrix(text){const all=getData(text),m=Array.from({length:SIZE},()=>Array(SIZE).fill(false)),used=Array.from({length:SIZE},()=>Array(SIZE).fill(false));
    function set(x,y,b){if(x<0||y<0||x>=SIZE||y>=SIZE)return;m[y][x]=!!b;used[y][x]=true;}
    function finder(cx,cy){for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++){const x=cx+dx,y=cy+dy;const d=Math.max(Math.abs(dx),Math.abs(dy));set(x,y,d!==2&&d!==4);}}
    finder(3,3);finder(SIZE-4,3);finder(3,SIZE-4);
    for(let i=8;i<SIZE-8;i++){set(6,i,i%2===0);set(i,6,i%2===0);}
    // Single 5x5 alignment pattern for version 3, center 22,22.
    for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)set(22+dx,22+dy,Math.max(Math.abs(dx),Math.abs(dy))!==1);
    // Format info reserved areas, 15 bits in two locations.
    for(let i=0;i<=8;i++){if(i!==6){set(8,i,false);set(i,8,false);}}
    for(let i=0;i<8;i++){set(SIZE-1-i,8,false);set(8,SIZE-1-i,false);}
    set(8,SIZE-8,true);
    const bitstream=[];all.forEach(b=>{for(let i=7;i>=0;i--)bitstream.push((b>>>i)&1);});
    let bi=0,up=true;
    for(let right=SIZE-1;right>=1;right-=2){if(right===6)right=5;
      for(let v=0;v<SIZE;v++){const y=up?SIZE-1-v:v;
        for(let j=0;j<2;j++){const x=right-j;if(!used[y][x]){const bit=bi<bitstream.length?bitstream[bi++]:0;m[y][x]=!!(bit ^ (((x+y)%2)===0?1:0));}}}
      up=!up;
    }
    // Format: error correction M (00) + mask 0 (000), BCH(15,5).
    const dataFormat=0;let remainder=dataFormat;
    for(let i=0;i<10;i++)remainder=(remainder<<1)^(((remainder>>>9)&1)*0x537);
    const format=((dataFormat<<10)|remainder)^0x5412;
    function fmt(i){return ((format>>>i)&1)!==0;}
    for(let i=0;i<=5;i++)set(8,i,fmt(i));set(8,7,fmt(6));set(8,8,fmt(7));set(7,8,fmt(8));
    for(let i=9;i<15;i++)set(14-i,8,fmt(i));
    for(let i=0;i<8;i++)set(SIZE-1-i,8,fmt(i));
    for(let i=8;i<15;i++)set(8,SIZE-15+i,fmt(i));
    set(8,SIZE-8,true);
    return m;
  }
  function svg(text){const m=matrix(text),margin=4,s=SIZE+margin*2;let squares='';
    for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++)if(m[y][x])squares+=`<rect x="${x+margin}" y="${y+margin}" width="1" height="1"/>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s} ${s}" shape-rendering="crispEdges"><rect width="${s}" height="${s}" fill="white"/><g fill="#22354a">${squares}</g></svg>`;
  }
  root.MSQr={matrix,svg};
})(typeof window!=='undefined'?window:globalThis);
