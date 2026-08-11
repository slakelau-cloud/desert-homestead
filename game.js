"use strict";
/* ================= SIM (same rules as v0.1) ================= */
let COLS=12, ROWS=18;

const CROPS={
  beans:{name:'Beans',days:2,food:2,seedback:2,drought:false},
  corn:{name:'Corn',days:3,food:1,seedback:2,drought:false},
  squash:{name:'Squash',days:3,food:4,seedback:2,drought:false},
  pear:{name:'Prickly pear',days:4,food:3,seedback:1,drought:true},
};
const WEATHERS={
  sunny:{label:'☀️ Sunny',evap:1},
  scorcher:{label:'🔥 Scorcher',evap:2},
  cloudy:{label:'⛅ Cloudy',evap:0},
  rain:{label:'🌧️ Monsoon rain',evap:0},
};
function rollWeather(){
  const r=Math.random();
  if(r<0.25) return 'rain';
  if(r<0.65) return 'sunny';
  if(r<0.80) return 'scorcher';
  return 'cloudy';
}

const S={
  day:1, weather:'sunny', forecast:rollWeather(), lastRainDay:0, rtMode:false,
  water:40, waterCap:60, seeds:6, food:0, dirt:2, stone:0, wood:0, bags:0, energy:10, energyMax:10,
  tool:'inspect', grid:[], won:false, overlay:false, mode:'campaign', chapter:0, unlocked:[],
  stats:{watered:0,bagsFilled:0,harvests:0,ordsBuilt:0,sedTrapped:0,grassGrown:0,floodedBeds:0,maxResto:0},
  lv:{harvests:0,ords:0,creekOrds:0,sed:0,grass:0,flooded:0,rainCaught:false,stone:0,wood:0,rains:0,cleanStreak:0,eroded:0,bank:0},
  dayLv:1, results:{}, flags:{pondSeen:false}, lastReport:null,
  goals:{swale:false,rain:false,bda:false,harvest:false,cistern:false,green:false,home:false},
};

const washPath=[];
const creekPaths=[];
const TREE_SPECIES=['mesquite','juniper','pinyon','paloverde','cottonwood'];
const TERRAINS=[
 {flatP:0.55,steepP:0.05,rocks:9, creeks:1,name:'a gentle bajada',       flora:['saguaro','paloverde','pricklypear','ocotillo']},
 {flatP:0.15,steepP:0.3, rocks:17,creeks:2,name:'a steep rocky slope',   flora:['juniper','agave','ocotillo','saguaro']},
 {flatP:0.4, steepP:0.12,rocks:11,creeks:2,name:'wide wash country',     flora:['mesquite','saguaro','pricklypear','paloverde']},
 {flatP:0.5, steepP:0.05,rocks:12,creeks:1,name:'an old floodplain',     flora:['mesquite','pricklypear','agave']},
 {flatP:0.3, steepP:0.25,rocks:15,creeks:2,name:'the foot of the mesa',  flora:['juniper','pinyon','agave']},
];
// elevation bands (fraction of the map's height where each species lives) — real AZ life zones
const FLORA_BAND={saguaro:[0,0.5],paloverde:[0,0.6],pricklypear:[0,0.8],ocotillo:[0.2,0.9],
  agave:[0.2,1],mesquite:[0,0.7],juniper:[0.5,1],pinyon:[0.65,1]};
