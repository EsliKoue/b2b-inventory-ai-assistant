import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Sun, Moon, Loader2, Menu, X, PlusCircle, MessageSquare, BarChart3, MessageCircle, Activity, Calendar, Lock } from 'lucide-react';

export default function Chatbot() {
  const [isDark, setIsDark] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isAdminView, setIsAdminView] = useState(false);
  
  // ÉTATS POUR LA SÉCURITÉ ADMIN
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [inputPassword, setInputPassword] = useState('');
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [authError, setAuthError] = useState(false);

  const SECRET_ADMIN_CODE = "Admin@2026"; // 🔑 Ton code secret à modifier ici

  const [sessions, setSessions] = useState([]);
  const [currentSessionId, setCurrentSessionId] = useState('');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  const [stats, setStats] = useState({
    total_sessions: 0,
    total_messages: 0,
    user_messages_count: 0,
    bot_messages_count: 0,
    daily_stats: []
  });

  const messagesEndRef = useRef(null);
  const generateUUID = () => crypto.randomUUID();

  const fetchSessions = async () => {
    try {
      const res = await fetch('http://localhost:8000/api/sessions');
      if (res.ok) {
        const data = await res.json();
        setSessions(data);
        if (!currentSessionId && data.length > 0) {
          loadSession(data[0].id);
        } else if (!currentSessionId) {
          startNewChat();
        }
      }
    } catch (err) {
      console.error("Erreur sessions:", err);
    }
  };

  const fetchAdminStats = async () => {
    try {
      const res = await fetch('http://localhost:8000/api/admin/stats');
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (err) {
      console.error("Erreur stats:", err);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  useEffect(() => {
    if (isAdminView && isAdminAuthenticated) {
      fetchAdminStats();
    }
  }, [isAdminView, isAdminAuthenticated]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const loadSession = async (sessionId) => {
    setCurrentSessionId(sessionId);
    setSidebarOpen(false);
    setIsAdminView(false); 
    try {
      const res = await fetch(`http://localhost:8000/api/sessions/${sessionId}/messages`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data);
      }
    } catch (err) {
      console.error("Erreur messages:", err);
    }
  };

  const startNewChat = () => {
    setCurrentSessionId(generateUUID());
    setMessages([]);
    setSidebarOpen(false);
    setIsAdminView(false);
  };

  // Gestion du verrouillage / déverrouillage de l'espace Admin
  const handleAdminToggleClick = () => {
    if (isAdminView) {
      // Si on y est déjà, on en sort juste
      setIsAdminView(false);
    } else {
      // Si on n'est pas encore authentifié, on demande le code
      if (!isAdminAuthenticated) {
        setShowAuthModal(true);
      } else {
        setIsAdminView(true);
      }
    }
  };

  const verifyAdminPassword = (e) => {
    e.preventDefault();
    if (inputPassword === SECRET_ADMIN_CODE) {
      setIsAdminAuthenticated(true);
      setShowAuthModal(false);
      setIsAdminView(true);
      setAuthError(false);
      setInputPassword('');
    } else {
      setAuthError(true);
    }
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userText = input.trim();
    setInput('');
    setIsLoading(true);

    const updated = [...messages, { role: 'user', text: userText }];
    setMessages(updated);

    try {
      const res = await fetch('http://localhost:8000/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userText, session_id: currentSessionId }),
      });
      if (!res.ok) throw new Error('Erreur');
      const data = await res.json();
      setMessages((prev) => [...prev, { role: 'model', text: data.response }]);
      fetchSessions();
    } catch (error) {
      setMessages((prev) => [...prev, { role: 'model', text: "ERREUR : Connexion perdue." }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={`flex h-screen w-full transition-colors duration-300 ${isDark ? 'bg-[#050b14] text-slate-100' : 'bg-slate-50 text-slate-800'}`}>
      
      {/* SIDEBAR */}
      <aside className={`fixed inset-y-0 left-0 z-40 w-72 transform border-r transition-transform duration-300 md:static md:translate-x-0 ${
        isDark ? 'bg-[#0a1424] border-slate-800' : 'bg-white border-slate-200'
      } ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        
        <div className="flex flex-col h-full p-4">
          <div className="flex items-center justify-between mb-4">
            <button 
              onClick={startNewChat}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-blue-500/30 text-blue-500 hover:bg-blue-500/10 transition-all font-medium text-sm"
            >
              <PlusCircle className="w-4 h-4" /> Nouvelle discussion
            </button>
            <button onClick={() => setSidebarOpen(false)} className="p-2 md:hidden">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-1.5 scrollbar-none">
            <p className="text-xs font-semibold tracking-wider opacity-40 px-2 uppercase mb-2">Historique complet</p>
            {sessions.map((s) => (
              <button
                key={s.id}
                onClick={() => loadSession(s.id)}
                className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left text-sm transition-all ${
                  !isAdminView && currentSessionId === s.id 
                    ? 'bg-blue-600 text-white font-medium' 
                    : (isDark ? 'hover:bg-slate-800/60 text-slate-400' : 'hover:bg-slate-100 text-slate-600')
                }`}
              >
                <MessageSquare className="w-4 h-4 shrink-0 opacity-70" />
                <span className="truncate">{s.titre}</span>
              </button>
            ))}
          </div>
        </div>
      </aside>

      {sidebarOpen && <div onClick={() => setSidebarOpen(false)} className="fixed inset-0 z-30 bg-black/40 md:hidden" />}

      {/* ZONE DE CHAT PRINCIPALE */}
      <div className="flex-1 flex flex-col h-full min-w-0">
        
        {/* HEADER BARRE HAUTE */}
        <header className={`flex items-center justify-between px-4 py-3 border-b ${
          isDark ? 'bg-[#0a1424]/80 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
        }`}>
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(true)} className="p-2 md:hidden rounded-lg hover:bg-slate-500/10">
              <Menu className="w-5 h-5" />
            </button>
            <div className={`p-2 rounded-xl hidden sm:block ${isDark ? 'bg-blue-500/10' : 'bg-blue-50'}`}>
              <Bot className={`w-5 h-5 ${isDark ? 'text-blue-400' : 'text-blue-600'}`} />
            </div>
            <div>
              <h1 className="font-bold text-base tracking-wide">ASSISTANT INVENTAIRE</h1>
              <p className="text-xs opacity-50">{isAdminView ? "Supervision & Flux de l'application" : "Catalogue B2B IT & WASH"}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {/* BOUTON FLUX ADAPTÉ AVEC VÉROUILLAGE VISUEL */}
            <button 
              onClick={handleAdminToggleClick}
              className={`p-2 rounded-xl border flex items-center gap-2 text-xs font-medium transition-all ${
                isAdminView 
                  ? 'bg-blue-600 text-white border-blue-500' 
                  : (isDark ? 'border-slate-700 text-slate-300 bg-slate-800 hover:bg-slate-700' : 'border-slate-200 text-slate-600 bg-slate-100 hover:bg-slate-200')
              }`}
            >
              {isAdminAuthenticated ? <BarChart3 className="w-4 h-4" /> : <Lock className="w-4 h-4 text-slate-400" />}
              <span className="hidden sm:inline">Stats & Flux</span>
            </button>

            <button 
              onClick={() => setIsDark(!isDark)}
              className={`p-2 rounded-xl border ${isDark ? 'border-slate-700 text-yellow-400 bg-slate-800' : 'border-slate-200 text-slate-600 bg-slate-100'}`}
            >
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </header>

        {/* AFFICHAGE EN FONCTION DU MODE DE VISION */}
        {isAdminView && isAdminAuthenticated ? (
          /* ================= PANNEAU DES STATISTIQUES SECRÈTES ================= */
          <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
            <div className="max-w-5xl mx-auto space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold tracking-tight">Indicateurs de Performance Global (Admin)</h2>
                <button 
                  onClick={() => { setIsAdminAuthenticated(false); setIsAdminView(false); }}
                  className="text-xs px-3 py-1.5 border border-red-500/30 text-red-400 rounded-lg hover:bg-red-500/10"
                >
                  Se déconnecter de l'admin
                </button>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className={`p-4 rounded-xl border ${isDark ? 'bg-[#0a1424]/40 border-slate-800' : 'bg-white border-slate-200 shadow-sm'}`}>
                  <span className="text-xs opacity-50 font-medium uppercase block mb-1">Discussions</span>
                  <p className="text-2xl font-bold">{stats.total_sessions}</p>
                </div>
                <div className={`p-4 rounded-xl border ${isDark ? 'bg-[#0a1424]/40 border-slate-800' : 'bg-white border-slate-200 shadow-sm'}`}>
                  <span className="text-xs opacity-50 font-medium uppercase block mb-1">Messages Échangés</span>
                  <p className="text-2xl font-bold">{stats.total_messages}</p>
                </div>
                <div className={`p-4 rounded-xl border ${isDark ? 'bg-[#0a1424]/40 border-slate-800' : 'bg-white border-slate-200 shadow-sm'}`}>
                  <span className="text-xs opacity-50 font-medium uppercase block mb-1">Requêtes Clients</span>
                  <p className="text-2xl font-bold">{stats.user_messages_count}</p>
                </div>
                <div className={`p-4 rounded-xl border ${isDark ? 'bg-[#0a1424]/40 border-slate-800' : 'bg-white border-slate-200 shadow-sm'}`}>
                  <span className="text-xs opacity-50 font-medium uppercase block mb-1">Réponses IA</span>
                  <p className="text-2xl font-bold">{stats.bot_messages_count}</p>
                </div>
              </div>

              <div className={`p-5 rounded-xl border ${isDark ? 'bg-[#0a1424]/30 border-slate-800' : 'bg-white border-slate-200 shadow-sm'}`}>
                <h3 className="text-sm font-semibold mb-4 flex items-center gap-2 opacity-80">
                  <Calendar className="w-4 h-4 text-blue-500" /> Flux d'activité : Requêtes clients journalières
                </h3>
                {stats.daily_stats.length === 0 ? (
                  <p className="text-xs opacity-40 text-center py-6">Aucune donnée enregistrée.</p>
                ) : (
                  <div className="space-y-4">
                    {stats.daily_stats.map((row, idx) => {
                      const maxCount = Math.max(...stats.daily_stats.map(d => d.count), 1);
                      const barWidth = (row.count / maxCount) * 100;
                      return (
                        <div key={idx} className="flex items-center text-xs gap-4">
                          <div className="w-24 font-mono font-medium opacity-70">{row.date}</div>
                          <div className="flex-1 bg-slate-500/10 h-6 rounded-md overflow-hidden relative flex items-center px-2">
                            <div className="absolute left-0 top-0 bottom-0 bg-blue-600/20 border-r-2 border-blue-500" style={{ width: `${barWidth}%` }} />
                            <span className="relative z-10 font-semibold text-blue-500">{row.count} req.</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          /* ================= INTERFACE DU CHAT CLASSIQUE POUR L'UTILISATEUR ================= */
          <>
            <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
              {messages.length === 0 ? (
                <div className="text-center mt-24 space-y-3 max-w-md mx-auto">
                  <Bot className="w-12 h-12 mx-auto opacity-20 text-blue-500" />
                  <h2 className="font-semibold text-lg opacity-70">Comment puis-je vous aider ?</h2>
                  <p className="text-xs leading-relaxed opacity-50">
                    Demandez les prix en FCFA, les stocks ou délais de livraison de nos équipements réseaux ou hydrauliques.
                  </p>
                </div>
              ) : (
                messages.map((msg, idx) => (
                  <div key={idx} className={`flex gap-3 max-w-4xl ${msg.role === 'user' ? 'ml-auto flex-row-reverse' : 'mr-auto'}`}>
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-sm ${
                      msg.role === 'user' ? 'bg-blue-600 text-white' : (isDark ? 'bg-slate-800 text-blue-400' : 'bg-slate-200 text-blue-600')
                    }`}>
                      {msg.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                    </div>
                    <div className={`p-4 rounded-2xl whitespace-pre-line text-sm border leading-relaxed ${
                      msg.role === 'user' ? 'bg-blue-600 text-white border-blue-500' : (isDark ? 'bg-[#0a1424]/40 text-slate-200 border-slate-800/60' : 'bg-white text-slate-800 border-slate-200/60 shadow-sm')
                    }`}>
                      {msg.text}
                    </div>
                  </div>
                ))
              )}
              {isLoading && (
                <div className="flex gap-3 max-w-4xl mr-auto items-center">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isDark ? 'bg-slate-800 text-blue-400' : 'bg-slate-200 text-blue-600'}`}>
                    <Bot className="w-4 h-4" />
                  </div>
                  <div className="flex items-center gap-2 opacity-60 text-xs">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" />
                    <span>Analyse du catalogue d'inventaire...</span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <footer className={`p-4 border-t ${isDark ? 'bg-[#0a1424]/20 border-slate-800/50' : 'bg-white border-slate-200'}`}>
              <form onSubmit={handleSend} className="max-w-4xl mx-auto flex gap-2">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  disabled={isLoading}
                  placeholder="Ex: Disponibilité Switch Catalyst 9300..."
                  className={`flex-1 px-4 py-3 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 transition-all ${
                    isDark ? 'bg-[#050b14] border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                  }`}
                />
                <button type="submit" disabled={isLoading || !input.trim()} className="p-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-xl transition-all">
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </footer>
          </>
        )}
      </div>

      {/* ================= MODAL RIDEAU DE SÉCURITÉ AUTHENTIFICATION ================= */}
      {showAuthModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className={`w-full max-w-md p-6 rounded-2xl border shadow-xl ${isDark ? 'bg-[#0a1424] border-slate-800' : 'bg-white border-slate-200'}`}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-blue-500 font-bold text-sm">
                <Lock className="w-4 h-4" /> Zone d'administration sécurisée
              </div>
              <button onClick={() => { setShowAuthModal(false); setAuthError(false); setInputPassword(''); }} className="p-1 opacity-50 hover:opacity-100">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <p className="text-xs opacity-60 mb-4 leading-relaxed">
              Veuillez saisir le code d'accès administrateur pour consulter le flux d'activité en direct et l'analyse journalière des données.
            </p>

            <form onSubmit={verifyAdminPassword} className="space-y-4">
              <input
                type="password"
                value={inputPassword}
                onChange={(e) => setInputPassword(e.target.value)}
                placeholder="Entrez le code secret..."
                className={`w-full px-4 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 ${
                  isDark ? 'bg-[#050b14] border-slate-700 text-white' : 'bg-slate-50 border-slate-300'
                } ${authError ? 'border-red-500 focus:ring-red-500/30' : ''}`}
                autoFocus
              />
              
              {authError && (
                <p className="text-xs font-semibold text-red-500">❌ Code d'accès incorrect. Veuillez réessayer.</p>
              )}

              <div className="flex gap-2 justify-end text-xs font-semibold pt-2">
                <button 
                  type="button" 
                  onClick={() => { setShowAuthModal(false); setAuthError(false); setInputPassword(''); }}
                  className={`px-4 py-2 rounded-xl border ${isDark ? 'border-slate-700 hover:bg-slate-800' : 'border-slate-200 hover:bg-slate-100'}`}
                >
                  Annuler
                </button>
                <button type="submit" className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl">
                  Déverrouiller
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}