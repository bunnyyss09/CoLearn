import { useEffect, useState, useRef } from 'react';
import { useRecoilState, useRecoilValue } from 'recoil';
import { userAtom } from '../atoms/userAtom';
import { authAtom, AuthUser } from '../atoms/authAtom';
import { useNavigate, useParams } from 'react-router-dom';
import { socketAtom } from '../atoms/socketAtom';
// import { IP_ADDRESS } from '../Globle';
import { createWsClientId } from '../utils/wsClientId';
import { API_BASE_URL, WS_BASE_URL } from '../Globle';
import AuthModal from '../components/AuthModal';
import Sidebar from '../components/Sidebar';
import AccountModal from '../components/AccountModal';
import SettingsModal from '../components/SettingsModal';
import { themeAtom } from '../atoms/themeAtom';
import { sidebarOpenAtom } from '../atoms/sidebarAtom';
import { motion } from 'framer-motion';
import SlideUp from '../components/animations/SlideUp';
import FadeIn from '../components/animations/FadeIn';
import StaggerContainer, { StaggerItem } from '../components/animations/StaggerContainer';
import AnimatedBackground from '../components/AnimatedBackground';

// --- Helper Components & Icons ---

const Spinner = () => (
    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
);

const FeatureIcon = ({ children, isDark, color }: { children: React.ReactNode; isDark: boolean; color: string }) => (
    <div className={`${isDark ? `bg-${color}/20 border-${color}/30` : `bg-${color}/10 border-${color}/20`} border p-3 rounded-xl mr-4 shrink-0 flex items-center justify-center`}>
        {children}
    </div>
);