function generateTerrain(p){
  COLS=p.cols||12; ROWS=p.rows||18;
  S.grid.length=0;
  for(let y=0;y<ROWS;y++){S.grid[y]=S.grid[y]||[];
    for(let x=0;x<COLS;x++){
      S.grid[y][x]={type:'sand',moisture:0,stored:0,plant:null,homeStage:0,dam:false,
        soil:0,wetDays:0,resto:0,fertile:false,inCreek:false,elev:0,
        shade:Math.floor(Math.random()*3), rot:Math.random()*Math.PI*2, deco:null};
    }
  }
  let e=0, prevFlat=false;
  for(let y=ROWS-1;y>=0;y--){
    for(let x=0;x<COLS;x++)S.grid[y][x].elev=e;
    if(y>0){
      const r=Math.random();
      if(!prevFlat&&r<p.flatP){prevFlat=true;}                       // flat bench: two rows, one level
      else if(r>1-(p.steepP||0)){e+=0.56;prevFlat=false;}            // cliff: drops two squares at once
      else {e+=0.28;prevFlat=false;}
    }
  }
  washPath.length=0;
  let wx=Math.max(2,Math.min(COLS-3,Math.floor(COLS/2)+Math.floor(Math.random()*7)-3));
  for(let y=0;y<ROWS;y++){
    const drift=(y<ROWS-1)?Math.max(1,Math.min(COLS-2,wx+Math.floor(Math.random()*3)-1)):wx;
    const lo=Math.min(wx,drift), hi=Math.max(wx,drift);
    for(let cx=lo;cx<=hi;cx++){
      const t=S.grid[y][cx];
      if(t.type!=='wash'){t.type='wash';t.elev-=0.18;t.deco=null;washPath.push({x:cx,y});}
    }
    wx=drift;
  }
  // small side creeks: born high, they run downhill until they join the wash
  creekPaths.length=0;
  for(let c=0;c<(p.creeks||1);c++){
    const path=[];
    let cx=Math.floor(Math.random()*COLS), tries=0;
    while(tries++<40&&S.grid[0][cx].type!=='sand')cx=Math.floor(Math.random()*COLS);
    for(let y=0;y<ROWS;y++){
      const t=S.grid[y][cx];
      if(t.type==='wash'||t.type==='creek')break; // joined a bigger flow
      if(t.type==='sand'){t.type='creek';t.elev-=0.1;t.deco=null;path.push({x:cx,y});}
      if(y<ROWS-1)cx=Math.max(0,Math.min(COLS-1,cx+Math.floor(Math.random()*3)-1));
    }
    if(path.length>=3)creekPaths.push(path);
  }
  if(p.minCreeks&&creekPaths.length<p.minCreeks&&(p._ctries=(p._ctries||0)+1)<30)return generateTerrain(p);
  p._ctries=0;
  const eMax=Math.max(0.01,S.grid[0][0].elev);
  let placed=0, guard=0;
  while(placed<p.rocks&&guard++<600){
    const x=Math.floor(Math.random()*COLS), y=Math.floor(Math.random()*ROWS);
    const t=S.grid[y][x];
    if(t.type!=='sand'||t.deco)continue;
    if(Math.random()<0.35){ t.deco='rock'; t.type='rock'; placed++; continue; }
    const frac=t.elev/eMax;
    const cand=p.flora.filter(f=>frac>=FLORA_BAND[f][0]&&frac<=FLORA_BAND[f][1]);
    if(cand.length){ t.deco=cand[Math.floor(Math.random()*cand.length)]; placed++; }
  }
  // riparian cottonwoods — only where the campaign has climbed to country that grows them
  const bankSpots=[];
  if(p.riparian){
  for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++){
    const t=S.grid[y][x];
    if(t.type!=='sand'||t.deco)continue;
    const near=[[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>{
      const n=(S.grid[y+dy]||[])[x+dx];
      return n&&(n.type==='wash'||n.type==='creek');
    });
    if(near)bankSpots.push(t);
  }
  let cotton=2+Math.floor(Math.random()*3);
  while(cotton-->0&&bankSpots.length){
    const i=Math.floor(Math.random()*bankSpots.length);
    bankSpots.splice(i,1)[0].deco='cottonwood';
  }
  }
  // guarantee gatherable stone and wood on every map
  const treePick=p.flora.filter(f=>TREE_SPECIES.includes(f));
  let trees=0,rocksN=0;
  for(const row of S.grid)for(const t of row){if(t.type==='rock')rocksN++;if(t.deco&&TREE_SPECIES.includes(t.deco))trees++;}
  let g2=0;
  while(trees<(p.minTrees??4)&&g2++<400){
    const x=Math.floor(Math.random()*COLS), y=Math.floor(Math.random()*ROWS);
    const t=S.grid[y][x];
    if(t.type==='sand'&&!t.deco){t.deco=treePick.length?treePick[Math.floor(Math.random()*treePick.length)]:'mesquite';trees++;}
  }
  while(rocksN<(p.minRocks??4)&&g2++<800){
    const x=Math.floor(Math.random()*COLS), y=Math.floor(Math.random()*ROWS);
    const t=S.grid[y][x];
    if(t.type==='sand'&&!t.deco){t.deco='rock';t.type='rock';rocksN++;}
  }
  // rattlesnakes: squatters that cost 1 energy to shoo off a tile
  let snakes=0, gs=0;
  while(snakes<(p.snakes||0)&&gs++<300){
    const x=Math.floor(Math.random()*COLS), y=Math.floor(Math.random()*ROWS);
    const t=S.grid[y][x];
    if(t.type==='sand'&&!t.deco){t.deco='snake';snakes++;}
  }
  // driftwood: some snagged in the channels, some dead wood on the flats
  let drifts=0;
  while(drifts<(p.minDrift??4)&&g2++<1200){
    const x=Math.floor(Math.random()*COLS), y=Math.floor(Math.random()*ROWS);
    const t=S.grid[y][x];
    if((t.type==='wash'||t.type==='creek'||t.type==='sand')&&!t.deco&&!t.dam){t.deco='drift';drifts++;}
  }
  if(p.hardpanP){
    for(const row of S.grid)for(const t of row){
      if(t.type==='sand'&&!t.deco&&Math.random()<p.hardpanP)t.type='hardpan';
    }
  }
  // solvability guard: re-roll until the map has enough clean-fetch columns for the level's banking goal
  if(p.fetch){
    let good=0;
    for(let x=0;x<COLS;x++){
      let clean=0, ok=false;
      for(let y=0;y<ROWS;y++){
        const t=S.grid[y][x];
        if(t.type==='wash'||t.type==='creek'){clean=0;continue;}
        if(t.type==='sand'&&clean>=p.fetch.len){
          const bl=(S.grid[y+1]||[])[x];
          const rip=(xx,yy)=>[[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>{
            const n=(S.grid[yy+dy]||[])[xx+dx];return n&&n.type==='wash';});
          if(bl&&bl.type==='sand'&&!rip(x,y)&&!rip(x,y+1))ok=true;
        }
        clean++;
      }
      if(ok)good++;
    }
    if(good<p.fetch.cols&&(p._tries=(p._tries||0)+1)<30)return generateTerrain(p);
    p._tries=0;
  }
}
generateTerrain(TERRAINS[0]);

const tileAt=(x,y)=>(x>=0&&x<COLS&&y>=0&&y<ROWS)?S.grid[y][x]:null;
const nearWash=(x,y)=>[[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>{const n=tileAt(x+dx,y+dy);return n&&n.type==='wash';});
function neighbors(x,y){return [tileAt(x-1,y),tileAt(x+1,y),tileAt(x,y-1),tileAt(x,y+1)].filter(Boolean);}
function countAll(fn){let n=0;for(const row of S.grid)for(const t of row)if(fn(t))n++;return n;}
const BDA_CAP=12;
function swaleCap(x,y){const below=tileAt(x,y+1);return 10+(below&&below.type==='berm'?8:0);}
function mapResto(){let m=0;for(const row of S.grid)for(const t of row)if(t.resto>m)m=t.resto;return m;}

const logEl=document.getElementById('log');
function log(msg){const p=document.createElement('p');p.textContent=msg;logEl.prepend(p);
  while(logEl.children.length>40)logEl.lastChild.remove();}
function say(msg){const s=document.getElementById('status');s.textContent=msg;
  s.classList.remove('flash');void s.offsetWidth;s.classList.add('flash');}

const TOOLS=[
  {id:'inspect',label:'👁 Inspect',hint:''},
  {id:'swale',label:'⛏ Swale + berm',hint:'+2 dirt · rt-click pairs'},
  {id:'ord',label:'🪨 Rock dam',hint:'2 stone'},
  {id:'bda',label:'🪵 BDA',hint:'3 wood+1 dirt'},
  {id:'bed',label:'🟫 Bed',hint:''},
  {id:'plant-beans',label:'🫘 Beans',hint:'fast · feeds the soil'},
  {id:'plant-squash',label:'🎃 Squash',hint:'big yield · wants room'},
  {id:'plant-corn',label:'🌽 Corn',hint:'heavy feeder · fed soil'},
  {id:'plant-pear',label:'🌵 P. pear',hint:'drought-proof · slow'},
  {id:'cistern',label:'🛢 Cistern',hint:'4 bags'},
  {id:'green',label:'🌡 Greenhouse',hint:'6 bags'},
  {id:'home',label:'🏠 Home',hint:'4/8/6 bags'},
  {id:'clear',label:'🧹 Clear',hint:''},
];
const ACTIONS=[
  {id:'fillbag',label:'🧱 Earthbag',hint:'1 dirt + 2L'},
  {id:'haul',label:'🚰 Haul water',hint:'+8L · 2⚡'},
];
const toolbar=document.getElementById('toolbar');
function actionBlock(id){
  if(id==='fillbag'){
    if(S.dirt<1)return {msg:'Need 1 dirt — dig a swale to get some',chip:'dirt'};
    if(S.water<2)return {msg:'Need 2L water — haul some or wait for rain',chip:'water'};
    if(S.energy<1)return {msg:'Out of energy — end the day to rest',chip:'energy'};
  }
  if(id==='haul'){
    const c=CH();
    if(c&&c.flags&&c.flags.noHaul)return {msg:'The town well is dry this year — no hauling. The sky is all you get',chip:'water'};
    if(S.energy<2)return {msg:'Hauling needs 2 energy — end the day to rest',chip:'energy'};
  }
  return null;
}
function flashChip(key){
  if(key==='energy'){ // energy lives in the big clock now
    const c2=document.getElementById('bcEnergy');
    c2.classList.remove('warn');void c2.offsetWidth;c2.classList.add('warn');
    return;
  }
  const c=document.querySelector(`#chips .chip[data-k="${key}"]`)||document.getElementById('bcEnergy');
  if(c){c.classList.remove('warn');void c.offsetWidth;c.classList.add('warn');}
}
const FARM_TOOLS=['plant-beans','plant-squash','plant-corn','plant-pear'];
const BUILD_TOOLS=['cistern','green','home'];
let confirmRestart=false;
function buildToolbar(){
  // no tool menus — the land is the interface. The dock only holds camp actions (earthbag, haul).
  const workbar=document.getElementById('workbar');
  toolbar.innerHTML='';workbar.innerHTML='';
  const objs=chapterObjectives();
  const nextObj=objs?objs.find(o=>!o.check()):null;
  const hint=nextObj?nextObj.hint:null;
  const mk=(parent,cap)=>{const g=document.createElement('div');g.className='toolgroup open';
    const capEl=document.createElement('div');capEl.className='cap';capEl.textContent=cap;
    g.appendChild(capEl);
    const b=document.createElement('div');b.className='btns';g.appendChild(b);parent.appendChild(g);
    b._grp=g; return b;};
  const acts=ACTIONS.filter(a=>isUnlocked(a.id));
  document.getElementById('dock').style.display=acts.length?'':'none';
  document.getElementById('dockTab').style.display='none';
  const g2=acts.length?mk(workbar,'⚡ Camp actions'):null;
  if(!g2){toolbarTail(hint);return;}
  for(const a of acts){
    const b=document.createElement('button');
    b.className='action'+(hint===a.id?' hintbtn':'');
    const block=actionBlock(a.id);
    b.innerHTML=`<b>${a.label}</b><span class="cost">${block?('🚫 '+block.msg.split(' — ')[0]):a.hint}</span>`;
    if(block){
      b.classList.add('blocked');b.title=block.msg;
      b.onclick=()=>{say('🚫 '+block.msg);flashChip(block.chip);};
    } else {
      b.onclick=()=>doAction(a.id);
    }
    g2.appendChild(b);
  }
  toolbarTail(hint);
}
function toolbarTail(hint){
  const fab=document.getElementById('endFab');
  if(S.mode==='campaign'&&S.chapter<CHAPTERS.length&&chapterDone()){
    fab.className='gold';
    fab.innerHTML=(S.chapter===CHAPTERS.length-1?'🏆':'⭐')+'<small>Next level</small>';
    fab.onclick=advanceChapter;
  } else {
    fab.className=hint==='end'?'hintbtn':'';
    fab.innerHTML=(S.energy>S.energyMax/2?'☀️':'🌙')+'<small>End day</small>';
    fab.onclick=endDay;
  }
}
function toggleOverlay(){
  S.overlay=!S.overlay;
  document.getElementById('wvBtn').classList.toggle('sel',S.overlay);
  document.getElementById('legend').classList.toggle('hidden',!S.overlay);
  say(S.overlay?'Water view on — blue is wet, red plants are thirsty, arrows show where rain will flow.':'Water view off.');
  refresh();
}
window.addEventListener('keydown',e=>{
  if((e.key==='v'||e.key==='V')&&!e.repeat)toggleOverlay();
  if((e.key===' '||e.key==='e'||e.key==='E')&&!e.repeat){
    if(!document.getElementById('intro').classList.contains('hidden'))return;
    if(!document.getElementById('chap').classList.contains('hidden')){document.getElementById('chap').classList.add('hidden');return;}
    if(!document.getElementById('report').classList.contains('hidden')){closeReport();return;}
    e.preventDefault();
    if(S.mode==='campaign'&&typeof chapterDone==='function'&&chapterDone())advanceChapter();
    else endDay();
  }
});
document.getElementById('report').addEventListener('click',e=>{if(e.target.id==='report')closeReport();});
document.getElementById('wpill').addEventListener('click',()=>{
  document.getElementById('weatherbox').classList.toggle('hidden');
});
document.getElementById('goalstitle').addEventListener('click',()=>{
  document.getElementById('goalsBox').classList.toggle('min');
});
function saveCode(){
  const g=[];
  for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++){
    const t=S.grid[y][x];
    g.push([t.type,+t.elev.toFixed(2),t.deco||0,t.stored,t.soil,t.moisture,
      t.plant?[t.plant.crop,t.plant.grown,t.plant.stage||0,t.plant.wilt||0]:0,
      t.homeStage,t.dam?1:0,t.wetDays,t.resto,t.fertile?1:0,t.inCreek?1:0,t.shade]);
  }
  const data={v:3,C:COLS,R:ROWS,wash:washPath.slice(),creeks:creekPaths.map(p2=>p2.slice()),
    s:{mode:S.mode,chapter:S.chapter,day:S.day,dayLv:S.dayLv,water:S.water,waterCap:S.waterCap,
       seeds:S.seeds,food:S.food,dirt:S.dirt,stone:S.stone,wood:S.wood,bags:S.bags,
       energy:S.energy,energyMax:S.energyMax,weather:S.weather,forecast:S.forecast,
       lastRainDay:S.lastRainDay,lv:S.lv,results:S.results,unlocked:S.unlocked,goals:S.goals,
       flags:S.flags,timeLeft:S.timeLeft},
    g};
  return btoa(unescape(encodeURIComponent(JSON.stringify(data))));
}
function loadCode(code){
  try{
    const d=JSON.parse(decodeURIComponent(escape(atob(code.trim()))));
    if(!d.v||!d.g||!d.C)throw 0;
    if(d.v===2&&d.s&&d.s.mode==='campaign')d.s.chapter+=BASICS.length; // old saves: campaign shifted past field school
    COLS=d.C;ROWS=d.R;
    S.grid.length=0;
    washPath.length=0;washPath.push(...d.wash);
    creekPaths.length=0;for(const p2 of d.creeks)creekPaths.push(p2);
    let i=0;
    for(let y=0;y<ROWS;y++){S.grid[y]=[];
      for(let x=0;x<COLS;x++){
        const a=d.g[i++];
        S.grid[y][x]={type:a[0],elev:a[1],deco:a[2]||null,stored:a[3],soil:a[4],moisture:a[5],
          plant:a[6]?{crop:a[6][0],grown:a[6][1],stage:a[6][2],wilt:a[6][3]}:null,
          homeStage:a[7],dam:!!a[8],wetDays:a[9],resto:a[10],fertile:!!a[11],inCreek:!!a[12],
          shade:a[13],rot:Math.random()*Math.PI*2};
      }}
    Object.assign(S,d.s);
    S.flags=S.flags||{};
    document.getElementById('intro').classList.add('hidden');
    document.getElementById('saveovl').classList.add('hidden');
    cam.dist=7+ROWS*0.85;cam.theta=0.18;cam.phi=0.95;updateCamera();
    renderChapter();refresh();
    say('Save loaded — right where you left it. 💾');
    return true;
  }catch(e){say('That code didn´t read — make sure you pasted the whole thing.');return false;}
}
window.doCopySave=function(){
  const ta=document.getElementById('savetext');
  ta.value=saveCode();
  ta.select();
  try{navigator.clipboard.writeText(ta.value);}catch(e){try{document.execCommand('copy');}catch(e2){}}
  say('Save code copied — paste it somewhere safe. 📋');
};
window.doLoadSave=function(){
  const ta=document.getElementById('savetext');
  if(!ta.value.trim()){say('Paste a save code into the box first.');return;}
  loadCode(ta.value);
};
document.getElementById('saveBtn').addEventListener('click',()=>{
  const ta=document.getElementById('savetext');
  ta.value=saveCode();
  document.getElementById('saveovl').classList.remove('hidden');
});
window.toFreePlay=function(){S.mode='free';renderChapter();refresh();say('Free play — every tool unlocked. The land is yours.');};
document.getElementById('infoBtn').addEventListener('click',()=>{
  document.getElementById('side').classList.add('open');
});
document.getElementById('dockTab').addEventListener('click',()=>{
  const d=document.getElementById('dock');
  d.classList.toggle('collapsed');
  document.getElementById('dockTab').textContent=d.classList.contains('collapsed')?'⏴':'⏵';
});
document.getElementById('wvBtn').addEventListener('click',toggleOverlay);
document.getElementById('rtBtn').addEventListener('click',()=>{
  S.rtMode=!S.rtMode;
  document.getElementById('rtBtn').classList.toggle('on',S.rtMode);
  const c=CH(); if(c)S.timeLeft=c.timer||40;
  say(S.rtMode?'⏱ TIMED MODE ON — the day now ends when the countdown does. Spend your energy fast!':'⏱ Timed mode off — take all the time you need. The day ends when you press End day.');
});
document.getElementById('sndBtn').addEventListener('click',()=>{
  sndOn=!sndOn;
  document.getElementById('sndBtn').textContent=sndOn?'🔊':'🔇';
  if(sndOn)SFX.plant();
});
function retryLevel(){
  const c=CH(); if(!c)return;
  generateTerrain(c.terrain);
  applyLevelStart(c);
  delete S.flags['cel'+S.chapter];
  delete S.results[S.chapter];
  log(`↻ Retry — Level ${S.chapter+1}: ${c.name}. Fresh land, same storms.`);
  renderChapter();refresh();
  say('Fresh land, same storms. Make this run count.');
}
window.retryLevel=retryLevel;
function lossReason(){
  const c=CH(); if(!c||chapterDone())return null;
  if(c.flags&&c.flags.erosion&&S.lv.eroded>=3)
    return '⚠ The unslowed floods tore out <b>three bank tiles</b> — this watershed is beyond saving this season.';
  if(c.script&&c.script.rains&&S.dayLv>Math.max(...c.script.rains)&&c.objectives.some(o=>o.rain&&!o.check()))
    return '🌵 Every storm this season will ever bring has come and gone — and the water goals are still out of reach.';
  if(S.dayLv>c.par+5)
    return `⏳ The season turned after <b>${c.par+5} days</b> — this land needed you faster.`;
  return null;
}
window.lostRetry=function(){
  document.getElementById('lost').classList.add('hidden');
  retryLevel();
};
document.getElementById('rsBtn').addEventListener('click',()=>{
  const inLevel=S.mode==='campaign'&&S.chapter<CHAPTERS.length;
  if(confirmRestart){confirmRestart=false;if(inLevel)retryLevel();else location.reload();}
  else{confirmRestart=true;say(inLevel?'↻ Tap again within 3s to RETRY THIS LEVEL on fresh land.':'↻ Tap restart again within 3s to confirm.');setTimeout(()=>{confirmRestart=false;},3000);}
});
const RESTO_STAGES=['pond','sedges','willows','birds','cottonwood'];
const RESTO_THRESH=[3,7,12,18];
function openSpot(){
  const pick=(allowNear)=>{let best=null,bd=1e9;
    for(let y=1;y<ROWS-1;y++)for(let x=1;x<COLS-1;x++){
      const t=S.grid[y][x];
      if(t.type!=='sand'||t.deco)continue;
      if(!allowNear&&nearWash(x,y))continue;
      const d=Math.abs(x-(COLS-1)/2)+Math.abs(y-(ROWS-1)/2);
      if(d<bd){bd=d;best=t;}
    }return best;};
  return pick(false)||pick(true);
}
const PRACTICE={cols:6,rows:8,flatP:0.6,steepP:0,rocks:1,creeks:1,minTrees:1,minRocks:1,minDrift:1,name:'a practice plot',flora:['saguaro','paloverde','pricklypear']};
const BASICS=[
 {name:'The Shovel',basics:true,par:1,timer:60,
  terrain:Object.assign({},PRACTICE),
  start:{water:6,seeds:0,dirt:0,energy:6},
  script:{rains:[2]},
  intro:'Field school, lesson 1 — the swale. There are no menus here: just click the land. Click any open sand to dig a swale, then click the tile JUST BELOW it and pick 🧱 Berm. That pair is the whole game: the swale catches rain, the berm makes it hold more. A storm comes tomorrow — end the day and watch it fill. (The dashed ⏭ button on the left skips any lesson.)',
  unlocks:['inspect','swale','berm','clear'],
  objectives:[
   {t:'Dig a swale, then click just below it to add the berm',hint:'swale',check:()=>countPairs()>=1},
  ]},
 {name:'The Bed',basics:true,par:1,timer:60,
  terrain:Object.assign({},PRACTICE),
  start:{water:6,seeds:0,dirt:0,energy:6},
  script:{rains:[]},
  intro:'Lesson 2 — the garden bed. Click open sand: now the land offers a choice — ⛏ Swale or 🟫 Garden bed. Pick the bed and till it. Beds are where seeds go — nothing grows on raw desert.',
  unlocks:['bed'],
  objectives:[
   {t:'Till one bed on open sand',hint:'bed',check:()=>countAll(t=>t.type==='bed')>=1},
  ]},
 {name:'The Seed',basics:true,par:1,timer:60,
  terrain:Object.assign({},PRACTICE),
  start:{water:6,seeds:1,dirt:0,energy:6},
  script:{rains:[]},
  setup(){const t=openSpot();if(t){t.type='bed';t.moisture=4;}},
  intro:'Lesson 3 — planting. We tilled a bed for you (the dark square). Click it and pick 🌱 Beans. One seed, one click.',
  unlocks:['plant-beans'],
  objectives:[
   {t:'Plant beans in the ready bed',hint:'plant-beans',check:()=>countAll(t=>!!t.plant)>=1},
  ]},
 {name:'The Thirst',basics:true,par:1,timer:60,
  terrain:Object.assign({},PRACTICE),
  start:{water:6,seeds:0,dirt:0,energy:6},
  script:{rains:[]},
  setup(){const t=openSpot();if(t){t.type='bed';t.moisture=0;t.plant={crop:'beans',stage:0,grown:1,wilt:0};}},
  intro:'Lesson 4 — water. The bean bed we left you is bone dry, so it wears a 💧 tag. Click the plant (or its tag) to give it a 3L soak — clicking any growing crop waters it. No tag means nobody is thirsty.',
  unlocks:['water'],
  objectives:[
   {t:'Click the 💧 tag to water the thirsty bed',hint:'water',check:()=>S.lv.watered>=1},
  ]},
 {name:'The Harvest',basics:true,par:1,timer:60,
  terrain:Object.assign({},PRACTICE),
  start:{water:6,seeds:0,dirt:0,energy:6},
  script:{rains:[]},
  setup(){const t=openSpot();if(t){t.type='bed';t.moisture=3;t.plant={crop:'beans',stage:0,grown:2,wilt:0};}},
  intro:'Lesson 5 — harvest. Those beans are ripe, so they wear a 🧺 tag. Click the plant (or its 🧺 tag) to bring in the food — harvests also hand back seeds for the next planting.',
  unlocks:['harvest'],
  objectives:[
   {t:'Harvest the ripe beans',hint:'harvest',check:()=>S.lv.harvests>=1},
  ]},
 {name:'Stone & Wood',basics:true,par:1,timer:60,
  terrain:Object.assign({},PRACTICE,{rocks:2,minRocks:2,minTrees:2,minDrift:2}),
  start:{water:6,seeds:0,dirt:0,energy:6},
  script:{rains:[]},
  intro:'Lesson 6 — gathering. No tool needed: click a boulder to break it into stone (1⚡), a tree to fell it for wood (2⚡), or driftwood for cheap wood (1⚡). Everything here is finite — what you take does not come back.',
  unlocks:['gather'],
  objectives:[
   {t:'Gather 2 stone (a boulder) and 2 wood (tree or driftwood)',hint:'',check:()=>S.lv.stone>=2&&S.lv.wood>=2},
  ]},
 {name:'The Rock Dam',basics:true,par:1,timer:60,
  terrain:Object.assign({},PRACTICE,{creeks:1,minCreeks:1}),
  start:{water:6,seeds:0,dirt:0,stone:2,energy:6},
  script:{rains:[2]},
  intro:'Lesson 7 — the rock dam. You have 2 stone. Click a CREEK tile (the thin channel) and the dam goes up on the spot — one rock high, it slows storm water and traps silt that slowly becomes farmland. Creeks only — the big wash would blow it out.',
  unlocks:['ord'],
  objectives:[
   {t:'Build a rock dam in the creek',hint:'ord',check:()=>S.lv.creekOrds>=1},
  ]},
 {name:'The Beaver Dam',basics:true,par:1,timer:60,
  terrain:Object.assign({},PRACTICE),
  start:{water:6,seeds:0,dirt:1,wood:3,energy:6},
  script:{rains:[2]},
  intro:'Lesson 8 — the beaver-dam analog. The wide sandy channel is the WASH. Click a wash tile: your 3 wood and 1 dirt build the dam right there. It ponds the next storm and greens its banks. That is everything — the real levels start next.',
  unlocks:['bda'],
  objectives:[
   {t:'Build a BDA in the wash',hint:'bda',check:()=>countAll(t=>t.dam)>=1},
  ]},
];
const CHAPTERS=[...BASICS,
 {name:'First Rain',par:3,timer:50,
  terrain:{cols:7,rows:9,flatP:0.55,steepP:0.05,rocks:5,creeks:1,fetch:{len:6,cols:1},name:'a pocket bajada',flora:['saguaro','paloverde','pricklypear','ocotillo']},
  start:{water:12,seeds:2,dirt:0,energy:8},
  script:{rains:[2,4]},
  intro:'Small land, small days — you have 8 energy here, and day 1 needs every one of them: dig, berm, till, plant, and WATER. The monsoon comes on day 2 — catch it and you can finish by day 3 for ★★★. Miss it and one late storm (day 4) gives you a second chance at fewer stars. Dig a swale where the water actually runs, berm it, and put your beds where the swale will water them. There is no spare anything.',
  unlocks:['plant-squash','plant-pear'],
  objectives:[
   {t:'Dig a swale with a berm below it',hint:'swale',check:()=>countPairs()>=1},
   {t:'Hand-water both beds — dry seeds don´t grow',hint:'water',check:()=>S.lv.watered>=2},
   {t:'Hold 12L+ in one swale after the storm',hint:'end',rain:true,check:()=>maxSwale()>=12},
   {t:'Harvest 2 crops',hint:'harvest',check:()=>S.lv.harvests>=2},
  ]},
 {name:'Hold the Creeks',par:6,timer:45,
  terrain:{cols:8,rows:11,flatP:0.15,steepP:0.3,rocks:5,creeks:2,minCreeks:2,minRocks:3,snakes:1,name:'a steep rocky bajada',flora:['ocotillo','paloverde','saguaro','pricklypear']},
  start:{water:10,seeds:2,dirt:0,energy:7},
  script:{rains:[2,4,6]},
  intro:'Three storms: days 2, 4, 6. Rock dams work ONLY in the little creeks. Every dam must be in before the first storm, or the silt math never closes.',
  unlocks:[],
  objectives:[
   {t:'Build 3 rock dams in the creeks',hint:'ord',check:()=>S.lv.creekOrds>=3},
   {t:'Trap 10 sediment',hint:'end',rain:true,check:()=>S.lv.sed>=10},
   {t:'Grow grass at a silted dam (6 silt)',hint:'end',rain:true,check:()=>S.lv.grass>=1},
  ]},
 {name:'Dam the Wash',par:3,timer:45,
  terrain:{cols:8,rows:12,flatP:0.4,steepP:0.12,rocks:6,creeks:1,minTrees:1,minDrift:2,name:'wide wash country',flora:['mesquite','saguaro','pricklypear','paloverde']},
  start:{water:8,seeds:0,dirt:2,energy:8},
  script:{rains:[2,4]},
  intro:'Storm on day 2. Two driftwood snags and one tree — exactly 6 wood, exactly 2 dams, and beds that touch the ponds. Day 1 takes every one of your 8 energy. No wasted click.',
  unlocks:[],
  objectives:[
   {t:'2 BDAs in the wash before the storm',hint:'bda',check:()=>countAll(t=>t.dam)>=2},
   {t:'Pond 24L at once (both dams full)',hint:'end',rain:true,check:()=>sumPonds()>=24},
   {t:'Flood-soak 2 beds beside the ponds',hint:'bed',rain:true,check:()=>S.lv.flooded>=2},
  ]},
 {name:'Life Returns',par:9,timer:40,
  terrain:{cols:9,rows:12,flatP:0.5,steepP:0.05,rocks:6,creeks:1,minTrees:1,minDrift:2,snakes:2,name:'an old floodplain',flora:['mesquite','pricklypear','agave']},
  start:{water:10,seeds:2,dirt:2,energy:8},
  script:{rains:[2,4,6,8,10]},
  intro:'Rain every second day — IF your dams are in, the ponds never dry. Willows need 7 straight wet days: miss the day-2 storm and the level cannot be won at par.',
  unlocks:[],
  objectives:[
   {t:'2 BDAs standing in the wash',hint:'bda',check:()=>countAll(t=>t.dam)>=2},
   {t:'Willows take root (7 straight wet days)',hint:'end',rain:true,check:()=>mapResto()>=2},
   {t:'Trap 14 sediment',hint:'end',rain:true,check:()=>S.lv.sed>=14},
  ]},
 {name:'The Homestead',par:9,timer:40,
  terrain:{cols:9,rows:13,flatP:0.3,steepP:0.25,rocks:8,creeks:2,riparian:true,snakes:2,name:'the foot of the mesa — juniper country begins',flora:['juniper','pinyon','agave']},
  start:{water:14,seeds:3,dirt:2},
  script:{rains:[2,5,8]},
  intro:'Corn joins your seed bag — plant the Three Sisters together: corn trellises the beans, beans feed the soil, squash shades the ground. And build: cistern, greenhouse, and a full earthbag home — 28 bags. That is 28 dirt and 56L of water — the dirt comes out of the swales you dig, the water out of the storms they catch. Count everything.',
  unlocks:['cistern','green','home','fillbag','haul','plant-corn'],
  objectives:[
   {t:'Build a cistern',hint:'cistern',check:()=>countAll(t=>t.type==='cistern')>=1},
   {t:'Build a greenhouse',hint:'green',check:()=>countAll(t=>t.type==='green')>=1},
   {t:'Finish the earthbag home (18 bags)',hint:'home',check:()=>countAll(t=>t.type==='home'&&t.homeStage>=3)>=1},
   {t:'Stock 12 food in the pantry',hint:'harvest',check:()=>S.food>=12},
  ]},
 {name:'The Long Dry',par:12,timer:40,
  terrain:{cols:10,rows:14,flatP:0.5,steepP:0.08,rocks:8,creeks:1,fetch:{len:9,cols:3},riparian:true,snakes:2,name:'a high dry valley',flora:['juniper','agave','pricklypear']},
  start:{water:12,seeds:5,dirt:2},
  script:{rains:[3]},
  flags:{noHaul:true},
  intro:'ONE storm — day 3 — then nothing, ever. The well is dry. 54L banked means three full swale-and-berm pairs in columns with real fetch. Five prickly pear seeds are your entire food supply.',
  unlocks:[],
  objectives:[
   {t:'Bank 54L from the one storm',hint:'swale',rain:true,check:()=>S.lv.bank>=54},
   {t:'Harvest 5 prickly pear through the drought',hint:'harvest',check:()=>S.lv.harvests>=5},
   {t:'Reach day 12 with 8+ food',hint:'end',check:()=>S.dayLv>=12&&S.food>=8},
  ]},
 {name:'The Angry Wash',par:8,timer:35,
  terrain:{cols:10,rows:15,flatP:0.12,steepP:0.35,rocks:6,creeks:2,minCreeks:2,minTrees:2,minDrift:3,minRocks:2,riparian:true,name:'a storm-cut canyon slope',flora:['juniper','pinyon','agave']},
  start:{water:8,seeds:0,dirt:3},
  flags:{erosion:true},
  script:{rains:[2,5,8]},
  intro:'Storms on 2, 5, 8 — and every unslowed one tears out a bank tile. Day 1 is exactly ten energy: three driftwood, two trees, three BDAs. There is no second-best first day.',
  unlocks:[],
  objectives:[
   {t:'3 BDAs standing in the wash',hint:'bda',check:()=>countAll(t=>t.dam)>=3},
   {t:'2 rock dams in the creeks',hint:'ord',check:()=>S.lv.creekOrds>=2},
   {t:'Weather all 3 storms with zero erosion',hint:'end',rain:true,check:()=>S.lv.cleanStreak>=3},
  ]},
 {name:'Hardpan Flats',par:11,timer:35,
  terrain:{cols:11,rows:16,flatP:0.55,steepP:0.05,rocks:7,creeks:2,minCreeks:2,minRocks:3,riparian:true,snakes:2,name:'high caliche flats',flora:['juniper','pricklypear','agave'],hardpanP:0.8},
  start:{water:10,seeds:3,dirt:1},
  script:{rains:[2,4,6,8,10]},
  intro:'Caliche covers four tiles in five — you cannot dig it. The only farmland is what your creek dams BUILD: silt them to grass, till the grass, farm the silt. Dams in before day 2 or the grass comes too late.',
  unlocks:[],
  objectives:[
   {t:'Trap 14 sediment',hint:'ord',rain:true,check:()=>S.lv.sed>=14},
   {t:'Grow 2 grass tiles from silted dams',hint:'end',rain:true,check:()=>S.lv.grass>=2},
   {t:'Harvest 4 crops off the land you built',hint:'harvest',check:()=>S.lv.harvests>=4},
  ]},
 {name:'The Lean Year',par:11,timer:35,
  terrain:{cols:11,rows:16,flatP:0.3,steepP:0.25,rocks:4,creeks:1,fetch:{len:9,cols:3},riparian:true,snakes:3,name:'a picked-over highland claim',flora:['juniper','pinyon','agave'],minTrees:2,minRocks:2,minDrift:2},
  start:{water:10,seeds:2,dirt:0},
  script:{rains:[4,9]},
  flags:{noHaul:true},
  intro:'Two storms all season: days 4 and 9. No well. Two seeds. Every swale you dig must do double duty — catch the storm AND pay the dirt for your earthbags. Spend nothing you cannot spend twice.',
  unlocks:[],
  objectives:[
   {t:'Bank 54L from a single storm',hint:'swale',rain:true,check:()=>S.lv.bank>=54},
   {t:'Stock 14 food',hint:'harvest',check:()=>S.food>=14},
   {t:'Build a cistern AND a greenhouse',hint:'cistern',check:()=>countAll(t=>t.type==='cistern')>=1&&countAll(t=>t.type==='green')>=1},
  ]},
 {name:'The Whole Watershed',par:14,timer:35,
  terrain:{cols:12,rows:18,flatP:0.15,steepP:0.3,rocks:10,creeks:2,minCreeks:2,minDrift:3,minTrees:3,fetch:{len:9,cols:4},riparian:true,snakes:3,name:'the canyon rim — pinyon-juniper high country',flora:['pinyon','juniper','agave'],hardpanP:0.2},
  start:{water:12,seeds:3,dirt:2},
  flags:{erosion:true},
  script:{rains:[2,5,8,11,14]},
  intro:'Everything, all at once, on the full watershed: an angry wash to calm by day 2, four swale pairs to bank 72L, twelve wet days for the birds, and a home built from the dirt you dig. One plan survives.',
  unlocks:[],
  objectives:[
   {t:'Bank 72L from a single storm',hint:'swale',rain:true,check:()=>S.lv.bank>=72},
   {t:'Birds return to the wash (12 wet days)',hint:'end',rain:true,check:()=>mapResto()>=3},
   {t:'2 clean storms in a row (no erosion)',hint:'end',rain:true,check:()=>S.lv.cleanStreak>=2},
   {t:'Finish the earthbag home',hint:'home',check:()=>countAll(t=>t.type==='home'&&t.homeStage>=3)>=1},
  ]},
];
function CH(){return S.mode==='campaign'&&S.chapter<CHAPTERS.length?CHAPTERS[S.chapter]:null;}
function starsNow(){const c=CH();if(!c)return 1;return S.dayLv<=c.par?3:(S.dayLv<=c.par+3?2:1);}
function sumPonds(){let s=0;for(const row of S.grid)for(const t of row)if(t.dam)s+=t.stored;return s;}
function maxSwale(){let m=0;for(const row of S.grid)for(const t of row)if(t.type==='swale'&&t.stored>m)m=t.stored;return m;}
function countPairs(){let n=0;for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++){const t=S.grid[y][x];if(t&&t.type==='swale'){const b=tileAt(x,y+1);if(b&&b.type==='berm')n++;}}return n;}
function nextForecast(){
  const c=CH();
  if(c&&c.script){
    const d=S.dayLv+1;
    if(c.script.rains)  // scripted levels: these are the ONLY storms — plan around them
      return c.script.rains.includes(d)?'rain':(Math.random()<0.6?'sunny':(Math.random()<0.5?'scorcher':'cloudy'));
    if(c.script.dryUntil&&d<=c.script.dryUntil){
      const r=Math.random();return r<0.55?'sunny':(r<0.8?'scorcher':'cloudy');
    }
  }
  return (S.day-S.lastRainDay>=4)?'rain':rollWeather();
}
function prologueLoss(){
  let lost=0,sed=0,rain=0;
  for(let x=0;x<COLS;x++){
    let run=0,sd=0;
    for(let y=0;y<ROWS;y++){
      const t=S.grid[y][x];
      run+=2;rain+=2;
      if(t.type==='sand'&&!t.deco)sd+=1;
      if(t.type==='wash'||t.type==='creek'){run=0;sd=0;}
    }
    lost+=run;sed+=sd;
  }
  for(const p2 of creekPaths){rain+=8+p2.length;lost+=8+p2.length;sed+=3;}
  rain+=26+2*washPath.length;lost+=26+2*washPath.length;sed+=5;
  return {rain,lost,sed};
}
function applyLevelStart(c){
  const st=c.start||{};
  S.water=st.water??35;S.waterCap=60;S.seeds=st.seeds??4;S.dirt=st.dirt??2;
  S.stone=st.stone??0;S.wood=st.wood??0;S.bags=st.bags??0;S.food=st.food??0;
  S.energyMax=st.energy??10;
  S.energy=S.energyMax;S.dayLv=1;S.timeLeft=(c.timer||40);
  cam.dist=7+ROWS*0.85;cam.theta=0.18;cam.phi=0.95;updateCamera();
  if(c.setup)c.setup();
  // the storm you arrived in: rain runs off the untouched land, dries by morning, and shows the bill
  clearTimeout(S._pro1);clearTimeout(S._pro2);
  if(!c.basics){
  S._pro1=setTimeout(()=>{ if(S.mode!=='campaign')return;
    startRain(); SFX.rain();
    say('⛈ The storm you arrived in — watch where the water goes…');
  },700);
  S._pro2=setTimeout(()=>{ if(S.mode!=='campaign')return;
    const P=prologueLoss();
    const we=washPath[washPath.length-1];
    if(we){popAt(we.x,we.y,`−${P.lost}L 🌊`,0,'bad');popAt(we.x,we.y,`−${P.sed} soil`,700,'bad');}
    showStormToast(`<b class="t">⛈ The storm you arrived in</b><br>${P.rain}L fell on the bare land — <b style="color:#a04a2a">${P.lost}L ran straight off downstream</b> and <b style="color:#a04a2a">${P.sed} topsoil washed away</b>. By morning it was dry as bone again.<br><i>Everything you build keeps a piece of the next one.</i>`,9500);
    log(`Arrival storm: ${P.rain}L fell, ${P.lost}L escaped, ${P.sed} topsoil gone. Catch the next one.`);
  },3400);}
  S.lastRainDay=S.day;S.flags.pondSeen=false;
  S.lv={harvests:0,ords:0,creekOrds:0,sed:0,grass:0,flooded:0,rainCaught:false,stone:0,wood:0,rains:0,cleanStreak:0,eroded:0,bank:0,watered:0};
  S.weather='sunny';S.forecast=nextForecast();
}
/* --- sound: tiny synthesized SFX, no assets --- */
let AC=null, sndOn=true;
function ac(){ if(!AC){try{AC=new (window.AudioContext||window.webkitAudioContext)();}catch(e){}}
  if(AC&&AC.state==='suspended')try{AC.resume();}catch(e){} return AC; }
