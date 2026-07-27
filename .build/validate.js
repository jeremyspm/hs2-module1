// Content validator — run before shipping. Checks the invariants the UI relies on.
const fs=require('fs');
const src=fs.readFileSync(__dirname+'/check.js','utf8');

// Stub the browser surface so the data/engine part of the file can be evaluated.
global.window={console:console};
global.localStorage={ _d:{}, getItem(k){return this._d[k]===undefined?null:this._d[k];},
  setItem(k,v){this._d[k]=String(v);}, removeItem(k){delete this._d[k];} };
global.location={origin:'https://jeremyspm.github.io',pathname:'/hs2-module1/',search:''};
global.URLSearchParams=class{constructor(){}get(){return null;}};
global.matchMedia=()=>({matches:false});
global.innerWidth=1280;   // metroDim()/mountMetro() branch on this — see §7, run at both
global.addEventListener=()=>{};
global.setTimeout=(f)=>0; global.clearTimeout=()=>{};
const stubEl=()=>new Proxy(function(){},{get:(t,p)=>{
  if(p==='querySelectorAll'||p==='children') return ()=>[];
  if(p==='querySelector') return ()=>stubEl();
  if(p==='classList') return {add(){},remove(){},toggle(){}};
  if(p==='dataset'||p==='style') return {};
  if(p==='appendChild'||p==='remove'||p==='addEventListener'||p==='setAttribute') return ()=>{};
  if(p==='clientWidth'||p==='clientHeight') return 800;
  return stubEl();
},set:()=>true,apply:()=>stubEl()});
global.document={ documentElement:{setAttribute(){}}, body:{style:{},appendChild(){}},
  querySelector:()=>stubEl(), createElement:()=>stubEl(), addEventListener(){},
  removeEventListener(){}, visibilityState:'visible' };

// Cut the file at BOOT so draw()/DOM work never runs.
const cut=src.indexOf('/* ═══════════════════ BOOT ═══════════════════ */');
if(cut<0) { console.error('FAIL: could not find BOOT marker'); process.exit(1); }
const body=src.slice(0,cut);

const X=eval('(function(){'+body+'\nreturn {DATA,LINKS,ROUTES,chainsOf,metroGraph,metroLayout,metroDim,offers,qid,mid};})()');
const {DATA,LINKS,ROUTES,chainsOf,metroGraph,metroLayout,metroDim,offers,qid,mid}=X;

let fail=0, warn=0;
const bad=(m)=>{ console.log('  ✗ '+m); fail++; };
const note=(m)=>{ console.log('  ! '+m); warn++; };

console.log('\n=== 1. Route joins (link[k].to === link[k+1].from) ===');
Object.keys(ROUTES).forEach(tid=>{
  const ls=LINKS[tid]||[];
  ROUTES[tid].forEach(r=>{
    r.idx.forEach((i,n)=>{
      if(!ls[i]) return bad(`${tid} "${r.name}": index ${i} does not exist (topic has ${ls.length} links)`);
      if(n===0) return;
      const prev=ls[r.idx[n-1]];
      if(prev && prev[2]!==ls[i][0])
        bad(`${tid} "${r.name}": "${prev[2]}" does not lead to "${ls[i][0]}"`);
    });
  });
});
if(!fail) console.log('  ✓ every route stitches end to end');

console.log('\n=== 2. Topics, ids, and coverage ===');
const ids=new Set();
DATA.topics.forEach(t=>{
  if(ids.has(t.id)) bad('duplicate topic id '+t.id); ids.add(t.id);
  ['icon','name','chapters','tagline','primer'].forEach(k=>{ if(!t[k]) bad(t.id+' missing '+k); });
  if(!(LINKS[t.id]||[]).length) bad(t.id+' has no relations');
  if(!(t.recall||[]).length) bad(t.id+' has no recall questions');
  if(!(t.glossary||[]).length) bad(t.id+' has no glossary');
});
Object.keys(LINKS).forEach(k=>{ if(!ids.has(k)) bad('LINKS has orphan topic '+k); });
Object.keys(ROUTES).forEach(k=>{ if(!ids.has(k)) bad('ROUTES has orphan topic '+k); });
console.log(`  topics: ${DATA.topics.length}`);

