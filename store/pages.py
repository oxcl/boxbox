#!/usr/bin/env python3
"""Generates store/pages/*.html (the listing compositions). Run by scripts/store-assets.mjs."""
import json, os
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'pages')
HEAD = '<!doctype html><html><head><meta charset="utf-8"><title>__T__</title><link rel="stylesheet" href="../../dist/chrome-mv3/ui.css"><link rel="stylesheet" href="../store.css"><script src="../gen/compose.js"></script><script src="../hero-box.js"></script><script src="../chrome.js"></script><script src="../gen/sample.js"></script><style>__CSS__</style></head><body__B__>'
TAIL = '<div class="grain"></div><script>document.querySelectorAll("[data-mini]").forEach(e=>{if(!e.firstChild)e.append(BB.mini(e.dataset.mini,+e.dataset.size||20))});</script></body></html>'
def write(name, title, body, css='', cls=''):
    html = HEAD.replace('__T__', title).replace('__CSS__', css).replace('__B__', f' class="{cls}"' if cls else '') + body + TAIL
    open(os.path.join(ROOT, name + '.html'), 'w').write(html)
J = json.dumps

def tabcard(x, y, w, h, c, name, rot, z=0, blur=0):
    f = f'filter:blur({blur}px);' if blur else ''
    return (f'<div class="tabcard" style="left:{x}px;top:{y}px;width:{w}px;height:{h}px;--c:{c};transform:rotate({rot}deg) translateZ({z}px);{f}"><div class="th"><i></i><i></i><i></i><b>Postbox</b></div>'
            f'<div class="tb"></div><div class="tpill"><span data-mini="{c}" data-size="12"></span>{name}</div><div class="tc"><i></i><i></i><i></i><i></i></div></div>')

# ------------------------------------------------------------------ 01 hero
write('01-hero', 'Hero', '''<div class="scene" style="background:linear-gradient(135deg,#fdf8ef 0%,#f8e7cb 55%,#f2d3a8 100%)"></div>
<div class="lightcast" style="left:640px;top:-180px;width:900px;height:900px;background:radial-gradient(closest-side,rgba(255,236,196,.95),rgba(255,236,196,0))"></div>
<div class="abs" style="left:72px;top:70px"><div class="brandmark"><span data-mini="#c9a06c" data-size="32"></span>BoxBox</div></div>
<div class="abs" style="left:72px;top:176px;width:700px">
  <div class="eyebrow">Account boxes for your browser</div>
  <h1 class="headline" style="font-size:94px;margin-top:20px;letter-spacing:-.05em">One browser.<br>Many lives.</h1>
  <p class="sub" style="font-size:25px;margin-top:30px;max-width:520px">The same site, logged in as different people, at the same time. Each in its own box.</p>
  <div style="display:flex;gap:10px;margin-top:42px"><span class="chip">Chrome</span><span class="chip">Firefox</span><span class="chip">Helium</span><span class="chip" style="background:#1c1730;color:#fff;box-shadow:none">Free</span></div>
</div>
<div class="ground" style="left:640px;top:640px;width:700px;height:96px"></div>
<div class="stage3d" style="left:560px;top:0;width:720px;height:800px"><div class="t3" style="left:0;top:0;width:720px;height:800px">
  __TABS__
  <div id="hb" class="abs" style="left:60px;top:150px;width:640px;height:560px;display:grid;place-items:center"></div></div></div>
<div class="fbox blur2" id="fb1" style="left:1130px;top:86px"></div><div class="fbox blur3" id="fb2" style="left:1170px;top:610px"></div><div class="fbox blur1" id="fb3" style="left:620px;top:690px"></div>
<script>
const h=makeHero({size:200,open:.62});h.style.scale='1.24';h.style.marginTop='70px';document.getElementById('hb').append(h);h.querySelector('.cube').style.transform='rotateX(-23deg) rotateY(-30deg)';
const fb=(id,c,i,s,rot)=>{const b=BB.box({color:c,icon:i,size:s,hover:false,check:false});b.style.transform='rotate('+rot+'deg)';document.getElementById(id).append(b)};
fb('fb1','#14b8a6','book',46,-10);fb('fb2','#ec4899','heart',78,14);fb('fb3','#a855f7','game',58,8);
</script>'''.replace('__TABS__', tabcard(8,96,204,136,'#3b82f6','Work',-8,-80,1)+tabcard(486,44,206,138,'#fb7185','Personal',7,-60,0)+tabcard(570,470,150,100,'#22c55e','Gaming',10,-120,3)))