function tone(f,dur,type,vol,delay,slide){
  const a=ac(); if(!a||!sndOn)return;
  const t0=a.currentTime+(delay||0);
  const o=a.createOscillator(), g=a.createGain();
  o.type=type||'sine'; o.frequency.setValueAtTime(f,t0);
  if(slide)o.frequency.exponentialRampToValueAtTime(Math.max(30,slide),t0+dur);
  g.gain.setValueAtTime(0,t0);
  g.gain.linearRampToValueAtTime(vol||0.12,t0+0.008);
  g.gain.exponentialRampToValueAtTime(0.0001,t0+dur);
  o.connect(g).connect(a.destination);
  o.start(t0); o.stop(t0+dur+0.03);
}
function noiseS(dur,vol,delay,lp){
  const a=ac(); if(!a||!sndOn)return;
  const t0=a.currentTime+(delay||0);
  const n=a.createBufferSource();
  const buf=a.createBuffer(1,Math.max(1,Math.floor(a.sampleRate*dur)),a.sampleRate);
  const d=buf.getChannelData(0);
  for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;
  n.buffer=buf;
  const f=a.createBiquadFilter(); f.type='lowpass'; f.frequency.value=lp||900;
  const g=a.createGain();
  g.gain.setValueAtTime(vol||0.15,t0);
  g.gain.exponentialRampToValueAtTime(0.0001,t0+dur);
  n.connect(f); f.connect(g); g.connect(a.destination);
  n.start(t0);
}
const SFX={
  dig(){noiseS(0.16,0.2,0,600);tone(160,0.1,'triangle',0.08,0.02,90);},
  build(){tone(120,0.12,'square',0.07,0,80);noiseS(0.08,0.12,0.02,400);},
  plant(){tone(520,0.08,'sine',0.07);tone(660,0.09,'sine',0.07,0.07);},
  harvest(){tone(660,0.09,'sine',0.1);tone(880,0.1,'sine',0.1,0.08);tone(1100,0.14,'sine',0.09,0.16);},
  gather(){noiseS(0.12,0.16,0,1400);tone(220,0.08,'triangle',0.07,0.01,140);},
  water(){tone(300,0.16,'sine',0.09,0,140);noiseS(0.12,0.06,0.02,700);},
  rain(){for(let i=0;i<7;i++)noiseS(0.32,0.05,i*0.12,800);tone(150,0.6,'sine',0.05,0.1,60);},
  thunder(){noiseS(1.1,0.22,0.05,140);noiseS(0.7,0.14,0.5,90);tone(55,0.9,'sine',0.1,0.08,32);},
  rattle(){for(let i=0;i<10;i++)noiseS(0.03,0.09,i*0.035,3200);},
  tick(){tone(1050,0.04,'square',0.05);},
  fanfare(){[523,659,784,1047].forEach((f,i)=>tone(f,0.22,'triangle',0.11,i*0.13));tone(1319,0.4,'triangle',0.09,0.55);},
  lose(){[392,330,262,196].forEach((f,i)=>tone(f,0.3,'triangle',0.1,i*0.22));},
  day(){tone(392,0.14,'sine',0.07);tone(523,0.18,'sine',0.07,0.1);},
};
const tutEl=document.getElementById('tut');
function isUnlocked(id){return S.mode==='free'||S.unlocked.includes(id);}
function startMode(mode){
  document.getElementById('intro').classList.add('hidden');
  S.mode=mode;
  if(mode==='free'){generateTerrain(TERRAINS[0]);cam.dist=7+ROWS*0.85;updateCamera();}
  if(mode==='campaign'){
    S.chapter=0;S.unlocked=CHAPTERS[0].unlocks.slice();
    generateTerrain(CHAPTERS[0].terrain);
    applyLevelStart(CHAPTERS[0]);
    log(`Level 1 — ${CHAPTERS[0].name} (par ${CHAPTERS[0].par} days for ★★★). ${CHAPTERS[0].intro}`);
  }
  renderChapter();refresh();
}
function chapterObjectives(){const c=CH();return c?c.objectives:null;}
function chapterDone(){const o=chapterObjectives();return !!o&&o.every(x=>x.check());}
function renderChapter(){
  const nb=document.getElementById('nextlvl');
  const sk=document.getElementById('skiptest');
  if(S.mode!=='campaign'||S.chapter>=CHAPTERS.length){tutEl.classList.add('hidden');nb.classList.add('hidden');sk.classList.add('hidden');return;}
  sk.classList.remove('hidden');
  sk.onclick=advanceChapter;
  const done=chapterDone();
  const stTxt='★'.repeat(starsNow())+'☆'.repeat(3-starsNow());
  nb.classList.toggle('hidden',!done);
  nb.textContent=S.chapter===CHAPTERS.length-1?`🏆 LEVEL COMPLETE ${stTxt} — Finish the campaign!`:`⭐ LEVEL COMPLETE ${stTxt} — Next level!`;
  nb.onclick=advanceChapter;
  tutEl.classList.add('hidden'); // level info + objectives live in the always-on goals panel now
}
function chapterCheck(){
  if(S.mode!=='campaign'||S.chapter>=CHAPTERS.length)return;
  if(chapterDone()&&!S.flags['cel'+S.chapter]){
    S.flags['cel'+S.chapter]=true;
    S.chapDoneAt=performance.now();
    S.results[S.chapter]={days:S.dayLv,stars:starsNow()};
    SFX.fanfare();
    buildToolbar();
    log(`⭐ Level ${S.chapter+1} — ${CHAPTERS[S.chapter].name} — complete in ${S.dayLv} days: ${'★'.repeat(starsNow())} (par ${CHAPTERS[S.chapter].par}).`);
    say(`${'★'.repeat(starsNow())} Level complete in ${S.dayLv} days! Take it in, then press Next level.`);
  }
  renderChapter();
}
function advanceChapter(){
  if(!S.results[S.chapter])S.results[S.chapter]={days:S.dayLv,stars:1};
  S.chapter++;
  if(S.chapter<CHAPTERS.length){
    const nx=CHAPTERS[S.chapter];
    S.unlocked.push(...nx.unlocks);
    generateTerrain(nx.terrain);
    applyLevelStart(nx);
    const warn=[];
    if(nx.flags&&nx.flags.noHaul)warn.push('🚱 the town well is dry — no hauling water');
    if(nx.flags&&nx.flags.erosion)warn.push('⚠ an unslowed flood tears out a bank tile every storm');
    if(nx.script&&nx.script.dryUntil)warn.push(`☀ drought — almost no rain before day ${nx.script.dryUntil}`);
    if(nx.script&&nx.script.rains&&nx.script.rains.length===1)warn.push(`🌧 exactly one early storm (day ${nx.script.rains[0]}) for a long while`);
    if(nx.terrain.hardpanP)warn.push('🧱 caliche hardpan covers much of the ground — it cannot be dug');
    if(nx.terrain.minTrees)warn.push('🪓 resources are scarce — count every tree and stone');
    log(`Level ${S.chapter+1} — ${nx.name}. New ground: ${nx.terrain.name}.`);
    showChap(`Level ${S.chapter+1} — ${nx.name}`,
      `New ground: <b>${nx.terrain.name}</b>. Your tools come with you; supplies are what the wagon holds.<br><br>${nx.intro}`+
      (warn.length?`<br><br><b>This land plays rough:</b><br>· ${warn.join('<br>· ')}`:'')+
      (nx.unlocks.length?`<br><br>New tools: ${nx.unlocks.map(u=>{const t=TOOLS.find(x=>x.id===u)||ACTIONS.find(x=>x.id===u);return t?t.label:u;}).join(' · ')}`:'')+
      `<br><br>⭐ Par: <b>${nx.par} days</b> for ★★★ · ${nx.par+3} days for ★★`);
  } else {
    const summary=CHAPTERS.map((c,i)=>`Lv.${i+1}&nbsp;${'★'.repeat((S.results[i]||{}).stars||0)||'—'}`).join(' · ');
    const total=Object.values(S.results).reduce((a,r)=>a+(r.stars||0),0);
    log(`Campaign complete — ${total}/${CHAPTERS.length*3} stars. The desert is a homestead. 🏠🌱`);
    SFX.fanfare();setTimeout(()=>SFX.fanfare(),900);
    showChap('Campaign complete! 🏆',
      `${summary}<br><br><b>${total} / ${CHAPTERS.length*3} stars.</b><br><br>You caught the rain, held the soil, dammed the wash, outlasted drought, flood, and hardpan, brought life back, and built your home from the earth itself.<br><br>The land keeps living — free play is yours. (Restart to chase ★★★.)`);
    S.mode='free';
  }
  refresh();
}
let pendingChap=null;
let pendingGains=[];
let toastTimer=null;
function showStormToast(html,ms){
  const st=document.getElementById('stormToast');
  st.innerHTML=html;
  st.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>st.classList.add('hidden'),ms||7000);
  st.onclick=()=>st.classList.add('hidden');
}
function tileXY(tt){for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++)if(S.grid[y][x]===tt)return{x,y};return null;}
function popAt(tx,ty,txt,delay,cls){
  setTimeout(()=>{
    const t=tileAt(tx,ty); if(!t)return;
    const v=new THREE.Vector3(gx(tx),t.elev+0.75,gz(ty)).project(camera);
    if(v.z>1)return;
    const d=document.createElement('div');d.className='fxpop'+(cls?' '+cls:'');d.textContent=txt;
    d.style.left=((v.x*0.5+0.5)*VW)+'px';d.style.top=((-v.y*0.5+0.5)*VH)+'px';
    view.appendChild(d);
    setTimeout(()=>d.remove(),2700);
  },delay);
}
function closeReport(){
  document.getElementById('report').classList.add('hidden');
  pendingGains.forEach((gn,i)=>popAt(gn.x,gn.y,'+'+gn.amt+'L 💧',120+i*160));
  pendingGains=[];
  if(pendingChap){const p=pendingChap;pendingChap=null;showChap(p[0],p[1]);}
}
window.closeReport=closeReport;
function showChap(title,body){
  if(!document.getElementById('report').classList.contains('hidden')){pendingChap=[title,body];return;}
  document.getElementById('chaptitle').innerHTML=title;
  document.getElementById('chapbody').innerHTML=body;
  document.getElementById('chap').classList.remove('hidden');
}
function toolHelp(id){
  switch(id){
    case 'swale':return 'OPEN SAND, not beside the wash. Catches sheet-flow — more open ground uphill = more water. Pays +2 dirt. To BERM the pair (10→18L): right-click the swale, or click the green-marked tile below it. Trees, rocks, driftwood gather on a plain click — no tool needed.';
    case 'berm':return 'SAND DIRECTLY BELOW A SWALE only (green squares show where). Banks the swale up from 10L to 18L. Costs 1 dirt.';
    case 'ord':return 'CREEKS ONLY (green squares show where). 2 stone. Slows the little creek, traps its silt, and waters the beds beside it — at 6 silt the dam becomes a grass tile you can farm.';
    case 'gather':return 'Pry stone from boulders (1⚡), cut wood from living trees (2⚡), or grab storm-dropped driftwood cheap (1⚡). Saguaros are off limits, obviously.';
    case 'plant-beans':return 'FAST (2 days) and they FEED THE SOIL — harvesting beans makes their bed and its neighbors fertile. Plant beside corn for the trellis bonus (+1). The rotation starter.';
    case 'plant-squash':return 'BIG YIELD (4 food, 3 days) — +1 more with no plants beside it (it sprawls), and its leaves SHADE neighboring beds (−1 evaporation). Give it a corner.';
    case 'plant-corn':return 'HEAVY FEEDER: only 1 food from raw sand, but 4 from FED soil (beans first, or rich silt). Trellises beans beside it (+1). Corn is why you rotate.';
    case 'plant-pear':return 'DROUGHT-PROOF: never wilts, and grows even bone-dry — at half speed. Water it for full speed. The insurance crop.';
    case 'bed':return 'SAND or GRASS. Wet swales and ponds water neighboring beds +1/day — but growing crops DRINK 2/day (fertile soil: only 1). Fertile beds (silt grass, or fed by beans): +1 food too. 🧺 = ripe, click it. 💧 = thirsty, click to water.';
    case 'water':return '3L for +2 moisture. Growing crops DRINK 2 moisture a day — one wet swale beside a bed (+1/day) cannot keep up alone. Sandwich beds between two swales, flood from a pond, or top up by hand. 💧 tags mark thirsty beds — click them.';
    case 'harvest':return 'Click a plant with a golden star to harvest it. Tip: right-clicking a ripe plant harvests it with ANY tool selected.';
    case 'home':return 'OPEN SAND, one site only (green square once placed). Three builds on the same tile: foundation 4 bags → walls 8 → roof 6.';
    case 'green':return 'A greenhouse bed: plants inside barely need water and shrug off scorchers.';
    case 'cistern':return 'OPEN SAND. 4 bags. Raises your water cap +100L and catches 20L every storm.';
    case 'clear':return 'Click to return a swale, berm, or bed to plain sand — or pull a dam out of the wash.';
    case 'bda':return 'THE BIG WASH only (green squares show where). 3 wood + 1 dirt. Ponds up to 12L of storm surge, soaks every neighboring tile, calms the flood downstream, and greens up if kept wet.';
    default:return 'Click the land to look around.';
  }
}

