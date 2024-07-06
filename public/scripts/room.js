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
        const peer = createPeerConnection(userIdToCall);
        peers[userIdToCall] = peer;
        stream.getTracks().forEach(track => {
            peer.addTrack(track, stream);
        });
    });
}

function createPeerConnection(targetUserId) {
    const peer = new RTCPeerConnection({
        iceServers: [
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun3.l.google.com:19302' },
            { urls: 'stun:stun4.l.google.com:19302' }
        ]
    });
    peer.onnegotiationneeded = () => targetUserId ? handleNegotiationNeededEvent(peer, targetUserId) : null;
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
            btnRemoteCam.classList.add('button', 'btn-toggle-remote-cam');
            btnRemoteCam.setAttribute('user-id', targetUserId);
            btnRemoteCam.addEventListener('click', (e) => {
                toggleRemoteCamera(e, targetUserId, btnRemoteCam);
            });
            container.appendChild(btnRemoteCam);

            const muteButton = document.createElement('button');
            muteButton.textContent = 'Mute';
            muteButton.classList.add('btn-toggle-remote-mic', 'button');
            muteButton.addEventListener('click', () => {
                toggleMute(targetUserId, e.streams[0], muteButton);
            });
            container.appendChild(muteButton);

            const flipButton = document.createElement('button');
            flipButton.textContent = 'Flip Camera';
            flipButton.classList.add('flip-button', 'button');
            flipButton.addEventListener('click', () => {
                socket.emit('request_flip_camera', targetUserId);
            });
            container.appendChild(flipButton);
        }
        container.id = targetUserId;
        remoteVideoContainer.appendChild(container);
    }
    return peer;
}

function toggleMute(targetUserId, stream, button) {
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length > 0) {
        let isMuted = audioTracks[0].enabled;
        audioTracks.forEach(track => track.enabled = !isMuted);
        button.innerHTML = isMuted ? "Unmute" : "Mute";
        isMuted = !audioTracks[0].enabled;
        socket.emit('mute_user', { targetUserId, isMuted });
    }
}

function toggleRemoteCamera(e, targetUserId, button) {
    if (button.innerHTML.includes('Hide')) {
        button.innerHTML = 'Show remote cam';
        socket.emit('hide_remote_camera', targetUserId);
    } else {
        button.innerHTML = `Hide user's cam`;
        socket.emit('show_remote_camera', targetUserId);
    }
}

async function handleNegotiationNeededEvent(peer, targetUserId) {
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    const payload = {
        sdp: peer.localDescription,
        targetUserId,
    };
    socket.emit('send_offer', payload);
}

async function handleReceiveOffer({ sdp, callerId }, stream) {
    const peer = createPeerConnection(callerId);
    peers[callerId] = peer;
    const desc = new RTCSessionDescription(sdp);
    await peer.setRemoteDescription(desc);

    stream.getTracks().forEach(track => {
        peer.addTrack(track, stream);
    });

    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);

    const payload = {
        targetUserId: callerId,
        sdp: peer.localDescription,
    };

    socket.emit('send_answer', payload);
}

function handleReceiveAnswer({ sdp, answererId }) {
    const desc = new RTCSessionDescription(sdp);
    peers[answererId].setRemoteDescription(desc).catch(e => console.log(e));
}

function handleICECandidateEvent(e) {
    if (e.candidate) {
        Object.keys(peers).forEach(id => {
            const payload = {
                targetUserId: id,
                candidate: e.candidate,
            };
            socket.emit('send_ice_candidate', payload);
        });
    }
}

function handleReceiveIceCandidate({ candidate, senderId }) {
    const incomingCandidate = new RTCIceCandidate(candidate);
    peers[senderId].addIceCandidate(incomingCandidate);
}

function handleDisconnect(userId) {
    delete peers[userId];
    document.getElementById(userId).remove();
}

toggleButton.addEventListener('click', () => {
    const videoTrack = userStream.getTracks().find(track => track.kind === 'video');
    if (videoTrack.enabled) {
        videoTrack.enabled = false;
        toggleButton.innerHTML = 'Show cam';
    } else {
        videoTrack.enabled = true;
        toggleButton.innerHTML = "Hide cam";
    }
});

function hideCamera() {
    const videoTrack = userStream.getTracks().find(track => track.kind === 'video');
    videoTrack.enabled = false;
}

function showCamera() {
    const videoTrack = userStream.getTracks().find(track => track.kind === 'video');
    videoTrack.enabled = true;
}

async function init() {
    socket.on('connect', async () => {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        userStream = stream;
        userVideo.srcObject = stream;
        socket.emit('join_room', roomId);

        socket.on('existing_users', (otherUsers) => callOtherUsers(otherUsers, stream));

        socket.on("receive_offer", (payload) => handleReceiveOffer(payload, stream));

        socket.on('receive_answer', handleReceiveAnswer);

        socket.on('receive_ice_candidate', handleReceiveIceCandidate);

        socket.on('user_disconnected', handleDisconnect);

        socket.on('hide_camera', hideCamera);

        socket.on('show_camera', showCamera);

        socket.on('room_full', () => alert("Room is full"));

        socket.on('user_muted', ({ userId, isMuted }) => {
            // Update the UI to reflect the mute state of the user
        });

        socket.on('flip_camera', async () => {
            try {
                const videoTracks = userStream.getVideoTracks();
                if (videoTracks.length > 0) {
                    const currentTrack = videoTracks[0];
                    const constraints = { video: { facingMode: { exact: currentTrack.getSettings().facingMode === 'user' ? 'environment' : 'user' } } };
                    const stream = await navigator.mediaDevices.getUserMedia(constraints);
                    Object.values(peers).forEach(peer => {
                        const sender = peer.getSenders().find(s => s.track.kind === 'video');
                        if (sender) {
                            sender.replaceTrack(stream.getVideoTracks()[0]);
                        }
                    });
                    if (userStream) {
                        userStream.getVideoTracks().forEach(track => track.stop());
                    }
                    userStream = stream;
                    document.getElementById('user-video').srcObject = stream;
                }
            } catch (error) {
                console.error('Error flipping camera:', error);
            }
        });
    });
}

init();