# ------------------------------------------------------------------ 02 two windows in perspective
R1 = [['Sarah Chen','Q2 roadmap — notes from Monday','10:14',1],['Finance','Invoice 4F29 is ready to approve','9:02',1],['Design team','Mocks for review, v3','8:47',1],['Linear','Issue BOX-417 moved to In Progress','Mon',0],['Calendar','Planning sync, Thursday 10:00','Sun',0]]
R2 = [['Mum','Sunday lunch — are you coming?','11:20',1],['Photos','Your trip album is ready','9:41',1],['Bank','Your statement is available','Tue',0],['Mia','Can you send the recipe?','Mon',0],['Newsletter','Ten walks to try this autumn','Sun',0]]
write('02-side-by-side', 'Side by side', '''<div class="scene" style="background:linear-gradient(180deg,#fdf8ef 0%,#f6e6cc 100%)"></div>
<div class="lightcast" style="left:40px;top:330px;width:720px;height:720px;background:radial-gradient(closest-side,rgba(59,130,246,.30),rgba(59,130,246,0))"></div>
<div class="lightcast" style="left:520px;top:330px;width:720px;height:720px;background:radial-gradient(closest-side,rgba(251,113,133,.32),rgba(251,113,133,0))"></div>
<div class="abs" style="left:0;right:0;top:58px;text-align:center"><div class="eyebrow">Side by side</div><h1 class="headline" style="font-size:66px;margin-top:14px">Two accounts. One site.</h1><p class="sub" style="font-size:22px;margin-top:14px">Work and personal, logged in at the same time, in the same browser.</p></div>
<div class="stage3d" style="left:0;top:0;width:1280px;height:800px">
  <div class="t3" id="wl" style="left:70px;top:290px;width:540px;height:456px;transform:rotateY(15deg) rotateX(3deg)"></div>
  <div class="t3" id="wr" style="left:670px;top:290px;width:540px;height:456px;transform:rotateY(-15deg) rotateX(3deg)"></div>
</div>
<div class="fbox" id="bw" style="left:70px;top:176px"></div><div class="fbox" id="bp" style="left:1126px;top:176px"></div>
<script>
const A=__A__,B=__B__;
const w=(color,name,unread,rows)=>makeWin({x:0,y:0,w:540,h:456,url:'mail.postbox.example/inbox',title:'Inbox ('+unread+') · Postbox',fav:'P',favBg:color,color:color,pill:name,ext:color,extOn:1,style:'position:relative;left:0;top:0',content:postbox({who:name,color:color,unread:unread,rows:rows})});
document.getElementById('wl').innerHTML=w('#3b82f6','Work',12,A);document.getElementById('wr').innerHTML=w('#fb7185','Personal',3,B);
const bx=(id,c,i,s)=>{const b=BB.box({color:c,icon:i,size:s,hover:false,check:false,lid:true});b.style.setProperty('--open','.5');document.getElementById(id).append(b)};
bx('bw','#3b82f6','briefcase',84);bx('bp','#fb7185','user',84);
</script>'''.replace('__A__', J(R1)).replace('__B__', J(R2)))