function buildBerm(x,y){
  const t=tileAt(x,y); if(!t)return;
  if(t.type!=='sand'){say('Berms go on open sand.');return;}
  if(nearWash(x,y)){say('Too close to the wash — the bank belongs to the river. Work the slopes; let dams tend the banks.');return;}
  const up=tileAt(x,y-1);
  if(!up||up.type!=='swale'){say('Berms finish a pair — the tile directly below a swale. Dig the swale first!');return;}
  if(S.dirt<1){say('Need 1 dirt — dig a swale first.');return;}
  if(!spend(1))return;
  t.type='berm';t.deco=null;S.dirt--;SFX.dig();
  popAt(x,y,'⛰ pair!',0,'earth');
  say('Berm raised — the pair is complete. The swale now holds 18L instead of 10.');
  refresh();
}
function doHarvest(t){
  if(!t.plant){say('Nothing to harvest there — pick a plant with a gold star.');return false;}
  if(t.plant.grown<CROPS[t.plant.crop].days){
    const c0=CROPS[t.plant.crop];
    say(`${c0.name}: day ${t.plant.grown}/${c0.days} — ${c0.days-t.plant.grown} more ${c0.days-t.plant.grown===1?'day':'days'}${t.moisture<1&&!c0.drought?' (and it needs water!)':''}.`);
    return false;
  }
  if(!spend(1))return false;
  const c=CROPS[t.plant.crop];
  const xy0=tileXY(t);
  let bonus=t.fertile?1:0;
  let sisters='';
  if(t.plant.crop==='corn'){ // heavy feeder: starves on raw sand, feasts on fed soil
    bonus=t.fertile?3:0;
    if(t.fertile)sisters=' Fed soil: +3!';
  }
  if(t.plant.crop==='squash'&&xy0){ // sprawler: +1 food with no orthogonal neighbor plants
    const crowded=[[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>{
      const n=tileAt(xy0.x+dx,xy0.y+dy);return n&&n.plant;});
    if(!crowded){bonus++;sisters=' Room to sprawl: +1!';}
  }
  if(t.plant.crop==='beans'&&xy0){
    const corn=[[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>{
      const n=tileAt(xy0.x+dx,xy0.y+dy);return n&&n.plant&&n.plant.crop==='corn';});
    if(corn){bonus++;sisters=' Corn trellis: +1!';}
    t.fertile=true; // beans fix nitrogen into their own bed
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
      const n=tileAt(xy0.x+dx,xy0.y+dy);
      if(n&&(n.type==='bed'||n.type==='green'))n.fertile=true;
    }
  }
  S.food+=c.food+bonus;S.seeds+=c.seedback;t.plant=null;S.stats.harvests++;S.lv.harvests++;
  {const xy=tileXY(t);if(xy)popAt(xy.x,xy.y,`+${c.food+bonus} 🍲`,0,'good');}
  SFX.harvest();
  if(!S.goals.harvest){S.goals.harvest=true;log(`First harvest! ${c.name} for the table. 🧺`);}
  say(`Harvested ${c.name}: +${c.food+bonus} food${bonus&&!sisters?' (rich soil!)':''}${sisters}, +${c.seedback} seeds.${c.name==='Beans'?' The beans fed the soil around them. 🌱':''}`);
  return true;
}
function spend(e){ if(S.energy<e){say('Too tired — end the day to rest. 🌙');return false;} S.energy-=e; return true;}

function doAction(id){
  if(id==='fillbag'){
    if(S.dirt<1){say('No loose dirt — dig a swale to get some.');return;}
    if(S.water<2){say('Not enough water to fill a bag (need 2L).');return;}
    if(!spend(1))return;
    S.dirt--;S.water-=2;S.bags++;S.stats.bagsFilled++;
    say(`Filled an earthbag! 🧱 You now have ${S.bags} bag${S.bags===1?'':'s'} (${S.dirt} dirt left).`); refresh();
  }
  if(id==='haul'){
    if(!spend(2))return;
    S.water=Math.min(S.waterCap,S.water+8);
    say('Hauled 8L back from the well in town. 🚰'); refresh();
  }
}

function clickTile(x,y){
  const t=tileAt(x,y); if(!t)return;
  let tool=S.tool;
  // ripe plants harvest on a plain click, whatever tool is up (even Inspect) — the 🧺 tag marks them
  if(t.plant&&t.plant.grown>=CROPS[t.plant.crop].days&&tool!=='clear'){
    if(doHarvest(t))refresh();
    return;
  }
  // the map decides: gatherables gather (even with Inspect up), unfinished homes keep building — no tool switching
  if(tool!=='clear'&&t.deco!=='snake'&&(t.type==='rock'||t.deco==='drift'||(t.deco&&TREE_SPECIES.includes(t.deco))))tool='gather';
  if(tool==='inspect'){say(describe(t,x,y));return;}
  if(t.type==='home'&&t.homeStage>0&&t.homeStage<3&&tool!=='clear')tool='home';
  // rattler squatting? shooing it is the only move here — 1 energy
  if(t.deco==='snake'&&tool!=='inspect'){
    if(!spend(1))return;
    t.deco=null;
    SFX.rattle();
    popAt(x,y,'🐍 shooed!',0,'earth');
    say('Rattler waved off with a long stick — respectfully. The tile is yours now. (1⚡)');
    refresh();
    return;
  }
  if(t.type==='wash'&&!['bda','clear','inspect','gather'].includes(tool)){
    say(tool==='ord'
      ?'The big wash is too strong for loose rock — 🪨 dams belong in the small creeks or on the open slope. Here you need a 🪵 BDA.'
      :'Storm water rips through the wash — only a 🪵 dam (BDA) holds here. (Rock dams work in the small creeks.)');
    return;
  }
  if((t.type==='hardpan'||t.type==='eroded')&&tool!=='inspect'){
    say(t.type==='hardpan'
      ?'Caliche hardpan — cemented like concrete. Nothing digs this ground. Farm the land you build.'
      :'A raw erosion scar. The flood took this ground for good.');
    return;
  }
  if(t.type==='creek'&&!['ord','clear','inspect','gather'].includes(tool)){
    say(tool==='bda'
      ?'This little creek is rock-dam country — small flows want small structures. 🪨 BDAs need the big wash.'
      :'A creek runs through here when it storms — a 🪨 rock dam is what this spot wants.');
    return;
  }
  if(t.plant&&t.plant.grown>=CROPS[t.plant.crop].days&&tool!=='harvest'&&tool!=='inspect'){
    say('That one is ripe! Right-click it to harvest (any tool selected).');return;
  }

  if(tool==='swale'){
    const upT=tileAt(x,y-1);
    if(t.type==='sand'&&upT&&upT.type==='swale'&&!nearWash(x,y)){ // finishing the pair
      buildBerm(x,y);return;
    }
    if(t.type!=='sand'){say('Swales go on open sand.');return;}
    if(nearWash(x,y)){say('Too close to the wash — the bank is the river´s ground. Dam the wash well and this tile GREENS on its own; leave the floods wild and it may tear out. (Beds are allowed here.)');return;}
    if(!spend(1))return;
    t.type='swale';t.deco=null;S.dirt+=2;
    if(!S.goals.swale){S.goals.swale=true;log('First swale dug! Rain will pool here. ⛏');}
    popAt(x,y,'+2 dirt',0,'earth');SFX.dig();
    say(`Swale dug — +2 dirt for your pile (now ${S.dirt}).`);
  }
  else if(tool==='berm'){
    buildBerm(x,y);
  }
  else if(tool==='gather'){
    if(t.type==='rock'){
      if(!spend(1))return;
      S.stone+=2;S.lv.stone+=2;
      t.type='sand';t.deco=null;
      popAt(x,y,'+2 🪨',0,'earth');SFX.gather();
      say(`Broke the boulder into 2 stone (now ${S.stone}). That one's spent. 🪨`);
    }
    else if(t.deco==='drift'){
      if(!spend(1))return;
      S.wood+=2;S.lv.wood+=2;t.deco=null;
      popAt(x,y,'+2 🪵',0,'earth');SFX.gather();
      say(`Easy pickings — 2 driftwood hauled off (wood: ${S.wood}). 🪵`);
    }
    else if(t.deco&&TREE_SPECIES.includes(t.deco)){
      if(!spend(2)){say('Felling a tree takes 2⚡ — too tired. (Driftwood only takes 1.)');return;}
      S.wood+=2;S.lv.wood+=2;
      t.deco=null;
      popAt(x,y,'+2 🪵',0,'earth');SFX.gather();
      say(`Felled it for 2 wood (now ${S.wood}). It won't be back this level — spend it well. 🪵`);
    }
    else if(t.deco==='saguaro'){say('You don\'t cut a saguaro. Ever. 🌵');}
    else say('Gather from boulders (stone), trees (wood, 2⚡), or driftwood (1⚡).');
  }
  else if(tool==='ord'){
    if(t.type!=='creek'){say('Rock dams only work in the small creeks — gentle flow, one stone high. The wash would blow them out, and open ground has nothing to slow.');return;}
    if(S.stone<2){say('Need 2 stone — 🪓 gather some from a boulder.');return;}
    const wasCreek=t.type==='creek';
    if(!spend(1))return;
    S.stone-=2;
    SFX.build();t.type='ord';t.deco=null;t.inCreek=wasCreek;S.stats.ordsBuilt++;S.lv.ords++;if(wasCreek)S.lv.creekOrds++;
    say('One rock high, laid where the water slows itself. "Let the water do the work." — it cannot fail, only slowly win.');
  }
  else if(tool==='bda'){
    if(t.type!=='wash'){say('Beaver-dam analogs go in the wash — the dry creek bed.');return;}
    if(t.dam){say('There is already a dam here.');return;}
    if(S.wood<3){say('A BDA takes 3 wood for posts and weave — 🪓 cut trees or grab driftwood.');return;}
    if(S.dirt<1){say('Need 1 dirt to pack the weave.');return;}
    if(!spend(1))return;
    S.wood-=3;S.dirt-=1;t.dam=true;SFX.build();
    if(!S.goals.bda){S.goals.bda=true;log('First beaver-dam analog built — next storm, the wash will pond behind it. 🦫');}
    say('Dam built across the wash. Now let it rain.');
  }
  else if(tool==='bed'){
    if(t.type!=='sand'&&t.type!=='grass'){say('Till beds on open sand or grass.');return;}
    if(!spend(1))return;
    const wasGrass=t.type==='grass';
    SFX.dig();t.type='bed';t.deco=null;t.moisture=wasGrass?3:0;t.fertile=wasGrass||t.fertile;
    say(wasGrass?'Tilled into rich silt soil — crops here will yield extra. 🌱':'Bed tilled and ready for seeds.');
  }
  else if(tool.startsWith('plant-')){
    const crop=tool.slice(6);
    if(t.type!=='bed'&&t.type!=='green'){say('Plant in a tilled bed or greenhouse.');return;}
    if(t.plant){say('Something is already growing there.');return;}
    if(S.seeds<1){say('Out of seeds — harvests give them back.');return;}
    if(!spend(1))return;
    S.seeds--; t.plant={crop,stage:0,grown:0,wilt:0};SFX.plant();
    say(`${CROPS[crop].name} planted. 🌱`);
  }
  else if(tool==='water'){
    if(t.type!=='bed'&&t.type!=='green'){say('Water goes on beds and greenhouses.');return;}
    if(S.water<3){say('Water barrel is low — haul some or wait for rain.');return;}
    if(!spend(1))return;
    S.water-=3;t.moisture=Math.min(6,t.moisture+2);S.stats.watered++;S.lv.watered++;SFX.water();
    if(t.plant)t.plant.wilt=0;
    say('A good soak. 💧');
  }
  else if(tool==='harvest'){
    if(!doHarvest(t))return;
  }
  else if(tool==='cistern'){
    if(t.type!=='sand'){say('Cisterns go on open sand.');return;}
    if(S.bags<4){say('Need 4 earthbags for a cistern.');return;}
    if(!spend(1))return;
    S.bags-=4;t.type='cistern';t.deco=null;S.waterCap+=100;SFX.build();
    if(!S.goals.cistern){S.goals.cistern=true;log('Cistern built — 100L more storage, and it drinks the rain. 🛢');}
    say('Cistern built! Water cap +100L.');
  }
  else if(tool==='green'){
    if(t.type!=='sand'&&t.type!=='bed'){say('Greenhouses go on sand or an empty bed.');return;}
    if(t.plant){say('Harvest that plant first.');return;}
    if(S.bags<6){say('Need 6 earthbags for a greenhouse.');return;}
    if(!spend(1))return;
    S.bags-=6;t.type='green';t.deco=null;t.moisture=Math.max(2,t.moisture);SFX.build();
    if(!S.goals.green){S.goals.green=true;log('Greenhouse up! Cool, shaded, and barely thirsty. 🌡');}
    say('Greenhouse built — plant right inside it.');
  }
  else if(tool==='home'){
    const stages=[{need:4,name:'foundation'},{need:8,name:'walls'},{need:6,name:'roof'}];
    if(t.type!=='sand'&&t.type!=='home'){say('Pick an open sand tile for your home site.');return;}
    if(t.type==='sand'&&countAll(q=>q.type==='home')>0){say('You already have a home site — keep building that one.');return;}
    const st=t.type==='home'?t.homeStage:0;
    if(st>=3){say('Your home is finished. It’s lovely. 🏠');return;}
    const s=stages[st];
    if(S.bags<s.need){say(`The ${s.name} needs ${s.need} earthbags (you have ${S.bags}).`);return;}
    if(!spend(1))return;
    S.bags-=s.need;t.type='home';t.deco=null;t.homeStage=st+1;SFX.build();
    if(t.homeStage===1)log('Foundation laid — tamped earth, solid as the mesa. 🧱');
    if(t.homeStage===2)log('Earthbag walls are up, curving like a nautilus. 🧱🧱');
    if(t.homeStage===3){
      S.goals.home=true;log('Roof on! Your earthbag home is DONE. 🏠🎉');
      document.getElementById('wintext').textContent=
        `Day ${S.day}: foundation, walls, roof — an earthbag home raised from the desert itself, with ${S.food} food in the pantry.`;
      document.getElementById('win').classList.remove('hidden');S.won=true;
    }
    say(t.homeStage<3?`${s.name.charAt(0).toUpperCase()+s.name.slice(1)} complete! Click again for the next stage.`:'Home complete!');
  }
  else if(tool==='clear'){
    if(t.type==='wash'){
      if(t.dam){if(!spend(1))return;t.dam=false;t.stored=0;S.dirt++;say('Dam pulled out — the wash runs free again.');refresh();return;}
      say('The wash was here long before you. It stays.');return;
    }
    if(!['swale','berm','bed','ord','grass'].includes(t.type)){say('Clear works on swales, berms, beds, rock dams, and dams.');return;}
    if(t.plant){say('Harvest or wait — there’s a plant in there.');return;}
    if(!spend(1))return;
    if(t.type==='berm')S.dirt++;
    t.type='sand';t.stored=0;t.moisture=0;t.soil=0;t.fertile=false;
    say('Back to open sand.');
  }
  refresh();
}

let lastTool=null;
function doTool(id,x,y){
  const prev=S.tool; S.tool=id; clickTile(x,y); S.tool=prev;
  if(['swale','bed','ord','berm','water'].includes(id)||id.startsWith('plant-'))lastTool=id;
}
function hideCtx(){const c=document.getElementById('ctx');if(c)c.remove();}
function ctxChoices(t,x,y){
  const ch=[];
  const add=(id,label,cost)=>{ch.push({id,label,cost:cost||''});};
  if(t.type==='sand'&&!t.deco){
    const up=tileAt(x,y-1);
    if(isUnlocked('berm')&&up&&up.type==='swale'&&!nearWash(x,y))add('berm','🧱 Berm','banks the swale');
    if(isUnlocked('swale')&&!nearWash(x,y))add('swale','⛏ Swale','+2 dirt · 1⚡');
    if(isUnlocked('bed'))add('bed','🟫 Garden bed','1⚡');
    if(isUnlocked('cistern'))add('cistern','🛢 Cistern','4 bags');
    if(isUnlocked('green'))add('green','🌡 Greenhouse','6 bags');
    if(isUnlocked('home')&&countAll(q=>q.type==='home')===0)add('home','🏠 Home site','4/8/6 bags');
  }
  else if(t.type==='grass'){
    if(isUnlocked('bed'))add('bed','🟫 Till rich bed','1⚡');
    if(isUnlocked('clear'))add('clear','🧹 Clear','1⚡');
  }
  else if((t.type==='bed'||t.type==='green')&&!t.plant){
    for(const id of FARM_TOOLS){
      if(!isUnlocked(id))continue;
      const c=CROPS[id.slice(6)];
      add(id,`🌱 ${c.name}`,`1 seed · ${c.days}d`);
    }
    if(isUnlocked('water'))add('water','💧 Water','3L · 1⚡');
    if(t.type==='bed'&&isUnlocked('clear'))add('clear','🧹 Clear','1⚡');
  }
  else if(['swale','berm','ord'].includes(t.type)){
    if(isUnlocked('clear'))add('clear','🧹 Clear','1⚡'+(t.type==='berm'?' · +1 dirt':''));
  }
  else if(t.type==='wash'&&t.dam){
    if(isUnlocked('clear'))add('clear','🧹 Pull the dam','1⚡ · +1 dirt');
  }
  return ch;
}
function showCtx(t,x,y,cx,cy){
  hideCtx();
  const ch=ctxChoices(t,x,y);
  if(!ch.length){say(describe(t,x,y));return;}
  if(ch.length===1&&!['clear'].includes(ch[0].id)){doTool(ch[0].id,x,y);return;} // one obvious constructive move: just do it
  const box=document.createElement('div');box.id='ctx';
  const cap=document.createElement('div');cap.className='ctxcap';cap.textContent='This tile:';box.appendChild(cap);
  for(const o of ch){
    const b=document.createElement('button');
    b.innerHTML=`<span>${o.label}</span><span class="cost">${o.cost}</span>`;
    b.addEventListener('pointerdown',e=>e.stopPropagation());
    b.addEventListener('click',e=>{e.stopPropagation();hideCtx();doTool(o.id,x,y);});
    box.appendChild(b);
  }
  view.appendChild(box);
  const vr=view.getBoundingClientRect();
  let px=cx-vr.left+10, py=cy-vr.top-10;
  px=Math.min(px,vr.width-box.offsetWidth-8); py=Math.max(6,Math.min(py,vr.height-box.offsetHeight-8));
  box.style.left=px+'px'; box.style.top=py+'px';
}
function smartClick(x,y,cx,cy){
  const t=tileAt(x,y); if(!t)return;
  // instant, unambiguous moves first — the map decides
  if(t.deco==='snake'){doTool('bed',x,y);return;} // any work-click shoos the rattler
  if(t.type==='rock'||t.deco==='drift'||(t.deco&&TREE_SPECIES.includes(t.deco))){doTool('gather',x,y);return;}
  if(t.plant&&t.plant.grown>=CROPS[t.plant.crop].days){doTool('harvest',x,y);return;}
  if(t.plant){ if(t.moisture>=5&&t.type!=='green'){say(describe(t,x,y));} else doTool('water',x,y); return; } // click a growing crop = give it a drink
  if(t.type==='home'&&t.homeStage>0){doTool('home',x,y);return;}
  if(t.type==='creek'){ if(isUnlocked('ord'))doTool('ord',x,y); else say(describe(t,x,y)); return; }
  if(t.type==='wash'&&!t.dam){ if(isUnlocked('bda'))doTool('bda',x,y); else say(describe(t,x,y)); return; }
  if(t.type==='hardpan'||t.type==='eroded'||t.type==='cistern'){say(describe(t,x,y));return;}
  showCtx(t,x,y,cx,cy);
}
window.smartClick=smartClick;
function describe(t,x,y){
  const m=`moisture ${t.moisture}/6`;
  switch(t.type){
    case 'sand':{
      const F={saguaro:'An old saguaro — here long before you, here long after. 🌵',
        paloverde:'A palo verde, green-barked and glowing. A nurse tree for baby cacti.',
        pricklypear:'A prickly pear clump. The fruit makes good jam.',
        ocotillo:'An ocotillo — dead-looking canes that leaf out within days of rain.',
        agave:'An agave rosette, patient as stone. Decades to bloom.',
        mesquite:'A mesquite — deep roots, sweet pods. 🪓 Felling it gives 2 wood (2⚡), forever.',
        snake:'A western diamondback, coiled and unamused. Shoo it with a click (1⚡) before you can work this ground. 🐍',
        cottonwood:'A cottonwood — the desert´s water-finder, it only grows where the water table is shallow. 🪓 2 wood (2⚡).',
        juniper:'A shaggy juniper — 🪓 fell it for 2 wood (2⚡). It won´t regrow.',
        pinyon:'A pinyon pine — juniper´s upland companion. Pine nuts in a good year.'};
      return t.deco&&F[t.deco]?F[t.deco]:'Open sand — dig, till, or build here.';
    }
    case 'rock':return 'A boulder — 🪓 breaks into 2 stone (1⚡), then it\'s gone. Stone is finite here.';
    case 'swale':return `Swale holding ${t.stored}/${swaleCap(x,y)}L of runoff. Waters its side and downhill neighbors — plus same-level ground on flat terraces.`;
    case 'berm':return 'A berm — banks up the downhill side of a swale so it holds more.';
    case 'wash':return t.deco==='drift'?'Driftwood snagged in the wash — 🪓 an easy 2 wood (1⚡).':t.dam?`Beaver-dam analog holding ${t.stored}/${BDA_CAP}L (${t.wetDays} wet days — ${RESTO_STAGES[t.resto]}${t.resto<4?', next: '+RESTO_STAGES[t.resto+1]:''}).`:'A dry desert wash. Storm water races through — a 🪵 dam would slow it down.';
    case 'ord':return `A one-rock dam${t.stored>0?`, holding a ${t.stored}L puddle`:''}. Silt trapped: ${t.soil}/4 — when it fills, grass takes over.`;
    case 'creek':return t.deco==='drift'?'Driftwood snagged in the creek — 🪓 an easy 2 wood (1⚡).':'A small side creek that runs in storms and feeds the wash. Gentle enough for a 🪨 rock dam.';
    case 'grass':return 'Silt-built grassland — a dam let the water do the work, and the work became land. Till it for a rich, fertile bed.';
    case 'hardpan':return 'Caliche hardpan — desert concrete. Nothing digs it. The only farmland here is the land you build.';
    case 'eroded':return 'An erosion scar — the unslowed flood took this ground. It will not come back.';
    case 'bed':return t.plant?`${CROPS[t.plant.crop].name}, day ${t.plant.grown}/${CROPS[t.plant.crop].days} (${m})`:`Empty bed (${m}).`;
    case 'green':return t.plant?`Greenhouse: ${CROPS[t.plant.crop].name}, day ${t.plant.grown}/${CROPS[t.plant.crop].days}`:'Greenhouse — plant something cozy in here.';
    case 'cistern':return 'Your cistern. +100L cap, +20L every rain.';
    case 'home':return ['Home site.','Foundation laid (next: walls, 8 bags).','Walls up (next: roof, 6 bags).','Your finished earthbag home. 🏠'][t.homeStage];
  }
  return '';
}

function endDay(){
  const w=S.weather;
  for(const row of S.grid)for(const t of row){
    if(t.plant){
      const c=CROPS[t.plant.crop];
      const inGreen=t.type==='green';
      if(inGreen)t.moisture=Math.max(2,t.moisture);
      const hydrated=t.moisture>=2||inGreen; // crops need REAL water to grow
      if(t.plant.grown<c.days){
        if(hydrated){
          t.plant.grown++;t.plant.wilt=0;
          if(!inGreen)t.moisture=Math.max(0,t.moisture-(c.drought||t.fertile?1:2)); // growth drinks the bed — rich organic soil holds its water
        } else if(c.drought){
          t.plant.dryTick=(t.plant.dryTick||0)+1; // prickly pear survives dry — but grows half-speed
          if(t.plant.dryTick%2===0)t.plant.grown++;
          t.plant.wilt=0;
        } else {
          t.plant.wilt++;
          if(t.plant.wilt>=2&&t.plant.grown>0){t.plant.grown--;t.plant.wilt=0;}
        }
      }
    }
  }
  for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++){
    const t=S.grid[y][x];
    if((t.type==='swale'||t.type==='ord'||(t.type==='wash'&&t.dam))&&t.stored>0){
      const up=tileAt(x,y-1);
      const targets=t.type==='swale'
        ?[tileAt(x-1,y),tileAt(x+1,y),tileAt(x,y+1),(up&&up.elev===t.elev)?up:null]
        :(t.type==='ord'?[tileAt(x,y+1)]:neighbors(x,y));
      for(const n of targets)if(n&&n.type==='bed'&&n.moisture<6)n.moisture=Math.min(6,n.moisture+1);
      t.stored=Math.max(0,t.stored-((t.type==='wash')?3:1)); // seeps into the banks (ponds free capacity for the next surge)
    }
  }
  // restoration ladder: dams that stay wet bring the wash to life
  for(const p of washPath){
    const t=S.grid[p.y][p.x];
    if(t.dam&&t.stored>0){
      t.wetDays++;
      const stage=RESTO_THRESH.filter(th=>t.wetDays>=th).length;
      if(stage>t.resto){
        if(stage>=2&&t.resto<2){ // willow roots knit the banks — riparian ground greens up
          let greened=0;
          for(const n of neighbors(p.x,p.y))if(n.type==='sand'&&!n.deco){n.type='grass';greened++;}
          if(greened)log(`Willows are knitting the banks — ${greened} bank tile${greened>1?'s':''} greened into grass beside the dam. 🌿`);
        }
        t.resto=stage;
        S.stats.maxResto=Math.max(S.stats.maxResto,stage);
        const msgs=['','Sedges are sprouting around your dam — the posts themselves are taking root! 🌾',
          'Willow thicket! The dam is becoming part of the creek. 🌿',
          'Birdsong over the wash — they found the water. 🐦',
          'A cottonwood seedling on the wet silt bar. One day it will tower here. 🌳'];
        log(msgs[stage]);
      }
    }
  }
  const evap=WEATHERS[w].evap;
  if(evap>0)for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++){
    const t=S.grid[y][x];
    if(t.type==='bed'){
      const shaded=[[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>{
        const n=tileAt(x+dx,y+dy);return n&&n.plant&&n.plant.crop==='squash';});
      t.moisture=Math.max(0,t.moisture-Math.max(0,evap-(shaded?1:0))); // squash mulch shades the soil
    }
    if(t.type==='swale'||(t.type==='wash'&&t.dam))t.stored=Math.max(0,t.stored-(evap>1?1:0));
    if(t.type==='ord')t.stored=Math.max(0,t.stored-(evap>0?1:0)); // puddles dry fast
    if(t.type==='green')t.moisture=Math.max(1,t.moisture);
  }
  S.day++;S.dayLv++;
  S.weather=S.forecast;
  S.forecast=nextForecast();
  if(S.weather==='rain')SFX.rain();else SFX.day();
  {const df=document.getElementById('duskfade');
   df.classList.add('go');
   setTimeout(()=>df.classList.remove('go'),650);}
  S.energy=S.energyMax;
  {const c0=CH(); if(c0)S.timeLeft=c0.timer||40;}

  if(S.weather==='rain'){
    S.lastRainDay=S.day;
    let caught=8;
    const stormGains=[];
    const R={swales:0,dams:0,beds:0,lostWater:0,sedTrapped:0,sedLost:0,rain:0};
    for(let x=0;x<COLS;x++){
      let runoff=0, sed=0;
      for(let y=0;y<ROWS;y++){
        runoff+=2; R.rain+=2; // each tile sheds rain, flowing downhill
        const t=S.grid[y][x];
        if(t.type==='sand'&&!t.deco)sed+=1; // bare ground loses topsoil
        if(t.type==='wash'||t.type==='creek'){runoff=0;sed=0;} // sheet flow drains into the channels
        if(t.type==='ord'&&t.inCreek){runoff=0;sed=0;}
        else if(t.type==='ord'){
          t.stored=Math.min(4,t.stored+3); // a puddle banks up behind the rocks
          const take=Math.min(2,sed);
          t.soil+=take;sed-=take;R.sedTrapped+=take;S.stats.sedTrapped+=take;S.lv.sed+=take;
          const below=tileAt(x,y+1);
          if(below&&below.type==='bed')below.moisture=Math.min(6,below.moisture+1); // slowed water sinks in
          if(t.soil>=4){t.type='grass';S.stats.grassGrown++;S.lv.grass++;
            log('Grass is growing up through your rock dam — it did its work and became land. 🌱');}
        }
        if(t.type==='swale'){
          const take=Math.max(0,Math.min(swaleCap(x,y)-t.stored,runoff));
          t.stored+=take;runoff-=take;R.swales+=take;
          if(take>0)stormGains.push({x,y,amt:take});
          const sTake=Math.min(2,sed);
          t.soil+=sTake;sed-=sTake;R.sedTrapped+=sTake;S.stats.sedTrapped+=sTake;S.lv.sed+=sTake;
        }
        if(t.type==='cistern')caught+=20;
        if(t.type==='bed'){t.moisture=Math.min(6,t.moisture+3);R.beds+=3;}
      }
      R.lostWater+=runoff; R.sedLost+=sed;
    }
    // small pulses down each creek — rock dams slow and sink them
    let washExtra=0;
    for(const path of creekPaths){
      let cflow=8, csed=3;
      R.rain+=8+path.length;
      for(const pc of path){
        cflow+=1;
        const t=S.grid[pc.y][pc.x];
        if(t.type==='ord'){
          t.stored=Math.min(4,t.stored+3);
          cflow=Math.max(0,cflow-3); // slowed, spread, sunk
          const sTake=Math.min(2,csed);
          t.soil+=sTake;csed-=sTake;R.sedTrapped+=sTake;S.stats.sedTrapped+=sTake;S.lv.sed+=sTake;
          if(t.soil>=6){t.type='grass';t.inCreek=false;S.stats.grassGrown++;S.lv.grass++;
            log('A creek check dam silted full and became a grassy step. 🌱');}
        }
      }
      washExtra+=Math.floor(cflow/2);
      R.lostWater+=cflow-Math.floor(cflow/2);
      R.sedLost+=csed;
    }
    // storms flush a rattler out of the rocks now and then
    {
      const c9=CH();
      if(c9&&c9.terrain.snakes&&Math.random()<0.5){
        let placed9=0,g9=0;
        const nSnakes=countAll(t9=>t9.deco==='snake');
        while(!placed9&&g9++<80&&nSnakes<3){
          const x9=Math.floor(Math.random()*COLS), y9=Math.floor(Math.random()*ROWS);
          const t9=S.grid[y9][x9];
          if(t9.type==='sand'&&!t9.deco){t9.deco='snake';placed9=1;
            log('The storm flushed a rattlesnake out of the rocks — it has coiled up on your land. 🐍');}
        }
      }
    }
    // the flood snags fresh driftwood in the channels
    {
      let dropped=0, gd=0;
      const want=2+Math.floor(Math.random()*2);
      while(dropped<want&&gd++<200){
        const pool=washPath.concat(...creekPaths);
        const p2=pool[Math.floor(Math.random()*pool.length)];
        const t=S.grid[p2.y][p2.x];
        if((t.type==='wash'||t.type==='creek')&&!t.deco&&!t.dam){t.deco='drift';dropped++;}
      }
      if(dropped>0)log(`The flood left ${dropped} snag${dropped>1?'s':''} of driftwood in the channels. 🪵`);
    }
    // storm pulse down the wash
    let flow=26+washExtra, sedFlow=5, ponded=false;
    R.rain+=26;
    for(const p of washPath){
      flow+=2; R.rain+=2;
      const t=S.grid[p.y][p.x];
      if(t.dam){
        const take=Math.max(0,Math.min(BDA_CAP-t.stored,flow));
        t.stored+=take;flow-=take;R.dams+=take;
        const sTake=Math.min(2,sedFlow);
        t.soil+=sTake;sedFlow-=sTake;R.sedTrapped+=sTake;S.stats.sedTrapped+=sTake;S.lv.sed+=sTake;
        if(t.stored>0){ponded=true;
          for(const n of neighbors(p.x,p.y))if(n.type==='bed'){
            if(n.moisture<6){S.stats.floodedBeds++;S.lv.flooded++;}
            n.moisture=6; // flooded banks
          }
        }
      }
    }
    R.lostWater+=flow; R.sedLost+=sedFlow;
    S.lv.rains++;
    const chE=CH();
    if(chE&&chE.flags&&chE.flags.erosion){
      if(flow>2*washPath.length+32){
        const cands=[];
        for(const pw of washPath)for(const [ex,ey] of [[1,0],[-1,0],[0,1],[0,-1]]){
          const t2=tileAt(pw.x+ex,pw.y+ey);
          if(t2&&['sand','bed','swale','berm','grass','ord','creek'].includes(t2.type))cands.push(t2);
        }
        if(cands.length){
          const v=cands[Math.floor(Math.random()*cands.length)];
          v.type='eroded';v.plant=null;v.deco=null;v.stored=0;v.dam=false;v.soil=0;
          S.lv.eroded++;S.lv.cleanStreak=0;
          log('⚠ The flood left too fast and tore out a bank tile! Absorb more of the surge — dams along the wash, rock dams in the creeks.');
        }
      } else {
        S.lv.cleanStreak++;
        log(`The wash ran slow and easy — no erosion (streak ${S.lv.cleanStreak}).`);
      }
    }
    R.tanks=Math.min(S.waterCap-S.water,caught);
    R.bank=R.swales+R.dams+R.tanks;
    S.lv.bank=Math.max(S.lv.bank,R.bank);
    S.lastReport=R;
    pendingGains=stormGains;
    const rb=document.getElementById('repbody');
    const _tot=Math.max(1,R.bank+R.beds+R.lostWater);
    const _seg=(v,c2)=>v>0?`<span style="display:inline-block;height:16px;background:${c2};width:${Math.max(2,Math.round(100*v/_tot))}%;"></span>`:'';
    rb.innerHTML=''; // report modal retired — the storm speaks through the toast + popups
    showStormToast(
      `<b class="t">🌧 Monsoon — ${R.rain}L fell.</b><br>`+
      `<div style="display:flex;border-radius:5px;overflow:hidden;margin:6px 0 3px;border:1px solid #d5c9a8;">${_seg(R.bank,'#4d8f56')}${_seg(R.beds,'#65b0a8')}${_seg(R.lostWater,'#c14a2a')}</div>`+
      `<b style="color:#4d8f56">■</b> banked ${R.bank}L &nbsp;<b style="color:#65b0a8">■</b> beds ${R.beds}L &nbsp;<b style="color:#c14a2a">■</b> lost ${R.lostWater}L`+
      `<br>🟤 soil trapped <b>${R.sedTrapped}</b> · <b style="color:#a04a2a">washed away ${R.sedLost}</b>`,8000);
    // yield popups fire immediately — no modal to click through
    pendingGains.forEach((gn,i)=>popAt(gn.x,gn.y,'+'+gn.amt+'L 💧',350+i*160));
    pendingGains=[];
    if(washPath.length&&R.lostWater>0){
      const we=washPath[washPath.length-1];
      popAt(we.x,we.y,`−${R.lostWater}L 🌊`,900,'bad');
      if(R.sedLost>0)popAt(we.x,we.y,`−${R.sedLost} soil`,1500,'bad');
    }
    if(ponded&&!S.flags.pondSeen){S.flags.pondSeen=true;
      log('Your dams ponded the storm — the wash is holding water and the banks are soaked. 🦫');}
    S.water=Math.min(S.waterCap,S.water+caught);
    if(countAll(t=>t.type==='swale'&&t.stored>0))S.lv.rainCaught=true;
    if(!S.goals.rain&&countAll(t=>t.type==='swale'&&t.stored>0)){S.goals.rain=true;log('The monsoon came and your swales are FULL. This is the whole trick. 🌧️');}
    log(`Day ${S.day}: monsoon rain! +${caught}L caught, swales brimming.`);
    startRain();
  } else {
    log(`Day ${S.day}: ${WEATHERS[S.weather].label.slice(2).trim().toLowerCase()}.`);
  }
  if(S.weather==='scorcher')say('A scorcher today — outdoor plants will be thirsty. 🔥');
  else say('A new day on the homestead.');
  // losing conditions: the season can beat you, and the land resets for another try
  {
    const lr=lossReason();
    if(lr&&!S.lv.lostShown){
      S.lv.lostShown=true;
      SFX.lose();
      document.getElementById('lostbody').innerHTML=lr+'<br><br>Same storm schedule, fresh land — and you know the plan now.';
      document.getElementById('lost').classList.remove('hidden');
      log('💔 Level lost. '+lr.replace(/<[^>]*>/g,''));
    }
  }
  applyWeatherLook();
  refresh();
}

