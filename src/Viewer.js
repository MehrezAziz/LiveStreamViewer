import React, { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import './App.css';

const socket = io('http://localhost:4000'); 

const generateKey = () => {
    return Math.random().toString(36).substr(2, 8); // Generates an 8-character random string
};

const VideoCall = () => {
    const localVideoRef = useRef(null);
    const remoteVideoRef = useRef(null);
    const peerConnectionRef = useRef(null);
    const localStreamRef = useRef(null);
    const [isCallActive, setIsCallActive] = useState(false);
    const [callKey, setCallKey] = useState('');
    const [transcript, setTranscript] = useState('');
    const [recognition, setRecognition] = useState(null);
    const [isMuted, setIsMuted] = useState(false);

    useEffect(() => {
        const getMediaStream = async () => {
            localStreamRef.current = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            localVideoRef.current.srcObject = localStreamRef.current;

            // Create a new peer connection
            peerConnectionRef.current = new RTCPeerConnection();
            localStreamRef.current.getTracks().forEach(track => peerConnectionRef.current.addTrack(track, localStreamRef.current));

            peerConnectionRef.current.onicecandidate = event => {
                if (event.candidate) {
                    socket.emit('signal', { to: null, signal: event.candidate });
                }
            };

            peerConnectionRef.current.ontrack = event => {
                remoteVideoRef.current.srcObject = event.streams[0];
            };
        };

        if (isCallActive) {
            getMediaStream();
            call(); // Start the call
            startSpeechRecognition(); // Start speech recognition when the call is active
        } else {
            // Clean up if the call is not active
            if (peerConnectionRef.current) {
                peerConnectionRef.current.close();
                peerConnectionRef.current = null;
            }
            if (localStreamRef.current) {
                localStreamRef.current.getTracks().forEach(track => track.stop());
            }
            if (remoteVideoRef.current) {
                remoteVideoRef.current.srcObject = null; // Clear remote video
            }
            stopSpeechRecognition(); // Stop speech recognition when the call is inactive
        }

        socket.on('signal', async (data) => {
            if (data.signal.sdp) {
                await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(data.signal));
                if (data.signal.type === 'offer') {
                    const answer = await peerConnectionRef.current.createAnswer();
                    await peerConnectionRef.current.setLocalDescription(answer);
                    socket.emit('signal', { to: data.from, signal: answer });
                }
            } else if (data.signal.candidate) {
                await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(data.signal));
            }
        });

        return () => {
            socket.off('signal');
            stopSpeechRecognition(); // Clean up speech recognition
        };
    }, [isCallActive]);

    const call = async () => {
        const offer = await peerConnectionRef.current?.createOffer();
        await peerConnectionRef.current?.setLocalDescription(offer);
        socket.emit('signal', { to: null, signal: offer });
    };

    const handleToggleCall = () => {
        
        
        setTranscript('');
        if (!isCallActive) {
            const key = generateKey(); // Generate a new key when starting the call
            setCallKey(key);
            socket.emit('start-call', key); // Emit start-call event with the key
        }
        setIsCallActive(prev => !prev);
        
    };

    const startSpeechRecognition = () => {
        if (!('webkitSpeechRecognition' in window)) {
            alert("Your browser does not support speech recognition.");
            return;
        }

        const SpeechRecognition = window.webkitSpeechRecognition || window.SpeechRecognition;
        const recognitionInstance = new SpeechRecognition();
        recognitionInstance.continuous = true;
        recognitionInstance.interimResults = true;

        recognitionInstance.onresult = event => {
            const currentTranscript = Array.from(event.results)
                .map(result => result[0].transcript)
                .join('');
            setTranscript(currentTranscript);
        };

        recognitionInstance.onerror = event => {
            console.error("Speech recognition error:", event.error);
        };

        recognitionInstance.start();
        setRecognition(recognitionInstance);
    };

    const stopSpeechRecognition = () => {
        if (recognition) {
            recognition.stop();
            setRecognition(null);
        }
    };

    const handleMute = () => {
        localStreamRef.current.getAudioTracks().forEach(track => {
            track.enabled = !isMuted; // Set enabled to false if muted, true otherwise
        });
    
        if (!isMuted) {
            // If the audio is being muted, stop speech recognition
            stopSpeechRecognition();
        } else {
            // If unmuted, restart speech recognition
            startSpeechRecognition();
        }
    
        setIsMuted(prev => !prev); // Update muted state
    };

   

    return (
        <div className="container">
            <h2 className="header">Viewer app</h2>
            {!isCallActive && (
                <input className='inputKey' onChange={(t)=>setCallKey(t.target.value)}  type="text" placeholder="Enter viewer key" />

            )}
            <div className="video-container">
                <video ref={localVideoRef} autoPlay muted />
                {!isCallActive ? (
                    <div>
                        {callKey!='' && callKey[0]!='a' ? (
                            <button className="button endButton" onClick={handleToggleCall}>
                            <span role="img" aria-label="join">🔗</span> Join the Call
                        </button>):(
                            <button className="button endButton" >
                            <span role="img" aria-label="join">🔗</span> Join the Call
                        </button>
                        )
                        }
                        
                        
                    </div>
                ) : ( 
                    <div className='twoButtons'>
                    <button className="button endButton" onClick={handleToggleCall}>
                        <span role="img" aria-label="end">❌</span> End Video Call
                    </button>
                    <button className="button MuteButton" onClick={handleMute}>
                        {isMuted ? '🔊 Unmute' : '🔇 Mute'}
                    </button>
                    </div>
                    
                )}
                
            </div>
            {isCallActive && (
                <div className="transcript">
                    <h4>Transcript:</h4>
                    <p>{transcript}</p>
                </div>
            )}
        </div>
    );
};

export default VideoCall;