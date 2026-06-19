const express    = require('express')
const http       = require('http')
const { Server } = require('socket.io')
const path       = require('path')
const fs         = require('fs')

const app    = express()
const server = http.createServer(app)
const io     = new Server(server)
const PORT   = 3000

const PHOTOS_DIR  = path.join(__dirname, 'photos')
const ATRIER_DIR  = path.join(__dirname, 'photos', 'a-trier')
const MINEUR_DIR  = path.join(__dirname, 'photos', 'mineur')
const MAJEUR_DIR  = path.join(__dirname, 'photos', 'majeur')
const SUPP_DIR    = path.join(__dirname, 'photos', 'supprimes')
const DEVINE_DIR  = path.join(__dirname, 'photos', 'devine')
const DEVINE_TRI  = path.join(__dirname, 'photos', 'devine-tri')
const JOLIE_DIR   = path.join(__dirname, 'photos', 'test-jolie')
const DOG_DIR     = path.join(__dirname, 'photos', 'test-dog')

for (const d of [ATRIER_DIR,MINEUR_DIR,MAJEUR_DIR,SUPP_DIR,DEVINE_DIR,DEVINE_TRI,JOLIE_DIR,DOG_DIR]) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true })
}

const IMAGE_EXTS = ['.jpg','.jpeg','.png','.webp','.gif','.avif']
const ADMIN_PASS = process.env.ADMIN_PASS || 'enzo2024'
const DEVINE_DB  = path.join(__dirname, 'devine-ages.json')

function loadDevineDB() { try { return JSON.parse(fs.readFileSync(DEVINE_DB,'utf8')) } catch { return {} } }
function saveDevineDB(db) { fs.writeFileSync(DEVINE_DB, JSON.stringify(db,null,2)) }
function listImages(dir) {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir).filter(f => IMAGE_EXTS.includes(path.extname(f).toLowerCase()))
}
function shuffle(arr) {
  const a=[...arr]
  for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}
  return a
}

