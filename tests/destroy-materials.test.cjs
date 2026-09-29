const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const draws=[], strokes=[], masks=[];
const context2d=()=>({clearRect(){},drawImage(...args){draws.push(args)},save(){},restore(){},translate(){},beginPath(){},rect(){},clip(){},moveTo(){},lineTo(){},closePath(){},stroke(){strokes.push(1)},getImageData(x,y,w,h){const data=new Uint8ClampedArray(w*h*4).fill(255);data.set([0,0,0,255],Math.floor(w*h/2)*4);return {data};},putImageData(pixels){masks.push(pixels.data)}});
const context={document:{getElementById:()=>({getBoundingClientRect:()=>({height:36})}),querySelectorAll:()=>[],createElement:()=>({getContext:context2d})},innerWidth:800,innerHeight:600};
vm.createContext(context);
vm.runInContext(fs.readFileSync('scripts/destroy.js','utf8').replace(/\}\)\(\);\s*$/,'globalThis.check={damage,breakMaterial,surfaceHit,restart,update,setGame:value=>game=value};})();'),context);
const {damage,breakMaterial,surfaceHit,restart,update,setGame}=context.check;
function game(kind='glass'){
 const material={x:100,y:100,w:80,h:40,kind,hits:0,broken:false};
 const cells=new Uint8Array(200*150),map=new Int16Array(cells.length).fill(-1);
 for(let row=25;row<35;row++)for(let col=25;col<45;col++){cells[row*200+col]=1;map[row*200+col]=0;}
 const target={x:0,y:0,w:800,h:600,columns:200,rows:150,cells,initialCells:cells.slice(),materialAt:map,remaining:200,original:{},surface:{name:'page pixels'},context:context2d()};
 const g={ready:true,materials:[material],targets:[target],total:200,destroyed:0,keys:new Set(),player:{},width:800,height:600,floor:597,sound:false,canvas:{focus(){}},root:{querySelector:()=>({setAttribute(){}}),querySelectorAll:()=>[]},aim:{x:500,y:300},weapon:0};
 setGame(g);restart();draws.length=0;strokes.length=0;return {g,m:material,t:target};
}
let {g,m,t}=game();damage(t,7,110,110);assert.ok(strokes.length>0);assert.equal(m.broken,false);assert.equal(g.fragments.length,0);
damage(t,7,130,110);assert.equal(m.broken,false);damage(t,7,150,110);assert.equal(m.broken,true);assert.equal(g.fragments.length,8);assert.equal(g.destroyed,200);assert.equal(t.remaining,0);assert.equal(g.won,true);assert.equal(surfaceHit(100,120,180,120,t),null);assert.ok(draws.some(args=>args[0]===t.surface));
damage(t,100,140,120);assert.equal(g.destroyed,200);restart();assert.equal(g.fragments.length,0);assert.equal(m.broken,false);assert.equal(m.hits,0);assert.equal(t.remaining,200);
({g,m,t}=game('banner'));for(let i=0;i<4;i++)damage(t,5,106+i*8,110);assert.equal(g.fragments.length,1);assert.ok(g.fragments[0].pivot);const initialY=g.fragments[0].y;update(.1);assert.ok(g.fragments[0].y>initialY);for(let i=0;i<50;i++)update(1/60);assert.equal(g.fragments[0].pivot,null);assert.equal(g.destroyed,200);
({g,m,t}=game('letter'));damage(t,0,102,102);assert.equal(g.fragments.length,1);assert.equal(g.fragments[0].kind,'letter');assert.equal(g.destroyed,200);assert.equal(g.particles.length,0);assert.equal(masks.at(-1)[3],0);assert.equal(masks.at(-1)[Math.floor(m.w*m.h/2)*4+3],255);
({g,m,t}=game());damage(t,32,140,120);assert.equal(m.broken,true);assert.equal(g.fragments.length,8);assert.equal(t.remaining,0);
console.log('Glass cracks and shards, banner swing and fall, letter fragments, collision removal, score counts, repeated hits, and restart passed.');
