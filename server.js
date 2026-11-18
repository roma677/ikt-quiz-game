
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;
app.use(express.static("public"));

const questions = [
 {q:"Что такое информация согласно лекции?",c:"Понятие информации",a:["Сведения об окружающем мире, уменьшающие неопределённость","Только числовые данные","Любые компьютерные программы","Только сообщения в интернете"],k:0},
 {q:"Когда информация считается достоверной?",c:"Свойства информации",a:["Когда она очень короткая","Когда она не искажает истинного положения дел","Когда она представлена картинкой","Когда её легко запомнить"],k:1},
 {q:"Когда информация является полной?",c:"Свойства информации",a:["Если она содержит много слов","Если она опубликована онлайн","Если её достаточно для понимания и принятия решений","Если она предназначена всем"],k:2},
 {q:"Какое свойство означает, что информация выражена понятным адресату языком?",c:"Свойства информации",a:["Актуальность","Точность","Ценность","Ясность и понятность"],k:3},
 {q:"Чем является информация в современном информационном обществе?",c:"Информационное общество",a:["Важнейшим стратегическим ресурсом системы управления","Только способом развлечения","Видом аппаратного обеспечения","Заменой образования"],k:0},
 {q:"Что означает аббревиатура ИКТ?",c:"Определение ИКТ",a:["Интернет-компьютерные терминалы","Информационно-коммуникационные технологии","Инструменты контроля трафика","Информационные компьютерные таблицы"],k:1},
 {q:"Что включает в себя ИКТ согласно лекции?",c:"Определение ИКТ",a:["Только хранение файлов","Только создание сайтов","Сбор, обработку, хранение, передачу и использование информации","Только передачу сообщений"],k:2},
 {q:"В чём главное отличие ИКТ от ИТ?",c:"ИТ и ИКТ",a:["ИКТ не работают с данными","ИТ включают только интернет","Между ними нет различий","ИКТ дополняют работу с данными средствами связи и коммуникации"],k:3},
 {q:"Что относится к аппаратному обеспечению?",c:"Компоненты ИКТ",a:["Компьютеры, серверы и мобильные устройства","Операционные системы и приложения","Базы данных и облачные хранилища","Интернет и локальные сети"],k:0},
 {q:"Что относится к программному обеспечению?",c:"Компоненты ИКТ",a:["Серверы и смартфоны","Операционные системы, приложения и сервисы","Мобильные сети","Базы данных и мультимедиа"],k:1},
 {q:"Что относится к сетям и коммуникациям?",c:"Компоненты ИКТ",a:["Операционные системы","Компьютерные корпуса","Интернет, локальные и мобильные сети","Только текстовые документы"],k:2},
 {q:"Какова цель информационной технологии?",c:"Цель ИТ",a:["Увеличить количество устройств","Создать сеть любой сложности","Хранить все данные без обработки","Создать качественный информационный продукт, отвечающий требованиям пользователя"],k:3},
 {q:"Какие три вида информационных технологий выделены по масштабу применения?",c:"Виды информационных технологий",a:["Глобальная, базовая и конкретная","Физическая, логическая и прикладная","Аппаратная, сетевая и цифровая","Личная, групповая и общая"],k:0},
 {q:"Что изучается на физическом уровне ИКТ?",c:"Трёхуровневый подход",a:["Использование готовых информационных систем","Аппаратно-программные средства вычислительной техники и средства связи","Только обработка информации","Создание пользовательских документов"],k:1},
 {q:"Что рассматривается на прикладном уровне?",c:"Трёхуровневый подход",a:["Физическая структура компьютера","Методы передачи сигналов","Использование информационной технологии при создании и эксплуатации систем","Только программирование сетей"],k:2}
];

