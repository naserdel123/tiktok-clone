const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-here';
const REQUIRED_FOLLOWERS_FOR_LIVE = 300;

// إنشاء المجلدات
const dirs = ['uploads', 'uploads/videos', 'uploads/avatars'];
dirs.forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// تخزين الملفات
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const folder = file.fieldname === 'avatar' ? 'uploads/avatars' : 'uploads/videos';
    cb(null, folder);
  },
  filename: (req, file, cb) => {
    cb(null, uuidv4() + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 }
});

// البيانات
let users = [];
let videos = [];
let follows = [];
let likes = [];
let saves = [];
let lives = new Map();
let notifications = [];
let messages = [];
let socketToUser = new Map();

// الهدايا
const GIFTS = {
  rose: { id: 'rose', name: 'وردة', icon: '🌹', price: 1, diamonds: 1 },
  panda: { id: 'panda', name: 'بندة', icon: '🐼', price: 5, diamonds: 5 },
  lion: { id: 'lion', name: 'أسد', icon: '🦁', price: 100, diamonds: 100 },
  elephant: { id: 'elephant', name: 'فيل', icon: '🐘', price: 200, diamonds: 200 },
  crown: { id: 'crown', name: 'تاج', icon: '👑', price: 500, diamonds: 500 }
};

// Middleware
const auth = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'يجب تسجيل الدخول' });
    
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (err) {
    res.status(401).json({ error: 'جلسة منتهية' });
  }
};

// Routes

