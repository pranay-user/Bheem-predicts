import React, { useState, useEffect, useMemo, Component, ErrorInfo, ReactNode } from "react";
import { 
  Trophy, 
  User, 
  Settings, 
  LogOut, 
  Plus, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Coins,
  ChevronRight,
  TrendingUp,
  History,
  LogIn,
  AlertTriangle
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { 
  auth, 
  db, 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged, 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs,
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  onSnapshot, 
  Timestamp,
  OperationType,
  handleFirestoreError,
  FirebaseUser,
  createAuthUser,
  updatePassword
} from "./firebase";

// Types
interface UserData {
  id: string;
  username: string;
  email: string;
  role: "admin" | "user";
  coins: number;
}

interface Match {
  id: string;
  teamA: string;
  teamB: string;
  ratioA: number;
  ratioB: number;
  status: "open" | "closed" | "completed";
  winner: "teamA" | "teamB" | "none" | null;
  createdAt: any;
}

interface Prediction {
  id: string;
  userId: string;
  matchId: string;
  team: "teamA" | "teamB";
  amount: number;
  status: "pending" | "won" | "lost" | "refunded";
  winnings?: number;
  createdAt: any;
  match?: Match;
}

import ErrorBoundary from "./ErrorBoundary";

function AppContent() {
  const [user, setUser] = useState<UserData | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [view, setView] = useState<"dashboard" | "admin" | "history" | "settings">("dashboard");
  
  // Data states
  const [matches, setMatches] = useState<Match[]>([]);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [allUsers, setAllUsers] = useState<UserData[]>([]);
  
  // Admin form states
  const [newMatch, setNewMatch] = useState({ teamA: "", teamB: "", ratioA: 1.8, ratioB: 2.2 });
  const [coinUpdate, setCoinUpdate] = useState({ userId: "", amount: 0, action: "add" as "add" | "deduct" });
  const [editingRatios, setEditingRatios] = useState<Record<string, { ratioA: number, ratioB: number }>>({});
  const [newUser, setNewUser] = useState({ username: "", password: "", initialCoins: 1000 });
  const [loginForm, setLoginForm] = useState({ username: "", password: "" });
  const [loginError, setLoginError] = useState("");
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [isCreatingMatch, setIsCreatingMatch] = useState(false);
  const [selectedUserForHistory, setSelectedUserForHistory] = useState<string | null>(null);

  const userStats = useMemo(() => {
    return allUsers.map(u => {
      const userPredictions = predictions.map(p => {
        const match = matches.find(m => m.id === p.matchId);
        return { ...p, match };
      }).filter(p => p.userId === u.id);
      
      const activePredictions = userPredictions.filter(p => p.status === 'pending');
      const totalWinnings = userPredictions.reduce((sum, p) => sum + (p.winnings || 0), 0);
      const totalBet = userPredictions.reduce((sum, p) => sum + p.amount, 0);
      
      return {
        ...u,
        activeCount: activePredictions.length,
        totalWinnings,
        totalBet,
        predictions: userPredictions
      };
    });
  }, [allUsers, predictions, matches]);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (fUser) => {
      setFirebaseUser(fUser);
      if (!fUser) {
        setUser(null);
        setIsAuthReady(true);
      }
    });
    return () => unsubscribe();
  }, []);

  // User Profile Real-time Listener
  useEffect(() => {
    if (!firebaseUser) return;

    const unsubscribe = onSnapshot(doc(db, "users", firebaseUser.uid), async (snapshot) => {
      if (snapshot.exists()) {
        setUser({ id: firebaseUser.uid, ...snapshot.data() } as UserData);
      } else {
        // Create new user profile if it doesn't exist
        const newUser: UserData = {
          id: firebaseUser.uid,
          username: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || "User",
          email: firebaseUser.email || "",
          role: (firebaseUser.email === "admin@chotabheem.app" || firebaseUser.email === "pranay.02042008@gmail.com") ? "admin" : "user",
          coins: 1000
        };
        try {
          await setDoc(doc(db, "users", firebaseUser.uid), {
            username: newUser.username,
            email: newUser.email,
            role: newUser.role,
            coins: newUser.coins,
            createdAt: Timestamp.now()
          });
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, `users/${firebaseUser.uid}`);
        }
      }
      setIsAuthReady(true);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `users/${firebaseUser.uid}`);
      setIsAuthReady(true);
    });

    return () => unsubscribe();
  }, [firebaseUser]);

  // Real-time Data Listeners
  useEffect(() => {
    if (!user || !isAuthReady) return;

    // Matches Listener
    const unsubscribeMatches = onSnapshot(collection(db, "matches"), (snapshot) => {
      const matchesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Match));
      setMatches(matchesData.sort((a, b) => {
        const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
        const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
        return timeB - timeA;
      }));
    }, (error) => handleFirestoreError(error, OperationType.LIST, "matches"));

    // Predictions Listener
    const q = query(collection(db, "predictions"), where("userId", "==", user.id));
    const unsubscribePredictions = onSnapshot(q, (snapshot) => {
      const predsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Prediction));
      setPredictions(predsData.sort((a, b) => {
        const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
        const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
        return timeB - timeA;
      }));
    }, (error) => handleFirestoreError(error, OperationType.LIST, "predictions"));

    // Admin: All Users Listener
    let unsubscribeUsers: () => void = () => {};
    if (user.role === "admin" || user.email === "admin@chotabheem.app" || user.email === "pranay.02042008@gmail.com") {
      unsubscribeUsers = onSnapshot(collection(db, "users"), (snapshot) => {
        const usersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as UserData));
        setAllUsers(usersData);
      }, (error) => handleFirestoreError(error, OperationType.LIST, "users"));
    }

    return () => {
      unsubscribeMatches();
      unsubscribePredictions();
      unsubscribeUsers();
    };
  }, [user, isAuthReady]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    try {
      // Map username to a fake email for Firebase Auth
      const email = `${loginForm.username.toLowerCase()}@chotabheem.app`;
      await signInWithEmailAndPassword(auth, email, loginForm.password);
    } catch (error: any) {
      console.error("Login failed", error);
      if (loginForm.username === "admin" || loginForm.username === "user1") {
        setLoginError("Invalid credentials for demo account.");
      } else {
        setLoginError("Invalid username or password. Please contact admin.");
      }
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setView("dashboard");
    } catch (error) {
      console.error("Logout failed", error);
    }
  };

  const handleAddMatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (user?.role !== "admin" && user?.email !== "admin@chotabheem.app" && user?.email !== "pranay.02042008@gmail.com") {
      alert("You do not have permission to perform this action.");
      return;
    }
    
    setIsCreatingMatch(true);
    try {
      const matchRef = doc(collection(db, "matches"));
      await setDoc(matchRef, {
        ...newMatch,
        status: "open",
        winner: null,
        createdAt: Timestamp.now()
      });
      setNewMatch({ teamA: "", teamB: "", ratioA: 1.8, ratioB: 2.2 });
      alert("Match created successfully!");
    } catch (error: any) {
      console.error("Error creating match:", error);
      alert(`Failed to create match: ${error.message || "Unknown error"}`);
      // Don't re-throw here so we can handle it gracefully in the UI
    } finally {
      setIsCreatingMatch(false);
    }
  };

  const handleCloseMatch = async (matchId: string) => {
    if (user?.role !== "admin" && user?.email !== "admin@chotabheem.app" && user?.email !== "pranay.02042008@gmail.com") return;
    try {
      await updateDoc(doc(db, "matches", matchId), { status: "closed" });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `matches/${matchId}`);
    }
  };

  const handleDeclareWinner = async (matchId: string, winner: "teamA" | "teamB" | "none") => {
    if (user?.role !== "admin" && user?.email !== "admin@chotabheem.app" && user?.email !== "pranay.02042008@gmail.com") return;
    try {
      const matchDoc = await getDoc(doc(db, "matches", matchId));
      if (!matchDoc.exists()) return;
      const matchData = matchDoc.data() as Match;

      // Update match status
      await updateDoc(doc(db, "matches", matchId), { 
        status: "completed",
        winner: winner
      });

      // Process predictions for this match
      const q = query(collection(db, "predictions"), where("matchId", "==", matchId));
      const snapshot = await getDocs(q);
      
      for (const predDoc of snapshot.docs) {
        const pred = { id: predDoc.id, ...predDoc.data() } as Prediction;
        const userRef = doc(db, "users", pred.userId);
        const userDoc = await getDoc(userRef);
        if (!userDoc.exists()) continue;
        const userData = userDoc.data() as UserData;

        let winnings = 0;
        let status: "won" | "lost" | "refunded" = "lost";

        if (winner === "none") {
          winnings = pred.amount;
          status = "refunded";
        } else if (pred.team === winner) {
          const ratio = winner === "teamA" ? matchData.ratioA : matchData.ratioB;
          winnings = Math.floor(pred.amount * ratio);
          status = "won";
        }

        await updateDoc(doc(db, "predictions", pred.id), { status, winnings });
        if (winnings > 0) {
          await updateDoc(userRef, { coins: userData.coins + winnings });
        }
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `matches/${matchId}/result`);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (user?.role !== "admin" && user?.email !== "admin@chotabheem.app" && user?.email !== "pranay.02042008@gmail.com") return;
    if (isCreatingUser) return;
    if (newUser.password.length < 6) {
      alert("Password must be at least 6 characters long.");
      return;
    }

    setIsCreatingUser(true);
    try {
      const email = `${newUser.username.toLowerCase()}@chotabheem.app`;
      
      // 1. Create the Firebase Auth user using the secondary app
      const authUser = await createAuthUser(email, newUser.password);
      
      // 2. Create the Firestore user document
      await setDoc(doc(db, "users", authUser.uid), {
        username: newUser.username,
        email: email,
        role: "user",
        coins: newUser.initialCoins,
        createdAt: Timestamp.now()
      });

      setNewUser({ username: "", password: "", initialCoins: 1000 });
      alert(`User ${newUser.username} created successfully!`);
    } catch (error: any) {
      console.error("Error creating user:", error);
      alert(`Failed to create user: ${error.message}`);
    } finally {
      setIsCreatingUser(false);
    }
  };

  const handlePredict = async (matchId: string, team: "teamA" | "teamB", amount: number) => {
    if (!user) return;
    if (user.coins < amount) {
      alert("Insufficient coins!");
      return;
    }

    try {
      const predRef = doc(collection(db, "predictions"));
      await setDoc(predRef, {
        userId: user.id,
        matchId,
        team,
        amount,
        status: "pending",
        createdAt: Timestamp.now()
      });

      await updateDoc(doc(db, "users", user.id), {
        coins: user.coins - amount
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, "predictions");
    }
  };

  const handleUpdateCoins = async (e: React.FormEvent) => {
    e.preventDefault();
    if (user?.role !== "admin" && user?.email !== "admin@chotabheem.app" && user?.email !== "pranay.02042008@gmail.com") return;
    try {
      const targetUser = allUsers.find(u => u.id === coinUpdate.userId);
      if (!targetUser) return;

      const newBalance = coinUpdate.action === "add" 
        ? targetUser.coins + coinUpdate.amount 
        : Math.max(0, targetUser.coins - coinUpdate.amount);

      await updateDoc(doc(db, "users", coinUpdate.userId), { coins: newBalance });
      setCoinUpdate({ userId: "", amount: 0, action: "add" });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${coinUpdate.userId}`);
    }
  };

  const handleDeleteMatch = async (matchId: string) => {
    if (user?.role !== "admin" && user?.email !== "admin@chotabheem.app" && user?.email !== "pranay.02042008@gmail.com") return;
    if (!confirm("Are you sure you want to delete this match?")) return;
    try {
      await deleteDoc(doc(db, "matches", matchId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `matches/${matchId}`);
    }
  };

  const handleUpdateRatio = async (matchId: string) => {
    if (user?.role !== "admin" && user?.email !== "admin@chotabheem.app" && user?.email !== "pranay.02042008@gmail.com") return;
    const ratios = editingRatios[matchId];
    if (!ratios) return;

    try {
      await updateDoc(doc(db, "matches", matchId), {
        ratioA: ratios.ratioA,
        ratioB: ratios.ratioB
      });
      setEditingRatios(prev => {
        const next = { ...prev };
        delete next[matchId];
        return next;
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `matches/${matchId}`);
    }
  };

  if (!isAuthReady) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center p-4 font-sans text-white">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md bg-[#1e293b] rounded-3xl p-8 shadow-2xl border border-white/5"
        >
          <div className="text-center mb-8">
            <div className="bg-orange-500 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-orange-500/20">
              <Trophy className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight">Chota Bheem Predicts</h1>
            <p className="text-slate-400 mt-2">Enter your credentials to start predicting</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1 uppercase tracking-wider">Username</label>
              <input
                type="text"
                value={loginForm.username}
                onChange={(e) => setLoginForm({...loginForm, username: e.target.value})}
                className="w-full bg-[#0f172a] border border-slate-700 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-orange-500 transition-all"
                placeholder="Enter your username"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1 uppercase tracking-wider">Password</label>
              <input
                type="password"
                value={loginForm.password}
                onChange={(e) => setLoginForm({...loginForm, password: e.target.value})}
                className="w-full bg-[#0f172a] border border-slate-700 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-orange-500 transition-all"
                placeholder="••••••••"
                required
              />
            </div>

            {loginError && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs p-3 rounded-lg flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                {loginError}
              </div>
            )}

            <button
              type="submit"
              className="w-full bg-orange-600 text-white hover:bg-orange-500 py-3.5 rounded-xl font-bold transition-all flex items-center justify-center gap-3 shadow-lg shadow-orange-600/20 mt-6"
            >
              <LogIn className="w-5 h-5" />
              Sign In
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f172a] font-sans text-white pb-20">
      {/* Navigation */}
      <nav className="bg-[#1e293b]/80 backdrop-blur-md sticky top-0 z-50 border-b border-white/5">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => setView("dashboard")}>
            <Trophy className="w-6 h-6 text-orange-500" />
            <span className="font-bold text-xl tracking-tight hidden sm:block">Chota Bheem Predicts</span>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="bg-[#0f172a] px-4 py-1.5 rounded-full flex items-center gap-2 border border-white/5">
              <Coins className="w-4 h-4 text-yellow-500" />
              <span className="font-bold text-yellow-500">{user.coins}</span>
            </div>
            
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setView("settings")}
                className={`p-2 transition-colors ${view === 'settings' ? 'text-orange-500' : 'text-slate-400 hover:text-white'}`}
                title="Settings"
              >
                <Settings className="w-5 h-5" />
              </button>
              <button 
                onClick={handleLogout}
                className="p-2 text-slate-400 hover:text-white transition-colors"
                title="Logout"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* View Switcher */}
        <div className="flex gap-2 mb-8 bg-[#1e293b] p-1 rounded-xl w-fit border border-white/5">
          <button 
            onClick={() => setView("dashboard")}
            className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${view === 'dashboard' ? 'bg-orange-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
          >
            Matches
          </button>
          <button 
            onClick={() => setView("history")}
            className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${view === 'history' ? 'bg-orange-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
          >
            My History
          </button>
          {(user.role === 'admin' || user.email === 'admin@chotabheem.app' || user.email === 'pranay.02042008@gmail.com') && (
            <button 
              onClick={() => setView("admin")}
              className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${view === 'admin' ? 'bg-orange-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
            >
              Admin
            </button>
          )}
        </div>

        <AnimatePresence mode="wait">
          {view === "dashboard" && (
            <motion.div 
              key="dashboard"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
            >
              {matches.filter(m => m.status !== "completed").length === 0 ? (
                <div className="col-span-full text-center py-20 bg-[#1e293b] rounded-3xl border border-dashed border-white/10">
                  <Clock className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                  <p className="text-slate-400">No active matches at the moment.</p>
                </div>
              ) : (
                matches.filter(m => m.status !== "completed").map((match) => (
                  <MatchCard 
                    key={match.id} 
                    match={match} 
                    onPredict={handlePredict} 
                    matchPredictions={predictions.filter(p => p.matchId === match.id)}
                  />
                ))
              )}
            </motion.div>
          )}

          {view === "history" && (
            <motion.div 
              key="history"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-4"
            >
              <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
                <History className="w-6 h-6 text-orange-500" />
                Prediction History
              </h2>
              {predictions.length === 0 ? (
                <div className="text-center py-20 bg-[#1e293b] rounded-3xl border border-dashed border-white/10">
                  <TrendingUp className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                  <p className="text-slate-400">You haven't made any predictions yet.</p>
                </div>
              ) : (
                predictions.map((pred) => {
                  const match = matches.find(m => m.id === pred.matchId);
                  return (
                    <div key={pred.id} className="bg-[#1e293b] rounded-2xl p-6 border border-white/5 flex items-center justify-between gap-4">
                      <div className="flex-1">
                        <div className="text-xs text-slate-500 mb-1 uppercase tracking-wider font-bold">
                          {match ? `${match.teamA} vs ${match.teamB}` : "Unknown Match"}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-lg">Predicted {pred.team === 'teamA' ? match?.teamA : match?.teamB}</span>
                          <span className="text-slate-500 text-sm">• {pred.amount} coins</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`text-sm font-bold px-3 py-1 rounded-full inline-block ${
                          pred.status === 'won' ? 'bg-green-500/20 text-green-400' :
                          pred.status === 'lost' ? 'bg-red-500/20 text-red-400' :
                          pred.status === 'refunded' ? 'bg-slate-500/20 text-slate-400' :
                          'bg-yellow-500/20 text-yellow-400'
                        }`}>
                          {pred.status === 'won' ? `+${pred.winnings}` : pred.status.toUpperCase()}
                        </div>
                        <div className="text-[10px] text-slate-500 mt-1">
                          {pred.createdAt?.toDate ? pred.createdAt.toDate().toLocaleDateString() : "Recently"}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </motion.div>
          )}

          {view === "settings" && (
            <motion.div 
              key="settings"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="max-w-2xl mx-auto"
            >
              <div className="bg-[#1e293b] rounded-3xl p-8 border border-white/5 shadow-2xl">
                <div className="flex items-center gap-4 mb-8">
                  <div className="bg-orange-500/10 p-3 rounded-2xl">
                    <Settings className="w-8 h-8 text-orange-500" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold">Account Settings</h2>
                    <p className="text-slate-400 text-sm">Manage your profile and preferences</p>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-[#0f172a] p-4 rounded-2xl border border-white/5">
                      <p className="text-xs text-slate-500 uppercase font-bold mb-1">Username</p>
                      <p className="font-bold">{user.username}</p>
                    </div>
                    <div className="bg-[#0f172a] p-4 rounded-2xl border border-white/5">
                      <p className="text-xs text-slate-500 uppercase font-bold mb-1">Role</p>
                      <p className="font-bold capitalize">{user.role}</p>
                    </div>
                  </div>

                  <div className="bg-[#0f172a] p-4 rounded-2xl border border-white/5">
                    <p className="text-xs text-slate-500 uppercase font-bold mb-1">Email Address</p>
                    <p className="font-bold">{user.email}</p>
                  </div>

                  <div className="pt-6 border-t border-white/5">
                    <h3 className="font-bold mb-4 text-slate-300">Security</h3>
                    <div className="bg-orange-500/5 border border-orange-500/10 p-4 rounded-xl">
                      <p className="text-xs text-slate-400 mb-3">To change your password, please contact the system administrator or use the Firebase console if you have access.</p>
                      <button 
                        onClick={() => alert("Password reset functionality is managed by the system admin.")}
                        className="text-sm bg-orange-600 hover:bg-orange-500 text-white px-4 py-2 rounded-lg font-bold transition-all"
                      >
                        Request Password Reset
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {view === "admin" && (user.role === "admin" || user.email === "admin@chotabheem.app" || user.email === "pranay.02042008@gmail.com") && (
            <motion.div 
              key="admin"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="grid grid-cols-1 lg:grid-cols-3 gap-8"
            >
              <div className="space-y-8">
                {/* Create Match */}
                <div className="bg-[#1e293b] rounded-2xl p-6 border border-white/5">
                  <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
                    <Plus className="w-5 h-5 text-orange-500" />
                    Create New Match
                  </h3>
                  <form onSubmit={handleAddMatch} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1 uppercase">Team A</label>
                        <input
                          type="text"
                          value={newMatch.teamA}
                          onChange={(e) => setNewMatch({...newMatch, teamA: e.target.value})}
                          className="w-full bg-[#0f172a] border border-slate-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-orange-500"
                          placeholder="Team A Name"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1 uppercase">Team B</label>
                        <input
                          type="text"
                          value={newMatch.teamB}
                          onChange={(e) => setNewMatch({...newMatch, teamB: e.target.value})}
                          className="w-full bg-[#0f172a] border border-slate-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-orange-500"
                          placeholder="Team B Name"
                          required
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1 uppercase">Ratio A (x)</label>
                        <input
                          type="number"
                          step="0.1"
                          value={newMatch.ratioA}
                          onChange={(e) => setNewMatch({...newMatch, ratioA: parseFloat(e.target.value)})}
                          className="w-full bg-[#0f172a] border border-slate-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-orange-500"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1 uppercase">Ratio B (x)</label>
                        <input
                          type="number"
                          step="0.1"
                          value={newMatch.ratioB}
                          onChange={(e) => setNewMatch({...newMatch, ratioB: parseFloat(e.target.value)})}
                          className="w-full bg-[#0f172a] border border-slate-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-orange-500"
                          required
                        />
                      </div>
                    </div>
                    <button
                      type="submit"
                      disabled={isCreatingMatch}
                      className="w-full bg-orange-600 hover:bg-orange-500 disabled:opacity-50 py-2.5 rounded-lg font-semibold transition-colors mt-2"
                    >
                      {isCreatingMatch ? "Adding..." : "Add Match"}
                    </button>
                  </form>
                </div>

                {/* Add New User */}
                <div className="bg-[#1e293b] rounded-2xl p-6 border border-white/5">
                  <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
                    <Plus className="w-5 h-5 text-green-500" />
                    Add New User
                  </h3>
                  <form onSubmit={handleCreateUser} className="space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1 uppercase">Username</label>
                      <input
                        type="text"
                        value={newUser.username}
                        onChange={(e) => setNewUser({...newUser, username: e.target.value})}
                        className="w-full bg-[#0f172a] border border-slate-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-orange-500"
                        placeholder="New Username"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1 uppercase">Password</label>
                      <input
                        type="password"
                        value={newUser.password}
                        onChange={(e) => setNewUser({...newUser, password: e.target.value})}
                        className="w-full bg-[#0f172a] border border-slate-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-orange-500"
                        placeholder="New Password (min 6 chars)"
                        required
                        minLength={6}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1 uppercase">Initial Coins</label>
                      <input
                        type="number"
                        value={newUser.initialCoins}
                        onChange={(e) => setNewUser({...newUser, initialCoins: parseInt(e.target.value)})}
                        className="w-full bg-[#0f172a] border border-slate-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-orange-500"
                        required
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={isCreatingUser}
                      className="w-full bg-green-600 hover:bg-green-500 disabled:opacity-50 py-2.5 rounded-lg font-semibold transition-colors mt-2"
                    >
                      {isCreatingUser ? "Creating..." : "Create User"}
                    </button>
                  </form>
                </div>

                {/* Manage Users */}
                <div className="bg-[#1e293b] rounded-2xl p-6 border border-white/5">
                  <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
                    <User className="w-5 h-5 text-yellow-500" />
                    Manage Users
                  </h3>
                  <form onSubmit={handleUpdateCoins} className="space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1 uppercase">Select User</label>
                      <select
                        value={coinUpdate.userId}
                        onChange={(e) => setCoinUpdate({...coinUpdate, userId: e.target.value})}
                        className="w-full bg-[#0f172a] border border-slate-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-orange-500"
                        required
                      >
                        <option value="">Select a user</option>
                        {allUsers.map(u => (
                          <option key={u.id} value={u.id}>{u.username} ({u.coins} coins)</option>
                        ))}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1 uppercase">Amount</label>
                        <input
                          type="number"
                          value={coinUpdate.amount}
                          onChange={(e) => setCoinUpdate({...coinUpdate, amount: parseInt(e.target.value)})}
                          className="w-full bg-[#0f172a] border border-slate-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-orange-500"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1 uppercase">Action</label>
                        <select
                          value={coinUpdate.action}
                          onChange={(e) => setCoinUpdate({...coinUpdate, action: e.target.value as any})}
                          className="w-full bg-[#0f172a] border border-slate-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-orange-500"
                        >
                          <option value="add">Add</option>
                          <option value="deduct">Deduct</option>
                        </select>
                      </div>
                    </div>
                    <button
                      type="submit"
                      className="w-full bg-yellow-600 hover:bg-yellow-500 py-2.5 rounded-lg font-semibold transition-colors mt-2"
                    >
                      Update Coins
                    </button>
                  </form>
                </div>
              </div>

              {/* Match Management List */}
              <div className="lg:col-span-2 space-y-6">
                <h3 className="text-xl font-bold">Manage Active Matches</h3>
                <div className="space-y-4">
                  {matches.filter(m => m.status !== "completed").map((match) => (
                    <div key={match.id} className="bg-[#1e293b] rounded-2xl p-6 border border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                      <div className="flex-1">
                        <div className="flex items-center gap-4 mb-2">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${match.status === 'open' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                            {match.status}
                          </span>
                          <span className="text-slate-500 text-xs">
                            {match.createdAt?.toDate ? match.createdAt.toDate().toLocaleDateString() : "Recently"}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-lg font-bold">{match.teamA}</span>
                          <span className="text-slate-500 text-sm italic">vs</span>
                          <span className="text-lg font-bold">{match.teamB}</span>
                        </div>
                        <div className="text-xs text-slate-400 mt-1 flex items-center gap-2">
                          Ratios: 
                          {editingRatios[match.id] ? (
                            <div className="flex items-center gap-2">
                              <input 
                                type="number" 
                                step="0.1" 
                                value={editingRatios[match.id].ratioA}
                                onChange={(e) => setEditingRatios({...editingRatios, [match.id]: {...editingRatios[match.id], ratioA: parseFloat(e.target.value)}})}
                                className="w-16 bg-[#0f172a] border border-slate-700 rounded px-1 py-0.5 text-[10px] outline-none focus:ring-1 focus:ring-orange-500"
                              />
                              <span>/</span>
                              <input 
                                type="number" 
                                step="0.1" 
                                value={editingRatios[match.id].ratioB}
                                onChange={(e) => setEditingRatios({...editingRatios, [match.id]: {...editingRatios[match.id], ratioB: parseFloat(e.target.value)}})}
                                className="w-16 bg-[#0f172a] border border-slate-700 rounded px-1 py-0.5 text-[10px] outline-none focus:ring-1 focus:ring-orange-500"
                              />
                              <button 
                                onClick={() => handleUpdateRatio(match.id)}
                                className="text-green-500 hover:text-green-400 font-bold ml-1"
                              >
                                Save
                              </button>
                              <button 
                                onClick={() => setEditingRatios(prev => {
                                  const next = {...prev};
                                  delete next[match.id];
                                  return next;
                                })}
                                className="text-slate-500 hover:text-slate-400 ml-1"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <>
                              {match.ratioA}x / {match.ratioB}x
                              <button 
                                onClick={() => setEditingRatios({...editingRatios, [match.id]: {ratioA: match.ratioA, ratioB: match.ratioB}})}
                                className="ml-2 text-orange-500 hover:text-orange-400 underline"
                              >
                                Edit
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex flex-wrap gap-2">
                        {match.status === "open" && (
                          <button 
                            onClick={() => handleCloseMatch(match.id)}
                            className="px-4 py-2 bg-red-600/20 text-red-400 hover:bg-red-600/30 rounded-lg text-sm font-medium transition-colors"
                          >
                            Close Predictions
                          </button>
                        )}
                        {match.status === "closed" && (
                          <>
                            <button 
                              onClick={() => handleDeclareWinner(match.id, "teamA")}
                              className="px-4 py-2 bg-green-600/20 text-green-400 hover:bg-green-600/30 rounded-lg text-sm font-medium transition-colors"
                            >
                              Winner: {match.teamA}
                            </button>
                            <button 
                              onClick={() => handleDeclareWinner(match.id, "teamB")}
                              className="px-4 py-2 bg-green-600/20 text-green-400 hover:bg-green-600/30 rounded-lg text-sm font-medium transition-colors"
                            >
                              Winner: {match.teamB}
                            </button>
                            <button 
                              onClick={() => handleDeclareWinner(match.id, "none")}
                              className="px-4 py-2 bg-slate-600/20 text-slate-400 hover:bg-slate-600/30 rounded-lg text-sm font-medium transition-colors"
                            >
                              No Result
                            </button>
                          </>
                        )}
                        <button 
                          onClick={() => handleDeleteMatch(match.id)}
                          className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                          title="Delete Match"
                        >
                          <XCircle className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* User Insights */}
              <div className="lg:col-span-3 mt-8">
                <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
                  <TrendingUp className="w-6 h-6 text-orange-500" />
                  User Insights & Activity
                </h3>
                <div className="bg-[#1e293b] rounded-2xl border border-white/5 overflow-hidden shadow-2xl">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-[#0f172a] border-b border-white/5">
                          <th className="p-4 text-xs font-bold uppercase text-slate-500">User</th>
                          <th className="p-4 text-xs font-bold uppercase text-slate-500">Coins Left</th>
                          <th className="p-4 text-xs font-bold uppercase text-slate-500">Active Bets</th>
                          <th className="p-4 text-xs font-bold uppercase text-slate-500">Total Winnings</th>
                          <th className="p-4 text-xs font-bold uppercase text-slate-500">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {userStats.map(u => (
                          <tr key={u.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                            <td className="p-4">
                              <div className="font-bold">{u.username}</div>
                              <div className="text-xs text-slate-500">{u.email}</div>
                            </td>
                            <td className="p-4">
                              <div className="flex items-center gap-1 font-bold text-yellow-500">
                                <Coins className="w-4 h-4" />
                                {u.coins}
                              </div>
                            </td>
                            <td className="p-4 font-bold text-slate-300">{u.activeCount}</td>
                            <td className="p-4 font-bold text-green-500">+{u.totalWinnings}</td>
                            <td className="p-4">
                              <button 
                                onClick={() => setSelectedUserForHistory(u.id)}
                                className="text-xs bg-orange-600/20 text-orange-500 hover:bg-orange-600/30 px-3 py-1.5 rounded-lg font-bold transition-all"
                              >
                                View History
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* User History Modal Overlay */}
              {selectedUserForHistory && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                  <motion.div 
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="bg-[#1e293b] w-full max-w-4xl max-h-[80vh] rounded-3xl border border-white/10 flex flex-col overflow-hidden shadow-2xl"
                  >
                    <div className="p-6 border-b border-white/5 flex items-center justify-between bg-[#0f172a]">
                      <div>
                        <h3 className="text-xl font-bold">
                          Activity History: {userStats.find(u => u.id === selectedUserForHistory)?.username}
                        </h3>
                        <p className="text-xs text-slate-500">Full prediction history and performance</p>
                      </div>
                      <button 
                        onClick={() => setSelectedUserForHistory(null)}
                        className="p-2 hover:bg-white/10 rounded-full transition-all"
                      >
                        <XCircle className="w-6 h-6 text-slate-400" />
                      </button>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto p-6 bg-[#1e293b]">
                      <div className="space-y-4">
                        {userStats.find(u => u.id === selectedUserForHistory)?.predictions.length === 0 ? (
                          <div className="text-center py-12 text-slate-500">No prediction history found.</div>
                        ) : (
                          userStats.find(u => u.id === selectedUserForHistory)?.predictions
                            .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
                            .map(pred => (
                              <div key={pred.id} className="bg-[#0f172a] p-4 rounded-2xl border border-white/5 flex items-center justify-between gap-4">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                      pred.status === 'won' ? 'bg-green-500/20 text-green-400' : 
                                      pred.status === 'lost' ? 'bg-red-500/20 text-red-400' : 
                                      'bg-slate-500/20 text-slate-400'
                                    }`}>
                                      {pred.status}
                                    </span>
                                    <span className="text-[10px] text-slate-500">
                                      {pred.createdAt?.toDate ? pred.createdAt.toDate().toLocaleString() : "Recently"}
                                    </span>
                                  </div>
                                  <div className="font-bold text-sm">
                                    {pred.match ? `${pred.match.teamA} vs ${pred.match.teamB}` : "Unknown Match"}
                                  </div>
                                  <div className="text-xs text-slate-400">
                                    Predicted: <span className="text-orange-500 font-bold">{pred.team === 'teamA' ? pred.match?.teamA : pred.match?.teamB}</span>
                                  </div>
                                </div>
                                <div className="text-right">
                                  <div className="text-xs text-slate-500">Bet: {pred.amount}</div>
                                  {pred.status === 'won' && <div className="text-green-500 font-bold">+{pred.winnings}</div>}
                                  {pred.status === 'lost' && <div className="text-red-500 font-bold">-{pred.amount}</div>}
                                </div>
                              </div>
                            ))
                        )}
                      </div>
                    </div>
                  </motion.div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

