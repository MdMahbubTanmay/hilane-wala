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

        setLeaderboard([]);
        setMyRank(null);
        setSelectedPlayer(null);

        setNotes("");
        setUsername("");
        setPhotoURL("");
        setProfile(null);
      }

      if (currentUser) {
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
      const [scores, rank] = await Promise.all([
        getLeaderboard(),
        user ? getMyRank(user.uid) : Promise.resolve(null),
      ]);

      setLeaderboard(scores);
      setMyRank(rank);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not load ranks."
      );
    } finally {
      setRankLoading(false);
    }
  }

  useEffect(() => {
    if (page === "ranks") loadRanks();
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

  if (loading) {
    return (
      <div className="loading-screen">
        <LoaderCircle className="spin" size={35} />
        <h2>HILANE WALA</h2>
      </div>
    );
  }

  if (!user) {
    return (
      <main className="auth-screen">
        <div className="auth-card">
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
              onClick={() => {
                setAuthMode(authMode === "login" ? "register" : "login");
                setMessage("");
              }}
            >
              {authMode === "login" ? "Register" : "Login"}
            </button>
          </p>
        </div>
      </main>
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

            <div className="my-rank-card">
              <div>
                <span className="muted">YOUR GLOBAL RANK</span>
                <h2>{myRank ? `#${myRank}` : "Unranked"}</h2>
              </div>
              <Trophy size={35} />
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
                    onClick={() => setSelectedPlayer(player)}
                  >
                    <span className="rank-number">#{index + 1}</span>

                    {player.photoURL ? (
                      <img src={player.photoURL} alt="" />
                    ) : (
                      <div className="avatar">
                        <User size={18} />
                      </div>
                    )}

                    <div className="rank-player">
                      <strong>{player.username}</strong>
                      <span>{player.uid === user.uid ? "YOU" : "PLAYER"}</span>
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

            <p style={{ color: "#aaa", margin: "0 0 18px" }}>
              HILANE WALA PLAYER
            </p>

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
                "এই খেলোয়াড় এখনো কোনো প্রোফাইল নোট যোগ করেননি।"}
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