/* ================= 3D RENDERING ================= */
const view=document.getElementById('view');
let VW=Math.max(300,view.clientWidth||900), VH=Math.max(260,view.clientHeight||560);
const renderer=new THREE.WebGLRenderer({antialias:true});
renderer.setSize(VW,VH);
renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
view.insertBefore(renderer.domElement, view.firstChild);

const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(46,VW/VH,0.1,120);

const hemi=new THREE.HemisphereLight(0xfff5dd,0x9a7b5a,0.55);
scene.add(hemi);
const sun=new THREE.DirectionalLight(0xffedc8,0.95);
sun.position.set(9,15,6);
sun.castShadow=true;
sun.shadow.mapSize.set(2048,2048);
sun.shadow.camera.left=-14;sun.shadow.camera.right=14;
sun.shadow.camera.top=16;sun.shadow.camera.bottom=-14;
sun.shadow.camera.far=40;
scene.add(sun);

// apron (desert beyond the plot)
const apron=new THREE.Mesh(new THREE.CylinderGeometry(26,26,0.2,48),
  new THREE.MeshLambertMaterial({color:0xd3b87c}));
apron.position.y=-0.02;apron.receiveShadow=true;
scene.add(apron);

/* --- shared geometry & materials --- */
const G={
  base:new THREE.BoxGeometry(0.98,5,0.98),
  swaleBase:new THREE.BoxGeometry(0.98,5,0.98),
  bedTop:new THREE.BoxGeometry(0.88,0.08,0.88),
  water:new THREE.CylinderGeometry(0.34,0.34,0.03,20),
  mound:new THREE.SphereGeometry(0.42,16,12),
  bermArc:new THREE.TorusGeometry(0.4,0.1,9,20,Math.PI),
  bermSkirt:new THREE.TorusGeometry(0.44,0.06,8,20,Math.PI),
  bermFill:new THREE.CircleGeometry(0.34,18,0,Math.PI),
  bermPool:new THREE.CircleGeometry(0.3,18,0,Math.PI),
  swBasin:new THREE.CircleGeometry(0.36,20),
  swRim:new THREE.TorusGeometry(0.36,0.055,8,20),
  swSq:new THREE.PlaneGeometry(0.6,0.6),
  swWaterSq:new THREE.PlaneGeometry(0.55,0.55),
  bermDome:new THREE.CircleGeometry(0.3,20,0,Math.PI),
  bermDomeWater:new THREE.CircleGeometry(0.27,20,0,Math.PI),
  bermMound:new THREE.CylinderGeometry(0.5,0.7,1,4),
  rock:new THREE.DodecahedronGeometry(0.26),
  trunk:new THREE.CylinderGeometry(0.09,0.1,0.55,10),
  arm:new THREE.CylinderGeometry(0.055,0.06,0.3,8),
  sprout:new THREE.ConeGeometry(0.07,0.16,7),
  young:new THREE.ConeGeometry(0.14,0.32,8),
  blob:new THREE.SphereGeometry(0.1,10,8),
  squash:new THREE.SphereGeometry(0.17,12,10),
  stem:new THREE.CylinderGeometry(0.02,0.03,0.1,6),
  pad:new THREE.SphereGeometry(0.12,10,8),
  fruit:new THREE.SphereGeometry(0.045,8,6),
  star:new THREE.OctahedronGeometry(0.08),
  cistern:new THREE.CylinderGeometry(0.32,0.34,0.6,16),
  lid:new THREE.CylinderGeometry(0.34,0.34,0.06,16),
  ghBox:new THREE.BoxGeometry(0.9,0.46,0.9),
  ghRoof:new THREE.ConeGeometry(0.64,0.3,4),
  slab:new THREE.BoxGeometry(0.85,0.12,0.85),
  ring:new THREE.TorusGeometry(0.3,0.075,8,18),
  roof:new THREE.ConeGeometry(0.58,0.46,14),
  door:new THREE.BoxGeometry(0.16,0.26,0.06),
  post:new THREE.CylinderGeometry(0.035,0.05,0.36,6),
  tuft:new THREE.ConeGeometry(0.05,0.2,5),
  shrub:new THREE.SphereGeometry(0.15,8,6),
  trunkT:new THREE.CylinderGeometry(0.06,0.09,1.0,8),
  canopyT:new THREE.SphereGeometry(0.38,10,8),
  bird:new THREE.TetrahedronGeometry(0.06),
  stoneRow:new THREE.DodecahedronGeometry(0.09),
  ocoSeg1:new THREE.CylinderGeometry(0.014,0.022,0.45,5),
  ocoSeg2:new THREE.CylinderGeometry(0.009,0.014,0.4,5),
  junTrunk:new THREE.CylinderGeometry(0.04,0.065,0.5,6),
  logG:new THREE.CylinderGeometry(0.016,0.05,0.72,6),
  stubG:new THREE.CylinderGeometry(0.008,0.02,0.24,5),
  seam:new THREE.BoxGeometry(0.72,0.03,0.06),
  sagT:new THREE.CylinderGeometry(0.09,0.11,0.85,8),
  sagA:new THREE.CylinderGeometry(0.05,0.06,0.34,7),
  junB:new THREE.SphereGeometry(0.19,7,6),
  junBody:new THREE.LatheGeometry([[0.03,0],[0.17,0.02],[0.25,0.10],[0.28,0.20],[0.26,0.32],[0.20,0.44],[0.12,0.54],[0.04,0.61],[0,0.64]].map(p=>new THREE.Vector2(p[0],p[1])),9),
  trkS:new THREE.CylinderGeometry(0.05,0.07,0.3,6),
  pinC:new THREE.ConeGeometry(0.26,0.55,8),
  ocoC:new THREE.CylinderGeometry(0.013,0.022,0.62,5),
  tipS:new THREE.SphereGeometry(0.028,5,4),
  agL:new THREE.ConeGeometry(0.055,0.34,5),
  cornStalk:new THREE.CylinderGeometry(0.022,0.034,0.62,6),
  pvB0:new THREE.CylinderGeometry(0.028,0.042,1,5),
  pvB1:new THREE.CylinderGeometry(0.016,0.026,1,5),
  pvB2:new THREE.CylinderGeometry(0.008,0.014,1,4),
  pvB3:new THREE.CylinderGeometry(0.005,0.009,1,4),
  cwCrown:new THREE.IcosahedronGeometry(0.5,0),
  snakeC1:new THREE.TorusGeometry(0.13,0.038,6,10),
  snakeC2:new THREE.TorusGeometry(0.08,0.032,6,9),
  snakeHead:new THREE.ConeGeometry(0.04,0.11,6),
  rattle:new THREE.CylinderGeometry(0.016,0.026,0.07,5),
  cornBlade:new THREE.ConeGeometry(0.05,0.3,4),
  cob:new THREE.CylinderGeometry(0.03,0.038,0.14,6),
  canB:new THREE.SphereGeometry(0.28,8,6),
  bar:new THREE.BoxGeometry(0.72,0.06,0.09),
  pebble:new THREE.DodecahedronGeometry(0.07),
  hover:new THREE.PlaneGeometry(0.98,0.98),
  otile:new THREE.PlaneGeometry(0.94,0.94),
  arrow:new THREE.ConeGeometry(0.09,0.24,6),
};
G.bermCrest=(()=>{
  const s=new THREE.Shape();
  s.moveTo(-0.5,-0.5);
  s.lineTo(-0.3,-0.5);
  s.absarc(0,-0.5,0.3,Math.PI,0,true);
  s.lineTo(0.5,-0.5);
  s.lineTo(0.5,0.15);
  s.lineTo(-0.5,0.15);
  s.closePath();
  return new THREE.ExtrudeGeometry(s,{depth:1,bevelEnabled:false});
})();
G.bermRamp=(()=>{
  const A=[-0.5,0,0.15],B=[-0.5,1,0.15],C=[-0.5,0,0.5];
  const a=[ 0.5,0,0.15],b=[ 0.5,1,0.15],c=[ 0.5,0,0.5];
  const T=[A,C,B,  a,b,c,  B,c,b,  B,C,c,  A,c,C,  A,a,c,  A,b,a,  A,B,b];
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(T.flat()),3));
  geo.computeVertexNormals();
  return geo;
})();
G.bermWedge=(()=>{
  const P={A:[-0.5,0,-0.5],B:[-0.5,1,-0.5],C:[-0.5,1,0.12],D:[-0.5,0,0.5],
           a:[ 0.5,0,-0.5],b:[ 0.5,1,-0.5],c:[ 0.5,1,0.12],d:[ 0.5,0,0.5]};
  const T=[ // triangles (outward winding)
    P.A,P.B,P.C,  P.A,P.C,P.D,        // left wall
    P.a,P.c,P.b,  P.a,P.d,P.c,        // right wall
    P.B,P.b,P.c,  P.B,P.c,P.C,        // crest top
    P.C,P.c,P.d,  P.C,P.d,P.D,        // downhill ramp
    P.A,P.a,P.b,  P.A,P.b,P.B,        // uphill face (against the swale)
  ];
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(T.flat()),3));
  geo.computeVertexNormals();
  return geo;
})();
const lam=(c,o)=>new THREE.MeshLambertMaterial(Object.assign({color:c},o||{}));
const M={
  sand:[lam(0xdfc68b),lam(0xd9bf81),lam(0xd2b776)],
  swale:lam(0xb89e6b),
  swaleDeep:lam(0x9c7f55),
  water:new THREE.MeshPhongMaterial({color:0x4f9dd0,transparent:true,opacity:0.82,shininess:90,specular:0x9fd4f0}),
  berm:lam(0xb8965b),
  bermTop:lam(0xaa8850),
  bermRampM:lam(0xc2a065,{side:THREE.DoubleSide}),
  bedTop:[0xcbb083,0xb9976b,0xa8845c,0x97744f,0x8a6845,0x7d5d3d,0x715440].map(c=>lam(c)),
  rock:lam(0x9b968c),
  cactus:lam(0x5f8a52),
  sprout:lam(0x8fbf6a),
  green:lam(0x5f8f4e),
  wilt:lam(0x8f8a5a),
  beanpod:lam(0x3a5a2a),
  squash:lam(0xd67f2e),
  pear:lam(0x4f7d46),
  fruit:lam(0xc9366e),
  star:new THREE.MeshBasicMaterial({color:0xf2b134}),
  cistern:lam(0x7d8fa3),
  lid:lam(0x5d6b7a),
  glass:lam(0xbcd9e4,{transparent:true,opacity:0.4}),
  frame:lam(0x7fa3ad),
  earth:lam(0xb08d57),
  earth2:lam(0xa27f4c),
  roof:lam(0x96562e),
  door:lam(0x4c3320),
  wash:lam(0xbfb298),
  creek:lam(0xd4cba8),
  drift:lam(0xa3927b),
  drift2:lam(0x8b8071),
  junF2:lam(0x5a7355),
  hardpan:lam(0xd8cab4),
  cob:lam(0xe8c33a),
  thirstP:lam(0x9aa06a),
  snake:lam(0xb08a56),
  snakeD:lam(0x7a5c38),
  hardpanTop:(()=>{
    const c=document.createElement('canvas');c.width=c.height=160;
    const x2=c.getContext('2d');
    const pts=[];for(let i=0;i<15;i++)pts.push([Math.random()*160,Math.random()*160,0.9+Math.random()*0.16]);
    const img=x2.createImageData(160,160);
    for(let py=0;py<160;py++)for(let px=0;px<160;px++){
      let d1=1e9,d2=1e9,k1=0;
      for(let i2=0;i2<pts.length;i2++){
        const dx=px-pts[i2][0],dy=py-pts[i2][1],d=Math.sqrt(dx*dx+dy*dy);
        if(d<d1){d2=d1;d1=d;k1=i2;}else if(d<d2)d2=d;
      }
      const gap=d2-d1;
      let r,gg,b;
      if(gap<2.4){r=124;gg=99;b=68;}                    // crack
      else if(gap<6){const f=(gap-2.4)/3.6;              // shaded shoulder of the plate
        r=124+f*(216-124);gg=99+f*(202-99);b=68+f*(180-68);}
      else{const tn=pts[k1][2];                          // plate face, per-plate tint
        r=216*tn;gg=202*tn;b=180*tn;}
      const o=(py*160+px)*4;
      img.data[o]=r;img.data[o+1]=gg;img.data[o+2]=b;img.data[o+3]=255;
    }
    x2.putImageData(img,0,0);
    const tx=new THREE.CanvasTexture(c);
    return new THREE.MeshLambertMaterial({map:tx});
  })(),
  seam:lam(0xb5a68e),
  eroded:lam(0x8a7660),
  eroded2:lam(0x82715c),
  grass:lam(0x9db86a),
  grassTuft:lam(0x7fa050),
  sedge:lam(0x7ba05a),
  willow:lam(0x6f9a4e),
  trunkT:lam(0x7a5a3a),
  canopyT:lam(0x5e8f4a),
  stone:lam(0x938d81),
  bird:new THREE.MeshBasicMaterial({color:0x4a3f33}),
  saguaro:lam(0x5f8f57),
  junF:lam(0x4e6b52),
  junT:lam(0x6a4a30),
  pinyon:lam(0x47624c),
  ocoS:lam(0x6f5b3c),
  ocoT:lam(0xc2402e),
  agave2:lam(0x7fa07f),
  mesq:lam(0x5e7a3e),
  pvT:lam(0x86a854),          // smooth green photosynthetic bark
  pvC:lam(0xa9bd6a),          // sparse airy yellow-green foliage
  pvBloom:lam(0xf0d054),      // spring bloom
  cwBark:lam(0x6e5c4a),       // furrowed grey-brown
  cwLeaf:new THREE.MeshLambertMaterial({color:0x74b04a,flatShading:true}), // faceted billowy crown
  pvFlower:lam(0xf2d24b),
  pebble:lam(0xa79f8e),
  post:lam(0x7d5c38),
  flow:lam(0x6fb0d8,{transparent:true,opacity:0.5}),
  flood:new THREE.MeshPhongMaterial({color:0x4696cc,transparent:true,opacity:0.8,depthWrite:false,shininess:70,specular:0x8fc8e8}),
  floodMid:new THREE.MeshLambertMaterial({color:0x5aa4d4,transparent:true,opacity:0.55,depthWrite:false}),
  floodLite:new THREE.MeshLambertMaterial({color:0x74b4dc,transparent:true,opacity:0.26,depthWrite:false}),
  hover:new THREE.MeshBasicMaterial({color:0xf2b134,transparent:true,opacity:0.3,side:THREE.DoubleSide}),
  hoverOk:new THREE.MeshBasicMaterial({color:0x6fbf5f,transparent:true,opacity:0.35,side:THREE.DoubleSide}),
  spotOk:new THREE.MeshBasicMaterial({color:0x58b34a,transparent:true,opacity:0.5,side:THREE.DoubleSide,depthWrite:false}),
  hoverBad:new THREE.MeshBasicMaterial({color:0xd05b3c,transparent:true,opacity:0.3,side:THREE.DoubleSide}),
  wetBins:Array.from({length:8},(_,i)=>new THREE.MeshBasicMaterial({color:0x3f8fc4,transparent:true,opacity:0.08+i*0.065,side:THREE.DoubleSide,depthWrite:false})),
  thirsty:new THREE.MeshBasicMaterial({color:0xd05b3c,transparent:true,opacity:0.45,side:THREE.DoubleSide,depthWrite:false}),
  arrow:new THREE.MeshBasicMaterial({color:0x6f93aa,transparent:true,opacity:0.75}),
};