console.log('\n=== 3. Recall items ===');
let nQ=0, nPts=0;
DATA.topics.forEach(t=>(t.recall||[]).forEach((q,i)=>{
  nQ++; nPts+=(q.a||[]).length;
  if(!q.q) bad(t.id+' recall #'+i+' missing question');
  if(!(q.a||[]).length) bad(t.id+' recall #'+i+' has no marking points');
  if(!q.src) bad(t.id+' recall #'+i+' has NO SOURCE CITATION');
  if(typeof q.marks!=='number') bad(t.id+' recall #'+i+' missing marks');
}));
console.log(`  ${nQ} questions, ${nPts} marking points — all carry a source`);

console.log('\n=== 4. MCQ keys ===');
let nM=0;
DATA.topics.forEach(t=>(t.mcq||[]).forEach((q,i)=>{
  nM++;
  const o=q.options||[];
  if(o.length<2) bad(t.id+' mcq #'+i+' has <2 options');
  if(!(q.correct>=0&&q.correct<o.length)) bad(t.id+' mcq #'+i+' correct index '+q.correct+' out of range 0..'+(o.length-1));
  if(!q.why) bad(t.id+' mcq #'+i+' has no explanation');
  if(!q.src) bad(t.id+' mcq #'+i+' has NO SOURCE CITATION');
  if(new Set(o.map(x=>x.toLowerCase())).size!==o.length) bad(t.id+' mcq #'+i+' has duplicate options');
}));
console.log(`  ${nM} MCQs — every key in range, every one sourced`);

console.log('\n=== 5. Case studies ===');
let nC=0;
(DATA.cases||[]).forEach(c=>{
  if(!['test','exam'].includes(c.kind)) bad('case '+c.id+' bad kind '+c.kind);
  (c.topics||[]).forEach(tid=>{ if(!ids.has(tid)) bad('case '+c.id+' references unknown topic '+tid); });
  (c.qs||[]).forEach((q,i)=>{ nC++;
    if(!(q.a||[]).length) bad('case '+c.id+' q'+i+' has no answer points');
    if(!q.src) bad('case '+c.id+' q'+i+' has NO SOURCE CITATION');
  });
});
console.log(`  ${(DATA.cases||[]).length} cases, ${nC} questions — all sourced`);

console.log('\n=== 6. Chains ===');
let nCh=0, nCards=0;
Object.keys(LINKS).forEach(tid=>{
  const cs=chainsOf(tid); nCh+=cs.length;
  cs.forEach(c=>{
    if(c.beads.length!==c.verbs.length+1)
      bad(tid+' chain "'+c.name+'": beads('+c.beads.length+') !== verbs('+c.verbs.length+')+1');
    nCards += c.verbs.length<2?2:4;   // a 1-relation chain caps at L2
  });
});
console.log(`  ${nCh} chains from ${Object.values(LINKS).reduce((s,l)=>s+l.length,0)} relations → ~${nCards} chain cards`);

