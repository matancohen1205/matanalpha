// בדיקת נגישות אוטומטית (axe-core) לכל הדפים במצב בהיר וכהה. הרצה: node server.js & node scripts/a11y-check.js
// משתנים: BASE (ברירת מחדל http://localhost:3000), CHROME (נתיב לדפדפן)
const { chromium } = require('playwright-core'); const fs=require('fs'); const path=require('path');
const axeSrc=fs.readFileSync(path.join(__dirname,'..','node_modules','axe-core','axe.min.js'),'utf8');
const BASE=process.env.BASE||'http://localhost:3000';
(async()=>{const b=await chromium.launch(process.env.CHROME?{executablePath:process.env.CHROME}:{});
const pages=['/','/calculator.html','/credits.html','/compare.html','/rights.html','/pricing.html','/whatsapp.html','/contact.html','/about.html','/login.html','/signup.html','/privacy.html','/terms.html','/accessibility.html'];
const summary={};
for (const theme of ['light','dark']) {
 const ctx=await b.newContext({viewport:{width:1100,height:900},bypassCSP:true}); const p=await ctx.newPage();
 await p.addInitScript(([t])=>{sessionStorage.setItem('ps-promo-shown','1');localStorage.setItem('ps-theme',t)},[theme]);
 for (const u of pages) { await p.goto(BASE+u); await p.waitForTimeout(700);
  await p.evaluate(()=>document.documentElement.getAttribute('data-theme')); 
  await p.addScriptTag({content:axeSrc}); 
  const r=await p.evaluate(async()=>{const x=await axe.run(document,{runOnly:['wcag2a','wcag2aa','wcag21aa','best-practice']});return x.violations.map(v=>({id:v.id,impact:v.impact,n:v.nodes.length,ex:v.nodes[0].target.join(' ').slice(0,80),help:v.help}))});
  for (const v of r) { const k=v.id; (summary[k]=summary[k]||{impact:v.impact,help:v.help,hits:[]}).hits.push(theme+':'+u+' x'+v.n+' '+v.ex); }
 } await ctx.close(); }
for (const [k,v] of Object.entries(summary)) console.log(k,'['+v.impact+']',v.help,'\n   ',v.hits.slice(0,4).join('\n    '),v.hits.length>4?'\n    ... +'+(v.hits.length-4):'');
await b.close();})();
