require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const path = require('path');
const cors = require('cors');
const cloudinary = require('cloudinary').v2;
const { createClient } = require('@supabase/supabase-js');
const { Readable } = require('stream');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Configure Supabase
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_KEY || '';
let supabase = null;
if (supabaseUrl && supabaseKey) {
  supabase = createClient(supabaseUrl, supabaseKey);
}

// Memory storage for piping to Cloudinary (no local files)
const upload = multer({ storage: multer.memoryStorage() });

// Default Fallback State (used if Supabase has nothing)
let boardState = {
  projects: [
    {
      id: 'p1',
      title: 'Project 1',
      tracks: [
        { id: 't1', title: 'Song 1', duration: '1:00', url: null },
        { id: 't2', title: 'Song 2', duration: '0:10', url: null },
      ]
    }
  ],
  trash: []
};

// Start Server and Pull State
const PORT = process.env.PORT || 3001;
server.listen(PORT, async () => {
  console.log(`Server listening on port ${PORT}`);
  
  // Attempt to load live state from Supabase on boot
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('board_state')
        .select('state')
        .eq('id', 1)
        .single();
        
      if (data && data.state) {
        boardState = data.state;
        console.log("Loaded persistent board state from Supabase.");
      } else {
        console.log("No persistent board state found. Using default.");
      }
    } catch (err) {
      console.log("Supabase fetch failed (or table not created yet). Using default state.");
    }
  }
});

// Upload Endpoint via Cloudinary Stream
app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).send('No file uploaded.');

  if (!process.env.CLOUDINARY_CLOUD_NAME) {
    console.warn("Cloudinary not configured! Faking upload url.");
    return res.json({ url: `fake-cloud-url/${Date.now()}.mp3`, filename: req.file.originalname });
  }

  // Set resource_type 'video' which Cloudinary requires for ALL audio files natively
  const uploadStream = cloudinary.uploader.upload_stream(
    { resource_type: 'video' },
    (error, result) => {
      if (error) {
        console.error("Cloudinary error:", error);
        return res.status(500).send(error.message || JSON.stringify(error) || 'Upload system failed');
      }
      res.json({ url: result.secure_url, filename: req.file.originalname });
    }
  );

  // Pipe the live memory buffer directly to Cloudinary
  Readable.from(req.file.buffer).pipe(uploadStream);
});

// Socket.io Real-time State Engine
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Blast the current state to the new user instantly
  socket.emit('initialState', boardState);

  // When ANY user alters the board
  socket.on('updateBoard', async (newState) => {
    boardState = newState;
    
    // Broadcast the new state to all OTHER users immediately
    socket.broadcast.emit('boardUpdated', boardState);
    
    // Asynchronously upsert the new state into the persistent Supabase DB
    if (supabase) {
      try {
        await supabase
          .from('board_state')
          .upsert({ id: 1, state: boardState });
      } catch (err) {
        console.error("Supabase upsert failed:", err);
      }
    }
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
  });
});