// Run at BOTH breakpoints — metroDim/colGap branch on innerWidth<560, so a phone
// gets a different layout, and "it laid out fine on desktop" proves nothing there.
[{w:1280,label:'desktop',colGap:250,rowGap:22,ox:70,oy:50,stage:780},
 {w:375, label:'phone  ',colGap:178,rowGap:16,ox:52,oy:34,stage:303}].forEach(bp=>{
console.log(`\n=== 7. Metro layout @ ${bp.label.trim()} (${bp.w}px) ===`);
global.innerWidth=bp.w;
Object.keys(LINKS).forEach(tid=>{
  const g=metroGraph(tid);
  const L=metroLayout(g.nodes,g.edges,{colGap:bp.colGap,rowGap:bp.rowGap,originX:bp.ox,originY:bp.oy,dimOf:metroDim});
  const covered=new Set(); L.lines.forEach(ln=>ln.edgeIds.forEach(e=>covered.add(e)));
  L.feedback.forEach(f=>covered.add(f.id));
  const missing=g.edges.filter(e=>!covered.has(e.id));
  if(missing.length) bad(tid+': '+missing.length+' relation(s) drawn on no line and not marked feedback');
  if(!L.stations.length) bad(tid+': metro produced no stations');
  if(!isFinite(L.width)||!isFinite(L.height)||L.width<=0) bad(tid+': bad canvas size '+L.width+'x'+L.height);
  L.stations.forEach(s=>{ if(!isFinite(s.x)||!isFinite(s.y)) bad(tid+': station "'+s.id+'" has NaN position'); });
  // edge-disjoint: no relation may ride two lines
  const seen=new Set();
  L.lines.forEach(ln=>ln.edgeIds.forEach(e=>{ if(seen.has(e)) bad(tid+': relation '+e+' rides two lines'); seen.add(e); }));
  // cards must not overlap within a column (the size-aware packing is the point)
  const cols={};
  L.stations.forEach(s=>{ (cols[s.col]=cols[s.col]||[]).push(s); });
  Object.values(cols).forEach(list=>{
    list.sort((a,b)=>a.y-b.y);
    for(let i=1;i<list.length;i++){
      const prev=list[i-1], cur=list[i];
      if(cur.y-cur.h/2 < prev.y+prev.h/2-0.5)
        bad(`${tid} @${bp.w}px: "${prev.id}" and "${cur.id}" overlap in column ${cur.col}`);
    }
  });
  // at the legibility floor, how much of the map do you actually see at once?
  const FLOOR=0.8;
  const seenW=Math.min(1,(bp.stage/FLOOR)/L.width);
  const xch=L.stations.filter(s=>s.interchange).length;
  console.log(`  ${tid.padEnd(6)} ${String(g.nodes.length).padStart(3)} st · ${String(g.edges.length).padStart(3)} rel · ${String(L.lines.length).padStart(2)} lines · ${String(xch).padStart(2)} xchg · ${L.feedback.length} fb · ${String(Math.round(L.width)).padStart(4)}×${String(Math.round(L.height)).padStart(3)} · ${Math.round(seenW*100)}% visible at floor`);
});
});
global.innerWidth=1280;

console.log('\n=== 8. The pulse ===');
const off=offers();
if(off.length>5) bad('pulse offers '+off.length+' — spec caps at 5');
off.forEach(o=>{
  if(o.cards.length>20) bad(o.topic+' bids '+o.cards.length+' cards — spec caps at 20');
  if(!o.counts||typeof o.counts.due!=='number'||typeof o.counts.total!=='number') bad(o.topic+' missing real counts');
  if(!(o.evPerMin>0)) bad(o.topic+' bad evPerMin');
  o.cards.forEach(c=>{
    if(!c.id||!c.type) bad(o.topic+' card missing id/type');
    if(c.type==='chain'&&c.beads.length!==c.verbs.length+1) bad(o.topic+' chain card malformed');
    if(c.type==='mcq'&&!(c.correct>=0&&c.correct<c.options.length)) bad(o.topic+' mcq card key out of range');
    if(c.type==='saq'&&!(c.points||[]).length) bad(o.topic+' saq card has no points');
  });
});
console.log(`  ${off.length} offers, ${off.reduce((s,o)=>s+o.cards.length,0)} cards bid`);
// rotation must eventually give every topic a turn
const seenT=new Set();
for(let d=0;d<DATA.topics.length;d++){
  const list=DATA.topics.filter(t=>(LINKS[t.id]||[]).length);
  const r=d%list.length;
  list.slice(r).concat(list.slice(0,r)).slice(0,5).forEach(t=>seenT.add(t.id));
}
const never=DATA.topics.filter(t=>!seenT.has(t.id));
if(never.length) bad('these topics can NEVER reach the player: '+never.map(t=>t.id).join(', '));
else console.log('  ✓ rotation gives all '+DATA.topics.length+' topics a turn within '+DATA.topics.length+' days');

