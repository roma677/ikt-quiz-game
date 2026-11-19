
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;
app.use(express.static(require("path").join(__dirname,"public")));

const questions = require("./questions.json");
function shuffle(a){a=[...a];for(let i=a.length-1;i>0;i--){let j=crypto.randomInt(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;}

const rooms = new Map();
const teamColors = ["#ff5b75","#25c5ec","#ffc943","#45d6a0","#a78bfa","#ff8b45"];
function pin(){ let p; do { p=String(crypto.randomInt(100000,1000000)); } while(rooms.has(p)); return p; }
function publicPlayers(r){ return [...r.players.values()].map(p=>({id:p.id,name:p.name,team:p.team,score:p.score,answered:p.answered})); }
function standings(r){
 const players=publicPlayers(r).sort((a,b)=>b.score-a.score);
 const teams=r.teams.map((t,i)=>{const members=r.playersList.filter(p=>p.team===i);const score=members.reduce((s,p)=>s+p.score,0);const maxScore=members.length*r.questions.length*1000;return {...t,score,members:members.length,maxScore,grade:maxScore?Math.round(score/maxScore*1000)/10:null};}).sort((a,b)=>(b.grade??-1)-(a.grade??-1)||b.score-a.score);
 return {players,teams};
}
function roomState(r){return {pin:r.pin,status:r.status,players:publicPlayers(r),teams:r.teams,questionIndex:r.index,total:r.questions.length,answered:[...r.players.values()].filter(p=>p.answered).length};}
function emitRoom(r){io.to(r.pin).emit("roomUpdate",roomState(r));}
function stopTimer(r){if(r.timer){clearInterval(r.timer);r.timer=null;}}
function endQuestion(r){
 if(r.status!=="question") return;
 stopTimer(r); r.status="reveal";
 const q=r.questions[r.index];
 io.to(r.pin).emit("questionEnded",{correctIndex:q.k,correctAnswer:q.a[q.k],standings:standings(r),state:roomState(r)});
}
function startQuestion(r){
 if(r.index>=r.questions.length){r.status="finished";io.to(r.pin).emit("gameFinished",standings(r));emitRoom(r);return;}
 r.status="question";r.seconds=20;
 for(const p of r.players.values()){p.answered=false;p.lastCorrect=null;}
 const q=r.questions[r.index];
 io.to(r.pin).emit("newQuestion",{index:r.index,total:r.questions.length,question:q.q,category:q.c,answers:q.a,seconds:20});
 emitRoom(r);
 stopTimer(r);
 r.timer=setInterval(()=>{
   r.seconds--;
   io.to(r.pin).emit("tick",{seconds:r.seconds});
   if(r.seconds<=0) endQuestion(r);
 },1000);
}
io.on("connection",socket=>{
 socket.on("createRoom",({hostName="Ведущий",teamCount=2,lectures=[1,2,3,4,5,6,7,8,9,10],count=20,mode="team",mix=true}={})=>{
    if(socket.data.room)return;
    if(!Array.isArray(lectures)){socket.emit("hostError","Выберите лекции");return;}
    const pool=questions.filter(q=>lectures.includes(q.lecture));
    if(!Number.isInteger(count)||count<1||count>pool.length){socket.emit("hostError","Проверьте количество вопросов");return;}
    const selected=(mix?shuffle(pool):pool).slice(0,count).map(q=>{const order=shuffle([0,1,2,3]);return {...q,a:order.map(i=>q.a[i]),k:order.indexOf(q.k)};});
   const code=pin();
   const n=Math.max(2,Math.min(6,Number(teamCount)||2));
   const teams=Array.from({length:mode==="solo"?0:n},(_,i)=>({name:`Команда ${i+1}`,color:teamColors[i%teamColors.length]}));
   const r={pin:code,hostId:socket.id,hostName,teams,questions:selected,players:new Map(),playersList:[],index:0,status:"lobby",seconds:20,timer:null};
   rooms.set(code,r); socket.join(code); socket.data.room=code;socket.data.role="host";
   socket.emit("roomCreated",{pin:code,teams,questions:selected.length});
   emitRoom(r);
 });
 socket.on("joinRoom",({pin:code,name}={})=>{
   if(socket.data.room)return;
    code=String(code||"").trim();name=String(name||"").trim().slice(0,24);
   const r=rooms.get(code);
   if(!r){socket.emit("joinError","Игра с таким PIN-кодом не найдена.");return;}
   if(r.status!=="lobby"){socket.emit("joinError","Игра уже началась. Попросите ведущего создать новую.");return;}
   if(!name){socket.emit("joinError","Введите имя.");return;}
   if([...r.players.values()].some(p=>p.name.toLowerCase()===name.toLowerCase())){socket.emit("joinError","Это имя уже занято в данной игре.");return;}
   const p={id:socket.id,name,team:r.teams.length?r.players.size%r.teams.length:-1,score:0,answered:false,lastCorrect:null};
   r.players.set(socket.id,p);r.playersList=[...r.players.values()];
   socket.join(code);socket.data.room=code;socket.data.role="player";
   socket.emit("joined",{pin:code,name,team:r.teams[p.team]||{name:"Индивидуальная игра"}});
   emitRoom(r);
 });
 socket.on("startGame",()=>{
   const r=rooms.get(socket.data.room);if(!r||r.hostId!==socket.id||r.status!=="lobby")return;
   if(r.players.size===0){socket.emit("hostError","Сначала дождитесь хотя бы одного участника.");return;}
   r.index=0;startQuestion(r);
 });
 socket.on("submitAnswer",({answer,index}={})=>{
   const r=rooms.get(socket.data.room);if(!r||r.status!=="question"||index!==r.index)return;
   const p=r.players.get(socket.id);if(!p||p.answered)return;
   const idx=Number(answer);if(!Number.isInteger(idx)||idx<0||idx>3)return;
   p.answered=true;
   const correct=idx===r.questions[r.index].k;
   p.lastCorrect=correct;
   if(correct)p.score+=500+Math.round(r.seconds*25);
   socket.emit("answerReceived",{correct,points:correct?500+Math.round(r.seconds*25):0});
   emitRoom(r);
   if([...r.players.values()].length && [...r.players.values()].every(x=>x.answered))endQuestion(r);
 });
 socket.on("nextQuestion",()=>{
   const r=rooms.get(socket.data.room);if(!r||r.hostId!==socket.id||r.status!=="reveal")return;
   r.index++;startQuestion(r);
 });
 socket.on("disconnect",()=>{
   const code=socket.data.room,r=rooms.get(code);if(!r)return;
   if(socket.data.role==="player"&&r.players.has(socket.id)){r.players.delete(socket.id);if(r.status==="lobby")r.playersList=[...r.players.values()];emitRoom(r);}
   if(r.hostId===socket.id){stopTimer(r);io.to(code).emit("roomClosed");rooms.delete(code);}
 });
});
server.listen(PORT,()=>console.log(`IKT Quiz Arena listening on ${PORT}`));
