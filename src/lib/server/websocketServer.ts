import { PORT } from '$env/static/private';
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';

export function startWebsocket() {
    const port = Number(PORT) + 1;
    const app = express();
    const server = http.createServer(app);
    const io = new Server(server, {
        cors: {
            origin: '*',
        }
    });
    
    app.get('/', (req, res) => {
        console.log('express ping');
        res.send('ping');
    });
    
    io.on('connection', (socket) => {
        console.log('a user connected');
        socket.on('disconnect', () => {
            console.log('a user disconnected');
        });
        socket.on('message', (msg) => {
            console.log('message: ' + msg);
            io.emit('response', msg);
        });
    });
    
    server.listen(port, () => {
        console.log(`Websocket server listening at http://localhost:${port}`);
    });
}