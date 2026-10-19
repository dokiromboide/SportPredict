"use strict";

const paths = {
  home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
  ball: '<circle cx="12" cy="12" r="9"/><path d="m9 9 6 0 2 5-5 4-5-4zM9 9 7 5m8 4 2-4m0 9 4 1m-9 3v3m-5-7-4 1"/>',
  chart: '<path d="M4 20V10h3v10m4 0V4h3v16m4 0v-7h3v7"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="m12 12 8-8m-3 0h3v3"/>',
  history: '<path d="M3 10a9 9 0 1 1 2 8M3 5v5h5m4-4v6l4 2"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9z"/>',
  bookmark: '<path d="M6 3h12v18l-6-4-6 4z"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v5m10-5v5M3 11h18"/>',
  upload: '<path d="M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6"/>',
  download: '<path d="M12 3v13m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  plus: '<path d="M12 4v16M4 12h16"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  flag: '<path d="M5 21V3m0 1c6-4 9 4 15 0v9c-6 4-9-4-15 0M2 21h7"/>',
  cards: '<rect x="5" y="3" width="11" height="16" rx="2"/><path d="m17 7 4 1-3 14-10-2"/>',
  spark: '<path d="m12 3 2.3 6.7L21 12l-6.7 2.3L12 21l-2.3-6.7L3 12l6.7-2.3z"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
  settings: '<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="10" cy="18" r="2"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
};
const icon = (name) => '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">' + (paths[name] || paths.ball) + "</svg>";
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
const fmt = (value, digits=0) => Number(value).toLocaleString("es-CO", {maximumFractionDigits:digits,minimumFractionDigits:digits});
const pct = (value) => fmt(value * 100, 1) + "%";
const dateLabel = (value, short=false) => value ? new Intl.DateTimeFormat("es", {day:"numeric",month:short?"short":"long",year:"numeric"}).format(new Date(value + "T12:00:00")) : "Cruce personalizado";
const resultLabel = (result) => ({H:"Local",D:"Empate",A:"Visitante"}[result] || "Pendiente");
const app = document.querySelector("#app");
const dialog = document.querySelector("#dialog");
const state = {data:null,page:"home",prediction:null,selection:null,search:"",team:"",matchTab:"historical",offset:0,historyFilter:"all"};
let routeVersion = 0, toastTimer;

