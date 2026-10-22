(()=>{'use strict';
const trigger=document.getElementById('mobileMoreButton'),panel=document.getElementById('mobileMorePanel'),backdrop=document.getElementById('mobileMoreBackdrop'),close=document.getElementById('mobileMoreClose');
if(!trigger||!panel||!backdrop)return;
function setOpen(open){panel.hidden=!open;backdrop.hidden=!open;panel.setAttribute('aria-hidden',String(!open));trigger.setAttribute('aria-expanded',String(open));if(open)close.focus();else trigger.focus();}
trigger.addEventListener('click',()=>setOpen(panel.hidden));close.addEventListener('click',()=>setOpen(false));backdrop.addEventListener('click',()=>setOpen(false));
panel.addEventListener('click',e=>{if(e.target.closest('[data-view]')){panel.hidden=true;backdrop.hidden=true;panel.setAttribute('aria-hidden','true');trigger.setAttribute('aria-expanded','false');}});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!panel.hidden)setOpen(false)});
window.addEventListener('resize',()=>{if(innerWidth>860&&!panel.hidden){panel.hidden=true;backdrop.hidden=true;trigger.setAttribute('aria-expanded','false');}});
})();
