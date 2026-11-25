import { useEffect, useRef, useState } from "react";
import {
  Home as HomeIcon,
  Trophy,
  Settings,
  User,
  LogOut,
  Play,
  RotateCcw,
  Medal,
  LoaderCircle,
  Lock,
  Mail,
  Crown,
  Gem,
  Award,
  LogIn,
} from "lucide-react";

import { motion, AnimatePresence } from "framer-motion";

import {
  auth,
  subscribeAuth,
  registerUser,
  loginUser,
  logoutUser,
  getProfile,
  updateProfile,
  submitScore,
  getLeaderboard,
  getMyRank,
  type Profile,
  type Score,
  getTotalPlayers,
} from "./firebase";

import {
  requestMotionPermission,
  startShakeDetection,
  stopShakeDetection,
} from "./shakes";

type Page = "home" | "ranks" | "settings";
type AuthMode = "login" | "register";

export default function App() {
  const [user, setUser] = useState(auth.currentUser);
  const [profile, setProfile] = useState<Profile | null>(null);

  const [page, setPage] = useState<Page>("home");
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [showAuthModal, setShowAuthModal] = useState(false);

  const [loading, setLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);
  const [message, setMessage] = useState("");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [photoURL, setPhotoURL] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedPlayer, setSelectedPlayer] = useState<Score | null>(null);

  const [count, setCount] = useState(0);
  const [time, setTime] = useState(60);
  const [running, setRunning] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [motionError, setMotionError] = useState("");

  const [animationKey, setAnimationKey] = useState(0);

  const [leaderboard, setLeaderboard] = useState<Score[]>([]);
  const [myRank, setMyRank] = useState<number | null>(null);
  const [rankLoading, setRankLoading] = useState(false);

  const [saving, setSaving] = useState(false);

  const authUidRef = useRef<string | null>(auth.currentUser?.uid ?? null);
  const challengeOwnerRef = useRef<string | null>(null);
  const savingScoreRef = useRef(false);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const [totalPlayers, setTotalPlayers] = useState(0);

  function unlockAudioContext() {
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioCtx) return;

      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioCtx();
      }
      if (audioCtxRef.current.state === "suspended") {
        audioCtxRef.current.resume().catch(() => {});
      }
    } catch {
      // Ignore if AudioContext is unavailable
    }
  }

  function triggerFinishFeedback() {
    // 1. Phone vibration (supported on Android browsers)
    try {
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        navigator.vibrate([300, 120, 450]);
      }
    } catch {
      // Ignore on unsupported devices
    }

    // 2. Crisp 3-tone finish chime (works on both iOS & Android)
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioCtx) return;

      const ctx = audioCtxRef.current ?? new AudioCtx();
      audioCtxRef.current = ctx;

      if (ctx.state === "suspended") {
        ctx.resume().catch(() => {});
      }

      const now = ctx.currentTime;
      const notesHz = [523.25, 659.25, 783.99]; // C5, E5, G5

      notesHz.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = "triangle";
        osc.frequency.setValueAtTime(freq, now + idx * 0.14);

        gain.gain.setValueAtTime(0.001, now + idx * 0.14);
        gain.gain.exponentialRampToValueAtTime(0.35, now + idx * 0.14 + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.14 + 0.35);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + idx * 0.14);
        osc.stop(now + idx * 0.14 + 0.36);
      });
    } catch {
      // Ignore audio errors
    }
  }

  useEffect(() => {
    const unsubscribe = subscribeAuth(async (currentUser) => {
      const nextUid = currentUser?.uid ?? null;
      const accountChanged = authUidRef.current !== nextUid;

      authUidRef.current = nextUid;
      setUser(currentUser);

      if (accountChanged) {
        stopShakeDetection();

        challengeOwnerRef.current = null;
        savingScoreRef.current = false;

        setCount(0);
        setTime(60);
        setRunning(false);
        setCompleted(false);
        setMotionError("");
        setMessage("");

        setMyRank(null);
        setSelectedPlayer(null);

        setNotes("");
        setUsername("");
        setPhotoURL("");
        setProfile(null);
      }

      if (currentUser) {
        setShowAuthModal(false);
        try {
          const data = await getProfile(currentUser.uid);

          if (authUidRef.current === currentUser.uid) {
            setProfile(data);
            setNotes(data?.notes || "");
            setUsername(data?.username || "");
            setPhotoURL(data?.photoURL || "");
          }
        } catch (error) {
          console.error(error);

          if (authUidRef.current === currentUser.uid) {
            setProfile(null);
          }
        }
      } else {
        setProfile(null);
      }

      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    return () => stopShakeDetection();
  }, []);

  useEffect(() => {
    if (!running) return;

    const timer = window.setInterval(() => {
      setTime((previous) => {
        if (previous <= 1) {
          window.clearInterval(timer);
          setRunning(false);
          setCompleted(true);
          stopShakeDetection();
          triggerFinishFeedback();
          return 0;
        }

        return previous - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [running]);

  useEffect(() => {
    if (!completed || !user || count <= 0) return;

    const submittedUid = challengeOwnerRef.current;
    const submittedScore = count;

    if (
      !submittedUid ||
      submittedUid !== user.uid ||
      auth.currentUser?.uid !== submittedUid ||
      authUidRef.current !== submittedUid ||
      savingScoreRef.current
    ) {
      return;
    }

    savingScoreRef.current = true;

    submitScore(submittedUid, submittedScore)
      .then((result) => {
        if (
          auth.currentUser?.uid !== submittedUid ||
          authUidRef.current !== submittedUid
        ) {
          return;
        }

        if (result.saved) {
          setMessage(
            `বাহ! আপনি নিজের আগের রেকর্ড ভেঙেছেন। নতুন স্কোর: ${submittedScore}`
          );
        } else {
          setMessage(
            `আপনার আগের স্কোর ${result.previousBest} ছিল। এইবারের স্কোর তার চেয়ে কম বা সমান, তাই সেভ হয়নি। আরও জোরে চেষ্টা করুন!`
          );
        }
      })
      .catch((error) => {
        console.error("SCORE SAVE ERROR:", error);

        if (
          auth.currentUser?.uid !== submittedUid ||
          authUidRef.current !== submittedUid
        ) {
          return;
        }

        setMessage(
          error instanceof Error
            ? error.message
            : "স্কোর সেভ করা সম্ভব হয়নি। আবার চেষ্টা করুন।"
        );
      })
      .finally(() => {
        savingScoreRef.current = false;
      });
  }, [completed, user, count]);

  async function loadRanks() {
    setRankLoading(true);

    try {
      const scores = await getLeaderboard();
      setLeaderboard(scores);
    } catch (error) {
      console.error("Leaderboard error:", error);
    }

    try {
      const rank = user ? await getMyRank(user.uid) : null;
      setMyRank(rank);
    } catch (error) {
      console.error("Rank error:", error);
    }

    try {
      const total = await getTotalPlayers();
      setTotalPlayers(total);
    } catch (error) {
      console.error("Total players error:", error);
    }

    setRankLoading(false);
  }

  useEffect(() => {
    if (!user || page === "ranks") {
      loadRanks();
    }
  }, [page, user]);

  async function handleAuth(e: React.FormEvent) {
    e.preventDefault();
    setAuthLoading(true);
    setMessage("");

    try {
      if (authMode === "register") {
        await registerUser(email, password, username, photoURL);
      } else {
        await loginUser(email, password);
      }
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Authentication failed."
      );
    } finally {
      setAuthLoading(false);
    }
  }

  async function startChallenge() {
    if (!user || running) return;

    // Unlock mobile browser audio during user tap gesture
    unlockAudioContext();
    setMotionError("");

    const allowed = await requestMotionPermission();

    if (!allowed) {
      setMotionError(
        "Motion sensor permission denied or not supported. Try HTTPS Safari or Chrome."
      );
      return;
    }

    setCount(0);
    setTime(60);
    setCompleted(false);
    setMessage("");

    savingScoreRef.current = false;
    challengeOwnerRef.current = user.uid;

    setRunning(true);

    startShakeDetection(() => {
      setCount((previous) => previous + 1);
      setAnimationKey((previous) => previous + 1);
    });
  }

  function resetChallenge() {
    stopShakeDetection();

    challengeOwnerRef.current = null;
    savingScoreRef.current = false;

    setRunning(false);
    setCompleted(false);
    setCount(0);
    setTime(60);
    setMotionError("");
    setMessage("");
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();

    if (!user || !profile) return;

    setSaving(true);
    setMessage("");

    try {
      await updateProfile(
        user.uid,
        profile.username,
        username,
        photoURL,
        notes
      );

      const updated = await getProfile(user.uid);

      setProfile(updated);
      setMessage("Profile updated successfully!");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Profile update failed."
      );
    } finally {
      setSaving(false);
    }
  }

  function renderTopBadge(index: number) {
    if (index === 0) {
      return (
        <span
          title="1st Place - Diamond"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 4,
            padding: "3px 8px",
            borderRadius: 999,
            background: "linear-gradient(135deg, #38bdf8, #818cf8)",
            color: "#090d16",
            fontWeight: 800,
            fontSize: 12,
            boxShadow: "0 0 12px rgba(56, 189, 248, 0.45)",
          }}
        >
          <Gem size={14} /> #1
        </span>
      );
    }

    if (index === 1) {
      return (
        <span
          title="2nd Place - Gold"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 4,
            padding: "3px 8px",
            borderRadius: 999,
            background: "linear-gradient(135deg, #facc15, #f59e0b)",
            color: "#1a1200",
            fontWeight: 800,
            fontSize: 12,
            boxShadow: "0 0 10px rgba(250, 204, 21, 0.35)",
          }}
        >
          <Crown size={14} /> #2
        </span>
      );
    }

    if (index === 2) {
      return (
        <span
          title="3rd Place - Bronze"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 4,
            padding: "3px 8px",
            borderRadius: 999,
            background: "linear-gradient(135deg, #fb923c, #b45309)",
            color: "#fff7ed",
            fontWeight: 800,
            fontSize: 12,
            boxShadow: "0 0 10px rgba(251, 146, 60, 0.3)",
          }}
        >
          <Award size={14} /> #3
        </span>
      );
    }

    return <span className="rank-number">#{index + 1}</span>;
  }

  function getTopRowStyle(index: number): React.CSSProperties | undefined {
    if (index === 0) {
      return {
        border: "1px solid rgba(56, 189, 248, 0.45)",
        background:
          "linear-gradient(90deg, rgba(56,189,248,0.12), rgba(129,140,248,0.06))",
      };
    }
    if (index === 1) {
      return {
        border: "1px solid rgba(250, 204, 21, 0.4)",
        background:
          "linear-gradient(90deg, rgba(250,204,21,0.10), rgba(245,158,11,0.04))",
      };
    }
    if (index === 2) {
      return {
        border: "1px solid rgba(251, 146, 60, 0.35)",
        background:
          "linear-gradient(90deg, rgba(251,146,60,0.10), rgba(180,83,9,0.04))",
      };
    }
    return undefined;
  }

  if (loading) {
    return (
      <div className="loading-screen">
        <LoaderCircle className="spin" size={35} />
        <h2>HILANE WALA</h2>
      </div>
    );
  }

  if (!user) {
    const first = leaderboard[0];
    const second = leaderboard[1];
    const third = leaderboard[2];

    const podiumSlots = [
      {
        place: 2,
        label: "GOLD",
        player: second,
        height: 112,
        accent: "#facc15",
        bg: "linear-gradient(180deg, rgba(250,204,21,0.24) 0%, rgba(250,204,21,0.06) 100%)",
        icon: <Crown size={18} color="#facc15" />,
      },
      {
        place: 1,
        label: "DIAMOND",
        player: first,
        height: 148,
        accent: "#38bdf8",
        bg: "linear-gradient(180deg, rgba(56,189,248,0.28) 0%, rgba(129,140,248,0.08) 100%)",
        icon: <Gem size={20} color="#38bdf8" />,
      },
      {
        place: 3,
        label: "BRONZE",
        player: third,
        height: 92,
        accent: "#fb923c",
        bg: "linear-gradient(180deg, rgba(251,146,60,0.22) 0%, rgba(180,83,9,0.06) 100%)",
        icon: <Award size={18} color="#fb923c" />,
      },
    ];

    return (
      <div className="app">
        <header className="topbar">
          <div className="brand">
            HILANE <span>WALA</span>
          </div>

          <button
            type="button"
            onClick={() => {
              setAuthMode("login");
              setMessage("");
              setShowAuthModal(true);
            }}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 14px",
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.16)",
              background: "rgba(255,255,255,0.08)",
              color: "#fff",
              fontWeight: 600,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            <LogIn size={15} /> Login
          </button>
        </header>

        <main className="home-page" style={{ paddingBottom: 40 }}>
          <div className="challenge-heading">
            <span className="eyebrow">Kaun Banega</span>
            <h1>Best Hilane Wala</h1>
            <h3>জোরে ঝাঁকাও, দুনিয়া কাঁপাও.</h3>
          </div>

          <section
            className="challenge-card"
            style={{ paddingTop: 22, paddingBottom: 22 }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                width: "100%",
                marginBottom: 14,
              }}
            >
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: 1,
                  opacity: 0.85,
                }}
              >
                <Trophy size={15} /> TOP 3 PODIUM
              </span>

              <span style={{ fontSize: 12, opacity: 0.65 }}>
                {totalPlayers > 0 ? `${totalPlayers} Players` : "Live Champions"}
              </span>
            </div>

            {rankLoading ? (
              <div style={{ padding: "36px 0" }}>
                <LoaderCircle className="spin" size={28} />
              </div>
            ) : leaderboard.length === 0 ? (
              <p className="muted" style={{ padding: "24px 0" }}>
                No champions yet. Login and claim the #1 podium!
              </p>
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1.12fr 1fr",
                  alignItems: "flex-end",
                  gap: 10,
                  width: "100%",
                  marginTop: 8,
                }}
              >
                {podiumSlots.map((slot) => (
                  <div
                    key={slot.place}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                    }}
                  >
                    <div
                      style={{
                        position: "relative",
                        marginBottom: 8,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                      }}
                    >
                      <div style={{ marginBottom: 4 }}>{slot.icon}</div>
                      {slot.player?.photoURL ? (
                        <img
                          src={slot.player.photoURL}
                          alt={slot.player.username}
                          style={{
                            width: slot.place === 1 ? 58 : 46,
                            height: slot.place === 1 ? 58 : 46,
                            borderRadius: "50%",
                            objectFit: "cover",
                            border: `2px solid ${slot.accent}`,
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            width: slot.place === 1 ? 58 : 46,
                            height: slot.place === 1 ? 58 : 46,
                            borderRadius: "50%",
                            display: "grid",
                            placeItems: "center",
                            background: "rgba(255,255,255,0.08)",
                            border: `2px solid ${slot.accent}`,
                          }}
                        >
                          <User size={slot.place === 1 ? 24 : 20} />
                        </div>
                      )}
                    </div>

                    <strong
                      style={{
                        fontSize: slot.place === 1 ? 13 : 12,
                        maxWidth: 92,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        marginBottom: 6,
                      }}
                    >
                      {slot.player ? slot.player.username : "---"}
                    </strong>

                    <div
                      style={{
                        width: "100%",
                        height: slot.height,
                        borderRadius: "14px 14px 8px 8px",
                        background: slot.bg,
                        border: `1px solid ${slot.accent}55`,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: "8px 4px",
                      }}
                    >
                      <span
                        style={{
                          fontSize: slot.place === 1 ? 22 : 18,
                          fontWeight: 900,
                          color: slot.accent,
                          lineHeight: 1.1,
                        }}
                      >
                        #{slot.place}
                      </span>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          letterSpacing: 0.8,
                          opacity: 0.75,
                          marginTop: 2,
                        }}
                      >
                        {slot.label}
                      </span>
                      <strong
                        style={{
                          fontSize: slot.place === 1 ? 15 : 13,
                          marginTop: 6,
                        }}
                      >
                        {slot.player ? slot.player.bestScore : 0}
                      </strong>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ width: "100%", marginTop: 22 }}>
              <button
                type="button"
                className="primary-button"
                onClick={() => {
                  setAuthMode("login");
                  setMessage("");
                  setShowAuthModal(true);
                }}
              >
                <Play size={18} fill="currentColor" />
                LOGIN TO PLAY & SEE TOP 10
              </button>
            </div>

            <p className="challenge-hint">
              Login or create an account to shake, save your score & compete in the Top 10.
            </p>
          </section>
        </main>

        {showAuthModal && (
          <div
            onClick={() => setShowAuthModal(false)}
            role="presentation"
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 1000,
              display: "grid",
              placeItems: "center",
              padding: 16,
              background: "rgba(0,0,0,0.78)",
              backdropFilter: "blur(8px)",
              overflowY: "auto",
            }}
          >
            <div
              className="auth-card"
              onClick={(e) => e.stopPropagation()}
              style={{ position: "relative", margin: "auto" }}
            >
              <button
                type="button"
                aria-label="Close login modal"
                onClick={() => setShowAuthModal(false)}
                style={{
                  position: "absolute",
                  top: 12,
                  right: 14,
                  border: 0,
                  background: "transparent",
                  color: "#fff",
                  fontSize: 24,
                  cursor: "pointer",
                }}
              >
                ×
              </button>

              <div className="brand">
                HILANE <span>WALA.</span>
              </div>

              <div className="auth-icon">
                <User size={32} />
              </div>

              <h1>
                {authMode === "login" ? "Welcome Back!" : "Join The Challenge"}
              </h1>

              <p className="muted">
                {authMode === "login"
                  ? "Login to continue your journey."
                  : "Create your account and compete globally."}
              </p>

              <form onSubmit={handleAuth}>
                {authMode === "register" && (
                  <>
                    <label>Username</label>
                    <input
                      required
                      minLength={3}
                      maxLength={20}
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="your_username"
                    />

                    <label>Profile Photo URL (Optional)</label>
                    <input
                      type="url"
                      value={photoURL}
                      onChange={(e) => setPhotoURL(e.target.value)}
                      placeholder="https://example.com/photo.jpg"
                    />
                  </>
                )}

                <label>Email Address</label>
                <div className="input-wrap">
                  <Mail size={17} />
                  <input
                    required
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                  />
                </div>

                <label>Password</label>
                <div className="input-wrap">
                  <Lock size={17} />
                  <input
                    required
                    type="password"
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Minimum 6 characters"
                  />
                </div>

                {message && <p className="notice">{message}</p>}

                <button className="primary-button" disabled={authLoading}>
                  {authLoading
                    ? "PLEASE WAIT..."
                    : authMode === "login"
                      ? "LOGIN"
                      : "CREATE ACCOUNT"}
                </button>
              </form>

              <p className="auth-switch">
                {authMode === "login"
                  ? "Don't have an account?"
                  : "Already registered?"}

                <button
                  type="button"
                  onClick={() => {
                    setAuthMode(authMode === "login" ? "register" : "login");
                    setMessage("");
                  }}
                >
                  {authMode === "login" ? "Register" : "Login"}
                </button>
              </p>
            </div>
          </div>
        )}

        <footer>
          Md Mahbub Tanmay
          <span>Department of Software Engineering, UFTB.</span>
        </footer>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          HILANE <span>WALA</span>
        </div>

        <div className="header-user">
          {profile?.photoURL ? (
            <img src={profile.photoURL} alt="Profile" />
          ) : (
            <User size={22} />
          )}
        </div>
      </header>

      <AnimatePresence mode="wait">
        {page === "home" && (
          <motion.main
            key="home"
            className="home-page"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <div className="challenge-heading">
              <span className="eyebrow">Kaun Banega</span>
              <h1>Best Hilane Wala</h1>
              <h3>জোরে ঝাঁকাও, দুনিয়া কাঁপাও.</h3>
            </div>

            <section className="challenge-card">
              <div className="timer">
                00:{String(time).padStart(2, "0")}
              </div>

              <motion.div
                key={animationKey}
                className="phone-wrapper"
                animate={
                  running
                    ? { rotate: [0, -14, 14, -10, 10, 0], x: [0, -5, 5, 0] }
                    : { rotate: 0, x: 0 }
                }
                transition={{ duration: 0.28 }}
              >
                <div className="phone">
                  <div className="phone-camera" />
                  <div className="phone-screen">
                    <span className="phone-logo">HW</span>
                    <span className="phone-wave">〰</span>
                  </div>
                </div>
              </motion.div>

              <div className="score-area">
                <h2>{count}</h2>
                <span>SHAKES DETECTED</span>
              </div>

              {motionError && <p className="error-message">{motionError}</p>}

              {running ? (
                <button className="primary-button active" disabled>
                  CHALLENGE RUNNING
                </button>
              ) : completed ? (
                <button className="primary-button" onClick={resetChallenge}>
                  <RotateCcw size={18} /> TRY AGAIN
                </button>
              ) : (
                <button className="primary-button" onClick={startChallenge}>
                  <Play size={18} fill="currentColor" />
                  START SHAKING
                </button>
              )}

              <p className="challenge-hint">
                {running
                  ? "Keep shaking! Every movement counts."
                  : completed
                    ? "Challenge completed!"
                    : "60 seconds. One phone. Unlimited energy."}
              </p>
            </section>

            {message && <p className="notice">{message}</p>}
          </motion.main>
        )}

        {page === "ranks" && (
          <motion.main
            key="ranks"
            className="content-page"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <span className="eyebrow">GLOBAL COMPETITION</span>
            <h1>Leaderboard</h1>
            <p className="muted">The best 'Hilane Wala' in the world.</p>

            <div className="total-players-card">
              <div>
                <span>TOTAL REGISTERED PLAYERS</span>
                <h2>{totalPlayers.toLocaleString()}</h2>
              </div>

              <div>
                <span className="muted">YOUR GLOBAL RANK</span>
                <h2>{myRank ? `#${myRank}` : "Unranked"}</h2>
              </div>
            </div>

            <div className="leaderboard">
              <div className="leaderboard-title">
                <h3>
                  <Medal size={19} /> TOP 10 PLAYERS
                </h3>

                <button onClick={loadRanks} title="Refresh">
                  <RotateCcw size={17} />
                </button>
              </div>

              {rankLoading ? (
                <LoaderCircle className="spin" />
              ) : leaderboard.length === 0 ? (
                <p className="muted">No scores yet. Be the first!</p>
              ) : (
                leaderboard.map((player, index) => (
                  <button
                    type="button"
                    className="rank-row"
                    key={player.uid}
                    style={getTopRowStyle(index)}
                    onClick={() => setSelectedPlayer(player)}
                  >
                    {renderTopBadge(index)}

                    {player.photoURL ? (
                      <img src={player.photoURL} alt="" />
                    ) : (
                      <div className="avatar">
                        <User size={18} />
                      </div>
                    )}

                    <div className="rank-player">
                      <strong>{player.username}</strong>
                      <span>
                        {player.uid === user.uid
                          ? "YOU"
                          : index === 0
                            ? "DIAMOND CHAMPION"
                            : index === 1
                              ? "GOLD CONTENDER"
                              : index === 2
                                ? "BRONZE FINISHER"
                                : "PLAYER"}
                      </span>
                    </div>

                    <strong className="rank-score">{player.bestScore}</strong>
                  </button>
                ))
              )}
            </div>
          </motion.main>
        )}

        {page === "settings" && (
          <motion.main
            key="settings"
            className="content-page"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <span className="eyebrow">ACCOUNT MANAGEMENT</span>
            <h1>Settings</h1>
            <p className="muted">Manage your profile and account.</p>

            <form className="settings-card" onSubmit={saveProfile}>
              <div className="settings-avatar">
                {photoURL ? (
                  <img src={photoURL} alt="Profile" />
                ) : (
                  <User size={35} />
                )}
              </div>

              <label>Username</label>
              <input
                required
                minLength={3}
                maxLength={20}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />

              <label>Profile Photo URL</label>
              <input
                type="url"
                value={photoURL}
                onChange={(e) => setPhotoURL(e.target.value)}
                placeholder="https://example.com/photo.jpg"
              />

              <label>Profile Note (Maximum 40 characters)</label>
              <input
                type="text"
                maxLength={40}
                value={notes}
                onChange={(e) => setNotes(e.target.value.slice(0, 40))}
                placeholder="Write a short note about yourself..."
              />

              <label>Email</label>
              <input value={profile?.email || user.email || ""} disabled />

              <button className="primary-button" disabled={saving}>
                {saving ? "SAVING..." : "SAVE CHANGES"}
              </button>

              {message && <p className="notice">{message}</p>}
            </form>

            <button
              className="logout-button"
              onClick={async () => {
                stopShakeDetection();

                challengeOwnerRef.current = null;
                savingScoreRef.current = false;

                setCount(0);
                setTime(60);
                setRunning(false);
                setCompleted(false);
                setMessage("");
                setSelectedPlayer(null);

                await logoutUser();
                setPage("home");
              }}
            >
              <LogOut size={18} /> LOGOUT
            </button>
          </motion.main>
        )}
      </AnimatePresence>

      {selectedPlayer && (
        <div
          className="profile-modal-overlay"
          onClick={() => setSelectedPlayer(null)}
          role="presentation"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            display: "grid",
            placeItems: "center",
            padding: 20,
            background: "rgba(0,0,0,0.72)",
            backdropFilter: "blur(8px)",
          }}
        >
          <section
            className="profile-modal"
            role="dialog"
            aria-modal="true"
            aria-label={`${selectedPlayer.username} profile`}
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "relative",
              width: "min(100%, 380px)",
              padding: 28,
              borderRadius: 22,
              background: "#171717",
              color: "#fff",
              textAlign: "center",
              border: "1px solid rgba(255,255,255,0.12)",
              boxShadow: "0 24px 80px rgba(0,0,0,0.45)",
            }}
          >
            <button
              type="button"
              className="profile-modal-close"
              aria-label="Close profile"
              onClick={() => setSelectedPlayer(null)}
              style={{
                position: "absolute",
                top: 12,
                right: 14,
                border: 0,
                background: "transparent",
                color: "#fff",
                fontSize: 25,
                cursor: "pointer",
              }}
            >
              ×
            </button>

            {selectedPlayer.photoURL ? (
              <img
                className="profile-modal-avatar"
                src={selectedPlayer.photoURL}
                alt={selectedPlayer.username}
                style={{
                  width: 86,
                  height: 86,
                  borderRadius: "50%",
                  objectFit: "cover",
                  margin: "8px auto 14px",
                }}
              />
            ) : (
              <div
                className="profile-modal-avatar default-avatar"
                style={{
                  width: 86,
                  height: 86,
                  borderRadius: "50%",
                  margin: "8px auto 14px",
                  display: "grid",
                  placeItems: "center",
                  background: "#303030",
                }}
              >
                <User size={38} />
              </div>
            )}

            <h2 style={{ margin: "8px 0 4px" }}>
              {selectedPlayer.username}
            </h2>

            <div
              className="profile-note-box"
              style={{
                padding: 16,
                borderRadius: 14,
                background: "#242424",
                color: "#e8e8e8",
                lineHeight: 1.5,
                overflowWrap: "anywhere",
              }}
            >
              {selectedPlayer.notes?.trim() ||
                "Want to be the best hilane wala"}
            </div>

            <div style={{ marginTop: 18 }}>
              <span style={{ color: "#aaa", fontSize: 12 }}>BEST SCORE</span>
              <h2 style={{ margin: "4px 0 0", fontSize: 32 }}>
                {selectedPlayer.bestScore}
              </h2>
            </div>
          </section>
        </div>
      )}

      <nav className="bottom-nav">
        <button
          className={page === "home" ? "selected" : ""}
          onClick={() => setPage("home")}
        >
          <HomeIcon />
          <span>Home</span>
        </button>

        <button
          className={page === "ranks" ? "selected" : ""}
          onClick={() => setPage("ranks")}
        >
          <Trophy />
          <span>Ranks</span>
        </button>

        <button
          className={page === "settings" ? "selected" : ""}
          onClick={() => {
            setUsername(profile?.username || "");
            setPhotoURL(profile?.photoURL || "");
            setNotes(profile?.notes || "");
            setMessage("");
            setPage("settings");
          }}
        >
          <Settings />
          <span>Settings</span>
        </button>
      </nav>

      <footer>
        Md Mahbub Tanmay
        <span>Department of Software Engineering, UFTB</span>
      </footer>
    </div>
  );
}