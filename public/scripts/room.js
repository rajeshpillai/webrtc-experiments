const peers = {};
const chatContainer = document.getElementById('left');
const remoteVideoContainer = document.getElementById('right');
const toggleButton = document.getElementById('toggle-cam');
const roomId = window.location.pathname.split('/')[2];
const userVideo = document.getElementById('user-video');
let userStream;
let isAdmin = false;
const socket = io('/');

function callOtherUsers(otherUsers, stream) {
    if (!otherUsers.length) {
        isAdmin = true;
    }
    otherUsers.forEach(userIdToCall => {
        const peer = createPeer(userIdToCall);
        peers[userIdToCall] = peer;
        stream.getTracks().forEach(track => {
            peer.addTrack(track, stream);
        });
    });
}

function createPeer(userIdToCall) {
    const peer = new RTCPeerConnection({
        iceServers: [
            {
                urls: 'stun:stun1.l.google.com:19302'
              },
              {
                urls: 'stun:stun3.l.google.com:19302'
              },
              {
                urls: 'stun:stun4.l.google.com:19302'
              }
        ]
    });
    peer.onnegotiationneeded = () => userIdToCall ? handleNegotiationNeededEvent(peer, userIdToCall) : null;
    peer.onicecandidate = handleICECandidateEvent;

    
    peer.ontrack = (e) => {
        const container = document.createElement('div');
        container.classList.add('remote-video-container');
        const video = document.createElement('video');
        video.srcObject = e.streams[0];
        video.autoplay = true;
        video.playsInline = true;
        video.classList.add("remote-video");
        container.appendChild(video);
        if (isAdmin) {
            const btnRemoteCam = document.createElement("button");
            btnRemoteCam.innerHTML = `Hide user's cam`;
            btnRemoteCam.classList.add('button','btn-toggle-remote-cam');
            btnRemoteCam.setAttribute('user-id', userIdToCall);
            btnRemoteCam.addEventListener('click', (e) =>  {
                alert("Toggle remote Camera!");
                toggleRemoteCam(e, userIdToCall, btnRemoteCam);
            });
            container.appendChild(btnRemoteCam);

            // Mute Button
            const muteButton = document.createElement('button');
            muteButton.textContent = 'Mute';
            muteButton.classList.add('btn-toggle-remote-mic', 'button');
            muteButton.addEventListener('click', () =>  {
                alert("Toggle Mic!");
                toggleMute(userIdToCall, e.streams[0], muteButton);
            });

            container.appendChild(muteButton);

            // Flip camera
            const flipButton = document.createElement('button');
            flipButton.textContent = 'Flip Camera';
            flipButton.classList.add('flip-button', 'button');
            flipButton.addEventListener('click', () => {
                alert("Flipping camera!");
                socket.emit('flip camera request', { userId: userIdToCall });
            });

            container.appendChild(flipButton);
        }
        container.id = userIdToCall;
        remoteVideoContainer.appendChild(container);
    }
    return peer;
}

function toggleMute(userID,stream, button) {
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length > 0) {
        let isMuted = audioTracks[0].enabled;
        audioTracks.forEach(track => track.enabled = !isMuted);
        button.innerHTML = isMuted ? "Unmute" : "Mute";
        isMuted = !audioTracks[0].enabled;
        socket.emit('mute action', { userId: userID, isMuted });
    }
}


//remoteVideoContainer.addEventListener('click', (e) => {
function toggleRemoteCam(e, userId, button) {
    if (e.target.innerHTML.includes('Hide')) {
        e.target.innerHTML = 'show remote cam';
        socket.emit('hide remote cam', e.target.getAttribute('user-id'));
    } else {
        e.target.innerHTML = `Hide user's cam`;
        socket.emit('show remote cam', e.target.getAttribute('user-id'));
    }
}

async function handleNegotiationNeededEvent(peer, userIdToCall) {
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    const payload = {
        sdp: peer.localDescription,
        userIdToCall,
    };

    socket.emit('peer connection request', payload);
}

