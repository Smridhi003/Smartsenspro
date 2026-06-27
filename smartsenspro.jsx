import { useState, useEffect, useRef } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine
} from "recharts";

// ── Design tokens ──────────────────────────────────────────────────────────────
const BG   = "#07090F", SURF = "#0D1117", CARD = "#111827", BRD = "#1F2937";
const CYAN = "#22D3EE", GRN  = "#10B981", AMB  = "#F59E0B", RED = "#EF4444";
const PUR  = "#A855F7";
const T1   = "#F1F5F9", T2   = "#64748B", T3   = "#374151";
const MONO = "'Space Mono', monospace", SANS = "Inter, system-ui, sans-serif";

// ── Sensor configuration ───────────────────────────────────────────────────────
const SENSORS = [
  { id:"temp",  name:"Temperature", unit:"°C",    normal:[60,78],     warn:84,   crit:93,   base:69,   noise:0.05,  wave:0.06  },
  { id:"vib",   name:"Vibration",   unit:"mm/s",  normal:[0.2,2.5],   warn:3.8,  crit:5.5,  base:1.3,  noise:0.18,  wave:0.15  },
  { id:"pres",  name:"Pressure",    unit:"bar",   normal:[4.0,6.0],   warn:6.8,  crit:7.8,  base:5.1,  noise:0.04,  wave:0.04  },
  { id:"humid", name:"Humidity",    unit:"%",     normal:[35,65],     warn:75,   crit:85,   base:50,   noise:0.04,  wave:0.05  },
  { id:"amps",  name:"Current",     unit:"A",     normal:[7.0,13.0],  warn:15.0, crit:17.5, base:10.0, noise:0.06,  wave:0.06  },
  { id:"rpm",   name:"Motor RPM",   unit:"rpm",   normal:[1460,1540], warn:1570, crit:1600, base:1500, noise:0.002, wave:0.003 },
];
const WIN = 40;

// ── ML Utilities ───────────────────────────────────────────────────────────────
const rMean  = a => a.length ? a.reduce((s,v)=>s+v,0)/a.length : 0;
const rStd   = a => { if(a.length<2) return 0; const m=rMean(a); return Math.sqrt(a.reduce((s,v)=>s+(v-m)**2,0)/a.length); };
const zScore = (v,m,s) => s>0 ? Math.abs((v-m)/s) : 0;
const emaCalc= (a,alpha=0.12) => a.reduce((e,v,i)=>i===0?v:alpha*v+(1-alpha)*e, a[0]??0);

function sStatus(v, s) {
  const [lo,hi] = s.normal;
  if (v>=lo && v<=hi) return "ok";
  if (v>hi)           return v>=s.crit ? "crit" : "warn";
  return v <= lo-(s.warn-hi) ? "crit" : "warn";
}

function calcMHI(vals, deg) {
  const scores = SENSORS.map(s=>{
    const st = sStatus(vals[s.id]??s.base, s);
    return st==="ok" ? 100 : st==="warn" ? 58 : 20;
  });
  return Math.max(12, Math.min(98, Math.round(rMean(scores)-deg*22)));
}

function genVal(s, t, deg, spike=false) {
  const [lo,hi] = s.normal, range=hi-lo;
  let v = s.base+(Math.random()-.5)*2*range*s.noise+Math.sin(t*.04)*range*s.wave+deg*range*.5;
  if (spike) v += (Math.random()>.5?1:-1)*range*(.8+Math.random());
  return parseFloat(v.toFixed(s.id==="rpm"?0:2));
}

