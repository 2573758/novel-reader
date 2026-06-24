(function(){'use strict';
var A=document.getElementById('app'),T=document.getElementById('toast'),L=document.getElementById('loading'),LT=document.getElementById('loading-text');
function $(s,c){return(c||document).querySelector(s);}
function $$(s,c){return[].slice.call((c||document).querySelectorAll(s));}
function esc(t){var d=document.createElement('div');d.textContent=t;return d.innerHTML;}
function tm(m,d){d=d||1800;T.textContent=m;T.classList.remove('hidden');clearTimeout(T._t);T._t=setTimeout(function(){T.classList.add('hidden');},d);}
function ls(t){LT.textContent=t||'...';L.classList.remove('hidden');}
function lh(){L.classList.add('hidden');}
function fd(ts){if(!ts)return'';var d=new Date(ts),n=new Date(),df=n-d;if(df<60000)return'just now';if(df<3600000)return Math.floor(df/60000)+'m ago';if(df<86400000)return Math.floor(df/3600000)+'h ago';return(d.getMonth()+1)+'/'+d.getDate();}
var CP=['https://api.allorigins.win/raw?url=','https://corsproxy.io/?url='],WD=['www.wenku8.net','www.wen8.net','www.wenku8.com'];
async function fw(p){var a=[p],m=p.match(/\/novel\/(\d+)/);if(m){var b=m[1],l=p.split('/').pop();for(var c=1;c<=9;c++)a.push('/novel/'+c+'/'+b+'/'+l);}
for(var i=0;i<a.length;i++){for(var j=0;j<WD.length;j++){var u='https://'+WD[j]+a[i];for(var k=0;k<CP.length;k++){try{var r=await fetch(CP[k]+encodeURIComponent(u),{signal:AbortSignal.timeout(10000)});
if(!r.ok)continue;var buf=await r.arrayBuffer(),dec=new TextDecoder('gbk'),h=dec.decode(buf);if(h&&h.length>500)return h;}catch(e){}}}}
throw new Error('fetch failed');}
async function fn(id){var h=await fw('/book/'+id+'.htm'),d=new DOMParser().parseFromString(h,'text/html');
var cv='';[].slice.call(d.querySelectorAll('img')).forEach(function(im){var s=im.getAttribute('src')||'';if(s.indexOf('img.wenku8')>=0&&s.indexOf(id)>=0)cv=s.indexOf('http')===0?s:'https:'+s;});
if(!cv)[].slice.call(d.querySelectorAll('img')).forEach(function(im){var w=parseInt(im.getAttribute('width')),s=im.getAttribute('src')||'';if(w>=150&&s.indexOf('img.wenku8')>=0)cv=s.indexOf('http')===0?s:'https:'+s;});
var tl='';[].slice.call(d.querySelectorAll('span')).forEach(function(sp){var st=sp.getAttribute('style')||'';if(st.indexOf('font-size:16px')>=0&&st.indexOf('font-weight:bold')>=0)tl=sp.textContent.replace(/\[.*?\]/g,'').trim();});
if(!tl)tl=d.title.replace(/[\s-].*$/,'').trim();
var au='';[].slice.call(d.querySelectorAll('td')).forEach(function(td){var tx=td.textContent.trim();if(tx.indexOf('小 说 作 者')>=0||tx.indexOf('小说作者')>=0)au=tx.replace(/小.说.作.者[：:]?/,'').trim();});
if(!au)au='unknown';
var de='';[].slice.call(d.querySelectorAll('span.hottext')).forEach(function(sp){if(sp.textContent.indexOf('内 容 简 介')>=0||sp.textContent.indexOf('内容简介')>=0){var n=sp.nextElementSibling;while(n){if(n.tagName==='SPAN'){de=n.textContent.trim();break;}n=n.nextElementSibling;}}});
if(!de){var mt=d.querySelector('meta[name="description"]');if(mt)de=mt.getAttribute('content')||'';}
var np=id;[].slice.call(d.querySelectorAll('a')).forEach(function(aa){var hh=aa.getAttribute('href')||'';if(hh.indexOf('index.htm')>=0){var mm=hh.match(/\/novel\/(.+?)\/index\.htm/);if(mm)np=mm[1].replace(/\/+$/,'');}});
var xh=await fw('/novel/'+np+'/index.htm'),xd=new DOMParser().parseFromString(xh,'text/html');
var vs=[],cv_=null,cc_=[];[].slice.call(xd.querySelectorAll('table.css tr')).forEach(function(tr){var vc=tr.querySelectorAll('td.vcss');
if(vc.length){if(cv_&&cc_.length>0)vs.push({name:cv_,chapters:cc_});cv_=(vc[0].textContent||'').trim();cc_=[];}else{[].slice.call(tr.querySelectorAll('td.ccss a')).forEach(function(aa){var hh=aa.getAttribute('href')||'',mm=hh.match(/(\d+)\.htm/);if(mm)cc_.push({id:mm[1],title:(aa.textContent||'').trim()});});}});
if(cv_&&cc_.length>0)vs.push({name:cv_,chapters:cc_});
if(vs.length===0){var ac=[];[].slice.call(xd.querySelectorAll('a[href*=".htm"]')).forEach(function(aa){var hh=aa.getAttribute('href')||'',mm=hh.match(/(\d+)\.htm/);if(mm&&hh.indexOf('index')<0)ac.push({id:mm[1],title:(aa.textContent||'').trim()});});if(ac.length>0)vs.push({name:'text',chapters:ac});}
return{id:id,novelPath:np,title:tl,author:au,cover:cv,description:de,volumes:vs};}
async function fc(nid,cid){var ca=Storage.getCachedChapter(nid,cid);if(ca)return ca;
var h=await fw('/novel/'+nid+'/'+cid+'.htm'),d=new DOMParser().parseFromString(h,'text/html');
var tl=((d.querySelector('#title')||{}).textContent||(d.querySelector('h3')||{}).textContent||'Ch.'+cid).trim();
var cd=d.querySelector('#content'),ct=cd?cd.textContent.trim():'';
if(!ct||ct.length<50){var bd=d.body.cloneNode(true);(bd.querySelectorAll('script,style,iframe,nav,header,footer,#headlink,#adv1,#adv6,#adtop,#adv900,#adv300,#adbottom')||[]).forEach(function(e){e.remove();});ct=bd.textContent.trim();}
ct=ct.replace(/\s+/g,'\n\n').trim();
var r={novelId:nid,chapterId:cid,title:tl,content:ct};Storage.cacheChapter(nid,cid,r);return r;}
var theme=Storage.getTheme()||'auto';function aT(t){document.documentElement.setAttribute('data-theme',t==='auto'?'':t);}aT(theme);
function nav(h){window.location.hash=h;}
function route(){var h=window.location.hash.slice(1)||'shelf',p=h.split('/');switch(p[0]){case'shelf':rS();break;case'book':rD(p[1]);break;case'read':rR(p[1],parseInt(p[2]));break;default:rS();}}
window.addEventListener('hashchange',route);
var state={cv:'shelf',cni:null,cci:null,cb:null,fs:Storage.getFontSize()||17,th:theme,hu:false,cf:[]};
function rS(){state.cv='shelf';var bs=Storage.getBooks(),ks=Object.keys(bs);var h='<div class="shelf-header"><h1>\u{1F4D6} Bookshelf</h1><div class="shelf-actions"><button class="btn" onclick="App.td()">\u270F\uFE0F</button><button class="btn" onclick="App.si()">+</button></div></div><div class="shelf-grid">';
if(ks.length===0)h+='<div class="empty-shelf"><div class="empty-icon">\u{1F4DA}</div><p>Shelf is empty</p><p class="hint">Tap + to import</p></div>';else{ks.forEach(function(id){var b=bs[id],p=b.lastRead,pt=p?esc(p.chapterTitle||''):'';
h+='<div class="book-card" data-id="'+esc(id)+'" onclick="App.ob(\''+esc(id)+'\')"><div class="book-cover">'+(b.cover?'<img src="'+esc(b.cover)+'" alt="'+esc(b.title)+'" loading="lazy">':'\u{1F4D5}')+'</div><div class="book-info"><div class="book-title">'+esc(b.title)+'</div>'+(pt?'<div class="book-progress">'+pt+'</div>':'')+'</div><button class="delete-btn" onclick="event.stopPropagation();App.cd(\''+esc(id)+'\')">X</button></div>';});}
h+='</div>';A.innerHTML=h;A.scrollTop=0;}
var dm=false;window.App=window.App||{};
App.td=function(){dm=!dm;$$('.book-card').forEach(function(c){c.classList.toggle('deleting',dm);});tm(dm?'Tap X to delete':'Done');};
App.cd=function(id){if(confirm('Remove this book?')){Storage.removeBook(id);rS();dm=false;tm('Removed');}};
App.ob=function(id){nav('book/'+id);};
App.si=function(){var o=document.querySelector('.modal-overlay');if(o)o.remove();var d=document.createElement('div');d.className='modal-overlay';
d.innerHTML='<div class="modal" onclick="event.stopPropagation()"><h2>Import</h2><p>Enter wenku8.net novel ID.</p><label for="ii">ID or URL</label><input id="ii" type="text" placeholder="3281"><div class="modal-actions"><button class="btn btn-ghost" id="ic">Cancel</button><button class="btn btn-primary" id="ic2">Import</button></div></div>';
d.addEventListener('click',function(){d.remove();});document.body.appendChild(d);
var inp=document.getElementById('ii'),cf=document.getElementById('ic2'),cn=document.getElementById('ic');
function gi(){var v=inp.value.trim();if(!v)return null;var m=v.match(/(?:book|novel)\/(\d+)/);if(m)return m[1];if(/^\d+$/.test(v))return v;return null;}
async function di(){var id=gi();if(!id){tm('Invalid input');return;}if(Storage.getBook(id)){tm('Already in shelf');d.remove();return;}
cf.disabled=true;cf.textContent='...';ls('Fetching...');try{var data=await fn(id);var flat=[];data.volumes.forEach(function(v,vi){v.chapters.forEach(function(ch){flat.push({id:ch.id,title:ch.title,volumeName:v.name,volumeIdx:vi});});});
Storage.saveBook(id,{id:data.id,title:data.title,author:data.author,cover:data.cover,description:data.description,volumes:data.volumes,chaptersCount:flat.length,lastRead:null,chaptersCache:{}});
d.remove();rS();tm('Imported! '+data.title+' ('+flat.length+' ch)');}catch(e){tm('Failed: '+e.message);}finally{lh();cf.disabled=false;cf.textContent='Import';}}
cf.addEventListener('click',di);cn.addEventListener('click',function(){d.remove();});inp.addEventListener('keydown',function(e){if(e.key==='Enter')di();});setTimeout(function(){inp.focus();},100);};
function rD(id){var b=Storage.getBook(id);if(!b){nav('shelf');return;}state.cv='book';state.cni=id;state.cb=b;var p=b.lastRead;
var h='<div class="detail-view"><div class="detail-hero"><button class="back-btn" onclick="App.gs()">\u2190</button><div class="detail-cover">'+(b.cover?'<img src="'+esc(b.cover)+'" alt="'+esc(b.title)+'">':'\u{1F4D5}')+'</div><div class="detail-title">'+esc(b.title)+'</div><div class="detail-author">'+esc(b.author)+'</div><div class="detail-actions">'+(p?'<button class="btn btn-primary" onclick="App.cr(\''+esc(id)+'\')">Continue</button>':'')+'<button class="btn '+(p?'btn-ghost':'btn-primary')+'" onclick="App.sr(\''+esc(id)+'\')">'+(p?'From start':'Read')+'</button></div></div><div class="detail-body">';
if(b.description&&b.description!=='none')h+='<h3>About</h3><div class="detail-desc">'+esc(b.description)+'</div>';
h+='<div class="detail-volume-list">';if(b.volumes&&b.volumes.length>0){var ci=0;b.volumes.forEach(function(v){h+='<div class="detail-volume"><div class="detail-volume-name">'+esc(v.name)+'</div>';
v.chapters.forEach(function(ch){var cur=p&&String(p.chapterId)===String(ch.id);h+='<div class="detail-chapter-row'+(cur?' current':'')+'" onclick="App.rc(\''+esc(id)+'\','+ci+')">'+(cur?'<span class="check-icon">\u25CF</span>':'')+esc(ch.title)+'</div>';ci++;});h+='</div>';});}else h+='<p style="text-align:center;color:var(--text-muted);padding:40px 0;">No chapters</p>';
h+='</div></div></div>';A.innerHTML=h;A.scrollTop=0;}
App.gs=function(){nav('shelf');};App.cr=function(id){var b=Storage.getBook(id),p=b&&b.lastChild;nav(p?'read/'+id+'/'+(p.chapterIdx||0):'read/'+id+'/0');};
App.sr=function(id){nav('read/'+id+'/0');};App.rc=function(id,idx){nav('read/'+id+'/'+idx);};
function rR(id,ci){var b=Storage.getBook(id);if(!b){nav('shelf');return;}
var flat=[];(b.volumes||[]).forEach(function(v,vi){v.chapters.forEach(function(ch){flat.push({id:ch.id,title:ch.title,volumeName:v.name,volumeIdx:vi,globalIdx:flat.length});});});
if(flat.length===0){nav('book/'+id);return;}var idx=Math.max(0,Math.min(ci,flat.length-1));
state.cv='read';state.cni=id;state.cb=b;state.cci=idx;state.cf=flat;state.hu=false;
A.innerHTML='<div class="reader-view" id="rv"><div class="reader-header" id="rh"><button class="back-btn" onclick="App.rb()">\u2190</button><span class="chapter-title" id="rct">'+esc(flat[idx].title)+'</span><div class="reader-actions"><button onclick="App.ts()">Aa</button></div></div><div class="reader-content" id="rc"><p class="chapter-loading">Loading...</p></div><div class="reader-footer" id="rf"><button class="nav-btn" id="pb" onclick="App.pc()">\u2190 Prev</button><span class="reader-progress" id="rp"></span><button class="nav-btn" id="nb" onclick="App.nc()">Next \u2192</button></div></div>';
A.scrollTop=0;lC(id,idx,flat);
var rc=document.getElementById('rc');rc.addEventListener('click',function(e){if(!e.target.closest('.reader-header')&&!e.target.closest('.reader-footer'))tUI();});
rc.addEventListener('scroll',function(){sP();});}
async function lC(nid,idx,flat){var ch=flat[idx];if(!ch)return;
var cont=document.getElementById('rc'),pb=document.getElementById('pb'),nb=document.getElementById('nb'),rp=document.getElementById('rp'),rct=document.getElementById('rct');if(!cont)return;
rct.textContent=ch.title;pb.disabled=idx<=0;nb.disabled=idx>=flat.length-1;
rp.textContent=flat.length>1?(idx+1)+'/'+flat.length:'';
cont.innerHTML='<p style="text-align:center;color:var(--text-muted);padding:40px 0;">Loading...</p>';cont.scrollTop=0;
try{var data=await fc(nid,ch.id);var pars=data.content.split(/\n+/).map(function(s){return s.trim();}).filter(function(s){return s.length>0;});
var html=data.title?'<h3>'+esc(data.title)+'</h3>':'';if(pars.length===0)html+='<p style="text-align:center;color:var(--text-muted);padding:40px 0;">(empty)</p>';
else pars.forEach(function(p){html+='<p>'+esc(p)+'</p>';});
cont.innerHTML=html;cont.style.fontSize=state.fs+'px';var pr=Storage.getProgress(nid);if(pr&&String(pr.chapterId)===String(ch.id)&&pr.scrollRatio)cont.scrollTop=pr.scrollRatio*cont.scrollHeight;
}catch(err){cont.innerHTML='<div style="text-align:center;padding:60px 20px;color:var(--text-muted);"><p style="font-size:40px;margin-bottom:16px;">\u{1F635}</p><p>Load failed</p><p style="font-size:13px;margin-top:8px;">'+esc(err.message)+'</p><button class="btn btn-primary" style="margin-top:16px;" onclick="location.reload()">Retry</button></div>';}
finally{sP();}}
function tUI(){state.hu=!state.hu;var h=document.getElementById('rh'),f=document.getElementById('rf');if(h)h.classList.toggle('hidden',state.hu);if(f)f.classList.toggle('hidden',state.hu);}
function sP(){var cont=document.getElementById('rc');if(!cont||state.cci===null||!state.cni)return;var ch=state.cf[state.cci];if(!ch)return;
var ratio=cont.scrollHeight>cont.clientHeight?cont.scrollTop/(cont.scrollHeight-cont.clientHeight):0;
Storage.saveProgress(state.cni,{chapterId:ch.id,chapterIdx:state.cci,chapterTitle:ch.title,scrollRatio:Math.min(1,Math.max(0,ratio))});}
App.rb=function(){nav(state.cni?'book/'+state.cni:'shelf');};App.pc=function(){if(state.cci>0){state.cci--;nav('read/'+state.cni+'/'+state.cci);}};
App.nc=function(){if(state.cci<state.cf.length-1){state.cci++;nav('read/'+state.cni+'/'+state.cci);}};
var so=false;App.ts=function(){so=!so;var ex=document.querySelector('.reader-settings');if(ex)ex.remove();if(!so)return;
var d=document.createElement('div');d.className='reader-settings';
d.innerHTML='<h3>Settings</h3><div class="settings-row"><label>Font</label><input type="range" min="14" max="26" value="'+state.fs+'" id="fs"><span style="font-size:13px;min-width:32px;text-align:right;">'+state.fs+'</span></div><div class="settings-row"><label>Theme</label><div class="theme-switch"><button class="theme-btn light '+(theme==='light'?'active':'')+'" data-t="light">\u2600\uFE0F</button><button class="theme-btn dark '+(theme==='dark'?'active':'')+'" data-t="dark">\u{1F319}</button><button class="theme-btn '+(theme==='auto'?'active':'')+'" data-t="auto">Auto</button></div></div><button class="settings-close" id="sc">Done</button>';
document.body.appendChild(d);
var sl=document.getElementById('fs');sl.addEventListener('input',function(){var sz=parseInt(sl.value);state.fs=sz;var c=document.getElementById('rc');if(c)c.style.fontSize=sz+'px';sl.nextElementSibling.textContent=sz;});
[].slice.call(d.querySelectorAll('.theme-btn')).forEach(function(b){b.addEventListener('click',function(){theme=b.getAttribute('data-t');Storage.setTheme(theme);aT(theme);[].slice.call(d.querySelectorAll('.theme-btn')).forEach(function(x){x.classList.remove('active');});b.classList.add('active');});});
document.getElementById('sc').addEventListener('click',function(){Storage.setFontSize(state.fs);so=false;d.remove();});};
if(document.readyState==='complete')route();else document.addEventListener('DOMContentLoaded',route);
})();