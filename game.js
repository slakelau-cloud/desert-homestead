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
/* ================= DEFEND MODE — the watershed is the tower field ================= */
// Storm waves: the monsoon season, escalating. run = L shed per tile, pulse = wash surge base,
// rocks = rockslides loosed on random columns, debris = log rams riding the wash surge.
const DEF_WAVES=[
 {day:2, run:2, pulse:20, rocks:0, debris:0},
 {day:4, run:2, pulse:26, rocks:0, debris:1},
 {day:6, run:2, pulse:30, rocks:1, debris:1},
 {day:8, run:3, pulse:34, rocks:1, debris:2},
 {day:10,run:3, pulse:38, rocks:2, debris:2},
 {day:12,run:3, pulse:44, rocks:2, debris:3},
 {day:14,run:4, pulse:50, rocks:3, debris:3},
 {day:16,run:4, pulse:56, rocks:3, debris:4},
 {day:18,run:4, pulse:62, rocks:4, debris:4},
 {day:20,run:5, pulse:70, rocks:5, debris:5},
];
const DEF_RAIDS=[ // desert critters strike on the quiet days, from the flanks — not the water's lane
 {day:5, list:['javelina']},
 {day:7, list:['coyote']},
 {day:9, list:['javelina','javelina']},
 {day:11,list:['coyote','javelina']},
 {day:13,list:['javelina','coyote']},
 {day:15,list:['coyote','coyote','javelina']},
 {day:17,list:['javelina','javelina','coyote']},
 {day:19,list:['coyote','javelina','javelina']},
];
const DEF_TERRAIN={cols:14,rows:26,flatRows:4,flatP:0.3,steepP:0.15,rocks:20,creeks:2,minCreeks:2,
  name:'the homestead watershed',flora:['saguaro','paloverde','pricklypear','ocotillo','mesquite','juniper','agave']};