const gx=x=>x-COLS/2+0.5, gz=y=>y-ROWS/2+0.5;
const tileGroups=[]; // [y][x] -> Group
const world=new THREE.Group(); scene.add(world);
const animated=[]; // {mesh,phase} bobbing ripe stars

function mesh(g,m,x,y,z,opts){
  const mm=new THREE.Mesh(g,m);
  mm.position.set(x,y,z);
  mm.castShadow=true;
  if(opts&&opts.noShadow)mm.castShadow=false;
  if(opts&&opts.recv)mm.receiveShadow=true;
  return mm;
}

const UPV=new THREE.Vector3(0,1,0);
function addDrift(g,r,y0){
  const log=new THREE.Mesh(G.logG,M.drift);
  log.position.set(0,y0+0.06,0);
  log.rotation.z=Math.PI/2-0.09;log.rotation.y=r;log.castShadow=true;g.add(log);
  const stub=new THREE.Mesh(G.stubG,M.drift2);
  stub.position.set(Math.cos(r)*0.14,y0+0.13,-Math.sin(r)*0.14);
  stub.rotation.z=0.75;stub.rotation.y=r+0.6;stub.castShadow=true;g.add(stub);
  const p2=new THREE.Mesh(G.logG,M.drift2);
  p2.scale.set(0.5,0.55,0.5);
  p2.position.set(-Math.cos(r)*0.22,y0+0.035,Math.sin(r)*0.26);
  p2.rotation.z=Math.PI/2+0.12;p2.rotation.y=r+1.9;p2.castShadow=true;g.add(p2);
}
function buildTile(x,y){
  const t=S.grid[y][x];
  const g=new THREE.Group();
  g.position.set(gx(x),t.elev,gz(y));
  g.userData={x,y};

  if(t.type==='swale'||t.type==='wash'||t.type==='creek'){
    const base=mesh(G.swaleBase,t.type==='wash'?M.wash:(t.type==='creek'?M.creek:M.swale),0,-2.32,0,{recv:true});
    base.castShadow=false;
    g.add(base);
    const raining=S.weather==='rain';
    if(t.type==='creek'){
      const p1=mesh(G.pebble,M.pebble,Math.cos(t.rot)*0.22,0.2,Math.sin(t.rot)*0.2,{noShadow:true});
      p1.scale.set(0.7,0.4,0.7);g.add(p1);
      if(raining){const f=new THREE.Mesh(G.otile,M.floodMid);f.rotation.x=-Math.PI/2;f.position.y=0.24;f.scale.set(0.62,1,0.92);g.add(f);}
    }
    else if(t.type==='wash'){
      const p1=mesh(G.pebble,M.pebble,Math.cos(t.rot)*0.3,0.2,Math.sin(t.rot)*0.26,{noShadow:true});
      const p2=mesh(G.pebble,M.pebble,-Math.cos(t.rot*1.3)*0.24,0.19,-Math.sin(t.rot*0.7)*0.2,{noShadow:true});
      p1.scale.set(1,0.55,1);p2.scale.set(0.8,0.5,0.8);
      g.add(p1);g.add(p2);
      if(raining){const f=new THREE.Mesh(G.otile,M.flood);f.rotation.x=-Math.PI/2;f.position.y=0.24;g.add(f);}
      if(t.dam){
        for(const px of [-0.26,0,0.26])g.add(mesh(G.post,M.post,px,0.36,0.16));
        g.add(mesh(G.bar,M.post,0,0.31,0.16));
        const w1=mesh(G.logG,M.drift,0.1,0.28,0.16,{noShadow:true});
        w1.rotation.z=Math.PI/2-0.18;w1.scale.setScalar(0.85);g.add(w1);
        const w2=mesh(G.logG,M.drift,-0.08,0.24,0.17,{noShadow:true});
        w2.rotation.z=Math.PI/2+0.22;w2.scale.setScalar(0.75);g.add(w2);
        const w3=mesh(G.stubG,M.drift,0.2,0.33,0.15,{noShadow:true});
        w3.rotation.z=1.2;g.add(w3);
        if(t.resto>=1){ // sedges
          for(const [tx,tz] of [[-0.35,0.3],[0.38,0.28],[-0.4,-0.1],[0.42,-0.05]])
            g.add(mesh(G.tuft,M.sedge,tx,0.32,tz,{noShadow:true}));
        }
        if(t.resto>=2){ // willows
          const w1=mesh(G.shrub,M.willow,-0.34,0.42,-0.28);w1.scale.set(1,1.4,1);g.add(w1);
          const w2=mesh(G.shrub,M.willow,0.36,0.4,-0.3);w2.scale.set(0.8,1.2,0.8);g.add(w2);
        }
        if(t.resto>=3){ // birds circling above
          for(let i=0;i<2;i++){
            const b=mesh(G.bird,M.bird,i?0.25:-0.2,1.35+i*0.15,i?0.1:-0.1,{noShadow:true});
            g.add(b);animated.push({mesh:b,phase:i*2.5,baseY:1.35+i*0.15});
          }
        }
        if(t.resto>=4){ // cottonwood on the silt bar
          g.add(mesh(G.trunkT,M.trunkT,-0.3,0.8,-0.32));
          const c1=mesh(G.canopyT,M.canopyT,-0.3,1.45,-0.32);g.add(c1);
          const c2=mesh(G.canopyT,M.canopyT,-0.12,1.25,-0.2);c2.scale.setScalar(0.7);g.add(c2);
        }
      }
      if(!raining&&t.stored>0){
        const w=mesh(G.water,M.water,0,0.19,0,{noShadow:true});
        const s=0.55+0.45*Math.min(1,t.stored/BDA_CAP);
        w.scale.set(s,1,s);g.add(w);
      }
    } else if(t.type==='swale'){ // swale: a genuinely sunken square basin, lips standing at grade
      const below=tileAt(x,y+1);
      const paired=!!(below&&below.type==='berm');
      const lipH=0.125, lipY=0.24;
      const mkLip=(w,d,px,pz)=>{
        const b=new THREE.Mesh(new THREE.BoxGeometry(w,lipH,d),M.sand[1]);
        b.position.set(px,lipY,pz);b.castShadow=true;b.receiveShadow=true;g.add(b);
      };
      mkLip(0.2,1.0,-0.4,0);            // left lip
      mkLip(0.2,1.0, 0.4,0);            // right lip
      mkLip(0.6,0.2, 0,-0.4);           // uphill lip
      if(!paired)mkLip(0.6,0.2,0,0.4);  // downhill lip (open when a berm continues the basin)
      const floor=new THREE.Mesh(new THREE.BoxGeometry(0.6,0.02,paired?0.8:0.6),M.swaleDeep);
      floor.position.set(0,0.19,paired?0.1:0);
      floor.receiveShadow=true;
      g.add(floor);
      if(raining){ // storm: the basin reads FULL — water hovers over the recessed pit only
        const w=new THREE.Mesh(G.swWaterSq,M.water);
        w.rotation.x=-Math.PI/2;
        w.scale.set(1.05,paired?1.5:1.05,1);
        w.position.set(0,0.315,paired?0.12:0);
        g.add(w);
      }
      else if(t.stored>0){
        const w=new THREE.Mesh(G.swWaterSq,M.water);
        w.rotation.x=-Math.PI/2;
        const s=0.5+0.5*Math.min(1,t.stored/swaleCap(x,y));
        w.scale.set(s,paired?s*1.45:s,1);
        w.position.set(0,0.215,paired?0.12:0);
        g.add(w);
      }
    }
    if(t.deco==='drift')addDrift(g,t.rot,0.18);
  } else {
    const baseMat=t.type==='bed'?M.sand[1]:(t.type==='grass'?M.grass:(t.type==='hardpan'?M.hardpan:(t.type==='eroded'?M.eroded:M.sand[t.shade])));
    const base=mesh(G.base,baseMat,0,-2.2,0,{recv:true});
    base.castShadow=false;
    g.add(base);
    if(S.weather==='rain'&&['sand','grass','bed','ord','rock','hardpan','eroded'].includes(t.type)){
      const deep=t.type==='bed'||t.type==='ord';
      const f=new THREE.Mesh(G.otile,deep?M.floodMid:M.floodLite);
      f.rotation.x=-Math.PI/2;f.position.y=t.type==='bed'?0.4:0.37;g.add(f);
    }
    if(S.weather!=='rain'&&t.type==='ord'&&t.stored>0){
      const w=mesh(G.water,M.water,0,0.36,-0.2,{noShadow:true});
      w.scale.set(0.5+0.1*t.stored,1,0.4+0.08*t.stored);g.add(w);
    }
    if(t.type==='grass'){
      for(const [tx,tz] of [[-0.25,-0.2],[0.1,0.25],[0.28,-0.15],[-0.05,-0.32],[0.2,0.05]])
        g.add(mesh(G.tuft,M.grassTuft,tx,0.4,tz,{noShadow:true}));
    }
    if(t.type==='hardpan'){
      const cr=new THREE.Mesh(G.hover,M.hardpanTop);
      cr.rotation.set(-Math.PI/2,0,Math.floor(t.rot/(Math.PI/2))*(Math.PI/2)); // quarter-turn variety per tile
      cr.position.y=0.312;
      cr.receiveShadow=true;
      g.add(cr);
    }
    if(t.type==='eroded'){
      const gouge=new THREE.Mesh(new THREE.BoxGeometry(0.34,0.05,0.9),M.eroded2);
      gouge.rotation.y=t.rot*0.3;gouge.position.y=0.30;g.add(gouge);
      for(const [px2,pz2] of [[-0.24,0.12],[0.2,-0.18],[0.06,0.3],[-0.1,-0.28]]){
        const rb=mesh(G.pebble,M.eroded2,px2,0.33,pz2,{noShadow:true});
        rb.scale.set(0.9,0.5,0.9);rb.rotation.y=px2*7;g.add(rb);
      }
      const root=mesh(G.stubG,M.drift,0.15,0.34,0.1,{noShadow:true});
      root.rotation.z=1.4;g.add(root); // torn-out root, left behind
    }
    if(t.type==='ord'){
      for(let i=0;i<5;i++){
        const st=mesh(G.stoneRow,M.stone,-0.36+i*0.18,0.34,0.05);
        st.rotation.set(t.rot+i,i*1.3,0);g.add(st);
      }
      if(t.soil>0){ // silt wedge banking up behind the rocks
        const wedge=new THREE.Mesh(new THREE.BoxGeometry(0.8,0.08,0.3),M.sand[1]);
        wedge.position.set(0,0.33,-0.22);wedge.scale.y=t.soil/2;g.add(wedge);
      }
    }
  }

  if(t.type==='berm'){
    // an earthen mound raised to the swale's grade; its uphill half is the recessed dome of the basin,
    // and everything outside the dome slopes down into this tile's own square
    const up=tileAt(x,y-1);
    const dy=up?Math.max(0,up.elev-t.elev):0;
    const lift=Math.max(dy,0.1);           // bank rises at least a little even on flat pairs
    const topY=0.328+lift;                  // crest = just above the wedge top
    const H=lift+0.02, crestY=0.3+H, floorY=Math.max(0.33,crestY-0.12);
    const crest=new THREE.Mesh(G.bermCrest,M.berm);
    crest.rotation.x=Math.PI/2;
    crest.scale.set(1,1,H+0.001);
    crest.position.set(0,crestY,0);
    crest.castShadow=true;crest.receiveShadow=true;
    g.add(crest);
    const floor=new THREE.Mesh(new THREE.BoxGeometry(0.6,0.05,0.34),M.swaleDeep);
    floor.position.set(0,floorY,-0.33);
    floor.receiveShadow=true;
    g.add(floor);
    const ramp=new THREE.Mesh(G.bermRamp,M.bermRampM);
    ramp.scale.set(1,H,1);
    ramp.position.set(0,0.3,0);
    g.add(ramp);
    // half-circle floor of the sunken dome + its water
    const dome=new THREE.Mesh(G.bermDome,M.swaleDeep);
    dome.rotation.set(-Math.PI/2,0,Math.PI);
    dome.position.set(0,floorY+0.032,-0.49);
    g.add(dome);
    if(up&&up.type==='swale'&&(S.weather==='rain'||up.stored>0)){
      const pool=new THREE.Mesh(G.bermDomeWater,M.water);
      pool.rotation.set(-Math.PI/2,0,Math.PI);
      const raining2=S.weather==='rain';
      const ps=raining2?1.08:0.6+0.4*Math.min(1,up.stored/swaleCap(x,y-1));
      pool.scale.set(ps,ps,1);
      pool.position.set(0,raining2?floorY+0.1:floorY+0.04,-0.49);
      g.add(pool);
    }
  }
  if(t.type==='bed'){
    g.add(mesh(G.bedTop,M.bedTop[t.moisture],0,0.34,0,{recv:true}));
  }
  if(t.type==='rock'){
    const rk=mesh(G.rock,M.rock,0,0.42,0);
    rk.rotation.set(t.rot,t.rot*1.7,0);
    g.add(rk);
    const p1=mesh(G.pebble,M.eroded2,0.26*Math.cos(t.rot),0.33,0.24*Math.sin(t.rot),{noShadow:true});
    p1.scale.setScalar(1.3);p1.rotation.y=t.rot*2;g.add(p1);
    const p2=mesh(G.pebble,M.stone,-0.24*Math.cos(t.rot*1.3),0.32,-0.2*Math.sin(t.rot),{noShadow:true});
    p2.scale.setScalar(0.9);g.add(p2);
  }
  if(t.deco&&t.deco!=='rock'){
    const r=t.rot;
    switch(t.deco){
      case 'drift':addDrift(g,r,0.3);break;
      case 'saguaro':{
        const trunk=mesh(G.sagT,M.saguaro,0,0.72,0);
        trunk.rotation.z=0.03*Math.sin(r*3);g.add(trunk);
        const nArms=1+Math.floor(((r*7)%1)*3); // 1–3 arms, stable per tile
        const armSpots=[[0.17,0.75,Math.sin(r)*0.05,-0.25],[-0.16,0.6,Math.cos(r)*0.05,0.3],[0.05,0.9,-0.12,0.15]];
        for(let ai=0;ai<nArms;ai++){
          const [ax,ay,az,tilt]=armSpots[ai];
          const arm=mesh(G.sagA,M.saguaro,ax,ay,az);
          arm.rotation.z=tilt;
          arm.scale.setScalar(0.8+0.3*((r*11+ai)%1));
          g.add(arm);
        }
        break;}
      case 'juniper':{
        // strawberry-shaped: fat rounded base tapering to a soft tip
        const tr1=mesh(G.junTrunk,M.junT,0,0.42,0);
        tr1.scale.set(0.8,0.55,0.8);g.add(tr1);
        const body=new THREE.Mesh(G.junBody,M.junF);
        body.position.set(0,0.42,0);body.rotation.y=r;
        body.castShadow=true;g.add(body);
        for(const [cx2,cy2,cz2,s] of [[0.16,0.6,0.06,0.45],[-0.14,0.72,-0.05,0.4],[0.02,0.88,0.1,0.32],[-0.08,0.5,0.14,0.42]]){
          const b=mesh(G.junB,M.junF2,cx2,cy2,cz2);
          b.scale.setScalar(s);b.rotation.y=r+cx2*4;g.add(b);
        }
        break;}
      case 'pinyon':{
        g.add(mesh(G.trkS,M.junT,0,0.42,0));
        g.add(mesh(G.pinC,M.pinyon,0,0.78,0));
        break;}
      case 'ocotillo':{
        const base=0.3;
        for(let i=0;i<7;i++){
          const a=r+i*(Math.PI*2/7);
          const t1=0.26+((i%3)*0.07);
          const d1=new THREE.Vector3(Math.sin(t1)*Math.cos(a),Math.cos(t1),Math.sin(t1)*Math.sin(a));
          const s1=new THREE.Mesh(G.ocoSeg1,M.ocoS);
          s1.position.set(d1.x*0.225,base+d1.y*0.225,d1.z*0.225);
          s1.quaternion.setFromUnitVectors(UPV,d1);
          s1.castShadow=true;g.add(s1);
          const t2=t1+0.38;
          const d2=new THREE.Vector3(Math.sin(t2)*Math.cos(a),Math.cos(t2),Math.sin(t2)*Math.sin(a));
          const jx=d1.x*0.45, jy=base+d1.y*0.45, jz=d1.z*0.45;
          const s2=new THREE.Mesh(G.ocoSeg2,M.ocoS);
          s2.position.set(jx+d2.x*0.19,jy+d2.y*0.19,jz+d2.z*0.19);
          s2.quaternion.setFromUnitVectors(UPV,d2);
          s2.castShadow=true;g.add(s2);
          g.add(mesh(G.tipS,M.ocoT,jx+d2.x*0.4,jy+d2.y*0.4,jz+d2.z*0.4,{noShadow:true}));
        }
        break;}
      case 'agave':{
        const base=0.33;
        const ring=(n,tilt,off,reach,sc)=>{
          for(let i=0;i<n;i++){
            const a=r+off+i*(Math.PI*2/n);
            const d=new THREE.Vector3(Math.sin(tilt)*Math.cos(a),Math.cos(tilt),Math.sin(tilt)*Math.sin(a));
            const l=new THREE.Mesh(G.agL,M.agave2);
            l.scale.set(sc,0.9,0.55);
            l.position.set(d.x*reach,base+d.y*reach,d.z*reach);
            l.quaternion.setFromUnitVectors(UPV,d);
            l.castShadow=true;g.add(l);
          }
        };
        ring(8,1.05,0,0.15,1.6);   // outer — splayed wide
        ring(6,0.55,0.4,0.17,1.3); // mid — half-raised
        const c=mesh(G.agL,M.agave2,0,base+0.19,0);c.scale.set(1.1,1.15,1.1);g.add(c); // heart spike
        break;}
      case 'mesquite':{
        const tr=mesh(G.trkS,M.junT,0,0.44,0);tr.rotation.z=0.2;g.add(tr);
        const c1=mesh(G.canB,M.mesq,0.05,0.72,0);c1.scale.set(1.35,0.5,1.3);g.add(c1);
        const c2=mesh(G.canB,M.mesq,-0.15,0.66,0.1);c2.scale.set(0.8,0.4,0.8);g.add(c2);
        break;}
      case 'paloverde':{
        // Parkinsonia: all sticks, no canopy — green branches that fork and fork again, light passing through
        const seg=(x0,y0,z0,dir,len,tier)=>{
          const m2=new THREE.Mesh([G.pvB0,G.pvB1,G.pvB2,G.pvB3][tier],M.pvT);
          m2.scale.set(1,len,1);
          m2.quaternion.setFromUnitVectors(UPV,dir);
          m2.position.set(x0+dir.x*len/2,y0+dir.y*len/2,z0+dir.z*len/2);
          m2.castShadow=true;g.add(m2);
          return [x0+dir.x*len,y0+dir.y*len,z0+dir.z*len];
        };
        const dirAt=(tilt,az)=>new THREE.Vector3(Math.sin(tilt)*Math.cos(az),Math.cos(tilt),Math.sin(tilt)*Math.sin(az));
        let flowers=0;
        const bloom=(tp,sc)=>{const f=mesh(G.tipS,M.pvFlower,tp[0],tp[1],tp[2],{noShadow:true});f.scale.setScalar(sc);g.add(f);flowers++;};
        for(let i=0;i<3;i++){
          const az=r+i*2.1;
          const tip1=seg(0,0.3,0,dirAt(0.24+0.07*Math.sin(r+i),az),0.42,0);
          const subs=[];
          for(let j=0;j<2;j++){
            const az2=az+(j?0.8:-0.7)+0.2*Math.sin(r*2+i+j);
            subs.push([seg(tip1[0],tip1[1],tip1[2],dirAt(0.4+0.12*j,az2),0.26,1),az2]);
          }
          subs.push([seg(tip1[0],tip1[1],tip1[2],dirAt(0.2,az+0.15),0.24,1),az+0.15]); // leader
          for(const [tip2,az2] of subs){
            for(let k=0;k<2;k++){
              const az3=az2+(k?0.65:-0.6)+0.15*Math.sin(r+k);
              const tip3=seg(tip2[0],tip2[1],tip2[2],dirAt(0.55+0.1*k,az3),0.17,2);
              // and one split more: fine twiglets fanning wide into the open canopy
              for(let q=0;q<2;q++){
                const az4=az3+(q?0.6:-0.55);
                const tip4=seg(tip3[0],tip3[1],tip3[2],dirAt(0.68+0.12*q,az4),0.11,3);
                if(((i+k+q+Math.floor(r*3))%2)===0)bloom(tip4,0.55);
              }
            }
          }
        }
        break;}
      case 'snake':{
        const c1=mesh(G.snakeC1,M.snake,0,0.335,0,{noShadow:true});c1.rotation.x=Math.PI/2;g.add(c1);
        const c2=mesh(G.snakeC2,M.snake,0.015,0.38,0,{noShadow:true});c2.rotation.x=Math.PI/2;c2.rotation.z=r;g.add(c2);
        const hd=mesh(G.snakeHead,M.snakeD,0.1,0.46,Math.sin(r)*0.06,{noShadow:true});
        hd.rotation.z=-1.2-0.2*Math.sin(r);g.add(hd);
        const rt=mesh(G.rattle,M.snakeD,-0.14,0.37,-Math.cos(r)*0.08,{noShadow:true});
        rt.rotation.z=0.8;g.add(rt);
        break;}
      case 'cottonwood':{
        // Fremont cottonwood: one stout trunk, short fork, a single billowy low-poly crown wider than tall
        const tr=mesh(G.trunkT,M.cwBark,0,0.68,0);tr.scale.set(1.5,0.85,1.5);g.add(tr);
        const l1=mesh(G.trunkT,M.cwBark,0.16,1.1,0.04);l1.rotation.z=-0.45;l1.scale.set(0.62,0.42,0.62);g.add(l1);
        const l2=mesh(G.trunkT,M.cwBark,-0.15,1.08,-0.04);l2.rotation.z=0.5;l2.scale.set(0.55,0.38,0.55);g.add(l2);
        const c1=new THREE.Mesh(G.cwCrown,M.cwLeaf);
        c1.scale.set(1.5,1.0,1.4);c1.position.set(0,1.62,0);c1.rotation.y=r;
        c1.castShadow=true;g.add(c1);
        const c2=new THREE.Mesh(G.cwCrown,M.cwLeaf);
        c2.scale.set(0.95,0.7,0.9);c2.position.set(0.45,1.4,0.12);c2.rotation.y=r*1.7;
        c2.castShadow=true;g.add(c2);
        const c3=new THREE.Mesh(G.cwCrown,M.cwLeaf);
        c3.scale.set(0.85,0.62,0.8);c3.position.set(-0.42,1.38,-0.1);c3.rotation.y=r*2.3;
        c3.castShadow=true;g.add(c3);
        break;}
      case 'pricklypear':{
        const p1=mesh(G.pad,M.pear,0,0.42,0);p1.scale.set(1.3,1.5,0.6);g.add(p1);
        const p2=mesh(G.pad,M.pear,0.15,0.5,0.08);p2.scale.set(1,1.2,0.5);g.add(p2);
        const p3=mesh(G.pad,M.pear,-0.15,0.46,-0.06);p3.scale.set(0.9,1.1,0.5);g.add(p3);
        g.add(mesh(G.fruit,M.fruit,0.1,0.68,0.06));
        break;}
    }
  }
  if(t.type==='cistern'){
    g.add(mesh(G.cistern,M.cistern,0,0.6,0));
    for(const ry of [0.45,0.66,0.87]){
      const rib=new THREE.Mesh(new THREE.TorusGeometry(0.315,0.018,5,18),M.lid);
      rib.rotation.x=Math.PI/2;rib.position.y=ry;g.add(rib);
    }
    g.add(mesh(G.lid,M.lid,0,0.93,0));
    const sp=new THREE.Mesh(new THREE.CylinderGeometry(0.03,0.03,0.12,6),M.lid);
    sp.rotation.z=Math.PI/2;sp.position.set(0.34,0.42,0);g.add(sp);
  }
  if(t.type==='green'){
    const box=mesh(G.ghBox,M.glass,0,0.53,0,{noShadow:true});
    g.add(box);
    const roof=mesh(G.ghRoof,M.glass,0,0.9,0,{noShadow:true});
    roof.rotation.y=Math.PI/4;
    g.add(roof);
    for(const [px,pz] of [[-0.42,-0.42],[0.42,-0.42],[-0.42,0.42],[0.42,0.42]]){
      const post=new THREE.Mesh(new THREE.BoxGeometry(0.05,0.46,0.05),M.frame);
      post.position.set(px,0.53,pz);post.castShadow=true;
      g.add(post);
    }
  }
  if(t.type==='home'){
    g.add(mesh(G.slab,M.earth,0,0.36,0));
    if(t.homeStage===1){ // foundation: first course of bags laid on the slab
      const c0=mesh(G.ring,M.earth2,0,0.45,0);
      c0.rotation.x=Math.PI/2;g.add(c0);
    }
    if(t.homeStage>=2){
      for(let i=0;i<4;i++){
        const ring=mesh(G.ring,i%2?M.earth2:M.earth,0,0.46+i*0.13,0);
        ring.rotation.x=Math.PI/2;
        ring.scale.setScalar(1-i*0.03);
        g.add(ring);
      }
    }
    if(t.homeStage>=3){
      g.add(mesh(G.roof,M.roof,0,1.14,0));
      g.add(mesh(G.door,M.door,0,0.55,0.31));
    }
  }
  if(t.plant){
    const c=CROPS[t.plant.crop];
    const ripe=t.plant.grown>=c.days;
    const frac=t.plant.grown/c.days;
    const stage=ripe?3:(t.plant.grown===0?0:(frac<0.6?1:2));
    const idx=stage>=2?2:stage;
    const py=t.type==='green'?0.34:0.38;
    const thirsty=t.moisture<2&&!c.drought&&t.type!=='green'&&!ripe;
    const mat=t.plant.wilt>0?M.wilt:(thirsty?M.thirstP:null);
    const n0=g.children.length;
    if(idx===0) g.add(mesh(G.sprout,mat||M.sprout,0,py+0.08,0));
    else if(idx===1){
      const yscale=0.55+0.45*frac;
      if(t.plant.crop==='pear'){const b=mesh(G.pad,mat||M.pear,0,py+0.1,0);b.scale.set(yscale,1.2*yscale,0.5*yscale);g.add(b);}
      else{const yv=mesh(G.young,mat||M.green,0,py+0.16*yscale,0);yv.scale.setScalar(yscale);g.add(yv);}
    } else {
      if(t.plant.crop==='beans'){
        g.add(mesh(G.blob,mat||M.green,0,py+0.3,0));
        g.add(mesh(G.blob,mat||M.green,0.1,py+0.18,0.05));
        g.add(mesh(G.blob,mat||M.green,-0.09,py+0.16,-0.06));
        if(ripe){g.add(mesh(G.fruit,M.beanpod,0.08,py+0.3,0.08));
        g.add(mesh(G.fruit,M.beanpod,-0.07,py+0.24,0.09));}
      } else if(t.plant.crop==='corn'){
        g.add(mesh(G.cornStalk,mat||M.green,0,py+0.3,0));
        const b1=mesh(G.cornBlade,mat||M.green,0.09,py+0.3,0.02);b1.rotation.z=-0.9;g.add(b1);
        const b2=mesh(G.cornBlade,mat||M.green,-0.08,py+0.22,-0.02);b2.rotation.z=0.95;g.add(b2);
        const b3=mesh(G.cornBlade,mat||M.green,0.05,py+0.14,-0.06);b3.rotation.z=-1.05;g.add(b3);
        if(ripe){const cb=mesh(G.cob,M.cob,0.06,py+0.4,0.03);cb.rotation.z=-0.35;g.add(cb);}
      } else if(t.plant.crop==='squash'){
        if(ripe){const s=mesh(G.squash,mat||M.squash,0,py+0.12,0); s.scale.set(1,0.72,1); g.add(s);}
        g.add(mesh(G.stem,M.green,0,py+0.28,0));
        const leaf=mesh(G.pad,mat||M.green,0.16,py+0.1,0.1); leaf.scale.set(1,0.35,0.8); g.add(leaf);
      } else {
        const body=mesh(G.pad,mat||M.pear,0,py+0.2,0); body.scale.set(1,1.6,0.55); g.add(body);
        const p1=mesh(G.pad,mat||M.pear,0.15,py+0.34,0); p1.scale.set(0.8,1.1,0.4); g.add(p1);
        const p2=mesh(G.pad,mat||M.pear,-0.14,py+0.3,0.02); p2.scale.set(0.7,1,0.4); g.add(p2);
        if(ripe){g.add(mesh(G.fruit,M.fruit,0.06,py+0.52,0));
        g.add(mesh(G.fruit,M.fruit,-0.08,py+0.46,0.03));}
      }
      if(stage===2){ // almost there — full form, slightly smaller
        for(let ci=n0;ci<g.children.length;ci++){
          const ch=g.children[ci];
          ch.scale.multiplyScalar(0.82);
          ch.position.y=py+(ch.position.y-py)*0.82;
        }
      }
    }

  }
  if((['berm','bda','ord','home'].includes(S.tool)&&canAct(S.tool,t,x,y))||(S.tool==='swale'&&canAct('berm',t,x,y))){
    const sm=new THREE.Mesh(G.otile,M.spotOk);
    sm.rotation.x=-Math.PI/2;
    sm.scale.set(0.55,0.55,1);
    sm.position.y=(t.type==='wash'||t.type==='creek'||t.type==='swale')?0.23:0.4;
    g.add(sm);
  }
  if(S.overlay){
    let wet=0, thirsty=false;
    if(t.type==='bed'||t.type==='green'){wet=t.moisture/6;thirsty=!!t.plant&&t.moisture<1&&!CROPS[t.plant.crop].drought&&t.type!=='green';}
    else if(t.type==='swale')wet=t.stored/swaleCap(x,y);
    else if(t.type==='wash'&&t.dam)wet=t.stored/BDA_CAP;
    const topY=(t.type==='wash'||t.type==='creek')?0.2:0.38;
    if(thirsty||wet>0.02){
      const o=new THREE.Mesh(G.otile,thirsty?M.thirsty:M.wetBins[Math.min(7,Math.round(wet*7))]);
      o.rotation.x=-Math.PI/2;o.position.y=topY;
      g.add(o);
    }
    if(t.type==='sand'&&!t.deco&&(x+y*2)%3===0){
      const a=new THREE.Mesh(G.arrow,M.arrow);
      a.rotation.x=Math.PI/2; // point toward +z (downhill)
      a.position.set(0,0.42,0.1);
      g.add(a);
    }
  }
  return g;
}

