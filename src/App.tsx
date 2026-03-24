import React, { createContext, useContext, useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link } from 'react-router-dom';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut, User as FirebaseUser, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc, setDoc, collection, query, where, onSnapshot, addDoc, serverTimestamp, updateDoc, orderBy, deleteDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import { Toaster, toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import { 
  BookOpen, 
  CheckCircle, 
  Clock, 
  Download, 
  FileText, 
  LayoutDashboard, 
  LogOut, 
  ShieldCheck, 
  Smartphone, 
  User as UserIcon,
  AlertCircle,
  Info,
  Plus,
  Menu,
  X,
  Lock,
  Mail,
  ArrowRight,
  DollarSign,
  Image as ImageIcon,
  Trash2,
  Edit2
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// --- Utils ---
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Types ---
interface UserProfile {
  uid: string;
  email: string;
  role: 'admin' | 'student';
  createdAt: any;
  lastLoginAt?: any;
}

interface Payment {
  id: string;
  uid: string;
  email: string;
  referenceCode: string;
  amount: number;
  status: 'pending' | 'verified' | 'rejected';
  createdAt: any;
}

interface Resource {
  id: string;
  title: string;
  description: string;
  fileUrl: string;
  imageUrl?: string;
  price: number;
  createdAt: any;
}

// --- Error Handling ---
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  toast.error(`Firestore Error: ${errInfo.error}`);
  throw new Error(JSON.stringify(errInfo));
}

// --- Auth Context ---
interface AuthContextType {
  user: FirebaseUser | null;
  profile: UserProfile | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, pass: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribeProfile: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      
      if (unsubscribeProfile) {
        unsubscribeProfile();
        unsubscribeProfile = null;
      }

      if (user) {
        const docRef = doc(db, 'users', user.uid);
        const isAdminEmail = user.email?.toLowerCase() === 'ncubethubelihle483@gmail.com';

        // Set up real-time listener for profile
        unsubscribeProfile = onSnapshot(docRef, async (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data() as UserProfile;
            // Ensure admin role is set if email matches
            if (isAdminEmail && data.role !== 'admin') {
              await updateDoc(docRef, { role: 'admin', lastLoginAt: serverTimestamp() });
            } else {
              setProfile(data);
              // Update last login if it's been more than 5 minutes
              const lastLogin = data.lastLoginAt?.toDate();
              if (!lastLogin || (new Date().getTime() - lastLogin.getTime() > 5 * 60 * 1000)) {
                await updateDoc(docRef, { lastLoginAt: serverTimestamp() });
              }
            }
          } else {
            // Create profile if it doesn't exist
            const newProfile: UserProfile = {
              uid: user.uid,
              email: user.email || '',
              role: isAdminEmail ? 'admin' : 'student',
              createdAt: serverTimestamp(),
              lastLoginAt: serverTimestamp(),
            };
            await setDoc(docRef, newProfile);
            setProfile(newProfile);
          }
          setLoading(false);
        }, (error) => {
          handleFirestoreError(error, OperationType.GET, 'users');
          setLoading(false);
        });
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeProfile) unsubscribeProfile();
    };
  }, []);

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
      toast.success('Successfully signed in!');
    } catch (error) {
      console.error(error);
      toast.error('Failed to sign in.');
    }
  };

  const signInWithEmail = async (email: string, pass: string) => {
    try {
      await signInWithEmailAndPassword(auth, email, pass);
      toast.success('Access granted.');
    } catch (error: any) {
      console.error("Auth error:", error.code, error.message);
      
      // List of codes that might indicate we need to try creating the account 
      // or that the credentials provided are simply wrong for an existing account
      const recoveryCodes = [
        'auth/user-not-found', 
        'auth/invalid-credential', 
        'auth/wrong-password',
        'auth/user-not-found'
      ];

      if (recoveryCodes.includes(error.code)) {
        try {
          await createUserWithEmailAndPassword(auth, email, pass);
          toast.success('Admin account initialized successfully.');
        } catch (signupErr: any) {
          console.error("Signup error:", signupErr.code, signupErr.message);
          if (signupErr.code === 'auth/email-already-in-use') {
            toast.error('Authentication failed: Incorrect password.');
          } else if (signupErr.code === 'auth/operation-not-allowed') {
            toast.error('Email login is disabled. Please use "Continue with Google" below.', {
              duration: 6000,
            });
          } else {
            toast.error(`Auth Error: ${signupErr.message}`);
          }
        }
      } else if (error.code === 'auth/operation-not-allowed') {
        toast.error('Email login is disabled in Firebase. Please use the Google button instead.', {
          duration: 6000,
        });
      } else {
        toast.error(`Authentication failed: ${error.code}`);
      }
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
      toast.success('Signed out.');
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, signInWithGoogle, signInWithEmail, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};

// --- Components ---

const LogoIcon = () => (
  <div className="relative w-12 h-12 flex items-center justify-center">
    {/* Background Glow */}
    <div className="absolute inset-0 bg-lime/20 blur-xl rounded-full group-hover:bg-lime/40 transition-all duration-500"></div>
    
    {/* The "M" Container */}
    <div className="relative w-10 h-10 bg-navy border-2 border-lime rounded-xl flex items-center justify-center overflow-hidden group-hover:scale-110 transition-transform duration-500 shadow-[0_0_20px_rgba(163,230,53,0.3)]">
      {/* Decorative lines inside the M box */}
      <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-lime/50 to-transparent"></div>
      
      {/* The M itself - stylized using text and weights */}
      <span className="text-2xl font-black text-lime font-display leading-none select-none">
        M
      </span>
      
      {/* Bottom accent */}
      <div className="absolute bottom-1 w-4 h-[2px] bg-lime rounded-full opacity-50"></div>
    </div>
  </div>
);

const Logo = () => (
  <div className="flex items-center gap-3 group">
    <LogoIcon />
    <div className="flex flex-col -space-y-1">
      <span className="text-2xl font-display font-black text-white tracking-tighter group-hover:text-lime transition-colors">
        MASTER<span className="text-lime group-hover:text-white transition-colors">VID</span>
      </span>
      <span className="text-[8px] font-black text-lime/50 uppercase tracking-[0.3em] pl-1">
        Theory Portal
      </span>
    </div>
  </div>
);

const Navbar = () => {
  const { user, profile, logout } = useAuth();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-navy/80 backdrop-blur-lg border-b border-lime/20">
      <div className="max-w-7xl mx-auto px-4 h-20 flex items-center justify-between">
        <Link to="/">
          <Logo />
        </Link>

        {/* Desktop Nav */}
        <div className="hidden md:flex items-center gap-8">
          <Link to="/dashboard" className="text-gray-300 hover:text-lime font-medium transition-colors">Dashboard</Link>
          {user ? (
            <>
              {profile?.role === 'admin' && (
                <Link to="/admin" className="text-gray-300 hover:text-lime font-medium flex items-center gap-1 transition-colors">
                  <ShieldCheck className="w-4 h-4" /> Admin
                </Link>
              )}
              <button 
                onClick={logout}
                className="p-2 text-gray-400 hover:text-red-400 transition-colors"
                title="Sign Out"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </>
          ) : (
            <div className="flex items-center gap-4">
              <Link to="/login" className="text-gray-300 hover:text-lime font-medium transition-colors">Sign In</Link>
              <Link 
                to="/login"
                className="bg-lime text-navy px-6 py-2.5 rounded-full font-bold hover:scale-105 transition-all shadow-lg shadow-lime/20"
              >
                SIGN UP
              </Link>
            </div>
          )}
        </div>

        {/* Mobile Menu Toggle */}
        <button 
          className="md:hidden p-2 text-lime"
          onClick={() => setIsOpen(!isOpen)}
        >
          {isOpen ? <X className="w-8 h-8" /> : <Menu className="w-8 h-8" />}
        </button>
      </div>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="md:hidden fixed inset-0 bg-navy/80 z-[90]"
            />
            
            {/* Sidebar */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="md:hidden fixed top-0 right-0 bottom-0 w-[300px] bg-[#020617] border-l border-lime/20 p-8 pt-8 space-y-8 shadow-2xl z-[100]"
            >
              {/* Close Button */}
              <div className="flex justify-end mb-4">
                <button 
                  onClick={() => setIsOpen(false)}
                  className="p-2 text-lime hover:bg-lime/10 rounded-xl transition-all"
                >
                  <X className="w-8 h-8" />
                </button>
              </div>

              <Link 
                to="/dashboard" 
                onClick={() => setIsOpen(false)}
                className="flex items-center gap-4 text-xl font-display font-bold text-white hover:text-lime transition-colors"
              >
                <LayoutDashboard className="w-6 h-6 text-lime" />
                DASHBOARD
              </Link>

              <Link 
                to="/about" 
                onClick={() => setIsOpen(false)}
                className="flex items-center gap-4 text-xl font-display font-bold text-white hover:text-lime transition-colors"
              >
                <Info className="w-6 h-6 text-lime" />
                ABOUT US
              </Link>

              {user ? (
                <>
                  <Link 
                    to="/dashboard" 
                    onClick={() => setIsOpen(false)}
                    className="flex items-center gap-4 text-xl font-display font-bold text-white hover:text-lime transition-colors"
                  >
                    <LayoutDashboard className="w-6 h-6 text-lime" />
                    DASHBOARD
                  </Link>
                  {profile?.role === 'admin' && (
                    <Link 
                      to="/admin" 
                      onClick={() => setIsOpen(false)}
                      className="flex items-center gap-4 text-xl font-display font-bold text-white hover:text-lime transition-colors"
                    >
                      <ShieldCheck className="w-6 h-6 text-lime" />
                      ADMIN PANEL
                    </Link>
                  )}
                  <button 
                    onClick={() => { logout(); setIsOpen(false); }}
                    className="flex items-center gap-4 w-full text-left text-xl font-display font-bold text-red-500 hover:text-red-400 transition-colors"
                  >
                    <LogOut className="w-6 h-6" />
                    LOGOUT
                  </button>
                </>
              ) : (
                <div className="space-y-4 pt-4 border-t border-white/5">
                  <Link 
                    to="/login"
                    onClick={() => setIsOpen(false)}
                    className="block w-full text-center py-4 rounded-xl font-black border border-lime/20 text-white hover:bg-white/5 transition-all"
                  >
                    SIGN IN
                  </Link>
                  <Link 
                    to="/login"
                    onClick={() => setIsOpen(false)}
                    className="block w-full bg-lime text-navy text-center py-4 rounded-xl font-black shadow-lg shadow-lime/20"
                  >
                    SIGN UP
                  </Link>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </nav>
  );
};

const AboutUs = () => (
  <div className="pt-32 pb-20 px-4 bg-navy min-h-screen">
    <div className="max-w-4xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-16"
      >
        <h1 className="text-5xl md:text-7xl font-display font-black text-white mb-6 tracking-tighter">
          ABOUT <span className="text-lime">MASTERVID</span>
        </h1>
        <p className="text-xl text-gray-400 font-light leading-relaxed max-w-2xl mx-auto">
          Zimbabwe's premier digital gateway to driving excellence. We bridge the gap between traditional learning and modern technology.
        </p>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
        <div className="space-y-6">
          <h2 className="text-3xl font-display font-bold text-white">Our Mission</h2>
          <p className="text-gray-400 leading-relaxed">
            To empower every Zimbabwean learner driver with the highest quality resources, past papers, and road sign guides. We believe that road safety starts with comprehensive education.
          </p>
        </div>
        <div className="space-y-6">
          <h2 className="text-3xl font-display font-bold text-white">Our Vision</h2>
          <p className="text-gray-400 leading-relaxed">
            To become the standard for driver training in the region, leveraging real-time data and secure digital delivery to ensure 100% student success in VID theory exams.
          </p>
        </div>
      </div>

      <div className="mt-20 p-12 bg-lime/5 rounded-[3rem] border border-lime/10">
        <div className="flex flex-col md:flex-row items-center gap-8">
          <div className="w-20 h-20 bg-lime/10 rounded-3xl flex items-center justify-center shrink-0">
            <ShieldCheck className="w-10 h-10 text-lime" />
          </div>
          <div>
            <h3 className="text-2xl font-display font-bold text-white mb-2">Secure & Verified</h3>
            <p className="text-gray-400">
              Every resource in our repository is manually verified and updated to match the latest VID standards. Our EcoCash payment system ensures safe and instant access for all students.
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
);

const Home = () => {
  const { user } = useAuth();

  return (
    <div className="pt-32 pb-20 px-4 bg-navy relative overflow-hidden">
      {/* Background Glows */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-lime/10 rounded-full blur-[120px] -translate-y-1/2"></div>
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-lime/5 rounded-full blur-[120px] translate-y-1/2"></div>

      <div className="max-w-6xl mx-auto text-center relative z-10">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="inline-block mb-6 px-4 py-1.5 rounded-full border border-lime/30 bg-lime/5 text-lime text-xs font-bold tracking-[0.2em] uppercase"
        >
          The Future of Driving Theory
        </motion.div>
        
        <motion.h1 
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-6xl md:text-8xl font-display font-black tracking-tighter text-white mb-8 leading-[0.9]"
        >
          MASTER YOUR <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-lime to-emerald-400">DRIVING FUTURE</span>
        </motion.h1>
        
        <motion.p 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-xl text-gray-400 mb-12 max-w-2xl mx-auto font-light leading-relaxed"
        >
          Zimbabwe's most advanced portal for VID theory success. 
          Get instant access to premium past papers and road sign guides.
        </motion.p>
        
        {!user && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <Link 
              to="/login"
              className="group relative inline-flex items-center gap-3 bg-lime text-navy px-10 py-5 rounded-2xl text-xl font-black hover:scale-105 transition-all shadow-2xl shadow-lime/20"
            >
              INITIALIZE ACCESS
              <div className="w-6 h-6 bg-navy/10 rounded-lg flex items-center justify-center group-hover:translate-x-1 transition-transform">
                <Plus className="w-4 h-4" />
              </div>
            </Link>
          </motion.div>
        )}

        <div className="relative mt-20 w-full max-w-5xl mx-auto aspect-[21/9] rounded-[3rem] overflow-hidden border border-lime/10 group">
          <img 
            src="https://images.unsplash.com/photo-1449965408869-eaa3f722e40d?auto=format&fit=crop&q=80&w=2000" 
            alt="Driving Hero" 
            className="w-full h-full object-cover opacity-40 group-hover:scale-105 transition-transform duration-1000"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-navy via-navy/20 to-transparent"></div>
          <div className="absolute inset-0 flex items-center justify-center p-8">
            <div className="text-center space-y-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                className="w-20 h-20 bg-lime/10 backdrop-blur-md rounded-3xl flex items-center justify-center mx-auto border border-lime/20"
              >
                <ShieldCheck className="w-10 h-10 text-lime" />
              </motion.div>
              <h2 className="text-3xl font-display font-black text-white uppercase tracking-tighter">Secure Repository</h2>
              <p className="text-gray-400 max-w-md mx-auto text-sm uppercase tracking-widest font-bold">Encrypted access to Zimbabwe's most comprehensive driving theory database.</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-32">
          {[
            { icon: FileText, title: "Past Papers", desc: "Curated collection of real exam questions." },
            { icon: Smartphone, title: "EcoCash Pay", desc: "Secure manual verification system." },
            { icon: Download, title: "Instant Sync", desc: "Download instantly upon verification." }
          ].map((feature, i) => (
            <motion.div 
              key={i}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 + i * 0.1 }}
              className="p-10 bg-navy/40 backdrop-blur-md rounded-[2.5rem] border border-lime/10 hover:border-lime/30 transition-all group"
            >
              <div className="w-16 h-16 bg-lime/5 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <feature.icon className="w-8 h-8 text-lime" />
              </div>
              <h3 className="text-2xl font-display font-bold text-white mb-3">{feature.title}</h3>
              <p className="text-gray-500 leading-relaxed">{feature.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
};

const Dashboard = () => {
  const { user, profile } = useAuth();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [refCode, setRefCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({});

  const isVerified = payments.some(p => p.status === 'verified');
  const hasPending = payments.some(p => p.status === 'pending');

  useEffect(() => {
    if (!user) return;
    
    // Listen to user's payments
    const q = query(collection(db, 'payments'), where('uid', '==', user.uid));
    const unsubPayments = onSnapshot(q, (snapshot) => {
      setPayments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Payment)));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'payments');
    });

    // Listen to resources
    const unsubResources = onSnapshot(collection(db, 'resources'), (snapshot) => {
      setResources(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Resource)));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'resources');
    });

    return () => {
      unsubPayments();
      unsubResources();
    };
  }, [user]);

  const handleSubmitRef = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!refCode.trim() || !user) return;
    
    setIsSubmitting(true);
    try {
      await addDoc(collection(db, 'payments'), {
        uid: user.uid,
        email: user.email,
        referenceCode: refCode,
        amount: 5,
        status: 'pending',
        createdAt: serverTimestamp()
      });
      toast.success('Reference code submitted for verification!');
      setRefCode('');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'payments');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="pt-32 pb-12 px-4 max-w-6xl mx-auto">
      <div className="flex flex-col lg:flex-row gap-8">
        {/* Left: Status & Payment */}
        <div className="flex-1 space-y-8">
          <div className="bg-navy/40 backdrop-blur-xl p-8 rounded-[2.5rem] border border-lime/10 shadow-2xl shadow-lime/5">
            <h2 className="text-2xl font-display font-bold mb-6 flex items-center gap-3 text-white">
              <LayoutDashboard className="w-6 h-6 text-lime" />
              PORTAL STATUS
            </h2>
            
            {isVerified ? (
              <div className="bg-lime/10 text-lime p-6 rounded-2xl border border-lime/20 flex items-center gap-4">
                <CheckCircle className="w-6 h-6 shrink-0" />
                <span className="font-bold">SYSTEM VERIFIED: FULL ACCESS GRANTED</span>
              </div>
            ) : hasPending ? (
              <div className="bg-amber-500/10 text-amber-500 p-6 rounded-2xl border border-amber-500/20 flex items-center gap-4">
                <Clock className="w-6 h-6 shrink-0" />
                <span className="font-bold">VERIFICATION PENDING: PLEASE STAND BY</span>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="bg-navy/60 p-6 rounded-2xl border border-lime/5">
                  <p className="font-display font-bold text-lime mb-4 uppercase tracking-wider">Protocol: EcoCash Verification</p>
                  <ol className="space-y-3 text-sm text-gray-400">
                    <li className="flex gap-3"><span className="text-lime font-mono">01</span> Send payment to EcoCash: <span className="text-white font-bold">0789269145</span></li>
                    <li className="flex gap-3"><span className="text-lime font-mono">02</span> Wait for confirmation SMS</li>
                    <li className="flex gap-3"><span className="text-lime font-mono">03</span> Copy the <span className="text-white font-bold">Reference Code</span></li>
                    <li className="flex gap-3"><span className="text-lime font-mono">04</span> Input code below for system unlock</li>
                  </ol>
                </div>
                
                <form onSubmit={handleSubmitRef} className="space-y-4">
                  <div>
                    <label className="block text-xs font-display font-bold text-gray-500 mb-2 uppercase tracking-widest">Reference Code</label>
                    <input 
                      id="ref-code-input"
                      type="text" 
                      value={refCode}
                      onChange={(e) => setRefCode(e.target.value)}
                      placeholder="ENTER CODE"
                      className="w-full bg-navy/60 px-6 py-4 rounded-xl border border-lime/10 focus:border-lime/50 text-white font-mono outline-none transition-all placeholder:text-gray-700"
                      required
                    />
                  </div>
                  <button 
                    disabled={isSubmitting}
                    className="w-full bg-lime text-navy py-4 rounded-xl font-black text-lg hover:scale-[1.02] disabled:opacity-50 transition-all shadow-lg shadow-lime/20"
                  >
                    {isSubmitting ? 'INITIALIZING...' : 'INITIALIZE VERIFICATION'}
                  </button>
                </form>
              </div>
            )}
          </div>

          {/* Payment History */}
          {payments.length > 0 && (
            <div className="bg-navy/40 backdrop-blur-xl p-8 rounded-[2.5rem] border border-lime/10">
              <h3 className="text-xl font-display font-bold mb-6 text-white">TRANSACTION LOGS</h3>
              <div className="space-y-3">
                {payments.map(p => (
                  <div key={p.id} className="flex items-center justify-between p-4 bg-navy/60 rounded-2xl border border-lime/5">
                    <div>
                      <p className="font-mono text-sm font-bold text-white">{p.referenceCode}</p>
                      <p className="text-[10px] text-gray-500 uppercase font-bold">{p.createdAt?.toDate().toLocaleDateString()}</p>
                    </div>
                    <span className={cn(
                      "px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-tighter",
                      p.status === 'verified' ? "bg-lime/20 text-lime border border-lime/30" : 
                      p.status === 'pending' ? "bg-amber-500/20 text-amber-500 border border-amber-500/30" : 
                      "bg-red-500/20 text-red-500 border border-red-500/30"
                    )}>
                      {p.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: Resources */}
        <div className="flex-[1.5] space-y-8">
          <h2 className="text-2xl font-display font-bold flex items-center gap-3 text-white">
            <FileText className="w-6 h-6 text-lime" />
            RESOURCE REPOSITORY
          </h2>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {resources.length === 0 ? (
              <p className="text-gray-600 italic font-display">NO ASSETS DETECTED IN REPOSITORY.</p>
            ) : (
              resources.map(res => (
                <div key={res.id} className="bg-navy/40 backdrop-blur-xl p-6 rounded-[2rem] border border-lime/10 flex flex-col justify-between group hover:border-lime/30 transition-all">
                  <div className="mb-6">
                    <div className="w-full aspect-video bg-lime/5 rounded-xl flex items-center justify-center mb-4 group-hover:scale-[1.02] transition-transform overflow-hidden border border-lime/10">
                      {res.imageUrl && !imageErrors[res.id] ? (
                        <img 
                          src={res.imageUrl} 
                          alt="" 
                          className="w-full h-full object-cover" 
                          referrerPolicy="no-referrer" 
                          onError={() => setImageErrors(prev => ({ ...prev, [res.id]: true }))}
                        />
                      ) : (
                        <FileText className="w-8 h-8 text-lime/20" />
                      )}
                    </div>
                    <h4 className="font-display font-bold text-lg text-white mb-2">{res.title}</h4>
                    <p className="text-gray-500 text-sm line-clamp-2 leading-relaxed mb-3">{res.description}</p>
                    <div className="flex items-center gap-2 text-lime font-black text-xs uppercase tracking-widest">
                      <DollarSign className="w-3 h-3" />
                      <span>{res.price}</span>
                    </div>
                  </div>
                  
                  {isVerified ? (
                    <a 
                      href={res.fileUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 bg-lime text-navy py-3 rounded-xl font-black hover:scale-[1.02] transition-all shadow-lg shadow-lime/10"
                    >
                      <Download className="w-4 h-4" /> DOWNLOAD ASSET
                    </a>
                  ) : (
                    <button 
                      onClick={() => {
                        const element = document.getElementById('ref-code-input');
                        if (element) {
                          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                          element.focus();
                        } else {
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }
                        toast.info('Verification required. Please enter your EcoCash reference code below.');
                      }}
                      className="flex items-center justify-center gap-2 bg-lime/10 text-lime py-3 rounded-xl font-black border border-lime/20 hover:bg-lime/20 transition-all shadow-lg shadow-lime/5 group/btn"
                    >
                      <Download className="w-4 h-4 group-hover/btn:scale-110 transition-transform" /> 
                      DOWNLOAD ASSET
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const AdminDashboard = () => {
  const { profile, user } = useAuth();
  const [pendingPayments, setPendingPayments] = useState<Payment[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [newRes, setNewRes] = useState({ title: '', description: '', fileUrl: '', imageUrl: '', price: 5 });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadingImg, setUploadingImg] = useState(false);

  const isAdmin = profile?.role === 'admin' && user?.email === 'ncubethubelihle483@gmail.com';

  if (!isAdmin) return <Navigate to="/dashboard" />;

  useEffect(() => {
    if (!isAdmin) return;
    const q = query(collection(db, 'payments'), where('status', '==', 'pending'));
    const unsubPayments = onSnapshot(q, (snapshot) => {
      setPendingPayments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Payment)));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'payments');
    });

    const unsubResources = onSnapshot(query(collection(db, 'resources'), orderBy('createdAt', 'desc')), (snapshot) => {
      setResources(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Resource)));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'resources');
    });

    return () => {
      unsubPayments();
      unsubResources();
    };
  }, []);

  const handleVerify = async (id: string, status: 'verified' | 'rejected') => {
    if (!isAdmin) {
      toast.error('Administrative authorization required.');
      return;
    }
    try {
      await updateDoc(doc(db, 'payments', id), {
        status,
        verifiedAt: serverTimestamp()
      });
      toast.success(`Payment ${status}!`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `payments/${id}`);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isAdmin) {
      toast.error('Administrative authorization required.');
      return;
    }
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 1024 * 1024) {
      toast.error('File too large. Max 1MB for direct upload.');
      return;
    }

    setUploading(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = event.target?.result as string;
      setNewRes(prev => ({ ...prev, fileUrl: base64 }));
      setUploading(false);
      toast.success('File prepared for deployment.');
    };
    reader.readAsDataURL(file);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isAdmin) {
      toast.error('Administrative authorization required.');
      return;
    }
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 512 * 1024) {
      toast.error('Image too large. Max 512KB for direct upload.');
      return;
    }

    setUploadingImg(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = event.target?.result as string;
      setNewRes(prev => ({ ...prev, imageUrl: base64 }));
      setUploadingImg(false);
      toast.success('Preview image prepared.');
    };
    reader.readAsDataURL(file);
  };

  const handleAddResource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) {
      toast.error('Administrative authorization required.');
      return;
    }
    if (!newRes.fileUrl) {
      toast.error('Please upload a file or provide a URL.');
      return;
    }
    try {
      await addDoc(collection(db, 'resources'), {
        ...newRes,
        createdAt: serverTimestamp()
      });
      toast.success('Resource added!');
      setNewRes({ title: '', description: '', fileUrl: '', imageUrl: '', price: 5 });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'resources');
    }
  };

  const handleEdit = (res: Resource) => {
    setEditingId(res.id);
    setNewRes({
      title: res.title,
      description: res.description,
      fileUrl: res.fileUrl,
      imageUrl: res.imageUrl || '',
      price: res.price
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setNewRes({ title: '', description: '', fileUrl: '', imageUrl: '', price: 5 });
  };

  const handleUpdateResource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) {
      toast.error('Administrative authorization required.');
      return;
    }
    if (!editingId) return;
    if (!newRes.fileUrl) {
      toast.error('Please upload a file or provide a URL.');
      return;
    }
    try {
      await updateDoc(doc(db, 'resources', editingId), {
        ...newRes,
        updatedAt: serverTimestamp()
      });
      toast.success('Resource updated!');
      handleCancelEdit();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `resources/${editingId}`);
    }
  };

  const handleDeleteResource = async (id: string) => {
    if (!isAdmin) {
      toast.error('Administrative authorization required.');
      return;
    }
    if (!window.confirm('Are you sure you want to delete this asset? This action is irreversible.')) return;
    try {
      await deleteDoc(doc(db, 'resources', id));
      toast.success('Resource deleted from repository.');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `resources/${id}`);
    }
  };

  return (
    <div className="pt-32 pb-12 px-4 max-w-6xl mx-auto space-y-16">
      {/* Pending Payments */}
      <section>
        <h2 className="text-3xl font-display font-bold mb-8 flex items-center gap-3 text-white">
          <Clock className="w-8 h-8 text-amber-500" />
          PENDING VERIFICATIONS
        </h2>
        
        {pendingPayments.length === 0 ? (
          <div className="bg-navy/40 backdrop-blur-xl p-16 rounded-[2.5rem] border border-lime/10 text-center text-gray-500">
            <CheckCircle className="w-16 h-16 mx-auto mb-6 opacity-20 text-lime" />
            <p className="text-xl font-display">ALL SYSTEMS CLEAR. NO PENDING TRANSACTIONS.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {pendingPayments.map(p => (
              <motion.div 
                layout
                key={p.id} 
                className="bg-navy/40 backdrop-blur-xl p-8 rounded-[2.5rem] border border-lime/10 shadow-xl space-y-6 group hover:border-lime/30 transition-all"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-[10px] text-gray-500 uppercase font-black tracking-widest mb-1">Reference Code</p>
                    <p className="text-2xl font-mono font-bold text-lime">{p.referenceCode}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-gray-500 uppercase font-black tracking-widest mb-1">Amount</p>
                    <p className="text-2xl font-bold text-white">${p.amount}</p>
                  </div>
                </div>
                
                <div className="p-4 bg-navy/60 rounded-2xl border border-white/5">
                  <p className="text-[10px] text-gray-500 uppercase font-black tracking-widest mb-1">Student Identifier</p>
                  <p className="text-sm font-medium text-gray-300 truncate">{p.email}</p>
                </div>

                <div className="flex gap-3 pt-2">
                  <button 
                    onClick={() => handleVerify(p.id, 'verified')}
                    className="flex-1 bg-lime text-navy py-3 rounded-xl font-black hover:scale-[1.05] transition-all"
                  >
                    VERIFY
                  </button>
                  <button 
                    onClick={() => handleVerify(p.id, 'rejected')}
                    className="flex-1 bg-red-500/10 text-red-500 py-3 rounded-xl font-black border border-red-500/20 hover:bg-red-500/20 transition-all"
                  >
                    REJECT
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </section>

      {/* Resource Management */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-16">
        <div>
          <h2 className="text-3xl font-display font-bold mb-8 flex items-center gap-3 text-white">
            {editingId ? <Edit2 className="w-8 h-8 text-lime" /> : <Plus className="w-8 h-8 text-lime" />}
            {editingId ? 'EDIT ASSET' : 'DEPLOY NEW ASSET'}
          </h2>
          <form onSubmit={editingId ? handleUpdateResource : handleAddResource} className="bg-navy/40 backdrop-blur-xl p-8 rounded-[2.5rem] border border-lime/10 space-y-6">
            <div>
              <label className="block text-[10px] font-display font-bold text-gray-500 mb-2 uppercase tracking-widest">Asset Title</label>
              <input 
                type="text" 
                value={newRes.title}
                onChange={e => setNewRes({...newRes, title: e.target.value})}
                className="w-full bg-navy/60 px-6 py-3 rounded-xl border border-lime/10 outline-none focus:border-lime/50 text-white transition-all"
                required
              />
            </div>
            <div>
              <label className="block text-[10px] font-display font-bold text-gray-500 mb-2 uppercase tracking-widest">Description</label>
              <textarea 
                value={newRes.description}
                onChange={e => setNewRes({...newRes, description: e.target.value})}
                className="w-full bg-navy/60 px-6 py-3 rounded-xl border border-lime/10 outline-none focus:border-lime/50 text-white h-24 transition-all"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-display font-bold text-gray-500 mb-2 uppercase tracking-widest">Price ($)</label>
                <input 
                  type="number" 
                  value={newRes.price}
                  onChange={e => setNewRes({...newRes, price: Number(e.target.value)})}
                  className="w-full bg-navy/60 px-6 py-3 rounded-xl border border-lime/10 outline-none focus:border-lime/50 text-white transition-all"
                  required
                />
              </div>
              <div>
                <label className="block text-[10px] font-display font-bold text-gray-500 mb-2 uppercase tracking-widest">Asset File</label>
                <input 
                  type="file" 
                  onChange={handleFileUpload}
                  className="w-full text-xs text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-black file:bg-lime file:text-navy hover:file:bg-lime/80"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-display font-bold text-gray-500 mb-2 uppercase tracking-widest">Preview Image</label>
                <input 
                  type="file" 
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="w-full text-xs text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-black file:bg-lime file:text-navy hover:file:bg-lime/80"
                />
              </div>
              <div>
                <label className="block text-[10px] font-display font-bold text-gray-500 mb-2 uppercase tracking-widest">Or Image URL</label>
                <input 
                  type="url" 
                  value={newRes.imageUrl}
                  onChange={e => setNewRes({...newRes, imageUrl: e.target.value})}
                  className="w-full bg-navy/60 px-6 py-3 rounded-xl border border-lime/10 outline-none focus:border-lime/50 text-white transition-all"
                  placeholder="https://image..."
                />
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-display font-bold text-gray-500 mb-2 uppercase tracking-widest">Or File URL</label>
              <input 
                type="url" 
                value={newRes.fileUrl}
                onChange={e => setNewRes({...newRes, fileUrl: e.target.value})}
                className="w-full bg-navy/60 px-6 py-3 rounded-xl border border-lime/10 outline-none focus:border-lime/50 text-white transition-all"
                placeholder="https://file..."
              />
            </div>
            <div className="flex gap-4">
              <button 
                type="submit"
                disabled={uploading || uploadingImg}
                className="flex-1 bg-lime text-navy py-4 rounded-xl font-black text-lg hover:scale-[1.02] transition-all shadow-lg shadow-lime/20 disabled:opacity-50"
              >
                {uploading || uploadingImg ? 'PROCESSING...' : (editingId ? 'UPDATE ASSET' : 'DEPLOY ASSET')}
              </button>
              {editingId && (
                <button 
                  type="button"
                  onClick={handleCancelEdit}
                  className="px-8 bg-navy/60 text-white py-4 rounded-xl font-black text-lg border border-white/10 hover:bg-navy/80 transition-all"
                >
                  CANCEL
                </button>
              )}
            </div>
          </form>
        </div>

        <div>
          <h2 className="text-3xl font-display font-bold mb-8 flex items-center gap-3 text-white">
            <FileText className="w-8 h-8 text-lime" />
            ACTIVE REPOSITORY
          </h2>
          <div className="space-y-4">
            {resources.map(res => (
              <div key={res.id} className="bg-navy/40 backdrop-blur-xl p-6 rounded-[2rem] border border-lime/10 flex items-center justify-between group hover:border-lime/30 transition-all">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 bg-lime/5 rounded-xl flex items-center justify-center overflow-hidden border border-lime/10">
                    {res.imageUrl ? (
                      <img src={res.imageUrl} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <FileText className="w-6 h-6 text-lime" />
                    )}
                  </div>
                  <div>
                    <h4 className="font-display font-bold text-white">{res.title}</h4>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-lime font-black uppercase tracking-widest">${res.price}</span>
                      <span className="text-[10px] text-gray-500 truncate max-w-[150px] uppercase font-bold tracking-widest">{res.fileUrl.startsWith('data:') ? 'DIRECT UPLOAD' : 'EXTERNAL LINK'}</span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={() => handleEdit(res)}
                    className="p-3 text-lime hover:bg-lime/10 rounded-xl transition-all"
                    title="Edit Asset"
                  >
                    <Edit2 className="w-6 h-6" />
                  </button>
                  <a href={res.fileUrl} target="_blank" rel="noopener noreferrer" className="p-3 text-gray-400 hover:bg-white/10 rounded-xl transition-all" title="Download Asset">
                    <Download className="w-6 h-6" />
                  </a>
                  <button 
                    onClick={() => handleDeleteResource(res.id)}
                    className="p-3 text-red-500 hover:bg-red-500/10 rounded-xl transition-all"
                    title="Delete Asset"
                  >
                    <Trash2 className="w-6 h-6" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};

// --- Error Boundary ---
class ErrorBoundary extends React.Component<any, any> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-navy flex items-center justify-center p-4">
          <div className="bg-navy/40 backdrop-blur-xl border border-red-500/30 p-8 rounded-[2.5rem] max-w-md text-center">
            <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-6" />
            <h2 className="text-2xl font-display font-bold text-white mb-4">SYSTEM ANOMALY</h2>
            <p className="text-gray-400 mb-8">An unexpected error has occurred in the matrix. Please refresh the portal.</p>
            <button 
              onClick={() => window.location.reload()}
              className="bg-lime text-navy px-8 py-3 rounded-full font-black hover:scale-105 transition-all"
            >
              REBOOT SYSTEM
            </button>
          </div>
        </div>
      );
    }

    return (this as any).props.children;
  }
}

const LoginPage = () => {
  const { signInWithEmail, signInWithGoogle, user } = useAuth();
  const [email, setEmail] = useState(localStorage.getItem('last_student_email') || '');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  if (user) return <Navigate to="/dashboard" />;

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await signInWithEmail(email, password);
      if (rememberMe) {
        localStorage.setItem('last_student_email', email);
      } else {
        localStorage.removeItem('last_student_email');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    try {
      await signInWithGoogle();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen pt-32 pb-20 px-4 bg-navy flex items-center justify-center relative overflow-hidden">
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-lime/10 rounded-full blur-[120px] -translate-y-1/2"></div>
      
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-navy/40 backdrop-blur-xl p-8 rounded-[2.5rem] border border-lime/10 shadow-2xl relative z-10"
      >
        <div className="text-center mb-8">
          <div className="flex justify-center mb-6">
            <Logo />
          </div>
          <h2 className="text-3xl font-display font-bold text-white">
            {localStorage.getItem('last_student_email') ? 'WELCOME BACK' : 'STUDENT PORTAL'}
          </h2>
          <p className="text-gray-500 mt-2">
            {localStorage.getItem('last_student_email') 
              ? `Authorized access for ${localStorage.getItem('last_student_email')}`
              : 'Access your driving theory resources'}
          </p>
        </div>

        <form onSubmit={handleEmailLogin} className="space-y-4">
          <div className="space-y-2">
            <label className="text-[10px] font-display font-bold text-gray-500 uppercase tracking-widest ml-1">Email Address</label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-600" />
              <input 
                type="email" 
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full bg-navy/60 pl-12 pr-4 py-4 rounded-xl border border-lime/10 focus:border-lime/50 text-white outline-none transition-all"
                placeholder="student@example.com"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-display font-bold text-gray-500 uppercase tracking-widest ml-1">Password</label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-600" />
              <input 
                type="password" 
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full bg-navy/60 pl-12 pr-4 py-4 rounded-xl border border-lime/10 focus:border-lime/50 text-white outline-none transition-all"
                placeholder="••••••••"
                required
              />
            </div>
          </div>

          <div className="flex items-center justify-between px-1">
            <label className="flex items-center gap-2 cursor-pointer group">
              <div className="relative">
                <input 
                  type="checkbox" 
                  checked={rememberMe}
                  onChange={e => setRememberMe(e.target.checked)}
                  className="sr-only"
                />
                <div className={cn(
                  "w-4 h-4 rounded border transition-all",
                  rememberMe ? "bg-lime border-lime" : "bg-navy/60 border-white/10 group-hover:border-lime/50"
                )}>
                  {rememberMe && <CheckCircle className="w-3 h-3 text-navy mx-auto mt-0.5" />}
                </div>
              </div>
              <span className="text-[10px] font-display font-bold text-gray-500 uppercase tracking-widest">Remember Me</span>
            </label>
            <button type="button" className="text-[10px] font-display font-bold text-lime uppercase tracking-widest hover:underline">Forgot Key?</button>
          </div>

          <button 
            disabled={loading}
            className="w-full bg-lime text-navy py-4 rounded-xl font-black text-lg hover:scale-[1.02] transition-all shadow-lg shadow-lime/20 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? 'INITIALIZING...' : 'ENTER PORTAL'}
            <ArrowRight className="w-5 h-5" />
          </button>
        </form>

        <div className="mt-8 pt-8 border-t border-white/5">
          <button 
            onClick={handleGoogleLogin}
            className="w-full bg-white/5 text-white py-4 rounded-xl font-bold hover:bg-white/10 transition-all flex items-center justify-center gap-3"
          >
            <img src="https://www.google.com/favicon.ico" className="w-5 h-5" alt="Google" />
            CONTINUE WITH GOOGLE
          </button>
        </div>
        
        <div className="mt-6 text-center">
          <Link to="/admin-login" className="text-xs text-gray-600 hover:text-lime transition-colors uppercase font-bold tracking-widest">
            Admin Access Only
          </Link>
        </div>
      </motion.div>
    </div>
  );
};

const AdminLoginPage = () => {
  const { signInWithEmail, signInWithGoogle, profile, user } = useAuth();
  const [email, setEmail] = useState(localStorage.getItem('last_admin_email') || '');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  if (user && profile?.role === 'admin') return <Navigate to="/admin" />;

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    if (cleanEmail !== 'ncubethubelihle483@gmail.com' || password !== 'T0h0u0b0e0l0i0h0l0e') {
      toast.error('Invalid administrative credentials.');
      return;
    }
    setLoading(true);
    try {
      await signInWithEmail(cleanEmail, password);
      if (rememberMe) {
        localStorage.setItem('last_admin_email', cleanEmail);
      } else {
        localStorage.removeItem('last_admin_email');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleAdminLogin = async () => {
    setLoading(true);
    await signInWithGoogle();
    setLoading(false);
  };

  return (
    <div className="min-h-screen pt-32 pb-20 px-4 bg-navy flex items-center justify-center relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-red-500/5 via-transparent to-transparent"></div>
      
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md bg-navy/40 backdrop-blur-xl p-8 rounded-[2.5rem] border border-red-500/20 shadow-2xl relative z-10"
      >
        <div className="text-center mb-8">
          <div className="flex justify-center mb-6">
            <Logo />
          </div>
          <h2 className="text-3xl font-display font-bold text-white">
            {localStorage.getItem('last_admin_email') ? 'ADMIN RECOGNIZED' : 'COMMAND CENTER'}
          </h2>
          <p className="text-gray-500 mt-2">
            {localStorage.getItem('last_admin_email') 
              ? `System access for ${localStorage.getItem('last_admin_email')}`
              : 'Restricted Admin Access'}
          </p>
        </div>

        <form onSubmit={handleAdminLogin} className="space-y-4">
          <div className="space-y-2">
            <label className="text-[10px] font-display font-bold text-gray-500 uppercase tracking-widest ml-1">Admin Identifier</label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-600" />
              <input 
                type="email" 
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full bg-navy/60 pl-12 pr-4 py-4 rounded-xl border border-red-500/10 focus:border-red-500/50 text-white outline-none transition-all"
                placeholder="admin@mastervid.com"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-display font-bold text-gray-500 uppercase tracking-widest ml-1">Security Key</label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-600" />
              <input 
                type="password" 
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full bg-navy/60 pl-12 pr-4 py-4 rounded-xl border border-red-500/10 focus:border-red-500/50 text-white outline-none transition-all"
                placeholder="••••••••"
                required
              />
            </div>
          </div>

          <div className="flex items-center justify-between px-1">
            <label className="flex items-center gap-2 cursor-pointer group">
              <div className="relative">
                <input 
                  type="checkbox" 
                  checked={rememberMe}
                  onChange={e => setRememberMe(e.target.checked)}
                  className="sr-only"
                />
                <div className={cn(
                  "w-4 h-4 rounded border transition-all",
                  rememberMe ? "bg-red-500 border-red-500" : "bg-navy/60 border-white/10 group-hover:border-red-500/50"
                )}>
                  {rememberMe && <CheckCircle className="w-3 h-3 text-navy mx-auto mt-0.5" />}
                </div>
              </div>
              <span className="text-[10px] font-display font-bold text-gray-500 uppercase tracking-widest">Remember Admin</span>
            </label>
          </div>

          <button 
            disabled={loading}
            className="w-full bg-red-600/20 text-red-500 py-4 rounded-xl font-black text-lg hover:bg-red-600/30 transition-all border border-red-500/30 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? 'AUTHENTICATING...' : 'AUTHORIZE WITH KEY'}
            <ShieldCheck className="w-5 h-5" />
          </button>
        </form>

        <div className="mt-6">
          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-800"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-navy text-gray-500 uppercase tracking-widest text-[10px]">Recommended Authorization</span>
            </div>
          </div>

          <button
            onClick={handleGoogleAdminLogin}
            disabled={loading}
            className="w-full bg-red-600 text-white font-black py-5 rounded-xl transition-all flex items-center justify-center gap-3 group shadow-xl shadow-red-600/20 hover:scale-[1.02]"
          >
            <img src="https://www.google.com/favicon.ico" className="w-6 h-6 brightness-0 invert" alt="Google" />
            <span className="text-sm uppercase tracking-widest">Continue with Admin Google</span>
          </button>
        </div>
        
        <div className="mt-6 text-center">
          <Link to="/login" className="text-xs text-gray-600 hover:text-white transition-colors uppercase font-bold tracking-widest">
            Return to Student Portal
          </Link>
        </div>
      </motion.div>
    </div>
  );
};

const Footer = () => (
  <footer className="bg-navy border-t border-white/5 py-12">
    <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-6">
      <div className="flex items-center gap-2">
        <LogoIcon />
        <span className="text-gray-500 text-sm font-display font-bold uppercase tracking-widest ml-4">
          © 2026. All Rights Reserved.
        </span>
      </div>
      <div className="flex items-center gap-8">
        <Link to="/about" className="text-xs text-gray-500 hover:text-lime transition-colors uppercase font-bold tracking-widest">About Us</Link>
        <Link to="/login" className="text-xs text-gray-500 hover:text-lime transition-colors uppercase font-bold tracking-widest">Student Portal</Link>
        <Link to="/admin-login" className="text-xs text-gray-500 hover:text-lime transition-colors uppercase font-bold tracking-widest">Admin Access</Link>
      </div>
    </div>
  </footer>
);

// --- Main App ---

export default function App() {
  useEffect(() => {
    const testConnection = async () => {
      try {
        const { getDocFromServer } = await import('firebase/firestore');
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }
    };
    testConnection();
  }, []);

  return (
    <ErrorBoundary>
      <AuthProvider>
        <Router>
          <div className="min-h-screen bg-navy text-gray-300 font-sans selection:bg-lime/30 selection:text-lime">
            <Navbar />
            <main>
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/about" element={<AboutUs />} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/admin-login" element={<AdminLoginPage />} />
                <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
                <Route path="/admin" element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>} />
                <Route path="*" element={<Navigate to="/" />} />
              </Routes>
            </main>
            <Footer />
            <Toaster theme="dark" position="bottom-right" richColors />
          </div>
        </Router>
      </AuthProvider>
    </ErrorBoundary>
  );
}

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();
  
  if (loading) return (
    <div className="h-screen flex items-center justify-center bg-navy">
      <motion.div 
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
        className="w-12 h-12 border-4 border-lime border-t-transparent rounded-full"
      />
    </div>
  );
  
  if (!user) return <Navigate to="/" />;
  
  return <>{children}</>;
};