async function api(url, options={}) {
  const response = await fetch("/api/" + url, {...options, headers:{"Content-Type":"application/json",...options.headers}});
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "No se pudo conectar con el servidor.");
  return body;
}
const post = (url, body) => api(url, {method:"POST",body:JSON.stringify(body)});
function toast(message, error=false) {
  const el = document.querySelector("#toast");
  el.textContent = message; el.className = "visible" + (error?" error":"");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove("visible"), 4800);
}
function team(name) { return state.data?.teams.find(item => item.id === name) || {id:name,name:name,crest:null}; }
const teamName = (name) => team(name).name;
function crest(name, extra="") {
  const item = team(name);
  return item.crest ? '<img class="crest '+extra+'" src="'+esc(item.crest)+'" alt="Escudo de '+esc(item.name)+'">'
    : '<span class="crest fallback '+extra+'" aria-label="'+esc(item.name)+'">'+esc(item.name.split(" ").map(x => x[0]).join("").slice(0,3))+"</span>";
}
function options(selected, exclude="") {
  return state.data.teams.filter(t => t.id !== exclude).map(t => '<option value="'+esc(t.id)+'"'+(t.id===selected?" selected":"")+">"+esc(t.name)+"</option>").join("");
}
function empty(title, text, button="") {
  return '<div class="empty">'+icon("ball")+"<h3>"+esc(title)+"</h3><p>"+esc(text)+"</p>"+button+"</div>";
}
function loading() { return '<div class="loading"><span class="spinner"></span>Preparando el análisis…</div>'; }
function navButton(page, label, glyph) {
  return '<button data-page="'+page+'" class="'+(state.page===page?"active":"")+'"'+(state.page===page?' aria-current="page"':"")+">"+icon(glyph)+esc(label)+"</button>";
}
function initials(name) { return name.split(" ").filter(Boolean).map(x=>x[0]).join("").slice(0,2).toUpperCase(); }
function shell() {
  const d=state.data, profile=d.profile;
  const sourceNote=d.summary.source.startsWith("CSV importado")
    ? '<span>'+icon("info")+esc(d.summary.source)+'</span>'
    : '<a href="https://football-data.co.uk/spainm.php" target="_blank" rel="noreferrer">'+icon("info")+'Datos históricos · '+esc(d.summary.from.slice(0,4))+'–'+esc(d.summary.to.slice(0,4))+' · Football-Data</a>';
  app.innerHTML = '<header class="topbar"><a class="brand" href="#home" aria-label="SportPredict, inicio"><img src="/assets/logo.svg" alt=""><span><span>Sport</span>Predict</span></a>'
    +'<form class="search" id="search-form" role="search">'+icon("search")+'<input name="search" aria-label="Buscar equipos o partidos" placeholder="Buscar equipos, partidos…" value="'+esc(state.search)+'"></form>'
    +'<nav class="toplinks" aria-label="Navegación superior">'+navButton("home","Inicio","")+navButton("statistics","Análisis","")+navButton("predictions","Predicciones","")+'</nav>'
    +'<div class="header-right"><span class="pill"><span class="spain-flag"></span> LaLiga</span><button class="icon-btn mobile-only" data-action="search" aria-label="Buscar partidos">'+icon("search")+'</button><button class="avatar" data-page="profile" aria-label="Abrir mi perfil">'+esc(initials(profile.name))+'</button></div></header>'
    +'<div class="layout"><aside class="sidebar"><div class="favorite-card"><div class="favorite-top">'+crest(profile.favorite)+'<div><span class="muted small" style="font-size:10px">MI EQUIPO</span><h3>'+esc(teamName(profile.favorite))+'</h3><span class="favorite-tag">'+icon("star")+'Favorito</span></div></div><button class="favorite-bottom link-button" data-page="profile" style="width:100%">Personalizar mi equipo '+icon("chevron")+'</button></div>'
    +'<div><p class="sidebar-label">EXPLORA EL JUEGO</p><nav class="side-nav" aria-label="Navegación principal">'+navButton("home","Panel principal","home")+navButton("matches","Partidos","ball")+navButton("predictions","Predicciones","target")+navButton("statistics","Estadísticas","chart")+navButton("history","Mi historial","history")+'</nav></div>'
    +'<div><p class="sidebar-label">MI ESPACIO</p><nav class="side-nav">'+navButton("profile","Perfil y ajustes","settings")+'</nav></div>'
    +'<div class="sidebar-bottom"><div class="status"><span class="dot"></span>Datos conectados</div><b>'+fmt(d.summary.matches)+' partidos disponibles</b><br>Último dato: '+esc(dateLabel(d.summary.to,true))+'</div></aside>'
    +'<main id="main" tabindex="-1"><div id="content">'+loading()+'</div><footer class="source-note"><span>SportPredict · El fútbol, con perspectiva.</span>'+sourceNote+'</footer></main></div>'
    +'<nav class="bottom-nav" aria-label="Navegación móvil">'+navButton("home","Inicio","home")+navButton("matches","Partidos","ball")+navButton("predictions","Predicciones","target")+navButton("history","Historial","history")+navButton("profile","Perfil","user")+"</nav>";
  document.querySelectorAll(".toplinks .icon").forEach(el=>el.remove());
}
function heading(title, subtitle, actions="", eyebrow="TU VISTA DEL JUEGO") {
  return '<div class="page-heading"><div><p class="eyebrow">'+esc(eyebrow)+'</p><h1>'+esc(title)+'</h1><p>'+esc(subtitle)+'</p></div><div class="page-actions">'+actions+"</div></div>";
}
function probabilityBar(p) {
  const pr=p.probabilities;
  return '<div class="prediction-box"><div class="probability-title"><span>Probabilidad de resultado</span><span>'+icon("spark")+' Modelo predictivo</span></div>'
    +'<div class="prob-labels"><div>Local <b class="green">'+pct(pr.H)+'</b></div><div>Empate <b class="muted">'+pct(pr.D)+'</b></div><div>Visitante <b class="red">'+pct(pr.A)+'</b></div></div>'
    +'<div class="prob-bar" role="img" aria-label="Local '+pct(pr.H)+", empate "+pct(pr.D)+", visitante "+pct(pr.A)+'"><span class="prob-h" style="width:'+pr.H*100+'%"></span><span class="prob-d" style="width:'+pr.D*100+'%"></span><span class="prob-a" style="width:'+pr.A*100+'%"></span></div></div>';
}
function hero(p) {
  const label=p.kind==="historical"?"Análisis histórico":p.kind==="scheduled"?"Partido programado":"Simulación";
  const favorite=p.favorite==="D"?"Empate":teamName(p.favorite==="H"?p.home:p.away);
  const saved=state.data.history.some(item=>item.request_key===p.request_key);
  return '<section class="card featured"><div class="featured-top"><span class="competition"><span class="spain-flag"></span> ESPAÑA · LALIGA</span><span class="pill history">'+icon("clock")+esc(label)+'</span></div>'
    +'<div class="match-versus"><div class="club">'+crest(p.home)+'<strong>'+esc(teamName(p.home))+'</strong><small>LOCAL</small></div><div class="versus"><b>VS</b><span>90 MIN</span></div><div class="club">'+crest(p.away)+'<strong>'+esc(teamName(p.away))+'</strong><small>VISITANTE</small></div></div>'
    +'<p class="match-date">'+esc(dateLabel(p.date))+'</p><div class="favorite-pill">'+icon("star")+'Mayor probabilidad: <strong>'+esc(favorite)+'</strong></div>'
    +probabilityBar(p)+'<div class="featured-footer"><p>Basado en '+fmt(p.training_count)+' partidos previos<br>Datos hasta '+esc(dateLabel(p.as_of,true))+'</p><button class="button '+(saved?"ghost":"")+'" data-action="save-prediction" '+(saved?"disabled":"")+">"+icon(saved?"check":"bookmark")+(saved?"Guardada":"Guardar análisis")+"</button></div></section>";
}
function statPair(p) {
  return '<div class="stat-pair">'+[["corners","flag","Tiros de esquina",""],["cards","cards","Tarjetas amarillas","amber"]].map(([key,glyph,label,color])=>'<div class="card stat-card"><div class="stat-icon '+color+'">'+icon(glyph)+'</div><div><p class="stat-title">'+label+'</p><strong class="metric">'+(p.stats[key]===null?"—":fmt(p.stats[key],1))+'</strong><p class="muted small">Promedio combinado · últimos 10</p></div></div>').join("")+"</div>";
}
function goalChart(p) {
  const width=560,height=142,pad=22,h=p.home_form.map(r=>r.goals),a=p.away_form.map(r=>r.goals),max=Math.max(4,...h,...a);
  const xy=(value,index)=>[pad+index*(width-2*pad)/4,height-12-value/max*(height-24)];
  const line=(values,color)=>'<polyline points="'+values.map((value,i)=>xy(value,i).join(",")).join(" ")+'" fill="none" stroke="'+color+'" stroke-width="2.6" stroke-linejoin="round"/>'+values.map((value,i)=>{const [x,y]=xy(value,i);return '<circle cx="'+x+'" cy="'+y+'" r="3.7" fill="'+color+'" stroke="#152333" stroke-width="2"><title>'+value+" goles</title></circle>";}).join("");
  return '<section class="card card-pad"><div class="card-head"><h2>El pulso de los equipos</h2><div class="chart-legend"><span><i></i>'+esc(teamName(p.home))+'</span><span><i></i>'+esc(teamName(p.away))+'</span></div></div><p class="muted small" style="font-size:10px">Goles anotados en sus últimos cinco partidos antes del análisis</p>'
    +'<svg class="line-chart" viewBox="0 0 '+width+' '+height+'" role="img" aria-label="Goles de los últimos cinco partidos: '+esc(teamName(p.home))+" "+h.join(", ")+", "+esc(teamName(p.away))+" "+a.join(", ")+'">'+[0,1,2,3,4].map(i=>{const y=height-12-i/4*(height-24);return '<line x1="22" y1="'+y+'" x2="538" y2="'+y+'" stroke="#2a3749" stroke-dasharray="3 5"/><text x="1" y="'+(y+3)+'" fill="#71849d" font-size="9">'+fmt(i*max/4,1)+"</text>";}).join("")+line(h,"#38dda0")+line(a,"#5298ff")+'</svg><div class="chart-foot"><span>Hace 5 partidos</span><span>Más reciente</span></div></section>';
}
function forms(p) {
  return '<section class="card card-pad"><div class="card-head"><h2>Estado de forma</h2><span class="muted small" style="font-size:9px">Últimos cinco</span></div><div class="form-list">'+[[p.home,p.home_form],[p.away,p.away_form]].map(([name,rows])=>'<div class="form-row">'+crest(name)+'<span>'+esc(teamName(name))+'</span><div class="form-dots">'+rows.map(r=>'<span class="form-dot '+r.result+'" title="'+esc(dateLabel(r.date))+" · "+r.goals+"–"+r.against+'">'+r.result+"</span>").join("")+"</div></div>").join("")+'</div><p class="muted small" style="font-size:9px;margin-top:16px">V victoria · E empate · D derrota · Del más antiguo al reciente</p></section>';
}
function miniMatch(m) {
  return '<button class="mini-match" data-predict="'+esc(m.id)+'"><div class="mini-date"><span>'+esc(dateLabel(m.date,true))+'</span><span>FINALIZADO</span></div><div class="mini-clubs">'+crest(m.home)+'<span class="mini-name">'+esc(teamName(m.home))+'</span><span class="mini-score">'+m.home_goals+' : '+m.away_goals+'</span><span class="mini-name">'+esc(teamName(m.away))+'</span>'+crest(m.away)+"</div></button>";
}
async function currentPrediction() {
  const requestedVersion=routeVersion;
  const selection=state.selection || {match_id:state.data.featured.id};
  const p=await post("predict",selection);
  if(requestedVersion===routeVersion)state.prediction=p;
  return p;
}
async function homeView() {
  const p=await currentPrediction(),d=state.data;
  return heading("Panel principal","Tu equipo, tus partidos. Una nueva perspectiva.",
    '<span class="pill"><span class="spain-flag"></span> LaLiga</span><button class="button" data-page="statistics">'+icon("chart")+'<span class="desktop-label">Ver estadísticas</span></button>')
    +'<div class="dashboard-grid"><div class="main-col">'+hero(p)+statPair(p)+goalChart(p)+forms(p)+'</div><aside class="rail"><section class="card card-pad"><div class="card-head"><span class="eyebrow">LA TEMPORADA, EN DATOS</span>'+icon("chart")+'</div><div class="season-value">'+fmt(d.summary.matches)+'</div><p class="muted small">partidos para explorar</p><div class="season-metrics"><div><b>'+d.summary.teams+'</b><small>Equipos</small></div><div><b>'+fmt(d.summary.goals)+'</b><small>Goles anotados</small></div></div><p class="season-date">'+icon("calendar")+'Histórico '+d.summary.from.slice(0,4)+' / '+d.summary.to.slice(0,4)+'</p></section>'
    +'<section class="card card-pad"><div class="card-head"><h2>Resultados recientes</h2><button class="link-button" data-page="matches" aria-label="Ver todos los partidos">'+icon("arrow")+'</button></div>'+d.matches.items.slice(0,3).map(miniMatch).join("")+'</section>'
    +'<section class="card quiet-card">'+icon("spark")+'<h3>Tu lectura del próximo partido</h3><p>Elige dos equipos y explora sus probabilidades con todo el historial disponible.</p><button class="link-button" data-action="new-prediction">Crear simulación '+icon("arrow")+'</button></section></aside></div>';
}
function matchCard(m) {
  const historical=m.kind==="historical",scored=m.home_goals!==null;
  return '<article class="card match-card"><div class="match-card-head"><span>'+esc(dateLabel(m.date,true))+'</span><span class="pill '+(historical?"":"live")+'" style="font-size:8px">'+(historical?"HISTÓRICO":scored?"RESULTADO LOCAL":"PROGRAMADO POR TI")+'</span></div>'
    +'<div class="match-versus"><div class="club">'+crest(m.home)+'<strong>'+esc(teamName(m.home))+'</strong></div><div class="versus"><b>'+(scored?m.home_goals+" : "+m.away_goals:esc(m.time))+'</b><span>'+(scored?"FINAL":"HORA LOCAL")+'</span></div><div class="club">'+crest(m.away)+'<strong>'+esc(teamName(m.away))+'</strong></div></div>'
    +'<div class="match-card-bottom"><span>'+icon("spark")+' '+(historical?"Análisis previo al partido":"Predicción del modelo")+'</span><button class="button" data-predict="'+esc(m.id)+'">Analizar '+icon("arrow")+'</button></div>'
    +(!historical&&m.date<=localDate()?'<button class="link-button" data-result="'+esc(m.id)+'" style="margin-top:14px">'+icon("check")+(scored?"Corregir resultado":"Registrar resultado")+"</button>":"")+"</article>";
}
function localDate() {
  const d=new Date();return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
}
async function matchesView() {
  let items,total;
  if(state.matchTab==="scheduled") {
    state.data.fixtures=await api("fixtures");
    items=state.data.fixtures.filter(m=>(!state.team||m.home===state.team||m.away===state.team)&&(!state.search||(teamName(m.home)+" "+teamName(m.away)).toLocaleLowerCase().includes(state.search.toLocaleLowerCase())));
    total=items.length;
  } else {
    const query=new URLSearchParams({search:state.search,team:state.team,limit:12,offset:state.offset});
    const response=await api("matches?"+query);items=response.items;total=response.total;
  }
  return heading("Cada partido cuenta",state.search?'Resultados para “'+state.search+'”':"Encuentra un encuentro y conoce la historia detrás del resultado.",
    '<button class="button primary" data-action="add-fixture">'+icon("plus")+'<span class="desktop-label">Programar partido</span></button>',"PARTIDOS · LALIGA")
    +'<div class="filters"><div class="tabs" role="tablist" aria-label="Tipo de partido"><button role="tab" aria-selected="'+(state.matchTab==="historical")+'" class="'+(state.matchTab==="historical"?"active":"")+'" data-tab="historical">Históricos <span class="muted">('+state.data.summary.matches+')</span></button><button role="tab" aria-selected="'+(state.matchTab==="scheduled")+'" class="'+(state.matchTab==="scheduled"?"active":"")+'" data-tab="scheduled">Programados por ti</button></div>'
    +'<select id="team-filter" class="filter-select" aria-label="Filtrar por equipo"><option value="">Todos los equipos</option>'+options(state.team)+'</select></div>'
    +(state.search?'<button class="link-button" data-action="clear-search" style="margin-bottom:18px">'+icon("close")+'Limpiar búsqueda</button>':"")
    +(items.length?'<div class="match-grid">'+items.map(matchCard).join("")+'</div>':empty("Aquí empieza el próximo encuentro",state.matchTab==="scheduled"?"Programa un cruce para analizarlo y guardar su predicción. Los encuentros de esta lista los agregas tú.":"No encontramos partidos con estos filtros.",state.matchTab==="scheduled"?'<button class="button primary" data-action="add-fixture">'+icon("plus")+'Programar partido</button>':""))
    +(state.matchTab==="historical"&&total>12?'<div class="pagination"><button class="button ghost" data-offset="'+Math.max(0,state.offset-12)+'" '+(!state.offset?"disabled":"")+'>Anterior</button><span>'+fmt(state.offset+1)+"–"+fmt(Math.min(state.offset+12,total))+" de "+fmt(total)+'</span><button class="button ghost" data-offset="'+(state.offset+12)+'" '+(state.offset+12>=total?"disabled":"")+'>Siguiente</button></div>':"");
}
async function predictionsView() {
  let p=null,error="";
  try {p=await currentPrediction();}catch(e){error=e.message;state.prediction=null;}
  const selectedHome=p?.home||state.data.profile.favorite;
  const selectedAway=p?.away||state.data.teams.find(t=>t.id!==selectedHome)?.id;
  return heading("Una mirada al resultado","Probabilidades que nacen del juego. Explora, compara y guarda.",'<button class="button" data-page="history">'+icon("history")+'<span class="desktop-label">Mi historial</span></button>',"ANÁLISIS PREDICTIVO")
    +'<div class="prediction-layout"><div class="main-col">'+(p?hero(p)+statPair(p)+forms(p)+'<section class="card card-pad"><div class="card-head"><h2>Enfrentamientos anteriores</h2><span class="muted small">'+p.h2h.length+' disponibles</span></div>'+(p.h2h.length?p.h2h.map(miniMatch).join(""):'<p class="muted small">No hay enfrentamientos previos entre estos equipos en el historial anterior a esta fecha.</p>')+"</section>":'<div class="error-box">'+esc(error)+'</div>')
    +'</div><section class="card card-pad"><div class="card-head"><h2>Elige tu encuentro</h2>'+icon("target")+'</div><form id="prediction-form" class="selector-form pred-selector"><label class="field">Equipo local<select name="home" required>'+options(selectedHome)+'</select></label><label class="field">Equipo visitante<select name="away" required>'+options(selectedAway)+'</select></label><button class="button primary" type="submit">'+icon("spark")+'Calcular probabilidades</button><p class="form-help">La simulación utiliza todo el historial cargado hasta '+esc(dateLabel(state.data.summary.to,true))+'. Al analizar un partido histórico, solo se usan encuentros anteriores a su fecha.</p><p class="form-help">Córners y tarjetas muestran promedios recientes de ambos equipos. Las probabilidades no garantizan el resultado.</p></form></section></div>';
}
async function statisticsView() {
  const data=await api("statistics"),m=data.metrics;
  return heading("El juego en números","Explora el rendimiento de los equipos y la evaluación del modelo.",'<a class="button" href="/api/dataset" download>'+icon("download")+'<span class="desktop-label">Exportar CSV</span></a>',"ESTADÍSTICAS")
    +'<div class="metrics-row">'+[
      ["EXACTITUD TEMPORAL",pct(m.accuracy),"Sobre "+m.test_count+" partidos de prueba"],
      ["REFERENCIA SIMPLE",pct(m.baseline),"Predecir siempre la clase mayoritaria"],
      ["PARTIDOS DE ENTRENAMIENTO",fmt(m.training_count),"Anteriores al periodo de prueba"],
      ["PÉRDIDA LOGARÍTMICA",fmt(m.log_loss,3),"Un valor menor indica mejor ajuste"],
    ].map(([label,value,note])=>'<div class="card metric-card"><p class="eyebrow">'+label+'</p><strong>'+value+'</strong><p>'+esc(note)+'</p></div>').join("")+'</div>'
    +'<div class="stats-grid"><section class="card card-pad"><div class="card-head"><h2>¿Cómo terminan los partidos?</h2>'+icon("ball")+'</div>'+["H","D","A"].map((key,i)=>'<div class="dist-row"><div class="dist-label"><span>'+({H:"Victoria local",D:"Empate",A:"Victoria visitante"}[key])+'</span><b>'+data.distribution[key]+' <span class="muted">· '+pct(data.distribution[key]/state.data.summary.matches)+'</span></b></div><div class="track"><span style="width:'+data.distribution[key]/state.data.summary.matches*100+'%;background:'+["var(--green)","#8997ad","var(--red)"][i]+'"></span></div></div>').join("")+'</section>'
    +'<section class="card card-pad"><div class="card-head"><h2>Predicción frente a resultado</h2>'+icon("target")+'</div><p class="muted small" style="font-size:10px">Filas: resultado real · Columnas: predicción</p><div class="matrix"><span></span>'+m.labels.map(x=>'<span class="matrix-label">'+x+'</span>').join("")+m.confusion.map((row,i)=>'<span class="matrix-label">'+m.labels[i]+'</span>'+row.map((value,j)=>'<span class="matrix-cell '+(i===j?"correct":"")+'">'+value+"</span>").join("")).join("")+'</div><p class="muted small" style="font-size:9px;margin-top:15px">Prueba cronológica: '+esc(dateLabel(m.test_from,true))+' – '+esc(dateLabel(m.test_to,true))+'. El 80 % es una meta del proyecto, no una precisión garantizada.</p></section></div>'
    +'<section class="card section-spacer"><div class="card-head card-pad" style="margin:0"><h2>Rendimiento de los equipos</h2><span class="muted small">Calculado con el CSV cargado</span></div><div class="table-wrap"><table class="standings"><thead><tr><th>#</th><th>Equipo</th><th>PJ</th><th>G</th><th>E</th><th>P</th><th>GF</th><th>GC</th><th>PTS</th></tr></thead><tbody>'+data.standings.map((row,i)=>'<tr><td class="rank">'+(i+1)+'</td><td><span class="table-team">'+crest(row.team)+esc(teamName(row.team))+'</span></td>'+["played","wins","draws","losses","goals","against"].map(key=>"<td>"+row[key]+"</td>").join("")+'<td class="green"><b>'+row.points+"</b></td></tr>").join("")+'</tbody></table></div></section><p class="form-help section-spacer">Orden: puntos, diferencia de goles y goles anotados. Esta tabla es un resumen estadístico del archivo; no aplica todos los criterios oficiales de desempate.</p>';
}
async function historyView() {
  state.data.history=await api("history");
  const all=state.data.history,evaluated=all.filter(p=>p.actual),correct=evaluated.filter(p=>p.actual===p.favorite);
  const filtered=all.filter(p=>state.historyFilter==="all"||state.historyFilter==="evaluated"&&p.actual||state.historyFilter==="pending"&&!p.actual);
  return heading("Tu historial de análisis","Guarda tus lecturas del juego y vuelve a ellas cuando quieras.",'<button class="button primary" data-action="new-prediction">'+icon("plus")+'<span class="desktop-label">Nuevo análisis</span></button>',"MI ESPACIO")
    +'<div class="metrics-row" style="grid-template-columns:repeat(3,1fr)">'+[
      ["GUARDADOS",all.length,"Análisis en tu historial"],["CON RESULTADO",evaluated.length,"Incluye recreaciones históricas"],["COINCIDENCIAS",correct.length,"Mayor probabilidad = resultado real"],
    ].map(([label,value,note])=>'<div class="card metric-card"><p class="eyebrow">'+label+'</p><strong>'+value+'</strong><p>'+note+'</p></div>').join("")+'</div>'
    +'<div class="filters"><div class="tabs">'+[["all","Todos"],["evaluated","Con resultado"],["pending","Sin resultado"]].map(([key,label])=>'<button data-history-filter="'+key+'" class="'+(state.historyFilter===key?"active":"")+'">'+label+'</button>').join("")+'</div></div>'
    +(filtered.length?'<div class="history-list">'+filtered.map(p=>'<article class="card history-item"><div class="history-teams">'+crest(p.home)+crest(p.away)+'<div><h3>'+esc(teamName(p.home))+' vs '+esc(teamName(p.away))+'</h3><p>'+esc(dateLabel(p.date))+' · '+(p.kind==="historical"?"Recreación histórica":p.kind==="scheduled"?"Programado por ti":"Simulación")+'</p></div></div><div class="history-actions"><div class="history-result"><b class="'+(p.actual?(p.actual===p.favorite?"green":"red"):"muted")+'">'+(p.actual?(p.actual===p.favorite?"Coincidencia":"Sin coincidencia"):"Sin resultado real")+'</b><small>Predicción: '+resultLabel(p.favorite)+' · '+pct(p.probabilities[p.favorite])+'</small></div><button class="icon-btn" data-delete="'+esc(p.id)+'" aria-label="Eliminar análisis de '+esc(teamName(p.home))+' vs '+esc(teamName(p.away))+'">'+icon("trash")+'</button></div></article>').join("")+'</div>':empty("Tu historial comienza contigo","Guarda una predicción desde el panel o crea tu propio cruce para verlo aquí.",'<button class="button primary" data-page="predictions">Explorar predicciones '+icon("arrow")+"</button>"));
}
async function profileView() {
  state.data.profile=await api("profile");state.data.history=await api("history");
  const p=state.data.profile;
  const evaluated=state.data.history.filter(item=>item.actual);
  const correct=evaluated.filter(item=>item.actual===item.favorite).length;
  const rate=evaluated.length?correct/evaluated.length:0;
  const profileStats='<div class="profile-summary"><div class="profile-ring" style="--progress:'+rate*100+'%"><strong>'+state.data.history.length+'</strong></div><div><b class="green">'+(evaluated.length?pct(rate):"—")+'</b><span> coincidencias<br>'+evaluated.length+' con resultado conocido</span></div></div><p class="form-help" style="margin-top:14px">Tus análisis guardados. Incluye recreaciones históricas.</p><button class="button ghost" data-page="history" style="margin-top:19px;width:100%">'+icon("history")+'Ver mi historial</button>';
  return heading("Tu espacio en SportPredict","Personaliza tu experiencia y conecta tus datos.",'',"PERFIL Y AJUSTES")
    +'<div class="profile-layout"><section class="card profile-card"><div class="avatar">'+esc(initials(p.name))+'</div><h2>'+esc(p.name)+'</h2><p>'+esc(p.role)+'</p><span class="pill live">'+icon("user")+'Perfil local</span>'+profileStats+'</section>'
    +'<section class="card card-pad"><div class="card-head"><h2>Hazlo tuyo</h2>'+icon("settings")+'</div><form id="profile-form" class="profile-form"><label class="field">Nombre<input name="name" required maxlength="60" value="'+esc(p.name)+'" autocomplete="name"></label><label class="field">Rol<input name="role" required maxlength="80" value="'+esc(p.role)+'"></label><label class="field full">Mi equipo favorito<select name="favorite">'+options(p.favorite)+'</select></label><div class="full"><button type="submit" class="button primary">'+icon("check")+'Guardar cambios</button></div><p class="form-help full">Este perfil y su historial se guardan en esta instalación. No requiere crear una cuenta.</p></form>'
    +'<div class="data-import"><h3>El punto de partida: tus datos</h3><p>'+esc(state.data.summary.source)+'<br>'+fmt(state.data.summary.matches)+' partidos · '+esc(dateLabel(state.data.summary.from,true))+' – '+esc(dateLabel(state.data.summary.to,true))+'</p><form id="import-form"><label class="field">Importar un CSV de resultados<input name="file" type="file" accept=".csv,text/csv" required></label><div class="import-actions"><button class="button" type="submit">'+icon("upload")+'Importar y entrenar</button><a class="link-button" href="/api/dataset" download>'+icon("download")+'Descargar datos actuales</a></div></form><p class="form-help" style="margin-top:16px">Columnas: Date, HomeTeam, AwayTeam, FTHG y FTAG. Opcionales: HC, AC, HY y AY. Máximo 5 MB. Necesitas al menos 30 partidos con los tres resultados en entrenamiento. Al importar, los datos actuales se reemplazan; tu historial guardado se conserva.</p></div></section></div>';
}
const views={home:homeView,matches:matchesView,predictions:predictionsView,statistics:statisticsView,history:historyView,profile:profileView};
async function render() {
  const current=++routeVersion;
  state.page=location.hash.slice(1) in views ? location.hash.slice(1) : "home";
  shell();
  try {
    const html=await views[state.page]();
    if(current!==routeVersion) return;
    document.querySelector("#content").innerHTML=html;
    document.querySelectorAll(".page-actions .button").forEach(button => {
      if (!button.hasAttribute("aria-label")) button.setAttribute("aria-label",button.textContent.trim());
    });
    document.title=({home:"Panel principal",matches:"Partidos",predictions:"Predicciones",statistics:"Estadísticas",history:"Mi historial",profile:"Mi perfil"}[state.page])+" · SportPredict";
  } catch(error) {
    if(current!==routeVersion) return;
    document.querySelector("#content").innerHTML=heading("No pudimos cargar esta vista","Tus datos siguen guardados.")+'<div class="error-box">'+esc(error.message)+'</div><div class="import-actions"><button class="button" data-action="retry">Intentar otra vez</button><button class="button ghost" data-page="profile">Revisar datos</button></div>';
  }
}
function navigate(page) {
  if(location.hash==="#"+page) render();else location.hash=page;
  window.scrollTo({top:0,behavior:"instant"});
}
function openFixture() {
  dialog.innerHTML='<div class="card-head"><h2>Programa un partido</h2><button class="icon-btn" data-action="close-dialog" aria-label="Cerrar">'+icon("close")+'</button></div><form id="fixture-form" class="selector-form"><label class="field">Local<select name="home">'+options(state.data.profile.favorite)+'</select></label><label class="field">Visitante<select name="away">'+options(state.data.teams.find(t=>t.id!==state.data.profile.favorite).id)+'</select></label><label class="field">Fecha<input name="date" type="date" required min="'+localDate()+'" value="'+localDate()+'"></label><label class="field">Hora local<input name="time" type="time" required value="20:00"></label><p class="form-help">Es un encuentro agregado por ti. No se sincroniza con un calendario oficial.</p><button class="button primary" type="submit">'+icon("plus")+'Agregar partido</button></form>';
  dialog.showModal();
}
function openResult(ident) {
  const m=state.data.fixtures.find(x=>x.id===ident);if(!m)return;
  dialog.innerHTML='<div class="card-head"><h2>Registrar resultado</h2><button class="icon-btn" data-action="close-dialog" aria-label="Cerrar">'+icon("close")+'</button></div><form id="result-form" data-id="'+esc(ident)+'" class="selector-form"><label class="field">'+esc(teamName(m.home))+'<input name="home_goals" required type="number" min="0" max="30" step="1" value="'+(m.home_goals??0)+'"></label><label class="field">'+esc(teamName(m.away))+'<input name="away_goals" required type="number" min="0" max="30" step="1" value="'+(m.away_goals??0)+'"></label><p class="form-help">El resultado quedará como dato registrado por ti y actualizará las predicciones guardadas de este encuentro.</p><button class="button primary" type="submit">Guardar resultado</button></form>';
  dialog.showModal();
}
document.addEventListener("click",async event=>{
  const button=event.target.closest("button,[data-page]");if(!button||button.disabled)return;
  if(button.dataset.page){navigate(button.dataset.page);return;}
  try {
    if(button.dataset.predict){state.selection={match_id:button.dataset.predict};navigate("predictions");}
    else if(button.dataset.tab){state.matchTab=button.dataset.tab;state.offset=0;render();}
    else if(button.dataset.offset!==undefined){state.offset=Number(button.dataset.offset);render();window.scrollTo(0,0);}
    else if(button.dataset.historyFilter){state.historyFilter=button.dataset.historyFilter;render();}
    else if(button.dataset.result){openResult(button.dataset.result);}
    else if(button.dataset.delete){button.disabled=true;await api("history/"+button.dataset.delete,{method:"DELETE"});toast("Análisis eliminado del historial.");render();}
    else {
      switch(button.dataset.action) {
        case "retry":render();break;
        case "clear-search":state.search="";state.offset=0;render();break;
        case "close-dialog":dialog.close();break;
        case "add-fixture":openFixture();break;
        case "new-prediction":state.selection={home:state.data.profile.favorite,away:state.data.teams.find(t=>t.id!==state.data.profile.favorite).id};navigate("predictions");break;
        case "save-prediction":
          button.disabled=true;
          await post("save",{home:state.prediction.home,away:state.prediction.away,match_id:state.prediction.match_id});
          state.data.history=await api("history");button.innerHTML=icon("check")+"Guardada";toast("Análisis guardado en tu historial.");break;
        case "search":
          dialog.innerHTML='<div class="card-head"><h2>Buscar un partido</h2><button class="icon-btn" data-action="close-dialog" aria-label="Cerrar">'+icon("close")+'</button></div><form id="mobile-search-form" class="selector-form"><label class="field">Equipo<input name="search" placeholder="Por ejemplo, Barcelona" value="'+esc(state.search)+'"></label><button class="button primary">Buscar</button></form>';dialog.showModal();break;
      }
    }
  }catch(error){button.disabled=false;toast(error.message,true);}
});
document.addEventListener("change",event=>{
  if(event.target.id==="team-filter"){state.team=event.target.value;state.offset=0;render();}
});
document.addEventListener("submit",async event=>{
  const form=event.target;
  if(!["search-form","mobile-search-form","prediction-form","profile-form","import-form","fixture-form","result-form"].includes(form.id))return;
  event.preventDefault();
  const data=Object.fromEntries(new FormData(form));const button=form.querySelector('[type="submit"],button');
  if(button)button.disabled=true;
  try{
    if(form.id==="search-form"||form.id==="mobile-search-form"){state.search=String(data.search).trim();state.offset=0;if(dialog.open)dialog.close();navigate("matches");}
    if(form.id==="prediction-form"){
      if(data.home===data.away)throw new Error("Selecciona dos equipos diferentes.");
      state.selection={home:data.home,away:data.away};await render();
    }
    if(form.id==="profile-form"){state.data.profile=await post("profile",data);toast("Tu perfil se actualizó.");render();}
    if(form.id==="fixture-form"){await post("fixtures",data);dialog.close();state.matchTab="scheduled";state.search="";state.team="";navigate("matches");toast("Partido programado.");}
    if(form.id==="result-form"){await post("result/"+form.dataset.id,{home_goals:Number(data.home_goals),away_goals:Number(data.away_goals)});dialog.close();state.data.history=await api("history");render();toast("Resultado guardado.");}
    if(form.id==="import-form"){
      const file=form.querySelector('input[type="file"]').files[0];
      if(!file)throw new Error("Selecciona un archivo CSV.");
      if(file.size>5*1024*1024)throw new Error("El archivo supera el máximo de 5 MB.");
      button.innerHTML='<span class="spinner"></span> Importando y entrenando…';
      const result=await api("dataset?name="+encodeURIComponent(file.name),{method:"POST",headers:{"Content-Type":"text/csv"},body:await file.arrayBuffer()});
      state.data=await api("bootstrap");state.selection=null;state.prediction=null;state.team="";state.offset=0;
      toast(fmt(result.matches)+" partidos importados. "+result.removed+" filas inválidas o duplicadas descartadas.");render();
    }
  }catch(error){toast(error.message,true);}
  finally{if(button){button.disabled=false;if(form.id==="import-form")button.innerHTML=icon("upload")+"Importar y entrenar";}}
});
window.addEventListener("hashchange",render);
async function start(){
  try{state.data=await api("bootstrap");await render();}
  catch(error){app.innerHTML='<div class="boot"><img src="/assets/logo.svg" alt="" width="48"><h2>No se pudo conectar</h2><p>'+esc(error.message)+'</p><button class="button primary" id="reload">Reintentar</button></div>';document.querySelector("#reload").addEventListener("click",start);}
}
start();