const harvestTags=[];
function buildTags(){
  for(const tg of harvestTags)tg.el.remove();
  harvestTags.length=0;
  for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++){
    const t=S.grid[y][x];
    if(t&&t.plant&&t.plant.grown>=CROPS[t.plant.crop].days){
      const el=document.createElement('div');
      el.className='htag';el.textContent='🧺';
      el.title='Harvest '+CROPS[t.plant.crop].name;
      el.addEventListener('click',e=>{e.stopPropagation();if(doHarvest(t))refresh();});
      view.appendChild(el);
      harvestTags.push({x,y,el});
    }
    else if(t&&t.plant&&t.type==='bed'&&t.moisture<2&&!CROPS[t.plant.crop].drought){
      const el=document.createElement('div');
      el.className='htag wtag';el.textContent='💧';
      el.title='Thirsty — click to water (3L · 1⚡)';
      el.addEventListener('click',e=>{
        e.stopPropagation();
        if(S.water<3){say('Water barrel is low — haul some or wait for rain.');flashChip('water');return;}
        if(!spend(1))return;
        S.water-=3;t.moisture=Math.min(6,t.moisture+2);S.stats.watered++;S.lv.watered++;SFX.water();
        popAt(x,y,'+2 💧',0);
        refresh();
      });
      view.appendChild(el);
      harvestTags.push({x,y,el});
    }
  }
}
function rebuildAll(){
  buildTags();
  animated.length=0;
  while(world.children.length)world.remove(world.children[0]);
  for(let y=0;y<ROWS;y++){tileGroups[y]=[];
    for(let x=0;x<COLS;x++){
      const g=buildTile(x,y);
      tileGroups[y][x]=g;
      world.add(g);
    }
  }
}

/* --- hover highlight --- */
function canAct(tool,t,x,y){
  if(!t)return false;
  if(t.type==='hardpan'||t.type==='eroded')return tool==='inspect';
  switch(tool){
    case 'inspect':return true;
    case 'gather':return t.type==='rock'||t.deco==='drift'||(t.deco&&TREE_SPECIES.includes(t.deco));
    case 'swale':return t.type==='sand'&&!nearWash(x,y);
    case 'cistern':return t.type==='sand';
    case 'ord':return t.type==='creek'&&S.stone>=2;
    case 'berm':{const up=tileAt(x,y-1);return t.type==='sand'&&!nearWash(x,y)&&up&&up.type==='swale';}
    case 'bed':return t.type==='sand'||t.type==='grass';
    case 'green':return (t.type==='sand'||t.type==='bed')&&!t.plant;
    case 'home':return t.type==='home'?t.homeStage<3:(t.type==='sand'&&countAll(q=>q.type==='home')===0);
    case 'bda':return t.type==='wash'&&!t.dam;
    case 'water':return (t.type==='bed'||t.type==='green');
    case 'harvest':return !!t.plant&&t.plant.grown>=CROPS[t.plant.crop].days;
    case 'clear':return ['swale','berm','bed','ord','grass'].includes(t.type)||(t.type==='wash'&&t.dam);
    default:
      if(tool.startsWith('plant-'))return (t.type==='bed'||t.type==='green')&&!t.plant;
      return true;
  }
}
const hoverMesh=new THREE.Mesh(G.hover,M.hover);
hoverMesh.rotation.x=-Math.PI/2;
hoverMesh.visible=false;
scene.add(hoverMesh);
let hovered=null;