// تسجيل
app.post('/api/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    
    if (users.find(u => u.username === username)) {
      return res.status(400).json({ error: 'اسم المستخدم موجود' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const user = {
      id: uuidv4(),
      username,
      email,
      password: hashedPassword,
      avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`,
      bio: '',
      followers: 0,
      following: 0,
      videosCount: 0,
      balance: 100,
      diamonds: 0,
      canGoLive: false,
      isLive: false,
      blockedUsers: [],
      createdAt: Date.now()
    };
    
    users.push(user);
    
    const token = jwt.sign({ userId: user.id }, JWT_SECRET);
    res.json({ success: true, token, user: { ...user, password: undefined } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// دخول
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = users.find(u => u.username === username);
    
    if (!user) return res.status(400).json({ error: 'مستخدم غير موجود' });
    
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(400).json({ error: 'كلمة مرور خاطئة' });
    
    const token = jwt.sign({ userId: user.id }, JWT_SECRET);
    res.json({ success: true, token, user: { ...user, password: undefined } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// بروفايلي
app.get('/api/me', auth, (req, res) => {
  const user = users.find(u => u.id === req.userId);
  if (!user) return res.status(404).json({ error: 'غير موجود' });
  
  const myVideos = videos.filter(v => v.userId === user.id);
  const mySaves = saves.filter(s => s.userId === user.id).map(s => {
    const v = videos.find(vid => vid.id === s.videoId);
    return v ? { ...v, savedAt: s.createdAt } : null;
  }).filter(Boolean);
  
  const myLikes = likes.filter(l => l.userId === user.id).map(l => 
    videos.find(v => v.id === l.videoId)
  ).filter(Boolean);
  
  res.json({
    ...user,
    password: undefined,
    videos: myVideos,
    saved: mySaves,
    liked: myLikes
  });
});

// رفع فيديو
app.post('/api/upload', auth, upload.single('video'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'لا يوجد فيديو' });
    
    const video = {
      id: uuidv4(),
      userId: req.userId,
      url: `/uploads/videos/${req.file.filename}`,
      description: req.body.description || '',
      likes: 0,
      comments: 0,
      createdAt: Date.now()
    };
    
    videos.push(video);
    
    const user = users.find(u => u.id === req.userId);
    user.videosCount++;
    
    res.json({ success: true, video });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// الخلاصة
app.get('/api/feed', auth, (req, res) => {
  const user = users.find(u => u.id === req.userId);
  
  const feed = videos
    .filter(v => !user.blockedUsers.includes(v.userId))
    .map(v => ({
      ...v,
      user: users.find(u => u.id === v.userId) || { username: 'مستخدم' },
      isLiked: likes.some(l => l.userId === req.userId && l.videoId === v.id),
      isSaved: saves.some(s => s.userId === req.userId && s.videoId === v.id)
    }))
    .sort((a, b) => b.createdAt - a.createdAt);
  
  res.json(feed);
});

// إعجاب
app.post('/api/videos/:id/like', auth, (req, res) => {
  const existing = likes.find(l => l.userId === req.userId && l.videoId === req.params.id);
  const video = videos.find(v => v.id === req.params.id);
  
  if (!video) return res.status(404).json({ error: 'غير موجود' });
  
  if (existing) {
    likes = likes.filter(l => l.id !== existing.id);
    video.likes--;
    res.json({ liked: false, likes: video.likes });
  } else {
    likes.push({
      id: uuidv4(),
      userId: req.userId,
      videoId: req.params.id,
      createdAt: Date.now()
    });
    video.likes++;
    res.json({ liked: true, likes: video.likes });
  }
});

// حفظ
app.post('/api/videos/:id/save', auth, (req, res) => {
  const existing = saves.find(s => s.userId === req.userId && s.videoId === req.params.id);
  
  if (existing) {
    saves = saves.filter(s => s.id !== existing.id);
    res.json({ saved: false });
  } else {
    saves.push({
      id: uuidv4(),
      userId: req.userId,
      videoId: req.params.id,
      createdAt: Date.now()
    });
    res.json({ saved: true });
  }
});

// متابعة
app.post('/api/follow/:userId', auth, (req, res) => {
  const { userId } = req.params;
  const followerId = req.userId;
  
  if (followerId === userId) {
    return res.status(400).json({ error: 'لا تستطيع متابعة نفسك' });
  }
  
  const existing = follows.find(f => f.followerId === followerId && f.followingId === userId);
  const follower = users.find(u => u.id === followerId);
  const following = users.find(u => u.id === userId);
  
  if (!follower || !following) {
    return res.status(404).json({ error: 'غير موجود' });
  }
  
  if (existing) {
    follows = follows.filter(f => f.id !== existing.id);
    follower.following--;
    following.followers--;
    return res.json({ following: false });
  }
  
  follows.push({
    id: uuidv4(),
    followerId,
    followingId: userId,
    createdAt: Date.now()
  });
  
  follower.following++;
  following.followers++;
  
  const reachedGoal = following.followers >= REQUIRED_FOLLOWERS_FOR_LIVE && !following.canGoLive;
  if (reachedGoal) {
    following.canGoLive = true;
  }
  
  res.json({ following: true, reachedGoal });
});

// بروفايل مستخدم
app.get('/api/user/:id', auth, (req, res) => {
  const user = users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'غير موجود' });
  
  if (user.blockedUsers.includes(req.userId)) {
    return res.status(403).json({ error: 'محظور' });
  }
  
  const hisVideos = videos.filter(v => v.userId === user.id);
  const isFollowing = follows.some(f => f.followerId === req.userId && f.followingId === user.id);
  
  res.json({
    id: user.id,
    username: user.username,
    avatar: user.avatar,
    bio: user.bio,
    followers: user.followers,
    following: user.following,
    videosCount: user.videosCount,
    isLive: user.isLive,
    canGoLive: user.canGoLive,
    videos: hisVideos,
    isFollowing
  });
});

// حظر
app.post('/api/block/:userId', auth, (req, res) => {
  const user = users.find(u => u.id === req.userId);
  if (!user.blockedUsers.includes(req.params.userId)) {
    user.blockedUsers.push(req.params.userId);
    follows = follows.filter(f => !(f.followerId === req.userId && f.followingId === req.params.userId));
  }
  res.json({ success: true });
});

// بحث
app.get('/api/search', auth, (req, res) => {
  const { q } = req.query;
  if (!q) return res.json({ users: [] });
  
  const matched = users
    .filter(u => u.username.toLowerCase().includes(q.toLowerCase()))
    .map(u => ({ ...u, password: undefined }))
    .slice(0, 10);
  
  res.json({ users: matched });
});

// مقترح
app.get('/api/suggested/:userId', auth, (req, res) => {
  const followingIds = follows.filter(f => f.followerId === req.params.userId).map(f => f.followingId);
  
  const suggested = users
    .filter(u => u.id !== req.params.userId && !followingIds.includes(u.id))
    .sort((a, b) => b.followers - a.followers)
    .slice(0, 10)
    .map(u => ({ ...u, password: undefined }));
  
  res.json(suggested);
});

// متصدرين
app.get('/api/leaderboard', auth, (req, res) => {
  const sorted = users
    .sort((a, b) => b.followers - a.followers)
    .slice(0, 50)
    .map(u => ({ ...u, password: undefined }));
  res.json(sorted);
});

// الهدايا
app.get('/api/gifts', auth, (req, res) => {
  res.json(Object.values(GIFTS));
});

// محادثات
app.get('/api/chats', auth, (req, res) => {
  const userChats = messages
    .filter(m => m.senderId === req.userId || m.receiverId === req.userId)
    .reduce((acc, msg) => {
      const otherId = msg.senderId === req.userId ? msg.receiverId : msg.senderId;
      if (!acc[otherId]) {
        const other = users.find(u => u.id === otherId);
        acc[otherId] = {
          user: other ? { ...other, password: undefined } : null,
          lastMessage: msg,
          unread: 0
        };
      }
      if (msg.receiverId === req.userId && !msg.read) {
        acc[otherId].unread++;
      }
      return acc;
    }, {});
  
  res.json(Object.values(userChats));
});

app.get('/api/chats/:userId', auth, (req, res) => {
  const chatMessages = messages.filter(m => 
    (m.senderId === req.userId && m.receiverId === req.params.userId) ||
    (m.senderId === req.params.userId && m.receiverId === req.userId)
  ).sort((a, b) => a.createdAt - b.createdAt);
  
  chatMessages.forEach(m => {
    if (m.receiverId === req.userId) m.read = true;
  });
  
  res.json(chatMessages);
});

app.post('/api/chats/:userId', auth, (req, res) => {
  const { text } = req.body;
  
  const message = {
    id: uuidv4(),
    senderId: req.userId,
    receiverId: req.params.userId,
    text,
    read: false,
    createdAt: Date.now()
  };
  
  messages.push(message);
  
  const receiverSocket = Array.from(socketToUser.entries())
    .find(([_, uid]) => uid === req.params.userId)?.[0];
  
  if (receiverSocket) {
    io.to(receiverSocket).emit('new-message', message);
  }
  
  res.json({ success: true, message });
});

// إشعارات
app.get('/api/notifications', auth, (req, res) => {
  const notifs = notifications
    .filter(n => n.userId === req.userId)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 50);
  res.json(notifs);
});

// WebSocket
io.on('connection', (socket) => {
  console.log('Connected:', socket.id);
  
  socket.on('join-chat', (userId) => {
    socketToUser.set(socket.id, userId);
  });
  
  socket.on('start-live', ({ userId, title }) => {
    const user = users.find(u => u.id === userId);
    if (!user || !user.canGoLive) {
      return socket.emit('error', 'تحتاج 300 متابع');
    }
    
    const liveId = uuidv4();
    user.isLive = true;
    
    const live = {
      id: liveId,
      userId,
      title,
      viewers: 0,
      likes: 0,
      diamonds: 0,
      gifts: [],
      comments: [],
      startedAt: Date.now()
    };
    
    lives.set(liveId, live);
    socket.join(liveId);
    
    io.emit('live-started', { liveId, user: { ...user, password: undefined }, title });
    socket.emit('live-ready', { liveId });
  });
  
  socket.on('join-live', ({ liveId, userId }) => {
    socket.join(liveId);
    const live = lives.get(liveId);
    if (live) {
      live.viewers++;
      io.to(liveId).emit('viewer-count', live.viewers);
    }
  });
  
  socket.on('live-comment', ({ liveId, text, userId }) => {
    const live = lives.get(liveId);
    const user = users.find(u => u.id === userId);
    if (live && user) {
      const comment = { id: uuidv4(), text, username: user.username, avatar: user.avatar, createdAt: Date.now() };
      live.comments.push(comment);
      if (live.comments.length > 100) live.comments.shift();
      io.to(liveId).emit('new-comment', comment);
    }
  });
  
  socket.on('live-like', ({ liveId }) => {
    const live = lives.get(liveId);
    if (live) {
      live.likes++;
      io.to(liveId).emit('like-animation');
    }
  });
  
  socket.on('send-gift', ({ liveId, giftId, userId }) => {
    const live = lives.get(liveId);
    const sender = users.find(u => u.id === userId);
    const gift = GIFTS[giftId];
    
    if (!live || !sender || !gift) return;
    if (sender.balance < gift.price) return socket.emit('error', 'رصيد غير كافٍ');
    
    sender.balance -= gift.price;
    live.diamonds += gift.diamonds;
    
    const giftRecord = {
      id: uuidv4(),
      giftId,
      giftName: gift.name,
      giftIcon: gift.icon,
      sender: sender.username,
      senderAvatar: sender.avatar,
      createdAt: Date.now()
    };
    
    live.gifts.push(giftRecord);
    io.to(liveId).emit('gift-received', giftRecord);
    
    const streamer = users.find(u => u.id === live.userId);
    if (streamer) streamer.diamonds += Math.floor(gift.diamonds * 0.5);
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
  
  socket.on('disconnect', () => {
    socketToUser.delete(socket.id);
  });
});

app.get('/api/lives', auth, (req, res) => {
  const activeLives = Array.from(lives.values()).map(live => ({
    ...live,
    user: users.find(u => u.id === live.userId)
  }));
  res.json(activeLives);
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'خطأ في السيرفر' });
});

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
         
