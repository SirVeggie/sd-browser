import { PUBLIC_WS_PORT } from '$env/static/public';
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';

let io: Server;

// export function wsSubscribe(event: string, callback: (msg: any) => void) {
//     io.on('')
// }

export function startWebsocket() {
    const port = PUBLIC_WS_PORT;
    const app = express();
    const server = http.createServer(app);
    io = new Server(server, {
        cors: {
            origin: '*',
        }
    });
    
    app.get('/', (req, res) => {
        console.log('express ping');
        res.status(200).end();
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