// ── SVG Arc Gauge (250°, 145°→35° clockwise) ──────────────────────────────────
function Gauge({ score }) {
  const cx=80, cy=70, r=58;
  const rd  = d => d*Math.PI/180;
  const sA  = rd(145), tA=rd(250), fA=tA*score/100;
  const pt  = a => [+(cx+r*Math.cos(a)).toFixed(3), +(cy+r*Math.sin(a)).toFixed(3)];
  const [sx,sy] = pt(sA);
  const [ex,ey] = pt(sA+tA);
  const [fx,fy] = score>0 ? pt(sA+fA) : [sx,sy];
  const lf  = a => a>Math.PI ? 1 : 0;
  const col = score>75 ? GRN : score>45 ? AMB : RED;
  return (
    <svg viewBox="15 5 130 108" width="100%" style={{display:"block"}}>
      <path d={`M${sx},${sy} A${r},${r} 0 1 1 ${ex},${ey}`}
            fill="none" stroke={BRD} strokeWidth={10} strokeLinecap="round"/>
      {score>0 && <path d={`M${sx},${sy} A${r},${r} 0 ${lf(fA)} 1 ${fx},${fy}`}
            fill="none" stroke={col} strokeWidth={10} strokeLinecap="round"/>}
      <text x={80} y={67} textAnchor="middle" fill={col}
            fontSize={22} fontWeight={700} fontFamily={MONO}>{score}</text>
      <text x={80} y={80} textAnchor="middle" fill={T3}
            fontSize={8.5} fontFamily={SANS}>% HEALTH INDEX</text>
    </svg>
  );
}

const StatRow = ({label,value,color}) => (
  <div style={{display:"flex",justifyContent:"space-between",fontSize:10,marginBottom:5}}>
    <span style={{color:T2}}>{label}</span>
    <span style={{fontFamily:MONO,color:color||T1}}>{value}</span>
  </div>
);