const Register = () => {
    const [roomId, setRoomId] = useState<string>("");
    const [newRoomDisplayName, setNewRoomDisplayName] = useState<string>("");
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
    const wsClientIdRef = useRef<string>(createWsClientId());
    const navigate = useNavigate();
    const theme = useRecoilValue(themeAtom);
    const [, setIsSidebarOpen] = useRecoilState(sidebarOpenAtom);
    const isDark = theme === 'dark';

    // Sidebar always open on landing page
    useEffect(() => {
        setIsSidebarOpen(true);
    }, []);

    useEffect(() => {
        document.title = "CoLearn - Collaborative Coding";
        setRoomId(params.roomId || "");

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

    useEffect(() => {
        if (params.roomId && auth.isAuthenticated && auth.user && auth.token && !loading && !socket && !hasAutoJoined) {
            const roomIdFromUrl = params.roomId.trim();
            if (roomIdFromUrl.length === 6) {
                setRoomId(roomIdFromUrl);
                setHasAutoJoined(true);
                const timer = setTimeout(() => {
                    initializeSocket(true);
                }, 100);
                return () => clearTimeout(timer);
            }
        }
    }, [params.roomId, auth.isAuthenticated, auth.user, auth.token, loading, socket, hasAutoJoined]);

    const verifyToken = async (token: string) => {
        try {
            const response = await fetch(`${API_BASE_URL}/auth/verify`, {
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
        if (!params.roomId) {
            navigate('/dashboard');
        }
    };

    const initializeSocket = async (
        isJoining = false,
        learningModuleId?: string,
        createDisplayName?: string
    ) => {
        setError("");

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
            if (isJoining) {
                const joinResponse = await fetch(`${API_BASE_URL}/room/join`, {
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
            }
        } catch (error) {
            console.error("Error creating/joining room:", error);
            setError("Failed to connect to the server. Please try again.");
            setLoading(false);
            return;
        }

        if (!socket || socket.readyState === WebSocket.CLOSED) {
            const ws = new WebSocket(
                `${WS_BASE_URL}?roomId=${finalRoomId}&id=${userId}&name=${userName}&clientId=${encodeURIComponent(wsClientIdRef.current)}`
            );
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
                            if (learningModuleId) {
                                const attachResponse = await fetch(`${API_BASE_URL}/learning/room/create`, {
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
                                const createResponse = await fetch(`${API_BASE_URL}/room/create`, {
                                    method: "POST",
                                    headers: {
                                        "Content-Type": "application/json",
                                        Authorization: `Bearer ${auth.token}`,
                                    },
                                    body: JSON.stringify({
                                        roomId: roomIdFromServer,
                                        ...(createDisplayName
                                            ? { displayName: createDisplayName }
                                            : {}),
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

                        setUser({
                            id: userId,
                            name: userName,
                            roomId: roomIdFromServer
                        });
                        setLoading(false);
                        console.log("Server Message: ", data.message);
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
        if (!loading) {
            const trimmed = newRoomDisplayName.trim();
            initializeSocket(false, undefined, trimmed || undefined);
        }
    }

    const handleJoinRoom = () => {
        if (!loading) initializeSocket(true);
    }

    return (
        <div className={`min-h-screen flex font-sans ${isDark ? "bg-surface-900 text-white" : "bg-surface-50 text-gray-900"}`}>
            <Sidebar
                showRooms
                onOpenAccount={() => setIsAccountOpen(true)}
                onOpenSettings={() => setIsSettingsOpen(true)}
            />
            <div className="flex-1 flex items-center justify-center p-6 overflow-hidden lg:ml-64 relative">
                <AnimatedBackground isDark={isDark} />

                {/* Main Content: Info + Join/Create Room */}
                <div className="w-full max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-16 items-center z-10">
                    {/* Left Side: Information about CoLearn */}
                    <SlideUp>
                        <div className="space-y-6">
                            <FadeIn>
                                <h1 className={`text-5xl md:text-7xl font-display font-bold tracking-tight ${isDark ? "text-white" : ""}`}>
                                    <span className="gradient-text">CoLearn</span>
                                </h1>
                            </FadeIn>
                            <FadeIn delay={0.15}>
                                <p className={`${isDark ? "text-gray-300" : "text-gray-600"} text-lg md:text-xl leading-relaxed`}>
                                    The ultimate platform for collaborative learning. Code in real-time, get instant feedback from our AI assistant, and master everything from basic algorithms to complex software architecture together.
                                </p>
                            </FadeIn>
                            <StaggerContainer className="space-y-4 pt-4" staggerDelay={0.12}>
                                <StaggerItem>
                                    <div className="flex items-center">
                                        <FeatureIcon isDark={isDark} color="brand-500">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-brand-400"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
                                        </FeatureIcon>
                                        <span className={isDark ? "text-gray-200" : "text-gray-700"}><strong className={isDark ? "text-white" : "text-gray-900"}>Real-time Collaborative Editor:</strong> Code together with zero latency.</span>
                                    </div>
                                </StaggerItem>
                                <StaggerItem>
                                    <div className="flex items-center">
                                        <FeatureIcon isDark={isDark} color="accent-500">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent-400"><path d="M12 8V4H8"/><rect x="4" y="12" width="8" height="8" rx="2"/><path d="M20 12h-4"/><path d="m16 12-4 4-4-4"/></svg>
                                        </FeatureIcon>
                                        <span className={isDark ? "text-gray-200" : "text-gray-700"}><strong className={isDark ? "text-white" : "text-gray-900"}>AI-Powered Assistant:</strong> Get hints, debug code, and learn best practices.</span>
                                    </div>
                                </StaggerItem>
                                <StaggerItem>
                                    <div className="flex items-center">
                                        <FeatureIcon isDark={isDark} color="brand-400">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-brand-300"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" x2="12" y1="9" y2="13"></line><line x1="12" x2="12.01" y1="17" y2="17"></line></svg>
                                        </FeatureIcon>
                                        <span className={isDark ? "text-gray-200" : "text-gray-700"}><strong className={isDark ? "text-white" : "text-gray-900"}>Architecture Nudges:</strong> Our AI guides you towards scalable and efficient code design.</span>
                                    </div>
                                </StaggerItem>
                            </StaggerContainer>
                        </div>
                    </SlideUp>

                    {/* Right Side: Join/Create Room Form */}
                    <FadeIn delay={0.3}>
                        <div className={`relative overflow-hidden ${isDark ? "bg-surface-800/80 backdrop-blur-xl border-surface-700" : "bg-white/90 backdrop-blur-xl border-surface-200 shadow-card"} border p-8 rounded-2xl`}>
                            {/* Gradient top accent */}
                            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-brand" />

                            <h2 className={`text-2xl font-display font-bold mb-6 text-center ${isDark ? "text-white" : "text-gray-900"}`}>Join or Create a Room</h2>
                            {auth.isAuthenticated && auth.user && (
                                <div className={`mb-4 p-3 border-l-4 border-brand-500 ${isDark ? "bg-surface-700/50" : "bg-brand-50"} rounded-r-lg`}>
                                    <p className={`text-sm ${isDark ? "text-gray-400" : "text-gray-600"}`}>Signed in as</p>
                                    <p className={`${isDark ? "text-white" : "text-gray-900"} font-semibold`}>{auth.user.name}</p>
                                    <p className={`text-xs ${isDark ? "text-gray-500" : "text-gray-600"}`}>{auth.user.email}</p>
                                </div>
                            )}
                            <div className="space-y-6">
                                <div>
                                    <label htmlFor="roomId" className={`block text-sm font-medium ${isDark ? "text-gray-400" : "text-gray-700"} mb-2`}>Room ID (for joining)</label>
                                    <input type="text" id="roomId" placeholder="Enter 8-digit Room ID" value={roomId} onChange={(e) => setRoomId(e.target.value)} className={`w-full p-3 ${isDark ? "bg-surface-700 text-white border-surface-700 placeholder-gray-500" : "bg-white text-gray-900 border-gray-300 hover:border-brand-400 placeholder-gray-400"} rounded-xl border focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition duration-200`} />
                                </div>
                                <div>
                                    <label htmlFor="roomName" className={`block text-sm font-medium ${isDark ? "text-gray-400" : "text-gray-700"} mb-2`}>Room name <span className="font-normal text-gray-500">(optional, when creating)</span></label>
                                    <input type="text" id="roomName" placeholder="e.g. Weekend algorithms study" maxLength={80} value={newRoomDisplayName} onChange={(e) => setNewRoomDisplayName(e.target.value)} className={`w-full p-3 ${isDark ? "bg-surface-700 text-white border-surface-700 placeholder-gray-500" : "bg-white text-gray-900 border-gray-300 hover:border-accent-500 placeholder-gray-400"} rounded-xl border focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-accent-500 transition duration-200`} />
                                </div>
                                {error && (
                                    <motion.p
                                        initial={{ opacity: 0, y: -5 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className="text-red-400 text-sm text-center bg-red-500/10 border border-red-500/20 rounded-lg py-2 px-3"
                                    >
                                        {error}
                                    </motion.p>
                                )}
                                <div className="flex flex-col space-y-3 pt-2">
                                    <motion.button
                                        whileHover={{ scale: 1.03 }}
                                        whileTap={{ scale: 0.97 }}
                                        disabled={loading || !auth.isAuthenticated}
                                        onClick={handleJoinRoom}
                                        className="w-full h-12 flex items-center justify-center py-3 bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 text-white rounded-xl font-semibold shadow-lg hover:shadow-glow-brand transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {loading ? <Spinner /> : 'Join Room'}
                                    </motion.button>
                                    <motion.button
                                        whileHover={{ scale: 1.03 }}
                                        whileTap={{ scale: 0.97 }}
                                        disabled={loading || !auth.isAuthenticated}
                                        onClick={handleCreateRoom}
                                        className="w-full h-12 flex items-center justify-center py-3 bg-gradient-to-r from-accent-600 to-accent-500 hover:from-accent-500 hover:to-accent-400 text-white rounded-xl font-semibold shadow-lg hover:shadow-glow-accent transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {loading ? <Spinner /> : 'Create New Room'}
                                    </motion.button>
                                </div>
                            </div>
                        </div>
                    </FadeIn>
                </div>
                <AuthModal
                    isOpen={showAuthModal}
                    onClose={() => {
                        if (auth.isAuthenticated) {
                            setShowAuthModal(false);
                        }
                    }}
                    onSuccess={handleAuthSuccess}
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
