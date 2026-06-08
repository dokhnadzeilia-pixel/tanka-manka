const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "https://inspiring-shortbread-be6161.netlify.app",
        methods: ["GET", "POST"]
    }
});


app.use(express.static(__dirname + '/public'));


let gameState = {
    activePlayer: 1,
    points: 0,
    wheelSpun: false,
    tanks: {
        1: { x: 1, y: 1, dir: 1, alive: true }, // Player 1 starts top-left
        2: { x: 8, y: 8, dir: 3, alive: true }  // Player 2 starts bottom-right
    }
};

let players = {}; 

io.on('connection', (socket) => {
    console.log(`A user connected: ${socket.id}`);


    if (!players[1]) {
        players[1] = socket.id;
        socket.emit('assignPlayer', 1);
        console.log(`Assigned ${socket.id} to Player 1`);
    } else if (!players[2]) {
        players[2] = socket.id;
        socket.emit('assignPlayer', 2);
        console.log(`Assigned ${socket.id} to Player 2`);
    } else {
        socket.emit('assignPlayer', 'spectator');
        console.log(`Assigned ${socket.id} to Spectator`);
    }

    socket.emit('stateUpdate', gameState);

    // SPIN WHEEL 
    socket.on('spinWheel', () => {
        
        let pId = Object.keys(players).find(key => players[key] === socket.id);
        
        
        if (!pId || parseInt(pId) !== gameState.activePlayer || gameState.wheelSpun) return;

        gameState.points = Math.floor(Math.random() * 6) + 1; // Roll 1 to 6
        gameState.wheelSpun = true;
        
        io.emit('stateUpdate', gameState);
        io.emit('log', `Player ${pId} spun the wheel and got ${gameState.points} action points.`);
    });

   
    socket.on('submitCode', (rawCode) => {
        let pId = parseInt(Object.keys(players).find(key => players[key] === socket.id));
        
        
        if (!pId || pId !== gameState.activePlayer || !gameState.wheelSpun) return;

        let queue = [];
        let lines = rawCode.split('\n');

       
        for (let line of lines) {
            line = line.trim();
            if (line === "" || line.startsWith("//")) continue;

            if (line.startsWith("move")) {
                let match = line.match(/move\((\d+)\)/);
                let steps = match ? parseInt(match[1]) : 1;
                for (let i = 0; i < steps; i++) {
                    queue.push({ type: 'MOVE' });
                }
            } else if (line.startsWith("turnRight")) {
                queue.push({ type: 'ROTATE', val: 1 });
            } else if (line.startsWith("turnLeft")) {
                queue.push({ type: 'ROTATE', val: -1 });
            } else if (line.startsWith("shoot")) {
                queue.push({ type: 'SHOOT' });
            }
        }

        
        executeQueue(pId, queue);
    });

    
    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
        let pId = Object.keys(players).find(key => players[key] === socket.id);
        if (pId) {
            delete players[pId];
            console.log(`Player ${pId} slot freed up.`);
        }

        
        if (Object.keys(players).length === 0) {
            console.log("All players left. Resetting game state...");
            gameState.activePlayer = 1;
            gameState.points = 0;
            gameState.wheelSpun = false;
            gameState.tanks[1] = { x: 1, y: 1, dir: 1, alive: true };
            gameState.tanks[2] = { x: 8, y: 8, dir: 3, alive: true };
        }
    }); 
}); // 🌟 აი ეს ფრჩხილი აკლდა შენს კოდში, რომელიც ხურავს მთლიან io.on('connection')-ს!

function executeQueue(pId, queue) {

    if (queue.length === 0 || gameState.points <= 0 || !gameState.tanks[1].alive || !gameState.tanks[2].alive) {
        gameState.points = 0;
        gameState.wheelSpun = false;
        gameState.activePlayer = gameState.activePlayer === 1 ? 2 : 1; // Swap active turn
        
        io.emit('stateUpdate', gameState);
        io.emit('log', `Turn complete. It is now Player ${gameState.activePlayer}'s turn.`);
        return;
    }

   
    let action = queue.shift();
    gameState.points--; // Deduct points
    let t = gameState.tanks[pId];

    if (action.type === 'MOVE') {
        if (t.dir === 0) t.y--; // Up
        if (t.dir === 1) t.x++; // Right
        if (t.dir === 2) t.y++; // Down
        if (t.dir === 3) t.x--; // Left
        
      
        t.x = Math.max(0, Math.min(9, t.x));
        t.y = Math.max(0, Math.min(9, t.y));
    } 
    else if (action.type === 'ROTATE') {
        t.dir = (t.dir + action.val + 4) % 4; 
    } 
    else if (action.type === 'SHOOT') {
        let targetId = pId === 1 ? 2 : 1;
        let enemy = gameState.tanks[targetId];
        let hit = false;
        
       
        if (t.dir === 0 && enemy.x === t.x && enemy.y < t.y) hit = true;
        if (t.dir === 1 && enemy.y === t.y && enemy.x > t.x) hit = true;
        if (t.dir === 2 && enemy.x === t.x && enemy.y > t.y) hit = true;
        if (t.dir === 3 && enemy.y === t.y && enemy.x < t.x) hit = true;

        if (hit && enemy.alive) {
            enemy.alive = false;
            io.emit('log', `💥 BOOM! Player ${pId} hit and destroyed Player ${targetId}!`);
        } else {
            io.emit('log', `Player ${pId} fired down heading lane, but missed.`);
        }
    }

    
    io.emit('stateUpdate', gameState);
    
    
    setTimeout(() => executeQueue(pId, queue), 500);
}

// 🌟 Render-ისთვის პორტი უნდა იყოს დინამიური
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Backend Game Server listening smoothly on port ${PORT}`);
});
