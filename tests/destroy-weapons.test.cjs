const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const math = Object.create(Math); math.random = () => .5;
const context = { Math: math, hits: [], blasts: [], shots: [], document: { getElementById: () => ({getBoundingClientRect:()=>({height:36})}), querySelectorAll:()=>[] }, innerWidth:1200,innerHeight:900 };
vm.createContext(context);
let source = fs.readFileSync('scripts/destroy.js','utf8')
 .replace('function damage(target, radius, x, y) {', 'function damage(target, radius, x, y) { globalThis.hits.push({radius,x,y});')
 .replace('function explode(x, y, radius) {', 'function explode(x, y, radius) { globalThis.blasts.push({radius,x,y});')
 .replace('if (grenade) g.grenadeCooldown', 'globalThis.shots.push(kind); if (grenade) g.grenadeCooldown')
 .replace(/\}\)\(\);\s*$/, 'globalThis.check = { update, fire, restart, ignite, chooseWeapon, weapons, setGame: value => game = value }; })();');
vm.runInContext(source, context);
const {update, fire, restart, ignite, chooseWeapon, setGame} = context.check;
function target(x=0,y=0,w=1200,h=900) {
 const cells = new Uint8Array(Math.ceil(w/4)*Math.ceil(h/4)).fill(1);
 return {x,y,w,h,columns:Math.ceil(w/4),rows:Math.ceil(h/4),cells,initialCells:cells.slice(),remaining:cells.length,context:{clearRect(){},drawImage(){},createRadialGradient(){return {addColorStop(){}}},save(){},restore(){},beginPath(){},arc(){},fill(){}},original:{}};
}
function game(weapon=0,targets=[]) {
 const g={ready:true,weapon,targets,total:targets.reduce((n,t)=>n+t.remaining,0),keys:new Set(),player:{},width:1200,height:900,floor:897,sound:false,canvas:{focus(){}},root:{querySelector:()=>({setAttribute(){}}),querySelectorAll:()=>[]},aim:{x:900,y:450}};
 setGame(g); restart();g.player.x=100;g.player.y=478.6;
 context.hits.length=0;context.blasts.length=0;context.shots.length=0;
 return g;
}
function advance(seconds,dt=1/60) { for(let t=0;t<seconds-1e-8;t+=dt) update(Math.min(dt,seconds-t)); }
let cases=0;
for(const dt of [1/30,1/60,1/144]) for(const weapon of [0,1,2,3]) for(const aim of [{x:800,y:450},{x:120,y:440},{x:50,y:120},{x:500,y:850}]) {
 const g=game(weapon,[target()]);g.aim=aim;fire();const shot=g.bullets[0];g.aim={x:1000,y:20};
 advance(2,dt);
 assert.ok(Math.hypot(shot.x-aim.x,shot.y-aim.y)<.001,`Weapon ${weapon} missed the click at ${dt}.`);
 assert.ok(context.hits.length>0);
 if(weapon===3) {assert.equal(context.blasts.length,1);assert.equal(context.blasts[0].radius,46);}
 cases++;
}
let g=game(3,[target(200,400,32,100),target(800,400,80,100)]);g.aim={x:840,y:450};fire();advance(2);
assert.equal(g.targets[0].remaining,g.targets[0].initialCells.length);assert.ok(g.targets[1].remaining<g.targets[1].initialCells.length);
g=game(2);fire();assert.equal(g.bullets.length,10);
math.random=()=>.75;g=game(1);fire();assert.ok(g.bullets[0].vy>0);math.random=()=>.5;
g=game(4,[target()]);g.aim={x:350,y:450};fire();advance(.37);assert.equal(g.destroyed,0);advance(.02);
assert.ok(g.destroyed>0);assert.equal(g.beams.length,1);assert.equal(g.beams[0].nx,1200);assert.ok(context.hits.some(h=>h.x>1000));
g=game(5,[target(140,350,800,200)]);fire();advance(.2);assert.ok(g.fires.size>0);const destroyed=g.destroyed;advance(.8);assert.ok(g.destroyed>destroyed);assert.ok(g.fires.size<=180);
g=game(6);fire();const cluster=g.bullets[0];advance(.5);assert.ok(cluster.chute>=0);advance(2);
assert.equal(g.bullets.filter(b=>b.kind==='cluster').length,0);assert.equal(g.bullets.filter(b=>b.kind==='bomblet').length,8);advance(3);assert.equal(context.blasts.length,8);assert.ok(context.blasts.every(b=>b.radius===30));
g=game();fire(true);assert.equal(g.grenadeCooldown,.55);assert.equal(g.bullets[0].life,1.55);advance(1.5);assert.equal(context.blasts.length,0);advance(.06);assert.equal(context.blasts[0].radius,50);
for(const weapon of [0,1,2,3,5,6]) for(const dt of [1/30,1/60,1/144]) {
 g=game(weapon);fire();g.firing=true;advance(1,dt);
 const expected=Math.floor(1/context.check.weapons[weapon].delay)+1;
 assert.ok(Math.abs(context.shots.length-expected)<=1,`Weapon ${weapon} fired ${context.shots.length}, expected ${expected} at ${dt}.`);
}
g=game(4,[target()]);fire();g.fires.set('test',{life:2});restart();assert.equal(g.charge,null);assert.equal(g.fires.size,0);assert.equal(g.beams.length,0);assert.equal(g.bullets.length,0);assert.equal(g.destroyed,0);
console.log(`${cases} aim checks passed. Weapon spread, blast sizes, railgun charge, fire spread, cluster split, grenade fuse, fire rates, and restart also passed.`);
g=game(2);fire();assert.equal(g.casings.length,1);assert.equal(g.casings[0].red,true);advance(.2);assert.ok(g.casings[0].delay>0);advance(.1);assert.ok(g.casings[0].delay<=0);
g=game(1);fire();assert.equal(g.casings[0].red,false);const shell=g.casings[0], shellY=shell.y;advance(.1);assert.ok(shell.y<shellY);advance(2);assert.ok(shell.y<=g.floor);restart();assert.equal(g.casings.length,0);
console.log('Casing ejection, shotgun pump delay, gravity, floor collision, and restart passed.');