console.log('\n=== 9. [[glossary]] cross-links resolve ===');
const terms=new Set();
DATA.topics.forEach(t=>(t.glossary||[]).forEach(g=>terms.add(g.t.toLowerCase())));
const check=(s,where)=>{ const m=String(s).match(/\[\[(.+?)\]\]/g)||[];
  m.forEach(x=>{ const k=x.slice(2,-2).toLowerCase();
    if(!terms.has(k)) note(`${where}: [[${x.slice(2,-2)}]] is not a glossary term anywhere`); }); };
DATA.topics.forEach(t=>{
  (t.recall||[]).forEach((q,i)=>(q.a||[]).forEach(a=>check(a,t.id+' recall#'+i)));
  (t.nursing||[]).forEach(n=>check(n,t.id+' nursing'));
});

/* ═══ 10. GIGA PARITY ═══════════════════════════════════════════════════════
   The metro map is a PORT, not an interpretation. The first cut of it was
   written "in the spirit of" Giga and drifted so far it had to be redone: every
   route drawn at once instead of lighting on focus, flat cards with no coloured
   spine, a double border where the interchange should be a lit ring, no hover
   preview at all.

   So this step stops trusting prose. It parses the `.metro-*` rules out of
   gigastudyapp/app/studio/studio.css, renames Giga's theme tokens to the house
   set, and diffs them against the HOUSE:GIGA:METRO block in index.html. Any
   property that differs, and any rule that has gone missing, fails the build
   unless it is declared below with a reason.

   Skipped (with a note, not a failure) when gigastudyapp is not checked out
   next to this repo — the upstream is the source of truth, and its absence is
   not a licence to drift silently. */
console.log('\n=== 10. Giga parity (.metro-* vs gigastudyapp/app/studio/studio.css) ===');

// Rules the hub is allowed to differ on, each with the structural reason.
const GIGA_DEVIATIONS={
  '.metro-stage'   :'the studio fills the window (inset:0); the hub embeds the map as a bounded panel in a scrolling page',
  '.metro-readout' :'the studio clears a 248px left rail the hub does not have, and the panel must fit a 375px phone',
  '.metro-controls':'Giga ships them display:none and drives zoom by wheel/pinch; the hub is phone-first and the blueprint requires the fit-all override',
  '.metro-lab'     :'Giga ellipsises a fixed-width label; here the station name is the thing being recalled, so it wraps to 3 lines',
};
// Rules the hub is allowed to LACK: Giga's authoring surface. The hub is read-only.
const GIGA_AUTHORING=/^(\.metro-(tray|traylbl|traychips|chip|pk|jot|composer|cpill|cfields|ctop|csrc|crows|crow2|crowx|cfoot|chint|cc|cverb|cverbin|cmode|arr|cgo|cx|crow|carr|cl|crev|cdel|tablebtn|ren|pick)\b|\.metro-card\.sel\b|\.react-flow)/;

