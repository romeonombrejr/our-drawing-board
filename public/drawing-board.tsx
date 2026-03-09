import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { toast } from "sonner";
import io from 'socket.io-client';
import { Head } from '@inertiajs/react';
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import RoomChat from './RoomChat';
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from "@/components/ui/dialog";
import { FieldGroup } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge"
import { Toaster } from "@/components/ui/sonner"

export default function DrawingBoard() {
    // For URL search params
    const [searchParams, setSearchParams] = typeof window !== 'undefined' && window.URLSearchParams ? [new URLSearchParams(window.location.search), null] : [null, null];
    // User list state
    const [userList, setUserList] = useState<string[]>([]);
    // For copy link feedback
    const [copySuccess, setCopySuccess] = useState<string>('');
    // State and refs
    const [joinedRoom, setJoinedRoom] = useState<string | null>(null);
    const [roomInfo, setRoomInfo] = useState<string>('');
    const [roomInfoColor, setRoomInfoColor] = useState<string>('#0f0');
    const [roomCode, setRoomCode] = useState<string>('');
    const [showRoomControls, setShowRoomControls] = useState(true);
    const [showToolbar, setShowToolbar] = useState(false);
    const [showCanvas, setShowCanvas] = useState(false);
    const [showRoomCodeDisplay, setShowRoomCodeDisplay] = useState(false);
    const [showLeaveRoomBar, setShowLeaveRoomBar] = useState(false);
    const [color, setColor] = useState('#000000');
    const [roomInput, setRoomInput] = useState('');
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
    const drawingRef = useRef(false);
    const currentRef = useRef<{ x?: number; y?: number; color: string }>({ color });
    const socketRef = useRef<any>(null);
    const userIdRef = useRef<string>('');

    // Helper to set UI state
    function setRoomUI(joined: boolean, code?: string) {
        setShowRoomControls(!joined);
        setShowCanvas(joined);
        setShowToolbar(joined);
        setRoomInfo('');
        setShowRoomCodeDisplay(joined);
        setRoomCode(joined && code ? code : '');
        setShowLeaveRoomBar(joined);
    }

    function handleSetName(e: React.FormEvent) {
        e.preventDefault();
        if (!nameInput.trim() || pendingRoomCode === null) return;
        setUserName(nameInput.trim());
        if (pendingRoomCode) {
            localStorage.setItem(`userName_${pendingRoomCode}`, nameInput.trim());
        }
        setShowNameDialog(false);
        socketRef.current.emit('joinRoom', { code: pendingRoomCode, userId: userIdRef.current });
        setPendingRoomCode(null);
    }

    // Setup socket and events
    useEffect(() => {
        // Check for ?roomCode=... in URL
        let urlRoomCode = null;
        if (typeof window !== 'undefined') {
            const params = new URLSearchParams(window.location.search);
            urlRoomCode = params.get('roomCode');
        }
        // User ID persistence
        let userId = localStorage.getItem('userId');
        if (!userId) {
            userId = (window.crypto && typeof window.crypto.randomUUID === 'function')
                ? window.crypto.randomUUID()
                : Math.random().toString(36).substr(2, 12);
            localStorage.setItem('userId', userId);
        }
        userIdRef.current = userId;

        // Connect socket to backend using env variable
        const socketServerUrl = import.meta.env.VITE_SOCKET_SERVER_URL || 'http://localhost:3000';
        const socket = io(socketServerUrl);
        socketRef.current = socket;

        // Register user on connect
        socket.on('connect', () => {
            socket.emit('registerUser', userId);
        });

        // Room joined
        socket.on('roomJoined', (code: string) => {
            setJoinedRoom(code);
            setRoomUI(true, code);
            // Clear canvas
            if (ctxRef.current && canvasRef.current) {
                ctxRef.current.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
            }
            // Store last room with expiration
            const expireMs = 24 * 60 * 60 * 1000;
            const lastRoomData = { code, expires: Date.now() + expireMs };
            localStorage.setItem('lastRoom', JSON.stringify(lastRoomData));
            // Update URL with ?roomCode=...
            if (typeof window !== 'undefined') {
                const url = new URL(window.location.href);
                url.searchParams.set('roomCode', code);
                window.history.replaceState({}, '', url.toString());
            }
        });

        // Drawing history
        socket.on('drawingHistory', (history: any[]) => {
            if (Array.isArray(history) && ctxRef.current) {
                history.forEach(data => {
                    drawLine(data.x0, data.y0, data.x1, data.y1, data.color, false);
                });
            }
        });

        // Room error
        socket.on('roomError', (msg: string) => {
            setRoomInfo(msg);
            setRoomInfoColor('#f44');
        });

        // Drawing event
        socket.on('drawing', (data: any) => {
            drawLine(data.x0, data.y0, data.x1, data.y1, data.color, false);
        });

        // Listen for user list updates
        socket.on('userList', (users: string[]) => {
            setUserList(users);
        });

        // Listen for user join/leave notifications
        socket.on('userJoined', ({ userId }) => {
            toast.success(`A user joined the room! (${userId})`);
        });
        socket.on('userLeft', ({ userId }) => {
            toast(`A user left the room. (${userId})`);
        });

        // Auto-join last room if not expired
        let autoJoined = false;
        try {
            // Priority: URL param > lastRoom
            let joinCode = null;
            if (urlRoomCode) {
                joinCode = urlRoomCode;
            } else {
                const lastRoomRaw = localStorage.getItem('lastRoom');
                if (lastRoomRaw) {
                    const lastRoomData = JSON.parse(lastRoomRaw);
                    if (lastRoomData.code && lastRoomData.expires && Date.now() < lastRoomData.expires) {
                        joinCode = lastRoomData.code;
                    } else {
                        localStorage.removeItem('lastRoom');
                    }
                }
            }
            if (joinCode) {
                const savedName = (localStorage.getItem(`userName_${joinCode}`) || '').trim();
                if (!savedName) {
                    setPendingRoomCode(joinCode);
                    setShowNameDialog(true);
                    setNameInput('');
                } else {
                    setUserName(savedName);
                    socket.emit('joinRoom', { code: joinCode, userId });
                }
                autoJoined = true;
            } else {
                // No room to join, do not prompt for name
                setShowNameDialog(false);
                setPendingRoomCode(null);
            }
        } catch (e) {
            localStorage.removeItem('lastRoom');
        }
        if (!autoJoined) {
            setRoomUI(false);
        }

        return () => {
            socket.off('userList');
            socket.off('userJoined');
            socket.off('userLeft');
            socket.disconnect();
        };
        // eslint-disable-next-line
    }, []);

    // Setup canvas context
    useEffect(() => {
        if (canvasRef.current) {
            ctxRef.current = canvasRef.current.getContext('2d');
        }
    }, [showCanvas]);

    // Drawing logic
    function drawLine(x0: number, y0: number, x1: number, y1: number, color: string, emit: boolean) {
        if (!ctxRef.current) return;
        ctxRef.current.beginPath();
        ctxRef.current.moveTo(x0, y0);
        ctxRef.current.lineTo(x1, y1);
        ctxRef.current.strokeStyle = color;
        ctxRef.current.lineWidth = 3;
        ctxRef.current.stroke();
        ctxRef.current.closePath();
        if (!emit || !joinedRoom) return;
        socketRef.current.emit('drawing', { x0, y0, x1, y1, color, room: joinedRoom });
    }

    // Mouse events
    function handleMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
        if (!joinedRoom) return;
        drawingRef.current = true;
        currentRef.current.x = e.nativeEvent.offsetX;
        currentRef.current.y = e.nativeEvent.offsetY;
    }
    function handleMouseUp() {
        drawingRef.current = false;
    }
    function handleMouseOut() {
        drawingRef.current = false;
    }
    function handleMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
        if (!drawingRef.current || !joinedRoom) return;
        const x0 = currentRef.current.x ?? 0;
        const y0 = currentRef.current.y ?? 0;
        const x1 = e.nativeEvent.offsetX;
        const y1 = e.nativeEvent.offsetY;
        drawLine(x0, y0, x1, y1, currentRef.current.color, true);
        currentRef.current.x = x1;
        currentRef.current.y = y1;
    }

    // Color picker
    function handleColorChange(e: React.ChangeEvent<HTMLInputElement>) {
        setColor(e.target.value);
        currentRef.current.color = e.target.value;
    }

    // Join room
    function handleJoinRoom() {
        if (!roomInput.trim()) {
            setRoomInfo('Please enter a room code to join.');
            setRoomInfoColor('#f44');
            return;
        }
        // Check for saved name for this room
        const code = roomInput.trim();
        const savedName = (localStorage.getItem(`userName_${code}`) || '').trim();
        if (!savedName) {
            setPendingRoomCode(code);
            setShowNameDialog(true);
            setNameInput('');
            return;
        } else {
            setUserName(savedName);
            socketRef.current.emit('joinRoom', { code, userId: userIdRef.current });
            // Update URL with ?roomCode=...
            if (typeof window !== 'undefined') {
                const url = new URL(window.location.href);
                url.searchParams.set('roomCode', code);
                window.history.replaceState({}, '', url.toString());
            }
        }
    }
    // Create room
    function handleCreateRoom() {
        setPendingRoomCode('');
        setShowNameDialog(true);
        setNameInput('');
        // Remove any roomCode param from URL
        if (typeof window !== 'undefined') {
            const url = new URL(window.location.href);
            url.searchParams.delete('roomCode');
            window.history.replaceState({}, '', url.toString());
        }
    }
    // Leave room
    function handleLeaveRoom() {
        localStorage.removeItem('lastRoom');
        setRoomUI(false);
        setJoinedRoom(null);
        if (ctxRef.current && canvasRef.current) {
            ctxRef.current.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        }
        socketRef.current.emit('leaveRoom');
        // Remove ?roomCode from URL
        if (typeof window !== 'undefined') {
            const url = new URL(window.location.href);
            url.searchParams.delete('roomCode');
            window.history.replaceState({}, '', url.toString());
        }
    }

    // Copy room link to clipboard
    function handleCopyRoomLink() {
        if (!joinedRoom) return;
        if (typeof window !== 'undefined') {
            const url = new URL(window.location.href);
            url.searchParams.set('roomCode', joinedRoom);
            navigator.clipboard.writeText(url.toString()).then(() => {
                setCopySuccess('Copied!');
                setTimeout(() => setCopySuccess(''), 1200);
            }, () => {
                setCopySuccess('Failed to copy');
                setTimeout(() => setCopySuccess(''), 1200);
            });
        }
    }

    const [userName, setUserName] = useState<string>('');
    const [nameInput, setNameInput] = useState('');
    const [showNameDialog, setShowNameDialog] = useState(false);
    const [pendingRoomCode, setPendingRoomCode] = useState<string | null>(null);


    // Ensure RoomChat always gets the latest userName for the joined room
    const effectiveUserName = joinedRoom ? (localStorage.getItem(`userName_${joinedRoom}`) || '') : '';

    return (
        <>
            <Head title='Our Drawing Board'>
                <link rel="preconnect" href="https://fonts.bunny.net" />
                <link href="https://fonts.bunny.net/css?family=instrument-sans:400,500,600" rel="stylesheet" />
            </Head>
            <Dialog open={showNameDialog} onOpenChange={setShowNameDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Set Your Name</DialogTitle>
                        <DialogDescription>Enter your name to join this room.</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleSetName}>
                        <FieldGroup>
                            <Field>
                                <Label htmlFor="room-name-input">Name</Label>
                                <Input
                                    id="room-name-input"
                                    type="text"
                                    value={nameInput}
                                    onChange={e => setNameInput(e.target.value)}
                                    autoFocus
                                />
                            </Field>
                        </FieldGroup>
                        <DialogFooter className='pt-4'>
                            <Button type="submit" disabled={!nameInput.trim()}>
                                Set Name & Join
                            </Button>
                            <DialogClose asChild>
                                <Button type="button" variant="outline" onClick={() => setShowNameDialog(false)}>
                                    Cancel
                                </Button>
                            </DialogClose>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
            <div className="bg-background" style={{ minHeight: '100vh', margin: 0, padding: '40px 20px', fontFamily: '"Instrument Sans", sans-serif' }}>
                {/* User list display and copy link */}
                {joinedRoom && (
                    <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ fontWeight: 600, marginRight: 8 }}>Users in room:</span>
                        {userList.length > 0 && userList.map(uid => (
                            <Badge key={uid} variant="secondary">{uid === userIdRef.current ? `${uid} (You)` : uid}</Badge>
                        ))}
                        <Button size="sm" style={{ marginLeft: 16 }} onClick={handleCopyRoomLink}>Copy Link</Button>
                        {copySuccess && <span style={{ marginLeft: 8, color: '#0a0', fontWeight: 500 }}>{copySuccess}</span>}
                    </div>
                )}
                <h1 style={{ fontSize: '2rem', fontWeight: 600, margin: 0, marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Our Drawing Board</h1>
                {showRoomControls && (
                    <div id="room-controls" className='flex items-center justify-center mt-6 gap-4'>
                        <Input
                            type="text"
                            id="room-input"
                            placeholder="Enter room code"
                            maxLength={12}
                            style={{ padding: 8, width: 220 }}
                            value={roomInput}
                            onChange={e => setRoomInput(e.target.value)}
                        />
                        <Button id="join-btn" onClick={handleJoinRoom}>Join Room</Button>
                        <Button id="create-btn" onClick={handleCreateRoom}>Create Room</Button>
                        <span id="room-info" style={{ marginLeft: 20, color: roomInfoColor }}>{roomInfo}</span>
                    </div>
                )}
                {showLeaveRoomBar && (
                    <div id="leave-room-bar" style={{ display: '', textAlign: 'center', marginBottom: 10 }}>
                        <Button id="leave-btn" style={{ padding: '8px 16px', fontSize: '1em' }} onClick={handleLeaveRoom}>
                            Leave Room
                        </Button>
                    </div>
                )}
                {showRoomCodeDisplay && (
                    <div id="room-code-display" className='text-blue-900 dark:text-green-400' style={{ textAlign: 'center', marginBottom: 10, fontSize: '1.2em', display: '' }}>
                        Room code: {roomCode}
                    </div>
                )}
                {/* Side by side layout for board and chat */}
                {joinedRoom && (
                    <div style={{ height: '100%', display: 'flex', flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-start', gap: 12, marginTop: 32 }}>
                        <div>
                            {showCanvas && (
                                <canvas
                                    id="board"
                                    ref={canvasRef}
                                    width={800}
                                    height={500}
                                    style={{ display: 'block', borderRadius: 8, boxShadow: '0 2px 16px #0008', background: '#fff' }}
                                    onMouseDown={handleMouseDown}
                                    onMouseUp={handleMouseUp}
                                    onMouseOut={handleMouseOut}
                                    onMouseMove={handleMouseMove}
                                />
                            )}
                            {showToolbar && (
                                <div id="toolbar" style={{ textAlign: 'center', marginTop: 20 }}>
                                    <input
                                        type="color"
                                        id="color"
                                        value={color}
                                        onChange={handleColorChange}
                                        style={{ width: 40, height: 40, border: 'none', borderRadius: '50%' }}
                                    />
                                    <label htmlFor="color">Pick Color</label>
                                </div>
                            )}
                        </div>
                        <RoomChat
                            userId={userIdRef.current}
                            roomCode={joinedRoom}
                            socket={socketRef.current}
                            enabled={!!joinedRoom}
                            userName={userName}
                            setUserName={setUserName}
                        />
                    </div>
                )}
            </div>
            <Toaster />
        </>
    );
}