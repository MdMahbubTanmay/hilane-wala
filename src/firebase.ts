import { initializeApp } from "firebase/app";

import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updatePassword,
  updateEmail,
  deleteUser,
  type User,
} from "firebase/auth";

import {
  getDatabase,
  ref,
  get,
  set,
  update,
  runTransaction,
  query,
  orderByChild,
  limitToLast,
} from "firebase/database";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getDatabase(app);



export interface Profile {
  uid: string;
  username: string;
  email: string;
  photoURL: string;
  notes?: string;
  createdAt: number;
}

export interface Score {
  uid: string;
  username: string;
  photoURL: string;
  notes?: string;
  bestScore: number;
  lastScore: number;
  updatedAt: number;
}



export function subscribeAuth(
  callback: (user: User | null) => void
) {
  return onAuthStateChanged(auth, callback);
}

export async function registerUser(
  email: string,
  password: string,
  username: string,
  photoURL = ""
): Promise<User> {
  const cleanUsername = username.trim();
  const usernameKey = cleanUsername.toLowerCase();

  if (!/^[a-zA-Z0-9_]{3,20}$/.test(cleanUsername)) {
    throw new Error(
      "Username must be 3-20 characters and contain only letters, numbers or underscore."
    );
  }

  if (password.length < 6) {
    throw new Error("Password must contain at least 6 characters.");
  }

  const credential = await createUserWithEmailAndPassword(
    auth,
    email.trim(),
    password
  );

  const user = credential.user;
  const usernameRef = ref(db, `usernames/${usernameKey}`);

  let reserved = false;

  try {
    const reservation = await runTransaction(
      usernameRef,
      (current) => {
        if (current !== null) {
          return;
        }

        return { uid: user.uid };
      }
    );

    if (!reservation.committed) {
      throw new Error("Username already taken. Try another one.");
    }

    reserved = true;

    const profile: Profile = {
      uid: user.uid,
      username: cleanUsername,
      email: user.email || email.trim(),
      photoURL: photoURL.trim(),
      notes: "",
      createdAt: Date.now(),
    };

    const initialScore: Score = {
      uid: user.uid,
      username: cleanUsername,
      photoURL: photoURL.trim(),
      notes: "",
      bestScore: 0,
      lastScore: 0,
      updatedAt: Date.now(),
    };

    await Promise.all([
      set(ref(db, `users/${user.uid}`), profile),
      set(ref(db, `scores/${user.uid}`), initialScore),
    ]);

    return user;
  } catch (error) {
    if (reserved) {
      await set(usernameRef, null).catch(() => {});
    }

    await deleteUser(user).catch(() => {});

    throw error;
  }
}

export async function loginUser(
  email: string,
  password: string
): Promise<User> {
  const result = await signInWithEmailAndPassword(
    auth,
    email.trim(),
    password
  );

  return result.user;
}

export async function logoutUser(): Promise<void> {
  await signOut(auth);
}


export async function getProfile(
  uid: string
): Promise<Profile | null> {
  const snapshot = await get(ref(db, `users/${uid}`));

  if (!snapshot.exists()) {
    return null;
  }

  return snapshot.val() as Profile;
}

export async function updateProfile(
  uid: string,
  oldUsername: string,
  newUsername: string,
  photoURL: string,
  notes = ""
): Promise<void> {
  if (auth.currentUser?.uid !== uid) {
    throw new Error("Unauthorized profile update.");
  }

  const cleanUsername = newUsername.trim();
  const newKey = cleanUsername.toLowerCase();
  const oldKey = oldUsername.toLowerCase();

  if (!/^[a-zA-Z0-9_]{3,20}$/.test(cleanUsername)) {
    throw new Error("Invalid username format.");
  }

  const cleanPhotoURL = photoURL.trim();
  const cleanNotes = notes.trim().slice(0, 40);

  if (cleanPhotoURL) {
    try {
      const parsedURL = new URL(cleanPhotoURL);

      if (!["http:", "https:"].includes(parsedURL.protocol)) {
        throw new Error();
      }
    } catch {
      throw new Error("Please enter a valid photo URL.");
    }
  }

  const newUsernameRef = ref(db, `usernames/${newKey}`);


  if (newKey !== oldKey) {
    const reservation = await runTransaction(
      newUsernameRef,
      (current) => {
        if (current !== null) return;

        return { uid };
      }
    );

    if (!reservation.committed) {
      throw new Error("Username already taken.");
    }
  }

  try {
    const updates: Record<string, unknown> = {
      [`users/${uid}/username`]: cleanUsername,
      [`users/${uid}/photoURL`]: cleanPhotoURL,
      [`users/${uid}/notes`]: cleanNotes,

      [`scores/${uid}/username`]: cleanUsername,
      [`scores/${uid}/photoURL`]: cleanPhotoURL,
      [`scores/${uid}/notes`]: cleanNotes,
    };

    await update(ref(db), updates);


    if (newKey !== oldKey) {
      await set(ref(db, `usernames/${oldKey}`), null);
    }
  } catch (error) {
    if (newKey !== oldKey) {
      await set(newUsernameRef, null).catch(() => {});
    }

    throw error;
  }
}