const path=require('path');
const GIGA=path.join(__dirname,'..','..','gigastudyapp','app','studio','studio.css');
if(!fs.existsSync(GIGA)){
  note('gigastudyapp not found next to this repo — parity NOT verified this run (looked in '+GIGA+')');
} else {
  // Minimal CSS reader: strip comments, walk balanced braces, keep metro rules.
  const cssRules=css=>{
    const out=[]; const t=css.replace(/\/\*[\s\S]*?\*\//g,'');
    let i=0;
    while(i<t.length){
      const o=t.indexOf('{',i); if(o<0) break;
      const sel=t.slice(i,o).trim();
      let d=1,j=o+1; while(j<t.length&&d>0){ if(t[j]==='{')d++; else if(t[j]==='}')d--; j++; }
      const body=t.slice(o+1,j-1);
      if(/^@(media|supports)/.test(sel)) cssRules(body).forEach(r=>out.push({sel:sel+' '+r.sel,body:r.body}));
      else out.push({sel:sel,body:body});
      i=j;
    }
    return out;
  };
  // Giga's tokens → the house set. Longest first so --surface2 beats --surface.
  const RENAME=[['--surface2','--card2'],['--surface','--card'],['--primary2','--acc-tx'],
                ['--primary','--acc'],['--text','--tx'],['--muted','--tx2'],['--faint','--tx3'],['--mint','--good']];
  const decls=(body,rename)=>{
    let b=body;
    if(rename) RENAME.forEach(pair=>{ b=b.split('var('+pair[0]+')').join('var('+pair[1]+')')
                                       .split('srgb,'+pair[0]+' ').join('srgb,'+pair[1]+' '); });
    return b.split(';').map(x=>x.replace(/\s+/g,' ').trim()).filter(Boolean).sort().join(' ; ');
  };
  const key=s=>s.replace(/\s+/g,' ').trim();

  const gigaCss=fs.readFileSync(GIGA,'utf8');
  const hubBlock=(function(){ const h=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
    const a=h.indexOf('HOUSE:GIGA:METRO:START'), b=h.indexOf('HOUSE:GIGA:METRO:END');
    if(a<0||b<0) return null;
    // Both markers sit INSIDE comments — widen to the enclosing /* … */ so the
    // comment stripper can see them, or the banner parses as a selector.
    return h.slice(h.lastIndexOf('/*',a), h.lastIndexOf('/*',b)); })();
  if(!hubBlock){ bad('HOUSE:GIGA:METRO block not found in index.html'); }
  else{
    const G=new Map(), H=new Map();
    cssRules(gigaCss).filter(r=>/metro/.test(r.sel)).forEach(r=>G.set(key(r.sel),decls(r.body,true)));
    cssRules(hubBlock).filter(r=>/metro/.test(r.sel)).forEach(r=>H.set(key(r.sel),decls(r.body,false)));
    let miss=0,diff=0,dev=0,skip=0;
    G.forEach((gd,sel)=>{
      if(GIGA_AUTHORING.test(sel)){ skip++; return; }
      const isDev=Object.prototype.hasOwnProperty.call(GIGA_DEVIATIONS,sel);
      if(!H.has(sel)){
        bad(isDev?`${sel} is declared a deviation but is MISSING from the hub`
                 :`${sel} exists in Giga but NOT in the hub — port it or declare it in GIGA_DEVIATIONS`);
        miss++; return;
      }
      if(H.get(sel)===gd) return;
      if(isDev){ console.log(`  ~ ${sel} differs — declared: ${GIGA_DEVIATIONS[sel]}`); dev++; return; }
      const gset=new Set(gd.split(' ; ')), hset=new Set(H.get(sel).split(' ; '));
      bad(`${sel} drifted from Giga`);
      [...gset].filter(x=>!hset.has(x)).slice(0,6).forEach(x=>console.log(`      Giga has, hub lost : ${x}`));
      [...hset].filter(x=>!gset.has(x)).slice(0,6).forEach(x=>console.log(`      hub invented       : ${x}`));
      diff++;
    });
    // Hub-only .metro-* rules. Legitimate ones exist (the legend, the coarse-pointer
    // touch target), but an ADDITIVE rule is also how you re-introduce drift through
    // the back door — so every one gets listed, never silently accepted.
    const extraRules=[...H.keys()].filter(sel=>!G.has(sel));
    if(extraRules.length){
      console.log('  hub-only rules (each must earn its place — check none of them override a Giga property):');
      extraRules.forEach(sel=>console.log('      + '+sel));
    }
    if(!miss&&!diff) console.log(`  ✓ ${G.size-skip-dev} rules match Giga byte for byte · ${dev} declared deviation${dev===1?'':'s'} · ${skip} authoring-only rules not ported · ${extraRules.length} hub-only`);
  }
}


console.log('\n'+(fail?`❌ ${fail} FAILURES`:'✅ all invariants hold')+(warn?`  (${warn} notes)`:''));
process.exit(fail?1:0);