app.use(express.json({limit:'2mb'}))
app.use((req,res,next)=>{res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');next()})

const rateMap={}
app.use('/api',(req,res,next)=>{
  const ip=req.headers['x-forwarded-for']||req.socket.remoteAddress||'unknown'
  const now=Date.now()
  if(!rateMap[ip])rateMap[ip]=[]
  rateMap[ip]=rateMap[ip].filter(t=>now-t<60000);rateMap[ip].push(now)
  if(rateMap[ip].length>300)return res.status(429).json({error:'Trop de requetes'})
  next()
})

app.use(express.static(path.join(__dirname,'public')))
app.use('/photos',express.static(PHOTOS_DIR))

function adminAuth(req,res,next){
  const token=req.headers['x-admin-token']||req.query.token
  if(token===ADMIN_PASS)return next()
  res.status(401).json({error:'Non autorise'})
}

/* ── API JEU ── */
app.get('/api/photos',(req,res)=>{
  res.json({
    mineur:listImages(MINEUR_DIR).map(f=>`/photos/mineur/${f}`),
    majeur:listImages(MAJEUR_DIR).map(f=>`/photos/majeur/${f}`)
  })
})
app.get('/api/sortir',(req,res)=>{
  const min=listImages(MINEUR_DIR).map(f=>({src:`/photos/mineur/${f}`,type:'mineur'}))
  const maj=listImages(MAJEUR_DIR).map(f=>({src:`/photos/majeur/${f}`,type:'majeur'}))
  res.json(shuffle([...min,...maj]).slice(0,30))
})
app.get('/api/devine',(req,res)=>{
  const db=loadDevineDB()
  const files=listImages(DEVINE_DIR).filter(f=>db[f]!==undefined)
  res.json(shuffle(files.map(f=>({src:`/photos/devine/${f}`,filename:f,age:db[f]}))).slice(0,30))
})

/* ── API ADMIN ── */
let history=[]
app.get('/api/admin/atrier',adminAuth,(req,res)=>{
  res.json(listImages(ATRIER_DIR).map(f=>({filename:f,src:`/photos/a-trier/${encodeURIComponent(f)}`})))
})
app.post('/api/admin/trier',adminAuth,(req,res)=>{
  const{filename,action}=req.body
  if(!filename||!action)return res.status(400).json({error:'Params manquants'})
  const src=path.join(ATRIER_DIR,filename)
  if(!fs.existsSync(src))return res.status(404).json({error:'Fichier introuvable'})
  const destMap={mineur:MINEUR_DIR,majeur:MAJEUR_DIR,supprimer:SUPP_DIR}
  const destDir=destMap[action]
  if(!destDir)return res.status(400).json({error:'Action invalide'})
  fs.renameSync(src,path.join(destDir,filename))
  history.push({filename,from:ATRIER_DIR,to:destDir})
  res.json({ok:true})
})
app.post('/api/admin/undo',adminAuth,(req,res)=>{
  if(!history.length)return res.status(400).json({error:'Rien a annuler'})
  const last=history.pop()
  const src=path.join(last.to,last.filename)
  const dest=path.join(last.from,last.filename)
  if(!fs.existsSync(src))return res.status(404).json({error:'Fichier introuvable'})
  fs.renameSync(src,dest)
  res.json({ok:true,restored:last.filename})
})
app.get('/api/admin/devine-tri',adminAuth,(req,res)=>{
  const db=loadDevineDB()
  res.json(listImages(DEVINE_TRI).map(f=>({filename:f,src:`/photos/devine-tri/${encodeURIComponent(f)}`,age:db[f]||null})))
})
app.post('/api/admin/devine-save',adminAuth,(req,res)=>{
  const{filename,age}=req.body
  if(!filename||age===undefined)return res.status(400).json({error:'Params manquants'})
  const src=path.join(DEVINE_TRI,filename)
  if(!fs.existsSync(src))return res.status(404).json({error:'Fichier introuvable'})
  fs.renameSync(src,path.join(DEVINE_DIR,filename))
  const db=loadDevineDB();db[filename]=parseInt(age);saveDevineDB(db)
  res.json({ok:true})
})

/* ── PAGES ── */
app.get('/admin',(req,res)=>res.sendFile(path.join(__dirname,'public','admin.html')))
app.get('/game',(req,res)=>res.sendFile(path.join(__dirname,'public','game.html')))
app.get('/multi',(req,res)=>res.sendFile(path.join(__dirname,'public','multi.html')))

/* ══════════════════════════════
   QUESTIONS MULTI
══════════════════════════════ */
const QUESTIONS_TEXTE = [
  "As-tu deja voulu gerer une personne dans l'entourage de ton adversaire ?",
  "As-tu deja menti sur ton age en ligne ?",
  "Penses-tu pouvoir reconnaitre un mineur sur une photo ?",
  "As-tu deja utilise Omegle ou une plateforme similaire ?",
  "As-tu plus de facilite a parler avec des jeunes qu'avec des adultes ?",
  "As-tu deja eu des pensees que tu consideres malsaines ?",
  "Consideres-tu la justice sur les crimes sexuels trop legere ?",
  "As-tu deja envoye ou recu des photos intimes en ligne ?",
  "Ton adversaire te semble-t-il suspect ?",
  "Penses-tu que ton adversaire a deja fait des choses malsaines ?"
]

function buildMultiDeck() {
  // Mineur/Pas mineur — photo, score si bonne reponse
  const minPhotos = shuffle(listImages(MINEUR_DIR)).slice(0,6).map(f=>({
    type:'mineur-pas', src:`/photos/mineur/${f}`, realType:'mineur',
    question:'Mineur ou pas mineur ?', choices:['Mineur','Pas mineur']
  }))
  const majPhotos = shuffle(listImages(MAJEUR_DIR)).slice(0,4).map(f=>({
    type:'mineur-pas', src:`/photos/majeur/${f}`, realType:'majeur',
    question:'Mineur ou pas mineur ?', choices:['Mineur','Pas mineur']
  }))

  // Age-guess — utilise devine-ages.json pour avoir l'age reel
  const db = loadDevineDB()
  const devineFiles = listImages(DEVINE_DIR).filter(f=>db[f]!==undefined)
  const agePhotos = shuffle(devineFiles).slice(0,4).map(f=>({
    type:'age-guess', src:`/photos/devine/${f}`, realType:null,
    realAge: db[f],
    question:'Quel age a cette personne ? (11-60 ans)', choices:null
  }))
  // Si pas de photos devine, utiliser mineur/majeur sans age precis
  const ageFallback = agePhotos.length === 0 ? shuffle([
    ...listImages(MINEUR_DIR).slice(0,2).map(f=>({type:'age-guess',src:`/photos/mineur/${f}`,realType:'mineur',realAge:null,question:'Quel age a cette personne ?',choices:null})),
    ...listImages(MAJEUR_DIR).slice(0,1).map(f=>({type:'age-guess',src:`/photos/majeur/${f}`,realType:'majeur',realAge:null,question:'Quel age a cette personne ?',choices:null}))
  ]) : agePhotos

  // Questions texte — SANS photo, score si meme reponse que l'adversaire
  const texteQs = shuffle(QUESTIONS_TEXTE).slice(0,5).map(q=>({
    type:'texte', src:null, realType:null,
    question:q, choices:['Oui','Je sais pas','Non']
  }))

  const all = shuffle([...minPhotos,...majPhotos,...ageFallback,...texteQs]).slice(0,20)
  return all
}

/* ══════════════════════════════
   SOCKET.IO
══════════════════════════════ */
const rooms = {}
function genCode() { return Math.random().toString(36).substring(2,7).toUpperCase() }

io.on('connection',(socket)=>{

  socket.on('create-room',({pseudo})=>{
    const code=genCode()
    rooms[code]={
      players:[{id:socket.id,pseudo,ready:false,score:0,answers:[]}],
      deck:[],idx:0,timer:null,phase:'waiting',answers:{}
    }
    socket.join(code); socket.roomCode=code; socket.pseudo=pseudo
    socket.emit('room-created',{code})
  })

  socket.on('join-room',({code,pseudo})=>{
    const room=rooms[code]
    if(!room)return socket.emit('join-error','Room introuvable')
    if(room.players.length>=2)return socket.emit('join-error','Room pleine')
    room.players.push({id:socket.id,pseudo,ready:false,score:0,answers:[]})
    socket.join(code); socket.roomCode=code; socket.pseudo=pseudo
    io.to(code).emit('room-joined',{players:room.players.map(p=>({id:p.id,pseudo:p.pseudo}))})
  })

  socket.on('player-ready',()=>{
    const code=socket.roomCode; const room=rooms[code]; if(!room)return
    const player=room.players.find(p=>p.id===socket.id)
    if(player)player.ready=true
    io.to(code).emit('ready-update',{readyCount:room.players.filter(p=>p.ready).length,total:room.players.length})
    if(room.players.length===2&&room.players.every(p=>p.ready)){
      room.phase='countdown'; room.deck=buildMultiDeck(); room.idx=0; room.answers={}
      room.players.forEach(p=>{p.score=0;p.answers=[]})
      let count=3; io.to(code).emit('countdown',{count})
      const cd=setInterval(()=>{
        count--
        if(count>0)io.to(code).emit('countdown',{count})
        else{clearInterval(cd);room.phase='playing';startRound(code)}
      },1000)
    }
  })

  socket.on('multi-answer',({answer})=>{
    const code=socket.roomCode; const room=rooms[code]
    if(!room||room.phase!=='playing')return
    const item=room.deck[room.idx]
    if(!room.answers[room.idx])room.answers[room.idx]={}
    if(room.answers[room.idx][socket.id])return // déjà répondu
    room.answers[room.idx][socket.id]={answer,pseudo:socket.pseudo}

    const player=room.players.find(p=>p.id===socket.id)
    if(player){
      let correct=false
      if(item.type==='mineur-pas'){
        correct=(answer==='Mineur'&&item.realType==='mineur')||(answer==='Pas mineur'&&item.realType==='majeur')
      } else if(item.type==='age-guess'&&item.realAge!==null&&item.realAge!==undefined){
        const guess=parseInt((answer||'').replace('age:',''))
        if(!isNaN(guess)) correct=Math.abs(guess-item.realAge)<=1
      }
      // texte/sortir-avec : pas de bonne reponse individuelle, score par concordance calculé à la fin
      if(correct)player.score++
      player.answers.push({answer,correct,photo:item,idx:room.idx})
    }

    io.to(code).emit('answer-received',{playerId:socket.id,pseudo:socket.pseudo})
    if(Object.keys(room.answers[room.idx]).length>=room.players.length){
      if(room.timer){clearInterval(room.timer);room.timer=null}
      revealAndNext(code)
    }
  })

  socket.on('disconnect',()=>{
    const code=socket.roomCode; if(!code||!rooms[code])return
    io.to(code).emit('player-left',{pseudo:socket.pseudo})
    if(rooms[code].timer)clearInterval(rooms[code].timer)
    delete rooms[code]
  })
})

function startRound(code){
  const room=rooms[code]; if(!room||room.idx>=room.deck.length){endGame(code);return}
  const item=room.deck[room.idx]
  io.to(code).emit('round-start',{
    idx:room.idx, total:room.deck.length,
    photo:item.src, question:item.question,
    choices:item.choices, qtype:item.type,
    realType:item.realType, dogIsChienne:item.dogIsChienne||false,
    timeLeft:20
  })
  let t=20
  const tick=setInterval(()=>{
    t--; io.to(code).emit('timer',{t})
    if(t<=0){
      clearInterval(tick); room.timer=null
      const answered=Object.keys(room.answers[room.idx]||{})
      room.players.forEach(p=>{
        if(!answered.includes(p.id)){
          if(!room.answers[room.idx])room.answers[room.idx]={}
          room.answers[room.idx][p.id]={answer:null,pseudo:p.pseudo,timeout:true}
        }
      })
      revealAndNext(code)
    }
  },1000)
  room.timer=tick
}

function revealAndNext(code){
  const room=rooms[code]; if(!room)return
  if(room.timer){clearInterval(room.timer);room.timer=null}
  const item=room.deck[room.idx]
  const roundA=room.answers[room.idx]||{}
  // Recalcul correct + score concordance pour questions texte
  const pids=Object.keys(roundA)
  pids.forEach(pid=>{
    const a=roundA[pid]; if(!a)return
    if(item.type==='mineur-pas'){
      a.correct=(a.answer==='Mineur'&&item.realType==='mineur')||(a.answer==='Pas mineur'&&item.realType==='majeur')
    } else if(item.type==='age-guess'&&item.realAge!=null){
      const guess=parseInt((a.answer||'').replace('age:',''))
      a.correct=!isNaN(guess)&&Math.abs(guess-item.realAge)<=1
      // Donner le point si pas encore donné
      const p=room.players.find(pp=>pp.id===pid)
      if(p&&a.correct&&!p.answers.find(x=>x.idx===room.idx&&x.correct)) p.score++
    } else if(item.type==='texte'){
      a.correct=null
    } else {
      a.correct=null
    }
  })
  // Score concordance texte : +1 aux deux si meme reponse
  if(item.type==='texte'&&pids.length===2){
    const [a1,a2]=[roundA[pids[0]],roundA[pids[1]]]
    if(a1&&a2&&a1.answer&&a2.answer&&a1.answer===a2.answer){
      pids.forEach(pid=>{
        const p=room.players.find(pp=>pp.id===pid)
        if(p)p.score++
      })
    }
  }
  io.to(code).emit('round-result',{
    photo:item?.src, realType:item?.realType,
    realAge:item?.realAge||null,
    qtype:item?.type, question:item?.question,
    dogIsChienne:item?.dogIsChienne||false,
    answers:roundA,
    scores:room.players.map(p=>({id:p.id,pseudo:p.pseudo,score:p.score}))
  })
  room.idx++
  setTimeout(()=>{
    if(room.idx>=room.deck.length)endGame(code)
    else startRound(code)
  },3000)
}

function endGame(code){
  const room=rooms[code]; if(!room)return
  room.phase='result'
  io.to(code).emit('game-end',{
    scores:room.players.map(p=>({id:p.id,pseudo:p.pseudo,score:p.score,answers:p.answers})),
    total:room.deck.length
  })
}

server.listen(PORT,()=>{
  console.log(`✅  Jeu   → http://localhost:${PORT}`)
  console.log(`🔐  Admin → http://localhost:${PORT}/admin`)
  console.log(`🎮  Game  → http://localhost:${PORT}/game`)
  console.log(`👥  Multi → http://localhost:${PORT}/multi`)
})