/* --- weather look --- */
const LOOKS={
  sunny:{bg:0xf7dda2,fog:0xeed392,sunI:0.95,sunC:0xffedc8,hemiI:0.55},
  scorcher:{bg:0xf6c383,fog:0xecb878,sunI:1.15,sunC:0xffd9a0,hemiI:0.45},
  cloudy:{bg:0xe4e0d0,fog:0xd8d4c4,sunI:0.5,sunC:0xf2efe4,hemiI:0.8},
  rain:{bg:0x9aabb8,fog:0x8a9daa,sunI:0.22,sunC:0xbccbd6,hemiI:0.7},
};
function applyWeatherLook(){
  const L=LOOKS[S.weather];
  scene.background=new THREE.Color(L.bg);
  scene.fog=new THREE.Fog(L.fog,26,60);
  sun.intensity=L.sunI; sun.color.set(L.sunC);
  hemi.intensity=L.hemiI;
}

/* --- rain particles --- */
const RAIN_N=700;
const rainGeo=new THREE.BufferGeometry();
{
  const pos=new Float32Array(RAIN_N*3);
  for(let i=0;i<RAIN_N;i++){
    pos[i*3]=(Math.random()-0.5)*16;
    pos[i*3+1]=Math.random()*10+2;
    pos[i*3+2]=(Math.random()-0.5)*26;
  }
  rainGeo.setAttribute('position',new THREE.BufferAttribute(pos,3));
}
const rain=new THREE.Points(rainGeo,new THREE.PointsMaterial({color:0x9db8ce,size:0.09,transparent:true,opacity:0.8}));
rain.visible=false;
scene.add(rain);
let rainTimer=0;
const hawk=new THREE.Mesh(G.bird,M.bird);
hawk.scale.set(2.2,0.7,1.1);
hawk.castShadow=false;
scene.add(hawk);
function startRain(){
  rainTimer=450;rain.visible=true;runners.visible=true;washRun.visible=true;
  const fl=document.getElementById('flash');
  const strike=()=>{fl.classList.remove('go');void fl.offsetWidth;fl.classList.add('go');SFX.thunder();};
  setTimeout(strike,300+Math.random()*400);
  if(Math.random()<0.6)setTimeout(strike,2200+Math.random()*1500);
}
/* water runners: streams sliding downhill and along the wash during storms */
const SR_N=140, WR_N=50;
const srState=Array.from({length:SR_N},()=>({x:Math.floor(Math.random()*COLS),z:Math.random()*ROWS}));
const wrState=Array.from({length:WR_N},()=>({s:Math.random()*Math.max(1,(washPath.length-1))}));
function makePts(n,color,size){
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(n*3),3));
  const p=new THREE.Points(geo,new THREE.PointsMaterial({color,size,transparent:true,opacity:0.9}));
  p.visible=false;p.frustumCulled=false;scene.add(p);return p;
}
const runners=makePts(SR_N,0x5fa8d0,0.13);
const washRun=makePts(WR_N,0x8fd0f0,0.17);
function stepRunners(){
  const pos=runners.geometry.attributes.position;
  for(let i=0;i<SR_N;i++){
    const r=srState[i];
    if(r.x>=COLS)r.x=Math.floor(Math.random()*COLS);
    r.z+=0.055;
    let row=Math.min(ROWS-1,Math.max(0,Math.round(r.z)));
    const t=S.grid[row][r.x];
    if(r.z>ROWS-0.5||t.type==='swale'||t.type==='wash'||t.type==='creek'){ // captured or off the land
      r.x=Math.floor(Math.random()*COLS); r.z=-0.4+Math.random()*2;
      row=Math.max(0,Math.round(r.z));
    }
    const tt=S.grid[Math.min(ROWS-1,Math.max(0,row))][r.x];
    pos.setXYZ(i, gx(r.x)+Math.sin(i*7+r.z*3)*0.18, tt.elev+0.36, r.z-ROWS/2+0.5);
  }
  pos.needsUpdate=true;
  const wpos=washRun.geometry.attributes.position;
  for(let i=0;i<WR_N;i++){
    const w=wrState[i];
    w.s+=0.11;
    let i0=Math.floor(w.s);
    if(i0>=washPath.length-1){w.s=Math.random()*1.5;i0=0;}
    const a=washPath[i0], b=washPath[Math.min(washPath.length-1,i0+1)], f=w.s-i0;
    const ta=S.grid[a.y][a.x];
    if(ta.dam&&ta.stored>0&&f>0.4){w.s=Math.random()*1.5;} // ponded behind the dam
    const wx=gx(a.x)+(gx(b.x)-gx(a.x))*f, wz=gz(a.y)+(gz(b.y)-gz(a.y))*f;
    const wy=ta.elev+0.26;
    wpos.setXYZ(i, wx+Math.sin(i*3.7)*0.12, wy, wz);
  }
  wpos.needsUpdate=true;
}

/* --- camera orbit --- */
const cam={theta:0.18,phi:0.95,dist:22};
function updateCamera(){
  cam.phi=Math.max(0.35,Math.min(1.35,cam.phi));
  cam.dist=Math.max(7,Math.min(30,cam.dist));
  camera.position.set(
    Math.sin(cam.theta)*Math.sin(cam.phi)*cam.dist,
    Math.cos(cam.phi)*cam.dist,
    Math.cos(cam.theta)*Math.sin(cam.phi)*cam.dist
  );
  camera.lookAt(0,1.9,0);
}
updateCamera();

let dragging=false,downX=0,downY=0,moved=0,lastX=0,lastY=0;
const el=renderer.domElement;
let lastPaint=null, painted=false, touchN=0, pinchD=0, pressTimer=null;
el.addEventListener('touchstart',e=>{
  touchN=e.touches.length;
  if(touchN===2){
    pinchD=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);
    moved=99; if(pressTimer){clearTimeout(pressTimer);pressTimer=null;}
  }
},{passive:true});
el.addEventListener('touchmove',e=>{
  if(e.touches.length===2){
    e.preventDefault();
    const d=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);
    if(pinchD>0){cam.dist*=pinchD/d;updateCamera();}
    pinchD=d;
  }
},{passive:false});
el.addEventListener('touchend',e=>{touchN=e.touches.length;if(touchN<2)pinchD=0;},{passive:true});
el.addEventListener('pointerdown',e=>{
  hideCtx();
  dragging=true;moved=0;painted=false;lastPaint=null;downX=lastX=e.clientX;downY=lastY=e.clientY;
  try{el.setPointerCapture(e.pointerId);}catch(err){}
  if(e.pointerType==='touch'){ // long-press = harvest (the phone's right-click)
    if(pressTimer)clearTimeout(pressTimer);
    const px=e.clientX, py=e.clientY;
    pressTimer=setTimeout(()=>{
      pressTimer=null;
      if(moved>9||touchN>=2)return;
      const p=pickTile({clientX:px,clientY:py});
      if(p){
        const t=tileAt(p.x,p.y);
        if(t&&t.plant){
          if(navigator.vibrate)navigator.vibrate(25);
          if(doHarvest(t))refresh();
          painted=true; // swallow the tap
        }
      }
    },480);
  }
});
el.addEventListener('pointermove',e=>{
  if(dragging){
    if(touchN>=2){lastX=e.clientX;lastY=e.clientY;return;} // pinch owns the gesture
    if(moved>9&&pressTimer){clearTimeout(pressTimer);pressTimer=null;}
    if(e.shiftKey&&lastTool){
      const p=pickTile(e);
      if(p&&(!lastPaint||lastPaint.x!==p.x||lastPaint.y!==p.y)){lastPaint=p;painted=true;doTool(lastTool,p.x,p.y);}
      lastX=e.clientX;lastY=e.clientY;
      return;
    }
    const dx=e.clientX-lastX, dy=e.clientY-lastY;
    moved=Math.max(moved,Math.hypot(e.clientX-downX,e.clientY-downY));
    if(moved>9){
      cam.theta-=dx*0.008;
      cam.phi-=dy*0.006;
      updateCamera();
    }
    lastX=e.clientX;lastY=e.clientY;
  } else {
    updateHover(e);
  }
});
el.addEventListener('pointerup',e=>{
  dragging=false;
  if(pressTimer){clearTimeout(pressTimer);pressTimer=null;}
  if(moved<=9&&!painted){
    const p=pickTile(e);
    if(p)smartClick(p.x,p.y,e.clientX,e.clientY);
  }
});
el.addEventListener('pointerleave',()=>{hoverMesh.visible=false;hovered=null;});
el.addEventListener('wheel',e=>{e.preventDefault();cam.dist+=e.deltaY*0.012;updateCamera();},{passive:false});
el.addEventListener('contextmenu',e=>{
  e.preventDefault();
  const p=pickTile(e);
  if(!p)return;
  const t=tileAt(p.x,p.y);
  if(t&&t.plant){ if(doHarvest(t))refresh(); }
  else if(t&&t.type==='swale'){ buildBerm(p.x,p.y+1); }
  else if(t)say(describe(t,p.x,p.y));
});

const raycaster=new THREE.Raycaster(), pointer=new THREE.Vector2();
function pickTile(e){
  const r=el.getBoundingClientRect();
  pointer.x=((e.clientX-r.left)/r.width)*2-1;
  pointer.y=-((e.clientY-r.top)/r.height)*2+1;
  raycaster.setFromCamera(pointer,camera);
  const hits=raycaster.intersectObjects(world.children,true);
  for(const hit of hits){
    let o=hit.object;
    while(o&&o.userData.x===undefined)o=o.parent;
    if(o)return {x:o.userData.x,y:o.userData.y};
  }
  return null;
}
function updateHover(e){
  const p=pickTile(e);
  if(!p){hoverMesh.visible=false;hovered=null;return;}
  if(!hovered||hovered.x!==p.x||hovered.y!==p.y){
    hovered=p;
    const t=tileAt(p.x,p.y);
    hoverMesh.position.set(gx(p.x),t.elev+0.34,gz(p.y));
    hoverMesh.material=S.tool==='inspect'?M.hover:(canAct(S.tool,t,p.x,p.y)?M.hoverOk:M.hoverBad);
    hoverMesh.visible=true;
    if(S.tool==='inspect')say(describe(t,p.x,p.y));
  }
}

/* --- HUD --- */
let prevRes={};
function refresh(){
  hideCtx();
  document.getElementById('daybox').textContent=`Day ${S.day}`;
  document.getElementById('verlabel').textContent=`v3.3 · ${S.mode==='campaign'?('level '+Math.min(S.chapter+1,CHAPTERS.length)+'/'+CHAPTERS.length):'free play'}`;
  const res={water:S.water,seeds:S.seeds,food:S.food,dirt:S.dirt,stone:S.stone,wood:S.wood,bags:S.bags,energy:S.energy};
  const bump=k=>prevRes[k]!==undefined&&prevRes[k]!==res[k]?' bump':'';
  const showStone=isUnlocked('ord')||S.stone>0;
  const showWood=isUnlocked('bda')||S.wood>0;
  const showBags=isUnlocked('fillbag')||S.bags>0;
  document.getElementById('chips').innerHTML=
    `<span class="chip${bump('water')}" data-k="water">💧 ${S.water}<small>/${S.waterCap}L</small></span>`+
    `<span class="chip${bump('food')}" data-k="food">🥣 ${S.food} <small>food</small></span>`+
    `<span class="chip${bump('seeds')}" data-k="seeds">🌰 ${S.seeds} <small>seeds</small></span>`+
    `<span class="chip${bump('dirt')}" data-k="dirt">🟤 ${S.dirt} <small>dirt</small></span>`+
    (showStone?`<span class="chip${bump('stone')}" data-k="stone">🪨 ${S.stone} <small>stone</small></span>`:'')+
    (showWood?`<span class="chip${bump('wood')}" data-k="wood">🪵 ${S.wood} <small>wood</small></span>`:'')+
    (showBags?`<span class="chip${bump('bags')}" data-k="bags">🧱 ${S.bags} <small>bags</small></span>`:'');
  prevRes=res;
  buildToolbar();
  const daysTo=Math.max(0,(S.lastRainDay+5)-S.day);
  const cw=CH();
  let outlook;
  if(cw&&cw.script&&cw.script.rains){
    const nxt=cw.script.rains.find(d2=>d2>S.dayLv);
    outlook=S.weather==='rain'?'It is HERE. 🌧':(S.forecast==='rain'?'Monsoon tomorrow — brace!':(nxt?`Next monsoon: day ${nxt} — plan for it`:'⚠ NO storms left this level'));
  } else {
    outlook=S.weather==='rain'?'It is HERE. 🌧':(S.forecast==='rain'?'Monsoon tomorrow — brace!':(daysTo<=1?'Any day now…':`feels ~${daysTo} days off`));
  }
  document.getElementById('weatherbox').innerHTML=
    `<h3>Weather</h3>Today: <b>${WEATHERS[S.weather].label}</b><br>Tomorrow: ${WEATHERS[S.forecast].label}<br><small>Next monsoon: ${outlook}</small>`;
  const wp=document.getElementById('wpill');
  wp.textContent=`${WEATHERS[S.weather].label.split(' ')[0]}→${WEATHERS[S.forecast].label.split(' ')[0]}`;
  wp.title=`Today: ${WEATHERS[S.weather].label} · Tomorrow: ${WEATHERS[S.forecast].label} · Next monsoon: ${outlook}`;
  chapterCheck();
  { // big clock energy readout
    const bn=document.getElementById('bcEnum'), bp=document.getElementById('bcPips');
    bn.textContent='⚡ '+S.energy;
    bn.classList.toggle('low',S.energy<=2);
    if(S.energyMax>12){bp.style.display='none';}
    else{
      bp.style.display='';
      if(bp.children.length!==S.energyMax){bp.innerHTML='';for(let i=0;i<S.energyMax;i++){const d=document.createElement('span');d.className='pip';bp.appendChild(d);}}
      [...bp.children].forEach((d,i)=>d.classList.toggle('off',i>=S.energy));
    }
    document.getElementById('bigClock').classList.toggle('freeplay',S.mode!=='campaign');
  }
  const G2=document.getElementById('goals');
  const objs=chapterObjectives();
  if(objs){
    document.getElementById('goalstitle').textContent=`Lv.${S.chapter+1} ${CHAPTERS[S.chapter].name} — Day ${S.dayLv}/${CHAPTERS[S.chapter].par+5} · ${S.dayLv<=CHAPTERS[S.chapter].par?'★★★ pace':(S.dayLv<=CHAPTERS[S.chapter].par+3?'★★ pace':'★ pace')}`;
    const celebrating=(performance.now()-(S.chapDoneAt||-1e9))<2500;
    window._objState=window._objState||{};
    G2.innerHTML=objs.map((o,i)=>{
      const done=o.check();
      const key=S.chapter+':'+i;
      const fresh=done&&!window._objState[key];
      window._objState[key]=done;
      return `<div class="${done?'done':'todo'}${fresh?' fresh':''}">${o.t}${done?`<span class="star${celebrating?' pop':''}" style="animation-delay:${i*0.16}s">⭐</span>`:''}</div>`;
    }).join('')
      +(Object.keys(S.results).filter(i2=>S.results[i2]).length?`<div class="starstrip">${Object.keys(S.results).filter(i2=>S.results[i2]).map(i2=>`L${+i2+1}&thinsp;${'★'.repeat(S.results[i2].stars||0)}`).join(' · ')}</div>`:'')
      +`<div class="fplink" onclick="toFreePlay()">skip to free play</div>`;
  } else {
    document.getElementById('goalstitle').textContent='Homestead goals';
    const defs=[['swale','Dig your first swale'],['rain','Catch a monsoon rain'],['bda','Dam the wash (BDA)'],['harvest','Harvest a crop'],
      ['cistern','Build a cistern'],['green','Build a greenhouse'],['home','Finish the earthbag home']];
    G2.innerHTML=defs.map(([k,l])=>`<div class="${S.goals[k]?'done':'todo'}">${l}</div>`).join('');
  }
  rebuildAll();
}

/* --- loop --- */
let tick=0;
function animate(){
  requestAnimationFrame(animate);
  tick++;
  for(const a of animated){
    a.mesh.position.y=a.baseY+Math.sin(tick*0.06+a.phase)*0.05;
    a.mesh.rotation.y+=0.03;
  }
  if(rainTimer>0){
    rainTimer--;
    const pos=rainGeo.attributes.position;
    for(let i=0;i<RAIN_N;i++){
      let yy=pos.getY(i)-0.28;
      if(yy<0)yy=Math.random()*8+5;
      pos.setY(i,yy);
    }
    pos.needsUpdate=true;
    stepRunners();
    if(rainTimer===0){rain.visible=false;runners.visible=false;washRun.visible=false;}
  }
  { // hawk circles high on the thermals
    const ha=tick*0.0035;
    hawk.position.set(Math.cos(ha)*5.5,6.4+Math.sin(tick*0.011)*0.4,Math.sin(ha)*4.5);
    hawk.rotation.y=-ha;
    hawk.rotation.z=0.25+0.1*Math.sin(tick*0.05);
    hawk.visible=S.weather!=='rain';
  }
  for(const tg of harvestTags){
    const t2=S.grid[tg.y]&&S.grid[tg.y][tg.x];
    if(!t2){tg.el.style.display='none';continue;}
    const v=new THREE.Vector3(gx(tg.x),t2.elev+0.8,gz(tg.y)).project(camera);
    if(v.z>1){tg.el.style.display='none';continue;}
    tg.el.style.display='';
    tg.el.style.left=((v.x*0.5+0.5)*VW)+'px';
    tg.el.style.top=((-v.y*0.5+0.5)*VH)+'px';
  }
  renderer.render(scene,camera);
}

function onResize(){
  VW=Math.max(300,view.clientWidth||900);
  VH=Math.max(260,view.clientHeight||560);
  renderer.setSize(VW,VH);
  camera.aspect=VW/VH;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize',onResize);

/* --- boot --- */
document.getElementById('nojs').remove(); // scripts run — hide the preview warning
window.DH={S,clickTile,endDay,doAction,CROPS,tileAt,cam,updateCamera,washPath,creekPaths,BDA_CAP,swaleCap,camera,renderer,CHAPTERS}; window.startMode=startMode; // debug/test hooks
S.unlocked=CHAPTERS[0].unlocks.slice();
renderChapter();
setInterval(()=>{ if(S.mode==='campaign')chapterCheck(); },1500); // safety net: never miss a completed level
/* --- tower-defense day clock: the sun sets on a timer --- */
function timerPaused(){
  if(!S.rtMode)return true; // relaxed mode: the clock only runs if you turn it on
  if(S.mode!=='campaign'||S.chapter>=CHAPTERS.length)return true;
  if(document.hidden)return true;
  if(!document.getElementById('intro').classList.contains('hidden'))return true;
  if(!document.getElementById('report').classList.contains('hidden'))return true;
  if(!document.getElementById('chap').classList.contains('hidden'))return true;
  if(!document.getElementById('saveovl').classList.contains('hidden'))return true;
  if(!document.getElementById('lost').classList.contains('hidden'))return true;
  if(chapterDone())return true; // level solved — take your time, look around
  return false;
}
setInterval(()=>{
  const tp=document.getElementById('timerpill'), tb=document.getElementById('timebar');
  const c=CH();
  if(!c||S.mode!=='campaign'){tp.style.display='none';tb.style.display='none';
    document.getElementById('bigClock').classList.add('freeplay');return;}
  document.getElementById('bigClock').classList.remove('freeplay');
  document.getElementById('bigClock').classList.toggle('notimer',!S.rtMode);
  tb.style.display=S.rtMode?'':'none';
  tp.style.display='none';
  const total=c.timer||40;
  if(!timerPaused()){
    S.timeLeft=Math.max(0,(S.timeLeft??total)-0.25);
    if(S.timeLeft<=0){S.timeLeft=total;endDay();return;}
  }
  tp.textContent='⏳ '+Math.ceil(S.timeLeft)+'s';
  const bt=document.getElementById('bcTime');
  const secNow=Math.ceil(S.timeLeft);
  if(secNow<=5&&secNow>0&&secNow!==window._lastTick&&!timerPaused()){window._lastTick=secNow;SFX.tick();}
  bt.textContent='⏳ '+secNow;
  bt.classList.toggle('low',S.timeLeft<=10&&!timerPaused());
  tb.style.width=(100*S.timeLeft/total)+'%';
},250);
buildToolbar();
applyWeatherLook();
log('Day 1: you arrive with a wagon of seeds, a shovel, and big plans.');
refresh();
onResize();
animate();