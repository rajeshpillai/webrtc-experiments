const express = require('express');
const app = express();
const http = require('http');
const { Server } = require('socket.io');
app.use(express.static('public'));

const server = http.createServer(app);
const io = new Server(server);

app.get('/room/:roomId', (req, res) => {
    res.sendFile(`${__dirname}/public/room.html`);
});

io.on('connection', socket => {
    socket.on('join_room', roomId => {
        const room = io.sockets.adapter.rooms.get(roomId);

        if (room && room.size === 4) {
            socket.emit('room_full');
            return;
        }

        const otherUsers = [];

        if (room) {
            room.forEach(id => {
                otherUsers.push(id);
            });
        }

        socket.join(roomId);
        socket.emit('existing_users', otherUsers);
    });

    socket.on('send_offer', ({ targetUserId, sdp }) => {
        io.to(targetUserId).emit('receive_offer', { sdp, callerId: socket.id });
    });

    socket.on('send_answer', ({ targetUserId, sdp }) => {
        io.to(targetUserId).emit('receive_answer', { sdp, answererId: socket.id });
    });

    socket.on('send_ice_candidate', ({ targetUserId, candidate }) => {
        io.to(targetUserId).emit('receive_ice_candidate', { candidate, senderId: socket.id });
    });

    socket.on('disconnecting', () => {
        socket.rooms.forEach(room => {
            socket.to(room).emit('user_disconnected', socket.id);
        });
    });

    socket.on('hide_remote_camera', targetUserId => {
        io.to(targetUserId).emit('hide_camera');
    });

    socket.on('show_remote_camera', targetUserId => {
        io.to(targetUserId).emit('show_camera');
    });

    socket.on('mute_user', ({ targetUserId, isMuted }) => {
        io.to(targetUserId).emit('user_muted', { userId: targetUserId, isMuted });
    });

    socket.on('request_flip_camera', targetUserId => {
        io.to(targetUserId).emit('flip_camera');
    });
});

server.listen(1337, () => console.log('Server is running on port 1337'));