function dfdWave(){return S.dfd?DEF_WAVES[Math.min(S.dfd.wave,DEF_WAVES.length-1)]:null;}
function dfdSetup(){
  const F=ROWS-4, cxWash=washPath.length?washPath[washPath.length-1].x:Math.floor(COLS/2);
  const cx=cxWash<COLS/2?Math.min(COLS-4,Math.floor(COLS*0.68)):Math.max(3,Math.floor(COLS*0.3));
  // sweep the homestead flat clear of hazards
  for(let y=F;y<ROWS;y++)for(let x=0;x<COLS;x++){const t=S.grid[y][x];
    if(t.type==='rock')t.type='sand';
    if(x>=cx-3&&x<=cx+3)t.deco=null;}
  const put=(x,y,fn)=>{const t=tileAt(x,y);if(t){t.deco=null;fn(t);}return tileAt(x,y);};
  put(cx,ROWS-2,t=>{t.type='home';t.homeStage=3;});
  put(cx-2,ROWS-2,t=>{t.type='green';t.moisture=3;});
  put(cx+2,ROWS-2,t=>{t.type='coop';});
  put(cx-1,ROWS-3,t=>{t.type='bed';t.moisture=4;t.plant={crop:'beans',stage:0,grown:0,wilt:0};});
  put(cx,ROWS-3,t=>{t.type='bed';t.moisture=4;});
  put(cx+1,ROWS-3,t=>{t.type='bed';t.moisture=4;});
  for(let i=0;i<3;i++)put(cx-2+i*2,ROWS-1,t=>{t.type='paddock';t.soil=2;t.regrow=0;});
  S.dfd={wave:0,houseHP:12,ghHP:6,coopHP:6,supplies:2,herd:{x:cx-2,y:ROWS-1},raids:[],won:false,lost:false,hx:cx};
}
function dfdFindType(ty){for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++)if(S.grid[y][x].type===ty)return {x,y,t:S.grid[y][x]};return null;}
function dfdHearts(){const D=S.dfd;return D?D.houseHP+D.ghHP+D.coopHP:0;}
function dfdDamage(n,hits){
  const D=S.dfd; if(!D)return;
  if(n<=0){log('🛡 The homestead weathered it — no damage.');return;}
  const parts=[];
  let left=n;
  while(left>0&&(D.ghHP>0||D.coopHP>0||D.houseHP>0)){
    if(D.ghHP>0){const k=Math.min(left,D.ghHP);D.ghHP-=k;left-=k;parts.push(`greenhouse −${k}`);
      if(D.ghHP===0){const p=dfdFindType('green');if(p)popAt(p.x,p.y,'🌡 SHATTERED',400,'bad');parts.push('the greenhouse is GONE');}}
    else if(D.coopHP>0){const k=Math.min(left,D.coopHP);D.coopHP-=k;left-=k;parts.push(`coop −${k}`);
      if(D.coopHP===0){const p=dfdFindType('coop');if(p)popAt(p.x,p.y,'🐔 WRECKED',400,'bad');parts.push('the coop is WRECKED');}}
    else {const k=Math.min(left,D.houseHP);D.houseHP-=k;left-=k;parts.push(`house −${k}`);}
  }
  SFX.lose&&n>=3?SFX.thunder():SFX.build();
  {const fl2=document.getElementById('flash');if(fl2){fl2.classList.remove('go');void fl2.offsetWidth;fl2.classList.add('go');}}
  const hp=dfdFindType('home');if(hp){popAt(hp.x,hp.y,`−${n} ❤`,700,'bad');bounceTile(hp.x,hp.y);}
  log(`💥 ${hits.join(', ')} hit the homestead: ${parts.join(', ')}.`);
  say(`💥 The homestead took ${n} damage — ${hits.join(', ')}.`);
  if(D.houseHP<=0&&!D.lost){
    D.lost=true;SFX.lose();
    document.getElementById('lostbody').innerHTML='🏚 The flood took the house. The season won this round — but the same waves are coming, and now you know their shape.<br><br>Fresh land, same schedule.';
    window.lostRetry=function(){document.getElementById('lost').classList.add('hidden');startMode('defend',D.level);};
    document.getElementById('lost').classList.remove('hidden');
    log('💔 The house fell. The watershed needs stronger bones next time.');
  }
  refresh();
}
function dfdUnlocks(){
  const D=S.dfd; if(!D)return;
  const add=(id,msg)=>{if(!S.unlocked.includes(id)){S.unlocked.push(id);if(msg)log('🔓 '+msg);}};
  if(D.wave>=1)add('ord','New defense: 🪨 ROCK DAMS — calm the creeks, and they stop rockslides cold.');
  if(D.wave>=2){add('bda','New defense: 🪵 WASH DAMS — pond the surge and SNAG the log rams (+2 wood each).');
    add('scare','New craft: 🎃 SCARECROW (3 🧺) — raiders within 2 tiles flee at dusk.');}
  if(D.wave>=3)add('fence','New craft: 🌵 CACTUS FENCE (2 🧺) — a living wall; raiders can´t pass its touch.');
  if(D.wave>=4){add('fillbag','Camp actions open: earthbags and hauling.');add('haul');add('cistern');}
}
function dfdVictory(){
  const D=S.dfd; if(!D||D.won)return;
  D.won=true;S.won=true;SFX.fanfare();setTimeout(()=>SFX.fanfare(),700);
  const h=dfdHearts(), stars=h>=20?3:(h>=12?2:1);
  D.stars=stars;
  document.getElementById('wintext').innerHTML=
    `Ten storms, and the homestead stands. ${'★'.repeat(stars)}${'☆'.repeat(3-stars)}<br>`+
    `House ${D.houseHP}/12 ❤ · Greenhouse ${D.ghHP}/6 · Coop ${D.coopHP}/6<br>`+
    `The wash you slowed is alive${countAll(t=>t.beaver)?' — and the beavers hold it now. 🦫':'.'} The desert kept what you gave it.`;
  document.getElementById('win').classList.remove('hidden');
  log('🏆 SEASON SURVIVED — the homestead held through all ten storms. '+'★'.repeat(stars));
}
function dfdSpawnRaid(){
  const D=S.dfd; if(!D||D.won||D.lost)return;
  const raid=DEF_RAIDS.find(r2=>r2.day===S.day);
  if(!raid)return;
  for(const kind of raid.list){
    let placed=false,gu=0;
    while(!placed&&gu++<80){
      const side=Math.random()<0.5?0:COLS-1;
      const x=side===0?Math.floor(Math.random()*2):COLS-1-Math.floor(Math.random()*2);
      const y=ROWS-2-Math.floor(Math.random()*7);
      const t=tileAt(x,y);
      if(t&&t.type==='sand'&&!t.deco){t.deco=kind;D.raids.push({x,y,kind});placed=true;}
    }
  }
  if(D.raids.length){
    showWaveBanner(D.raids.map(r2=>r2.kind==='javelina'?'🐗':'🐺').join(' ')+' RAID!');
    SFX.rattle();
    say(`⚠ Raiders on the flanks — ${D.raids.map(r2=>r2.kind==='javelina'?'🐗':'🐺').join(' ')} — shoo them or let your scarecrows and fences answer at dusk.`);
    log(`⚠ ${raid.list.length} raider${raid.list.length>1?'s':''} slipped in from the side country.`);
  }
}
function dfdResolveRaids(){
  const D=S.dfd; if(!D||!D.raids.length)return;
  const scared=(x,y)=>{for(let yy=y-2;yy<=y+2;yy++)for(let xx=x-2;xx<=x+2;xx++){const t=tileAt(xx,yy);if(t&&t.type==='scare')return true;}return false;};
  const fenced=(x,y)=>[[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>{const t=tileAt(x+dx,y+dy);return t&&t.type==='fence';});
  for(const r2 of D.raids){
    const t=tileAt(r2.x,r2.y);
    if(!t||t.deco!==r2.kind)continue; // already shooed
    t.deco=null;
    if(scared(r2.x,r2.y)){popAt(r2.x,r2.y,'🎃 fled!',300,'earth');log(`The scarecrow turned a ${r2.kind} at dusk. 🎃`);continue;}
    if(r2.kind==='javelina'){
      let tgt=null,bd=1e9;
      for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++){const q=S.grid[y][x];
        if(q.type==='bed'){const d=Math.abs(x-r2.x)+Math.abs(y-r2.y);if(d<bd){bd=d;tgt={x,y,t:q};}}}
      if(tgt&&fenced(tgt.x,tgt.y)){popAt(tgt.x,tgt.y,'🌵 turned!',300,'earth');log('A javelina hit the cactus fence and thought better of it. 🌵');}
      else if(tgt){tgt.t.plant=null;tgt.t.type='sand';tgt.t.moisture=0;popAt(tgt.x,tgt.y,'🐗 rooted up the bed!',300,'bad');log('A javelina rooted a garden bed to ruin overnight. 🐗');}
      else {S.food=Math.max(0,S.food-2);log('A javelina raided the pantry — −2 food. 🐗');}
    } else { // coyote
      const coop=dfdFindType('coop');
      if(coop&&fenced(coop.x,coop.y)){popAt(coop.x,coop.y,'🌵 turned!',300,'earth');log('The coyote circled the cactus fence all night and left hungry. 🌵');}
      else if(D.coopHP>0){D.coopHP--;S.food=Math.max(0,S.food-2);if(coop)popAt(coop.x,coop.y,'🐺 −1 ❤ −2 🥣',300,'bad');
        log('A coyote got into the coop — the birds are fewer and the wire is torn. 🐺');
        if(D.coopHP<=0)log('🐔 The coop is wrecked — no more morning eggs until the season ends.');}
      else {D.houseHP=Math.max(1,D.houseHP-1);log('A coyote prowled the porch all night — nobody slept. 🐺 (house −1)');}
    }
  }
  D.raids.length=0;
}
function dfdEconomy(){
  const D=S.dfd; if(!D||D.lost)return;
  if(D.coopHP>0){S.food+=2;const c=dfdFindType('coop');if(c){popAt(c.x,c.y,'+2 🥣 eggs',500,'good');flyRes(c.x,c.y,'food','🥚',2);}}
  // rotational grazing: the herd eats down its paddock; rested pasture pays double
  const h=tileAt(D.herd.x,D.herd.y);
  if(h&&h.type==='paddock'){
    const yieldN=h.soil>=2?2:(h.soil>=1?1:0);
    if(yieldN>0){D.supplies+=yieldN;popAt(D.herd.x,D.herd.y,`+${yieldN} 🧺`,800,'good');flyRes(D.herd.x,D.herd.y,'sup','🧺',yieldN);}
    else popAt(D.herd.x,D.herd.y,'grazed bare…',800,'bad');
    h.soil=Math.max(0,h.soil-1);
  }
  for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++){const t=S.grid[y][x];
    if(t.type==='paddock'&&!(D.herd.x===x&&D.herd.y===y)){
      t.regrow=(t.regrow||0)+1;
      if(t.regrow>=2&&t.soil<2){t.soil++;t.regrow=0;}
    }
  }
}
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
      if(p.flatRows&&y>ROWS-p.flatRows){prevFlat=true;} // the homestead flat: dead level, all the way across
      else{
        const r=Math.random();
        if(!prevFlat&&r<p.flatP){prevFlat=true;}                       // flat bench: two rows, one level
        else if(r>1-(p.steepP||0)){e+=0.56;prevFlat=false;}            // cliff: drops two squares at once
        else {e+=0.28;prevFlat=false;}
      }
    }
  }
  washPath.length=0;
  const washEnd=ROWS-(p.flatRows||0); // the wash empties out onto the flat — right at the homestead's door
  let wx=Math.max(2,Math.min(COLS-3,Math.floor(COLS/2)+Math.floor(Math.random()*7)-3));
  for(let y=0;y<washEnd;y++){
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
      if(p.flatRows&&y>=ROWS-p.flatRows)break;         // creeks spill out onto the flat too
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
// Once a swale is dug, the open sand tile DIRECTLY DOWNHILL of it is spoken for:
// only its berm can ever be built there. (Derived, not stored — clearing the swale frees the spot.)
const bermReserved=(t,x,y)=>{if(!t||t.type!=='sand'||nearWash(x,y))return false;const up=tileAt(x,y-1);return !!(up&&up.type==='swale');};
function neighbors(x,y){return [tileAt(x-1,y),tileAt(x+1,y),tileAt(x,y-1),tileAt(x,y+1)].filter(Boolean);}
function countAll(fn){let n=0;for(const row of S.grid)for(const t of row)if(fn(t))n++;return n;}
const BDA_CAP=12;
function swaleCap(x,y){const below=tileAt(x,y+1);return 10+(below&&below.type==='berm'?8:0);}
function mapResto(){let m=0;for(const row of S.grid)for(const t of row)if(t.resto>m)m=t.resto;return m;}

const MOBILE=(window.matchMedia&&matchMedia('(pointer:coarse)').matches)||Math.min(window.innerWidth,window.innerHeight)<560;
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
  const workbar=document.getElementById('workbar');
  if(S.mode==='defend'&&S.dfd){ // BTD6-style tower dock: cards on the right, tap to arm, tap the map to place
    toolbar.innerHTML='';workbar.innerHTML='';
    document.getElementById('dock').style.display='';
    document.getElementById('dockTab').style.display='';
    dockTabLabel();
    const cap=document.createElement('div');cap.className='cap';cap.textContent='🏗 Towers';workbar.appendChild(cap);
    for(const c of TOWER_CARDS){
      if(!S.unlocked.includes(c.id))continue;
      const b=document.createElement('button');
      b.className='tcard'+(S.dfd.sel===c.id?' armed':'')+(dfdAfford(c)?'':' broke');
      b.innerHTML=`<span class="tic">${c.ic}</span><b>${c.name}</b><span class="tcost">${dfdCostStr(c)||'free'}</span>`;
      b.title=c.gain;
      b.onclick=()=>dfdSelect(c.id);
      workbar.appendChild(b);
    }
    if(S.dfd.sel){
      const x=document.createElement('button');
      x.className='tcard cancel';x.innerHTML='✕ <b>Cancel</b>';
      x.onclick=()=>{S.dfd.sel=null;buildToolbar();say('Placement cancelled.');};
      workbar.appendChild(x);
    }
    const note=document.createElement('div');
    note.className='docknote';
    note.innerHTML='🪓 stone &amp; wood: tap a 🪨 boulder or 🪵 tree once to see its haul, tap again to collect — free, but they don´t grow back';
    workbar.appendChild(note);
    toolbarTail(null);
    return;
  }
  // classic modes: no tool menus — the land is the interface. The dock only holds camp actions (earthbag, haul).
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
  if(S.mode==='defend'&&S.dfd){
    if(S.dfd.won||S.dfd.lost){fab.className='';fab.innerHTML='↻<small>Again</small>';fab.onclick=()=>location.reload();return;}
    if(S.dfd.phase==='wave'){
      fab.className=S.dfd.speed>1?'gold':'';
      fab.innerHTML='⏩<small>'+(S.dfd.speed>1?'2×  ON':'2×')+'</small>';
      fab.onclick=()=>{S.dfd.speed=S.dfd.speed>1?1:2;toolbarTail(null);say(S.dfd.speed>1?'Double time. ⏩':'Back to real time.');};
    } else {
      fab.className='gold';
      fab.innerHTML='⛈<small>Call storm</small>';
      fab.onclick=()=>{if(S.dfd.phase!=='wave'){S.dfd.phaseT=0;S.water=Math.min(S.waterCap,S.water+6);say('You called it early — +6💧 for the nerve. ⛈');}};
    }
    return;
  }
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
  noteInput();
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
      t.homeStage,t.dam?1:0,t.wetDays,t.resto,t.fertile?1:0,t.inCreek?1:0,t.shade,t.beaver?1:0,t.regrow||0]);
  }
  const data={v:3,C:COLS,R:ROWS,wash:washPath.slice(),creeks:creekPaths.map(p2=>p2.slice()),
    s:{mode:S.mode,chapter:S.chapter,day:S.day,dayLv:S.dayLv,water:S.water,waterCap:S.waterCap,
       seeds:S.seeds,food:S.food,dirt:S.dirt,stone:S.stone,wood:S.wood,bags:S.bags,
       energy:S.energy,energyMax:S.energyMax,weather:S.weather,forecast:S.forecast,
       lastRainDay:S.lastRainDay,lv:S.lv,results:S.results,unlocked:S.unlocked,goals:S.goals,
       flags:S.flags,timeLeft:S.timeLeft,dfd:S.dfd||null},
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
          shade:a[13],rot:Math.random()*Math.PI*2,beaver:!!a[14],regrow:a[15]||0};
      }}
    Object.assign(S,d.s);
    S.flags=S.flags||{};
    document.getElementById('intro').classList.add('hidden');
    document.getElementById('saveovl').classList.add('hidden');
    fitCam();cam.theta=0.18;cam.phi=0.95;updateCamera();
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
document.getElementById('dockTab').addEventListener('click',()=>{if(S.mode==='defend'){dockCollapse(!document.getElementById('dock').classList.contains('collapsed'));return;}
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
  intro:'Field school, lesson 1 — the swale. There are no menus here: just click the land. Click any open sand to dig a swale, then click the green-marked tile JUST BELOW it — your dug dirt banks into a 🧱 berm there. That downhill spot belongs to the berm from the moment the swale is dug; nothing else can ever be built on it. The pair is the whole game: the swale catches rain, the berm makes it hold more. A storm comes tomorrow — end the day and watch it fill. (The dashed ⏭ button on the left skips any lesson.)',
  unlocks:['inspect','swale','berm','clear'],
  objectives:[
   {t:'Dig a swale, then click the saved spot just below it to raise the berm',s:'Dig a swale + berm the spot below',hint:'swale',check:()=>countPairs()>=1},
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
   {t:'Gather 2 stone (a boulder) and 2 wood (tree or driftwood)',s:'Gather 2 stone + 2 wood',hint:'gather',check:()=>S.lv.stone>=2&&S.lv.wood>=2},
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
  if(S.mode==='defend'){
    const d=S.day+1;
    return DEF_WAVES.some(w=>w.day===d)?'rain':(Math.random()<0.6?'sunny':(Math.random()<0.5?'scorcher':'cloudy'));
  }
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
function fitCam(){
  cam.cz=S.mode==='defend'?4.2:0; // defend frames the homestead flat
  const portrait=(typeof VH!=='undefined'?VH:window.innerHeight)>(typeof VW!=='undefined'?VW:window.innerWidth);
  cam.dist=(7+ROWS*0.85)*(portrait?1.5:1);
}
function applyLevelStart(c){
  const st=c.start||{};
  S.water=st.water??35;S.waterCap=60;S.seeds=st.seeds??4;S.dirt=st.dirt??2;
  S.stone=st.stone??0;S.wood=st.wood??0;S.bags=st.bags??0;S.food=st.food??0;
  S.energyMax=st.energy??10;
  S.energy=S.energyMax;S.dayLv=1;S.timeLeft=(c.timer||40);
  fitCam();cam.theta=0.18;cam.phi=0.95;updateCamera();
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
  hint(){tone(660,0.09,'sine',0.045);tone(880,0.12,'sine',0.045,0.1);},
};
const tutEl=document.getElementById('tut');
function isUnlocked(id){return S.mode==='free'||S.unlocked.includes(id);}
function startMode(mode,lv){
  document.getElementById('intro').classList.add('hidden');
  document.getElementById('win').classList.add('hidden');
  document.getElementById('lost').classList.add('hidden');
  S.mode=mode;S.won=false;
  if(mode==='free'){generateTerrain(TERRAINS[0]);fitCam();updateCamera();}
  if(mode==='campaign'){
    S.chapter=0;S.unlocked=CHAPTERS[0].unlocks.slice();
    generateTerrain(CHAPTERS[0].terrain);
    applyLevelStart(CHAPTERS[0]);
    log(`Level 1 — ${CHAPTERS[0].name} (par ${CHAPTERS[0].par} days for ★★★). ${CHAPTERS[0].intro}`);
  }
  if(mode==='defend'){
    lv=lv||0;
    const L=DLEVELS[lv];
    generateTerrain(L.terrain);
    dfdSetup();
    const st=L.start;
    S.water=st.water;S.waterCap=st.cap;S.seeds=st.seeds;S.dirt=st.dirt;S.stone=st.stone;S.wood=st.wood;S.bags=0;S.food=6;
    if(S.dfd)S.dfd.supplies=st.sup;
    S.energyMax=10;S.energy=10;S.dayLv=1;S.weather='sunny';S.forecast='sunny';
    dfdStart(lv);
    fitCam();cam.theta=0.18;cam.phi=1.1;updateCamera();
    const howto=lv===0?
      '<br><br><b>How it works:</b> 🌵 <b>Prickly pear is your starter</b> — plant it anywhere, it never thirsts, but it hits soft. ⛏ <b>Berm & swale</b> slurps water monsters into 💧 (money!) and digs its own beds beside it — that´s where the real towers grow. DRY waves send heat imps to burn your banked water. Pick cards from the <b>dock on the right</b>, tap the map to place, and <b>tap the monsters</b> to smack them yourself. 🪓 Stone and wood come from boulders and trees: <b>tap once to see the haul, tap again to collect</b> — free, finite, and storms wash fresh driftwood into the channels.':'';
    showChap('🌵 Level '+(lv+1)+' — '+L.name, L.intro+howto);
    log(L.name+': wave 1 of '+dfdWaves().length+' builds on the horizon. The dock is on the right.');
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
    case 'swale':return 'OPEN SAND, not beside the wash. Catches sheet-flow — more open ground uphill = more water. Pays +2 dirt. The tile DIRECTLY BELOW is saved for the berm the moment you dig — nothing else can build there. Right-click the swale (or click the green-marked tile) to raise it: 10→18L. Trees, rocks, driftwood gather on a plain click — no tool needed.';
    case 'berm':return 'THE SAVED SPOT directly below a swale only (green squares show where) — berms exist nowhere else, and nothing else can take that ground. Banks the swale up from 10L to 18L. Costs 1 dirt.';
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
    case 'scare':return 'OPEN SAND. 3 🧺 supplies. Any raider within 2 tiles flees at dusk instead of striking.';
    case 'fence':return 'OPEN SAND. 2 🧺 supplies. A living prickly-pear wall — raiders can´t strike a target it touches.';
    case 'clear':return 'Click to return a swale, berm, bed, scarecrow, or fence to plain sand — or pull a dam out of the wash.';
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
  if(t.deco==='snake'){say('A rattler is coiled on the berm spot — shoo it first (click it, 1⚡). 🐍');return;}
  if(t.deco&&(TREE_SPECIES.includes(t.deco)||t.deco==='drift')){say('The berm spot is under a tree — 🪓 clear it first with a click.');return;}
  if(t.deco){say('Something older than you holds the berm spot — it stays, and this swale goes without its bank. Site the next swale with more care. 🌵');return;}
  if(S.dirt<1){say('Need 1 dirt — dig a swale first.');return;}
  if(!spend(1))return;
  t.type='berm';t.deco=null;S.dirt--;SFX.dig();
  bounceTile(x,y);
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
  {const xy=tileXY(t);if(xy){popAt(xy.x,xy.y,`+${c.food+bonus} 🍲`,0,'good');flyRes(xy.x,xy.y,'food','🥣',c.food+bonus);flyRes(xy.x,xy.y,'seeds','🌰',c.seedback);bounceTile(xy.x,xy.y);}}
  SFX.harvest();
  if(!S.goals.harvest){S.goals.harvest=true;log(`First harvest! ${c.name} for the table. 🧺`);}
  say(`Harvested ${c.name}: +${c.food+bonus} food${bonus&&!sisters?' (rich soil!)':''}${sisters}, +${c.seedback} seeds.${c.name==='Beans'?' The beans fed the soil around them. 🌱':''}`);
  return true;
}
function spend(e){ if(S.mode==='defend')return true; // defend has no energy — the season is the clock
  if(S.energy<e){say('Too tired — end the day to rest. 🌙');return false;} S.energy-=e; return true;}

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
  // raiders: a javelina shoos for energy; a coyote takes supplies to drive off
  if((t.deco==='javelina'||t.deco==='coyote')&&tool!=='inspect'){
    if(t.deco==='coyote'&&(!S.dfd||S.dfd.supplies<1)){say('The coyote just circles you, grinning — you need 1 🧺 supplies (jerky and a torch) to drive it off. Or let a scarecrow or fence answer at dusk.');return;}
    if(!spend(1))return;
    if(t.deco==='coyote')S.dfd.supplies--;
    if(S.dfd)S.dfd.raids=S.dfd.raids.filter(r2=>!(r2.x===x&&r2.y===y));
    popAt(x,y,t.deco==='javelina'?'🐗 shooed!':'🐺 driven off!',0,'earth');
    t.deco=null;SFX.rattle();
    say('Raider driven off before dusk. The flanks are the price of a flat worth raiding.');
    refresh();
    return;
  }
  // the goat herd rotates on click: pick any other paddock
  if(t.type==='paddock'&&tool!=='inspect'&&S.dfd){
    if(S.dfd.herd.x===x&&S.dfd.herd.y===y){say(describe(t,x,y));return;}
    if(!spend(1))return;
    S.dfd.herd={x,y};SFX.gather();
    popAt(x,y,'🐐 rotated!',0,'earth');
    say(t.soil>=2?'Fresh pasture — the herd will pay DOUBLE supplies tomorrow. Rotation is the whole trick.':'The herd moves on — this paddock was thin, give the others time to rest.');
    refresh();return;
  }
  if(t.type==='coop'&&tool!=='inspect'){say(describe(t,x,y));return;}
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
  // THE BERM RULE: a swale's downhill tile is spoken for — only the berm goes there.
  if(['bed','cistern','green','home'].includes(tool)&&bermReserved(t,x,y)){
    say('This ground is spoken for — the swale just uphill banks its berm here, and nothing else can take the spot. 🧱 Click it to raise the berm (1 dirt), or clear the swale to free the ground.');
    return;
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
    bounceTile(x,y);
    if(!S.goals.swale){S.goals.swale=true;log('First swale dug! Rain will pool here. ⛏');}
    popAt(x,y,'+2 dirt',0,'earth');flyRes(x,y,'dirt','🟤',2);SFX.dig();
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
      popAt(x,y,'+2 🪨',0,'earth');flyRes(x,y,'stone','🪨',2);SFX.gather();
      say(`Broke the boulder into 2 stone (now ${S.stone}). That one's spent. 🪨`);
    }
    else if(t.deco==='drift'){
      if(!spend(1))return;
      S.wood+=2;S.lv.wood+=2;t.deco=null;
      popAt(x,y,'+2 🪵',0,'earth');flyRes(x,y,'wood','🪵',2);SFX.gather();
      say(`Easy pickings — 2 driftwood hauled off (wood: ${S.wood}). 🪵`);
    }
    else if(t.deco&&TREE_SPECIES.includes(t.deco)){
      if(!spend(2)){say('Felling a tree takes 2⚡ — too tired. (Driftwood only takes 1.)');return;}
      S.wood+=2;S.lv.wood+=2;
      t.deco=null;
      popAt(x,y,'+2 🪵',0,'earth');flyRes(x,y,'wood','🪵',2);SFX.gather();
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
    SFX.build();t.type='ord';t.deco=null;t.inCreek=wasCreek;S.stats.ordsBuilt++;S.lv.ords++;if(wasCreek)S.lv.creekOrds++;bounceTile(x,y);
    say('One rock high, laid where the water slows itself. "Let the water do the work." — it cannot fail, only slowly win.');
  }
  else if(tool==='bda'){
    if(t.type!=='wash'){say('Beaver-dam analogs go in the wash — the dry creek bed.');return;}
    if(t.dam){say('There is already a dam here.');return;}
    if(S.wood<3){say('A BDA takes 3 wood for posts and weave — 🪓 cut trees or grab driftwood.');return;}
    if(S.dirt<1){say('Need 1 dirt to pack the weave.');return;}
    if(!spend(1))return;
    S.wood-=3;S.dirt-=1;t.dam=true;SFX.build();bounceTile(x,y);
    if(!S.goals.bda){S.goals.bda=true;log('First beaver-dam analog built — next storm, the wash will pond behind it. 🦫');}
    say('Dam built across the wash. Now let it rain.');
  }
  else if(tool==='bed'){
    if(t.type!=='sand'&&t.type!=='grass'){say('Till beds on open sand or grass.');return;}
    if(!spend(1))return;
    const wasGrass=t.type==='grass';
    SFX.dig();t.type='bed';t.deco=null;t.moisture=wasGrass?3:0;t.fertile=wasGrass||t.fertile;bounceTile(x,y);
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
    S.bags-=4;t.type='cistern';t.deco=null;S.waterCap+=100;SFX.build();bounceTile(x,y);
    if(!S.goals.cistern){S.goals.cistern=true;log('Cistern built — 100L more storage, and it drinks the rain. 🛢');}
    say('Cistern built! Water cap +100L.');
  }
  else if(tool==='green'){
    if(t.type!=='sand'&&t.type!=='bed'){say('Greenhouses go on sand or an empty bed.');return;}
    if(t.plant){say('Harvest that plant first.');return;}
    if(S.bags<6){say('Need 6 earthbags for a greenhouse.');return;}
    if(!spend(1))return;
    S.bags-=6;t.type='green';t.deco=null;t.moisture=Math.max(2,t.moisture);SFX.build();bounceTile(x,y);
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
    S.bags-=s.need;t.type='home';t.deco=null;t.homeStage=st+1;SFX.build();bounceTile(x,y);
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
  else if(tool==='scare'){
    if(t.type!=='sand'){say('Scarecrows stand on open sand.');return;}
    if(!S.dfd||S.dfd.supplies<3){say('A scarecrow takes 3 🧺 supplies — rotate the herd and collect eggs to earn them.');return;}
    if(!spend(1))return;
    S.dfd.supplies-=3;t.type='scare';t.deco=null;SFX.build();bounceTile(x,y);
    say('Scarecrow up — raiders within 2 tiles lose their nerve at dusk. 🎃');
  }
  else if(tool==='fence'){
    if(t.type!=='sand'){say('The cactus fence roots in open sand.');return;}
    if(!S.dfd||S.dfd.supplies<2){say('A cactus fence takes 2 🧺 supplies to transplant.');return;}
    if(!spend(1))return;
    S.dfd.supplies-=2;t.type='fence';t.deco=null;SFX.plant();bounceTile(x,y);
    say('Living wall planted — nothing with a soft nose pushes past prickly pear. 🌵');
  }
  else if(tool==='clear'){
    if(t.type==='wash'){
      if(t.dam){if(!spend(1))return;t.dam=false;t.stored=0;S.dirt++;say('Dam pulled out — the wash runs free again.');refresh();return;}
      say('The wash was here long before you. It stays.');return;
    }
    if(!['swale','berm','bed','ord','grass','scare','fence'].includes(t.type)){say('Clear works on swales, berms, beds, rock dams, dams, scarecrows, and fences.');return;}
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
  const prev=S.tool; S.tool=id==='herd'?'swale':id; clickTile(x,y); S.tool=prev;
  if(['swale','bed','ord','berm','water'].includes(id)||id.startsWith('plant-'))lastTool=id;
}
function hideCtx(){const c=document.getElementById('ctx');if(c)c.remove();}
function ctxChoices(t,x,y){
  const ch=[];
  const add=(id,label,cost)=>{ch.push({id,label,cost:cost||''});};
  if(t.type==='sand'&&!t.deco){
    if(bermReserved(t,x,y)){ // saved spot: the berm, or nothing
      if(isUnlocked('berm'))add('berm','🧱 Berm','saved spot · 1 dirt');
    }else{
      if(isUnlocked('swale')&&!nearWash(x,y))add('swale','⛏ Swale','+2 dirt · 1⚡');
      if(isUnlocked('bed'))add('bed','🟫 Garden bed','1⚡');
      if(isUnlocked('cistern'))add('cistern','🛢 Cistern','4 bags');
      if(isUnlocked('green'))add('green','🌡 Greenhouse','6 bags');
      if(isUnlocked('home')&&countAll(q=>q.type==='home')===0)add('home','🏠 Home site','4/8/6 bags');
      if(isUnlocked('scare'))add('scare','🎃 Scarecrow','3 🧺 · scares raiders');
      if(isUnlocked('fence'))add('fence','🌵 Cactus fence','2 🧺 · blocks raiders');
    }
  }
  else if(t.type==='paddock'&&S.dfd&&!(S.dfd.herd.x===x&&S.dfd.herd.y===y)){
    add('herd','🐐 Rotate herd here','1⚡ · rested pasture pays 2×');
  }
  else if(t.type==='scare'||t.type==='fence'){
    if(isUnlocked('clear'))add('clear','🧹 Clear','1⚡');
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
  if(MOBILE){box.classList.add('sheet');document.body.appendChild(box);}
  else{
    view.appendChild(box);
    const vr=view.getBoundingClientRect();
    let px=cx-vr.left+10, py=cy-vr.top-10;
    px=Math.min(px,vr.width-box.offsetWidth-8); py=Math.max(6,Math.min(py,vr.height-box.offsetHeight-8));
    box.style.left=px+'px'; box.style.top=py+'px';
  }
}
function smartClick(x,y,cx,cy){
  const t=tileAt(x,y); if(!t)return;
  if(S.mode==='defend'&&S.dfd){
    if(S.dfd.sel){dfdPlace(S.dfd.sel,x,y);buildToolbar();return;}
    if(t.type==='paddock'&&S.dfd.herd&&!(S.dfd.herd.x===x&&S.dfd.herd.y===y)){
      S.dfd.herd={x,y};SFX.gather();popAt(x,y,'🐐 rotated!',0,'earth');
      say(t.soil>=2?'Fresh pasture — double 🧺 on the next graze.':'Thin pasture — let the others rest.');
      refresh();return;
    }
    if(t.type==='bed'&&t.plant&&t.moisture<4){ // hand-water a thirsty tower
      if(S.water>=3){S.water-=3;t.moisture=Math.min(6,t.moisture+2);SFX.water();popAt(x,y,'+2💧',0,'good');refresh();}
      else {say('Water stock is dry — catch the next wet wave or wait on the herd.');flashChip('water');}
      return;
    }
    if(t.type==='rock'||t.deco==='drift'||(t.deco&&TREE_SPECIES.includes(t.deco))){
      if(gatherArm&&gatherArm.x===x&&gatherArm.y===y){clearGatherArm();doTool('gather',x,y);} // second tap: collect
      else armGather(x,y,t); // first tap: show what's on offer
      return;
    }
    say(describe(t,x,y));
    return;
  }
  // instant, unambiguous moves first — the map decides
  if(t.deco==='snake'){doTool('bed',x,y);return;} // any work-click shoos the rattler
  if(t.deco==='javelina'||t.deco==='coyote'){doTool('bed',x,y);return;} // any work-click confronts a raider
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
        javelina:'A JAVELINA — after your garden beds. Click to shoo (1⚡), or let a scarecrow/fence answer at dusk. 🐗',
        coyote:'A COYOTE — circling the coop. Driving it off costs 1⚡ + 1 🧺, or let defenses handle it at dusk. 🐺',
        pinyon:'A pinyon pine — juniper´s upland companion. Pine nuts in a good year.'};
      if(t.deco&&F[t.deco])return F[t.deco];
      return bermReserved(t,x,y)?'Open sand — but spoken for: the swale just uphill saves this spot for its 🧱 berm (1 dirt). Nothing else builds here while the swale stands.':'Open sand — dig, till, or build here.';
    }
    case 'rock':return 'A boulder — 🪓 breaks into 2 stone (1⚡), then it\'s gone. Stone is finite here.';
    case 'swale':return `Swale holding ${t.stored}/${swaleCap(x,y)}L of runoff. Waters its side and downhill neighbors — plus same-level ground on flat terraces.`;
    case 'berm':return 'A berm — banks up the downhill side of a swale so it holds more.';
    case 'wash':return t.deco==='drift'?'Driftwood snagged in the wash — 🪓 an easy 2 wood (1⚡).':t.dam?(t.beaver?`A REAL BEAVER DAM now — ${t.stored}/${BDA_CAP*2}L, self-repairing, snags double debris, and the pair builds upstream. The strongest defense the desert has. 🦫`:`Beaver-dam analog holding ${t.stored}/${BDA_CAP}L (${t.wetDays} wet days — ${RESTO_STAGES[t.resto]}${t.resto<4?', next: '+RESTO_STAGES[t.resto+1]:''}).${t.resto>=2?' Keep it wet — real beavers take over restored dams. 🦫':''}`):'A dry desert wash. Storm water races through — a 🪵 dam would slow it down.';
    case 'ord':return `A one-rock dam${t.stored>0?`, holding a ${t.stored}L puddle`:''}. Silt trapped: ${t.soil}/4 — when it fills, grass takes over.`;
    case 'creek':return t.deco==='drift'?'Driftwood snagged in the creek — 🪓 an easy 2 wood (1⚡).':'A small side creek that runs in storms and feeds the wash. Gentle enough for a 🪨 rock dam.';
    case 'grass':return 'Silt-built grassland — a dam let the water do the work, and the work became land. Till it for a rich, fertile bed.';
    case 'hardpan':return 'Caliche hardpan — desert concrete. Nothing digs it. The only farmland here is the land you build.';
    case 'eroded':return 'An erosion scar — the unslowed flood took this ground. It will not come back.';
    case 'bed':return t.plant?`${CROPS[t.plant.crop].name}, day ${t.plant.grown}/${CROPS[t.plant.crop].days} (${m})`:`Empty bed (${m}).`;
    case 'green':return t.plant?`Greenhouse: ${CROPS[t.plant.crop].name}, day ${t.plant.grown}/${CROPS[t.plant.crop].days}`:'Greenhouse — plant something cozy in here.';
    case 'cistern':return 'Your cistern. +100L cap, +20L every rain.';
    case 'home':{const hp=S.dfd?` ❤${S.dfd.houseHP}/12 — keep the water off it!`:'';
      return ['Home site.','Foundation laid (next: walls, 8 bags).','Walls up (next: roof, 6 bags).','Your finished earthbag home. 🏠'+hp][t.homeStage];}
    case 'coop':return S.dfd&&S.dfd.coopHP<=0?'The wrecked coop — the coyotes won this one. It stays down till season´s end.':'The chicken coop — +2 food in eggs every morning. Coyotes want in; a 🌵 fence beside it keeps them out.'+(S.dfd?` ❤${S.dfd.coopHP}/6`:'');
    case 'paddock':{const here=S.dfd&&S.dfd.herd.x===x&&S.dfd.herd.y===y;
      const st=t.soil>=2?'lush and rested':(t.soil>=1?'grazed but standing':'grazed to dust — it needs rest');
      return `${here?'The goat herd is HERE. ':''}A paddock — ${st}. ${here?'Click another paddock to rotate; rested pasture pays double 🧺.':'Click it to rotate the herd onto it.'}`;}
    case 'scare':return 'Your scarecrow. Raiders within 2 tiles lose their nerve at dusk. 🎃';
    case 'fence':return 'A living prickly-pear fence — soft noses turn back here. 🌵';
  }
  return '';
}

function endDay(){
  if(S.mode==='defend')return; // defend runs on real-time waves, not days
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
      // seeps into the banks — in defend the season is relentless, so the ground drinks fast and capacity comes back
      const seep=S.mode==='defend'?(t.type==='wash'?6:9):(t.type==='wash'?3:1);
      t.stored=Math.max(0,t.stored-seep);
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
  // beavers keep their works in repair — and expand upstream
  for(const pw of washPath){
    const bt=S.grid[pw.y][pw.x];
    if(bt.dam&&bt.beaver){
      bt.wetDays++;
      if(bt.wetDays%4===0){
        const up=washPath.find(q=>q.y<pw.y&&Math.abs(q.x-pw.x)<=1&&!S.grid[q.y][q.x].dam);
        if(up){const ut=S.grid[up.y][up.x];ut.dam=true;ut.stored=4;ut.wetDays=1;
          popAt(up.x,up.y,'🦫 new dam!',600,'good');
          log('🦫 The beavers raised a NEW dam upstream overnight. The pond is becoming a chain.');}
      }
    }
  }

  if(S.weather==='rain'){
    if(S.mode==='defend'&&S.dfd&&dfdWave())showWaveBanner(`⛈ STORM ${S.dfd.wave+1}<small style="font-size:.55em;opacity:.85"> / ${DEF_WAVES.length}</small>`);
    else showWaveBanner('⛈ MONSOON!');
    S.lastRainDay=S.day;
    let caught=8;
    const stormGains=[];
    const R={swales:0,dams:0,beds:0,lostWater:0,sedTrapped:0,sedLost:0,rain:0};
    const RUNR=(S.mode==='defend'&&dfdWave())?dfdWave().run:2;
    for(let x=0;x<COLS;x++){
      let runoff=0, sed=0;
      for(let y=0;y<ROWS;y++){
        runoff+=RUNR; R.rain+=RUNR; // each tile sheds rain, flowing downhill
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
    let flow=(S.mode==='defend'&&dfdWave()?dfdWave().pulse:26)+washExtra, sedFlow=5, ponded=false;
    R.rain+=(S.mode==='defend'&&dfdWave()?dfdWave().pulse:26);
    for(const p of washPath){
      flow+=2; R.rain+=2;
      const t=S.grid[p.y][p.x];
      if(t.dam){
        const take=Math.max(0,Math.min((t.beaver?BDA_CAP*2:BDA_CAP)-t.stored,flow));
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
    // a beaver pair moves into a well-restored dam — the strongest defense the desert has
    for(const pw of washPath){
      const bt=S.grid[pw.y][pw.x];
      if(bt.dam&&!bt.beaver&&bt.resto>=2&&bt.wetDays>=10){
        bt.beaver=true;
        popAt(pw.x,pw.y,'🦫 BEAVERS MOVED IN!',900,'good');
        log('🦫 A beaver pair claimed your dam! Twice the pond, self-repairing, and they build upstream on their own. You changed the land enough that the land´s own engineers came back.');
        say('🦫 Beavers claimed a dam — the wash has a keeper now.');
        break;
      }
    }
    if(S.mode==='defend'&&S.dfd&&!S.dfd.won&&!S.dfd.lost){
      const W=dfdWave();
      let hurt=0; const hits=[];
      // rockslides — loosed boulders barreling down random columns
      let rocksStopped=0;
      for(let i=0;i<W.rocks;i++){
        const col=Math.floor(Math.random()*COLS);
        let stopped=false;
        for(let y=0;y<ROWS-4;y++){
          const t=S.grid[y][col];
          if(t.type==='wash'||t.type==='creek'){stopped=true;break;}
          if(t.type==='berm'||t.type==='rock'||t.type==='ord'){
            S.stone+=2;rocksStopped++;popAt(col,y,'🪨 caught! +2 stone',400+i*350,'earth');stopped=true;break;}
          if(t.type==='swale'){t.stored=0;t.soil=Math.min(6,(t.soil||0)+2);
            popAt(col,y,'🪨 mudded the swale',400+i*350,'bad');stopped=true;break;}
        }
        if(!stopped){hurt++;hits.push('a rockslide');popAt(col,ROWS-3,'🪨 CRASH!',400+i*350,'bad');}
      }
      if(rocksStopped)log(`🪨 Your berms and dams caught ${rocksStopped} rockslide${rocksStopped>1?'s':''} — +${rocksStopped*2} stone.`);
      // log rams riding the surge — dams snag them for wood
      let deb=W.debris, snagged=0;
      for(const p of washPath){const t=S.grid[p.y][p.x];
        if(deb>0&&t.dam){const take=t.beaver?2:1;const got=Math.min(deb,take);deb-=got;snagged+=got;S.wood+=got*2;
          if(got)popAt(p.x,p.y,`🪵 snagged ×${got}! +${got*2} wood`,700,'earth');}}
      if(snagged)log(`🪵 Your dams snagged ${snagged} log ram${snagged>1?'s':''} — +${snagged*2} wood.`);
      if(deb>0){hurt+=deb;hits.push(`${deb} log ram${deb>1?'s':''}`);}
      // the flood itself
      const fl=Math.floor(Math.max(0,R.lostWater-260)/110); // the flat forgives a base flow — past that, every ~110L is a heart
      if(fl>0){hurt+=fl;hits.push(`the flood (${R.lostWater}L)`);}
      dfdDamage(hurt,hits.length?hits:['nothing']);
      S.dfd.wave++;
      dfdUnlocks();
      if(S.dfd.wave<DEF_WAVES.length){
        const nw=DEF_WAVES[S.dfd.wave];
        log(`⛈ Storm ${S.dfd.wave+1}/10 arrives day ${nw.day} — heavier rain${nw.rocks?', '+nw.rocks+' rockslides':''}${nw.debris?', '+nw.debris+' log rams':''}. Build.`);
      }
      if(S.dfd.wave>=DEF_WAVES.length&&!S.dfd.lost)setTimeout(dfdVictory,900);
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
  agStalk:new THREE.CylinderGeometry(0.02,0.038,1.0,6),
  coopBox:new THREE.BoxGeometry(0.58,0.4,0.44),
  coopRoof:new THREE.BoxGeometry(0.68,0.06,0.54),
  postG:new THREE.CylinderGeometry(0.026,0.032,0.32,5),
  railG:new THREE.BoxGeometry(0.5,0.035,0.035),
  lodgeG:new THREE.SphereGeometry(0.24,8,6,0,Math.PI*2,0,Math.PI/2),
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
const toonRamp=(()=>{ // 3-band ramp: shadow / mid / light — the cartoon look in one texture
  const d=new Uint8Array([104,104,104,255, 182,182,182,255, 246,246,246,255]);
  const tx=new THREE.DataTexture(d,3,1,THREE.RGBAFormat);
  tx.minFilter=THREE.NearestFilter;tx.magFilter=THREE.NearestFilter;tx.needsUpdate=true;
  return tx;
})();
const lam=(c,o)=>new THREE.MeshToonMaterial(Object.assign({color:c,gradientMap:toonRamp},o||{}));
const M={
  sand:[lam(0xeec46a),lam(0xe8b95a),lam(0xdfae4e)],
  swale:lam(0xc4a05e),
  swaleDeep:lam(0xa07d47),
  water:new THREE.MeshPhongMaterial({color:0x35b5e8,transparent:true,opacity:0.85,shininess:110,specular:0xbdeaff}),
  coopWood:lam(0xb0713a),
  coopRoofM:lam(0x8a4f2a),
  hen:lam(0xf5efe2),
  comb:lam(0xd23b2e),
  goat:lam(0xd8d0c2),
  goatDark:lam(0x8a7f6f),
  straw:lam(0xd9c27e),
  scarShirt:lam(0x9c4f3f),
  javelina:lam(0x4a4038),
  coyote:lam(0xb99a6b),
  pastureLush:lam(0x7fae56),
  pastureOk:lam(0xa8b06a),
  pastureDust:lam(0xc9b98a),
  glassDead:lam(0x9aa0a2),
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
  // three snag builds — same silvered wood, different tangles
  const dv=Math.floor(((((r*2.618)%1)+1)%1)*3);
  if(dv===0){ // log + stub + splinter (classic)
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
  } else if(dv===1){ // two logs crossed by the current
    const a=new THREE.Mesh(G.logG,M.drift);
    a.position.set(0,y0+0.055,0);a.rotation.z=Math.PI/2-0.06;a.rotation.y=r;a.castShadow=true;g.add(a);
    const b=new THREE.Mesh(G.logG,M.drift2);
    b.scale.set(0.8,0.9,0.8);b.position.set(0.03,y0+0.1,0.02);
    b.rotation.z=Math.PI/2+0.1;b.rotation.y=r+1.15;b.castShadow=true;g.add(b);
  } else { // one gnarled snag, roots up
    const log=new THREE.Mesh(G.logG,M.drift);
    log.scale.set(1.15,0.85,1.15);log.position.set(0,y0+0.06,0);
    log.rotation.z=Math.PI/2-0.16;log.rotation.y=r;log.castShadow=true;g.add(log);
    const s1=new THREE.Mesh(G.stubG,M.drift2);
    s1.position.set(Math.cos(r)*0.12,y0+0.16,-Math.sin(r)*0.12);
    s1.rotation.z=0.55;s1.rotation.y=r+0.5;s1.castShadow=true;g.add(s1);
    const s2=new THREE.Mesh(G.stubG,M.drift2);
    s2.position.set(-Math.cos(r)*0.16,y0+0.12,Math.sin(r)*0.16);
    s2.rotation.z=-0.7;s2.rotation.y=r+2.2;s2.castShadow=true;g.add(s2);
  }
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
        if(t.beaver){ // the pair moved in: a stick lodge on the pond and its keeper out front
          const lodge=mesh(G.lodgeG,M.drift,0.22,0.24,-0.22);
          lodge.scale.set(1.15,0.95,1.15);g.add(lodge);
          const l2=mesh(G.stubG,M.drift2,0.3,0.4,-0.16,{noShadow:true});l2.rotation.z=0.9;g.add(l2);
          const l3=mesh(G.stubG,M.drift2,0.12,0.4,-0.3,{noShadow:true});l3.rotation.z=-0.7;g.add(l3);
          const bv=mesh(G.fruit,M.junT,-0.2,0.3,0.05,{noShadow:true});
          bv.scale.set(3,2.2,3.6);g.add(bv);
          const bh=mesh(G.tipS,M.junT,-0.2,0.34,0.22,{noShadow:true});bh.scale.setScalar(1.8);g.add(bh);
          const tail=mesh(G.bermPool,M.snakeD,-0.2,0.28,-0.13,{noShadow:true});
          tail.rotation.x=-Math.PI/2;tail.scale.set(0.35,0.5,1);g.add(tail);
          animated.push({mesh:bv,phase:t.rot,baseY:0.3});
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
    // three boulder builds — one family (same stone materials, same chunky forms), different piles
    const rr=t.rot, rvi=Math.floor(((((rr*2.618)%1)+1)%1)*3);
    if(rvi===0){ // lone boulder with satellites
      const rk=mesh(G.rock,M.rock,0,0.42,0);
      rk.rotation.set(rr,rr*1.7,0);g.add(rk);
      const p1=mesh(G.pebble,M.eroded2,0.26*Math.cos(rr),0.33,0.24*Math.sin(rr),{noShadow:true});
      p1.scale.setScalar(1.3);p1.rotation.y=rr*2;g.add(p1);
      const p2=mesh(G.pebble,M.stone,-0.24*Math.cos(rr*1.3),0.32,-0.2*Math.sin(rr),{noShadow:true});
      p2.scale.setScalar(0.9);g.add(p2);
    } else if(rvi===1){ // split pair leaning together
      const a1=mesh(G.rock,M.rock,-0.12,0.4,0.05);a1.scale.set(0.85,1,0.88);a1.rotation.set(rr,rr*1.3,0.22);g.add(a1);
      const a2=mesh(G.rock,M.rock,0.16,0.38,-0.07);a2.scale.set(0.72,0.82,0.74);a2.rotation.set(rr*0.7,rr*2.1,-0.26);g.add(a2);
      const p=mesh(G.pebble,M.stone,0.02,0.31,0.25,{noShadow:true});p.scale.setScalar(1.1);g.add(p);
    } else { // low stacked slabs
      const s1=mesh(G.rock,M.rock,0,0.35,0);s1.scale.set(1.18,0.48,1.08);s1.rotation.y=rr;g.add(s1);
      const s2=mesh(G.rock,M.eroded2,0.05,0.47,-0.03);s2.scale.set(0.88,0.36,0.82);s2.rotation.y=rr+0.5;g.add(s2);
      const s3=mesh(G.rock,M.stone,-0.05,0.56,0.04);s3.scale.set(0.52,0.3,0.5);s3.rotation.y=rr+1.1;g.add(s3);
    }
  }
  if(t.deco&&t.deco!=='rock'){
    const r=t.rot;
    // stable per-tile variation: same family silhouette + materials, different individuals
    const vr=k=>(((r*k)%1)+1)%1;
    const vi=Math.floor(vr(2.618)*3); // 0|1|2
    switch(t.deco){
      case 'drift':addDrift(g,r,0.3);break;
      case 'saguaro':{
        // young spear / classic / old giant — always the same green column
        const hs=[0.78,1,1.2][vi];
        const trunk=mesh(G.sagT,M.saguaro,0,0.3+0.42*hs,0);
        trunk.scale.set(vi===0?1.14:1,hs,vi===0?1.14:1);
        trunk.rotation.z=(vi===2?0.055:0.03)*Math.sin(r*3);g.add(trunk);
        const nArms=vi===0?0:(vi===1?1+Math.floor(vr(7)*2):2+Math.floor(vr(7)*2)); // 0 / 1–2 / 2–3 arms
        const armSpots=[[0.17,0.75,Math.sin(r)*0.05,-0.25],[-0.16,0.6,Math.cos(r)*0.05,0.3],[0.05,0.9,-0.12,0.15]];
        for(let ai=0;ai<nArms;ai++){
          const [ax,ay,az,tilt]=armSpots[ai];
          const arm=mesh(G.sagA,M.saguaro,ax,ay*hs,az);
          arm.rotation.z=tilt;
          arm.scale.setScalar(0.8+0.3*vr(11+ai));
          g.add(arm);
        }
        break;}
      case 'juniper':{
        // compact dome / tall old-growth / wind-swept — always the shaggy strawberry body
        const lean=vi===2?0.2:0;
        const tr1=mesh(G.junTrunk,M.junT,0,0.42,0);
        tr1.scale.set(0.8,vi===1?0.78:0.55,0.8);g.add(tr1);
        const body=new THREE.Mesh(G.junBody,M.junF);
        body.position.set(lean*0.35,0.42+(vi===1?0.08:0),0);body.rotation.y=r;body.rotation.z=lean;
        if(vi===1)body.scale.set(0.92,1.2,0.92);
        if(vi===2)body.scale.set(1.1,0.78,1.1);
        body.castShadow=true;g.add(body);
        const blobs=vi===0?[[0.16,0.6,0.06,0.45],[-0.14,0.72,-0.05,0.4],[0.02,0.88,0.1,0.32],[-0.08,0.5,0.14,0.42]]
          :vi===1?[[0.1,0.96,0.04,0.4],[-0.1,0.72,-0.06,0.42],[0.04,1.14,0.02,0.28],[-0.05,0.52,0.12,0.4]]
          :[[0.26,0.56,0.06,0.46],[0.08,0.7,-0.08,0.4],[0.34,0.72,0.08,0.3],[-0.04,0.48,0.13,0.38]]; // pushed leeward
        for(const [cx2,cy2,cz2,s] of blobs){
          const b=mesh(G.junB,M.junF2,cx2,cy2,cz2);
          b.scale.setScalar(s);b.rotation.y=r+cx2*4;g.add(b);
        }
        break;}
      case 'pinyon':{
        // single cone / two-tier / stout-wide — always the dark pine cone on a short trunk
        g.add(mesh(G.trkS,M.junT,0,0.42,0));
        if(vi===0){ g.add(mesh(G.pinC,M.pinyon,0,0.78,0)); }
        else if(vi===1){
          const c1=mesh(G.pinC,M.pinyon,0,0.72,0);c1.scale.set(1.1,0.85,1.1);g.add(c1);
          const c2=mesh(G.pinC,M.pinyon,0,1.04,0);c2.scale.set(0.68,0.72,0.68);g.add(c2);
        } else {
          const c=mesh(G.pinC,M.pinyon,0,0.7,0);c.scale.set(1.38,0.75,1.38);g.add(c);
        }
        break;}
      case 'ocotillo':{
        // sparse young / classic / grand old fan — always splayed canes with red tips
        const base=0.3;
        const nC=[5,7,9][vi], reach=[0.85,1,1.12][vi];
        for(let i=0;i<nC;i++){
          const a=r+i*(Math.PI*2/nC);
          const t1=0.26+((i%3)*0.07)+(vi===2?0.05:0);
          const d1=new THREE.Vector3(Math.sin(t1)*Math.cos(a),Math.cos(t1),Math.sin(t1)*Math.sin(a));
          const s1=new THREE.Mesh(G.ocoSeg1,M.ocoS);
          s1.scale.y=reach;
          s1.position.set(d1.x*0.225*reach,base+d1.y*0.225*reach,d1.z*0.225*reach);
          s1.quaternion.setFromUnitVectors(UPV,d1);
          s1.castShadow=true;g.add(s1);
          const t2=t1+0.38;
          const d2=new THREE.Vector3(Math.sin(t2)*Math.cos(a),Math.cos(t2),Math.sin(t2)*Math.sin(a));
          const jx=d1.x*0.45*reach, jy=base+d1.y*0.45*reach, jz=d1.z*0.45*reach;
          const s2=new THREE.Mesh(G.ocoSeg2,M.ocoS);
          s2.scale.y=reach;
          s2.position.set(jx+d2.x*0.19*reach,jy+d2.y*0.19*reach,jz+d2.z*0.19*reach);
          s2.quaternion.setFromUnitVectors(UPV,d2);
          s2.castShadow=true;g.add(s2);
          g.add(mesh(G.tipS,M.ocoT,jx+d2.x*0.4*reach,jy+d2.y*0.4*reach,jz+d2.z*0.4*reach,{noShadow:true}));
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
        if(vi===1){ // grand old rosette — an extra ring, wider splay
          ring(10,1.1,0,0.19,1.9);
          ring(7,0.6,0.3,0.2,1.5);
          ring(5,0.28,0.7,0.12,1.1);
        } else {
          ring(8,1.05,0,0.15,1.6);   // outer — splayed wide
          ring(6,0.55,0.4,0.17,1.3); // mid — half-raised
        }
        const c=mesh(G.agL,M.agave2,0,base+0.19,0);c.scale.set(1.1,1.15,1.1);g.add(c); // heart spike
        if(vi===2){ // the once-in-decades bloom stalk
          const st=new THREE.Mesh(G.agStalk,M.junT);
          st.position.set(0.02,base+0.6,0);st.rotation.z=0.05*Math.sin(r);st.castShadow=true;g.add(st);
          for(const [bx,by,bz] of [[0.08,1.02,0.02],[-0.07,0.92,-0.03],[0.05,0.82,-0.06],[-0.04,0.72,0.05]]){
            const bl=mesh(G.tipS,M.pvFlower,bx,base+by,bz,{noShadow:true});
            bl.scale.setScalar(1.8);g.add(bl);
          }
        }
        break;}
      case 'mesquite':{
        // classic lean / old broad double-trunk / young scrub — always the flat-topped canopy
        if(vi===0){
          const tr=mesh(G.trkS,M.junT,0,0.44,0);tr.rotation.z=0.2;g.add(tr);
          const c1=mesh(G.canB,M.mesq,0.05,0.72,0);c1.scale.set(1.35,0.5,1.3);g.add(c1);
          const c2=mesh(G.canB,M.mesq,-0.15,0.66,0.1);c2.scale.set(0.8,0.4,0.8);g.add(c2);
        } else if(vi===1){
          const ta=mesh(G.trkS,M.junT,-0.08,0.44,0);ta.rotation.z=0.32;g.add(ta);
          const tb=mesh(G.trkS,M.junT,0.1,0.42,0.04);tb.rotation.z=-0.28;g.add(tb);
          const c1=mesh(G.canB,M.mesq,0,0.78,0);c1.scale.set(1.7,0.5,1.55);g.add(c1);
          const c2=mesh(G.canB,M.mesq,0.32,0.7,0.12);c2.scale.set(0.9,0.4,0.85);g.add(c2);
          const c3=mesh(G.canB,M.mesq,-0.34,0.68,-0.1);c3.scale.set(0.8,0.38,0.8);g.add(c3);
        } else {
          const tr=mesh(G.trkS,M.junT,0,0.4,0);tr.rotation.z=0.24;tr.scale.set(0.8,0.8,0.8);g.add(tr);
          const c1=mesh(G.canB,M.mesq,0.06,0.6,0);c1.scale.set(0.95,0.38,0.9);g.add(c1);
        }
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
        const MAINS=[3,2,4][vi], L1=[0.42,0.52,0.34][vi]; // standard / tall & sparse / dense & low
        for(let i=0;i<MAINS;i++){
          const az=r+i*(Math.PI*2/MAINS)+0.3*Math.sin(r+i);
          const tip1=seg(0,0.3,0,dirAt(0.24+0.07*Math.sin(r+i),az),L1,0);
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
      case 'javelina':{
        const body=mesh(G.canB,M.javelina,0,0.46,0);
        body.scale.set(0.62,0.48,0.85);body.rotation.y=r;g.add(body);
        const head=mesh(G.pinC,M.javelina,Math.sin(r)*0.28,0.44,Math.cos(r)*0.28);
        head.scale.set(0.5,0.55,0.5);head.rotation.x=Math.PI/2.3;head.rotation.y=r;g.add(head);
        const snout=mesh(G.tipS,M.snakeD,Math.sin(r)*0.38,0.4,Math.cos(r)*0.38,{noShadow:true});
        snout.scale.setScalar(1.4);g.add(snout);
        for(const sx of [-0.05,0.05]){
          const tusk=mesh(G.tipS,M.hen,Math.sin(r)*0.36+sx,0.36,Math.cos(r)*0.36,{noShadow:true});
          tusk.scale.setScalar(0.6);g.add(tusk);
        }
        const bristle=mesh(G.canB,M.snakeD,0,0.58,-Math.cos(r)*0.08);
        bristle.scale.set(0.3,0.16,0.5);bristle.rotation.y=r;g.add(bristle);
        break;}
      case 'coyote':{
        const body=mesh(G.canB,M.coyote,0,0.5,0);
        body.scale.set(0.42,0.4,0.78);body.rotation.y=r;g.add(body);
        const head=mesh(G.canB,M.coyote,Math.sin(r)*0.3,0.62,Math.cos(r)*0.3);
        head.scale.set(0.26,0.26,0.34);head.rotation.y=r;g.add(head);
        for(const ex of [-0.06,0.06]){
          const ear=mesh(G.pinC,M.coyote,Math.sin(r)*0.3+ex,0.74,Math.cos(r)*0.3,{noShadow:true});
          ear.scale.set(0.16,0.28,0.16);g.add(ear);
        }
        const tail=mesh(G.stubG,M.coyote,-Math.sin(r)*0.36,0.44,-Math.cos(r)*0.36,{noShadow:true});
        tail.rotation.z=0.9;tail.rotation.y=r;tail.scale.setScalar(1.4);g.add(tail);
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
        // classic / tall columnar / massive spreading — always the billowy crown on a stout pale trunk
        const form=[
          {ts:[1.5,0.85],c:[[1.5,1.0,1.4,0,1.62,0],[0.95,0.7,0.9,0.45,1.4,0.12],[0.85,0.62,0.8,-0.42,1.38,-0.1]]},
          {ts:[1.2,1.05],c:[[1.15,1.05,1.1,0,1.95,0],[0.8,0.75,0.75,0.3,1.62,0.1],[0.7,0.6,0.7,-0.28,1.55,-0.08]]},
          {ts:[1.85,0.8],c:[[1.75,0.95,1.6,0,1.55,0],[1.05,0.7,1.0,0.6,1.35,0.15],[0.95,0.65,0.9,-0.55,1.3,-0.12],[0.8,0.55,0.75,0.1,1.18,0.45]]},
        ][vi];
        const tr=mesh(G.trunkT,M.cwBark,0,0.68,0);tr.scale.set(form.ts[0],form.ts[1],form.ts[0]);g.add(tr);
        const l1=mesh(G.trunkT,M.cwBark,0.16,1.1,0.04);l1.rotation.z=-0.45;l1.scale.set(0.62,0.42,0.62);g.add(l1);
        const l2=mesh(G.trunkT,M.cwBark,-0.15,1.08,-0.04);l2.rotation.z=0.5;l2.scale.set(0.55,0.38,0.55);g.add(l2);
        let ci=0;
        for(const [sx,sy,sz,px,py,pz] of form.c){
          const c=new THREE.Mesh(G.cwCrown,M.cwLeaf);
          c.scale.set(sx,sy,sz);c.position.set(px,py,pz);c.rotation.y=r*(1+ci*0.7);
          c.castShadow=true;g.add(c);ci++;
        }
        break;}
      case 'pricklypear':{
        // classic clump / big old thicket / young two-pad — always the flat green pads
        const pads=[
          [[0,0.42,0,1.3,1.5],[0.15,0.5,0.08,1,1.2],[-0.15,0.46,-0.06,0.9,1.1]],
          [[0,0.42,0,1.4,1.55],[0.2,0.52,0.1,1.05,1.25],[-0.2,0.48,-0.08,1,1.2],[0.08,0.64,-0.12,0.75,0.95],[-0.07,0.6,0.14,0.7,0.9]],
          [[0,0.4,0,1.1,1.3],[0.13,0.5,0.05,0.8,1]],
        ][vi];
        for(const [px,py,pz,sx,sy] of pads){
          const p=mesh(G.pad,M.pear,px,py,pz);p.scale.set(sx,sy,0.55);p.rotation.y=r+px*3;g.add(p);
        }
        const fSpots=[[0.1,0.68,0.06],[-0.14,0.64,-0.05],[0.03,0.76,-0.1]];
        const nFruit=vi===1?3:(vi===0?1:0); // old thickets heavy with fruit, young ones bare
        for(let fi=0;fi<nFruit;fi++)g.add(mesh(G.fruit,M.fruit,fSpots[fi][0],fSpots[fi][1]+(vi===1?0.06:0),fSpots[fi][2]));
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
    const dead=S.dfd&&S.dfd.ghHP<=0;
    const box=mesh(G.ghBox,dead?M.glassDead:M.glass,0,dead?0.45:0.53,0,{noShadow:true});
    if(dead){box.rotation.z=0.14;box.scale.y=0.7;}
    g.add(box);
    const roof=mesh(G.ghRoof,dead?M.glassDead:M.glass,0,dead?0.72:0.9,0,{noShadow:true});
    roof.rotation.y=Math.PI/4;
    if(dead)roof.rotation.z=0.3;
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
  if(t.type==='coop'){
    const dead=S.dfd&&S.dfd.coopHP<=0;
    const bx=mesh(G.coopBox,M.coopWood,0,0.52,0);
    if(dead){bx.rotation.z=0.2;bx.position.y=0.46;}
    g.add(bx);
    const rf=mesh(G.coopRoof,M.coopRoofM,0,dead?0.62:0.76,0);
    rf.rotation.z=dead?0.5:0.08;g.add(rf);
    if(!dead){
      const ramp=mesh(G.railG,M.coopRoofM,0.22,0.38,0.28);ramp.rotation.z=0.5;ramp.rotation.y=0.5;g.add(ramp);
      for(const [hx,hz,hs] of [[0.3,-0.12,1],[-0.28,0.2,0.85]]){
        const hen=mesh(G.fruit,M.hen,hx,0.36,hz,{noShadow:true});hen.scale.set(hs*1.6,hs*1.4,hs*1.6);g.add(hen);
        const cb=mesh(G.tipS,M.comb,hx,0.44*hs+0.02,hz,{noShadow:true});cb.scale.setScalar(0.7);g.add(cb);
      }
    }
  }
  if(t.type==='paddock'){
    const past=new THREE.Mesh(G.otile,t.soil>=2?M.pastureLush:(t.soil>=1?M.pastureOk:M.pastureDust));
    past.rotation.x=-Math.PI/2;past.position.y=0.35;g.add(past);
    for(const [px,pz] of [[-0.42,-0.42],[0.42,-0.42],[-0.42,0.42],[0.42,0.42]]){
      g.add(mesh(G.postG,M.junT,px,0.5,pz));
    }
    for(const [rx,rz,ry] of [[0,-0.42,0],[0,0.42,0],[-0.42,0,Math.PI/2],[0.42,0,Math.PI/2]]){
      const rail=mesh(G.railG,M.junT,rx,0.56,rz);rail.rotation.y=ry;g.add(rail);
    }
    if(S.dfd&&S.dfd.herd.x===x&&S.dfd.herd.y===y){
      for(const [gx2,gz2,gs] of [[-0.14,0.05,1],[0.16,-0.1,0.9],[0.04,0.2,0.75]]){
        const body=mesh(G.canB,M.goat,gx2,0.47,gz2);body.scale.set(0.42*gs,0.34*gs,0.55*gs);g.add(body);
        const head=mesh(G.tipS,M.goatDark,gx2,0.56*gs+0.02,gz2+0.28*gs,{noShadow:true});head.scale.setScalar(2.2*gs);g.add(head);
      }
    }
  }
  if(t.type==='sling'){
    for(let i=0;i<3;i++){
      const a=i*(Math.PI*2/3)+0.4;
      const leg=mesh(G.postG,M.junT,Math.cos(a)*0.16,0.52,Math.sin(a)*0.16);
      leg.rotation.z=Math.cos(a)*0.35;leg.rotation.x=-Math.sin(a)*0.35;leg.scale.set(1,1.5,1);g.add(leg);
    }
    const arm=mesh(G.railG,M.coopRoofM,0,0.82,0);arm.rotation.z=0.55;arm.rotation.y=t.rot;g.add(arm);
    const pouch=mesh(G.tipS,M.snakeD,Math.cos(t.rot)*0.24,0.94,Math.sin(t.rot)*0.24,{noShadow:true});pouch.scale.setScalar(2.2);g.add(pouch);
    for(const [px,pz,ps] of [[0.2,-0.16,1.3],[0.1,-0.24,1],[0.26,-0.05,0.9]]){
      const st2=mesh(G.pebble,M.stone,px,0.36,pz,{noShadow:true});st2.scale.setScalar(ps*0.8);g.add(st2);
    }
  }
  if(t.type==='scare'){
    const post=mesh(G.postG,M.junT,0,0.62,0);post.scale.set(1,1.9,1);g.add(post);
    const arms=mesh(G.railG,M.scarShirt,0,0.78,0);arms.scale.set(1.3,1.8,1.8);g.add(arms);
    const body=mesh(G.canB,M.scarShirt,0,0.66,0);body.scale.set(0.5,0.62,0.4);g.add(body);
    const head=mesh(G.fruit,M.straw,0,0.98,0,{noShadow:true});head.scale.setScalar(2.4);g.add(head);
    const hat=mesh(G.pinC,M.coopRoofM,0,1.12,0,{noShadow:true});hat.scale.set(0.55,0.35,0.55);g.add(hat);
  }
  if(t.type==='fence'){
    for(const [fx,fz,fr] of [[-0.26,0.05,0.2],[0.02,-0.08,-0.15],[0.28,0.06,0.3]]){
      const p=mesh(G.pad,M.pear,fx,0.5,fz);p.scale.set(1.15,1.45,0.5);p.rotation.y=fr+t.rot;g.add(p);
      const p2=mesh(G.pad,M.pear,fx+0.06,0.66,fz);p2.scale.set(0.7,0.9,0.4);p2.rotation.y=fr+t.rot+0.4;g.add(p2);
    }
    g.add(mesh(G.fruit,M.fruit,0.1,0.78,0.05,{noShadow:true}));
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
  if((['berm','bda','ord','home'].includes(S.tool)&&canAct(S.tool,t,x,y))||(S.tool==='swale'&&canAct('berm',t,x,y))||(bermReserved(t,x,y)&&!t.deco)){
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
let gatherArm=null; // first tap shows the badge; a second tap before it fades collects
function clearGatherArm(){
  if(gatherArm){clearTimeout(gatherArm.t1);clearTimeout(gatherArm.t2);gatherArm.el.remove();gatherArm=null;}
}
function armGather(x,y,t){
  clearGatherArm();
  const isRock=t.type==='rock';
  const el=document.createElement('div');
  el.className='htag gtag armed';
  el.innerHTML=(isRock?'🪨':'🪵')+'<small>+2</small>';
  el.title='Tap again to collect';
  el.addEventListener('click',e=>{e.stopPropagation();clearGatherArm();doTool('gather',x,y);});
  view.appendChild(el);
  gatherArm={x,y,el,
    t1:setTimeout(()=>{el.classList.add('fading');},2000),
    t2:setTimeout(()=>{clearGatherArm();},2650)};
  SFX.tick();
}
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
    else if(t&&(t.deco==='javelina'||t.deco==='coyote')){
      const el=document.createElement('div');
      el.className='htag rtag';el.textContent=t.deco==='javelina'?'🐗':'🐺';
      el.title=t.deco==='javelina'?'Shoo the javelina (1⚡)':'Drive off the coyote (1⚡ + 1 🧺)';
      el.addEventListener('click',e=>{e.stopPropagation();doTool('bed',x,y);});
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
    case 'cistern':return t.type==='sand'&&!bermReserved(t,x,y);
    case 'ord':return t.type==='creek'&&S.stone>=2;
    case 'berm':{const up=tileAt(x,y-1);return t.type==='sand'&&!nearWash(x,y)&&up&&up.type==='swale';}
    case 'bed':return (t.type==='sand'||t.type==='grass')&&!bermReserved(t,x,y);
    case 'green':return (t.type==='sand'||t.type==='bed')&&!t.plant&&!bermReserved(t,x,y);
    case 'home':return t.type==='home'?t.homeStage<3:(t.type==='sand'&&countAll(q=>q.type==='home')===0&&!bermReserved(t,x,y));
    case 'bda':return t.type==='wash'&&!t.dam;
    case 'water':return (t.type==='bed'||t.type==='green');
    case 'harvest':return !!t.plant&&t.plant.grown>=CROPS[t.plant.crop].days;
    case 'scare':case 'fence':return t.type==='sand'&&!bermReserved(t,x,y);
    case 'clear':return ['swale','berm','bed','ord','grass','scare','fence'].includes(t.type)||(t.type==='wash'&&t.dam);
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
  sunny:{bg:0x8fd4f0,fog:0xaedcf2,sunI:0.82,sunC:0xfff2cf,hemiI:0.5},
  scorcher:{bg:0xffca7a,fog:0xf0bd80,sunI:1.0,sunC:0xffe0a8,hemiI:0.42},
  cloudy:{bg:0xcfdde4,fog:0xc4d2da,sunI:0.6,sunC:0xf2efe4,hemiI:0.85},
  rain:{bg:0x6d93b8,fog:0x7d9cb5,sunI:0.28,sunC:0xbccbd6,hemiI:0.75},
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
const cam={theta:0.18,phi:0.95,dist:22,cz:0};
function updateCamera(){
  cam.phi=Math.max(0.35,Math.min(1.35,cam.phi));
  cam.dist=Math.max(7,Math.min(46,cam.dist));
  camera.position.set(
    Math.sin(cam.theta)*Math.sin(cam.phi)*cam.dist,
    Math.cos(cam.phi)*cam.dist,
    Math.cos(cam.theta)*Math.sin(cam.phi)*cam.dist
  );
  camera.lookAt(0,1.9,cam.cz||0);
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
  hideCtx();noteInput();
  dragging=true;moved=0;painted=false;lastPaint=null;downX=lastX=e.clientX;downY=lastY=e.clientY;
  try{el.setPointerCapture(e.pointerId);}catch(err){}
  if(e.pointerType==='touch'){ // long-press = inspect (the phone's right-click)
    if(pressTimer)clearTimeout(pressTimer);
    const px=e.clientX, py=e.clientY;
    pressTimer=setTimeout(()=>{
      pressTimer=null;
      if(moved>9||touchN>=2)return;
      const p=pickTile({clientX:px,clientY:py});
      if(p){
        const t=tileAt(p.x,p.y);
        if(t){
          if(navigator.vibrate)navigator.vibrate(15);
          say(describe(t,p.x,p.y));
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
    if(S.mode==='defend'&&BT&&!S.dfd.sel){ // battle: tap a monster to smack it
      const c=pickCreep(e);
      if(c){hurtCreep(c,1,'tap');SFX.rattle();return;}
    }
    const p=pickTile(e);
    if(p)smartClick(p.x,p.y,e.clientX,e.clientY);
  }
});
el.addEventListener('pointerleave',()=>{hoverMesh.visible=false;hovered=null;});
el.addEventListener('wheel',e=>{e.preventDefault();cam.dist+=e.deltaY*0.012;updateCamera();},{passive:false});
el.addEventListener('contextmenu',e=>{
  e.preventDefault();noteInput();
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
    hoverMesh.material=(S.mode==='defend'&&S.dfd&&S.dfd.sel)?(dfdCanPlace(S.dfd.sel,p.x,p.y)?M.hoverOk:M.hoverBad)
      :(S.tool==='inspect'?M.hover:(canAct(S.tool,t,p.x,p.y)?M.hoverOk:M.hoverBad));
    hoverMesh.visible=true;
    if(S.tool==='inspect')say(describe(t,p.x,p.y));
  }
}

/* --- HUD --- */
let prevRes={};
function refresh(){
  hideCtx();
  document.getElementById('daybox').textContent=`Day ${S.day}`;
  document.getElementById('verlabel').textContent=`v5.1 · ${S.mode==='defend'&&S.dfd?('L'+(S.dfd.level+1)+' · wave '+Math.min(S.dfd.wave+1,dfdWaves().length)+'/'+dfdWaves().length):(S.mode==='campaign'?('classic '+Math.min(S.chapter+1,CHAPTERS.length)+'/'+CHAPTERS.length):'sandbox')}`;
  const res={water:S.water,seeds:S.seeds,food:S.food,dirt:S.dirt,stone:S.stone,wood:S.wood,bags:S.bags,energy:S.energy,sup:S.dfd?S.dfd.supplies:0};
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
    (showBags?`<span class="chip${bump('bags')}" data-k="bags">🧱 ${S.bags} <small>bags</small></span>`:'')+
    (S.mode==='defend'&&S.dfd?`<span class="chip${bump('sup')}" data-k="sup">🧺 ${S.dfd.supplies} <small>supplies</small></span>`:'');
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
    document.getElementById('bigClock').classList.toggle('freeplay',S.mode==='free');
  document.getElementById('bigClock').classList.toggle('defend',S.mode==='defend');
  }
  const G2=document.getElementById('goals');
  const objs=chapterObjectives();
  if(S.mode==='defend'&&S.dfd){
    const D=S.dfd, nw=D.wave<dfdWaves().length?dfdWaveComp(D.wave):null;
    document.getElementById('goalstitle').textContent=D.lost?'💔 The season won':(D.won?'🏆 Season survived!':(D.phase==='wave'?`⚔ WAVE ${D.wave+1}/${dfdWaves().length} — FIGHT!`:`${nw&&nw.type==='wet'?'🌧':'☀️'} Wave ${D.wave+1}/${dfdWaves().length} incoming`));
    const hb=(cur,max,ic)=>`<div class="hrow">${ic} <span class="hearts">${'❤️'.repeat(cur)}${'🖤'.repeat(Math.max(0,max-cur))}</span></div>`;
    G2.innerHTML=hb(D.houseHP,12,'🏠')+hb(D.ghHP,6,'🌡')+hb(D.coopHP,6,'🐔')
      +(nw&&D.phase!=='wave'?`<div class="todo">next: ${dfdPreviewStr(D.wave)}</div>`:'')
      +`<div class="todo" style="opacity:.8">${nw&&nw.type==='dry'?'dry wave — guard the water you banked':'wet wave — every drop caught is money'}</div>`
      +`<div class="fplink" onclick="location.reload()">back to title</div>`;
  } else if(objs){
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
  updateNowChip();
  rebuildAll();
}

/* ============ JUICE KIT — pops, flights, banners ============ */
const tilePops=[]; // {x,y,t0} — placed things land with a squash-and-stretch
function bounceTile(x,y){tilePops.push({x,y,t0:performance.now()});}
function animateTilePops(){
  for(let i=tilePops.length-1;i>=0;i--){
    const p=tilePops[i], el=(performance.now()-p.t0)/380;
    const grp=tileGroups[p.y]&&tileGroups[p.y][p.x];
    if(!grp){tilePops.splice(i,1);continue;}
    if(el>=1){grp.scale.set(1,1,1);tilePops.splice(i,1);continue;}
    const k=el<0.4?(0.72+0.9*el):(1.08-0.08*((el-0.4)/0.6)); // squash in, overshoot, settle
    grp.scale.set(k,0.7+0.5*k,k);
  }
}
function screenPosOf(x,y){ // world tile -> CSS px in #view
  const t=tileAt(x,y); if(!t)return null;
  const v=new THREE.Vector3(gx(x),t.elev+0.5,gz(y)).project(camera);
  const r=view.getBoundingClientRect();
  return {x:(v.x*0.5+0.5)*r.width,y:(-v.y*0.5+0.5)*r.height};
}
function flyRes(x,y,chipKey,emoji,count){ // resources fly home to their counter
  const from=screenPosOf(x,y); if(!from)return;
  const chip=document.querySelector(`#chips .chip[data-k="${chipKey}"]`)||document.getElementById('bcEnergy');
  const vr2=view.getBoundingClientRect();
  let to={x:vr2.width/2,y:20};
  if(chip){const cr=chip.getBoundingClientRect();to={x:cr.left-vr2.left+cr.width/2,y:cr.top-vr2.top+cr.height/2};}
  const n=Math.min(count||1,3);
  for(let i=0;i<n;i++){
    const el=document.createElement('div');
    el.className='flyres';el.textContent=emoji;
    view.appendChild(el);
    const t0=performance.now()+i*90, dur=620;
    const cx2=(from.x+to.x)/2+(i-1)*34, cy2=Math.min(from.y,to.y)-70;
    const step=()=>{
      const el2=(performance.now()-t0)/dur;
      if(el2<0){requestAnimationFrame(step);return;}
      if(el2>=1){el.remove();
        if(chip){chip.classList.remove('bump');void chip.offsetWidth;chip.classList.add('bump');}
        return;}
      const u=1-el2;
      el.style.left=(u*u*from.x+2*u*el2*cx2+el2*el2*to.x-10)+'px';
      el.style.top =(u*u*from.y+2*u*el2*cy2+el2*el2*to.y-10)+'px';
      el.style.transform=`scale(${1.1-0.5*el2})`;
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
}
function showWaveBanner(html){
  const b=document.getElementById('waveBanner');
  if(!b)return;
  b.innerHTML=html;
  b.classList.remove('show');void b.offsetWidth;b.classList.add('show');
}

/* ============ GUIDANCE (v3.6) — pinned Now chip + two-stage idle beacon ============
   Research-backed: one glanceable objective at all times; after ~8s of hesitation a soft
   pulse marks a good tile (never a popup, never an input lock); ~22s adds one quiet chime
   + the full objective line; cancels instantly on any input. Idle nudging is campaign-only —
   free play stays invitation-only. Tap the chip any time for a pull-hint. */
let lastInputT=performance.now(), hintStage=0, lastBeaconT=0, beaconFx=null, chipCool=0, _nowKey='', lastGuidT=0;
function noteInput(){lastInputT=performance.now();hintStage=0;killBeacon();}
function modalUp(){
  for(const id of ['intro','chap','report','win','lost','saveovl']){
    const el2=document.getElementById(id); if(el2&&!el2.classList.contains('hidden'))return true;
  }
  return !!document.getElementById('ctx');
}
const FREE_GOALS=[['swale','Dig your first swale','swale'],['rain','Catch a monsoon rain','end'],
  ['bda','Dam the wash (BDA)','bda'],['harvest','Harvest a crop','harvest'],
  ['cistern','Build a cistern','cistern'],['green','Build a greenhouse','green'],['home','Finish the earthbag home','home']];
function nowObjective(){
  if(S.mode==='defend'&&S.dfd){
    const D=S.dfd;
    if(D.won||D.lost)return null;
    if(D.phase==='wave')return {key:'dfd:fight'+D.wave,text:`WAVE ${D.wave+1}/${dfdWaves().length} — hold the line!`,full:'Tap water monsters to smack them. Slurped drops become 💧. Keep plant-towers watered — thirsty towers go silent.',hint:null};
    const nw=dfdWaveComp(D.wave);
    return {key:'dfd:prep'+D.wave,text:`${nw.type==='wet'?'🌧':'☀️'} Wave ${D.wave+1} in ${Math.max(0,Math.ceil(D.phaseT))}s — place towers`,
      full:`Next: ${dfdPreviewStr(D.wave)}. ${nw.type==='wet'?'Wet wave — swale pairs and dams turn the monsters into money.':'DRY wave — heat imps drink your water and raiders come for the farm. Scarecrows, fences, and shooters.'}`,hint:'pair'};
  }
  if(S.mode==='campaign'){
    const objs=chapterObjectives(); if(!objs)return null;
    for(let i=0;i<objs.length;i++)if(!objs[i].check())
      return {key:S.chapter+':'+i,text:objs[i].s||objs[i].t,full:objs[i].t,hint:objs[i].hint};
    return null;
  }
  if(S.mode==='free'){
    for(const [k,l,h] of FREE_GOALS)if(!S.goals[k])return {key:'free:'+k,text:l,full:l,hint:h};
  }
  return null;
}
function bestPairSpot(){ // swale site with the longest clean uphill fetch and a free saved spot below
  let best=null,bf=-1;
  for(let y=1;y<ROWS-1;y++)for(let x=0;x<COLS;x++){
    const t=tileAt(x,y),b=tileAt(x,y+1);
    if(!t||t.type!=='sand'||t.deco||nearWash(x,y))continue;
    if(!b||b.type!=='sand'||b.deco||nearWash(x,y+1))continue;
    let f=0;for(let yy=y-1;yy>=0;yy--){const u=tileAt(x,yy);if(!u||['wash','creek','swale'].includes(u.type))break;f++;}
    if(f>bf){bf=f;best={x,y};}
  }
  return best;
}
function findTile(fn){for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++){const t=S.grid[y][x];if(t&&fn(t,x,y))return {x,y};}return null;}
function hintTarget(h){
  if(!h)return null;
  if(h==='pair'){const b=bestPairSpot();return b||null;}
  if(h==='end'||S.energy<1)return 'end';
  switch(h){
    case 'swale':{
      const open=findTile((t,x,y)=>t.type==='swale'&&(()=>{const b=tileAt(x,y+1);return b&&bermReserved(b,x,y+1)&&!b.deco;})());
      if(open)return {x:open.x,y:open.y+1}; // an unfinished pair — its saved spot is the move
      return bestPairSpot();
    }
    case 'bed':
      return findTile((t,x,y)=>t.type==='sand'&&!t.deco&&!bermReserved(t,x,y)&&!nearWash(x,y)&&neighbors(x,y).some(n=>n.type==='swale'))
        ||findTile((t,x,y)=>!t.deco&&canAct('bed',t,x,y));
    case 'water':return findTile(t=>(t.type==='bed'||t.type==='green')&&t.plant&&t.moisture<2)
        ||findTile(t=>t.type==='bed'&&t.plant);
    case 'harvest':return findTile(t=>!!t.plant&&t.plant.grown>=CROPS[t.plant.crop].days)
        ||findTile(t=>!!t.plant);
    case 'gather':return (S.lv.stone<2?findTile(t=>t.type==='rock'):null)
        ||findTile(t=>t.deco==='drift'||(t.deco&&TREE_SPECIES.includes(t.deco)))
        ||findTile(t=>t.type==='rock');
    case 'ord':return (S.stone<2?findTile(t=>t.type==='rock'):null)
        ||findTile((t,x,y)=>canAct('ord',t,x,y))||findTile(t=>t.type==='creek');
    case 'bda':return (S.wood<3?findTile(t=>t.deco==='drift'||(t.deco&&TREE_SPECIES.includes(t.deco))):null)
        ||findTile(t=>t.type==='wash'&&!t.dam);
    case 'home':return findTile(t=>t.type==='home'&&t.homeStage<3)
        ||(S.bags>=4?findTile((t,x,y)=>canAct('home',t,x,y)):null); // short on bags → the dock button is already highlighted
    case 'cistern':case 'green':return S.bags>=(h==='cistern'?4:6)?findTile((t,x,y)=>canAct(h,t,x,y)):null;
    default:
      if(h.startsWith('plant-'))return S.seeds>0?findTile(t=>(t.type==='bed'||t.type==='green')&&!t.plant):null;
      return null;
  }
}
const beaconGeo=new THREE.RingGeometry(0.34,0.46,28);
const beaconArrowGeo=new THREE.ConeGeometry(0.17,0.4,4);
function killBeacon(){
  if(beaconFx){
    scene.remove(beaconFx.mesh);beaconFx.mesh.material.dispose();
    if(beaconFx.arrow){scene.remove(beaconFx.arrow);beaconFx.arrow.material.dispose();}
    beaconFx=null;
  }
  const fab=document.getElementById('endFab'); if(fab)fab.classList.remove('hintPulse');
}
function fireBeacon(){
  killBeacon();
  const o=nowObjective(); if(!o)return false;
  const tgt=hintTarget(o.hint); if(!tgt)return false;
  if(tgt==='end'){
    const fab=document.getElementById('endFab');
    fab.classList.remove('hintPulse');void fab.offsetWidth;fab.classList.add('hintPulse');
    setTimeout(()=>fab.classList.remove('hintPulse'),2600);
    return true;
  }
  const t=tileAt(tgt.x,tgt.y); if(!t)return false;
  const m=new THREE.Mesh(beaconGeo,new THREE.MeshBasicMaterial({color:0x2fca62,transparent:true,opacity:0.9,side:THREE.DoubleSide,depthWrite:false}));
  m.rotation.x=-Math.PI/2;
  m.position.set(gx(tgt.x),t.elev+0.45,gz(tgt.y));
  scene.add(m);
  const ar=new THREE.Mesh(beaconArrowGeo,new THREE.MeshBasicMaterial({color:0x2fca62,transparent:true,opacity:0.95,depthWrite:false}));
  ar.rotation.x=Math.PI; // point DOWN at the tile
  ar.position.set(gx(tgt.x),t.elev+1.5,gz(tgt.y));
  scene.add(ar);
  beaconFx={mesh:m,arrow:ar,baseY:t.elev,t0:performance.now()};
  return true;
}
function guidanceTick(){
  if(!S.mode||modalUp()||S.won)return;
  if(S.mode==='free')return; // free play never nudges — invitations only
  if(S.mode==='campaign'&&chapterDone())return;
  if(S.mode==='defend'&&(!S.dfd||S.dfd.won||S.dfd.lost))return;
  const now=performance.now(), idle=now-lastInputT;
  if(idle<8000)return;
  if(hintStage===0){fireBeacon();hintStage=1;lastBeaconT=now;return;}
  if(hintStage===1&&idle>22000){
    const o=nowObjective();
    if(o&&fireBeacon()){SFX.hint();say('🎯 '+o.full);}
    hintStage=2;lastBeaconT=now;return;
  }
  if(hintStage===2&&now-lastBeaconT>14000){fireBeacon();lastBeaconT=now;}
}
function updateNowChip(){
  const chip=document.getElementById('nowchip'), txt=document.getElementById('nowtext');
  if(!chip)return;
  const o=nowObjective();
  if(!o){chip.classList.add('hidden');_nowKey='';return;}
  chip.classList.remove('hidden');
  if(o.key!==_nowKey){
    txt.textContent=o.text;
    if(_nowKey){chip.classList.remove('pop');void chip.offsetWidth;chip.classList.add('pop');}
    _nowKey=o.key;
  }
}
document.getElementById('nowchip').addEventListener('click',()=>{
  const now=performance.now(); if(now<chipCool)return; chipCool=now+4000;
  const o=nowObjective(); if(!o)return;
  say('🎯 '+o.full);
  fireBeacon(); // if nothing marks, the say line + highlighted dock button carry it
});


/* ================================================================
   DEFEND v2 — real-time castle defense on the watershed
   Wet waves: the water IS the monsters — slurp them and it becomes
   your money. Dry waves: heat imps, dust devils, tumbleweeds, and
   raiders come to burn the water you banked. Plants are towers and
   thirst is their ammo. No days, no energy — only the season.
   ================================================================ */
const DLEVELS=[
 {name:'First Monsoon', sub:'a gentle bajada', par:'learn the water',
  terrain:{cols:12,rows:20,flatRows:4,flatP:0.45,steepP:0.05,rocks:12,creeks:1,minCreeks:1,name:'a gentle bajada',flora:['saguaro','paloverde','pricklypear','ocotillo']},
  start:{water:30,cap:60,seeds:6,dirt:4,stone:2,wood:3,sup:2},
  intro:'The season opens easy — six waves on a kind slope. Learn the loop: <b>slurp the wet waves into money</b>, keep your plant-towers watered, and let nothing reach the yard.',
  waves:[
   {type:'wet',drops:1,surge:1},
   {type:'wet',drops:2,surge:1},
   {type:'dry',imps:2,tumble:3},
   {type:'wet',drops:2,surge:2,rocks:1},
   {type:'dry',imps:3,tumble:4,jav:1},
   {type:'wet',drops:3,surge:2,logs:1},
  ]},
 {name:'The Creeklands', sub:'a steep rocky slope', par:'stone country',
  terrain:{cols:13,rows:22,flatRows:4,flatP:0.2,steepP:0.25,rocks:20,creeks:3,minCreeks:2,name:'the creeklands',flora:['juniper','agave','ocotillo','saguaro']},
  start:{water:26,cap:60,seeds:6,dirt:4,stone:4,wood:2,sup:2},
  intro:'Steep, stony, and quick to shed rain. Three creeks want <b>rock dams</b>, the slopes throw <b>rockslides</b> — berms and boulders stop them cold and pay you stone for the trouble.',
  waves:[
   {type:'wet',drops:2,surge:1},
   {type:'wet',drops:2,surge:2,rocks:1},
   {type:'dry',imps:3,tumble:5},
   {type:'wet',drops:3,surge:2,rocks:2},
   {type:'dry',imps:4,tumble:6,jav:1},
   {type:'wet',drops:3,surge:3,rocks:2,logs:1},
   {type:'dry',imps:5,devils:1,tumble:6,coy:1},
   {type:'wet',drops:4,surge:3,rocks:3,logs:1},
  ]},
 {name:'The Big Wash', sub:'wide wash country', par:'wall the river',
  terrain:{cols:14,rows:24,flatRows:4,flatP:0.4,steepP:0.1,rocks:16,creeks:1,minCreeks:1,name:'wide wash country',flora:['mesquite','saguaro','pricklypear','paloverde']},
  start:{water:28,cap:60,seeds:6,dirt:5,stone:2,wood:5,sup:2},
  intro:'The wash owns this valley — big <b>surges</b> and <b>log rams</b> ride every storm. Wall it with dams, snag the logs for wood, and keep a dam wet long enough… <b>the beavers are watching</b>. 🦫',
  waves:[
   {type:'wet',drops:2,surge:2},
   {type:'wet',drops:2,surge:3,logs:1},
   {type:'dry',imps:3,tumble:4,jav:1},
   {type:'wet',drops:3,surge:3,logs:2},
   {type:'dry',imps:5,devils:1,coy:1},
   {type:'wet',drops:3,surge:4,logs:2,rocks:1},
   {type:'dry',imps:6,devils:1,tumble:6,jav:1,coy:1},
   {type:'wet',drops:4,surge:4,logs:3},
   {type:'wet',drops:4,surge:5,logs:3,rocks:2},
  ]},
 {name:'The Dry Year', sub:'an old floodplain', par:'make it last',
  terrain:{cols:13,rows:24,flatRows:4,flatP:0.5,steepP:0.05,rocks:14,creeks:1,minCreeks:1,name:'an old floodplain',flora:['mesquite','pricklypear','agave']},
  start:{water:45,cap:80,seeds:7,dirt:4,stone:3,wood:3,sup:3},
  intro:'Rain is scarce this year — <b>only three wet waves in nine</b>. Every drop you slurp has to last through heat imps, dust devils, and hungry raiders. Scarcity is the whole level: <b>a dry tower is a silent tower.</b>',
  waves:[
   {type:'wet',drops:2,surge:2},
   {type:'dry',imps:3,tumble:4},
   {type:'dry',imps:4,tumble:4,jav:1},
   {type:'wet',drops:3,surge:2,rocks:1},
   {type:'dry',imps:5,devils:1,coy:1},
   {type:'dry',imps:5,tumble:6,jav:2},
   {type:'dry',imps:6,devils:2,coy:1,jav:1},
   {type:'wet',drops:4,surge:3,logs:1},
   {type:'dry',imps:7,devils:2,tumble:8,jav:2,coy:2},
  ]},
 {name:'The Whole Watershed', sub:'the foot of the mesa', par:'everything at once',
  terrain:{cols:14,rows:26,flatRows:4,flatP:0.3,steepP:0.15,rocks:20,creeks:2,minCreeks:2,name:'the homestead watershed',flora:['saguaro','paloverde','pricklypear','ocotillo','mesquite','juniper','agave']},
  start:{water:30,cap:60,seeds:6,dirt:4,stone:2,wood:3,sup:2},
  intro:'Fourteen waves. Wet and dry, rocks and logs, imps and devils and everything with teeth — the full season on the biggest slope. <b>This is the watershed final.</b>',
  waves:null}, // uses DWAVES below
];
let DEF_PROGRESS=[0,0,0,0,0]; // stars per level, this session
const DWAVES=[
 {type:'wet', drops:1, surge:1},
 {type:'wet', drops:2, surge:1},
 {type:'dry', imps:3, tumble:4},
 {type:'wet', drops:2, surge:2, rocks:1},
 {type:'dry', imps:4, tumble:5, jav:1},
 {type:'wet', drops:3, surge:3, rocks:1, logs:1},
 {type:'dry', imps:5, devils:1, jav:1, coy:1},
 {type:'wet', drops:4, surge:3, rocks:2, logs:2},
 {type:'dry', imps:6, devils:2, tumble:6, coy:1},
 {type:'wet', drops:4, surge:4, rocks:2, logs:2},
 {type:'dry', imps:7, devils:2, tumble:8, jav:2, coy:1},
 {type:'wet', drops:5, surge:5, rocks:3, logs:3},
 {type:'dry', imps:8, devils:3, jav:2, coy:2},
 {type:'wet', drops:6, surge:6, rocks:3, logs:4},
];
const PREP_T=45, INTER_T=26;
// tower cards — the BTD6 dock. cost:{water,seeds,dirt,stone,wood,sup,bags}
const TOWER_CARDS=[
 {id:'plant-pear',  ic:'🌵', name:'Prickly pear', cost:{water:3, seeds:1}, gain:'the starter: plant ANYWHERE, never thirsts — but hits soft', unlockWave:0},
 {id:'pair',  ic:'⛏', name:'Berm & swale', cost:{water:4}, gain:'+2 🟤 · slurps monsters into 💧 · digs its own beds', unlockWave:0},
 {id:'plant-beans', ic:'🫘', name:'Beans',   cost:{water:6, seeds:1}, gain:'rapid seed-slinger · needs a bed', unlockWave:0},
 {id:'plant-corn',  ic:'🌽', name:'Corn',    cost:{water:10,seeds:1}, gain:'kernel lobber · BASE GARDEN only', unlockWave:1},
 {id:'sling', ic:'🪀', name:'Sling tower', cost:{stone:2,wood:2}, gain:'throws stones · cracks boulders', unlockWave:1},
 {id:'plant-squash',ic:'🎃', name:'Squash',  cost:{water:8, seeds:1}, gain:'smasher · BASE GARDEN only', unlockWave:2},
 {id:'bda',   ic:'🪵', name:'Wash dam',  cost:{wood:3,dirt:1}, gain:'walls the wash · snags logs', unlockWave:2},
 {id:'ord',   ic:'🪨', name:'Rock dam',  cost:{stone:2}, gain:'creeks only · grinds what passes', unlockWave:1},
 {id:'scare', ic:'🎃', name:'Scarecrow', cost:{sup:3}, gain:'raiders flee its gaze', unlockWave:3},
 {id:'fence', ic:'🌵', name:'Cactus fence', cost:{sup:2}, gain:'walls out raiders', unlockWave:4},
 {id:'cistern',ic:'🛢', name:'Cistern', cost:{stone:3,wood:3}, gain:'+50 💧 cap · waters the base garden · flat only', unlockWave:2},
 {id:'clearT', ic:'🧹', name:'Clear', cost:{}, gain:'remove a work (berms refund dirt)', unlockWave:0},
];
const CROP_TOWER={ // plants as artillery — thirst is the ammo
 beans: {cd:0.6, range:3.2, dmg:1, splash:0,   drain:5},  // shots per 1 moisture
 corn:  {cd:2.2, range:4.6, dmg:2, splash:1.2, drain:2},
 squash:{cd:1.4, range:1.5, dmg:4, splash:0.9, drain:3},
 pear:  {cd:1.1, range:1.7, dmg:1, splash:0,   drain:0},  // the starter: anywhere, tireless, soft-spoken
};
let BT=null; // live battle bits: creeps/shots
function dfdCard(id){return TOWER_CARDS.find(c=>c.id===id);}
function dfdAfford(c){
  const k=c.cost;
  return (!k.water||S.water>=k.water)&&(!k.seeds||S.seeds>=k.seeds)&&(!k.dirt||S.dirt>=k.dirt)
    &&(!k.stone||S.stone>=k.stone)&&(!k.wood||S.wood>=k.wood)&&(!k.sup||S.dfd.supplies>=k.sup);
}
function dfdPay(c){
  const k=c.cost;
  if(k.water)S.water-=k.water; if(k.seeds)S.seeds-=k.seeds; if(k.dirt)S.dirt-=k.dirt;
  if(k.stone)S.stone-=k.stone; if(k.wood)S.wood-=k.wood; if(k.sup)S.dfd.supplies-=k.sup;
}
function dfdCanPlace(id,x,y){
  const t=tileAt(x,y); if(!t)return false;
  switch(id){
    case 'pair':{const b=tileAt(x,y+1);
      return t.type==='sand'&&!t.deco&&!nearWash(x,y)&&!bermReserved(t,x,y)
        &&!!b&&b.type==='sand'&&!b.deco&&!nearWash(x,y+1);}
    case 'sling':case 'scare':case 'fence':return t.type==='sand'&&!t.deco&&!bermReserved(t,x,y);
    case 'cistern':return t.type==='sand'&&!t.deco&&y>=ROWS-4; // storage lives down at the base
    case 'ord':return t.type==='creek'&&!t.deco;
    case 'bda':return t.type==='wash'&&!t.dam&&!t.deco;
    default:
      if(id.startsWith('plant-')){
        const crop=id.slice(6);
        if(crop==='pear') // the starter grows straight out of the caliche — anywhere open
          return (t.type==='sand'&&!t.deco&&!bermReserved(t,x,y))||(t.type==='bed'&&!t.plant);
        if(t.type!=='bed'||t.plant)return false; // everything else needs a real bed — beds come from berm & swales and the base garden
        if(crop==='corn'||crop==='squash'){
          if(y<ROWS-4)return false;
          const nearWork=[[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>{
            const n=tileAt(x+dx,y+dy);return n&&(n.type==='swale'||n.type==='berm');});
          if(nearWork)return false;
        }
        return true;
      }
      return false;
  }
}
function dfdPlace(id,x,y){
  const c=dfdCard(id); if(!c)return false;
  if(id==='clearT'){
    const t=tileAt(x,y); if(!t)return false;
    if(['swale','berm','bed','ord','scare','fence','sling'].includes(t.type)){
      if(t.type==='berm')S.dirt++;
      if(t.type==='bed'&&t.plant)S.seeds++;
      t.type='sand';t.plant=null;t.stored=0;t.moisture=0;SFX.dig();bounceTile(x,y);
      refresh();return true;
    }
    if(t.type==='wash'&&t.dam&&!t.beaver){t.dam=false;t.stored=0;S.dirt++;SFX.dig();refresh();return true;}
    if(t.beaver){say('The beavers are not leaving. This is their dam now. 🦫');return false;}
    say('Clear removes your own works — swales, berms, beds, dams, crafts.');
    return false;
  }
  if(!dfdAfford(c)){say('Can´t afford it yet — '+dfdCostStr(c)+'.');flashChip(c.cost.water?'water':(c.cost.seeds?'seeds':(c.cost.stone?'stone':(c.cost.wood?'wood':'sup'))));return false;}
  if(id!=='clearT'&&!dfdCanPlace(id,x,y)){say(dfdPlaceHint(id));return false;}
  const t=tileAt(x,y);
  dfdPay(c);
  if(id==='pair'){
    t.type='swale';t.deco=null;S.dirt+=2;
    const b=tileAt(x,y+1);b.type='berm';b.deco=null;
    let beds=0;
    for(const dx of [-1,1]){ // the dug dirt banks its own growing pockets beside the basin
      const n=tileAt(x+dx,y);
      if(n&&n.type==='sand'&&!n.deco&&!nearWash(x+dx,y)&&!bermReserved(n,x+dx,y)){
        n.type='bed';n.moisture=3;beds++;bounceTile(x+dx,y);
      }
    }
    bounceTile(x,y);bounceTile(x,y+1);SFX.dig();
    popAt(x,y,beds?`⛏ +${beds} beds!`:'⛏ pair!',0,'earth');
  } else if(id==='sling'){t.type='sling';t.deco=null;SFX.build();bounceTile(x,y);popAt(x,y,'🪀 armed!',0,'earth');}
  else if(id==='cistern'){
    t.type='cistern';t.deco=null;S.waterCap+=50;
    let beds=0;
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){ // the tank digs a garden ring around itself
      const n=tileAt(x+dx,y+dy);
      if(n&&n.type==='sand'&&!n.deco&&y+dy>=ROWS-4){n.type='bed';n.moisture=4;beds++;bounceTile(x+dx,y+dy);}
    }
    SFX.build();bounceTile(x,y);popAt(x,y,`+50💧 cap${beds?' · +'+beds+' beds':''}`,0,'good');
  }
  else if(id==='ord'){t.type='ord';t.deco=null;t.inCreek=true;SFX.build();bounceTile(x,y);}
  else if(id==='bda'){t.dam=true;SFX.build();bounceTile(x,y);}
  else if(id==='scare'){t.type='scare';t.deco=null;SFX.build();bounceTile(x,y);}
  else if(id==='fence'){t.type='fence';t.deco=null;SFX.plant();bounceTile(x,y);}
  else if(id.startsWith('plant-')){
    if(t.type==='sand'){t.type='bed';t.moisture=2;} // only pear ever arrives on sand
    t.plant={crop:id.slice(6),stage:0,grown:0,wilt:0,grow:0};
    SFX.plant();bounceTile(x,y);
  }
  refresh();
  return true;
}
function dfdCostStr(c){
  const k=c.cost, p=[];
  if(k.water)p.push(k.water+'💧');if(k.seeds)p.push(k.seeds+'🌰');if(k.dirt)p.push(k.dirt+'🟤');
  if(k.stone)p.push(k.stone+'🪨');if(k.wood)p.push(k.wood+'🪵');if(k.sup)p.push(k.sup+'🧺');
  return p.join(' ');
}
function dfdPlaceHint(id){
  switch(id){
    case 'pair':return 'Berm & swale needs two open sand tiles stacked — basin above, bank below, clear of the wash. It digs its own beds beside it.';
    case 'clearT':return 'Tap one of your own works to remove it.';
    case 'ord':return 'Rock dams sit in the small creeks only.';
    case 'bda':return 'Wash dams go on open wash tiles.';
    case 'cistern':return 'The cistern goes on the FLAT, down by the house — storage lives at the base.';
    default:
      if(id==='plant-corn'||id==='plant-squash')return 'The heavy defenders grow only in BASE GARDEN beds — on the flat, never beside swales or berms. The cistern digs beds around itself.';
      if(id==='plant-pear')return 'Prickly pear grows anywhere on open ground — banks included, just never in the wash or creeks themselves.';
      return id.startsWith('plant-')?'Needs an empty bed — berm & swales dig beds beside themselves, and the cistern digs a garden ring.':'Needs open sand.';
  }
}
function dfdWaves(){return (S.dfd&&S.dfd.wavesArr)||DWAVES;}
function dfdWaveComp(i){const W=dfdWaves();return W[Math.min(i,W.length-1)];}
function dfdPreviewStr(i){
  const w=dfdWaveComp(i); if(!w)return '';
  const p=[];
  if(w.type==='wet'){p.push('💧×'+(w.drops*COLS));if(w.surge)p.push('🌊×'+w.surge);}
  else p.push('☀️×'+(w.imps||0));
  if(w.tumble)p.push('🌾×'+w.tumble);
  if(w.devils)p.push('🌪×'+w.devils);
  if(w.rocks)p.push('🪨×'+w.rocks);
  if(w.logs)p.push('🪵×'+w.logs);
  if(w.jav)p.push('🐗×'+w.jav);
  if(w.coy)p.push('🐺×'+w.coy);
  return p.join(' ');
}
function dfdStart(lv){ // called from startMode
  S.dfd.level=lv||0;
  S.dfd.wavesArr=DLEVELS[S.dfd.level].waves||DWAVES;
  S.dfd.phase='prep';S.dfd.phaseT=PREP_T;S.dfd.wave=0;S.dfd.speed=1;S.dfd.sel=null;
  S.dfd.prodT={egg:0,graze:0,grow:0,irr:0,seep:0};
  S.dfd.leakAcc=0;
  dfdUnlocks2();
}
function dfdUnlocks2(){
  const w=S.dfd.wave;
  S.unlocked=['inspect','gather','clear','water','harvest'];
  for(const c of TOWER_CARDS)if(w>=c.unlockWave&&!S.unlocked.includes(c.id))S.unlocked.push(c.id);
}
/* ---------- the battle ---------- */
function dfdStartWave(){
  const D=S.dfd, W=dfdWaveComp(D.wave);
  D.phase='wave';D.phaseT=0;
  BT={creeps:[],shots:[],spawns:[],t:0,grp:new THREE.Group(),wet:W.type==='wet',killed:0,banked:0,leaked:0};
  scene.add(BT.grp);
  const T=26+D.wave*1.2; // spawn window
  const rnd=Math.random;
  if(W.type==='wet'){
    for(let x=0;x<COLS;x++)for(let i=0;i<W.drops;i++)
      BT.spawns.push({at:rnd()*T*0.75,kind:'drop',col:x});
    for(let i=0;i<(W.surge||0);i++)BT.spawns.push({at:2+rnd()*T*0.7,kind:'surge'});
    S.weather='rain';applyWeatherLook();startRain();SFX.rain();
  } else {
    for(let i=0;i<(W.imps||0);i++)BT.spawns.push({at:rnd()*T*0.8,kind:'imp',col:Math.floor(rnd()*COLS)});
    S.weather='scorcher';applyWeatherLook();
  }
  for(let i=0;i<(W.tumble||0);i++)BT.spawns.push({at:rnd()*T*0.8,kind:'tumble',col:Math.floor(rnd()*COLS)});
  for(let i=0;i<(W.devils||0);i++)BT.spawns.push({at:3+rnd()*T*0.6,kind:'devil',col:Math.floor(rnd()*COLS)});
  for(let i=0;i<(W.rocks||0);i++)BT.spawns.push({at:2+rnd()*T*0.6,kind:'boulder',col:Math.floor(rnd()*COLS)});
  for(let i=0;i<(W.logs||0);i++)BT.spawns.push({at:2+rnd()*T*0.6,kind:'log'});
  for(let i=0;i<(W.jav||0);i++)BT.spawns.push({at:4+rnd()*T*0.5,kind:'jav'});
  for(let i=0;i<(W.coy||0);i++)BT.spawns.push({at:5+rnd()*T*0.5,kind:'coy'});
  BT.spawns.sort((a,b)=>a.at-b.at);
  BT.total=BT.spawns.length;
  if(MOBILE)dockCollapse(true); // battle stations: the map is the show
  showWaveBanner((W.type==='wet'?'⛈':'☀️')+' WAVE '+(D.wave+1)+'<small style="font-size:.55em;opacity:.85"> / '+dfdWaves().length+'</small>');
  if(W.type!=='wet')SFX.thunder();
  say(W.type==='wet'?'The storm is HERE — every drop you catch is money. 🌧':'A DRY wave — heat and hunger. Guard your water and your flock. ☀️');
  refresh();
}
const CREEP_DEF={
  drop:  {hp:1, spd:1.5, L:8,  scale:1},
  surge: {hp:3, spd:1.9, L:18, scale:1.5},
  imp:   {hp:2, spd:0.85,L:0,  scale:1.1},
  tumble:{hp:1, spd:3.0, L:0,  scale:1},
  devil: {hp:3, spd:1.5, L:0,  scale:1.4},
  boulder:{hp:3,spd:2.5, L:0,  scale:1.2},
  log:   {hp:2, spd:2.3, L:0,  scale:1},
  jav:   {hp:3, spd:0.8, L:0,  scale:1},
  coy:   {hp:4, spd:1.0, L:0,  scale:1},
};
function creepMesh(kind){
  const g=new THREE.Group();
  const bob=(m)=>{m.userData.bob=1;return m;};
  if(kind==='drop'||kind==='surge'){
    const body=new THREE.Mesh(G.canB,M.water.clone());
    body.scale.setScalar(kind==='drop'?0.5:0.75);body.castShadow=true;g.add(body);
    for(const ex of [-0.09,0.09]){
      const eye=mesh(G.tipS,M.hen,ex*(kind==='drop'?1:1.4),0.12,0.36*(kind==='drop'?0.5:0.75),{noShadow:true});
      eye.scale.setScalar(1.5);g.add(eye);
      const pup=mesh(G.tipS,M.snakeD,ex*(kind==='drop'?1:1.4),0.12,0.42*(kind==='drop'?0.5:0.75),{noShadow:true});
      pup.scale.setScalar(0.7);g.add(pup);
    }
  } else if(kind==='imp'){
    const body=new THREE.Mesh(G.canB,new THREE.MeshBasicMaterial({color:0xff9d3b,transparent:true,opacity:0.85}));
    body.scale.set(0.5,0.62,0.5);g.add(body);
    const crown=mesh(G.pinC,M.pvFlower,0,0.42,0,{noShadow:true});crown.scale.set(0.6,0.5,0.6);g.add(crown);
    for(const ex of [-0.1,0.1]){const eye=mesh(G.tipS,M.snakeD,ex,0.16,0.26,{noShadow:true});eye.scale.setScalar(1.1);g.add(eye);}
  } else if(kind==='tumble'){
    const b=new THREE.Mesh(G.junB,M.drift2);b.scale.setScalar(1.15);b.castShadow=true;g.add(b);
  } else if(kind==='devil'){
    const c1=new THREE.Mesh(G.pinC,new THREE.MeshBasicMaterial({color:0xd9c9a5,transparent:true,opacity:0.7}));
    c1.rotation.x=Math.PI;c1.scale.set(1.1,1.6,1.1);c1.position.y=0.5;g.add(c1);
    const c2=new THREE.Mesh(G.pinC,new THREE.MeshBasicMaterial({color:0xcbb98f,transparent:true,opacity:0.5}));
    c2.rotation.x=Math.PI;c2.scale.set(0.7,1.0,0.7);c2.position.y=0.2;g.add(c2);
  } else if(kind==='boulder'){
    const b=new THREE.Mesh(G.rock,M.rock);b.scale.setScalar(0.9);b.castShadow=true;g.add(b);
  } else if(kind==='log'){
    const b=new THREE.Mesh(G.logG,M.drift);b.rotation.z=Math.PI/2;b.scale.setScalar(1.2);b.castShadow=true;g.add(b);
  } else if(kind==='jav'||kind==='coy'){
    const mtl=kind==='jav'?M.javelina:M.coyote;
    const body=new THREE.Mesh(G.canB,mtl);body.scale.set(kind==='jav'?0.62:0.42,kind==='jav'?0.48:0.4,0.8);body.castShadow=true;g.add(body);
    const head=new THREE.Mesh(G.canB,mtl);head.scale.set(0.24,0.24,0.3);head.position.set(0,0.14,0.42);g.add(head);
    if(kind==='coy')for(const ex of [-0.06,0.06]){const ear=mesh(G.pinC,mtl,ex,0.3,0.42,{noShadow:true});ear.scale.set(0.14,0.24,0.14);g.add(ear);}
  }
  return g;
}
function elevAt(x,yF){
  const y0=Math.max(0,Math.min(ROWS-1,Math.floor(yF))), y1=Math.min(ROWS-1,y0+1);
  const a=S.grid[y0][Math.max(0,Math.min(COLS-1,x))].elev, b=S.grid[y1][Math.max(0,Math.min(COLS-1,x))].elev;
  return a+(b-a)*(yF-y0);
}
function spawnCreep(sp){
  const def=CREEP_DEF[sp.kind];
  const c={kind:sp.kind,hp:def.hp,spd:def.spd,L:def.L,mesh:creepMesh(sp.kind),dead:false,slow:0};
  if((sp.kind==='log'||(sp.kind==='surge'&&Math.random()<0.7))&&washPath.length){c.lane='wash';c.wi=0;}
  else if(sp.kind==='jav'||sp.kind==='coy'){
    c.lane='flank';
    c.fx=Math.random()<0.5?-0.6:COLS-0.4; c.fy=ROWS-3-Math.random()*5;
    let tgt=null,bd=1e9;
    for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++){const t=S.grid[y][x];
      const want=sp.kind==='jav'?(t.type==='bed'):(t.type==='coop'||t.type==='paddock');
      if(want){const d=Math.abs(x-c.fx)+Math.abs(y-c.fy);if(d<bd){bd=d;tgt={x,y};}}}
    c.tgt=tgt||{x:S.dfd.hx,y:ROWS-2};
  }
  else {c.lane='col';c.col=sp.col!==undefined?sp.col:Math.floor(Math.random()*COLS);c.yF=-0.8-Math.random()*0.6;}
  if(c.lane==='wash'){const p0=washPath[0];c.mesh.position.set(gx(p0.x),S.grid[p0.y][p0.x].elev+0.45,gz(p0.y-1));}
  else if(c.lane==='flank')c.mesh.position.set(gx(c.fx),elevAt(Math.round(Math.max(0,Math.min(COLS-1,c.fx))),c.fy)+0.4,gz(c.fy));
  else c.mesh.position.set(gx(c.col),elevAt(c.col,0)+0.6,gz(c.yF));
  BT.grp.add(c.mesh);
  BT.creeps.push(c);
}
function creepPos(c){return c.mesh.position;}
function hurtCreep(c,dmg,src){
  if(c.dead)return;
  c.hp-=dmg;
  if(c.hp<=0){
    c.dead=true;BT.killed++;
    const p=creepPos(c);
    if(c.kind==='drop'||c.kind==='surge'){
      const gain=src==='slurp'?(c.kind==='drop'?6:14):(c.kind==='drop'?2:4);
      const got=Math.min(gain,S.waterCap-S.water);
      if(got>0){S.water+=got;BT.banked+=got;}
      if(Math.random()<0.3)popAt(Math.max(0,Math.min(COLS-1,Math.round(p.x+COLS/2-0.5))),Math.max(0,Math.min(ROWS-1,Math.round(p.z+ROWS/2-0.5))),'+'+got+'💧',0,'good');
      SFX.water();
    } else if(c.kind==='boulder'){S.stone+=2;SFX.gather();}
    else if(c.kind==='log'){S.wood+=2;SFX.gather();}
    else if(c.kind==='imp'){S.water=Math.min(S.waterCap,S.water+2);SFX.tick();}
    else SFX.rattle();
    c.mesh.scale.setScalar(1.4); // pop-out flourish; removed next tick
  }
}
function dfdLeak(c){
  const D=S.dfd;
  c.dead=true;BT.leaked++;
  if(c.kind==='drop')D.leakAcc+=1;
  else if(c.kind==='surge')D.leakAcc+=4;
  else if(c.kind==='boulder'||c.kind==='log'||c.kind==='devil')D.leakAcc+=4;
  else if(c.kind==='tumble'){D.supplies=Math.max(0,D.supplies-1);popAt(D.hx,ROWS-2,'🌾 −1 🧺',0,'bad');}
  while(D.leakAcc>=4){D.leakAcc-=4;dfdDamage(1,['the flood breaking through']);}
}
function towerKey(x,y){return x+'_'+y;}
function dfdCombat(dt){
  const cd=BT.cd=BT.cd||{};
  const inRange=(x,y,c,r)=>{const p=creepPos(c);const dx=p.x-gx(x),dz=p.z-gz(y);return dx*dx+dz*dz<=r*r;};
  const nearest=(x,y,r,filt)=>{let best=null,bd=1e9;
    for(const c of BT.creeps){if(c.dead||filt&&!filt(c))continue;
      const p=creepPos(c);const dx=p.x-gx(x),dz=p.z-gz(y);const d=dx*dx+dz*dz;
      if(d<=r*r&&d<bd){bd=d;best=c;}}
    return best;};
  for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++){
    const t=S.grid[y][x], k=towerKey(x,y);
    cd[k]=(cd[k]||0)-dt;
    if(cd[k]>0)continue;
    if(t.type==='swale'){ // the collector — slurps water monsters
      const c=nearest(x,y,1.8,c2=>c2.kind==='drop'||c2.kind==='surge');
      if(c){hurtCreep(c,3,'slurp');t.stored=Math.min(swaleCap(x,y),t.stored+ (c.kind==='drop'?4:8));cd[k]=t.stored>=swaleCap(x,y)?1.15:0.5;}
      continue;
    }
    if(t.type==='ord'){
      const c=nearest(x,y,1.3,null);
      if(c){hurtCreep(c,2,'grind');cd[k]=0.8;}
      continue;
    }
    if(t.type==='wash'&&t.dam){
      const c=nearest(x,y,1.1,c2=>c2.lane==='wash'||c2.kind==='surge'||c2.kind==='log');
      if(c){
        if(c.kind==='log'){hurtCreep(c,4,'snag');popAt(x,y,'🪵 snagged!',0,'earth');}
        else hurtCreep(c,t.beaver?4:2,'slurp');
        t.stored=Math.min(t.beaver?BDA_CAP*2:BDA_CAP,t.stored+6);
        cd[k]=t.beaver?0.3:0.5;
      }
      continue;
    }
    if(t.type==='sling'){
      const c=nearest(x,y,3.6,null);
      if(c){dfdShoot(x,y,0.9,c,c.kind==='boulder'?2:1,'stone');cd[k]=0.7;}
      continue;
    }
    if(t.type==='home'&&t.homeStage>=3&&S.dfd.houseHP>0){ // the castle fights back
      const c=nearest(x,y,4.5,null);
      if(c){dfdShoot(x,y,1.6,c,1,'stone');cd[k]=1.0;}
      continue;
    }
    if(t.type==='scare'){
      for(const c of BT.creeps)if(!c.dead&&(c.kind==='jav'||c.kind==='coy')&&inRange(x,y,c,2.3)&&!c.fleeing){
        c.fleeing=true;popAt(x,y,'🎃 boo!',0,'earth');
      }
      cd[k]=0.5;continue;
    }
    if(t.type==='fence'){
      const c=nearest(x,y,1.2,c2=>c2.kind==='jav'||c2.kind==='coy'||c2.kind==='tumble');
      if(c){hurtCreep(c,2,'spike');cd[k]=0.7;}
      continue;
    }
    if(t.type==='bed'&&t.plant){
      const P=t.plant, def=CROP_TOWER[P.crop];
      if(!def){continue;}
      if((P.grow||0)<1){cd[k]=0.3;continue;} // still sprouting
      const dry=t.moisture<=0&&def.drain>0;
      if(dry){cd[k]=0.6;continue;} // a thirsty tower is a silent tower
      const c=nearest(x,y,def.range,P.crop==='squash'?(c2=>true):null);
      if(c){
        if(def.splash){dfdShoot(x,y,1.2,c,def.dmg,P.crop==='corn'?'kernel':'smash',def.splash);}
        else dfdShoot(x,y,1.0,c,def.dmg,P.crop==='beans'?'seed':'spike');
        P.shots=(P.shots||0)+1;
        if(def.drain&&P.shots%def.drain===0)t.moisture=Math.max(0,t.moisture-1);
        cd[k]=def.cd;
      }
      continue;
    }
  }
}
function dfdShoot(x,y,h,target,dmg,kind,splash){
  const from=new THREE.Vector3(gx(x),tileAt(x,y).elev+h,gz(y));
  const m=new THREE.Mesh(G.tipS,kind==='seed'?M.junT:(kind==='kernel'?M.pvFlower:M.stone));
  m.scale.setScalar(kind==='smash'?2.6:1.7);
  m.position.copy(from);
  BT.grp.add(m);
  BT.shots.push({m,target,dmg,splash:splash||0,t:0,from,kind});
  if(kind==='seed')SFX.tick();else if(kind==='kernel')SFX.plant();else SFX.gather();
}
function dfdMoveCreeps(dt){
  const FLAT=ROWS-4;
  for(const c of BT.creeps){
    if(c.dead)continue;
    const bobT=(BT.t*6+ (c.col||0));
    if(c.lane==='col'){
      c.yF+=c.spd*dt*(c.slow>0?0.5:1);
      const t=S.grid[Math.max(0,Math.min(ROWS-1,Math.floor(c.yF)))]?.[c.col];
      // channels swallow sheet monsters — they join the wash
      if(t&&(t.type==='wash'||t.type==='creek')&&(c.kind==='drop')){ if(washPath.length){c.lane='wash';c.wi=washPath.findIndex(p=>p.y>=Math.floor(c.yF))||0;if(c.wi<0)c.wi=0;} }
      if(c.kind==='boulder'){ // structures stop the slide cold
        const tt=S.grid[Math.max(0,Math.min(ROWS-1,Math.floor(c.yF)))]?.[c.col];
        if(tt&&(tt.type==='berm'||tt.type==='rock'||tt.type==='ord')){hurtCreep(c,99,'block');popAt(c.col,Math.floor(c.yF),'🪨 caught! +2',0,'earth');continue;}
      }
      if(c.kind==='imp'){ // heat imps hunt the wettest ground and drink it
        c.evT=(c.evT||0)+dt;
        if(c.evT>2.2){c.evT=0;
          const cy=Math.max(0,Math.min(ROWS-1,Math.floor(c.yF)));
          for(let yy=cy-1;yy<=cy+1;yy++)for(let xx=c.col-1;xx<=c.col+1;xx++){
            const q=(S.grid[yy]||[])[xx];if(!q)continue;
            if(q.type==='bed'&&q.moisture>0)q.moisture--;
            if(q.type==='swale'&&q.stored>0)q.stored=Math.max(0,q.stored-2);
          }
          if(S.water>0&&Math.random()<0.4){S.water--;flashChip('water');}
        }
      }
      if(c.kind==='devil'){ // dust devils wander and wreck what they touch
        c.col+=Math.sin(BT.t*1.3+c.yF)*dt*1.2;
        c.col=Math.max(0,Math.min(COLS-1,c.col));
        const cy=Math.max(0,Math.min(ROWS-1,Math.floor(c.yF)));
        const q=S.grid[cy][Math.round(c.col)];
        if(q&&['scare','fence','sling','bed'].includes(q.type)&&!c.hitT){
          c.hitT=1;
          if(q.type==='bed'){q.plant=null;popAt(Math.round(c.col),cy,'🌪 tore the crop!',0,'bad');}
          else {q.type='sand';popAt(Math.round(c.col),cy,'🌪 wrecked it!',0,'bad');}
          hurtCreep(c,99,'spent');continue;
        }
      }
      if(c.yF>=FLAT){dfdLeak(c);continue;}
      c.mesh.position.set(gx(c.col),elevAt(Math.round(c.col),c.yF)+(c.kind==='devil'?0.3:0.42)+Math.sin(bobT)*0.06,gz(c.yF));
      if(c.kind==='tumble'||c.kind==='boulder')c.mesh.rotation.x+=dt*7;
      if(c.kind==='devil')c.mesh.rotation.y+=dt*12;
    } else if(c.lane==='wash'){
      c.wi+=c.spd*dt*(c.slow>0?0.5:1);
      if(c.wi>=washPath.length){dfdLeak(c);continue;}
      const p=washPath[Math.floor(c.wi)];
      c.mesh.position.set(gx(p.x),S.grid[p.y][p.x].elev+0.42+Math.sin(bobT)*0.05,gz(p.y));
      if(c.kind==='log')c.mesh.rotation.y+=dt*3;
    } else { // flank
      if(c.fleeing){
        c.fx+=(c.fx<COLS/2?-1:1)*c.spd*1.6*dt;
        if(c.fx<-1||c.fx>COLS){c.dead=true;continue;}
      } else {
        const dx=c.tgt.x-c.fx, dy=c.tgt.y-c.fy, d=Math.hypot(dx,dy);
        if(d<0.4){ // the raid lands
          const q=tileAt(c.tgt.x,c.tgt.y);
          if(c.kind==='jav'&&q&&q.type==='bed'){q.plant=null;q.type='sand';popAt(c.tgt.x,c.tgt.y,'🐗 rooted it up!',0,'bad');}
          else if(c.kind==='coy'){S.dfd.coopHP=Math.max(0,S.dfd.coopHP-1);popAt(c.tgt.x,c.tgt.y,'🐺 −1 ❤',0,'bad');
            if(S.dfd.coopHP<=0)log('🐔 The coop is wrecked — no eggs till season´s end.');}
          c.fleeing=true;SFX.rattle();continue;
        }
        c.fx+=dx/d*c.spd*dt;c.fy+=dy/d*c.spd*dt;
      }
      const cxi=Math.max(0,Math.min(COLS-1,Math.round(c.fx)));
      c.mesh.position.set(gx(c.fx),elevAt(cxi,Math.max(0,Math.min(ROWS-1,c.fy)))+0.4+Math.abs(Math.sin(bobT*1.4))*0.08,gz(c.fy));
      c.mesh.rotation.y=Math.atan2((c.tgt?c.tgt.x-c.fx:1),(c.tgt?c.tgt.y-c.fy:0));
    }
  }
}
function dfdMoveShots(dt){
  for(const sh of BT.shots){
    if(sh.done)continue;
    sh.t+=dt*2.6;
    const tp=sh.target&&!sh.target.dead?creepPos(sh.target):sh.last||sh.from;
    sh.last=tp.clone?tp.clone():tp;
    const u=Math.min(1,sh.t);
    sh.m.position.lerpVectors(sh.from,sh.last,u);
    sh.m.position.y+=Math.sin(u*Math.PI)*0.8;
    if(u>=1){
      sh.done=true;BT.grp.remove(sh.m);
      if(sh.splash){
        for(const c of BT.creeps){if(c.dead)continue;
          const p=creepPos(c);const dx=p.x-sh.m.position.x,dz=p.z-sh.m.position.z;
          if(dx*dx+dz*dz<=sh.splash*sh.splash)hurtCreep(c,sh.dmg,'splash');}
      } else if(sh.target&&!sh.target.dead)hurtCreep(sh.target,sh.dmg,'shot');
    }
  }
  BT.shots=BT.shots.filter(sh=>!sh.done);
}
function dfdProduction(dt){ // the farm economy runs on its own clocks
  const D=S.dfd, P=D.prodT;
  P.egg+=dt;P.graze+=dt;P.grow+=dt;P.irr+=dt;P.seep+=dt;
  if(P.egg>=30){P.egg=0;
    if(D.coopHP>0){S.food+=2;const c=dfdFindType('coop');if(c){popAt(c.x,c.y,'+2 🥣',0,'good');flyRes(c.x,c.y,'food','🥚',2);}}}
  if(P.graze>=25){P.graze=0;
    const h=tileAt(D.herd.x,D.herd.y);
    if(h&&h.type==='paddock'){
      const y2=h.soil>=2?2:(h.soil>=1?1:0);
      if(y2>0){D.supplies+=y2;popAt(D.herd.x,D.herd.y,`+${y2} 🧺`,0,'good');flyRes(D.herd.x,D.herd.y,'sup','🧺',y2);}
      h.soil=Math.max(0,h.soil-1);
    }
    for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++){const t=S.grid[y][x];
      if(t.type==='paddock'&&!(D.herd.x===x&&D.herd.y===y)&&t.soil<2){t.regrow=(t.regrow||0)+1;if(t.regrow>=2){t.soil++;t.regrow=0;}}}
  }
  if(P.grow>=1){P.grow=0;
    for(const row of S.grid)for(const t of row)
      if(t.type==='bed'&&t.plant&&(t.plant.grow||0)<1){
        t.plant.grow=(t.plant.grow||0)+1/8; // 8s to stand up
        t.plant.grown=Math.round(Math.min(1,t.plant.grow)*CROPS[t.plant.crop].days); // reuse growth visuals
        if(t.plant.grow>=1){t.plant.grown=CROPS[t.plant.crop].days-0.001;popAt(tileXY(t)?.x??0,tileXY(t)?.y??0,'ready!',0,'good');}
      }
  }
  if(P.irr>=4){P.irr=0; // swales water the beds beside them — position IS irrigation
    for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++){const t=S.grid[y][x];
      if(t.type==='swale'&&t.stored>0){
        for(const [dx,dy] of [[1,0],[-1,0],[0,1]]){
          const n=tileAt(x+dx,y+dy);
          if(n&&n.type==='bed'&&n.moisture<4){n.moisture++;t.stored--;break;}
        }
      }
      if(t.type==='wash'&&t.dam&&t.stored>0){
        for(const n of neighbors(x,y))if(n.type==='bed'&&n.moisture<5){n.moisture++;t.stored--;break;}
      }
      if(t.type==='cistern'&&S.water>0){ // the cistern keeps the base garden fighting
        for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){
          const n=tileAt(x+dx,y+dy);
          if(n&&n.type==='bed'&&n.moisture<5&&S.water>0){n.moisture++;S.water--;}
        }
      }
    }
  }
  if(P.seep>=6){P.seep=0; // ground drinks: capacity comes back
    for(const row of S.grid)for(const t of row){
      if(t.type==='swale'&&t.stored>0)t.stored--;
      if(t.type==='wash'&&t.dam&&t.stored>0){t.stored=Math.max(0,t.stored-(t.beaver?1:2));
        t.wetS=(t.wetS||0)+6;
        // life comes back to a wet dam — and then the beavers do
        if(t.wetS>40&&t.resto<1)t.resto=1;
        if(t.wetS>80&&t.resto<2){t.resto=2;log('Willows on the dam — keep it wet. Something is watching from downstream. 🌿');}
        if(t.wetS>150&&!t.beaver){t.beaver=true;popAt(tileXY(t)?.x??0,tileXY(t)?.y??0,'🦫 BEAVERS!',0,'good');
          log('🦫 A beaver pair claimed your dam — double pond, self-repairing, and they build upstream.');}
      }
      if(t.beaver&&(t.wetS||0)>0&&Math.floor(t.wetS)%60===0){
        const pw=washPath.find(q=>S.grid[q.y][q.x]===t);
        if(pw){const up=washPath.find(q=>q.y<pw.y&&Math.abs(q.x-pw.x)<=1&&!S.grid[q.y][q.x].dam);
          if(up){S.grid[up.y][up.x].dam=true;popAt(up.x,up.y,'🦫 new dam!',0,'good');}}
      }
    }
  }
}
function dfdTick(dtMs){
  const D=S.dfd; if(!D||D.won||D.lost)return;
  if(modalUp())return; // the season pauses for reading, nothing else
  let acc=(D._acc||0)+dtMs*(D.speed||1);
  let steps=0;
  while(acc>=50&&steps<160){
    acc-=50;steps++;
    const dt=0.05;
    if(D.phase==='prep'||D.phase==='inter'){
      D.phaseT-=dt;
      dfdProduction(dt);
      if(D.phaseT<=0)dfdStartWave();
    } else if(D.phase==='wave'&&BT){
      BT.t+=dt;
      while(BT.spawns.length&&BT.spawns[0].at<=BT.t){spawnCreep(BT.spawns.shift());}
      dfdMoveCreeps(dt);
      dfdCombat(dt);
      dfdMoveShots(dt);
      dfdProduction(dt);
      // clear the fallen
      for(const c of BT.creeps)if(c.dead&&c.mesh.parent){BT.grp.remove(c.mesh);}
      BT.creeps=BT.creeps.filter(c=>!c.dead);
      if(!BT.spawns.length&&!BT.creeps.length)dfdEndWave();
      if(D.lost)break;
    }
  }
  D._acc=acc;
  dfdHUD();
}
function dfdEndWave(){
  const D=S.dfd;
  scene.remove(BT.grp);
  const wet=BT.wet;
  if(wet){const nC=countAll(t=>t.type==='cistern');if(nC){const got=Math.min(15*nC,S.waterCap-S.water);if(got>0){S.water+=got;BT.banked+=got;}}}
  const summary=`${wet?'🌧':'☀️'} Wave ${D.wave+1} cleared — ${BT.killed} down, ${BT.leaked} through${wet?`, +${BT.banked}💧 banked`:''}.`;
  BT=null;
  S.weather='sunny';applyWeatherLook();
  D.wave++;
  S.seeds+=2;S.dirt+=1;
  dfdUnlocks2();buildToolbar();
  log(summary);say(summary+' +2🌰 +1🟤');
  if(D.wave>=dfdWaves().length){dfdVictory2();return;}
  D.phase='inter';D.phaseT=INTER_T;
  const nw=dfdWaveComp(D.wave);
  showWaveBanner((nw.type==='wet'?'🌧':'☀️')+' NEXT: '+dfdPreviewStr(D.wave).split(' ').slice(0,3).join(' '));
  refresh();
}
function dfdVictory2(){
  const D=S.dfd; if(D.won)return;
  D.won=true;S.won=true;SFX.fanfare();setTimeout(()=>SFX.fanfare(),700);
  const h=dfdHearts(), stars=h>=20?3:(h>=12?2:1);
  D.stars=stars;
  DEF_PROGRESS[D.level]=Math.max(DEF_PROGRESS[D.level]||0,stars);
  const L=DLEVELS[D.level], hasNext=D.level<DLEVELS.length-1;
  document.getElementById('wintext').innerHTML=
    `<b>${L.name}</b> — held through all ${dfdWaves().length} waves. ${'★'.repeat(stars)}${'☆'.repeat(3-stars)}<br>`+
    `House ${D.houseHP}/12 ❤ · Greenhouse ${D.ghHP}/6 · Coop ${D.coopHP}/6<br>`+
    `${countAll(t=>t.beaver)?'The beavers hold the wash now — the strongest tower is the one that builds itself. 🦫':'The desert kept what you gave it.'}`;
  const wb=document.querySelectorAll('#win button');
  if(wb.length>=2){
    if(hasNext){wb[0].textContent='⭐ Next level';wb[0].onclick=()=>{document.getElementById('win').classList.add('hidden');S.won=false;startMode('defend',D.level+1);};}
    else {wb[0].textContent='🏆 Play it again';wb[0].onclick=()=>{document.getElementById('win').classList.add('hidden');S.won=false;startMode('defend',D.level);};}
    wb[1].textContent='🗺 Level select';wb[1].onclick=()=>location.reload();
  }
  document.getElementById('win').classList.remove('hidden');
  log('🏆 '+L.name.toUpperCase()+' SURVIVED — '+'★'.repeat(stars));
}
function dfdHUD(){
  const D=S.dfd; if(!D)return;
  const bc=document.getElementById('bcTime');
  if(bc){
    if(D.phase==='wave'&&BT)bc.textContent=`⚔ ${BT.creeps.length+BT.spawns.length}`;
    else bc.textContent=(dfdWaveComp(D.wave)?.type==='wet'?'⛈ ':'☀️ ')+Math.max(0,Math.ceil(D.phaseT))+'s';
  }
  const tb=document.getElementById('timebar');
  if(tb){
    if(D.phase==='wave'&&BT)tb.style.width=Math.round(100*(1-(BT.creeps.length+BT.spawns.length)/Math.max(1,BT.total)))+'%';
    else tb.style.width=Math.round(100*(1-D.phaseT/(D.phase==='prep'?PREP_T:INTER_T)))+'%';
  }
  const nt=document.getElementById('nowtext');
  if(nt&&!D.won&&!D.lost){
    const o=nowObjective();
    if(o)nt.textContent=o.text;
    document.getElementById('nowchip').classList.toggle('hidden',!o);
  }
}
/* placement + battle input */
function dockTabLabel(){
  const d=document.getElementById('dock'), tab=document.getElementById('dockTab');
  if(!tab)return;
  const collapsed=d.classList.contains('collapsed');
  if(S.mode==='defend'&&S.dfd){
    const c=S.dfd.sel?dfdCard(S.dfd.sel):null;
    tab.textContent=collapsed?(c?c.ic:'🏗'):'⏵';
    tab.title=collapsed?'Open the tower dock':'Tuck the dock away — see the map';
  } else tab.textContent=collapsed?'⏴':'⏵';
}
function dockCollapse(on){
  document.getElementById('dock').classList.toggle('collapsed',on);
  dockTabLabel();
}
function dfdSelect(id){
  S.dfd.sel=S.dfd.sel===id?null:id;
  buildToolbar();
  const c=dfdCard(id);
  if(S.dfd.sel&&c){
    say(`${c.ic} ${c.name} — ${c.gain}. Tap the map to place (${dfdCostStr(c)||'free'}).`);
    if(MOBILE)dockCollapse(true); // card in hand — get the dock out of the way so you can see the land
  }
}
function pickCreep(e){
  if(!BT)return null;
  const r=el.getBoundingClientRect();
  pointer.x=((e.clientX-r.left)/r.width)*2-1;
  pointer.y=-((e.clientY-r.top)/r.height)*2+1;
  raycaster.setFromCamera(pointer,camera);
  const hits=raycaster.intersectObjects(BT.grp.children,true);
  for(const h of hits){
    let o=h.object;
    while(o&&o.parent!==BT.grp)o=o.parent;
    const c=BT.creeps.find(c2=>c2.mesh===o);
    if(c&&!c.dead)return c;
  }
  return null;
}

/* --- loop --- */
let tick=0;
function animate(){
  requestAnimationFrame(animate);
  tick++;
  if(beaconFx){
    const el2=(performance.now()-beaconFx.t0)/1000;
    if(el2>2.6)killBeacon();
    else{const p=(el2%0.8)/0.8;
      beaconFx.mesh.scale.setScalar(0.9+p*0.95);
      beaconFx.mesh.material.opacity=0.9*(1-p);
      if(beaconFx.arrow){ // the bouncing pointer
        beaconFx.arrow.position.y=beaconFx.baseY+1.35+Math.abs(Math.sin(el2*5.2))*0.3;
        beaconFx.arrow.rotation.y=el2*2.2;
        beaconFx.arrow.material.opacity=Math.min(1,(2.6-el2)*2);
      }}
  }
  animateTilePops();
  if(S.mode==='defend'&&S.dfd){const nowT=performance.now();dfdTick(nowT-(S.dfd._lastT||nowT));S.dfd._lastT=nowT;}
  if(performance.now()-lastGuidT>260){lastGuidT=performance.now();guidanceTick();} // time-based: survives throttled frame rates
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
  for(const tg of harvestTags.concat(gatherArm?[gatherArm]:[])){
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

let _lastPortrait=null;
function onResize(){
  VW=Math.max(300,view.clientWidth||900);
  VH=Math.max(260,view.clientHeight||560);
  const p=VH>VW;
  if(_lastPortrait!==null&&p!==_lastPortrait){fitCam();updateCamera();}
  _lastPortrait=p;
  renderer.setSize(VW,VH);
  camera.aspect=VW/VH;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize',onResize);

/* --- boot --- */
document.getElementById('nojs').remove(); // scripts run — hide the preview warning
function renderTitle(){
  const g=document.getElementById('lvlgrid');
  if(!g)return;
  g.innerHTML='';
  DLEVELS.forEach((L,i)=>{
    const st=DEF_PROGRESS[i]||0;
    const b=document.createElement('button');
    b.className='lvlbtn';
    b.innerHTML=`<span class="ln">${i+1}</span><span class="lname">${L.name}<small>${L.sub} · ${(L.waves||DWAVES).length} waves</small></span><span class="lstars">${st?'★'.repeat(st)+'☆'.repeat(3-st):''}</span>`;
    b.onclick=()=>startMode('defend',i);
    g.appendChild(b);
  });
}
renderTitle();
window.DH={S,clickTile,endDay,doAction,CROPS,tileAt,cam,updateCamera,washPath,creekPaths,BDA_CAP,swaleCap,camera,renderer,CHAPTERS,DLEVELS}; window.startMode=startMode; // debug/test hooks
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
  if(S.mode==='defend'){tp.style.display='none';tb.style.display='';
    document.getElementById('bigClock').classList.remove('freeplay');return;} // dfdHUD owns the clock here
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
if(MOBILE)document.getElementById('goalsBox').classList.add('min');
buildToolbar();
applyWeatherLook();
log('Day 1: you arrive with a wagon of seeds, a shovel, and big plans.');
refresh();
onResize();
animate();