# ------------------------------------------------------------------ 03 popup, big, with callouts
write('03-popup', 'Popup', '''<div class="scene" style="background:linear-gradient(135deg,#fdf8ef 0%,#f7e5c9 60%,#f0d0a2 100%)"></div>
<div class="lightcast" style="left:560px;top:-60px;width:900px;height:900px;background:radial-gradient(closest-side,rgba(255,236,196,.9),rgba(255,236,196,0))"></div>
<div class="abs" style="left:72px;top:70px"><div class="brandmark"><span data-mini="#c9a06c" data-size="32"></span>BoxBox</div></div>
<div class="abs" style="left:72px;top:176px;width:470px"><div class="eyebrow">The popup</div><h1 class="headline" style="font-size:72px;margin-top:18px">A box for<br>every tab.</h1><p class="sub" style="font-size:22px;margin-top:22px;max-width:380px">Pick a box for the page you are on, or make a new one in a click.</p></div>
<div id="c1" class="callout" style="left:72px;top:520px"><b>1</b><div>Always know where you are<small>The box for this tab, at a glance.</small></div></div>
<div id="c2" class="callout" style="left:72px;top:600px"><b>2</b><div>Switch in one click<small>No logging out, ever.</small></div></div>
<div id="c3" class="callout" style="left:72px;top:680px"><b>3</b><div>Choose how sites open<small>Per service, your rules.</small></div></div>
<svg id="lines" class="abs" style="left:0;top:0;width:1280px;height:800px;z-index:12;pointer-events:none"></svg>
<div class="stage3d" style="left:600px;top:0;width:680px;height:800px"><div class="t3" style="left:70px;top:50px;width:424px;height:640px;transform:scale(1.12) rotateY(-9deg) rotateX(2deg);transform-origin:top left">
  <div class="popwrap"><iframe id="pf" class="live" src="../gen/frames/popup.html" width="424" height="640" scrolling="no"></iframe></div></div></div>
<div class="fbox blur2" id="fa" style="left:1130px;top:90px"></div><div class="fbox blur3" id="fb" style="left:560px;top:704px"></div><div class="fbox blur1" id="fc" style="left:1170px;top:640px"></div>
<script>
const fb=(id,c,i,s,rot)=>{const b=BB.box({color:c,icon:i,size:s,hover:false,check:false});b.style.transform='rotate('+rot+'deg)';document.getElementById(id).append(b)};
fb('fa','#22c55e','star',64,14);fb('fb','#a855f7','code',64,-10);fb('fc','#f59e0b','home',52,12);
document.getElementById('pf').addEventListener('load',()=>setTimeout(()=>{
  const d=document.getElementById('pf').contentDocument, fr=document.getElementById('pf').getBoundingClientRect();
  const tg=(sel)=>{const r=d.querySelector(sel).getBoundingClientRect();return [fr.left+Math.max(r.left,4)*fr.width/424,fr.top+(r.top+r.height/2)*fr.height/640]};
  const pts=[['c1',tg('.status')],['c2',tg('.cell:nth-child(2)')],['c3',tg('.seg')]];
  let svg='';
  for(const [id,[tx,ty]] of pts){const c=document.getElementById(id).getBoundingClientRect(),sx=c.left+34,sy=c.top+c.height/2;svg+=`<path d="M${sx+300} ${sy} C ${tx-120} ${sy}, ${tx-160} ${ty}, ${tx} ${ty}" fill="none" stroke="#a9714b" stroke-width="2" stroke-dasharray="2 6" stroke-linecap="round"/><circle cx="${tx}" cy="${ty}" r="6" fill="#fff" stroke="#a9714b" stroke-width="3"/>`}
  document.getElementById('lines').innerHTML=svg;
},1800));
</script>''', '''.callout{position:absolute;display:flex;align-items:center;gap:14px;font-size:18px;font-weight:800;z-index:13}.callout b{width:34px;height:34px;border-radius:50%;background:#1c1730;color:#fff;display:grid;place-items:center;font-size:15px}.callout small{display:block;font-weight:500;color:#6f6a7d;font-size:14px;margin-top:1px}
.popwrap{width:424px;height:640px;border-radius:26px;overflow:hidden;box-shadow:0 0 0 1px rgba(0,0,0,.06),0 40px 80px -20px rgba(40,25,10,.55),0 14px 30px rgba(40,25,10,.2)}''')

# ------------------------------------------------------------------ 04 picker (dark, spotlit)
write('04-picker', 'Picker', '''<div class="scene dark"></div>
<div class="lightcast" style="left:230px;top:200px;width:820px;height:620px;background:radial-gradient(closest-side,rgba(214,150,86,.35),rgba(214,150,86,0))"></div>
<div class="abs" style="left:96px;top:40px;width:1088px;height:552px;border-radius:30px;overflow:hidden;box-shadow:0 0 0 1px rgba(255,255,255,.07),0 50px 90px -30px rgba(0,0,0,.8),0 0 120px -30px rgba(214,150,86,.35)"><iframe class="live" src="../gen/frames/picker.html?theme=dark" width="1265" height="640" scrolling="no" style="transform:scale(.86);transform-origin:top left"></iframe></div>
<div class="abs" style="left:0;right:0;top:640px;text-align:center"><h1 class="headline" style="font-size:50px">Choose before the page loads.</h1><p class="sub" style="font-size:20px;margin-top:10px">Set “Ask” for a service and nothing is sent until you decide.</p></div>
<div class="abs" style="left:0;right:0;bottom:0;height:140px;background:linear-gradient(180deg,rgba(21,16,12,0),rgba(21,16,12,.6))"></div>''', 'html{color-scheme:dark}', 'dark')

