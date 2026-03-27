import { useEffect, useState } from 'react';
import { useRecoilState, useRecoilValue } from 'recoil';
import { userAtom } from '../atoms/userAtom';
import { authAtom, AuthUser } from '../atoms/authAtom';
import { useNavigate, useParams } from 'react-router-dom';
import { socketAtom } from '../atoms/socketAtom';
import { IP_ADDRESS } from '../Globle';
import AuthModal from '../components/AuthModal';
import Sidebar from '../components/Sidebar';
import AccountModal from '../components/AccountModal';
import SettingsModal from '../components/SettingsModal';
import { themeAtom } from '../atoms/themeAtom';
import { sidebarOpenAtom } from '../atoms/sidebarAtom';

// --- Helper Components & Icons ---

const Spinner = () => (
    <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
);

const FeatureIcon = ({ children, isDark }: { children: React.ReactNode; isDark: boolean }) => (
    <div
        className={`mr-4 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-all duration-300 ${
            isDark ? "border-violet-500/30 bg-violet-500/15 text-violet-300" : "border-violet-200 bg-violet-50 text-violet-600 shadow-sm"
        }`}
    >
        {children}
    </div>
);

const Register = () => {
    const [roomId, setRoomId] = useState<string>("");
    const [error, setError] = useState<string>("");
    const [isAccountOpen, setIsAccountOpen] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [hasAutoJoined, setHasAutoJoined] = useState(false);
    
    const params = useParams();
    const [, setUser] = useRecoilState(userAtom);
    const [auth, setAuth] = useRecoilState(authAtom);
    const [socket, setSocket] = useRecoilState<WebSocket | null>(socketAtom);
    const [loading, setLoading] = useState<boolean>(false);
    const [showAuthModal, setShowAuthModal] = useState(false);
    const navigate = useNavigate();
    const theme = useRecoilValue(themeAtom);
    const [, setIsSidebarOpen] = useRecoilState(sidebarOpenAtom);
    const isDark = theme === 'dark';

    // Sidebar always open on landing page
    useEffect(() => {
        setIsSidebarOpen(true);
    }, []);

    // Note: Removed auto-redirect to dashboard to allow creating new rooms from "/"

    useEffect(() => {
        document.title = "CoLearn - Collaborative Coding";
        // Pre-fill room ID from the URL parameter
        setRoomId(params.roomId || "");

        // Check for existing auth token
        const token = localStorage.getItem("authToken");
        const storedUser = localStorage.getItem("user");

        if (token && storedUser) {
            try {
                const userData = JSON.parse(storedUser);
                setAuth({
                    isAuthenticated: true,
                    user: userData,
                    token: token,
                });
                // Verify token with backend
                verifyToken(token);
            } catch (error) {
                console.error("Error parsing stored user:", error);
                localStorage.removeItem("authToken");
                localStorage.removeItem("user");
            }
        } else {
            setShowAuthModal(true);
        }
    }, [params.roomId, setAuth]);

    // Auto-join room if roomId is in URL and user is authenticated
    useEffect(() => {
        if (params.roomId && auth.isAuthenticated && auth.user && auth.token && !loading && !socket && !hasAutoJoined) {
            // Room ID is in URL and user is authenticated - auto-join
            const roomIdFromUrl = params.roomId.trim();
            if (roomIdFromUrl.length === 6) {
                setRoomId(roomIdFromUrl);
                setHasAutoJoined(true);
                // Small delay to ensure state is set
                const timer = setTimeout(() => {
                    initializeSocket(true);
                }, 100);
                return () => clearTimeout(timer);
            }
        }
    }, [params.roomId, auth.isAuthenticated, auth.user, auth.token, loading, socket, hasAutoJoined]);

    const verifyToken = async (token: string) => {
        try {
            const response = await fetch(`http://${IP_ADDRESS}:3000/auth/verify`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });

            if (!response.ok) {
                throw new Error("Token invalid");
            }

            const data = await response.json();
            setAuth({
                isAuthenticated: true,
                user: data.user,
                token: token,
            });
        } catch (error) {
            console.error("Token verification failed:", error);
            localStorage.removeItem("authToken");
            localStorage.removeItem("user");
            setAuth({
                isAuthenticated: false,
                user: null,
                token: null,
            });
            setShowAuthModal(true);
        }
    };

    const handleAuthSuccess = (token: string, userData: AuthUser) => {
        setAuth({
            isAuthenticated: true,
            user: userData,
            token: token,
        });
        setShowAuthModal(false);
        // Redirect to dashboard after login if not joining a specific room
        if (!params.roomId) {
            navigate('/dashboard');
        }
    };

    // This is your original, working socket logic
    const initializeSocket = async (isJoining = false, learningModuleId?: string) => {
        setError(""); // Clear previous errors

        // Check authentication
        if (!auth.isAuthenticated || !auth.user || !auth.token) {
            setShowAuthModal(true);
            return;
        }

        if (isJoining && (roomId.trim() === "" || roomId.length !== 8)) {
            setError("Please enter a valid 8-digit Room ID to join.");
            return;
        }

        setLoading(true);
        const userId = auth.user.id;
        const userName = auth.user.name;
        let finalRoomId = roomId;

        try {
            // Create or join room in MongoDB
            if (isJoining) {
                // Join existing room
                const joinResponse = await fetch(`http://${IP_ADDRESS}:3000/room/join`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${auth.token}`,
                    },
                    body: JSON.stringify({
                        roomId: roomId,
                    }),
                });

                if (!joinResponse.ok) {
                    const errorData = await joinResponse.json();
                    setError(errorData.error || "Failed to join room. Please check the Room ID.");
                    setLoading(false);
                    return;
                }

                const joinData = await joinResponse.json();
                finalRoomId = joinData.room.roomId;
            } else {
                // For both free-form and learning rooms we let the WebSocket
                // generate the roomId first, then create/attach on the backend.
            }
        } catch (error) {
            console.error("Error creating/joining room:", error);
            setError("Failed to connect to the server. Please try again.");
            setLoading(false);
            return;
        }

        if (!socket || socket.readyState === WebSocket.CLOSED) {
            const ws = new WebSocket(`ws://${IP_ADDRESS}:5000?roomId=${finalRoomId}&id=${userId}&name=${userName}`);
            setSocket(ws);

            ws.onopen = () => {
                console.log("Connected to WebSocket");
            };

            ws.onmessage = async (event) => {
                const data = JSON.parse(event.data);
                if (data.type === "roomId") {
                    const roomIdFromServer = data.roomId;
                    
                    try {
                        if (!isJoining) {
                            // Create or attach the room in MongoDB.
                            if (learningModuleId) {
                                // Learning room: attach module + initialize learning progress.
                                const attachResponse = await fetch(`http://${IP_ADDRESS}:3000/learning/room/create`, {
                                    method: "POST",
                                    headers: {
                                        "Content-Type": "application/json",
                                        Authorization: `Bearer ${auth.token}`,
                                    },
                                    body: JSON.stringify({
                                        roomId: roomIdFromServer,
                                        moduleId: learningModuleId,
                                    }),
                                });

                                if (!attachResponse.ok) {
                                    const errData = await attachResponse.json().catch(() => ({}));
                                    setError(errData.error || "Failed to create learning room in database.");
                                    setLoading(false);
                                    ws.close();
                                    return;
                                }
                            } else {
                                // Regular free-form room
                                const createResponse = await fetch(`http://${IP_ADDRESS}:3000/room/create`, {
                                    method: "POST",
                                    headers: {
                                        "Content-Type": "application/json",
                                        Authorization: `Bearer ${auth.token}`,
                                    },
                                    body: JSON.stringify({
                                        roomId: roomIdFromServer,
                                    }),
                                });

                                if (!createResponse.ok) {
                                    setError("Failed to create room in database.");
                                    setLoading(false);
                                    ws.close();
                                    return;
                                }
                            }
                        }

                        // Set user and navigate for both create and join
                        setUser({
                            id: userId,
                            name: userName,
                            roomId: roomIdFromServer
                        });
                        setLoading(false);
                        console.log("Server Message: ", data.message);
                        // Navigate based on whether this is a learning room or regular room
                        if (learningModuleId) {
                            navigate("/learn/" + roomIdFromServer);
                        } else {
                            navigate("/code/" + roomIdFromServer);
                        }
                    } catch (error) {
                        console.error("Error handling room:", error);
                        setError("Failed to process room.");
                        setLoading(false);
                        ws.close();
                    }
                } else if (data.type === 'error') {
                    setError(data.message);
                    setLoading(false);
                    ws.close();
                }
            };

            ws.onclose = () => {
                console.log("WebSocket connection closed.");
                setLoading(false);
            };

            ws.onerror = (err) => {
                console.error("WebSocket error:", err);
                setError("Failed to connect to the server. Please try again.");
                setLoading(false);
            };
        } else {
            console.log("Socket connection already exists.");
            setLoading(false);
        }
    }

    const handleCreateRoom = () => {
        if (!loading) initializeSocket(false);
    }

    const handleJoinRoom = () => {
        if (!loading) initializeSocket(true);
    }

    return (
        <div className={`relative flex min-h-screen overflow-hidden font-sans ${isDark ? "colearn-bg-dark text-zinc-100" : "colearn-bg-light text-slate-900"}`}>
            <Sidebar
                showRooms
                onOpenAccount={() => setIsAccountOpen(true)}
                onOpenSettings={() => setIsSettingsOpen(true)}
            />
            <div className="relative flex flex-1 items-center justify-center overflow-hidden p-6 lg:ml-72">
                <div
                    className={`pointer-events-none absolute -left-32 top-1/4 h-[420px] w-[420px] rounded-full blur-3xl ${isDark ? "bg-violet-600/25 animate-float" : "bg-violet-400/20"}`}
                />
                <div
                    className={`pointer-events-none absolute -right-20 bottom-1/4 h-80 w-80 rounded-full blur-3xl ${isDark ? "bg-cyan-500/15" : "bg-cyan-300/20 animate-float"}`}
                    style={{ animationDelay: "1.2s" }}
                />
                <div className="relative z-10 mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-12 md:grid-cols-2 md:gap-16">
                    <div className="space-y-6">
                        <h1
                            className={`animate-fade-up text-5xl font-extrabold tracking-tight md:text-6xl ${isDark ? "text-gradient-dark" : "text-gradient"}`}
                        >
                            CoLearn
                        </h1>
                        <p
                            className={`animate-fade-up text-lg leading-relaxed md:text-xl ${isDark ? "text-zinc-400" : "text-slate-600"}`}
                            style={{ animationDelay: "80ms" }}
                        >
                            The ultimate platform for collaborative learning. Code in real-time, get instant feedback from our AI assistant, and master everything from basic algorithms to complex software architecture together.
                        </p>
                        <ul className="space-y-4 pt-2">
                            <li className="animate-fade-up flex items-center" style={{ animationDelay: "120ms" }}><FeatureIcon isDark={isDark}><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg></FeatureIcon><span className={isDark ? "text-zinc-300" : "text-slate-700"}><strong className={isDark ? "text-white" : "text-slate-900"}>Real-time editor:</strong> Code together with low latency.</span></li>
                            <li className="animate-fade-up flex items-center" style={{ animationDelay: "180ms" }}><FeatureIcon isDark={isDark}><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 8V4H8"/><rect x="4" y="12" width="8" height="8" rx="2"/><path d="M20 12h-4"/><path d="m16 12-4 4-4-4"/></svg></FeatureIcon><span className={isDark ? "text-zinc-300" : "text-slate-700"}><strong className={isDark ? "text-white" : "text-slate-900"}>AI assistant:</strong> Hints, debugging, and best practices.</span></li>
                            <li className="animate-fade-up flex items-center" style={{ animationDelay: "240ms" }}><FeatureIcon isDark={isDark}><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" x2="12" y1="9" y2="13"></line><line x1="12" x2="12.01" y1="17" y2="17"></line></svg></FeatureIcon><span className={isDark ? "text-zinc-300" : "text-slate-700"}><strong className={isDark ? "text-white" : "text-slate-900"}>Guided learning:</strong> Structured modules and checkpoints.</span></li>
                        </ul>
                    </div>
                    
                    <div
                        className={`animate-scale-in rounded-3xl border p-8 shadow-2xl backdrop-blur-xl transition-all duration-500 ${
                            isDark ? "border-white/10 bg-zinc-900/80 shadow-black/40" : "border-slate-200/80 bg-white/80 shadow-slate-300/30"
                        }`}
                    >
                        <h2 className={`mb-6 text-center text-2xl font-bold tracking-tight ${isDark ? "text-white" : "text-slate-900"}`}>
                            Join or create a room
                        </h2>
                        {auth.isAuthenticated && auth.user && (
                            <div
                                className={`mb-5 rounded-2xl border px-4 py-3 ${
                                    isDark ? "border-violet-500/20 bg-violet-500/10" : "border-violet-200 bg-violet-50/80"
                                }`}
                            >
                                <p className={`text-xs font-medium uppercase tracking-wider ${isDark ? "text-violet-300/80" : "text-violet-700"}`}>Signed in</p>
                                <p className={`font-bold ${isDark ? "text-white" : "text-slate-900"}`}>{auth.user.name}</p>
                                <p className={`text-xs ${isDark ? "text-zinc-400" : "text-slate-600"}`}>{auth.user.email}</p>
                            </div>
                        )}
                        <div className="space-y-5">
                            <div>
                                <label htmlFor="roomId" className={`mb-2 block text-sm font-medium ${isDark ? "text-zinc-400" : "text-slate-600"}`}>
                                    Room ID (join)
                                </label>
                                <input
                                    type="text"
                                    id="roomId"
                                    placeholder="8-digit room ID"
                                    value={roomId}
                                    onChange={(e) => setRoomId(e.target.value)}
                                    className={`w-full rounded-xl border px-4 py-3 text-sm transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-violet-500/40 ${
                                        isDark ? "border-white/10 bg-white/5 text-white placeholder-zinc-500" : "border-slate-200 bg-white text-slate-900 placeholder-slate-400"
                                    }`}
                                />
                            </div>
                            {error && (
                                <p className="animate-fade-up text-center text-sm font-medium text-rose-500">{error}</p>
                            )}
                            <div className="flex flex-col gap-3 pt-1">
                                <button
                                    disabled={loading || !auth.isAuthenticated}
                                    onClick={handleJoinRoom}
                                    className="colearn-btn-primary flex h-12 items-center justify-center gap-2 disabled:opacity-50"
                                >
                                    {loading ? <Spinner /> : "Join room"}
                                </button>
                                <button
                                    disabled={loading || !auth.isAuthenticated}
                                    onClick={handleCreateRoom}
                                    className={`flex h-12 items-center justify-center gap-2 rounded-xl border-2 font-semibold transition-all duration-300 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 ${
                                        isDark
                                            ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25"
                                            : "border-emerald-500/30 bg-emerald-50 text-emerald-800 hover:border-emerald-400"
                                    }`}
                                >
                                    {loading ? <Spinner /> : "Create new room"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
                <AuthModal
                    isOpen={showAuthModal}
                    onClose={() => {
                        if (auth.isAuthenticated) {
                            setShowAuthModal(false);
                        }
                    }}
                    onSuccess={handleAuthSuccess}
                    IP_ADDRESS={IP_ADDRESS}
                />
                <AccountModal
                    isOpen={isAccountOpen}
                    onClose={() => setIsAccountOpen(false)}
                />
                <SettingsModal
                    isOpen={isSettingsOpen}
                    onClose={() => setIsSettingsOpen(false)}
                />
            </div>
        </div>
    );
};

export default Register;
