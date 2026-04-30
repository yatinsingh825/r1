import { useState, useEffect, useRef, useCallback } from "react";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from "recharts";



// ─── CONFIG ───────────────────────────────────────────────────────────────────
const API  = "http://localhost:5000/api";
const SSE  = "http://localhost:5000/api/stream";
const TODAY = new Date().toISOString().split("T")[0];
const CITIES = ["Delhi","Mumbai","Bangalore","Chennai","Hyderabad","Kolkata"];
const PIE_COLORS = ["#3b82f6","#8b5cf6","#f59e0b","#10b981","#64748b"];

// ─── UTILS ────────────────────────────────────────────────────────────────────
const apiFetch = async (url, opts = {}) => {
  const token = localStorage.getItem("skyai_token");
  const res = await fetch(`${API}${url}`, {
    headers: { "Content-Type":"application/json", ...(token ? { Authorization:`Bearer ${token}` } : {}) },
    ...opts
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
};

const fmt  = n => `₹${Number(n).toLocaleString("en-IN")}`;
const calcDays = date => Math.max(1, Math.ceil((new Date(date) - new Date(TODAY)) / 86400000));
const demandColor = d => d > 0.8 ? "#ef4444" : d > 0.65 ? "#f97316" : d > 0.45 ? "#f59e0b" : "#10b981";
const demandLabel = d => d > 0.8 ? "Very High" : d > 0.65 ? "High" : d > 0.45 ? "Moderate" : "Low";

// ─── SMALL COMPONENTS ─────────────────────────────────────────────────────────
const Badge = ({ color, children, sm }) => (
  <span style={{
    display:"inline-flex", alignItems:"center", padding: sm ? "2px 8px" : "3px 11px",
    borderRadius:20, fontSize: sm ? 10 : 11, fontWeight:700, letterSpacing:0.3,
    background:`${color}18`, color, border:`1px solid ${color}28`
  }}>{children}</span>
);

const AiTag = ({ label = "AI" }) => (
  <span style={{
    display:"inline-flex", alignItems:"center", gap:4, padding:"2px 9px",
    background:"linear-gradient(135deg,rgba(59,130,246,.14),rgba(139,92,246,.14))",
    border:"1px solid rgba(139,92,246,.28)", color:"#a78bfa",
    borderRadius:6, fontSize:11, fontWeight:700, letterSpacing:0.4
  }}>⚡ {label}</span>
);

// Animated number that ticks when value changes
const LiveNum = ({ value, prefix = "", suffix = "" }) => {
  const [display, setDisplay] = useState(value);
  const [flash, setFlash]   = useState(false);
  useEffect(() => {
    if (value !== display) {
      setFlash(true);
      setDisplay(value);
      setTimeout(() => setFlash(false), 600);
    }
  }, [value]);
  return (
    <span style={{
      transition:"color 0.3s",
      color: flash ? "#fbbf24" : "inherit",
      textShadow: flash ? "0 0 12px rgba(251,191,36,.5)" : "none"
    }}>
      {prefix}{typeof value === "number" ? value.toLocaleString("en-IN") : value}{suffix}
    </span>
  );
};

// Mini pulse dot for live events
const PulseDot = ({ color = "#10b981", size = 8 }) => (
  <span style={{
    display:"inline-block", width:size, height:size, borderRadius:"50%",
    background:color, boxShadow:`0 0 0 0 ${color}`,
    animation:"pulse 2s infinite"
  }} />
);

// ─── SEAT MAP ─────────────────────────────────────────────────────────────────
const SeatMap = ({ flight, chosen, onChoose, liveEvent }) => {
  const cols = ["A","B","C","","D","E","F"];
  const rows = Math.ceil(flight.totalSeats / 6);
  const [justBooked, setJustBooked] = useState(null);

  useEffect(() => {
    if (liveEvent?.flightId === flight.flightId && liveEvent?.seatIdx !== undefined) {
      setJustBooked(liveEvent.seatIdx);
      setTimeout(() => setJustBooked(null), 1800);
    }
  }, [liveEvent]);

  return (
    <div>
      <style>{`
        @keyframes seatFlash {
          0%   { background: rgba(239,68,68,.6); transform:scale(1.25); }
          100% { background: rgba(100,116,139,.15); transform:scale(1); }
        }
      `}</style>
      <div style={{ textAlign:"center", marginBottom:8 }}>
        <span style={{
          display:"inline-block", padding:"5px 36px",
          background:"rgba(59,130,246,.07)", border:"1px solid rgba(59,130,246,.2)",
          borderRadius:"40px 40px 0 0", fontSize:11, color:"#60a5fa", fontWeight:600, letterSpacing:1.2
        }}>✈ COCKPIT / FRONT</span>
      </div>

      <div style={{ background:"rgba(255,255,255,.02)", borderRadius:12, padding:"16px 8px" }}>
        <div style={{ display:"flex", justifyContent:"center", gap:5, marginBottom:8 }}>
          {cols.map((c,i) => (
            <div key={i} style={{ width:c===""?18:30, textAlign:"center", fontSize:10, color:"#374151", fontWeight:700 }}>{c}</div>
          ))}
        </div>
        {Array.from({ length:rows }).map((_,row) => (
          <div key={row} style={{ display:"flex", justifyContent:"center", alignItems:"center", gap:5, marginBottom:5 }}>
            <div style={{ width:18, fontSize:9, color:"#1f2937", textAlign:"right", marginRight:4, fontWeight:700 }}>{row+1}</div>
            {cols.map((col,ci) => {
              if (col==="") return <div key="aisle" style={{ width:18 }} />;
              const idx  = row*6 + (ci > 3 ? ci-1 : ci);
              if (idx >= flight.totalSeats) return <div key={ci} style={{ width:30 }} />;
              const taken     = flight.occupiedSeats?.includes(idx);
              const isChosen  = chosen?.idx === idx;
              const isFlashed = justBooked === idx;
              const label = `${row+1}${col}`;
              return (
                <div key={ci}
                  onClick={() => !taken && onChoose({ idx, label })}
                  title={taken ? `${label} — Occupied` : `${label} — Click to select`}
                  style={{
                    width:30, height:27, borderRadius:"6px 6px 4px 4px",
                    cursor: taken ? "not-allowed" : "pointer",
                    display:"flex", alignItems:"center", justifyContent:"center",
                    fontSize:9, fontWeight:700,
                    transition: isFlashed ? "none" : "all 0.15s",
                    animation: isFlashed ? "seatFlash 1.8s ease" : "none",
                    background: isChosen ? "rgba(59,130,246,.5)" : taken ? "rgba(100,116,139,.15)" : "rgba(16,185,129,.12)",
                    border: `1.5px solid ${isChosen ? "#3b82f6" : taken ? "rgba(100,116,139,.25)" : "rgba(16,185,129,.4)"}`,
                    color: isChosen ? "white" : taken ? "#374151" : "#34d399",
                    transform: isChosen ? "scale(1.12)" : "scale(1)",
                    boxShadow: isChosen ? "0 0 12px rgba(59,130,246,.4)" : "none",
                  }}>
                  {isChosen ? "✓" : taken ? "×" : ""}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div style={{ display:"flex", gap:18, justifyContent:"center", marginTop:12 }}>
        {[["rgba(16,185,129,.3)","rgba(16,185,129,.5)","Available"],
          ["rgba(59,130,246,.5)","#3b82f6","Your Selection"],
          ["rgba(100,116,139,.15)","rgba(100,116,139,.3)","Occupied"]].map(([bg,bd,lbl])=>(
          <div key={lbl} style={{ display:"flex", alignItems:"center", gap:5, fontSize:11, color:"#64748b" }}>
            <div style={{ width:12, height:12, borderRadius:3, background:bg, border:`1px solid ${bd}` }} />
            {lbl}
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── LIVE TICKER STRIP ────────────────────────────────────────────────────────
const LiveEventStrip = ({ events }) => {
  if (!events.length) return null;
  return (
    <div style={{
      background:"rgba(16,185,129,.06)", border:"1px solid rgba(16,185,129,.18)",
      borderRadius:9, padding:"8px 16px", display:"flex", alignItems:"center", gap:10,
      fontSize:12, color:"#6ee7b7", marginBottom:16, overflow:"hidden"
    }}>
      <PulseDot />
      <span style={{ fontWeight:700, color:"#10b981", marginRight:4 }}>LIVE</span>
      <span style={{ color:"#64748b" }}>|</span>
      {events.slice(-3).reverse().map((e,i) => (
        <span key={i} style={{ opacity: 1 - i * 0.3, marginRight:12 }}>{e}</span>
      ))}
    </div>
  );
};

// ─── BOOKING CARD (reusable ticket display) ───────────────────────────────────
const BookingCard = ({ b, card, fmt, isLatest }) => (
  <div style={{ ...card, overflow:"hidden", marginBottom:16, border: isLatest ? "1px solid rgba(59,130,246,.35)" : undefined }}>
    {isLatest && (
      <div style={{ background:"linear-gradient(135deg,rgba(29,78,216,.18),rgba(109,40,217,.18))", padding:"8px 24px", borderBottom:"1px solid rgba(255,255,255,.06)", display:"flex", alignItems:"center", gap:8 }}>
        <span style={{ fontSize:11, color:"#60a5fa", fontWeight:700 }}>✅ LATEST BOOKING</span>
        <span style={{ fontSize:11, color:"#334155" }}>Saved to MongoDB · JWT authenticated</span>
      </div>
    )}
    <div style={{ background:"linear-gradient(135deg,rgba(29,78,216,.1),rgba(109,40,217,.1))", padding:"22px 28px", borderBottom:"1px dashed rgba(255,255,255,.08)" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <div>
          <div style={{ fontSize:28, fontWeight:800 }}>{b.flightDetails?.from}</div>
          <div style={{ color:"#64748b", fontSize:13 }}>{b.flightDetails?.departure}</div>
        </div>
        <div style={{ textAlign:"center" }}>
          <div style={{ fontSize:26, color:"#3b82f6" }}>✈</div>
          <div style={{ fontSize:11, color:"#475569", marginTop:3 }}>{b.flightDetails?.airline}</div>
        </div>
        <div style={{ textAlign:"right" }}>
          <div style={{ fontSize:28, fontWeight:800 }}>{b.flightDetails?.to}</div>
          <div style={{ color:"#64748b", fontSize:13 }}>{b.flightDetails?.arrival}</div>
        </div>
      </div>
    </div>
    <div style={{ padding:"22px 28px" }}>
      {[
        ["Booking Reference", b.bookingRef,       "#8b5cf6"],
        ["Passenger",         b.passengerName,     null],
        ["Flight",            b.flightDetails?.flightNo, null],
        ["Seat",              b.seatNumber,        "#3b82f6"],
        ["Travel Date",       new Date(b.travelDate).toLocaleDateString("en-IN",{weekday:"long",year:"numeric",month:"long",day:"numeric"}), null],
        ["AI Price Paid",     fmt(b.price),        "#3b82f6"],
        ["Status",            b.status,            "#10b981"],
      ].map(([k,v,c])=>(
        <div key={k} style={{ display:"flex", justifyContent:"space-between", padding:"10px 0", borderBottom:"1px solid rgba(255,255,255,.04)", fontSize:14 }}>
          <span style={{ color:"#64748b" }}>{k}</span>
          <span style={{ fontWeight:700, color:c||"#e2e8f0" }}>{v}</span>
        </div>
      ))}
      <div style={{ marginTop:12, padding:10, background:"rgba(124,58,237,.06)", borderRadius:8, border:"1px solid rgba(124,58,237,.14)" }}>
        <div style={{ fontSize:11, color:"#64748b", marginBottom:4, fontWeight:700 }}>🔐 MongoDB Document ID</div>
        <div style={{ fontFamily:"monospace", fontSize:11, color:"#7c3aed", wordBreak:"break-all" }}>{b._id}</div>
      </div>
    </div>
  </div>
);

// ─── CONFIRM TAB ──────────────────────────────────────────────────────────────
const ConfirmTab = ({ bookResult, myBookings, user, card, btnPri, fmt, fetchMyBookings, onNewSearch }) => {
  // Use bookResult if fresh, otherwise fall back to most recent booking from DB
  const [loadedBookings, setLoadedBookings] = useState(myBookings);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoadedBookings(myBookings);
  }, [myBookings]);

  // If no bookResult and myBookings is empty, fetch from API
  useEffect(() => {
    if (!bookResult && loadedBookings.length === 0 && user) {
      setLoading(true);
      fetch(`http://localhost:5000/api/bookings/my`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("skyai_token")}` }
      })
        .then(r => r.json())
        .then(data => { setLoadedBookings(Array.isArray(data) ? data : []); })
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, []);

  const displayBooking = bookResult || loadedBookings[0] || null;

  if (loading) return (
    <div style={{ maxWidth:700, margin:"0 auto", textAlign:"center", padding:60 }}>
      <div style={{ fontSize:32, marginBottom:12 }}>⏳</div>
      <div style={{ color:"#64748b" }}>Loading your booking from MongoDB…</div>
    </div>
  );

  if (!displayBooking) return (
    <div style={{ maxWidth:700, margin:"0 auto" }}>
      <div style={{ ...card, padding:56, textAlign:"center" }}>
        <div style={{ fontSize:40, marginBottom:12 }}>🎫</div>
        <div style={{ fontWeight:700, fontSize:18, marginBottom:8 }}>No bookings yet</div>
        <div style={{ color:"#64748b", marginBottom:24 }}>Search for a flight and complete a booking to see your ticket here.</div>
        <button style={{ ...btnPri, padding:"12px 32px" }} onClick={onNewSearch}>Search Flights →</button>
      </div>
    </div>
  );

  const isLatest = !!bookResult;

  return (
    <div style={{ maxWidth:700, margin:"0 auto" }} className="fade-in">
      <div style={{ textAlign:"center", marginBottom:28 }}>
        <div style={{ fontSize:54, marginBottom:8 }}>✅</div>
        <h1 style={{ fontSize:26, fontWeight:800 }}>
          {isLatest ? "Booking Confirmed!" : "Your Most Recent Booking"}
        </h1>
        <p style={{ color:"#64748b", marginTop:6, fontSize:14 }}>
          {isLatest
            ? "Saved to MongoDB · JWT authenticated · SSE broadcast to all clients"
            : `Retrieved from MongoDB · ${loadedBookings.length} total booking${loadedBookings.length!==1?"s":""} on your account`}
        </p>
      </div>

      <BookingCard b={displayBooking} card={card} fmt={fmt} isLatest={isLatest} />

      {isLatest && (
        <div style={{ ...card, padding:16, marginBottom:16 }}>
          <div style={{ fontSize:12, color:"#64748b", fontWeight:700, marginBottom:8 }}>🔐 JWT Security Token</div>
          <div style={{ fontFamily:"monospace", fontSize:10, color:"#7c3aed", wordBreak:"break-all", background:"rgba(124,58,237,.06)", padding:12, borderRadius:8, border:"1px solid rgba(124,58,237,.14)" }}>
            {localStorage.getItem("skyai_token")?.substring(0,90)}…
          </div>
        </div>
      )}

      {/* Show other bookings if multiple */}
      {!isLatest && loadedBookings.length > 1 && (
        <div style={{ marginBottom:20 }}>
          <div style={{ fontSize:14, fontWeight:700, marginBottom:14, color:"#64748b" }}>ALL BOOKINGS ({loadedBookings.length})</div>
          {loadedBookings.slice(1).map(b => (
            <BookingCard key={b._id} b={b} card={card} fmt={fmt} isLatest={false} />
          ))}
        </div>
      )}

      <button style={{ ...btnPri, width:"100%", padding:13 }} onClick={onNewSearch}>
        ✈ Book Another Flight
      </button>
    </div>
  );
};

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [recommendations, setRecommendations] = useState([]);
  const [tab,         setTab]        = useState("search");
  const [user,        setUser]       = useState(() => { try { return JSON.parse(localStorage.getItem("skyai_user")); } catch { return null; } });
  const [authMode,    setAuthMode]   = useState("login");
  const [authForm,    setAuthForm]   = useState({ name:"", email:"", password:"" });
  const [authError,   setAuthError]  = useState("");
  const [authLoading, setAuthLoad]   = useState(false);

  const [search,       setSearch]       = useState({ from:"Delhi", to:"Mumbai", date:TODAY });
  const [searchLoad,   setSearchLoad]   = useState(false);
  const [flights,      setFlights]      = useState([]);
  const [searched,     setSearched]     = useState(false);

  const [selFlight,    setSelFlight]    = useState(null);
  const [chosenSeat,   setChosenSeat]   = useState(null);
  const [priceHist,    setPriceHist]    = useState([]);
  const [bookLoad,     setBookLoad]     = useState(false);
  const [bookResult,   setBookResult]   = useState(null);
  const [myBookings,   setMyBookings]   = useState([]);

  const [adminStats,   setAdminStats]   = useState(null);
  const [adminFlights, setAdminFlights] = useState([]);
  const [adminBookings,setAdminBookings]= useState([]);
  const [adminView,    setAdminView]    = useState("overview");

  // Real-time state
  const [apiStatus,    setApiStatus]    = useState("checking");
  const [liveTime,     setLiveTime]     = useState(new Date());
  const [liveEvents,   setLiveEvents]   = useState([]);   // ticker strip messages
  const [lastSseEvent, setLastSseEvent] = useState(null); // for seat flash
  const [liveStats,    setLiveStats]    = useState({ totalBookings:0, totalRevenue:0 });
  const [priceTick,    setPriceTick]    = useState({});   // flightId → { aiPrice, demandIndex }
  const sseRef = useRef(null);

  const daysLeft = calcDays(search.date);

  // ── Load bookings on startup if already logged in ─────────────────────────
  useEffect(() => {
    if (user) {
      apiFetch("/bookings/my").then(setMyBookings).catch(() => {});
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Live clock ────────────────────────────────────────────────────────────
  useEffect(() => {
    const t = setInterval(() => setLiveTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // ── SSE connection ────────────────────────────────────────────────────────
  useEffect(() => {
    const connect = () => {
      if (sseRef.current) sseRef.current.close();
      const es = new EventSource(SSE);
      sseRef.current = es;

      es.addEventListener("connected", () => {
        setApiStatus("online");
        addEvent("🔗 Connected to live server");
      });

      es.addEventListener("price_update", e => {
        const { updates } = JSON.parse(e.data);
        setPriceTick(prev => {
          const next = { ...prev };
          updates.forEach(u => { next[u.flightId] = u; });
          return next;
        });
        // Also update flights list live
        setFlights(prev => prev.map(f => {
          const u = updates.find(x => x.flightId === f.flightId);
          return u ? { ...f, aiPrice: u.aiPrice, demandIndex: u.demandIndex, availableSeats: u.availableSeats } : f;
        }));
      });

      es.addEventListener("seat_booked", e => {
        const ev = JSON.parse(e.data);
        setLastSseEvent(ev);
        addEvent(`${ev.simulated ? "🤖 AI Sim" : "🧑 User"}: ${ev.flightId} seat #${ev.seatIdx} booked — ${ev.availableSeats} left`);
        // Update flight list & selected flight
        setFlights(prev => prev.map(f =>
          f.flightId === ev.flightId
            ? { ...f, availableSeats: ev.availableSeats, occupiedSeats: ev.occupiedSeats, aiPrice: ev.aiPrice, demandIndex: ev.demandIndex }
            : f
        ));
        setSelFlight(prev => prev?.flightId === ev.flightId
          ? { ...prev, availableSeats: ev.availableSeats, occupiedSeats: ev.occupiedSeats, aiPrice: ev.aiPrice, demandIndex: ev.demandIndex }
          : prev
        );
      });

      es.addEventListener("stats_update", e => {
        const { totalBookings, totalRevenue } = JSON.parse(e.data);
        setLiveStats({ totalBookings, totalRevenue });
      });

      es.onerror = () => {
        setApiStatus("offline");
        es.close();
        setTimeout(connect, 5000); // auto-reconnect
      };
    };
    connect();
    return () => sseRef.current?.close();
  }, []);

  const addEvent = useCallback(msg => {
    setLiveEvents(prev => [...prev.slice(-9), msg]);
  }, []);

  // ── API health fallback ────────────────────────────────────────────────────
  useEffect(() => {
    apiFetch("/health").then(() => setApiStatus("online")).catch(() => setApiStatus("offline"));
  }, []);

  // ── Load pricing history when flight selected ─────────────────────────────
  useEffect(() => {
    if (!selFlight) return;
    apiFetch(`/flights/${selFlight.flightId}/pricing`).then(setPriceHist).catch(() => {});
  }, [selFlight?.flightId]);

  // ── Admin data ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (tab !== "admin") return;
    Promise.all([apiFetch("/admin/stats"), apiFetch("/admin/flights"), apiFetch("/admin/bookings")])
      .then(([s, f, b]) => { setAdminStats(s); setAdminFlights(f); setAdminBookings(b); })
      .catch(() => {});
  }, [tab]);

  // ── My bookings — load on tab visit AND after every new booking ──────────
  const fetchMyBookings = useCallback(() => {
    if (!user) return;
    apiFetch("/bookings/my").then(setMyBookings).catch(() => {});
  }, [user]);

  useEffect(() => {
    if (tab === "mybookings") fetchMyBookings();
  }, [tab, fetchMyBookings]);

  // ─── HANDLERS ─────────────────────────────────────────────────────────────
  const handleAuth = async () => {
    setAuthError(""); setAuthLoad(true);
    try {
      const url  = authMode === "login" ? "/auth/login" : "/auth/register";
      const body = authMode === "login"
        ? { email: authForm.email, password: authForm.password }
        : { name: authForm.name, email: authForm.email, password: authForm.password };
      const data = await apiFetch(url, { method:"POST", body:JSON.stringify(body) });
      localStorage.setItem("skyai_token", data.token);
      localStorage.setItem("skyai_user",  JSON.stringify(data.user));
      setUser(data.user);
      setTab("search");
      addEvent(`✅ ${data.user.name} logged in`);
      // Pre-load bookings so Confirm tab and My Bookings tab work immediately
      apiFetch("/bookings/my").then(setMyBookings).catch(() => {});
    } catch (err) { setAuthError(err.message); }
    finally { setAuthLoad(false); }
  };

  const handleLogout = () => {
    localStorage.removeItem("skyai_token");
    localStorage.removeItem("skyai_user");
    setUser(null); setFlights([]); setSearched(false);
    setSelFlight(null); setBookResult(null);
    setTab("search");
  };

  const handleSearch = async () => {
    if (!user) { setTab("auth"); return; }
    setSearchLoad(true); setSearched(false); setSelFlight(null);
    try {
      const data = await apiFetch(`/flights?from=${search.from}&to=${search.to}&days=${daysLeft}`);
      setFlights(data); setSearched(true);
      addEvent(`🔍 ${search.from}→${search.to}: ${data.length} flights found`);
    } catch (err) { alert(err.message); }
    finally { setSearchLoad(false); }
  };

  const handleBook = async () => {
    if (!chosenSeat || !selFlight || !user) return;
    setBookLoad(true);
    try {
      const data = await apiFetch("/bookings", {
        method:"POST",
        body: JSON.stringify({
          flightId: selFlight.flightId, seatNumber: chosenSeat.label,
          seatIndex: chosenSeat.idx, travelDate: search.date,
          days: daysLeft, passengerName: user.name
        })
      });
      setBookResult(data.booking);
      addEvent(`🎫 Booking confirmed: ${data.booking.bookingRef}`);
      // Immediately refresh My Bookings list so it's ready when user navigates there
      apiFetch("/bookings/my").then(setMyBookings).catch(() => {});
      setTab("confirm");
    } catch (err) { alert("Booking failed: " + err.message); }
    finally { setBookLoad(false); }
  };

  // Merge live priceTick into displayed flights
  const mergedFlights = flights.map(f => {
    const live = priceTick[f.flightId];
    return live ? { ...f, aiPrice: live.aiPrice, demandIndex: live.demandIndex } : f;
  });

  const liveSelFlight = selFlight
    ? (priceTick[selFlight.flightId] ? { ...selFlight, aiPrice: priceTick[selFlight.flightId].aiPrice, demandIndex: priceTick[selFlight.flightId].demandIndex } : selFlight)
    : null;

  // ─── STYLE TOKENS ─────────────────────────────────────────────────────────
  const card   = { background:"rgba(255,255,255,.03)", border:"1px solid rgba(255,255,255,.07)", borderRadius:14 };
  const input  = { background:"rgba(255,255,255,.05)", border:"1px solid rgba(255,255,255,.1)", borderRadius:9, color:"#e2e8f0", padding:"11px 14px", fontFamily:"inherit", fontSize:14, width:"100%", outline:"none" };
  const label  = { fontSize:11, color:"#64748b", textTransform:"uppercase", letterSpacing:0.7, marginBottom:7, display:"block", fontWeight:700 };
  const btnPri = { cursor:"pointer", border:"none", borderRadius:9, fontFamily:"inherit", fontWeight:700, fontSize:14, background:"linear-gradient(135deg,#1d4ed8,#6d28d9)", color:"white", padding:"11px 26px", transition:"all .2s", boxShadow:"0 4px 14px rgba(29,78,216,.3)" };
  const btnGhost={ cursor:"pointer", border:"1px solid rgba(255,255,255,.08)", borderRadius:9, fontFamily:"inherit", fontWeight:600, fontSize:13, background:"rgba(255,255,255,.04)", color:"#94a3b8", padding:"9px 18px", transition:"all .2s" };

  return (
    <div style={{ fontFamily:"'Plus Jakarta Sans','Segoe UI',sans-serif", minHeight:"100vh", background:"#060d1a", color:"#e2e8f0", width:"100vw", overflowX:"hidden" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:5px}
        ::-webkit-scrollbar-thumb{background:#1e293b;border-radius:3px}
        input[type=date]::-webkit-calendar-picker-indicator{filter:invert(.4)}
        select option{background:#1e293b}
        .card-hover:hover{border-color:rgba(59,130,246,.35)!important;transform:translateY(-2px);box-shadow:0 8px 32px rgba(29,78,216,.15)!important}
        .btn-hover:hover{opacity:.88;transform:translateY(-1px)}
        input:focus,select:focus{border-color:#2563eb!important;box-shadow:0 0 0 3px rgba(37,99,235,.12)}
        @keyframes pulse{0%{box-shadow:0 0 0 0 rgba(16,185,129,.5)}70%{box-shadow:0 0 0 7px rgba(16,185,129,0)}100%{box-shadow:0 0 0 0 rgba(16,185,129,0)}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        .fade-in{animation:fadeIn .3s ease}
        @keyframes priceFlash{0%{color:#fbbf24;text-shadow:0 0 10px rgba(251,191,36,.6)}100%{color:inherit;text-shadow:none}}
        .nav-a{background:rgba(29,78,216,.12)!important;color:#60a5fa!important}
        table th,table td{border-bottom:1px solid rgba(255,255,255,.05)}
      `}</style>

      {/* ═══ HEADER ═══ */}
      <div style={{ background:"rgba(6,13,26,.96)", borderBottom:"1px solid rgba(255,255,255,.06)", backdropFilter:"blur(16px)", position:"sticky", top:0, zIndex:200 }}>
        <div style={{ padding:"0 36px", display:"flex", alignItems:"center", justifyContent:"space-between", height:60 }}>

          {/* Logo */}
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <div style={{ width:36, height:36, background:"linear-gradient(135deg,#1d4ed8,#6d28d9)", borderRadius:10, display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, boxShadow:"0 4px 12px rgba(29,78,216,.4)" }}>✈</div>
            <div>
              <div style={{ fontWeight:800, fontSize:17, letterSpacing:.3 }}>SkyAI</div>
              <div style={{ fontSize:9, color:"#475569", letterSpacing:1.6, fontWeight:700 }}>BOOKING SYSTEM</div>
            </div>
            <div style={{ marginLeft:8, display:"flex", alignItems:"center", gap:6, padding:"4px 10px", background:"rgba(16,185,129,.08)", border:"1px solid rgba(16,185,129,.2)", borderRadius:6 }}>
              <PulseDot color={apiStatus==="online"?"#10b981":"#ef4444"} />
              <span style={{ fontSize:11, color:apiStatus==="online"?"#10b981":"#ef4444", fontWeight:700 }}>
                {apiStatus==="online"?"LIVE":"OFFLINE"}
              </span>
              <span style={{ fontSize:11, color:"#334155" }}>
                {liveTime.toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit",second:"2-digit"})}
              </span>
            </div>
          </div>

          {/* Nav */}
          <div style={{ display:"flex", gap:2 }}>
            {[["search","✈ Search"],["seats","💺 Seats"],["confirm","🎫 Ticket"],["mybookings","📋 My Bookings"],["admin","📊 Admin"]].map(([id,lbl])=>(
              <div key={id} className={tab===id?"nav-a":""} onClick={()=>setTab(id)}
                style={{ padding:"7px 16px", borderRadius:8, cursor:"pointer", fontSize:13, fontWeight:600, color:"#475569", transition:"all .18s" }}>
                {lbl}
              </div>
            ))}
          </div>

          {/* User */}
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            {user ? (
              <>
                <div style={{ display:"flex", alignItems:"center", gap:8, padding:"5px 12px", background:"rgba(255,255,255,.04)", borderRadius:8, border:"1px solid rgba(255,255,255,.07)" }}>
                  <div style={{ width:28, height:28, borderRadius:"50%", background:"linear-gradient(135deg,#1d4ed8,#6d28d9)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:800 }}>
                    {user.name[0].toUpperCase()}
                  </div>
                  <span style={{ fontSize:13, fontWeight:600, color:"#94a3b8" }}>{user.name}</span>
                </div>
                <button style={btnGhost} className="btn-hover" onClick={handleLogout}>Logout</button>
              </>
            ) : (
              <button style={btnPri} className="btn-hover" onClick={()=>setTab("auth")}>Login / Register</button>
            )}
          </div>
        </div>
      </div>

      {/* ═══ PAGE CONTENT ═══ */}
      <div style={{ padding:"36px 40px", width:"100%" }}>

        {/* Live event ticker */}
        <LiveEventStrip events={liveEvents} />

        {/* ──── AUTH ──── */}
        {tab==="auth" && (
          <div style={{ maxWidth:440, margin:"32px auto" }} className="fade-in">
            <div style={{ textAlign:"center", marginBottom:28 }}>
              <div style={{ fontSize:48, marginBottom:10 }}>✈️</div>
              <h1 style={{ fontSize:26, fontWeight:800 }}>Smart Airline Booking</h1>
              <p style={{ color:"#64748b", marginTop:6, fontSize:14 }}>AI-Powered · Real-Time SSE · MongoDB</p>
            </div>
            <div style={{ ...card, padding:30 }}>
              <div style={{ display:"flex", background:"rgba(255,255,255,.04)", borderRadius:10, padding:4, marginBottom:22 }}>
                {["login","register"].map(m=>(
                  <button key={m} onClick={()=>setAuthMode(m)} style={{
                    cursor:"pointer", border:"none", fontFamily:"inherit", fontWeight:700, fontSize:13,
                    flex:1, padding:"9px", borderRadius:7, textTransform:"capitalize",
                    background: authMode===m ? "linear-gradient(135deg,#1d4ed8,#6d28d9)" : "transparent",
                    color: authMode===m ? "white" : "#64748b"
                  }}>{m==="login"?"Sign In":"Create Account"}</button>
                ))}
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                {authMode==="register" && (
                  <div>
                    <label style={label}>Full Name</label>
                    <input style={input} placeholder="John Doe" value={authForm.name} onChange={e=>setAuthForm({...authForm,name:e.target.value})} />
                  </div>
                )}
                <div>
                  <label style={label}>Email</label>
                  <input style={input} type="email" placeholder="user@example.com" value={authForm.email} onChange={e=>setAuthForm({...authForm,email:e.target.value})} />
                </div>
                <div>
                  <label style={label}>Password</label>
                  <input style={input} type="password" placeholder="••••••••" value={authForm.password}
                    onChange={e=>setAuthForm({...authForm,password:e.target.value})}
                    onKeyDown={e=>e.key==="Enter"&&handleAuth()} />
                </div>
                {authError && (
                  <div style={{ padding:"10px 14px", background:"rgba(239,68,68,.08)", border:"1px solid rgba(239,68,68,.22)", borderRadius:8, fontSize:13, color:"#f87171" }}>⚠ {authError}</div>
                )}
                <button style={{ ...btnPri, padding:13 }} className="btn-hover" onClick={handleAuth} disabled={authLoading}>
                  {authLoading ? "⏳ Please wait…" : authMode==="login" ? "Sign In Securely" : "Create Account"}
                </button>
              </div>
              <div style={{ marginTop:18, padding:12, background:"rgba(29,78,216,.06)", borderRadius:8, border:"1px solid rgba(29,78,216,.15)" }}>
                <div style={{ fontSize:12, color:"#60a5fa", fontWeight:700, marginBottom:3 }}>🚀 Demo Credentials</div>
                <div style={{ fontSize:12, color:"#64748b" }}>Email: <b style={{color:"#94a3b8"}}>demo@skyai.com</b> · Password: <b style={{color:"#94a3b8"}}>demo1234</b></div>
              </div>
              <div style={{ marginTop:12, display:"flex", gap:16, justifyContent:"center" }}>
                {["🔒 JWT","🔐 bcrypt","🍃 MongoDB","📡 SSE Live"].map(t=>(
                  <span key={t} style={{ fontSize:11, color:"#334155" }}>{t}</span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ──── SEARCH ──── */}
        {tab==="search" && (
          <div className="fade-in">
            <div style={{ marginBottom:26 }}>
              <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap", marginBottom:5 }}>
                <h1 style={{ fontSize:30, fontWeight:800 }}>AI-Powered Flight Search</h1>
                <AiTag label="Dynamic Pricing" />
                {searched && <Badge color="#10b981" sm>↻ Live updates active</Badge>}
              </div>
              <p style={{ color:"#64748b", fontSize:14 }}>
                ML demand model · Real-time seat tracking · SSE-powered price ticks every 4s
              </p>
            </div>

            {/* Search card */}
            <div style={{ ...card, padding:24, marginBottom:26 }}>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1.3fr auto", gap:16, alignItems:"end" }}>
                <div>
                  <label style={label}>Origin</label>
                  <select style={input} value={search.from} onChange={e=>setSearch({...search,from:e.target.value})}>
                    {CITIES.map(c=><option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label style={label}>Destination</label>
                  <select style={input} value={search.to} onChange={e=>setSearch({...search,to:e.target.value})}>
                    {CITIES.map(c=><option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label style={label}>
                    Travel Date
                    <span style={{ color:"#ef4444", marginLeft:4 }}>★ future only</span>
                  </label>
                  <input style={input} type="date"
                    min={TODAY}
                    value={search.date}
                    onChange={e => { if (e.target.value >= TODAY) setSearch({...search, date:e.target.value}); }}
                  />
                  <div style={{ fontSize:11, marginTop:5 }}>
                    <span style={{ color: daysLeft<=3?"#ef4444":daysLeft<=10?"#f59e0b":"#10b981", fontWeight:600 }}>
                      {daysLeft} day{daysLeft!==1?"s":""} away
                      {daysLeft<=3?" — ⚠ Peak surge pricing":daysLeft<=10?" — Moderate surge":" — Best price window"}
                    </span>
                  </div>
                </div>
                <button style={{ ...btnPri, padding:"13px 36px", whiteSpace:"nowrap" }} className="btn-hover"
                  onClick={handleSearch} disabled={searchLoad}>
                  {searchLoad ? "⏳ Searching…" : "Search Flights"}
                </button>
              </div>
            </div>

            {/* AI Recommendations */}
            {user && !searched && (
              <div style={{ marginBottom:26 }}>
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:14 }}>
                  <AiTag label="Personalized" />
                  <span style={{ fontSize:14, fontWeight:700 }}>Recommended for you</span>
                  <span style={{ fontSize:12, color:"#64748b" }}>Based on booking history & preferences</span>
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:14 }}>
                  {[{from:"Delhi",to:"Mumbai",reason:"Frequent route",icon:"🔥"},
                    {from:"Delhi",to:"Bangalore",reason:"Business popular",icon:"💼"},
                    {from:"Mumbai",to:"Chennai",reason:"Holiday season",icon:"🏖"},
                    {from:"Delhi",to:"Hyderabad",reason:"Tech hub route",icon:"💻"}].map((r,i)=>(
                    <div key={i} className="card-hover" onClick={()=>{setSearch({...search,from:r.from,to:r.to}); setTimeout(handleSearch,100);}}
                      style={{ ...card, padding:18, cursor:"pointer", transition:"all .2s" }}>
                      <div style={{ fontSize:24, marginBottom:7 }}>{r.icon}</div>
                      <div style={{ fontWeight:700, fontSize:14 }}>{r.from} → {r.to}</div>
                      <div style={{ fontSize:11, color:"#64748b", marginTop:3 }}>{r.reason}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Results */}
            {searched && (
              <div className="fade-in">
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
                  <div>
                    <h2 style={{ fontSize:18, fontWeight:700 }}>{mergedFlights.length} Flight{mergedFlights.length!==1?"s":""} — {search.from} → {search.to}</h2>
                    <p style={{ fontSize:12, color:"#64748b", marginTop:3 }}>
                      Prices update live via SSE · {daysLeft} days to departure · {search.date}
                    </p>
                  </div>
                  <div style={{ display:"flex", gap:8 }}>
                    <Badge color="#10b981">🍃 MongoDB</Badge>
                    <Badge color="#3b82f6">📡 SSE Live</Badge>
                  </div>
                </div>

                {mergedFlights.length===0 ? (
                  <div style={{ ...card, padding:40, textAlign:"center" }}>
                    <div style={{ fontSize:36, marginBottom:10 }}>🔍</div>
                    <div style={{ color:"#64748b" }}>No flights found. Try Delhi → Mumbai.</div>
                  </div>
                ) : mergedFlights.map(f => {
                  const surge = f.aiPrice - f.basePrice;
                  return (
                    <div key={f.flightId} className="card-hover"
                      style={{ ...card, padding:"22px 28px", marginBottom:12, display:"flex", alignItems:"center", justifyContent:"space-between", transition:"all .2s", cursor:"pointer" }}>
                      <div style={{ display:"flex", alignItems:"center", gap:32, flex:1, flexWrap:"wrap" }}>
                        <div style={{ minWidth:90 }}>
                          <div style={{ fontSize:28, fontWeight:800 }}>{f.departure}</div>
                          <div style={{ fontSize:12, color:"#64748b", marginTop:2 }}>{f.from}</div>
                        </div>
                        <div style={{ textAlign:"center" }}>
                          <div style={{ fontSize:11, color:"#1e3a5f", letterSpacing:2 }}>────✈────</div>
                          <div style={{ fontSize:11, color:"#475569", marginTop:3 }}>{f.airline}</div>
                        </div>
                        <div style={{ minWidth:90 }}>
                          <div style={{ fontSize:28, fontWeight:800 }}>{f.arrival}</div>
                          <div style={{ fontSize:12, color:"#64748b", marginTop:2 }}>{f.to}</div>
                        </div>
                        <div style={{ paddingLeft:22, borderLeft:"1px solid rgba(255,255,255,.06)" }}>
                          <div style={{ fontSize:10, color:"#475569", textTransform:"uppercase", letterSpacing:.5 }}>Flight</div>
                          <div style={{ fontWeight:700, fontSize:14, marginTop:2 }}>{f.flightId}</div>
                        </div>
                        <div>
                          <div style={{ fontSize:10, color:"#475569", textTransform:"uppercase", letterSpacing:.5 }}>Seats Left</div>
                          <div style={{ fontWeight:800, fontSize:18, marginTop:2, color: f.availableSeats<8?"#ef4444":f.availableSeats<20?"#f59e0b":"#10b981" }}>
                            <LiveNum value={f.availableSeats} />
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize:10, color:"#475569", textTransform:"uppercase", letterSpacing:.5 }}>Demand</div>
                          <div style={{ display:"flex", gap:3, marginTop:5 }}>
                            {[1,2,3,4,5].map(i=>(
                              <div key={i} style={{ width:10,height:10,borderRadius:"50%",background: i<=Math.round(f.demandIndex*5)?demandColor(f.demandIndex):"rgba(255,255,255,.08)" }} />
                            ))}
                          </div>
                          <div style={{ fontSize:10, color:demandColor(f.demandIndex), marginTop:3, fontWeight:600 }}>{demandLabel(f.demandIndex)}</div>
                        </div>
                        <div>
                          <Badge color={f.status==="On Time"?"#10b981":f.status==="Boarding"?"#3b82f6":"#f59e0b"}>{f.status}</Badge>
                        </div>
                      </div>
                      <div style={{ textAlign:"right", minWidth:180 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:6, justifyContent:"flex-end", marginBottom:4 }}>
                          <AiTag label="ML + Demand Pricing" />
                          <div style={{ fontSize:28, fontWeight:800, color:"#3b82f6" }}>
                            <div>
  <div style={{ fontSize: 26, fontWeight: 800, color: "#3b82f6" }}>
    <LiveNum value={f.aiPrice} prefix="₹" />
  </div>

  <div style={{ fontSize: 11, color: "#64748b" }}>
    Base: ₹{f.basePrice}
  </div>

  <div style={{ fontSize: 11, color: "#8b5cf6" }}>
    Demand: {(f.demandIndex * 100).toFixed(0)}%
  </div>
</div>
                          </div>
                        </div>
                        <div style={{ fontSize:11, color:"#475569", marginBottom:10 }}>
                          Base: {fmt(f.basePrice)} ·{" "}
                          <span style={{ color: surge>0?"#f87171":"#34d399", fontWeight:600 }}>
                            {surge>0?`+${fmt(surge)} surge`:`${fmt(Math.abs(surge))} off`}
                          </span>
                        </div>
                        <button style={{ ...btnPri, padding:"9px 22px", fontSize:13 }} className="btn-hover"
                          onClick={()=>{ setSelFlight(f);

apiFetch(`/flights/${f.flightId}/recommendations`)
  .then(setRecommendations)
  .catch(() => {}); setChosenSeat(null); setTab("seats"); }}>
                          Select & Book →
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {!user && (
              <div style={{ ...card, padding:56, textAlign:"center" }}>
                <div style={{ fontSize:48, marginBottom:14 }}>🛫</div>
                <h2 style={{ fontSize:22, fontWeight:700, marginBottom:8 }}>Sign in to search and book</h2>
                <p style={{ color:"#64748b", marginBottom:26 }}>JWT authentication · Live prices · MongoDB backend</p>
                <button style={{ ...btnPri, padding:"13px 36px" }} className="btn-hover" onClick={()=>setTab("auth")}>Get Started</button>
              </div>
            )}
          </div>
        )}

        {/* ──── SEATS ──── */}
        {tab==="seats" && (
          <div className="fade-in">
            <div style={{ marginBottom:22 }}>
              <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:5 }}>
                <h2 style={{ fontSize:26, fontWeight:800 }}>Real-Time Seat Selection</h2>
                <Badge color="#10b981">📡 Live SSE</Badge>
              </div>
              <p style={{ color:"#64748b", fontSize:14 }}>Seats update live — watch them disappear in real time as others book</p>
            </div>

            {!liveSelFlight ? (
              <div style={{ ...card, padding:40, textAlign:"center", color:"#64748b" }}>
                No flight selected. <span style={{ color:"#60a5fa", cursor:"pointer" }} onClick={()=>setTab("search")}>Search flights →</span>
              </div>
            ) : (
              <div style={{ display:"grid", gridTemplateColumns:"1fr 380px", gap:24 }}>
                {/* Seat map */}
                <div style={{ ...card, padding:28 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
                    <div>
                      <div style={{ fontWeight:800, fontSize:20 }}>{liveSelFlight.from} → {liveSelFlight.to}</div>
                      <div style={{ color:"#64748b", fontSize:13, marginTop:2 }}>
                        {liveSelFlight.airline} · {liveSelFlight.flightId} · Departs {liveSelFlight.departure}
                      </div>
                    </div>
                    <Badge color={liveSelFlight.status==="On Time"?"#10b981":liveSelFlight.status==="Boarding"?"#3b82f6":"#f59e0b"}>
                      {liveSelFlight.status}
                    </Badge>
                  </div>
                  <SeatMap flight={liveSelFlight} chosen={chosenSeat} onChoose={setChosenSeat} liveEvent={lastSseEvent} />

                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:12, marginTop:20 }}>
                    {[
                      ["Available", liveSelFlight.availableSeats, "#10b981"],
                      ["Occupied",  liveSelFlight.totalSeats - liveSelFlight.availableSeats, "#ef4444"],
                      ["Total",     liveSelFlight.totalSeats, "#3b82f6"],
                      ["Occupancy", `${Math.round(((liveSelFlight.totalSeats-liveSelFlight.availableSeats)/liveSelFlight.totalSeats)*100)}%`, demandColor(liveSelFlight.demandIndex)],
                    ].map(([l,v,c])=>(
                      <div key={l} style={{ ...card, padding:"12px 16px", textAlign:"center" }}>
                        <div style={{ fontSize:20, fontWeight:800, color:c }}><LiveNum value={v} /></div>
                        <div style={{ fontSize:11, color:"#64748b", marginTop:3 }}>{l}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Booking panel */}
                <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
                  <div style={{ ...card, padding:22 }}>
                    <div style={{ marginBottom:14 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:5 }}>
                        <AiTag label="ML + Demand Pricing" />
                        <span style={{ fontSize:12, color:"#64748b" }}>Live AI Price (updates every 4s)</span>
                        <PulseDot size={6} />
                      </div>
                      <div style={{ fontSize:36, fontWeight:800, color:"#3b82f6" }}>
                        <LiveNum value={liveSelFlight.aiPrice} prefix="₹" />
                      </div>
                      <div style={{ fontSize:12, color:"#64748b", marginTop:3 }}>
                        Base: {fmt(liveSelFlight.basePrice)} · {daysLeft} days out · demand {Math.round(liveSelFlight.demandIndex*100)}%
                      </div>
                    </div>

                    <div style={{ height:1, background:"rgba(255,255,255,.06)", marginBottom:14 }} />

                    {chosenSeat ? (
                      <div style={{ padding:"12px 16px", background:"rgba(59,130,246,.08)", borderRadius:9, marginBottom:14, border:"1px solid rgba(59,130,246,.2)" }}>
                        <div style={{ fontSize:11, color:"#64748b", marginBottom:4 }}>SELECTED SEAT</div>
                        <div style={{ fontSize:24, fontWeight:800, color:"#60a5fa" }}>{chosenSeat.label}</div>
                        <div style={{ fontSize:11, color:"#475569", marginTop:2 }}>Economy Class</div>
                      </div>
                    ) : (
                      <div style={{ padding:12, background:"rgba(245,158,11,.07)", borderRadius:9, marginBottom:14, border:"1px solid rgba(245,158,11,.18)" }}>
                        <div style={{ fontSize:12, color:"#fbbf24" }}>👆 Click a green seat to select</div>
                      </div>
                    )}

                    <div style={{ marginBottom:12 }}>
                      <label style={label}>Passenger Name</label>
                      <input style={input} value={user?.name || ""} readOnly />
                    </div>

                    <button style={{ ...btnPri, width:"100%", padding:13, opacity: chosenSeat?1:0.5 }}
                      className="btn-hover" disabled={!chosenSeat||bookLoad} onClick={handleBook}>
                      {bookLoad ? "⏳ Saving to MongoDB…" : "✓ Confirm Booking"}
                    </button>
                    <div style={{ textAlign:"center", fontSize:11, color:"#334155", marginTop:9 }}>
                      🔒 JWT protected · 🍃 Saved to MongoDB · 📡 Live broadcast
                    </div>
                  </div>

                  {/* Price chart */}
                  {priceHist.length>0 && (
                    <div style={{ ...card, padding:18 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:12 }}>
                        <AiTag label="ML Model" />
                        <span style={{ fontSize:13, fontWeight:700 }}>Price Projection</span>
                      </div>
                      <ResponsiveContainer width="100%" height={140}>
                        <AreaChart data={priceHist}>
                          <defs>
                            <linearGradient id="pg" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#3b82f6" stopOpacity={.22}/>
                              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <XAxis dataKey="label" tick={{fontSize:9,fill:"#475569"}} axisLine={false} tickLine={false} interval={3} />
                          <YAxis hide />
                          <Tooltip contentStyle={{background:"#1e293b",border:"1px solid rgba(255,255,255,.08)",borderRadius:8,fontSize:11}} formatter={v=>[fmt(v),"AI Price"]} />
                          <Area type="monotone" dataKey="price" stroke="#3b82f6" strokeWidth={2} fill="url(#pg)" dot={false} />
                        </AreaChart>
                      </ResponsiveContainer>
                      <div style={{ fontSize:11, color:"#334155", textAlign:"center", marginTop:4 }}>
                        Prices rise as departure approaches — book early!
                      </div>
                    </div>
                    
                  )}

                  {/* Demand meter */}
                  <div style={{ ...card, padding:18 }}>
                    <div style={{ fontSize:12, color:"#64748b", marginBottom:10, fontWeight:600 }}>LIVE DEMAND INDEX <PulseDot size={6} /></div>
                    <div style={{ height:8, background:"rgba(255,255,255,.06)", borderRadius:4, overflow:"hidden", marginBottom:8 }}>
                      <div style={{
                        height:"100%", borderRadius:4,
                        width:`${Math.round(liveSelFlight.demandIndex*100)}%`,
                        background:`linear-gradient(90deg,#10b981,${demandColor(liveSelFlight.demandIndex)})`,
                        transition:"width .4s ease"
                      }} />
                    </div>
                    <div style={{ display:"flex", justifyContent:"space-between", fontSize:12 }}>
                      <span style={{ color:"#64748b" }}>Low</span>
                      <span style={{ color:demandColor(liveSelFlight.demandIndex), fontWeight:700 }}>
                        {demandLabel(liveSelFlight.demandIndex)} ({Math.round(liveSelFlight.demandIndex*100)}%)
                      </span>
                      <span style={{ color:"#64748b" }}>Critical</span>
                    </div>
                  </div>  // 👈 end of Demand meter

{/* 🔥 ADD HERE */}
{recommendations.length > 0 && (
  <div style={{ ...card, padding:18, marginTop:16 }}>
    <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>
      Recommended Flights
    </h3>

    {recommendations.map(r => (
      <div key={r.flightId} style={{
        border: "1px solid rgba(255,255,255,.1)",
        padding: 10,
        marginTop: 8,
        borderRadius: 8
      }}>
        {r.airline} — {r.from} → {r.to}
      </div>
    ))}
  </div>
)}

                </div>
              </div>
            )}
          </div>
        )}

        {/* ──── CONFIRM ──── */}
        {tab==="confirm" && (
          <ConfirmTab
            bookResult={bookResult}
            myBookings={myBookings}
            user={user}
            card={card}
            btnPri={btnPri}
            fmt={fmt}
            fetchMyBookings={fetchMyBookings}
            onNewSearch={()=>{ setTab("search"); setBookResult(null); setSelFlight(null); setFlights([]); setSearched(false); }}
          />
        )}

        {/* ──── MY BOOKINGS ──── */}
        {tab==="mybookings" && (
          <div className="fade-in">
            <div style={{ marginBottom:24 }}>
              <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:4 }}>
                <h2 style={{ fontSize:26, fontWeight:800 }}>My Bookings</h2>
                <Badge color="#10b981">🍃 Live from MongoDB</Badge>
              </div>
              <p style={{ color:"#64748b", fontSize:14 }}>All bookings fetched in real-time from your MongoDB collection</p>
            </div>
            {!user ? (
              <div style={{ ...card, padding:40, textAlign:"center", color:"#64748b" }}>
                Login to view bookings. <span style={{ color:"#60a5fa", cursor:"pointer" }} onClick={()=>setTab("auth")}>Login →</span>
              </div>
            ) : myBookings.length===0 ? (
              <div style={{ ...card, padding:48, textAlign:"center" }}>
                <div style={{ fontSize:36, marginBottom:10 }}>🎫</div>
                <div style={{ color:"#64748b" }}>No bookings yet.</div>
                <button style={{ ...btnPri, marginTop:16, padding:"10px 26px" }} className="btn-hover" onClick={()=>setTab("search")}>Search Flights</button>
              </div>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                {myBookings.map(b=>(
                  <div key={b._id} style={{ ...card, padding:"18px 24px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                    <div style={{ display:"flex", gap:30, alignItems:"center", flexWrap:"wrap" }}>
                      <div>
                        <div style={{ fontWeight:800, fontSize:17 }}>{b.flightDetails?.from} → {b.flightDetails?.to}</div>
                        <div style={{ fontSize:12, color:"#64748b", marginTop:2 }}>{b.flightDetails?.airline} · {b.flightDetails?.flightNo}</div>
                      </div>
                      <div>
                        <div style={{ fontSize:10, color:"#475569", textTransform:"uppercase", letterSpacing:.5 }}>Date</div>
                        <div style={{ fontWeight:700, marginTop:2 }}>{new Date(b.travelDate).toLocaleDateString("en-IN")}</div>
                      </div>
                      <div>
                        <div style={{ fontSize:10, color:"#475569", textTransform:"uppercase", letterSpacing:.5 }}>Seat</div>
                        <div style={{ fontWeight:800, fontSize:18, color:"#8b5cf6", marginTop:2 }}>{b.seatNumber}</div>
                      </div>
                      <div>
                        <div style={{ fontSize:10, color:"#475569", textTransform:"uppercase", letterSpacing:.5 }}>Price Paid</div>
                        <div style={{ fontWeight:800, fontSize:18, color:"#3b82f6", marginTop:2 }}>{fmt(b.price)}</div>
                      </div>
                    </div>
                    <div style={{ textAlign:"right" }}>
                      <Badge color="#10b981">{b.status}</Badge>
                      <div style={{ fontFamily:"monospace", fontSize:11, color:"#475569", marginTop:6 }}>{b.bookingRef}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ──── ADMIN ──── */}
        {tab==="admin" && (
          <div className="fade-in">
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:26 }}>
              <div>
                <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:4 }}>
                  <h2 style={{ fontSize:26, fontWeight:800 }}>Admin Analytics Dashboard</h2>
                  <AiTag label="ML Insights" />
                </div>
                <p style={{ color:"#64748b", fontSize:14 }}>Real-time MongoDB aggregation · Demand model metrics · Revenue analytics</p>
              </div>
              <div style={{ display:"flex", gap:6 }}>
                {["overview","flights","bookings"].map(v=>(
                  <button key={v} style={{ ...btnGhost, textTransform:"capitalize", ...(adminView===v?{background:"rgba(29,78,216,.14)",color:"#60a5fa",borderColor:"rgba(29,78,216,.3)"}:{}) }}
                    onClick={()=>setAdminView(v)}>{v}</button>
                ))}
              </div>
            </div>

            {/* Live KPI banner */}
            {liveStats.totalBookings>0 && (
              <div style={{ ...card, padding:"12px 20px", marginBottom:20, background:"rgba(16,185,129,.05)", border:"1px solid rgba(16,185,129,.15)", display:"flex", alignItems:"center", gap:24 }}>
                <PulseDot />
                <span style={{ fontSize:12, fontWeight:700, color:"#10b981" }}>LIVE STATS</span>
                <span style={{ fontSize:13, color:"#64748b" }}>Bookings: <b style={{color:"#e2e8f0"}}>{liveStats.totalBookings}</b></span>
                <span style={{ fontSize:13, color:"#64748b" }}>Revenue: <b style={{color:"#3b82f6"}}>{fmt(liveStats.totalRevenue)}</b></span>
                <span style={{ fontSize:11, color:"#334155" }}>Updates every 8s via SSE</span>
              </div>
            )}

            {/* KPI cards */}
            {adminStats && (
              <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:16, marginBottom:24 }}>
                {[
                  { label:"Total Revenue",   value:fmt(adminStats.totalRevenue), sub:"From MongoDB bookings", c:"#3b82f6", icon:"💰" },
                  { label:"Total Bookings",  value:adminStats.totalBookings,     sub:"Confirmed status",       c:"#10b981", icon:"🎫" },
                  { label:"Active Flights",  value:adminStats.flightCount,       sub:"In MongoDB",             c:"#8b5cf6", icon:"✈"  },
                  { label:"Avg Ticket Price",value:fmt(adminStats.avgPrice),     sub:"AI dynamic model",       c:"#f59e0b", icon:"📊" },
                  { label:"Avg Occupancy",   value:`${adminStats.avgOccupancy}%`,sub:"All flights",            c:"#ef4444", icon:"💺" },
                ].map(k=>(
                  <div key={k.label} style={{ ...card, padding:"20px 22px" }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                      <div>
                        <div style={{ fontSize:11, color:"#64748b", textTransform:"uppercase", letterSpacing:.6, marginBottom:6 }}>{k.label}</div>
                        <div style={{ fontSize:26, fontWeight:800, color:k.c }}>{k.value}</div>
                        <div style={{ fontSize:11, color:"#334155", marginTop:4 }}>{k.sub}</div>
                      </div>
                      <div style={{ fontSize:22, opacity:.4 }}>{k.icon}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {adminView==="overview" && (
              <div style={{ display:"grid", gridTemplateColumns:"1.5fr 1fr", gap:20 }}>
                <div style={{ ...card, padding:24 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:16 }}><AiTag label="ML + Demand Pricing" /><span style={{ fontWeight:700, fontSize:14 }}>Revenue Trend (₹)</span></div>
                  <ResponsiveContainer width="100%" height={230}>
                    <AreaChart data={[{m:"Oct",r:120000},{m:"Nov",r:155000},{m:"Dec",r:210000},{m:"Jan",r:182000},{m:"Feb",r:167000},{m:"Mar",r:adminStats?.totalRevenue||240000}]}>
                      <defs>
                        <linearGradient id="rg" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={.22}/><stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.04)" />
                      <XAxis dataKey="m" tick={{fontSize:12,fill:"#64748b"}} axisLine={false} tickLine={false} />
                      <YAxis tick={{fontSize:11,fill:"#64748b"}} axisLine={false} tickLine={false} tickFormatter={v=>`₹${(v/1000).toFixed(0)}K`} />
                      <Tooltip contentStyle={{background:"#1e293b",border:"1px solid rgba(255,255,255,.08)",borderRadius:8,fontSize:12}} formatter={v=>[fmt(v),"Revenue"]} />
                      <Area type="monotone" dataKey="r" stroke="#3b82f6" strokeWidth={2.5} fill="url(#rg)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <div style={{ ...card, padding:24 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:16 }}><AiTag label="ML + Demand Pricing" /><span style={{ fontWeight:700, fontSize:14 }}>Route Distribution</span></div>
                  <ResponsiveContainer width="100%" height={230}>
                    <PieChart>
                      <Pie data={[{n:"DEL-BOM",v:34},{n:"DEL-BLR",v:22},{n:"BOM-MAA",v:18},{n:"DEL-HYD",v:14},{n:"Others",v:12}]}
                        dataKey="v" nameKey="n" cx="50%" cy="50%" outerRadius={88} innerRadius={40}
                        label={({n,percent})=>`${n} ${(percent*100).toFixed(0)}%`} labelLine={{stroke:"#334155",strokeWidth:1}}>
                        {PIE_COLORS.map((c,i)=><Cell key={i} fill={c} />)}
                      </Pie>
                      <Tooltip contentStyle={{background:"#1e293b",border:"none",borderRadius:8,fontSize:12}} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {adminView==="flights" && (
              <div style={{ ...card, overflow:"hidden" }}>
                <div style={{ padding:"16px 24px", borderBottom:"1px solid rgba(255,255,255,.06)", display:"flex", alignItems:"center", gap:8 }}>
                  <AiTag label="ML + Demand Pricing" /><span style={{ fontWeight:700 }}>Live Flight Performance — MongoDB</span>
                  <PulseDot size={6} />
                </div>
                <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
                  <thead>
                    <tr style={{ background:"rgba(255,255,255,.02)" }}>
                      {["Flight","Route","Airline","Occupancy","AI Price","Demand","Seats Left","Status"].map(h=>(
                        <th key={h} style={{ padding:"12px 16px", textAlign:"left", color:"#475569", fontWeight:700, fontSize:11, textTransform:"uppercase", letterSpacing:.5 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {adminFlights.map(f=>{
                      const live = priceTick[f.flightId];
                      const price = live?.aiPrice || f.aiPrice;
                      const demand = live?.demandIndex ?? f.demandIndex;
                      const avail = live?.availableSeats ?? f.availableSeats;
                      return (
                        <tr key={f.flightId}>
                          <td style={{ padding:"13px 16px", fontWeight:800, color:"#94a3b8" }}>{f.flightId}</td>
                          <td style={{ padding:"13px 16px" }}>{f.from} → {f.to}</td>
                          <td style={{ padding:"13px 16px", color:"#64748b" }}>{f.airline}</td>
                          <td style={{ padding:"13px 16px" }}>
                            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                              <div style={{ flex:1, height:5, background:"rgba(255,255,255,.06)", borderRadius:3, overflow:"hidden" }}>
                                <div style={{ width:`${f.occupancyRate}%`, height:"100%", background:f.occupancyRate>80?"#ef4444":f.occupancyRate>60?"#f59e0b":"#10b981", borderRadius:3, transition:"width .4s" }} />
                              </div>
                              <span style={{ fontSize:12, minWidth:35 }}>{f.occupancyRate}%</span>
                            </div>
                          </td>
                          <td style={{ padding:"13px 16px", fontWeight:800, color:"#3b82f6" }}>
                            <LiveNum value={price} prefix="₹" />
                          </td>
                          <td style={{ padding:"13px 16px" }}>
                            <div style={{ display:"flex", gap:3 }}>
                              {[1,2,3,4,5].map(i=><div key={i} style={{ width:8,height:8,borderRadius:"50%",background:i<=Math.round(demand*5)?demandColor(demand):"rgba(255,255,255,.08)" }} />)}
                            </div>
                          </td>
                          <td style={{ padding:"13px 16px", fontWeight:700, color: avail<10?"#ef4444":avail<20?"#f59e0b":"#10b981" }}>
                            <LiveNum value={avail} />
                          </td>
                          <td style={{ padding:"13px 16px" }}>
                            <Badge color={f.status==="On Time"?"#10b981":f.status==="Boarding"?"#3b82f6":"#f59e0b"} sm>{f.status}</Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {adminView==="bookings" && (
              <div style={{ ...card, overflow:"hidden" }}>
                <div style={{ padding:"16px 24px", borderBottom:"1px solid rgba(255,255,255,.06)", display:"flex", alignItems:"center", gap:8 }}>
                  <AiTag label="ML + Demand Pricing" /><span style={{ fontWeight:700 }}>Recent Bookings — MongoDB Collection</span>
                  <span style={{ fontSize:12, color:"#10b981" }}>Auto-updates on new booking</span>
                </div>
                {adminBookings.length===0 ? (
                  <div style={{ padding:40, textAlign:"center", color:"#64748b" }}>No bookings yet. Create some from the Search tab.</div>
                ) : (
                  <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
                    <thead>
                      <tr style={{ background:"rgba(255,255,255,.02)" }}>
                        {["Ref","Passenger","Route","Seat","Date","Price","Status","Booked At"].map(h=>(
                          <th key={h} style={{ padding:"12px 16px", textAlign:"left", color:"#475569", fontWeight:700, fontSize:11, textTransform:"uppercase" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {adminBookings.map(b=>(
                        <tr key={b._id}>
                          <td style={{ padding:"12px 16px", fontFamily:"monospace", color:"#8b5cf6", fontWeight:700, fontSize:12 }}>{b.bookingRef}</td>
                          <td style={{ padding:"12px 16px" }}>{b.passengerName}</td>
                          <td style={{ padding:"12px 16px" }}>{b.flightDetails?.from} → {b.flightDetails?.to}</td>
                          <td style={{ padding:"12px 16px", fontWeight:800, color:"#60a5fa" }}>{b.seatNumber}</td>
                          <td style={{ padding:"12px 16px", color:"#64748b" }}>{new Date(b.travelDate).toLocaleDateString("en-IN")}</td>
                          <td style={{ padding:"12px 16px", fontWeight:800, color:"#3b82f6" }}>{fmt(b.price)}</td>
                          <td style={{ padding:"12px 16px" }}><Badge color="#10b981" sm>{b.status}</Badge></td>
                          <td style={{ padding:"12px 16px", color:"#475569", fontSize:11 }}>{new Date(b.bookedAt).toLocaleTimeString("en-IN")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}