// ── Main Application ───────────────────────────────────────────────────────────
/*
------------------------------------------------------------
SmartSense Pro
Industrial IoT + AI Predictive Maintenance Dashboard

Features:
- Real-time sensor monitoring
- Machine Health Index (MHI)
- Z-Score anomaly detection
- EMA analytics
- Predictive maintenance
- AI diagnostics (Demo Mode)

Author: Smridhi
------------------------------------------------------------
*/
export default function SmartSensePro() {
  const [tick,   setTick]   = useState(0);
  const [live,   setLive]   = useState(true);
  const [selId,  setSelId]  = useState("temp");
  const [vals,   setVals]   = useState(()=>Object.fromEntries(SENSORS.map(s=>[s.id,s.base])));
  const [mhi,    setMhi]    = useState(96);
  const [deg,    setDeg]    = useState(0);
  const [alerts, setAlerts] = useState([]);
  const [ml,     setMl]     = useState({});
  const [chart,  setChart]  = useState([]);
  const [msgs,   setMsgs]   = useState([]);
  const [input,  setInput]  = useState("");
  const [aiLoad, setAiLoad] = useState(false);

  const hist    = useRef(Object.fromEntries(SENSORS.map(s=>[s.id,[]])));
  const tkRef   = useRef(0);
  const chatEnd = useRef(null);

  // Simulation loop ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => {
      tkRef.current++;
      const t      = tkRef.current;
      const newDeg = Math.min(.7, t*.0007);
      const nv={}, nm={}, na=[];

      SENSORS.forEach(s => {
        const spike = Math.random() < .033;
        const v     = genVal(s, t, newDeg, spike);
        nv[s.id]    = v;

        const h = hist.current[s.id];
        h.push(v); if(h.length>80) h.shift();
        const win = h.slice(-WIN);
        const m=rMean(win), sd=rStd(win), z=zScore(v,m,sd);
        const ema=emaCalc(h.slice(-12)), status=sStatus(v,s);
        nm[s.id] = { m, sd, z, ema, status };

        if (z>2.5 || (spike && status!=="ok")) {
          na.push({
            id:`${t}-${s.id}`, sensor:s.name, val:`${v}${s.unit}`,
            z:z.toFixed(2), sev:status==="crit"?"CRITICAL":"WARNING",
            col:status==="crit"?RED:AMB,
            time:new Date().toLocaleTimeString("en",{hour:"2-digit",minute:"2-digit",second:"2-digit"})
          });
        }
      });

      setVals(nv); setDeg(newDeg); setMl(nm); setMhi(calcMHI(nv,newDeg));
      if (na.length) setAlerts(p=>[...na,...p].slice(0,18));

      setChart(p => {
        const pt={t}; SENSORS.forEach(s=>{pt[s.id]=nv[s.id];});
        const nx=[...p,pt]; return nx.length>60?nx.slice(-60):nx;
      });
      setTick(t);
    }, 1000);
    return () => clearInterval(id);
  }, [live]);

  useEffect(()=>{ chatEnd.current?.scrollIntoView({behavior:"smooth"}); }, [msgs]);

  // AI chat ─────────────────────────────────────────────────────────────────────
  const sendAI = async () => {
    if (!input.trim() || aiLoad) return;
    const msg = input.trim(); setInput("");
    setMsgs(p=>[...p,{r:"user",c:msg}]); setAiLoad(true);
    try {
      const ctx = SENSORS.map(s=>{
        const d = ml[s.id]||{};
        return `${s.name}: ${vals[s.id]}${s.unit} | μ=${(d.m||0).toFixed(1)} σ=${(d.sd||0).toFixed(2)} z=${(d.z||0).toFixed(2)}σ | status=${d.status||"ok"}`;
      }).join("\n");

      const sys = `You are an expert Industrial IoT engineer and AI-powered predictive maintenance system monitoring heavy industrial machinery.

LIVE TELEMETRY (1-second resolution):
${ctx}
Machine Health Index (MHI): ${mhi}%
System Degradation: ${(deg*100).toFixed(1)}%
Estimated maintenance window: ${Math.max(0,Math.round((1-deg)*60))}h
Recent anomalies: ${alerts.slice(0,3).map(a=>`${a.sensor}@${a.val}(z=${a.z}σ)`).join(", ")||"none"}

Respond as a real-time IoT diagnostic AI. Be technical, precise, and actionable in 2-3 sentences. Reference exact sensor values, z-scores, and ML metrics. Flag safety-critical conditions immediately.`;

      const res = await new Promise(resolve => setTimeout(resolve, 1000));

setMsgs(p => [
  ...p,
  {
    r: "ai",
    c: "🤖 Demo Mode\n\nThe AI assistant is disabled in the public GitHub version.\n\nCurrent telemetry indicates the machine is operating normally. Connect your own backend and API key to enable real-time AI diagnostics."
  }
]);

  const sCol = st => st==="ok"?GRN:st==="crit"?RED:AMB;
  const selS = SENSORS.find(s=>s.id===selId);
  const maint = Math.max(0, Math.round((1-deg)*60));

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{fontFamily:SANS,background:BG,color:T1,minHeight:"100vh",paddingBottom:24}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Inter:wght@400;500;600;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:4px;height:4px}
        ::-webkit-scrollbar-track{background:${SURF}}
        ::-webkit-scrollbar-thumb{background:${BRD};border-radius:4px}
        @keyframes blink{0%,100%{opacity:1}50%{opacity:.25}}
        @keyframes slideIn{from{opacity:0;transform:translateY(-5px)}to{opacity:1;transform:none}}
        input:focus{outline:1px solid ${CYAN}60}
      `}</style>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div style={{background:SURF,borderBottom:`1px solid ${BRD}`,padding:"10px 20px",
                   display:"flex",alignItems:"center",justifyContent:"space-between",
                   position:"sticky",top:0,zIndex:50}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={{background:`${CYAN}14`,border:`1px solid ${CYAN}28`,
                       borderRadius:8,padding:"6px 10px",fontSize:19}}>⚡</div>
          <div>
            <div style={{fontSize:14,fontWeight:700,letterSpacing:"-.02em"}}>SmartSense Pro</div>
            <div style={{fontSize:10,color:T2}}>Industrial IoT · AI/ML Predictive Maintenance · Real-time Analytics</div>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:18}}>
          {[["TICK",tick.toString().padStart(5,"0"),CYAN],
            ["MHI",`${mhi}%`,mhi>70?GRN:mhi>45?AMB:RED],
            ["ALERTS",alerts.length,alerts.length>0?AMB:T3],
            ["MAINT",`${maint}h`,maint<20?RED:GRN]].map(([l,v,c])=>(
            <div key={l} style={{textAlign:"center"}}>
              <div style={{fontSize:9,color:T3,letterSpacing:".08em"}}>{l}</div>
              <div style={{fontFamily:MONO,fontSize:13,color:c,marginTop:2}}>{v}</div>
            </div>
          ))}
          <button onClick={()=>setLive(x=>!x)} style={{
            background:live?`${GRN}15`:`${RED}15`,border:`1px solid ${live?GRN:RED}40`,
            color:live?GRN:RED,borderRadius:8,padding:"5px 12px",cursor:"pointer",
            fontSize:11,fontWeight:600,letterSpacing:".04em"}}>
            {live ? "◉ LIVE" : "▶ PAUSED"}
          </button>
        </div>
      </div>

      <div style={{padding:"14px 18px",display:"flex",flexDirection:"column",gap:12}}>

        {/* ── Sensor Cards ────────────────────────────────────────────── */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:8}}>
          {SENSORS.map(s=>{
            const v   = vals[s.id]??s.base;
            const d   = ml[s.id]||{};
            const st  = d.status||"ok";
            const col = sCol(st);
            const mini= (hist.current[s.id]||[]).slice(-18).map((y,i)=>({i,y}));
            return (
              <div key={s.id} onClick={()=>setSelId(s.id)} style={{
                background:CARD,borderRadius:10,cursor:"pointer",
                border:`1px solid ${selId===s.id?col+"70":st!=="ok"?col+"32":BRD}`,
                padding:"11px 12px",transition:"border-color .2s"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:7}}>
                  <div>
                    <div style={{fontSize:9,color:T2,letterSpacing:".07em",textTransform:"uppercase",marginBottom:2}}>
                      {s.name}
                    </div>
                    <div style={{fontFamily:MONO,fontSize:19,fontWeight:700,color:col,lineHeight:1}}>
                      {v}<span style={{fontSize:9.5,fontWeight:400,color:T3,marginLeft:3}}>{s.unit}</span>
                    </div>
                  </div>
                  <div style={{width:7,height:7,borderRadius:"50%",background:col,marginTop:2,
                    animation:st!=="ok"?"blink 1.1s ease-in-out infinite":"none"}}/>
                </div>
                <ResponsiveContainer width="100%" height={28}>
                  <AreaChart data={mini} margin={{top:0,right:0,left:0,bottom:0}}>
                    <defs>
                      <linearGradient id={`g${s.id}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor={col} stopOpacity={.35}/>
                        <stop offset="95%" stopColor={col} stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <Area type="monotone" dataKey="y" stroke={col} fill={`url(#g${s.id})`}
                          strokeWidth={1.5} dot={false} isAnimationActive={false}/>
                  </AreaChart>
                </ResponsiveContainer>
                {d.z>0 && (
                  <div style={{fontSize:8.5,color:d.z>2.5?AMB:T3,marginTop:3}}>
                    z={d.z.toFixed(1)}σ{d.z>2.5?" ⚠":""}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ── Chart + Right panel ─────────────────────────────────────── */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 218px",gap:12}}>

          {/* Main time-series chart */}
          <div style={{background:CARD,border:`1px solid ${BRD}`,borderRadius:10,padding:"13px 15px"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <div>
                <div style={{fontSize:12,fontWeight:600}}>Real-time sensor stream</div>
                <div style={{fontSize:9.5,color:T2,marginTop:2}}>
                  Z-score anomaly detection · EMA smoothing · threshold monitoring
                </div>
              </div>
              <div style={{display:"flex",gap:5}}>
                {SENSORS.slice(0,4).map(s=>(
                  <button key={s.id} onClick={()=>setSelId(s.id)} style={{
                    background:selId===s.id?`${CYAN}20`:"transparent",
                    border:`1px solid ${selId===s.id?`${CYAN}60`:BRD}`,
                    color:selId===s.id?CYAN:T2,borderRadius:6,
                    padding:"2px 8px",cursor:"pointer",fontSize:9.5}}>
                    {s.name}
                  </button>
                ))}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={192}>
              <AreaChart data={chart} margin={{top:4,right:4,left:-24,bottom:0}}>
                <defs>
                  <linearGradient id="mg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={CYAN} stopOpacity={.25}/>
                    <stop offset="95%" stopColor={CYAN} stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={BRD} strokeDasharray="3 3" strokeOpacity={.7}/>
                <XAxis dataKey="t" tick={{fill:T3,fontSize:8.5}} tickLine={false}/>
                <YAxis tick={{fill:T3,fontSize:8.5}} tickLine={false} axisLine={false}/>
                <Tooltip contentStyle={{background:SURF,border:`1px solid ${BRD}`,borderRadius:8,fontSize:11}}
                         labelStyle={{color:T2}} itemStyle={{color:CYAN}}/>
                {selS && <>
                  <ReferenceLine y={selS.warn} stroke={`${AMB}55`} strokeDasharray="5 3"/>
                  <ReferenceLine y={selS.crit} stroke={`${RED}55`} strokeDasharray="5 3"/>
                </>}
                <Area type="monotone" dataKey={selId} stroke={CYAN} fill="url(#mg)"
                      strokeWidth={2} dot={false} isAnimationActive={false}/>
              </AreaChart>
            </ResponsiveContainer>
            <div style={{display:"flex",gap:14,marginTop:7,fontSize:9.5,color:T3}}>
              <span style={{color:CYAN}}>— live signal</span>
              <span style={{color:`${AMB}80`}}>— — warning</span>
              <span style={{color:`${RED}80`}}>— — critical</span>
              <span style={{color:PUR}}>◈ AI-powered insights</span>
            </div>
          </div>

          {/* Gauge + Anomaly log */}
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            <div style={{background:CARD,border:`1px solid ${BRD}`,borderRadius:10,padding:13}}>
              <div style={{fontSize:9.5,color:T2,letterSpacing:".06em",marginBottom:5}}>MACHINE HEALTH INDEX</div>
              <Gauge score={mhi}/>
              <div style={{marginTop:8}}>
                <StatRow label="Degradation"     value={`${(deg*100).toFixed(1)}%`}  color={deg>.3?AMB:GRN}/>
                <StatRow label="Maint. ETA"      value={`${maint}h`}                  color={maint<20?RED:GRN}/>
                <StatRow label="Active anomalies" value={alerts.length}               color={alerts.length>3?AMB:T3}/>
                <div style={{height:2.5,background:BRD,borderRadius:2,overflow:"hidden",marginTop:4}}>
                  <div style={{height:"100%",width:`${deg*100}%`,
                    background:deg>.3?AMB:GRN,borderRadius:2,transition:"width .5s ease"}}/>
                </div>
              </div>
            </div>

            <div style={{background:CARD,border:`1px solid ${BRD}`,borderRadius:10,padding:12,flex:1}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <span style={{fontSize:9.5,color:T2,letterSpacing:".06em"}}>ANOMALY LOG</span>
                <span style={{fontSize:8,color:T3}}>|z| &gt; 2.5σ</span>
              </div>
              <div style={{maxHeight:155,overflowY:"auto",display:"flex",flexDirection:"column",gap:5}}>
                {alerts.length===0
                  ? <div style={{fontSize:10,color:T3,textAlign:"center",padding:"14px 0"}}>✓ System nominal</div>
                  : alerts.map((a,i)=>(
                    <div key={a.id} style={{background:SURF,border:`1px solid ${a.col}28`,
                      borderRadius:7,padding:"7px 9px",
                      animation:i===0?"slideIn .22s ease":"none"}}>
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:2}}>
                        <span style={{fontSize:9,color:a.col,fontWeight:700}}>{a.sev}</span>
                        <span style={{fontSize:9,color:T3}}>{a.time}</span>
                      </div>
                      <div style={{fontSize:10,color:T1}}>{a.sensor} → {a.val}</div>
                      <div style={{fontSize:8.5,color:T3}}>z-score: {a.z}σ</div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── ML Stats + AI Chat ───────────────────────────────────────── */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>

          {/* ML analytics panel */}
          <div style={{background:CARD,border:`1px solid ${BRD}`,borderRadius:10,padding:13}}>
            <div style={{fontSize:12,fontWeight:600,marginBottom:10,
                         display:"flex",alignItems:"center",gap:7}}>
              <span style={{color:PUR}}>◈</span> ML feature analytics
              <span style={{fontSize:9,color:T3,marginLeft:"auto"}}>window = {WIN} samples</span>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:7}}>
              {SENSORS.map(s=>{
                const d   = ml[s.id]||{};
                const col = sCol(d.status||"ok");
                const pct = d.status==="ok"?88:d.status==="warn"?52:18;
                return (
                  <div key={s.id} style={{background:SURF,border:`1px solid ${BRD}`,
                                          borderRadius:7,padding:"9px 10px"}}>
                    <div style={{fontSize:9.5,color:"#94A3B8",fontWeight:600,marginBottom:6}}>
                      {s.name}
                    </div>
                    {[["μ mean",(d.m||0).toFixed(1)],
                      ["σ std", (d.sd||0).toFixed(2)],
                      ["EMA",   (d.ema||0).toFixed(1)],
                      ["z-score",`${(d.z||0).toFixed(2)}σ`]].map(([l,v])=>(
                      <div key={l} style={{display:"flex",justifyContent:"space-between",
                                          fontSize:9,marginBottom:3}}>
                        <span style={{color:T3}}>{l}</span>
                        <span style={{fontFamily:MONO,
                          color:l==="z-score"&&d.z>2.5?AMB:T1}}>{v}</span>
                      </div>
                    ))}
                    <div style={{marginTop:5,height:2.5,background:BRD,borderRadius:2}}>
                      <div style={{height:"100%",background:col,borderRadius:2,
                                   width:`${pct}%`,transition:"width .5s"}}/>
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{marginTop:10,background:SURF,border:`1px solid ${PUR}18`,
                         borderRadius:7,padding:"8px 11px"}}>
              <div style={{fontSize:9,color:PUR,fontWeight:700,letterSpacing:".07em",marginBottom:5}}>
                ACTIVE ML ALGORITHMS
              </div>
              <div style={{display:"flex",flexWrap:"wrap",gap:"5px 14px",fontSize:9,color:T2}}>
                {["Rolling Z-Score anomaly detection","Exponential Moving Average (EMA)",
                  "Statistical Process Control","Machine Health Index (MHI)",
                  "Degradation trend analysis","Predictive Maintenance ETA"].map(a=>(
                  <span key={a}>◉ {a}</span>
                ))}
              </div>
            </div>
          </div>

          {/* AI chat panel */}
          <div style={{background:CARD,border:`1px solid ${PUR}30`,borderRadius:10,
                       padding:13,display:"flex",flexDirection:"column"}}>
            <div style={{fontSize:12,fontWeight:600,marginBottom:3,
                         display:"flex",alignItems:"center",gap:7}}>
              <span style={{color:PUR}}>◈</span> AI diagnostics assistant
              <span style={{fontSize:9.5,color:T3,marginLeft:"auto"}}> AI Demo</span>
            </div>
            <div style={{fontSize:9.5,color:T2,marginBottom:10}}>
              Analyzes live telemetry · detects root causes · schedules maintenance
            </div>

            <div style={{flex:1,maxHeight:232,overflowY:"auto",display:"flex",
                         flexDirection:"column",gap:8,marginBottom:10}}>
              {msgs.length===0
                ? <div style={{textAlign:"center",padding:"10px 0"}}>
                    <div style={{fontSize:22,marginBottom:7}}>🤖</div>
                    <div style={{fontSize:10.5,color:T2,lineHeight:1.6}}>
                      Ask about sensor health, anomaly root causes,<br/>or maintenance scheduling
                    </div>
                    <div style={{display:"flex",flexWrap:"wrap",gap:5,justifyContent:"center",marginTop:10}}>
                      {["Diagnose system status","Why is vibration high?",
                        "When is maintenance due?","Predict failure risk"].map(q=>(
                        <button key={q} onClick={()=>setInput(q)} style={{
                          background:`${PUR}13`,border:`1px solid ${PUR}28`,
                          color:PUR,borderRadius:10,padding:"3px 9px",
                          cursor:"pointer",fontSize:9.5}}>{q}</button>
                      ))}
                    </div>
                  </div>
                : msgs.map((m,i)=>(
                  <div key={i} style={{alignSelf:m.r==="user"?"flex-end":"flex-start",maxWidth:"87%"}}>
                    <div style={{
                      background:m.r==="user"?`${CYAN}16`:`${PUR}11`,
                      border:`1px solid ${m.r==="user"?`${CYAN}28`:`${PUR}28`}`,
                      borderRadius:8,padding:"8px 11px",fontSize:10.5,lineHeight:1.55,color:T1}}>
                      {m.c}
                    </div>
                  </div>
                ))}
              {aiLoad && (
                <div style={{alignSelf:"flex-start"}}>
                  <div style={{background:`${PUR}11`,border:`1px solid ${PUR}28`,
                    borderRadius:8,padding:"8px 11px",fontSize:10.5,color:PUR}}>
                    ◈ Analyzing telemetry...
                  </div>
                </div>
              )}
              <div ref={chatEnd}/>
            </div>

            <div style={{display:"flex",gap:7}}>
              <input value={input} onChange={e=>setInput(e.target.value)}
                     onKeyDown={e=>e.key==="Enter"&&sendAI()}
                     placeholder="Ask about anomalies, sensor health, maintenance..."
                     style={{flex:1,background:SURF,border:`1px solid ${BRD}`,borderRadius:8,
                       padding:"7px 11px",color:T1,fontSize:11,outline:"none"}}/>
              <button onClick={sendAI} disabled={aiLoad||!input.trim()} style={{
                background:`${PUR}22`,border:`1px solid ${PUR}50`,color:PUR,
                borderRadius:8,padding:"7px 14px",cursor:"pointer",fontSize:12,
                opacity:aiLoad||!input.trim()?".4":"1"}}>→</button>
            </div>
          </div>
        </div>

        {/* ── Tech-stack footer ─────────────────────────────────────────── */}
        <div style={{background:SURF,border:`1px solid ${BRD}`,borderRadius:10,
                     padding:"8px 15px",display:"flex",justifyContent:"space-between",
                     alignItems:"center",fontSize:9.5}}>
          <span style={{color:T3}}>SmartSense Pro · Industrial IoT + AI/ML · Portfolio Project</span>
          <div style={{display:"flex",gap:5}}>
            {["React 18","Recharts","Z-Score ML","EMA","AI diagnostics","Predictive Maintenance"].map(t=>(
              <span key={t} style={{background:`${CYAN}0e`,border:`1px solid ${CYAN}22`,
                color:CYAN,borderRadius:4,padding:"1px 7px"}}>{t}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