export async function changeEmail(email: string): Promise<void> {
  const currentUser = auth.currentUser;

  if (!currentUser) {
    throw new Error("Please login first.");
  }

  await updateEmail(currentUser, email.trim());

  await update(ref(db, `users/${currentUser.uid}`), {
    email: email.trim(),
  });
}

export async function changeUserPassword(
  newPassword: string
): Promise<void> {
  const currentUser = auth.currentUser;

  if (!currentUser) {
    throw new Error("Please login first.");
  }

  if (newPassword.length < 6) {
    throw new Error("Password must contain at least 6 characters.");
  }

  await updatePassword(currentUser, newPassword);
}



export async function submitScore(
  uid: string,
  score: number
): Promise<
  | { saved: true }
  | { saved: false; previousBest: number }
> {
 
  if (auth.currentUser?.uid !== uid) {
    throw new Error("Unauthorized score submission.");
  }

  if (!Number.isInteger(score) || score < 0 || score > 10000) {
    throw new Error("Invalid score.");
  }

  const profile = await getProfile(uid);

  if (!profile) {
    throw new Error("User profile not found.");
  }

  const scoreRef = ref(db, `scores/${uid}`);

  const result = await runTransaction(scoreRef, (current) => {
    const previousBest = Number(current?.bestScore) || 0;


    if (current && score <= previousBest) {
      return;
    }

    return {
      uid,
      username: current?.username || profile.username,
      photoURL: current?.photoURL || profile.photoURL || "",
      notes: current?.notes || profile.notes || "",
      bestScore: score,
      lastScore: score,
      updatedAt: Date.now(),
    };
  });

  if (result.committed) {
    return { saved: true };
  }

  const previousBest =
    Number(result.snapshot.val()?.bestScore) || 0;

  if (score <= previousBest) {
    return {
      saved: false,
      previousBest,
    };
  }

  throw new Error("Unable to save score.");
}



export async function getLeaderboard(): Promise<Score[]> {
  const leaderboardQuery = query(
    ref(db, "scores"),
    orderByChild("bestScore"),
    limitToLast(10)
  );

  const snapshot = await get(leaderboardQuery);

  if (!snapshot.exists()) {
    return [];
  }

  const scores = Object.values(
    snapshot.val() as Record<string, Score>
  );

  return scores.sort(
    (a, b) =>
      b.bestScore - a.bestScore ||
      a.updatedAt - b.updatedAt ||
      a.uid.localeCompare(b.uid)
  );
}

export async function getMyRank(
  uid: string
): Promise<number | null> {
  const snapshot = await get(ref(db, "scores"));

  if (!snapshot.exists()) {
    return null;
  }

  const scores = Object.values(
    snapshot.val() as Record<string, Score>
  );

  scores.sort(
    (a, b) =>
      b.bestScore - a.bestScore ||
      a.updatedAt - b.updatedAt ||
      a.uid.localeCompare(b.uid)
  );

  const index = scores.findIndex(
    (item) => item.uid === uid
  );

  return index === -1 ? null : index + 1;
}



export function getCurrentUser(): User | null {
  return auth.currentUser;
}

export async function getMyScore(
  uid: string
): Promise<Score | null> {
  const snapshot = await get(ref(db, `scores/${uid}`));

  return snapshot.exists()
    ? (snapshot.val() as Score)
    : null;
}