function MatchCard({ match, onPredict, matchPredictions }: any) {
  const [amount, setAmount] = useState(10);
  const [selectedTeam, setSelectedTeam] = useState<"teamA" | "teamB">("teamA");
  const hasPredicted = matchPredictions && matchPredictions.length > 0;

  return (
    <div className="bg-[#1e293b] rounded-3xl p-6 border border-white/5 shadow-xl hover:shadow-orange-500/5 transition-all">
      <div className="flex justify-between items-start mb-6">
        <div className="flex flex-col gap-1">
          <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider w-fit ${match.status === 'open' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
            {match.status}
          </span>
          {hasPredicted && (
            <span className="text-[10px] font-bold text-orange-500 bg-orange-500/10 px-2 py-0.5 rounded-full w-fit">
              {matchPredictions.length} {matchPredictions.length === 1 ? 'Prediction' : 'Predictions'} Placed
            </span>
          )}
        </div>
        <span className="text-slate-500 text-xs flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {match.createdAt?.toDate ? match.createdAt.toDate().toLocaleDateString() : "Recently"}
        </span>
      </div>

      <div className="flex items-center justify-between gap-4 mb-8">
        <div className="text-center flex-1">
          <div className="w-12 h-12 bg-[#0f172a] rounded-2xl flex items-center justify-center mx-auto mb-2 border border-white/5">
            <span className="text-xl font-bold text-orange-500">{match.teamA[0]}</span>
          </div>
          <div className="font-bold text-sm truncate">{match.teamA}</div>
          <div className="text-orange-500 font-bold mt-1">{match.ratioA}x</div>
        </div>
        <div className="text-slate-600 font-black italic text-xl">VS</div>
        <div className="text-center flex-1">
          <div className="w-12 h-12 bg-[#0f172a] rounded-2xl flex items-center justify-center mx-auto mb-2 border border-white/5">
            <span className="text-xl font-bold text-orange-500">{match.teamB[0]}</span>
          </div>
          <div className="font-bold text-sm truncate">{match.teamB}</div>
          <div className="text-orange-500 font-bold mt-1">{match.ratioB}x</div>
        </div>
      </div>

      {match.status === "open" ? (
        <div className="space-y-4">
          <div className="flex gap-2 p-1 bg-[#0f172a] rounded-xl border border-white/5">
            <button 
              onClick={() => setSelectedTeam("teamA")}
              className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${selectedTeam === 'teamA' ? 'bg-orange-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
            >
              {match.teamA}
            </button>
            <button 
              onClick={() => setSelectedTeam("teamB")}
              className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${selectedTeam === 'teamB' ? 'bg-orange-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
            >
              {match.teamB}
            </button>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="flex-1 relative">
              <Coins className="w-4 h-4 text-yellow-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input 
                type="number" 
                value={amount}
                onChange={(e) => setAmount(Math.max(1, parseInt(e.target.value) || 0))}
                className="w-full bg-[#0f172a] border border-slate-700 rounded-xl pl-9 pr-4 py-2 text-sm outline-none focus:ring-1 focus:ring-orange-500"
              />
            </div>
            <button 
              onClick={() => onPredict(match.id, selectedTeam, amount)}
              className="bg-orange-600 hover:bg-orange-500 px-6 py-2 rounded-xl font-bold text-sm transition-all shadow-lg shadow-orange-600/20"
            >
              Predict
            </button>
          </div>
        </div>
      ) : (
        <div className="text-center py-3 bg-[#0f172a] rounded-xl border border-white/5">
          <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">
            Predictions Closed
          </p>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}
