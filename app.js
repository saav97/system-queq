const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const axios = require('axios');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

//Servir archivos estaticos desde una carpeta llamda "public"
app.use(express.static(path.join(__dirname, 'public')));

const QUEUE = [];
const MAX_USERS = 2;  // Define un límite máximo para la cola
let activeConnections = 0;

// Ruta para el estado del servidor NGINX
const NGINX_STATUS_URL = 'http://170.210.81.131/nginx_status';
const TARGET_URL = 'http://campusvirtual.uncoma.edu.ar'; // URL a la que redirigir cuando el servidor no está saturado

app.get('/', (req, res) =>{
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
})

async function checkServerLoad() {
    try {
        const response = await axios.get(NGINX_STATUS_URL);
        // Implementa tu lógica para determinar si el servidor está saturado basado en `response.data`
        console.log(response.data);
        console.log(typeof(response.data));
        const lines = response.data.split('\n');
         // Busca la línea que contiene "Active connections"
         const activeLine = lines.find(line => line.includes('Active connections'));
         // Usa una expresión regular para extraer el número
        activeConnections = activeLine.match(/\d+/)[0];
         console.log(activeConnections);
        return activeConnections < MAX_USERS;
    } catch (error) {
        console.error('Error fetching NGINX status:', error);
        return false;
    }
}

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);
    QUEUE.push(socket.id);
    console.log('Queue updated:', QUEUE);

    const interval = setInterval(async () => {
        const canProceed = await checkServerLoad();
        const index = QUEUE.indexOf(socket.id);

        if (index === -1) {
            clearInterval(interval);
            console.log(`Interval cleared for disconnected user: ${socket.id}`);
            return; // Salir si el usuario ya no está en la cola
        }

        if (canProceed && index === 0) {
            socket.emit('proceed', { url: 'https://campus.virtual.uncoma.edu.ar' });
            clearInterval(interval);
            QUEUE.shift();
            console.log('Queue after shift:', QUEUE);
        }

        // Revisar si el socket aún está activo antes de emitir la actualización
        if (io.sockets.sockets.get(socket.id)) {
            socket.emit('queue_update', {
                position: index + 1, 
                length: QUEUE.length,
                activeConnections,
                time: (index + 1)*5
            });
        } else {
            clearInterval(interval);
            console.log(`Stopped updating disconnected user: ${socket.id}`);
        }
    }, 1000);

    socket.on('disconnect', () => {
        const index = QUEUE.indexOf(socket.id);
        if (index !== -1) {
            QUEUE.splice(index, 1);
        }
        clearInterval(interval);
        console.log('User disconnected:', socket.id);
        console.log('Queue after disconnect:', QUEUE);
    });
});

app.get('/', (req, res) => {
    res.send('Sistema de cola de espera');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));