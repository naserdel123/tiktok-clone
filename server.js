const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const PORT = process.env.PORT || 3000;
const REQUIRED_FOLLOWERS_FOR_LIVE = 300;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// تخزين
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, uuidv4() + path.extname(file.originalname))
});
const upload = multer({ storage, limits: { fileSize: 100 * 1024 * 1024 } });

// البيانات
let users = [];
let videos = [];
let lives = new Map(); // البثوث النشطة
let socketToUser = new Map();

// ========== API ==========

app.post('/api/auth', (req, res) => {
  const { username } = req.body;
  let user = users.find(u => u.username === username);
  
  if (!user) {
    user = {
      id: uuidv4(),
      username,
      avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`,
      followers: 0,
      following: 0,
      videosCount: 0,
      canGoLive: false,
      isLive: false,
      totalLikes: 0
    };
    users.push(user);
  }
  
  res.json({ user });
});

// رفع فيديو (متاح للجميع)
app.post('/api/upload', upload.single('video'), (req, res) => {
  const { userId, description } = req.body;
  const user = users.find(u => u.id === userId);
  
  const video = {
    id: uuidv4(),
    userId,
    url: `/uploads/${req.file.filename}`,
    description,
    likes: 0,
    views: 0,
    createdAt: Date.now()
  };
  
  videos.push(video);
  user.videosCount++;
  
  res.json({ success: true, video });
});

app.get('/api/videos', (req, res) => {
  const feed = videos.map(v => ({
    ...v,
    user: users.find(u => u.id === v.userId)
  })).sort((a, b) => b.createdAt - a.createdAt);
  res.json(feed);
});

// المتابعة
app.post('/api/follow', (req, res) => {
  const { followerId, followingId } = req.body;
  
  const follower = users.find(u => u.id === followerId);
  const following = users.find(u => u.id === followingId);
  
  follower.following++;
  following.followers++;
  
  // فتح البث عند الوصول للهدف
  if (following.followers >= REQUIRED_FOLLOWERS_FOR_LIVE && !following.canGoLive) {
    following.canGoLive = true;
  }
  
  res.json({ 
    success: true, 
    reachedGoal: following.followers === REQUIRED_FOLLOWERS_FOR_LIVE,
    target: following
  });
});

app.get('/api/suggested/:userId', (req, res) => {
  const suggested = users
    .filter(u => u.id !== req.params.userId)
    .sort((a, b) => b.followers - a.followers)
    .slice(0, 10);
  res.json(suggested);
});

app.get('/api/leaderboard', (req, res) => {
  const sorted = [...users].sort((a, b) => b.followers - a.followers).slice(0, 20);
  res.json(sorted);
});

// ========== WebRTC Signaling ==========

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  
  socket.on('join-live', ({ liveId, userId }) => {
    socket.join(liveId);
    socketToUser.set(socket.id, userId);
    
    const live = lives.get(liveId);
    if (live) {
      live.viewers++;
      io.to(liveId).emit('viewer-count', live.viewers);
      socket.emit('live-info', live);
    }
  });
  
  socket.on('start-live', ({ userId, title }) => {
    const user = users.find(u => u.id === userId);
    if (!user.canGoLive) {
      socket.emit('error', 'تحتاج 300 متابع للبث');
      return;
    }
    
    const liveId = uuidv4();
    user.isLive = true;
    
    const live = {
      id: liveId,
      userId,
      title,
      viewers: 0,
      likes: 0,
      comments: [],
      startedAt: Date.now()
    };
    
    lives.set(liveId, live);
    socket.join(liveId);
    socket.broadcast.emit('live-started', { liveId, user, title });
    
    socket.emit('live-ready', { liveId });
  });
  
  socket.on('end-live', ({ liveId }) => {
    const live = lives.get(liveId);
    if (live) {
      io.to(liveId).emit('live-ended');
      lives.delete(liveId);
      
      const user = users.find(u => u.id === live.userId);
      if (user) user.isLive = false;
    }
  });
  
  // WebRTC signaling
  socket.on('offer', ({ liveId, offer }) => {
    socket.to(liveId).emit('offer', offer);
  });
  
  socket.on('answer', ({ liveId, answer }) => {
    socket.to(liveId).emit('answer', answer);
  });
  
  socket.on('ice-candidate', ({ liveId, candidate }) => {
    socket.to(liveId).emit('ice-candidate', candidate);
  });
  
  socket.on('live-like', ({ liveId }) => {
    const live = lives.get(liveId);
    if (live) {
      live.likes++;
      io.to(liveId).emit('like-animation');
    }
  });
  
  socket.on('live-comment', ({ liveId, text, username }) => {
    const live = lives.get(liveId);
    if (live) {
      const comment = { id: uuidv4(), text, username, createdAt: Date.now() };
      live.comments.push(comment);
      io.to(liveId).emit('new-comment', comment);
    }
  });
  
  socket.on('disconnect', () => {
    const userId = socketToUser.get(socket.id);
    socketToUser.delete(socket.id);
    
    // إزالة من البثوث
    lives.forEach((live, liveId) => {
      if (socket.rooms.has(liveId)) {
        live.viewers--;
        io.to(liveId).emit('viewer-count', live.viewers);
      }
    });
  });
});

server.listen(PORT, () => console.log(`🚀 Server on ${PORT}`));
         
