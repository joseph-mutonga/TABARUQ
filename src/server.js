const http = require('http');
const { Server } = require('socket.io');
const app = require('./app');
require('dotenv').config();

const PORT = process.env.PORT || 5000;
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    socket.on('disconnect', () => console.log('Client disconnected:', socket.id));
});

// Attach io to app to be accessible in routes/controllers
app.set('io', io);

server.listen(PORT, () => {
    console.log(`Server running on port http://localhost:${PORT}`);
});