# ------------------------------------------------------------------ 05 settings tilted with floating logos
write('05-settings', 'Settings', '''<div class="scene" style="background:linear-gradient(135deg,#fdf8ef 0%,#f6e4c8 70%,#eecb98 100%)"></div>
<div class="lightcast" style="left:300px;top:-120px;width:1000px;height:900px;background:radial-gradient(closest-side,rgba(255,236,196,.9),rgba(255,236,196,0))"></div>
<div class="abs" style="left:72px;top:70px"><div class="brandmark"><span data-mini="#c9a06c" data-size="32"></span>BoxBox</div></div>
<div class="abs" style="left:72px;top:200px;width:400px"><div class="eyebrow">Services</div><h1 class="headline" style="font-size:68px;margin-top:18px">Every service,<br>neatly<br>organised.</h1><p class="sub" style="font-size:21px;margin-top:24px;max-width:330px">Logos, domains, entry modes and all your boxes in one place.</p></div>
<div class="stage3d" style="left:430px;top:0;width:900px;height:800px"><div class="t3" style="left:40px;top:130px;width:1000px;height:560px;transform:rotateY(-17deg) rotateX(5deg) rotateZ(-1deg);transform-origin:left center">
  <div class="popwrap2"><iframe class="live" src="../gen/frames/settings.html" width="1250" height="680" scrolling="no" style="transform:scale(.8);transform-origin:top left"></iframe></div></div></div>
<div id="logos"></div>
<script>
const L=null;
const pos=[['github',414,84,64,-10,0],['figma',1186,56,56,8,2],['spotify',1190,664,64,-8,0]];
for(const [k,x,y,s,r,b] of pos){const l=globalThis.__sample.logos[k];if(!l)continue;document.getElementById('logos').insertAdjacentHTML('beforeend','<div class="logotile blur'+b+'" style="left:'+x+'px;top:'+y+'px;width:'+s+'px;height:'+s+'px;transform:rotate('+r+'deg)"><svg viewBox="0 0 24 24"><path d="'+l.d+'" fill="'+l.hex+'"/></svg></div>')}
</script>''', '''.popwrap2{width:1000px;height:560px;border-radius:22px;overflow:hidden;background:#fffdf9;box-shadow:0 0 0 1px rgba(0,0,0,.06),0 50px 90px -24px rgba(60,40,20,.5),0 18px 36px rgba(60,40,20,.18)}
.logotile{position:absolute;border-radius:22%;background:#fff;display:grid;place-items:center;box-shadow:0 18px 34px -10px rgba(60,40,20,.38),0 0 0 1px rgba(0,0,0,.05);z-index:6}.logotile svg{width:56%;height:56%}''')