const rooms = new Map();
const teamColors = ["#ff5b75","#25c5ec","#ffc943","#45d6a0","#a78bfa","#ff8b45"];
function pin(){ let p; do { p=String(crypto.randomInt(100000,1000000)); } while(rooms.has(p)); return p; }
function publicPlayers(r){ return [...r.players.values()].map(p=>({id:p.id,name:p.name,team:p.team,score:p.score,answered:p.answered})); }
function standings(r){
 const players=publicPlayers(r).sort((a,b)=>b.score-a.score);
 const teams=r.teams.map((t,i)=>({...t,score:r.playersList.filter(p=>p.team===i).reduce((s,p)=>s+p.score,0),members:r.playersList.filter(p=>p.team===i).length})).sort((a,b)=>b.score-a.score);
 return {players,teams};
}
function roomState(r){return {pin:r.pin,status:r.status,players:publicPlayers(r),teams:r.teams,questionIndex:r.index,total:questions.length,answered:[...r.players.values()].filter(p=>p.answered).length};}
function emitRoom(r){io.to(r.pin).emit("roomUpdate",roomState(r));}
function stopTimer(r){if(r.timer){clearInterval(r.timer);r.timer=null;}}
function endQuestion(r){
 if(r.status!=="question") return;
 stopTimer(r); r.status="reveal";
 const q=questions[r.index];
 io.to(r.pin).emit("questionEnded",{correctIndex:q.k,correctAnswer:q.a[q.k],standings:standings(r),state:roomState(r)});
}
function startQuestion(r){
 if(r.index>=questions.length){r.status="finished";io.to(r.pin).emit("gameFinished",standings(r));emitRoom(r);return;}
 r.status="question";r.seconds=20;
 for(const p of r.players.values()){p.answered=false;p.lastCorrect=null;}
 const q=questions[r.index];
 io.to(r.pin).emit("newQuestion",{index:r.index,total:questions.length,question:q.q,category:q.c,answers:q.a,seconds:20});
 emitRoom(r);
 stopTimer(r);
 r.timer=setInterval(()=>{
   r.seconds--;
   io.to(r.pin).emit("tick",{seconds:r.seconds});
   if(r.seconds<=0) endQuestion(r);
 },1000);
}
io.on("connection",socket=>{
 socket.on("createRoom",({hostName="Ведущий",teamCount=2}={})=>{
   const code=pin();
   const n=Math.max(2,Math.min(6,Number(teamCount)||2));
   const teams=Array.from({length:n},(_,i)=>({name:`Команда ${i+1}`,color:teamColors[i%teamColors.length]}));
   const r={pin:code,hostId:socket.id,hostName,teams,players:new Map(),playersList:[],index:0,status:"lobby",seconds:20,timer:null};
   rooms.set(code,r); socket.join(code); socket.data.room=code;socket.data.role="host";
   socket.emit("roomCreated",{pin:code,teams,questions:questions.length});
   emitRoom(r);
 });
 socket.on("joinRoom",({pin:code,name}={})=>{
   code=String(code||"").trim();name=String(name||"").trim().slice(0,24);
   const r=rooms.get(code);
   if(!r){socket.emit("joinError","Игра с таким PIN-кодом не найдена.");return;}
   if(r.status!=="lobby"){socket.emit("joinError","Игра уже началась. Попросите ведущего создать новую.");return;}
   if(!name){socket.emit("joinError","Введите имя.");return;}
   if([...r.players.values()].some(p=>p.name.toLowerCase()===name.toLowerCase())){socket.emit("joinError","Это имя уже занято в данной игре.");return;}
   const p={id:socket.id,name,team:r.players.size%r.teams.length,score:0,answered:false,lastCorrect:null};
   r.players.set(socket.id,p);r.playersList=[...r.players.values()];
   socket.join(code);socket.data.room=code;socket.data.role="player";
   socket.emit("joined",{pin:code,name,team:r.teams[p.team]});
   emitRoom(r);
 });
 socket.on("startGame",()=>{
   const r=rooms.get(socket.data.room);if(!r||r.hostId!==socket.id||r.status!=="lobby")return;
   if(r.players.size===0){socket.emit("hostError","Сначала дождитесь хотя бы одного участника.");return;}
   r.index=0;startQuestion(r);
 });
 socket.on("submitAnswer",({answer}={})=>{
   const r=rooms.get(socket.data.room);if(!r||r.status!=="question")return;
   const p=r.players.get(socket.id);if(!p||p.answered)return;
   const idx=Number(answer);if(!Number.isInteger(idx)||idx<0||idx>3)return;
   p.answered=true;
   const correct=idx===questions[r.index].k;
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
   if(socket.data.role==="player"&&r.players.has(socket.id)){r.players.delete(socket.id);r.playersList=[...r.players.values()];emitRoom(r);}
   if(r.hostId===socket.id){stopTimer(r);io.to(code).emit("roomClosed");rooms.delete(code);}
 });
});
server.listen(PORT,()=>console.log(`IKT Quiz Arena listening on ${PORT}`));