async function handleReceiveOffer({ sdp, callerId }, stream) {
    const peer = createPeer(callerId);
    peers[callerId] = peer;
    const desc = new RTCSessionDescription(sdp);
    await peer.setRemoteDescription(desc);

    stream.getTracks().forEach(track => {
        peer.addTrack(track, stream);
    });

    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);

    const payload = {
        userToAnswerTo: callerId,
        sdp: peer.localDescription,
    };

    socket.emit('connection answer', payload);
}

function handleAnswer({ sdp, answererId }) {
    const desc = new RTCSessionDescription(sdp);
    peers[answererId].setRemoteDescription(desc).catch(e => console.log(e));
}

function handleICECandidateEvent(e) {
    if (e.candidate) {
        Object.keys(peers).forEach(id => {
            const payload = {
                target: id,
                candidate: e.candidate,
            }
            socket.emit("ice-candidate", payload);
        });
    }
}

function handleReceiveIce({ candidate, from }) {
    const inComingCandidate = new RTCIceCandidate(candidate);
    peers[from].addIceCandidate(inComingCandidate);
};

function handleDisconnect(userId) {
    delete peers[userId];
    document.getElementById(userId).remove();
};

toggleButton.addEventListener('click', () => {
    const videoTrack = userStream.getTracks().find(track => track.kind === 'video');
    if (videoTrack.enabled) {
        videoTrack.enabled = false;
        toggleButton.innerHTML = 'Show cam'
    } else {
        videoTrack.enabled = true;
        toggleButton.innerHTML = "Hide cam"
    }
});



function hideCam() {
    const videoTrack = userStream.getTracks().find(track => track.kind === 'video');
    videoTrack.enabled = false;
}

function showCam() {
    const videoTrack = userStream.getTracks().find(track => track.kind === 'video');
    videoTrack.enabled = true;
}

async function init() {
    socket.on('connect', async () => {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        userStream = stream;
        userVideo.srcObject = stream;
        socket.emit('user joined room', roomId);

        socket.on('all other users', (otherUsers) => callOtherUsers(otherUsers, stream));

        socket.on("connection offer", (payload) => handleReceiveOffer(payload, stream));

        socket.on('connection answer', handleAnswer);

        socket.on('ice-candidate', handleReceiveIce);

        socket.on('user disconnected', (userId) => handleDisconnect(userId));

        socket.on('hide cam', hideCam);

        socket.on("show cam", showCam);

        socket.on('server is full', () => alert("chat is full"));

        // todo: MUTE
        socket.on('user muted', ({ userId, isMuted }) => {
            // Update the UI to reflect the mute state of the user
        });

        // todo: Flip camera
        socket.on('flip camera', async () => {
            try {
                const videoTracks = userStream.getVideoTracks();
                // Assume the first video track is the one being used
                if (videoTracks.length > 0) {
                    const currentTrack = videoTracks[0];
                    // Use the facingMode constraint to flip the camera
                    const constraints = { video: { facingMode: { exact: currentTrack.getSettings().facingMode === 'user' ? 'environment' : 'user' } } };
                    const stream = await navigator.mediaDevices.getUserMedia(constraints);
                    // Replace the track in all peer connections
                    Object.values(peers).forEach(peer => {
                        const sender = peer.getSenders().find(s => s.track.kind === 'video');
                        if (sender) {
                            sender.replaceTrack(stream.getVideoTracks()[0]);
                        }
                    });
                    // Update the local stream
                    if (userStream) {
                        userStream.getVideoTracks().forEach(track => track.stop());
                    }
                    userStream = stream;
                    // Optionally, update the local video element if you're displaying it
                    document.getElementById('user-video').srcObject = stream;
                }
            } catch (error) {
                console.error('Error flipping camera:', error);
            }
        });
        
        
    });
}

init();