# ------------------------------------------------------------------ 06 bento
write('06-features', 'Features', '''<div class="scene" style="background:linear-gradient(180deg,#fdf8ef 0%,#f6e6cc 100%)"></div>
<div class="abs" style="left:0;right:0;top:56px;text-align:center"><div class="eyebrow">Built different</div><h1 class="headline" style="font-size:56px;margin-top:12px">Made to keep things apart.</h1></div>
<div class="bt" style="left:72px;top:186px;width:540px;height:262px;--tint:#86efac"><div class="rings"></div><h3>Nothing leaves your device</h3><p>No accounts, no telemetry. Your boxes live in your browser profile.</p><div class="art" id="a1"></div></div>
<div class="bt" style="left:632px;top:186px;width:576px;height:262px;--tint:#c4b5fd"><h3>Its own proxy per box</h3><p>Route one account through another network.</p><svg class="net" viewBox="0 0 330 236"></svg><div class="art" id="a2"></div></div>
<div class="bt" style="left:72px;top:468px;width:390px;height:262px;--tint:#fca5a5"><h3>Delete a box, wipe its data</h3><p>Cookies, storage, caches. Gone.</p><div class="art" id="a3" style="right:34px;top:auto;bottom:26px"></div></div>
<div class="bt" style="left:482px;top:468px;width:726px;height:262px;--tint:#fcd34d;overflow:hidden"><h3>Quiet, and unmistakable</h3><p>A calm page border and name pill. The toolbar icon is your box.</p><div class="split"><div class="half"><div class="mf" style="--c:#3b82f6"><div class="mp"><span data-mini="#3b82f6" data-size="12"></span>Work</div><div class="sk"><i></i><i></i><i></i></div></div></div><div class="half d"><div class="mf" style="--c:#fb7185"><div class="mp"><span data-mini="#fb7185" data-size="12"></span>Personal</div><div class="sk"><i></i><i></i><i></i></div></div></div></div></div>
<script>
const mk=(id,c,i,s,o)=>{const b=BB.box({color:c,icon:i,size:s,hover:false,check:false,lid:true});b.style.setProperty('--open',o||'0');document.getElementById(id).append(b)};
mk('a1','#22c55e','shield',120);mk('a3','#ef4444','bolt',78,'.55');
// proxy network: three boxes with lines to regions
const net=document.querySelector('.net');let svg='';[['EU',30],['US',98],['JP',166]].forEach(([n,y],i)=>{svg+='<path d="M-4 118 C 120 118, 130 '+(y+20)+', 240 '+(y+20)+'" fill="none" stroke="#8b5cf6" stroke-width="2" stroke-dasharray="3 6" stroke-linecap="round" opacity=".7"/><rect x="240" y="'+y+'" width="76" height="40" rx="20" fill="#fff" stroke="#e4def5"/><text x="278" y="'+(y+25)+'" text-anchor="middle" font-family="Jakarta" font-weight="800" font-size="14" fill="#5b3fb5">'+n+'</text>'});net.innerHTML=svg;
mk('a2','#8b5cf6','cloud',84);
// poof particles for the delete tile
const a3=document.getElementById('a3');for(let i=0;i<9;i++){const d=document.createElement('i');const a=(i/9)*Math.PI*2,r=62+(i%3)*12;d.style.cssText='position:absolute;left:'+(50+Math.cos(a)*r)+'px;top:'+(50+Math.sin(a)*r*.7)+'px;width:'+(16+(i%4)*6)+'px;height:'+(16+(i%4)*6)+'px;border-radius:50%;background:radial-gradient(circle,rgba(205,170,130,.65),rgba(205,170,130,0))';a3.append(d)}
</script>''', '''.bt{position:absolute;border-radius:28px;background:linear-gradient(150deg,rgba(255,255,255,.97),rgba(255,251,244,.72));box-shadow:0 1px 0 #fff inset,0 0 0 1px rgba(60,40,20,.07),0 32px 60px -32px rgba(80,50,20,.45);padding:34px 38px;overflow:hidden}
.bt::before{content:'';position:absolute;right:-90px;top:-90px;width:380px;height:380px;border-radius:50%;background:radial-gradient(closest-side,var(--tint),rgba(255,255,255,0));opacity:.55}
.bt h3{margin:0 0 10px;font-size:26px;letter-spacing:-.03em;line-height:1.12;max-width:250px;position:relative}.bt p{margin:0;color:#6f6a7d;font-size:17px;font-weight:500;line-height:1.45;max-width:270px;position:relative}
.bt .art{position:absolute;right:56px;top:66px;width:130px;height:130px;display:grid;place-items:center}
.rings{position:absolute;right:-30px;top:-30px;width:330px;height:330px;border-radius:50%;box-shadow:0 0 0 1px rgba(34,197,94,.25),inset 0 0 0 28px rgba(34,197,94,.05),inset 0 0 0 29px rgba(34,197,94,.18),inset 0 0 0 64px rgba(34,197,94,.04)}
.net{position:absolute;right:28px;top:14px;width:330px;height:236px}#a2{right:auto;left:326px;top:86px;width:84px;height:84px}
.split{position:absolute;right:34px;top:36px;width:372px;height:190px;border-radius:16px;overflow:hidden;display:grid;grid-template-columns:1fr 1fr;box-shadow:0 0 0 1px rgba(0,0,0,.08),0 20px 40px -16px rgba(60,40,20,.4)}.half{background:#fff;position:relative}.half.d{background:#1a1511}.mf{position:absolute;inset:0;border:5px solid var(--c)}.mp{position:absolute;top:0;left:50%;transform:translateX(-50%);background:#fff;border-bottom:2px solid var(--c);border-radius:0 0 10px 10px;padding:3px 10px 4px 7px;font:700 11px Jakarta;display:flex;gap:5px;align-items:center}.half.d .mp{background:#2b241c;color:#f6eee2}.sk{position:absolute;left:18px;right:18px;top:44px;display:grid;gap:10px}.sk i{display:block;height:11px;border-radius:6px;background:#ece6db}.sk i:nth-child(1){width:60%;background:color-mix(in srgb,var(--c) 30%,#ece6db)}.sk i:nth-child(3){width:75%}.half.d .sk i{background:#352b21}.half.d .sk i:nth-child(1){background:color-mix(in srgb,var(--c) 40%,#352b21)}''')
print('pages written')


# ------------------------------------------------------------------ promos (small tile, marquee, social)
def promo(name, w, h, hl, sub, bx_scale, bx_left, bx_top, bx_w, bx_h, text_left, text_top, mark=26, extra=''):
    write(name, name, f'''<div class="scene" style="background:linear-gradient(135deg,#fdf8ef 0%,#f8e7cb 55%,#f2d3a8 100%)"></div>
<div class="lightcast" style="left:{bx_left-120}px;top:{-h*.5:.0f}px;width:{w*.75:.0f}px;height:{w*.75:.0f}px;background:radial-gradient(closest-side,rgba(255,236,196,.95),rgba(255,236,196,0))"></div>
<div class="abs" style="left:{text_left}px;top:{text_top[0]}px"><div class="brandmark" style="font-size:{mark}px"><span data-mini="#c9a06c" data-size="{mark+6}"></span>BoxBox</div></div>
<div class="abs" style="left:{text_left}px;top:{text_top[1]}px;width:{w*.55:.0f}px"><h1 class="headline" style="font-size:{hl}px">One browser.<br>Many lives.</h1>{sub}</div>
<div class="ground" style="left:{bx_left+bx_w*.08:.0f}px;top:{bx_top+bx_h*.8:.0f}px;width:{bx_w*.84:.0f}px;height:{bx_h*.12:.0f}px"></div>
<div id="stage" class="abs" style="left:{bx_left}px;top:{bx_top}px;width:{bx_w}px;height:{bx_h}px;display:grid;place-items:center"></div>{extra}
<script>const h=makeHero({{size:200,open:.62}});h.style.scale='{bx_scale}';document.getElementById('stage').append(h);h.querySelector('.cube').style.transform='rotateX(-23deg) rotateY(-30deg)';</script>''')
promo('promo-small', 440, 280, 28, '', .5, 190, 22, 260, 250, 26, (30, 104), 24)
promo('promo-marquee', 1400, 560, 80, '<p class="sub" style="font-size:24px;margin-top:22px;max-width:520px">The same site, logged in as different people, at the same time.</p>', 1.0, 760, 40, 600, 480, 84, (66, 156), 26,
  tabcard(700, 60, 170, 114, '#3b82f6', 'Work', -9, 0, 0) and '<div class="stage3d" style="left:0;top:0;width:1400px;height:560px"><div class="t3" style="left:0;top:0;width:1400px;height:560px">' + tabcard(700,70,176,118,'#3b82f6','Work',-8,-60,1) + tabcard(1190,40,180,120,'#fb7185','Personal',7,-60,0) + tabcard(1250,330,150,100,'#22c55e','Gaming',9,-100,2) + '</div></div>')
promo('social', 1200, 630, 76, '<p class="sub" style="font-size:23px;margin-top:20px;max-width:500px">The same site, logged in as different people, at the same time.</p>', .96, 640, 60, 560, 520, 72, (62, 170), 25,
  '<div class="stage3d" style="left:0;top:0;width:1200px;height:630px"><div class="t3" style="left:0;top:0;width:1200px;height:630px">' + tabcard(620,70,170,114,'#3b82f6','Work',-8,-60,1) + tabcard(1010,50,172,116,'#fb7185','Personal',7,-60,0) + '</div></div>')
